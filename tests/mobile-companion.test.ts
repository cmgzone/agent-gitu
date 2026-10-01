import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { GituApi, mergeEvents, normalizeServerUrl } from '../apps/mobile/src/gitu/client.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { GituServer } from '../src/server/server.js';
import { companionAsset } from '../src/server/mobile-companion.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-companion-'));
const key = 'gitu-companion-integration-test-access-key';
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('OpenMuse companion transport', () => {
  it('rejects credential-bearing URLs and merges cursor gaps without losing or duplicating rows', () => {
    expect(normalizeServerUrl(' https://gitu.example/ ')).toBe('https://gitu.example');
    for (const url of ['file:///test', 'https://key@gitu.example', 'https://gitu.example/?key=secret', 'https://gitu.example/path']) {
      expect(() => normalizeServerUrl(url)).toThrow();
    }
    expect(
      mergeEvents(
        [
          { i: 0, t: '', text: 'first' },
          { i: 3, t: '', text: 'third' },
        ],
        [
          { i: 3, t: '', text: 'third' },
          { i: 8, t: '', text: 'last' },
        ],
      ).map((row) => row.i),
    ).toEqual([0, 3, 8]);
  });

  it('connects to the real authenticated server, restores chat, and protects concurrent file edits', async () => {
    const project = path.join(root, 'project');
    mkdirSync(project);
    writeFileSync(path.join(project, 'package.json'), '{"name":"companion-project"}');
    writeFileSync(path.join(project, 'note.txt'), 'Original note');
    const server = new GituServer({ passwordRequired: false, cwd: project, port: 0, accessKey: key, autoInstallLsp: false, llm: new ScriptedMockLlm([() => 'Hello from the Gitu server.']) });
    const port = await server.start();
    const api = new GituApi(`http://127.0.0.1:${port}`, key);
    try {
      await expect(new GituApi(api.baseUrl, 'wrong-key').connect()).rejects.toThrow(/key rejected/);
      await api.connect();
      expect(await api.projects()).toContainEqual({ name: 'companion-project', path: project });
      const started = await api.start('Say hello', project, 'chat');
      let page = await api.events(started.runId);
      const deadline = Date.now() + 15_000;
      while (page.session.status === 'running' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        page = await api.events(started.runId);
      }
      expect(page.session.status).toBe('completed');
      expect(page.events.some((row) => row.text.includes('Hello from the Gitu server.'))).toBe(true);
      expect((await api.events(started.runId, page.cursor)).events).toEqual([]);
      expect((await api.runs()).some((run) => run.runId === started.runId)).toBe(true);
      const file = await api.files(project, 'note.txt');
      expect(file.content).toBe('Original note');
      await api.saveFile(file, 'Edited on mobile');
      expect(readFileSync(path.join(project, 'note.txt'), 'utf8')).toBe('Edited on mobile');
      await expect(api.saveFile(file, 'Overwrite a newer edit')).rejects.toThrow(/changed/);
      await expect(api.files(project, '../outside.txt')).rejects.toThrow(/outside/);
      await expect(api.request('/api/mobile/files', { root: project, path: 'note.txt', revision: file.revision, content: 'Unreviewed' }, 'PUT')).rejects.toThrow(/Confirm/);
      const malicious = await fetch(`${api.baseUrl}/api/runs`, { headers: { Authorization: `Bearer ${key}`, Origin: 'https://evil.example' } });
      expect(malicious.status).toBe(403);
      expect((await fetch(`${api.baseUrl}/companion`, { redirect: 'manual' })).headers.get('location')).toBe('/companion/');
    } finally {
      await server.stop();
    }
  }, 30_000);
});

it('resolves real plan, question and approval gates through the mobile client', async () => {
  const project = path.join(root, 'gated-project');
  mkdirSync(project);
  writeFileSync(path.join(project, 'package.json'), '{"name":"mobile-gates","scripts":{"test":"node --version"}}');
  const action = (value: object) => () => JSON.stringify({ action: value });
  const server = new GituServer({ passwordRequired: false,
    cwd: project,
    port: 0,
    accessKey: key,
    autoInstallLsp: false,
    llm: new ScriptedMockLlm([
      action({ type: 'set_criteria', criteria: ['user decisions recorded'] }),
      action({ type: 'set_plan', steps: [{ description: 'Review user choices', verification: 'Recorded answers' }] }),
      action({ type: 'ask_user', questions: [{ question: 'Which environment?', options: ['Preview', 'Production'] }] }),
      action({
        type: 'tool_call',
        stepId: 'step-1',
        tool: 'run_command',
        params: { command: 'git push --force origin main' },
        reason: 'Exercise denied approval',
        expected: 'Must not execute',
      }),
      action({ type: 'request_block', reason: 'Dangerous action denied by the mobile user' }),
    ]),
  });
  const api = new GituApi(`http://127.0.0.1:${await server.start()}`, key);
  try {
    const { runId } = await api.request<{ runId: string }>('/api/runs', { goal: 'Review mobile decisions', projectPath: project, mode: 'fast', review: true });
    const wait = async (ready: (run: Awaited<ReturnType<GituApi['events']>>['session']) => boolean) => {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const page = await api.events(runId);
        if (ready(page.session)) return page.session;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Mobile gate did not arrive');
    };
    const review = await wait((run) => Boolean(run.pendingPlanReview));
    await api.review(review.pendingPlanReview!.id, true, 'Use the preview environment');
    const questions = await wait((run) => Boolean(run.pendingQuestions));
    await api.answer(questions.pendingQuestions!.id, 'Preview');
    const approval = await wait((run) => run.pendingApprovals.length > 0);
    const approvalId = approval.pendingApprovals[0]!.id;
    await api.approve(approvalId, false);
    const finished = await wait((run) => run.status !== 'running');
    expect(finished.status).toBe('blocked');
    await expect(api.approve(approvalId, true)).rejects.toThrow(/not found|resolved/);
    expect((await api.events(runId)).events.some((row) => row.text.includes('DENIED'))).toBe(true);
  } finally {
    await server.stop();
  }
}, 45_000);

describe('Companion public asset boundary', () => {
  it('serves exported assets and rejects traversal, hidden files and source maps', () => {
    const directory = path.join(root, 'export');
    mkdirSync(directory);
    writeFileSync(path.join(directory, 'index.html'), '<html>Companion shell</html>');
    writeFileSync(path.join(directory, 'main.js'), '/* public bundle */');
    writeFileSync(path.join(directory, 'main.js.map'), '{}');
    writeFileSync(path.join(root, 'private.html'), 'private');
    expect(companionAsset('/companion/', directory)?.mime).toContain('text/html');
    expect(companionAsset('/companion/main.js', directory)?.mime).toContain('javascript');
    for (const route of [
      '/companion/%2e%2e/private.html',
      '/companion/%2f..%2fprivate.html',
      '/companion/..\\private.html',
      '/companion/.env',
      '/companion/main.js.map',
      '/companion/%',
      '/unrelated/main.js',
    ]) {
      expect(companionAsset(route, directory)).toBeUndefined();
    }
  });
});
