import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shiftPrefixEndAfterCompaction } from '../src/agent/hermes.js';
import { uiVisualGate } from '../src/agent/ui-gate.js';
import { getWorkspaceFingerprint, gitDiscard, gitInfo, gitExec } from '../src/git/git.js';
import { McpManager } from '../src/mcp/client.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { classifyCommand } from '../src/policy/policy.js';
import { resolveSpawn, windowsQuote } from '../src/lsp/server-registry.js';
import { isTrivialEvidenceCommand } from '../src/evidence/evidence.js';
import { classifyCall } from '../src/agent/telemetry.js';
import type { LlmMessage } from '../src/llm/llm.js';
import { Executor } from '../src/executor/executor.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { CheckpointManager } from '../src/checkpoint/checkpoint.js';

// ---- helpers ------------------------------------------------------------

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-regress-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'regress-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  return dir;
}

function makeExecutor(dir: string): Executor {
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'regression', project: guard.lock, mode: 'fast' });
  const policy = {
    evaluate: async () => ({ allowed: true, tier: 'safe' as const, reason: 'stub' }),
  } as unknown as PolicyEngine;
  const loopDetector = {
    evaluate: () => ({ allowed: true, reason: undefined, errorSig: undefined }),
    fileEditPressure: () => ({ blocked: false, edits: 0, evidence: 0 }),
  } as unknown as LoopDetector;
  return new Executor(guard, ledger, policy, loopDetector);
}

function makeGitRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-regress-git-'));
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'regress@test.local']);
  git(dir, ['config', 'user.name', 'Regress Test']);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'regress-git-test' }));
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-m', 'initial']);
  return dir;
}

function git(dir: string, args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

let seq = 0;
function action(partial: Record<string, unknown>): Record<string, unknown> {
  seq += 1;
  return {
    id: `a-${seq}`,
    paramsHash: '',
    paramsSummary: '',
    status: 'success',
    reason: '',
    expected: '',
    durationMs: 1,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, seq)).toISOString(),
    ...partial,
  };
}

// ---- H1: apply_edit must not interpret $ replacement patterns ------------

describe('apply_edit — literal $ sequences (H1)', () => {
  it('inserts $&, $`, $$ literally instead of expanding them', async () => {
    const dir = makeProject();
    const executor = makeExecutor(dir);
    writeFileSync(path.join(dir, 'src', 'script.sh'), 'echo "cost"\n');
    await executor.execute({ tool: 'apply_edit', params: { path: 'src/script.sh', oldString: 'cost', newString: 'cost = $$total and matched:$& after:`$`' } });
    const updated = readFileSync(path.join(dir, 'src', 'script.sh'), 'utf8');
    expect(updated).toContain('cost = $$total and matched:$& after:`$`');
  });

  it('keeps exact-match uniqueness errors intact', async () => {
    const dir = makeProject();
    const executor = makeExecutor(dir);
    writeFileSync(path.join(dir, 'src', 'dup.txt'), 'x\nx\n');
    const out = await executor.execute({ tool: 'apply_edit', params: { path: 'src/dup.txt', oldString: 'x', newString: 'y' } });
    expect(out.result.ok).toBe(false);
    expect(out.result.output).toContain('more context');
  });
});

// ---- M2: redirection / background separators are not auto-approve-safe ---

describe('policy classification — redirection cannot be safe-tier (M2)', () => {
  it('treats redirected reads as non-safe', () => {
    expect(classifyCommand('cat ~/.ssh/id_rsa > leaked.txt').tier).toBe('dangerous');
    expect(classifyCommand('type secret.txt >> log.txt').tier).toBe('dangerous');
    expect(classifyCommand('ls > out.txt').tier).toBe('dangerous');
  });

  it('treats single-& command separation as non-safe', () => {
    expect(classifyCommand('pwd & del important.dll').tier).toBe('dangerous');
  });

  it('still classifies plain read-only commands as safe', () => {
    expect(classifyCommand('git status').tier).toBe('safe');
    expect(classifyCommand('npm run typecheck').tier).toBe('safe');
    expect(classifyCommand('ls -la').tier).toBe('safe');
  });
});

// ---- M4: compound verification commands are not "trivial" evidence -------

describe('trivial evidence detection (M4)', () => {
  it('accepts compound commands that start with a trivial prefix but do real work', () => {
    expect(isTrivialEvidenceCommand('cd client && npm test')).toBe(false);
    expect(isTrivialEvidenceCommand('time npm run build')).toBe(false);
  });

  it('still rejects every-trivial chains and plain no-ops', () => {
    expect(isTrivialEvidenceCommand('git status && git log')).toBe(true);
    expect(isTrivialEvidenceCommand('echo done')).toBe(true);
    expect(isTrivialEvidenceCommand('cd client')).toBe(true);
  });
});

// ---- L17: read_file tolerates garbage numeric params ---------------------

describe('read_file NaN offset/limit (L17)', () => {
  it('returns first lines instead of an empty body for invalid offsets', async () => {
    const dir = makeProject();
    const executor = makeExecutor(dir);
    writeFileSync(path.join(dir, 'src', 'lines.txt'), Array.from({ length: 5 }, (_, i) => `line ${i + 1}`).join('\n'));
    const out = await executor.execute({ tool: 'read_file', params: { path: 'src/lines.txt', offset: 'start', limit: 'all' } });
    expect(out.result.ok).toBe(true);
    expect(out.result.output).toContain('1: line 1');
    expect(out.result.output).toContain('line 5');
  });
});

// ---- M14: telemetry buckets stay disjoint ---------------------------------

describe('telemetry image attribution (M14)', () => {
  it('does not double-count images across bySource buckets', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'S'.repeat(400) },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'history with screenshot' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + 'A'.repeat(4000) } },
        ],
      },
      { role: 'user', content: 'STATE' },
    ];
    const split = classifyCall(messages, 2);
    expect(split.imageTokens).toBeGreaterThan(0);
    // Buckets are disjoint and sum to the same total messageTokens would give.
    const total = split.prefixTokens + split.historyTokens + split.stateTokens + split.imageTokens;
    const expected = messages.reduce((n, m) => n + JSON.stringify(m).length / 4, 0);
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(total - expected)).toBeLessThan(expected * 2); // sanity, disjointness is the point
    // The image share must come OUT of its message's bucket, not stack on top:
    // historyTokens alone must be less than total.
    expect(split.historyTokens).toBeLessThan(total);
  });
});

// ---- L7: un-checking a todo demotes an auto-completed step ----------------

describe('task ledger step status mirrors todos both ways (L7)', () => {
  it('demotes a step back to pending when a subtask is unchecked', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'g', project: guard.lock, mode: 'fast' });
    ledger.setPlan([{ description: 'step one', verification: 'v', subtasks: ['a', 'b'] }]);
    const id = ledger.data.plan[0]!.id!;
    expect(ledger.toggleSubtask(id, 0, true)).toBe(true);
    expect(ledger.toggleSubtask(id, 1, true)).toBe(true);
    expect(ledger.step(id)!.status).toBe('done');
    ledger.toggleSubtask(id, 1, false);
    expect(ledger.step(id)!.status).toBe('pending');
  });
});

// ---- M15: prefix boundary shift helper ------------------------------------

describe('shiftPrefixEndAfterCompaction (M15)', () => {
  it('pins the stable prefix to system prompt + digest after compaction', () => {
    expect(shiftPrefixEndAfterCompaction(10, 18)).toBe(2);
    expect(shiftPrefixEndAfterCompaction(10, 30)).toBe(2);
    expect(shiftPrefixEndAfterCompaction(1, 5)).toBe(2);
    expect(shiftPrefixEndAfterCompaction(0, 5)).toBe(0);
  });
});

// ---- M8: Windows shell spawn quoting ---------------------------------------

describe('windows spawn quoting (M8)', () => {
  it('quotes args containing spaces and quotes per argv rules', () => {
    if (process.platform !== 'win32') return;
    expect(windowsQuote('plain')).toBe('plain');
    expect(windowsQuote('a b')).toBe('"a b"');
    expect(windowsQuote('')).toBe('""');
    expect(windowsQuote('he said "hi"')).toBe('"he said \\"hi\\""');
    // A trailing backslash with no metacharacters needs no quoting.
    expect(windowsQuote('trail\\')).toBe('trail\\');
  });

  it('returns a pre-quoted single cmdline for .cmd shims instead of raw args', () => {
    if (process.platform !== 'win32') return;
    const r = resolveSpawn('npm-global-shim.cmd', ['--stdio', 'extra arg']);
    expect(r.shell).toBe(true);
    expect(r.args).toEqual([]);
    expect(r.command).toContain('--stdio');
    expect(r.command).toContain('"extra arg"');
  });

  it('spawns extensionless commands directly when an .exe exists', () => {
    if (process.platform !== 'win32') return;
    const r = resolveSpawn('cmd', ['/c', 'echo hi']);
    expect(r.shell).toBe(false);
    expect(r.args).toEqual(['/c', 'echo hi']);
    expect(r.command.toLowerCase()).toMatch(/cmd\.exe$/);
  });
});

// ---- L15: MCP config corruption must not wipe servers ----------------------

describe('mcp manager protects config against silent wipes (L15)', () => {
  it('refuses add/remove when mcp.json is corrupt instead of writing [] over it', () => {
    const dir = makeProject();
    mkdirSync(path.join(dir, '.hermes'), { recursive: true });
    const file = path.join(dir, '.hermes', 'mcp.json');
    writeFileSync(file, '{ not valid json !!');
    const mgr = new McpManager(file);
    expect(() => mgr.removeServer('anything')).toThrow(/invalid JSON/);
    expect(() => mgr.addServer({ name: 'x', command: 'y' })).toThrow(/invalid JSON/);
    expect(readFileSync(file, 'utf8')).toBe('{ not valid json !!');
  });

  it('behaves normally with a healthy config file', () => {
    const dir = makeProject();
    mkdirSync(path.join(dir, '.hermes'), { recursive: true });
    const file = path.join(dir, '.hermes', 'mcp.json');
    writeFileSync(file, JSON.stringify({ servers: [{ name: 'keep', command: 'k' }] }));
    const mgr = new McpManager(file);
    mgr.addServer({ name: 'added', command: 'a' });
    expect(mgr.servers().map((s) => s.name).sort()).toEqual(['added', 'keep']);
    mgr.removeServer('added');
    expect(mgr.servers().map((s) => s.name)).toEqual(['keep']);
  });
});

// ---- L13: UI visual gate counts command-driven edits ------------------------

describe('ui visual gate sees run_command edits (L13)', () => {
  it('requires a fresh screenshot after edits made outside write_file', () => {
    const data = {
      actions: [
        action({ tool: 'browse', paramsSummary: 'browse screenshot' }),
        action({ tool: 'run_command', paramsSummary: 'run sed -i s/a/b/ index.html' }),
      ],
      plan: [],
      acceptanceCriteria: [],
      filesChanged: ['index.html'],
    } as unknown as Parameters<typeof uiVisualGate>[0];
    const gate = uiVisualGate(data, { browserAvailable: true });
    expect(gate.required).toBe(true);
    expect(gate.verified).toBe(false);
  });
});

// ---- M3: checkpoint survives transient git failures -------------------------

describe('checkpoint resilience (M3)', () => {
  it('reports ok:false instead of throwing when git add fails on a stale lock', () => {
    const dir = makeGitRepo();
    try {
      writeFileSync(path.join(dir, 'b.txt'), 'b\n');
      const guard = ProjectGuard.detect(dir);
      const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'g', project: guard.lock, mode: 'fast' });
      const cp = new CheckpointManager(guard);
      // A leftover index.lock makes `git add` exit non-zero — exactly the
      // transient failure that used to propagate and fail whole runs.
      writeFileSync(path.join(dir, '.git', 'index.lock'), '');
      const result = cp.snapshot(ledger, 'step-1', 'test');
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/add failed|skipping/i);
    } finally {
      rmSync(path.join(dir, '.git', 'index.lock'), { force: true });
    }
  });
});

// ---- M5/M6/M7/L5: git layer --------------------------------------------------

describe('workspace fingerprint survives commits (M5)', () => {
  it('is stable across staging+commit but reacts to later content edits', async () => {
    const dir = makeGitRepo();
    writeFileSync(path.join(dir, 'new.txt'), 'content');
    const fpDirty = await getWorkspaceFingerprint(dir);
    git(dir, ['add', '-A']);
    const fpStaged = await getWorkspaceFingerprint(dir);
    expect(fpStaged).toBe(fpDirty);
    git(dir, ['-c', 'user.name=t', '-c', 'user.email=t@t.local', 'commit', '-m', 'checkpoint']);
    const fpCommitted = await getWorkspaceFingerprint(dir);
    expect(fpCommitted).toBe(fpDirty);
    writeFileSync(path.join(dir, 'new.txt'), 'changed');
    expect(await getWorkspaceFingerprint(dir)).not.toBe(fpCommitted);
  });
});

describe('gitDiscard also undoes staged changes (M6)', () => {
  it('reverts worktree AND index for a staged modification', async () => {
    const dir = makeGitRepo();
    writeFileSync(path.join(dir, 'a.txt'), 'two\n');
    git(dir, ['add', 'a.txt']);
    let info = await gitInfo(dir);
    expect(info.files!.some((f) => f.path === 'a.txt')).toBe(true);
    await gitDiscard(dir, 'a.txt');
    info = await gitInfo(dir);
    expect(info.files!.length).toBe(0);
    // Normalize line endings: autocrlf checkouts may differ from what was written.
    expect(readFileSync(path.join(dir, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('one\n');
  });
});
