import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { coworkDocumentPreview } from '../src/cowork/document-preview.js';
import type { CoworkArtifact } from '../src/cowork/store.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-preview-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function artifact(name: string, mime: string): CoworkArtifact {
  return {
    id: 'cf-preview',
    conversationId: 'conv',
    name,
    mime,
    size: 10,
    storageName: name,
    createdAt: new Date().toISOString(),
  };
}

function office(name: string, entries: Record<string, string>): string {
  const file = path.join(root, name);
  writeFileSync(file, zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, strToU8(value)]))));
  return file;
}

describe('Cowork document preview', () => {
  it('escapes text and blocks executable content', () => {
    const file = path.join(root, 'notes.md');
    writeFileSync(file, '<script>alert(1)</script> & notes');
    const html = coworkDocumentPreview(file, artifact('notes.md', 'text/markdown'))!;
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; notes');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script>');
  });

  it('extracts readable Word, Excel and PowerPoint content without running embedded objects', () => {
    const docx = office('report.docx', { 'word/document.xml': '<w:document><w:p><w:r><w:t>Quarterly &amp; safe</w:t></w:r></w:p></w:document>' });
    const xlsx = office('numbers.xlsx', {
      'xl/sharedStrings.xml': '<sst><si><t>Revenue</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><row><c t="s"><v>0</v></c><c><v>42</v></c></row></worksheet>',
    });
    const pptx = office('launch.pptx', { 'ppt/slides/slide1.xml': '<p:sld><a:t>Launch plan</a:t><a:t>Friday</a:t></p:sld>' });
    expect(coworkDocumentPreview(docx, artifact('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))).toContain('Quarterly &amp; safe');
    expect(coworkDocumentPreview(xlsx, artifact('numbers.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))).toContain('<td>Revenue</td><td>42</td>');
    expect(coworkDocumentPreview(pptx, artifact('launch.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))).toContain('Launch plan');
  });

  it('returns no preview for unsupported legacy binaries', () => {
    const file = path.join(root, 'legacy.doc');
    writeFileSync(file, 'binary');
    expect(coworkDocumentPreview(file, artifact('legacy.doc', 'application/msword'))).toBeUndefined();
  });
});
