import { readFileSync } from 'node:fs';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { Marked } from 'marked';
import { isTextLikeFile } from '../server/static-assets.js';
import type { CoworkArtifact } from './store.js';

/** Inline previews never embed more than the Cowork artifact limit. */
const MAX_INLINE_BYTES = 2_000_000;

const esc = (value: unknown): string =>
  String(value ?? '')
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

function attr(xml: string, name: string): string {
  return xmlText(new RegExp('(?:^|\\s)' + name + '="([^"]*)"').exec(xml)?.[1] ?? '');
}
function safeHex(value: string) {
  return /^[0-9a-f]{6}$/i.test(value) ? '#' + value : '';
}
function wordRunStyle(xml: string): string {
  const colour = safeHex(attr(/<w:color\b[^>]*\/>/.exec(xml)?.[0] ?? '', 'w:val')),
    size = Number(attr(/<w:sz\b[^>]*\/>/.exec(xml)?.[0] ?? '', 'w:val')) / 2;
  return (
    (colour ? 'color:' + colour + ';' : '') +
    (size >= 8 && size <= 72 ? 'font-size:' + size + 'pt;' : '') +
    (/<w:b(?:\s[^>]*)?\/>/.test(xml) && !/<w:b\b[^>]*w:val="(?:0|false)"/.test(xml) ? 'font-weight:700;' : '') +
    (/<w:i(?:\s[^>]*)?\/>/.test(xml) ? 'font-style:italic;' : '')
  );
}
function docxHtml(filePath: string): string {
  const archive = unzip(filePath),
    bytes = archive['word/document.xml'];
  if (!bytes) throw Error('DOCX document.xml is missing');
  const xml = strFromU8(bytes),
    styles = archive['word/styles.xml'] ? strFromU8(archive['word/styles.xml']!) : '',
    styleMap = new Map<string, string>();
  for (const style of styles.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) styleMap.set(attr(style[1]!, 'w:styleId'), wordRunStyle(style[2]!));
  const relationships = new Map<string, string>();
  let imageBytes = 0;
  for (const rel of (archive['word/_rels/document.xml.rels'] ? strFromU8(archive['word/_rels/document.xml.rels']!) : '').matchAll(/<Relationship\b[^>]*\/>/g)) {
    if (attr(rel[0], 'TargetMode') === 'External') continue;
    const target = attr(rel[0], 'Target'),
      name = path.posix.normalize(target.startsWith('/') ? target.slice(1) : 'word/' + target);
    if (name.startsWith('word/media/')) relationships.set(attr(rel[0], 'Id'), name);
  }
  function paragraph(block: string) {
    const styleId = attr(/<w:pStyle\b[^>]*\/>/.exec(block)?.[0] ?? '', 'w:val'),
      heading = styleId === 'Title' ? 'h1' : /^Heading[1-6]$/i.test(styleId) ? 'h' + Math.min(6, Number(styleId.slice(-1)) + 1) : 'p';
    const runs = [...block.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)]
      .map((run) => {
        const text = taggedText(run[1]!).join(''),
          format = wordRunStyle(run[1]!);
        return (format ? '<span style="' + format + '">' + esc(text) + '</span>' : esc(text)) + (run[1]!.includes('<w:br') ? '<br>' : '');
      })
      .join('');
    let images = '';
    for (const blip of block.matchAll(/<a:blip\b[^>]*\/>/g)) {
      const name = relationships.get(attr(blip[0], 'r:embed')),
        data = name ? archive[name] : undefined;
      if (!data || imageBytes + data.length > MAX_INLINE_BYTES) continue;
      const png = data[0] === 137 && data[1] === 80,
        jpeg = data[0] === 255 && data[1] === 216;
      if (!png && !jpeg) continue;
      imageBytes += data.length;
      const isHeading = heading !== 'p';
      images +=
        (isHeading ? '' : '<figure style="text-align:center">') +
        '<img style="' +
        (isHeading ? 'width:20px;height:20px;vertical-align:middle;margin-right:8px;' : 'max-width:100%;max-height:360px;') +
        'object-fit:contain" alt="Document image" src="data:image/' +
        (png ? 'png' : 'jpeg') +
        ';base64,' +
        Buffer.from(data).toString('base64') +
        '">' +
        (isHeading ? '' : '</figure>');
    }
    const bullet = /<w:numPr>/.test(block) ? '<span aria-hidden="true">• </span>' : '';
    return (
      (runs.trim()
        ? '<' + heading + (styleMap.get(styleId) ? ' style="' + styleMap.get(styleId) + '"' : '') + '>' + (heading !== 'p' ? images : '') + bullet + runs + '</' + heading + '>'
        : '') + (heading === 'p' ? images : '')
    );
  }
  const body = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const blocks = [...body.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
    .map((match) => {
      const block = match[0];
      if (!block.startsWith('<w:tbl')) return paragraph(block);
      const rows = [...block.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)]
        .map(
          (row) =>
            '<tr>' +
            [...row[1]!.matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)]
              .map((cell) => {
                const fill = safeHex(attr(/<w:shd\b[^>]*\/>/.exec(cell[1]!)?.[0] ?? '', 'w:fill'));
                return (
                  '<td' +
                  (fill ? ' style="background:' + fill + '"' : '') +
                  '>' +
                  [...cell[1]!.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((p) => paragraph(p[0])).join('') +
                  '</td>'
                );
              })
              .join('') +
            '</tr>',
        )
        .join('');
      return '<div class="table-wrap"><table>' + rows + '</table></div>';
    })
    .join('');
  const background = safeHex(attr(/<w:background\b[^>]*\/>/.exec(xml)?.[0] ?? '', 'w:color')) || '#FFFFFF',
    defaults = wordRunStyle(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/.exec(styles)?.[1] ?? '') || 'color:#202632;';
  return (
    '<article class="office-document" style="background:' +
    background +
    ';' +
    defaults +
    '">' +
    (blocks || '<p class="empty">This document contains no readable paragraphs.</p>') +
    '</article>'
  );
}
function xlsxHtml(filePath: string): string {
  const archive = unzip(filePath),
    shared = archive['xl/sharedStrings.xml']
      ? [...strFromU8(archive['xl/sharedStrings.xml']!).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((item) => taggedText(item[1]!).join(''))
      : [],
    styles = archive['xl/styles.xml'] ? strFromU8(archive['xl/styles.xml']!) : '',
    fonts = [...(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(styles)?.[1] ?? '').matchAll(/<font>([\s\S]*?)<\/font>/g)].map((font) => {
      const colour = attr(/<color\b[^>]*\/>/.exec(font[1]!)?.[0] ?? '', 'rgb').slice(-6);
      return (safeHex(colour) ? 'color:' + safeHex(colour) + ';' : '') + (font[1]!.includes('<b') ? 'font-weight:700;' : '');
    }),
    fills = [...(/<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(styles)?.[1] ?? '').matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((fill) =>
      safeHex(attr(/<fgColor\b[^>]*\/>/.exec(fill[1]!)?.[0] ?? '', 'rgb').slice(-6)),
    ),
    formats = new Map([...styles.matchAll(/<numFmt\b[^>]*\/>/g)].map((format) => [Number(attr(format[0], 'numFmtId')), attr(format[0], 'formatCode')])),
    cellFormats = [...(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)],
    cellStyles = cellFormats.map(
      (xf) => (fonts[Number(attr(xf[1]!, 'fontId'))] ?? '') + (fills[Number(attr(xf[1]!, 'fillId'))] ? 'background:' + fills[Number(attr(xf[1]!, 'fillId'))] + ';' : ''),
    );
  const names = archive['xl/workbook.xml'] ? [...strFromU8(archive['xl/workbook.xml']!).matchAll(/<sheet\b[^>]*\/>/g)].map((sheet) => attr(sheet[0], 'name')) : [],
    sheets = Object.keys(archive)
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  return (
    sheets
      .map((name, sheetIndex) => {
        const xml = strFromU8(archive[name]!);
        const columnNumber = (letters: string) => [...letters].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0) - 1;
        const merges = new Map<string, number>();
        for (const merge of xml.matchAll(/<mergeCell\b[^>]*\/>/g)) {
          const range = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(attr(merge[0], 'ref'));
          if (range && range[2] === range[4]) merges.set(range[1]! + range[2]!, Math.min(100, columnNumber(range[3]!) - columnNumber(range[1]!) + 1));
        }
        const rows = [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)]
          .map((row) => {
            const cells: string[] = [];
            let coveredUntil = -1;
            for (const cell of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
              const attrs = cell[1]!,
                body = cell[2] ?? '',
                letters = /^[A-Z]+/.exec(attr(attrs, 'r'))?.[0];
              const column = letters ? columnNumber(letters) : cells.length;
              if (column >= 100 || column <= coveredUntil) continue;
              while (cells.length < column) cells.push('<td></td>');
              const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? taggedText(body).join(''),
                formula = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(body)?.[1],
                formatId = Number(attr(cellFormats[Number(attr(attrs, 's'))]?.[1] ?? '', 'numFmtId')),
                format = formats.get(formatId) ?? '',
                isDate = (formatId >= 14 && formatId <= 22) || /[yd]/i.test(format.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')),
                numericDate = isDate && raw && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) < 2958466,
                value = /\bt="s"/.test(attrs)
                  ? (shared[Number(raw)] ?? raw)
                  : /\bt="b"/.test(attrs)
                    ? raw === '1'
                      ? 'TRUE'
                      : 'FALSE'
                    : numericDate
                      ? new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10)
                      : raw
                        ? xmlText(raw)
                        : formula
                          ? '=' + xmlText(formula)
                          : '',
                style = cellStyles[Number(attr(attrs, 's'))] ?? '';
              const span = Math.min(100 - column, merges.get(attr(attrs, 'r')) ?? 1);
              cells[column] = '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + (style ? ' style="' + style + '"' : '') + '>' + esc(value) + '</td>';
              if (span > 1) {
                coveredUntil = column + span - 1;
                while (cells.length <= coveredUntil) cells.push('');
              }
            }
            return cells.length ? '<tr>' + cells.join('') + '</tr>' : '';
          })
          .join('');
        return '<section><h2>' + esc(names[sheetIndex] || 'Sheet ' + (sheetIndex + 1)) + '</h2><div class="table-wrap"><table>' + rows + '</table></div></section>';
      })
      .join('') || '<p class="empty">This workbook contains no readable worksheets.</p>'
  );
}

function pptxHtml(filePath: string): string {
  const archive = unzip(filePath);
  const slides = Object.keys(archive)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  return (
    slides
      .map((name, index) => {
        const lines = taggedText(strFromU8(archive[name]!));
        return `<section class="slide"><div class="slide-no">Slide ${index + 1}</div>${lines.map((line) => `<p>${esc(line)}</p>`).join('') || '<p class="empty">No readable text</p>'}</section>`;
      })
      .join('') || '<p class="empty">This presentation contains no readable slides.</p>'
  );
}

function textHtml(filePath: string): string {
  return `<pre>${esc(readFileSync(filePath, 'utf8'))}</pre>`;
}

// Only generated Markdown markup is trusted. Raw HTML stays visible as text,
// images never fetch resources, and links can only navigate to web URLs.
const markdown = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html({ text }) {
      return esc(text);
    },
    image({ text }) {
      return `<span class="empty">${esc(text)}</span>`;
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!/^https?:\/\//i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return label;
      try {
        const url = new URL(href);
        if (!['http:', 'https:'].includes(url.protocol)) return label;
        return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      } catch {
        return label;
      }
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
    } else if (ext === '.docx') {
      body = docxHtml(filePath);
      inlineImage = true;
    } else if (ext === '.xlsx') body = xlsxHtml(filePath);
    else if (ext === '.pptx') body = pptxHtml(filePath);
    else if (['.md', '.markdown'].includes(ext) || /^text\/(?:x-)?markdown\b/.test(mime)) body = markdownHtml(filePath);
    else if (isTextLikeFile(artifact.name, artifact.mime)) body = textHtml(filePath);
    else if (/^application\/pdf\b/i.test(mime)) body = unsupportedHtml(artifact, 'Open the download below to read this PDF in your PDF viewer.');
    else if (['.doc', '.xls', '.ppt'].includes(ext))
      body = unsupportedHtml(artifact, 'This legacy Office format cannot be read safely — download it, or ask for a .docx/.xlsx/.pptx version.');
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
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.5em 0 .65em;font-weight:650}h1{font-size:28px;letter-spacing:-.025em}h2{font-size:22px;border-bottom:1px solid var(--border);padding-bottom:.4em}h3{font-size:18px}.markdown>:first-child,.office-document>:first-child{margin-top:0}.office-document{padding:24px;border-radius:4px;color:#202632}.office-document .table-wrap{background:transparent}.office-document p{margin:0 0 .65em}.office-document td p{margin:0}.office-document figure{margin:16px 0}
.markdown p{white-space:normal}ul,ol{padding-left:1.6em;margin:0 0 1em}li{margin:.3em 0}li>p{margin:.3em 0}a{color:var(--accent);text-underline-offset:3px}
code{font: .9em/1.6 ui-monospace,Consolas,monospace;background:var(--panel);border-radius:4px;padding:2px 5px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px}pre code{background:none;padding:0}
blockquote{margin:1em 0;border-left:3px solid var(--border);padding:0 1em;color:var(--muted)}hr{border:0;border-top:1px solid var(--border);margin:1.8em 0}
.table-wrap{overflow:auto;background:var(--panel);border:1px solid var(--border);border-radius:10px;margin:1em 0}table{border-collapse:collapse;min-width:100%}td,th{border:1px solid var(--border);padding:8px 12px;white-space:pre-wrap;text-align:left}th{font-weight:650}
.slide{aspect-ratio:16/9;overflow:auto;background:#f7f5ef;color:#18202c;border-radius:12px;padding:6% 7%;margin:0 0 24px;box-shadow:0 12px 36px #0008}.slide p{font-size:clamp(15px,2vw,24px)}.slide-no{color:#64748b;font-size:12px}
.image{display:flex;justify-content:center;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:18px}.image img{max-width:100%;max-height:72vh}.placeholder{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px}.btn{display:inline-block;text-decoration:none;background:var(--accent);color:var(--bg);border-radius:8px;padding:9px 14px;font-weight:650}.empty{color:var(--muted)}
</style></head><body>${options.embedded ? '' : `<header>${esc(artifact.name)}</header>`}<main>${body}</main></body></html>`;
}
