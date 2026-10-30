/**
 * Feature flag for Pi tool adapters.
 *
 * Controlled via GITU_PI_TOOLS environment variable ('1' or 'true').
 * Default is disabled for safe comparison, testing, and instant rollback.
 */
export function isPiToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const val = (env['GITU_PI_TOOLS'] ?? '').trim().toLowerCase();
  return val === '1' || val === 'true';
}
