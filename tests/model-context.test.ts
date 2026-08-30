import { describe, expect, it } from 'vitest';
import { buildModelContext, DEFAULT_CONTEXT_MAX_CHARS } from '../src/context/model-context.js';
import type { LlmMessage } from '../src/llm/llm.js';

const SYSTEM = 'You are Agent Gitu. ' + 'x'.repeat(500);
const STRATEGY = 'TASK STRATEGY - bug fix. Reproduce first.';
const PACK = 'CONTEXT SAMPLE (a partial retrieval preview)\n' + 'y'.repeat(2000);
const HISTORY: LlmMessage[] = Array.from({ length: 6 }, (_x, i) => ({
  role: i % 2 ? 'assistant' : 'user',
  content: `turn ${i} ${'h'.repeat(800)}`,
})) as LlmMessage[];

describe('buildModelContext — unified context authority', () => {
  it('assembles every section in the fixed priority order', () => {
    const result = buildModelContext({
      system: SYSTEM,
      strategy: STRATEGY,
      contextPack: PACK,
      conversationHistory: HISTORY,
      images: [{ name: 'shot.png', dataUrl: 'data:image/png;base64,AAAA' }],
      supportsImages: true,
      followUp: 'FOLLOW-UP MESSAGE: continue',
    });
    const kinds = result.messages.map((m) =>
      typeof m.content === 'string'
        ? m.content.startsWith('TASK STRATEGY')
          ? 'strategy'
          : m.content.startsWith('CONTEXT SAMPLE')
            ? 'pack'
            : m.content.startsWith('FOLLOW-UP')
              ? 'followUp'
              : m.role
        : 'images',
    );
    expect(kinds).toEqual(['system', 'strategy', 'pack', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'images', 'followUp']);
    expect(result.imagesAttached).toBe(1);
    expect(result.imagesSkipped).toBe(false);
    expect(result.trims).toHaveLength(0); // well under the default budget
  });

  it('delivers a note instead of images for text-only models', () => {
    const result = buildModelContext({
      system: SYSTEM,
      images: [{ name: 'shot.png', dataUrl: 'data:image/png;base64,AAAA' }],
      supportsImages: false,
    });
    expect(result.imagesAttached).toBe(0);
    expect(result.imagesSkipped).toBe(true);
    expect(result.messages).toHaveLength(2);
    expect(String(result.messages[1]!.content)).toContain('does not support images');
  });

  it('keeps attached-file metadata and bounded text in protected context', () => {
    const result = buildModelContext({
      system: SYSTEM,
      contextPack: PACK,
      conversationHistory: HISTORY,
      attachments: [{
        name: 'requirements.md',
        path: '.hermes/session-files/run-1/file-requirements.md',
        mime: 'text/markdown; charset=utf-8',
        size: 82,
        textExcerpt: 'Critical requirement: downloads must remain available after compaction.',
      }],
      budget: { maxChars: 1500 },
    });
    const attachment = result.messages.find((message) => String(message.content).startsWith('USER ATTACHED FILES'));
    expect(attachment).toBeTruthy();
    expect(String(attachment!.content)).toContain('requirements.md');
    expect(String(attachment!.content)).toContain('Critical requirement: downloads must remain available');
    expect(result.trims.some((trim) => trim.section === 'contextPack')).toBe(true);
  });

  it('trims the context pack FIRST when over budget — it is only a sample', () => {
    const result = buildModelContext({
      system: SYSTEM,
      strategy: STRATEGY,
      contextPack: PACK,
      budget: { maxChars: 1500 },
      onTrim: () => {},
    });
    expect(result.trims.some((t) => t.section === 'contextPack')).toBe(true);
    expect(result.totalChars).toBeLessThanOrEqual(3000);
    // System and strategy are never trimmed.
    expect(String(result.messages[0]!.content)).toBe(SYSTEM);
    expect(result.messages.some((m) => String(m.content).startsWith('TASK STRATEGY'))).toBe(true);
    // The pack keeps its header so the model knows what it is looking at.
    expect(result.messages.some((m) => String(m.content).startsWith('CONTEXT SAMPLE') && m.content.includes('trimmed'))).toBe(true);
  });

  it('drops OLDEST history first and always keeps the recent end', () => {
    const result = buildModelContext({
      system: SYSTEM,
      conversationHistory: HISTORY,
      budget: { maxChars: 2000 },
    });
    expect(result.trims.filter((t) => t.section === 'conversation').length).toBeGreaterThan(0);
    const lastHistory = String(result.messages.filter((m) => String(m.content).startsWith('turn')).at(-1)?.content ?? '');
    expect(lastHistory).toContain('turn 5'); // most recent survives
    expect(result.messages.length).toBeGreaterThanOrEqual(3); // system + >=2 history
  });

  it('never trims below the floor even when the budget is impossible', () => {
    const result = buildModelContext({
      system: SYSTEM,
      strategy: STRATEGY,
      contextPack: PACK,
      conversationHistory: HISTORY,
      budget: { maxChars: 100 }, // below the 10K floor
    });
    expect(result.totalChars).toBeGreaterThan(100); // advisory, not destructive
    expect(result.messages[0]!.content).toBe(SYSTEM);
  });

  it('defaults to the documented budget constant', () => {
    expect(DEFAULT_CONTEXT_MAX_CHARS).toBe(48_000);
  });
});

describe('digest-before-trim invariant (never lose uncompacted history)', () => {
  it('condenses dropped history into a digest instead of silently forgetting it', () => {
    const decisionTurns: LlmMessage[] = [
      { role: 'user', content: 'DECISION: use Zustand for state management, agreed with the team.' },
      ...Array.from({ length: 6 }, (_x, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'h'.repeat(800)}` })),
    ] as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, conversationHistory: decisionTurns, budget: { maxChars: 2000 } });
    const digest = result.messages.find((m) => String(m.content).startsWith('COMPACTED HISTORY'));
    expect(digest).toBeTruthy();
    // The critical early decision survives through the digest.
    expect(String(digest!.content)).toContain('DECISION: use Zustand');
    // And the digest sits BEFORE the retained recent tail.
    const digestIdx = result.messages.indexOf(digest!);
    const lastTurnIdx = result.messages.map((m) => String(m.content).startsWith('turn')).lastIndexOf(true);
    expect(digestIdx).toBeLessThan(lastTurnIdx);
  });

  it('carries an existing digest forward instead of flattening it', () => {
    const prior = 'COMPACTED HISTORY - 9 earlier messages were condensed.\nuser: earlier critical finding about the payment flow\nKEY FAILURES (do not repeat blindly):\nRESULT [error] $ npm test';
    const history: LlmMessage[] = [
      { role: 'user', content: prior },
      ...Array.from({ length: 6 }, (_x, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'h'.repeat(900)}` })),
    ] as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, conversationHistory: history, budget: { maxChars: 2200 } });
    const digests = result.messages.filter((m) => String(m.content).startsWith('COMPACTED HISTORY'));
    expect(digests).toHaveLength(1); // merged, not duplicated
    // Carried material survives the merge.
    expect(String(digests[0]!.content)).toContain('payment flow');
    expect(String(digests[0]!.content)).toContain('KEY FAILURES');
  });

  it('never trims the digest, even under an extreme budget', () => {
    const history: LlmMessage[] = Array.from({ length: 8 }, (_x, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `turn ${i} ${'h'.repeat(1200)}`,
    })) as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, conversationHistory: history, budget: { maxChars: 1500 } });
    expect(result.messages.some((m) => String(m.content).startsWith('COMPACTED HISTORY'))).toBe(true);
  });
});

import { compressDigest, DIGEST_TARGET_CHARS } from '../src/context/digest.js';

describe('protected-digest invariant (no resume-critical info in trimmable-only sections)', () => {
  it('decision at turn 1 survives hundreds of irrelevant turns + forced trimming', () => {
    const turns: LlmMessage[] = [
      { role: 'user', content: 'ARCHITECTURE DECISION RECORDED (ad-1): use Zustand for all client state.' },
      ...Array.from({ length: 300 }, (_x, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: `irrelevant turn ${i}: ${'noise '.repeat(20)}`,
      })),
    ] as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, conversationHistory: turns, budget: { maxChars: 2000 } });
    const digest = result.messages.find((m) => String(m.content).startsWith('COMPACTED HISTORY'));
    expect(digest).toBeTruthy();
    // The decision is on the PROTECTED floor: it survives digest rounds and
    // digest compression alike.
    expect(String(digest!.content)).toContain('use Zustand');
    expect(String(digest!.content)).toContain('KEY DECISIONS');
  });

  it('compresses an over-large digest into a smaller protected digest (v1 -> v2)', () => {
    const excerpts = Array.from({ length: 200 }, (_x, i) => `assistant: excerpt line ${i} ${'e'.repeat(180)}`);
    const big = `COMPACTED HISTORY - 200 earlier messages were condensed into the excerpts below.\n${excerpts.join('\n')}\nKEY DECISIONS (still binding):\nDECISION: keep the SPA routing\nKEY FAILURES (do not repeat blindly):\nRESULT [error] $ npm test -- core\nTypeError: x is not a function`;
    expect(big.length).toBeGreaterThan(DIGEST_TARGET_CHARS);
    const compressed = compressDigest(big, DIGEST_TARGET_CHARS);
    expect(compressed.length).toBeLessThanOrEqual(DIGEST_TARGET_CHARS + 50);
    // The durable floor survives compression in full.
    expect(compressed).toContain('DECISION: keep the SPA routing');
    expect(compressed).toContain('RESULT [error] $ npm test -- core');
    expect(compressed).toContain('TypeError: x is not a function');
    // Still a valid digest: parses back into sections.
    expect(compressed).toContain('KEY DECISIONS');
    expect(compressed).toContain('KEY FAILURES');
  });

  it('the failure floor survives even when excerpt volume forces drops', () => {
    const turns: LlmMessage[] = [
      { role: 'user', content: 'RESULT [error] $ deploy --prod\nCRITICAL: database migration lock timeout' },
      ...Array.from({ length: 400 }, (_x, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        content: `filler ${i}: ${'n'.repeat(60)}`,
      })),
    ] as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, conversationHistory: turns, budget: { maxChars: 1500 } });
    const digest = String(result.messages.find((m) => String(m.content).startsWith('COMPACTED HISTORY'))!.content);
    expect(digest).toContain('CRITICAL: database migration lock timeout');
  });
});
