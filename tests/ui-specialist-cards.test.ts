import { afterAll, describe, expect, it } from 'vitest';
import { HermesServer } from '../src/server/server.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';

// Pull the shipped regex out of the built UI so these tests validate the
// real artifact, not a copy of it.
function shippedLifecycle(): RegExp {
  const m = /var SPEC_LIFECYCLE = \/(.+?)\/[a-z]*;/.exec(UI_HTML);
  expect(m, 'SPEC_LIFECYCLE regex must exist in the UI bundle').toBeTruthy();
  return new RegExp(m![1]!);
}

describe('UI — specialist cards', () => {
  it('ships the nested timeline group styles and appendEvent hooks', () => {
    // Specialists render as a nested timeline group with its own left border
    // rule (not a bordered card): inline header row + narration rail below.
    expect(UI_HTML).toContain('.tl-sub-row');
    expect(UI_HTML).toContain('.tl-sub-rail');
    expect(UI_HTML).toContain('.tl-sub-head');
    expect(UI_HTML).toContain('.spec-tag');
    expect(UI_HTML).toContain('upsertSpecialistCard(runId, insert, mSpec[1], mSpec[2], mSpec[3], mSpec[4])');
    expect(UI_HTML).toContain('attachSpecialistActivity(runId, text)');
    // The old pile-of-lines fallback stays only as a last-resort branch.
    expect(UI_HTML).toContain("tag === 'subagent'");
  });

  it('never reuses the global .working indicator class on specialist groups', () => {
    // Regression: `.working` is the global thinking-indicator class
    // (display:flex row). Adding it to a group flattens it into a row.
    expect(UI_HTML).toContain("specSetStatus(st, 'working')");
    expect(UI_HTML).not.toContain("st.el.classList.add('working')");
    expect(UI_HTML).not.toContain("card.classList.add('working')");
    expect(UI_HTML).not.toContain("group.classList.add('working')");
    expect(UI_HTML).not.toContain('spec-sweep');
  });

  it('lifecycle regex parses every real subagent emit format', () => {
    const re = shippedLifecycle();

    const queued = re.exec('subagent scout [queued] sub-mt2iszw9-1 — inspect the auth module for race conditions');
    expect(queued).toBeTruthy();
    expect(queued![1]).toBe('scout');
    expect(queued![2]).toBe('queued');
    expect(queued![3]).toBe('sub-mt2iszw9-1');
    expect(queued![4]).toBe('inspect the auth module for race conditions');

    const started = re.exec('subagent digger [running] sub-abc123-2 — started');
    expect(started![2]).toBe('running');
    expect(started![4]).toBe('started');

    const turn = re.exec('subagent digger [running] sub-abc123-2 — turn 7/30');
    expect(turn![2]).toBe('running');
    expect(turn![4]).toBe('turn 7/30');

    const done = re.exec('subagent worker [completed] sub-def456-3 — implemented the parser and verified with npm test');
    expect(done![2]).toBe('completed');
    expect(done![4]).toContain('implemented the parser');

    const failed = re.exec('subagent worker [failed] sub-def456-3 — Specialist crashed before returning a structured result: EPERM');
    expect(failed![2]).toBe('failed');

    const cancelled = re.exec('subagent worker [cancelled] sub-def456-3 — stopped');
    expect(cancelled![2]).toBe('cancelled');
  });

  it('activity emits never match the lifecycle form (they attach to the existing card instead)', () => {
    const re = shippedLifecycle();
    const activity = [
      'subagent scout: ok       read src/auth.ts (12ms)',
      'subagent scout evidence ev-20260821-a1b2c3 PASS (test)',
      'subagent scout claim ac-1 <- ev-20260821-a1b2c3: accepted',
      'subagent scout — completion rejected by evidence gate (0/1 criteria satisfied)',
      'subagent scout — loop/stagnation detected, stopping early',
      'subagent scout — malformed call streak 3 — strategy change injected',
      'subagent scout progress detected — dynamically extending budget to turn 30/100',
      'subagent scout isolated in git worktree C:\\tmp\\wt (branch hermes/task-1)',
      'subagent scout produced no changes — nothing to merge',
      'subagent scout — merged cleanly into the main working tree',
      'subagent scout — merge conflict, changes NOT merged',
    ];
    for (const line of activity) {
      expect(re.exec(line), 'must NOT be treated as lifecycle: ' + line).toBeNull();
      expect(line.startsWith('subagent ')).toBe(true);
    }
  });

  it('chat sessions still suppress subagent events entirely', () => {
    // The chatish early-return filter must keep listing subagent lines,
    // otherwise quiet chat sessions would grow specialist cards.
    expect(/text\.indexOf\('subagent '\) === 0/.test(UI_HTML)).toBe(true);
  });
});

describe('UI — intake metadata silver line', () => {
  function shippedIntakeTags(): Record<string, number> {
    const m = /var INTAKE_TAGS = \{([^}]+)\}/.exec(UI_HTML);
    expect(m, 'INTAKE_TAGS map must exist in the UI bundle').toBeTruthy();
    const out: Record<string, number> = {};
    for (const [, k] of m![1]!.matchAll(/(\w+):\s*1/g)) out[k] = 1;
    return out;
  }

  it('groups exactly the resume-burst tags into one silver line', () => {
    expect(Object.keys(shippedIntakeTags()).sort()).toEqual(
      ['branch', 'context', 'criteria', 'effort', 'ledger', 'project', 'risk', 'skill'],
    );
  });

  it('never groups agent output or errors', () => {
    const tags = shippedIntakeTags();
    for (const loud of ['fatal', 'error', 'blocked', 'denied', 'done', 'plan', 'evidence', 'say', 'run']) {
      expect(tags[loud], `${loud} must stay prominent in the stream`).toBeUndefined();
    }
  });

  it('is a per-stream singleton: retries adopt the existing line instead of stacking one', () => {
    // Retry/resume bursts re-emit the whole intake set; the upsert must
    // adopt an existing .intake-line from the stream DOM rather than ever
    // inserting a second one.
    expect(UI_HTML).toContain("streamEl.querySelector('.intake-line')");
    expect(UI_HTML).toContain('st.el.isConnected');
    expect(UI_HTML).toContain("existing.querySelector('.intake-rows').innerHTML = ''");
  });

  it('ships the quiet silver styling (no card chrome) and the digest extractor', () => {
    expect(UI_HTML).toContain('upsertIntakeLine(runId, insert, tag, body)');
    expect(UI_HTML).toContain("if (tag === 'effort')");
    expect(UI_HTML).toContain("+ ' effort'");
    expect(UI_HTML).toContain("+ ' files'");
    // Silver text, not a component: color from --faint, and the base rule
    // carries no background/border/padding chrome.
    const rule = /\.intake-line \{[^}]*\}/.exec(UI_HTML)![0]!;
    expect(rule).toContain('var(--faint)');
    expect(rule).not.toMatch(/background|border|padding:/);
  });
});

describe('UI — bundled fonts (Inter + JetBrains Mono)', () => {
  it('declares the local @font-face set and swaps both stacks', () => {
    for (const file of [
      'inter-latin-400-normal.woff2',
      'inter-latin-500-normal.woff2',
      'inter-latin-600-normal.woff2',
      'jetbrains-mono-latin-400-normal.woff2',
      'jetbrains-mono-latin-700-normal.woff2',
    ]) {
      expect(UI_HTML).toContain(`/fonts/${file}`);
    }
    expect(UI_HTML).toContain("--sans: 'Inter'");
    expect(UI_HTML).toContain("--mono: 'JetBrains Mono'");
    // No CDN references — the desktop app must render offline.
    expect(UI_HTML).not.toMatch(/@font-face[^}]*https?:\/\//);
    // Counters use tabular numerals.
    expect(UI_HTML).toMatch(/#progText, \.spec-turns, \.stat \.v \{ font-feature-settings: 'tnum' 1/);
  });

  const servers: HermesServer[] = [];
  afterAll(async () => {
    for (const s of servers) await s.stop();
  });

  it('serves woff2 files locally with immutable caching and blocks traversal', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ui-fonts-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ui-fonts' }));
    const server = new HermesServer({ cwd: dir, port: 0, llm: { name: 'mock', complete: async () => '', completeStream: async (_m, _o, d) => (d(''), '') } } as never);
    servers.push(server);
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;

    const ok = await fetch(`${base}/fonts/inter-latin-400-normal.woff2`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('font/woff2');
    expect(ok.headers.get('cache-control')).toContain('immutable');
    const buf = Buffer.from(await ok.arrayBuffer());
    expect(buf.subarray(0, 4).toString('ascii')).toBe('wOF2');

    for (const bad of ['/fonts/not-a-font.woff2', '/fonts/..%2F..%2Fpackage.json', '/fonts/']) {
      const res = await fetch(`${base}${bad}`);
      expect(res.status, bad).toBe(404);
    }
  }, 20000);
});