import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import type { ToolContext } from './tools.js';
import type { ToolResult } from '../types.js';
import { documentStyle, documentSections, documentHtml, documentText, DocumentRenderer, validateRows, cellText } from './document-design.js';
import { createWord, createWorkbook, createSlides } from './document-office.js';
export const DOCUMENT_TOOL_DOC =
  'Create professionally formatted PDF, Word, Excel, PowerPoint, HTML, text, Markdown or CSV files with bundled libraries. params: {path:"report.pdf|.docx|.xlsx|.pptx|.html|.txt|.md|.csv",title,subtitle?,style?:{preset:"professional|formal|modern|colourful|minimal|brochure",layout:"report|letter|brochure|cards|minimal",accentColor:"#RRGGBB",headingColor?,textColor?,backgroundColor?,fontFamily:"Arial|Calibri|Georgia|Times New Roman|Verdana|Courier New",fontSize:9..18,headingSize:14..32,pageSize:"A4|Letter|Legal",orientation:"portrait|landscape",margin:24..90,columns:1|2,density:"compact|comfortable",footer:boolean},sections?:[{heading,body?,bullets?:string[],icon?:"check|star|chart|briefcase|calendar|bulb|info|warning|target|users",image?:{path,caption?},table?:{headers:string[],rows:Cell[][]},pageBreak?:boolean}],rows?:Cell[][],columns?:[{width?,format?}],sheets?:[{name,title?,rows,columns?,image?:{path,caption?}}]}. Cell is string, finite number, boolean, null, {date:ISO string} or {formula:string,result?:number|string|boolean}. PDF/Word/PowerPoint/HTML/TXT/Markdown require sections; Excel/CSV require rows or sheets. PDF sections flow together; request pageBreak only intentionally. Choose styles dynamically for the audience and document; preserve all content. Use PNG/JPEG files already in authorised folders; no remote image fetches. Named icons render in PDF/Word/slides/HTML. Text/CSV cannot carry visual styling. PDF and office icon rendering use an isolated offline Chromium/Edge renderer, never a personal browser profile. Spreadsheet formulas without supplied results recalculate in Excel. Reuse the requested output path. File structure checks are not visual verification; inspect layout before claiming it. This creates local files, not cloud edits.';
export async function toolCreateDocument(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolResult> {
  const renderer = new DocumentRenderer(ctx.signal);
  try {
    const requested = String(params['path'] ?? '');
    if (!requested.trim()) throw Error('path is required.');
    const target = ctx.guard.resolve(requested);
    ctx.guard.assertInside(target);
    const format = path.extname(target).slice(1).toLowerCase();
    if (!['pdf', 'docx', 'xlsx', 'pptx', 'html', 'htm', 'txt', 'md', 'markdown', 'csv'].includes(format))
      throw Error('Supported extensions: .pdf, .docx, .xlsx, .pptx, .html, .txt, .md and .csv.');
    const title = String(params['title'] ?? path.basename(target));
    if (!title.trim() || title.length > 180) throw Error('title must contain 1–180 characters.');
    const subtitle = String(params['subtitle'] ?? '');
    if (subtitle.length > 1000) throw Error('subtitle must be at most 1,000 characters.');
    const style = documentStyle(params['style']),
      warnings: string[] = [];
    let bytes: Uint8Array, detail: string;
    ctx.signal?.throwIfAborted();
    if (format === 'xlsx') {
      const workbook = await createWorkbook(ctx, params, title, style, warnings);
      bytes = workbook.bytes;
      detail = workbook.detail;
      const check = new ExcelJS.Workbook();
      await check.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof check.xlsx.load>[0]);
      if (!check.worksheets.length) throw Error('Spreadsheet structure verification failed.');
    } else if (format === 'csv') {
      if (params['sheets'] && (!Array.isArray(params['sheets']) || params['sheets'].length !== 1)) throw Error('CSV supports one table. Use XLSX for multiple sheets.');
      const rows = validateRows(params['rows'] ?? (params['sheets'] as { rows: unknown }[] | undefined)?.[0]?.rows);
      bytes = Buffer.from('\uFEFF' + rows.map((row) => row.map((value) => '"' + cellText(value).replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n', 'utf8');
      detail = rows.length + ' rows';
      warnings.push('CSV stores values only; colours, images, icons and layout are not supported.');
    } else {
      const sections = documentSections(ctx, params['sections']);
      if (format === 'pdf') {
        bytes = await renderer.pdf(documentHtml(title, subtitle, sections, style), title, style);
        const pages = (await PDFDocument.load(bytes)).getPageCount();
        if (!pages) throw Error('PDF contains no pages.');
        detail = pages + ' page(s); automatic text flow';
      } else if (format === 'docx') {
        bytes = await createWord(title, subtitle, sections, style, renderer);
        if (!unzipSync(bytes)['word/document.xml']) throw Error('Word structure verification failed.');
        detail = sections.length + ' sections; flowing layout';
      } else if (format === 'pptx') {
        bytes = await createSlides(title, subtitle, sections, style, renderer);
        const zip = unzipSync(bytes),
          slides = Object.keys(zip).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
        if (!slides) throw Error('Presentation contains no slides.');
        detail = slides + ' slides';
      } else if (format === 'html' || format === 'htm') {
        bytes = Buffer.from(documentHtml(title, subtitle, sections, style), 'utf8');
        detail = sections.length + ' sections; standalone styled HTML';
      } else {
        const markdown = ['md', 'markdown'].includes(format);
        bytes = Buffer.from(documentText(title, subtitle, sections, markdown), 'utf8');
        detail = sections.length + ' sections; structured ' + (markdown ? 'Markdown' : 'plain text');
        warnings.push(markdown ? 'Markdown styling depends on the viewer.' : 'Plain text has no fonts or colours; images are represented by captions.');
      }
    }
    ctx.signal?.throwIfAborted();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    if (!readFileSync(target).equals(Buffer.from(bytes))) throw Error('Saved file differs from generated output.');
    return {
      ok: true,
      filesTouched: [ctx.guard.toRelative(target)],
      output:
        'Created ' +
        target +
        ' (' +
        bytes.length +
        ' bytes; ' +
        detail +
        '). Professional layout applied where the format supports it. File structure verified; inspect content and layout before claiming visual verification.' +
        (warnings.length ? ' Notes: ' + warnings.join(' ') : ''),
      payload: { path: target, format, bytes: bytes.length, detail, style, structurallyVerified: true, warnings },
    };
  } catch (error) {
    return { ok: false, output: 'create_document: ' + (error as Error).message };
  } finally {
    await renderer.close().catch(() => undefined);
  }
}
