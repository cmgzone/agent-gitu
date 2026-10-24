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

/**
 * Declares how results from this operation should be handled by the memory
 * promotion layer. When absent, the runtime falls back to keyword heuristics.
 *
 * - `stable`: The result represents durable provider architecture / topology
 *   that rarely changes (e.g. registered operations, resource identifiers).
 *   Promote to `MemoryStore` as a cross-task `fact`.
 * - `session`: The result is meaningful for the current task but should not
 *   outlive it (e.g. list of resources). Keep in `ProviderReadCache` only.
 * - `volatile`: The result changes frequently (e.g. deployment status, env
 *   vars). Cache only for the current state epoch; never promote.
 */
export interface MemoryPolicy {
  promotable: boolean;
  stability: 'stable' | 'session' | 'volatile';
}

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
  /** Explicit memory promotion policy. Overrides keyword-based heuristics. */
  memoryPolicy?: MemoryPolicy;
}

export interface CatalogProvider {
  /** Saved credentials remain private; providers can require a dedicated key header. */
  credentialHeader?: string;
  /** Matches ConnectionProfile.provider (slug). */
  provider: string;
  /** Fixed public API origin, when the provider is not self-hosted. */
  baseUrl?: string;
  documentationUrl: string;
  capabilities: { id: string; riskClass: 'read' | 'reversible-write' | 'destructive' }[];
  operations: CatalogOperation[];
}

/** Verified-official-documentation seed for well-known providers. */
export const CONNECTION_CATALOG: CatalogProvider[] = [
  // Mailcow official OpenAPI, captured 2026-10-24. Metadata only; writes retain their risk gates.
  {
    "provider": "mailcow",
    "credentialHeader": "X-API-Key",
    "documentationUrl": "https://github.com/mailcow/mailcow-dockerized/blob/master/data/web/api/openapi.yaml",
    "capabilities": [
      {
        "id": "mailcow.alias.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.time-limited-alias.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.app-passwd.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.bcc.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.dkim.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.dkim-duplicate.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.domain.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.domain-admin.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.sso.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.da-acl.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.domain-policy.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.fwdhost.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.mailbox.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.oauth2-client.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.recipient-map.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.relayhost.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.resource.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.syncjob.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.tls-policy-map.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.transport.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.alias.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.app-passwd.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.bcc.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.dkim.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.domain.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.domain-admin.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.domain-policy.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.fwdhost.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.mailbox.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.mailq.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.oauth2-client.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.qitem.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.qitem.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.recipient-map.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.relayhost.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.resource.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.syncjob.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.tls-policy-map.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.transport.delete",
        "riskClass": "destructive"
      },
      {
        "id": "mailcow.fail2ban.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.mailq.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.pushover.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.quarantine-notification.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.user-acl.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.alias.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.time-limited-aliases.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.app-passwd.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.bcc.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.dkim.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.domain-admin.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.domain.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.fail2ban.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.fwdhost.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.logs.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.mailbox.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.mailq.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.oauth2-client.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.policy-bl-domain.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.policy-wl-domain.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.quarantine.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.recipient-map.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.relayhost.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.resource.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.rl-mbox.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.rl-domain.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.rl-mbox.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.rl-domain.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.status.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.syncjobs.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.tls-policy-map.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.transport.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.spam-score.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.cors.write",
        "riskClass": "reversible-write"
      },
      {
        "id": "mailcow.spam-score.read",
        "riskClass": "read"
      },
      {
        "id": "mailcow.identity-provider.write",
        "riskClass": "reversible-write"
      }
    ],
    "operations": [
      {
        "id": "mailcow-add-alias",
        "label": "Create alias",
        "capability": "mailcow.alias.write",
        "method": "POST",
        "path": "/api/v1/add/alias",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-time-limited-alias",
        "label": "Create time limited alias",
        "capability": "mailcow.time-limited-alias.write",
        "method": "POST",
        "path": "/api/v1/add/time_limited_alias",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-app-passwd",
        "label": "Create App Password",
        "capability": "mailcow.app-passwd.write",
        "method": "POST",
        "path": "/api/v1/add/app-passwd",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-bcc",
        "label": "Create BCC Map",
        "capability": "mailcow.bcc.write",
        "method": "POST",
        "path": "/api/v1/add/bcc",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-dkim",
        "label": "Generate DKIM Key",
        "capability": "mailcow.dkim.write",
        "method": "POST",
        "path": "/api/v1/add/dkim",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-dkim-duplicate",
        "label": "Duplicate DKIM Key",
        "capability": "mailcow.dkim-duplicate.write",
        "method": "POST",
        "path": "/api/v1/add/dkim_duplicate",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-domain",
        "label": "Create domain",
        "capability": "mailcow.domain.write",
        "method": "POST",
        "path": "/api/v1/add/domain",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-domain-admin",
        "label": "Create Domain Admin user",
        "capability": "mailcow.domain-admin.write",
        "method": "POST",
        "path": "/api/v1/add/domain-admin",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-sso",
        "label": "Issue Domain Admin SSO token",
        "capability": "mailcow.sso.write",
        "method": "POST",
        "path": "/api/v1/add/sso/domain-admin",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-da-acl",
        "label": "Edit Domain Admin ACL",
        "capability": "mailcow.da-acl.write",
        "method": "POST",
        "path": "/api/v1/edit/da-acl",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-domain-admin",
        "label": "Edit Domain Admin user",
        "capability": "mailcow.domain-admin.write",
        "method": "POST",
        "path": "/api/v1/edit/domain-admin",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-domain-policy",
        "label": "Create domain policy",
        "capability": "mailcow.domain-policy.write",
        "method": "POST",
        "path": "/api/v1/add/domain-policy",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-fwdhost",
        "label": "Add Forward Host",
        "capability": "mailcow.fwdhost.write",
        "method": "POST",
        "path": "/api/v1/add/fwdhost",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-mailbox",
        "label": "Create mailbox",
        "capability": "mailcow.mailbox.write",
        "method": "POST",
        "path": "/api/v1/add/mailbox",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-oauth2-client",
        "label": "Create oAuth Client",
        "capability": "mailcow.oauth2-client.write",
        "method": "POST",
        "path": "/api/v1/add/oauth2-client",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-recipient-map",
        "label": "Create Recipient Map",
        "capability": "mailcow.recipient-map.write",
        "method": "POST",
        "path": "/api/v1/add/recipient_map",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-relayhost",
        "label": "Create Sender-Dependent Transports",
        "capability": "mailcow.relayhost.write",
        "method": "POST",
        "path": "/api/v1/add/relayhost",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-resource",
        "label": "Create Resources",
        "capability": "mailcow.resource.write",
        "method": "POST",
        "path": "/api/v1/add/resource",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-syncjob",
        "label": "Create sync job",
        "capability": "mailcow.syncjob.write",
        "method": "POST",
        "path": "/api/v1/add/syncjob",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-tls-policy-map",
        "label": "Create TLS Policy Map",
        "capability": "mailcow.tls-policy-map.write",
        "method": "POST",
        "path": "/api/v1/add/tls-policy-map",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-add-transport",
        "label": "Create Transport Maps",
        "capability": "mailcow.transport.write",
        "method": "POST",
        "path": "/api/v1/add/transport",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-delete-alias",
        "label": "Delete alias",
        "capability": "mailcow.alias.delete",
        "method": "POST",
        "path": "/api/v1/delete/alias",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-app-passwd",
        "label": "Delete App Password",
        "capability": "mailcow.app-passwd.delete",
        "method": "POST",
        "path": "/api/v1/delete/app-passwd",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-bcc",
        "label": "Delete BCC Map",
        "capability": "mailcow.bcc.delete",
        "method": "POST",
        "path": "/api/v1/delete/bcc",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-dkim",
        "label": "Delete DKIM Key",
        "capability": "mailcow.dkim.delete",
        "method": "POST",
        "path": "/api/v1/delete/dkim",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-domain",
        "label": "Delete domain",
        "capability": "mailcow.domain.delete",
        "method": "POST",
        "path": "/api/v1/delete/domain",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-domain-admin",
        "label": "Delete Domain Admin",
        "capability": "mailcow.domain-admin.delete",
        "method": "POST",
        "path": "/api/v1/delete/domain-admin",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-domain-policy",
        "label": "Delete domain policy",
        "capability": "mailcow.domain-policy.delete",
        "method": "POST",
        "path": "/api/v1/delete/domain-policy",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-fwdhost",
        "label": "Delete Forward Host",
        "capability": "mailcow.fwdhost.delete",
        "method": "POST",
        "path": "/api/v1/delete/fwdhost",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-mailbox",
        "label": "Delete mailbox",
        "capability": "mailcow.mailbox.delete",
        "method": "POST",
        "path": "/api/v1/delete/mailbox",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-mailq",
        "label": "Delete Queue",
        "capability": "mailcow.mailq.delete",
        "method": "POST",
        "path": "/api/v1/delete/mailq",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-oauth2-client",
        "label": "Delete oAuth Client",
        "capability": "mailcow.oauth2-client.delete",
        "method": "POST",
        "path": "/api/v1/delete/oauth2-client",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-qitem",
        "label": "Delete mails in Quarantine",
        "capability": "mailcow.qitem.delete",
        "method": "POST",
        "path": "/api/v1/delete/qitem",
        "risk": "destructive"
      },
      {
        "id": "mailcow-edit-qitem",
        "label": "Edit mails in Quarantine",
        "capability": "mailcow.qitem.write",
        "method": "POST",
        "path": "/api/v1/edit/qitem",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-delete-recipient-map",
        "label": "Delete Recipient Map",
        "capability": "mailcow.recipient-map.delete",
        "method": "POST",
        "path": "/api/v1/delete/recipient_map",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-relayhost",
        "label": "Delete Sender-Dependent Transports",
        "capability": "mailcow.relayhost.delete",
        "method": "POST",
        "path": "/api/v1/delete/relayhost",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-resource",
        "label": "Delete Resources",
        "capability": "mailcow.resource.delete",
        "method": "POST",
        "path": "/api/v1/delete/resource",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-syncjob",
        "label": "Delete sync job",
        "capability": "mailcow.syncjob.delete",
        "method": "POST",
        "path": "/api/v1/delete/syncjob",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-tls-policy-map",
        "label": "Delete TLS Policy Map",
        "capability": "mailcow.tls-policy-map.delete",
        "method": "POST",
        "path": "/api/v1/delete/tls-policy-map",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-transport",
        "label": "Delete Transport Maps",
        "capability": "mailcow.transport.delete",
        "method": "POST",
        "path": "/api/v1/delete/transport",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-mailbox-40",
        "label": "Delete mailbox tags",
        "capability": "mailcow.mailbox.delete",
        "method": "POST",
        "path": "/api/v1/delete/mailbox/tag/:mailbox",
        "risk": "destructive"
      },
      {
        "id": "mailcow-delete-domain-41",
        "label": "Delete domain tags",
        "capability": "mailcow.domain.delete",
        "method": "POST",
        "path": "/api/v1/delete/domain/tag/:domain",
        "risk": "destructive"
      },
      {
        "id": "mailcow-edit-alias",
        "label": "Update alias",
        "capability": "mailcow.alias.write",
        "method": "POST",
        "path": "/api/v1/edit/alias",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-domain",
        "label": "Update domain",
        "capability": "mailcow.domain.write",
        "method": "POST",
        "path": "/api/v1/edit/domain",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-domain-44",
        "label": "Update domain wide footer",
        "capability": "mailcow.domain.write",
        "method": "POST",
        "path": "/api/v1/edit/domain/footer",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-fail2ban",
        "label": "Edit Fail2Ban",
        "capability": "mailcow.fail2ban.write",
        "method": "POST",
        "path": "/api/v1/edit/fail2ban",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-mailbox",
        "label": "Update mailbox",
        "capability": "mailcow.mailbox.write",
        "method": "POST",
        "path": "/api/v1/edit/mailbox",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-mailbox-47",
        "label": "Update mailbox custom attributes",
        "capability": "mailcow.mailbox.write",
        "method": "POST",
        "path": "/api/v1/edit/mailbox/custom-attribute",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-mailq",
        "label": "Flush Queue",
        "capability": "mailcow.mailq.write",
        "method": "POST",
        "path": "/api/v1/edit/mailq",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-pushover",
        "label": "Update Pushover settings",
        "capability": "mailcow.pushover.write",
        "method": "POST",
        "path": "/api/v1/edit/pushover",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-quarantine-notification",
        "label": "Quarantine Notifications",
        "capability": "mailcow.quarantine-notification.write",
        "method": "POST",
        "path": "/api/v1/edit/quarantine_notification",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-syncjob",
        "label": "Update sync job",
        "capability": "mailcow.syncjob.write",
        "method": "POST",
        "path": "/api/v1/edit/syncjob",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-user-acl",
        "label": "Update mailbox ACL",
        "capability": "mailcow.user-acl.write",
        "method": "POST",
        "path": "/api/v1/edit/user-acl",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-get-alias",
        "label": "Get aliases",
        "capability": "mailcow.alias.read",
        "method": "GET",
        "path": "/api/v1/get/alias/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-time-limited-aliases",
        "label": "Get time limited aliases",
        "capability": "mailcow.time-limited-aliases.read",
        "method": "GET",
        "path": "/api/v1/get/time_limited_aliases/:mailbox",
        "risk": "read"
      },
      {
        "id": "mailcow-get-app-passwd",
        "label": "Get App Password",
        "capability": "mailcow.app-passwd.read",
        "method": "GET",
        "path": "/api/v1/get/app-passwd/all/:mailbox",
        "risk": "read"
      },
      {
        "id": "mailcow-get-bcc",
        "label": "Get BCC Map",
        "capability": "mailcow.bcc.read",
        "method": "GET",
        "path": "/api/v1/get/bcc/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-dkim",
        "label": "Get DKIM Key",
        "capability": "mailcow.dkim.read",
        "method": "GET",
        "path": "/api/v1/get/dkim/:domain",
        "risk": "read"
      },
      {
        "id": "mailcow-get-domain-admin",
        "label": "Get Domain Admins",
        "capability": "mailcow.domain-admin.read",
        "method": "GET",
        "path": "/api/v1/get/domain-admin/all",
        "risk": "read"
      },
      {
        "id": "mailcow-get-domain",
        "label": "Get domains",
        "capability": "mailcow.domain.read",
        "method": "GET",
        "path": "/api/v1/get/domain/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-fail2ban",
        "label": "Get Fail2Ban Config",
        "capability": "mailcow.fail2ban.read",
        "method": "GET",
        "path": "/api/v1/get/fail2ban",
        "risk": "read"
      },
      {
        "id": "mailcow-get-fwdhost",
        "label": "Get Forwarding Hosts",
        "capability": "mailcow.fwdhost.read",
        "method": "GET",
        "path": "/api/v1/get/fwdhost/all",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs",
        "label": "Get ACME logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/acme/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-63",
        "label": "Get Api logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/api/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-64",
        "label": "Get Autodiscover logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/autodiscover/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-65",
        "label": "Get Dovecot logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/dovecot/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-66",
        "label": "Get Netfilter logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/netfilter/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-67",
        "label": "Get Postfix logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/postfix/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-68",
        "label": "Get Ratelimit logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/ratelimited/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-69",
        "label": "Get Rspamd logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/rspamd-history/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-70",
        "label": "Get SOGo logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/sogo/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-logs-71",
        "label": "Get Watchdog logs",
        "capability": "mailcow.logs.read",
        "method": "GET",
        "path": "/api/v1/get/logs/watchdog/:count",
        "risk": "read"
      },
      {
        "id": "mailcow-get-mailbox",
        "label": "Get mailboxes",
        "capability": "mailcow.mailbox.read",
        "method": "GET",
        "path": "/api/v1/get/mailbox/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-mailq",
        "label": "Get Queue",
        "capability": "mailcow.mailq.read",
        "method": "GET",
        "path": "/api/v1/get/mailq/all",
        "risk": "read"
      },
      {
        "id": "mailcow-get-oauth2-client",
        "label": "Get oAuth Clients",
        "capability": "mailcow.oauth2-client.read",
        "method": "GET",
        "path": "/api/v1/get/oauth2-client/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-policy-bl-domain",
        "label": "List blacklist domain policy",
        "capability": "mailcow.policy-bl-domain.read",
        "method": "GET",
        "path": "/api/v1/get/policy_bl_domain/:domain",
        "risk": "read"
      },
      {
        "id": "mailcow-get-policy-wl-domain",
        "label": "List whitelist domain policy",
        "capability": "mailcow.policy-wl-domain.read",
        "method": "GET",
        "path": "/api/v1/get/policy_wl_domain/:domain",
        "risk": "read"
      },
      {
        "id": "mailcow-get-quarantine",
        "label": "Get mails in Quarantine",
        "capability": "mailcow.quarantine.read",
        "method": "GET",
        "path": "/api/v1/get/quarantine/all",
        "risk": "read"
      },
      {
        "id": "mailcow-get-recipient-map",
        "label": "Get Recipient Map",
        "capability": "mailcow.recipient-map.read",
        "method": "GET",
        "path": "/api/v1/get/recipient_map/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-relayhost",
        "label": "Get Sender-Dependent Transports",
        "capability": "mailcow.relayhost.read",
        "method": "GET",
        "path": "/api/v1/get/relayhost/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-resource",
        "label": "Get Resources",
        "capability": "mailcow.resource.read",
        "method": "GET",
        "path": "/api/v1/get/resource/all",
        "risk": "read"
      },
      {
        "id": "mailcow-get-rl-mbox",
        "label": "Get mailbox ratelimits",
        "capability": "mailcow.rl-mbox.read",
        "method": "GET",
        "path": "/api/v1/get/rl-mbox/:mailbox",
        "risk": "read"
      },
      {
        "id": "mailcow-get-rl-domain",
        "label": "Get domain ratelimits",
        "capability": "mailcow.rl-domain.read",
        "method": "GET",
        "path": "/api/v1/get/rl-domain/:domain",
        "risk": "read"
      },
      {
        "id": "mailcow-edit-rl-mbox",
        "label": "Edit mailbox ratelimits",
        "capability": "mailcow.rl-mbox.write",
        "method": "POST",
        "path": "/api/v1/edit/rl-mbox/",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-edit-rl-domain",
        "label": "Edit domain ratelimits",
        "capability": "mailcow.rl-domain.write",
        "method": "POST",
        "path": "/api/v1/edit/rl-domain/",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-get-status",
        "label": "Get container status",
        "capability": "mailcow.status.read",
        "method": "GET",
        "path": "/api/v1/get/status/containers",
        "risk": "read"
      },
      {
        "id": "mailcow-get-status-86",
        "label": "Get vmail status",
        "capability": "mailcow.status.read",
        "method": "GET",
        "path": "/api/v1/get/status/vmail",
        "risk": "read"
      },
      {
        "id": "mailcow-get-status-87",
        "label": "Get version status",
        "capability": "mailcow.status.read",
        "method": "GET",
        "path": "/api/v1/get/status/version",
        "risk": "read"
      },
      {
        "id": "mailcow-get-syncjobs",
        "label": "Get sync jobs",
        "capability": "mailcow.syncjobs.read",
        "method": "GET",
        "path": "/api/v1/get/syncjobs/all/no_log",
        "risk": "read"
      },
      {
        "id": "mailcow-get-tls-policy-map",
        "label": "Get TLS Policy Map",
        "capability": "mailcow.tls-policy-map.read",
        "method": "GET",
        "path": "/api/v1/get/tls-policy-map/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-get-transport",
        "label": "Get Transport Maps",
        "capability": "mailcow.transport.read",
        "method": "GET",
        "path": "/api/v1/get/transport/:id",
        "risk": "read"
      },
      {
        "id": "mailcow-edit-spam-score",
        "label": "Edit mailbox spam filter score",
        "capability": "mailcow.spam-score.write",
        "method": "POST",
        "path": "/api/v1/edit/spam-score/",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-get-mailbox-92",
        "label": "Get mailboxes of a domain",
        "capability": "mailcow.mailbox.read",
        "method": "GET",
        "path": "/api/v1/get/mailbox/all/:domain",
        "risk": "read"
      },
      {
        "id": "mailcow-edit-cors",
        "label": "Edit Cross-Origin Resource Sharing (CORS) settings",
        "capability": "mailcow.cors.write",
        "method": "POST",
        "path": "/api/v1/edit/cors",
        "risk": "reversible-write"
      },
      {
        "id": "mailcow-get-spam-score",
        "label": "Get mailbox or global spam filter score",
        "capability": "mailcow.spam-score.read",
        "method": "GET",
        "path": "/api/v1/get/spam-score/:mailbox",
        "risk": "read"
      },
      {
        "id": "mailcow-edit-identity-provider",
        "label": "Edit external Identity Provider",
        "capability": "mailcow.identity-provider.write",
        "method": "POST",
        "path": "/api/v1/edit/identity-provider",
        "risk": "reversible-write"
      }
    ]
  },
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
        // List of servers is routing-useful but servers are added/removed; session only.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // Application list is session-useful (routing) but membership changes; not stable.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // Resource identity (id, name, fqdn, git_repository) is stable architecture.
        memoryPolicy: { promotable: true, stability: 'stable' },
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
        // Env vars change frequently with every deploy/config change; volatile.
        memoryPolicy: { promotable: false, stability: 'volatile' },
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
      { id: 'deploy-application', label: 'Deploy application', capability: 'deployments.write', method: 'POST', path: '/api/v1/deploy', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },
      { id: 'create-database', label: 'Create database', capability: 'databases.create', method: 'POST', path: '/api/v1/databases', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },

    ],
  },
  {
    provider: 'github',
    baseUrl: 'https://api.github.com',
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
        // Repo list changes as repos are created/archived; session only.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // CI run results are live status — volatile.
        memoryPolicy: { promotable: false, stability: 'volatile' },
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
      { id: 'create-deployment', label: 'Create deployment', capability: 'deployments.write', method: 'POST', path: '/deployments', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },
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
        // Project list is session-useful routing data; membership changes.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // Pipeline status is live — volatile.
        memoryPolicy: { promotable: false, stability: 'volatile' },
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
      { id: 'create-deployment', label: 'Create deployment', capability: 'replacements.write', method: 'POST', path: '/api/v4/projects/deployments', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },
    ],
  },
  {
    provider: 'vercel',
    baseUrl: 'https://api.vercel.com',
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
        // Project list — session routing data; projects are created/deleted.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // Env vars change with every config update — volatile.
        memoryPolicy: { promotable: false, stability: 'volatile' },
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
        // Deployment state is live status — volatile.
        memoryPolicy: { promotable: false, stability: 'volatile' },
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
      { id: 'create-deployment', label: 'Create deployment from source', capability: 'deployments.write', method: 'POST', path: '/v13/deployments', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },
    ],
  },
  {
    provider: 'fly',
    baseUrl: 'https://api.machines.dev',
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
        // App list is session routing data; membership changes.
        memoryPolicy: { promotable: false, stability: 'session' },
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
        // App identity (name, hostname) is stable architecture.
        memoryPolicy: { promotable: true, stability: 'stable' },
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
      { id: 'create-machine', label: 'Create machine', capability: 'apps.write', method: 'POST', path: '/v1/apps/machines', risk: 'reversible-write', memoryPolicy: { promotable: false, stability: 'volatile' } },
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

/**
 * Searches across catalog providers for an operation by ID, optionally
 * prioritizing a provider hint.
 */
export function findCatalogOperation(operationId: string, providerHint?: string): CatalogOperation | undefined {
  if (providerHint) {
    const direct = catalogOperation(providerHint, operationId);
    if (direct) return direct;
  }
  for (const p of CONNECTION_CATALOG) {
    const op = p.operations.find((candidate) => candidate.id === operationId);
    if (op) return op;
  }
  return undefined;
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
