import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
/** Match an explicitly named existing project; ambiguous briefs keep their original root. */
export function projectForCoding(base: string, goal: string, selected?: string): string {
  const projects = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'))
    .filter((entry) => {
      const root = path.join(base, entry.name);
      if (!['package.json', '.git', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pubspec.yaml'].some((marker) => existsSync(path.join(root, marker)))) return false;
      const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-zA-Z0-9_-])' + escaped + '($|[^a-zA-Z0-9_-])', 'i').test(goal);
    });
  if (projects.length === 1) return realpathSync(path.join(base, projects[0]!.name));
  return selected && existsSync(selected) && statSync(selected).isDirectory() ? realpathSync(selected) : base;
}
