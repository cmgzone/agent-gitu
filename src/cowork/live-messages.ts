import type { CoworkMessage } from './store.js';

export type CoworkDelivery = 'queue' | 'steer' | 'question';

/** Each addressed agent receives guidance once, at a tool/model boundary. */
export class CoworkLiveMailbox {
  private readonly messages: CoworkMessage[] = [];
  private readonly delivered = new Map<string, Set<string>>();

  add(message: CoworkMessage): boolean {
    if (this.messages.some(item => item.id === message.id)) return true;
    if (this.messages.length >= 50) return false;
    this.messages.push(message);
    return true;
  }

  take(agentId: string, threadId?: string): CoworkMessage[] {
    const seen = this.delivered.get(agentId) ?? new Set<string>();
    this.delivered.set(agentId, seen);
    return this.messages.filter(message => {
      if (message.threadId !== threadId || seen.has(message.id)) return false;
      if (message.mentionedAgentIds?.length && !message.mentionedAgentIds.includes(agentId)) return false;
      seen.add(message.id);
      return true;
    });
  }

  /** A correction arriving as the last response finishes must not disappear. */
  undelivered(): CoworkMessage[] {
    const seen = new Set([...this.delivered.values()].flatMap(set => [...set]));
    return this.messages.filter(message => !seen.has(message.id));
  }

  remove(id: string): void {
    const index = this.messages.findIndex(message => message.id === id);
    if (index >= 0) this.messages.splice(index, 1);
  }
}

export type AgentCreationKind = 'teammate' | 'worker' | 'clarify' | undefined;

/** Only explicit requests constrain creation; normal task delegation stays autonomous. */
export function agentCreationKind(text: string): AgentCreationKind {
  if (!/\b(?:create|add|hire|make|spawn)\s+(?:(?:me|us|some|a|an|another|new|two|three|four|five|\d+|more|several|few|temporary|permanent|persistent|helper|extra|research|coding|marketing)\s+){0,6}(?:sub[ -]?agents?|agents?|teammates?|characters?|workers?|team(?:\s+members?)?)\b/i.test(text)) return undefined;
  if (/\b(?:sub[ -]?agents?|temporary|ephemeral|task workers?)\b/i.test(text)) return 'worker';
  if (/\b(?:characters?|teammates?|persistent|permanent|team members?)\b/i.test(text) || /\b(?:hire|add)\b[^.!?]*\b(?:agents?|team)\b/i.test(text)) return 'teammate';
  return 'clarify';
}

export const AGENT_CREATION_GUIDANCE = 'AGENT TYPES: Persistent Cowork teammates have characters, profiles, their own memory and connections, and appear in the TEAM sidebar. Create them with team_manage action:create. Temporary sub-agents are bounded task workers with activity orbs; they are not new teammate characters. Use spawn_sub_agent only for temporary work. When the user asks to create agents to help you without making the type clear, ask whether they want permanent character teammates or temporary task workers. Explicit requests for characters/teammates mean persistent agents; explicit sub-agent/temporary-worker requests mean workers. Routine internal delegation for an existing task needs no extra question. List actual teammates with team_manage action:list; do not confuse the persistent roster with the sub-agent execution tree.';
