import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackgroundCommandRegistry, toolRunCommand, type ToolContext } from '../src/tools/tools.js';

/**
 * The hang this guards against: a grandchild (a `.cmd` shim's real process, a GUI
 * app, a dev server) inherits the stdout pipe created for the shell. The shell
 * exits, `close` never fires, and a tool that settles on the pipes closing waits
 * forever while the agent looks stuck with no output.
 *
 * Windows-only: the reproduction needs a process that survives the shell while
 * holding the inherited handle, which is how every `.cmd`/GUI launch behaves.
 */
describe.skipIf(process.platform !== 'win32')('a command that leaves a descendant holding stdout', () => {
  it('still returns its exit status instead of waiting for the pipe', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-pipe-'));
    const pidFile = path.join(dir, 'hold.pid');
    writeFileSync(
      path.join(dir, 'hold.cjs'),
      [
        "require('node:fs').writeFileSync('hold.pid', String(process.pid));",
        "require('node:http').createServer((_q, res) => res.end('ok')).listen(0, () => console.log('holding'));",
        'setTimeout(() => process.exit(0), 12000);',
      ].join('\n'),
    );
    const registry = new BackgroundCommandRegistry();
    const started = Date.now();
    try {
      const result = await toolRunCommand({ cwd: dir, backgroundCommands: registry } as ToolContext, {
        command: 'Start-Process -FilePath node -ArgumentList \'"hold.cjs"\' -NoNewWindow; Write-Output "launched"; exit 0',
        waitMs: 10_000,
      });
      const elapsed = Date.now() - started;

      expect(result.status).toBe('exited');
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('launched');
      // The descendant lives for 12s; the tool must answer long before that.
      expect(elapsed).toBeLessThan(8_000);
    } finally {
      // The descendant holds this worker's pipe too: kill it so the suite can end.
      for (let attempt = 0; attempt < 50 && !existsSync(pidFile); attempt += 1) await new Promise((r) => setTimeout(r, 100));
      const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : 0;
      if (pid) {
        try {
          execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } catch {
          /* already gone */
        }
      }
    }
  }, 40_000);
});

