/**
 * Line-level diffs for file changes.
 *
 * The runtime needs real numbers — how many lines were added AND removed — plus a
 * bounded, renderable body. `linesAdded` alone (the whole file length for a
 * write, a max-of-two-lengths guess for an edit) is what made a diff panel show
 * only green: there was never a removal to show.
 *
 * Plain LCS over lines: exact counts for ordinary edits, and a documented
 * coarse fallback for files too large to diff exactly, so an edit can never fail
 * because of size.
 */

export type DiffLineKind = 'context' | 'add' | 'remove';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number before the change, when the line existed then. */
  oldLine?: number;
  /** 1-based line number after the change, when the line exists now. */
  newLine?: number;
}

export interface FileDiff {
  added: number;
  removed: number;
  /** Change hunks with a little context, ready to render. */
  lines: DiffLine[];
  /** True when `lines` is capped: the counts stay exact, the body is partial. */
  truncated?: boolean;
}

/** Rendered rows kept in the payload. Counts are never affected by this. */
const MAX_DIFF_LINES = 400;
/** Context rows kept around each change, like a unified diff. */
const CONTEXT_LINES = 3;
/** Above this, exact diffing is skipped: the DP table would be 16 MB of work. */
const MAX_LCS_LINES = 1500;

interface Op {
  kind: DiffLineKind;
  text: string;
  oldLine?: number;
  newLine?: number;
}

const splitLines = (text: string): string[] => {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  // A trailing newline TERMINATES the last line; it is not an extra empty one.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/** Exact LCS walk. Returns the op list; the caller decides what to keep. */
function diffOps(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  // table[i][j] = LCS length of before[i:] and after[j:]
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number): number => i * (m + 1) + j;
  const cell = (i: number, j: number): number => table[at(i, j)]!;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] = before[i] === after[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const beforeLine = before[i]!;
    const afterLine = after[j]!;
    if (beforeLine === afterLine) {
      ops.push({ kind: 'context', text: beforeLine, oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (cell(i + 1, j) >= cell(i, j + 1)) {
      ops.push({ kind: 'remove', text: beforeLine, oldLine: i + 1 });
      i += 1;
    } else {
      ops.push({ kind: 'add', text: afterLine, newLine: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: 'remove', text: before[i]!, oldLine: i + 1 });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: 'add', text: after[j]!, newLine: j + 1 });
    j += 1;
  }
  return ops;
}

/** Too large to diff exactly: one replacement block, honest about being coarse. */
function coarseOps(before: string[], after: string[]): Op[] {
  return [
    ...before.map((text, idx): Op => ({ kind: 'remove', text, oldLine: idx + 1 })),
    ...after.map((text, idx): Op => ({ kind: 'add', text, newLine: idx + 1 })),
  ];
}

/** Keep only the changed regions plus CONTEXT_LINES around them. */
function toHunks(ops: Op[]): { lines: DiffLine[]; truncated: boolean } {
  const changed = ops.map((op) => op.kind !== 'context');
  if (!changed.some(Boolean)) return { lines: [], truncated: false };

  const keep = new Array<boolean>(ops.length).fill(false);
  for (let idx = 0; idx < ops.length; idx += 1) {
    if (!changed[idx]) continue;
    for (let k = Math.max(0, idx - CONTEXT_LINES); k <= Math.min(ops.length - 1, idx + CONTEXT_LINES); k += 1) keep[k] = true;
  }

  const lines: DiffLine[] = [];
  let elided = 0;
  let pending = false;
  for (let idx = 0; idx < ops.length; idx += 1) {
    if (keep[idx]) {
      if (pending && elided > 0) {
        lines.push({ kind: 'context', text: `… ${elided} unchanged line${elided === 1 ? '' : 's'}` });
        elided = 0;
      }
      pending = false;
      const op = ops[idx]!;
      lines.push({ kind: op.kind, text: op.text, ...(op.oldLine ? { oldLine: op.oldLine } : {}), ...(op.newLine ? { newLine: op.newLine } : {}) });
      continue;
    }
    elided += 1;
    pending = true;
  }
  if (elided > 0) lines.push({ kind: 'context', text: `… ${elided} unchanged line${elided === 1 ? '' : 's'}` });

  // Cap the rendered body, keeping the first and last rows so both the start of
  // the change and its end stay visible.
  if (lines.length <= MAX_DIFF_LINES) return { lines, truncated: elided > 0 };
  const head = Math.floor(MAX_DIFF_LINES / 2);
  const tail = MAX_DIFF_LINES - head - 1;
  const dropped = lines.length - head - tail;
  return {
    lines: [...lines.slice(0, head), { kind: 'context', text: `… ${dropped} more diff lines hidden` }, ...lines.slice(lines.length - tail)],
    truncated: true,
  };
}

/** The diff between the file's previous content and what was just written. */
export function diffFileContents(before: string, after: string): FileDiff {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  const exact = beforeLines.length <= MAX_LCS_LINES && afterLines.length <= MAX_LCS_LINES;
  const ops = exact ? diffOps(beforeLines, afterLines) : coarseOps(beforeLines, afterLines);
  const added = ops.filter((op) => op.kind === 'add').length;
  const removed = ops.filter((op) => op.kind === 'remove').length;
  const { lines, truncated } = toHunks(ops);
  return { added, removed, lines, ...(truncated ? { truncated: true } : {}) };
}

/** `+12 -3`, the shape both UIs show next to a changed path. ASCII on purpose: it
 *  matches the `lines` log line a parser reads, so the badge and the log agree. */
export function formatLineCounts(added: number, removed: number): string {
  const parts = [`+${added}`];
  if (removed > 0) parts.push(`-${removed}`);
  return parts.join(' ');
}

/** Rows a textual surface (cowork bubbles, CLI, Telegram) shows instead of a
 *  rendered panel. Additions are `+`, removals `-` — never a silent deletion. */
const MAX_BLOCK_LINES = 60;

export function formatDiffBlock(diff: FileDiff): string {
  const rows = diff.lines.slice(0, MAX_BLOCK_LINES).map((line) => {
    const mark = line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' ';
    return `${mark} ${line.text}`;
  });
  if (diff.lines.length > MAX_BLOCK_LINES) rows.push(`… ${diff.lines.length - MAX_BLOCK_LINES} more diff lines`);
  return rows.join('\n');
}
