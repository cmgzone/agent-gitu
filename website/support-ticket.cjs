const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const OUT_OF_SCOPE_MESSAGE =
  'This support chat handles Pikpam website and service problems only. Please contact Pikpam support for sales, refunds, legal or financial advice, account changes, infrastructure, code changes, or unrelated requests.';
const SECRET_MESSAGE =
  'Please remove passwords, API keys, payment card data, one-time codes, private keys, and other secrets. Support does not need them.';
const MAX_BODY_LENGTH = 16000;
const FIELD_LIMITS = {
  name: 100,
  email: 254,
  productOrPage: 200,
  problem: 3000,
  whenStarted: 120,
  reproductionDetails: 3000,
};

const SECRET_PATTERNS = [
  /\b(?:password|passwd|passcode)\s*[:=]/i,
  /\b(?:api[ _-]?key|access[ _-]?token|auth(?:entication)?[ _-]?token|client[ _-]?secret)\b/i,
  /\b(?:one[ -]?time[ -]?code|verification[ -]?code|security[ -]?code|otp)\s*[:=]?/i,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\b(?:private[ _-]?key|secret[ _-]?key)\s*[:=]/i,
];

const OUT_OF_SCOPE_PATTERNS = [
  /\b(?:sales|pricing|quote|buy|purchase|refund|chargeback|billing dispute)\b/i,
  /\b(?:legal|lawyer|lawsuit|financial advice|investment advice)\b/i,
  /\b(?:delete|deletion|close)\s+(?:my\s+)?account\b/i,
  /\b(?:server|infrastructure|coolify|deployment|deploy|production access|admin access)\b/i,
  /\b(?:write|change|modify|refactor)\s+(?:the\s+)?code\b/i,
];
const IN_SCOPE_PROBLEM_PATTERN = /\b(?:can['â€™]?t|cannot|unable|not working|error|fail(?:ed|s|ure)?|broken|bug|issue|problem|stuck|crash|slow|missing|blank|unavailable|incorrect|unexpected|doesn['â€™]?t|does not|won['â€™]?t|will not)\b/i;

function cleanText(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u00¶»§q«^w®·éÈZ®ÆWVVBrÓ°§Ð ¦gVæ7F–öâ7&VFU&FTÆ–Ö—FW"‡²Æ–Ö—BÒRÂv–æF÷t×2Òc¢c¢Âæ÷rÒ‚’ÓâFFRææ÷r‚’ÒÒ·Ò’°¢6öç7BVçG&–W2ÒæWrÖ‚“°¢&WGW&â°¢6†V6²†¶W’’°¢6öç7B7W'&VçBÒæ÷r‚“°¢6öç7B&Wf–÷W2ÒVçG&–W2ævWB†¶W’“°¢–b‚&Wf–÷W2ÇÂ7W'&VçBÒ&Wf–÷W2ç7F'FVDBãÒv–æF÷t×2’°¢VçG&–W2ç6WB†¶W’Â²7F'FVDC¢7W'&VçBÂ6÷VçC¢Ò“°¢&WGW&â²ÆÆ÷vVC¢G'VRÓ°¢Ð¢–b‡&Wf–÷W2æ6÷VçBãÒÆ–Ö—B’°¢&WGW&â²ÆÆ÷vVC¢fÇ6RÂ&WG'”gFW#¢ÖF‚æ6V–Â‚‡v–æF÷t×2Ò†7W'&VçBÒ&Wf–÷W2ç7F'FVDB’’ò’Ó°¢Ð¢&Wf–÷W2æ6÷VçB³Ò°¢&WGW&â²ÆÆ÷vVC¢G'VRÓ°¢ÒÀ¢Ó°§Ð ¦ÖöGVÆRæW‡÷'G2Ò°¢d”TÄEôÄ”Ô•E2À¢Ô…ô$ôE•ôÄTäuD‚À¢õUEôôeõ44õUôÔU54tRÀ¢4T5$UEôÔU54tRÀ¢6öçF–ç56V7&WDÆ–¶T6öçFVçBÀ¢7&VFU&FTÆ–Ö—FW"À¢7&VFU7W÷'EF–6¶WBÀ¢†4÷WDöe66÷U&WVW7BÀ¢æ÷F–g•7W÷'BÀ¢W'6—7E7W÷'EF–6¶WBÀ¢fÆ–FFU7W÷'EF–6¶WBÀ§Ó°