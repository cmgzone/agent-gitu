import { execFile, execFileSync, type ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SubAgentJob } from '../agent/subagent.js';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { LspManager } from '../lsp/manager.js';
import type { McpManager } from '../mcp/client.js';
import type { SkillStore } from '../skills/skills.js';
import type { CriterionSpec, ToolResult } from '../types.js';
import { errorSignature, excerpt } from '../util.js';
import { normalizeUrl, type BrowserBridge } from '../browser/browser.js';
import { collectBrowserEvidence, collectViewportEvidence, formatBrowserEvidence, formatResponsiveEvidence, resolveViewports } from '../browser/evidence.js';

export interface ToolContext {
  guard: ProjectGuard;
  cwd: string;
  skills?: SkillStore;
  mcp?: McpManager;
  browser?: BrowserBridge;
  lsp?: LspManager;
  delegate?: DelegateFn;
  delegateBackground?: BackgroundDelegateFn;
  backgroundAgentStatus?: BackgroundAgentStatusFn;
}

export interface DelegateSpec {
  agent: string;
  task: string;
  criteria?: (string | CriterionSpec)[];
  /** Wake a paused specialist in its preserved worktree. */
  resume?: { jobId: string; note?: string };
}
export type DelegateFn = (specs: DelegateSpec[]) => Promise<{ agent: string; task: string; ok: boolean; summary: string }[]>;
export type BackgroundDelegateFn = (specs: DelegateSpec[]) => SubAgentJob[];
export type BackgroundAgentStatusFn = (ids?: string[]) => SubAgentJob[];

export const KNOWN_TOOL_NAMES = new Set([
  'read_file',
  'write_file',
  'apply_edit',
  'list_files',
  'search_files',
  'web_fetch',
  'browse',
  'delegate',
  'agent_status',
  'list_skills',
  'create_skill',
  'use_skill',
  'run_command',
  'lsp_diagnostics',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
  'lsp_symbols',
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LIST_ENTRIES = 400;
const MAX_SEARCH_MATCHES = 60;
/** Character cap for read_file output sent to the model. Line count alone is
 *  not a safe bound (wide lines); this is. Overridable per call via the
 *  `maxChars` param (itself capped at 60K). */
export const MAX_READ_OUTPUT_CHARS = 30_000;

const STDERR_FAIL_RE =
  /(is not recognized as|not recognized as the name of|CommandNotFoundException|ItemNotFoundException|The term ['"].*['"] is not recognized|No such file or directory|Permission denied|Access is denied|cannot find path)/i;

function fail(output: string): ToolResult {
  return { ok: false, output, errorSignature: errorSignature(output) };
}

export interface ToolValidationResult {
  valid: boolean;
  error?: string;
  schema?: string;
  correction?: string;
}

export function validateToolParams(tool: string, params: unknown): ToolValidationResult {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return {
      valid: false,
      error: `Parameters must be a JSON object, but received ${params === null ? 'null' : typeof params}.`,
      schema: `${tool}({ ... })`,
      correction: `Provide a valid JSON object of named parameters.`,
    };
  }
  const p = params as Record<string, unknown>;

  const checkNonEmptyString = (name: string): string | undefined => {
    const val = p[name];
    if (val === undefined || val === null) return `Missing required parameter "${name}".`;
    if (typeof val !== 'string') return `Parameter "${name}" must be a string, but received ${typeof val}.`;
    if (val.trim() === '' || val.trim() === 'undefined' || val.trim() === 'null') {
      return `Parameter "${name}" cannot be empty or "undefined". Provide a real value.`;
    }
    return undefined;
  };

  switch (tool) {
    case 'read_file': {
      const err = checkNonEmptyString('path');
      if (err) {
        return {
          valid: false,
          error: err,
          schema: `read_file({ path: string, offset?: number, limit?: number })`,
          correction: `Provide a valid file path string relative to the project root, e.g. read_file({ "path": "src/index.ts" }).`,
        };
      }
      return { valid: true };
    }
    case 'write_file': {
      const pathErr = checkNonEmptyString('path');
      if (pathErr) {
        return {
          valid: false,
          error: pathErr,
          schema: `write_file({ path: string, content: string })`,
          correction: `Provide a valid file path string relative to the project root, e.g. write_file({ "path": "src/file.ts", "content": "..." }).`,
        };
      }
      if (typeof p['content'] !== 'string') {
        return {
          valid: false,
          error: `Missing or invalid "content" parameter (must be a string).`,
          schema: `write_file({ path: string, content: string })`,
          correction: `Provide the full file content as a string.`,
        };
      }
      return { valid: true };
    }
    case 'apply_edit': {
      const pathErr = checkNonEmptyString('path');
      if (pathErr) {
        return {
          valid: false,
          error: pathErr,
          schema: `apply_edit({ path: string, oldString: string, newString: string, replaceAll?: boolean })`,
          correction: `Provide a valid file path string relative to the project root.`,
        };
      }
      if (typeof p['oldString'] !== 'string' || !p['oldString']) {
        return {
          valid: false,
          error: `Missing or empty "oldString" parameter.`,
          schema: `apply_edit({ path: string, oldString: string, newString: string, replaceAll?: boolean })`,
          correction: `Provide the exact existing substring to replace.`,
        };
      }
      if (typeof p['newString'] !== 'string') {
        return {
          valid: false,
          error: `Missing or invalid "newString" parameter (must be a string).`,
          schema: `apply_edit({ path: string, oldString: string, newString: string, replaceAll?: boolean })`,
          correction: `Provide the replacement text as a string.`,
        };
      }
      return { valid: true };
    }
    case 'search_files': {
      const patternErr = checkNonEmptyString('pattern');
      if (patternErr) {
        return {
          valid: false,
          error: patternErr,
          schema: `search_files({ pattern: string, mode?: 'literal'|'regex', flags?: string, path?: string, include?: string[], exclude?: string[], maxResults?: number, contextLines?: number })`,
          correction: `Provide a non-empty search pattern, e.g. search_files({ "pattern": "export function" }) or search_files({ "pattern": "a.b", "mode": "literal" }).`,
        };
      }
      if (p['mode'] !== undefined && p['mode'] !== 'literal' && p['mode'] !== 'regex') {
        return {
          valid: false,
          error: 'mode must be "literal" or "regex"',
          schema: `search_files({ pattern: string, mode?: 'literal'|'regex', ... })`,
          correction: `Use mode "literal" for plain text or "regex" for patterns.`,
        };
      }
      if (p['flags'] !== undefined) {
        const f = String(p['flags']);
        if (f.replace(/[ims]/g, '') !== '') {
          return {
            valid: false,
            error: 'flags supports only the characters i, m, s',
            schema: `search_files({ pattern: string, flags?: string /* i, m, s */ })`,
            correction: `e.g. flags "i" (ignore case), "s" (dot crosses lines), "im".`,
          };
        }
      }
      for (const key of ['include', 'exclude'] as const) {
        if (p[key] !== undefined && (!Array.isArray(p[key]) || (p[key] as unknown[]).some((g) => typeof g !== 'string'))) {
          return {
            valid: false,
            error: `${key} must be an array of glob strings`,
            schema: `search_files({ pattern: string, ${key}?: string[] })`,
            correction: `e.g. ${key}: ["**/*.py", "*.md"].`,
          };
        }
      }
      for (const key of ['maxResults', 'contextLines'] as const) {
        if (p[key] !== undefined && (typeof p[key] !== 'number' || !Number.isFinite(p[key] as number))) {
          return {
            valid: false,
            error: `${key} must be a number`,
            schema: `search_files({ pattern: string, ${key}?: number })`,
            correction: `e.g. ${key}: 10.`,
          };
        }
      }
      return { valid: true };
    }
    case 'list_files': {
      return { valid: true };
    }
    case 'run_command': {
      const cmdErr = checkNonEmptyString('command');
      if (cmdErr) {
        return {
          valid: false,
          error: cmdErr,
          schema: `run_command({ command: string, timeoutMs?: number })`,
          correction: `Provide a valid command string to run, e.g. run_command({ "command": "npm test" }).`,
        };
      }
      return { valid: true };
    }
    case 'web_fetch': {
      const urlErr = checkNonEmptyString('url');
      if (urlErr) {
        return {
          valid: false,
          error: urlErr,
          schema: `web_fetch({ url: string, maxChars?: number, render?: boolean })`,
          correction: `Provide a valid http:// or https:// URL.`,
        };
      }
      return { valid: true };
    }
    case 'create_skill': {
      const nameErr = checkNonEmptyString('name');
      const instErr = checkNonEmptyString('instructions');
      if (nameErr || instErr) {
        return {
          valid: false,
          error: nameErr ?? instErr,
          schema: `create_skill({ name: string, description: string, instructions: string, global?: boolean })`,
          correction: `Provide a non-empty name, description, and instructions for the skill.`,
        };
      }
      return { valid: true };
    }
    case 'use_skill': {
      const nameErr = checkNonEmptyString('name');
      if (nameErr) {
        return {
          valid: false,
          error: nameErr,
          schema: `use_skill({ name: string })`,
          correction: `Provide the name of an existing skill to use.`,
        };
      }
      return { valid: true };
    }
    case 'browse': {
      const BROWSER_ACTIONS = ['navigate', 'back', 'forward', 'reload', 'screenshot', 'evidence', 'click', 'hover', 'scroll', 'type', 'fill', 'select', 'press', 'wait'] as const;
      const action = p['action'] === undefined ? (p['url'] !== undefined ? 'navigate' : 'screenshot') : String(p['action']);
      if (!BROWSER_ACTIONS.includes(action as (typeof BROWSER_ACTIONS)[number])) {
        return {
          valid: false,
          error: `Unknown browse action "${action}".`,
          schema: `browse({ action: string, url?: string, selector?: string, x?: number, y?: number, ... })`,
          correction: `Use one of: ${BROWSER_ACTIONS.join(', ')}.`,
        };
      }
      if (action === 'navigate') {
        const urlErr = checkNonEmptyString('url');
        if (urlErr) {
          return {
            valid: false,
            error: urlErr,
            schema: `browse({ action: "navigate", url: string })`,
            correction: `Provide the URL to navigate to, e.g. browse({ "action": "navigate", "url": "https://example.com" }).`,
          };
        }
      }
      if (action === 'type' || action === 'fill') {
        const textErr = checkNonEmptyString('text');
        if (textErr) {
          return {
            valid: false,
            error: textErr,
            schema: `browse({ action: "${action}", ${action === 'fill' ? 'selector: string, ' : ''}text: string })`,
            correction: `Provide the text to type as a non-empty string.`,
          };
        }
        if (action === 'fill') {
          const selErr = checkNonEmptyString('selector');
          if (selErr) {
            return {
              valid: false,
              error: selErr,
              schema: `browse({ action: "fill", selector: string, text: string })`,
              correction: `Provide the CSS selector of the field to fill.`,
            };
          }
        }
      }
      if (action === 'click' && p['selector'] === undefined) {
        const x = Number(p['x'] ?? Number.NaN);
        const y = Number(p['y'] ?? Number.NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return {
            valid: false,
            error: `browse click requires a "selector" or numeric "x" and "y".`,
            schema: `browse({ action: "click", selector?: string, x?: number, y?: number })`,
            correction: `Provide either a CSS selector or numeric coordinates.`,
          };
        }
      }
      return { valid: true };
    }
    case 'delegate': {
      const tasks = p['tasks'];
      if (Array.isArray(tasks)) {
        if (tasks.length === 0) {
          return {
            valid: false,
            error: `"tasks" array cannot be empty.`,
            schema: `delegate({ tasks: [{ agent: string, task: string }] })`,
            correction: `Provide at least one { agent, task } entry.`,
          };
        }
        for (const t of tasks) {
          const entry = (t ?? {}) as Record<string, unknown>;
          if (typeof entry['agent'] !== 'string' || !entry['agent'].trim() || typeof entry['task'] !== 'string' || !entry['task'].trim()) {
            return {
              valid: false,
              error: `Each delegate task needs non-empty string "agent" and "task" fields.`,
              schema: `delegate({ tasks: [{ agent: string, task: string }] })`,
              correction: `Provide a registered specialist agent name and a task description for every entry.`,
            };
          }
        }
        return { valid: true };
      }
      const agentErr = checkNonEmptyString('agent');
      const taskErr = checkNonEmptyString('task');
      if (agentErr || taskErr) {
        return {
          valid: false,
          error: agentErr ?? taskErr,
          schema: `delegate({ agent: string, task: string }) or delegate({ tasks: [{ agent: string, task: string }] })`,
          correction: `Provide a registered specialist agent name and a task description.`,
        };
      }
      return { valid: true };
    }
    case 'agent_status': {
      if (p['id'] !== undefined && typeof p['id'] !== 'string') {
        return {
          valid: false,
          error: `Parameter "id" must be a string when provided.`,
          schema: `agent_status({ id?: string })`,
          correction: `Provide a background agent job id string, or omit it to list all agents.`,
        };
      }
      return { valid: true };
    }
    case 'list_skills':
      return { valid: true };
    case 'lsp_diagnostics':
    case 'lsp_symbols': {
      const err = checkNonEmptyString('path');
      if (err) {
        return {
          valid: false,
          error: err,
          schema: `${tool}({ path: string })`,
          correction: `Provide a file path relative to the project root, e.g. ${tool}({ "path": "src/auth.ts" }).`,
        };
      }
      return { valid: true };
    }
    case 'lsp_definition':
    case 'lsp_references':
    case 'lsp_hover': {
      const pathErr = checkNonEmptyString('path');
      if (pathErr) {
        return {
          valid: false,
          error: pathErr,
          schema: `${tool}({ path: string, line: number, column: number })`,
          correction: `Provide a file path and a 1-based line/column position, e.g. ${tool}({ "path": "src/auth.ts", "line": 42, "column": 17 }).`,
        };
      }
      const line = Number(p['line']);
      const column = Number(p['column']);
      if (!Number.isInteger(line) || line < 1) {
        return {
          valid: false,
          error: `Missing or invalid "line" parameter (must be a positive integer).`,
          schema: `${tool}({ path: string, line: number, column: number })`,
          correction: `Provide the 1-based line number, e.g. ${tool}({ "path": "src/auth.ts", "line": 42, "column": 17 }).`,
        };
      }
      if (!Number.isInteger(column) || column < 1) {
        return {
          valid: false,
          error: `Missing or invalid "column" parameter (must be a positive integer).`,
          schema: `${tool}({ path: string, line: number, column: number })`,
          correction: `Provide the 1-based column number, e.g. ${tool}({ "path": "src/auth.ts", "line": 42, "column": 17 }).`,
        };
      }
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

export function formatToolValidationError(tool: string, params: unknown, validation: ToolValidationResult): string {
  return [
    `INVALID TOOL CALL`,
    `Tool: ${tool}`,
    `Problem: ${validation.error}`,
    `Required Schema:`,
    `  ${validation.schema ?? `${tool}({ ... })`}`,
    `Received:`,
    `  ${JSON.stringify(params)}`,
    validation.correction ? `Correction: ${validation.correction}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function toolReadFile(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const val = validateToolParams('read_file', params);
  if (!val.valid) return fail(formatToolValidationError('read_file', params, val));
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  try {
    const st = statSync(abs);
    if (st.isDirectory()) return fail(`read_file: ${rel} is a directory`);
    if (st.size > MAX_FILE_BYTES) return fail(`read_file: ${rel} is ${st.size} bytes (limit ${MAX_FILE_BYTES})`);
    const content = readFileSync(abs, 'utf8');
    const lines = content.split('\n');
    const rawOffset = Number(params['offset'] ?? 1);
    const rawLimit = Number(params['limit'] ?? 2000);
    const offset = Number.isFinite(rawOffset) ? Math.max(1, Math.floor(rawOffset)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(2000, Math.max(1, Math.floor(rawLimit))) : 2000;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
    const note = lines.length > offset - 1 + limit ? `\n[... ${lines.length - (offset - 1) - slice.length} more lines]` : '';
    // Character cap on top of the line cap: 2000 wide lines could still dump
    // hundreds of KB into model context. Keep the beginning (most informative)
    // and tell the model how to continue.
    const maxChars = Math.min(60_000, Math.max(4_000, Number(params['maxChars'] ?? MAX_READ_OUTPUT_CHARS)));
    let body = numbered + note;
    if (body.length > maxChars) {
      const cut = body.lastIndexOf('\n', maxChars);
      const kept = body.slice(0, cut > 0 ? cut : maxChars);
      const keptLines = kept.split('\n').length;
      body =
        kept +
        `\n[... output capped at ${maxChars} chars (file has ${content.length} chars, ${lines.length} lines). ` +
        `Read the rest with offset=${offset + keptLines - 1} or narrow with search_files.]`;
    }
    return { ok: true, output: body };
  } catch (err) {
    return fail(`read_file failed: ${(err as Error).message}`);
  }
}

/**
 * Rough bracket-balance scan (string/comment aware enough for a heuristic).
 * A large imbalance in a freshly written file is the signature of a model
 * hitting its own output limit mid-file — worth surfacing immediately.
 */
function bracketImbalance(content: string): { curly: number; paren: number; bracket: number } {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
  const count = (re: RegExp): number => (stripped.match(re) ?? []).length;
  return {
    curly: Math.abs(count(/\{/g) - count(/\}/g)),
    paren: Math.abs(count(/\(/g) - count(/\)/g)),
    bracket: Math.abs(count(/\[/g) - count(/\]/g)),
  };
}

export function toolWriteFile(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const rel = String(params['path'] ?? '');
  const content = params['content'];
  if (!rel) return fail('write_file: missing "path"');
  if (typeof content !== 'string') return fail('write_file: missing string "content"');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  try {
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    let output = `Wrote ${content.length} chars to ${rel}`;
    // Truncation guard: models with long outputs sometimes stop mid-file.
    // Surface the suspicion instead of letting broken code look "done".
    const imbalance = bracketImbalance(content);
    const total = imbalance.curly + imbalance.paren + imbalance.bracket;
    if (total >= 3 && content.length > 500) {
      output +=
        `\n[WARN] possible TRUNCATED write — unbalanced brackets: {${imbalance.curly}} (${imbalance.paren}) [${imbalance.bracket}]. ` +
        `Re-read the file tail and rewrite completely if it was cut off.`;
    }
    return {
      ok: true,
      output,
      filesTouched: [ctx.guard.toRelative(abs)],
      linesAdded: content.split('\n').length,
    };
  } catch (err) {
    return fail(`write_file failed: ${(err as Error).message}`);
  }
}

export function toolApplyEdit(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const rel = String(params['path'] ?? '');
  const oldStr = params['oldString'];
  const newStr = params['newString'];
  // Opt-in multi-site edit: without it a repeated pattern costs one turn per
  // occurrence and invites drift between near-identical hand edits.
  const replaceAll = params['replaceAll'] === true;
  if (!rel) return fail('apply_edit: missing "path"');
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
    return fail('apply_edit: "oldString" and "newString" must be strings');
  }
  if (oldStr === newStr) return fail('apply_edit: oldString and newString are identical');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  try {
    const content = readFileSync(abs, 'utf8');
    const count = content.split(oldStr).length - 1;
    if (!replaceAll && count > 1) return fail(`apply_edit: oldString matches ${count} locations in ${rel}; provide more context, or pass replaceAll:true to change every occurrence`);

    if (count >= 1) {
      // split/join instead of String.replace: the latter interprets $&, $`,
      // $', $$ sequences in newStr as replacement patterns, silently corrupting
      // files that legitimately contain them (shell scripts, regexes, prices).
      const updated = content.split(oldStr).join(newStr);
      writeFileSync(abs, updated, 'utf8');
      return editSuccess(ctx, abs, rel, newStr, oldStr, replaceAll ? ` (replaced ${count} occurrence${count === 1 ? '' : 's'})` : '');
    }

    // Exact match failed — retry line-ending-tolerantly. Models emit \n while
    // Windows files often use \r\n; without this fallback every such edit
    // fails until the loop detector blocks the whole task.
    const hadCRLF = /\r\n/.test(content);
    const normFile = content.replace(/\r\n/g, '\n');
    const normOld = oldStr.replace(/\r\n/g, '\n');
    const normNew = newStr.replace(/\r\n/g, '\n');
    const normCount = normFile.split(normOld).length - 1;
    if (normCount === 0) return fail(`apply_edit: oldString not found in ${rel}`);
    if (!replaceAll && normCount > 1) return fail(`apply_edit: oldString matches ${normCount} locations in ${rel}; provide more context, or pass replaceAll:true to change every occurrence`);
    const normUpdated = normFile.split(normOld).join(normNew);
    const finalContent = hadCRLF ? normUpdated.replace(/\n/g, '\r\n') : normUpdated;
    writeFileSync(abs, finalContent, 'utf8');
    return editSuccess(ctx, abs, rel, newStr, oldStr, replaceAll ? ` (replaced ${normCount} occurrence${normCount === 1 ? '' : 's'}, normalized line endings)` : ' (matched with normalized line endings)');
  } catch (err) {
    return fail(`apply_edit failed: ${(err as Error).message}`);
  }
}

function editSuccess(
  ctx: ToolContext,
  abs: string,
  rel: string,
  newStr: string,
  oldStr: string,
  note: string,
): ToolResult {
  const delta = newStr.split('\n').length - oldStr.split('\n').length;
  return {
    ok: true,
    output: `Edited ${rel}${note}`,
    filesTouched: [ctx.guard.toRelative(abs)],
    linesAdded: Math.max(newStr.split('\n').length, delta),
  };
}

export function toolListFiles(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const rel = String(params['path'] ?? '.');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const ignores = new Set(ctx.guard.lock.ignorePaths);
  const out: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || out.length >= MAX_LIST_ENTRIES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      if (out.length >= MAX_LIST_ENTRIES) return;
      if (ignores.has(name) || name.startsWith('.hermes')) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      const display = ctx.guard.toRelative(full);
      if (st.isDirectory()) {
        out.push(`${display}/`);
        walk(full, depth + 1);
      } else {
        out.push(display);
      }
    }
  };

  try {
    if (!statSync(abs).isDirectory()) return fail(`list_files: ${rel} is not a directory`);
    walk(abs, 0);
    return { ok: true, output: out.join('\n') || '(empty)' };
  } catch (err) {
    return fail(`list_files failed: ${(err as Error).message}`);
  }
}

/**
 * Language-agnostic repository search engine.
 *
 * Operates on raw file CONTENT — no per-language code paths. Literal and
 * regex modes both scan whole-file text, so patterns can match ACROSS lines
 * (`ActivityKind[\s\S]{0,300}`, dotall, embedded \n) in any language or an
 * unknown/custom one. Language-aware structural search stays the LSP layer's
 * job; this engine only reports whether it is in play (languageAware=false).
 */
export interface SearchOptions {
  pattern: string;
  mode?: 'literal' | 'regex';
  /** Subset of i, m, s (i = case-insensitive default). */
  flags?: string;
  path?: string;
  include?: string[];
  exclude?: string[];
  maxResults?: number;
  contextLines?: number;
}

// Glob with star / double-star / question-mark, matched against the
// repo-relative posix path. A pattern without a slash also matches the
// basename (so "*.py" hits src/x.py); a leading double-star segment makes
// the directory prefix optional (star-star-slash-star.py hits both util.py
// and vendor/x/util.py).
function globToRegExp(glob: string): RegExp {
  const esc = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    // Wildcard expansion first; the \u0000 placeholder is expanded LAST so
    // its own regex characters are never re-mangled by the steps above.
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:[^/]+/)*')
    .replace(/\u0001/g, '.*');
  const hasSlash = glob.includes('/');
  return new RegExp(hasSlash ? `^${esc}$` : `(^|/)${esc}$`, 'i');
}

function matchesAnyGlobs(rel: string, globs: string[]): boolean {
  const base = path.basename(rel);
  return globs.some((g) => {
    const re = globToRegExp(g);
    return re.test(rel) || (!g.includes('/') && re.test(base));
  });
}

/** Offset -> 1-based line number via the file's line-start table. */
function lineOf(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function toolSearchFiles(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const pattern = String(params['pattern'] ?? '');
  if (!pattern) return fail('search_files: missing "pattern"');
  const mode: 'literal' | 'regex' = params['mode'] === 'literal' ? 'literal' : 'regex';
  const flags = String(params['flags'] ?? 'i').replace(/[^ims]/g, '');
  if (String(params['flags'] ?? '').replace(/[ims]/g, '') !== '') {
    return fail('search_files: unsupported flags — only i (ignore case), m (multiline anchors), s (dotall) are supported');
  }
  const rel = String(params['path'] ?? '.');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const include = Array.isArray(params['include']) ? (params['include'] as unknown[]).map(String) : [];
  const exclude = Array.isArray(params['exclude']) ? (params['exclude'] as unknown[]).map(String) : [];
  const maxResults = Math.min(500, Math.max(1, Number(params['maxResults']) || MAX_SEARCH_MATCHES));
  const contextLines = Math.min(5, Math.max(0, Number(params['contextLines']) || 0));
  const maxFileSize = 256 * 1024;

  // Build the matcher once. Literal mode uses indexOf (no escaping traps);
  // regex mode compiles the user pattern with the requested flags.
  let find: (content: string) => { start: number; end: number }[];
  let crossLineCapable: boolean;
  if (mode === 'literal') {
    const needle = flags.includes('i') ? pattern.toLowerCase() : pattern;
    if (!needle) return fail('search_files: pattern is empty after normalization');
    crossLineCapable = needle.includes('\n');
    find = (content) => {
      const hay = flags.includes('i') ? content.toLowerCase() : content;
      const out: { start: number; end: number }[] = [];
      let at = hay.indexOf(needle);
      while (at >= 0 && out.length < maxResults) {
        out.push({ start: at, end: at + needle.length });
        at = hay.indexOf(needle, at + Math.max(1, needle.length));
      }
      return out;
    };
  } else {
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags + 'g');
    } catch (err) {
      return fail(`search_files: invalid regex: ${(err as Error).message}`);
    }
    crossLineCapable = flags.includes('s') || flags.includes('m') || /\\s|\\n|\[\s\S|\[\^[^\]]*\s/.test(pattern);
    find = (content) => {
      const out: { start: number; end: number }[] = [];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null && out.length < maxResults) {
        out.push({ start: m.index, end: m.index + m[0].length });
        if (m[0].length === 0) re.lastIndex += 1; // zero-width safety
      }
      return out;
    };
  }

  const ignores = new Set(ctx.guard.lock.ignorePaths);
  const lines: string[] = [];
  let filesHit = 0;
  let truncated = false;

  const walk = (dir: string, depth: number): void => {
    if (lines.length / Math.max(1, 1 + contextLines * 2) >= maxResults) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (depth > 8 || ignores.has(name) || name.startsWith('.')) continue;
        walk(full, depth + 1);
        continue;
      }
      if (st.size >= maxFileSize) continue;
      const relPath = ctx.guard.toRelative(full).replace(/\\/g, '/');
      if (include.length > 0 && !matchesAnyGlobs(relPath, include)) continue;
      if (exclude.length > 0 && matchesAnyGlobs(relPath, exclude)) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (content.includes('\0')) continue; // binary
      const found = find(content);
      if (found.length === 0) continue;
      filesHit += 1;
      // Line-start table once per matching file: whole-content search makes
      // cross-line matches first-class; offsets map back to line numbers.
      const lineStarts = [0];
      for (let i = 0; i < content.length; i++) if (content[i] === '\n') lineStarts.push(i + 1);
      const fileLines = content.split('\n');
      for (const hit of found) {
        if (lines.length / Math.max(1, 1 + contextLines * 2) >= maxResults) {
          truncated = true;
          break;
        }
        const lineNo = lineOf(lineStarts, hit.start);
        const spanLines = content.slice(hit.start, hit.end).split('\n').length;
        if (spanLines > 1) {
          // Multiline match: show the whole matched text with line breaks
          // made visible, so the agent sees what actually spanned lines.
          const excerpt = content.slice(hit.start, hit.end).replace(/\n/g, ' ⏎ ').replace(/\s+/g, ' ').trim().slice(0, 200);
          lines.push(`${relPath}:${lineNo}: ${excerpt}`);
        } else {
          lines.push(`${relPath}:${lineNo}: ${(fileLines[lineNo - 1] ?? '').trim().slice(0, 160)}`);
        }
        for (let c = Math.max(1, lineNo - contextLines); c <= Math.min(fileLines.length, lineNo + contextLines); c++) {
          if (c === lineNo) continue;
          lines.push(`    ${c}: ${(fileLines[c - 1] ?? '').trim().slice(0, 160)}`);
        }
      }
    }
  };

  walk(abs, 0);
  const capability =
    `[search mode=${mode} flags=${flags || 'none'} multiline=${crossLineCapable} files=${filesHit} ` +
    `matches=${lines.filter((l) => !l.startsWith('    ')).length} truncated=${truncated} languageAware=false]`;
  return { ok: true, output: lines.length ? `${lines.join('\n')}\n${capability}` : `(no matches)\n${capability}` };
}

function lspUnavailable(output: string): ToolResult {
  return fail(output);
}

export async function toolLspDiagnostics(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const val = validateToolParams('lsp_diagnostics', params);
  if (!val.valid) return fail(formatToolValidationError('lsp_diagnostics', params, val));
  if (!ctx.lsp) return lspUnavailable('lsp_diagnostics: no LSP layer available in this session. Use read_file/search_files instead.');
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const call = await ctx.lsp.diagnostics(ctx.guard.toRelative(abs));
  return call.ok ? { ok: true, output: call.output, payload: call.payload } : lspUnavailable(call.output);
}

export async function toolLspDefinition(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const val = validateToolParams('lsp_definition', params);
  if (!val.valid) return fail(formatToolValidationError('lsp_definition', params, val));
  if (!ctx.lsp) return lspUnavailable('lsp_definition: no LSP layer available in this session. Use search_files instead.');
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const call = await ctx.lsp.definition(ctx.guard.toRelative(abs), Number(params['line']), Number(params['column']));
  return call.ok ? { ok: true, output: call.output, payload: call.payload } : lspUnavailable(call.output);
}

export async function toolLspReferences(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const val = validateToolParams('lsp_references', params);
  if (!val.valid) return fail(formatToolValidationError('lsp_references', params, val));
  if (!ctx.lsp) return lspUnavailable('lsp_references: no LSP layer available in this session. Use search_files instead.');
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const call = await ctx.lsp.references(ctx.guard.toRelative(abs), Number(params['line']), Number(params['column']));
  return call.ok ? { ok: true, output: call.output, payload: call.payload } : lspUnavailable(call.output);
}

export async function toolLspHover(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const val = validateToolParams('lsp_hover', params);
  if (!val.valid) return fail(formatToolValidationError('lsp_hover', params, val));
  if (!ctx.lsp) return lspUnavailable('lsp_hover: no LSP layer available in this session. Use read_file instead.');
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const call = await ctx.lsp.hover(ctx.guard.toRelative(abs), Number(params['line']), Number(params['column']));
  return call.ok ? { ok: true, output: call.output, payload: call.payload } : lspUnavailable(call.output);
}

export async function toolLspSymbols(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const val = validateToolParams('lsp_symbols', params);
  if (!val.valid) return fail(formatToolValidationError('lsp_symbols', params, val));
  if (!ctx.lsp) return lspUnavailable('lsp_symbols: no LSP layer available in this session. Use read_file/search_files instead.');
  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  const call = await ctx.lsp.symbols(ctx.guard.toRelative(abs));
  return call.ok ? { ok: true, output: call.output, payload: call.payload } : lspUnavailable(call.output);
}

export function toolRunCommand(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const command = String(params['command'] ?? '');
  if (!command) return Promise.resolve(fail('run_command: missing "command"'));
  const rawTimeout = Number(params['timeoutMs'] ?? 120_000);
  // 10-minute ceiling: install-heavy builds and large test suites routinely
  // exceed the old 5-minute cap and died mid-verification.
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.min(600_000, rawTimeout) : 120_000;

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    const args = isWindows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    // POSIX: own process group so the whole tree can be signalled on timeout.
    const execOpts: ExecFileOptionsWithStringEncoding = {
      cwd: ctx.cwd,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    };
    if (!isWindows) (execOpts as { detached?: boolean }).detached = true;
    const child = execFile(shell, args, execOpts, (err, stdout, stderr) => {
        // Node kills only the DIRECT shell child on timeout. npm/node/etc.
        // spawn grandchildren that survive it — servers and watchers would
        // keep running (and holding ports/files) after the evidence was
        // recorded. Kill the full tree before resolving.
        if (err?.killed && child.pid) {
          try {
            if (isWindows) {
              execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10_000 });
            } else {
              try {
                process.kill(-child.pid, 'SIGKILL');
              } catch {
                child.kill('SIGKILL');
              }
            }
          } catch {
            /* best effort — the shell itself is already dead */
          }
        }
        let exitCode = 0;
        if (err) {
          const code = (err as { code?: unknown }).code;
          exitCode = typeof code === 'number' ? code : 1;
        }
        const body = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n');
        const output = excerpt(body || '(no output)', 4000);
        if (err) {
          const msg = err.killed ? ` (timeout after ${timeoutMs}ms; process tree terminated)` : '';
          resolve({
            ok: false,
            exitCode,
            output: `${output}\n[exit ${exitCode}${msg}]`,
            errorSignature: errorSignature(body || err.message),
          });
        } else {
          const stderrFailed = !stdout.trim() && stderr.trim().length > 0 && STDERR_FAIL_RE.test(stderr);
          if (stderrFailed) {
            resolve({
              ok: false,
              exitCode: 1,
              output: `${output}\n[exit 0 but stderr indicates failure]`,
              errorSignature: errorSignature(stderr),
            });
          } else {
            resolve({ ok: true, exitCode: 0, output: excerpt(body || '(ok)', 4000) });
          }
        }
      },
    );
  });
}
export function toolListSkills(ctx: ToolContext): ToolResult {
  if (!ctx.skills) return fail('skills not available');
  const skills = ctx.skills.list();
  if (skills.length === 0) return { ok: true, output: '(no skills yet)' };
  return { ok: true, output: skills.map((s) => `${s.name} — ${s.description} (${s.createdBy})`).join('\n') };
}

export function toolCreateSkill(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  if (!ctx.skills) return fail('skills not available');
  try {
    const global = params['global'] === true;
    const skill = ctx.skills.create({
      name: String(params['name'] ?? ''),
      description: String(params['description'] ?? ''),
      instructions: String(params['instructions'] ?? ''),
      createdBy: 'agent',
      scope: global ? 'global' : 'project',
    });
    return {
      ok: true,
      output: `Skill "${skill.name}" saved ${global ? 'GLOBALLY (available in every project)' : 'in this project'}. It will be available in future tasks.`,
    };
  } catch (err) {
    return fail(`create_skill failed: ${(err as Error).message}`);
  }
}

export function toolUseSkill(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  if (!ctx.skills) return fail('skills not available');
  const skill = ctx.skills.get(String(params['name'] ?? ''));
  if (!skill) return fail(`Unknown skill: ${params['name']}. Use list_skills to see existing ones, or create it yourself with create_skill (research with web_fetch first if needed).`);
  return { ok: true, output: `SKILL ${skill.name}: ${skill.description}\n${skill.instructions}` };
}

export async function toolWebFetch(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const url = String(params['url'] ?? '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return fail('web_fetch: url must start with http(s)://');
  }
  const maxChars = Math.min(12000, Number.isFinite(Number(params['maxChars'])) ? Number(params['maxChars']) : 6000);
  // render:true loads the URL in the in-app browser and returns the RENDERED
  // DOM text — the only way to see JS-built pages (SPAs) that static fetch
  // cannot. The session's previous page is restored afterwards.
  if (params['render'] === true) {
    const bridge = ctx.browser;
    if (!bridge || !bridge.available()) {
      return fail('web_fetch render:true needs the in-app browser (desktop app). Use plain web_fetch or browse instead.');
    }
    try {
      const prevUrl = bridge.state().url;
      await bridge.navigate(url);
      const shot = await bridge.screenshot();
      let text = (shot.textDigest ?? '').replace(/\s+/g, ' ').trim();
      if (!prevUrl || bridge.state().url !== prevUrl) {
        await bridge.navigate(prevUrl || 'about:blank').catch(() => {});
      }
      if (!text) return fail(`web_fetch render: ${url} produced no readable text`);
      return { ok: true, output: excerpt(text, maxChars) };
    } catch (err) {
      return fail(`web_fetch render failed: ${(err as Error).message}`);
    }
  }
  const timeoutMs = 20_000;
  const maxBodyBytes = 2_000_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
  return fetch(url, { headers: { 'user-agent': 'hermes-agent/0.1' }, redirect: 'follow', signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) return fail(`web_fetch: HTTP ${res.status} for ${url}`);
      const type = res.headers.get('content-type') ?? '';
      let text = '';
      // Stream with a byte cap so a huge or lying Content-Length response can
      // never exhaust memory; only the first maxBodyBytes is ever buffered.
      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          text += decoder.decode(value, { stream: true });
          if (received >= maxBodyBytes) {
            void reader.cancel().catch(() => {});
            break;
          }
        }
        text += decoder.decode();
      }
      if (type.includes('html')) {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;|&quot;/g, '"');
      }
      text = text.replace(/\s+/g, ' ').trim();
      return { ok: true, output: excerpt(text || '(empty page)', maxChars) };
    })
    .catch((err) => fail(`web_fetch failed: ${(err as Error).message}`))
    .finally(() => clearTimeout(timer));
}

/**
 * Render page facts captured alongside a screenshot into bounded tool output.
 * Gives text-only models (and lazy vision models) real grounding: whether the
 * console is clean, what the page actually says, and if loading had finished.
 */
export function formatPageDiagnostics(shot: { consoleErrors?: string[]; textDigest?: string; loadIncomplete?: boolean }): string {
  const parts: string[] = [];
  if (Array.isArray(shot.consoleErrors)) {
    const errors = shot.consoleErrors.filter(Boolean).slice(-8);
    parts.push(
      errors.length > 0
        ? `CONSOLE PROBLEMS (${errors.length}):\n${errors.map((e) => `  - ${e.slice(0, 220)}`).join('\n')}`
        : 'CONSOLE PROBLEMS: none',
    );
  }
  if (shot.loadIncomplete) parts.push('PAGE LOAD: incomplete — the document was still loading; wait and screenshot again before judging the render');
  const text = (shot.textDigest ?? '').trim();
  if (text) parts.push(`PAGE TEXT (digest):\n${text.slice(0, 1200)}`);
  return parts.join('\n');
}

export async function toolBrowse(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.browser || !ctx.browser.available()) {
    return fail('browse: no in-app browser connected (run the desktop app: npm run app)');
  }
  const action = String(params['action'] ?? (params['url'] ? 'navigate' : 'screenshot'));
  try {
    switch (action) {
      case 'navigate': {
        const url = normalizeUrl(String(params['url'] ?? ''));
        const st = await ctx.browser.navigate(url);
        // Non-visual evidence rides along with every navigation when the
        // bridge supports page probes — the default "look", cheaper than vision.
        const evidence = await collectBrowserEvidence(ctx.browser).catch(() => undefined);
        return {
          ok: true,
          output: `navigated to ${st.url} — "${st.title}"${evidence && evidence.collected ? `\n${formatBrowserEvidence(evidence)}` : ''}`,
        };
      }
      case 'evidence': {
        // Structured non-visual verification pass: DOM, accessibility,
        // layout, styles, console — no screenshot. With "viewports", the
        // page is re-probed at each size (mobile/tablet/desktop or WxH) for
        // responsive verification. The escalation to a screenshot is for
        // genuinely visual criteria only.
        const viewports = resolveViewports(params['viewports']);
        if (viewports && viewports.length > 1) {
          const responsive = await collectViewportEvidence(ctx.browser, viewports);
          return { ok: true, output: formatResponsiveEvidence(responsive) };
        }
        const evidence = await collectBrowserEvidence(ctx.browser);
        return { ok: true, output: formatBrowserEvidence(evidence) };
      }
      case 'back': {
        const st = await ctx.browser.back();
        return { ok: true, output: `back to ${st.url} — "${st.title}"` };
      }
      case 'forward': {
        const st = await ctx.browser.forward();
        return { ok: true, output: `forward to ${st.url} — "${st.title}"` };
      }
      case 'reload': {
        const st = await ctx.browser.reload();
        return { ok: true, output: `reloaded ${st.url} — "${st.title}"` };
      }
      case 'click': {
        const selector = typeof params['selector'] === 'string' && params['selector'] ? String(params['selector']) : undefined;
        if (selector) {
          if (!ctx.browser.clickSelector) return fail('browse click by selector is not supported by this browser');
          const st = await ctx.browser.clickSelector(selector);
          return { ok: true, output: `clicked element "${selector}" on ${st.url}` };
        }
        const x = Number(params['x'] ?? 0);
        const y = Number(params['y'] ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('browse click: x and y must be numbers (or use "selector")');
        const st = await ctx.browser.click(x, y);
        return { ok: true, output: `clicked (${x}, ${y}) on ${st.url}` };
      }
      case 'hover': {
        if (!ctx.browser.hover) return fail('browse hover is not supported by this browser');
        const st = await ctx.browser.hover(Number(params['x'] ?? 0), Number(params['y'] ?? 0));
        return { ok: true, output: `hovered (${params['x']}, ${params['y']}) on ${st.url}` };
      }
      case 'scroll': {
        if (!ctx.browser.scroll) return fail('browse scroll is not supported by this browser');
        const st = await ctx.browser.scroll(Number(params['x'] ?? 640), Number(params['y'] ?? 450), Number(params['deltaY'] ?? 300));
        return { ok: true, output: `scrolled ${Number(params['deltaY'] ?? 300)}px on ${st.url}` };
      }
      case 'fill': {
        if (!ctx.browser.fill) return fail('browse fill is not supported by this browser');
        const sel = String(params['selector'] ?? '');
        if (!sel) return fail('browse fill: "selector" is required');
        const st = await ctx.browser.fill(sel, String(params['text'] ?? ''));
        return { ok: true, output: `filled "${sel}" with ${String(params['text'] ?? '').length} character(s) on ${st.url}` };
      }
      case 'select': {
        if (!ctx.browser.select) return fail('browse select is not supported by this browser');
        const st = await ctx.browser.select(String(params['selector'] ?? ''), String(params['value'] ?? ''));
        return { ok: true, output: `selected "${params['value']}" in "${params['selector']}" on ${st.url}` };
      }
      case 'press': {
        if (!ctx.browser.press) return fail('browse press is not supported by this browser');
        const st = await ctx.browser.press(String(params['key'] ?? 'Enter'));
        return { ok: true, output: `pressed key "${params['key'] ?? 'Enter'}" on ${st.url}` };
      }
      case 'wait': {
        if (!ctx.browser.wait) return fail('browse wait is not supported by this browser');
        const rawMs = Number(params['ms'] ?? 1000);
        const ms = Number.isFinite(rawMs) ? Math.min(10000, Math.max(0, rawMs)) : 1000;
        const st = await ctx.browser.wait(ms);
        return { ok: true, output: `waited ${ms}ms on ${st.url}` };
      }
      case 'type': {
        const text = String(params['text'] ?? '');
        if (!text) return fail('browse type: "text" is required');
        const st = await ctx.browser.type(text);
        return { ok: true, output: `typed ${text.length} character(s) on ${st.url}` };
      }
      case 'screenshot': {
        const shot = await ctx.browser.screenshot();
        if (!shot.pngBase64) return fail('browse: screenshot was empty — the browser surface is not ready yet');
        const mime = shot.mime ?? 'image/png';
        const ext = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/webp' ? 'webp' : 'png';
        const diagnostics = formatPageDiagnostics(shot);
        return {
          ok: true,
          output:
            `screenshot of ${shot.state.url} — "${shot.state.title}" (${Math.round((shot.pngBase64.length * 3) / 4 / 1024)} KB ${ext} attached)` +
            (diagnostics ? `\n${diagnostics}` : ''),
          image: `data:${mime};base64,${shot.pngBase64}`,
        };
      }
      default:
        return fail(`browse: unknown action "${action}" (navigate|screenshot|back|forward|reload|click|hover|scroll|type|fill|select|press|wait)`);
    }
  } catch (err) {
    return fail(`browse failed: ${(err as Error).message}`);
  }
}

export async function toolDelegate(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  let specs: DelegateSpec[] = [];
  const parseResume = (raw: unknown): DelegateSpec['resume'] | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const jobId = String((raw as Record<string, unknown>)['jobId'] ?? '').trim();
    if (!jobId) return undefined;
    return { jobId, note: typeof (raw as Record<string, unknown>)['note'] === 'string' ? String((raw as Record<string, unknown>)['note']) : undefined };
  };
  if (Array.isArray(params['tasks'])) {
    specs = (params['tasks'] as Record<string, unknown>[])
      .map((t) => ({
        agent: String(t['agent'] ?? ''),
        task: String(t['task'] ?? ''),
        criteria: Array.isArray(t['criteria']) ? (t['criteria'] as DelegateSpec['criteria']) : undefined,
        resume: parseResume(t['resume']),
      }))
      .filter((t) => t.agent && t.task);
  } else if (params['agent'] && params['task']) {
    specs = [{
      agent: String(params['agent']),
      task: String(params['task']),
      criteria: Array.isArray(params['criteria']) ? (params['criteria'] as DelegateSpec['criteria']) : undefined,
      resume: parseResume(params['resume']),
    }];
  }
  if (specs.length === 0) return fail('delegate: provide {"tasks":[{"agent":"name","task":"..."}]} — or resume a paused attempt with "resume":{"jobId":"sub-…"}');
  if (specs.length > 4) specs = specs.slice(0, 4);
  if (params['background'] === true) {
    if (!ctx.delegateBackground) return fail('delegate: no specialist agents configured — create them in Settings → Agents');
    const jobs = ctx.delegateBackground(specs);
    return {
      ok: true,
      output:
        `Started ${jobs.length} background agent(s). Continue independent work, then call agent_status before relying on their results.\n` +
        jobs.map((job) => `[${job.id}] ${job.agent} — ${job.status}`).join('\n'),
    };
  }
  if (!ctx.delegate) return fail('delegate: no specialist agents configured — create them in Settings → Agents');
  const results = await ctx.delegate(specs);
  const output = results.map((r) => `[${r.agent}] ${r.ok ? 'OK' : 'FAILED'} — task: ${r.task.slice(0, 120)}\n${r.summary}`).join('\n\n');
  return { ok: results.every((r) => r.ok), output: output.slice(0, 6000), payload: { results } };
}

export function toolAgentStatus(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  if (!ctx.backgroundAgentStatus) return fail('agent_status: no specialist agents configured — create them in Settings → Agents');
  const id = typeof params['id'] === 'string' && params['id'] ? params['id'] : undefined;
  const jobs = ctx.backgroundAgentStatus(id ? [id] : undefined);
  if (jobs.length === 0) return { ok: true, output: id ? `No background agent found for ${id}.` : 'No background agents have been started.' };
  return {
    ok: true,
    output: jobs
      .map((job) => {
        const detail = job.summary ? `\n${job.summary.slice(0, 1200)}` : '';
        return `[${job.status.toUpperCase()}] ${job.agent} (${job.id}) — ${job.task.slice(0, 160)}${detail}`;
      })
      .join('\n\n'),
  };
}

export const TOOL_NAMES = ['read_file', 'write_file', 'apply_edit', 'list_files', 'search_files', 'run_command', 'web_fetch', 'browse', 'delegate', 'agent_status', 'lsp_diagnostics', 'lsp_definition', 'lsp_references', 'lsp_hover', 'lsp_symbols'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
