import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, expect, it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import { toolCreateDocument } from '../src/tools/productivity.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { coworkDocumentPreview } from '../src/cowork/document-preview.js';
const root = mkdtempSync(path.join(os.tmpdir(), 'document-layout-'));
writeFileSync(path.join(root, 'package.json'), '{}');
writeFileSync(path.join(root, 'logo.png'), readFileSync('assets/agent-gitu-icon.png'));
const ctx = { cwd: root, guard: ProjectGuard.detect(root) };
afterAll(() => rmSync(root, { recursive: true, force: true }));
const sections = [
  { heading: 'Summary', body: 'The project is ready for review. Every supplied detail should remain available.', bullets: ['Review the outcome', 'Choose the next step'] },
];
it('renders Unicode, colour, icons, images and a real table in a flowing landscape PDF', async () => {
  const result = await toolCreateDocument(ctx, {
    path: 'styled.pdf',
    title: 'Soko Kenya — Nairobi ✓',
    subtitle: 'A concise project update',
    style: { preset: 'colourful', accentColor: '#7C3AED', orientation: 'landscape' },
    sections: [
      {
        ...sections[0],
        icon: 'chart',
        image: { path: 'logo.png', caption: 'Project identity' },
        table: {
          headers: ['Milestone', 'Status'],
          rows: [
            ['Launch', 'Ready'],
            ['Support', 'In progress'],
          ],
        },
      },
    ],
  });
  expect(result.ok, result.output).toBe(true);
  const pdf = await PDFDocument.load(readFileSync(path.join(root, 'styled.pdf')));
  expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
  expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight());
  expect(pdf.getPages().some((page) => page.node.Resources()?.get(PDFName.of('XObject')))).toBe(true);
});
it('honours intentional page breaks without creating them between ordinary sections', async () => {
  const list = Array.from({ length: 4 }, (_, i) => ({ ...sections[0], heading: 'Section ' + (i + 1), pageBreak: i > 0 }));
  const result = await toolCreateDocument(ctx, { path: 'breaks.pdf', title: 'Intentional sections', sections: list });
  expect(result.ok, result.output).toBe(true);
  expect((await PDFDocument.load(readFileSync(path.join(root, 'breaks.pdf')))).getPageCount()).toBe(4);
});
it('produces a styled Word package with real bullets, tables and image media', async () => {
  const result = await toolCreateDocument(ctx, {
    path: 'styled.docx',
    title: 'Project report',
    style: { preset: 'formal', accentColor: '#24476A' },
    sections: [{ ...sections[0], table: { headers: ['Name', 'Amount'], rows: [['Work', 12]] }, image: { path: 'logo.png', caption: 'Logo' } }],
  });
  expect(result.ok, result.output).toBe(true);
  const zip = unzipSync(readFileSync(path.join(root, 'styled.docx'))),
    xml = strFromU8(zip['word/document.xml']!),
    styles = strFromU8(zip['word/styles.xml']!);
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('<w:numPr>');
  expect(xml).toContain('w:tblHeader');
  expect(xml).toContain('24476A');
  expect(xml).not.toContain('w:pageBreakBefore');
  expect(Object.keys(zip).some((name) => /^word\/media\/.+png$/.test(name))).toBe(true);
  expect(styles).toContain('Georgia');
  const preview = coworkDocumentPreview(path.join(root, 'styled.docx'), { id: 'preview', name: 'styled.docx' } as never);
  expect(preview).toContain('class="office-document" style="background:#FFFFFF;');
  expect(preview).toContain('<table>');
  expect(preview).toContain('data:image/png;base64,');
});
it('makes readable multi-sheet Excel output while preserving dates, numbers and explicit formulas', async () => {
  const result = await toolCreateDocument(ctx, {
    path: 'styled.xlsx',
    title: 'Work tracker',
    style: { accentColor: '#0F766E' },
    sheets: [
      {
        name: 'Summary',
        rows: [
          ['Item', 'Count', 'Notes'],
          ['Launch', 12, 'A long description '.repeat(15)],
          ['Support', 18, 'Ready'],
          ['Total', { formula: 'SUM(B4:B5)', result: 30 }, null],
        ],
        columns: [{}, { format: '#,##0' }, {}],
      },
      {
        name: 'Dates',
        rows: [
          ['Milestone', 'Due'],
          ['Launch', { date: '2026-11-01T00:00:00Z' }],
        ],
      },
    ],
  });
  expect(result.ok, result.output).toBe(true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(root, 'styled.xlsx'));
  const sheet = wb.getWorksheet('Summary')!;
  expect(sheet.getCell('B4').value).toBe(12);
  expect(sheet.getCell('B6').value).toMatchObject({ formula: 'SUM(B4:B5)', result: 30 });
  expect(sheet.getColumn(3).width).toBeGreaterThan(sheet.getColumn(2).width!);
  expect(sheet.getRow(4).height).toBeGreaterThan(24);
  expect(sheet.getRow(3).getCell(1).fill).toMatchObject({ fgColor: { argb: 'FF0F766E' } });
  expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
  expect(sheet.pageSetup.fitToHeight).toBe(0);
  expect(wb.getWorksheet('Dates')!.getCell('B4').value).toBeInstanceOf(Date);
  const preview = coworkDocumentPreview(path.join(root, 'styled.xlsx'), { id: 'preview', name: 'styled.xlsx' } as never);
  expect(preview).toContain('<h2>Summary</h2>');
  expect(preview).toContain('colspan="3"');
  expect(preview).toContain('background:#0F766E;');
  expect(preview).toContain('>30</td>');
});
it('keeps both images and table contents in slides even without body text', async () => {
  const result = await toolCreateDocument(ctx, {
    path: 'visual.pptx',
    title: 'Milestones',
    sections: [{ heading: 'Delivery', table: { headers: ['Item', 'Status'], rows: [['Pilot', 'Ready']] }, image: { path: 'logo.png', caption: 'Project identity' } }],
  });
  expect(result.ok, result.output).toBe(true);
  const zip = unzipSync(readFileSync(path.join(root, 'visual.pptx')));
  expect(Object.keys(zip).some((name) => /^ppt\/media\/.+png$/.test(name))).toBe(true);
  const slides = Object.keys(zip)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .map((name) => strFromU8(zip[name]!))
    .join('');
  expect(slides).toContain('Pilot');
  expect(slides).toContain('Project identity');
  expect(slides).toContain('<p:pic>');
});
it('creates portable styled HTML, structured text/Markdown and correctly quoted CSV', async () => {
  for (const format of ['html', 'txt', 'md']) {
    const result = await toolCreateDocument(ctx, {
      path: 'brief.' + format,
      title: 'A clear title',
      style: { accentColor: '#E56A23' },
      sections: [{ heading: 'Scope', body: 'Keep <script>alert(1)</script> as text.\n\n' + 'word '.repeat(50), icon: 'info' }],
    });
    expect(result.ok, result.output).toBe(true);
  }
  const html = readFileSync(path.join(root, 'brief.html'), 'utf8');
  expect(html).toContain('#E56A23');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(readFileSync(path.join(root, 'brief.md'), 'utf8')).toContain('## Scope');
  expect(
    readFileSync(path.join(root, 'brief.txt'), 'utf8')
      .split('\n')
      .every((line) => line.length <= 84),
  ).toBe(true);
  const csv = await toolCreateDocument(ctx, {
    path: 'table.csv',
    rows: [
      ['City', 'Note'],
      ['Nairobi, Kenya', 'He said "yes"'],
    ],
  });
  expect(csv.ok, csv.output).toBe(true);
  expect(readFileSync(path.join(root, 'table.csv'), 'utf8')).toContain('"Nairobi, Kenya","He said ""yes"""');
});
it('rejects remote images, invalid styling, outside reads and invalid spreadsheet data without writing files', async () => {
  for (const input of [
    { style: { accentColor: 'red;background:url(https://bad.example)' } },
    { sections: [{ heading: 'Blocked image', image: { path: 'https://example.com/logo.png' } }] },
    { sections: [{ heading: 'Blocked read', image: { path: '../private.png' } }] },
  ]) {
    const result = await toolCreateDocument(ctx, { path: 'denied.pdf', title: 'Denied', sections, ...input });
    expect(result.ok).toBe(false);
    expect(existsSync(path.join(root, 'denied.pdf'))).toBe(false);
  }
  expect((await toolCreateDocument(ctx, { path: 'bad.xlsx', rows: [['Value'], [NaN]] })).ok).toBe(false);
  expect(
    (
      await toolCreateDocument(ctx, {
        path: 'bad.xlsx',
        sheets: [
          { name: 'Same', rows: [['One']] },
          { name: 'same', rows: [['Two']] },
        ],
      })
    ).ok,
  ).toBe(false);
});
