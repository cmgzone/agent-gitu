import { fileURLToPath } from 'node:url';
import type { LspDiagnostic } from './lsp-types.js';

/**
 * DiagnosticsCache — per-uri store for push-model `textDocument/publishDiagnostics`
 * notifications, plus formatting helpers for agent-facing output.
 */
export class DiagnosticsCache {
  private readonly byUri = new Map<string, LspDiagnostic[]>();

  set(uri: string, items: LspDiagnostic[]): void {
    this.byUri.set(uri, items);
  }

  get(uri: string): LspDiagnostic[] | undefined {
    return this.byUri.get(uri);
  }

  /** Drop the cached set for one document (called when the doc is re-synced,
   *  so a push-model fallback can never return pre-edit diagnostics). */
  invalidate(uri: string): void {
    this.byUri.delete(uri);
  }

  clear(): void {
    this.byUri.clear();
  }
}

const SEVERITY_LABEL: Record<number, string> = {
  1: 'ERROR',
  2: 'WARNING',
  3: 'INFO',
  4: 'HINT',
};

export interface FormattedDiagnostic {
  label: string;
  file: string;
  line: number;
  column: number;
  code?: string | number;
  message: string;
}

/** Flatten LSP diagnostics into a stable, sortable list. */
export function flattenDiagnostics(items: LspDiagnostic[], file: string): FormattedDiagnostic[] {
  return items.map((d) => ({
    label: SEVERITY_LABEL[d.severity ?? 1] ?? 'NOTE',
    file,
    line: d.range.start.line + 1,
    column: d.range.start.character + 1,
    code: d.code,
    message: d.message,
  }));
}

/** Render diagnostics in the compact agent-facing format:
 *    [ERROR] src/auth.ts:42:17 — TS2339: Property 'token' does not exist on type 'User'.
 */
export function formatDiagnostics(items: LspDiagnostic[], file: string): string {
  if (items.length === 0) return `No diagnostics for ${file}.`;
  const flat = flattenDiagnostics(items, file)
    .slice()
    .sort((a, b) => a.line - b.line || a.column - b.column);
  const errors = flat.filter((d) => d.label === 'ERROR').length;
  const warnings = flat.filter((d) => d.label === 'WARNING').length;
  const body = flat
    .map((d) => {
      const code = d.code !== undefined ? ` ${d.code}` : '';
      return `[${d.label}] ${d.file}:${d.line}:${d.column} —${code} ${d.message}`;
    })
    .join('\n');
  const summary = `${errors} error(s), ${warnings} warning(s)`;
  return `${body}\n${summary}`;
}

/** Convert a `file://` URI back to a filesystem path (for display). */
function uriToPath(uri: string): string {
  if (uri.startsWith('file://')) {
    try {
      return fileURLToPath(uri);
    } catch {
      return uri;
    }
  }
  return uri;
}

/** Render a single LSP location (definition/reference) as text. */
export function formatLocation(
  uri: string,
  range: { start: { line: number; character: number }; end?: { line: number; character: number } } | undefined,
  fallback: string,
): string {
  if (!range) return fallback;
  return `${uriToPath(uri)}:${range.start.line + 1}:${range.start.character + 1}`;
}