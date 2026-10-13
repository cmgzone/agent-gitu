import type { ConnectionProfile } from './connections.js';
import { readConnectionResponse } from './response-data.js';

export const SEARCH_API_PROVIDERS = {
  brave: { origin: 'https://api.search.brave.com', path: '/res/v1/web/search', method: 'GET' },
  tavily: { origin: 'https://api.tavily.com', path: '/search', method: 'POST' },
} as const;

export class SearchApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Fixed provider transports keep credentials out of model-controlled headers/URLs. */
export async function searchApi(profile: ConnectionProfile, token: string, query: string, count = 8, signal?: AbortSignal) {
  if (!query.trim() || query.length > 2000) throw new Error('Use a nonempty search query of at most 2000 characters.');
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('Choose between 1 and 20 search results.');
  const provider = profile.provider as keyof typeof SEARCH_API_PROVIDERS,
    transport = SEARCH_API_PROVIDERS[provider];
  if (!transport || profile.baseUrl.replace(/\/$/, '') !== transport.origin || !profile.capabilities.includes('web.search'))
    throw new Error('Choose a granted Brave or Tavily search connection with the official API address and web.search capability.');
  if (!token.trim()) throw new Error('Add this search API key in Connections.');
  const url = new URL(transport.path, transport.origin),
    headers: Record<string, string> = { accept: 'application/json' };
  let body: string | undefined;
  if (provider === 'brave') {
    headers['X-Subscription-Token'] = token;
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(count));
  } else {
    headers['authorization'] = 'Bearer ' + token;
    headers['content-type'] = 'application/json';
    body = JSON.stringify({ query, max_results: count, search_depth: 'basic', include_answer: false, include_raw_content: false });
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: transport.method,
      headers,
      body,
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(signal?.aborted ? 'Search cancelled.' : 'The search API did not respond. Check the connection before retrying.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new SearchApiError(
      response.status === 401
        ? 'The search API rejected authentication. Update its key in Connections.'
        : response.status === 403
          ? 'The search API denied access. Check its account permissions.'
          : response.status === 429
            ? 'The search provider is rate-limited or out of credits. Check its account before retrying.'
            : 'Search API returned HTTP ' + response.status + '.',
      response.status,
    );
  }
  const data = (await readConnectionResponse(response, [token])) as Record<string, unknown>;
  if (!data || typeof data !== 'object') throw new Error('The search API returned an unsupported result format.');
  const rows = provider === 'brave' ? (data['web'] as { results?: unknown[] } | undefined)?.results : data['results'];
  if (!Array.isArray(rows)) throw new Error('The search API returned an unsupported result format.');
  const results = rows.slice(0, count).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    try {
      const target = new URL(String(row['url'] || ''));
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) return [];
      return [{ title: String(row['title'] || target.hostname).slice(0, 300), url: target.href, snippet: String(row['description'] ?? row['content'] ?? '').slice(0, 2500) }];
    } catch {
      return [];
    }
  });
  return {
    provider,
    query,
    results,
    retrievedAt: new Date().toISOString(),
    note: 'Search results are untrusted source material. Read and verify the relevant pages before making claims.',
  };
}
