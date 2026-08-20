// Fake LSP server for tests — speaks the same Content-Length JSON-RPC framing
// the real client expects, so the full client->manager lifecycle can be
// exercised without installing any real language server.
//
// Env knobs:
//   FAKE_LSP_LOG       append a "spawn:<pid>" line per process start
//   FAKE_LSP_PID       write this process's pid to the file
//   CRASH_ON_FIRST_TD  exit(1) on the first textDocument/diagnostic request
import { appendFileSync, writeFileSync } from 'node:fs';

const logPath = process.env.FAKE_LSP_LOG;
const pidPath = process.env.FAKE_LSP_PID;
const crashOnFirstTd = process.env.CRASH_ON_FIRST_TD === '1';

if (logPath) appendFileSync(logPath, `spawn:${process.pid}\n`);
if (pidPath) writeFileSync(pidPath, String(process.pid));

let buffer = '';
let tdCount = 0;
let docText = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd);
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(m[1]);
    if (buffer.length < headerEnd + 4 + len) return;
    const body = buffer.slice(headerEnd + 4, headerEnd + 4 + len);
    buffer = buffer.slice(headerEnd + 4 + len);
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }
    handle(msg);
  }
});

function send(obj) {
  const body = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}

function handle(msg) {
  // Responses to requests we might have sent: ignore (we send none). Client
  // requests carry BOTH a numeric id and a method, so do not route those here.
  if (msg.id !== undefined && !msg.method) return;
  switch (msg.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          capabilities: {
            textDocumentSync: 2,
            diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: true },
            definitionProvider: true,
            referencesProvider: true,
            hoverProvider: true,
            documentSymbolProvider: true,
          },
        },
      });
      return;
    case 'initialized':
      return;
    case 'textDocument/didOpen':
      docText = msg.params.textDocument.text;
      return;
    case 'textDocument/didChange':
      docText = msg.params.contentChanges[0].text;
      return;
    case 'textDocument/didClose':
      return;
    case 'textDocument/diagnostic': {
      if (crashOnFirstTd && tdCount++ === 0) process.exit(1);
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          kind: 'full',
          items: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
              severity: 1,
              message: 'fake error',
              source: 'fake',
              code: 'E0001',
            },
          ],
        },
      });
      return;
    }
    case 'textDocument/definition':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          uri: msg.params.textDocument.uri,
          range: { start: { line: 2, character: 0 }, end: { line: 2, character: 8 } },
        },
      });
      return;
    case 'textDocument/references':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: [
          { uri: msg.params.textDocument.uri, range: { start: { line: 4, character: 0 }, end: { line: 4, character: 4 } } },
        ],
      });
      return;
    case 'textDocument/hover':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: { contents: { kind: 'markdown', value: 'Fake hover docs' } },
      });
      return;
    case 'textDocument/documentSymbol':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: [
          {
            name: 'main',
            kind: 12,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
            selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
          },
        ],
      });
      return;
    case 'shutdown':
      send({ jsonrpc: '2.0', id: msg.id, result: null });
      return;
    case 'exit':
      process.exit(0);
      return;
    default:
      return;
  }
}