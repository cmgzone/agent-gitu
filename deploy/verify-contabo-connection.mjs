/** Explicit, one-shot release diagnostic. No credentials, tokens, provider
 * response bodies or resource details are written to stdout/stderr. */
import { ConnectionRegistry, ConnectionInvocationError } from '../dist/connections/connections.js';
import { isStructuredAuth, CONTABO_TOKEN_URL } from '../dist/connections/structured-auth.js';

const registry = new ConnectionRegistry();
const report = value => console.log('GITU_CONTABO_CHECK ' + JSON.stringify(value));
try {
  const profiles = registry.list().filter(p => p.baseUrl === 'https://api.contabo.com' && p.hasCredential && isStructuredAuth(p.auth) && p.auth.type === 'oauth2');
  const selectedId = process.argv[2];
  const profile = selectedId ? profiles.find(p => p.id === selectedId) : profiles.length === 1 ? profiles[0] : undefined;
  if (!profile) { report({ verified: false, code: profiles.length ? 'ACCOUNT_SELECTION_REQUIRED' : 'SAVED_CONNECTION_NOT_FOUND', accounts: profiles.map(p => p.id) }); process.exitCode = 1; }
  else {
    if (profile.auth.grantType !== 'password' || profile.auth.tokenUrl !== CONTABO_TOKEN_URL) throw Error('Unexpected authentication configuration');
    // Reuse a registered read when present; otherwise remember this documented
    // safe read on the same connection. Never invoke any provider write.
    let operation = profile.operations.find(op => op.method === 'GET' && op.risk === 'read' && op.path === '/v1/compute/instances');
    if (!operation) {
      const capability = 'contabo.instances.read';
      const updated = registry.save({ ...profile, auth: profile.auth, documentationUrl: profile.documentationUrl ?? 'https://api.contabo.com/', capabilities: [...new Set([...profile.capabilities, capability])], operations: [...profile.operations, { id: 'contabo-auth-check', label: 'Verify Contabo access', capability, method: 'GET', path: '/v1/compute/instances', risk: 'read' }] });
      operation = updated.operations.find(op => op.id === 'contabo-auth-check');
    }
    if (!operation) throw Error('No safe verification operation');
    registry.setValidationOperation(profile.id, operation.id);
    const result = await registry.validate(profile.id);
    report({ verified: true, connectionId: profile.id, status: result.status, method: 'GET', path: '/v1/compute/instances', grantType: 'password', tokenEndpoint: CONTABO_TOKEN_URL, secretsExposed: false });
  }
} catch (error) {
  const code = error instanceof ConnectionInvocationError ? /^\[([A-Z_]+)\]/.exec(error.message)?.[1] ?? error.state : 'CONFIG_INVALID';
  report({ verified: false, code, ...(error instanceof ConnectionInvocationError ? { state: error.state, outcome: error.outcome } : {}) });
  process.exitCode = 1;
}
