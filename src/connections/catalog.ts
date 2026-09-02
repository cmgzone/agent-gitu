/**
 * Provider-neutral capability catalog: static knowledge seeded from verified
 * official API documentation. It lets Gitu resolve a requested capability to a
 * documented operation WITHOUT asking the user to re-enter a credential, and
 * it is the fallback the registry consults when a saved connection has a valid
 * credential but never registered the operation at hand.
 *
 * Every entry is provider-neutral: it names the provider (matching the saved
 * connection's `provider` slug), the capability id, and STATIC documented
 * read/write operations. Paths are static (no URL templates) so any discovered
 * operation can be registered and invoked through the exact-path allowlist.
 *
 * This is metadata about documented APIs — it never contains or requests a
 * credential. Providers without a catalog entry simply resolve capabilities
 * from an existing connection's registered operations, or report
 * DISCOVERY_FAILED without invalidating the saved credential.
 */

export interface CatalogOperation {
  id: string;
  label: string;
  capability: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Static path relative to the provider origin. Query strings are not allowed. */
  path: string;
  risk: 'read' | 'reversible-write' | 'destructive';
}

export interface CatalogProvider {
  /** Matches ConnectionProfile.provider (slug). */
  provider: string;
  documentationUrl: string;
  capabilities: { id: string; riskClass: 'read' | 'reversible-write' | 'destructive' }[];
  operations: CatalogOperation[];
}

/** Verified-official-documentation seed for well-known providers. */
export const CONNECTION_CATALOG: CatalogProvider[] = [
  {
    provider: 'coolify',
    documentationUrl: 'https://coolify.io/docs/api-reference',
    capabilities: [
      { id: 'servers.read', riskClass: 'read' },
      { id: 'applications.read', riskClass: 'read' },
      { id: 'deployments.write', riskClass: 'reversible-write' },
      { id: 'databases.create', riskClass: 'reversible-write' },
    ],
    operations: [
      { id: 'validate', label: 'List servers', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' },
      { id: 'list-applications', label: 'List applications', capability: 'applications.read', method: 'GET', path: '/api/v1/applications', risk: 'read' },
      { id: 'deploy-application', label: 'Deploy application', capability: 'deployments.write', method: 'POST', path: '/api/v1/deploy', risk: 'reversible-write' },
      { id: 'create-database', label: 'Create database', capability: 'databases.create', method: 'POST', path: '/api/v1/databases', risk: 'reversible-write' },
    ],
  },
  {
    provider: 'github',
    documentationUrl: 'https://docs.github.com/en/rest',
    capabilities: [
      { id: 'repositories.read', riskClass: 'read' },
      { id: 'actions.read', riskClass: 'read' },
      { id: 'deployments.write', riskClass: 'reversible-write' },
    ],
    operations: [
      { id: 'validate', label: 'List authenticated repositories', capability: 'repositories.read', method: 'GET', path: '/user/repos', risk: 'read' },
      { id: 'list-workflow-runs', label: 'List workflow runs', capability: 'actions.read', method: 'GET', path: '/actions/runs', risk: 'read' },
      { id: 'create-deployment', label: 'Create deployment', capability: 'deployments.write', method: 'POST', path: '/deployments', risk: 'reversible-write' },
    ],
  },
  {
    provider: 'gitlab',
    documentationUrl: 'https://docs.gitlab.com/ee/api/',
    capabilities: [
      { id: 'repositories.read', riskClass: 'read' },
      { id: 'replacements.write', riskClass: 'reversible-write' },
    ],
    operations: [
      { id: 'validate', label: 'List accessible projects', capability: 'repositories.read', method: 'GET', path: '/api/v4/projects', risk: 'read' },
      { id: 'create-deployment', label: 'Create deployment', capability: 'replacements.write', method: 'POST', path: '/api/v4/projects/deployments', risk: 'reversible-write' },
    ],
  },
  {
    provider: 'vercel',
    documentationUrl: 'https://vercel.com/docs/rest-api',
    capabilities: [
      { id: 'projects.read', riskClass: 'read' },
      { id: 'deployments.write', riskClass: 'reversible-write' },
    ],
    operations: [
      { id: 'validate', label: 'List projects', capability: 'projects.read', method: 'GET', path: '/v9/projects', risk: 'read' },
      { id: 'create-deployment', label: 'Create deployment from source', capability: 'deployments.write', method: 'POST', path: '/v13/deployments', risk: 'reversible-write' },
    ],
  },
  {
    provider: 'fly',
    documentationUrl: 'https://fly.io/docs/api/',
    capabilities: [
      { id: 'apps.read', riskClass: 'read' },
      { id: 'apps.write', riskClass: 'reversible-write' },
    ],
    operations: [
      { id: 'validate', label: 'List applications', capability: 'apps.read', method: 'GET', path: '/v1/apps', risk: 'read' },
      { id: 'create-machine', label: 'Create machine', capability: 'apps.write', method: 'POST', path: '/v1/apps/machines', risk: 'reversible-write' },
    ],
  },
];

export function catalogProvider(provider: string): CatalogProvider | undefined {
  const slug = String(provider ?? '').trim().toLowerCase();
  return CONNECTION_CATALOG.find((entry) => entry.provider === slug);
}

export function catalogCapabilityDeclared(provider: string, capability: string): boolean {
  return Boolean(catalogProvider(provider)?.capabilities.some((entry) => entry.id === capability));
}

export function catalogOperation(provider: string, operationId: string): CatalogOperation | undefined {
  return catalogProvider(provider)?.operations.find((operation) => operation.id === operationId);
}

/** First documented operation matching a capability and risk class, if any.
 * The capability must match exactly — unrelated read fallbacks would
 * mis-register operations for capabilities the provider never documented. */
export function catalogOperationFor(
  provider: string,
  capability: string,
  risk: 'read' | 'reversible-write' | 'destructive',
): CatalogOperation | undefined {
  const source = catalogProvider(provider)?.operations ?? [];
  return source.find((operation) => operation.capability === capability && operation.risk === risk)
    ?? source.find((operation) => operation.capability === capability);
}
