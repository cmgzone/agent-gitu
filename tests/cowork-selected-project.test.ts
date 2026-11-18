import { createContext, Script } from 'node:vm';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import { GituServer } from '../src/server/server.js';
import { COWORK_WORKBENCH_JS } from '../src/server/ui-cowork-workbench.js';
import { runNativeCoworkTurn } from '../src/cowork/codex-native.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkNativeTools, executeCoworkTool } from '../src/cowork/tools.js';

const previousHome = process.env.AGENT_GITU_HOME;
const roots: string[] = [];
const servers: GituServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  }
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
});

function makeDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

describe('Cowork selected project awareness', () => {
  it('supports allowUnmarked on ProjectGuard.detect without writing marker files', () => {
    const unmarked = makeDir('cowork-unmarked-');
    writeFileSync(path.join(unmarked, 'hello.txt'), 'world');

    expect(() => ProjectGuard.detect(unmarked)).toThrow('No project marker found');
    const guard = ProjectGuard.detect(unmarked, { allowUnmarked: true });
    expect(guard.activeWritableRoot).toBe(realpathSync(unmarked));
    expect(guard.fullAccess).toBe(false);
    expect(existsSync(path.join(unmarked, 'package.json'))).toBe(false);
  });

  it('roots personal host agents in the selected project across prompt, tools, and dynamic switches while keeping company agents isolated', async () => {
    const home = makeDir('cowork-selected-home-');
    process.env.AGENT_GITU_HOME = home;
    const defaultWorkspace = path.join(home, 'Workspace');
    mkdirSync(defaultWorkspace, { recursive: true });
    writeFileSync(path.join(defaultWorkspace, 'home-note.txt'), 'Home workspace note');

    const projA = makeDir('cowork-proj-a-');
    writeFileSync(path.join(projA, 'package.json'), JSON.stringify({ name: 'alpha-proj', private: true }));
    mkdirSync(path.join(projA, 'src'), { recursive: true });
    writeFileSync(path.join(projA, 'src', 'app.ts'), 'export const appName = "Alpha";\n');

    const projB = makeDir('cowork-proj-b-');
    mkdirSync(path.join(projB, 'notes'), { recursive: true });
    writeFileSync(path.join(projB, 'notes', 'readme.txt'), 'Beta unmarked readme\n');

    const capturedPrompts: string[] = [];
    const llm = new ScriptedMockLlm([
      (_call, messages: LlmMessage[]) => {
        const sys = messages.find((m) => m.role === 'system')?.content;
        capturedPrompts.push(typeof sys === 'string' ? sys : '');
        return 'Got it.';
      },
    ]);

    const server = new GituServer({
      cwd: defaultWorkspace,
      port: 0,
      passwordRequired: false,
      llm,
      coworkCompletionProtocol: 'legacy',
    });
    servers.push(server);
    const origin = 'http://127.0.0.1:' + (await server.start());
    const api = async (route: string, body?: unknown) => {
      const response = await fetch(origin + route, {
        method: body !== undefined ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: (await response.json()) as any };
    };

    await api('/api/onboarding', { theme: 'light', mode: 'cowork', model: '' });
    const internal = server as any;
    const store: CoworkStore = internal.cowork();
    const hostAgent = store.saveAgent({
      name: 'Host Helper',
      systemPrompt: 'Help inspect projects.',
      useHostComputer: true,
      allowWrites: true,
      allowShell: true,
    });
    const sandboxAgent = store.saveAgent({
      name: 'Container Helper',
      systemPrompt: 'Work in container.',
      useHostComputer: false,
      allowWrites: true,
      allowShell: true,
    });

    const company = internal.companies().create({ name: 'Isolated Corp' });

    expect((await api('/api/model-selection', { projectPath: projA })).status).toBe(200);

    const { companyAgent, companyMeta, companyCtx } = internal.companyScope.run(
      { id: company.id, version: company.directionVersion },
      () => {
        const saved = internal.cowork().saveAgent({
          name: 'Corp Worker',
          systemPrompt: 'Work on company tasks.',
          useHostComputer: true,
          allowWrites: true,
          allowShell: true,
        });
        return {
          companyAgent: saved,
          companyMeta: internal.coworkComputerContext(saved, 'conv-co'),
          companyCtx: internal.coworkToolContext(saved),
        };
      },
    );

    const hostCtx = internal.coworkToolContext(hostAgent);
    expect(hostCtx.cwd).toBe(realpathSync(projA));
    expect(hostCtx.guard.activeWritableRoot).toBe(realpathSync(projA));

    const perms = { allowShell: true, allowWrites: true, allowConfig: false, chief: false, browser: false };
    const scope = { store, agent: hostAgent, memory: CoworkMemory.forWorkspace(defaultWorkspace), conversationId: 'conv-a' };

    const listedA = await executeCoworkTool(hostCtx, 'list_files', { path: '.' }, perms, scope);
    expect(listedA.ok).toBe(true);
    expect(listedA.output).toContain('src');

    const readA = await executeCoworkTool(hostCtx, 'read_file', { path: 'src/app.ts' }, perms, scope);
    expect(readA.ok).toBe(true);
    expect(readA.output).toContain('Alpha');

    const statusA = await executeCoworkTool(hostCtx, 'computer_status', {}, perms, scope);
    expect(statusA.ok).toBe(true);
    expect(statusA.output).toContain(projA);
    expect(statusA.output).toContain('"isActiveWorkspace":true');

    const sandboxMeta = internal.coworkComputerContext(sandboxAgent, 'conv-sandbox');
    expect(sandboxMeta).toContain(JSON.stringify(projA));
    expect(sandboxMeta).toContain('"isActiveWorkspace":false');

    expect(companyAgent.companyId).toBe(company.id);
    expect(companyMeta).not.toContain(projA);
    expect(companyMeta).not.toContain(JSON.stringify(projA));
    expect(companyMeta).not.toContain('selectedProject');
    expect(companyCtx.cwd).not.toBe(realpathSync(projA));

    // Send a live Cowork chat turn and inspect the system prompt built by runner.ts
    const convRes = await api('/api/cowork/conversations', { kind: 'dm', memberIds: [hostAgent.id] });
    const convId = convRes.data.conversation.id as string;
    const msgRes = await api(`/api/cowork/conversations/${convId}/messages`, { text: 'Which project am I in?' });
    expect(msgRes.status).toBe(202);
    await vi.waitFor(async () => expect((await api(`/api/cowork/conversations/${convId}/messages`)).data.busy).toBe(false));
    expect(capturedPrompts[0]).toContain('ACTIVE SELECTED PROJECT:');
    expect(capturedPrompts[0]).toContain(projA);

    // Switch dynamically to unmarked projB
    expect((await api('/api/model-selection', { projectPath: projB })).status).toBe(200);
    const switchedCtx = internal.coworkToolContext(hostAgent);
    expect(switchedCtx.cwd).toBe(realpathSync(projB));
    expect(switchedCtx.guard.activeWritableRoot).toBe(realpathSync(projB));
    expect(existsSync(path.join(projB, 'package.json'))).toBe(false);

    const readB = await executeCoworkTool(switchedCtx, 'read_file', { path: 'notes/readme.txt' }, perms, scope);
    expect(readB.ok).toBe(true);
    expect(readB.output).toContain('Beta unmarked readme');

    // Home workspace remains readable/writable while working in a selected project
    const readHome = await executeCoworkTool(switchedCtx, 'read_file', { path: path.join(defaultWorkspace, 'home-note.txt') }, perms, scope);
    expect(readHome.ok).toBe(true);
    expect(readHome.output).toContain('Home workspace note');

    // Clear selected project -> reverts back to default workspace and records explicit clear
    const clearRes = await api('/api/model-selection', { projectPath: '' });
    expect(clearRes.status).toBe(200);
    expect(clearRes.data.projectPath).toBeUndefined();
    expect(clearRes.data.projectCleared).toBe(true);
    const clearedCtx = internal.coworkToolContext(hostAgent);
    expect(clearedCtx.cwd).toBe(realpathSync(defaultWorkspace));

    // Re-selecting a project clears the explicit projectCleared flag
    const reselectRes = await api('/api/model-selection', { projectPath: projA });
    expect(reselectRes.status).toBe(200);
    expect(reselectRes.data.projectPath).toBe(realpathSync(projA));
    expect(reselectRes.data.projectCleared).toBeUndefined();
  });

  it('starts a fresh native Codex thread cleanly when the active workspace cwd changes mid-conversation', async () => {
    const rootA = makeDir('cowork-native-a-');
    const rootB = makeDir('cowork-native-b-');
    writeFileSync(path.join(rootA, 'package.json'), JSON.stringify({ name: 'proj-a', private: true }));
    writeFileSync(path.join(rootB, 'package.json'), JSON.stringify({ name: 'proj-b', private: true }));

    const storeRoot = makeDir('cowork-native-store-');
    const store = new CoworkStore(path.join(storeRoot, 'cowork.json'));
    const agent = store.saveAgent({
      name: 'Native Switcher',
      systemPrompt: 'Be concise.',
      useHostComputer: true,
      allowWrites: true,
      allowShell: false,
    });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });

    const seenInputs: { threadId?: string; cwd?: string }[] = [];
    let callIndex = 0;
    const runTurn = vi.fn(async (input: NativeTaskInput) => {
      callIndex += 1;
      const threadId = `native-thread-${callIndex}`;
      seenInputs.push({ threadId: input.threadId, cwd: input.cwd });
      input.onThread(threadId);
      input.onTurn(`native-turn-${callIndex}`);
      await input.onEvent('item/completed', { item: { id: `final-${callIndex}`, type: 'agentMessage', text: `Reply ${callIndex}.`, phase: 'final_answer' } });
      return { threadId, turnId: `native-turn-${callIndex}`, status: 'completed' as const };
    });
    const steer = vi.fn(async () => {});
    const client = Object.assign(new ScriptedMockLlm([]), { nativeTask: { mode: 'codex-native' as const, runTurn, steer } });

    const ctxA = { guard: ProjectGuard.detect(rootA), cwd: realpathSync(rootA) };
    const ctxB = { guard: ProjectGuard.detect(rootB), cwd: realpathSync(rootB) };
    const perms = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false };
    const scope = { store, agent, memory: CoworkMemory.forWorkspace(storeRoot), conversationId: conversation.id };

    await runNativeCoworkTurn({
      client,
      ctx: ctxA,
      agent,
      conversationId: conversation.id,
      messages: [{ role: 'user', content: 'Inspect A.' }],
      store,
      scope,
      tools: coworkNativeTools(agent, false),
      perms,
      onTool: vi.fn(),
    });
    const sessionKey = `${conversation.id}:${agent.id}::chat`;
    expect(store.nativeCodexSession(sessionKey)?.cwd).toBe(realpathSync(rootA));

    const resultB = await runNativeCoworkTurn({
      client,
      ctx: ctxB,
      agent,
      conversationId: conversation.id,
      messages: [
        { role: 'user', content: 'Inspect A.' },
        { role: 'assistant', content: 'Reply 1.' },
        { role: 'user', content: 'Now inspect B.' },
      ],
      store,
      scope,
      tools: coworkNativeTools(agent, false),
      perms,
      onTool: vi.fn(),
    });

    expect(resultB.text).toBe('Reply 2.');
    expect(seenInputs).toHaveLength(2);
    expect(seenInputs[1]?.threadId).toBeUndefined();
    expect(store.nativeCodexSession(sessionKey)?.cwd).toBe(realpathSync(rootB));
    expect(store.nativeCodexSession(sessionKey)?.threadId).toBe('native-thread-2');
  });

  it('renders Default workspace (General) in Cowork project pill, clears selection on click, and stays cleared across reloads', async () => {
    const createMenuEl = () => {
      const buttons: any[] = [];
      const el: Record<string, any> = {
        innerHTML: '',
        hidePopover: vi.fn(),
        querySelectorAll: (selector?: string) => {
          const matched: any[] = [];
          for (const m of el.innerHTML.matchAll(/<button\b([^>]*)>/g)) {
            const rawAttrs = m[1] || '';
            const attrs: Record<string, string> = {};
            const dataset: Record<string, string> = {};
            for (const a of rawAttrs.matchAll(/\b(data-[a-z0-9-]+)="([^"]*)"/gi)) {
              const name = a[1];
              const value = a[2];
              attrs[name] = value;
              const camel = name.slice(5).replace(/-([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
              dataset[camel] = value;
            }
            if (selector && selector.includes('data-cwproj-idx') && !('data-cwproj-idx' in attrs)) continue;
            if (selector && selector.includes('data-cwproj-action') && !('data-cwproj-action' in attrs)) continue;
            if (selector && selector.includes('data-cwproj-path') && !('data-cwproj-path' in attrs)) continue;
            const stub: Record<string, any> = {
              dataset,
              getAttribute: (key: string) => attrs[key] ?? null,
              _listeners: [] as Array<() => unknown>,
              _onclick: null as (() => unknown) | null,
              addEventListener: (ev: string, fn: () => unknown) => {
                if (ev === 'click') stub._listeners.push(fn);
              },
              set onclick(fn: (() => unknown) | null) {
                stub._onclick = fn;
              },
              get onclick() {
                return stub._onclick;
              },
            };
            buttons.push(stub);
            matched.push(stub);
          }
          return matched;
        },
        buttons,
      };
      return el;
    };

    const cwState: Record<string, any> = {
      active: 'chat',
      convs: [],
      msgs: [],
      workbench: undefined,
      activeProjectPath: '/workspace/demo-app',
      projects: [{ name: 'demo-app', path: '/workspace/demo-app' }],
    };
    const S: Record<string, any> = {
      active: 'cowork',
      lastProjectPath: '/workspace/demo-app',
      settings: { projectPath: '/workspace/demo-app' },
      cw: cwState,
    };
    const menuEl = createMenuEl();
    const elements: Record<string, any> = {
      cwProjectBtn: { title: '', innerHTML: '' },
      cwProjectMenu: menuEl,
    };
    const persist = vi.fn();
    const toast = vi.fn();
    const api = vi.fn(async () => ({ ok: true }));
    const context = createContext({
      S,
      cwEnsure: () => cwState,
      cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
      $: (id: string) => elements[id] || null,
      esc: (v: unknown) => String(v ?? ''),
      cwIcon: (name: string) => `[${name}]`,
      toast,
      persist,
      updateProjChip: vi.fn(),
      api,
    });
    new Script(COWORK_WORKBENCH_JS).runInContext(context);

    context.cwRenderProjectPill();

    expect(elements.cwProjectBtn.innerHTML).toContain('demo-app');
    expect(menuEl.innerHTML).toContain('Default workspace (General)');
    expect(menuEl.innerHTML).toContain('data-cwproj-action="clear"');

    const clearBtn = menuEl.buttons.find((btn: any) => btn.dataset.cwprojAction === 'clear');
    expect(clearBtn).toBeTruthy();
    if (clearBtn._onclick) await clearBtn._onclick();
    for (const listener of clearBtn._listeners) await listener();
    await Promise.resolve();

    expect(S.settings.projectPath).toBe('');
    expect(S.lastProjectPath).toBe('');
    expect(persist).toHaveBeenCalled();
    expect(cwState.activeProjectPath).toBe('');
    expect(cwState.projectCleared).toBe(true);
    expect(elements.cwProjectBtn.innerHTML).toContain('Default workspace');
    expect(menuEl.innerHTML).toContain('Default workspace (General)');
    expect(menuEl.innerHTML).toContain('Active');
    expect(toast).toHaveBeenCalledWith('Switched to Default workspace (General)');
    expect(api).toHaveBeenCalledWith(
      '/api/model-selection',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '' }),
      }),
    );

    // Reloading on a single-project workspace respects explicit projectCleared=true
    const reloadCwState: Record<string, any> = { active: 'chat', convs: [], msgs: [], workbench: undefined, activeProjectPath: '' };
    const reloadS: Record<string, any> = { active: 'cowork', settings: { projectPath: '' }, cw: reloadCwState };
    const reloadElements: Record<string, any> = {
      cwProjectBtn: { title: '', innerHTML: '' },
      cwProjectMenu: createMenuEl(),
    };
    const reloadApi = vi.fn(async (url: string, opts?: any) => {
      if (url === '/api/projects') return { projects: [{ name: 'solo-repo', path: '/workspace/solo-repo' }] };
      if (url === '/api/model-selection' && !opts) return { projectCleared: true };
      return { ok: true };
    });
    const reloadContext = createContext({
      S: reloadS,
      cwEnsure: () => reloadCwState,
      cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
      $: (id: string) => reloadElements[id] || null,
      esc: (v: unknown) => String(v ?? ''),
      cwIcon: (name: string) => `[${name}]`,
      toast: vi.fn(),
      updateProjChip: vi.fn(),
      api: reloadApi,
    });
    new Script(COWORK_WORKBENCH_JS).runInContext(reloadContext);

    await reloadContext.cwLoadProjectsList();

    expect(reloadS.settings.projectPath).toBe('');
    expect(reloadCwState.activeProjectPath).toBe('');
    expect(reloadCwState.projectCleared).toBe(true);
    expect(reloadElements.cwProjectBtn.innerHTML).toContain('Default workspace');
    expect(reloadApi).not.toHaveBeenCalledWith(
      '/api/model-selection',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('auto-persists a single workspace project via /api/model-selection when none was saved yet', async () => {
    const cwState: Record<string, any> = { active: 'chat', convs: [], msgs: [], workbench: undefined, activeProjectPath: '' };
    const S: Record<string, any> = { active: 'cowork', settings: { projectPath: '' }, cw: cwState };
    const elements: Record<string, any> = {
      cwProjectBtn: { title: '', innerHTML: '' },
      cwProjectMenu: { innerHTML: '', querySelectorAll: () => [], hidePopover: vi.fn() },
    };
    const api = vi.fn(async (url: string, opts?: any) => {
      if (url === '/api/projects') return { projects: [{ name: 'solo-repo', path: '/workspace/solo-repo' }] };
      if (url === '/api/model-selection' && !opts) return {};
      return { ok: true };
    });
    const context = createContext({
      S,
      cwEnsure: () => cwState,
      cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
      $: (id: string) => elements[id] || null,
      esc: (v: unknown) => String(v ?? ''),
      cwIcon: (name: string) => `[${name}]`,
      toast: vi.fn(),
      updateProjChip: vi.fn(),
      api,
    });
    new Script(COWORK_WORKBENCH_JS).runInContext(context);

    await context.cwLoadProjectsList();

    expect(S.settings.projectPath).toBe('/workspace/solo-repo');
    expect(api).toHaveBeenCalledWith(
      '/api/model-selection',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '/workspace/solo-repo' }),
      }),
    );
  });

  it('persists the Cowork project pill selection with a JSON content-type the server accepts', async () => {
    const cwState: Record<string, any> = { active: 'chat', convs: [], msgs: [], workbench: undefined, activeProjectPath: '' };
    const S: Record<string, any> = { active: 'cowork', settings: { projectPath: '' }, cw: cwState };
    const elements: Record<string, any> = {
      cwProjectBtn: { title: '', innerHTML: '' },
      cwProjectMenu: { innerHTML: '', querySelectorAll: () => [], hidePopover: vi.fn() },
    };
    const api = vi.fn(async () => ({ ok: true }));
    const context = createContext({
      S,
      cwEnsure: () => cwState,
      cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
      $: (id: string) => elements[id] || null,
      esc: (v: unknown) => String(v ?? ''),
      cwIcon: (name: string) => `[${name}]`,
      toast: vi.fn(),
      persist: vi.fn(),
      updateProjChip: vi.fn(),
      api,
    });
    new Script(COWORK_WORKBENCH_JS).runInContext(context);

    context.cwSyncActiveProject('/workspace/picked-folder', 'picked-folder');
    await Promise.resolve();

    // A body sent without this header is labelled text/plain by fetch, which
    // /api/model-selection rejects — the UI pill moved but the agent kept
    // reading the previously selected project.
    expect(api).toHaveBeenCalledWith(
      '/api/model-selection',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify({ projectPath: '/workspace/picked-folder' }),
      }),
    );
  });

  it('rejects a project selection body sent without the JSON content-type', async () => {
    const home = makeDir('cowork-ctype-home-');
    process.env.AGENT_GITU_HOME = home;
    const server = new GituServer({ cwd: home, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
    servers.push(server);
    const origin = 'http://127.0.0.1:' + (await server.start());

    const response = await fetch(origin + '/api/model-selection', {
      method: 'POST',
      body: JSON.stringify({ projectPath: home }),
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error).toContain('Content-Type must be application/json');
  });

  it('wires #browseClear in folder-picker.js to switch back to Default workspace only in project selection mode', async () => {
    const folderPickerSource = readFileSync(
      path.join(process.cwd(), 'src', 'server', 'ui-assets', 'scripts', 'folder-picker.js'),
      'utf8',
    );
    const elements: Record<string, any> = {};
    const getEl = (id: string) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          hidden: false,
          disabled: false,
          textContent: '',
          innerHTML: '',
          value: '',
          style: {},
          classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
          addEventListener: vi.fn(),
          querySelectorAll: () => [],
          onclick: null,
        };
      }
      return elements[id];
    };
    const cwState: Record<string, any> = { activeProjectPath: '/workspace/demo-app' };
    const S: Record<string, any> = {
      active: 'home',
      lastProjectPath: '/workspace/demo-app',
      settings: { projectPath: '/workspace/demo-app' },
      sessions: { 'run-1': { session: { projectPath: '/workspace/demo-app' } } },
      browseData: { path: '/workspace/demo-app', parent: '/workspace', entries: [] },
    };
    const persist = vi.fn();
    const toast = vi.fn();
    const openHome = vi.fn();
    const cwSyncActiveProject = vi.fn();
    const api = vi.fn(async (url: string, opts?: any) => {
      if (!opts && String(url).includes('/api/')) return { path: '/workspace', parent: '/', entries: [] };
      return { ok: true };
    });

    const context = createContext({
      S,
      $: getEl,
      api,
      toast,
      persist,
      esc: (v: unknown) => String(v ?? ''),
      basename: (p: string) => p.split('/').filter(Boolean).pop() || '',
      effectiveProjectPath: () => S.settings.projectPath || S.lastProjectPath || '',
      homeSelectProject: vi.fn(),
      openHome,
      cwSyncActiveProject,
      cwEnsure: () => cwState,
      renderTaggedFolders: vi.fn(),
    });
    new Script(folderPickerSource).runInContext(context);

    // Hidden when tagging or inspecting a run
    S.active = 'run-1';
    context.openFolderBrowser('tag', 'run-1');
    expect(getEl('browseClear').hidden).toBe(true);
    context.openFolderBrowser('inspect', 'run-1');
    expect(getEl('browseClear').hidden).toBe(true);

    // Visible in project selection mode and clears active project on click
    S.active = 'home';
    context.openFolderBrowser();
    expect(getEl('browseClear').hidden).toBe(false);
    expect(typeof getEl('browseClear').onclick).toBe('function');

    await getEl('browseClear').onclick();
    await Promise.resolve();

    expect(S.settings.projectPath).toBe('');
    expect(S.lastProjectPath).toBe('');
    expect(persist).toHaveBeenCalled();
    expect(cwSyncActiveProject).toHaveBeenCalledWith('', '', true);
    expect(cwState.projectCleared).toBe(true);
    expect(getEl('browseModal').hidden).toBe(true);
    expect(openHome).toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith(
      '/api/model-selection',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectPath: '' }),
      }),
    );
  });
});
