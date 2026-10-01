/** Visual fixture: npx tsx tests/helpers/cowork-document-preview.ts */
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { coworkDocumentPreview } from '../../src/cowork/document-preview.js';
import { COWORK_JS } from '../../src/server/ui-cowork.js';
import { UI_HTML } from '../../src/server/ui.js';
import type { CoworkArtifact } from '../../src/cowork/store.js';

const filePath = path.join(mkdtempSync(path.join(tmpdir(), 'cowork-document-')), 'copy-deck.md');
const text = '# PikPam copy deck — corrected three-product lineup\n\nGrounded only in verified product facts.\n\n**Standing rule:** The homepage dashboard uses demo data.\n\n## 1. Agent Gitu\n\n**Status:** Coming soon.\n\nPositioning that is ready to review:\n- Eyebrow: `03 · Coming soon`\n- H1: `Agent Gitu`\n- Lede: Our third product is in the works.\n\n> Confirm the feature description before publishing.\n\n## 2. Product overview\n\n| Product | Status |\n| --- | --- |\n| PikPOS | Available |\n| NoteClaw | Available |\n| Agent Gitu | Coming soon |\n\n### Code example\n\n```html\n<h1>Agent Gitu</h1>\n```\n\n[Product website](https://example.com)\n';
writeFileSync(filePath, text);
const artifact: CoworkArtifact = { id: 'cf-preview', conversationId: 'preview', name: 'copy-deck.md', mime: 'text/markdown', size: Buffer.byteLength(text), storageName: 'copy-deck.md', createdAt: new Date().toISOString() };
const styles = UI_HTML.slice(UI_HTML.indexOf('<style>') + 7, UI_HTML.indexOf('</style>'));
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (url.pathname.endsWith('/preview')) {
    response.end(coworkDocumentPreview(filePath, artifact, { theme, embedded: true }));
    return;
  }
  response.end(`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document preview fixture</title><style>${styles}
body{margin:0;display:block;padding:32px}.fixture{max-width:700px;margin:auto}
</style></head><body><div class="fixture"><h1>Cowork</h1><p>Document attached for review.</p><button class="btn" id="open">Open copy-deck.md</button></div><script>
const S = { cw: { artifacts: [${JSON.stringify(artifact)}] } };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast = () => {};
${COWORK_JS}
document.getElementById('open').onclick = () => cwPreviewFile('cf-preview');
</script></body></html>`);
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Document preview: http://127.0.0.1:${address.port}`);
});
