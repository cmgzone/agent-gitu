type RunError = { error: unknown; context?: { agentId?: string } };

/** CopilotKit emits run failures through onError even when runAgent resolves. */
export async function runConversationTurn(
  agentId: string,
  execute: () => Promise<unknown>,
  subscribe: (listener: (event: RunError) => void) => { unsubscribe: () => void },
) {
  let failure: Error | undefined;
  const subscription = subscribe((event) => {
    if (event.context?.agentId && event.context.agentId !== agentId) return;
    failure = event.error instanceof Error ? event.error : new Error(String(event.error));
  });
  try {
    await execute();
    // CopilotKit can emit the terminal failure through onError a tick after
    // runAgent resolves; one task flush closes that window for this listener.
    // Chat's persistent global subscription still backstops later events.
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (failure) throw failure;
  } finally {
    subscription.unsubscribe();
  }
}
