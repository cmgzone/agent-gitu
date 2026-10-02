import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';
import { supersedeConflictingAuthority } from '../src/agent/follow-up.js';
import { Gitu } from '../src/agent/gitu.js';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { allRequiredSatisfied, criterionLabel, criterionStatus, isCriterionRetired, openCriteria, requiredCriteria } from '../src/ledger/criteria.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';
import type { AcceptanceCriterion, Evidence, ProjectLock } from '../src/types.js';

/**
 * The acceptance-criteria lifecycle: a criterion is part of the task contract
 * until it is retired, and retirement is history, not deletion.
 *
 * The scenario this exists for: a task records "local docker must work", the
 * user then moves production to remote Coolify with a broker, and the old
 * criterion must stop gating completion WITHOUT losing the record that it once
 * was the plan.
 */

const dirs: string[] = [];
const homes: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;

function project(name: string): { repoRoot: string; project: ProjectLock } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), `gitu-criteria-${name}-`));
  dirs.push(repoRoot);
  // ProjectGuard requires a project marker before the agent will act.
  fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ name: `criteria-${name}` }));
  return {
    repoRoot,
    project: {
      name: `criteria-${name}`,
      repoRoot,
      techStack: ['typescript'],
      entrypoints: ['src/index.ts'],
      ignorePaths: ['node_modules'],
      lockedAt: new Date().toISOString(),
    },
  };
}

function home(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-criteria-home-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

afterEach(() => {
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const dir of [...dirs.splice(0), ...homes.splice(0)]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
});

function criterionRow(overrides: Partial<AcceptanceCriterion> & Pick<AcceptanceCriterion, 'id' | 'text'>): AcceptanceCriterion {
  return { evidenceIds: [], satisfied: false, ...overrides };
}

function evidenceRow(overrides: Partial<Evidence> & Pick<Evidence, 'id' | 'passed'>): Evidence {
  return {
    kind: 'test',
    label: `evidence ${overrides.id}`,
    outputExcerpt: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** A scripted model that records the TASK STATE messages it was shown. */
function scriptedLlm(script: (turn: number) => unknown): { llm: LlmClient; stateMessages: string[] } {
  const stateMessages: string[] = [];
  let turn = 0;
  const llm: LlmClient = {
    name: 'criteria-lifecycle-mock',
    async complete() {
      return '';
    },
    async completeStream() {
      return '';
    },
    async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
      for (const message of messages) {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        if (content.includes('STATUS:') && content.includes('Respond with exactly one JSON action.')) stateMessages.push(content);
      }
      turn += 1;
      return { kind: 'text', text: JSON.stringify({ action: script(turn) }), metadata: {} };
    },
    async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
      return llm.completeTurn!(messages);
    },
  };
  return { llm, stateMessages };
}

describe('criterion lifecycle rules', () => {
  it('derives the state of criteria written before the lifecycle existed', () => {
    expect(criterionStatus(criterionRow({ id: 'ac-1', text: 'legacy open' }))).toBe('active');
    expect(criterionStatus(criterionRow({ id: 'ac-2', text: 'legacy done', satisfied: true }))).toBe('satisfied');
    expect(isCriterionRetired(criterionRow({ id: 'ac-3', text: 'retired', status: 'superseded' }))).toBe(true);
    expect(isCriterionRetired(criterionRow({ id: 'ac-4', text: 'n/a', status: 'not_applicable' }))).toBe(true);
    // failed / blocked are diagnostic, NOT retired: the work is still owed.
    expect(isCriterionRetired(criterionRow({ id: 'ac-5', text: 'failed', status: 'failed' }))).toBe(false);
    expect(isCriterionRetired(criterionRow({ id: 'ac-6', text: 'blocked', status: 'blocked' }))).toBe(false);
  });

  it('separates required criteria from retired history', () => {
    const criteria = [
      criterionRow({ id: 'ac-1', text: 'local docker must work', status: 'superseded', supersededBy: 'ac-8' }),
      criterionRow({ id: 'ac-2', text: 'broker launches the container', satisfied: true }),
      criterionRow({ id: 'ac-3', text: 'metrics exist', status: 'failed' }),
      criterionRow({ id: 'ac-4', text: 'unused', status: 'not_applicable' }),
    ];
    expect(requiredCriteria(criteria).map((c) => c.id)).toEqual(['ac-2', 'ac-3']);
    expect(openCriteria(criteria).map((c) => c.id)).toEqual(['ac-3']);
    expect(allRequiredSatisfied(criteria)).toBe(false);
    expect(criterionLabel(criteria[0]!)).toBe('SUPERSEDED → ac-8');
    expect(criterionLabel(criteria[2]!)).toBe('FAILED');
    expect(criterionLabel(criteria[3]!)).toBe('NOT APPLICABLE');
  });
});

describe('ledger transitions', () => {
  it('retires a criterion, links the replacement, and keeps the history', () => {
    const { repoRoot, project: lock } = project('ledger');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy the hosted app', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work']);
    ledger.data.acceptanceCriteria[0]!.evidenceIds.push('ev-9');
    ledger.data.acceptanceCriteria[0]!.satisfied = true;

    const { retired, added } = ledger.supersedeCriteria(['ac-1'], {
      reason: 'deployment architecture changed to remote Coolify + broker',
      replacements: [{ text: 'broker can launch the cowork container remotely' }],
    });

    expect(added).toHaveLength(1);
    expect(retired).toHaveLength(1);
    const ac1 = ledger.data.acceptanceCriteria.find((c) => c.id === 'ac-1')!;
    expect(ac1.status).toBe('superseded');
    expect(ac1.supersededBy).toBe(added[0]!.id);
    expect(ac1.retiredReason).toContain('remote Coolify');
    expect(ac1.retiredAt).toBeTruthy();
    // Preserved history: the evidence link and the fact it had been proven.
    expect(ac1.evidenceIds).toEqual(['ev-9']);
    expect(ac1.satisfied).toBe(true);
    expect(ledger.data.acceptanceCriteria.map((c) => c.id)).toEqual(['ac-1', 'ac-2']);
  });

  it('persists the lifecycle across a reload, so a restarted run sees the same contract', () => {
    const { repoRoot, project: lock } = project('persist');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy the hosted app', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work']);
    ledger.supersedeCriteria(['ac-1'], {
      reason: 'deployment architecture changed to remote Coolify + broker',
      replacements: [{ text: 'broker can launch the cowork container remotely', verification: 'npm test -- broker' }],
    });

    const reloaded = TaskLedger.load(repoRoot, ledger.data.taskId)!;
    const ac1 = reloaded.data.acceptanceCriteria.find((c) => c.id === 'ac-1')!;
    const ac2 = reloaded.data.acceptanceCriteria.find((c) => c.id === 'ac-2')!;
    expect(ac1.status).toBe('superseded');
    expect(ac1.supersededBy).toBe('ac-2');
    expect(ac1.retiredReason).toContain('remote Coolify');
    expect(ac2.verification).toBe('npm test -- broker');
    // The reloaded ledger still gates only the replacement criterion.
    expect(requiredCriteria(reloaded.data.acceptanceCriteria).map((c) => c.id)).toEqual(['ac-2']);
  });

  it('reactivates a retired criterion and restores its previous proof state', () => {
    const { repoRoot, project: lock } = project('reactivate');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Ship the release', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work']);
    const engine = new EvidenceEngine();
    ledger.data.evidence.push(evidenceRow({ id: 'ev-1', passed: true, command: 'npm test' }));
    engine.link(ledger.data, 'ac-1', 'ev-1');
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);

    ledger.supersedeCriteria(['ac-1'], { reason: 'moved to remote Coolify' });
    expect(ledger.data.acceptanceCriteria[0]!.status).toBe('superseded');

    const revived = ledger.reactivateCriterion('ac-1', 'the user moved production back to the local machine');
    expect(revived?.status).toBe('active');
    expect(revived?.supersededBy).toBeUndefined();
    expect(revived?.retiredReason).toBeUndefined();
    // The evidence was still there, so the criterion returns as satisfied.
    expect(revived?.satisfied).toBe(true);
  });
});

describe('evidence gate honors the lifecycle', () => {
  it('ignores retired criteria and does not force their commands to pass', () => {
    const { repoRoot, project: lock } = project('gate');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy the hosted app', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work', 'broker launches the container']);
    const engine = new EvidenceEngine();
    ledger.data.evidence.push(evidenceRow({ id: 'ev-1', passed: true, command: 'npm test' }));
    engine.link(ledger.data, 'ac-2', 'ev-1');
    ledger.supersedeCriteria(['ac-1'], { reason: 'deployment moved to remote Coolify' });

    const gate = engine.gate(ledger.data);
    expect(gate.missing).toEqual([]);
    expect(gate.totalCount).toBe(1);
    expect(gate.satisfiedCount).toBe(1);
    expect(gate.open).toBe(true);
  });

  it('still gates failed and blocked criteria — retirement is not an escape from work', () => {
    const { repoRoot, project: lock } = project('gate-failed');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Ship the release', project: lock, mode: 'agent' });
    ledger.setCriteria(['migrations apply cleanly']);
    ledger.reviseCriteria([{ id: 'ac-1', status: 'failed', reason: 'migration 004 fails on a fresh database' }]);
    const gate = new EvidenceEngine().gate(ledger.data);
    expect(gate.open).toBe(false);
    expect(gate.totalCount).toBe(1);
    expect(gate.missing).toEqual(['migrations apply cleanly']);
  });

  it('refuses to attach evidence to a retired criterion', () => {
    const { repoRoot, project: lock } = project('gate-link');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy the hosted app', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work', 'broker launches the container']);
    ledger.supersedeCriteria(['ac-1'], { reason: 'deployment moved to remote Coolify', replacements: [{ text: 'broker launch works' }] });
    const engine = new EvidenceEngine();
    ledger.data.evidence.push(evidenceRow({ id: 'ev-1', passed: true, command: 'npm test' }));

    const replacementId = ledger.data.acceptanceCriteria.find((c) => c.text === 'broker launch works')!.id;
    const link = engine.link(ledger.data, 'ac-1', 'ev-1');
    expect(link.ok).toBe(false);
    expect(link.reason).toContain('no longer part of the task contract');
    expect(link.reason).toContain(`replaced by ${replacementId}`);
  });
});

describe('revise_criteria action parsing', () => {
  it('parses a retirement with a replacement, keeping the reason', () => {
    const parsed = parseAction({
      type: 'revise_criteria',
      reason: 'deployment architecture changed to remote Coolify',
      updates: [{ id: 'ac-1', disposition: 'superseded' }],
      replacements: [{ text: 'broker launches the cowork container', verification: 'npm test -- broker' }],
    });
    expect(parsed?.type).toBe('revise_criteria');
    if (parsed?.type !== 'revise_criteria') throw new Error('unreachable');
    expect(parsed.reason).toContain('remote Coolify');
    expect(parsed.updates).toEqual([{ id: 'ac-1', disposition: 'superseded' }]);
    expect(parsed.replacements).toEqual([{ text: 'broker launches the cowork container', verification: 'npm test -- broker' }]);
  });

  it('rejects a retirement with no reason, and unknown dispositions', () => {
    expect(parseAction({ type: 'revise_criteria', updates: [{ id: 'ac-1', disposition: 'superseded' }] })).toBeUndefined();
    expect(
      parseAction({ type: 'revise_criteria', reason: 'a reason', updates: [{ id: 'ac-1', disposition: 'deleted' }] }),
    ).toBeUndefined();
  });

  it('accepts failed, blocked and active as dispositions', () => {
    const parsed = parseAction({
      type: 'revise_criteria',
      reason: 'report the honest state',
      updates: [
        { id: 'ac-1', disposition: 'failed' },
        { id: 'ac-2', disposition: 'blocked' },
        { id: 'ac-3', disposition: 'active' },
      ],
    });
    if (parsed?.type !== 'revise_criteria') throw new Error('unreachable');
    expect(parsed.updates.map((update) => update.disposition)).toEqual(['failed', 'blocked', 'active']);
  });
});

describe('user corrections retire obsolete criteria', () => {
  it("retires a criterion the user's strong rejection replaced", () => {
    const { repoRoot, project: lock } = project('correction');
    const ledger = TaskLedger.create({ repoRoot, goal: 'Deploy the hosted app', project: lock, mode: 'agent' });
    ledger.setCriteria(['local docker must work', 'the app is reachable over https']);
    const revisionLogBefore = (ledger.data.planRevisions ?? []).length;

    // Weak contrastive prose must never drop an acceptance check.
    supersedeConflictingAuthority(ledger, 'Actually not the docker setup; keep going.');
    expect(isCriterionRetired(ledger.data.acceptanceCriteria[0]!)).toBe(false);

    supersedeConflictingAuthority(ledger, "We don't want docker any more — replace the docker deployment with remote Coolify and the broker.");
    const ac1 = ledger.data.acceptanceCriteria[0]!;
    expect(ac1.status).toBe('superseded');
    expect(ac1.retiredReason).toContain("user's correction");
    // Untouched: an unrelated criterion, and the revision log of plan steps.
    expect(ledger.data.acceptanceCriteria[1]!.status).toBeUndefined();
    expect((ledger.data.planRevisions ?? []).length).toBe(revisionLogBefore);
  });
});

describe('runtime lifecycle (scripted agent)', () => {
  it('retires a criterion through revise_criteria and shows the transition to the model', async () => {
    const { repoRoot } = project('runtime-revise');
    home();
    const events: string[] = [];
    const { llm, stateMessages } = scriptedLlm((turn) => {
      if (turn === 1) return { type: 'set_criteria', criteria: ['local docker must work'] };
      if (turn === 2) {
        return {
          type: 'revise_criteria',
          reason: 'deployment architecture changed to remote Coolify + broker',
          updates: [{ id: 'ac-1', disposition: 'superseded' }],
          replacements: [{ text: 'broker can launch the cowork container remotely' }],
        };
      }
      return { type: 'complete', summary: 'Deployment now runs on the remote broker.' };
    });

    const gitu = new Gitu({ cwd: repoRoot, llm, mode: 'fast', onEvent: (event) => events.push(event) });
    const { ledger } = await gitu.run('Deploy the hosted app');

    const ac1 = ledger.data.acceptanceCriteria.find((c) => c.id === 'ac-1')!;
    const ac2 = ledger.data.acceptanceCriteria.find((c) => c.id === 'ac-2')!;
    expect(ac1.status).toBe('superseded');
    expect(ac1.supersededBy).toBe('ac-2');
    expect(ac1.retiredReason).toContain('remote Coolify');
    expect(ac2.text).toContain('cowork container');
    expect(events.some((event) => event.includes('criteria ac-1 SUPERSEDED → ac-2'))).toBe(true);
    // The model is TOLD the old criterion is history, so it cannot wander back.
    const afterRevision = stateMessages.filter((message) => message.includes('SUPERSEDED'));
    expect(afterRevision.length).toBeGreaterThan(0);
    expect(afterRevision.at(-1)).toContain('retired history');
    // And the old goal no longer gates completion.
    const gate = new EvidenceEngine().gate(ledger.data);
    expect(gate.missing.join(' ')).not.toContain('local docker');
  }, 30000);

  it('refuses to retire criteria the user supplied', async () => {
    const { repoRoot } = project('runtime-user-criteria');
    home();
    const { llm, stateMessages } = scriptedLlm((turn) => {
      if (turn === 1) {
        return {
          type: 'revise_criteria',
          reason: 'the model decided docker is obsolete',
          updates: [{ id: 'ac-1', disposition: 'superseded' }],
          replacements: [{ text: 'something else entirely' }],
        };
      }
      return { type: 'complete', summary: 'Still working against the recorded criteria.' };
    });

    const gitu = new Gitu({
      cwd: repoRoot,
      llm,
      mode: 'fast',
      criteria: ['local docker must work'],
      onEvent: () => undefined,
    });
    const { ledger } = await gitu.run('Deploy the hosted app');

    const ac1 = ledger.data.acceptanceCriteria.find((c) => c.id === 'ac-1')!;
    expect(ac1.status).toBeUndefined();
    expect(isCriterionRetired(ac1)).toBe(false);
    expect(ledger.data.acceptanceCriteria.some((c) => c.text === 'something else entirely')).toBe(false);
    expect(stateMessages.some((message) => message.includes('SUPERSEDED'))).toBe(false);
  }, 30000);

  it('retires the criterion automatically when the user corrects the direction mid-run', async () => {
    const { repoRoot } = project('runtime-correction');
    home();
    let gituRef: Gitu | undefined;
    const { llm, stateMessages } = scriptedLlm((turn) => {
      if (turn === 1) return { type: 'set_criteria', criteria: ['local docker must work'] };
      if (turn === 2) {
        gituRef?.queueMessage("We don't want docker any more — replace the docker deployment with remote Coolify and the broker.");
        return { type: 'show_plan' };
      }
      return { type: 'complete', summary: 'Production now runs remotely.' };
    });

    const gitu = new Gitu({ cwd: repoRoot, llm, mode: 'fast', onEvent: () => undefined });
    gituRef = gitu;
    const { ledger } = await gitu.run('Deploy the hosted app');

    const ac1 = ledger.data.acceptanceCriteria.find((c) => c.id === 'ac-1')!;
    expect(ac1.status).toBe('superseded');
    expect(ac1.retiredReason).toContain('docker');
    expect(stateMessages.some((message) => message.includes('SUPERSEDED'))).toBe(true);
    expect(new EvidenceEngine().gate(ledger.data).missing.join(' ')).not.toContain('local docker');
  }, 30000);
});
