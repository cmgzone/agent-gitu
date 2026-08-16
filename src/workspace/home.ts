import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readJson, writeJson } from '../util.js';

export interface HermesHome {
  root: string;
  projects: string;
  workspace: string;
  sessions: string;
  settings: string;
  cache: string;
}

export function homeEnvOverride(): string | undefined {
  return process.env['AGENT_GITU_HOME'] ?? process.env['HERMES_HOME_DIR'];
}

export function hermesHomeRoot(): string {
  return homeEnvOverride() ?? path.join(os.homedir(), 'AgentGitu');
}

function mergeLegacyInto(root: string, legacy: string): void {
  for (const sub of ['Projects', 'Workspace', 'Settings', 'Cache']) {
    try {
      cpSync(path.join(legacy, sub), path.join(root, sub), { recursive: true, force: false });
    } catch {
      /* best effort */
    }
  }
  const destDb = path.join(root, 'Sessions', 'hermes.db');
  const oldDb = path.join(legacy, 'Sessions', 'hermes.db');
  try {
    if (!existsSync(destDb) && existsSync(oldDb)) {
      cpSync(oldDb, destDb);
    } else if (existsSync(destDb) && existsSync(oldDb)) {
      const d = new DatabaseSync(destDb);
      d.exec(`ATTACH DATABASE '${oldDb.replace(/'/g, "''")}' AS old`);
      d.exec(`INSERT OR IGNORE INTO main.sessions SELECT * FROM old.sessions`);
      d.exec(`INSERT OR IGNORE INTO main.events SELECT * FROM old.events`);
      d.exec(`DETACH DATABASE old`);
      healPaths(d, legacy, root);
      d.close();
    } else if (existsSync(destDb)) {
      const d = new DatabaseSync(destDb);
      healPaths(d, legacy, root);
      d.close();
    }
  } catch {
    /* best effort */
  }
}

function healPaths(d: DatabaseSync, legacy: string, root: string): void {
  d.prepare(`UPDATE sessions SET projectPath = ? || substr(projectPath, ?) WHERE projectPath LIKE ?`).run(
    root,
    legacy.length + 1,
    `${legacy}\\%`,
  );
}

export function ensureHermesHome(): HermesHome {
  let root = hermesHomeRoot();
  if (!homeEnvOverride()) {
    const legacies = [path.join(os.homedir(), 'Hermes'), process.env['HERMES_HOME']].filter(
      (c): c is string => Boolean(c && path.resolve(c) !== path.resolve(root)),
    );
    if (!existsSync(root)) {
      const first = legacies.find((c) => existsSync(c));
      if (first) {
        try {
          renameSync(first, root);
          const db = path.join(root, 'Sessions', 'hermes.db');
          if (existsSync(db)) {
            const d = new DatabaseSync(db);
            healPaths(d, first, root);
            d.close();
          }
        } catch {
          root = first;
        }
      }
    }
    for (const legacy of legacies) {
      if (existsSync(legacy) && path.resolve(legacy) !== path.resolve(root)) {
        mergeLegacyInto(root, legacy);
        try {
          renameSync(legacy, `${legacy}.migrated`);
        } catch {
          /* leave it */
        }
      }
    }
  }
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
  const marker = path.join(home.workspace, 'package.json');
  const fresh = !existsSync(marker);
  const pkg = fresh
    ? { name: 'agent-gitu-workspace', version: '0.1.0', private: true, description: 'Default Agent Gitu scratch project', scripts: { test: 'node --version' } }
    : (() => {
        try {
          const data = JSON.parse(readFileSync(marker, 'utf8')) as Record<string, unknown>;
          if (data['name'] === 'hermes-workspace') {
            data['name'] = 'agent-gitu-workspace';
            data['description'] = 'Default Agent Gitu scratch project';
          }
          return data;
        } catch {
          return { name: 'agent-gitu-workspace', private: true, scripts: { test: 'node --version' } };
        }
      })();
  if (fresh || pkg['name'] === 'agent-gitu-workspace') {
    writeFileSync(marker, `${JSON.stringify(pkg, null, 2)}\n`);
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
