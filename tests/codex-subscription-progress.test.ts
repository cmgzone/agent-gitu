import { afterEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({ replies: [] as string[], prompts: [] as string[] }));
vi.mock('../src/llm/codex-exec.js', () => ({
  CodexExecThread: class {
    runStreamed(input: string | { type: string; text?: string }[]) {
      transport.prompts.push(typeof input === 'string' ? input : input.map((part) => part.text ?? '').join('\n'));
      const reply = transport.replies.shift() ?? '';
      return { events: (async function* () {
        yield { type: 'item.updated', item: { id: 'reason-1', type: 'reasoning', text: 'Reviewing ' } };
        yield { type: 'item.completed', item: { id: 'reason-1', type: 'reasoning', text: 'Reviewing the request.' } };
        yield { type: 'item.completed', item: { id: 'reason-1', type: 'reasoning', text: 'Reviewing the request.' } };
        yield { type: 'item.completed', item: { type: 'agent_message', text: reply } };
        yield { type: 'turn.completed', usage: { input_tokens: 20, output_tokens: 10 } };
      })() };
    }
  },
}));

import { CodexSubscriptionClient, isInterimSubscriptionReply } from '../src/llm/codex-subscription.js';

const originalPath = process.env['GITU_CODEX_PATH'];
afterEach(() => {
  if (originalPath === undefined) delete process.env['GITU_CODEX_PATH'];
  else process.env['GITU_CODEX_PATH'] = originalPath;
  transport.replies = [];
  transport.prompts = [];
});

describe('ChatGPT subscription unfinished replies', () => {
  it('streams exposed reasoning snapshots once, separately from answer text', async () => {
    process.env['GITU_CODEX_PATH'] = process.execPath;
    transport.replies = ['No new mail.'];
    const client = new CodexSubscriptionClient({ model: 'gpt-5.6-luna', workingDirectory: process.cwd() });
    const reasoning: string[] = [];
    const answers: string[] = [];
    await client.completeStream([{ role: 'user', content: 'Check mail.' }], { onReasoningDelta: delta => reasoning.push(delta) }, delta => answers.push(delta));
    expect(reasoning).toEqual(['Reviewing ', 'the request.']);
    expect(answers).toEqual(['No new mail.']);
  });
  it('recognizes a brief status promise but leaves actual results alone', () => {
    expect(isInterimSubscriptionReply('Checking the mailbox now.')).toBe(true);
    expect(isInterimSubscriptionReply('I’ll verify the file.')).toBe(true);
    expect(isInterimSubscriptionReply('No new mail.')).toBe(false);
    expect(isInterimSubscriptionReply('Checking the mailbox found no new mail.')).toBe(false);
    expect(isInterimSubscriptionReply('<tool>{"name":"mailbox_status"}</tool>')).toBe(false);
  });

  it('resumes one isolated runtime turn and replaces streamed status with the result', async () => {
    process.env['GITU_CODEX_PATH'] = process.execPath;
    transport.replies = ['Checking the mailbox now.', '<tool>{"name":"mailbox_status","params":{}}</tool>'];
    const client = new CodexSubscriptionClient({ model: 'gpt-5.6-luna', workingDirectory: process.cwd() });
    const reset = vi.fn();
    const deltas: string[] = [];
    const reply = await client.completeStream([{ role: 'system', content: 'Use app tools.' }, { role: 'user', content: 'Check the mailbox.' }], { onStreamReset: reset }, (delta) => deltas.push(delta));
    expect(reply).toContain('mailbox_status');
    expect(reset).toHaveBeenCalledOnce();
    expect(transport.prompts).toHaveLength(2);
    expect(transport.prompts[1]).toContain('Complete the original request now');
    expect(deltas).toEqual(['Checking the mailbox now.', reply]);
  });

  it('surfaces a clear failure if ChatGPT repeats the status without working', async () => {
    process.env['GITU_CODEX_PATH'] = process.execPath;
    transport.replies = ['Checking the mailbox now.', 'Checking the mailbox now.'];
    const client = new CodexSubscriptionClient({ model: 'gpt-5.6-luna', workingDirectory: process.cwd() });
    await expect(client.complete([{ role: 'user', content: 'Check the mailbox.' }])).rejects.toThrow('stopped after a progress update');
    expect(transport.prompts).toHaveLength(2);
  });
});
