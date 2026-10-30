'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { MAX_BODY_LENGTH, createRateLimiter, persistSupportTicket, processSupportTicket } = require('./support-ticket.cjs');
const STATIC_ROOT = __dirname, PORT = Number(process.env.PORT) || 3000, C = '; charset=utf-8';
const MIME_TYPES = { '.html':'text/html'+C, '.htm':'text/html'+C, '.css':'text/css'+C, '.js':'text/javascript'+C, '.mjs':'text/javascript'+C, '.cjs':'text/javascript'+C, '.json':'application/json'+C, '.map':'application/json'+C, '.txt':'text/plain'+C, '.xml':'application/xml'+C, '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.webmanifest':'application/manifest+json' };
const UNAVAILABLE = { ok:false, code:'temporarily_unavailable', message:'Support is temporarily unavailable. Please try again later.' };
const NOT_FOUND = 'Not found';
function jsonResponse(res, statusCode, payload, extraHeaders = {}) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(statusCode, { 'content-type':'application/json'+C, 'content-length':Buffer.byteLength(body), 'cache-control':'no-store', 'x-content-type-options':'nosniff', ...extraHeaders });
  res.end(body);
}
function textResponse(res, statusCode, text) {
  res.writeHead(statusCode, { 'content-type':'text/plain'+C, 'content-length':Buffer.byteLength(text), 'x-content-type-options':'nosniff' });
  res.end(text);
}
const notFound = (res) => textResponse(res, 404, NOT_FOUND);
// Log stable codes only — never submitted field values.
function logCode(scope, code) {
  try { console.error(`[support] ${scope} code=${code}`); } catch {}
}
function resolveStaticPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (!decoded || decoded === '/') decoded = '/index.html';
  const resolved = path.resolve(STATIC_ROOT, `.${path.posix.normalize(decoded)}`);
  if (resolved !== STATIC_ROOT && !resolved.startsWith(`${STATIC_ROOT}${path.sep}`)) return null;
  return resolved;
}
function serveStatic(req, res) {
  const filePath = resolveStaticPath(req.url || '/');
  if (!filePath) { textResponse(res, 400, 'Bad request'); return; }
  let stats;
  try { stats = fs.statSync(filePath); } catch { notFound(res); return; }
  let target = filePath;
  if (stats.isDirectory()) {
    target = path.join(filePath, 'index.html');
    try { stats = fs.statSync(target); } catch { notFound(res); return; }
  }
  if (!stats.isFile()) { notFound(res); return; }
  const contentType = MIME_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream';
  fs.readFile(target, (error, data) => {
    if (error) { logCode('static', 'read_failed'); notFound(res); return; }
    res.writeHead(200, { 'content-type':contentType, 'content-length':data.length, 'cache-control':contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=300', 'x-content-type-options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}
const readBody = (req, limit) => new Promise((resolve) => {
  let size = 0, tooLarge = false;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) { tooLarge = true; chunks.length = 0; return; }
    if (!tooLarge) chunks.push(chunk);
  });
  req.on('end', () => resolve(tooLarge ? { ok:false, code:'payload_too_large' } : { ok:true, body:Buffer.concat(chunks).toString('utf8') }));
  req.on('error', () => resolve({ ok:false, code:'read_failed' }));
  req.on('aborted', () => resolve({ ok:false, code:'read_failed' }));
});
const clientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
};
async function handleSupportPost(req, res, limiter) {
  const limit = limiter(clientIp(req));
  if (!limit.allowed) {
    jsonResponse(res, 429, { ok:false, code:'rate_limited', message:'Too many support requests. Please try again shortly.' }, { 'retry-after':String(limit.retryAfterSeconds) });
    return;
  }
  const body = await readBody(req, MAX_BODY_LENGTH);
  if (!body.ok) {
    jsonResponse(res, body.code === 'payload_too_large' ? 413 : 400, { ok:false, code:body.code, message: body.code === 'payload_too_large' ? 'Your message is too long. Please shorten it and try again.' : 'Could not read the request body.' });
    return;
  }
  let parsed;
  try { parsed = JSON.parse(body.body || '{}'); }
  catch { logCode('intake', 'invalid_json'); jsonResponse(res, 400, { ok:false, code:'invalid_json', message:'Send the ticket as JSON.' }); return; }
  const decision = processSupportTicket(parsed);
  if (!decision.ok) { logCode('intake', decision.code); jsonResponse(res, decision.status, { ok:false, code:decision.code, message:decision.message }); return; }
  const ticket = decision.ticket;
  let persisted;
  try { persisted = persistSupportTicket(process.env.SUPPORT_TICKET_DIR, ticket); }
  catch { logCode('intake', 'persist_failed'); jsonResponse(res, 503, UNAVAILABLE); return; }
  const notificationUrl = process.env.SUPPORT_NOTIFICATION_URL;
  if (notificationUrl && typeof fetch === 'function') {
    try {
      const request = fetch(notificationUrl, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify(persisted.notification) });
      if (request && typeof request.catch === 'function') request.catch(() => logCode('notify', 'delivery_failed'));
    } catch { logCode('notify', 'delivery_failed'); }
  }
  jsonResponse(res, 200, { ok:true, accepted:true, ticketId:ticket.id, createdAt:ticket.createdAt, status:ticket.status, message:'Thanks — your report reached the Pikpam support team.' });
}
function createSupportServer(options = {}) {
  const rate = Number(process.env.SUPPORT_RATE_LIMIT);
  const limiter = options.limiter || createRateLimiter({ limit: rate > 0 ? rate : 8, windowMs:60_000 });
  const server = http.createServer((req, res) => {
    try {
      const method = (req.method || 'GET').toUpperCase(), urlPath = (req.url || '/').split('?')[0], isRead = method === 'GET' || method === 'HEAD';
      if (urlPath === '/api/support') {
        if (method === 'POST') { handleSupportPost(req, res, limiter).catch(() => { logCode('intake', 'unexpected_failure'); if (!res.headersSent) jsonResponse(res, 503, UNAVAILABLE); }); return; }
        if (isRead) { jsonResponse(res, 200, { ok:true, endpoint:'/api/support', accepts:'POST' }); return; }
        jsonResponse(res, 405, { ok:false, code:'method_not_allowed', message:'Use POST for /api/support.' });
        return;
      }
      if (isRead) { serveStatic(req, res); return; }
      textResponse(res, 405, 'Method not allowed');
    } catch {
      logCode('server', 'unhandled_request_error');
      if (!res.headersSent) textResponse(res, 500, 'Internal server error');
    }
  });
  return server;
}
if (require.main === module) {
  const server = createSupportServer();
  server.listen(PORT, () => console.log(`Pikpam website listening on port ${PORT}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createSupportServer, jsonResponse, logCode, resolveStaticPath, MIME_TYPES, STATIC_ROOT };
