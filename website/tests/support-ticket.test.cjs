const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createRateLimiter,
  handleSupportSubmission,
} = (() => {
  const ticket = require('../support-ticket.cjs');
  const server = require('../support-server.cjs');
  return { ...ticket, handleSupportSubmission: server.handleSupportSubmission };
})();

const validInput = {
  requestType: 'website-problem',
  name: 'Ari Visitor',
  email: 'ari@example.com',
  productOrPage: 'Download page',
  problem: 'The download page shows a broken link after I select the Windows build.',
  whenStarted: 'This morning',
  reproductionDetails: 'Open the download page, select the Windows build, and observe the link.',
  consent: true,
};

test('accepts an in-scope customer problem, persists it, and queues notification', async () => {
  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'pikpam-support-'));
  const result = await handleSupportSubmission(validInput, {
    ticketDirectory: directory,
    notificationEmail: 'support@example.com',
    now: new Date('2026-10-26T12:00:00.000Z'),
  });
  assert.equal(result.status, 201);
  assert.match(result.body.ticketId, /^PK-/);
  const tickets = fs.readFileSync(path.join(directory, 'tickets.jsonl'), 'utf8');
  const notifications = fs.readFileSync(path.join(directory, 'notifications.jsonl'), 'utf8');
  assert.match(tickets, /Download page/);
  assert.match(notifications, /support@example.com/);
  assert.doesNotMatch(tickets, /password|api[_ -]?key|private key/i);
});

test('refuses out-of-scope requests', async () => {
  const result = await handleSupportSubmission({
    ...validInput,
    problem:¶»§q«^w^xÑÈZ®Ã"“°¢76W'BæWVÂ‡&W7VÇBæ&öG’æ6öFRÂu4T5$UEô4ôåDTåBr“°§Ò“° §FW7B‚wfÆ–FFW2&WV—&VBFWF–Ç2æB6öç6VçBrÂ7–æ2‚’Óâ°¢6öç7B&W7VÇBÒv—B†æFÆU7W÷'E7V&Ö—76–öâ‡°¢ââçfÆ–D–çWBÀ¢VÖ–Ã¢væ÷BÖâÖVÖ–ÂrÀ¢6öç6VçC¢fÇ6RÀ¢ÒÂ°¢F–6¶WDF—&V7F÷'“¢v—Bg5&öÖ—6W2æÖ¶GFV×‡F‚æ¦ö–â†÷2çF×F—"‚’Âw–·Ò×7W÷'BÒr’’À¢æ÷F–f–6F–öäVÖ–Ã¢w7W÷'DW†×ÆRæ6öÒrÀ¢Ò“°¢76W'BæWVÂ‡&W7VÇBç7FGW2ÂC“°¢76W'BæWVÂ‡&W7VÇBæ&öG’æ6öFRÂt”ådÄ”EôTÔ”Âr“°§Ò“° §FW7B‚w&FRÆ–Ö—FW"&Æö6·2&WVFVB7V&Ö—76–öç2v—F†÷WB–ç7V7F–ær6öçFVçBrÂ‚’Óâ°¢ÆWBæ÷rÒ°¢6öç7BÆ–Ö—FW"Ò7&VFU&FTÆ–Ö—FW"‡²Æ–Ö—C¢"Âv–æF÷t×3¢Âæ÷s¢‚’Óâæ÷rÒ“°¢76W'BæWVÂ†Æ–Ö—FW"æ6†V6²‚v6Æ–VçBr’æÆÆ÷vVBÂG'VR“°¢76W'BæWVÂ†Æ–Ö—FW"æ6†V6²‚v6Æ–VçBr’æÆÆ÷vVBÂG'VR“°¢76W'BæWVÂ†Æ–Ö—FW"æ6†V6²‚v6Æ–VçBr’æÆÆ÷vVBÂfÇ6R“°¢æ÷rÒ°¢76W'BæWVÂ†Æ–Ö—FW"æ6†V6²‚v6Æ–VçBr’æÆÆ÷vVBÂG'VR“°§Ò“°