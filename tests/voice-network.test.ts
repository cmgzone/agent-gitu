import type { LookupFunction } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createVoiceLookup } from '../src/voice/network.js';

describe('LiveKit DNS recovery', () => {
  it('preserves a successful system lookup without issuing extra DNS queries', () => {
    const system: LookupFunction = (_hostname, _options, done) => done(null, '192.0.2.1', 4);
    const resolve = vi.fn(), done = vi.fn();
    createVoiceLookup(system, resolve)('agents.livekit.cloud', {}, done);
    expect(done).toHaveBeenCalledWith(null, '192.0.2.1', 4);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('recovers temporary OS lookup failure and respects all-address requests', async () => {
    const system: LookupFunction = (_hostname, _options, done) => done(Object.assign(new Error('DNS temporarily unavailable'), { code: 'EAI_AGAIN' }), '', 0);
    const addresses = [{ address: '192.0.2.1', family: 4 }], resolve = vi.fn().mockResolvedValue(addresses), done = vi.fn();
    createVoiceLookup(system, resolve)('agents.livekit.cloud', { all: true, family: 4 }, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledWith(null, addresses));
    expect(resolve).toHaveBeenCalledWith('agents.livekit.cloud', 4);
  });

  it('does not mask unrelated system failures or retry failed fallback resolution', async () => {
    const error = Object.assign(new Error('No resources'), { code: 'ENOMEM' });
    const system: LookupFunction = (_hostname, _options, done) => done(error, '', 0);
    const resolve = vi.fn(), done = vi.fn();
    createVoiceLookup(system, resolve)('agents.livekit.cloud', {}, done);
    expect(done).toHaveBeenCalledWith(error, '', 0);
    expect(resolve).not.toHaveBeenCalled();
    error.code = 'EAI_AGAIN'; resolve.mockRejectedValueOnce(new Error('Fallback failed'));
    createVoiceLookup(system, resolve)('agents.livekit.cloud', {}, done);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(2));
    expect(resolve).toHaveBeenCalledOnce();
  });
});
