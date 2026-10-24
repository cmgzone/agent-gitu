import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';
import { BRAND_DIR, BRAND_FILES, CHARACTERS_DIR, CHARACTER_FILES, FONTS_DIR, FONT_FILES } from '../src/server/static-assets.js';

const origin = 'http://gitu-home-fixture.invalid';
const projectPath = 'C:\\Projects\\agentgitu';
const projects = ['agentgitu', 'Mobile app', 'Research studio', 'Website', 'Older project', 'Archive viewer'].map((name, i) => ({ name, path: i ? 'C:\\Projects\\' + name : projectPath }));
const runs = projects.map((project, i) => ({ runId: 'session-' + i, projectPath: project.path, project: project.name, goal: 'Task in ' + project.name, mode: 'agent', status: i===2?'running':i===3?'failed':'completed', startedAt: new Date(Date.UTC(2026, 9, 20 - i)).toISOString() }));
const preview = `
  if(!S.settings.projectPath)S.settings.projectPath=${JSON.stringify(projectPath)};S.lastProjectPath=S.settings.projectPath;
  S.modelsLoaded=true;S.models=[{id:'preview',label:'Preview',usable:true,hasKey:true,defaultModel:'qwen-max',models:[{id:'qwen-max',name:'Qwen Max',vision:true}]}];S.sel.model='preview::qwen-max';
  filePolicy={maxFileBytes:null,loaded:true};window.previewCalls=[];
  var actualStartRun=startRun;
  startRun=function(){window.previewCalls.push({action:'start',text:$('goal').value,project:effectiveProjectPath()});};
  var actualOpenRun=openRun;
  openRun=function(id,options){window.previewCalls.push({action:'resume',id:id,options:options});};
  openCowork=function(){window.previewCalls.push({action:'cowork',kind:cwEnsure().homeAction&&cwEnsure().homeAction.kind});};
  openSettings=function(page){window.previewCalls.push({action:'settings',page:page});};
  newProject=function(){window.previewCalls.push({action:'new-project'});};
  openFolderBrowser=function(){window.previewCalls.push({action:'folder'});};
  window.EventSource=function(){this.addEventListener=function(){};this.close=function(){};};
  window.gituDesktop={openProjectFolder:async function(path){window.previewCalls.push({action:'open-folder',path:path});return {ok:true};}};
  window.homePreview={submit:function(){actualStartRun();},addAttachment:function(name){pendingFor().push({name:name,mime:'text/plain',dataUrl:'data:text/plain;base64,aGk='});},pendingNames:function(){return pendingFor().map(function(file){return file.name;});},render:openHome,loadFilePolicy:loadFilePolicy,useRealRuns:function(){openRun=actualOpenRun;},openRun:function(id,options){actualOpenRun(id,options);}};$('startupCover').hidden=true;openHome();
`;
if (!UI_HTML.includes('  boot();')) throw Error('Home preview boot hook missing');
const html = UI_HTML.replace('  boot();', preview);
mkdirSync('.qa/project-sidebar', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  let holdStarts=false,releaseStart:(()=>Promise<void>)|undefined;
  let startBody:any;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url()), name = path.basename(url.pathname);
    if(url.origin===origin&&url.pathname==='/api/runs'&&route.request().method()==='POST'){startBody=route.request().postDataJSON();if(holdStarts){return new Promise<void>(resolve=>{releaseStart=async()=>{await route.fulfill({contentType:'application/json',body:JSON.stringify({runId:'session-1'})});resolve();};});}return route.fulfill({contentType:'application/json',body:JSON.stringify({runId:'session-1'})});}
    if (url.origin !== origin) return route.fulfill({ status: 204 });
    for (const [prefix, folder, files] of [['/brand/', BRAND_DIR, BRAND_FILES], ['/characters/', CHARACTERS_DIR, CHARACTER_FILES], ['/fonts/', FONTS_DIR, FONT_FILES]] as const) {
      if (url.pathname.startsWith(prefix) && Object.hasOwn(files, name)) return route.fulfill({ contentType: files[name]!, body: readFileSync(path.join(folder, name)) });
    }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if(url.pathname.startsWith('/api/runs/')){const run=runs.find(run=>run.runId===url.pathname.split('/')[3]);return route.fulfill({contentType:'application/json',body:JSON.stringify({...run,files:[],pendingApprovals:[]})});}
    const json = url.pathname === '/api/projects' ? { projects } : url.pathname === '/api/runs' ? runs :
      url.pathname === '/api/cowork/agents' ? { agents: [{ id: 'ari', name: 'Ari', avatar: { shape: 'dot-blue', color: '#5ba8ff' } }], availableSkills: [] } :
        url.pathname === '/api/skills' ? { skills: [] } : url.pathname === '/api/cron' ? { jobs: [] } : url.pathname === '/api/files/policy' ? { maxFileBytes: null } : {};
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(json) });
  });
  for (const [width, height, theme] of [[1600, 900, 'light'], [1360, 768, 'dark'], [390, 844, 'light'], [360, 740, 'dark']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(origin);
    await page.evaluate(()=>localStorage.clear());await page.reload();await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.locator('[data-home-project]').first().waitFor({ state: 'attached' });
    const openSidebar = async () => { if (width <= 800 && !(await page.locator('#homeSidebar').isVisible())) await page.getByRole('button', { name: 'Open navigation', exact: true }).click(); };
    if (await page.locator('#homeSidebar .home-project').count() !== 4 || await page.locator('.home-sky > .home-projects').count()) throw Error('Projects must live only in the sidebar');
    if (await page.locator('.home-project').count() !== 4) throw Error('Home must show four recent projects');
    const modes = page.getByRole('navigation', { name: 'App modes', exact: true });
    if (await modes.getByRole('button').count() !== 2) throw Error('Primary navigation contains secondary actions');
    const input = page.getByRole('textbox', { name: 'Describe your task', exact: true });
    await input.fill('Keep this task draft');
    await openSidebar();
    await page.getByRole('button', { name: 'Select project Mobile app', exact: true }).click();
    if (width <= 800 && await page.locator('#homeSidebar').isVisible()) throw Error('Selecting a project did not close mobile navigation');
    if (await input.inputValue() !== '') throw Error('Another project inherited the outgoing draft');
    await input.fill('Mobile task draft');
    await page.getByRole('button', { name: 'Start task', exact: true }).click();
    const calls = await page.evaluate(() => (window as any).previewCalls);
    if (calls.at(-1)?.project !== projects[1]!.path || calls.at(-1)?.text !== 'Mobile task draft') throw Error('Composer did not use the selected project and task');
    const policy = page.locator('#homePlusMenu [data-file-policy-label]');
    if (await policy.isVisible()) throw Error('File policy clutters the closed composer');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    await policy.waitFor({ state: 'visible' });
    if (!(await policy.textContent())?.includes('Unlimited')) throw Error('File policy missing from attachment options');
    await page.getByRole('button', { name: 'More actions', exact: true }).click();
    if (width <= 800) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator('#homeSidebar').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      if (await page.locator('#homeSidebar').isVisible()) throw Error('Escape did not close mobile navigation');
    }
    await openSidebar();
    await page.getByRole('button', { name: 'View all projects', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search workspace', exact: true }).fill('Older project');
    await page.locator('.ws-result-action').filter({ hasText: 'Older project' }).waitFor();
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    if (await input.inputValue() !== 'Mobile task draft') throw Error('Browsing all projects lost the draft');
    await openSidebar();
    await page.getByRole('button', { name: 'View all projects', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search workspace', exact: true }).fill('Older project');
    await page.locator('.ws-result-action').filter({ hasText: 'Older project' }).click();
    await page.getByRole('button', { name: 'Project Older project', exact: true }).waitFor();
    if (await input.inputValue() !== '') throw Error('A new project inherited a draft');
    await openSidebar();
    await page.getByRole('button', { name: 'Select project Mobile app', exact: true }).click();
    await openSidebar();
    await page.getByRole('button', { name: 'Actions for Mobile app', exact: true }).click();
    await page.getByRole('button',{name:'Continue latest chat',exact:true}).click();
    if(await input.inputValue()!=='Mobile task draft')throw Error('The Mobile draft was not restored');
    if ((await page.evaluate(() => (window as any).previewCalls)).at(-1)?.id !== 'session-1') throw Error('Continue selected the wrong session');
    if (await page.locator('.home-sky').evaluate(element => element.scrollWidth > element.clientWidth)) throw Error('Home overflows horizontally at ' + width);
    const composer = await page.locator('.home-sky .composer').boundingBox();
    const railWidth = width > 800 ? 248 : 0;
    if (!composer || Math.abs(composer.y + composer.height / 2 - height / 2) > 20 || Math.abs(composer.x + composer.width / 2 - (width + railWidth) / 2) > 2) { await page.screenshot({path:'.qa/project-sidebar/center-debug.png'}); throw Error('Composer is not centered in the main workspace at ' + width + ' ' + JSON.stringify({composer, home:await page.locator('.home-sky').boundingBox(), main:await page.locator('.home-main').boundingBox()})); }
    if (width >= 1360 && await page.locator('.home-sky').evaluate(element => element.scrollHeight > element.clientHeight + 1)) throw Error('Home does not fit desktop viewport at ' + width);
    await page.screenshot({ path: '.qa/project-sidebar/' + width + '-' + theme + '.png' });
    if (width <= 800) {
      await openSidebar();
      await page.screenshot({ path: '.qa/project-sidebar/' + width + '-sidebar-' + theme + '.png' });
      await page.keyboard.press('Escape');
    }
    // Primary and secondary actions retain their original routes.
    await openSidebar();
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    if ((await page.evaluate(() => (window as any).previewCalls)).at(-1)?.action !== 'new-project') throw Error('New project did not retain its action');
    await openSidebar();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    if ((await page.evaluate(() => (window as any).previewCalls)).at(-1)?.action !== 'settings') throw Error('Settings did not retain its action');
    if (width <= 800) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.locator('#cwSessionsBtn').click();
    await page.getByRole('searchbox', { name: 'Search workspace', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close search', exact: true }).click();
    if (width <= 800) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    if ((await page.evaluate(() => (window as any).previewCalls)).at(-1)?.kind !== 'profile') throw Error('Profile did not route to Cowork');
    if (width > 800) {
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
      if ((await page.locator('#homeSidebar').boundingBox())?.width !== 64) throw Error('Sidebar did not collapse');
      const compact = await page.locator('.home-sky .composer').boundingBox();
      if (!compact || Math.abs(compact.x + compact.width / 2 - (width + 64) / 2) > 2) throw Error('Composer did not recenter after collapse');
      await page.getByRole('button', { name: 'Projects', exact: true }).click();
      await page.getByRole('button', { name: 'Close search', exact: true }).click();
      await page.screenshot({ path: '.qa/project-sidebar/' + width + '-collapsed-' + theme + '.png' });
      await page.reload();await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor();
      if ((await page.locator('#homeSidebar').boundingBox())?.width !== 64) throw Error('Collapsed preference did not survive reload');
      await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
      if ((await page.locator('#homeSidebar').boundingBox())?.width !== 248) throw Error('Sidebar did not expand');
    }
    const projectActions=async(name:string)=>{await openSidebar();await page.getByRole('button',{name:'Actions for '+name,exact:true}).click();};
    await projectActions('Mobile app');
    await page.getByRole('textbox',{name:'Project display name',exact:true}).fill('Phone client');
    await page.getByRole('button',{name:'Save name',exact:true}).click();
    await page.getByRole('button',{name:'Project Phone client',exact:true}).waitFor();
    await projectActions('Phone client');await page.getByRole('button',{name:'Pin project',exact:true}).click();
    if(!(await page.locator('#homeProjectCards .home-project-group').first().textContent())?.includes('Phone client'))throw Error('Pinned project was not kept first');
    await projectActions('Phone client');await page.getByRole('button',{name:'Open folder',exact:true}).click();
    if((await page.evaluate(()=>(window as any).previewCalls)).at(-1)?.path!==projects[1]!.path)throw Error('Open folder used the wrong project');
    await projectActions('Website');await page.getByRole('button',{name:'Archive project',exact:true}).click();
    if(await page.locator('#homeProjectCards [aria-label="Select project Website"]').count())throw Error('Archived project remained in normal list');
    await openSidebar();await page.getByRole('button',{name:'Archived & hidden',exact:true}).click();
    await projectActions('Website');await page.getByRole('button',{name:'Restore project',exact:true}).click();
    await openSidebar();await page.getByRole('button',{name:'Back to projects',exact:true}).click();
    await page.evaluate(()=>(window as any).homePreview.useRealRuns());
    await page.evaluate(path=>(window as any).homePreview.openRun('session-1',{projectPath:path}),projects[1]!.path);
    await page.locator('.run.code-workspace #homeSidebar').waitFor({state:'attached'});
    await page.locator('#follow').fill('Keep this chat follow-up');
    await openSidebar();await page.getByRole('button',{name:'New task',exact:true}).click();
    if(await input.inputValue()!=='Mobile task draft')throw Error('Returning from chat lost the project draft');
    await page.evaluate(path=>(window as any).homePreview.openRun('session-1',{projectPath:path}),projects[1]!.path);
    if(await page.locator('#follow').inputValue()!=='Keep this chat follow-up')throw Error('Chat draft was not restored');
    if(width<=800)await openSidebar();
    await page.screenshot({path:'.qa/project-sidebar/'+width+'-chat-'+theme+'.png'});
    await page.reload();await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    await page.getByRole('button',{name:'Project Phone client',exact:true}).waitFor();
    if(await input.inputValue()!=='Mobile task draft')throw Error('Project draft did not survive reload');
    await page.evaluate(()=>(window as any).homePreview.useRealRuns());
    await page.evaluate(path=>(window as any).homePreview.openRun('session-1',{projectPath:path}),projects[1]!.path);
    if(await page.locator('#follow').inputValue()!=='Keep this chat follow-up')throw Error('Chat draft did not survive reload');
    if(width===1600){
      await openSidebar();await page.getByRole('button',{name:'New task',exact:true}).click();
      await input.fill('Original submitted task');
      await page.evaluate(()=>(window as any).homePreview.addAttachment('phone.txt'));
      holdStarts=true;const requested=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/runs'&&request.method()==='POST');
      await page.evaluate(()=>(window as any).homePreview.submit());await requested;
      await page.evaluate(()=>(window as any).homePreview.addAttachment('phone-new.txt'));
      await openSidebar();await page.getByRole('button',{name:'Select project agentgitu',exact:true}).click();
      await input.fill('Newer project draft');await page.evaluate(()=>(window as any).homePreview.addAttachment('agent.txt'));
      if(!releaseStart)throw Error('Task submission was not held');await releaseStart();holdStarts=false;
      await page.locator('#runProject[aria-label="Project Phone client"]').waitFor();
      if(startBody.projectPath!==projects[1]!.path||startBody.goal!=='Original submitted task'||startBody.files[0].name!=='phone.txt')throw Error('Task submission used later project context');
      await openSidebar();await page.getByRole('button',{name:'New task',exact:true}).click();
      if(await input.inputValue()!=='Newer project draft')throw Error('Delayed submission erased another project draft');
      if(JSON.stringify(await page.evaluate(()=>(window as any).homePreview.pendingNames()))!==JSON.stringify(['agent.txt']))throw Error('Delayed submission cleared another project attachments');
      await openSidebar();await page.getByRole('button',{name:'Select project Phone client',exact:true}).click();
      if(await input.inputValue()!=='')throw Error('Submitted draft was not cleared');
      if(JSON.stringify(await page.evaluate(()=>(window as any).homePreview.pendingNames()))!==JSON.stringify(['phone-new.txt']))throw Error('Attachment added after submission was cleared');
    }
    if (errors.length) throw Error(errors.join('\n'));
  }
  console.log('Project workspace passed: two modes, sidebar projects, project selection/draft preservation, task/resume targets, searchable full list, attachment policy, desktop/mobile navigation and light/dark layouts.');
} finally { await browser.close(); }
