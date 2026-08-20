import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * LanguageDetector — maps files and repositories to LSP languageIds.
 *
 * The primary path is extension-based (`languageIdForPath`). For repositories
 * without a well-known extension (or to enrich the status view), project
 * markers like `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or
 * `pom.xml` decide the language set (`detectLanguages`).
 */

const EXT_TABLE: Record<string, string> = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.java': 'java',
  '.cs': 'csharp',
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.html': 'html',
  '.htm': 'html',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
};

/** LanguageId -> config files / folder names that mark a repository as using it. */
const PROJECT_MARKERS: Record<string, string[]> = {
  typescript: ['tsconfig.json', 'tsconfig.base.json', 'jsconfig.json'],
  javascript: ['package.json'],
  python: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
  go: ['go.mod'],
  rust: ['Cargo.toml'],
  java: ['pom.xml', 'build.gradle', 'settings.gradle'],
  csharp: ['*.sln', '*.csproj'],
  cpp: ['CMakeLists.txt', 'Makefile', 'meson.build'],
  css: [],
};

/** Detect the languageId for a single file path (extension-based). */
export function languageIdForPath(file: string): string | undefined {
  const lower = file.split('?')[0]!.toLowerCase();
  const ext = lower.slice(Math.max(0, lower.lastIndexOf('.')));
  return EXT_TABLE[ext];
}

/** Detect the languageId for a single file path, preferring exact ext match. */
export function detectLanguageForFile(file: string): string | undefined {
  return languageIdForPath(file);
}

function markerExists(root: string, marker: string): boolean {
  if (marker.includes('*')) {
    try {
      return readdirHas(root, marker);
    } catch {
      return false;
    }
  }
  return existsSync(path.join(root, marker));
}

function readdirHas(root: string, glob: string): boolean {
  // Cheap glob: only support a leading `*.` prefix (e.g. "*.sln").
  const star = glob.indexOf('*');
  if (star !== 0) return false;
  const suffix = glob.slice(1);
  return readdirSync(root).some((name) => name.endsWith(suffix));
}

/** LanguageIds suggested by repository-level project markers. */
export function detectLanguages(repoRoot: string): string[] {
  const found: string[] = [];
  for (const [languageId, markers] of Object.entries(PROJECT_MARKERS)) {
    if (markers.some((m) => markerExists(repoRoot, m))) found.push(languageId);
  }
  return found;
}

/** Try to determine a project language for a file that has no known extension. */
export function languageForUnknownFile(repoRoot: string, file: string): string | undefined {
  if (languageIdForPath(file)) return undefined;
  const languages = detectLanguages(repoRoot);
  return languages[0];
}

/** JSON package marker content check: is this repo primarily TypeScript? */
export function isTypeScriptProject(repoRoot: string): boolean {
  if (existsSync(path.join(repoRoot, 'tsconfig.json'))) return true;
  const pkg = path.join(repoRoot, 'package.json');
  if (!existsSync(pkg)) return false;
  try {
    const data = JSON.parse(readFileSync(pkg, 'utf8')) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
    const all = { ...data.dependencies, ...data.devDependencies };
    return Boolean(all && (all['typescript'] || all['@types/node'] || all['tsx']));
  } catch {
    return false;
  }
}