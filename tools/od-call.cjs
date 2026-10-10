/* Read-only / generic MCP stdio caller for the Open Design daemon.
 * Speaks JSON-RPC directly to tools/open-design-mcp.cmd so that heavy tools
 * (start_run, list_agents) are not cut off by the host MCP request timeout.
 *
 * Usage:
 *   node tools/od-call.cjs <toolName> [jsonArgs] [timeoutMs]
 *
 * Examples:
 *   node tools/od-call.cjs list_agents
 *   node tools/od-call.cjs get_project '{"project":"my-project"}'
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CMD = path.join(ROOT, 'tools', 'open-design-mcp.cmd');

const [, , toolName, argsJson, timeoutArg] = process.argv;
if (!toolName) {
  console.error('usage: node tools/od-call.cjs <toolName> [jsonArgs] [timeoutMs]');
  process.exit(2);
}

let args = {};
if (argsJson) {
  const raw = argsJson.startsWith('@')
    ? require('node:fs').readFileSync(path.resolve(ROOT, argsJson.slice(1)), 'utf8')
    : argsJson;
  // PowerShell's -Encoding utf8 writes a BOM, which JSON.parse rejects.
  const clean = raw.replace(/^\uFEFF/, '');
  try {
    args = JSON.parse(clean);
  } catch (err) {
    console.error('invalid jsonArgs: ' + err.message);
    process.exit(2);
  }
}
const timeoutMs = Number(timeoutArg || 600000);

const child = spawn('cmd.exe', ['/c', CMD], {
  cwd: ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

let buffer = '';
let settled = false;

function send(id, method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
}

function finish(code) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    child.stdin.end();
  } catch {
    /* ignore */
  }
  child.kill();
  process.exit(code);
}

const timer = setTimeout(() => {
  console.error('TIMEOUT after ' + timeoutMs + 'ms waiting for tool ' + toolName);
  finish(3);
}, timeoutMs);

child.on('error', (err) => {
  console.error('spawn error: ' + err.message);
  finish(4);
});

child.stderr.on('data', (d) => {
  process.stderr.write(d);
});

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id === 1) {
      send(2, 'tools/call', { name: toolName, arguments: args });
      continue;
    }
    if (msg.id === 2) {
      if (msg.error) {
        console.log('RPC_ERROR ' + JSON.stringify(msg.error));
        finish(1);
        return;
      }
      const res = msg.result || {};
      if (res.isError) {
        console.log('TOOL_ERROR ' + JSON.stringify(res.content || res));
        finish(1);
        return;
      }
      const text = (res.content || [])
        .map((c) => (c.type === 'text' ? c.text : JSON.stringify(c)))
        .join('\n');
      console.log(text || JSON.stringify(res));
      finish(0);
      return;
    }
  }
});

send(1, 'initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'agent-gitu-od-call', version: '1.0.0' },
});
setTimeout(() => {
  send('notif', 'notifications/initialized', {});
}, 300);
