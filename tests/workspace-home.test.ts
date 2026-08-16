import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { HermesServer } from '../src/server/server.js';
import { createProject, ensureHermesHome, isDriveRoot, projectsDir } from '../src/workspace/home.js';

let homeDir: string;

beforeEach(() => {
  homeDir = mkdtempSync(path.join(tmpdir(), 'hermes-home-'));
  process.env.HERMES_HOME_DIR = homeDir;
});

afterEach(() => {
  delete process.env.HERMES_HOME_DIR;
});

describe('Hermes home', () => {
  it('creates the full folder tree on first launch', () => {
    const home = ensureHermesHome();
    expect(home.root).toBe(homeDir);
    for (const dir of [home.root, home.projects, home.workspace, home.sessions, home.settings, home.cache]) {
      expect(existsSync(dir)).toBe(true);
    }
    expect(existsSync(path.join(homeDir, 'Projects'))).toBe(true);
    expect(existsSync(path.join(homeDir, 'Settings'))).toBe(true);
  });

  it('creates new projects under Projects with a detectable package.json', () => {
    const first = createProject('My Cool Project');
    expect(first.path).toBe(path.join(homeDir, 'Projects', 'my-cool-project'));
    expect(existsSync(path.join(first.path, 'package.json'))).toBe(true);
    const lock = ProjectGuard.detect(first.path).lock;
    expect(lock.repoRoot).toBe(first.path);

    const second = createProject('My Cool Project');
    expect(second.name).toBe('my-cool-project-2');
  });

  it('defaults the projects dir to <home>/Projects and rejects drive roots', () => {
    expect(projectsDir()).toBe(path.join(homeDir, 'Projects'));
    expect(isDriveRoot('C:\\')).toBe(true);
    expect(isDriveRoot(path.join(homeDir, 'Projects'))).toBe(false);
  });
});

describe('home API', () => {
  it('creates projects over HTTP and manages the workspace location', async () => {
    const server = new HermesServer({ cwd: homeDir, port: 0, llm: new ScriptedMockLlm([]) });
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;
    try {
      const home = await fetch(`${base}/api/home`).then((r) => r.json());
      expect(home.projectsPath).toBe(path.join(homeDir, 'Projects'));

      const created = await fetch(`${base}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'demo app' }),
      }).then((r) => r.json());
      expect(created.path).toBe(path.join(homeDir, 'Projects', 'demo-app'));
      expect(existsSync(path.join(created.path, 'package.json'))).toBe(true);

      const bad = await fetch(`${base}/api/home/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectsPath: 'C:\\' }),
      });
      expect(bad.status).toBe(400);

      const custom = path.join(homeDir, 'MyProjects');
      const moved = await fetch(`${base}/api/home/workspace`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectsPath: custom }),
      }).then((r) => r.json());
      expect(moved.projectsPath).toBe(custom);
      expect(existsSync(custom)).toBe(true);
    } finally {
      await server.stop();
    }
  });
});
