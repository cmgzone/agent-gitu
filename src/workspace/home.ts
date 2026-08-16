import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from '../util.js';

export interface HermesHome {
  root: string;
  projects: string;
  workspace: string;
  sessions: string;
  settings: string;
  cache: string;
}

export function hermesHomeRoot(): string {
  return process.env['HERMES_HOME_DIR'] ?? path.join(os.homedir(), 'Hermes');
}

export function ensureHermesHome(): HermesHome {
  const root = hermesHomeRoot();
  const home: HermesHome = {
    root,
    projects: path.join(root, 'Projects'),
    workspace: path.join(root, 'Workspace'),
    sessions: path.join(root, 'Sessions'),
    settings: path.join(root, 'Settings'),
    cache: path.join(root, 'Cache'),
  };
  for (const dir of [home.root, home.projects, home.workspace, home.sessions, home.settings, home.cache]) {
    mkdirSync(dir, { recursive: true });
  }
  return home;
}

export interface WorkspaceSettings {
  projectsPath?: string;
}

function settingsFile(): string {
  return path.join(ensureHermesHome().settings, 'settings.json');
}

export function loadWorkspaceSettings(): WorkspaceSettings {
  const data = readJson<Record<string, unknown>>(settingsFile()) ?? {};
  const projectsPath = typeof data['projectsPath'] === 'string' && data['projectsPath'] ? String(data['projectsPath']) : undefined;
  return { projectsPath };
}

export function saveWorkspaceSettings(settings: WorkspaceSettings): void {
  writeJson(settingsFile(), settings);
}

export function isDriveRoot(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved === path.parse(resolved).root;
}

export function projectsDir(): string {
  const custom = loadWorkspaceSettings().projectsPath;
  if (custom && !isDriveRoot(custom)) {
    mkdirSync(custom, { recursive: true });
    return path.resolve(custom);
  }
  return ensureHermesHome().projects;
}

export function createProject(name: string): { path: string; name: string } {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Project name is required');
  const slug =
    trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project';
  const base = projectsDir();
  let dir = path.join(base, slug);
  let n = 2;
  while (existsSync(dir)) {
    dir = path.join(base, `${slug}-${n}`);
    n += 1;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: slug, version: '0.1.0', private: true, scripts: { test: 'node --version' } }, null, 2)}\n`,
  );
  return { path: dir, name: path.basename(dir) };
}
