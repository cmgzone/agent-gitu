import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import { ProviderReadCache } from '../src/connections/runtime/provider-cache.js';
import { UniversalCapabilityRegistry } from '../src/connections/runtime/universal-registry.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';

/**
 * Runtime loop enforcement: the anti-repetition rule must be owned by the
 * runtime, not by prompt prose. These tests drive the real agent loop with a
 * scripted model and prove the runtime refuses a strategy it already knows
 * cannot succeed, and refuses to disturb the user with a question the task has
 * already answered.
 */

const homes: string[] = [];
const dirs: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-runtime-policy-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

function project(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `gitu-runtime-policy-${name}-`));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `runtime-policy-${name}` }));
  return dir;
}

afterEach(() => {
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
});

/** A scripted model plus the TASK STATE messages it was shown, so a test can
 * assert on what the runtime actually told the model. */
function scriptedLlm(script: (turn: number, messages: LlmMessage[]) => unknown): { llm: LlmClient; stateMessages: string[] } {
  const stateMessages: string[] = [];
  let turn = 0;
  const llm: LlmClient = {
    name: 'runtime-policy-mock',
    async complete() {
      return '';
    },
    async completeStream() {
      return '';
    },
    async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
      for (const message of messages) {
        const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
        if (content.includes('STATUS:') && content.includes('Respond with exactly one JSON action.')) stateMessages.push(content);
      }
      turn += 1;
      return { kind: 'text', text: JSON.stringify({ action: script(turn, messages) }), metadata: {} };
    },
    async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
      return llm.completeTurn!(messages);
    },
  };
  return { llm, stateMessages };
}

const CAPABILITY_ID = 'conn:app8:update-application';

function appRegistry(): { registry: UniversalCapabilityRegistry; cache: ProviderReadCache } {
  const registry = new UniversalCapabilityRegistry();
  const cache = new ProviderReadCache();
  registry.registerConnection(
    'app8',
    [
      {
        id: 'update-application',
        label: 'Update application',
        capability: 'applications.update',
        method: 'PATCH',
        path: '/api/v1/applications/app8',
        risk: 'reversible-write',
      },
    ],
    async () => {
      throw new Error('should never execute: the runtime refuses the exhausted strategy');
    },
    'coolify',
  );
  return { registry, cache };
}

describe('runtime loop enforcement', () => {
  it('refuses a capability strategy after the user rejected it twice, instead of re-proposing it', async () => {
    const root = project('capability-exhaustion');
    home();
    const { registry, cache } = appRegistry();
    const events: string[] = [];
    const { llm, stateMessages } = scriptedLlm((turn) => {
      if (turn <= 3) {
        return { type: 'capability_action', capability: CAPABILITY_ID, arguments: { name: 'app8' }, reason: 'apply the requested change' };
      }
      return { type: 'complete', summary: 'Stopped re-proposing a change the provider rejected.' };
    });

    let approvals = 0;
    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      universalRegistry: registry,
      providerCache: cache,
      onEvent: (event) => events.push(event),
      approvalHandler: async () => {
        approvals += 1;
        return false;
      },
    });

    await gitu.run('Apply the provider change to app8');

    // Two real attempts, then the runtime refuses the third before it executes.
    expect(approvals).toBe(2);
    expect(events.filter((event) => event.includes(`capability ${CAPABILITY_ID} rejected`))).toHaveLength(2);
    expect(events.some((event) => event.includes(`capability ${CAPABILITY_ID} blocked — exhausted strategy`))).toBe(true);
    // The model is TOLD the run is in a blocked state with legal transitions,
    // rather than being left to rediscover the same rejection.
    const blockedState = stateMessages.find((message) => message.includes('BLOCKED STATE: CAPABILITY_BLOCKED'));
    expect(blockedState).toBeDefined();
    expect(blockedState).toContain('EXHAUSTED STRATEGIES');
    expect(blockedState).toContain('Update application [capability]');
    expect(blockedState).toContain('ALLOWED NEXT TRANSITIONS');
    expect(blockedState).toContain('the user grants the missing access');
  }, 30000);

  it('re-opens an exhausted strategy when the user speaks, instead of staying blocked forever', async () => {
    const root = project('capability-unlock');
    home();
    const { registry, cache } = appRegistry();
    const events: string[] = [];
    let gituRef: Gitu | undefined;
    const { llm } = scriptedLlm((turn) => {
      if (turn <= 2) {
        return { type: 'capability_action', capability: CAPABILITY_ID, arguments: { name: 'app8' }, reason: `attempt ${turn}` };
      }
      if (turn === 3) {
        // The user grants the missing access while the run is in flight. The
        // message is admitted at the top of the next loop iteration.
        gituRef?.queueMessage('I granted app8 write access — retry that change');
        return { type: 'show_plan' };
      }
      if (turn === 4) {
        return { type: 'capability_action', capability: CAPABILITY_ID, arguments: { name: 'app8' }, reason: 'attempt after the user granted access' };
      }
      return { type: 'complete', summary: 'done' };
    });

    let approvals = 0;
    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      universalRegistry: registry,
      providerCache: cache,
      onEvent: (event) => events.push(event),
      approvalHandler: async () => {
        approvals += 1;
        return false;
      },
    });
    gituRef = gitu;

    await gitu.run('Apply the provider change to app8');

    // A user message is a change in the world: the runtime re-opens the strategy,
    // so a granted permission is not ignored for the rest of the run.
    expect(events.some((event) => event.includes('runtime  strategy re-opened by user input — Update application'))).toBe(true);
    expect(approvals).toBe(3);
  }, 30000);

  it('does not re-ask the user a question the task already answered', async () => {
    const root = project('question-dedup');
    home();
    const events: string[] = [];
    const question = { question: 'Which application should I deploy to?', header: 'Target app', options: ['app7', 'app8'] };
    const { llm } = scriptedLlm((turn) => {
      if (turn <= 2) return { type: 'ask_user', questions: [question] };
      return { type: 'complete', summary: 'Target confirmed with app8.' };
    });

    let asks = 0;
    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (event) => events.push(event),
      askUserHandler: async () => {
        asks += 1;
        return 'app8';
      },
    });

    await gitu.run('Deploy the hosted app update');

    expect(asks).toBe(1);
    expect(events.some((event) => event.includes('ask-user 1 question(s) for you'))).toBe(true);
    expect(events.some((event) => event.includes('question answered from the ledger — the user was not asked'))).toBe(true);
  }, 30000);

  it('does not ask a question an active decision already pins', async () => {
    const root = project('question-decision');
    home();
    const events: string[] = [];
    const { llm } = scriptedLlm((turn) => {
      if (turn === 1) {
        return {
          type: 'record_decision',
          decision: 'Production target: app8 — remote Coolify with a broker; local Docker is not part of production',
          alternatives: ['local docker compose'],
          repoEvidence: 'deploy/ hosts the Coolify broker configuration',
          requirements: ['deploy to app8'],
          rejected: [{ alternative: 'local docker', reason: 'production runs remotely' }],
          reconsiderIf: 'the user moves production back to a local machine',
          basis: 'explicit-requirement',
        };
      }
      if (turn === 2) {
        return { type: 'ask_user', questions: [{ question: 'Which application should the broker deploy to?', options: ['app7', 'app8'] }] };
      }
      return { type: 'complete', summary: 'Deployed to the recorded production target.' };
    });

    let asks = 0;
    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (event) => events.push(event),
      askUserHandler: async () => {
        asks += 1;
        return 'app8';
      },
    });

    await gitu.run('Deploy the hosted app update');

    expect(asks).toBe(0);
    expect(events.some((event) => event.includes('question answered from the ledger — the user was not asked'))).toBe(true);
  }, 30000);
});
