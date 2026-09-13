import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import type { CoworkArtifact } from './store.js';

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

/** Safe standalone preview page. It extracts text and table structure only;
 * macros, scripts, external resources and embedded objects never execute. */
export function coworkDocumentPreview(filePath: string, artifact: CoworkArtifact): string | undefined {
  const ext = path.extname(artifact.name).toLowerCase();
  let body: string;
  if (['.txt', '.md', '.csv', '.json', '.xml', '.log'].includes(ext) || /^text\//i.test(artifact.mime)) body = textHtml(filePath);
  else if (ext === '.docx') body = docxHtml(filePath);
  else if (ext === '.xlsx') body = xlsxHtml(filePath);
  else if (ext === '.pptx') body = pptxHtml(filePath);
  else return undefined;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(artifact.name)}</title><style>body{margin:0;background:#0d1119;color:#e8ecf4;font:14px/1.6 Inter,system-ui,sans-serif}header{position:sticky;top:0;padding:14px 22px;background:#121824;border-bottom:1px solid #293244;font-weight:650}main{max-width:980px;margin:auto;padding:24px}p{white-space:pre-wrap}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#121824;border:1px solid #293244;border-radius:12px;padding:18px}.table-wrap{overflow:auto;background:#121824;border:1px solid #293244;border-radius:12px}table{border-collapse:collapse;min-width:100%}td{border:1px solid #293244;padding:6px 9px;white-space:pre-wrap}.slide{aspect-ratio:16/9;overflow:auto;background:#f7f5ef;color:#18202c;border-radius:12px;padding:6% 7%;margin:0 0 24px;box-shadow:0 12px 36px #0008}.slide p{font-size:clamp(15px,2vw,24px)}.slide-no{color:#64748b;font-size:12px}.empty{color:#8f9aaf}</style></head><body><header>${esc(artifact.name)} · safe local preview</header><main>${body}</main></body></html>`;
}
