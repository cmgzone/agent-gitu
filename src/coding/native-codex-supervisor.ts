import type { GituConfig, GituRunResult } from '../agent/gitu.js';
import { EvidenceEngine, classifyEvidenceKind, evidenceMatchesWorkspace, isManufacturedEvidenceCommand, isTrivialEvidenceCommand, latestVerificationEvidence } from '../evidence/evidence.js';
import { captureVerificationScope, refreshScopedVerification } from '../evidence/verification-scope.js';
import { bindCriterionVerification, inspectVerificationCommand } from '../evidence/verification-command.js';
import { selectVerificationCommands, verifiedDocumentationWrites } from '../evidence/verification-policy.js';
import { planRisk } from '../agent/risk-planner.js';
import { Executor } from '../executor/executor.js';
import { getWorkspaceFingerprint } from '../git/git.js';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { LlmError } from '../llm/llm.js';
import type { NativeRecord, NativeTaskInput } from '../llm/native-task.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import { commandResultSource, isCommandPending } from '../tools/tools.js';
import { codingServiceToolIds, canonicalToolDefinition } from '../tools/catalog.js';
import { conversationIntent, evaluateInstructionGate } from '../agent/follow-up.js';
import { RunTelemetry } from '../agent/telemetry.js';
import { classifyCommand } from '../policy/policy.js';
import { connectionResultDisclosure } from '../agent/recovery-synthesizer.js';
import type { CriterionSpec, ToolResult } from '../types.js';
import { canonicalJson, sha256 } from '../util.js';
import { nativeCodexPermissions, NATIVE_PERMISSION_PROFILE } from './native-codex-permissions.js';
import { COMMAND_RECOVERY_CONTRACT } from '../agent/command-recovery.js';
import { runNativeTurnWithRecovery } from '../agent/task-recovery.js';
import { isDeploymentAction, DEPLOYMENT_OWNERSHIP } from './deployment-authority.js';

function object(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NativeRecord) : {};
}
const activeTasks = new Set<string>();
// Derived from the one catalog, so a capability cannot be reachable here and
// invisible there (or the reverse) without a single edit.
const SERVICE_TOOLS = codingServiceToolIds();

export function nativeGituTools(): NativeRecord[] {
  const taskDef = canonicalToolDefinition('gitu_task');
  const serviceDef = canonicalToolDefinition('gitu_service');
  const coreTools = ['read_file', 'write_file', 'apply_edit', 'list_files', 'search_files', 'run_command'];
  return [
    {
      type: 'function',
      name: 'gitu_task',
      description: taskDef?.description ?? 'Gitu task supervision.',
      inputSchema: taskDef?.inputSchema ?? { type: 'object', properties: {} },
    },
    {
      type: 'function',
      name: 'gitu_service',
      description: serviceDef?.description ?? 'Use Gitu’s guarded services.',
      inputSchema: serviceDef?.inputSchema ?? { type: 'object', properties: {} },
    },
    ...coreTools.map((id) => {
      const def = canonicalToolDefinition(id);
      return {
        type: 'function',
        name: 'gitu_' + id,
        description: def?.description ?? `Gitu guarded ${id}.`,
        inputSchema: def?.inputSchema ?? { type: 'object', properties: {} },
      };
    }),
  ];
}

/** The supervisor observes execution events and verifies once; it does not re-prompt. */
export async function runNativeCodexTask(input: {
  config: GituConfig;
  guard: ProjectGuard;
  ledger: TaskLedger;
  memory: MemoryStore;
  policy: PolicyEngine;
  signal: AbortSignal;
  goal: string;
  message: string;
  conversationControl?: () => 'pause' | 'question' | undefined;
}): Promise<GituRunResult> {
  const { config, guard, ledger, memory, policy, signal, goal } = input;
  const runtime = config.llm.nativeTask!;
  const taskKey = guard.activeWritableRoot + ':' + ledger.data.taskId;
  if (activeTasks.has(taskKey)) throw new Error('This task already has an active native execution.');
  activeTasks.add(taskKey);
  const emit = config.onEvent ?? (() => {});
  const typed = config.onCodingEvent;
  let lastFingerprint = 'unknown-fp';
  const workspaceFingerprint = async (): Promise<string> => {
    lastFingerprint = await getWorkspaceFingerprint(guard.activeWritableRoot, {
      signal,
      onProgress: (checked, total) => emit(`verify   Checking workspace files ${checked}/${total} locally.`),
    });
    return lastFingerprint;
  };
  const evidence = new EvidenceEngine();
  const telemetry = new RunTelemetry();
  const phase = ledger.activeWorkPhase()!;
  const executor = new Executor(
    guard,
    ledger,
    policy,
    new LoopDetector(),
    emit,
    config.skills,
    config.mcp,
    config.browser,
    config.lsp,
    config.subagents ? (specs) => config.subagents!.runMany(specs) : undefined,
    config.subagents ? (specs) => config.subagents!.startMany(specs) : undefined,
    config.subagents ? (ids) => config.subagents!.status(ids) : undefined,
    undefined,
    config.connections,
    { memory, memoryContext: config.memoryRetrieval ?? { projectId: guard.lock.name }, signal: () => signal, onCodingEvent: typed, deploymentAllowed: config.deploymentAllowed },
  );
  const processed = new Set((ledger.data.execution?.native?.processedItems ?? []).filter((id) => id.startsWith('tool:')));
  const seenItems = new Set<string>();
  const repetitions = new Map<string, number>();
  const responseByItem = new Map<string, string>();
  const reasoningByItem = new Map<string, string>();
  const answers = new Map<string, Promise<NativeRecord>>();
  // Latched by the first admitted tool call. A native turn that fails before
  // this point is safe to re-enter; one that fails after it must not be, since
  // the retry would start a fresh provider session whose call ids no longer
  // match the dedupe records (see `runNativeTurnWithRecovery`).
  let acted = false;
  const observedCommands = new Set<string>();
  const commandVerificationScopes = new Map<string, unknown>();
  let finalAnswer = '',
    exited: 'complete' | 'blocked' | 'aborted' = 'blocked';
  let planReviewed = !config.requirePlanReview || ledger.data.planApproved === true;
  let runtimeResult: 'completed' | 'interrupted' | undefined;
  let answeredDiscussion = false;
  let providerError: unknown;
  const discussion = Boolean(config.resume && conversationIntent(input.message));
  const acceptedChanges = (): boolean =>
    ledger.data.actions.slice(phase.actionStartIndex).some((action) => action.status === 'success' && ['apply_edit', 'write_file'].includes(action.tool));
  const currentCriteria = () => ledger.data.acceptanceCriteria.filter((c) => !phase.priorCriterionIds.includes(c.id));
  const inspections = new Map<string, ReturnType<typeof inspectVerificationCommand>>();
  const inspect = (command: string) => {
    if (!inspections.has(command)) inspections.set(command, inspectVerificationCommand(command, guard.activeWritableRoot, signal));
    return inspections.get(command)!;
  };
  const updatePlan = (plan: NativeRecord[]): void => {
    const state = ledger.data.execution!.native!;
    const saved = state.planStepIds ?? [];
    const added = ledger.appendPlan(plan.slice(saved.length).map((s) => ({ description: String(s['step']), verification: 'Gitu acceptance evidence' })));
    state.planStepIds = [...saved, ...added.map((s) => s.id)];
    for (const id of saved.slice(plan.length)) {
      const step = ledger.data.plan.find((s) => s.id === id);
      if (step && step.status !== 'done') step.status = 'cancelled';
    }
    plan.forEach((entry, index) => {
      const step = ledger.data.plan.find((s) => s.id === state.planStepIds?.[index]);
      if (step) {
        step.description = String(entry['step']);
        step.status = entry['status'] === 'completed' ? 'done' : entry['status'] === 'inProgress' ? 'in_progress' : 'pending';
      }
    });
    ledger.save();
    emit(`plan     ${plan.length} steps`);
    typed?.({ type: 'plan_created', steps: plan.length });
  };

  const checkPlan = async (): Promise<boolean> => {
    if (planReviewed) return true;
    if (!ledger.data.plan.length || !config.planReviewHandler) return false;
    const decision = await config.planReviewHandler({
      criteria: currentCriteria().map((c) => c.text),
      steps: ledger.data.plan.filter((s) => !phase.priorPlanStepIds.includes(s.id)).map((s) => ({ description: s.description, verification: s.verification })),
    });
    signal.throwIfAborted();
    planReviewed = decision.approved;
    ledger.data.planApproved = planReviewed;
    ledger.save();
    return planReviewed;
  };

  const commandOutcome = async (command: string, result: { exitCode?: number; output: string; ok: boolean }): Promise<void> => {
    if (result.exitCode === undefined) return;
    const fingerprint = await workspaceFingerprint();
    const ev = evidence.record(ledger.data, {
      kind: classifyEvidenceKind(command),
      label: command,
      command,
      exitCode: result.exitCode,
      passed: result.ok,
      output: result.output,
      workspaceFingerprint: fingerprint,
      verificationScope: await captureVerificationScope(commandVerificationScopes.get(command), guard.activeWritableRoot, command),
    });
    ledger.save();
    emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${ev.kind}) ${command}`);
    typed?.({ type: 'evidence_recorded', evidenceId: ev.id, passed: ev.passed, kind: ev.kind });
    const key = sha256(command + result.exitCode + result.output + fingerprint);
    const count = (repetitions.get(key) ?? 0) + 1;
    repetitions.set(key, count);
    if (count === 3) {
      emit('recover  The model repeated an unchanged command result. Asking it to use saved results and advance the task.');
      await runtime.steer?.(
        'Gitu observed the same command and unchanged result three times. Reuse the saved evidence. Make a different useful action or report the concrete blocker; do not restart completed checks.',
      );
    }
    if (count >= 4) throw new Error('The model repeated the same command result without progress after a steering correction. Task saved for review.');
  };

  const service = async (params: NativeRecord): Promise<NativeRecord> => {
    const tool = String(params['tool'] ?? '');
    const toolParams = object(params['params']);
    const operation = object(toolParams['operation']);
    const capability = tool === 'capability_action' ? config.universalRegistry?.get(String(toolParams['capability'] ?? '')) : undefined;
    const deploymentMetadata = [operation['id'], operation['capability'], operation['path'], toolParams['operationId'], capability?.id, capability?.capability, capability?.label].filter(Boolean).join(' ');
    if (config.deploymentAllowed?.() === false && isDeploymentAction(tool, toolParams, deploymentMetadata))
      return { success: false, contentItems: [{ type: 'inputText', text: DEPLOYMENT_OWNERSHIP }] };
    if (
      (discussion || input.conversationControl?.()) &&
      ![
        'read_file',
        'list_files',
        'search_files',
        'browse',
        'browser',
        'web_search',
        'web_fetch',
        'list_connections',
        'connection_read',
        'list_skills',
        'use_skill',
        'agent_status',
      ].includes(tool) &&
      !(tool === 'run_command' && (toolParams['action'] === 'status' || classifyCommand(String(toolParams['command'] ?? '')).tier === 'safe'))
    )
      return {
        success: false,
        contentItems: [{ type: 'inputText', text: 'Execution is paused for the user’s question/discussion. Answer with read-only inspection and preserve unfinished work.' }],
      };
    if (!SERVICE_TOOLS.includes(tool) && !(tool.startsWith('mcp:') && config.mcp))
      return { success: false, contentItems: [{ type: 'inputText', text: 'Unsupported Gitu service. Discover exact tools with list_mcp or list_connections, then use their registered names. Do not invent approval endpoints or MCP aliases.' }] };
    if (tool.startsWith('mcp:') && config.mcp) {
      const [, server, ...name] = tool.split(':');
      const tools = server ? await config.mcp.toolsForServer(server) : undefined;
      if (!tools?.some(entry => entry.name === name.join(':'))) return { success: false, contentItems: [{ type: 'inputText', text: 'This MCP tool is not registered or available. Use list_mcp or list_connections to discover the actual saved connection and supported operations. An approval cannot create a missing tool.' }] };
    }
    if (tool === 'bind_criterion_verification') {
      const criterion = currentCriteria().find((c) => c.id === toolParams['criterionId']);
      const command = typeof toolParams['verification'] === 'string' ? toolParams['verification'] : '';
      if (!criterion) return { success: false, contentItems: [{ type: 'inputText', text: 'Only a current work-phase criterion can receive a verification command.' }] };
      const bound = await bindCriterionVerification(criterion, command, guard.activeWritableRoot, signal, {
        replacementReason: typeof toolParams['replacementReason'] === 'string' ? toolParams['replacementReason'] : undefined,
        userPinned: criterion.verificationUserPinned === true,
      });
      if (bound.ok) {
        ledger.save();
        emit(`criteria ${criterion.id} verification bound — ${criterion.verification}`);
      }
      return { success: bound.ok, contentItems: [{ type: 'inputText', text: bound.reason }] };
    }
    if (['write_file', 'apply_edit', 'delegate', 'delegate_background'].includes(tool) && !(await checkPlan()))
      return { success: false, contentItems: [{ type: 'inputText', text: 'Plan approval is required before changing files or delegating. Publish a native plan first.' }] };
    if (['capability_action', 'connection_action', 'connection_operation', 'connection_discovery'].includes(tool)) {
      try {
        let result: unknown;
        if (tool === 'capability_action') {
          const capability = config.universalRegistry?.get(String(toolParams['capability'] ?? ''));
          if (!capability || !config.providerCache) throw new Error('Select a capability from this task’s registered capability catalog.');
          result = await config.universalRegistry!.invoke(
            {
              capability: capability.id,
              arguments: object(toolParams['arguments']),
              source: capability.source,
              ...(capability.connectionId ? { connectionId: capability.connectionId } : {}),
            },
            {
              cache: config.providerCache,
              approvalHandler: async (proposal) =>
                (await config.approvalHandler?.({
                  tool: 'capability:' + proposal.id,
                  tier: proposal.risk === 'destructive' ? 'dangerous' : 'moderate',
                  why: 'Individually approve registered ' + proposal.risk + ' capability',
                  summary: JSON.stringify(proposal.params ?? {}),
                })) ?? false,
            },
          );
          ledger.syncProviderState(config.providerCache.getEpochs(), config.providerCache.listEvidence());
        } else if (tool === 'connection_action' && config.connectionActionHandler)
          result = await config.connectionActionHandler({ connectionId: String(toolParams['connectionId']), operationId: String(toolParams['operationId']) });
        else if (tool === 'connection_operation' && config.connectionOperationHandler) {
          result = await config.connectionOperationHandler(toolParams as unknown as Parameters<NonNullable<GituConfig['connectionOperationHandler']>>[0]);
          config.providerCache?.advanceStateEpoch(String(toolParams['connectionId']));
        } else if (tool === 'connection_discovery' && config.connectionDiscoveryHandler)
          result = await config.connectionDiscoveryHandler(toolParams as unknown as Parameters<NonNullable<GituConfig['connectionDiscoveryHandler']>>[0]);
        else throw new Error('This host has no registered handler for ' + tool);
        const disclosed = connectionResultDisclosure(result);
        const ok = !['failed', 'rejected', 'blocked', 'pending'].includes(String(object(result)['status'] ?? ''));
        ledger.recordAction({
          tool,
          paramsHash: sha256(JSON.stringify(toolParams)),
          paramsSummary: tool + ' ' + String(toolParams['capability'] ?? toolParams['connectionId'] ?? ''),
          reason: String(params['reason'] ?? 'Native registered operation'),
          expected: 'Registered operation result',
          status: ok ? 'success' : 'error',
          observation: disclosed.text,
          durationMs: 0,
        });
        return { success: ok, contentItems: [{ type: 'inputText', text: disclosed.text }] };
      } catch (error) {
        return { success: false, contentItems: [{ type: 'inputText', text: (error as Error).message }] };
      }
    }
    const result = await executor.execute({
      tool,
      params: object(params['params']),
      reason: String(params['reason'] ?? 'The model requested a supervised Gitu service.'),
      expected: 'Observe the real service result.',
    });
    telemetry.noteToolCall();
    if (tool === 'run_command') {
      const command = commandResultSource(result.result, toolParams);
      if (command && toolParams['verificationScope']) commandVerificationScopes.set(command, toolParams['verificationScope']);
    }
    if (result.result.ok && ['write_file', 'apply_edit'].includes(tool)) repetitions.clear();
    if (tool === 'run_command' && !isCommandPending(result.result)) {
      const command = commandResultSource(result.result, object(params['params']));
      const key = result.result.jobId ?? result.record.id;
      if (command && !observedCommands.has(key)) {
        observedCommands.add(key);
        await commandOutcome(command, { ok: result.result.ok, exitCode: result.result.exitCode, output: result.result.output });
      }
    }
    return {
      success: result.result.ok,
      contentItems: [
        { type: 'inputText', text: JSON.stringify(result.result.image ? { ...result.result, image: undefined } : result.result) },
        ...(result.result.image ? [{ type: 'inputImage', imageUrl: result.result.image }] : []),
      ],
    };
  };

  const request = async (method: string, params: NativeRecord): Promise<NativeRecord> => {
    signal.throwIfAborted();
    if (method === 'item/tool/call') {
      acted = true;
      const callId = String(params['callId'] ?? params['itemId'] ?? '');
      const callKey = callId ? String(params['turnId'] ?? '') + ':' + callId : '';
      if (!callKey) throw new Error('Native tool call has no stable identifier; refusing possible duplicate execution.');
      if (answers.has(callKey)) return answers.get(callKey)!;
      if (processed.has('tool:' + callKey))
        return { success: false, contentItems: [{ type: 'inputText', text: 'This tool call was already handled. Inspect durable task state; it will not be replayed.' }] };
      // Persist admission BEFORE a side effect. An uncertain interrupted call is never replayed.
      processed.add('tool:' + callKey);
      ledger.data.execution!.native!.processedItems = [...processed];
      ledger.save();
      const work = (async () => {
        const args = object(params['arguments']);
        if (params['tool'] === 'gitu_service') return service(args);
        if (String(params['tool']).startsWith('gitu_') && SERVICE_TOOLS.includes(String(params['tool']).slice(5)))
          return service({ tool: String(params['tool']).slice(5), params: args });
        if (params['tool'] !== 'gitu_task') return { success: false, contentItems: [{ type: 'inputText', text: 'Unknown native dynamic tool.' }] };
        if ((discussion || input.conversationControl?.()) && args['operation'] !== 'state')
          return { success: false, contentItems: [{ type: 'inputText', text: 'The task is paused for discussion. Inspect state and answer; preserve its plan and criteria.' }] };
        if (args['operation'] === 'set_criteria') {
          const specs = Array.isArray(args['criteria']) ? (args['criteria'].map((c) => object(c)).filter((c) => typeof c['text'] === 'string') as unknown as CriterionSpec[]) : [];
          if (!specs.length || specs.some((spec) => !spec.text.trim()))
            return { success: false, contentItems: [{ type: 'inputText', text: 'Provide at least one nonempty acceptance criterion.' }] };
          if (currentCriteria().length)
            return { success: false, contentItems: [{ type: 'inputText', text: 'Criteria already exist. Inspect state; do not replace user acceptance requirements.' }] };
          for (const spec of specs) {
            if (spec.evidenceType && !['any', 'command_success', 'test_success', 'build_success', 'lint_success', 'typecheck_success'].includes(spec.evidenceType))
              return { success: false, contentItems: [{ type: 'inputText', text: 'Unsupported evidence type. Use the documented criterion evidence types.' }] };
            if (spec.verification) {
              const checked = await inspect(spec.verification);
              if (!checked.ok)
                return {
                  success: false,
                  contentItems: [
                    {
                      type: 'inputText',
                      text: checked.reason + ' Keep the requirement text, and supply an actual command in verification or omit it until a command is available.',
                    },
                  ],
                };
            }
          }
          ledger.appendCriteriaFromSpecs(specs);
        } else if (args['operation'] === 'bind_verification') {
          return service({ tool: 'bind_criterion_verification', params: args });
        } else if (args['operation'] === 'update_plan') {
          if (
            !Array.isArray(args['plan']) ||
            args['plan'].some((p) => typeof object(p)['step'] !== 'string' || !['pending', 'inProgress', 'completed'].includes(String(object(p)['status'])))
          )
            return { success: false, contentItems: [{ type: 'inputText', text: 'update_plan requires plan:[{step:string,status:pending|inProgress|completed}].' }] };
          updatePlan(args['plan'].map(object));
        } else if (args['operation'] === 'link_criterion') {
          if (!currentCriteria().some((criterion) => criterion.id === args['criterionId']))
            return { success: false, contentItems: [{ type: 'inputText', text: 'Only criteria in the current work phase may be updated.' }] };
          const verdict = evidence.link(ledger.data, String(args['criterionId']), String(args['evidenceId']), await workspaceFingerprint());
          ledger.save();
          return { success: verdict.ok, contentItems: [{ type: 'inputText', text: verdict.reason }] };
        } else if (args['operation'] !== 'state')
          return {
            success: false,
            contentItems: [{ type: 'inputText', text: 'Unknown task operation. Use state, set_criteria, update_plan, bind_verification, or link_criterion.' }],
          };
        return {
          success: true,
          contentItems: [
            {
              type: 'inputText',
              text: JSON.stringify({
                goal,
                criteria: currentCriteria(),
                plan: ledger.data.plan,
                evidence: ledger.data.evidence.slice(phase.evidenceStartIndex),
                filesChanged: ledger.data.filesChanged,
                blockers: ledger.data.blockers,
              }),
            },
          ],
        };
      })();
      const guarded = work.then(async (result) => {
        const args = object(params['arguments']);
        const tool = params['tool'] === 'gitu_service' ? String(args['tool']) : String(params['tool']);
        // Productive status polling is not a repeated terminal result. Command
        // outcomes are checked separately against the workspace fingerprint.
        if (tool !== 'run_command' && tool !== 'gitu_run_command') {
          const signature = sha256(tool + canonicalJson(args) + canonicalJson(result));
          const count = (repetitions.get(signature) ?? 0) + 1;
          repetitions.set(signature, count);
          if (count === 3)
            await runtime.steer?.(
              'The same Gitu request returned unchanged results three times. Use the saved result, take a different useful action, or report the blocker. Do not repeat it.',
            );
          if (count >= 4) throw new Error('The model repeated the same Gitu request and unchanged result without progress. Task saved for review.');
        }
        return result;
      });
      answers.set(callKey, guarded);
      return guarded;
    }
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      emit('denied   Built-in OS execution is disabled for this task. Use the guarded Gitu tool with the same operation.');
      return { decision: 'decline' };
    }
    if (method === 'item/tool/requestUserInput' && config.askUserHandler) {
      const questions = Array.isArray(params['questions']) ? params['questions'].map(object) : [];
      const answer = await config.askUserHandler(
        questions.map((q) => ({
          id: String(q['id']),
          question: String(q['question']),
          options: Array.isArray(q['options']) ? q['options'].map((o) => String(object(o)['label'])) : [],
        })),
      );
      return { answers: Object.fromEntries(questions.map((q) => [String(q['id']), { answers: [answer] }])) };
    }
    // Permission expansion, external MCP, connectors, and unknown requests fail closed.
    emit(`denied   native permission request ${method} is unsupported under this task's scope`);
    return method === 'item/permissions/requestApproval' ? { permissions: {}, scope: 'turn' } : { decision: 'decline' };
  };

  const event = async (method: string, params: NativeRecord): Promise<void> => {
    signal.throwIfAborted();
    if (method === 'turn/plan/updated') {
      const plan = Array.isArray(params['plan']) ? params['plan'].map(object) : [];
      updatePlan(plan);
    }
    if (method === 'item/agentMessage/delta') {
      const id = String(params['itemId']),
        text = String(params['delta'] ?? '');
      responseByItem.set(id, (responseByItem.get(id) ?? '') + text);
      emit('tdelta ' + text);
    }
    if (method.startsWith('item/reasoning/') && typeof params['delta'] === 'string') {
      const id = String(params['itemId']);
      const text = (reasoningByItem.get(id) ?? '') + params['delta'];
      reasoningByItem.set(id, text);
      typed?.({ type: 'reasoning', text });
    }
    if (method === 'item/commandExecution/outputDelta') emit('out      ' + String(params['delta'] ?? ''));
    if (method !== 'item/started' && method !== 'item/completed') return;
    const item = object(params['item']),
      id = String(item['id'] ?? '');
    if (!id) return;
    if (method === 'item/started') {
      if (item['type'] === 'commandExecution') throw new Error('Unexpected built-in command execution: this native task requires Gitu guarded tools.');
      if (item['type'] === 'fileChange') for (const change of (item['changes'] as unknown[]) ?? []) guard.assertInside(guard.resolve(String(object(change)['path'])));
      return;
    }
    const itemKey = String(params['turnId'] ?? '') + ':' + id;
    if (seenItems.has(itemKey)) return;
    seenItems.add(itemKey);
    if (item['type'] === 'agentMessage') {
      const text = String(item['text'] ?? responseByItem.get(id) ?? '').trim();
      // The completed snapshot replaces streamed deltas; it is not another
      // chunk to append to the same answer.
      if (text) emit('say ' + text);
      if (item['phase'] !== 'commentary') finalAnswer = text;
    }
    if (item['type'] === 'commandExecution') throw new Error('Unexpected built-in command completion: guarded execution is required.');
    if (item['type'] === 'fileChange' && item['status'] === 'completed') throw new Error('Unexpected built-in file mutation: guarded execution is required.');
  };

  try {
    const settings = nativeCodexPermissions(guard, ledger, config.scopeFiles);
    const previous = ledger.data.execution?.native;
    if (previous && previous.cwd !== guard.activeWritableRoot) throw new Error('The saved native session belongs to another workspace. Explicitly create a new task.');
    if (config.criteria?.length && !currentCriteria().length) {
      const provided = ledger.appendCriteriaFromSpecs(EvidenceEngine.normalizeCriteria(config.criteria));
      for (const criterion of provided) if (criterion.verification) criterion.verificationUserPinned = true;
      ledger.save();
    }
    for (const criterion of currentCriteria()) if (config.criteria?.some((spec) => typeof spec !== 'string' && spec.text === criterion.text && spec.verification)) criterion.verificationUserPinned = true;
    const unresolvedVerification: string[] = [];
    for (const criterion of currentCriteria())
      if (criterion.verification) {
        const checked = await inspect(criterion.verification);
        if (!checked.ok) unresolvedVerification.push(`${criterion.id}: ${checked.reason} Original verification guidance: ${criterion.verification}`);
      }
    if (config.requirePlanReview && !planReviewed) {
      if (!ledger.data.plan.some((s) => !phase.priorPlanStepIds.includes(s.id)))
        ledger.appendPlan([
          { description: 'Inspect and implement the requested task: ' + goal, verification: 'Task acceptance criteria' },
          { description: 'Verify the requested changes and report the results', verification: 'Independent project checks' },
        ]);
      if (!(await checkPlan())) throw new Error('Native execution is waiting for the required Gitu plan approval. No model tools were started.');
    }
    if (config.autonomy?.maxTurns !== undefined && config.autonomy.maxTurns < 1) throw new Error('Native turn budget is exhausted.');
    emit('runtime  The model provider runs its own agent loop with Gitu guarded tools. Direct OS tools are disabled to preserve permissions.');
    typed?.({ type: 'run_started', goal, workspace: guard.activeWritableRoot });
    ledger.setStatus('executing');
    const nativeInstructions = [
      'You are the native execution runtime inside Agent Gitu. Use your own agent loop and tools; reply in normal prose, never Gitu action JSON. Gitu is the authority for scope, permissions, and verification.',
      config.autoApprove ? 'The owner enabled full coding access. Gitu automatically handles coding approvals under the owner’s grants. Perform authorized work through the registered tools; do not ask for duplicate approval or invent approval.request tools. Missing tools or credentials are actual prerequisites, not approval requests.' : '',
      config.deploymentAllowed?.() === false ? DEPLOYMENT_OWNERSHIP : '',
      'For nontrivial work, call gitu_task({operation:"update_plan",plan:[{step:"...",status:"inProgress"},{step:"...",status:"pending"}]}). Update the same checklist as work proceeds; mark each completed step with status:"completed". Small edits need no formal plan or criteria. Choose the smallest meaningful check; substantial work benefits from acceptance criteria with exact verification commands. Use state to recover saved facts and link_criterion only with real recorded evidence. Finish with a final answer reporting changes, checks, and concrete limitations.',
      'A criterion verification field pins an exact executable command, never a description such as "run focused tests". Discover available project commands. Bind a missing or invalid check with gitu_service({tool:"bind_criterion_verification",params:{criterionId:"ac-N",verification:"exact command"}}). An unsuitable model-selected command can be replaced with replacementReason explaining how the new check covers the unchanged requirement and evidence type. Explicit user-pinned commands stay fixed. Binding never supplies passing evidence.',
      'Verification scales with consequences and changed scope. Reuse fresh passing evidence and finish; do not add test/lint/typecheck/build runs merely because those scripts exist. For focused commands, verificationScope:{paths:["src/module","tests/module.test.ts"],reason:"dependency coverage"} allows host-validated reuse after unrelated edits. Include all source, data, and shared dependencies; omit scope when uncertain. Project configuration is always included. Required failing checks still need a repair or a concrete dependency report.',
      unresolvedVerification.length ? 'CRITERIA NEED EXECUTABLE VERIFICATION:\n' + unresolvedVerification.join('\n') : '',
      'Direct built-in shell and patch tools are unavailable. Use gitu_read_file, gitu_write_file, gitu_apply_edit, gitu_search_files, gitu_list_files, and gitu_run_command. These are real callable tools in THIS turn, not text actions. Do not claim tools are missing without trying the provided function.',
      'Avoid unchanged repeated reads and checks. For a running command, use gitu_run_command({action:"status",id:"<returned cmd-N>"}). Status retrieves that same process, including a result after it exited. Never use Get-Job or start another compiler to retrieve a result.',
      COMMAND_RECOVERY_CONTRACT,
      'On Windows, run_command uses powershell.exe. Use PowerShell 5.1-compatible syntax; && and || are unsupported. Preserve the real failing exit status when composing checks.',
      'Use gitu_service for Gitu-authorized browser, network, memory, skills, saved-connection operations and supervised specialists. Native child agents and unrelated host plugins are disabled.',
      'Do not edit .hermes, Git internals, generated directories, or files outside the selected project. Gitu independently verifies acceptance after your turn.',
      config.requirePlanReview ? 'Publish a plan and request approval through gitu_service before implementation. Approval must be granted before changes.' : '',
      'User constraints: ' + ledger.data.constraints.join('\n'),
      'Active user instructions: ' + JSON.stringify(ledger.activeInstructions()),
      config.skills?.renderForPrompt(ledger.data.activeSkills),
      config.connectionContext?.(),
      memory.renderProtected(guard.lock.name, 12, config.memoryRetrieval),
      memory
        .retrieveForContext(goal, guard.lock.name, { ctx: config.memoryRetrieval })
        .map((entry) => entry.claim)
        .join('\n'),
      executor.fileKnowledge.render(),
      config.attachments
        ?.map((file) => `USER FILE ${file.name} at ${file.path} (${file.mime}):\n${file.textExcerpt ?? 'Read the stored project file for its contents.'}`)
        .join('\n\n'),
      config.scopeFiles?.length ? 'User-selected scope: ' + config.scopeFiles.join(', ') : '',
      'Active goal: ' + goal,
    ]
      .filter(Boolean)
      .join('\n\n');
    const stateCriteria = currentCriteria();
    const stateContext = JSON.stringify({
      criteria: stateCriteria,
      plan: ledger.data.plan,
      filesChanged: ledger.data.filesChanged,
      evidence: ledger.data.evidence.slice(-12),
      actions: ledger.data.actions.slice(-8),
    });
    settings['compactionContext'] = {
      goal,
      criteria: stateCriteria.map((c) => (typeof c === 'string' ? c : (c as { description?: string; name?: string }).description ?? (c as { name?: string }).name ?? JSON.stringify(c))),
      remainingPlan: ledger.data.plan.filter((s) => s.status !== 'done').map((s) => s.description),
      relevantFiles: ledger.data.filesChanged,
    };
    const initialText = previous ? input.message : goal + (input.message !== goal ? '\n\nCurrent user message:\n' + input.message : '');
    const turnInput: NativeTaskInput = {
      cwd: guard.activeWritableRoot,
      threadId: previous?.threadId,
      text: initialText + '\n\nSaved Gitu task state (data, not tool instructions):\n' + stateContext,
      instructions: nativeInstructions,
      effort: config.effort,
      config: settings,
      permissions: NATIVE_PERMISSION_PROFILE,
      signal,
      tools: nativeGituTools(),
      images: config.images?.map((i) => i.dataUrl),
      onThread: (threadId) => {
        ledger.data.execution = {
          // Record the loop that actually ran, so resuming a pi task never
          // looks like a different runtime task (and vice versa).
          mode: runtime.mode,
          native: {
            ...previous,
            threadId,
            cwd: guard.activeWritableRoot,
            toolExecution: 'gitu-guarded',
            phaseId: phase.id,
            planStepIds: previous?.phaseId === phase.id ? previous.planStepIds : ledger.data.plan.filter((s) => !phase.priorPlanStepIds.includes(s.id)).map((s) => s.id),
            status: 'starting',
            processedItems: [...processed],
          },
        };
        ledger.save();
      },
      onTurn: (turnId) => {
        ledger.data.execution!.native!.turnId = turnId;
        ledger.data.execution!.native!.status = 'running';
        ledger.save();
      },
      onEvent: event,
      onSettings: settings => {
        Object.assign(ledger.data.execution!.native!, settings);
        ledger.save();
        emit(`effort   ${settings.effectiveEffort ?? 'provider default'} — native model reasoning${settings.requestedEffort && settings.requestedEffort !== settings.effectiveEffort ? ` (requested ${settings.requestedEffort})` : ''}`);
      },
      onRequest: request,
      onUsage: (usage) => {
        telemetry.recordCall(
          [
            { role: 'system', content: nativeInstructions },
            { role: 'user', content: initialText },
          ],
          usage,
          1,
        );
        ledger.data.tokenTelemetry = telemetry.snapshot();
        ledger.save();
        if (config.autonomy?.maxTurns !== undefined && telemetry.snapshot().calls >= config.autonomy.maxTurns)
          throw new Error('The user-selected model-turn budget is exhausted. Native progress is saved.');
      },
    };
    // The turn is the retryable unit, not the request: it is re-entered only
    // while `acted` is false, so no completed tool call can be replayed.
    const result = await runNativeTurnWithRecovery({
      turn: () => runtime.runTurn(turnInput),
      hasActed: () => acted,
      signal,
      ...(config.providerRecoveryDelayMs !== undefined ? { baseDelayMs: config.providerRecoveryDelayMs } : {}),
      ...(config.recoverySleep ? { sleep: (ms: number) => config.recoverySleep!(ms) } : {}),
      onRetry: ({ attempt, maxAttempts, delayMs, error }) =>
        emit(`recover  ${error.message.slice(0, 120)} — retry ${attempt}/${maxAttempts} in ${(delayMs / 1000).toFixed(1)}s`),
    });
    runtimeResult = result.status;
    ledger.data.execution!.native!.status = result.status;
    ledger.save();
    if (result.status === 'interrupted') exited = 'aborted';
    else if (!finalAnswer) ledger.addBlocker('The native turn ended without a final answer. Progress messages are not completion; no automatic restart was made.');
    else if (discussion || input.conversationControl?.()) {
      answeredDiscussion = discussion;
      ledger.addBlocker('Paused for discussion with the user.');
    } else {
      // One verification phase after the model's completed turn. No second model loop.
      emit('verify   The model turn finished. Gitu is checking saved evidence and workspace state locally; no model request is running.');
      inspections.clear();
      const verificationFingerprint = await workspaceFingerprint();
      await refreshScopedVerification(ledger.data, guard.activeWritableRoot, verificationFingerprint);
      const phaseActions = ledger.data.actions.slice(phase.actionStartIndex);
      const changedFiles = ledger.data.filesChanged.filter((file, index) => index >= (phase.fileStartIndex ?? 0) || phaseActions.some((action) =>
        action.status === 'success' && ['write_file', 'apply_edit'].includes(action.tool) &&
        (action.paramsSummary === `write ${file}` || action.paramsSummary === `edit ${file}` || action.verificationScope?.paths.includes(file))));
      const documentationOnly = changedFiles.length > 0 && changedFiles.every((file) => /\.(?:md|rst|txt)$/i.test(file)) && !planRisk(goal).strictVerification;
      const commands = selectVerificationCommands({
        required: currentCriteria().map((c) => c.verification).filter((c): c is string => Boolean(c)),
        project: acceptedChanges() && !documentationOnly ? guard.lock : {},
        evidence: ledger.data.evidence.slice(phase.evidenceStartIndex),
        fingerprint: verificationFingerprint,
        strict: acceptedChanges() && planRisk(goal).strictVerification,
      });
      for (const command of commands) {
        signal.throwIfAborted();
        const inspected = await inspect(command);
        if (!inspected.ok) {
          ledger.addBlocker(inspected.reason + ' Verification guidance: ' + command);
          commands.delete(command);
          continue;
        }
        if (isTrivialEvidenceCommand(command) || isManufacturedEvidenceCommand(command)) {
          ledger.addBlocker('Acceptance verification cannot use a trivial or manufactured command: ' + command);
          continue;
        }
        const fingerprint = await workspaceFingerprint();
        await refreshScopedVerification(ledger.data, guard.activeWritableRoot, fingerprint);
        const latest = latestVerificationEvidence(ledger.data, command, fingerprint);
        if (latest?.passed && evidenceMatchesWorkspace(latest, fingerprint) && (latest.exitCode === undefined || latest.exitCode === 0)) continue;
        emit('verify   ' + command);
        let result: ToolResult = (
          await executor.execute({ tool: 'run_command', params: { command }, reason: 'Gitu final acceptance verification', expected: 'Independent verification exit code' })
        ).result;
        while (isCommandPending(result)) {
          signal.throwIfAborted();
          const id = result.jobId ?? '';
          if (!id) throw new Error('Verification returned no managed command identifier.');
          result = (
            await executor.execute({
              tool: 'run_command',
              params: { action: 'status', id, waitMs: 1000 },
              reason: 'Await the same verification command',
              expected: 'Its terminal outcome, without launching a duplicate',
            })
          ).result;
        }
        await commandOutcome(command, { ok: result.ok, exitCode: result.exitCode, output: result.output });
      }
      const fingerprint = await workspaceFingerprint();
      await refreshScopedVerification(ledger.data, guard.activeWritableRoot, fingerprint);
      for (const criterion of currentCriteria())
        if (criterion.verification) {
          const ev = latestVerificationEvidence(ledger.data, criterion.verification, fingerprint);
          if (ev?.passed && evidenceMatchesWorkspace(ev, fingerprint)) evidence.link(ledger.data, criterion.id, ev.id, fingerprint);
        }
      const gate = evidence.gate({ ...ledger.data, acceptanceCriteria: currentCriteria() }, fingerprint);
      const openPlan = ledger.data.plan.filter((s) => !phase.priorPlanStepIds.includes(s.id) && s.status !== 'done' && s.status !== 'cancelled');
      const failed = [...commands].filter((c) => {
        const ev = latestVerificationEvidence(ledger.data, c, fingerprint);
        return !ev?.passed || !evidenceMatchesWorkspace(ev, fingerprint) || (ev.exitCode !== undefined && ev.exitCode !== 0);
      });
      if (currentCriteria().length && !gate.open) ledger.addBlocker('The model turn ended; Gitu acceptance criteria remain unverified: ' + gate.missing.join('; '));
      if (openPlan.length) ledger.addBlocker('The model turn ended with unfinished plan steps: ' + openPlan.map((s) => s.description).join('; '));
      if (failed.length) ledger.addBlocker('Final verification failed or was not authorized: ' + failed.join('; '));
      const freshCheck = ledger.data.evidence.slice(phase.evidenceStartIndex).some((check) => check.passed && check.command &&
        evidenceMatchesWorkspace(check, fingerprint) && !isTrivialEvidenceCommand(check.command) && !isManufacturedEvidenceCommand(check.command) &&
        latestVerificationEvidence(ledger.data, check.command, fingerprint)?.id === check.id);
      if (!currentCriteria().length && acceptedChanges() && !commands.size && !freshCheck) {
        if (documentationOnly && verifiedDocumentationWrites({ filesChanged: changedFiles, actions: ledger.data.actions.slice(phase.actionStartIndex) }, fingerprint)) evidence.record(ledger.data, { kind: 'file', label: 'Documentation writes verified', passed: true, output: 'Guarded file writes still match their confirmed contents: ' + changedFiles.join(', '), workspaceFingerprint: fingerprint });
        else ledger.addBlocker('Files changed without acceptance criteria or an independent verification command.');
      }
      if (!currentCriteria().length && !ledger.data.actions.slice(phase.actionStartIndex).length && config.mode !== 'chat' && !conversationIntent(goal))
        ledger.addBlocker('The model supplied prose without performing the requested work or defining acceptance criteria. Task saved without automatically repeating the turn.');
      const gateFinding = evaluateInstructionGate(ledger.activeInstructions(), ledger.data.actions.slice(phase.actionStartIndex), ledger.data.evidence);
      if (gateFinding.unmetRequirements.length || gateFinding.denialUnrecovered)
        ledger.addBlocker(
          'User completion instructions remain unverified: ' + (gateFinding.unmetRequirements.join('; ') || 'a denied instruction has not been followed by compliant work'),
        );
      exited = ledger.data.blockers.length ? 'blocked' : 'complete';
    }
  } catch (error) {
    if (!runtimeResult) config.subagents?.stop('Native task execution stopped.');
    if (signal.aborted || (error instanceof LlmError && error.details.kind === 'aborted')) exited = 'aborted';
    else {
      ledger.addBlocker((error as Error).message);
      if (error instanceof LlmError) providerError = error;
    }
    if (ledger.data.execution?.native) ledger.data.execution.native.status = exited === 'aborted' ? 'interrupted' : 'failed';
  } finally {
    executor.dispose();
    activeTasks.delete(taskKey);
  }
  ledger.setStatus(exited === 'complete' ? 'completed' : exited === 'aborted' ? 'aborted' : 'blocked');
  telemetry.noteFileKnowledge(executor.fileKnowledge.stats());
  ledger.data.tokenTelemetry = telemetry.snapshot();
  if (exited === 'complete') ledger.completeActiveWorkPhase();
  const report = new Reporter().build(
    ledger,
    exited,
    {
      summary:
        discussion && finalAnswer
          ? finalAnswer
          : exited === 'complete'
            ? finalAnswer
            : exited === 'aborted'
              ? 'Task stopped by user. Native session and executed work are preserved.'
              : (ledger.data.blockers.at(-1) ?? 'Native turn is awaiting acceptance verification.'),
      risks: [],
      followUps: [],
    },
    lastFingerprint,
    {
      goal,
      phase: { id: phase.id, kind: phase.kind, startedAt: phase.startedAt },
      actionStartIndex: phase.actionStartIndex,
      evidenceStartIndex: phase.evidenceStartIndex,
      criterionIds: currentCriteria().map((c) => c.id),
      filesChanged: ledger.data.filesChanged.slice(phase.fileStartIndex),
    },
  );
  if (answeredDiscussion) report.responseKind = 'discussion';
  ledger.data.report = report;
  ledger.save();
  memory.add({
    type: 'task',
    claim: `Task ${goal} ended as ${report.status}: ${report.summary}`,
    evidence: ledger.data.taskId,
    scope: guard.lock.name,
    confidence: runtimeResult === 'completed' ? 0.9 : 0.5,
  });
  emit(`done     ${ledger.data.status} — ${report.summary}`);
  typed?.(exited === 'complete' ? { type: 'completed', summary: report.summary } : { type: 'failed', reason: report.summary });
  if (providerError) throw providerError;
  return { ledger, report };
}
