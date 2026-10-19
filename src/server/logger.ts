import pino, { type DestinationStream } from 'pino';

/** Operational logs go to stderr so CLI stdout remains usable for JSON/results.
 * Never pass request bodies, raw provider errors or configuration objects here. */
export function createServerLogger(destination?: DestinationStream) {
  const requested = process.env['LOG_LEVEL'] ?? 'info';
  const level = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(requested) ? requested : 'info';
  const options = {
    name: 'agent-gitu',
    level,
    redact: { paths: ['password', 'apiKey', 'token', 'secret', 'authorization', 'cookie', 'req.headers.authorization', 'req.headers.cookie'], censor: '[REDACTED]' },
  };
  return pino(options, destination ?? pino.destination(2));
}

export const logger = createServerLogger();

/** Provider error messages can contain credentials or private request content. */
export function errorMetadata(error: unknown): { errorType: string; errorCode?: string } {
  const failure = error as { name?: unknown; code?: unknown } | undefined;
  const name = String(failure?.name ?? 'Error');
  const code = typeof failure?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(failure.code) ? failure.code : undefined;
  return { errorType: ['Error', 'TypeError', 'RangeError', 'LlmError', 'ProviderError', 'AbortError'].includes(name) ? name : 'Error', ...(code ? { errorCode: code } : {}) };
}
