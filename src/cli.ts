#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Hermes } from './agent/hermes.js';
import { SubAgentRunner } from './agent/subagent.js';
import { AgentStore } from './agents/registry.js';
import { ProjectGuard, ProjectGuardError } from './guard/project-guard.js';
import { TaskLedger } from './ledger/task-ledger.js';
import { LlmError } from './llm/llm.js';
import { PROVIDERS, ProviderError, fetchLiveModels, providerKey, resolveLlm, type ProviderSpec } from './llm/providers.js';
import { mergedEnv } from './llm/keys.js';
import { MemoryStore } from './memory/memory-store.js';
import { Reporter } from './report/reporter.js';
import { HermesServer } from './server/server.js';
import type { MemoryType } from './types.js';

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(key, next);
        i += 1;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function usage(): string {
  return `hermes — bounded autonomous engineering agent

Usage:
  hermes init                          Detect and lock the current project
  hermes run "<goal>" [options]        Run a task end-to-end
  hermes providers                     List LLM providers and key status
  hermes models [--provider <name>]    List models (live from endpoint when a key is set)
  hermes models --pick [provider]      Interactive model chooser
  hermes ui [--port 8321]              Start the Web UI (agent state viewer)
  hermes tasks                         List task ledgers
  hermes show <taskId>                 Show a task ledger
  hermes report <taskId>               Show the completion report for a task
  hermes memory [--type <type>]        Show stored memory

Run options:
  --fast                 Skip context-pack ceremony (small tasks)
  --criteria "<a>|<b>"   Pipe-separated acceptance criteria (skip LLM intake)
  --yes                  Auto-approve dangerous actions (use with care)
  --provider <name>      LLM provider: ${Object.keys(PROVIDERS).join(', ')} (default: auto-detect from env)
  --model <name>         Override model (env: HERMES_MODEL)
  --base-url <url>       Override provider endpoint
  --review               Pause after planning for an interactive plan review before building

Providers:
  alibaba   Alibaba Cloud Model Studio / DashScope (OpenAI-compatible)
            keys: HERMES_ALIBABA_API_KEY | DASHSCOPE_API_KEY | ALIBABA_API_KEY
            models: run \`hermes models --provider alibaba\` (default: qwen3.8-max)
  openai    OpenAI — keys: HERMES_OPENAI_API_KEY | OPENAI_API_KEY
  custom    HERMES_API_KEY (+ optional HERMES_BASE_URL, HERMES_MODEL)`;
}

function askApproval(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function listProviderModels(spec: ProviderSpec, pick: boolean): Promise<void> {
  const keyInfo = providerKey(spec);
  let ids: string[] | undefined;
  let source = 'built-in list (set a key to fetch the live list)';
  if (keyInfo) {
    const live = await fetchLiveModels({ baseUrl: spec.baseUrl, apiKey: keyInfo.key });
    if (live && live.length > 0) {
      ids = live.map((m) => m.id);
      source = `live from ${spec.baseUrl} (${keyInfo.envVar})`;
    } else {
      source = `built-in list (live fetch from ${spec.baseUrl} failed)`;
    }
  }
  if (!ids) ids = [...spec.models];

  console.log(`\n${spec.id} — ${spec.label}`);
  console.log(`source: ${source}`);
  ids.forEach((id, i) => {
    const marker = id === spec.defaultModel ? '  (default)' : '';
    console.log(`  ${String(i + 1).padStart(3)}. ${id}${marker}`);
  });

  if (pick) {
    for (;;) {
      const answer = await askLine(`Choose a model [1-${ids.length}] (or type a model id, empty to cancel): `);
      if (!answer) return;
      const asNumber = Number(answer);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= ids.length) {
        console.log(ids[asNumber - 1]);
        return;
      }
      if (ids.includes(answer)) {
        console.log(answer);
        return;
      }
      console.log('Invalid choice, try again.');
    }
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const command = positional[0];
  const cwd = process.cwd();

  switch (command) {
    case 'init': {
      const guard = ProjectGuard.detect(cwd);
      guard.persist();
      console.log(`Locked project: ${guard.lock.name}`);
      console.log(`  root: ${guard.lock.repoRoot}`);
      console.log(`  branch: ${guard.lock.branch ?? '(none)'}`);
      console.log(`  stack: ${guard.lock.techStack.join(', ') || 'unknown'}`);
      console.log(`  test: ${guard.lock.testCommand ?? '?'} | build: ${guard.lock.buildCommand ?? '?'} | lint: ${guard.lock.lintCommand ?? '?'} | typecheck: ${guard.lock.typecheckCommand ?? '?'}`);
      return;
    }

    case 'tasks': {
      let guard: ProjectGuard;
      try {
        guard = ProjectGuard.detect(cwd);
      } catch {
        console.log('No project detected here. Run `hermes init` inside a project.');
        return;
      }
      const tasks = TaskLedger.list(guard.lock.repoRoot);
      if (tasks.length === 0) {
        console.log('No tasks yet.');
        return;
      }
      for (const t of tasks) {
        const d = t.data;
        console.log(`${d.taskId}  [${d.status.padEnd(9)}]  ${d.goal.slice(0, 80)}`);
      }
      return;
    }

    case 'show': {
      const taskId = positional[1];
      if (!taskId) throw new Error('Usage: hermes show <taskId>');
      const guard = ProjectGuard.detect(cwd);
      const ledger = TaskLedger.load(guard.lock.repoRoot, taskId);
      if (!ledger) throw new Error(`Task not found: ${taskId}`);
      console.log(JSON.stringify(ledger.data, null, 2));
      return;
    }

    case 'report': {
      const taskId = positional[1];
      if (!taskId) throw new Error('Usage: hermes report <taskId>');
      const guard = ProjectGuard.detect(cwd);
      const ledger = TaskLedger.load(guard.lock.repoRoot, taskId);
      if (!ledger) throw new Error(`Task not found: ${taskId}`);
      if (!ledger.data.report) {
        console.log('No completion report for this task yet.');
        return;
      }
      console.log(new Reporter().render(ledger.data.report));
      return;
    }

    case 'memory': {
      const guard = ProjectGuard.detect(cwd);
      const memory = MemoryStore.forProject(guard.lock.repoRoot);
      const type = flags.get('type') as MemoryType | undefined;
      const entries = memory.query({ type, limit: 100 });
      if (entries.length === 0) {
        console.log('(no memory entries)');
        return;
      }
      for (const e of entries) {
        console.log(`[${e.type}] ${e.claim}  (scope: ${e.scope}, conf ${e.confidence}, ${e.createdAt})`);
      }
      return;
    }

    case 'providers': {
      const env = mergedEnv();
      for (const spec of Object.values(PROVIDERS)) {
        const keyEnvVar = spec.keyEnvVars.find((v) => env[v]);
        const status = keyEnvVar ? `ready (${keyEnvVar})` : 'no key';
        console.log(`${spec.id.padEnd(9)} ${status.padEnd(28)} ${spec.label}`);
        console.log(`          base: ${spec.baseUrl}`);
        console.log(`          keys: ${spec.keyEnvVars.join(' | ')}`);
        console.log(`          models: ${spec.models.length} known (default: ${spec.defaultModel}) — run \`hermes models --provider ${spec.id}\``);
      }
      const generic = env['HERMES_API_KEY'] ?? env['OPENAI_API_KEY'];
      console.log(`${'custom'.padEnd(9)} ${generic ? 'ready (HERMES_API_KEY/OPENAI_API_KEY)' : 'no key'}`);
      return;
    }

    case 'models': {
      const strFlag = (key: string): string | undefined => {
        const v = flags.get(key);
        return typeof v === 'string' ? v : undefined;
      };
      const providerId = strFlag('provider');
      const pick = Boolean(flags.get('pick'));
      if (providerId) {
        const spec = PROVIDERS[providerId.toLowerCase()];
        if (!spec) throw new ProviderError(`Unknown provider "${providerId}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
        await listProviderModels(spec, pick);
        return;
      }
      if (pick) {
        const pickProvider = positional[1]?.toLowerCase();
        const pickSpec = pickProvider ? PROVIDERS[pickProvider] : undefined;
        if (pickProvider && !pickSpec) {
          throw new ProviderError(`Unknown provider "${pickProvider}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
        }
        await listProviderModels(pickSpec ?? PROVIDERS['alibaba']!, true);
        return;
      }
      for (const spec of Object.values(PROVIDERS)) {
        await listProviderModels(spec, false);
      }
      console.log('\nPick one for a run: hermes run "<goal>" --provider <name> --model <model-id>');
      return;
    }

    case 'ui': {
      const portRaw = flags.get('port');
      const port = typeof portRaw === 'string' ? Number(portRaw) : 8321;
      if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
      const server = new HermesServer({ cwd, port });
      const bound = await server.start();
      console.log(`Hermes Web UI running: http://localhost:${bound}`);
      console.log('Project scope: detected from the current directory at request time.');
      console.log('Press Ctrl+C to stop.');
      const shutdown = (): void => {
        void server.stop().then(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return;
    }

    case 'run': {
      const goal = positional[1];
      if (!goal) throw new Error('Usage: hermes run "<goal>" [options]');

      let resolved;
      try {
        const strFlag = (key: string): string | undefined => {
          const v = flags.get(key);
          return typeof v === 'string' ? v : undefined;
        };
        resolved = resolveLlm({
          provider: strFlag('provider'),
          model: strFlag('model'),
          baseUrl: strFlag('base-url'),
        });
      } catch (err) {
        if (err instanceof ProviderError) {
          console.error(err.message);
          process.exitCode = 2;
          return;
        }
        throw err;
      }
      console.error(`[hermes] llm: provider=${resolved.providerId} model=${resolved.model} base=${resolved.baseUrl}`);
      const llm = resolved.client;

      const criteriaFlag = flags.get('criteria');
      const criteria = typeof criteriaFlag === 'string' ? criteriaFlag.split('|').map((s) => s.trim()).filter(Boolean) : undefined;

      const agentStore = new AgentStore();
      const subagents =
        agentStore.list().length > 0
          ? new SubAgentRunner({
              cwd,
              resolveLlm: (name) => {
                const def = agentStore.get(name);
                if (!def) throw new Error(`unknown agent "${name}"`);
                return resolveLlm({ provider: def.provider, model: def.model }).client;
              },
              agentRole: (name) => agentStore.get(name)?.role,
              onEvent: (e) => console.error(`[hermes] ${e}`),
            })
          : undefined;

      const hermes = new Hermes({
        cwd,
        llm,
        mode: flags.get('fast') ? 'fast' : 'standard',
        autoApprove: Boolean(flags.get('yes')),
        criteria,
        subagents,
        agentsSection: agentStore.renderForPrompt() || undefined,
        requirePlanReview: Boolean(flags.get('review')),
        planReviewHandler: async ({ criteria: crits, steps }) => {
          console.log('\nPLAN REVIEW');
          console.log('Criteria:');
          crits.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
          console.log('Steps:');
          steps.forEach((s, i) => console.log(`  ${i + 1}. ${s.description}  (verify: ${s.verification})`));
          const answer = await askApproval('Approve and switch to build mode? (y/N) ');
          if (answer) return { approved: true };
          const note = await askLine('Describe the changes you want (sent back to the agent): ');
          return { approved: false, note };
        },
        approvalHandler: async ({ tool, why, summary }) =>
          askApproval(`\nAPPROVAL REQUIRED [${tool}] (${why})\n${summary}\nApprove? (y/N) `),
        askUserHandler: async (questions) => {
          const answers: string[] = [];
          for (const q of questions) {
            console.log(`\nQUESTION${q.header ? ` [${q.header}]` : ''}: ${q.question}`);
            q.options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
            const reply = await askLine(q.options.length > 0 ? 'Your answer (number or text): ' : 'Your answer: ');
            answers.push(reply || '(no answer)');
          }
          return answers.join('\n');
        },
        onEvent: (e) => console.error(`[hermes] ${e.startsWith('browseshot ') ? 'browseshot <image attached to chat>' : e}`),
      });

      try {
        const { ledger, report } = await hermes.run(goal);
        console.log('\n' + new Reporter().render(report));
        console.log(`\nLedger: ${ledger.data.taskId}`);
        process.exitCode = report.status === 'complete' ? 0 : 1;
      } catch (err) {
        if (err instanceof LlmError) {
          console.error(`LLM error: ${err.message}`);
          process.exitCode = 2;
          return;
        }
        throw err;
      }
      return;
    }

    default:
      console.log(usage());
  }
}

main().catch((err: unknown) => {
  if (err instanceof ProjectGuardError || err instanceof ProviderError) {
    console.error(err instanceof ProjectGuardError ? `Project guard: ${err.message}` : err.message);
    process.exit(2);
  }
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
