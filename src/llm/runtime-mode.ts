/**
 * Which agent loop executes a turn.
 *
 * `pi` is the sole provider-owned agent loop (embedded pi `AgentSession` —
 * see `src/llm/pi-native.ts`). The legacy Codex runtime has been retired.
 */
export type GituRuntime = 'pi';

/**
 * Read the selected runtime. Always returns 'pi'.
 */
export function selectedRuntime(_env: NodeJS.ProcessEnv = process.env): GituRuntime {
  return 'pi';
}
