/**
 * Change-impact analysis: after an edit, probe the language server for the
 * edited file's exported classes/functions/interfaces/enums and count how
 * many DISTINCT files reference each. Symbols with wide fan-in are surfaced
 * to the model as an impact note — a local fix to a heavily-referenced symbol
 * is the classic "tests pass but something else broke" trap, and LSP
 * references are the cheapest mechanical way to see the blast radius.
 */
import type { LspSymbol } from '../lsp/lsp-types.js';

/** Structural slice of the LspManager this module needs (stub-friendly). */
export interface ImpactLsp {
  symbols(file: string): Promise<{ ok: boolean; payload?: unknown }>;
  references(file: string, line: number, column: number): Promise<{ ok: boolean; payload?: unknown }>;
}

/** Class, Interface, Enum, Function, Method — the kinds worth probing. */
const IMPACT_KINDS = new Set([5, 6, 10, 11, 12]);
const MAX_SYMBOLS_PROBED = 6;
const MAX_FILES_PROBED = 3;
/** A symbol referenced from this many OTHER files is wide fan-in. */
const IMPACT_FILE_THRESHOLD = 4;

export interface ImpactRefLocation {
  uri?: string;
  targetUri?: string;
}

function uriToComparable(uri: string): string {
  let p = uri.replace(/^file:\/\//, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep raw */
  }
  return p.replace(/\\/g, '/').replace(/^\/([A-Za-z]:)/, '$1').toLowerCase();
}

function isSelfLocation(loc: ImpactRefLocation, selfFile: string): boolean {
  const uri = loc.targetUri ?? loc.uri;
  if (!uri) return true;
  const path = uriToComparable(uri);
  const rel = selfFile.replace(/\\/g, '/').toLowerCase();
  return path === rel || path.endsWith(`/${rel}`);
}

/** Top-level symbols worth an impact probe, in document order, bounded. */
export function pickImpactSymbols(symbols: unknown): { name: string; line: number; column: number }[] {
  if (!Array.isArray(symbols)) return [];
  const out: { name: string; line: number; column: number }[] = [];
  for (const raw of symbols as LspSymbol[]) {
    if (!raw || typeof raw.name !== 'string') continue;
    if (!IMPACT_KINDS.has(raw.kind)) continue;
    const sel = raw.selectionRange?.start ?? raw.range?.start;
    if (!sel) continue;
    out.push({ name: raw.name, line: (sel.line ?? 0) + 1, column: (sel.character ?? 0) + 1 });
    if (out.length >= MAX_SYMBOLS_PROBED) break;
  }
  return out;
}

export interface SymbolImpact {
  name: string;
  refs: number;
  files: number;
}

/** Aggregate reference locations for one symbol into a fan-in summary. */
export function summarizeReferences(
  name: string,
  locations: unknown,
  selfFile: string,
): SymbolImpact | undefined {
  if (!Array.isArray(locations)) return undefined;
  let refs = 0;
  const files = new Set<string>();
  for (const loc of locations as ImpactRefLocation[]) {
    if (isSelfLocation(loc, selfFile)) continue;
    refs += 1;
    files.add(uriToComparable(loc.targetUri ?? loc.uri ?? ''));
  }
  return { name, refs, files: files.size };
}

/**
 * Build the impact note for an edited file, or undefined when the LSP is
 * unavailable, the file has no probe-worthy symbols, or nothing crosses the
 * fan-in threshold.
 */
export async function analyzeChangeImpact(lsp: ImpactLsp, files: string[]): Promise<string | undefined> {
  const lines: string[] = [];
  for (const file of files.slice(0, MAX_FILES_PROBED)) {
    let picked: { name: string; line: number; column: number }[];
    try {
      const syms = await lsp.symbols(file);
      if (!syms.ok) continue;
      picked = pickImpactSymbols(syms.payload);
    } catch {
      continue;
    }
    for (const sym of picked) {
      let refs: unknown;
      try {
        const call = await lsp.references(file, sym.line, sym.column);
        if (!call.ok) continue;
        refs = call.payload;
      } catch {
        continue;
      }
      const impact = summarizeReferences(sym.name, refs, file);
      if (impact && impact.files >= IMPACT_FILE_THRESHOLD) {
        lines.push(`  - ${sym.name} (${file}): ${impact.refs} reference(s) across ${impact.files} file(s)`);
        if (lines.length >= 3) return formatNote(lines);
      }
    }
  }
  return lines.length > 0 ? formatNote(lines) : undefined;
}

function formatNote(lines: string[]): string {
  return (
    `CHANGE IMPACT — edited symbols with wide fan-in:\n${lines.join('\n')}\n` +
    `Run lsp_references on each and check every caller before completing: a local fix to a widely-referenced symbol can break distant call sites.`
  );
}
