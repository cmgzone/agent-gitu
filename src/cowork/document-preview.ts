import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { Marked } from 'marked';
import { isTextLikeFile } from '../server/static-assets.js';
import type { CoworkArtifact } from './store.js';

/** Inline previews never embed more than the Cowork artifact limit. */
const MAX_INLINE_BYTES = 2_000_000;

const esc = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function xmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function taggedText(xml: string, tag = 't'): string[] {
  const pattern = new RegExp(`<[^>]*:?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[^>]*:?${tag}>`, 'gi');
  return [...xml.matchAll(pattern)].map((match) => xmlText(match[1]!.replace(/<[^>]+>/g, '')));
}

function unzip(filePath: string): Record<string, Uint8Array> {
  return unzipSync(new Uint8Array(readFileSync(filePath)));
}

function docxHtml(filePath: string): string {
  const archive = unzip(filePath);
  const bytes = archive['word/document.xml'];
  if (!bytes) throw new Error('DOCX document.xml is missing');
  const xml = strFromU8(bytes);
  const blocks: string[] = [];
  for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = taggedText(paragraph[1]!).join('');
    if (text.trim()) blocks.push(`<p>${esc(text)}</p>`);
  }
  return blocks.join('') || '<p class="empty">This document contains no readable paragraphs.</p>';
}

function xlsxHtml(filePath: string): string {
  const archive = unzip(filePath);
  const shared = archive['xl/sharedStrings.xml'] ? taggedText(strFromU8(archive['xl/sharedStrings.xml']!)) : [];
  const sheets = Object.keys(archive).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort().slice(0, 12);
  return sheets.map((name, sheetIndex) => {
    const xml = strFromU8(archive[name]!);
    const rows = [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].slice(0, 500).map((row) => {
      const cells = [...row[1]!.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
        const attrs = cell[1]!;
        const body = cell[2]!;
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? taggedText(body).join('');
        const value = /\bt="s"/.test(attrs) ? shared[Number(raw)] ?? raw : xmlText(raw);
        return `<td>${esc(value)}</td>`;
      });
      return cells.length ? `<tr>${cells.join('')}</tr>` : '';
    }).join('');
    return `<section><h2>Sheet ${sheetIndex + 1}</h2><div class="table-wrap"><table>${rows}</table></div></section>`;
  }).join('') || '<p class="empty">This workbook contains no readable worksheets.</p>';
}

function pptxHtml(filePath: string): string {
  const archive = unzip(filePath);
  const slides = Object.keys(archive).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0])).slice(0, 100);
  return slides.map((name, index) => {
    const lines = taggedText(strFromU8(archive[name]!));
    return `<section class="slide"><div class="slide-no">Slide ${index + 1}</div>${lines.map((line) => `<p>${esc(line)}</p>`).join('') || '<p class="empty">No readable text</p>'}</section>`;
  }).join('') || '<p class="empty">This presentation contains no readable slides.</p>';
}

function textHtml(filePath: string): string {
  return `<pre>${esc(readFileSync(filePath, 'utf8').slice(0, 2_000_000))}</pre>`;
}

// Only generated Markdown markup is trusted. Raw HTML stays visible as text,
// images never fetch resources, and links can only navigate to web URLs.
const markdown = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html({ text }) { return esc(text); },
    image({ text }) { return `<span class="empty">${esc(text)}</span>`; },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!/^https?:\/\//i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return label;
      try {
        const url = new URL(href);
        if (!['http:', 'https:'].includes(url.protocol)) return label;
        return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      } catch { return label; }
    },
    table(token) {
      const header = token.header.map((cell) => this.tablecell(cell)).join('');
      const rows = token.rows.map((row) => `<tr>${row.map((cell) => this.tablecell(cell)).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
    },
  },
});

function markdownHtml(filePath: string): string {
  return `<article class="markdown">${markdown.parse(readFileSync(filePath, 'utf8').slice(0, MAX_INLINE_BYTES), { async: false })}</article>`;
}

export interface DocumentPreviewOptions {
  theme?: 'light' | 'dark';
  embedded?: boolean;
}

/** SVG runs scripts as a standalone document but never inside an <img> data URL,
 *  so drawing it as an image keeps the preview inert. */
function svgHtml(filePath: string, artifact: CoworkArtifact): string {
  const bytes = readFileSync(filePath);
  if (bytes.length > MAX_INLINE_BYTES) return unsupportedHtml(artifact, 'This image is too large to preview inline.');
  return `<div class="image"><img alt="${esc(artifact.name)}" src="data:image/svg+xml;base64,${bytes.toString('base64')}"></div>`;
}

/** Files we can identify but not render still get a useful page — identity,
 *  type, size and a download button — instead of a dead end. */
function unsupportedHtml(artifact: CoworkArtifact, reason: string): string {
  const size = Number(artifact.size) > 0 ? `${Math.max(1, Math.round(Number(artifact.size) / 1024))} KB` : 'unknown size';
  const target = `/api/cowork/artifacts/${encodeURIComponent(artifact.id)}`;
  return (
    `<div class="placeholder"><p class="empty">${esc(reason)}</p>` +
    `<p><strong>${esc(artifact.name)}</strong><br><span class="empty">${esc(artifact.mime || 'application/octet-stream')} · ${esc(size)}</span></p>` +
    `<p><a class="btn" href="${esc(target)}" download>Download this file</a></p></div>`
  );
}

/** Safe standalone preview page. Text and Office documents render from their own
 *  bytes, SVG renders as an inert <img>, and every other type gets an identity
 *  card with a download link — macros, scripts, external resources and embedded
 *  objects never execute. */
export function coworkDocumentPreview(filePath: string, artifact: CoworkArtifact, options: DocumentPreviewOptions = {}): string {
  const ext = path.extname(artifact.name).toLowerCase();
  const mime = String(artifact.mime ?? '').toLowerCase();
  let body: string;
  let inlineImage = false;
  try {
    if (ext === '.svg' || mime === 'image/svg+xml') {
      body = svgHtml(filePath, artifact);
      inlineImage = true;
    } else if (ext === '.docx') body = docxHtml(filePath);
    else if (ext === '.xlsx') body = xlsxHtml(filePath);
    else if (ext === '.pptx') body = pptxHtml(filePath);
    else if (['.md', '.markdown'].includes(ext) || /^text\/(?:x-)?markdown\b/.test(mime)) body = markdownHtml(filePath);
    else if (isTextLikeFile(artifact.name, artifact.mime)) body = textHtml(filePath);
    else if (/^application\/pdf\b/i.test(mime)) body = unsupportedHtml(artifact, 'Open the download below to read this PDF in your PDF viewer.');
    else if (['.doc', '.xls', '.ppt'].includes(ext)) body = unsupportedHtml(artifact, 'This legacy Office format cannot be read safely — download it, or ask for a .docx/.xlsx/.pptx version.');
    else if (/^image\//i.test(mime)) body = unsupportedHtml(artifact, 'This image format cannot be drawn inline.');
    else if (['.zip', '.gz', '.tar', '.7z', '.rar'].includes(ext)) body = unsupportedHtml(artifact, 'Archive — download it to inspect the contents.');
    else body = unsupportedHtml(artifact, 'No inline preview is available for this file type.');
  } catch {
    // A damaged or truncated file must still produce a usable page.
    body = unsupportedHtml(artifact, 'This file could not be parsed for a preview.');
  }
  const csp = inlineImage ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'" : "default-src 'none'; style-src 'unsafe-inline'";
  const theme = options.theme === 'light' ? 'light' : 'dark';
  return `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${esc(artifact.name)}</title><style>
:root{color-scheme:dark;--bg:#1b1b1b;--text:#e8e8e8;--panel:#161616;--border:#414141;--muted:#a3a3a3;--accent:#b6aaff}
:root[data-theme="light"]{color-scheme:light;--bg:#fff;--text:#242422;--panel:#f3f3f1;--border:#dededb;--muted:#62625e;--accent:#6755c8}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}
header{position:sticky;top:0;padding:14px 24px;background:var(--bg);border-bottom:1px solid var(--border);font-weight:600;font-size:13px}
main{max-width:900px;margin:auto;padding:32px clamp(20px,5vw,52px) 48px}p{white-space:pre-wrap;margin:0 0 1em}
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.5em 0 .65em;font-weight:650}h1{font-size:28px;letter-spacing:-.025em}h2{font-size:22px;border-bottom:1px solid var(--border);padding-bottom:.4em}h3{font-size:18px}.markdown>:first-child{margin-top:0}
.markdown p{white-space:normal}ul,ol{padding-left:1.6em;margin:0 0 1em}li{margin:.3em 0}li>p{margin:.3em 0}a{color:var(--accent);text-underline-offset:3px}
code{font: .9em/1.6 ui-monospace,Consolas,monospace;background:var(--panel);border-radius:4px;padding:2px 5px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px}pre code{background:none;padding:0}
blockquote{margin:1em 0;border-left:3px solid var(--border);padding:0 1em;color:var(--muted)}hr{border:0;border-top:1px solid var(--border);margin:1.8em 0}
.table-wrap{overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:10px;margin:1em 0}table{border-collapse:collapse;min-width:100%}td,th{border:1px solid var(--border);padding:8px 12px;white-space:pre-wrap;text-align:left}th{font-weight:650}
.slide{aspect-ratio:16/9;overflow:auto;background:#f7f5ef;color:#18202c;border-radius:12px;padding:6% 7%;margin:0 0 24px;box-shadow:0 12px 36px #0008}.slide p{font-size:clamp(15px,2vw,24px)}.slide-no{color:#64748b;font-size:12px}
.image{display:flex;justify-content:center;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px}.image img{max-width:100%;max-height:72vh}.placeholder{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.btn{display:inline-block;text-decoration:none;background:var(--accent);color:var(--bg);border-radius:8px;padding:9px 14px;font-weight:650}.empty{color:var(--muted)}
</style></head><body>${options.embedded ? '' : `<header>${esc(artifact.name)}</header>`}<main>${body}</main></body></html>`;
}
