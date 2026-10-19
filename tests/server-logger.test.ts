import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServerLogger, errorMetadata } from '../src/server/logger.js';

afterEach(() => vi.unstubAllEnvs());
describe('structured server logs', () => {
  it('emits JSON severity while redacting credentials and request authentication', () => {
    vi.stubEnv('LOG_LEVEL', 'info');
    const lines: string[] = [];
    const logger = createServerLogger({
      write: (line) => {
        lines.push(line);
      },
    });
    logger.warn(
      {
        subsystem: 'mail',
        password: 'private-password',
        apiKey: 'private-key',
        token: 'private-token',
        req: { headers: { authorization: 'private-auth', cookie: 'private-cookie' } },
      },
      'Connection unavailable',
    );
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 40, name: 'agent-gitu', subsystem: 'mail', msg: 'Connection unavailable', password: '[REDACTED]' });
    expect(lines[0]).not.toContain('private-');
  });

  it('logs error categories without provider messages, stacks or private payloads', () => {
    const error = Object.assign(new Error('password=private-provider-payload'), { code: 'ETIMEDOUT' });
    expect(errorMetadata(error)).toEqual({ errorType: 'Error', errorCode: 'ETIMEDOUT' });
    expect(JSON.stringify(errorMetadata(error))).not.toContain('private');
    expect(errorMetadata({ name: 'private-payload', code: 'invalid\ncode' })).toEqual({ errorType: 'Error' });
  });
});
