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

import type { DiscoveryOperationMetadata } from './discovery-engine.js';

export interface CatalogOperation {
  id: string;
  label: string;
  capability: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Static path relative to the provider origin. Query strings are not allowed. */
  path: string;
  risk: 'read' | 'reversible-write' | 'destructive';
  /**
   * Verified discovery-engine metadata. Only operations with this field
   * (and catalogVerification === 'verified') participate in automatic
   * multi-intent graph execution. Absence means the operation is not
   * eligible for auto-chaining.
   */
  discovery?: DiscoveryOperationMetadata;
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
      {
        id: 'validate',
        label: 'List servers',
        capability: 'servers.read',
        method: 'GET',
        path: '/api/v1/servers',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'server',
          produces: ['server.id', 'server.name', 'server.status'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'list-applications',
        label: 'List applications',
        capability: 'applications.read',
        method: 'GET',
        path: '/api/v1/applications',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'application',
          produces: ['application.id', 'application.name', 'application.status'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'get-application',
        label: 'Get application detail',
        capability: 'applications.read',
        method: 'GET',
        path: '/api/v1/applications/:id',
        risk: 'read',
        discovery: {
          intent: 'get_resource',
          role: 'detail',
          resourceType: 'application',
          produces: ['application.id', 'application.name', 'application.fqdn', 'application.git_repository', 'application.status'],
          requires: ['application.id'],
          parentResourceType: 'application',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'get-application-envs',
        label: 'Get application environment variables',
        capability: 'applications.read',
        method: 'GET',
        path: '/api/v1/applications/:id/envs',
        risk: 'read',
        discovery: {
          intent: 'get_environment',
          role: 'environment',
          resourceType: 'application',
          produces: ['application.env'],
          requires: ['application.id'],
          parentResourceType: 'application',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
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
      {
        id: 'validate',
        label: 'List authenticated repositories',
        capability: 'repositories.read',
        method: 'GET',
        path: '/user/repos',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'repository',
          produces: ['repository.id', 'repository.name', 'repository.full_name', 'repository.default_branch'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'list-workflow-runs',
        label: 'List workflow runs',
        capability: 'actions.read',
        method: 'GET',
        path: '/repos/:id/actions/runs',
        risk: 'read',
        discovery: {
          intent: 'get_status',
          role: 'status',
          resourceType: 'repository',
          produces: ['workflow_run.id', 'workflow_run.status', 'workflow_run.conclusion', 'workflow_run.created_at'],
          requires: ['repository.id'],
          parentResourceType: 'repository',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
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
      {
        id: 'validate',
        label: 'List accessible projects',
        capability: 'repositories.read',
        method: 'GET',
        path: '/api/v4/projects',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'project',
          produces: ['project.id', 'project.name', 'project.path_with_namespace', 'project.default_branch'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'list-project-pipelines',
        label: 'List project pipelines',
        capability: 'repositories.read',
        method: 'GET',
        path: '/api/v4/projects/:id/pipelines',
        risk: 'read',
        discovery: {
          intent: 'get_status',
          role: 'status',
          resourceType: 'project',
          produces: ['pipeline.id', 'pipeline.status', 'pipeline.ref', 'pipeline.created_at'],
          requires: ['project.id'],
          parentResourceType: 'project',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
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
      {
        id: 'validate',
        label: 'List projects',
        capability: 'projects.read',
        method: 'GET',
        path: '/v9/projects',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'project',
          produces: ['project.id', 'project.name', 'project.framework', 'project.updatedAt'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'list-project-env-vars',
        label: 'List project environment variables',
        capability: 'projects.read',
        method: 'GET',
        path: '/v9/projects/:id/env',
        risk: 'read',
        discovery: {
          intent: 'get_environment',
          role: 'environment',
          resourceType: 'project',
          produces: ['project.env'],
          requires: ['project.id'],
          parentResourceType: 'project',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'list-deployments',
        label: 'List project deployments',
        capability: 'projects.read',
        method: 'GET',
        path: '/v6/deployments',
        risk: 'read',
        discovery: {
          intent: 'get_status',
          role: 'status',
          resourceType: 'project',
          produces: ['deployment.id', 'deployment.state', 'deployment.url', 'deployment.createdAt'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
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
      {
        id: 'validate',
        label: 'List applications',
        capability: 'apps.read',
        method: 'GET',
        path: '/v1/apps',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'app',
          produces: ['app.id', 'app.name', 'app.status', 'app.organization'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
      {
        id: 'get-app',
        label: 'Get application detail',
        capability: 'apps.read',
        method: 'GET',
        path: '/v1/apps/:id',
        risk: 'read',
        discovery: {
          intent: 'get_resource',
          role: 'detail',
          resourceType: 'app',
          produces: ['app.id', 'app.name', 'app.status', 'app.hostname'],
          requires: ['app.id'],
          parentResourceType: 'app',
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
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
