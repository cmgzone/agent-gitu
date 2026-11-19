import { chromium, type Locator } from 'playwright';
import { mkdirSync } from 'node:fs';
import { UI_HTML } from '../src/server/ui.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

async function verify(condition: () => boolean | Promise<boolean>, message: string) {
  const deadline = Date.now() + 5000;
  while (!(await condition())) {
    if (Date.now() > deadline) throw Error(message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
const valueIs = (input: Locator, value: string) => verify(async () => await input.inputValue() === value, 'Answer draft did not match: ' + value);
const textIs = (element: Locator, text: string) => verify(async () => await element.textContent() === text, 'Expected text: ' + text);

// Exercise the production renderer, binder and endpoint adapter. Only the
// surrounding container and remote server responses are fixtures.
const question = {
  id: 'shared-question', conversationId: 'conversation', agentId: 'researcher', kind: 'question', status: 'open',
  title: 'Which audience should we focus on?', detail: 'The pilot can serve one audience first. Choose a starting point and add any constraints.',
  options: ['Small teams', 'Independent creators', 'Enterprise customers'], createdAt: '2026-10-20T09:00:00Z',
};
const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}
body{padding:24px}.fixture{max-width:680px;margin:0 auto}h1{font-size:20px;margin:0 0 20px}.cw-row{max-width:100%} .cw-bubble{min-width:0;flex:1}
</style></head><body><main class="fixture"><h1 id="fixtureTitle">Cowork · Research pilot</h1><div id="cwMsgs"></div></main><script>
var S={active:'cowork',cw:{active:'conversation',agents:[{id:'researcher',name:'Milo'}],convs:[],requests:[${JSON.stringify(question)}],msgs:[]}};
function $(id){return document.getElementById(id);}function esc(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function toast(message){window.lastToast=message;}async function api(url,options){var response=await fetch(url,options),data=await response.json();if(!response.ok)throw Error(data.error);return data;}
${COWORK_JS}
function renderCowork(){$('cwMsgs').innerHTML=S.cw.requests.map(cwRequestHtml).join('');cwBindRequests($('cwMsgs'));}
cwRenderMsgs=renderCowork;cwRenderInfo=function(){};cwRenderRail=function(){};cwPoll=function(){};
renderCowork();
</script></body></html>`;

mkdirSync('.qa/chat-questions', { recursive: true });
const channel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 900 } });
  const errors: string[] = [], submissions: { path: string; response: string }[] = [];
  let saved: (typeof question & { response?: string }) | undefined;
  let failNext = true, release: (() => void) | undefined;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.endsWith('/requests/' + question.id)) {
      const body = route.request().postDataJSON();
      if (body.action !== 'answer' || !body.response.trim()) throw Error('Invalid answer protocol');
      submissions.push({ path: url.pathname, response: body.response });
      await new Promise<void>(resolve => { release = resolve; });
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: 'Connection interrupted. Please try again.' } }); }
      saved = { ...question, status: 'answered', response: body.response };
      return route.fulfill({ json: { request: saved } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://gitu-questions-fixture.invalid/');
  const input = page.getByRole('textbox', { name: 'Answer: ' + question.title });
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await textIs(page.getByRole('alert'), 'Write an answer or choose a suggestion.');
  if (submissions.length) throw Error('Blank answer was submitted');
  const smallTeamsBtn = page.getByRole('button', { name: 'Small teams', exact: true });
  await smallTeamsBtn.click();
  await verify(async () => await smallTeamsBtn.getAttribute('aria-pressed') === 'true', 'Suggestion chip was not marked selected');
  await valueIs(input, '');
  if (submissions.length) throw Error('Selecting a suggestion sent an answer before review');
  await input.fill('Prioritize Nairobi for the pilot.');
  await input.press('Control+Enter');
  await verify(() => input.isDisabled() && Boolean(release), 'First submission was not pending');
  await page.evaluate(() => (window as any).renderCowork());
  release!();
  await textIs(page.getByRole('alert'), 'Connection interrupted. Please try again.');
  await verify(async () => !(await input.isDisabled()), 'Failed answer stayed disabled after a poll');
  await page.evaluate(() => (window as any).renderCowork());
  await verify(async () => await smallTeamsBtn.getAttribute('aria-pressed') === 'true', 'Selected chip did not survive re-render');
  await valueIs(input, 'Prioritize Nairobi for the pilot.');
  await textIs(page.getByRole('alert'), 'Connection interrupted. Please try again.');
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await verify(() => input.isDisabled(), 'Input stayed enabled during submission');
  await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { cancelable: true })); });
  await verify(() => submissions.length === 2 && Boolean(release), 'Pending request was not received');
  release!();
  await page.getByText('Answered', { exact: true }).waitFor();
  await textIs(page.locator('.chat-question-answer'), 'Your answerSmall teams\nPrioritize Nairobi for the pilot.');
  if (Number(submissions.length) !== 2) throw Error('Duplicate answer submitted while pending');
  if (submissions[1]?.path !== '/api/cowork/requests/' + question.id) throw Error('Wrong Cowork scope');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Question card overflows mobile viewport');
  await page.screenshot({ path: '.qa/chat-questions/cowork-answered-mobile.png', fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Question cards passed: editable choices, validation, failure/retry, duplicate prevention, keyboard submission, receipts and mobile layout.');
} finally {
  await browser.close();
}
