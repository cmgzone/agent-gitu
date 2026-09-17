// Run after npm run build: npx electron scripts/smoke-model-selectors.cjs
// Isolated real-DOM check: fixture catalogs only, no server or provider credentials.
const { app, BrowserWindow } = require('electron');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

app.whenReady().then(async () => {
  const { UI_HTML } = await import(pathToFileURL(path.join(__dirname, '../dist/server/ui.js')).href);
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'model-search-smoke' } });
  const html = UI_HTML.replace('  boot();', `
    window.modelSmoke = { S, loadModelCatalog, openSettings, closeSettings, cwAgentModal, openHome,
      setApi: function (fn) { api = fn; } };
  `).replace(/<script type="module">[\s\S]*?<\/script>/g, '');
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const result = await win.webContents.executeJavaScript(`(async function () {
    var h = window.modelSmoke;
    var check = function (condition, message) { if (!condition) throw new Error(message); };
    var tick = function () { return new Promise(function (r) { setTimeout(r, 30); }); };
    var provider = function (id, models) { return { id: id, label: id, usable: true, hasKey: true,
      defaultModel: 'old-model', models: models.map(function (m) { return { id: m }; }), effortLevels: ['high'] }; };
    var catalog = [provider('custom-lab', ['old-model']), provider('other-provider', ['foreign-model'])];
    h.setApi(async function (url) {
      if (url === '/api/models') return { providers: catalog };
      if (url === '/api/keys') return { stored: [] };
      if (url === '/api/agents') return { agents: [] };
      if (url === '/api/runs') return [];
      return {};
    });
    await h.loadModelCatalog(true);
    h.openHome();
    check(!document.querySelector('#model').innerHTML.includes('newly-added'), 'new model already present');
    catalog = [provider('custom-lab', ['old-model', 'newly-added']), provider('other-provider', ['foreign-model'])];
    await h.loadModelCatalog(true);
    check(document.querySelector('#model').innerHTML.includes('custom-lab::newly-added'), 'Chat missed refreshed model');
    document.querySelector('#modelPick').click();
    check(document.querySelector('#modelList').innerHTML.includes('custom-lab::newly-added'), 'Chat search missed refreshed model');
    h.openSettings('providers'); await tick();
    document.querySelector('[data-pmbtn="0"]').click();
    var menu = document.querySelector('[data-pmwrap="0"] .model-list');
    check(menu.innerHTML.includes('custom-lab::newly-added'), 'Settings missed refreshed model');
    check(!menu.innerHTML.includes('foreign-model'), 'Settings leaked foreign model');
    h.openSettings('agents'); await tick();
    check(document.querySelector('#agModel').innerHTML.includes('custom-lab::newly-added'), 'Specialists missed refreshed model');
    h.closeSettings();
    h.cwAgentModal(null); await tick();
    var prov = document.querySelector('#cwAmProv');
    var search = document.querySelector('#cwAmModelSearch');
    var select = document.querySelector('#cwAmModel');
    check(search && search.disabled, 'Search should exist and wait for provider');
    prov.value = 'custom-lab'; prov.dispatchEvent(new Event('change'));
    check(!search.disabled && search.getBoundingClientRect().width > 0, 'Search not visible/enabled');
    check(select.innerHTML.includes('newly-added'), 'Cowork missed refreshed model');
    select.value = 'old-model'; select.dispatchEvent(new Event('change'));
    search.value = 'NEWLY'; search.dispatchEvent(new Event('input'));
    check(select.innerHTML.includes('newly-added') && !select.innerHTML.includes('foreign-model'), 'Cowork search failed');
    check(select.value === 'old-model', 'Search lost selection');
    select.value = 'newly-added'; select.dispatchEvent(new Event('change'));
    search.value = 'no-such-model'; search.dispatchEvent(new Event('input'));
    check(select.value === 'newly-added', 'No-match search lost selection');
    check(document.querySelector('#cwAmModelCount').textContent.includes('No models match'), 'Missing empty state');
    prov.value = 'other-provider'; prov.dispatchEvent(new Event('change'));
    check(search.value === '' && !select.innerHTML.includes('newly-added'), 'Provider switch did not reset search');
    check(select.innerHTML.includes('foreign-model'), 'Provider switch missed own models');
    return { passed: true, checks: ['Chat refreshed model', 'Settings provider filter', 'Specialist refreshed model',
      'Cowork refreshed model', 'visible search input', 'case-insensitive filtering', 'selection preservation', 'empty results', 'provider switch'] };
  })()`);
  console.log(JSON.stringify(result));
  win.destroy();
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Model selector smoke check timed out'); app.exit(1); }, 20000).unref();
