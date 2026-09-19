import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { SubAgentRunner } from '../src/agent/subagent.js';
import {
  buildSpecialistEvidenceReport,
  validateSpecialistEvidence,
  type SpecialistEvidenceReport,
} from '../src/agent/specialist-evidence.js';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import type { TaskLedgerData } from '../src/types.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-p11-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `p11-${name}` }));
  return dir;
}

function ledgerFixture(): TaskLedgerData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId: 't',
    goal: 'g',
    status: 'executing',
    mode: 'fast',
    project: { name: 'p', repoRoot: '/x', techStack: [], entrypoints: [], ignorePaths: [], lockedAt: now },
    acceptanceCriteria: EvidenceEngine.criteriaFromSpecs([{ text: 'auth works', verification: 'npm test -- auth', evidenceType: 'test_success' }]),
    constraints: [],
    nonGoals: [],
    plan: [],
    actions: [],
    evidence: [],
    filesChanged: [],
    checkpoints: [],
    blockers: [],
    createdAt: now,
    updatedAt: now,
  };
}

function reportWith(overrides: Partial<SpecialistEvidenceReport> = {}): SpecialistEvidenceReport {
  return {
    entries: [{ criterionId: 'ac-1', evidenceIds: ['ev-1'], status: 'satisfied', summary: 'backed' }],
    evidence: [{ id: 'ev-1', command: 'npm test -- auth', kind: 'test', passed: true, outputExcerpt: 'PASS', workspaceFingerprint: 'fp-1' }],
    ...overrides,
  };
}

const EXPECTED = [{ id: 'ac-1', verification: 'npm test -- auth', evidenceType: 'test_success' as const }];

describe('buildSpecialistEvidenceReport', () => {
  it('extracts satisfied criteria with their linked evidence from the specialist ledger', () => {
    const ledger = ledgerFixture();
    ledger.acceptanceCriteria[0]!.evidenceIds = ['ev-1'];
    ledger.acceptanceCriteria[0]!.satisfied = true;
    ledger.evidence = [{ id: 'ev-1', kind: 'test', label: 'npm test -- auth', command: 'npm test -- auth', passed: true, outputExcerpt: 'PASS', createdAt: new Date().toISOString(), workspaceFingerprint: 'fp-1' }];

    const report = buildSpecialistEvidenceReport(ledger, 'SUCCESS');
    expect(report).toBeDefined();
    expect(report!.entries).toEqual([
      { criterionId: 'ac-1', evidenceIds: ['ev-1'], status: 'satisfied', summary: expect.stringContaining('backed by 1 evidence') },
    ]);
    expect(report!.evidence).toMatchObject([{ id: 'ev-1', command: 'npm test -- auth', kind: 'test', passed: true, workspaceFingerprint: 'fp-1' }]);
  });

  it('reports unsatisfied criteria and blocked criteria distinctly', () => {
    const ledger = ledgerFixture();
    ledger.acceptanceCriteria.push({ id: 'ac-2', text: 'build passes', verification: 'npm run build', evidenceIds: [], satisfied: false });
    ledger.acceptanceCriteria.push({ id: 'ac-3', text: 'lint passes', evidenceIds: ['ev-3'], satisfied: false });

    const report = buildSpecialistEvidenceReport(ledger, 'BLOCKED')!;
    expect(report.entries.map((e) => [e.criterionId, e.status])).toEqual([
      ['ac-1', 'blocked'],
      ['ac-2', 'blocked'],
      ['ac-3', 'blocked'],
    ]);

    const partial = buildSpecialistEvidenceReport(ledger, 'PARTIAL_SUCCESS')!;
    expect(partial.entries.map((e) => [e.criterionId, e.status])).toEqual([
      ['ac-1', 'unsatisfied'],
      ['ac-2', 'unsatisfied'],
      ['ac-3', 'unsatisfied'],
    ]);
  });

  it('returns undefined when no criteria were assigned', () => {
    const ledger = ledgerFixture();
    ledger.acceptanceCriteria = [];
    expect(buildSpecialistEvidenceReport(ledger, 'SUCCESS')).toBeUndefined();
  });
});

describe('validateSpecialistEvidence — Hermes-side independent revalidation', () => {
  it('accepts evidence that ran the exact required verification command', () => {
    const v = validateSpecialistEvidence(reportWith(), EXPECTED);
    expect(v.rejected).toEqual([]);
    expect(v.accepted).toEqual([{ criterionId: 'ac-1', evidenceId: 'ev-1', evidence: expect.objectContaining({ command: 'npm test -- auth' }) }]);
  });

  it('rejects evidence from an unrelated command (node --version claiming a test criterion)', () => {
    const v = validateSpecialistEvidence(
      reportWith({
        evidence: [{ id: 'ev-1', command: 'node --version', kind: 'command', passed: true, outputExcerpt: 'v20', workspaceFingerprint: 'fp-1' }],
      }),
      EXPECTED,
    );
    expect(v.accepted).toEqual([]);
    expect(v.rejected).toHaveLength(1);
    expect(v.rejected[0]!.reason).toContain('does not match the required verification');
  });

  it('rejects evidence that was produced for a different criterion', () => {
    // ac-1 requires the auth test; the specialist's evidence ran the build
    // command that belongs to ac-2 — claiming it for ac-1 must be rejected.
    const expected = [
      { id: 'ac-1', verification: 'npm test -- auth', evidenceType: 'test_success' as const },
      { id: 'ac-2', verification: 'npm run build', evidenceType: 'build_success' as const },
    ];
    const report = reportWith({
      entries: [
        { criterionId: 'ac-1', evidenceIds: ['ev-build'], status: 'satisfied', summary: 'backed' },
        { criterionId: 'ac-2', evidenceIds: ['ev-build'], status: 'satisfied', summary: 'backed' },
      ],
      evidence: [{ id: 'ev-build', command: 'npm run build', kind: 'build', passed: true, outputExcerpt: 'BUILD OK', workspaceFingerprint: 'fp-1' }],
    });
    const v = validateSpecialistEvidence(report, expected);
    // ac-1 is rejected: a build command cannot back a test criterion.
    // ac-2 is legitimately backed by ev-build.
    expect(v.rejected).toHaveLength(1);
    expect(v.rejected[0]!.criterionId).toBe('ac-1');
    expect(v.rejected[0]!.reason).toContain('does not match the required verification');
    expect(v.accepted).toEqual([{ criterionId: 'ac-2', evidenceId: 'ev-build', evidence: expect.objectContaining({ command: 'npm run build' }) }]);
  });

  it('rejects failed evidence', () => {
    const v = validateSpecialistEvidence(reportWith({ evidence: [{ id: 'ev-1', command: 'npm test -- auth', kind: 'test', passed: false, outputExcerpt: 'FAIL', workspaceFingerprint: 'fp-1' }] }), EXPECTED);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.reason).toContain('did not pass');
  });

  it('rejects evidence missing from the report payload', () => {
    const v = validateSpecialistEvidence(reportWith({ evidence: [] }), EXPECTED);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.reason).toContain('not present in the specialist report');
  });

  it('rejects claims for a criterion that was not delegated', () => {
    const v = validateSpecialistEvidence(reportWith({ entries: [{ criterionId: 'ac-9', evidenceIds: ['ev-1'], status: 'satisfied', summary: 'extra' }] }), EXPECTED);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.criterionId).toBe('ac-9');
    expect(v.rejected[0]!.reason).toContain('does not match the delegated criterion');
  });

  it('rejects a criterion the specialist itself reports as unsatisfied or blocked', () => {
    for (const status of ['unsatisfied', 'blocked'] as const) {
      const v = validateSpecialistEvidence(reportWith({ entries: [{ criterionId: 'ac-1', evidenceIds: ['ev-1'], status, summary: 'not done' }] }), EXPECTED);
      expect(v.accepted).toEqual([]);
      expect(v.rejected[0]!.reason).toContain(`reports the criterion as ${status}`);
    }
  });

  it('rejects evidence with no valid workspace fingerprint', () => {
    for (const fp of [undefined, 'unknown-fp']) {
      const v = validateSpecialistEvidence(reportWith({ evidence: [{ id: 'ev-1', command: 'npm test -- auth', kind: 'test', passed: true, outputExcerpt: 'PASS', workspaceFingerprint: fp }] }), EXPECTED);
      expect(v.accepted).toEqual([]);
      expect(v.rejected[0]!.reason).toContain('workspace fingerprint');
    }
  });

  it('rejects evidence whose kind does not match the required type', () => {
    const v = validateSpecialistEvidence(reportWith({ evidence: [{ id: 'ev-1', command: 'npm test -- auth', kind: 'command', passed: true, outputExcerpt: 'PASS', workspaceFingerprint: 'fp-1' }] }), EXPECTED);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.reason).toContain('does not match the required type');
  });

  it('rejects no-op commands as evidence for an unverified criterion', () => {
    const expected = [{ id: 'ac-1', text: 'anything works' }];
    const v = validateSpecialistEvidence(reportWith({ evidence: [{ id: 'ev-1', command: 'ls', kind: 'command', passed: true, outputExcerpt: 'x', workspaceFingerprint: 'fp-1' }] }), expected);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.reason).toContain('no-op');
  });

  it('returns a rejection when no report was returned at all', () => {
    const v = validateSpecialistEvidence(undefined, EXPECTED);
    expect(v.accepted).toEqual([]);
    expect(v.rejected[0]!.reason).toContain('no evidence report');
  });

  it('accepts passing evidence for a plain-text criterion with no verification', () => {
    const expected = [{ id: 'ac-1', text: 'run something real' }];
    const v = validateSpecialistEvidence(reportWith({ evidence: [{ id: 'ev-1', command: 'npm test', kind: 'test', passed: true, outputExcerpt: 'PASS', workspaceFingerprint: 'fp-1' }] }), expected);
    expect(v.accepted).toHaveLength(1);
    expect(v.rejected).toEqual([]);
  });
});

describe('Hermes — specialist evidence inheritance end-to-end', () => {
  it('accepts a specialist report that matches the delegated contract and the gate opens', async () => {
    const dir = makeProject('accept');
    const events: string[] = [];
    const specialistMessages: string[] = [];

    const specialistLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages: LlmMessage[]) => {
        specialistMessages.push(...messages.map((m) => (typeof m.content === 'string' ? m.content : '')).filter(Boolean));
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'answer', summary: 'node verified' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      isolate: false,
      resolveLlm: () => specialistLlm,
      agentRole: () => 'test specialist',
      onEvent: (e) => events.push(e),
    });

    const contract = [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' as const }];
    const hermesLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: contract } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify node', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'worker', task: 'verify node runs', criteria: contract }] } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm: hermesLlm, mode: 'fast', subagents: runner, onEvent: (e) => events.push(e) });

    const { ledger, report } = await hermes.run('verify node');

    // The specialist received the exact acceptance contract.
    expect(specialistMessages.some((m) => m.includes('Required verification: node --version'))).toBe(true);
    expect(specialistMessages.some((m) => m.includes('Evidence type: command_success'))).toBe(true);
    expect(specialistMessages.some((m) => m.includes('Do not claim this criterion using unrelated commands.'))).toBe(true);

    // Hermes accepted the specialist's evidence through the main ledger's gate.
    expect(events.some((e) => e.includes('delegate-claim worker ac-1 <- ') && e.includes('parent-reverified'))).toBe(true);
    const criterion = ledger.data.acceptanceCriteria[0]!;
    expect(criterion.satisfied).toBe(true);
    expect(criterion.evidenceIds).toHaveLength(1);
    const mirror = ledger.data.evidence.find((e) => e.id === criterion.evidenceIds[0]!);
    expect(mirror).toMatchObject({ passed: true, command: 'node --version', kind: 'command' });
    expect(ledger.data.evidence.some((e) => e.label.startsWith('reverify') && e.command === 'node --version')).toBe(true);
    expect(report.status).toBe('complete');
  }, 30000);

  it('rejects a specialist that ran an unrelated command and never satisfies the criterion', async () => {
    const dir = makeProject('reject');
    const events: string[] = [];

    // The specialist runs `node --version`, but the delegated contract
    // requires `npm test -- auth`. Its claim is rejected inside its own
    // ledger (command mismatch) and Hermes independently rejects the report.
    const specialistLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'answer', summary: 'node verified' } }),
    ]);
    const runner = new SubAgentRunner({
      cwd: dir,
      isolate: false,
      resolveLlm: () => specialistLlm,
      agentRole: () => 'test specialist',
      onEvent: (e) => events.push(e),
    });

    const contract = [{ text: 'auth works', verification: 'npm test -- auth', evidenceType: 'test_success' as const }];
    const hermesLlm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: contract } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify auth', verification: 'npm test -- auth' }] } }),
      () => JSON.stringify({ action: { type: 'delegate', tasks: [{ agent: 'worker', task: 'verify auth', criteria: contract }] } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'specialist evidence was rejected' } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm: hermesLlm, mode: 'fast', subagents: runner, onEvent: (e) => events.push(e) });

    const { ledger } = await hermes.run('verify auth');

    // Hermes's own gate never accepted the unrelated evidence.
    expect(events.some((e) => e.includes('delegate-claim worker ac-1: REJECTED'))).toBe(true);
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(false);
    expect(ledger.data.acceptanceCriteria[0]!.evidenceIds).toEqual([]);
    expect(ledger.data.evidence.some((e) => e.label.startsWith('delegated: worker'))).toBe(false);
    expect(ledger.data.blockers.length).toBeGreaterThan(0);
  }, 30000);
});
