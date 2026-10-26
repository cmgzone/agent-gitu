const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  MAX_BODY_LENGTH,
  createRateLimiter,
  createSupportTicket,
  notifySupport,
  persistSupportTicket,
  validateSupportTicket,
} = require('./support-ticket.cjs');

const root = __dirname;
const rateLimiter = createRateLimiter();

function jsonResponse(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function clientKey(request) {
  return request.socket.remoteAddress || 'unknown';
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_LENGTH) {
        const error = new Error('Request too large.');
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        const error = new Error('Invalid JSON.');
        error.code = 'INVALID_JSON';
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function handleSupportSubmission(input, options = {}) {
  const validation = validateSupportTicket(input);
  if (!validation.ok) return { status: validation.status, body: { ok: false, code: validation.code, message: validation.message } };
  const ticket = createSupportTicket(validation.value, options.now);
  await (options.persist || persistSupportTicket)(ticket, options);
  await (opti¶»§q«^w{ÙÈZ®ÆBÓÓÒuD4‚rÇÂ&WVW7BæÖWF†öBÓÓÒtDTÄUDRr’°¢§6öå&W7öç6R‡&W7öç6RÂCRÂ²ö³¢fÇ6RÂÖW76vS¢uF†—2VæGö–çBöæÇ’66WG27W÷'B&ö&ÆVÒ7V&Ö—76–öç2ârÒÂ²ÆÆ÷s¢ttUBÂ„TBrÒ“°¢&WGW&ã°¢Ğ¢v—B6W'fU7FF–2‡&WVW7BÂ&W7öç6R“°¢Ò6F6‚†W'&÷"’°¢6öç6öÆRæW'&÷"‚u7W÷'B&WVW7Bf–ÆVBrÂ²6öFS¢W'&÷"æ6öFRÇÂuTä´äõtârÒ“°¢6öç7BVæf–Æ&ÆRÒW'&÷"æ6öFRÓÓÒtäõD”d”4D”ôåôäõEô4ôäd”uU$TBrÇÂW'&÷"æ6öFRÓÓÒtäõD”d”4D”ôåôd”ÄTBs°¢§6öå&W7öç6R‡&W7öç6RÂVæf–Æ&ÆRòS2¢SÂ²ö³¢fÇ6RÂ6öFS¢W'&÷"æ6öFRÇÂu5Uõ%EõTäd”Ä$ÄRrÂÖW76vS¢u7W÷'B—2FV×÷&&–Ç’Væf–Æ&ÆRâÆV6RG'’v–âÆFW"ârÒ“°¢Ğ§Ò“° ¦–b‡&WV—&RæÖ–âÓÓÒÖöGVÆR’°¢6öç7B÷'BÒçVÖ&W"‡&ö6W72æVçbåõ%BÇÂ3“°¢6W'fW"æÆ—7FVâ‡÷'BÂsãããrÂ‚’Óâ6öç6öÆRæÆör†–·ÒvV'6—FRÆ—7FVæ–æröâ÷'BG·÷'GÖ’“°§Ğ ¦ÖöGVÆRæW‡÷'G2Ò²†æFÆU7W÷'E7V&Ö—76–öâÂ&VD§6öâÂ6W'fW"Ó° 