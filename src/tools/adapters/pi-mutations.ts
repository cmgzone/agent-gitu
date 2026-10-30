/**
 * Adapters for file mutations (write, edit) integrating Pi's file mutation queue
 * and multi-edit normalization while preserving Gitu's ProjectGuard, persistence
 * verification (writeAndVerify), bracket balance detection, and diff payloads.
 *
 * SECURITY INVARIANT (FALLBACK CANNOT BYPASS DENIAL):
 * Authorization (ProjectGuard.assertInside) and parameter validation are
 * strictly evaluated BEFORE entering any mutation queue or execution block.
 * Neither the queue nor any fallback can bypass a security denial or write
 * outside the authorized workspace boundary. Native handlers independently
 * re-verify boundaries (canonical target re-assertion inside writeAndVerify).
 */
import { withFileMutationQueue } from './file-mutation-queue.js';
import type { ToolContext } from '../tools.js';
import type { ToolResult } from '../../types.js';
import {
  formatToolValidationError,
  toolApplyEdit as nativeApplyEdit,
  toolWriteFile as nativeWriteFile,
  validateToolParams,
} from '../tools.js';
import { errorSignature } from '../../util.js';

function fail(output: string): ToolResult {
  return { ok: false, output, errorSignature: errorSignature(output) };
}

export interface PiMutationAdapterOptions {
  forceNative?: boolean;
}

/**
 * Write a file using Pi's per-file mutation queue while strictly enforcing
 * Gitu ProjectGuard boundaries and persistence verification.
 */
export async function piWriteFile(
  ctx: ToolContext,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  options?: PiMutationAdapterOptions,
): Promise<ToolResult> {
  if (options?.forceNative) {
    return nativeWriteFile(ctx, params);
  }

  const rel = String(params['path'] ?? '');
  const content = params['content'];
  if (!rel) return fail('write_file: missing "path"');
  if (typeof content !== 'string') return fail('write_file: missing string "content"');

  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);

  if (signal?.aborted || ctx.signal?.aborted) {
    return fail('write_file aborted.');
  }

  return withFileMutationQueue(abs, async () => {
    if (signal?.aborted || ctx.signal?.aborted) {
      return fail('write_file aborted.');
    }
    return nativeWriteFile(ctx, params);
  });
}

/**
 * Edit a file using Pi's per-file mutation queue. Supports both Gitu's
 * { oldString, newString } and Pi-style { edits: [{ oldText, newText }] },
 * preserving Gitu's exact replacement semantics and diff accounting.
 */
export async function piApplyEdit(
  ctx: ToolContext,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  options?: PiMutationAdapterOptions,
): Promise<ToolResult> {
  if (options?.forceNative) {
    return nativeApplyEdit(ctx, params);
  }

  // Normalize Pi-style edits parameter if provided: { edits: [{ oldText, newText }] }
  const normalizedParams = { ...params };
  if (Array.isArray(params['edits']) && params['edits'].length > 0) {
    const first = params['edits'][0] as Record<string, unknown>;
    if (typeof first?.['oldText'] === 'string' && typeof first?.['newText'] === 'string') {
      normalizedParams['oldString'] = first['oldText'];
      normalizedParams['newString'] = first['newText'];
    }
  }

  const rel = String(normalizedParams['path'] ?? '');
  const oldStr = normalizedParams['oldString'];
  const newStr = normalizedParams['newString'];
  if (!rel) return fail('apply_edit: missing "path"');
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') {
    return fail('apply_edit: "oldString" and "newString" must be strings');
  }
  if (oldStr === newStr) return fail('apply_edit: oldString and newString are identical');

  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertInside(abs);

  if (signal?.aborted || ctx.signal?.aborted) {
    return fail('apply_edit aborted.');
  }

  return withFileMutationQueue(abs, async () => {
    if (signal?.aborted || ctx.signal?.aborted) {
      return fail('apply_edit aborted.');
    }
    return nativeApplyEdit(ctx, normalizedParams);
  });
}
