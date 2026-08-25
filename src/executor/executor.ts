import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import type { LspManager } from '../lsp/manager.js';
import type { McpManager } from '../mcp/client.js';
import type { PolicyEngine } from '../policy/policy.js';
import type { SkillStore } from '../skills/skills.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { ActionRecord, ToolResult } from '../types.js';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { excerpt, hashParams, summarizeParams } from '../util.js';

/** Outputs larger than this are persisted to an artifact; the model gets the
 *  excerpt plus a read_file pointer instead of the raw bulk. */
const ARTIFACT_THRESHOLD = 4000;
import {
  formatToolValidationError,
  toolAgentStatus,
  toolApplyEdit,
  toolBrowse,
  toolCreateSkill,
  toolDelegate,
  toolListFiles,
  toolListSkills,
  toolLspDefinition,
  toolLspDiagnostics,
  toolLspHover,
  toolLspReferences,
  toolLspSymbols,
  toolReadFile,
  toolRunCommand,
  toolSearchFiles,
  toolUseSkill,
  toolWebFetch,
  toolWriteFile,
  validateToolParams,
  type DelegateFn,
  type BackgroundAgentStatusFn,
  type BackgroundDelegateFn,
  type ToolContext,
} from '../tools/tools.js';

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

export class Executor {
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
  ) {}

  private emit(event: string): void {
    this.onEvent?.(event);
  }

  async execute(req: ExecuteRequest): Promise<ExecuteOutcome> {
    const started = Date.now();
    const paramsHash = hashParams(req.tool, req.params);
    const summary = summarizeParams(req.tool, req.params);
    const stepId = req.stepId;

    if (stepId) {
      const step = this.ledger.step(stepId);
      if (step) {
        const entering = step.status !== 'in_progress';
        this.ledger.updateStep(stepId, { status: 'in_progress', attempts: step.attempts + (entering ? 1 : 0) });
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

    const loopVerdict = this.loopDetector.evaluate(this.ledger.data.actions, req.tool, paramsHash, undefined);
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
      return { record, result: { ok: false, output: message }, blockedByLoop: message };
    }

    if (req.tool === 'write_file' || req.tool === 'apply_edit') {
      const file = String(req.params['path'] ?? '');
      if (file) {
        const passedEvidence = this.ledger.data.evidence.filter((e) => e.passed).length;
        const pressure = this.loopDetector.fileEditPressure(this.ledger.data.actions, passedEvidence, file);
        if (pressure.blocked) {
          const message =
            `EDIT PRESSURE: ${pressure.edits} edits to ${file} with no passing evidence yet. ` +
            `Run a verification command (test/build/lint/typecheck) before editing further.`;
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
          return { record, result: { ok: false, output: message }, blockedByLoop: message };
        }
      }
    }

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
      return { record, result: { ok: false, output: message }, deniedByPolicy: message };
    }

    this.emit(`run      ${summary}${req.reason ? ` — ${req.reason}` : ''}`);
    const ctx: ToolContext = {
      guard: this.guard,
      cwd: this.guard.lock.repoRoot,
      skills: this.skills,
      mcp: this.mcp,
      browser: this.browser,
      lsp: this.lsp,
      delegate: this.delegate,
      delegateBackground: this.delegateBackground,
      backgroundAgentStatus: this.backgroundAgentStatus,
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
        case 'use_skill':
          result = toolUseSkill(ctx, req.params);
          break;
        case 'run_command':
          result = await toolRunCommand(ctx, req.params);
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
          result = { ok: false, output: `Unknown tool: ${req.tool}`, errorSignature: 'unknown-tool' };
      }
    } catch (err) {
      const msg = (err as Error).message;
      result = { ok: false, output: `Tool crashed: ${msg}`, errorSignature: msg.slice(0, 16) };
    }

    for (const f of result.filesTouched ?? []) {
      this.ledger.trackFile(f);
    }
    if (result.ok && result.linesAdded) {
      const file = String(req.params['path'] ?? '');
      this.emit(`lines    ${file} +${result.linesAdded} lines`);
    }

    // Tool-output discipline: the model receives a bounded digest; the FULL
    // raw output is persisted as an artifact it can read_file on demand.
    // Nothing huge ever enters model context just because the tool saw it.
    let observation = excerpt(result.output, 800);
    if (result.output.length > ARTIFACT_THRESHOLD) {
      const artifactPath = this.persistArtifact(req.tool, result.output);
      if (artifactPath) {
        observation += `\n[full ${result.output.length}-char output saved to ${artifactPath} — read_file it only if you truly need more detail]`;
      }
    }

    const record = this.ledger.recordAction({
      stepId,
      tool: req.tool,
      paramsHash,
      paramsSummary: summary,
      status: result.ok ? 'success' : 'error',
      errorSignature: result.ok ? undefined : result.errorSignature,
      exitCode: result.exitCode,
      reason: req.reason,
      expected: req.expected,
      observation,
      durationMs: Date.now() - started,
    });

    this.emit(`${result.ok ? 'ok       ' : 'error    '} ${summary} (${record.durationMs}ms)`);
    if (result.output) this.emit(`out      ${excerpt(result.output, 900).replace(/\n/g, ' ⏎ ')}`);
    return { record, result };
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
