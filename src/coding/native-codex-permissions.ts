import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import type { NativeRecord } from '../llm/native-task.js';

export const NATIVE_PERMISSION_PROFILE = 'gitu-task';

/** Restricted native profile plus Gitu-enforced authorization for host tools. */
export function nativeCodexPermissions(guard: ProjectGuard, _ledger?: TaskLedger, _scopeFiles?: string[]): NativeRecord {
  // Native shell cannot preserve Gitu's per-command policy on every supported
  // host. Codex therefore owns the loop while its application tools execute
  // through Gitu. All built-in OS effects are disabled and denied separately.
  const workspace: NativeRecord = { '.': 'read', '.hermes': 'deny', '.git': 'deny' };
  const config: NativeRecord = {
    default_permissions: NATIVE_PERMISSION_PROFILE,
    permissions: {
      [NATIVE_PERMISSION_PROFILE]: {
        workspace_roots: { [guard.activeWritableRoot]: true },
        filesystem: { ':minimal': 'read', ':workspace_roots': workspace },
        network: { enabled: false },
      },
    },
    approval_policy: 'on-request',
    approvals_reviewer: 'user',
    web_search: 'disabled',
    // Keep unrelated plugins, credentials, browsers, hooks, and autonomous child
    // runtimes out of the native process. Gitu exposes its supervised services.
    'features.shell_tool': false,
    'features.unified_exec': false,
    'features.shell_snapshot': false,
    'features.view_image': false,
    'features.apps': false,
    'features.plugins': false,
    'features.remote_plugin': false,
    'features.browser_use': false,
    'features.computer_use': false,
    'features.image_generation': false,
    'features.multi_agent': false,
    'features.hooks': false,
    'features.skip_host_skill_discovery': true,
    // The supported local code-mode host dispatches app-server dynamic tools.
    // Its isolated JS engine has no Node/OS authority of its own. Disabling it
    // makes advertised dynamic functions unusable on current Codex models.
    'features.code_mode_host': true,
    project_doc_max_bytes: 0,
    'shell_environment_policy.inherit': 'none',
    'shell_environment_policy.set': Object.fromEntries(
      ['PATH', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    ),
  };
  return config;
}
