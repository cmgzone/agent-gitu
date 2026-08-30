import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { SubAgentRunner, type SubAgentResult } from '../src/agent/subagent.js';
import { VERIFIER_AGENT, buildVerifierContract, verdictForFinding } from '../src/agent/findings.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-p15-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `p15-${name}` }));
  return dir;
}

function makeResult(overrides: Partial<SubAgentResult> = {}): SubAgentResult {
  return {
    agent: VERIFIER_AGENT,
    task: 'verify',
    ok: true,
    status: 'SUCCESS',
    summary: '',
    turnsUsed: 3,
    turnsBudgeted: 20,
    filesInspected: [],
    filesChanged: [],
    evidenceIds: [],
    ...overrides,
  };
}

const evDetail = (id: string, command: string, passed: boolean) => ({
  id,
  command,
  kind: 'command' as const,
  passed,
  outputExcerpt: passed ? 'PASS' : 'FAIL',
  workspaceFingerprint: 'fp-1',
});

// ── buildVerifierContract ───────────────────────────────────────────────

describe('buildVerifierContract', () => {
  it('contains the claim, location, exact reproduction command, and anti-rubber-stamp rules', () => {
    const finding = {
      id: 'finding-1',
      claim: 'XSS in the search box via unescaped query rendering',
      kind: 'security' as const,
      severity: 'high' as const,
      location: 'src/search.ts:42',
      reproductionCommand: 'npm test -- xss',
      status: 'unverified' as const,
      evidenceIds: [],
      createdAt: new Date().toISOString(),
    };
    const contract = buildVerifierContract(finding);
    expect(contract).toContain('INDEPENDENT VERIFICATION REQUEST');
    expect(contract).toContain('XSS in the search box');
    expect(contract).toContain('src/search.ts:42');
    expect(contract).toContain('npm test -- xss');
    expect(contract).toContain('Do not take the claim at face value');
    expect(contract).toContain('false positive');
  });
});

// ── verdictForFinding ───────────────────────────────────────────────────

describe('verdictForFinding — mechanical status decision', () => {
  const finding = {
    id: 'f1',
    claim: 'claim',
    kind: 'bug' as const,
    reproductionCommand: 'npm test -- repro',
    status: 'unverified' as const,
    evidenceIds: [],
    createdAt: new Date().toISOString(),
  };

  it('returns unverifiable when there is no verifier result', () => {
    expect(verdictForFinding(finding, undefined).status).toBe('unverifiable');
  });

  it('confirms when the reproduction command passed', () => {
    const result = makeResult({
      evidenceReport: {
        entries: [{ criterionId: 'ac-1', evidenceIds: ['ev-1'], status: 'satisfied', summary: 'backed' }],
        evidence: [evDetail('ev-1', 'npm test -- repro', true)],
      },
    });
    const v = verdictForFinding(finding, result);
    expect(v.status).toBe('confirmed');
    expect(v.evidenceIds).toEqual(['ev-1']);
  });

  it('marks false-positive when the reproduction command ran and failed (even though the claim was rejected and never linked)', () => {
    // The engine rejects failed claims, so entry.evidenceIds is empty —
    // the failing record must still be visible in the flat evidence list.
    const result = makeResult({
      ok: false,
      status: 'BLOCKED',
      evidenceReport: {
        entries: [{ criterionId: 'ac-1', evidenceIds: [], status: 'blocked', summary: 'not verified' }],
        evidence: [evDetail('ev-2', 'npm test -- repro', false)],
      },
    });
    const v = verdictForFinding(finding, result);
    expect(v.status).toBe('false-positive');
    expect(v.evidenceIds).toEqual([]);
  });

  it('ignores unrelated commands when a reproduction contract exists', () => {
    const result = makeResult({
      evidenceReport: {
        entries: [{ criterionId: 'ac-1', evidenceIds: [], status: 'unsatisfied', summary: 'no link' }],
        evidence: [
          evDetail('ev-env', 'node --version', true), // environment check, not the repro
          evDetail('ev-repro', 'npm test -- repro', false),
        ],
      },
    });
    expect(verdictForFinding(finding, result).status).toBe('false-positive');
  });

  it('returns unverifiable when the verifier produced no decisive evidence', () => {
    const result = makeResult({ summary: 'I could not figure out how to test this' });
    const v = verdictForFinding(finding, result);
    expect(v.status).toBe('unverifiable');
    expect(v.verifierSummary).toContain('could not figure out');
  });

  it('without a repro contract, any passing evidence confirms', () => {
    const open = { ...finding, reproductionCommand: undefined };
    const result = makeResult({
      evidenceReport: {
        entries: [{ criterionId: 'ac-1', evidenceIds: ['ev-9'], status: 'satisfied', summary: 'backed' }],
        evidence: [evDetail('ev-9', 'node probe.js', true)],
      },
    });
    expect(verdictForFinding(open, result).status).toBe('confirmed');
  });

  it('without a repro contract, attempted-but-failed verification also counts as false-positive (protocol: failure to reproduce = false positive)', () => {
    const open = { ...finding, reproductionCommand: undefined };
    const result = makeResult({
      status: 'BLOCKED',
      ok: false,
      evidenceReport: {
        entries: [{ criterionId: 'ac-1', evidenceIds: [], status: 'blocked', summary: 'x' }],
        evidence: [evDetail('ev-10', 'node probe.js', false)],
      },
    });
    const v = verdictForFinding(open, result);
    expect(v.status).toBe('false-positive');
    expect(v.verifierSummary).toContain('node probe.js');
  });
});

// ── ledger dedupe ───────────────────────────────────────────────────────

describe('TaskLedger.addFinding dedupe', () => {
  it('returns the same finding for an identical claim and a new one otherwise', () => {
    const dir = makeProject('dedupe');
    const guard = { repoRoot: dir, name: 'p15-dedupe', techStack: [], entrypoints: [], ignorePaths: [], lockedAt: new Date().toISOString() } as any;
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'g', project: guard, mode: 'fast' });
    const a = ledger.addFinding({ claim: 'SQL injection in login', kind: 'security' });
    const b = ledger.addFinding({ claim: 'sql   injection in LOGIN', kind: 'security' });
    const c = ledger.addFinding({ claim: 'different problem entirely', kind: 'bug' });
    expect(b.id).toBe(a.id);
    expect(c.id).not.toBe(a.id);
    expect(ledger.data.findings).toHaveLength(2);
  });
});

// ── end-to-end ──────────────────────────────────────────────────────────

describe('Hermes — Finding Verification Gate end-to-end', () => {
  function hermesScript(reproCommand: string) {
    return [
      () =>
        JSON.stringify({
          action: { type: 'set_criteria', criteria: [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' }] },
        }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify node', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () =>
        JSON.stringify({
          action: {
            type: 'report_finding',
            claim: 'the version banner leaks the exact runtime patch version',
            kind: 'security',
            severity: 'low',
            location: 'src/banner.ts:8',
            reproductionCommand: reproCommand,
          },
        }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done; finding reported for verification', risks: [], followUps: [] } }),
    ];
  }

  function verifierScript(reproCommand: string, reproduces: boolean) {
    return [
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: reproCommand }, reason: 'reproduce the finding', expected: reproduces ? 'exit 0' : 'failure demonstrates absence' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        if (reproduces) {
          return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
        }
        return JSON.stringify({ action: { type: 'answer', summary: 'honest attempt: could not reproduce the claim' } });
      },
      () => JSON.stringify({ action: { type: 'answer', summary: reproduces ? 'reproduced with the exact command' : 'honest attempt: could not reproduce the claim' } }),
    ];
  }

  it('reports a finding as CONFIRMED only after an independent specialist reproduces it', async () => {
    const dir = makeProject('confirmed');
    const events: string[] = [];
    const repro = 'node --version';
    const verifierLlm = new ScriptedMockLlm(verifierScript(repro, true));
    const runner = new SubAgentRunner({ cwd: dir, isolate: false, resolveLlm: () => verifierLlm, agentRole: () => 'independent verifier', onEvent: (e) => events.push(e) });
    const hermes = new Hermes({ cwd: dir, llm: new ScriptedMockLlm(hermesScript(repro)), mode: 'fast', subagents: runner, onEvent: (e) => events.push(e) });

    const { report } = await hermes.run('check the banner');

    expect(report.findings).toHaveLength(1);
    const finding = report.findings![0]!;
    expect(finding.status).toBe('confirmed');
    expect(finding.evidenceIds.length).toBeGreaterThan(0);
    expect(events.some((e) => e.includes('[CONFIRMED]'))).toBe(true);
    expect(events.some((e) => e.includes('findings verifying 1 finding(s)'))).toBe(true);
  }, 30000);

  it('downgrades a finding to FALSE-POSITIVE when the verifier cannot reproduce it', async () => {
    const dir = makeProject('falsepos');
    const events: string[] = [];
    const repro = 'node -e "process.exit(7)"'; // always fails -> cannot reproduce
    const verifierLlm = new ScriptedMockLlm(verifierScript(repro, false));
    const runner = new SubAgentRunner({ cwd: dir, isolate: false, resolveLlm: () => verifierLlm, agentRole: () => 'independent verifier', onEvent: (e) => events.push(e) });
    const hermes = new Hermes({ cwd: dir, llm: new ScriptedMockLlm(hermesScript(repro)), mode: 'fast', subagents: runner, onEvent: (e) => events.push(e) });

    const { report } = await hermes.run('check the banner');

    expect(report.findings).toHaveLength(1);
    const finding = report.findings![0]!;
    expect(finding.status).toBe('false-positive');
    expect(finding.evidenceIds).toEqual([]);
    expect(events.some((e) => e.includes('[FALSE-POSITIVE]'))).toBe(true);
  }, 30000);

  it('leaves findings UNVERIFIABLE when no specialists are configured', async () => {
    const dir = makeProject('nospecialists');
    const events: string[] = [];
    const hermes = new Hermes({
      cwd: dir,
      llm: new ScriptedMockLlm(hermesScript('node --version')),
      mode: 'fast',
      onEvent: (e) => events.push(e),
    });

    const { report } = await hermes.run('check the banner');

    expect(report.findings).toHaveLength(1);
    const finding = report.findings![0]!;
    expect(finding.status).toBe('unverifiable');
    expect(finding.verifierSummary).toContain('no specialist agents configured');
    expect(events.some((e) => e.includes('left unverifiable'))).toBe(true);
  }, 30000);
});
