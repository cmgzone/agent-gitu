import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';
import { UI_HTML } from '../src/server/ui.js';

function card(questions: unknown[]) {
  const submit = { disabled: false, onclick: undefined as undefined | (() => void) };
  const div = { className: '', innerHTML: '', onclick: undefined as undefined | ((event: unknown) => void),
    querySelectorAll: () => [], querySelector: () => ({ value: '' }) };
  const stream = { querySelectorAll: () => [], appendChild: vi.fn() };
  const api = vi.fn(async () => ({}));
  const context = createContext({
    S: { sessions: { run: {} } },
    $: (id: string) => ({ stream, qSend: submit } as Record<string, unknown>)[id],
    document: { createElement: () => div },
    pendingQuestionsFor: () => ({ id: 'style-request', questions }), stickScroll: vi.fn(), api, toast: vi.fn(),
    esc: (value: string) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  });
  new Script(UI_HTML.slice(UI_HTML.indexOf('  function renderQuestions('), UI_HTML.indexOf('  function renderPlanReview('))).runInContext(context);
  context.renderQuestions('run', {});
  const choose = (index: number) => div.onclick?.({ target: { closest: (selector: string) => selector === '.opt' ? ({ getAttribute: (name: string) => name === 'data-q' ? '0' : String(index), classList: { add: vi.fn() } }) : null } });
  return { div, api, choose, submit };
}

describe('question choices', () => {
  it('deduplicates labels regardless of whitespace and case while preserving workspace metadata', () => {
    const action = parseAction({ action: { type: 'ask_user', questions: [{ kind: 'workspace', question: 'Which folder?', detail: 'Selection grants no access.', options: [' C:/project ', 'c:/PROJECT', 'C:/other'] }] } });
    expect(action).toMatchObject({ type: 'ask_user', questions: [{ kind: 'workspace', detail: 'Selection grants no access.', options: ['C:/project', 'C:/other'] }] });
  });

  it('preserves distinct case-sensitive workspace paths on POSIX', () => {
    const action = parseAction({ action: { type: 'ask_user', questions: [{ kind: 'workspace', question: 'Which folder?', options: ['/workspace/A', '/workspace/a'] }] } });
    if (action?.type !== 'ask_user') throw new Error('Question was not parsed');
    expect(action.questions[0]!.options).toHaveLength(process.platform === 'win32' ? 1 : 2);
    const ui = card([{ kind: 'workspace', question: 'Which folder?', options: ['/workspace/A', '/workspace/a'] }]);
    expect(ui.div.innerHTML).toContain('/workspace/A');
    expect(ui.div.innerHTML).toContain('/workspace/a');
  });
  it('takes structured model options through parsing, rendering and submitting the selected label', () => {
    const action = parseAction({ action: { type: 'ask_user', questions: [null, {
      question: 'Which product card style?', header: 'Style', options: [
        { label: 'Larger images', description: 'More room for photos' }, {}, null,
        { label: 'Premium cards', description: 'Editorial layout' }, 'Compact cards',
      ],
    }] } });
    expect(action?.type).toBe('ask_user');
    if (action?.type !== 'ask_user') throw new Error('Question action was not parsed.');
    const ui = card(action.questions);
    expect(ui.div.innerHTML).toContain('Larger images');
    expect(ui.div.innerHTML).toContain('Premium cards');
    expect(ui.div.innerHTML).toContain('Compact cards');
    expect(ui.div.innerHTML).not.toContain('[object Object]');
    ui.choose(1);
    ui.submit.onclick?.();
    expect(ui.api).toHaveBeenCalledWith('/api/answers/style-request', expect.objectContaining({ body: JSON.stringify({ answer: 'Which product card style? — Premium cards' }) }));
  });

  it('handles structured options from existing question frames and never submits object text', () => {
    const ui = card([null, { question: 'Which style?', options: [{ label: '<Large>', description: 'Photo first' }, '[object Object]', { label: 'Compact' }] }]);
    expect(ui.div.innerHTML).toContain('&lt;Large&gt;');
    expect(ui.div.innerHTML).not.toContain('[object Object]');
    ui.choose(1);
    ui.submit.onclick?.();
    expect(ui.api).toHaveBeenCalledWith('/api/answers/style-request', expect.objectContaining({ body: JSON.stringify({ answer: 'Which style? — Compact' }) }));
  });
});
