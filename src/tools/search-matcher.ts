import { Worker } from 'node:worker_threads';

interface MatchRequest {
  content: string;
  pattern: string;
  mode: 'literal' | 'regex';
  flags: string;
  maxResults: number;
}
interface Match { start: number; end: number }

// Self-contained so the same worker source runs in Electron, Node and source
// tests without a loader or an extra copied JavaScript asset.
function matchText({ content, pattern, mode, flags, maxResults }: MatchRequest): Match[] {
  const hits: Match[] = [];
  if (mode === 'literal') {
    const needle = flags.includes('i') ? pattern.toLowerCase() : pattern;
    const hay = flags.includes('i') ? content.toLowerCase() : content;
    let at = hay.indexOf(needle);
    while (at >= 0 && hits.length < maxResults) {
      hits.push({ start: at, end: at + needle.length });
      at = hay.indexOf(needle, at + Math.max(1, needle.length));
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
  private pending?: { resolve: (hits: Match[]) => void; reject: (error: Error) => void };
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
            try { parentPort.postMessage({ hits: match(request) }); }
            catch (error) { parentPort.postMessage({ error: error.message }); }
          });
        });
      `, { eval: true });
      this.worker.on('message', (reply: { hits?: Match[]; error?: string }) => {
        const pending = this.pending; this.pending = undefined;
        if (reply.error) pending?.reject(new Error(reply.error));
        else pending?.resolve(reply.hits ?? []);
      });
      this.worker.on('error', error => { void this.close(error); });
      this.worker.on('exit', code => {
        if (this.pending) void this.close(new Error(`Search matcher exited (${code}).`));
      });
    }
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker!.postMessage(request);
    });
  }

  async close(error = new Error('Search matcher closed.')): Promise<void> {
    this.signal?.removeEventListener('abort', this.abort);
    const pending = this.pending; this.pending = undefined;
    pending?.reject(error);
    const worker = this.worker; this.worker = undefined;
    if (worker) await worker.terminate();
  }
}
