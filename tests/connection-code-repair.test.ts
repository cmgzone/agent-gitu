import { expect, it, vi } from 'vitest';
import { connectionCodeRepair } from '../src/connections/connection-repair.js';
import { normalizeConnectionAuth } from '../src/connections/connections.js';
import { ConnectionAuthenticationError, UnsupportedConnectionAuthError } from '../src/connections/structured-auth.js';
import { executeCoworkTool } from '../src/cowork/tools.js';

it('routes only confirmed implementation gaps to coding, preserving other recovery paths', () => {
  for (const code of ['INVALID_CREDENTIALS', 'NETWORK_ERROR', 'TOKEN_ENDPOINT_FAILED', 'TOKEN_RESPONSE_INVALID', 'CONFIG_INVALID'] as const) expect(connectionCodeRepair(new ConnectionAuthenticationError(code, 'Provider error with fixture-private-value'), {})).toBeUndefined();
  const repair = connectionCodeRepair(new UnsupportedConnectionAuthError('oauth_grant'), { baseUrl: 'https://api.example.test', documentationUrl: 'https://docs.example.test/oauth' })!;
  expect(repair).toMatchObject({ status: 'CONNECTOR_CODE_REQUIRED', nextTool: 'gitu_task', owner: 'Main Agent Gitu' });
  expect(repair.goal).toContain('mocked'); expect(repair.goal).toContain('Never read, copy, print or request the live credential vault');
  expect(repair.goal).toContain('deployment remains with Cowork'); expect(repair.goal).toContain('authorized connector source repository');
});

it('does not forward credentials embedded in malformed URLs or raw provider errors', () => {
  const repair = connectionCodeRepair(new UnsupportedConnectionAuthError('authentication_scheme'), { baseUrl: 'https://owner:fixture-private-password@api.example.test', documentationUrl: 'https://docs.example.test/?token=fixture-private-token' });
  expect(JSON.stringify(repair)).not.toContain('fixture-private');
  expect(() => normalizeConnectionAuth({ type: 'oauth1' })).toThrow(UnsupportedConnectionAuthError);
});

it('gives Cowork a safe coding handoff instead of opening another credential card for unsupported authentication', async () => {
  const addRequest = vi.fn();
  const result = await executeCoworkTool({ cwd: '/authorized-source', connections: { list: () => [] } } as any, 'request_credential', {
    prompt: 'Connect a service', provider: 'custom', baseUrl: 'https://api.example.test', documentationUrl: 'https://docs.example.test/oauth',
    auth: { type: 'oauth2', grantType: 'authorization_code', tokenPath: '/token', fields: [{ id: 'client_id', label: 'Client', value: 'fixture-private-id' }, { id: 'client_secret', label: 'Secret', value: 'fixture-private-secret' }] },
  }, { allowShell: false, allowWrites: false, allowConfig: true, chief: false, browser: false }, { conversationId: 'fixture', agent: { id: 'fixture', name: 'Cowork' }, store: { addRequest } } as any);
  expect(result.ok).toBe(false); expect(JSON.parse(result.output)).toMatchObject({ status: 'CONNECTOR_CODE_REQUIRED', nextTool: 'gitu_task' });
  expect(result.output).not.toContain('fixture-private'); expect(addRequest).not.toHaveBeenCalled();
});
