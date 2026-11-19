import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { UI_HTML } from '../src/server/ui.js';

const servers: HermesServer[] = [];
const dirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function makeProject(name: string): string {
  const dir = makeTempDir(`gitu-code-full-${name}-`);
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `code-full-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  return dir;
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 20000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

beforeEach(() => {
  vi.stubEnv('AGENT_GITU_HOME', makeTempDir('gitu-code-full-home-'));
});

afterEach(async () => {
  try {
    for (const server of servers.splice(0)) await server.stop();
  } finally {
    vi.unstubAllEnvs();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

describe('Code mode inline Full Access UI', () => {
  it('bundles a valid inline script with Full Access controls on Code Home, active Code runs, + menu, and coding approval cards', () => {
    const js = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    expect(() => new Function(js)).not.toThrow();

    // Rendered inline on Code Home and active Code chats without opening Settings.
    expect(UI_HTML).toContain('id="homeProj"');
    expect(UI_HTML).toContain("</span></button>' + codingAccessPillHtml() + '</div>'");
    expect(UI_HTML).toContain('id="mainWorkDetails"');
    expect(UI_HTML).toContain('id="codeAccessToggle" role="switch"');
    // Also exposed in the Code composer "+" menu.
    expect(UI_HTML).toContain('id="menuFullAccess"');
    expect(UI_HTML).toContain('data-hp="full-access"');
    // Coding approval cards include one-click Approve & full access.
    expect(UI_HTML).toContain('data-grant-full="1"');
    expect(UI_HTML).toContain('Approve &amp; full access');
  });

  it('toggles /api/coding-permissions and synchronizes the switch, + menu item, Settings toggle, and approval button', async () => {
    const slice = UI_HTML.slice(
      UI_HTML.indexOf('  function codingAccessPillHtml()'),
      UI_HTML.indexOf('  function controlsHtml()'),
    );
    expect(slice).toContain('toggleCodingFullAccess');

    const makeEl = () => {
      const classes = new Set<string>();
      const attrs: Record<string, string> = {};
      return {
        disabled: false,
        hidden: false,
        title: '',
        classes,
        attrs,
        classList: {
          toggle(name: string, force?: boolean) {
            if (force === undefined) {
              if (classes.has(name)) classes.delete(name);
              else classes.add(name);
            } else if (force) classes.add(name);
            else classes.delete(name);
          },
          contains(name: string) {
            return classes.has(name);
          },
        },
        setAttribute(k: string, v: string) {
          attrs[k] = v;
        },
        getAttribute(k: string) {
          return attrs[k];
        },
      };
    };

    const pill = makeEl();
    const menuItem = makeEl();
    const settingsBtn = makeEl();
    const grantBtn = makeEl();
    const elements: Record<string, ReturnType<typeof makeEl>> = {
      codeAccessToggle: pill,
      menuFullAccess: menuItem,
      pAuto: settingsBtn,
    };
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const toasts: string[] = [];
    let persisted = 0;

    const context = createContext({
      S: { settings: { autoApprove: false } },
      $: (id: string) => elements[id] ?? null,
      esc: (v: string) => String(v),
      icon: (name: string) => `<svg data-icon="${name}"></svg>`,
      persist: () => {
        persisted += 1;
      },
      toast: (msg: string) => {
        toasts.push(msg);
      },
      document: {
        querySelectorAll: (selector: string) => (selector === '[data-grant-full="1"]' ? [grantBtn] : []),
      },
      api: async (url: string, opts?: { body?: string }) => {
        const body = opts?.body ? JSON.parse(opts.body) : {};
        calls.push({ url, body });
        return { access: body.access, configured: true };
      },
    });
    new Script(slice).runInContext(context);

    expect(context.codingAccessPillHtml()).toContain('aria-checked="false"');

    await context.toggleCodingFullAccess(pill);
    expect(calls).toEqual([{ url: '/api/coding-permissions', body: { access: 'full' } }]);
    expect(context.S.settings.autoApprove).toBe(true);
    expect(persisted).toBe(1);
    expect(pill.classList.contains('on')).toBe(true);
    expect(pill.getAttribute('aria-checked')).toBe('true');
    expect(menuItem.classList.contains('active')).toBe(true);
    expect(menuItem.getAttribute('aria-checked')).toBe('true');
    expect(settingsBtn.classList.contains('on')).toBe(true);
    expect(grantBtn.hidden).toBe(true);
    expect(pill.disabled).toBe(false);
    expect(toasts.at(-1)).toContain('Full access enabled');

    await context.toggleCodingFullAccess(pill);
    expect(calls.at(-1)).toEqual({ url: '/api/coding-permissions', body: { access: 'ask' } });
    expect(context.S.settings.autoApprove).toBe(false);
    expect(pill.classList.contains('on')).toBe(false);
    expect(pill.getAttribute('aria-checked')).toBe('false');
    expect(menuItem.classList.contains('active')).toBe(false);
    expect(grantBtn.hidden).toBe(false);
    expect(toasts.at(-1)).toContain('Full access off');
  });
});

describe('Code mode live Full Access grant and mid-run revocation', () => {
  async function startServer(dir: string, llm: ScriptedMockLlm): Promise<{ base: string; server: HermesServer }> {
    const server = new HermesServer({ passwordRequired: false, autoInstallLsp: false, cwd: dir, port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return { base: `http://127.0.0.1:${port}`, server };
  }

  it('grants Full Access for cross-repository writes and shell commands without approval prompts', async () => {
    const dir = makeProject('primary');
    const siblingRepo = makeTempDir('gitu-sibling-repo-');
    mkdirSync(siblingRepo, { recursive: true });
    const siblingFile = path.join(siblingRepo, 'cross-repo.txt');
    const siblingPosix = siblingFile.replace(/\\/g, '/');
    const verifyCmd = `node -e "const fs = require('fs'); console.log(fs.readFileSync('${siblingPosix}', 'utf8'))"`;

    const { base } = await startServer(
      dir,
      new ScriptedMockLlm([
        () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['Sibling repository file updated'] } }),
        () =>
          JSON.stringify({
            action: {
              type: 'set_plan',
              steps: [
                {
                  description: 'Write sibling file, run unrecognized command, and verify with node',
                  verification: verifyCmd,
                },
              ],
            },
          }),
        () =>
          JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'write_file',
              params: { path: siblingFile, content: 'updated-from-code-mode' },
              reason: 'Update file in another repository',
              expected: 'File written',
            },
          }),
        () =>
          JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'run_command',
              params: { command: 'whoami' },
              reason: 'Run dangerous-tier unrecognized command with Full Access',
              expected: 'Command succeeds without approval prompt',
            },
          }),
        () =>
          JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'run_command',
              params: { command: verifyCmd },
              reason: 'Verify external file contents',
              expected: 'updated-from-code-mode',
            },
          }),
        (_n, messages) => {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
          const matches = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)];
          const evId = matches.at(-1)?.[1] ?? 'ev-x';
          return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
        },
        () => JSON.stringify({ action: { type: 'complete', summary: 'Updated sibling repo with Full Access.', risks: [], followUps: [] } }),
      ]),
    );

    const permRes = await fetch(`${base}/api/coding-permissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access: 'full' }),
    }).then((r) => r.json());
    expect(permRes).toEqual({ access: 'full', configured: true });

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Update sibling repo file', mode: 'standard', review: false }),
    }).then((r) => r.json());

    const session = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });

    expect(session.status).toBe('completed');
    expect(session.pendingApprovals).toEqual([]);
    expect(readFileSync(siblingFile, 'utf8')).toBe('updated-from-code-mode');
  }, 60000);

  it('revokes Full Access mid-run immediately for both external writes and shell commands', async () => {
    const dir = makeProject('revoke');
    const siblingRepo = makeTempDir('gitu-sibling-revoke-');
    const siblingBefore = path.join(siblingRepo, 'before.txt');
    const siblingAfter = path.join(siblingRepo, 'after.txt');
    let serverBase = '';
    let revoked = false;

    const { base } = await startServer(
      dir,
      new ScriptedMockLlm([
        () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['Command and file access follow live permission state'] } }),
        () =>
          JSON.stringify({
            action: {
              type: 'set_plan',
              steps: [{ description: 'Write before and after revocation', verification: 'node --version' }],
            },
          }),
        () =>
          JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'write_file',
              params: { path: siblingBefore, content: 'allowed-while-full' },
              reason: 'Write external file while Full Access is ON',
              expected: 'File written',
            },
          }),
        async () => {
          // Owner clicks Full Access OFF right inside Code mode mid-run.
          await fetch(`${serverBase}/api/coding-permissions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ access: 'ask' }),
          });
          revoked = true;
          return JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'write_file',
              params: { path: siblingAfter, content: 'must-require-approval' },
              reason: 'Attempt external write after Full Access is revoked',
              expected: 'Waits for owner approval',
            },
          });
        },
        () =>
          JSON.stringify({
            action: {
              type: 'tool_call',
              stepId: 'step-1',
              tool: 'run_command',
              params: { command: 'rm -rf build' },
              reason: 'Run dangerous command after revocation',
              expected: 'Waits for owner approval',
            },
          }),
        () => JSON.stringify({ action: { type: 'complete', summary: 'Finished after checks.', risks: [], followUps: [] } }),
      ]),
    );
    serverBase = base;

    // Start with Full Access enabled.
    await fetch(`${base}/api/coding-permissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access: 'full' }),
    });

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Test mid-run revocation', mode: 'standard', review: false }),
    }).then((r) => r.json());

    // 1. After mid-run revocation, the external write MUST pause for owner approval (not auto-write).
    const writeGate = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.pendingApprovals?.length > 0 ? s : undefined;
    });

    expect(revoked).toBe(true);
    expect(readFileSync(siblingBefore, 'utf8')).toBe('allowed-while-full');
    expect(() => readFileSync(siblingAfter, 'utf8')).toThrow();
    expect(writeGate.pendingApprovals[0].tool).toBe('write_file');

    // Deny the external write so the run advances to the shell command.
    const writeApprovalId = writeGate.pendingApprovals[0].id;
    await fetch(`${base}/api/approvals/${writeApprovalId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: false }),
    });

    // 2. The subsequent unrecognized shell command MUST ALSO pause for owner approval.
    const cmdGate = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      const next = (s.pendingApprovals ?? []).find((a: { id: string }) => a.id !== writeApprovalId);
      return next ? s : undefined;
    });

    expect(() => readFileSync(siblingAfter, 'utf8')).toThrow();
    expect(cmdGate.pendingApprovals[0].tool).toBe('run_command');

    // Cleanly stop the paused run.
    await fetch(`${base}/api/runs/${created.runId}/stop`, { method: 'POST' });
  }, 60000);
});
