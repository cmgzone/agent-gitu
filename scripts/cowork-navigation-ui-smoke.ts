import { createContext, Script } from 'node:vm';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COWORK_DASHBOARD_JS } from '../src/server/ui-cowork-dashboard.js';
import { UI_HTML } from '../src/server/ui.js';
import { CHARACTERS_DIR, CHARACTER_FILES, FONTS_DIR, FONT_FILES } from '../src/server/static-assets.js';

// Capture the production renderer's HTML before unrelated chat controls bind.
let chatHtml = '';
const captured = new Error('Markup captured');
const chat = { getAttribute: () => null, setAttribute: () => {}, set innerHTML(value: string) { chatHtml = value; throw captured; } };
const context = createContext({
  S: { active: 'cowork', cw: { active: 'conversation', threadId: null,
    agents: [{ id: 'ari', name: 'Ari', avatar: { shape: 'dot-blue', color: '#5ba8ff' } }],
    convs: [{ id: 'conversation', kind: 'dm', title: 'Ari', memberIds: ['ari'] }], msgs: [], requests: [], missions: [], pendingFiles: [] } },
  $: (id: string) => id === 'cwChat' ? chat : null,
  esc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!),
  window: { addEventListener: () => {} }, document: { addEventListener: () => {}, body: { classList: { contains: () => true } } },
});
new Script(COWORK_JS + COWORK_DASHBOARD_JS).runInContext(context);
context.cwApplyCharacterTheme = () => {};
context.cwDisposeSubagentOrbs = () => {};
try { context.cwRenderChat(); } catch (error) { if (error !== captured) throw error; }
if (!chatHtml) throw Error('Cowork chat renderer did not produce markup');
const profileHtml = context.cwPageNavHtml('profile', context.S.cw.agents[0]);
const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
mkdirSync('.qa/cowork-companies', { recursive: true });
const channel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => {
    const pathname = new URL(route.request().url()).pathname, filename = path.basename(pathname);
    if (pathname.startsWith('/characters/') && CHARACTER_FILES[filename]) return route.fulfill({ contentType: CHARACTER_FILES[filename], body: readFileSync(path.join(CHARACTERS_DIR, filename)) });
    if (pathname.startsWith('/fonts/') && FONT_FILES[filename]) return route.fulfill({ contentType: FONT_FILES[filename], body: readFileSync(path.join(FONTS_DIR, filename)) });
    return route.fulfill({ status: 204 });
  });
  for (const width of [1360, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [name, markup] of [['chat', chatHtml], ['profile', profileHtml]]) {
      await page.setContent('<html data-theme="light"><head><base href="http://gitu-navigation-fixture.invalid/"><style>' + styles + 'html,body{height:100%;margin:0}#cw{width:100vw;height:100dvh}</style></head><body class="cowork"><main id="cw" class="cw' + (name === 'profile' ? ' page-open' : '') + '"><section id="cwChat" class="cw-chat' + (name === 'profile' ? ' cw-profile-page' : '') + '">' + markup + '</section></main></body></html>');
      const companies = page.getByRole('button', { name: 'Companies', exact: true });
      await companies.waitFor();
      if (!(await companies.evaluate(button => {
        const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return Boolean(button.closest('.cw-top-nav')) && rect.left >= 0 && rect.right <= innerWidth && hit?.closest('button') === button;
      }))) throw Error('Companies action is obscured in ' + name + ' at ' + width + 'px');
      if (name === 'chat' && !(await page.locator('#cwBack').evaluate(button => {
        const rect = button.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button;
      }))) throw Error('Companies navigation obscures Cowork search at ' + width + 'px');
      if (width === 390) await page.screenshot({ path: '.qa/cowork-companies/navigation-' + name + '-mobile.png' });
    }
  }
  console.log('Cowork navigation passed: production chat/profile markup, visible Companies action and accessible search at desktop and mobile widths.');
} finally { await browser.close(); }
