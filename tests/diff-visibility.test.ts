import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { toCodingEvent } from '../src/coding/events.js';
import { diffFileContents, formatDiffBlock, formatLineCounts } from '../src/tools/diff.js';
import { toolApplyEdit, toolWriteFile, type ToolContext } from '../src/tools/tools.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { UI_HTML } from '../src/server/ui.js';
import { COWORK_CSS, COWORK_JS } from '../src/server/ui-cowork.js';

/**
 * What the user can actually see of a change. Before this there was no diff at
 * all: `linesAdded` was the whole new file's length for a write and a
 * max-of-two-lengths guess for an edit, so a panel could only ever show a green
 * "+N" and a rewrite looked like a pure addition.
 */
function project(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-diff-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'diff-fixture' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function ctx(dir: string): ToolContext {
  return { cwd: dir, guard: ProjectGuard.detect(dir) };
}

describe('the diff engine', () => {
  it('counts additions AND removals for a rewrite', () => {
    const diff = diffFileContents('one\ntwo\nthree\n', 'one\ntwo point five\nthree\n');
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    const kinds = diff.lines.map((line) => line.kind);
    expect(kinds).toContain('add');
    expect(kinds).toContain('remove');
  });

  it('reports nothing for an unchanged file', () => {
    const diff = diffFileContents('a\nb\n', 'a\nb\n');
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.lines).toEqual([]);
  });

  it('treats a new file as all additions and a deletion as all removals', () => {
    expect(diffFileContents('', 'x\ny\n').added).toBe(2);
    expect(diffFileContents('', 'x\ny\n').removed).toBe(0);
    expect(diffFileContents('x\ny\n', '').removed).toBe(2);
  });

  it('elides untouched regions instead of dumping the whole file', () => {
    const before = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const after = before.replace('line 5', 'line five');
    const diff = diffFileContents(before, after);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    // The body is a hunk with context, not 200 rows.
    expect(diff.lines.length).toBeLessThan(20);
    expect(diff.lines.some((line) => /unchanged line/.test(line.text))).toBe(true);
  });

  it('formats counts with a minus only when something was removed', () => {
    expect(formatLineCounts(12, 0)).toBe('+12');
    expect(formatLineCounts(12, 3)).toBe('+12 -3');
    expect(formatLineCounts(0, 4)).toBe('+0 -4');
  });

  it('marks each block row so a deletion is never invisible', () => {
    const block = formatDiffBlock(diffFileContents('gone\nkept\n', 'kept\nnew\n'));
    expect(block).toContain('- gone');
    expect(block).toContain('+ new');
    expect(block).toContain('  kept');
  });
});

describe('a file change reports real counts', () => {
  it('diffs a rewrite against the file it replaced', () => {
    const dir = project();
    const rel = 'src/app.ts';
    writeFileSync(path.join(dir, rel), 'const a = 1;\nconst b = 2;\nconst c = 3;\nconst d = 4;\n');
    const result = toolWriteFile(ctx(dir), { path: rel, content: 'const a = 1;\nconst d = 4;\nconst e = 5;\n' });

    expect(result.ok).toBe(true);
    // Two lines gone, one new: the removals are what a "+1" badge used to hide.
    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(2);
    expect(result.output).toContain('+1 -2');
    expect(result.output).toContain('- const b = 2;');
    const diff = (result.payload as { diff: { lines: { kind: string }[] } }).diff;
    expect(diff.lines.filter((line) => line.kind === 'remove')).toHaveLength(2);
  });

  it('counts a small edit as one addition and one removal, not the file length', () => {
    const dir = project();
    const rel = 'src/app.ts';
    writeFileSync(path.join(dir, rel), Array.from({ length: 50 }, (_, i) => `const v${i} = ${i};`).join('\n'));
    const result = toolApplyEdit(ctx(dir), { path: rel, oldString: 'const v7 = 7;', newString: 'const v7 = 77;' });

    expect(result.ok).toBe(true);
    expect(result.linesAdded).toBe(1);
    expect(result.linesRemoved).toBe(1);
    // The previous behaviour reported the whole replacement string here.
    expect(result.linesAdded).toBeLessThan(5);
  });

  it('carries the counts in the text every surface renders', () => {
    const dir = project();
    const rel = 'src/new.ts';
    writeFileSync(path.join(dir, rel), 'alpha\n');
    const result = toolWriteFile(ctx(dir), { path: rel, content: 'beta\n' });
    // cowork/CLI/Telegram only ever see this string, so it has to say what was lost.
    expect(result.output).toContain('+1 -1');
    expect(result.output).toContain('- alpha');
    expect(result.output).toContain('+ beta');
  });
});

describe('the legacy line and its parser', () => {
  it('reads both counts out of a change line', () => {
    expect(toCodingEvent('lines    src/x.ts +12 -3 lines')).toEqual({
      type: 'file_changed',
      path: 'src/x.ts',
      linesAdded: 12,
      linesRemoved: 3,
    });
  });

  it('still reads a legacy addition-only line', () => {
    expect(toCodingEvent('lines    src/x.ts +12 lines')).toEqual({
      type: 'file_changed',
      path: 'src/x.ts',
      linesAdded: 12,
    });
  });

  it('keeps the counts out of the recovered path', () => {
    const parsed = toCodingEvent('ok       edit src/x.ts +2 -1 (31ms)');
    expect(parsed).toMatchObject({ type: 'file_changed', path: 'src/x.ts' });
  });
});

/** The panel: the same string-slice + node:vm technique the typed-card tests use. */
const DIFF_JS = UI_HTML.slice(UI_HTML.indexOf('  function applyFileChange('), UI_HTML.indexOf('  // Refused actions, rendered'));

type FakeNode = {
  tag: string;
  className: string;
  textContent: string;
  dataset: Record<string, string>;
  children: FakeNode[];
  appendChild: (child: FakeNode) => FakeNode;
  querySelector: (sel: string) => FakeNode | null;
  querySelectorAll: (sel: string) => FakeNode[];
};

function matches(node: FakeNode, sel: string): boolean {
  if (sel.startsWith('.')) return node.className.split(/\s+/).includes(sel.slice(1));
  return node.tag === sel.toLowerCase();
}

function node(tag: string): FakeNode {
  const self: FakeNode = {
    tag,
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    appendChild(child: FakeNode) {
      self.children.push(child);
      return child;
    },
    querySelector(sel: string) {
      return self.querySelectorAll(sel)[0] ?? null;
    },
    querySelectorAll(sel: string): FakeNode[] {
      const out: FakeNode[] = [];
      const walk = (current: FakeNode) => {
        for (const child of current.children) {
          if (matches(child, sel)) out.push(child);
          walk(child);
        }
      };
      walk(self);
      return out;
    },
  };
  return self;
}

function uiHarness() {
  const context = createContext({});
  new Script(DIFF_JS).runInContext(context);
  context.document = { createElement: (tag: string) => node(tag) };
  const stream = node('div');
  const toolRow = node('div');
  context.S = { sessions: { run1: { nodes: {} } } };
  context.findToolRow = () => toolRow;
  context.$ = () => stream;
  context.appendLive = (_stream: unknown, el: FakeNode) => stream.appendChild(el);
  return { context, toolRow, stream };
}

/**
 * The UIs are static strings inside template literals, so TypeScript only proves
 * the STRING parses — never the JavaScript or CSS inside it. A stray backtick in
 * a comment or one missing brace ships a blank page behind a green typecheck
 * (this change hit exactly that). Parsing the edited regions is the only honest
 * check that a browser could run them.
 */
describe('the browser bundles still parse', () => {
  const JS_REGIONS: [string, string, string, string][] = [
    ['main: the change counts handler', UI_HTML, "if (text.indexOf('lines ') === 0) {", '// Token telemetry arrives once per run'],
    ['cowork: the diff-aware code block', COWORK_JS, 'function cwCodeHtml(code) {', 'function cwVideoEmbed('],
  ];

  it.each(JS_REGIONS)('%s', (_name, html, from, to) => {
    const start = html.indexOf(from);
    const end = html.indexOf(to, start + from.length);
    expect(start, `anchor not found: ${from}`).toBeGreaterThan(-1);
    expect(end, `end anchor not found: ${to}`).toBeGreaterThan(start);
    // Wrapped in a function: some of these regions are statement fragments (a
    // handler body with a `return`), which are illegal at script top level.
    expect(() => new Script(`function __region(){${html.slice(start, end)}}`)).not.toThrow();
  });

  it.each([
    ['main: diff and reasoning styles', UI_HTML, '.diffview {'],
    ['cowork: diff row styles', COWORK_CSS, '.cw-code .cw-dl.add'],
  ] as [string, string, string][])('%s', (_name, css, anchor) => {
    const start = css.indexOf(anchor);
    expect(start, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
    // Every rule this change added must be closed: an unclosed brace silently
    // swallows the rest of the stylesheet.
    const block = css.slice(start, css.indexOf('}', start) + 1);
    const opens = (block.match(/\{/g) ?? []).length;
    expect(opens).toBe((block.match(/\}/g) ?? []).length);
    expect(opens).toBeGreaterThan(0);
  });

  it('never puts a raw backtick in a comment (it would close the template literal)', () => {
    for (const [name, html] of [
      ['main', UI_HTML],
      ['cowork css', COWORK_CSS],
      ['cowork js', COWORK_JS],
    ] as const) {
      const offenders = html
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => /^\s*(\/\/|\/\*)/.test(line) && line.includes('`'));
      expect(offenders, `${name} has a backtick in a comment: ${offenders.map((o) => o.index + 1).join(', ')}`).toEqual([]);
    }
  });
});

describe('the main agent shows the change and the thinking', () => {
  it('renders removals in red and additions in green on the edit row', () => {
    const { context, toolRow } = uiHarness();
    context.applyFileChange('run1', {
      type: 'file_changed',
      path: 'src/x.ts',
      linesAdded: 1,
      linesRemoved: 2,
      diff: [
        { kind: 'context', text: 'const a = 1;', newLine: 1 },
        { kind: 'remove', text: 'const b = 2;', oldLine: 2 },
        { kind: 'remove', text: 'const c = 3;', oldLine: 3 },
        { kind: 'add', text: 'const b = 22;', newLine: 2 },
        { kind: 'context', text: '… 40 unchanged lines' },
      ],
    });

    const panel = toolRow.querySelector('.diffview');
    expect(panel).not.toBeNull();
    const rows = toolRow.querySelectorAll('div');
    const removed = rows.filter((row: FakeNode) => row.className === 'dline remove');
    const added = rows.filter((row: FakeNode) => row.className === 'dline add');
    const gaps = rows.filter((row: FakeNode) => row.className === 'dline gap');
    expect(removed).toHaveLength(2);
    expect(added).toHaveLength(1);
    // The elision marker must not be mistaken for source.
    expect(gaps).toHaveLength(1);
    expect(removed[0].children[1].textContent).toBe('-');
    expect(added[0].children[1].textContent).toBe('+');
    expect(removed[0].children[2].textContent).toBe('const b = 2;');
  });

  it('does not stack a second panel on the same row', () => {
    const { context, toolRow } = uiHarness();
    const event = { type: 'file_changed', path: 'src/x.ts', diff: [{ kind: 'add', text: 'x', newLine: 1 }] };
    context.applyFileChange('run1', event);
    context.applyFileChange('run1', event);
    expect(toolRow.querySelectorAll('.diffview')).toHaveLength(1);
  });

  it('shows the reasoning trace and updates it in place while it streams', () => {
    const { context, stream } = uiHarness();
    context.applyReasoning('run1', { type: 'reasoning', text: 'First, check the parser.' });
    expect(stream.querySelectorAll('.thinkbox')).toHaveLength(1);
    const pre = stream.querySelector('pre');
    expect(pre?.textContent).toBe('First, check the parser.');

    context.applyReasoning('run1', { type: 'reasoning', text: 'First, check the parser. Then the tests.' });
    // One live block, not a pile: a reasoning turn is one thought, not a log.
    expect(stream.querySelectorAll('.thinkbox')).toHaveLength(1);
    expect(stream.querySelector('pre')?.textContent).toContain('Then the tests.');
  });

  it('ignores an empty trace rather than showing an empty panel', () => {
    const { context, stream } = uiHarness();
    context.applyReasoning('run1', { type: 'reasoning', text: '' });
    expect(stream.querySelectorAll('.thinkbox')).toHaveLength(0);
  });
});

