import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export class CodingProjectSelectionError extends Error {
  constructor(message: string, readonly candidates: string[]) { super(message); this.name = 'CodingProjectSelectionError'; }
}

/** Keep an explicit private project consistent across the brief and handoff. */
export function privateProjectForCoding(projectPath?: string, goal = ''): string {
  const normalize = (value: string): string => {
    if (/[\u0000\r\n\\]/.test(value)) throw new Error('Use a Linux project path inside /workspace.');
    const result = path.posix.resolve('/workspace', value);
    if (result !== '/workspace' && !result.startsWith('/workspace/')) throw new Error('Private projects must stay inside /workspace.');
    return result;
  };
  const named = [...goal.matchAll(/\b(?:work(?:ing)?\s+(?:in|at)|(?:project|repository)(?:\s+(?:folder|directory|path|at|in))?\s*[:=]?)\s+["'`]?((?:\/workspace)(?:\/[^\s"'`,;)\]]+)+)/gi)]
    .map(match => normalize(match[1]!.replace(/[.:]+$/, '')));
  const folders = [...new Set(named)];
  const selected = projectPath ? normalize(projectPath) : '/workspace';
  if (folders.length > 1 && !projectPath) throw new CodingProjectSelectionError('The task names several project folders. Ask the user which project folder to use before coding.', folders);
  if (folders.length === 1 && selected !== '/workspace' && selected !== folders[0]) throw new CodingProjectSelectionError(`Folder mismatch: the task names ${folders[0]}, but projectPath is ${selected}. Ask the user to confirm the intended repository before coding.`, [folders[0]!, selected]);
  return selected === '/workspace' && folders.length === 1 ? folders[0]! : selected;
}

/** Relative private tools use the task folder, not the desktop's generic root. */
export function privateCodingToolParams(folder: string, tool: string, params: Record<string, unknown>): Record<string, unknown> {
  const root = privateProjectForCoding(folder);
  if (tool === 'run_command' && typeof params['command'] === 'string') {
    const quoted = "'" + root.replaceAll("'", "'\"'\"'") + "'";
    return { ...params, command: `cd ${quoted} && (\n${params['command']}\n)` };
  }
  if (['list_files', 'read_file', 'search_files', 'write_file', 'apply_edit', 'share_file'].includes(tool)) {
    const value = typeof params['path'] === 'string' ? params['path'] : '.';
    if (!path.posix.isAbsolute(value)) return { ...params, path: path.posix.resolve(root, value) };
  }
  return params;
}
/** Never silently substitute a remembered folder when the task identifies a
 * different project or several plausible project roots. */
export function projectForCoding(base: string, goal: string, selected?: string): string {
  const projects = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'))
    .filter((entry) => {
      const root = path.join(base, entry.name);
      if (!['package.json', '.git', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pubspec.yaml'].some((marker) => existsSync(path.join(root, marker)))) return false;
      const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-zA-Z0-9_-])' + escaped + '($|[^a-zA-Z0-9_-])', 'i').test(goal);
    });
  const candidates = projects.map(project => realpathSync(path.join(base, project.name)));
  if (candidates.length > 1) throw new CodingProjectSelectionError('The task names several project folders. Ask the user to select the intended project before continuing.', candidates);
  if (selected && (!existsSync(selected) || !statSync(selected).isDirectory())) throw new CodingProjectSelectionError('The remembered or requested project folder is missing. Ask the user to select the correct folder; do not fall back to another project.', candidates);
  const current = selected ? realpathSync(selected) : undefined;
  if (candidates.length === 1 && current && candidates[0] !== current) throw new CodingProjectSelectionError(`Folder mismatch: the task identifies ${candidates[0]}, but the selected project is ${current}. Ask the user to choose the correct folder before continuing.`, [candidates[0]!, current]);
  return candidates[0] ?? current ?? base;
}
