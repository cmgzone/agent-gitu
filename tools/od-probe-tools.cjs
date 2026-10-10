/* Read-only probe: speaks MCP stdio JSON-RPC to the Open Design daemon
   launcher and prints the full tool catalog (list_mcp truncates it).
   Usage: node tools/od-probe-tools.cjs */
const { spawn } = require('node:child_process');
const path = require('node:path');

const launcher = path.join(__dirname, 'open-design-mcp.cmd');
const child = spawn('cmd.exe', ['/c', launcher], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: path.join(__dirname, '..'),
});

let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });

let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    if (msg.id === 1) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
    } else if (msg.id === 2) {
      const tools = (msg.result && msg.result.tools) || [];
      console.log('TOOL_COUNT=' + tools.length);
      for (const t of tools) {
        const props = Object.keys((t.inputSchema && t.inputSchema.properties) || {});
        console.log('---');
        console.log('name: ' + t.name);
        console.log('args: ' + props.join(', '));
        console.log('desc: ' + String(t.description || '').replace(/\s+/g, ' ').slice(0, 300));
      }
      child.kill();
      process.exit(0);
    }
  }
});

child.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'od-probe', version: '1.0.0' },
  },
}) + '\n');

setTimeout(() => {
  console.log('TIMEOUT waiting for tools/list');
  if (stderr) console.log('stderr: ' + stderr.slice(0, 800));
  child.kill();
  process.exit(1);
}, 30000);
