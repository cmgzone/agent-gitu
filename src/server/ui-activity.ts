/** Shared live activity animation for the main chat and Cowork. */
export const ACTIVITY_MARK_HTML = '<span class="spinner" aria-hidden="true"></span><span class="thinking-waves" aria-hidden="true"><i></i><i></i><i></i></span>';

export const ACTIVITY_CSS = String.raw`
  .activity-indicator { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .activity-indicator .spinner { width: 12px; height: 12px; border: 2px solid var(--border2); border-top-color: var(--run); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .activity-indicator .thinking-waves { display: inline-flex; gap: 3px; align-items: center; height: 12px; flex: none; }
  .activity-indicator .thinking-waves i { width: 3px; height: 3px; border-radius: 50%; background: var(--run); animation: thinkingWave .9s ease-in-out infinite; }
  .activity-indicator .thinking-waves i:nth-child(2) { animation-delay: .13s; }
  .activity-indicator .thinking-waves i:nth-child(3) { animation-delay: .26s; }
  @keyframes thinkingWave { 0%, 100% { opacity: .25; transform: translateY(1px); } 50% { opacity: 1; transform: translateY(-2px); } }
  .activity-indicator .wtext { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .working.activity-indicator { flex-wrap: wrap; }
  .reasoning-stream { flex-basis: 100%; min-width: 0; max-width: 100%; max-height: 9em; overflow-y: auto; overflow-wrap: anywhere; white-space: pre-wrap; color: var(--muted); font-size: 12px; line-height: 1.6; margin-top: 4px; }
  .reasoning-stream[hidden] { display: none; }
  @media (prefers-reduced-motion: reduce) { .activity-indicator *, .activity-indicator *::after { animation: none !important; } }
`;

/** Both chats follow new deltas unless the user scrolls back to read. */
export const REASONING_STREAM_JS = String.raw`
  function renderReasoningStream(el, text) {
    if (!el) return;
    var nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    text = String(text || '').slice(-24000);
    if (el.textContent !== text) el.textContent = text;
    el.hidden = !text.trim();
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }
`;
