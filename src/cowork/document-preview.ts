import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
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
export function coworkDocumentPreview(filePath: string, artifact: CoworkArtifact): string {
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${esc(artifact.name)}</title><style>body{margin:0;background:#0d1119;color:#e8ecf4;font:14px/1.6 Inter,system-ui,sans-serif}header{position:sticky;top:0;padding:14px 22px;background:#121824;border-bottom:1px solid #293244;font-weight:650}main{max-width:980px;margin:auto;padding:24px}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#121824;border:1px solid #293244;border-radius:12px;padding:18px}.table-wrap{overflow:auto;background:#121824;border:1px solid #293244;border-radius:12px}table{border-collapse:collapse;min-width:100%}td{border:1px solid #293244;padding:6px 9px;white-space:pre-wrap}.slide{aspect-ratio:16/9;overflow:auto;background:#f7f5ef;color:#18202c;border-radius:12px;padding:6% 7%;margin:0 0 24px;box-shadow:0 12px 36px #0008}.slide p{font-size:clamp(15px,2vw,24px)}.slide-no{color:#64748b;font-size:12px}.image{display:flex;justify-content:center;background:#121824;border:1px solid #293244;border-radius:12px;padding:18px}.image img{max-width:100%;max-height:72vh}.placeholder{background:#121824;border:1px solid #293244;border-radius:12px;padding:22px}.btn{display:inline-block;text-decoration:none;background:#8f80ff;color:#0b0f16;border-radius:8px;padding:9px 14px;font-weight:650}.empty{color:#8f9aaf}</style></head><body><header>${esc(artifact.name)} · safe local preview</header><main>${body}</main></body></html>`;
}
