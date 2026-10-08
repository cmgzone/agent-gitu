import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentCreationKind, CoworkLiveMailbox } from '../src/cowork/live-messages.js';
import type { CoworkMessage } from '../src/cowork/store.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import { GituServer } from '../src/server/server.js';

describe('Cowork live messaging', () => {
  it('distinguishes character teammates, task workers and an ambiguous request', () => {
    expect(agentCreationKind('Create another agent character to help you')).toBe('teammate');
    expect(agentCreationKind('Hire some agents to help you')).toBe('teammate');
    expect(agentCreationKind('Create some agents to help you')).toBe('clarify');
    expect(agentCreationKind('Spawn two temporary sub-agents for research')).toBe('worker');
    expect(agentCreationKind('Build the website and delegate research')).toBeUndefined();
    expect(agentCreationKind('Create a website using your agents')).toBeUndefined();
  });

  it('delivers steering once to each addressed agent and isolates threads', () => {
    const box = new CoworkLiveMailbox();
    const guidance = { id: 'g1', text: 'Use blue', mentionedAgentIds: ['a'], threadId: 't1' } as CoworkMessage;
    box.add(guidance); box.add(guidance);
    expect(box.take('b', 't1')).toEqual([]);
    expect(box.take('a')).toEqual([]);
    expect(box.take('a', 't1')).toEqual([guidance]);
    expect(box.take('a', 't1')).toEqual([]);
    expect(box.undelivered()).toEqual([]);
    box.add({ id: 'g2', text: 'Use green' } as CoworkMessage);
    expect(box.undelivered().map(message => message.id)).toEqual(['g2']);
    expect(box.take('a').map(message => message.id)).toEqual(['g2']);
    expect(box.take('b').map(message => message.id)).toEqual(['g2']);
  });

  it('answers during a held model call, steers the next action, and defers queued work', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'cowork-live-'));
    const priorHome = process.env.AGENT_GITU_HOME;
    process.env.AGENT_GITU_HOME = home;
    let release!: (answer: string) => void;
    const held = new Promise<string>(resolve => { release = resolve; });
    const seen: LlmMessage[][] = [];
    const llm: LlmClient = { name: 'live-test', complete: async messages => {
      seen.push(structuredClone(messages));
      return seen.length === 1 ? held : 'Done.';
    } };
    const server = new GituServer({ cwd: home, port: 0, passwordRequired: false, llm, coworkCompletionProtocol: 'legacy' });
    try {
      const base = 'http://127.0.0.1:' + await server.start();
      const request = async (route: string, body?: unknown) => {
        const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return response.json();
      };
      const agent = (await request('/api/cowork/agents', { name: 'Atlas', systemPrompt: 'Software engineer' })).agent;
      const conversation = (await request('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).conversation;
      const route = '/api/cowork/conversations/' + conversation.id + '/messages';
      await request(route, { id: 'initial', text: 'Build the page' });
      for (let i = 0; i < 100 && !seen.length; i++) await new Promise(resolve => setTimeout(resolve, 20));
      expect(seen).toHaveLength(1);
      expect((await request(route, { id: 'guide', text: 'Make the heading blue', delivery: 'steer' })).steered).toBe(true);
      expect((await request(route, { id: 'later', text: 'Then build a calendar', delivery: 'queue' })).queued).toBe(true);
      await request(route, { id: 'status', text: 'what step are you on?', delivery: 'steer' });
      let view = await request(route);
      for (let i = 0; i < 100 && !view.messages.some((message: CoworkMessage) => message.referencedMessageIds?.includes('status')); i++) { await new Promise(resolve => setTimeout(resolve, 20)); view = await request(route); }
      expect(view.busy).toBe(true);
      expect(view.messages.some((message: CoworkMessage) => message.role === 'agent' && message.referencedMessageIds?.includes('status'))).toBe(true);
      expect(seen).toHaveLength(1);
      release('The page is done.');
      for (let i = 0; i < 150 && view.busy; i++) { await new Promise(resolve => setTimeout(resolve, 20)); view = await request(route); }
      expect(view.busy).toBe(false);
      expect(JSON.stringify(seen[1])).toContain('LIVE USER GUIDANCE: Make the heading blue');
      expect(JSON.stringify(seen[1])).not.toContain('Then build a calendar');
      expect(JSON.stringify(seen[2])).toContain('Then build a calendar');
      expect(view.messages.filter((message: CoworkMessage) => message.id === 'guide')).toHaveLength(1);
      const count = seen.length;
      await request(route, { id: 'status', text: 'what step are you on?', delivery: 'question' });
      expect(seen).toHaveLength(count);
    } finally {
      release('Done.'); await server.stop();
      if (priorHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = priorHome;
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 20_000);
});
