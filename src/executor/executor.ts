import type { ProjectGuard } from '../guard/project-guard.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import type { PolicyEngine } from '../policy/policy.js';
import type { ActionRecord, ToolResult } from '../types.js';
import { excerpt, hashParams, summarizeParams } from '../util.js';
import {
  toolApplyEdit,
  toolListFiles,
  toolReadFile,
  toolRunCommand,
  toolSearchFiles,
  toolWriteFile,
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
      if (step) this.ledger.updateStep(stepId, { status: 'in_progress', attempts: step.attempts + 1 });
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
    const ctx: ToolContext = { guard: this.guard, cwd: this.guard.lock.repoRoot };
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
        case 'run_command':
          result = await toolRunCommand(ctx, req.params);
          break;
        default:
          result = { ok: false, output: `Unknown tool: ${req.tool}`, errorSignature: 'unknown-tool' };
      }
    } catch (err) {
      const msg = (err as Error).message;
      result = { ok: false, output: `Tool crashed: ${msg}`, errorSignature: msg.slice(0, 16) };
    }

    for (const f of result.filesTouched ?? []) {
      this.ledger.trackFile(f);
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
      observation: excerpt(result.output, 800),
      durationMs: Date.now() - started,
    });

    this.emit(`${result.ok ? 'ok       ' : 'error    '} ${summary} (${record.durationMs}ms)`);
    if (result.output) this.emit(`out      ${excerpt(result.output, 900).replace(/\n/g, ' ⏎ ')}`);
    return { record, result };
  }
}
