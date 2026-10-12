import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpManager, McpServerConfig } from '../mcp/client.js';
import { SecretVault } from '../connections/secret-vault.js';
import { ensureGituHome } from '../workspace/home.js';
import path from 'node:path';

/** Owner-only configuration. Agent tools receive this company's manager, never this API. */
export async function companyMcpApi(
  req: IncomingMessage,
  res: ServerResponse,
  companyId: string,
  suffix: string,
  method: string,
  manager: McpManager,
  body: (r: IncomingMessage) => Promise<Record<string, unknown>>,
  send: (r: ServerResponse, status: number, value: unknown) => void,
): Promise<boolean> {
  if (!suffix.startsWith('/mcp')) return false;
  if (suffix === '/mcp' && method === 'GET') {
    send(res, 200, { servers: manager.servers().map(({ env, ...server }) => ({ ...server, environmentKeys: Object.keys(env ?? {}) })), tools: await manager.listAllTools() });
    return true;
  }
  if (suffix === '/mcp' && method === 'POST') {
    const input = await body(req),
      name = String(input['name'] ?? ''),
      credentialRef = `mcp-${companyId}-${name}`;
    const config: McpServerConfig = {
      name,
      command: input['command'] ? String(input['command']) : undefined,
      args: Array.isArray(input['args']) ? input['args'].map(String) : undefined,
      url: input['url'] ? String(input['url']) : undefined,
      credentialRef,
    };
    if (input['environment']) {
      const environment = input['environment'] as Record<string, string>;
      if (
        typeof environment !== 'object' ||
        Array.isArray(environment) ||
        Object.entries(environment).some(([key, value]) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) || typeof value !== 'string')
      )
        throw new Error('Enter environment fields as names and string values.');
      config.environmentCredentialRef = credentialRef + '-env';
      new SecretVault(path.join(ensureGituHome().settings, 'ConnectorSecrets')).save(config.environmentCredentialRef, { environment });
    }
    if (input['token']) new SecretVault(path.join(ensureGituHome().settings, 'ConnectorSecrets')).save(credentialRef, { token: String(input['token']) });
    if (config.url) {
      if (!req.headers.origin) throw new Error('Open company settings in your browser to configure OAuth.');
      config.oauthRedirectUrl = new URL(`/api/companies/${companyId}/mcp/${name}/callback`, req.headers.origin).href;
    }
    manager.addServer(config);
    send(res, 201, { ok: true });
    return true;
  }
  const match = suffix.match(/^\/mcp\/([\w-]+)(\/.*)?$/);
  if (!match) return false;
  const name = match[1]!,
    action = match[2] ?? '';
  if (!action && method === 'DELETE') {
    manager.removeServer(name);
    send(res, 200, { ok: true });
    return true;
  }
  if (action === '/authorize' && method === 'POST') {
    await manager.toolsForServer(name);
    const authorizationUrl = manager.authorizationUrl(name);
    if (!authorizationUrl) throw new Error('This server did not request OAuth. Check its URL or configure a bearer credential.');
    send(res, 200, { authorizationUrl });
    return true;
  }
  if (action === '/callback' && method === 'GET') {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    await manager.finishOAuth(name, params.get('code') ?? '', params.get('state') ?? '');
    res.writeHead(302, { location: '/?company=' + encodeURIComponent(companyId), 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  send(res, 404, { error: 'MCP route not found.' });
  return true;
}
