import { loadWorkspaceSettings, updateWorkspaceSettings } from './home.js';

export function codingPermissions() {
  const access = loadWorkspaceSettings().codingAccess;
  return { access: access ?? 'ask', configured: access !== undefined };
}

export function codingAutoApprove(legacyRequest?: unknown): boolean {
  const saved = codingPermissions();
  return saved.configured ? saved.access === 'full' : legacyRequest === true;
}

export function saveCodingPermissions(access: unknown) {
  if (access !== 'ask' && access !== 'full') throw Error('Choose ask or full coding access.');
  updateWorkspaceSettings({ codingAccess: access });
  return codingPermissions();
}
