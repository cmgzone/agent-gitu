import { describe, expect, it } from 'vitest';
import { messageTokens, safeMessageLink, wrapMessageText } from '../apps/android/src/message-content.js';
import { mergeFrames, projectLiveFrames, type LiveFrame } from '../apps/android/src/live-events.js';

const frame = (i: number, text: string): LiveFrame => ({ i, text, t: new Date(i * 1000).toISOString() });
describe('mobile rich replies and streaming', () => {
  it('keeps code, tables, links and nested lists as structured native content', () => {
    const tokens = messageTokens(
      '# Result\n\n**Ready** with [details](https://example.com).\n\n- Parent\n  - Child\n\n| File | Status |\n| --- | --- |\n| app.ts | Done |\n\n```ts\nconst value = "a very long line";\n',
    );
    expect(tokens.map((token) => token.type)).toEqual(expect.arrayContaining(['heading_open', 'bullet_list_open', 'table_open', 'fence']));
    expect(tokens.at(-1)?.content).toContain('const value');
    expect(messageTokens('<script>alert(1)</script>').some((token) => token.type === 'html_block')).toBe(false);
    expect(safeMessageLink('javascript:alert(1)')).toBeUndefined();
    expect(safeMessageLink('file:///private/key')).toBeUndefined();
    expect(safeMessageLink('https://example.com')).toBe('https://example.com');
    expect(
      wrapMessageText('a'.repeat(150))
        .split('\u200b')
        .every((chunk) => chunk.length <= 18),
    ).toBe(true);
  });
  it('replaces live tokens with the final reply once, including after replay', () => {
    const events = [frame(1, 'user-msg Hello'), frame(2, 'tdelta A short '), frame(3, 'tdelta answer')];
    expect(projectLiveFrames(events).replies.at(-1)).toMatchObject({ text: 'A short answer', live: true });
    const complete = mergeFrames(events, [...events, frame(4, 'say A short answer, finished.')]);
    expect(complete).toHaveLength(4);
    expect(projectLiveFrames(complete).replies).toHaveLength(2);
    expect(projectLiveFrames(complete).replies.at(-1)).toMatchObject({ id: '2', text: 'A short answer, finished.', live: false });
  });
  it('keeps reasoning separate and correlates repeated tool calls independently', () => {
    const events: LiveFrame[] = [
      frame(1, 'activity reasoning-reset'),
      frame(2, 'activity reasoning-delta "Checking the project."'),
      { ...frame(3, ''), typed: { type: 'command_started', command: 'npm test', seq: 30 } },
      { ...frame(4, ''), typed: { type: 'command_finished', command: 'npm test', ok: true, seq: 31 } },
      { ...frame(5, ''), typed: { type: 'command_started', command: 'npm test', seq: 32 } },
      { ...frame(6, ''), typed: { type: 'command_finished', command: 'npm test', ok: false, seq: 33 } },
    ];
    const result = projectLiveFrames(events);
    expect(result.reasoning).toBe('Checking the project.');
    expect(result.replies).toEqual([]);
    expect(result.tools.map((tool) => tool.state)).toEqual(['done', 'failed']);
    expect(projectLiveFrames([...events, frame(7, 'user-msg Next task')]).reasoning).toBe('');
  });
  it('retains typed-only frames without advancing the reply row cursor', () => {
    const native: LiveFrame = { seq: 77, t: new Date(2000).toISOString(), typed: { type: 'reasoning', text: 'Provider reasoning', seq: 77 } };
    const result = mergeFrames([frame(1, 'say First')], [native, native, frame(2, 'say Second')]);
    expect(result).toHaveLength(3);
    expect(projectLiveFrames(result).replies.map((reply) => reply.text)).toEqual(['First', 'Second']);
    expect(projectLiveFrames(result).reasoning).toBe('Provider reasoning');
  });
});
