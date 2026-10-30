/**
 * Pi context compaction extension with Agent Gitu task awareness.
 *
 * Pi 1.4.0 provides built-in context compaction: automatic threshold-based
 * compaction when context tokens exceed (contextWindow - reserveTokens),
 * automatic overflow recovery with turn retry, and manual /compact.
 *
 * This extension hooks into Pi's supported `session_before_compact` extension event
 * to guide conversation summarization. It ensures the resulting summary focuses
 * on the active goal, acceptance criteria, architectural constraints, key decisions,
 * remaining plan, unresolved blockers, and touched files — preserving working context
 * without replacing Gitu's authoritative TaskLedger or persistent MemoryStore.
 *
 * API CONTRACT COMPLIANCE:
 * 1. We call Pi's lower-level exported `compact()` summarization function imported from
 *    `@earendil-works/pi-coding-agent` (which resolves to `core/compaction/index.ts`).
 *    We NEVER call `AgentSession.compact()` recursively inside this hook.
 * 2. We preserve file-history metadata (`details: { readFiles, modifiedFiles }` and XML
 *    blocks in the summary text) since extension-provided summaries manage their own details.
 */
import {
  compact,
  type CompactionResult,
  type SessionBeforeCompactEvent,
  type SessionBeforeCompactResult,
} from '@earendil-works/pi-coding-agent';
import type { NativeRecord } from './native-task.js';
import type { PiThinkingLevel } from './pi/sdk.js';

export type CompactionPreparation = SessionBeforeCompactEvent['preparation'];

/** Context supplied by Gitu to focus the compaction summary. */
export interface GituCompactionContext {
  /** The overarching objective of the current task. */
  goal?: string;
  /** Active criteria that must be satisfied before task completion. */
  criteria?: string[];
  /** Inviolable constraints, conventions, or guidelines. */
  constraints?: string[];
  /** Architectural or implementation decisions made during this task. */
  decisions?: string[];
  /** Remaining steps in the execution plan. */
  remainingPlan?: string[];
  /** Unresolved blockers, questions, or pending user input. */
  unresolvedQuestions?: string[];
  /** Critical files read, edited, or produced. */
  relevantFiles?: string[];
  /** Additional custom focus instructions. */
  customFocus?: string;
}

/** Details stored on compaction entries to track read and modified files. */
export interface CompactionFileDetails {
  readFiles: string[];
  modifiedFiles: string[];
  [key: string]: unknown;
}

/**
 * Format Gitu task context into structured summary guidance for Pi's compactor.
 */
export function buildGituCompactionInstructions(ctx?: GituCompactionContext): string {
  const parts: string[] = [
    'Preserve the following critical task context in the compaction summary:',
    '- Active task objective and primary goal',
    '- Explicit constraints and architectural decisions',
    '- Progress achieved and remaining plan/work',
    '- Relevant file paths and modified resources',
    '- Any unresolved questions, blockers, or pending user input',
    'Do not hallucinate completed steps or discard unverified requirements.',
  ];

  if (!ctx) return parts.join('\n');

  if (ctx.goal?.trim()) {
    parts.push(`\nActive Goal: ${ctx.goal.trim()}`);
  }
  if (ctx.criteria && ctx.criteria.length > 0) {
    parts.push('\nAcceptance Criteria to Preserve:');
    for (const c of ctx.criteria) parts.push(`- ${c}`);
  }
  if (ctx.constraints && ctx.constraints.length > 0) {
    parts.push('\nConstraints & Guidelines:');
    for (const c of ctx.constraints) parts.push(`- ${c}`);
  }
  if (ctx.decisions && ctx.decisions.length > 0) {
    parts.push('\nKey Architectural Decisions:');
    for (const d of ctx.decisions) parts.push(`- ${d}`);
  }
  if (ctx.remainingPlan && ctx.remainingPlan.length > 0) {
    parts.push('\nRemaining Plan:');
    for (const p of ctx.remainingPlan) parts.push(`- ${p}`);
  }
  if (ctx.unresolvedQuestions && ctx.unresolvedQuestions.length > 0) {
    parts.push('\nUnresolved Blockers / Questions:');
    for (const q of ctx.unresolvedQuestions) parts.push(`- ${q}`);
  }
  if (ctx.relevantFiles && ctx.relevantFiles.length > 0) {
    parts.push('\nKey Files:');
    for (const f of ctx.relevantFiles) parts.push(`- ${f}`);
  }
  if (ctx.customFocus?.trim()) {
    parts.push(`\nAdditional Focus: ${ctx.customFocus.trim()}`);
  }

  return parts.join('\n');
}

/**
 * Extract cumulative read and modified file paths from:
 * 1. Pi's pre-computed fileOps (from Pi tool calls: read, write, edit)
 * 2. Gitu tool calls in messagesToSummarize (read_file, write_file, apply_edit)
 * 3. Gitu task context relevantFiles (filesChanged)
 */
export function extractCumulativeFileOps(
  preparation: CompactionPreparation,
  ctx?: GituCompactionContext,
): CompactionFileDetails {
  const readSet = new Set<string>();
  const modifiedSet = new Set<string>();

  // 1. Previous compaction details / Pi fileOps
  if (preparation.fileOps) {
    const ops = preparation.fileOps as { read?: Set<string>; written?: Set<string>; edited?: Set<string> };
    if (ops.read) {
      for (const f of ops.read) readSet.add(f);
    }
    if (ops.written) {
      for (const f of ops.written) modifiedSet.add(f);
    }
    if (ops.edited) {
      for (const f of ops.edited) modifiedSet.add(f);
    }
  }

  // 2. Gitu task context relevant files
  if (ctx?.relevantFiles) {
    for (const f of ctx.relevantFiles) {
      if (typeof f === 'string' && f.trim()) modifiedSet.add(f.trim());
    }
  }

  // 3. Scan messages to summarize for Gitu tool calls
  const allMessages = [
    ...(preparation.messagesToSummarize ?? []),
    ...(preparation.turnPrefixMessages ?? []),
  ];

  for (const msg of allMessages) {
    if (!msg || typeof msg !== 'object') continue;
    const content = (msg as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const block = part as { type?: string; name?: string; arguments?: Record<string, unknown> };
      if (block.type !== 'toolCall' && block.type !== 'tool_call') continue;
      const toolName = String(block.name ?? '');
      const args = block.arguments && typeof block.arguments === 'object' ? block.arguments : {};
      const targetPath = typeof args['path'] === 'string' ? args['path'] : undefined;
      if (!targetPath) continue;

      if (toolName === 'read_file' || toolName === 'read') {
        readSet.add(targetPath);
      } else if (toolName === 'write_file' || toolName === 'write') {
        modifiedSet.add(targetPath);
      } else if (toolName === 'apply_edit' || toolName === 'edit') {
        modifiedSet.add(targetPath);
      }
    }
  }

  // Files modified take precedence over read-only
  for (const m of modifiedSet) {
    readSet.delete(m);
  }

  return {
    readFiles: [...readSet].sort(),
    modifiedFiles: [...modifiedSet].sort(),
  };
}

export interface PiCompactionExtensionOptions {
  /** Supplier for Gitu task context when compaction triggers. */
  getContext?: (reason: string) => GituCompactionContext | undefined;
  /** Notification callback when a compaction cycle completes successfully. */
  onCompacted?: (result: { reason: string; tokensBefore: number; summary: string }) => void;
  /** Injected compactor function, e.g. for unit tests or custom models. */
  compactFn?: typeof compact;
  /** Optional policy hook to cancel compaction early. */
  shouldCancel?: (event: { reason: string; willRetry: boolean }) => boolean;
}

/**
 * Pi extension factory that registers Gitu-aware compaction handling.
 */
export function piCompactionExtension(options: PiCompactionExtensionOptions = {}) {
  return (pi: unknown) => {
    const ext = pi as {
      on(event: 'session_before_compact', handler: (event: NativeRecord) => Promise<SessionBeforeCompactResult | undefined>): void;
      model?: unknown;
      modelRegistry?: {
        getApiKeyAndHeaders(model: unknown): Promise<{ apiKey?: string; headers?: Record<string, string> }>;
      };
      thinkingLevel?: PiThinkingLevel;
    };

    ext.on('session_before_compact', async (event: NativeRecord): Promise<SessionBeforeCompactResult | undefined> => {
      const reason = String(event['reason'] ?? 'threshold');
      const willRetry = Boolean(event['willRetry']);

      if (options.shouldCancel?.({ reason, willRetry })) {
        return { cancel: true };
      }

      const preparation = event['preparation'] as CompactionPreparation | undefined;
      if (!preparation) return undefined;

      const ctx = options.getContext?.(reason);
      const customInstructions = buildGituCompactionInstructions(ctx);
      const fileMetadata = extractCumulativeFileOps(preparation, ctx);

      const enrichResult = (raw: CompactionResult): CompactionResult => {
        let summary = raw.summary;
        if (fileMetadata.modifiedFiles.length > 0 && !summary.includes('<modified-files>')) {
          summary += `\n\n<modified-files>\n${fileMetadata.modifiedFiles.join('\n')}\n</modified-files>`;
        }
        if (fileMetadata.readFiles.length > 0 && !finalContainsReadFiles(summary)) {
          summary += `\n\n<read-files>\n${fileMetadata.readFiles.join('\n')}\n</read-files>`;
        }

        const existingDetails = (raw.details && typeof raw.details === 'object') ? (raw.details as Record<string, unknown>) : {};
        return {
          ...raw,
          summary,
          details: {
            ...existingDetails,
            readFiles: fileMetadata.readFiles,
            modifiedFiles: fileMetadata.modifiedFiles,
          },
        };
      };

      // If a custom compactFn is supplied (tests or specialized runner), use it.
      if (options.compactFn) {
        const compactor = options.compactFn;
        const auth = ext.model && ext.modelRegistry
          ? await ext.modelRegistry.getApiKeyAndHeaders(ext.model).catch(() => ({ apiKey: undefined, headers: undefined }))
          : { apiKey: undefined, headers: undefined };
        const rawResult = await compactor(
          preparation,
          ext.model as Parameters<typeof compact>[1],
          auth.apiKey,
          auth.headers,
          customInstructions,
          event['signal'] as AbortSignal,
          ext.thinkingLevel as Parameters<typeof compact>[6],
        );
        const enriched = enrichResult(rawResult);
        options.onCompacted?.({
          reason,
          tokensBefore: preparation.tokensBefore,
          summary: enriched.summary,
        });
        return { compaction: enriched };
      }

      // In real runtime with an active model and registry:
      // We invoke Pi's lower-level exported `compact()` summarization function (pure function).
      // We NEVER invoke `AgentSession.compact()` recursively.
      if (ext.model && ext.modelRegistry) {
        const auth = await ext.modelRegistry.getApiKeyAndHeaders(ext.model).catch(() => ({ apiKey: undefined, headers: undefined }));
        const rawResult = await compact(
          preparation,
          ext.model as Parameters<typeof compact>[1],
          auth.apiKey,
          auth.headers,
          customInstructions,
          event['signal'] as AbortSignal,
          ext.thinkingLevel as Parameters<typeof compact>[6],
        );
        const enriched = enrichResult(rawResult);
        options.onCompacted?.({
          reason,
          tokensBefore: preparation.tokensBefore,
          summary: enriched.summary,
        });
        return { compaction: enriched };
      }

      // Default fallback: let Pi's default compactor handle it.
      return undefined;
    });
  };
}

function finalContainsReadFiles(text: string): boolean {
  return text.includes('<read-files>');
}
