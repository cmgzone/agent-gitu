import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { McpManager } from '../mcp/client.js';
import type { SkillStore } from '../skills/skills.js';
import type { ToolResult } from '../types.js';
import { errorSignature, excerpt } from '../util.js';
import { normalizeUrl, type BrowserBridge } from '../browser/browser.js';

export interface ToolContext {
  guard: ProjectGuard;
  cwd: string;
  skills?: SkillStore;
  mcp?: McpManager;
  browser?: BrowserBridge;
  delegate?: DelegateFn;
}

export type DelegateFn = (specs: { agent: string; task: string }[]) => Promise<{ agent: string; task: string; ok: boolean; summary: string }[]>;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_LIST_ENTRIES = 400;
const MAX_SEARCH_MATCHES = 60;

const STDERR_FAIL_RE =
  /(is not recognized as|not recognized as the name of|CommandNotFoundException|ItemNotFoundException|The term ['"].*['"] is not recognized|No such file or directory|Permission denied|Access is denied|cannot find path)/i;

function fail(output: string): ToolResult {
  return { ok: false, output, errorSignature: errorSignature(output) };
}

export function toolReadFile(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const rel = String(params['path'] ?? '');
  if (!rel) return fail('read_file: missing "path"');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  try {
    const st = statSync(abs);
    if (st.isDirectory()) return fail(`read_file: ${rel} is a directory`);
    if (st.size > MAX_FILE_BYTES) return fail(`read_file: ${rel} is ${st.size} bytes (limit ${MAX_FILE_BYTES})`);
    const content = readFileSync(abs, 'utf8');
    const lines = content.split('\n');
    const offset = Math.max(1, Number(params['offset'] ?? 1));
    const limit = Math.min(2000, Number(params['limit'] ?? 2000));
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
    const note = lines.length > offset - 1 + limit ? `\n[... ${lines.length - (offset - 1) - slice.length} more lines]` : '';
    return { ok: true, output: numbered + note };
  } catch (err) {
    return fail(`read_file failed: ${(err as Error).message}`);
  }
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
    return {
      ok: true,
      output: `Wrote ${content.length} chars to ${rel}`,
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
    if (count === 0) return fail(`apply_edit: oldString not found in ${rel}`);
    if (count > 1) return fail(`apply_edit: oldString matches ${count} locations in ${rel}; provide more context`);
    const updated = content.replace(oldStr, newStr);
    writeFileSync(abs, updated, 'utf8');
    const delta = newStr.split('\n').length - oldStr.split('\n').length;
    return {
      ok: true,
      output: `Edited ${rel}`,
      filesTouched: [ctx.guard.toRelative(abs)],
      linesAdded: Math.max(newStr.split('\n').length, delta),
    };
  } catch (err) {
    return fail(`apply_edit failed: ${(err as Error).message}`);
  }
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

export function toolSearchFiles(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  const pattern = String(params['pattern'] ?? '');
  if (!pattern) return fail('search_files: missing "pattern"');
  const rel = String(params['path'] ?? '.');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch (err) {
    return fail(`search_files: invalid regex: ${(err as Error).message}`);
  }
  const ignores = new Set(ctx.guard.lock.ignorePaths);
  const matches: string[] = [];
  const maxFileSize = 256 * 1024;

  const walk = (dir: string, depth: number): void => {
    if (depth > 8 || matches.length >= MAX_SEARCH_MATCHES) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (matches.length >= MAX_SEARCH_MATCHES) return;
      if (ignores.has(name) || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else if (st.size < maxFileSize) {
        try {
          const content = readFileSync(full, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length && matches.length < MAX_SEARCH_MATCHES; i++) {
            if (re.test(lines[i]!)) {
              matches.push(`${ctx.guard.toRelative(full)}:${i + 1}: ${lines[i]!.trim().slice(0, 160)}`);
            }
          }
        } catch {
          /* binary or unreadable */
        }
      }
    }
  };

  walk(abs, 0);
  return { ok: true, output: matches.join('\n') || '(no matches)' };
}

export function toolRunCommand(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const command = String(params['command'] ?? '');
  if (!command) return Promise.resolve(fail('run_command: missing "command"'));
  const rawTimeout = Number(params['timeoutMs'] ?? 120_000);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? Math.min(300_000, rawTimeout) : 120_000;

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    const args = isWindows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    execFile(
      shell,
      args,
      { cwd: ctx.cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        let exitCode = 0;
        if (err) {
          const code = (err as { code?: unknown }).code;
          exitCode = typeof code === 'number' ? code : 1;
        }
        const body = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n');
        const output = excerpt(body || '(no output)', 4000);
        if (err) {
          const msg = err.killed ? ` (timeout after ${timeoutMs}ms)` : '';
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
    const skill = ctx.skills.create({
      name: String(params['name'] ?? ''),
      description: String(params['description'] ?? ''),
      instructions: String(params['instructions'] ?? ''),
      createdBy: 'agent',
    });
    return { ok: true, output: `Skill "${skill.name}" saved. It will be available in all future tasks.` };
  } catch (err) {
    return fail(`create_skill failed: ${(err as Error).message}`);
  }
}

export function toolUseSkill(ctx: ToolContext, params: Record<string, unknown>): ToolResult {
  if (!ctx.skills) return fail('skills not available');
  const skill = ctx.skills.get(String(params['name'] ?? ''));
  if (!skill) return fail(`Unknown skill: ${params['name']}. Use list_skills.`);
  return { ok: true, output: `SKILL ${skill.name}: ${skill.description}\n${skill.instructions}` };
}

export function toolWebFetch(_ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const url = String(params['url'] ?? '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return Promise.resolve(fail('web_fetch: url must start with http(s)://'));
  }
  const maxChars = Math.min(12000, Number(params['maxChars'] ?? 6000));
  return fetch(url, { headers: { 'user-agent': 'hermes-agent/0.1' }, redirect: 'follow' })
    .then(async (res) => {
      if (!res.ok) return fail(`web_fetch: HTTP ${res.status} for ${url}`);
      const type = res.headers.get('content-type') ?? '';
      let text = await res.text();
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
    .catch((err) => fail(`web_fetch failed: ${(err as Error).message}`));
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
        return { ok: true, output: `navigated to ${st.url} — "${st.title}"` };
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
        const st = await ctx.browser.wait(Number(params['ms'] ?? 1000));
        return { ok: true, output: `waited ${Math.min(10000, Number(params['ms'] ?? 1000))}ms on ${st.url}` };
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
        return {
          ok: true,
          output: `screenshot of ${shot.state.url} — "${shot.state.title}" (${Math.round((shot.pngBase64.length * 3) / 4 / 1024)} KB png attached)`,
          image: `data:image/png;base64,${shot.pngBase64}`,
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
  if (!ctx.delegate) return fail('delegate: no specialist agents configured — create them in Settings → Agents');
  let specs: { agent: string; task: string }[] = [];
  if (Array.isArray(params['tasks'])) {
    specs = (params['tasks'] as Record<string, unknown>[])
      .map((t) => ({ agent: String(t['agent'] ?? ''), task: String(t['task'] ?? '') }))
      .filter((t) => t.agent && t.task);
  } else if (params['agent'] && params['task']) {
    specs = [{ agent: String(params['agent']), task: String(params['task']) }];
  }
  if (specs.length === 0) return fail('delegate: provide {"tasks":[{"agent":"name","task":"..."}]}');
  if (specs.length > 4) specs = specs.slice(0, 4);
  const results = await ctx.delegate(specs);
  const output = results.map((r) => `[${r.agent}] ${r.ok ? 'OK' : 'FAILED'} — task: ${r.task.slice(0, 120)}\n${r.summary}`).join('\n\n');
  return { ok: results.every((r) => r.ok), output: output.slice(0, 6000) };
}

export const TOOL_NAMES = ['read_file', 'write_file', 'apply_edit', 'list_files', 'search_files', 'run_command', 'web_fetch', 'browse', 'delegate'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
