#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { Gitu } from './agent/gitu.js';
import { SubAgentRunner } from './agent/subagent.js';
import { AgentStore } from './agents/registry.js';
import { createCliPresenter } from './cli/presenter.js';
import { ProjectGuard, ProjectGuardError } from './guard/project-guard.js';
import { TaskLedger } from './ledger/task-ledger.js';
import { LlmError } from './llm/llm.js';
import {
  PROVIDERS,
  ProviderError,
  fetchLiveModels,
  fetchModelCatalog,
  modelCapabilityTier,
  modelMetadataFor,
  providerKey,
  resolveLlm,
  type ProviderSpec,
} from './llm/providers.js';
import { codexSubscriptionInfo, startCodexSubscriptionLogin, waitForCodexSubscriptionLogin } from './llm/codex-subscription.js';
import { mergedEnv } from './llm/keys.js';
import { MemoryStore } from './memory/memory-store.js';
import { Reporter } from './report/reporter.js';
import { GituServer } from './server/server.js';
import type { MemoryStatus, MemoryType, MemoryVisibility } from './types.js';

interface ParsedArgs {
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  // Flags that take an explicit value. Anything else is boolean — and the
  // literal tokens false/no/off/0 DISABLE it instead of truthy-enabling it.
  const VALUE_FLAGS = new Set(['provider', 'model', 'base-url', 'port', 'type', 'criteria', 'limit', 'scope', 'visibility', 'agent', 'project', 'status']);
  const FALSEY = new Set(['false', 'no', 'off', '0']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (VALUE_FLAGS.has(key) && next !== undefined && !next.startsWith('--')) {
        flags.set(key, next);
        i += 1;
      } else if (next !== undefined && !next.startsWith('--') && FALSEY.has(next.trim().toLowerCase())) {
        flags.set(key, false);
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
  return `Agent Gitu — autonomous engineering agent (cli: gitu; hermes is a legacy alias)

Usage:
  gitu init                            Detect and lock the current project
  gitu run "<goal>" [options]          Run a task end-to-end
  gitu providers                       List LLM providers and key status
  gitu login                           Sign in with ChatGPT (use your subscription, no API key)
  gitu logout                          Sign out of ChatGPT
  gitu models [--provider <name>]      List models (live from endpoint when a key is set)
  gitu models --pick [provider]        Interactive model chooser
  gitu ui [--port 8321]                Start the Web UI (agent state viewer)
  gitu status [--json]                 Show a compact developer-workspace overview
  gitu tasks                           List task ledgers
  gitu show <taskId> [--json]          Show a focused task view (or its raw ledger)
  gitu report <taskId>                 Show the completion report for a task
  gitu memory [--type <type>] [--json] Show stored memory
  gitu memory search <query>           Ranked search (--limit --scope --visibility --agent --project --type --status --json)

Run options:
  --fast                 Skip context-pack ceremony (small tasks)
  --criteria "<a>|<b>"   Pipe-separated acceptance criteria (skip LLM intake)
  --yes                  Auto-approve dangerous actions (use with care)
  --provider <name>      LLM provider: ${Object.keys(PROVIDERS).join(', ')} (default: auto-detect from env)
  --model <name>         Override model (env: HERMES_MODEL)
  --base-url <url>       Override provider endpoint
  --review               Pause after planning for an interactive plan review before building
  --json                 Return structured JSON for inspection commands
  --no-color             Disable terminal colour

Providers:
  chatgpt   ChatGPT subscription — run \`gitu login\` (uses the models in your
            ChatGPT plan through local Codex; no API key)
  alibaba   Alibaba Cloud Model Studio / DashScope (OpenAI-compatible)
            keys: HERMES_ALIBABA_API_KEY | DASHSCOPE_API_KEY | ALIBABA_API_KEY
            models: run \`gitu models --provider alibaba\` (default: qwen3.8-max)
  deepseek  DeepSeek direct API (OpenAI-compatible)
            keys: HERMES_DEEPSEEK_API_KEY | DEEPSEEK_API_KEY
            models: run \`gitu models --provider deepseek\` (default: deepseek-v4-pro)
  openai    OpenAI — keys: HERMES_OPENAI_API_KEY | OPENAI_API_KEY
  custom    HERMES_API_KEY (+ optional HERMES_BASE_URL, HERMES_MODEL)`;
}

function askApproval(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    // stdin EOF (piped script, CI) closes readline without invoking the
    // question callback — resolve with the safe default instead of hanging.
    rl.on('close', () => resolve(false));
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function askLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.on('close', () => resolve(''));
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function listProviderModels(spec: ProviderSpec, pick: boolean): Promise<void> {
  if (spec.auth === 'chatgpt-subscription') {
    const status = await codexSubscriptionInfo();
    const ids = status.models.length > 0 ? status.models.map((model) => model.id) : [...spec.models];
    console.log(`\n${spec.id} — ${spec.label}`);
    console.log(`source: ${status.signedIn ? 'models available through your local Codex sign-in' : 'built-in list (run gitu login to use this provider)'}`);
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
    return;
  }
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
  const json = flags.get('json') === true;
  const noColor = flags.get('no-color') === true;
  const plain = flags.get('plain') === true;
  const ascii = flags.get('ascii') === true;
  const presenter = createCliPresenter({
    color: Boolean(process.stdout.isTTY) && !noColor && !plain && !('NO_COLOR' in process.env),
    unicode: process.env['TERM'] !== 'dumb' && !ascii,
    width: typeof process.stdout.columns === 'number' ? process.stdout.columns : undefined,
  });

  switch (command) {
    case 'init': {
      const guard = ProjectGuard.detect(cwd);
      guard.persist();
      if (json) console.log(JSON.stringify(guard.lock, null, 2));
      else console.log(presenter.projectLocked(guard.lock));
      return;
    }

    case 'status': {
      let guard: ProjectGuard;
      try {
        guard = ProjectGuard.detect(cwd);
      } catch {
        console.log('No project detected here. Run `gitu init` inside a project.');
        return;
      }
      const tasks = TaskLedger.list(guard.lock.repoRoot).map((task) => task.data);
      const memory = MemoryStore.forProject(guard.lock.repoRoot).stats();
      if (json) console.log(JSON.stringify({ project: guard.lock, tasks, memory }, null, 2));
      else console.log(presenter.workspaceStatus(guard.lock, tasks, memory));
      return;
    }

    case 'tasks': {
      let guard: ProjectGuard;
      try {
        guard = ProjectGuard.detect(cwd);
      } catch {
        console.log('No project detected here. Run `gitu init` inside a project.');
        return;
      }
      const tasks = TaskLedger.list(guard.lock.repoRoot);
      if (tasks.length === 0) {
        console.log('No tasks yet.');
        return;
      }
      if (json)
        console.log(
          JSON.stringify(
            tasks.map((task) => task.data),
            null,
            2,
          ),
        );
      else console.log(presenter.taskList(tasks.map((task) => task.data)));
      return;
    }

    case 'show': {
      const taskId = positional[1];
      if (!taskId) throw new Error('Usage: gitu show <taskId>');
      const guard = ProjectGuard.detect(cwd);
      const ledger = TaskLedger.load(guard.lock.repoRoot, taskId);
      if (!ledger) throw new Error(`Task not found: ${taskId}`);
      if (json) console.log(JSON.stringify(ledger.data, null, 2));
      else console.log(presenter.taskDetails(ledger.data));
      return;
    }

    case 'report': {
      const taskId = positional[1];
      if (!taskId) throw new Error('Usage: gitu report <taskId>');
      const guard = ProjectGuard.detect(cwd);
      const ledger = TaskLedger.load(guard.lock.repoRoot, taskId);
      if (!ledger) throw new Error(`Task not found: ${taskId}`);
      if (!ledger.data.report) {
        console.log('No completion report for this task yet.');
        return;
      }
      if (json) console.log(JSON.stringify(ledger.data.report, null, 2));
      else console.log(`${presenter.completion(ledger.data.report)}\n\n${new Reporter().render(ledger.data.report)}`);
      return;
    }

    case 'memory': {
      const guard = ProjectGuard.detect(cwd);
      const memory = MemoryStore.forProject(guard.lock.repoRoot);
      if (positional[1] === 'search') {
        const query = positional.slice(2).join(' ').trim();
        if (!query) {
          console.log('Usage: gitu memory search <query> [--limit N] [--scope S] [--visibility V] [--agent A] [--project P] [--type T] [--status S]');
          return;
        }
        const str = (k: string): string | undefined => (typeof flags.get(k) === 'string' ? (flags.get(k) as string) : undefined);
        const limitRaw = str('limit');
        const results = await memory.search(query, {
          limit: limitRaw !== undefined && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined,
          scope: str('scope'),
          visibility: str('visibility') as MemoryVisibility | undefined,
          agentId: str('agent'),
          projectId: str('project'),
          type: str('type') as MemoryType | undefined,
          status: str('status') as MemoryStatus | undefined,
        });
        if (results.length === 0) {
          console.log('(no matching memories)');
          return;
        }
        if (json) console.log(JSON.stringify(results, null, 2));
        else console.log(presenter.memorySearch(results));
        return;
      }
      const type = flags.get('type') as MemoryType | undefined;
      const entries = memory.query({ type, limit: 100 });
      if (entries.length === 0) {
        console.log('(no memory entries)');
        return;
      }
      if (json) console.log(JSON.stringify(entries, null, 2));
      else console.log(presenter.memoryList(entries));
      return;
    }

    case 'providers': {
      const env = mergedEnv();
      for (const spec of Object.values(PROVIDERS)) {
        if (spec.id === 'chatgpt') {
          const status = await codexSubscriptionInfo();
          const statusText = status.signedIn ? `ready (ChatGPT${status.planType ? ` · ${status.planType}` : ''})` : 'not signed in — run `gitu login`';
          console.log(`${spec.id.padEnd(9)} ${statusText.padEnd(40)} ${spec.label}`);
          console.log(`          base: ${spec.baseUrl}`);
          console.log(`          auth: local Codex browser sign-in (no API key) — run \`gitu login\``);
          console.log(`          models: ${spec.models.length} known (default: ${spec.defaultModel}) — run \`gitu models --provider ${spec.id}\``);
          continue;
        }
        const keyEnvVar = spec.keyEnvVars.find((v) => env[v]);
        const status = keyEnvVar ? `ready (${keyEnvVar})` : 'no key';
        console.log(`${spec.id.padEnd(9)} ${status.padEnd(28)} ${spec.label}`);
        console.log(`          base: ${spec.baseUrl}`);
        console.log(`          keys: ${spec.keyEnvVars.join(' | ')}`);
        console.log(`          models: ${spec.models.length} known (default: ${spec.defaultModel}) — run \`gitu models --provider ${spec.id}\``);
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
      console.log('\nPick one for a run: gitu run "<goal>" --provider <name> --model <model-id>');
      return;
    }

    case 'ui': {
      const portRaw = flags.get('port');
      const port = typeof portRaw === 'string' ? Number(portRaw) : 8321;
      if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
      const server = new GituServer({ cwd, port });
      const bound = await server.start();
      console.log(`Agent Gitu Web UI running: http://localhost:${bound}`);
      console.log('Project scope: detected from the current directory at request time.');
      console.log('Press Ctrl+C to stop.');
      const shutdown = (): void => {
        // stop() can reject (server already closed) and previously waited on
        // long-lived SSE connections; catch and force-exit either way.
        server
          .stop()
          .catch(() => {})
          .finally(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return;
    }

    case 'run': {
      const goal = positional[1];
      if (!goal) throw new Error('Usage: gitu run "<goal>" [options]');

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
          workingDirectory: cwd,
        });
      } catch (err) {
        if (err instanceof ProviderError) {
          console.error(err.message);
          process.exitCode = 2;
          return;
        }
        throw err;
      }
      const llm = resolved.client;
      const catalog = await fetchModelCatalog();
      const modelMeta = modelMetadataFor(catalog, resolved.providerId, resolved.model);
      const contextWindowTokens = modelMeta?.contextTokens;
      const modelCapability = modelCapabilityTier(modelMeta, resolved.model);

      const criteriaFlag = flags.get('criteria');
      const criteria =
        typeof criteriaFlag === 'string'
          ? criteriaFlag
              .split('|')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      const runProject = ProjectGuard.detect(cwd).lock;
      console.error(
        presenter.runHeader({
          project: runProject.name,
          branch: runProject.branch,
          provider: resolved.providerId,
          model: resolved.model,
          mode: flags.get('fast') ? 'fast' : 'standard',
          goal,
          criteriaCount: criteria?.length,
        }),
      );
      if (contextWindowTokens) console.error(presenter.event(`context  ${contextWindowTokens.toLocaleString()} token model window`));

      const agentStore = new AgentStore();
      const subagents =
        agentStore.list().length > 0
          ? new SubAgentRunner({
              cwd,
              resolveLlm: (name) => {
                const def = agentStore.get(name);
                if (!def) {
                  const available = agentStore
                    .list()
                    .map((a) => `"${a.name}"`)
                    .join(', ');
                  throw new Error(
                    `unknown specialist agent "${name}". Available agents: [${available || 'none'}]. Note: "agent" must be a registered specialist name, NOT a model/provider identifier.`,
                  );
                }
                return resolveLlm({ provider: def.provider, model: def.model, workingDirectory: cwd }).client;
              },
              agentRole: (name) => agentStore.get(name)?.role,
              agentEffort: (name) => agentStore.get(name)?.effort,
              onEvent: (e) => console.error(presenter.event(e)),
            })
          : undefined;

      const gitu = new Gitu({
        cwd,
        llm,
        mode: flags.get('fast') ? 'fast' : 'standard',
        contextWindowTokens,
        modelCapability,
        autoApprove: Boolean(flags.get('yes')),
        // Safe mode: even with --yes, dangerous-tier commands still require a
        // human. Opt in with --safe-mode or HERMES_SAFE_MODE=1.
        safeMode: Boolean(flags.get('safe-mode')) || /^(1|true|yes)$/i.test(process.env['HERMES_SAFE_MODE'] ?? ''),
        criteria,
        autoInstallLsp: true,
        subagents,
        agentsSection: agentStore.renderForPrompt() || undefined,
        specialists: agentStore.list().map((a) => ({ name: a.name, role: a.role })),
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
        approvalHandler: async ({ tool, why, summary }) => askApproval(`\nAPPROVAL REQUIRED [${tool}] (${why})\n${summary}\nApprove? (y/N) `),
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
        onEvent: (e) => console.error(presenter.event(e.startsWith('browseshot ') ? 'image  browser screenshot attached to the agent context' : e)),
      });

      try {
        const { report } = await gitu.run(goal);
        console.log(`\n${presenter.completion(report)}\n\n${new Reporter().render(report)}`);
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

    case 'login': {
      const started = await startCodexSubscriptionLogin();
      if (started.alreadySignedIn) {
        const status = await codexSubscriptionInfo(true);
        console.log(`Already connected to ChatGPT${status.planType ? ` (${status.planType})` : ''}.`);
        return;
      }
      console.log('Open this secure Codex sign-in link in a browser:');
      console.log(`  ${started.authUrl}`);
      console.log('\nWaiting up to five minutes for sign-in to complete…');
      const completed = started.loginId ? await waitForCodexSubscriptionLogin(started.loginId) : false;
      if (!completed) {
        console.log('Sign-in was not completed. Run `gitu login` again when you are ready.');
        process.exitCode = 2;
        return;
      }
      const status = await codexSubscriptionInfo(true);
      console.log(`Connected to ChatGPT${status.planType ? ` (${status.planType})` : ''}.`);
      console.log('Use it with: gitu run "<goal>" --provider chatgpt');
      return;
    }

    case 'logout': {
      console.log('Run `codex logout` to sign out. Agent Gitu never stores your ChatGPT credentials.');
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
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
