export type Connection = { name: string; url: string; key: string; kind: 'computer' | 'hosted' };

export function connectionUrl(raw: string, kind: Connection['kind']): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a full server address, such as http://192.168.1.20:8421.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use the server address only, without a password, path or query.');
  }
  const host = url.hostname;
  const local =
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '[::1]' ||
    host.startsWith('[fe80:') ||
    host.startsWith('[fc') ||
    host.startsWith('[fd') ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (url.protocol === 'http:' && (kind === 'hosted' || !local)) throw new Error('Use HTTPS for a hosted server. HTTP is supported for your computer on a private network.');
  return url.origin;
}

export async function checkConnection(connection: Connection): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${connection.url}/api/mobile/status`, { headers: { Authorization: `Bearer ${connection.key}` }, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'The server rejected the connection. Check the access key.');
    if (data.app !== 'Agent Gitu' || data.mobileProtocol !== 1) throw new Error('This server needs the Agent Gitu mobile update.');
  } finally {
    clearTimeout(timer);
  }
}
