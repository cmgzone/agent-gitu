import { UnsupportedConnectionAuthError } from './structured-auth.js';

/** A coding handoff contains public configuration only. Do not accept raw
 * provider errors, credential fields or vault values as repair context. */
export function connectionCodeRepair(error: unknown, context: { baseUrl?: string; documentationUrl?: string }) {
  if (!(error instanceof UnsupportedConnectionAuthError)) return undefined;
  const safeUrl = (value?: string) => {
    try { const url = new URL(value ?? ''); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : undefined; }
    catch { return undefined; }
  };
  const baseUrl = safeUrl(context.baseUrl), documentationUrl = safeUrl(context.documentationUrl);
  return {
    status: 'CONNECTOR_CODE_REQUIRED', owner: 'Main Agent Gitu', nextTool: 'gitu_task', feature: error.feature,
    goal: [
      'Repair an unsupported connection authentication feature in the authorized connector source repository.',
      `Missing implementation: ${error.feature}.`,
      ...(baseUrl ? ['API address: ' + baseUrl] : []), ...(documentationUrl ? ['Official documentation to verify: ' + documentationUrl] : []),
      'Cowork has identified a code compatibility gap. Inspect official docs and the installed implementation; repair the existing connector without creating another integration.',
      'Use synthetic credentials and mocked token/API responses in tests. Never read, copy, print or request the live credential vault or browser secrets in the coding task.',
      'Preserve connection IDs, storage, assigned permissions and existing UI. Add regression tests for compatibility, expiry and sanitized failures. Report code and test evidence; deployment remains with Cowork under existing authorization.',
      'Use the source project already authorized for this task. If its folder or repository identity does not match the task, stop and ask the user to select the correct folder before continuing. Never silently reuse another project. If location/access is missing, report that specific dependency; do not patch installed bundles or broaden filesystem access.',
    ].join('\n'),
    guidance: 'Cowork should delegate this implementation gap with gitu_task, then use the host connection_test for read-only verification. Do not ask for replacement credentials for a compatibility gap.',
  };
}
