import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import PptxGenJS from 'pptxgenjs';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import type { ToolContext } from './tools.js';
import type { ToolResult } from '../types.js';

export const DOCUMENT_TOOL_DOC = 'Create a real PDF, PowerPoint, Word document or spreadsheet using bundled libraries; no Python, Office or Docker setup required. params: {path:"report.pdf"|"slides.pptx"|"report.docx"|"table.xlsx", title:string, sections?:[{heading:string,body?:string,bullets?:string[]}], rows?:(string|number|boolean|null)[][]}. PDF/PPTX/DOCX require sections; XLSX requires rows. Reuse an existing requested output path. Returns file details and structural verification; inspect layout/content before claiming visual verification. This creates local files; it does not edit an existing cloud document.';

interface Section { heading: string; body: string }

function sectionsFrom(input: unknown): Section[] {
  if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error('Provide 1–100 sections with heading and body or bullets.');
  return input.map(s => {
    if (!s || typeof s !== 'object') throw new Error('Each section must be an object.');
    const heading = String(s.heading ?? '');
    const body = [String(s.body ?? ''), ...(Array.isArray(s.bullets) ? s.bullets.map((b: unknown) => `• ${String(b)}`) : [])].filter(Boolean).join('\n');
    if (!heading.trim() && !body.trim()) throw new Error('Sections cannot be empty.');
    if (heading.length > 180 || body.length > 50_000) throw new Error('Section heading exceeds 180 characters or body exceeds 50,000 characters.');
    return { heading, body };
  });
}

/** Fixed wrapping also breaks a single long token; no text is silently dropped. */
function wrap(text: string, fits: (s: string) => boolean): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (line && !fits(line + char)) { lines.push(line); line = ''; }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}

export async function toolCreateDocument(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  try {
    const requested = String(params['path'] ?? '');
    if (!requested.trim()) throw new Error('path is required.');
    const target = ctx.guard.resolve(requested);
    ctx.guard.assertInside(target);
    const format = path.extname(target).slice(1).toLowerCase();
    const title = String(params['title'] ?? path.basename(target));
    if (!title.trim() || title.length > 180) throw new Error('title must contain 1–180 characters.');
    let bytes: Uint8Array;
    let detail: string;
    ctx.signal?.throwIfAborted();
    if (format === 'xlsx') {
      const rows = params['rows'];
      if (!Array.isArray(rows) || !rows.length || rows.length > 10_000 || rows.some(r => !Array.isArray(r) || r.length > 100 || r.some((v: unknown) => v !== null && !['string', 'number', 'boolean'].includes(typeof v)))) throw new Error('rows must contain 1–10,000 arrays of at most 100 text/number/boolean/null cells.');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Data');
      sheet.addRows(rows);
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF26334D' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.columns.forEach(column => { column.width = 24; });
      bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
      const check = new ExcelJS.Workbook();
      await check.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof check.xlsx.load>[0]);
      detail = `${check.worksheets[0]!.rowCount} rows, ${sheet.columnCount} columns`;
    } else {
      const sections = sectionsFrom(params['sections']);
      if (format === 'pdf') {
        const pdf = await PDFDocument.create();
        pdf.setTitle(title);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        let pages = 0;
        for (const section of sections) {
          const headingLines = wrap(section.heading || title, text => bold.widthOfTextAtSize(text, 20) <= 516);
          const lines = wrap(section.body, text => font.widthOfTextAtSize(text, 11) <= 516);
          let offset = 0;
          do {
            const page = pdf.addPage([612, 792]);
            pages++;
            let y = 744;
            for (const heading of headingLines) { page.drawText(heading, { x: 48, y, size: 20, font: bold, color: rgb(0.12, 0.18, 0.3) }); y -= 26; }
            y -= 18;
            while (offset < lines.length && y >= 60) { page.drawText(lines[offset++]!, { x: 48, y, size: 11, font }); y -= 17; }
            page.drawText(String(pages), { x: 550, y: 30, size: 9, font });
          } while (offset < lines.length);
        }
        bytes = await pdf.save();
        detail = `${(await PDFDocument.load(bytes)).getPageCount()} pages`;
      } else if (format === 'pptx') {
        // The package publishes CJS-shaped types for its ESM default class.
        const Pptx = PptxGenJS as unknown as typeof PptxGenJS.default;
        const pptx = new Pptx();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.title = title;
        pptx.author = 'Agent Gitu';
        let count = 0;
        for (const section of sections) {
          const lines = wrap(section.body, text => text.length <= 76);
          for (let offset = 0; offset < lines.length; offset += 11) {
            const slide = pptx.addSlide();
            slide.background = { color: 'F5F7FC' };
            slide.addText(section.heading || title, { x: 0.65, y: 0.4, w: 12, h: 1.1, fontFace: 'Aptos', fontSize: 28, bold: true, color: '26334D', breakLine: false, fit: 'shrink' });
            slide.addText(lines.slice(offset, offset + 11).join('\n'), { x: 0.7, y: 1.7, w: 11.9, h: 4.8, fontFace: 'Aptos', fontSize: 22, color: '26334D', valign: 'top', fit: 'shrink' });
            slide.addText(String(++count), { x: 12, y: 7, w: 0.6, h: 0.2, fontSize: 10, color: '66738B' });
          }
        }
        bytes = new Uint8Array(await pptx.write({ outputType: 'uint8array', compression: true }) as Uint8Array);
        const zip = unzipSync(bytes);
        const actual = Object.keys(zip).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length;
        if (actual !== count) throw new Error('PowerPoint verification failed.');
        detail = `${actual} slides`;
      } else if (format === 'docx') {
        const doc = new Document({ title, sections: [{ children: [
          new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
          ...sections.flatMap(section => [new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }), ...section.body.split('\n').map(text => new Paragraph({ text }))]),
        ] }] });
        bytes = new Uint8Array(await Packer.toBuffer(doc));
        if (!unzipSync(bytes)['word/document.xml']) throw new Error('Word document verification failed.');
        detail = `${sections.length} sections`;
      } else throw new Error('Supported extensions: .pdf, .pptx, .docx, .xlsx.');
    }
    ctx.signal?.throwIfAborted();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    if (!readFileSync(target).equals(Buffer.from(bytes))) throw new Error('Saved file differs from generated output.');
    return { ok: true, filesTouched: [ctx.guard.toRelative(target)], output: `Created ${target} (${bytes.length} bytes; ${detail}). File structure verified. Inspect content/layout before claiming visual verification.`, payload: { path: target, format, bytes: bytes.length, detail, structurallyVerified: true } };
  } catch (err) { return { ok: false, output: `create_document: ${(err as Error).message}` }; }
}
