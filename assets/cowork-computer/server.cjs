/* Runs only inside the private Linux container. No host mounts or public ports. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const secret = require('node:crypto').randomBytes(32).toString('hex');
fs.writeFileSync('/tmp/gitu-computer-key', secret, { mode: 0o600 });
const jobs = new Map();
const processes = new Map();
const cancelled = new Set();
let browser;
let browserQueue = Promise.resolve();

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
  const timeoutMs = Math.min(120000, Math.max(100, Number(params.timeoutMs) || 120000));
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
    const timer = background
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          killGroup(child);
        }, timeoutMs);
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
  browser ??= await chromium.launchPersistentContext('/home/agent/browser', { headless: true, viewport: { width: 1280, height: 800 } });
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
        await page.screenshot({ path: safePath(p.path || 'screenshot.png') });
        break;
      case 'state':
        break;
      default:
        throw new Error('Unknown browser action. Use navigate, state, screenshot, click, fill, type, press, scroll, back, forward, reload.');
    }
    return {
      ok: true,
      output: JSON.stringify({
        url: page.url(),
        title: await page.title(),
        text: (await page.locator('body').innerText()).slice(0, 12000),
        screenshot: p.action === 'screenshot' ? p.path || 'screenshot.png' : undefined,
      }),
    };
  } finally {
    jobs.delete(id);
  }
}
async function execute({ id, tool, params: p = {} }) {
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
  .listen(8765, '127.0.0.1');
