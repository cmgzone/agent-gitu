// Same-origin static preview of the native React screens using fictional data.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('apps/android/dist-web');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const proxy = http.request({ hostname: '127.0.0.1', port: 8423, path: req.url, method: req.method, headers: req.headers }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
    proxy.on('error', () => { res.writeHead(503); res.end('Fixture unavailable'); }); req.pipe(proxy); return;
  }
  try {
    const requested = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : decodeURIComponent(requested)));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid file');
    const bytes = readFileSync(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(8443, '127.0.0.1', () => console.log('Native phone preview at http://127.0.0.1:8443'));
