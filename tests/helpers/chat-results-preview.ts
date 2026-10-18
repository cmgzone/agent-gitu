/** Isolated, synthetic chat results for visual and interaction checks. */
import { createServer } from 'node:http';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../../src/server/ui.js';
import { OUTPUT_JS } from '../../src/server/ui-outputs.js';
import { COWORK_JS } from '../../src/server/ui-cowork.js';

const context = createContext({
  S: { cw: { agents: [], convs: [], widgets: [] } },
  window: { addEventListener() {}, location: { href: 'http://localhost/' } },
  document: { addEventListener() {}, querySelectorAll: () => [] },
  $: () => null, URL,
  esc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!),
});
new Script(OUTPUT_JS + '\n' + COWORK_JS).runInContext(context);
context.cwAva = () => '';
const samples = [
  ['ui', {
    title: 'A clear view of the launch', tone: 'teal', density: 'comfortable',
    blocks: [
      { type: 'metrics', items: [{ label: 'Copy reviewed', value: '8 / 10', detail: 'Two pages to go' }, { label: 'Checks passed', value: '18', detail: 'Latest review', tone: 'green' }] },
      { type: 'progress', label: 'Pages reviewed', value: 8, max: 10 },
      { type: 'callout', title: 'Your call', tone: 'amber', text: 'The team is waiting for your preferred headline.' },
    ],
    actions: [{ label: 'Compare the headlines', prompt: 'Compare the two launch headline options from this briefing and help me choose.' }],
  }],
  ['email', {
    title: 'Inbox, Oct 11 to 18', tone: 'blue',
    messages: [
      { sender: 'Amina Otieno', from: 'amina@example.test', subject: 'A final look before we launch', summary: 'The revised homepage is ready. Could you review the headline and share your feedback before Friday?', section: 'Needs you', date: '2026-10-18T08:10:00Z', unread: true, nextStep: 'Review the headline and send Amina your feedback.', url: 'https://mail.example.test/message/launch' },
      { sender: 'Daniel Kimani', subject: 'Your weekly numbers are in', summary: 'Signups, active users, and the latest support trends are ready to read.', section: 'Updates', date: '2026-10-18T07:30:00Z', unread: true, url: 'https://mail.example.test/message/report' },
    ],
    actions: [{ label: 'Draft a reply', prompt: 'Draft a reply to Amina about her launch headline review request. Show me the draft before sending anything.' }, { label: 'Ask to save as panel', prompt: 'Create a persistent inbox briefing panel from the emails in this result.' }],
  }],
  ['ui', {
    title: 'Two ways to tell the story', tone: 'violet', layout: 'comparison',
    blocks: [
      { type: 'section', title: 'Straight to the point', blocks: [{ type: 'quote', text: 'Your work, moving forward.' }, { type: 'text', text: 'Clear and practical. A good fit for people who want to get started quickly.' }] },
      { type: 'section', title: 'A little more feeling', blocks: [{ type: 'quote', text: 'Room for your next big idea.' }, { type: 'text', text: 'Warm and open. A good fit for introducing a more creative workspace.' }] },
    ],
    actions: [{ label: 'Explore another direction', prompt: 'Suggest another launch headline direction, using the two options above as context.' }],
  }],
  ['ui', {
    title: 'What happens next', tone: '#d8a39a', heading: 'sans',
    blocks: [{ type: 'timeline', items: [
      { time: 'First', text: 'Choose a headline', detail: 'Make the positioning decision before finalising the copy.' },
      { time: 'Then', text: 'Finish the two remaining pages', detail: 'Use the chosen direction consistently.' },
      { time: 'Last', text: 'Schedule the launch review', detail: 'Ask the team for a time once the pages are ready.' },
    ] }],
    actions: [{ label: 'Help me plan this', prompt: 'Turn the steps from this launch timeline into a practical plan. Ask me for dates where they are missing.' }],
  }],
  ['brief', {
    title: 'The launch, at a glance', tone: 'neutral', summary: 'The content is ready for your review. One decision will unblock the next step.',
    highlights: [{ label: 'Ready to review', text: 'The homepage copy and weekly report are available.' }, { label: 'One open decision', text: 'Choose the headline before the team schedules the launch.' }],
    nextStep: 'Start with Amina’s email, then share a preferred headline.',
  }],
  ['tasks', {
    title: 'A little plan for today', tone: 'green', items: [
      { text: 'Read the inbox briefing', status: 'done' },
      { text: 'Review the launch headline', status: 'in_progress', detail: 'Compare the revised headline with the launch brief and note your preferred version.' },
      { text: 'Send feedback to Amina', status: 'pending', due: 'Friday' },
    ],
  }],
  ['files', [{ name: 'Weekly overview.pdf', url: '/example-report.pdf', mime: 'application/pdf', size: 184320 }, { name: 'Launch copy.docx', url: '/example-copy.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 32768 }]],
  ['links', [{ title: 'Launch workspace', url: 'https://example.test/launch', description: 'The shared brief, decisions, and release checklist.' }]],
] as const;
const styles = UI_HTML.slice(UI_HTML.indexOf('<style>') + 7, UI_HTML.indexOf('</style>'));
const cards = samples.map(([kind, payload], i) => {
  const message = '```output ' + kind + '\n' + JSON.stringify(payload) + '\n```';
  return context.cwReplyHtml({ name: 'Aster' }, '09:' + (20 + i), context.cwBody(message, [], false), '');
}).join('');
const server = createServer((request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const theme = request.url?.includes('dark') ? 'dark' : 'light';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html data-theme="' + theme + '"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Adaptive chat preview</title><style>' + styles + '\nhtml,body{height:100%;overflow:hidden}#cw.cw{display:block;position:relative;height:100dvh;overflow:hidden;background:var(--cw-chat-surface);background-repeat:no-repeat}.preview-scroll{position:relative;height:100%;overflow:auto;scrollbar-width:none}.preview-scroll::-webkit-scrollbar{display:none}.preview-chat{max-width:668px;margin:auto;padding:36px 24px 180px}.preview-chat h1{font-size:25px;line-height:1.3;letter-spacing:-.04em;font-weight:500;margin:0 0 8px}.preview-intro{font-size:12px;color:var(--muted);margin:0 0 26px}.preview-chat .cw-row{margin:0 0 24px;width:100%;max-width:100%}.preview-chat .cw-bubble{width:100%}.preview-compose{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:620px;padding:10px 16px;border-radius:24px;background:color-mix(in srgb,var(--card) 76%,transparent);backdrop-filter:blur(20px)}.preview-compose label{display:block;font-size:10px;color:var(--muted);margin-bottom:4px}.preview-compose textarea{display:block;width:100%;min-height:50px;max-height:100px;resize:vertical;background:none;border:0;outline:0;color:var(--text);font:inherit;font-size:13px}.preview-compose textarea:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:6px}@media(max-width:420px){.preview-chat{padding:24px 12px 180px}}</style></head><body><main id="cw" class="cw"><div class="preview-scroll"><div class="preview-chat"><h1>A little more visual.</h1><p class="preview-intro">Different content, different layouts. One quiet conversation.</p>' + cards + '</div></div><div class="preview-compose"><label for="cwInput">Prepared message · local preview</label><textarea id="cwInput" placeholder="Choose an action above to prepare a request…"></textarea></div></main><script>' + OUTPUT_JS + '</script></body></html>');
});
server.listen(Number(process.env['CHAT_RESULTS_PREVIEW_PORT'] || 0), '127.0.0.1', () => console.log('Chat result preview: http://127.0.0.1:' + (server.address() as { port: number }).port));
