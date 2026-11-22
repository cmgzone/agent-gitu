/** Input payload representing an interactive A2UI action dispatched by a user. */
export interface A2uiActionInput {
  name: string;
  context?: Record<string, unknown>;
}

const MAX_ACTION_MESSAGE_LENGTH = 4000;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function sanitizeText(raw: string): string {
  return raw.replace(CONTROL_CHAR_REGEX, '');
}

function formatContextValue(val: unknown): string | null {
  if (val === undefined) {
    return null;
  }
  if (val === null) {
    return 'null';
  }
  if (typeof val === 'string') {
    const cleaned = sanitizeText(val).replace(/[\r\n]+/g, ' ').trim();
    return cleaned === '' ? '""' : cleaned;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  try {
    const serialized = JSON.stringify(val);
    return serialized ? sanitizeText(serialized) : String(val);
  } catch {
    return sanitizeText(String(val));
  }
}

/**
 * Formats an A2UI button or form action into a clean user chat message
 * suitable for direct delivery (Option B) without altering composer state.
 */
export function formatA2uiActionMessage(action: A2uiActionInput): string {
  const safeName =
    sanitizeText(String(action?.name ?? ''))
      .replace(/\s+/g, ' ')
      .trim() || 'action';
  const lines = [`[A2UI Action] ${safeName}`];
  const ctx = action?.context;

  if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    for (const [rawKey, rawVal] of Object.entries(ctx)) {
      const formattedVal = formatContextValue(rawVal);
      if (formattedVal === null) {
        continue;
      }
      const safeKey = sanitizeText(String(rawKey)).replace(/[\r\n]+/g, ' ').trim();
      if (!safeKey) {
        continue;
      }
      lines.push(`- ${safeKey}: ${formattedVal}`);
    }
  }

  const combined = lines.join('\n');
  if (combined.length <= MAX_ACTION_MESSAGE_LENGTH) {
    return combined;
  }
  return `${combined.slice(0, MAX_ACTION_MESSAGE_LENGTH - 3)}...`;
}
