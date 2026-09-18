import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage, buildSystemPrompt } from '../src/agent/prompt.js';
import {
  ACTION_GRAMMAR_FULL,
  ACTION_GRAMMAR_NATIVE,
  buildCapabilityContracts,
  contractIdsFor,
  type PromptCapabilityContext,
} from '../src/agent/prompt-capabilities.js';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { buildDigestContent, extractDigestMaterial, parseCarriedDigest, DIGEST_FAILURES_MARKER, DIGEST_HEADER_PREFIX } from '../src/context/digest.js';
import { buildSystemPrompt as buildSpecialistPrompt, renderSpecialistHandoff, type SpecialistHandoff } from '../src/agent/subagent.js';
import type { LlmMessage } from '../src/llm/llm.js';

function makeHarness(): { dir: string; guard: ProjectGuard; memory: MemoryStore; ledger: TaskLedger; orchestrator: RecoveryOrchestrator; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'prompt-arch-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'prompt-arch' }));
  const guard = ProjectGuard.detect(dir);
  const memory = MemoryStore.forProject(dir);
  const ledger = TaskLedger.create({ repoRoot: dir, goal: 'fix the steady-speed regression in game.js', project: guard.lock, mode: 'standard' });
  const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
  return { dir, guard, memory, ledger, orchestrator, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function flappyFailure(h: ReturnType<typeof makeHarness>): void {
  h.ledger.setCriteria(['the steady-speed check passes']);
  h.ledger.setPlan([{ description: 'fix the steady-speed accounting in game.js', verification: 'npm test' }]);
  h.orchestrator.onActionOutcome(
    {
      tool: 'run_command',
      params: { command: 'npm test' },
      reason: 'verify',
      expected: 'steady speed holds',
      command: 'npm test',
      toolOk: true,
      output: 'FAIL game.test.js\n  expected steady speed 403.6 but received 406.8',
      semanticVerdict: { verdict: 'contradiction', explanation: 'speed assertion failed', blocking: true },
    },
    h.ledger,
  );
}

const BASE_CTX: PromptCapabilityContext = {
  protocolMode: 'native',
  planningRelevant: true,
  uiTask: false,
  hasBrowser: false,
  vision: false,
  lspAvailable: true,
  skillsAvailable: true,
  autoLearn: true,
  mcpAvailable: false,
  connectionsRelevant: false,
  delegationAvailable: false,
};

function ctx(overrides: Partial<PromptCapabilityContext>): PromptCapabilityContext {
  return { ...BASE_CTX, ...overrides };
}

describe('prompt architecture — capability selection', () => {
  it('A. a non-UI test failure gets filesystem/testing/lsp but NOT browser, connections, or delegation manuals', () => {
    const h = makeHarness();
    try {
      const system = buildSystemPrompt(h.guard, h.memory, {
        lspSection: '- typescript server',
        capabilityContext: ctx({}),
      });
      expect(system).toContain('FILESYSTEM TOOLS');
      expect(system).toContain('run_command');
      expect(system).toContain('LSP (optional');
      expect(system).not.toContain('BROWSER (real Chromium');
      expect(system).not.toContain('CONNECTIONS & PROVIDERS');
      expect(system).not.toContain('DELEGATION (specialist agents');
      // Native protocol: the compact vocabulary, not the full text grammar.
      expect(system).toContain('ACTION TYPES');
      expect(system).not.toContain(ACTION_GRAMMAR_FULL.slice(0, 120));
      expect(contractIdsFor(ctx({}))).not.toContain('browser');
      expect(contractIdsFor(ctx({}))).not.toContain('connections');
      expect(contractIdsFor(ctx({}))).not.toContain('delegation');
    } finally {
      h.cleanup();
    }
  });

  it('A2. skill-creation manual is injected only when auto-learn is enabled', () => {
    const h = makeHarness();
    try {
      const withLearn = buildCapabilityContracts(ctx({ autoLearn: true }));
      const withoutLearn = buildCapabilityContracts(ctx({ autoLearn: false }));
      expect(withLearn).toContain('create_skill');
      expect(withLearn).toContain('MUST create a skill');
      expect(withoutLearn).toContain('create_skill only when the user explicitly asks');
      expect(withoutLearn).not.toContain('MUST create a skill');
    } finally {
      h.cleanup();
    }
  });

  it('B. a UI task gets the quality contract once and the browser capability when available', () => {
    const h = makeHarness();
    try {
      const quality = 'FRONTEND QUALITY BAR';
      const system = buildSystemPrompt(h.guard, h.memory, {
        uiTask: true,
        hasBrowser: true,
        vision: true,
        uiQualityContract: `${quality} (contract text)`,
        capabilityContext: ctx({ uiTask: true, hasBrowser: true, vision: true }),
      });
      expect(system).toContain('BROWSER (real Chromium');
      expect(system).toContain(quality);
      // No duplicated quality text: exactly one occurrence.
      expect(system.split(quality).length - 1).toBe(1);
      expect(contractIdsFor(ctx({ uiTask: true, hasBrowser: true }))).toContain('browser');
    } finally {
      h.cleanup();
    }
  });

  it('C. a connection task injects the connection capability with credential and approval rules intact', () => {
    const h = makeHarness();
    try {
      const system = buildSystemPrompt(h.guard, h.memory, {
        capabilityContext: ctx({ connectionsRelevant: true, mcpAvailable: true }),
      });
      expect(system).toContain('CONNECTIONS & PROVIDERS');
      expect(system).toContain('NEVER put credentials in it');
      expect(system).toContain('writes need explicit user approval');
      expect(system).toContain('private connection form ONLY');
    } finally {
      h.cleanup();
    }
  });

  it('D/E. grammar is protocol-aware: native stays compact, text protocols get the full parseable grammar', () => {
    const native = buildCapabilityContracts(ctx({ protocolMode: 'native' }));
    expect(native).toContain(ACTION_GRAMMAR_NATIVE.slice(0, 80));
    expect(native.length).toBeLessThan(12_000);

    const text = buildCapabilityContracts(ctx({ protocolMode: 'structured_text' }));
    // The full grammar must document every action type the parser accepts.
    for (const action of ['set_criteria', 'set_design', 'set_plan', 'add_criteria', 'append_plan', 'set_hypothesis', 'propose_repair', 'record_decision', 'tool_call', 'connection_action', 'connection_operation', 'parallel', 'toggle_todo', 'complete_step', 'revise_step', 'show_plan', 'claim_criterion', '"complete"', 'request_block', 'ask_user', 'report_finding']) {
      expect(text).toContain(action);
    }
    // And the native variant must never appear in a text-protocol prompt.
    expect(text).not.toContain(ACTION_GRAMMAR_NATIVE.slice(0, 80));
  });

  it('D2. native-protocol prompts are not charged for the textual tool schema dump', () => {
    const h = makeHarness();
    try {
      let capabilityChars = 0;
      buildSystemPrompt(h.guard, h.memory, {
        capabilityContext: ctx({ protocolMode: 'native' }),
        onMetrics: (m) => {
          capabilityChars = m.capabilityChars;
        },
      });
      // Native capability payload stays lean; the old monolithic system prompt was ~26K.
      expect(capabilityChars).toBeLessThan(9_000);
    } finally {
      h.cleanup();
    }
  });
});

describe('prompt architecture — task state dominance', () => {
  it('F. goal is stated once, one active failure leads, superseded history is marked historical', () => {
    const h = makeHarness();
    try {
      flappyFailure(h);
      const state = buildStateMessage(h.ledger, undefined, undefined, undefined, h.orchestrator.renderPromptSection());
      expect(state.startsWith('TASK AUTHORITY')).toBe(true);
      // Goal stated once: TASK line present, legacy duplicate absent.
      expect((state.match(/TASK: /g) ?? []).length).toBe(1);
      expect(state).not.toContain('CURRENT USER INTENT:');
      // Exactly one ACTIVE PROBLEM section, with the failure itself and the
      // runtime-enforced next allowed class.
      expect((state.match(/ACTIVE PROBLEM RECOVERY/g) ?? []).length).toBe(1);
      expect(state).toContain('speed assertion failed');
      expect(state).toContain('NEXT ALLOWED CLASS: investigate (decision-changing evidence only)');
      // Historical failures are framed as history, never as current work.
      expect(state).not.toContain('FAILED:');
      // Acceptance and plan follow the problem, evidence last.
      expect(state.indexOf('ACTIVE PROBLEM RECOVERY')).toBeLessThan(state.indexOf('ACCEPTANCE (formally satisfied'));
      expect(state.indexOf('ACCEPTANCE (formally satisfied')).toBeLessThan(state.indexOf('EVIDENCE:'));

      // A genuinely failed action renders under KNOWN FACTS as history, never
      // as current work.
      h.ledger.recordAction({
        tool: 'run_command',
        paramsHash: 'h',
        paramsSummary: '$ npm run typecheck',
        status: 'error',
        errorSignature: 'TS2304',
        reason: 'typecheck',
        expected: 'clean',
        observation: 'Cannot find name x',
        durationMs: 5,
      });
      const state2 = buildStateMessage(h.ledger, undefined, undefined, undefined, h.orchestrator.renderPromptSection());
      expect(state2).toContain('RECENT FAILURES (history — the ACTIVE PROBLEM above is authoritative)');
    } finally {
      h.cleanup();
    }
  });

  it('F2. ACT_NOW state directs the model to repair/verify, not investigate', () => {
    const h = makeHarness();
    try {
      flappyFailure(h);
      h.orchestrator.onSetHypothesis('cull counter is never incremented', 'game_logic');
      h.orchestrator.tracker.updateHypothesis(h.orchestrator.getActiveProblem()!.activeHypothesisId!, 'supported');
      const proposal = h.orchestrator.proposeRepair({
        id: 'rp-1',
        problemId: h.orchestrator.getActiveProblem()!.id,
        intendedEffect: 'use the cull counter',
        target: { kind: 'game_logic', description: 'cull accounting' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: h.orchestrator.getActiveProblem()!.verificationContract!,
      });
      expect(proposal.actNow).toBe(true);
      const state = buildStateMessage(h.ledger, undefined, undefined, undefined, h.orchestrator.renderPromptSection());
      expect(state).toContain('NEXT ALLOWED CLASS: repair (apply_edit / write_file / decided repair action)');
      expect(state).toContain('DIRECTIVE: ACT_NOW');
      expect(state).not.toContain('NEXT ALLOWED CLASS: investigate');
    } finally {
      h.cleanup();
    }
  });

  it('F3. superseded episodes render as historical-only guidance', () => {
    const h = makeHarness();
    try {
      flappyFailure(h);
      // Resolve, then fail differently: the first episode is superseded.
      h.orchestrator.onActionOutcome(
        { tool: 'apply_edit', params: { path: 'game.js' }, reason: 'fix', expected: 'pass', toolOk: true, output: 'applied' },
        h.ledger,
      );
      h.orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          params: { command: 'npm test' },
          reason: 'verify',
          expected: 'steady speed holds',
          command: 'npm test',
          toolOk: true,
          output: 'FAIL game.test.js\n  five pipes culled by 700 meters: crashed=191',
          semanticVerdict: { verdict: 'contradiction', explanation: 'cull failure', blocking: true },
        },
        h.ledger,
      );
      const state = buildStateMessage(h.ledger, undefined, undefined, undefined, h.orchestrator.renderPromptSection());
      expect(state).toContain('SUPERSEDED:');
      expect(state).toContain('failure surface moved on');
      expect(state).toContain('do NOT resume its hypotheses');
    } finally {
      h.cleanup();
    }
  });
});

describe('prompt architecture — digest lifecycle', () => {
  it('G. failures in a digest are framed as historical and survive carried-forward compaction', () => {
    const dropped: LlmMessage[] = [
      { role: 'user', content: 'RESULT [error] $ npm test\nTypeError: x is not a function' },
      { role: 'user', content: 'EVIDENCE RECORDED: ev-1 [PASS] (test)' },
    ];
    const material = extractDigestMaterial(dropped);
    expect(material.failures.some((f) => f.includes('npm test'))).toBe(true);
    const digest = buildDigestContent({ condensedCount: 2, excerptLines: material.excerptLines, failures: material.failures, evidence: material.evidenceLines });
    expect(digest.startsWith(DIGEST_HEADER_PREFIX)).toBe(true);
    expect(digest).toContain(DIGEST_FAILURES_MARKER);
    expect(digest).toContain('the live TASK STATE alone decides what is still active');
    // Round-trip: a carried digest with the new marker parses back into failures.
    const carried = parseCarriedDigest(digest);
    expect(carried.failures.length).toBe(1);
  });
});

describe('prompt architecture — specialist prompts', () => {
  it('H. specialist prompt stays compact and keeps assignment, evidence, and scope requirements', () => {
    const system = buildSpecialistPrompt('explorer', 'code exploration and mapping', '/repo', true, [
      { id: 'ac-1', text: 'the failing check is identified', evidenceIds: [], satisfied: false, verification: 'npm test' },
    ]);
    expect(system).toContain('specialist worker agent');
    expect(system).toContain('ISOLATED git worktree');
    expect(system).toContain('ACCEPTANCE CRITERIA (you MUST satisfy each criterion with passing evidence before answering)');
    expect(system).toContain('WORK HANDOFF is supplied, it is your starting map');
    expect(system).toContain('Do not expand scope');
    expect(system.length).toBeLessThan(3_500);

    const handoff = renderSpecialistHandoff({
      parentGoal: 'Fix the failing checks.',
      assignment: 'Map the cull accounting.',
      startingFiles: [{ path: 'src/game/pipes.ts', role: 'implementation' }],
      planSteps: [{ description: 'fix the pipe cull accounting', verification: 'npm run test:cull' }],
      verificationTargets: ['npm run test:cull'],
      excerpts: [],
    } as SpecialistHandoff);
    expect(handoff).toContain('WORK HANDOFF — START HERE');
    expect(handoff).toContain('PARENT GOAL');
    expect(handoff).toContain('STARTING FILES');
    expect(handoff).toContain('EXPLORATION LIMIT');
  });
});

describe('prompt architecture — regression budgets', () => {
  it('a non-UI native bug-fix run stays within the fixed-instruction budget', () => {
    const h = makeHarness();
    try {
      const system = buildSystemPrompt(h.guard, h.memory, { capabilityContext: ctx({}) });
      // Budget: core + capability contracts <= 10K chars (spec target).
      expect(system.length).toBeLessThanOrEqual(10_000);
    } finally {
      h.cleanup();
    }
  });

  it('a text-protocol run carries the full grammar but stays bounded', () => {
    const h = makeHarness();
    try {
      const system = buildSystemPrompt(h.guard, h.memory, { capabilityContext: ctx({ protocolMode: 'structured_text' }) });
      expect(system).toContain(ACTION_GRAMMAR_FULL.slice(0, 80));
      // Text protocols pay for the grammar, but the total remains bounded.
      expect(system.length).toBeLessThanOrEqual(16_000);
    } finally {
      h.cleanup();
    }
  });
});
