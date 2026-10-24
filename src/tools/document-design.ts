import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { ToolContext } from './tools.js';
export type Cell = string | number | boolean | null | { formula: string; result?: string | number | boolean } | { date: string };
export interface DocImage {
  data: Buffer;
  type: 'png' | 'jpeg';
  width: number;
  height: number;
  caption: string;
  source: string;
}
export interface DocTable {
  headers: string[];
  rows: Cell[][];
}
export interface DocSection {
  heading: string;
  body: string;
  bullets: string[];
  table?: DocTable;
  image?: DocImage;
  icon?: string;
  pageBreak: boolean;
}
export interface DocStyle {
  preset: string;
  layout: string;
  accent: string;
  background: string;
  text: string;
  heading: string;
  font: string;
  fontSize: number;
  headingSize: number;
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margin: number;
  lineHeight: number;
  columns: number;
  footer: boolean;
}
const presets: Record<string, Partial<DocStyle>> = {
  professional: { accent: '24476A' },
  formal: { accent: '333333', font: 'Georgia' },
  modern: { accent: '2563EB' },
  colourful: { accent: '7C3AED' },
  minimal: { accent: '333333', layout: 'minimal' },
  brochure: { accent: '0F766E', layout: 'brochure' },
};
export const DOCUMENT_ICONS: Record<string, string> = {
  check: 'm5 12 4 4L19 6',
  star: 'm12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1Z',
  chart: 'M4 3v18h17M9 17v-5M14 17V7M19 17v-8',
  briefcase: 'M3 7h18v14H3ZM8 7V3h8v4M3 12h18M10 12v3h4v-3',
  calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4',
  bulb: 'M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0l-1 3H9Z',
  info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  warning: 'm12 3 10 18H2ZM12 9v5M12 17h.01',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0M12 10v4M10 12h4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
};
export function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function colour(value: unknown, fallback: string) {
  if (value === undefined) return fallback;
  const text = String(value).replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(text)) throw Error('Use a six-digit hex colour, such as #2563EB.');
  return text.toUpperCase();
}
function bounded(value: unknown, fallback: number, min: number, max: number, label: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(label + ' is outside its supported range.');
  return value;
}
export function documentStyle(input: unknown): DocStyle {
  const value = (input ?? {}) as Record<string, unknown>;
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('style must be an object.');
  const preset = String(value['preset'] ?? 'professional'),
    base = presets[preset];
  if (!base) throw Error('Choose professional, formal, modern, colourful, minimal or brochure preset.');
  const font = String(value['fontFamily'] ?? base.font ?? 'Arial');
  if (!['Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'].includes(font))
    throw Error('Choose a supported fontFamily: Arial, Calibri, Georgia, Times New Roman, Verdana or Courier New.');
  const layout = String(value['layout'] ?? base.layout ?? 'report');
  if (!['report', 'letter', 'brochure', 'cards', 'minimal'].includes(layout)) throw Error('Choose report, letter, brochure, cards or minimal layout.');
  const pageSize = String(value['pageSize'] ?? 'A4'),
    orientation = String(value['orientation'] ?? 'portrait');
  if (!['A4', 'Letter', 'Legal'].includes(pageSize) || !['portrait', 'landscape'].includes(orientation))
    throw Error('Choose A4, Letter or Legal and portrait or landscape orientation.');
  const background = colour(value['backgroundColor'], 'FFFFFF'),
    ink = readableInk(background);
  const columns = Number(value['columns'] ?? 1);
  if (![1, 2].includes(columns)) throw Error('columns must be 1 or 2.');
  return {
    preset,
    layout,
    font,
    accent: colour(value['accentColor'], base.accent!),
    background,
    text: colour(value['textColor'], ink === 'FFFFFF' ? 'FFFFFF' : '202632'),
    heading: colour(value['headingColor'], ink),
    fontSize: bounded(value['fontSize'], 11, 9, 18, 'fontSize'),
    headingSize: bounded(value['headingSize'], 18, 14, 32, 'headingSize'),
    margin: bounded(value['margin'], 48, 24, 90, 'margin'),
    lineHeight: value['density'] === 'compact' ? 1.3 : 1.5,
    pageSize: pageSize as DocStyle['pageSize'],
    orientation: orientation as DocStyle['orientation'],
    columns,
    footer: value['footer'] !== false,
  };
}
export function pageDimensions(style: DocStyle): [number, number] {
  const size: Record<string, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008] };
  const [w, h] = size[style.pageSize]!;
  return style.orientation === 'landscape' ? [h, w] : [w, h];
}
export function surfaceTint(style: DocStyle) {
  const target = readableInk(style.background) === 'FFFFFF' ? 255 : 0;
  return [0, 2, 4]
    .map((i) =>
      Math.round(parseInt(style.background.slice(i, i + 2), 16) * 0.95 + target * 0.05)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}
export function readableInk(hex: string) {
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb.reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0) > 0.179 ? '000000' : 'FFFFFF';
}
export function validateRows(value: unknown): Cell[][] {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw Error('Provide 1–10,000 rows.');
  return value.map((row) => {
    if (!Array.isArray(row) || !row.length || row.length > 100) throw Error('Each row needs 1–100 cells.');
    return row.map((cell) => {
      if (cell === null || typeof cell === 'boolean') return cell;
      if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
      if (typeof cell === 'string' && cell.length <= 32767) return cell;
      if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
        if (
          typeof cell.formula === 'string' &&
          cell.formula.trim() &&
          cell.formula.length <= 8192 &&
          (cell.result === undefined ||
            typeof cell.result === 'boolean' ||
            (typeof cell.result === 'string' && cell.result.length <= 32767) ||
            (typeof cell.result === 'number' && Number.isFinite(cell.result)))
        )
          return { formula: cell.formula.replace(/^=/, ''), ...(cell.result !== undefined ? { result: cell.result } : {}) };
        if (typeof cell.date === 'string' && Number.isFinite(Date.parse(cell.date))) return { date: cell.date };
      }
      throw Error('Cells must contain text, finite numbers, booleans, null, {date:ISO date} or {formula, result?}.');
    });
  });
}
export function cellText(cell: Cell): string {
  return cell === null ? '' : typeof cell === 'object' ? ('date' in cell ? cell.date : cell.result !== undefined ? String(cell.result) : '=' + cell.formula) : String(cell);
}
function imageSize(bytes: Buffer, type: 'png' | 'jpeg'): [number, number] {
  if (type === 'png' && bytes.length >= 24) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  for (let at = 2; at + 9 < bytes.length;) {
    if (bytes[at] !== 255) {
      at++;
      continue;
    }
    const marker = bytes[at + 1]!;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
    if (marker === 0xd8 || marker === 0xd9) {
      at += 2;
      continue;
    }
    const length = bytes.readUInt16BE(at + 2);
    if (length < 2) break;
    at += length + 2;
  }
  throw Error('The image has an invalid PNG/JPEG header.');
}
export function loadDocumentImage(ctx: ToolContext, value: unknown): DocImage | undefined {
  if (value === undefined) return;
  const input = typeof value === 'string' ? { path: value } : (value as Record<string, unknown>);
  if (!input || typeof input !== 'object' || typeof input['path'] !== 'string') throw Error('An image requires a local path and optional caption.');
  if (/^(?:https?:|data:|file:)/i.test(input['path'])) throw Error('Document images need an authorised local PNG/JPEG path.');
  const source = path.resolve(ctx.cwd, input['path']);
  ctx.guard.assertReadable(source);
  const stat = statSync(source);
  if (!stat.isFile() || stat.size > 20_000_000) throw Error('Each document image must be a PNG/JPEG file under 20 MB.');
  const data = readFileSync(source),
    type = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png' : data[0] === 255 && data[1] === 216 ? 'jpeg' : undefined;
  if (!type) throw Error('Use PNG or JPEG images. Download or create the image in the authorised workspace first.');
  const [width, height] = imageSize(data, type);
  if (!width || !height || width * height > 40_000_000) throw Error('Image dimensions exceed the supported pixel limit.');
  return { data, type, width, height, caption: String(input['caption'] ?? '').slice(0, 1000), source };
}
export function documentSections(ctx: ToolContext, input: unknown): DocSection[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw Error('Provide 1–100 sections.');
  let total = 0,
    imageBytes = 0;
  return input.map((value) => {
    if (!value || typeof value !== 'object') throw Error('Each section must be an object.');
    const heading = String(value.heading ?? ''),
      body = String(value.body ?? ''),
      bullets = Array.isArray(value.bullets) ? value.bullets.map(String) : [];
    total += heading.length + body.length + bullets.join('').length;
    if (heading.length > 180 || body.length > 50000 || bullets.length > 200 || total > 1000000) throw Error('Document content exceeds the supported length.');
    const image = loadDocumentImage(ctx, value.image);
    imageBytes += image?.data.length ?? 0;
    if (imageBytes > 50000000) throw Error('Document images exceed 50 MB in total.');
    const icon = value.icon === undefined ? undefined : String(value.icon);
    if (icon && !DOCUMENT_ICONS[icon]) throw Error('Unknown icon. Use ' + Object.keys(DOCUMENT_ICONS).join(', ') + '.');
    let table: DocTable | undefined;
    if (value.table) {
      const headers = Array.isArray(value.table.headers) ? value.table.headers.map(String) : [];
      const rows = validateRows(value.table.rows);
      if (!headers.length || headers.length > 12 || rows.some((row) => row.length !== headers.length)) throw Error('Document tables need 1–12 headers and matching row widths.');
      total += headers.join('').length + rows.reduce((size, row) => size + row.map(cellText).join('').length, 0);
      if (total > 1000000) throw Error('Document content exceeds the supported length.');
      table = { headers, rows };
    }
    if (!heading.trim() && !body.trim() && !bullets.length && !image && !table) throw Error('Sections cannot be empty.');
    return { heading, body, bullets, image, icon, table, pageBreak: value.pageBreak === true };
  });
}
export function iconSvg(name: string, colourHex: string, size = 24) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 24 24" fill="none" stroke="#' +
    colourHex +
    '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' +
    DOCUMENT_ICONS[name] +
    '"/></svg>'
  );
}
function inline(text: string) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>');
}
export function documentHtml(title: string, subtitle: string, sections: DocSection[], style: DocStyle): string {
  const [w, h] = pageDimensions(style),
    ink = readableInk(style.accent),
    muted = readableInk(style.background) === 'FFFFFF' ? 'CBD5E1' : '596273';
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;"><title>' +
    esc(title) +
    '</title><style>@page{size:' +
    w +
    'pt ' +
    h +
    'pt;margin:' +
    style.margin +
    'pt}*{box-sizing:border-box}html{background:#' +
    style.background +
    '}body{margin:0;font-family:"' +
    style.font +
    '",sans-serif;font-size:' +
    style.fontSize +
    'pt;line-height:' +
    style.lineHeight +
    ';color:#' +
    style.text +
    ';background:#' +
    style.background +
    ';-webkit-print-color-adjust:exact;print-color-adjust:exact}header{margin-bottom:22pt;padding-bottom:12pt;' +
    (style.layout === 'minimal' || style.layout === 'letter' ? '' : 'border-bottom:3pt solid #' + style.accent + ';') +
    '}header h1{font-size:' +
    Math.min(36, style.headingSize + 10) +
    'pt;line-height:1.15;margin:0;color:#' +
    style.heading +
    ';overflow-wrap:anywhere}header p{margin:8pt 0 0;color:#' +
    muted +
    '}main{' +
    (style.columns === 2 ? 'column-count:2;column-gap:28pt;' : '') +
    '}section{margin:0 0 15pt;' +
    (style.layout === 'cards' ? 'border:1pt solid #D9DDE3;border-radius:8pt;padding:14pt;' : '') +
    '}h2{font-size:' +
    style.headingSize +
    'pt;line-height:1.25;margin:16pt 0 7pt;break-after:avoid;page-break-after:avoid;color:#' +
    style.heading +
    ';overflow-wrap:anywhere}h2 svg{vertical-align:-4px;margin-right:7pt}p{margin:0 0 7pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}ul{margin:5pt 0 9pt;padding-left:18pt}li{margin:0 0 4pt;overflow-wrap:anywhere;orphans:2;widows:2}table{width:100%;border-collapse:collapse;margin:10pt 0 14pt;font-size:' +
    Math.max(9, style.fontSize - 1) +
    'pt;table-layout:fixed}thead{display:table-header-group}th,td{padding:7pt;border:1pt solid #D9D9D9;text-align:left;vertical-align:middle;overflow-wrap:anywhere}th{background:#' +
    style.accent +
    ';color:#' +
    ink +
    ';font-weight:700}tbody tr:nth-child(even){background:#' +
    surfaceTint(style) +
    '}tr{break-inside:avoid}figure{margin:10pt 0 14pt;break-inside:avoid;text-align:center}figure img{max-width:100%;max-height:' +
    Math.min(200, Math.round((h - style.margin * 2) * 0.3)) +
    'pt;object-fit:contain}figcaption{font-size:9pt;margin-top:5pt;color:#' +
    muted +
    '}code{font-family:monospace;background:#F2F3F5;color:#202632;padding:1pt 3pt}.page-break{break-before:page}@media screen{body{max-width:' +
    w +
    'pt;margin:24pt auto;padding:' +
    style.margin +
    'pt;box-shadow:0 4px 30px #00000012}html{background:#EEF0F4}}@media print{body{max-width:none}}</style></head><body><header><h1>' +
    esc(title) +
    '</h1>' +
    (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') +
    '</header><main>' +
    sections
      .map(
        (section) =>
          (section.pageBreak ? '</main><main class="page-break">' : '') +
          '<section>' +
          (section.heading ? '<h2>' + (section.icon ? iconSvg(section.icon, style.accent) : '') + esc(section.heading) + '</h2>' : '') +
          section.body
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph) => '<p>' + inline(paragraph) + '</p>')
            .join('') +
          (section.bullets.length ? '<ul>' + section.bullets.map((bullet) => '<li>' + inline(bullet) + '</li>').join('') + '</ul>' : '') +
          (section.table
            ? '<table><thead><tr>' +
              section.table.headers.map((header) => '<th>' + esc(header) + '</th>').join('') +
              '</tr></thead><tbody>' +
              section.table.rows.map((row) => '<tr>' + row.map((cell) => '<td>' + esc(cellText(cell)) + '</td>').join('') + '</tr>').join('') +
              '</tbody></table>'
            : '') +
          (section.image
            ? '<figure><img alt="' +
              esc(section.image.caption) +
              '" src="data:image/' +
              section.image.type +
              ';base64,' +
              section.image.data.toString('base64') +
              '">' +
              (section.image.caption ? '<figcaption>' + esc(section.image.caption) + '</figcaption>' : '') +
              '</figure>'
            : '') +
          '</section>',
      )
      .join('') +
    '</main></body></html>'
  );
}
function browserExecutable(): string | undefined {
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const candidates =
    process.platform === 'win32'
      ? [process.env['PROGRAMFILES(X86)'], process.env['PROGRAMFILES'], process.env['LOCALAPPDATA']].flatMap((root) =>
          root ? [path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')] : [],
        )
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
        : ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return candidates.find((file) => existsSync(file));
}
/** A temporary, offline print context: it never opens the user's browser profile. */
export class DocumentRenderer {
  private browser?: Browser;
  private context?: BrowserContext;
  private icons = new Map<string, Buffer>();
  private abort = () => {
    void this.browser?.close().catch(() => undefined);
  };
  constructor(private signal?: AbortSignal) {
    signal?.addEventListener('abort', this.abort, { once: true });
  }
  private async ready() {
    this.signal?.throwIfAborted();
    if (this.context) return this.context;
    const executablePath = browserExecutable();
    if (!executablePath) throw Error('PDF/illustrated icon rendering needs Chromium or Microsoft Edge. Use DOCX, XLSX or HTML, or install the bundled Playwright browser.');
    this.browser = await chromium.launch({ executablePath, headless: true, timeout: 30000 });
    this.signal?.throwIfAborted();
    this.context = await this.browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', acceptDownloads: false });
    await this.context.route('**/*', (route) => route.abort());
    return this.context;
  }
  async pdf(html: string, title: string, style: DocStyle) {
    const context = await this.ready(),
      page = await context.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      await page.emulateMedia({ media: 'print' });
      const failed = await page.locator('img').evaluateAll((images) => images.some((image) => !(image as unknown as { naturalWidth: number }).naturalWidth));
      if (failed) throw Error('An embedded image could not be decoded.');
      return await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: style.footer,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font:8px Arial;color:#606975;width:100%;margin:0 40px;display:flex;justify-content:space-between"><span>' +
          esc(title) +
          '</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      });
    } finally {
      await page.close();
    }
  }
  async icon(name: string, colourHex: string) {
    const key = name + colourHex,
      old = this.icons.get(key);
    if (old) return old;
    const context = await this.ready(),
      page = await context.newPage();
    try {
      await page.setViewportSize({ width: 96, height: 96 });
      await page.setContent('<html><body style="margin:0">' + iconSvg(name, colourHex, 96) + '</body></html>');
      const bytes = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: 96, height: 96 } });
      this.icons.set(key, bytes);
      return bytes;
    } finally {
      await page.close();
    }
  }
  async close() {
    this.signal?.removeEventListener('abort', this.abort);
    await this.browser?.close();
  }
}
/** Wrap at words, retaining every long token and explicit line break. */
export function wrapText(text: string, width = 84): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        result.push(line);
        line = '';
      }
      let rest = word;
      while (rest.length > width) {
        if (line) {
          result.push(line);
          line = '';
        }
        result.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      line += (line ? ' ' : '') + rest;
    }
    result.push(line);
  }
  return result;
}
export function documentText(title: string, subtitle: string, sections: DocSection[], markdown = false) {
  const blocks = [markdown ? '# ' + title : title + '\n' + '='.repeat(Math.min(title.length, 84))];
  if (subtitle) blocks.push(subtitle);
  for (const section of sections) {
    if (section.heading) blocks.push(markdown ? '## ' + section.heading : section.heading + '\n' + '-'.repeat(Math.min(section.heading.length, 84)));
    if (section.body) blocks.push(markdown ? section.body : wrapText(section.body).join('\n'));
    if (section.bullets.length) blocks.push(section.bullets.map((bullet) => (markdown ? '- ' + bullet : '- ' + wrapText(bullet, 82).join('\n  '))).join('\n'));
    if (section.table) {
      blocks.push(
        [section.table.headers, ...(markdown ? [section.table.headers.map(() => '---')] : []), ...section.table.rows.map((row) => row.map(cellText))]
          .map((row) => (markdown ? '| ' + row.join(' | ') + ' |' : row.join(' | ')))
          .join('\n'),
      );
    }
    if (section.image)
      blocks.push(
        markdown
          ? '![' + section.image.caption.replace(/[\[\]]/g, '') + '](data:image/' + section.image.type + ';base64,' + section.image.data.toString('base64') + ')'
          : 'Image: ' + (section.image.caption || path.basename(section.image.source)),
      );
  }
  return blocks.join('\n\n') + '\n';
}
