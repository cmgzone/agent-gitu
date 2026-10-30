import { canonicalAction, type CompanyStore, type CompanyAction } from './store.js';
import type { ToolResult } from '../types.js';
import { walletFor, walletTransaction, walletField } from './wallets.js';
import { isNativeMailRead } from '../connections/provider.js';

const CONFIG = new Set(['configure_mcp', 'update_connection', 'request_permission', 'request_credential', 'create_project', 'ssh_exec']);
export function companyPolicy(
  store: CompanyStore,
  companyId: string,
  agentId: string,
  version: number,
  classify?: (tool: string, args: Record<string, unknown>) => Promise<'read' | 'write'>,
  staffCount?: () => number,
): {
  authorize: (tool: string, args: Record<string, unknown>) => Promise<ToolResult | undefined>;
  settled: (tool: string, args: Record<string, unknown>, result: ToolResult) => void;
  headers: (tool: string, args: Record<string, unknown>) => Record<string, string>;
  arguments: (tool: string, args: Record<string, unknown>) => Record<string, unknown>;
} {
  const inFlight = new Map<string, CompanyAction>();
  const key = (tool: string, args: Record<string, unknown>) => tool + canonicalAction(args);
  return {
    async authorize(tool, args) {
      const c = store.get(companyId);
      const draftSetup = c?.state === 'draft' && ['company_organization', 'company_handbook', 'company_onboarding', 'company_boardroom'].includes(tool);
      if (!c || (c.state !== 'running' && !draftSetup)) return { ok: false, output: 'Company is paused. Wait for the owner to resume it.' };
      if (c.directionVersion !== version) return { ok: false, output: 'The owner changed direction. End this turn and replan using the latest direction.' };
      if (CONFIG.has(tool)) return { ok: false, output: 'Only the owner can change company grants or connections in Company settings.' };
      // Full access leaves command verification/recovery with the agent. The
      // dispatcher still enforces shell permission and computer/file grants.
      if (tool === 'run_command' && c.access === 'full') return undefined;
      if ((tool === 'connection_read' || (tool === 'web_search' && args['connectionId'])) && !c.connectionIds.includes(String(args['connectionId'] ?? args['connection'] ?? '')))
        return { ok: false, output: 'This connection is not granted to this company.' };
      if (tool === 'team_manage' && String(args['action']) === 'create' && (staffCount?.() ?? 0) >= c.staffLimit) return { ok: false, output: 'Company staff limit reached.' };
      const external = classify
        ? (await classify(tool, args)) === 'write'
        : tool === 'mcp_call' ||
          tool === 'connection_execute' ||
          (tool === 'storage' && !['list', 'read', 'download'].includes(String(args['action']))) ||
          (tool === 'connected_apps' && args['action'] === 'execute' && !isNativeMailRead(String(args['service']), String(args['tool']))) ||
          (tool === 'team_manage' && args['action'] === 'create');
      if (!external) return undefined;
      if (c.directionVersion !== version) return { ok: false, output: 'The owner changed direction. Replan before submitting this action.' };
      const action = store.intent(companyId, agentId, tool, args, version);
      if (action.state === 'done') return { ok: true, output: 'This action already completed. Review its recorded result before creating a new action.' };
      if (action.state === 'uncertain' || action.state === 'executing') return { ok: false, output: `Action ${action.id} has an uncertain result. Reconcile it before retrying.` };
      if (action.state === 'rejected') return { ok: false, output: 'The owner rejected this action.' };
      const wallet = walletFor(store, companyId, tool, args);
      if (wallet)
        store.prepareAction(action, (current) => {
          current.wallet = walletTransaction(store, wallet, args, current);
        });
      if ((c.access === 'supervised' || wallet?.mode === 'approval') && action.state !== 'approved')
        return { ok: false, output: `Owner approval required for ${tool}. Review action ${action.id} in Company Overview. Stop and wait.` };
      store.prepareAction(
        action,
        (current) => {
          const latest = store.get(companyId)!;
          if ((latest.access === 'supervised' || wallet?.mode === 'approval') && current.state !== 'approved') throw new Error('Owner approval required before submission.');
          if (wallet) current.wallet = walletTransaction(store, wallet, args, current);
          if (tool === 'team_manage' && args['action'] === 'create' && (staffCount?.() ?? 0) >= latest.staffLimit) throw new Error('Company staff limit reached.');
        },
        true,
      );
      inFlight.set(key(tool, args), action);
      return undefined;
    },
    settled(tool, args, result) {
      if (tool === 'run_command' && store.get(companyId)?.access === 'full') {
        if (inFlight.delete(key(tool, args))) store.manageCommandReviews(companyId);
        return;
      }
      const action = inFlight.get(key(tool, args));
      if (!action) return;
      inFlight.delete(key(tool, args));
      const wallet = walletFor(store, companyId, tool, args);
      if (wallet?.receiptPath && action.wallet && result.ok) {
        try {
          const reference = walletField(JSON.parse(result.output), wallet.receiptPath);
          if (typeof reference === 'string') action.wallet.reference = reference.slice(0, 300);
        } catch {
          /* Preserve uncertainty when a provider omits structured receipts. */
        }
      }
      store.actionState(action, result.ok ? 'done' : 'uncertain', result.ok ? (action.wallet?.reference ?? 'Provider reported completion.') : undefined);
    },
    headers(tool, args) {
      const action = inFlight.get(key(tool, args)),
        wallet = walletFor(store, companyId, tool, args);
      return action && wallet?.idempotencyHeader ? { [wallet.idempotencyHeader]: action.id } : {};
    },
    arguments(tool, args) {
      const action = inFlight.get(key(tool, args)),
        wallet = walletFor(store, companyId, tool, args),
        values = (args['args'] as Record<string, unknown>) ?? {};
      return action && wallet?.idempotencyArgument ? { ...values, [wallet.idempotencyArgument]: action.id } : values;
    },
  };
}
