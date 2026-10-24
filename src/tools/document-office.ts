import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Footer,
  Header,
  PageNumber,
  VerticalAlign,
  type ParagraphChild,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import type { ToolContext } from './tools.js';
import {
  type DocStyle,
  type DocSection,
  type DocImage,
  type Cell,
  DocumentRenderer,
  cellText,
  pageDimensions,
  readableInk,
  surfaceTint,
  validateRows,
  loadDocumentImage,
  wrapText,
} from './document-design.js';
function runs(text: string, options: Record<string, unknown> = {}): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*|\x60[^\x60]+\x60)/g)
    .filter(Boolean)
    .flatMap((part) =>
      part.split('\n').map(
        (line, index) =>
          new TextRun({
            ...options,
            text: line.replace(/^\*\*|\*\*$/g, '').replace(/^\x60|\x60$/g, ''),
            ...(index ? { break: 1 } : {}),
            ...(part.startsWith('**') ? { bold: true } : {}),
            ...(part.startsWith(String.fromCharCode(96)) ? { font: 'Courier New' } : {}),
          }),
      ),
    );
}
export async function createWord(title: string, subtitle: string, sections: DocSection[], style: DocStyle, renderer: DocumentRenderer) {
  const [width, height] = pageDimensions(style),
    usable = (width - 2 * style.margin - (style.columns === 2 ? 21 : 0)) / style.columns,
    children: (Paragraph | Table)[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: subtitle ? 100 : 240 } })];
  if (subtitle) children.push(new Paragraph({ children: runs(subtitle, { color: '596273', size: 24 }), spacing: { after: 240 } }));
  for (const section of sections) {
    if (section.heading) {
      const heading: ParagraphChild[] = [];
      if (section.icon)
        heading.push(new ImageRun({ data: await renderer.icon(section.icon, style.accent), type: 'png', transformation: { width: 20, height: 20 } }), new TextRun(' '));
      heading.push(...runs(section.heading));
      children.push(
        new Paragraph({ children: heading, heading: HeadingLevel.HEADING_1, keepNext: true, pageBreakBefore: section.pageBreak, spacing: { before: 200, after: 100 } }),
      );
    } else if (section.pageBreak) children.push(new Paragraph({ text: '', pageBreakBefore: true }));
    for (const paragraph of section.body.split(/\n\s*\n/).filter(Boolean))
      children.push(new Paragraph({ children: runs(paragraph), widowControl: true, spacing: { after: 120, line: Math.round(240 * style.lineHeight) } }));
    for (const bullet of section.bullets) children.push(new Paragraph({ children: runs(bullet), bullet: { level: 0 }, widowControl: true, spacing: { after: 70 } }));

    if (section.table) {
      const table = section.table,
        border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
        columnWidths = table.headers.map(() => Math.floor((usable * 20) / table.headers.length));
      const rows = [table.headers, ...table.rows].map(
        (row, index) =>
          new TableRow({
            tableHeader: index === 0,
            children: row.map(
              (value, column) =>
                new TableCell({
                  width: { size: columnWidths[column]!, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                  shading: { fill: index === 0 ? style.accent : index % 2 === 0 ? surfaceTint(style) : style.background },
                  children: [
                    new Paragraph({
                      children: runs(typeof value === 'string' ? value : cellText(value), {
                        bold: index === 0,
                        color: index === 0 ? readableInk(style.accent) : style.text,
                        size: Math.round(Math.max(9, style.fontSize - 1) * 2),
                      }),
                      spacing: { after: 0, line: 260 },
                      alignment: typeof value === 'number' ? AlignmentType.RIGHT : AlignmentType.LEFT,
                    }),
                  ],
                }),
            ),
          }),
      );
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths,
          borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
          rows,
        }),
      );
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
    }
    if (section.image) {
      const image = section.image,
        scale = Math.min((usable * 96) / 72 / image.width, (270 * 96) / 72 / image.height, 1);
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: image.data,
              type: image.type === 'jpeg' ? 'jpg' : 'png',
              transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) },
              altText: { title: image.caption || 'Document image', description: image.caption, name: 'Document image' },
            }),
          ],
          alignment: AlignmentType.CENTER,
          keepNext: Boolean(image.caption),
          spacing: { before: 100, after: 60 },
        }),
      );
      if (image.caption) children.push(new Paragraph({ text: image.caption, alignment: AlignmentType.CENTER, spacing: { after: 150 }, style: 'Caption' }));
    }
  }

  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'Page ', size: 16, color: '666666' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '666666' }),
          new TextRun({ text: ' of ', size: 16, color: '666666' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '666666' }),
        ],
        alignment: AlignmentType.RIGHT,
      }),
    ],
  });
  const header = new Header({ children: [new Paragraph({ children: [new TextRun({ text: title, font: style.font, color: '666666', size: 16 })], spacing: { after: 60 } })] });
  const document = new Document({
    title,
    creator: 'Agent Gitu',
    description: subtitle,
    background: { color: style.background },
    styles: {
      default: {
        document: {
          run: { font: style.font, size: Math.round(style.fontSize * 2), color: style.text },
          paragraph: { spacing: { after: 120, line: Math.round(240 * style.lineHeight) } },
        },
        title: { run: { font: style.font, size: Math.round((style.headingSize + 10) * 2), color: style.heading, bold: true }, paragraph: { spacing: { after: 240 } } },
        heading1: {
          run: { font: style.font, size: Math.round(style.headingSize * 2), color: style.heading, bold: true },
          paragraph: { keepNext: true, spacing: { before: 200, after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(width * 20), height: Math.round(height * 20) },
            margin: { top: style.margin * 20, bottom: style.margin * 20, left: style.margin * 20, right: style.margin * 20, header: 360, footer: 360 },
          },
          ...(style.columns === 2 ? { column: { count: 2, space: 420, equalWidth: true } } : {}),
        },
        headers: { default: header },
        ...(style.footer ? { footers: { default: footer } } : {}),
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

interface SheetInput {
  name?: string;
  title?: string;
  rows: unknown;
  columns?: { width?: number; format?: string }[];
  image?: unknown;
}
export async function createWorkbook(ctx: ToolContext, params: Record<string, unknown>, title: string, style: DocStyle, warnings: string[]) {
  const inputs = (params['sheets'] ?? [{ name: 'Data', rows: params['rows'], columns: params['columns'], image: params['image'] }]) as SheetInput[];
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 20) throw Error('Provide 1–20 sheets.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Agent Gitu';
  workbook.title = title;
  workbook.subject = String(params['subtitle'] ?? '');
  workbook.calcProperties.fullCalcOnLoad = true;
  let cellCount = 0,
    formulaUncached = false;
  const names = new Set<string>();
  for (const input of inputs) {
    if (!input || typeof input !== 'object') throw Error('Each sheet must be an object.');
    const rows = validateRows(input.rows),
      columns = Math.max(...rows.map((row) => row.length));
    cellCount += rows.reduce((n, row) => n + row.length, 0);
    if (cellCount > 200000) throw Error('Workbook exceeds 200,000 populated cells.');
    const name = String(input.name ?? 'Sheet ' + (names.size + 1)).trim();
    if (!name || name.length > 31 || /[\\/?*\[\]:]/.test(name) || names.has(name.toLowerCase()))
      throw Error('Sheet names must be unique, at most 31 characters and contain no /, backslash, ?, *, [, ] or colon.');
    names.add(name.toLowerCase());
    const sheet = workbook.addWorksheet(name, {
      properties: { defaultRowHeight: 23 },
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      pageSetup: {
        paperSize: (style.pageSize === 'Letter' ? 1 : style.pageSize === 'Legal' ? 5 : 9) as ExcelJS.PaperSize,
        orientation: style.orientation === 'landscape' || columns > 5 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        printTitlesRow: '3:3',
      },
      headerFooter: { oddFooter: style.footer ? '&L' + title.replace(/&/g, '&&') + '&RPage &P of &N' : '' },
    });
    if (columns > 1) sheet.mergeCells(1, 1, 1, columns);
    sheet.getCell(1, 1).value = String(input.title ?? title);
    sheet.getCell(1, 1).font = { name: style.font, size: 20, bold: true, color: { argb: 'FF' + style.heading } };
    sheet.getRow(1).height = 36;
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + style.background } };
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + style.background } };
    sheet.getCell(1, 1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(2).height = 10;
    rows.forEach((values, index) => {
      const row = sheet.getRow(index + 3);
      values.forEach((value, col) => {
        const cell = row.getCell(col + 1);
        if (value && typeof value === 'object') {
          if ('date' in value) {
            cell.value = new Date(value.date);
            cell.numFmt = 'yyyy-mm-dd';
          } else {
            cell.value = value as ExcelJS.CellFormulaValue;
            if (value.result === undefined) formulaUncached = true;
          }
        } else cell.value = value;
        cell.font = {
          name: style.font,
          size: style.fontSize,
          color: { argb: 'FF' + style.text },
          ...(index === 0 ? { bold: true, color: { argb: 'FF' + readableInk(style.accent) } } : {}),
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (index === 0 ? style.accent : index % 2 === 0 ? surfaceTint(style) : style.background) } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        };
        cell.alignment = { vertical: 'middle', horizontal: typeof value === 'number' ? 'right' : 'left', wrapText: true };
        if (typeof value === 'number') cell.numFmt = Number.isInteger(value) ? '#,##0' : '#,##0.00';
        if (index > 0 && input.columns?.[col]?.format) cell.numFmt = String(input.columns[col]!.format).slice(0, 120);
      });
    });
    const widths: number[] = [];
    for (let column = 1; column <= columns; column++) {
      const custom = input.columns?.[column - 1]?.width;
      let width =
        custom === undefined
          ? Math.max(
              12,
              Math.min(
                52,
                Math.max(
                  ...rows.map((row) =>
                    Math.max(
                      ...cellText(row[column - 1] ?? null)
                        .split('\n')
                        .map((line) => line.length),
                    ),
                  ),
                ) + 3,
              ),
            )
          : custom;
      if (!Number.isFinite(width) || width < 6 || width > 100) throw Error('Spreadsheet column widths must be between 6 and 100.');
      sheet.getColumn(column).width = width;
      widths.push(width);
    }
    rows.forEach((row, index) => {
      const lines = Math.max(
        1,
        ...row.map((cell, col) =>
          cellText(cell)
            .split('\n')
            .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / Math.max(1, widths[col]! - 2))), 0),
        ),
      );
      const height = Math.max(index === 0 ? 28 : 24, lines * style.fontSize * 1.4 + 10);
      sheet.getRow(index + 3).height = Math.min(409, height);
      if (height > 409 && !warnings.includes('Very long spreadsheet cells may need expansion in Excel.')) warnings.push('Very long spreadsheet cells may need expansion in Excel.');
    });
    sheet.getRow(1).height = Math.max(36, Math.ceil(String(input.title ?? title).length / Math.max(1, widths.reduce((a, b) => a + b, 0) / 1.8)) * 26 + 10);
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns } };
    let endRow = rows.length + 2;
    const image = loadDocumentImage(ctx, input.image);
    if (image) {
      const scale = Math.min(500 / image.width, 220 / image.height, 1),
        id = workbook.addImage({ buffer: image.data as unknown as ExcelJS.Buffer, extension: image.type });
      const start = rows.length + 4;
      sheet.addImage(id, { tl: { col: 0, row: start - 1 }, ext: { width: image.width * scale, height: image.height * scale } });
      endRow = start + Math.ceil((image.height * scale) / 20) + 1;
      if (image.caption) sheet.getCell(endRow++, 1).value = image.caption;
    }
    sheet.pageSetup.printArea = 'A1:' + sheet.getColumn(columns).letter + endRow;
  }
  if (formulaUncached) warnings.push('Formulas without supplied results recalculate when opened in Excel; their results have not been verified.');
  return { bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), detail: workbook.worksheets.length + ' sheet(s), ' + cellCount + ' cells' };
}
export async function createSlides(title: string, subtitle: string, sections: DocSection[], style: DocStyle, renderer: DocumentRenderer) {
  const Pptx = PptxGenJS as unknown as typeof PptxGenJS.default,
    pptx = new Pptx();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  pptx.subject = subtitle;
  pptx.author = 'Agent Gitu';
  pptx.theme = { headFontFace: style.font, bodyFontFace: style.font };
  pptx.defineSlideMaster({
    title: 'GITU',
    background: { color: style.background },
    objects: [
      { rect: { x: 0, y: 0, w: 13.333, h: 0.09, fill: { color: style.accent }, line: { color: style.accent } } },
      { text: { text: title, options: { x: 0.65, y: 7.04, w: 10.9, h: 0.2, fontFace: style.font, fontSize: 9, color: '667085', margin: 0 } } },
    ],
    ...(style.footer ? { slideNumber: { x: 12, y: 7.02, w: 0.6, h: 0.25, fontFace: style.font, fontSize: 10, color: '667085' } } : {}),
  });
  for (const section of sections) {
    const body = [section.body, ...section.bullets.map((item) => '• ' + item)].filter(Boolean).join('\n\n'),
      width = section.image ? 7.1 : 12,
      lines = wrapText(body, section.image ? 48 : 82),
      hasText = body.trim().length > 0;
    const chunks = hasText
      ? Array.from({ length: Math.ceil(lines.length / 12) }, (_, index) => lines.slice(index * 12, index * 12 + 12))
      : section.table && !section.image
        ? []
        : [[]];
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const slide = pptx.addSlide('GITU');
      if (section.icon) slide.addImage({ data: 'image/png;base64,' + (await renderer.icon(section.icon, style.accent)).toString('base64'), x: 0.65, y: 0.5, w: 0.35, h: 0.35 });
      slide.addText(section.heading || title, {
        x: section.icon ? 1.15 : 0.65,
        y: 0.45,
        w: section.icon ? 11.5 : 12,
        h: 0.8,
        fontFace: style.font,
        fontSize: Math.min(36, style.headingSize + 10),
        bold: true,
        color: style.heading,
        margin: 0,
        fit: 'shrink',
      });
      if (chunk.length)
        slide.addText(chunk.join('\n'), {
          x: 0.7,
          y: 1.55,
          w: width,
          h: 4.85,
          fontFace: style.font,
          fontSize: 22,
          color: style.text,
          breakLine: false,
          valign: 'top',
          margin: 0,
          fit: 'shrink',
        });
      if (section.image && chunkIndex === 0) {
        const image = section.image,
          scale = Math.min(4 / image.width, 4 / image.height);
        slide.addImage({ data: 'image/' + image.type + ';base64,' + image.data.toString('base64'), x: 8.55, y: 1.7, w: image.width * scale, h: image.height * scale });
        if (image.caption) slide.addText(image.caption, { x: 8.55, y: 5.9, w: 4, h: 0.7, fontSize: 10, color: '667085', margin: 0, fit: 'shrink' });
      }
    }
    if (section.table) {
      const slide = pptx.addSlide('GITU');
      slide.addText(section.heading || title, { x: 0.65, y: 0.45, w: 12, h: 0.8, fontSize: 28, bold: true, color: style.heading, margin: 0 });
      slide.addTable(
        [
          section.table.headers.map((text) => ({ text, options: { bold: true, color: readableInk(style.accent), fill: { color: style.accent } } })),
          ...section.table.rows.map((row, index) =>
            row.map((value) => ({ text: cellText(value), options: { fill: { color: index % 2 ? surfaceTint(style) : style.background }, color: style.text } })),
          ),
        ],
        {
          x: 0.65,
          y: 1.55,
          w: 12,
          fontFace: style.font,
          fontSize: 14,
          border: { type: 'solid', pt: 0.5, color: 'D9D9D9' },
          margin: 0.1,
          autoPage: true,
          autoPageRepeatHeader: true,
          autoPageSlideStartY: 1.55,
          autoPageHeaderRows: 1,
        },
      );
    }
  }
  return new Uint8Array((await pptx.write({ outputType: 'uint8array', compression: true })) as Uint8Array);
}
