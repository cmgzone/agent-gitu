/**
 * Adapters for Pi's read-only built-in tools (read, grep, find, ls).
 *
 * Architecture invariant:
 * Gitu's ProjectGuard, PolicyEngine, and TaskLedger own all permissions, path
 * resolution, boundaries, and audits. The Pi tools are executed as underlying
 * implementations only AFTER Gitu authorizes the call.
 *
 * SECURITY INVARIANT (FALLBACK CANNOT BYPASS DENIAL):
 * Authorization (ProjectGuard.assertReadable) and parameter validation are
 * strictly evaluated BEFORE entering any Pi tool invocation or fallback try/catch
 * block. Fallback to native Gitu handlers ONLY recovers from runtime execution
 * failures from the Pi adapter (e.g. tool execution exceptions, format anomalies);
 * it NEVER catches or bypasses a security denial or authorization failure.
 * Furthermore, native fallback handlers independently enforce the exact same
 * ProjectGuard boundary and parameter validations.
 */
import { statSync } from 'node:fs';
import {
  createReadToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createFindToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { ToolContext } from '../tools.js';
import type { ToolResult } from '../../types.js';
import { errorSignature } from '../../util.js';
import {
  formatToolValidationError,
  readFileOptions,
  toolReadFile as nativeReadFile,
  toolListFiles as nativeListFiles,
  toolSearchFiles as nativeSearchFiles,
  validateToolParams,
  MAX_FILE_BYTES,
} from '../tools.js';

function fail(output: string): ToolResult {
  return { ok: false, output, errorSignature: errorSignature(output) };
}

export interface PiReadOnlyAdapterOptions {
  /** If set, forces fallback to native Gitu implementation. */
  forceNative?: boolean;
  /** Optional mock definition for testing adapter recovery behavior. */
  _readDef?: ReturnType<typeof createReadToolDefinition>;
  _lsDef?: ReturnType<typeof createLsToolDefinition>;
  _grepDef?: ReturnType<typeof createGrepToolDefinition>;
}

/**
 * Pi-adapted file reading behind Gitu's ProjectGuard and line-number contract.
 */
export async function piReadFile(
  ctx: ToolContext,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  options?: PiReadOnlyAdapterOptions,
): Promise<ToolResult> {
  if (options?.forceNative) {
    return nativeReadFile(ctx, params);
  }

  const val = validateToolParams('read_file', params);
  if (!val.valid) return fail(formatToolValidationError('read_file', params, val));

  const rel = String(params['path']);
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertReadable(abs);

  try {
    const st = statSync(abs);
    if (st.isDirectory()) return fail(`read_file: ${rel} is a directory`);
    if (st.size > MAX_FILE_BYTES) return fail(`read_file: ${rel} is ${st.size} bytes (limit ${MAX_FILE_BYTES})`);
  } catch (err) {
    return fail(`read_file failed: ${(err as Error).message}`);
  }

  const { offset, limit, maxChars } = readFileOptions(params);

  try {
    const readDef = options?._readDef ?? createReadToolDefinition(ctx.guard.lock.repoRoot);
    const effectiveSignal = signal ?? ctx.signal;
    const result = await readDef.execute(
      'pi-read-' + Date.now(),
      {
        path: abs,
        offset: offset > 1 ? offset : undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      },
      effectiveSignal,
      undefined,
      undefined as never,
    );

    // Handle image results
    const imageBlock = result.content?.find((c) => c.type === 'image') as
      | { type: 'image'; data: string; mimeType: string }
      | undefined;
    if (imageBlock) {
      return {
        ok: true,
        output: `[Image file ${rel} (${imageBlock.mimeType})]`,
        payload: {
          image: {
            path: rel,
            mimeType: imageBlock.mimeType,
            data: imageBlock.data,
          },
        },
      };
    }

    // Text content: format with line numbers matching Gitu's line contract
    const textBlock = result.content?.find((c) => c.type === 'text');
    const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

    // If the text contains truncation notices from Pi, we preserve or format line numbers
    const lines = rawText.split('\n');
    const startNum = offset || 1;
    const numbered = lines.map((l, i) => `${startNum + i}: ${l}`).join('\n');

    let body = numbered;
    if (body.length > maxChars) {
      const cut = body.lastIndexOf('\n', maxChars);
      const kept = body.slice(0, cut > 0 ? cut : maxChars);
      const keptLines = kept.split('\n').length;
      body =
        kept +
        `\n[... output capped at ${maxChars} chars. ` +
        `Read the rest with offset=${startNum + keptLines - 1} or narrow with search_files.]`;
    }

    return { ok: true, output: body };
  } catch (err) {
    // If Pi read fails or aborts, fall back to native or report clean error
    if (signal?.aborted || ctx.signal?.aborted) {
      return fail('read_file aborted.');
    }
    return nativeReadFile(ctx, params);
  }
}

/**
 * Pi-adapted directory listing / file finding behind Gitu's ProjectGuard.
 */
export async function piListFiles(
  ctx: ToolContext,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  options?: PiReadOnlyAdapterOptions,
): Promise<ToolResult> {
  if (options?.forceNative) {
    return nativeListFiles(ctx, params);
  }

  const rel = String(params['path'] ?? '.');
  const abs = ctx.guard.resolve(rel);
  ctx.guard.assertReadable(abs);

  try {
    const st = statSync(abs);
    if (!st.isDirectory()) return fail(`list_files: ${rel} is not a directory`);
  } catch (err) {
    return fail(`list_files failed: ${(err as Error).message}`);
  }

  const recursive = params['recursive'] === true;
  const effectiveSignal = signal ?? ctx.signal;

  try {
    if (recursive) {
      const findDef = createFindToolDefinition(ctx.guard.lock.repoRoot, {
        operations: {
          exists: async () => true,
          glob: async () => {
            const res = nativeListFiles(ctx, params);
            return res.ok ? res.output.split('\n').filter((l) => l && l !== '(empty)') : [];
          },
        },
      });
      const result = await findDef.execute(
        'pi-find-' + Date.now(),
        {
          pattern: '*',
          path: rel === '.' ? undefined : rel,
          limit: typeof params['limit'] === 'number' ? params['limit'] : 1000,
        },
        effectiveSignal,
        undefined,
        undefined as never,
      );
      const textBlock = result.content?.find((c) => c.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';
      return { ok: true, output: text || '(empty)' };
    } else {
      const lsDef = options?._lsDef ?? createLsToolDefinition(ctx.guard.lock.repoRoot);
      const result = await lsDef.execute(
        'pi-ls-' + Date.now(),
        {
          path: rel === '.' ? undefined : rel,
          limit: typeof params['limit'] === 'number' ? params['limit'] : 500,
        },
        effectiveSignal,
        undefined,
        undefined as never,
      );
      const textBlock = result.content?.find((c) => c.type === 'text');
      const text = textBlock && 'text' in textBlock ? textBlock.text : '';
      return { ok: true, output: text || '(empty)' };
    }
  } catch (err) {
    if (effectiveSignal?.aborted) return fail('list_files aborted.');
    return nativeListFiles(ctx, params);
  }
}

/**
 * Pi-adapted grep / search behind Gitu's ProjectGuard.
 */
export async function piSearchFiles(
  ctx: ToolContext,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  options?: PiReadOnlyAdapterOptions,
): Promise<ToolResult> {
  if (options?.forceNative) {
    return nativeSearchFiles(ctx, params);
  }

  const pattern = String(params['pattern'] ?? '');
  if (!pattern) return fail('search_files: missing "pattern"');

  const searchPath = params['path'] ? String(params['path']) : undefined;
  if (searchPath) {
    const abs = ctx.guard.resolve(searchPath);
    ctx.guard.assertReadable(abs);
  }

  const effectiveSignal = signal ?? ctx.signal;

  try {
    const grepDef = options?._grepDef ?? createGrepToolDefinition(ctx.guard.lock.repoRoot);
    const result = await grepDef.execute(
      'pi-grep-' + Date.now(),
      {
        pattern,
        path: searchPath,
        ignoreCase: params['caseSensitive'] === true ? false : true,
        literal: params['mode'] === 'literal' || params['regex'] === false,
        limit: typeof params['limit'] === 'number' ? params['limit'] : 100,
      },
      effectiveSignal,
      undefined,
      undefined as never,
    );

    const textBlock = result.content?.find((c) => c.type === 'text');
    const text = textBlock && 'text' in textBlock ? textBlock.text : '';
    return { ok: true, output: text || 'No matching lines found.' };
  } catch (err) {
    if (effectiveSignal?.aborted) return fail('search_files aborted.');
    // Smooth fallback to Gitu's language-agnostic search scanner
    return nativeSearchFiles(ctx, params);
  }
}
