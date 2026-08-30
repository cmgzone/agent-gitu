/**
 * Agent-eval harness: runs Hermes end-to-end against an adversarial scripted
 * scenario and records WHAT the control mechanisms did — turns, tool calls,
 * compactions, escalations, extensions, gate rejections — not just PASS/FAIL.
 *
 * The records make runs auditable and comparable (Gitu vs. other agents later):
 * every eval returns an EvalRecord, and with EVAL_RECORD=1 each record is also
 * written to tests/agent-evals/results/<name>.json.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hermes } from '../../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../../src/llm/llm.js';

export interface EvalRecord {
  name: string;
  goal: string;
  outcome: string;
  turns: number;
  toolCalls: number;
  filesChanged: number;
  evidenceCount: number;
  criteriaSatisfied: number;
  criteriaTotal: number;
  planStepsDone: number;
  planStepsOpen: number;
  compactions: number;
  escalations: string[];
  extensions: { turn: number; reason: string; extraTurns: number; extraSpecialists: number }[];
  gateRejections: string[];
  risks: string[];
  hiddenCheck?: { pass: boolean; output: string };
  durationMs: number;
}

export interface TrapEvalOptions {
  name: string;
  goal: string;
  /** Build the throwaway project; returns its root. */
  project: (dir: string) => void;
  script: ((call: number, messages: LlmMessage[]) => string)[];
  /** Optional post-run hidden verification against the final workspace. */
  hiddenCheck?: (dir: string) => { pass: boolean; output: string };
  effort?: 'low' | 'medium' | 'high';
  criteria?: { text: string; verification: string; evidenceType: 'command_success' | 'test_success' | 'any' }[];
}

export function makeEvalProject(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `gitu-eval-${prefix}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `eval-${prefix}` }));
  return dir;
}

export async function runTrapEval(opts: TrapEvalOptions): Promise<EvalRecord> {
  const started = Date.now();
  const dir = makeEvalProject(opts.name);
  opts.project(dir);
  const events: string[] = [];
  const llm = new ScriptedMockLlm(opts.script);
  const hermes = new Hermes({
    cwd: dir,
    llm,
    mode: 'fast',
    effort: opts.effort ?? 'low',
    ...(opts.criteria ? { criteria: opts.criteria } : {}),
    onEvent: (e) => events.push(e),
  });

  const { ledger, report } = await hermes.run(opts.goal);

  const record: EvalRecord = {
    name: opts.name,
    goal: opts.goal,
    outcome: report.status,
    turns: events.filter((e) => e.startsWith('think')).length,
    toolCalls: ledger.data.actions.length,
    filesChanged: ledger.data.filesChanged.length,
    evidenceCount: ledger.data.evidence.length,
    criteriaSatisfied: ledger.data.acceptanceCriteria.filter((c) => c.satisfied).length,
    criteriaTotal: ledger.data.acceptanceCriteria.length,
    planStepsDone: ledger.data.plan.filter((s) => s.status === 'done').length,
    planStepsOpen: ledger.data.plan.filter((s) => s.status !== 'done').length,
    compactions: events.filter((e) => e.startsWith('context compacted')).length,
    escalations: events.filter((e) => e.includes('wide change surface') || e.includes('hard problem') || e.includes('scope escalated')),
    extensions: (ledger.data.budgetExtensions ?? []).map((x) => ({
      turn: x.turn,
      reason: x.reason,
      extraTurns: x.extraTurns,
      extraSpecialists: x.extraSpecialists,
    })),
    gateRejections: events.filter((e) => e.includes('rejected') || e.includes('flagged')),
    risks: report.remainingRisks ?? [],
    ...(opts.hiddenCheck ? { hiddenCheck: opts.hiddenCheck(dir) } : {}),
    durationMs: Date.now() - started,
  };

  if (process.env.EVAL_RECORD === '1') {
    const resultsDir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'results');
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(path.join(resultsDir, `${opts.name}.json`), JSON.stringify(record, null, 2));
  }
  return record;
}
