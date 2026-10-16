import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { getWorkspaceFingerprint } from '../git/git.js';
import type { TaskLedgerData, VerificationScope } from '../types.js';

const complete = (fingerprint: string): boolean => fingerprint !== 'unknown-fp' && !fingerprint.startsWith('partial-');

/** A scope is an explicit dependency choice, like choosing a focused test.
 * Never trust model-supplied hashes or allow a scope outside the project. */
export async function captureVerificationScope(value: unknown, root: string, command?: string): Promise<VerificationScope | undefined> {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as { paths?: unknown; reason?: unknown };
  if (!Array.isArray(input.paths) || !input.paths.length || input.paths.length > 64 || typeof input.reason !== 'string' || !input.reason.trim()) return undefined;
  const paths: string[] = [];
  for (const entry of input.paths) {
    if (typeof entry !== 'string' || !entry.trim() || path.isAbsolute(entry) || /^[a-z]:/i.test(entry)) return undefined;
    const normalized = path.posix.normalize(entry.replace(/\\/g, '/')).replace(/\/$/, '');
    if (normalized === '..' || normalized.startsWith('../') || /(?:^|\/)(?:\.git|\.hermes|node_modules)(?:\/|$)/.test(normalized)) return undefined;
    if (!(await lstat(path.resolve(root, normalized)).catch(() => undefined))) return undefined;
    paths.push(normalized);
  }
  // Literal file/directory arguments are dependencies too, especially the
  // verification script itself. Its edits must invalidate its earlier pass.
  for (const token of command?.match(/"[^"]+"|'[^']+'|[^\s;&|]+/g) ?? []) {
    const candidate = token.replace(/^['"]|['"]$/g, '').replace(/\\/g, '/');
    if (!candidate || candidate.startsWith('-') || path.isAbsolute(candidate) || /^[a-z]:/i.test(candidate)) continue;
    const relative = path.posix.normalize(candidate);
    if (relative === '..' || relative.startsWith('../') || relative === '.' || /(?:^|\/)(?:\.git|\.hermes|node_modules)(?:\/|$)/.test(relative)) continue;
    if (await lstat(path.resolve(root, relative)).catch(() => undefined)) paths.push(relative);
  }
  const fingerprint = await getWorkspaceFingerprint(root, { paths });
  if (!complete(fingerprint)) return undefined;
  return { paths: [...new Set(paths)], reason: input.reason.trim().slice(0, 1200), fingerprint };
}

/** Revalidate scoped records without rewriting their original provenance. */
export async function refreshScopedVerification(data: Pick<TaskLedgerData, 'actions' | 'evidence'>, root: string, fingerprint: string): Promise<void> {
  const scopes = [...data.evidence, ...data.actions].flatMap((record) => record.verificationScope ? [record.verificationScope] : []);
  const hashes = new Map<string, string>();
  for (const scope of scopes) {
    if (complete(fingerprint) && scope.validatedFor === fingerprint) continue;
    scope.validatedFor = undefined;
    if (!complete(fingerprint)) continue;
    const key = JSON.stringify(scope.paths);
    if (!hashes.has(key)) {
      // Recheck loaded ledgers too; a scope must not become an arbitrary path read.
      const current = await captureVerificationScope(scope, root);
      hashes.set(key, current?.fingerprint ?? 'unknown-fp');
    }
    if (hashes.get(key) === scope.fingerprint) scope.validatedFor = fingerprint;
  }
  for (const evidence of data.evidence) if (evidence.verificationScope && evidence.workspaceFingerprint) {
    evidence.stale = evidence.workspaceFingerprint !== fingerprint && evidence.verificationScope.validatedFor !== fingerprint;
  }
}
