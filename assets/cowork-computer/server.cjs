/* Runs only inside the private Linux container. No host mounts or public ports. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const execFileAsync = require('node:util').promisify(execFile);
const { chromium } = require('playwright');
const secret = require('node:crypto').randomBytes(32).toString('hex');
fs.writeFileSync('/tmp/gitu-computer-key', secret, { mode: 0o600 });
const jobs = new Map();
const processes = new Map();
const cancelled = new Set();
let browser;
let browserQueue = Promise.resolve();
let screenQueue = Promise.resolve();

async function configureDesktop() {
  if (!process.env.DISPLAY) return;
  const property = (channel, name, type, value) => execFileAsync('xfconf-query', ['-c', channel, '-p', name, '-s', value], { timeout: 5000 })
    .catch(() => execFileAsync('xfconf-query', ['-c', channel, '-p', name, '-n', '-t', type, '-s', value], { timeout: 5000 }));
  // Refresh these settings in cached desktops as well as newly built images.
  // Poll the virtual framebuffer reliably instead of relying on DAMAGE hints.
  // Input and redraws never wait for idle naps or batches of ten events.
  await Promise.all([
    execFileAsync('x11vnc', ['-R', 'noxdamage,input_skip:1,input_eagerly,wait:10,defer:0,setdefer:-2,nonap,sb:0,nowait_bog'], { timeout: 5000 }),
    property('xfwm4', '/general/use_compositing', 'bool', 'false'),
    property('xfwm4', '/general/theme', 'string', 'Arc-Dark'),
    property('xsettings', '/Net/ThemeName', 'string', 'Arc-Dark'),
    property('xsettings', '/Net/IconThemeName', 'string', 'Papirus-Dark'),
    property('xsettings', '/Gtk/FontName', 'string', 'Inter 10'),
    property('xfce4-panel', '/panels/panel-1/size', 'uint', '32'),
    property('xfce4-panel', '/panels/panel-2/size', 'uint', '48'),
  ]);
  // XFCE's image loader can omit SVG support in minimal containers. Render the
  // bundled vector once with the existing browser and use a native PNG backdrop.
  const wallpaper = '/tmp/gitu-wallpaper.png';
  if (!fs.existsSync(wallpaper)) {
    const renderer = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await renderer.newPage({ viewport: { width: 2560, height: 1600 } });
      await page.setContent(fs.readFileSync('/computer/gitu-wallpaper.svg', 'utf8'));
      await page.addStyleTag({ content: 'html,body{margin:0}svg{display:block}' });
      await page.screenshot({ path: wallpaper });
    } finally { await renderer.close(); }
  }
  const properties = (await execFileAsync('xfconf-query', ['-c', 'xfce4-desktop', '-l'], { timeout: 5000 })).stdout.split('\n').filter((name) => /\/backdrop\/.*\/last-image$/.test(name));
  if (!properties.length) properties.push('/backdrop/screen0/monitorscreen/workspace0/last-image');
  await Promise.all(properties.flatMap((name) => [
    property('xfce4-desktop', name, 'string', wallpaper),
    property('xfce4-desktop', name.replace(/last-image$/, 'image-style'), 'int', '5'),
  ]));
}

async function desktopInput(p) {
  if (!process.env.DISPLAY) throw new Error('This computer has no desktop display.');
  const coordinate = (value, limit) => {
    if (!Number.isInteger(value) || value < 0 || value >= limit) throw new Error('Desktop coordinates are outside the screen.');
    return String(value);
  };
  const position = () => ['mousemove', '--sync', coordinate(p.x, 1280), coordinate(p.y, 800)];
  let args;
  switch (p.action) {
    case 'launch': {
      const apps = { browser: ['node', '/computer/open-browser.cjs'], agent_browser: ['node', '/computer/open-agent-browser.cjs'], files: ['thunar', '/workspace'], terminal: ['xfce4-terminal', '--working-directory=/workspace'] };
      const app = Object.hasOwn(apps, p.app) ? apps[p.app] : undefined;
      if (!app) throw new Error('Unknown desktop app.');
      await new Promise((resolve, reject) => {
        const child = spawn(app[0], app.slice(1), { stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => { child.unref(); resolve(); });
      });
      return { ok: true, output: 'Desktop app opened.' };
    }
    case 'click':
    case 'double_click': {
      const button = p.button ?? 1;
      if (![1, 2, 3].includes(button)) throw new Error('Invalid mouse button.');
      args = [...position(), 'click', '--clearmodifiers', '--repeat', p.action === 'double_click' ? '2' : '1', '--delay', '120', String(button)];
      break;
    }
    case 'drag':
      args = [...position(), 'mousedown', '1', 'sleep', '0.05', 'mousemove', '--sync', coordinate(p.endX, 1280), coordinate(p.endY, 800), 'sleep', '0.05', 'mouseup', '1'];
      break;
    case 'scroll':
      if (!Number.isInteger(p.delta) || p.delta === 0 || Math.abs(p.delta) > 10) throw new Error('Invalid scroll amount.');
      args = [...position(), 'click', '--repeat', String(Math.abs(p.delta)), '--delay', '20', p.delta > 0 ? '5' : '4'];
      break;
    case 'key':
      if (typeof p.key !== 'string' || !/^(?:(?:ctrl|alt|shift|super)\+){0,4}(?:[a-zA-Z0-9]|F(?:[1-9]|1[0-2])|Return|BackSpace|Tab|Escape|Delete|Insert|Home|End|Page_Up|Page_Down|Left|Right|Up|Down|space)$/.test(p.key)) throw new Error('Invalid desktop key.');
      args = ['key', '--clearmodifiers', p.key];
      break;
    case 'type':
      if (typeof p.text !== 'string' || !p.text || p.text.length > 2000 || p.text.includes('\0')) throw new Error('Text must contain 1–2000 characters.');
      args = ['type', '--clearmodifiers', '--delay', '0', '--', p.text];
      break;
    default:
      throw new Error('Unknown desktop input action.');
  }
  try { await execFileAsync('xdotool', args, { timeout: 10000 }); }
  finally {
    if (p.action === 'drag') await execFileAsync('xdotool', ['mouseup', '1'], { timeout: 2000 }).catch(() => {});
  }
  return { ok: true, output: 'Desktop input delivered.' };
}

async function desktopScreenshot(format = 'png') {
  if (!process.env.DISPLAY) throw new Error('This computer has no desktop display. Stop and start it to upgrade the private desktop.');
  const file = format === 'jpeg' ? '/tmp/gitu-desktop.jpg' : '/tmp/gitu-desktop.png';
  await execFileAsync('scrot', format === 'jpeg' ? ['--overwrite', '--quality', '55', file] : ['--overwrite', file], { timeout: 10000 });
  const image = fs.readFileSync(file);
  if (image.length > 5_000_000) throw new Error('Desktop screenshot exceeds 5 MB.');
  return { ok: true, output: image.toString('base64') };
}

function safePath(value = '.') {
  const resolved = path.resolve('/workspace', String(value));
  const within = (p) => p === '/workspace' || p.startsWith('/workspace/');
  if (!within(resolved)) throw new Error('Path must stay inside /workspace.');
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!within(fs.realpathSync(ancestor))) throw new Error('Symlink leaves /workspace.');
  return resolved;
}
function smallFile(file) {
  if (fs.statSync(file).size > 2_000_000) throw new Error('File exceeds 2 MB limit.');
  return fs.readFileSync(file);
}
function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {}
}
async function command(id, params) {
  if (typeof params.command !== 'string' || !params.command.trim()) throw new Error('command is required');
  const timeoutMs = Number(params.timeoutMs ?? 0);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('timeoutMs must be a nonnegative integer; 0 means no deadline.');
  const background = params.background === true;
  if (background && [...processes.values()].filter((p) => p.running).length >= 8) throw new Error('Stop an existing background process before starting another (limit: 8).');
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', params.command], { cwd: '/workspace', detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    jobs.set(id, () => killGroup(child));
    let output = '';
    let timedOut = false;
    const record = { id, running: true, output: '', exitCode: null };
    if (background) {
      processes.set(id, record);
      for (const [key, process] of processes) if (!process.running && processes.size > 100) processes.delete(key);
      child.on('spawn', () => resolve({ ok: true, output: `Background process started: ${id}. Use computer_process to read output or stop it.` }));
    }
    let timer;
    let remaining = timeoutMs;
    const nextDeadline = () => {
      const slice = Math.min(remaining, 2147483647);
      timer = setTimeout(() => {
        remaining -= slice;
        if (remaining > 0) nextDeadline();
        else { timedOut = true; killGroup(child); }
      }, slice);
    };
    if (!background && timeoutMs) nextDeadline();
    const collect = (d) => {
      output = (output + d.toString()).slice(-16000);
      record.output = output;
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (e) => collect(e.message));
    child.on('close', (code) => {
      clearTimeout(timer);
      killGroup(child); // Do not leave background processes after the tool completes.
      jobs.delete(id);
      record.running = false;
      record.exitCode = code;
      resolve({ ok: code === 0 && !timedOut, exitCode: code ?? 1, output: output + (timedOut ? '\nCommand timed out; process group terminated.' : '') || '(no output)' });
    });
  });
}
async function browse(id, p) {
  if (cancelled.has(id)) throw new Error('Browser operation cancelled.');
  if (!browser) {
    const context = await chromium.launchPersistentContext('/home/agent/browser', { headless: !process.env.DISPLAY, viewport: { width: 1280, height: 720 } });
    browser = context;
    context.on('close', () => { if (browser === context) browser = undefined; });
  }
  if (cancelled.has(id)) {
    await browser.close();
    browser = undefined;
    throw new Error('Browser operation cancelled.');
  }
  const page = browser.pages()[0] || (await browser.newPage());
  page.setDefaultTimeout(15000);
  jobs.set(id, () => {
    void browser?.close().catch(() => {});
    browser = undefined;
  });
  let image;
  try {
    switch (p.action) {
      case 'navigate': {
        const url = new URL(p.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) navigation is supported.');
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      }
      case 'click':
        if (p.selector) await page.locator(p.selector).click();
        else await page.mouse.click(Number(p.x), Number(p.y));
        break;
      case 'type':
        await page.keyboard.insertText(String(p.text ?? ''));
        break;
      case 'fill':
        await page.locator(p.selector).fill(String(p.text ?? ''));
        break;
      case 'select':
        await page.locator(p.selector).selectOption(String(p.value ?? ''));
        break;
      case 'wait':
        await page.waitForTimeout(Math.min(10000, Math.max(0, Number(p.ms) || 1000)));
        break;
      case 'press':
        await page.keyboard.press(String(p.key));
        break;
      case 'scroll':
        await page.mouse.wheel(Number(p.deltaX) || 0, Number(p.deltaY) || 600);
        break;
      case 'back':
        await page.goBack();
        break;
      case 'forward':
        await page.goForward();
        break;
      case 'reload':
        await page.reload();
        break;
      case 'screenshot':
        image = 'data:image/png;base64,' + (await page.screenshot({ path: safePath(p.path || 'screenshot.png') })).toString('base64');
        break;
      case 'evidence':
      case 'state':
        break;
      default:
        throw new Error('Unknown browser action. Use navigate, evidence, state, screenshot, click, fill, select, wait, type, press, scroll, back, forward, reload.');
    }
    return {
      ok: true,
      image,
      output: JSON.stringify({
        url: page.url(),
        title: await page.title(),
        text: (await page.locator('body').innerText()).slice(0, 12000),
        controls: page.locator('body').ariaSnapshot ? (await page.locator('body').ariaSnapshot()).slice(0, 8000) : undefined,
        screenshot: p.action === 'screenshot' ? p.path || 'screenshot.png' : undefined,
      }),
    };
  } finally {
    jobs.delete(id);
  }
}
async function execute({ id, tool, params: p = {} }) {
  if (tool === 'desktop_screenshot' || tool === 'desktop_input') {
    const next = screenQueue.then(() => tool === 'desktop_screenshot' ? desktopScreenshot(p.format) : desktopInput(p));
    screenQueue = next.catch(() => {});
    return next;
  }
  if (cancelled.has(id)) throw new Error('Computer operation cancelled.');
  const file = () => safePath(p.path);
  switch (tool) {
    case 'run_command':
      return command(id, p);
    case 'computer_process': {
      const record = processes.get(String(p.id ?? ''));
      if (!record) throw new Error('Unknown background process id.');
      if (p.action === 'stop') jobs.get(record.id)?.();
      else if (p.action !== 'status') throw new Error('action must be status or stop.');
      return { ok: true, output: JSON.stringify(record) };
    }
    case 'browse': {
      const next = browserQueue.then(() => browse(id, p));
      browserQueue = next.catch(() => {});
      return next;
    }
    case 'read_file':
      return { ok: true, output: smallFile(file()).toString('utf8').slice(0, 16000) };
    case 'list_files':
      return {
        ok: true,
        output: fs
          .readdirSync(file(), { withFileTypes: true })
          .slice(0, 400)
          .map((e) => e.name + (e.isDirectory() ? '/' : ''))
          .join('\n'),
      };
    case 'write_file':
    case 'import_file': {
      const target = file();
      const content = tool === 'import_file' ? Buffer.from(p.data, 'base64') : String(p.content ?? '');
      if (Buffer.byteLength(content) > 2_000_000) throw new Error('File exceeds 2 MB limit.');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      return { ok: true, output: `Wrote ${p.path}` };
    }
    case 'export_file':
      return { ok: true, output: smallFile(file()).toString('base64') };
    case 'apply_edit': {
      const text = smallFile(file()).toString('utf8');
      if (typeof p.oldString !== 'string' || !p.oldString || typeof p.newString !== 'string') throw new Error('oldString and newString are required.');
      if (text.split(p.oldString).length !== 2) throw new Error('oldString must match exactly once.');
      fs.writeFileSync(
        file(),
        text.replace(p.oldString, () => p.newString),
      );
      return { ok: true, output: `Edited ${p.path}` };
    }
    case 'search_files': {
      // Search runs inside the container with a hard timeout and bounded output.
      const needle = String(p.pattern ?? '');
      if (!needle) throw new Error('pattern is required');
      const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
      return command(id, { command: `grep -rnI -E --exclude-dir=node_modules --exclude-dir=.git -- ${quote(needle)} ${quote(file())}`, timeoutMs: 10000 });
    }
    default:
      throw new Error(`Unknown computer tool: ${tool}`);
  }
}
http
  .createServer(async (req, res) => {
    // Webpages in the private browser cannot invoke computer tools through CSRF.
    if (req.method !== 'POST' || req.headers['x-gitu-key'] !== secret) {
      res.writeHead(403);
      res.end('{}');
      return;
    }
    let body = '';
    req.on('data', (data) => {
      body += data;
      if (body.length > 4_000_000) req.destroy();
    });
    req.on('end', async () => {
      res.setHeader('content-type', 'application/json');
      try {
        if (req.url === '/cancel') {
          cancelled.add(body);
          if (cancelled.size > 1000) cancelled.delete(cancelled.values().next().value);
          jobs.get(body)?.();
          res.end('{}');
          return;
        }
        res.end(JSON.stringify(await execute(JSON.parse(body))));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, output: e.message }));
      }
    });
  })
  .listen(8765, '127.0.0.1', () => { configureDesktop().catch((error) => console.error('Desktop input tuning failed:', error.message)); });
