import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ChromeProfileSession } from '../src/browser/chrome-profile.js';
import { CoworkStore, type CoworkAgent } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { runConversationTurn } from '../src/cowork/runner.js';
import { ScriptedMockLlm, type LlmClient, type LlmTurnResult } from '../src/llm/llm.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { GituServer } from '../src/server/server.js';
import type { ToolContext } from '../src/tools/tools.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import { SshConnectionRegistry } from '../src/connections/ssh-connections.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function fixture() {
  const home = mkdtempSync(path.join(tmpdir(), 'browser-identity-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const root = path.join(home, 'Settings', 'ChromeProfiles');
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, 'location.json'), JSON.stringify({ version: 1, locationId: 'vps-fixture' }));
  const resolve = vi.fn(() => { throw new Error('Metadata must not connect to the private Chrome desktop'); });
  const chrome = new ChromeProfileSession(root, 'fixture-owner', () => [{ id: 'vps-fixture', label: 'Signed-in VPS Chrome' }], resolve);
  vi.spyOn(chrome, 'snapshot').mockReturnValue({ state: 'running', locationId: 'vps-fixture', locations: [{ id: 'vps-fixture', label: 'Signed-in VPS Chrome' }] });
  const server = new GituServer({ passwordRequired: false, cwd: home, port: 0, chromeProfile: chrome, llm: new ScriptedMockLlm([]) });
  cleanups.push(async () => { await server.stop(); await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const store = new CoworkStore();
  const agent = store.saveAgent({ name: 'P.A', systemPrompt: 'Help the user.', useHostComputer: true, allowShell: true });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const service = server as unknown as { coworkToolContext(agent: CoworkAgent): ToolContext; coworkComputerContext(agent: CoworkAgent): string };
  return { server, store, agent, conversation, service, resolve };
}

const perms = { allowShell: true, allowWrites: false, allowConfig: false, chief: false, browser: true };

it('keeps ordinary computer tools usable before an owner account or Chrome profile exists', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'browser-no-account-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const server = new GituServer({ passwordRequired: false, cwd: home, port: 0 });
  cleanups.push(async () => { await server.stop(); await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const store = new CoworkStore(), agent = store.saveAgent({ name: 'P.A', systemPrompt: 'Help.', useHostComputer: true });
  const ctx = (server as unknown as { coworkToolContext(agent: CoworkAgent): ToolContext }).coworkToolContext(agent);
  expect(ctx.computerContext?.()).toContain('installation-host');
  expect(ctx.computerContext?.()).not.toContain('owner-private-chrome');
  const result = await executeCoworkTool(ctx, 'computer_status', {}, perms, { store, agent });
  expect(result.ok).toBe(true);
  expect(result.output).toContain('installation host');
});

it('identifies the actual host browser and the separate private VPS profile without opening it', async () => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  const result = await executeCoworkTool(ctx, 'computer_status', {}, perms, { store: f.store, agent: f.agent, conversationId: f.conversation.id });
  expect(result.ok).toBe(true);
  expect(result.output).toContain('installation host');
  expect(result.output).toContain('"platform":"' + process.platform + '"');
  expect(result.output).toContain('Signed-in VPS Chrome');
  expect(result.output).toContain('"agentAccess":false');
  expect(result.output).toContain('not inspected; separate profile');
  expect(f.resolve).not.toHaveBeenCalled();
});

it('explains the private-browser mismatch when a host teammate requests a desktop screenshot', async () => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  const result = await executeCoworkTool(ctx, 'desktop_screenshot', {}, perms, { store: f.store, agent: f.agent, conversationId: f.conversation.id });
  expect(result.ok).toBe(false);
  expect(result.output).toContain('login is not shared');
  expect(result.output).toContain('Signed-in VPS Chrome');
  expect(f.resolve).not.toHaveBeenCalled();
});

it('distinguishes an assigned remote desktop and keeps owner Chrome metadata out of company contexts', () => {
  const f = fixture();
  const remote = { ...f.agent, useHostComputer: false, cloudConnectionId: 'vps-agent' };
  const personal = f.service.coworkComputerContext(remote);
  expect(personal).toContain('remote-linux-desktop');
  expect(personal).toContain('"platform":"linux"');
  expect(personal).toContain('desktop_screenshot/desktop_input');
  const company = f.service.coworkComputerContext({ ...remote, companyId: 'company-fixture' });
  expect(company).not.toContain('Signed-in VPS Chrome');
  expect(company).not.toContain('"ownerChrome"');
  expect(f.resolve).not.toHaveBeenCalled();
});

it('gives the current browser identities to the model on a login-confirmation turn', async () => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  let prompt = '';
  const llm = new ScriptedMockLlm([(_n, messages) => {
    prompt = messages.map(message => message.content).join('\n');
    return 'Your sign-in is in the separate private VPS Chrome session.';
  }]);
  const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'I signed into Facebook on the Linux computer.' });
  await runConversationTurn({ conversation: f.conversation, history: [trigger], trigger,
    append: message => f.store.appendMessage(f.conversation.id, message),
    deps: { agents: [f.agent], resolveLlm: () => llm, toolContext: () => ctx, browser: true } });
  expect(prompt).toContain('CURRENT COMPUTER AND BROWSER IDENTITY');
  expect(prompt).toContain('host-agent-browser');
  expect(prompt).toContain('Signed-in VPS Chrome');
  expect(prompt).toContain('instead of checking an unrelated API');
  expect(f.resolve).not.toHaveBeenCalled();
});

it('refreshes computer identity instructions for the native coding-backed teammate too', async () => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  let instructions = '';
  const client = Object.assign(new ScriptedMockLlm([]), { nativeTask: {
    mode: 'codex-native' as const,
    runTurn: async (input: NativeTaskInput) => {
      instructions = input.instructions;
      input.onThread('browser-identity-thread');
      input.onTurn('browser-identity-turn');
      await input.onEvent('item/completed', { item: { id: 'reply', type: 'agentMessage', text: 'The VPS Chrome session is separate from my host browser.', phase: 'final_answer' } });
      return { threadId: 'browser-identity-thread', turnId: 'browser-identity-turn', status: 'completed' as const };
    },
  } });
  const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'I am signed in on the VPS Linux desktop.' });
  await runConversationTurn({ conversation: f.conversation, history: [trigger], trigger,
    append: message => f.store.appendMessage(f.conversation.id, message),
    deps: { agents: [f.agent], resolveLlm: () => client, toolContext: () => ctx, store: f.store, memory: CoworkMemory.forWorkspace(ctx.cwd), browser: true } });
  expect(instructions).toContain('CURRENT COMPUTER AND BROWSER IDENTITY');
  expect(instructions).toContain('host-agent-browser');
  expect(instructions).toContain('Signed-in VPS Chrome');
  expect(instructions).toContain('"agentAccess":false');
  expect(f.resolve).not.toHaveBeenCalled();
});

it('uses local commands and an explicit saved SSH server in one task without changing assignment', async () => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  const target = { id: 'ssh-test', label: 'School VPS', host: 'fixture.invalid', port: 22, username: 'fixture', hostFingerprint: 'fixture', createdAt: '', updatedAt: '', hasCredential: true };
  vi.spyOn(SshConnectionRegistry.prototype, 'list').mockReturnValue([target]);
  const execute = vi.spyOn(SshConnectionRegistry.prototype, 'execute').mockResolvedValue({ exitCode: 0, stdout: 'remote-fixture\n', stderr: '' });
  const scope = { store: f.store, agent: f.agent, conversationId: f.conversation.id };
  const status = await executeCoworkTool(ctx, 'computer_status', {}, perms, scope);
  expect(status.output).toContain('School VPS');
  expect(status.output).toContain('ssh-test');
  expect(status.output).toContain('SAME task');
  expect(execute).not.toHaveBeenCalled();
  const local = await executeCoworkTool(ctx, 'run_command', { command: 'echo LOCAL_FIXTURE' }, perms, scope);
  expect(local.ok).toBe(true);expect(local.output).toContain('LOCAL_FIXTURE');
  const remote = await executeCoworkTool(ctx, 'ssh_exec', { connectionId: target.id, command: 'hostname' }, perms, scope);
  expect(remote.ok).toBe(true);expect(remote.output).toContain('SSH computer: School VPS (ssh-test)');
  expect(remote.output).toContain('remote-fixture');
  expect(execute).toHaveBeenCalledWith('ssh-test', 'hostname');
  const localAgain = await executeCoworkTool(ctx, 'run_command', { command: 'echo LOCAL_AGAIN' }, perms, scope);
  expect(localAgain.ok).toBe(true);expect(localAgain.output).toContain('LOCAL_AGAIN');
  expect(f.store.getAgent(f.agent.id)?.useHostComputer).toBe(true);
  expect(f.store.getAgent(f.agent.id)?.cloudConnectionId).toBeUndefined();
  expect((await executeCoworkTool(ctx, 'ssh_exec', { connectionId: target.id, command: 'hostname' }, { ...perms, allowShell: false }, scope)).ok).toBe(false);
  expect((await executeCoworkTool(ctx, 'ssh_exec', { connectionId: target.id, command: 'hostname' }, perms, { ...scope, agent: { ...f.agent, companyId: 'company-fixture' } })).ok).toBe(false);
  expect((await executeCoworkTool(ctx, 'ssh_exec', { connectionId: 'unknown-server', command: 'hostname' }, perms, scope)).ok).toBe(false);
  expect((await executeCoworkTool(ctx, 'ssh_exec', { connectionId: target.id, command: 'npm test' }, perms, { ...scope, delegation: {} as never })).output).toContain('Main Agent Gitu owns repository coding');
  expect(execute).toHaveBeenCalledOnce();
  expect(f.service.coworkComputerContext({ ...f.agent, companyId: 'company-fixture' })).not.toContain('School VPS');
  expect(f.service.coworkComputerContext({ ...f.agent, allowShell: false })).not.toContain('School VPS');
});

it.each(['native-functions', 'structured-text'] as const)('uses the shared local/SSH/Chrome tools through a non-Codex %s provider', async protocol => {
  const f = fixture(), ctx = f.service.coworkToolContext(f.agent);
  const target = { id: 'ssh-test', label: 'School VPS', host: 'fixture.invalid', port: 22, username: 'fixture', hostFingerprint: 'fixture', createdAt: '', updatedAt: '', hasCredential: true };
  vi.spyOn(SshConnectionRegistry.prototype, 'list').mockReturnValue([target]);
  const ssh = vi.spyOn(SshConnectionRegistry.prototype, 'execute').mockResolvedValue({ exitCode: 0, stdout: 'REMOTE_PROVIDER_FIXTURE', stderr: '' });
  ctx.computerContext = () => 'CURRENT COMPUTER AND BROWSER IDENTITY: assigned installation host; ownerChrome.agentAccess=true for this chat; ssh-test available.';
  const desktop = vi.fn(async () => ({ ok: true, output: 'SHARED_CHROME_PROVIDER_FIXTURE' }));
  ctx.sharedBrowserTool = desktop;
  const calls = [
    { id: 'local', name: 'run_command', arguments: { command: 'echo LOCAL_PROVIDER_FIXTURE' } },
    { id: 'remote', name: 'ssh_exec', arguments: { connectionId: 'ssh-test', command: 'hostname' } },
    { id: 'chrome', name: 'desktop_screenshot', arguments: {} },
  ];
  let rounds = 0;
  const next = (messages: import('../src/llm/llm.js').LlmMessage[]): LlmTurnResult => {
    if (++rounds === 1) {
      expect(String(messages[0]?.content)).toContain('ownerChrome.agentAccess=true');
      return protocol === 'native-functions' ? { kind: 'tool_calls', calls, metadata: {} } : { kind: 'text', text: calls.map(call => '<tool>' + JSON.stringify({ name: call.name, params: call.arguments }) + '</tool>').join('\n'), metadata: {} };
    }
    const evidence = JSON.stringify(messages);
    for (const expected of ['LOCAL_PROVIDER_FIXTURE', 'REMOTE_PROVIDER_FIXTURE', 'SHARED_CHROME_PROVIDER_FIXTURE']) expect(evidence).toContain(expected);
    return { kind: 'text', text: 'Checked the local computer, SSH server and shared Chrome.\n<cowork_state>done</cowork_state>', metadata: {} };
  };
  const llm: LlmClient = protocol === 'native-functions' ? { name: 'standard-compatible-provider', complete: async () => JSON.stringify({ state: 'done', reason: 'Verified tool results.' }), completeTurn: async (messages, options) => {
    expect(options?.tools?.some(tool => tool.name === 'ssh_exec')).toBe(true);
    expect(options?.tools?.some(tool => tool.name === 'desktop_screenshot')).toBe(true);
    return next(messages);
  } } : { name: 'text-compatible-provider', complete: async messages => {
    const result = next(messages);
    if (result.kind !== 'text') throw new Error('Expected text tool protocol.');
    return result.text;
  } };
  const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Check my local computer, SSH server and the Chrome session I handed over.' });
  const result = await runConversationTurn({ conversation: f.conversation, trigger, history: [trigger],
    deps: { agents: [f.agent], resolveLlm: () => llm, toolContext: () => ctx, store: f.store, memory: CoworkMemory.forWorkspace(ctx.cwd), autoLearn: false, browser: true },
    append: message => f.store.appendMessage(f.conversation.id, message) });
  expect(result.error).toBeUndefined();expect(ssh).toHaveBeenCalledOnce();expect(desktop).toHaveBeenCalledOnce();
  expect(f.store.getAgent(f.agent.id)?.useHostComputer).toBe(true);
});
