import type { CoworkStore, CoworkRequest } from './store.js';

/** Preserve a clear unanswered question as a card when a model omits ask_user. */
export function ensureQuestionCard(store: CoworkStore | undefined, conversationId: string, agentId: string, reply: string): CoworkRequest | undefined {
  if (!store) return undefined;
  const lines = reply.replace(/```[\s\S]*?```/g, '').replace(/<cowork_state>[\s\S]*?<\/cowork_state>/g, '').split('\n').map(line => line.trim());
  let index = -1, question = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
    if (/^["'“`>]/.test(line)) continue;
    const match = /(?:^|[.!]\s+)((?:Which|What|Where|When|Who|Why|How (?:should|would|do|can)|Would you|Do you|Are you|Can you|Could you|Should I|Shall I)[^?]{2,500}\?)\s*$/i.exec(line);
    if (match && !/\b(?:password|secret|api[ -]?key|access[ -]?token|verification code|one.time code|otp)\b/i.test(match[1]!)) { index = i; question = match[1]!; break; }
  }
  if (!question) return undefined;
  const existing = store.requests(conversationId).find(r => r.agentId === agentId && r.kind === 'question' && r.status === 'open' && !r.hiddenAt && r.title === question);
  if (existing) return existing;
  const options: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!line) continue;
    const option = /^(?:[-*]|\d+[.)])\s+(.{1,100})$/.exec(line);
    if (!option || options.length >= 6) break;
    options.push(option[1]!.replace(/\*\*/g, ''));
  }
  return store.addRequest({ conversationId, agentId, kind: 'question', title: question, detail: 'Your teammate needs this answer to continue.', options });
}
