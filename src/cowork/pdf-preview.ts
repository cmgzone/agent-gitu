import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoworkArtifact } from './store.js';

export const PDF_PREVIEW_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src blob: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const libraryRoot = fileURLToPath(new URL('../../node_modules/pdfjs-dist/', import.meta.url));

/** Only PDF.js runtime files are public; no arbitrary node_modules paths. */
export function pdfPreviewAsset(url: string): { path: string; mime: string } | undefined {
  const name = url.slice('/vendor/pdfjs/'.length);
  if (!url.startsWith('/vendor/pdfjs/')) return;
  if (/^legacy\/build\/pdf(?:\.worker)?\.mjs$/.test(name)) return { path: path.join(libraryRoot, name), mime: 'text/javascript; charset=utf-8' };
  if (/^(?:cmaps\/[\w-]+\.bcmap|standard_fonts\/[\w.-]+\.(?:pfb|ttf)|wasm\/[\w.-]+\.(?:wasm|js)|iccs\/[\w.-]+\.icc)$/.test(name)) {
    return { path: path.join(libraryRoot, name), mime: name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream' };
  }
}

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function pdfPreviewHtml(artifact: CoworkArtifact, theme: 'light' | 'dark' = 'dark', embedded = false, artifactUrl?: string): string {
  const url = artifactUrl ?? '/api/cowork/artifacts/' + encodeURIComponent(artifact.id);
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PDF_PREVIEW_CSP}"><title>${esc(artifact.name)}</title><style>
:root{color-scheme:dark;--bg:#1b1b1b;--panel:#242424;--text:#e8e8e8;--muted:#b3b3b3;--border:#414141;--accent:#b6aaff}
:root[data-theme=light]{color-scheme:light;--bg:#ededeb;--panel:#fff;--text:#242422;--muted:#62625e;--border:#d3d3d0;--accent:#6755c8}
*{box-sizing:border-box}html,body{margin:0;height:100%;font:13px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}body{display:flex;flex-direction:column}header{padding:12px 16px;overflow-wrap:anywhere;background:var(--panel);border-bottom:1px solid var(--border)}nav{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 12px;background:var(--panel);border-bottom:1px solid var(--border)}button,input,select,a{font:inherit}button,select,input{border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--panel);color:var(--text)}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}input[type=number]{width:58px}input[type=password]{max-width:220px;min-width:0}a{color:var(--accent)}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.spacer{flex:1}#status{margin:0;padding:8px 14px;color:var(--muted);font-size:12px}#password-form{padding:8px 14px}#password-form:not([hidden]){display:flex;align-items:center;flex-wrap:wrap;gap:8px}main{flex:1;min-height:0;overflow:auto;padding:16px;text-align:center}canvas{display:block;margin:0 auto;background:white;box-shadow:0 2px 12px #0003}canvas[hidden]{display:none}noscript{padding:16px}.download{white-space:nowrap}@media(max-width:420px){nav{gap:6px;padding:8px}main{padding:10px}button,select,input{padding:6px}nav .spacer{display:none}.download{margin-left:auto}}
</style></head><body data-pdf-url="${esc(url + '?inline=1')}">${embedded ? '' : '<header>' + esc(artifact.name) + '</header>'}
<nav aria-label="PDF controls"><button id="previous" aria-label="Previous page" disabled>Previous</button><label>Page <input id="page" type="number" min="1" value="1" aria-label="Page number" disabled></label><span id="pages">of …</span><button id="next" aria-label="Next page" disabled>Next</button><label><select id="zoom" aria-label="Zoom" disabled><option value="fit">Fit width</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>${embedded ? '' : '<span class="spacer"></span><a class="download" href="' + esc(url) + '" download>Download PDF</a>'}</nav>
<p id="status" role="status" aria-live="polite">Loading PDF…</p><form id="password-form" hidden><label for="password">PDF password</label><input id="password" type="password" autocomplete="off" required><button type="submit">Open PDF</button></form><main id="viewport" aria-busy="true"><canvas id="page-canvas" aria-label="PDF page" role="img" hidden></canvas></main><noscript>Enable JavaScript to preview this PDF, or use Download PDF above.</noscript><script type="module" src="/vendor/gitu-pdf-preview.js"></script></body></html>`;
}

/** PDF bytes are fetched only from the authenticated artifact endpoint. PDF
 * actions, attachments and JavaScript are never executed by this canvas view. */
export const PDF_PREVIEW_JS = String.raw`
const $ = id => document.getElementById(id);
const status = $('status'), canvas = $('page-canvas'), viewport = $('viewport');
let pdf, current = 1, revision = 0, rendering, passwordCallback;
function message(text) { status.textContent = text; }
function controls() {
  $('previous').disabled = !pdf || current <= 1;
  $('next').disabled = !pdf || current >= pdf.numPages;
  $('page').disabled = $('zoom').disabled = !pdf;
  $('page').value = current;
}
async function draw() {
  if (!pdf) return;
  const ticket = ++revision;
  controls(); viewport.setAttribute('aria-busy', 'true');
  message('Loading page ' + current + '…');
  try {
    if (rendering) { rendering.cancel(); await rendering.promise.catch(() => {}); }
    const page = await pdf.getPage(current);
    if (ticket !== revision) return;
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(100, viewport.clientWidth - (innerWidth <= 420 ? 20 : 32));
    const chosen = $('zoom').value === 'fit' ? available / base.width : Number($('zoom').value);
    const scale = Math.min(chosen, 8192 / base.width, 8192 / base.height);
    const view = page.getViewport({ scale });
    const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(16000000 / (view.width * view.height)), 8192 / Math.max(view.width, view.height));
    canvas.width = Math.max(1, Math.floor(view.width * density));
    canvas.height = Math.max(1, Math.floor(view.height * density));
    canvas.style.width = view.width + 'px'; canvas.style.height = view.height + 'px';
    canvas.hidden = false;
    canvas.setAttribute('aria-label', 'PDF page ' + current + ' of ' + pdf.numPages);
    rendering = page.render({ canvasContext: canvas.getContext('2d'), viewport: view, transform: density === 1 ? null : [density, 0, 0, density, 0, 0] });
    await rendering.promise;
    if (ticket === revision) message('Page ' + current + ' of ' + pdf.numPages);
  } catch (error) {
    if (ticket === revision && error.name !== 'RenderingCancelledException') message('This page could not be displayed. Try another page or download the PDF.');
  } finally { if (ticket === revision) viewport.setAttribute('aria-busy', 'false'); }
}
function go(page) { if (!pdf) return; current = Math.max(1, Math.min(pdf.numPages, Math.trunc(Number(page)) || 1)); draw(); }
$('previous').onclick = () => go(current - 1);
$('next').onclick = () => go(current + 1);
$('page').onchange = () => go($('page').value);
$('zoom').onchange = () => draw();
let resize;
addEventListener('resize', () => { clearTimeout(resize); if ($('zoom').value === 'fit') resize = setTimeout(draw, 150); });
$('password-form').onsubmit = event => {
  event.preventDefault();
  if (!passwordCallback) return;
  const callback = passwordCallback; passwordCallback = null;
  const value = $('password').value; $('password').value = '';
  $('password-form').hidden = true; message('Opening PDF…'); callback(value);
};
try {
  const pdfjs = await import('/vendor/pdfjs/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/legacy/build/pdf.worker.mjs';
  const task = pdfjs.getDocument({ url: document.body.dataset.pdfUrl, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/', iccUrl: '/vendor/pdfjs/iccs/', isEvalSupported: false, enableXfa: false });
  task.onPassword = (callback, reason) => {
    passwordCallback = callback; $('password-form').hidden = false;
    message(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'Incorrect password. Try again.' : 'Enter the password to open this PDF.');
    $('password').focus();
  };
  pdf = await task.promise;
  $('pages').textContent = 'of ' + pdf.numPages; $('page').max = pdf.numPages;
  await draw();
  addEventListener('pagehide', () => { task.destroy(); }, { once: true });
} catch {
  viewport.setAttribute('aria-busy', 'false');
  message('This PDF could not be opened. Download it to try another viewer.');
}
`;
