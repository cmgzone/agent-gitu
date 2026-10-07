import { createContext, Script } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';
import { UI_RESPONSE_JS } from '../src/server/ui-response.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

/**
 * One output system, two surfaces. The whole point of ui-outputs is that the
 * Coding chat and the Cowork chat render a skill's structured result through the
 * same helper, so a new skill never needs two implementations. These tests load
 * each surface's real renderer in a vm context and assert it delegates to the
 * shared outRenderBlocks with byte-identical input.
 */
type AnyRecord = Record<string, unknown>;
type AnyFn = (...args: unknown[]) => unknown;

const SPY = 'var __outCalls = [];\n'
  + 'function outRenderBlocks(t) { __outCalls.push(String(t)); return "<<SHARED>>"; }\n';

const CHART = '{"type":"bar","labels":["Mon","Tue"],"series":[{"name":"A","data":[3,5]}]}';
const MESSAGE = ['Results below.', '', '```output chart', CHART, '```', '',
  '```output preview', '<button id="go">Go</button>', '```'].join('\n');

function stubElement() {
  return {
    innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), contains: () => false },
    setAttribute: vi.fn(), getAttribute: () => null, appendChild: vi.fn(),
    addEventListener: vi.fn(), querySelectorAll: () => [], querySelector: () => null,
    remove: vi.fn(), focus: vi.fn(), selectionStart: 0, disabled: false,
  };
}

function baseContext(extra: AnyRecord = {}): AnyRecord {
  const nodes: AnyRecord = {};
  return createContext({
    document: {
      createElement: vi.fn(stubElement), createTextNode: vi.fn((v: string) => ({ textContent: v })),
      querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(), body: stubElement(), documentElement: stubElement(),
    },
    window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    navigator: { clipboard: { writeText: vi.fn() } },
    crypto: { randomUUID }, URL, console,
    api: vi.fn().mockResolvedValue({}), toast: vi.fn(), confirm: () => true,
    esc: (s: unknown) => String(s ?? ''),
    setInterval: vi.fn(), clearInterval: vi.fn(),
    $: (id: string) => (nodes[id] ||= stubElement()),
    ...extra,
  }) as unknown as AnyRecord;
}

function coworkState(): AnyRecord {
  return {
    S: {
      active: 'cowork',
      cw: {
        active: 'conv', threadId: null, msgs: [], lastSeq: 0,
        agents: [{ id: 'chief', name: 'Chief' }],
        convs: [{ id: 'conv', kind: 'group', memberIds: ['chief'] }],
      },
    },
  };
}

function coworkBody(source: string): AnyRecord {
  const ctx = baseContext(coworkState());
  new Script(source).runInContext(ctx);
  for (const name of ['cwRenderMsgs', 'cwRenderProgress', 'cwRenderTyping', 'cwRenderRail',
    'cwRenderInfo', 'cwRenderChat', 'cwPoll', 'cwStartStream']) ctx[name] = vi.fn();
  (ctx.cwEnsure as AnyFn)();
  return ctx;
}

describe('shared output viewers: Coding and Cowork parity', () => {
  it('routes the same message through the shared renderer on both surfaces', () => {
    const coding = baseContext();
    new Script(SPY + UI_RESPONSE_JS).runInContext(coding);
    const codingHtml = (coding.renderResponseText as AnyFn)(MESSAGE) as string;

    const cowork = coworkBody(SPY + COWORK_JS);
    const coworkHtml = (cowork.cwBody as AnyFn)(MESSAGE, []) as string;

    expect(coding.__outCalls).toHaveLength(2);
    expect(cowork.__outCalls).toEqual(coding.__outCalls);
    expect(codingHtml).toContain('<<SHARED>>');
    expect(coworkHtml).toContain('<<SHARED>>');
 // The raw fence must not survive once a viewer claimed it.
    expect(codingHtml).not.toContain('```output');
    expect(coworkHtml).not.toContain('```output');
  });

  it('renders real viewer markup on the Coding surface', () => {
    const ctx = baseContext();
    new Script(OUTPUT_JS + '\n' + UI_RESPONSE_JS).runInContext(ctx);
    const html = (ctx.renderResponseText as AnyFn)(MESSAGE) as string;
    expect(html).toContain('out-card');
    expect(html).toContain('<svg');
    expect(html).not.toContain('response-code');
  });

  it('renders a markdown table through the shared viewer on both surfaces', () => {
    const TABLE = ['| Skill | Output |', '| --- | --- |', '| Research | sources |'].join('\n');
    const coding = baseContext();
    new Script(OUTPUT_JS + '\n' + UI_RESPONSE_JS).runInContext(coding);
    const codingHtml = (coding.renderResponseText as AnyFn)(TABLE) as string;

    const cowork = coworkBody(OUTPUT_JS + '\n' + COWORK_JS);
    const coworkHtml = (cowork.cwBody as AnyFn)(TABLE, []) as string;

    expect(codingHtml).toContain('out-tbl');
    expect(coworkHtml).toContain('out-tbl');
    // Sortable headers come from the shared viewer, so neither surface keeps
    // its own private table renderer.
    expect(codingHtml).toContain('out-sort');
    expect(coworkHtml).toContain('out-sort');
    expect(coworkHtml).not.toContain('cw-table');
  });

  it('still renders an ordinary code fence when the shared module is absent', () => {
    const ctx = baseContext();
    new Script(UI_RESPONSE_JS).runInContext(ctx);
    const html = (ctx.renderResponseText as AnyFn)('```js\nconst a = 1;\n```') as string;
    expect(html).toContain('response-code');
    expect(html).toContain('const a = 1;');
  });
});
