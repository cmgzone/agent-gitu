import { describe, expect, it } from 'vitest';
import {
  COMPACT_CHAR_BUDGET,
  COMPACT_KEEP_RECENT,
  COMPACT_TRIGGER,
  compactionPolicyForWindow,
  compactHistory,
  type LlmMessage,
} from '../src/agent/compaction.js';
import type { LlmMessage as LlmMessageType } from '../src/llm/llm.js';

describe('model-aware compaction policy', () => {
  it('falls back to the historical constants when the model window is unknown', () => {
    for (const window of [undefined, 0, -5, Number.NaN]) {
      const policy = compactionPolicyForWindow(window);
      expect(policy.charBudget).toBe(COMPACT_CHAR_BUDGET);
      expect(policy.keepRecent).toBe(COMPACT_KEEP_RECENT);
      expect(policy.triggerMessages).toBe(COMPACT_TRIGGER);
      expect(policy.emergencyInputTokens).toBeUndefined();
    }
  });

  it('compacts much earlier for a 32K model than the one-size default', () => {
    const policy = compactionPolicyForWindow(32_768);
    // working = 32,768 − 4,096 output − 4,096 safety = 24,576 tokens.
    expect(policy.charBudget).toBe(49_152); // half of working at 4 chars/token
    expect(policy.keepRecent).toBe(4);
    expect(policy.triggerMessages).toBe(12);
    expect(policy.emergencyInputTokens).toBe(22_118); // ~90% of working
    expect(policy.charBudget).toBeLessThan(COMPACT_CHAR_BUDGET);
  });

  it('lets a 128K model retain substantially more history than the default', () => {
    const policy = compactionPolicyForWindow(131_072);
    // working = 131,072 − 16,384 output − 12,288 safety = 102,400 tokens.
    expect(policy.charBudget).toBe(204_800);
    expect(policy.keepRecent).toBe(8);
    expect(policy.triggerMessages).toBe(51);
    expect(policy.emergencyInputTokens).toBe(92_160);
    expect(policy.charBudget).toBeGreaterThan(COMPACT_CHAR_BUDGET);
  });

  it('caps very large windows so a single request stays bounded', () => {
    const policy = compactionPolicyForWindow(1_000_000);
    expect(policy.charBudget).toBe(800_000);
    expect(policy.keepRecent).toBe(8);
    expect(policy.triggerMessages).toBe(64);
  });

  it('explicit host overrides win over derived values', () => {
    const policy = compactionPolicyForWindow(131_072, { charBudget: 60_000, keepRecent: 5 });
    expect(policy.charBudget).toBe(60_000);
    expect(policy.keepRecent).toBe(5);
    // Non-overridden fields still derive from the window.
    expect(policy.triggerMessages).toBe(51);
    expect(policy.emergencyInputTokens).toBe(92_160);
  });
});

describe('compactHistory honors a derived policy', () => {
  it('counts native arguments when deciding to compact older exchanges', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'Write the notes.' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'large-write', name: 'write_file', arguments: { path: 'notes.txt', content: 'x'.repeat(90_000) } }] },
      { role: 'tool', toolCallId: 'large-write', content: 'Write succeeded.' },
      ...Array.from({ length: 6 }, (_, i): LlmMessage => ({ role: i % 2 ? 'user' : 'assistant', content: `Later ${i}` })),
    ];
    expect(compactHistory(messages, undefined, { keepRecent: 4 })).toBe(true);
    expect(messages.some(message => message.toolCalls?.length)).toBe(false);
    expect(String(messages[1]?.content)).toContain('notes.txt');
  });

  it('keeps a complete native exchange when the desired tail starts between its results', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'SYS' },
      ...Array.from({ length: 24 }, (_, i): LlmMessage => ({ role: i % 2 ? 'user' : 'assistant', content: `Earlier ${i}` })),
      { role: 'assistant', content: '', toolCalls: Array.from({ length: 4 }, (_, i) => ({ id: `call-${i}`, name: 'list_files', arguments: { path: '.' } })) },
      ...Array.from({ length: 4 }, (_, i): LlmMessage => ({ role: 'tool', toolCallId: `call-${i}`, content: `Result ${i}` })),
      { role: 'user', content: 'Continue.' },
    ];
    expect(compactHistory(messages, undefined, { keepRecent: 4, triggerMessages: 8 })).toBe(true);
    expect(messages.filter(message => message.role === 'tool')).toHaveLength(4);
    for (const result of messages.filter(message => message.role === 'tool')) {
      expect(messages.some(message => message.toolCalls?.some(call => call.id === result.toolCallId))).toBe(true);
    }
  });

  it('compacts a history that exceeds a small model’s derived budget', () => {
    const policy = compactionPolicyForWindow(32_768);
    const messages: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: `turn ${i}: ${'x'.repeat(4_000)}` } as LlmMessageType);
    }
    // 20 messages × ~4,008 chars ≈ 80K chars — over the 49K 32K-model budget
    // and over the derived 12-message trigger, but under the static default.
    const compacted = compactHistory(messages, undefined, {
      charBudget: policy.charBudget,
      keepRecent: policy.keepRecent,
      triggerMessages: policy.triggerMessages,
    });
    expect(compacted).toBe(true);
    expect(messages.length).toBeLessThan(15);
    expect(String(messages[1]!.content)).toContain('COMPACTED HISTORY');
    // Same history under the large-model policy stays untouched: 80K chars is
    // far below the 204,800-char 128K-model budget and below its 51 trigger.
    const large: LlmMessage[] = [{ role: 'system', content: 'SYS' }];
    for (let i = 0; i < 20; i++) {
      large.push({ role: 'user', content: `turn ${i}: ${'x'.repeat(4_000)}` } as LlmMessageType);
    }
    expect(compactHistory(large, undefined, { charBudget: 204_800, keepRecent: 8, triggerMessages: 51 })).toBe(false);
  });
});
