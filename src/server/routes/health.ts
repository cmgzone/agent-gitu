import type { IncomingMessage, ServerResponse } from 'node:http';

/** Public liveness probe: intentionally excludes configuration and account data. */
export function healthRoute(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (path !== '/healthz') return false;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed.' }));
    return true;
  }
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  return true;
}
