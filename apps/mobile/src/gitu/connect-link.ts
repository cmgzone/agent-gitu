import { isLocalServer, workspaceServerUrl, type ConnectionMode } from './server-address';

/** The onboarding QR opens agentgitu://connect?server=…; the phone still asks
 *  the user to confirm the address before opening the workspace. */
export function parseConnectLink(raw: string | null | undefined): { server: string; mode: ConnectionMode } | undefined {
  if (!raw) return;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  if (url.protocol !== 'agentgitu:' && url.protocol !== 'exp+agent-gitu:') return;
  const connectPath = url.hostname === 'connect' || url.pathname === '/connect' || url.pathname === 'connect';
  if (!connectPath) return;
  const value = url.searchParams.get('server')?.trim();
  if (!value) return;
  try {
    const mode: ConnectionMode = isLocalServer(new URL(value).hostname) ? 'local' : 'remote';
    return { server: workspaceServerUrl(value, mode), mode };
  } catch {
    return;
  }
}
