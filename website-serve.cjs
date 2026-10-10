/* Minimal dependency-free static file server for the marketing site.
   Usage: node website-serve.cjs [port]   (defaults to 8931, prints the URL) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, 'website');
const port = Number(process.argv[2] || 8931);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.join(root, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!file.startsWith(root)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('forbidden');
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found: ' + rel);
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log('SITE_READY http://127.0.0.1:' + port + '/');
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
