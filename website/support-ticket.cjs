'use strict';
const { randomUUID: uuid } = require('node:crypto');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const MAX_BODY_LENGTH = 16000, MIN_PROBLEM_LENGTH = 10;
const FIELD_LIMITS = { name:120, email:254, productOrPage:160, problem:2000, whenStarted:120, reproductionDetails:4000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
// Alternations grouped by flag only; every original pattern is verbatim.
const SECRET_PATTERNS = [
  /-----BEGIN[A-Z ]*PRIVATE KEY[A-Z ]*-----|\b(?:password|passwd|pwd|passphrase|api[\s_-]?key|secret[\s_-]?key|client[\s_-]?secret|access[\s_-]?token|auth[\s_-]?token)\b\s*(?:is|:|=|->)?\s*\S{4,}|\bBearer\s+[\w.\-]{12,}|\b(?:otp|2fa|verification code|one[\s-]?time(?: password| code)?)\b\s*(?:is|:|=)?\s*\d{4,8}\b/i,
  /\bsk-(?:live|test)?-?[A-Za-z0-9]{12,}\b|\bgh[pousr]_[A-Za-z0-9]{12,}\b|\bAKIA[0-9A-Z]{16}\b|\beyJ[\w-]{10,}\.[\w-]{10,}\./,
];
const OUT_OF_SCOPE_PATTERNS = [
  /\b(?:refund|chargeback|money back|billing dispute|invoice dispute)\b|\b(?:pricing|price list|discount|quotation|quote for|cost of the (?:plan|license)|sales pitch|partnership|sponsorship)\b|\b(?:seo services|link building|guest post|backlink|lead generation|outsourcing)\b|\b(?:lawsuit|legal action|attorney|subpoena|copyright claim|dmca|gdpr request)\b|\b(?:delete (?:my|our|the) account|account deletion|remove my data|data deletion)\b|\b(?:kubernetes|terraform|docker|infrastructure|dns (?:record|config)|server (?:setup|provision)|ci\/cd pipeline|deployment pipeline)\b|\b(?:change (?:the|your) code|patch (?:the|your) code|source code|code review|refactor|pull request|commit access)\b|\b(?:bitcoin|crypto(?:currency)?|ethereum|nft|forex|trading signals?)\b|\b(?:casino|gambling|betting|sportsbook|lottery)\b/i,
];
const OUT_OF_SCOPE_MESSAGE = 'This form only handles problems with the Pikpam website or services. Sales, pricing, billing/refunds, legal, account deletion, infrastructure and code-change requests are handled elsewhere.';
const UNAVAILABLE = { ok:false, status:503, code:'temporarily_unavailable', message:'Support is temporarily unavailable. Please try again later.' };
const sanitizeField = (v, limit) => {
  let t = typeof v === 'string' ? v : v == null ? '' : String(v);
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limit ? t.slice(0, limit).trim() : t;
};
const failure = (code, message) => ({ ok:false, code, message });
const addr = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
const containsSecret = (t) => !!t && SECRET_PATTERNS.some((p) => p.test(t));
const isOutOfScope = (t) => !!t && OUT_OF_SCOPE_PATTERNS.some((p) => p.test(t));
const buildTicket = (f) => {
  const p = f.productOrPage;
  return { id:`SUP-${uuid()}`, createdAt:new Date().toISOString(), name:f.name, email:f.email, productOrPage:p, product:p, page:p, problem:f.problem, whenStarted:f.whenStarted, reproductionDetails:f.reproductionDetails, status:'open', source:'website-widget', version:1 };
};
const validateSupportTicket = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('invalid_request', 'Send the support request as a JSON object.');
  const f = {};
  for (const [k, n] of Object.entries(FIELD_LIMITS)) f[k] = sanitizeField(input[k], n);
  const scanned = [f.productOrPage, f.problem, f.whenStarted, f.reproductionDetails].join('\n');
  if (containsSecret(scanned) || containsSecret(f.name)) return failure('secret_detected', 'Your message looks like it contains a password, key or token. Remove it and describe only the problem.');
  if (isOutOfScope(scanned)) return failure('out_of_scope', OUT_OF_SCOPE_MESSAGE);
  if (f.name.length < 2) return failure('invalid_name', 'Please enter your name.');
  if (!EMAIL_RE.test(f.email)) return failure('invalid_email', 'Please enter a valid email address.');
  if (!f.productOrPage) return failure('invalid_product', 'Tell us which Pikpam product or page is affected.');
  if (f.problem.length < MIN_PROBLEM_LENGTH) return failure('invalid_problem', `Describe the problem in at least ${MIN_PROBLEM_LENGTH} characters.`);
  return { ok:true, ticket:buildTicket(f) };
};
const createSupportTicket = (input) => {
  const r = validateSupportTicket(input);
  if (r.ok) return r.ticket;
  const e = new Error(r.message);
  e.code = r.code; throw e;
};
const notifySupport = (ticket, email) => {
  const to = addr(email);
  if (!to) { const e = new Error('SUPPORT_NOTIFICATION_EMAIL is not configured'); e.code = 'temporarily_unavailable'; throw e; }
  const t = ticket && typeof ticket === 'object' ? ticket : {};
  const summary = { name:'', email:'', productOrPage:'', problem:'', whenStarted:'', reproductionDetails:'', status:'open' };
  for (const k of Object.keys(summary)) summary[k] = t[k] || summary[k];
  return { event:'support.ticket.created', to, ticketId:t.id || null, createdAt:t.createdAt || new Date().toISOString(), subject:`[Pikpam support] ${t.product || t.productOrPage || 'website'}`, summary };
};
const persistSupportTicket = (dir, ticket) => {
  if (!ticket || typeof ticket !== 'object') throw new TypeError('persistSupportTicket requires a ticket object');
  const targetDir = typeof dir === 'string' && dir.trim() ? path.resolve(dir.trim()) : path.join(os.tmpdir(), 'pikpam-support-tickets');
  const ticketsPath = path.join(targetDir, 'tickets.jsonl'), notificationsPath = path.join(targetDir, 'notifications.jsonl');
  fs.mkdirSync(targetDir, { recursive:true });
  fs.appendFileSync(ticketsPath, `${JSON.stringify(ticket)}\n`);
  let notification;
  try { notification = notifySupport(ticket, process.env.SUPPORT_NOTIFICATION_EMAIL); }
  catch { notification = { event:'support.ticket.created', to:null, ticketId:ticket.id || null, createdAt:ticket.createdAt || new Date().toISOString(), delivered:false }; }
  fs.appendFileSync(notificationsPath, `${JSON.stringify(notification)}\n`);
  return { dir:targetDir, ticketsPath, notificationsPath, notification };
};
const processSupportTicket = (input, options = {}) => {
  const email = options.notificationEmail !== undefined ? options.notificationEmail : process.env.SUPPORT_NOTIFICATION_EMAIL;
  const to = addr(email);
  if (!to) return { ...UNAVAILABLE };
  const r = validateSupportTicket(input);
  if (!r.ok) return { ok:false, status:400, code:r.code, message:r.message };
  return { ok:true, status:200, ticket:r.ticket, notificationEmail:to };
};
const createRateLimiter = (o = {}) => {
  const limit = num(o.limit, 8), windowMs = num(o.windowMs, 60_000), hits = new Map();
  return (key) => {
    const now = Date.now(), k = typeof key === 'string' && key ? key : 'unknown', recent = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) { const oldest = recent[0] || now; hits.set(k, recent); return { allowed:false, retryAfterSeconds:Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)), remaining:0 }; }
    recent.push(now); hits.set(k, recent);
    if (hits.size > 5000) for (const [e, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(e);
    return { allowed:true, retryAfterSeconds:0, remaining:limit - recent.length };
  };
};
module.exports = { MAX_BODY_LENGTH, FIELD_LIMITS, MIN_PROBLEM_LENGTH, createRateLimiter, createSupportTicket, notifySupport, persistSupportTicket, processSupportTicket, validateSupportTicket };
