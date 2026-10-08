import { lookup, Resolver } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

const resolver = new Resolver({ timeout: 1500, tries: 2 });
async function resolveAddresses(hostname: string, family?: number): Promise<LookupAddress[]> {
  const requests = [4, 6].filter(value => !family || value === family).map(value => new Promise<LookupAddress[]>((resolve, reject) => {
    const done = (error: NodeJS.ErrnoException | null, addresses: string[]) => error ? reject(error) : resolve(addresses.map(address => ({ address, family: value })));
    if (value === 4) resolver.resolve4(hostname, done); else resolver.resolve6(hostname, done);
  }));
  const results = await Promise.allSettled(requests);
  const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!addresses.length) throw results.find(result => result.status === 'rejected')?.reason ?? new Error('DNS returned no addresses.');
  return addresses;
}

/** Preserve normal OS lookup; recover temporary failures using the same configured DNS servers. */
export function createVoiceLookup(systemLookup: LookupFunction = lookup as LookupFunction, resolve = resolveAddresses): LookupFunction {
  return (hostname, options, callback) => {
    systemLookup(hostname, options, (error, address, family) => {
      if (!error || !['EAI_AGAIN', 'ENOTFOUND'].includes(error.code ?? '')) { callback(error, address, family); return; }
      void resolve(hostname, typeof options.family === 'number' ? options.family : undefined).then(addresses => {
        if (!addresses.length) { callback(error, '', 0); return; }
        if (options.all) callback(null, addresses); else callback(null, addresses[0]!.address, addresses[0]!.family);
      }, () => callback(error, '', 0));
    });
  };
}

let installed = false;
const uploadHosts = new Set<string>();
/** Apply the resilient lookup only to LiveKit hosts, including SDK room/dispatch calls. */
export function installVoiceNetwork(uploadHost?: string): void {
  if (uploadHost) uploadHosts.add(uploadHost);
  if (installed) return;
  const fallback = getGlobalDispatcher();
  const livekit = new Agent({ connect: { lookup: createVoiceLookup(), timeout: 15_000 } });
  class VoiceDispatcher extends Dispatcher {
    override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
      const host = new URL(String(options.origin)).hostname;
      return /(?:^|\.)livekit\.cloud$/i.test(host) || uploadHosts.has(host) ? livekit.dispatch(options, handler) : fallback.dispatch(options, handler);
    }
  }
  setGlobalDispatcher(new VoiceDispatcher());
  installed = true;
}
