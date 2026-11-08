import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { shortId } from '../util.js';

export const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 50_000;
export const TOOL_OUTPUT_RETENTION_MAX_FILES = 100;
export const TOOL_OUTPUT_RETENTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Prunes older tool output logs in a directory to maintain a bounded disk footprint.
 */
export function pruneToolOutputs(
  dir: string,
  maxFiles = TOOL_OUTPUT_RETENTION_MAX_FILES,
  maxAgeMs = TOOL_OUTPUT_RETENTION_MAX_AGE_MS,
): void {
  try {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.log'))
      .map((name) => {
        const full = path.join(dir, name);
        try {
          const st = statSync(full);
          return { name, full, mtime: st.mtimeMs };
        } catch {
          return undefined;
        }
      })
      .filter((e): e is { name: string; full: string; mtime: number } => e !== undefined)
      .sort((a, b) => b.mtime - a.mtime); // newest first

    const now = Date.now();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const isPastRetentionCount = i >= maxFiles;
      const isPastRetentionAge = now - entry.mtime > maxAgeMs;
      if (isPastRetentionCount || isPastRetentionAge) {
        try {
          unlinkSync(entry.full);
        } catch {
          /* ignore unlinking errors */
        }
      }
    }
  } catch {
    /* pruning errors must never impact the active task */
  }
}

/**
 * Stores large tool output to disk reference storage so context stays bounded
 * while preserving full output for inspection. Returns workspace-relative path.
 */
export function storeLargeToolOutput(
  output: string,
  workspaceRoot?: string,
  prefix = 'tool',
  sessionId?: string,
): string | undefined {
  if (!workspaceRoot) return undefined;
  try {
    const sessionSubdir = sessionId ? sessionId.replace(/[^\w.-]/g, '_') : undefined;
    const dir = sessionSubdir
      ? path.join(workspaceRoot, '.hermes', 'tool-output', sessionSubdir)
      : path.join(workspaceRoot, '.hermes', 'tool-output');
    mkdirSync(dir, { recursive: true });

    // Prune stale outputs before writing new ones
    pruneToolOutputs(dir);

    const fileName = `${prefix.replace(/[^\w.-]/g, '_')}-${Date.now()}-${shortId('out')}.log`;
    const fullPath = path.join(dir, fileName);
    writeFileSync(fullPath, output, 'utf8');

    // Return workspace-relative forward-slash path so read_file can access it cleanly
    const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
    return relPath;
  } catch {
    return undefined;
  }
}

/** Preserve useful source context, and make every shortened result explicit with reference storage. */
export function formatToolOutput(
  tool: string,
  output: string,
  limit: number = DEFAULT_MAX_TOOL_OUTPUT_CHARS,
  referencePath?: string,
): string {
  const cap = limit && Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_MAX_TOOL_OUTPUT_CHARS;
  if (output.length <= cap) return output;
  const cut = output.lastIndexOf('\n', cap);
  const kept = output.slice(0, cut > 0 ? cut : cap);
  const numbered = [...kept.matchAll(/^(\d+): /gm)];
  const lastLine = numbered.at(-1)?.[1];
  // A single oversized line may itself be partial; reread that line instead
  // of skipping unseen text. Otherwise continue after the last complete line.
  const offset = lastLine ? Number(lastLine) + (cut > 0 ? 1 : 0) : undefined;
  const refNote = referencePath ? ` Full unshortened output stored at: ${referencePath}.` : '';
  const guidance =
    tool === 'read_file'
      ? `Read the same path with ${offset ? `offset=${offset} and a smaller limit` : 'a smaller line range'}, or use search_files to locate the exact symbol.${refNote}`
      : `Narrow the request or inspect the saved full output with read_file if the omitted detail is needed.${refNote}`;
  return `${kept}\n[OUTPUT TRUNCATED: ${output.length - kept.length} characters omitted. ${guidance}]`;
}
