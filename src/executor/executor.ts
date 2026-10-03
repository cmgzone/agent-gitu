import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { CACHED_INVESTIGATION_PREFIX, LoopDetector } from '../loop/loop-detector.js';
import type { LspManager } from '../lsp/manager.js';
import type { McpManager } from '../mcp/client.js';
import type { ConnectionRegistry } from '../connections/connections.js';
import type { MemoryStore } from '../memory/memory-store.js';
import type { PolicyEngine } from '../policy/policy.js';
import { InstructionPolicyEngine } from '../policy/instruction-policy.js';
import type { SkillStore } from '../skills/skills.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { CodingEventPayload, CodingEventSink } from '../coding/events.js';
import type { ActionRecord, MemoryRetrievalContext, ToolResult } from '../types.js';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { closestNameMatches, excerpt, hashParams, normalizeToolPath, summarizeParams } from '../util.js';
import { FileKnowledgeStore } from '../context/file-knowledge.js';
import * as narration from '../agent/narration.js';

/** Outputs larger than this are persisted to an artifact; the model gets the
 *  excerpt plus a read_file pointer instead of the raw bulk. */
const ARTIFACT_THRESHOLD = 4000;
import {
  formatToolValidationError,
  BackgroundCommandRegistry,
  commandResultSource,
  isCommandPending,
  toolAgentStatus,
  toolApplyEdit,
  toolBrowse,
  toolCreateSkill,
  toolConfigureMcp,
  toolDelegate,
  toolListFiles,
  toolListConnections,
  toolConnectionRead,
  toolInspectConnectionResponse,
  toolListMcp,
  toolListSkills,
  toolMemory,
  toolLspDefinition,
  toolLspDiagnostics,
  toolLspHover,
  toolLspReferences,
  toolLspSymbols,
  MAX_READ_OUTPUT_CHARS,
  toolReadFile,
  toolRunCommand,
  toolSearchFiles,
  toolUpdateConnection,
  toolUpdateSkill,
  toolUseSkill,
  toolUseSkillReference,
  toolWebFetch,
  toolWriteFile,
  validateToolParams,
  type DelegateFn,
  type BackgroundAgentStatusFn,
  type BackgroundDelegateFn,
  type ToolContext,
} from '../tools/tools.js';

import { toolCreateDocument } from '../tools/productivity.js';
import type { FileDiff } from '../tools/diff.js';
import { toolScheduleManage } from '../cron/tools.js';
import { isObservationTool } from '../agent/agent-workflow.js';

/** Every tool name this executor dispatches, for "did you mean" suggestions. */
const EXECUTOR_TOOL_NAMES = [
  'read_file', 'write_file', 'apply_edit', 'list_files', 'search_files', 'web_fetch',
  'browse', 'browser', 'delegate', 'agent_status', 'list_skills', 'create_skill',
  'update_skill', 'use_skill', 'use_skill_reference', 'memory', 'list_mcp',
  'configure_mcp', 'list_connections', 'update_connection', 'run_command',
  'connection_read', 'inspect_connection_response',
  'create_document', 'schedule_manage', 'lsp_diagnostics', 'lsp_definition',
  'lsp_references', 'lsp_hover', 'lsp_symbols',
];

/**
 * An unknown tool call is a routing problem, not the end of the run: name the
 * closest real tools, point at the shell/MCP fallbacks, and require reporting
 * missing credentials as a block so the user is asked instead of the task
 * silently stopping.
 */
function unknownToolGuidance(tool: string): string {
  const parts = [`Unknown tool: ${tool} — nothing was executed; that name is not a valid action tool.`];
  const suggestions = closestNameMatches(tool, EXECUTOR_TOOL_NAMES);
  if (suggestions.length > 0) parts.push(`Did you mean: ${suggestions.join(', ')}? Retry with the exact name and params from the action grammar.`);
  parts.push('Do NOT abandon the task because of this. Recover: check the action grammar for the real tool name; if no tool covers the goal, accomplish it with run_command (a shell equivalent, an installable CLI, or a small script) or add an integration with configure_mcp after checking list_mcp. If the work needs a credential, API key, or account you do not have, end with request_block naming the exact missing prerequisite (which service, which key) so the user is asked for it — never stop silently.');
  return parts.join(' ');
}

export interface ExecuteRequest {
  tool: string;
  params: Record<string, unknown>;
  reason: string;
  expected: string;
  stepId?: string;
}

export interface ExecuteOutcome {
  record: ActionRecord;
  result: ToolResult;
  blockedByLoop?: string;
  deniedByPolicy?: string;
}

/**
 * Supplies host-owned runtime capabilities at the moment a tool runs.  This
 * deliberately lives outside model input: a model cannot grant itself a
 * capability by putting one in a tool call.  It lets a connection saved while
 * a task is paused become available to a subsequent `use_skill` action.
 */
export type RuntimeCapabilitySupplier = () => Iterable<string>;

export class Executor {
  private readonly instructionPolicy = new InstructionPolicyEngine();
  private readonly backgroundCommands = new BackgroundCommandRegistry();

  constructor(
    private readonly guard: ProjectGuard,
    private readonly ledger: TaskLedger,
    private readonly policy: PolicyEngine,
    private readonly loopDetector: LoopDetector,
    private readonly onEvent?: (event: string) => void,
    private readonly skills?: SkillStore,
    private readonly mcp?: McpManager,
    private readonly browser?: BrowserBridge,
    private readonly lsp?: LspManager,
    private readonly delegate?: DelegateFn,
    private readonly delegateBackground?: BackgroundDelegateFn,
    private readonly backgroundAgentStatus?: BackgroundAgentStatusFn,
    private readonly runtimeCapabilities?: RuntimeCapabilitySupplier,
    private readonly connections?: ConnectionRegistry,
    options?: {
      memory?: MemoryStore;
      memoryContext?: MemoryRetrievalContext;
      signal?: () => AbortSignal | undefined;
      /** Typed guarantee events. Each gate reports what it decided, where it
       *  decided it; the runtime stamps the envelope and owns the cursor. */
      onCodingEvent?: CodingEventSink;
    },
  ) {
    this.memory = options?.memory;
    this.memoryContext = options?.memoryContext;
    this.signal = options?.signal;
    this.onCodingEvent = options?.onCodingEvent;
    this.fileKnowledge = FileKnowledgeStore.forRepo(guard.lock.repoRoot);
  }

  /**
   * Durable implementation knowledge (revision-bound). Reads learn facts from
   * the file version they saw; successful writes re-learn from the written
   * content; edits invalidate until the next read proves the new revision.
   */
  readonly fileKnowledge: FileKnowledgeStore;

  private readonly memory?: MemoryStore;
  private readonly signal?: () => AbortSignal | undefined;
  private readonly memoryContext?: MemoryRetrievalContext;
  private readonly onCodingEvent?: CodingEventSink;

  private emit(event: string): void {
    this.onEvent?.(event);
  }

  private emitCoding(event: CodingEventPayload): void {
    this.onCodingEvent?.(event);
  }

  /**
   * In-memory cache of full read_file outputs, keyed by context fingerprint.
   * Allows serving the complete previous file content on legitimate re-reads
   * of unchanged files without filesystem I/O or loop-prevention failures.
   */
  readonly readCache = new Map<string, { output: string; contextFingerprint: string; timestamp: number }>();

  noteCompaction(actionId?: string): void {
    if (typeof (this.loopDetector as unknown as { noteCompaction?: (id?: string) => void }).noteCompaction === 'function') {
      (this.loopDetector as unknown as { noteCompaction: (id?: string) => void }).noteCompaction(actionId);
    }
  }

  dispose(): void {
    this.backgroundCommands.dispose();
  }

  /**
   * Pre-dispatch project boundary for path-carrying calls. Uses the same
   * resolve + assertInside rule the tool handlers enforce at execution entry
   * (Windows case-folding, symlink escape), so an out-of-boundary call is
   * rejected before any policy or loop judgment. Handlers keep the final
   * assertion — defense in depth, not a replacement.
   */
  private async boundaryViolation(req: ExecuteRequest): Promise<string | undefined> {
    const rel = req.params['path'];
    if (typeof rel !== 'string' || !rel.trim()) return undefined;
    try {
      const abs = this.guard.resolve(rel);
      if (['read_file', 'list_files', 'search_files'].includes(req.tool)) {
        try { this.guard.assertReadable(abs); }
        catch (error) {
          const hardInstructions = typeof this.ledger.hardInstructions === 'function' ? this.ledger.hardInstructions() : [];
          if (!this.instructionPolicy.evaluate(req.tool, req.params, hardInstructions).allowed) throw error;
          const scope = this.guard.diagnosticReadScope(abs);
          if (!await this.policy.approveDiagnosticRead(req.tool, scope.path, scope.directory)) throw error;
          if (this.signal?.()?.aborted) throw new Error('Diagnostic read cancelled');
          this.guard.grantDiagnosticRead(scope);
          this.guard.assertReadable(abs);
          this.emit(`diagnostic-read approved read-only access to ${scope.path}`);
        }
      } else this.guard.assertInside(abs);
    } catch (err) {
      return `DENIED by project boundary: ${(err as Error).message}`;
    }
    return undefined;
  }

  private readContextFingerprint(req: ExecuteRequest): string | undefined {
    if (req.tool !== 'read_file' || typeof req.params['path'] !== 'string') return undefined;
    try {
      const abs = this.guard.resolve(req.params['path']);
      this.guard.assertReadable(abs);
      const stat = statSync(abs);
      // The loop hash groups nearby offsets into 200-line buckets. A cached
      // observation is safe only for the exact read request, including limit
      // and output cap, against this specific file version.
      const rawOffset = Number(req.params['offset'] ?? 1);
      const rawLimit = Number(req.params['limit'] ?? 2000);
      const readParams = {
        path: normalizeToolPath(req.params['path']),
        offset: Number.isFinite(rawOffset) ? Math.max(1, Math.floor(rawOffset)) : 1,
        limit: Number.isFinite(rawLimit) ? Math.min(2000, Math.max(1, Math.floor(rawLimit))) : 2000,
        maxChars: Math.min(60_000, Math.max(4_000, Number(req.params['maxChars'] ?? MAX_READ_OUTPUT_CHARS))),
      };
      return stat.isFile() ? `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${hashParams('read_file_request', readParams)}` : undefined;
    } catch {
      return undefined;
    }
  }

  async execute(req: ExecuteRequest): Promise<ExecuteOutcome> {
    const started = Date.now();
    // Model-DECLARED scratch writes (recovery-control fix 8): the model marks
    // a throwaway diagnostic file with scratch:true; the runtime enforces the
    // placement — the file lands in the task's private temp dir instead of the
    // user's source tree, never enters the project diff, and is deleted on
    // completion. No filename pattern matching: placement is declared, not guessed.
    let scratchNote: string | undefined;
    if (req.tool === 'write_file' && req.params['scratch'] === true && this.guard.taskTmpRoot) {
      const base = String(req.params['path'] ?? '').replace(/\\/g, '/').split('/').pop();
      if (base) {
        const targetRel = path.join(path.relative(this.guard.activeWritableRoot, this.guard.taskTmpRoot), base);
        req = { ...req, params: { ...req.params, path: targetRel } };
        // Model-facing note (drives the next read/run of the file) and the
        // user-facing narration are separate concerns.
        scratchNote = `SCRATCH: temporary file redirected to ${targetRel} — kept out of the project source tree, excluded from the project diff, deleted when the task completes. Read/run it via this path. If a diagnostic proves valuable, promote it into a real test instead of keeping it in the project.`;
        this.emit(`scratch ${narration.scratchRedirected(base, targetRel)}`);
      }
    }
    const paramsHash = hashParams(req.tool, req.params);
    const summary = summarizeParams(req.tool, req.params);
    const stepId = req.stepId;

    if (stepId) {
      const step = this.ledger.step(stepId);
      if (step) {
        const entering = step.status !== 'in_progress';
        // A failed step stays in_progress (nothing moves it out), so the
        // entering check alone would freeze the counter at 1. Count a retry
        // whenever the step's previous action did not succeed.
        let attempts = step.attempts + (entering ? 1 : 0);
        if (!entering) {
          const lastAction = [...this.ledger.data.actions].reverse().find((a) => a.stepId === stepId);
          if (lastAction && lastAction.status !== 'success') attempts += 1;
        }
        this.ledger.updateStep(stepId, { status: 'in_progress', attempts });
      }
    }

    // Schema validation boundary: reject malformed calls before touching filesystem/guard/policy
    const validation = validateToolParams(req.tool, req.params);
    if (!validation.valid) {
      const message = formatToolValidationError(req.tool, req.params, validation);
      const record = this.ledger.recordAction({
        stepId,
        tool: req.tool,
        paramsHash,
        paramsSummary: summary,
        status: 'error',
        errorSignature: 'invalid-tool-params',
        reason: req.reason,
        expected: req.expected,
        observation: message,
        durationMs: Date.now() - started,
      });
      this.emit(`error    ${summary} (invalid tool call schema: ${validation.error})`);
      return { record, result: { ok: false, output: message, errorSignature: 'invalid-tool-params' } };
    }

    // Project boundary: a path-carrying call may not name anything outside the
    // locked workspace. Same resolve + assertInside rule the tool handlers
    // enforce at execution entry (Windows case-folding, symlink escape), but
    // applied BEFORE any policy/loop judgment so the model never receives a
    // policy verdict on a call the harness would never execute.
    const boundaryMessage = await this.boundaryViolation(req);
    if (boundaryMessage) {
      const record = this.ledger.recordAction({
        stepId,
        tool: req.tool,
        paramsHash,
        paramsSummary: summary,
        status: 'denied',
        reason: req.reason,
        expected: req.expected,
        observation: boundaryMessage,
        durationMs: Date.now() - started,
      });
      this.emit(`denied   ${summary} (${boundaryMessage})`);
      this.emitCoding({ type: 'policy_denied', reason: 'project_guard', tool: req.tool, operation: summary, detail: boundaryMessage });
      return { record, result: { ok: false, output: boundaryMessage }, deniedByPolicy: boundaryMessage };
    }
    const readContextFingerprint = this.readContextFingerprint(req);

    // User instruction policy: explicit user instructions outrank agent
    // defaults and are enforced deterministically before any other judgment.
    const hardInstructions = typeof this.ledger.hardInstructions === 'function' ? this.ledger.hardInstructions() : [];
    const instructionVerdict = this.instructionPolicy.evaluate(req.tool, req.params, hardInstructions);
    if (!instructionVerdict.allowed) {
      const message = instructionVerdict.reason ?? 'DENIED by user instruction policy';
      const record = this.ledger.recordAction({
        stepId,
        tool: req.tool,
        paramsHash,
        paramsSummary: summary,
        status: 'denied',
        reason: req.reason,
        expected: req.expected,
        observation: message,
        durationMs: Date.now() - started,
      });
      this.emit(`denied   ${summary} (${message})`);
      this.emitCoding({ type: 'policy_denied', reason: 'user_instruction', tool: req.tool, operation: summary, detail: message });
      return { record, result: { ok: false, output: message }, deniedByPolicy: message };
    }

    // Loop protection runs after the authority gates but BEFORE the normal
    // safety/approval policy: repeating a failing call must be caught by
    // heuristics before it can burn another approval round-trip.
    if (req.tool === 'list_skills' || req.tool === 'use_skill' || req.tool === 'use_skill_reference') {
      const priorReads = this.ledger.data.actions.filter((action) => action.tool === req.tool && action.paramsHash === paramsHash && action.status === 'success');
      if (priorReads.length >= 2) {
        const message = `SKILL_OPERATION_REPEATED: ${req.tool} with the same arguments has already succeeded ${priorReads.length} times. Use the loaded information to make a different execution decision.`;
        const record = this.ledger.recordAction({
          stepId,
          tool: req.tool,
          paramsHash,
          paramsSummary: summary,
          status: 'blocked',
          errorSignature: 'skill-operation-repeated',
          reason: req.reason,
          expected: req.expected,
          observation: message,
          durationMs: Date.now() - started,
        });
        this.emit(`blocked  ${summary} (repeated skill operation)`);
        this.emitCoding({ type: 'operation_blocked', reason: 'repeated_skill_operation', tool: req.tool, operation: summary, detail: message });
        return { record, result: { ok: false, output: message, errorSignature: 'skill-operation-repeated' }, blockedByLoop: message };
      }
    }

    // One cached replay is cheaper and safer than doing the same successful
    // investigation read again. It also preserves continuity after compaction:
    // the model gets the prior observation without a new filesystem/LSP read.
    // If it asks for the same unchanged evidence yet again, the normal loop
    // verdict below hard-blocks the repetition.
    // LoopDetector is injected at this boundary and older/custom hosts may
    // implement only evaluate(). Keep the cache optimization optional so a
    // newly-added helper cannot crash otherwise valid tool execution.
    const refreshRead = req.tool === 'read_file' && req.params['refresh'] === true;
    const reusableRead =
      !refreshRead && typeof this.loopDetector.reusableSuccessfulRead === 'function' ? this.loopDetector.reusableSuccessfulRead(this.ledger.data.actions, req.tool, paramsHash, readContextFingerprint) : undefined;
    if (reusableRead) {
      const cachedEntry = readContextFingerprint ? this.readCache.get(readContextFingerprint) : undefined;
      const cachedContent = cachedEntry?.output ?? reusableRead.observation;
      if (cachedContent) {
        const cached =
          `${CACHED_INVESTIGATION_PREFIX}: ${summary}\n` +
          `Reused action ${reusableRead.id}; file content unchanged since last read.\n` +
          `${cachedContent}\n` +
          `Use this unchanged evidence. Read a genuinely different region/question, or change the source before requesting this evidence again.`;
        const record = this.ledger.recordAction({
          stepId,
          tool: req.tool,
          paramsHash,
          paramsSummary: summary,
          status: 'success',
          contextFingerprint: readContextFingerprint,
          readObservationComplete: true,
          reason: req.reason,
          expected: req.expected,
          observation: excerpt(cached, 800),
          durationMs: Date.now() - started,
        });
        this.emit(`cache    ${summary} (reused unchanged investigation observation)`);
        this.fileKnowledge.noteRereadAvoided();
        return { record, result: { ok: true, output: cached } };
      }
    }

    const loopVerdict = this.loopDetector.evaluate(this.ledger.data.actions, req.tool, paramsHash, undefined, readContextFingerprint, refreshRead);
    if (!loopVerdict.allowed) {
      const message = LoopDetector.summarizeBlock(loopVerdict);
      const record = this.ledger.recordAction({
        stepId,
        tool: req.tool,
        paramsHash,
        paramsSummary: summary,
        status: 'blocked',
        reason: req.reason,
        expected: req.expected,
        observation: message,
        durationMs: Date.now() - started,
      });
      this.emit(`blocked  ${summary} (${loopVerdict.reason ?? 'loop prevention'})`);
      this.emitCoding({ type: 'operation_blocked', reason: 'loop_detected', tool: req.tool, operation: summary, detail: message });
      return { record, result: { ok: false, output: message }, blockedByLoop: message };
    }

    if (req.tool === 'write_file' || req.tool === 'apply_edit') {
      const file = String(req.params['path'] ?? '');
      if (file) {
        const passedEvidence = this.ledger.data.evidence.filter((e) => e.passed).length;
        const pressure = this.loopDetector.fileEditPressure(this.ledger.data.actions, passedEvidence, file);
        if (pressure.blocked) {
          const message =
            `EDIT PRESSURE: ${pressure.edits} edits to ${file} with no passing evidence yet. ` + `Run a verification command (test/build/lint/typecheck) before editing further.`;
          const record = this.ledger.recordAction({
            stepId,
            tool: req.tool,
            paramsHash,
            paramsSummary: summary,
            status: 'blocked',
            reason: req.reason,
            expected: req.expected,
            observation: message,
            durationMs: Date.now() - started,
          });
          this.emit(`blocked  ${summary} (edit pressure)`);
          this.emitCoding({ type: 'operation_blocked', reason: 'edit_pressure', tool: req.tool, operation: summary, detail: message });
          return { record, result: { ok: false, output: message }, blockedByLoop: message };
        }
      }
    }

    // Normal safety/approval policy runs AFTER user authority and loop
    // protection: agent defaults are the lowest-precedence gate.
    const decision = await this.policy.evaluate(req.tool, req.params);
    if (!decision.allowed) {
      const message = `DENIED by policy [${decision.tier}]: ${decision.reason}`;
      const record = this.ledger.recordAction({
        stepId,
        tool: req.tool,
        paramsHash,
        paramsSummary: summary,
        status: 'denied',
        reason: req.reason,
        expected: req.expected,
        observation: message,
        durationMs: Date.now() - started,
      });
      this.emit(`denied   ${summary} (${decision.reason})`);
      this.emitCoding({
        type: 'policy_denied',
        // Structural, never parsed out of the reason text: a denial that went
        // through the approval path is `approval_required`; one refused by tier
        // policy without consulting approval is `risk_policy`.
        reason: decision.requiresApproval ? 'approval_required' : 'risk_policy',
        tool: req.tool,
        operation: summary,
        detail: decision.reason,
      });
      return { record, result: { ok: false, output: message }, deniedByPolicy: message };
    }

    this.emit(`run      ${summary}${req.reason ? ` — ${req.reason}` : ''}`);
    // The command lifecycle is emitted natively here, at the dispatch boundary:
    // the tool reports the execution facts, this layer turns them into events.
    // A status poll or a stop acts on an already-started command, so only a real
    // run opens a command card.
    if (req.tool === 'run_command' && String(req.params['action'] ?? 'run') === 'run') {
      this.emitCoding({ type: 'command_started', command: String(req.params['command'] ?? '') });
    }
    const ctx: ToolContext = {
      guard: this.guard,
      cwd: this.guard.lock.repoRoot,
      skills: this.skills,
      skillContext: {
        // Every ordinary action protocol tool is available. Browser-only
        // capabilities are intentionally omitted when no browser bridge was
        // provisioned, so a required browser skill fails closed.
        availableTools: [
          'read_file',
          'write_file',
          'apply_edit',
          'list_files',
          'search_files',
          'web_fetch',
          'run_command',
          'delegate',
          'list_skills',
          'use_skill',
          'use_skill_reference',
          'create_skill',
          ...(this.browser ? ['browser', 'screenshot'] : []),
        ],
        // Re-evaluate for every action.  Connection setup happens after an
        // executor is constructed, so a construction-time snapshot would make
        // a valid saved connection look unavailable until the task restarted.
        ...(this.runtimeCapabilities
          ? {
              availableCapabilities: [...new Set([...this.runtimeCapabilities()].map((capability) => String(capability).trim().toLowerCase()).filter(Boolean))],
            }
          : {}),
      },
      mcp: this.mcp,
      connections: this.connections,
      browser: this.browser,
      lsp: this.lsp,
      memory: this.memory,
      memoryContext: this.memoryContext,
      delegate: this.delegate,
      delegateBackground: this.delegateBackground,
      backgroundAgentStatus: this.backgroundAgentStatus,
      backgroundCommands: this.backgroundCommands,
    };
    let result: ToolResult;
    try {
      switch (req.tool) {
        case 'read_file':
          result = toolReadFile(ctx, req.params);
          break;
        case 'write_file':
          result = toolWriteFile(ctx, req.params);
          break;
        case 'apply_edit':
          result = toolApplyEdit(ctx, req.params);
          break;
        case 'list_files':
          result = toolListFiles(ctx, req.params);
          break;
        case 'search_files':
          result = toolSearchFiles(ctx, req.params);
          break;
        case 'web_fetch':
          result = await toolWebFetch(ctx, req.params);
          break;
        case 'browse':
        case 'browser':
          result = await toolBrowse(ctx, req.params);
          break;
        case 'delegate':
          result = await toolDelegate(ctx, req.params);
          break;
        case 'agent_status':
          result = toolAgentStatus(ctx, req.params);
          break;
        case 'list_skills':
          result = toolListSkills(ctx);
          break;
        case 'create_skill':
          result = toolCreateSkill(ctx, req.params);
          break;
        case 'memory':
          result = await toolMemory(ctx, req.params);
          break;
        case 'update_skill':
          result = toolUpdateSkill(ctx, req.params);
          break;
        case 'list_mcp':
          result = await toolListMcp(ctx);
          break;
        case 'configure_mcp':
          result = toolConfigureMcp(ctx, req.params);
          break;
        case 'list_connections':
          result = toolListConnections(ctx);
          break;
        case 'connection_read':
          result = await toolConnectionRead(ctx, req.params);
          break;
        case 'inspect_connection_response':
          result = toolInspectConnectionResponse(ctx, req.params);
          break;
        case 'update_connection':
          result = toolUpdateConnection(ctx, req.params);
          break;
        case 'use_skill':
          result = toolUseSkill(ctx, req.params);
          break;
        case 'use_skill_reference':
          result = toolUseSkillReference(ctx, req.params);
          break;
        case 'run_command':
          result = await toolRunCommand({ ...ctx, signal: this.signal?.() }, req.params);
          break;
        case 'create_document':
          result = await toolCreateDocument({ ...ctx, signal: this.signal?.() }, req.params);
          break;
        case 'schedule_manage':
          result = toolScheduleManage(ctx, req.params);
          break;
        case 'lsp_diagnostics':
          result = await toolLspDiagnostics(ctx, req.params);
          break;
        case 'lsp_definition':
          result = await toolLspDefinition(ctx, req.params);
          break;
        case 'lsp_references':
          result = await toolLspReferences(ctx, req.params);
          break;
        case 'lsp_hover':
          result = await toolLspHover(ctx, req.params);
          break;
        case 'lsp_symbols':
          result = await toolLspSymbols(ctx, req.params);
          break;
        default:
          if (req.tool.startsWith('mcp:') && this.mcp) {
            try {
              const output = await this.mcp.call(req.tool, req.params);
              result = { ok: true, output: excerpt(output, 4000) };
            } catch (err) {
              const msg = (err as Error).message;
              result = { ok: false, output: `mcp call failed: ${msg}`, errorSignature: msg.slice(0, 16) };
            }
            break;
          }
          if (req.tool.startsWith('mcp:')) {
            result = { ok: false, output: `Unknown tool: ${req.tool} — MCP support is not wired in this session, so MCP tools cannot be called. Accomplish the goal another way (run_command with a shell equivalent) or, if a credential or integration is missing, end with request_block naming the exact missing prerequisite so the user is asked.`, errorSignature: 'unknown-tool' };
            break;
          }
          result = { ok: false, output: unknownToolGuidance(req.tool), errorSignature: 'unknown-tool' };
      }
    } catch (err) {
      const msg = (err as Error).message;
      result = { ok: false, output: `Tool crashed: ${msg}`, errorSignature: msg.slice(0, 16) };
    }

    // Durable implementation knowledge rides beside the action record: facts
    // learned from what was actually read/written, bound to the content
    // revision. Failures never teach knowledge; edits invalidate it.
    this.updateFileKnowledge(req, result);

    // recordAction persists immediately below. Fold touched-file bookkeeping
    // into that same ledger write; saving once per file and then again for the
    // action made write-heavy runs needlessly slow on Windows.
    for (const f of result.filesTouched ?? []) {
      if (!this.ledger.data.filesChanged.includes(f)) this.ledger.data.filesChanged.push(f);
    }
    // A file change is published NATIVELY with real counts and a renderable diff
    // body. The legacy `lines` line alone could only ever carry an addition, which
    // is why a rewrite rendered as a green "+12" with the removals invisible.
    if (result.ok && (result.filesTouched?.length ?? 0) > 0) {
      const file = String(req.params['path'] ?? result.filesTouched?.[0] ?? '');
      const added = result.linesAdded ?? 0;
      const removed = result.linesRemoved ?? 0;
      if (added > 0 || removed > 0) {
        const diff = (result.payload as { diff?: FileDiff } | undefined)?.diff;
        this.emit(`lines    ${file} +${added}${removed > 0 ? ` -${removed}` : ''} lines`);
        this.emitCoding({
          type: 'file_changed',
          path: file,
          linesAdded: added,
          linesRemoved: removed,
          ...(diff?.lines?.length ? { diff: diff.lines } : {}),
        });
      }
    }

    // Tool-output discipline: the model receives a bounded digest; the FULL
    // raw output is persisted as an artifact it can read_file on demand.
    // Nothing huge ever enters model context just because the tool saw it.
    let observation = excerpt(result.output, 800);
    if (scratchNote) {
      // The note rides in result.output too: the model receives the tool
      // output, not the ledger observation, and must learn the redirect.
      result.output += `\n${scratchNote}`;
      observation += `\n${scratchNote}`;
    }
    if (result.output.length > ARTIFACT_THRESHOLD) {
      const artifactPath = this.persistArtifact(req.tool, result.output);
      if (artifactPath) {
        observation += `\n[full ${result.output.length}-char output saved to ${artifactPath} — read_file it only if you truly need more detail]`;
      }
    }

    const record = this.ledger.recordAction({
      observationOnly: isObservationTool(req.tool, req.params),
      stepId,
      tool: req.tool,
      paramsHash,
      paramsSummary: summary,
      status: result.ok ? 'success' : 'error',
      contextFingerprint: result.ok && readContextFingerprint === this.readContextFingerprint(req) ? readContextFingerprint : undefined,
      // Only a complete ledger observation can answer a future repeat. The
      // normal 800-character excerpt may omit the requested middle lines.
      readObservationComplete: req.tool === 'read_file' && result.ok ? result.output.length <= 800 : undefined,
      readRefresh: refreshRead || undefined,
      errorSignature: result.ok ? undefined : result.errorSignature,
      exitCode: result.exitCode,
      reason: req.reason,
      expected: req.expected,
      observation,
      durationMs: Date.now() - started,
    });

    this.emit(`${result.ok ? 'ok       ' : 'error    '} ${summary} (${record.durationMs}ms)`);
    if (result.output) this.emit(`out      ${excerpt(result.output, 900).replace(/\n/g, ' ⏎ ')}`);

    if (req.tool === 'read_file' && result.ok && readContextFingerprint) {
      this.readCache.set(readContextFingerprint, {
        output: result.output,
        contextFingerprint: readContextFingerprint,
        timestamp: Date.now(),
      });
    }
    if ((req.tool === 'write_file' || req.tool === 'apply_edit') && result.ok) {
      const changedPath = typeof req.params['path'] === 'string' ? normalizeToolPath(req.params['path']) : undefined;
      if (changedPath) {
        for (const [key] of this.readCache) {
          if (key.includes(changedPath)) this.readCache.delete(key);
        }
      }
    }
    if (req.tool === 'run_command') {
      const command = commandResultSource(result, req.params);
      // A command that has not finished has no outcome to report: closing its card
      // here would show a verdict that never happened. The poll (or stop) that
      // observes the terminal state closes it instead, with the job's own runtime.
      if (command && !isCommandPending(result)) {
        this.emitCoding({
          type: 'command_finished',
          command,
          // `ok` is this layer's interpretation; `exitCode` is the raw fact from
          // the tool result and is omitted when the process produced no exit
          // status at all (cancelled before launch, timeout, spawn failure).
          ok: result.ok,
          ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
          durationMs: result.durationMs ?? record.durationMs,
        });
      }
    }
    return { record, result };
  }

  /**
   * Update durable implementation knowledge from a tool outcome.
   *
   *  - read_file  → learn facts from the version that was read (sha256 bound)
   *  - write_file → re-learn from the written content (file is known exactly)
   *  - apply_edit → INVALIDATE: the on-disk content no longer matches what the
   *                 facts were extracted from, and presenting stale signatures
   *                 as current is worse than having none. The next read proves
   *                 the new revision.
   *
   * Only successful calls teach knowledge: a failed read proves nothing about
   * the file. At most THREE files per action are recorded (multi-file actions
   * must not flood the store).
   */
  private updateFileKnowledge(req: ExecuteRequest, result: { ok: boolean }): void {
    if (!result.ok) return;
    if (req.tool === 'apply_edit') {
      const rel = req.params['path'];
      if (typeof rel === 'string' && rel) this.fileKnowledge.invalidate(rel);
      return;
    }
    if (req.tool !== 'read_file' && req.tool !== 'write_file') return;

    const rel = req.params['path'];
    if (typeof rel !== 'string' || !rel) return;
    let abs: string;
    try {
      abs = this.guard.resolve(rel);
      this.guard.assertInside(abs);
    } catch {
      return;
    }
    try {
      const st = statSync(abs);
      if (!st.isFile()) return;
      // Telemetry: was this read covered by fresh knowledge (redundant) or
      // was knowledge unable to serve it (required)? Facts for a path the
      // model re-reads anyway are the "why do remaining rereads happen" signal.
      const prior = this.fileKnowledge.get(this.guard.toRelative(abs));
      if (prior && this.fileKnowledge.stillMatches(prior)) this.fileKnowledge.noteRereadRedundant();
      else this.fileKnowledge.noteRereadRequired();
      const content = readFileSync(abs, 'utf8');
      const learned = this.fileKnowledge.record({
        path: this.guard.toRelative(abs),
        content,
        size: st.size,
        mtimeMs: st.mtimeMs,
      });
      if (learned && learned.facts.length > 0) {
        this.emit(`knowledge ${learned.facts.length} fact(s) learned from ${learned.path}`);
      }
    } catch {
      /* knowledge is an optimization — never let it break a tool result */
    }
  }

  /** Persist a large raw tool output under .hermes/artifacts (pruned to 50). */
  private persistArtifact(tool: string, output: string): string | undefined {
    try {
      const dir = path.join(this.guard.lock.repoRoot, '.hermes', 'artifacts');
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `${stamp}-${tool.replace(/[^a-z0-9_-]/gi, '_')}.txt`);
      writeFileSync(file, output);
      // Prune: keep the newest 50 artifacts so the dir cannot grow unbounded.
      const files = readdirSync(dir).sort();
      for (const stale of files.slice(0, Math.max(0, files.length - 50))) {
        try {
          unlinkSync(path.join(dir, stale));
        } catch {
          /* best effort */
        }
      }
      return path.join('.hermes', 'artifacts', path.basename(file));
    } catch {
      return undefined; // artifact persistence must never break a tool result
    }
  }
}
