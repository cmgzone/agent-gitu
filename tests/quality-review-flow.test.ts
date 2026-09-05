import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

type Reply = (call: number, messages: LlmMessage[]) => string;

const command = 'node --check src/session.js';
const action = (value: Record<string, unknown>): Reply => () => JSON.stringify({ action: value });
const complete = action({ type: 'complete', summary: 'Updated session timeout handling.', risks: [], followUps: [] });
const verify = action({ type: 'tool_call', tool: 'run_command', params: { command }, reason: 'verify the changed module', expected: 'exit 0' });
const claim: Reply = (_call, messages) => {
  const evidenceId = [...messages
    .map((message) => typeof message.content === 'string' ? message.content : '')
    .join('\n').matchAll(/EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6})/g)].at(-1)?.[1];
  return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId } });
};

function setup(name: string): { dir: string; responses: Reply[] } {
  const dir = mkdtempSync(path.join(tmpdir(), `gitu-review-flow-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'review-flow', type: 'module' }));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'session.js'), 'export const timeout = 60;\n');
  return {
    dir,
    responses: [
      action({ type: 'set_criteria', criteria: [{ text: 'Session module passes syntax verification', verification: command }] }),
      action({ type: 'set_plan', steps: [{ description: 'Update session handling', verification: command }] }),
      verify,
      claim,
      complete,
    ],
  };
}

function repair(round: number): Reply[] {
  return [
    action({
      type: 'tool_call', tool: 'write_file', params: { path: 'src/session.js', content: `export const timeout = ${60 - round};\n` },
      reason: 'address the reviewer concern', expected: 'module updated',
    }),
    verify,
    claim,
    complete,
  ];
}

describe('final quality review after repairs', () => {
  it.each(['medium', 'high'] as const)('reviews the last allowed %s repair and completes when it passes', async (effort) => {
    const { dir, responses } = setup(`pass-${effort}`);
    const repairs = effort === 'high' ? 2 : 1;
    let reviews = 0;
    for (let round = 1; round <= repairs; round += 1) {
      responses.push(() => { reviews += 1; return `VERDICT: REVISE\nFEEDBACK: Adjust timeout handling, round ${round}.`; });
      responses.push(...repair(round));
    }
    responses.push(() => { reviews += 1; return 'VERDICT: PASS'; });
    const { ledger, report } = await new Hermes({
      cwd: dir, llm: new ScriptedMockLlm(responses), mode: 'fast', effort, requirePlanReview: false, autoLearn: false,
    }).run('Update session timeout handling');

    expect(report.status).toBe('complete');
    expect(reviews).toBe(repairs + 1);
    expect(ledger.data.evidence.every((evidence) => evidence.passed)).toBe(true);
    expect(report.remainingRisks.some((risk) => risk.includes('quality-review warning'))).toBe(false);
  }, 30000);

  it.each(['medium', 'high'] as const)('does not reset the %s repair budget on each edit', async (effort) => {
    const { dir, responses } = setup(`bounded-${effort}`);
    const repairs = effort === 'high' ? 2 : 1;
    let reviews = 0;
    let approvals = 0;
    for (let round = 1; round <= repairs + 1; round += 1) {
      responses.push(() => { reviews += 1; return `VERDICT: REVISE\nFEEDBACK: Session concern remains, round ${round}.`; });
      responses.push(...repair(round));
    }
    const { report } = await new Hermes({
      cwd: dir, llm: new ScriptedMockLlm(responses), mode: 'fast', effort, requirePlanReview: false, autoLearn: false,
      approvalHandler: async (request) => {
        approvals += 1;
        expect(request.tool).toBe('quality-review');
        expect(request.summary).toContain(`round ${repairs + 1}`);
        return true;
      },
    }).run('Update session timeout handling');

    expect(report.status).toBe('complete');
    expect(reviews).toBe(repairs + 1);
    expect(approvals).toBe(1);
    expect(report.remainingRisks.some((risk) => risk.includes('User accepted unresolved strict-risk quality-review warning'))).toBe(true);
  }, 30000);

  it('still blocks an unchanged unresolved strict warning without an approval handler', async () => {
    const { dir, responses } = setup('unchanged');
    let reviews = 0;
    responses.push(() => { reviews += 1; return 'VERDICT: REVISE\nFEEDBACK: Session timeout behavior is unverified.'; }, complete);
    const { ledger, report } = await new Hermes({
      cwd: dir, llm: new ScriptedMockLlm(responses), mode: 'fast', effort: 'medium', requirePlanReview: false, autoLearn: false,
    }).run('Update session timeout handling');

    expect(report.status).toBe('blocked');
    expect(reviews).toBe(1);
    expect(ledger.data.blockers.join(' ')).toContain('explicit user approval');
  }, 30000);
});
