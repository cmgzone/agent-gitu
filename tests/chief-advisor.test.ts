import { describe, expect, it } from 'vitest';
import { ChiefOfStaff } from '../src/chief/chief.js';
import { modelChiefAdvisor, parseChiefAdvisorReply } from '../src/chief/advisor.js';
import { DEFAULT_AUTHORITY_POLICY, resolveAuthorityPolicy } from '../src/chief/authority.js';
import { createBudgetAccount } from '../src/coding/budget.js';
import type { ChiefAdvisorRequest, ChiefInput } from '../src/coding/chief.js';
import type { LlmClient, LlmMessage, LlmOptions, LlmTurnResult, LlmUsage } from '../src/llm/llm.js';

/**
 * Model-backed advisor tests.
 *
 * The advisor is the only place a model is given judgment in the request path, so
 * these assert the four bounds that make it safe rather than the wording of its
 * prompt: it can only answer, it pays from the mission's own envelope, it refuses
 * before spending when that envelope is empty, and every failure mode degrades to
 * "no opinion" — which the chief turns into an escalation rather than an approval.
 */

const at = '1970-01-01T00:00:00.000Z';

/** An LLM that records what it was asked and reports usage, so charging is observable. */
class RecordingLlm implements LlmClient {
  readonly name = 'recording';
  readonly calls: LlmMessage[][] = [];

  constructor(private readonly behaviour: { reply?: string; usage?: LlmUsage; fail?: Error } = {}) {}

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    this.calls.push(messages);
    if (this.behaviour.fail) throw this.behaviour.fail;
    if (this.behaviour.usage) opts.onUsage?.(this.behaviour.usage);
    return this.behaviour.reply ?? '';
  }

  async completeStream(): Promise<string> {
    throw new Error('the advisor never streams');
  }

  completeTurn?(): Promise<LlmTurnResult> {
    throw new Error('the advisor never uses structured turns');
  }
}

function question(text = 'Should the schema migration be additive or a rewrite?'): ChiefInput {
  return {
    request: {
      kind: 'questions',
      request: { id: 'q_1', questions: [{ question: text, header: 'Migration', options: ['additive', 'rewrite'] }], requestedAt: at },
    },
    context: { sessionId: 'run_1', goal: 'Migrate the billing schema without downtime', agentId: 'agent_1', requestedBy: 'Scout', budget: { remainingUsd: 3, ceilingUsd: 5 } },
  };
}

function advisorRequest(input: ChiefInput): ChiefAdvisorRequest {
  return { input, decisions: [] };
}

const priceOf = (usage: LlmUsage | undefined): number | undefined => (usage ? (usage.inputTokens + usage.outputTokens) / 1000 : undefined);

function advisor(options: { llm: LlmClient; account?: ReturnType<typeof createBudgetAccount>; policy?: typeof DEFAULT_AUTHORITY_POLICY; onEvent?: (text: string) => void; timeoutMs?: number }) {
  return modelChiefAdvisor({
    llm: options.llm,
    providerId: 'test-provider',
    model: 'test-model',
    priceOf,
    ...(options.account ? { account: options.account } : {}),
    policy: options.policy ?? DEFAULT_AUTHORITY_POLICY,
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
}

describe('model chief advisor — it answers, and only answers', () => {
  it('turns a model reply into the answer the chief settles the question with', async () => {
    const llm = new RecordingLlm({ reply: '```json\n{"answer": "Additive: add the new columns, backfill, then switch readers."}\n```' });
    const decide = advisor({ llm });
    await expect(decide(advisorRequest(question()))).resolves.toEqual({ action: 'answer', answer: 'Additive: add the new columns, backfill, then switch readers.' });
    expect(llm.calls).toHaveLength(1);
  });

  it('discards a reply that claims an action it may not take', () => {
    // An advisor that "approves" is not giving a slightly wrong answer — it is
    // reaching for authority this layer was never given, and that must be refused.
    expect(parseChiefAdvisorReply('{"action":"approve","reason":"looks safe"}')).toBeUndefined();
    expect(parseChiefAdvisorReply('{"action":"escalate","answer":"go ahead"}')).toBeUndefined();
    expect(parseChiefAdvisorReply('I think you should probably just do it')).toBeUndefined();
    expect(parseChiefAdvisorReply('{"answer":"   "}')).toBeUndefined();
    expect(parseChiefAdvisorReply('{"answer":"Additive."}')).toBe('Additive.');
  });

  it('caps an answer so a runaway reply cannot flood the agent that asked', () => {
    const answer = parseChiefAdvisorReply(JSON.stringify({ answer: 'x'.repeat(5_000) }))!;
    expect(answer.length).toBeLessThanOrEqual(1_200);
  });

  it('has no opinion about anything that is not a question', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"sure"}' });
    const decide = advisor({ llm });
    const approval: ChiefInput = {
      request: { kind: 'approval', tier: 'dangerous', request: { id: 'appr_1', tool: 'run_command', why: 'unrecognized', summary: '{"command":"npm test"}', requestedAt: at } },
      context: { sessionId: 'run_1', goal: 'Migrate' },
    };
    await expect(decide(advisorRequest(approval))).resolves.toBeUndefined();
    expect(llm.calls).toHaveLength(0);
  });

  it('has no opinion when the call fails, and says so once', async () => {
    const events: string[] = [];
    const decide = advisor({ llm: new RecordingLlm({ fail: new Error('provider unreachable') }), onEvent: (text) => events.push(text) });
    await expect(decide(advisorRequest(question()))).resolves.toBeUndefined();
    expect(events).toEqual(['chief answer unavailable — provider unreachable']);
  });

  it('has no opinion when the model returns prose instead of an answer', async () => {
    const decide = advisor({ llm: new RecordingLlm({ reply: 'I am not sure about this one.' }) });
    await expect(decide(advisorRequest(question()))).resolves.toBeUndefined();
  });
});

describe('model chief advisor — it pays from the mission envelope', () => {
  it('charges the call, priced, to the account it was given', async () => {
    const account = createBudgetAccount({ maxCostUsd: 1 });
    const decide = advisor({ llm: new RecordingLlm({ reply: '{"answer":"Additive."}', usage: { inputTokens: 400, outputTokens: 100, cachedTokens: 0 } }), account });
    await decide(advisorRequest(question()));
    expect(account.spend()).toEqual({ costUsd: 0.5, turns: 1, subagents: 0 });
    expect(account.remaining().costUsd).toBeCloseTo(0.5);
  });

  it('records the turn even when the host cannot price the call', async () => {
    const account = createBudgetAccount({ maxCostUsd: 1 });
    const decide = advisor({ llm: new RecordingLlm({ reply: '{"answer":"Additive."}' }), account });
    await decide(advisorRequest(question()));
    // Unpriced is still accounted: the envelope must see the work it paid for.
    expect(account.spend()).toEqual({ costUsd: 0, turns: 1, subagents: 0 });
  });

  it('refuses to spend the last of a spent envelope, without calling the model', async () => {
    const events: string[] = [];
    const account = createBudgetAccount({ maxCostUsd: 0.5 });
    account.charge({ costUsd: 0.5, turns: 1 });
    const llm = new RecordingLlm({ reply: '{"answer":"Additive."}' });
    const decide = advisor({ llm, account, onEvent: (text) => events.push(text) });
    await expect(decide(advisorRequest(question()))).resolves.toBeUndefined();
    expect(llm.calls).toHaveLength(0);
    expect(events).toEqual(['chief answer declined — the mission budget is spent']);
  });

  it('answers unaccounted when the host has no envelope at all', async () => {
    // No account means no ceiling was ever set for this work; refusing to answer
    // would invent one, and the runtime's own budget still bounds the mission.
    const decide = advisor({ llm: new RecordingLlm({ reply: '{"answer":"Additive."}' }) });
    await expect(decide(advisorRequest(question()))).resolves.toEqual({ action: 'answer', answer: 'Additive.' });
  });
});

describe('model chief advisor — what the model is told', () => {
  it('carries the mission, the budget, the authority in force and the session history', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"Additive."}' });
    const decide = advisor({ llm, policy: resolveAuthorityPolicy({ questions: { answers: [{ when: /never matches/, answer: 'x' }] } }) });
    await decide({
      input: question(),
      decisions: [
        {
          at,
          source: 'policy',
          requestKind: 'approval',
          requestId: 'appr_1',
          signature: 'approval|run_command:npm test',
          summary: 'run_command: npm test',
          decision: { action: 'approve', reason: 'routine command under this session\u2019s authority policy: npm test' },
        },
      ],
    });

    const [system, user] = llm.calls[0]!;
    expect(String(system!.content)).toContain('You may ONLY answer the question');
    const prompt = String(user!.content);
    expect(prompt).toContain('Migrate the billing schema without downtime');
    expect(prompt).toContain('Delegating teammate: Scout');
    expect(prompt).toContain('$3.00 of $5.00 left');
    // The policy travels as its shape, so the answer is given inside the authority
    // the session actually has rather than a general idea of what sounds safe.
    expect(prompt).toContain('Always escalated: production deployment');
    expect(prompt).toContain('Questions: 1 standing answer rule');
    // Prior decisions, so an answer cannot contradict what the session already settled.
    expect(prompt).toContain('run_command: npm test → approve');
    expect(prompt).toContain('Should the schema migration be additive or a rewrite?');
    expect(prompt).toContain('Offered options: additive | rewrite');
  });

  it('says so when a session cannot be priced rather than implying it can afford anything', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"Additive."}' });
    const decide = advisor({ llm });
    const input = question();
    input.context = { ...input.context };
    delete input.context.budget;
    await decide(advisorRequest(input));
    expect(String(llm.calls[0]![1]!.content)).toContain('Budget: not priced by this host');
  });
});

describe('model chief advisor — through the chief', () => {
  it('answers a question the policy has no rule for', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"Additive, with a backfill step."}' });
    const chief = new ChiefOfStaff({ advisor: advisor({ llm }) });
    await expect(chief.decide(question())).resolves.toEqual({ action: 'answer', answer: 'Additive, with a backfill step.' });
    expect(chief.decisions[0]).toMatchObject({ source: 'advisor', requestKind: 'questions' });
  });

  it('escalates instead of answering when the advisor will not', async () => {
    const chief = new ChiefOfStaff({ advisor: advisor({ llm: new RecordingLlm({ reply: '{"escalate":"only the owner knows"}' }) }) });
    const decision = await chief.decide(question());
    expect(decision.action).toBe('escalate');
    expect(chief.decisions[0]?.source).toBe('policy');
  });

  it('does not consult the model for a question the policy already answers', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"from the model"}' });
    const chief = new ChiefOfStaff({
      advisor: advisor({ llm }),
      policy: { questions: { answers: [{ when: /additive/i, answer: 'Additive — the standing answer.' }] } },
    });
    await expect(chief.decide(question())).resolves.toEqual({ action: 'answer', answer: 'Additive — the standing answer.' });
    expect(llm.calls).toHaveLength(0);
  });

  it('never lets the model near a vetoed request', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"sure, deploy it"}' });
    const chief = new ChiefOfStaff({ advisor: advisor({ llm }) });
    const approval: ChiefInput = {
      request: {
        kind: 'approval',
        tier: 'dangerous',
        request: { id: 'appr_1', tool: 'run_command', why: 'production deployment', summary: '{"command":"bash deploy.sh production"}', requestedAt: at },
      },
      context: { sessionId: 'run_1', goal: 'Migrate' },
    };
    expect((await chief.decide(approval)).action).toBe('escalate');
    expect(llm.calls).toHaveLength(0);
  });

  it('returns one answer for a question asked twice, without paying twice', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"Additive."}' });
    const account = createBudgetAccount({ maxCostUsd: 1 });
    const chief = new ChiefOfStaff({ advisor: advisor({ llm, account }) });
    await chief.decide(question());
    await chief.decide(question());
    expect(llm.calls).toHaveLength(1);
    expect(account.spend().turns).toBe(1);
    expect(chief.decisions[1]?.source).toBe('recurrence');
  });
});

describe('model chief advisor — a hung provider is not allowed to hold the gate', () => {
  it('times out into no opinion', async () => {
    const hanging: LlmClient = {
      name: 'hanging',
      complete: (_messages, opts) =>
        new Promise<string>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      completeStream: async () => '',
    };
    const events: string[] = [];
    const decide = advisor({ llm: hanging, timeoutMs: 20, onEvent: (text) => events.push(text) });
    await expect(decide(advisorRequest(question()))).resolves.toBeUndefined();
    expect(events[0]).toContain('chief answer unavailable');
  });

  it('bounds the prompt it sends, so a huge question cannot become a huge bill', async () => {
    const llm = new RecordingLlm({ reply: '{"answer":"Additive."}' });
    const decide = advisor({ llm });
    await decide(advisorRequest(question('q'.repeat(9_000))));
    const prompt = String(llm.calls[0]![1]!.content);
    expect(prompt.length).toBeLessThan(7_000);
  });
});
