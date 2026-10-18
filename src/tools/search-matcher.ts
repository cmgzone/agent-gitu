import { Worker } from 'node:worker_threads';

interface MatchRequest {
  content: string;
  pattern: string;
  mode: 'literal' | 'regex';
  flags: string;
  maxResults: number;
  /** Correlates a reply with the caller that made it. */
  id?: number;
}
interface Match { start: number; end: number }

// Self-contained so the same worker source runs in Electron, Node and source
// tests without a loader or an extra copied JavaScript asset.
function matchText({ content, pattern, mode, flags, maxResults }: MatchRequest): Match[] {
  const hits: Match[] = [];
  if (mode === 'literal') {
    const caseInsensitive = flags.includes('i');
    const haystack = caseInsensitive ? content.toLowerCase() : content;
    const needle = caseInsensitive ? pattern.toLowerCase() : pattern;
    // Lowercasing is NOT length-preserving for every Unicode input (e.g.
    // U+0130 expands to two units), so offsets found in the lowercased text
    // must be mapped back to original indices or the reported lines and
    // excerpts shift after the first expansion.
    let map: number[] | undefined;
    if (caseInsensitive && needle.length > 0 && haystack.length !== content.length) {
      map = [];
      for (let i = 0; i < content.length; i++) {
        const lowered = (content[i] ?? '').toLowerCase();
        for (let part = 0; part < lowered.length; part++) map.push(i);
      }
    }
    let at = haystack.indexOf(needle);
    while (at >= 0 && hits.length < maxResults) {
      // The map covers every lowered index, so lookups below cannot miss.
      const start = map ? map[at] ?? at : at;
      const end = needle.length === 0 ? start : map ? (map[at + needle.length - 1] ?? at) + 1 : start + needle.length;
      hits.push({ start, end });
      at = haystack.indexOf(needle, at + Math.max(1, needle.length));
    }
  } else {
    const re = new RegExp(pattern, flags + 'g');
    let match: RegExpExecArray | null;
    while (hits.length < maxResults && (match = re.exec(content)) !== null) {
      hits.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  return hits;
}

/** One matcher per search; terminating it makes even pathological regex cancellable. */
export class SearchMatcher {
  private worker?: Worker;
  private sequence = 0;
  private readonly pending = new Map<number, { resolve: (hits: Match[]) => void; reject: (error: Error) => void }>();
  private readonly abort = (): void => { void this.close(new Error('search_files: cancelled.')); };

  constructor(private readonly signal?: AbortSignal) {
    signal?.addEventListener('abort', this.abort, { once: true });
  }

  match(request: MatchRequest): Promise<Match[]> {
    if (this.signal?.aborted) return Promise.reject(new Error('search_files: cancelled.'));
    if (!this.worker) {
      this.worker = new Worker(`
        // Dynamic import works in both CommonJS and module-mode workers.
        // Eval workers inherit the host's --input-type setting.
        import('node:worker_threads').then(({ parentPort }) => {
          const match = (${matchText.toString()});
          parentPort.on('message', request => {
            try { parentPort.postMessage({ hits: match(request), id: request.id }); }
            catch (error) { parentPort.postMessage({ error: error.message, id: request.id }); }
          });
        });
      `, { eval: true });
      this.worker.on('message', (reply: { hits?: Match[]; error?: string; id?: number }) => {
        // Reply ids settle the exact caller: with a single pending slot, any
        // concurrent match() call overwrote an earlier one whose promise
        // then never settled (undefined resolve/reject references).
        const id = reply.id;
        if (id === undefined) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (reply.error) pending.reject(new Error(reply.error));
        else pending.resolve(reply.hits ?? []);
      });
      this.worker.on('error', error => { void this.close(error); });
      this.worker.on('exit', code => {
        if (this.pending.size) void this.close(new Error(`Search matcher exited (${code}).`));
      });
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ ...request, id });
    });
  }

  async close(error = new Error('Search matcher closed.')): Promise<void> {
    this.signal?.removeEventListener('abort', this.abort);
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const item of pending) item.reject(error);
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
