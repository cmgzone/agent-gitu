import type { CoworkWorkEntry } from '../cowork/store.js';
import { credentialChatInput } from './credential-chat.js';

/** Only public action metadata reaches the browser; outputs can contain secrets. */
export function coworkActivityView(entry: CoworkWorkEntry, agentName: string, index: number) {
  return {
    id: `${entry.agentId}:${entry.ts}:${index}`,
    agentId: entry.agentId,
    agentName,
    tool: entry.tool,
    ok: entry.ok,
    ts: entry.ts,
    publicUpdate: credentialChatInput(entry.publicUpdate ?? '').safeText,
  };
}
