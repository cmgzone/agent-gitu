import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTHORITY_PRESETS,
  compileCommandPrefix,
  compileStandingPattern,
  evaluateAuthority,
  presetAuthorityPolicy,
} from '../src/chief/authority.js';
import { ChiefOfStaff, type ChiefDecisionRecord } from '../src/chief/chief.js';
import { ChiefStore } from '../src/chief/store.js';
import type { ChiefInput } from '../src/coding/chief.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort on Windows */
    }
  }
});

const at = '1970-01-01T00:00:00.000Z';

function tempStorePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'chief-store-'));
  dirs.push(dir);
  return path.join(dir, 'chief-of-staff.json');
}

function commandApproval(command: string, tool = 'run_command', why = 'run command'): ChiefInput {
  return {
    request: {
      kind: 'approval',
      tier: 'moderate',
      request: {
        id: 'appr_1',
        tool,
        why,
        summary: JSON.stringify({ command }),
        requestedAt: at,
      },
    },
    context: { sessionId: 'run_1', goal: 'Verify repo' },
  };
}

function verifiedPlan(stepCount: number): ChiefInput {
  return {
    request: {
      kind: 'plan_review',
      request: {
        id: 'plan_1',
        criteria: ['All checks pass'],
        steps: Array.from({ length: stepCount }, (_, i) => ({
          description: `Step ${i + 1}`,
          verification: `Run unit check ${i + 1}`,
        })),
        requestedAt: at,
      },
    },
    context: { sessionId: 'run_1', goal: 'Implement change' },
  };
}

function questionInput(question: string): ChiefInput {
  return {
    request: {
      kind: 'questions',
      request: {
        id: 'q_1',
        questions: [{ question, options: [] }],
        requestedAt: at,
      },
    },
    context: { sessionId: 'run_1', goal: 'Clarify preference' },
  };
}

describe('authority presets & pattern compilers', () => {
  it('defines conservative, balanced, and autonomous presets with enforced high-impact vetoes', () => {
    expect(Object.keys(AUTHORITY_PRESETS)).toEqual(['conservative', 'balanced', 'autonomous']);

    const conservative = presetAuthorityPolicy('conservative');
    expect(evaluateAuthority(commandApproval('npm test'), conservative).action).toBe('escalate');
    expect(evaluateAuthority(verifiedPlan(3), conservative).action).toBe('escalate');

    const balanced = presetAuthorityPolicy('balanced');
    expect(evaluateAuthority(commandApproval('npm test'), balanced).action).toBe('approve');
    expect(evaluateAuthority(commandApproval('npm install'), balanced).action).toBe('escalate');
    expect(evaluateAuthority(verifiedPlan(15), balanced).action).toBe('escalate');

    const autonomous = presetAuthorityPolicy('autonomous');
    expect(evaluateAuthority(commandApproval('npm install'), autonomous).action).toBe('approve');
    expect(evaluateAuthority(verifiedPlan(20), autonomous).action).toBe('approve');

    // Vetoes never relax even under autonomous preset.
    expect(evaluateAuthority(commandApproval('git push --force origin main'), autonomous).action).toBe('escalate');
    expect(evaluateAuthority(commandApproval('rm -rf /tmp/foo'), autonomous).action).toBe('escalate');
    expect(evaluateAuthority(commandApproval('deploy to production'), autonomous).action).toBe('escalate');
    expect(evaluateAuthority(commandApproval('create issue', 'connection:github:create_issue', 'open issue'), autonomous).action).toBe('escalate');
  });

  it('compiles standing question patterns safely and fails closed on empty input', () => {
    const literal = compileStandingPattern('Which package manager (strict)?');
    expect(literal.test('which   package manager (strict)?')).toBe(true);
    expect(literal.test('Something else')).toBe(false);

    const regex = compileStandingPattern('/pnpm|yarn/i');
    expect(regex.test('Use YARN please')).toBe(true);
    expect(regex.test('Use npm')).toBe(false);

    const empty = compileStandingPattern('   ');
    expect(empty.test('anything')).toBe(false);
  });

  it('compiles standing command prefixes at token boundaries and fails closed on empty input', () => {
    const prefix = compileCommandPrefix('npm test');
    expect(prefix.test('npm test')).toBe(true);
    expect(prefix.test('  npm   test -- --run')).toBe(true);
    expect(prefix.test('npm testing')).toBe(false);
    expect(prefix.test('npm run build')).toBe(false);

    expect(compileCommandPrefix('').test('npm test')).toBe(false);
  });
});

describe('ChiefStore persistence & safety', () => {
  it('persists settings, standing answers, and safe command prefixes across reloads', () => {
    const file = tempStorePath();
    const store1 = new ChiefStore(file);
    expect(store1.getSettings()).toMatchObject({
      preset: 'balanced',
      advisorEnabled: true,
      coworkQuestionAdvisor: false,
      standingAnswers: [],
      standingCommands: [],
    });

    store1.updateSettings({
      preset: 'autonomous',
      coworkQuestionAdvisor: true,
      maxPlanSteps: 18,
      spendFloorUsd: 0.4,
    });
    const ans = store1.addStandingAnswer({ pattern: 'package manager', answer: 'pnpm', source: 'user' });
    const scopedAns = store1.addStandingAnswer({ pattern: 'deploy target', answer: 'staging', scope: 'conv-1' });
    const cmd = store1.addStandingCommand({ prefix: 'npm run verify', source: 'user' });

    const store2 = new ChiefStore(file);
    const settings2 = store2.getSettings();
    expect(settings2.preset).toBe('autonomous');
    expect(settings2.coworkQuestionAdvisor).toBe(true);
    expect(settings2.maxPlanSteps).toBe(18);
    expect(settings2.spendFloorUsd).toBe(0.4);
    expect(settings2.standingAnswers.map((r) => r.id)).toEqual([ans.id, scopedAns.id]);
    expect(settings2.standingCommands.map((r) => r.id)).toEqual([cmd.id]);

    const globalPolicy = store2.resolvePolicy();
    expect(evaluateAuthority(questionInput('Which package manager should I use?'), globalPolicy)).toEqual({
      action: 'answer',
      answer: 'pnpm',
    });
    expect(evaluateAuthority(questionInput('Which deploy target?'), globalPolicy).action).toBe('escalate');

    const scopedPolicy = store2.resolvePolicy(undefined, { scopes: ['conv-1'] });
    expect(evaluateAuthority(questionInput('Which deploy target?'), scopedPolicy)).toEqual({
      action: 'answer',
      answer: 'staging',
    });
    expect(evaluateAuthority(commandApproval('npm run verify -- --fast'), scopedPolicy).action).toBe('approve');

    expect(store2.removeStandingAnswer(ans.id)).toBe(true);
    expect(store2.removeStandingCommand(cmd.id)).toBe(true);
    expect(new ChiefStore(file).getSettings().standingCommands).toHaveLength(0);
  });

  it('rejects high-impact commands from standing command rules', () => {
    const store = new ChiefStore(tempStorePath());
    for (const dangerous of ['rm -rf build', 'sudo apt update', 'git push --force', 'cat .env']) {
      expect(() => store.addStandingCommand({ prefix: dangerous })).toThrow(/high-impact/i);
    }
    expect(store.getSettings().standingCommands).toHaveLength(0);
  });

  it('rejects high-impact patterns or answers from standing answer rules', () => {
    const store = new ChiefStore(tempStorePath());
    expect(() => store.addStandingAnswer({ pattern: 'Should we deploy to production?', answer: 'Yes' })).toThrow(/high-impact/i);
    expect(() => store.addStandingAnswer({ pattern: 'Which file?', answer: 'Read .env' })).toThrow(/high-impact/i);
    expect(() => store.addStandingAnswer({ pattern: 'API key to use?', answer: 'sk-123' })).toThrow(/high-impact/i);
    expect(store.getSettings().standingAnswers).toHaveLength(0);
  });

  it('records bounded decisions newest-first and removes linked rules on revoke', () => {
    const file = tempStorePath();
    let tick = 0;
    const store = new ChiefStore(file, {
      maxDecisions: 10,
      now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString(),
    });
    const rule = store.addStandingAnswer({ pattern: 'branch name', answer: 'feat/chief' });

    const d1 = store.recordDecision({
      surface: 'cowork',
      source: 'policy',
      requestKind: 'questions',
      requestId: 'req_1',
      summary: 'Which branch name?',
      decision: { action: 'answer', answer: 'feat/chief' },
      ruleId: rule.id,
    });
    const d2 = store.recordDecision({
      surface: 'coding',
      source: 'advisor',
      requestKind: 'questions',
      requestId: 'req_2',
      summary: 'Add migration index?',
      decision: { action: 'answer', answer: 'Yes' },
    });

    const listed = store.listDecisions();
    expect(listed.map((d) => d.id)).toEqual([d2.id, d1.id]);
    expect(store.listDecisions({ surface: 'coding' }).map((d) => d.id)).toEqual([d2.id]);

    const revoked = store.revokeDecision(d1.id, 'No longer valid');
    expect(revoked?.revokedAt).toBeTruthy();
    expect(revoked?.revokeReason).toBe('No longer valid');

    const reloaded = new ChiefStore(file);
    expect(reloaded.getSettings().standingAnswers).toHaveLength(0);
    expect(reloaded.listDecisions({ includeRevoked: false }).map((d) => d.id)).toEqual([d2.id]);
  });
});

describe('ChiefOfStaff onDecision observer', () => {
  it('invokes onDecision for settled decisions and tolerates observer failures', async () => {
    const seen: ChiefDecisionRecord[] = [];
    const chief = new ChiefOfStaff({
      scope: { conversationId: 'conv_1' },
      onDecision: (rec) => {
        seen.push(rec);
        throw new Error('disk full');
      },
    });

    const decision = await chief.decide(commandApproval('npm test'));
    expect(decision.action).toBe('approve');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      source: 'policy',
      requestKind: 'approval',
      scope: { conversationId: 'conv_1' },
      decision: { action: 'approve' },
    });
  });
});
