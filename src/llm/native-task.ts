import type { LlmUsage } from './llm.js';

export type NativeRecord = Record<string, unknown>;

/**
 * Which provider-owned loop is executing. `codex-native` is the Codex
 * app-server loop; `pi-native` is the embedded pi `AgentSession`.
 */
export type NativeExecutionMode = 'codex-native' | 'pi-native';

/**
 * True for any provider-owned loop. Resume and continuation rules apply to all
 * of them, so callers must not test for one mode by name.
 */
export function isNativeExecutionMode(mode: string | undefined): mode is NativeExecutionMode {
  return mode === 'codex-native' || mode === 'pi-native';
}

/** A provider-owned agent loop. The host supervises a turn; it never parses actions. */
export interface NativeTaskRuntime {
  readonly mode: NativeExecutionMode;
  runTurn(input: NativeTaskInput): Promise<NativeTaskResult>;
  steer?(text: string): Promise<void>;
}

export interface NativeTaskInput {
  cwd: string;
  threadId?: string;
  text: string;
  instructions: string;
  effort?: string;
  config: NativeRecord;
  permissions: string;
  signal: AbortSignal;
  tools?: NativeRecord[];
  images?: string[];
  onThread: (id: string) => void;
  onTurn: (id: string) => void;
  onSettings?: (settings: { model: string; requestedEffort?: string; effectiveEffort?: string }) => void;
  onEvent: (method: string, params: NativeRecord) => Promise<void> | void;
  onRequest: (method: string, params: NativeRecord) => Promise<NativeRecord>;
  onUsage?: (usage: LlmUsage) => void;
}

export interface NativeTaskResult {
  threadId: string;
  turnId: string;
  status: 'completed' | 'interrupted';
}
