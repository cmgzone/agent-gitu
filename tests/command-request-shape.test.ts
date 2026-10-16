import { describe, expect, it } from 'vitest';
import { normalizeCommandParams } from '../src/tools/tools.js';
import { parseReplyAction } from '../src/agent/action-parser.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { summarizeParams } from '../src/util.js';

describe('managed command status request compatibility', () => {
  it('normalizes the subscription response without mutating its original arguments', () => {
    const params = { command: 'status', id: 'cmd-3', waitMs: 500 };
    const expected = { action: 'status', id: 'cmd-3', waitMs: 500 };
    expect(normalizeCommandParams(params)).toEqual(expected);
    expect(params.command).toBe('status');
    for (const action of [{ type: 'tool_call', tool: 'run_command', params }, { type: 'run_command', params }]) {
      expect(parseReplyAction(JSON.stringify({ action }))).toMatchObject({ type: 'tool_call', tool: 'run_command', params: expected });
    }
    expect(summarizeParams('run_command', expected)).toBe('command status cmd-3');
  });

  it.each([
    { action: 'run', command: 'status', id: 'cmd-1' },
    { command: 'status' },
    { command: 'status --details', id: 'cmd-1' },
    { command: 'status', id: 'external-job' },
    { command: 'Get-Job -Id cmd-1 | Format-List *' },
    { command: 'npm test', id: 'cmd-1' },
  ])('preserves explicit or ambiguous shell source: %j', params => {
    expect(normalizeCommandParams(params)).toBe(params);
  });

  it('permits read-only runner queries in safe mode without a shell approval', async () => {
    const policy = new PolicyEngine(false, undefined, true);
    expect(await policy.evaluate('run_command', { action: 'status', id: 'cmd-1' })).toMatchObject({ allowed: true, requiresApproval: false, tier: 'safe' });
    expect(await policy.evaluate('run_command', { command: 'unknown-executable' })).toMatchObject({ allowed: false, tier: 'dangerous' });
  });
});
