/** Shared with the composer: credentials must never become persisted chat text. */
export function credentialChatInput(text: string): { safeText: string; detected: boolean; providerHint?: string } {
  let detected = false;
  let providerHint: string | undefined;
  const explicitProvider = /\b(openai|deepseek|openrouter|opencode(?:[ -](?:zen|go))?|alibaba|dashscope|github|gitlab|coolify|vercel|fly(?:\.io)?|anthropic|claude|google|gemini|slack)\b/i.exec(String(text ?? ''))?.[1]?.toLowerCase();
  let safeText = String(text ?? '').replace(
    /\b(?:github_pat_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{25,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g,
    (value) => {
      detected = true;
      if (/^(?:github_pat_|gh[pousr]_)/.test(value)) providerHint ??= 'github';
      else if (value.startsWith('sk-ant-')) providerHint ??= 'anthropic';
      else if (value.startsWith('sk-proj-')) providerHint ??= 'openai';
      else if (value.startsWith('AIza')) providerHint ??= 'google';
      else if (value.startsWith('xox')) providerHint ??= 'slack';
      return '[credential removed — use secure form]';
    },
  );
  safeText = safeText.replace(
    /((?:[A-Za-z][A-Za-z0-9_]*[_-])?(?:api[_ -]?key|access[_ -]?token|auth[_ -]?token|token|secret|password|authorization)\s*["']?\s*(?::|=|\bis\b)\s*["'`]?)(?:Bearer\s+)?([A-Za-z0-9_~+/.|=-]{8,})/gi,
    (match, label: string, value: string) => {
      if (/^(?:undefined|null|redacted|placeholder|your[_-]|example|process\.env\.|os\.environ)/i.test(value)) return match;
      detected = true;
      return `${label}[credential removed — use secure form]`;
    },
  );
  safeText = safeText.replace(/\bBearer\s+[A-Za-z0-9_~+/.=-]{12,}/gi, () => {
    detected = true;
    return 'Bearer [credential removed — use secure form]';
  });
  // A provider-shaped key (for example sk-proj-...) is more trustworthy than
  // an unrelated provider mentioned elsewhere in the task description.
  if (detected && explicitProvider && !providerHint) {
    providerHint = explicitProvider === 'claude' ? 'anthropic'
      : explicitProvider === 'gemini' ? 'google'
        : explicitProvider === 'dashscope' ? 'alibaba'
          : explicitProvider.replace(/[ ]+/g, '-').replace('fly.io', 'fly');
  }
  return { safeText, detected, ...(providerHint ? { providerHint } : {}) };
}

export const CHAT_CREDENTIAL_HELPERS_JS = credentialChatInput.toString();
