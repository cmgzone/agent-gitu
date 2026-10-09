import type { ConnectedAppAccount, ConnectedAppsProvider } from '../connections/provider.js';
import { MAIL_SERVICE_CARD } from '../connections/provider.js';
import type { CoworkMessage, CoworkStore } from './store.js';

export interface AppAwareness {
  accounts: ConnectedAppAccount[];
  verified: boolean;
  context: string;
}

const names: Record<string, string> = { mail: 'Mailbox', gmail: 'Gmail', outlook: 'Outlook', outlookemail: 'Outlook', github: 'GitHub', googledrive: 'Google Drive', googlecalendar: 'Google Calendar', slack: 'Slack', alibaba: 'Alibaba' };
const aliases: [RegExp, string][] = [[/\bgmail\b/i, 'gmail'], [/\boutlook\b/i, 'outlook'], [/\b(?:e-?mail|mailbox|inbox)\b/i, 'mail'], [/\bgithub\b/i, 'github'], [/\bgoogle drive\b/i, 'googledrive'], [/\b(?:google calendar|calendar)\b/i, 'googlecalendar'], [/\bslack\b/i, 'slack'], [/\balibaba\b/i, 'alibaba']];
const cache = new WeakMap<ConnectedAppsProvider, { at: number; accounts: ConnectedAppAccount[]; incomplete?: boolean }>();

export async function appAwareness(apps: ConnectedAppsProvider | undefined, store: CoworkStore, agentId: string): Promise<AppAwareness> {
  const assigned = store.appConnections(agentId);
  if (!assigned.length) return { accounts: [], verified: true, context: 'APP ACCESS: No app accounts are assigned to you. You cannot access accounts assigned to another teammate. Offer a Connect card when the task needs an app.' };
  let current = apps && cache.get(apps), verified = Boolean(current && Date.now() - current.at < 30_000 && assigned.every(connection => current!.accounts.some(account => account.id === connection.accountId)));
  if (apps?.configured && !verified) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const accounts = await Promise.race([apps.accounts(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Connection status timed out')), 1200); })]);
      current = { at: Date.now(), accounts, incomplete: apps.accountStatusIncomplete }; cache.set(apps, current); verified = true;
    } catch { /* Report uncertainty instead of inventing a disconnection. */ }
    finally { if (timer) clearTimeout(timer); }
  }
  const accounts = verified && current ? current.accounts.filter(account => store.appAccountAssigned(agentId, account.toolkit, account.id)) : assigned.map(account => ({ id: account.accountId, toolkit: account.service, status: 'UNKNOWN', disabled: false }));
  if (verified && current?.incomplete) for (const connection of assigned) {
    if (connection.service !== 'mail' && !accounts.some(account => account.id === connection.accountId)) accounts.push({ id: connection.accountId, toolkit: connection.service, status: 'UNKNOWN', disabled: false });
  }
  return { accounts, verified, context: 'CURRENT APP ACCESS (host metadata, scoped to you; ACTIVE means connected, not that inbox content or offers have been checked):\n' + JSON.stringify(accounts) + '\nAnswer access questions from this state. For actual content use connected_apps; never claim you cannot check your connections. UNKNOWN means status could not be refreshed; explain that briefly and offer to retry. If an app is missing or inactive, recommend it with a Connect card without waiting for the user to ask. Continue independent work. Keep conversation natural; do not narrate history preservation or internal bookkeeping.' };
}

export function connectionQuestion(text: string, history: CoworkMessage[]): { service?: string } | undefined {
  let question = text.trim();
  if (/^(?:check|verify|try|look)\s*(?:it\s*)?(?:a\s*gain|again|now)[.!?]*$/i.test(question)) {
    question = history.filter(message => message.role === 'user' && message.text !== text).at(-1)?.text ?? '';
  }
  // Only status questions take the immediate path; email work still goes to the agent.
  if (!/\b(?:connected|connection|connections|linked|access)\b/i.test(question) || !/\b(?:are|is|am|do|does|can|check|verify|which|what|show)\b/i.test(question)) return;
  if (/\b(?:send|write|delete|buy|pay|create)\b/i.test(question)) return;
  const named = aliases.find(([pattern]) => pattern.test(question))?.[1];
  const other = /\b(?:to|with|my)\s+(?:my\s+)?([a-z][a-z0-9 ]{1,40}?)(?:\s+(?:account|app))?[?.!]*$/i.exec(question)?.[1]?.trim();
  return { service: named ?? (other && !/^(apps?|accounts?|anything|you)$/i.test(other) ? other.replace(/\s+/g, '').toLowerCase() : undefined) };
}

export async function connectionReply(input: { text: string; history: CoworkMessage[]; apps?: ConnectedAppsProvider; store: CoworkStore; agentId: string; conversationId: string; awareness: AppAwareness }): Promise<string | undefined> {
  const question = connectionQuestion(input.text, input.history);
  if (!question) return;
  const { accounts, verified } = input.awareness;
  const matches = accounts.filter(account => !question.service || account.toolkit === question.service || question.service === 'mail' && /^(mail|gmail|outlook|outlookemail)$/.test(account.toolkit));
  const active = matches.filter(account => account.status === 'ACTIVE' && !account.disabled);
  if (active.length) return `Yes—${[...new Set(active.map(account => names[account.toolkit] ?? account.toolkit))].join(', ')} ${active.length === 1 ? 'is' : 'are'} connected to me. What would you like me to check?`;
  if ((!verified && matches.length) || matches.some(account => account.status === 'UNKNOWN')) return 'You have a saved connection, but I couldn’t refresh its status just now. I can check again, or you can review it in Apps & connections.';
  if (!question.service) return accounts.length ? 'Your saved app connections need attention. Open Apps & connections to reconnect them.' : 'No apps are connected to me yet. Which app would you like to connect?';
  const service = question.service;
  let app = service === 'mail' ? MAIL_SERVICE_CARD : undefined;
  if (!app && input.apps?.configured) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const catalog = await Promise.race([input.apps.catalog(service), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Catalog timed out')), 1200); })]);
      app = catalog.services.find(item => item.slug === service);
    } catch { /* The connection page remains available. */ }
    finally { if (timer) clearTimeout(timer); }
  }
  if (app) {
    const card = input.store.recommendAppConnection(input.conversationId, input.agentId, { service, name: app.name, logo: app.logo, reason: `Connect ${app.name} so I can help with your ${service === 'mail' ? 'email' : app.name} requests.`, resumeWork: false });
    if (card.status !== 'dismissed') return `Your ${service === 'mail' ? 'email' : app.name} isn’t connected to me yet. Use Connect to give me access.`;
  }
  return `Your ${names[service] ?? service} isn’t connected to me yet. You can connect it in Apps & connections.`;
}
