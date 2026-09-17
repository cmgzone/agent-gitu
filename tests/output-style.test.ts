import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryStore } from '../src/memory/memory-store.js';
import { applyOutputHygiene, loadOutputStyle, styleFilePath } from '../src/agent/output-style.js';

/** Repository root, derived from this file so the wiring scan is cwd-independent. */
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const homes: string[] = [];
const projects: string[] = [];
function freshHome(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-style-'));
  process.env['AGENT_GITU_HOME'] = root;
  homes.push(root);
  return root;
}
function freshProject(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gitu-style-project-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'style-contract-project' }));
  projects.push(dir);
  return dir;
}
afterEach(() => {
  for (const home of homes) {
    try { rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  homes.length = 0;
  for (const dir of projects) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  projects.length = 0;
  delete process.env['AGENT_GITU_HOME'];
});

describe('STYLE.md contract', () => {
  it('writes the default contract on first use and honors user edits', () => {
    const home = freshHome();
    expect(loadOutputStyle()).toContain('Never use decorative horizontal separator lines');
    expect(readFileSync(styleFilePath(), 'utf8')).toContain('## Headings');
    const file = styleFilePath();
    const custom = '# House voice\n\nAnswer in bullets only.\n';
    // loadOutputStyle reads through the env-pinned home on every call.
    writeFileSync(file, custom);
    expect(loadOutputStyle()).toBe(custom.trim());
  });
});

describe('applyOutputHygiene', () => {
  it('converts rule-wrapped headings into Markdown headings', () => {
    const input = ['--------------------', 'CATEGORY', '--------------------', '', 'Body text.'].join('\n');
    expect(applyOutputHygiene(input)).toBe('## CATEGORY\n\nBody text.');
  });

  it('removes bare decorative rules and collapses leftover gaps', () => {
    const input = 'Intro.\n\n=====\n\n## Findings\n\n- one\n- two\n\n*****\n\nEnd.';
    expect(applyOutputHygiene(input)).toBe('Intro.\n\n## Findings\n\n- one\n- two\n\nEnd.');
  });

  it('strips separator status ladders but keeps the named results', () => {
    const input = 'TYPECHECK ---- PASS\nTESTS ------- PASS';
    const cleaned = applyOutputHygiene(input);
    expect(cleaned).toBe('TYPECHECK — PASS\nTESTS — PASS');
  });

  it('never touches content inside fenced code blocks', () => {
    const input = '## Plan\n\n```text\n---- keep ----\nSIGN ---- PASS\n```\n\n--------------------\nCATEGORY\n--------------------';
    expect(applyOutputHygiene(input)).toContain('---- keep ----');
    expect(applyOutputHygiene(input)).not.toContain('----\nCATEGORY');
  });

  it('preserves Markdown tables and underline-style emphasis', () => {
    const input = '| a | b |\n|---|---|\n| 1 | 2 |\n\nsnake_case_table stays intact.';
    const cleaned = applyOutputHygiene(input);
    expect(cleaned).toContain('| a | b |');
    expect(cleaned).toContain('| 1 | 2 |');
    expect(cleaned).toContain('|---|---|');
    expect(cleaned).toContain('snake_case_table');
  });

  it('leaves short emphasis runs and hyphenated words alone', () => {
    const input = 'This is **bold** — and re-installed, co-op, x-axis.';
    expect(applyOutputHygiene(input)).toBe(input);
  });
});

describe('artifact content is never rewritten', () => {
  it('"---" inside frontmatter-like fenced/artifact content remains untouched', () => {
    const artifact = ['---', 'title: Example', 'owner: docs', '---', '', 'Body.', '', '***', '', '---- report ----'].join('\n');
    for (const fence of ['```', '~~~']) {
      const reply = ['Here is `docs/example.md`:', '', `${fence}md`, artifact, fence, '', 'Nothing else changed.'].join('\n');
      expect(applyOutputHygiene(reply)).toBe(reply);
    }
  });

  it('leaves fenced diffs, patches and tool transcripts verbatim', () => {
    const transcript = [
      '```diff',
      '--- a/docs/example.md',
      '+++ b/docs/example.md',
      '@@ -1,3 +1,4 @@',
      '+---',
      '+title: Example',
      '+*****',
      '```',
    ].join('\n');
    expect(applyOutputHygiene(transcript)).toBe(transcript);
  });

  it('runs only at the final reply boundary, never over artifacts or tool output', () => {
    const consumers = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && readFileSync(full, 'utf8').includes('applyOutputHygiene(')) {
          consumers.add(path.relative(repoRoot, full).split(path.sep).join('/'));
        }
      }
    };
    walk(path.join(repoRoot, 'src'));
    // output-style.ts defines the sanitizer; gitu.ts applies it to the reply that
    // reaches the user. A consumer inside a file writer, patch renderer or tool
    // result path would silently rewrite artifacts the user asked for verbatim.
    expect([...consumers].sort()).toEqual(['src/agent/gitu.ts', 'src/agent/output-style.ts']);
  });
});

describe('custom STYLE.md survival', () => {
  it('survives a restart and is not overwritten by the default contract', async () => {
    freshHome();
    // First use seeds STYLE.md with the default contract.
    expect(loadOutputStyle()).toContain('Never use decorative horizontal separator lines');
    const file = styleFilePath();
    expect(readFileSync(file, 'utf8')).toContain('## Headings');
    const custom = '# House voice\n\nAnswer in bullets only. Never decorate.\n';
    writeFileSync(file, custom);

    // A restart starts a fresh module registry but must read the same home.
    vi.resetModules();
    const restarted = await import('../src/agent/output-style.js');
    expect(restarted.styleFilePath()).toBe(file);
    expect(restarted.loadOutputStyle()).toBe(custom.trim());
    // Later turns and later restarts must never rewrite the user's file.
    expect(restarted.loadOutputStyle()).toBe(custom.trim());
    expect(readFileSync(file, 'utf8')).toBe(custom);
    expect(readFileSync(file, 'utf8')).not.toContain('Never use decorative horizontal separator lines');
  });

  it('carries the customized contract into the orchestrator prompt after restart', async () => {
    freshHome();
    const custom = '# House voice\n\nAnswer in bullets only.\n';
    writeFileSync(styleFilePath(), custom);
    vi.resetModules();
    const [{ ProjectGuard }, { buildSystemPrompt }] = await Promise.all([
      import('../src/guard/project-guard.js'),
      import('../src/agent/prompt.js'),
    ]);
    const memory = { renderForPrompt: () => '' } as unknown as MemoryStore;
    const prompt = buildSystemPrompt(ProjectGuard.detect(freshProject()), memory, {});
    expect(prompt).toContain('OUTPUT STYLE');
    expect(prompt).toContain('House voice');
    expect(prompt).not.toContain('Never use decorative horizontal separator lines');
  });
});
