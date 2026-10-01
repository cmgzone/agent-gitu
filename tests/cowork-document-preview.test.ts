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
  it('renders Markdown headings, emphasis, lists, quotes, tables and code as a document', () => {
    const file = path.join(root, 'copy-deck.md');
    writeFileSync(file, '# Copy deck\n\n**Status:** *ready*\n\n## Product\n\n- Eyebrow: `Coming soon`\n- Body copy\n\n> Verified facts\n\n| Product | Status |\n| --- | --- |\n| Gitu | Ready |\n\n```html\n<script>literal code</script>\n```');
    const html = coworkDocumentPreview(file, artifact('copy-deck.md', 'application/octet-stream'), { theme: 'light', embedded: true });
    expect(html).toContain('<h1>Copy deck</h1>');
    expect(html).toContain('<h2>Product</h2>');
    expect(html).toContain('<strong>Status:</strong> <em>ready</em>');
    expect(html).toContain('<li>Eyebrow: <code>Coming soon</code></li>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<th>Product</th>');
    expect(html).toContain('&lt;script&gt;literal code&lt;/script&gt;');
    expect(html).toContain('<html data-theme="light">');
    expect(html).not.toContain('<header>');
    expect(html).not.toContain('<script>');
  });

  it('blocks raw HTML, unsafe links and remote image loads in Markdown', () => {
    const file = path.join(root, 'unsafe.markdown');
    writeFileSync(file, '<img src="https://tracker.example/pixel" onerror="alert(1)">\n\n[unsafe](javascript:alert%281%29) [encoded](javascript&#58;alert%281%29) [site](https://example.com/?a=1&b=2)\n\n![Tracking image](https://tracker.example/pixel)');
    const html = coworkDocumentPreview(file, artifact('unsafe.markdown', 'text/plain'));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Tracking image');
    expect(html).toContain("default-src 'none'");
  });

  it('keeps ordinary text as literal text even when it resembles Markdown', () => {
    const file = path.join(root, 'notes.txt');
    writeFileSync(file, '# Heading\n**literal**');
    const html = coworkDocumentPreview(file, artifact('notes.txt', 'text/plain'));
    expect(html).toContain('<pre># Heading\n**literal**</pre>');
    expect(html).not.toContain('<h1>Heading</h1>');
  });

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

  it('previews text-like files by extension even without a text mime type', () => {
    const file = path.join(root, 'main.ts');
    writeFileSync(file, 'export const x = 1;\n<b>not html</b>');
    const html = coworkDocumentPreview(file, artifact('main.ts', 'application/octet-stream'));
    expect(html).toContain('&lt;b&gt;not html&lt;/b&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script>');
  });

  it('draws SVG as an inert data URL image instead of a scriptable document', () => {
    const file = path.join(root, 'logo.svg');
    writeFileSync(file, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = coworkDocumentPreview(file, artifact('logo.svg', 'image/svg+xml'));
    expect(html).toContain('src="data:image/svg+xml;base64,');
    expect(html).toContain('img-src data:');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('alert(1)');
  });

  it('offers a download card instead of a dead end for types it cannot render', () => {
    const legacy = path.join(root, 'legacy.doc');
    writeFileSync(legacy, 'binary');
    const doc = coworkDocumentPreview(legacy, artifact('legacy.doc', 'application/msword'));
    expect(doc).toContain('legacy.doc');
    expect(doc).toContain('href="/api/cowork/artifacts/cf-preview"');
    expect(doc).not.toContain('<script>');

    const zip = path.join(root, 'bundle.zip');
    writeFileSync(zip, 'PK');
    expect(coworkDocumentPreview(zip, artifact('bundle.zip', 'application/zip'))).toContain('Archive');

    const pdf = path.join(root, 'report.pdf');
    writeFileSync(pdf, '%PDF-1.4');
    expect(coworkDocumentPreview(pdf, artifact('report.pdf', 'application/pdf'))).toContain('Download this file');
  });

  it('still returns a useful page when a document is damaged', () => {
    const broken = path.join(root, 'broken.docx');
    writeFileSync(broken, 'not a zip archive');
    const html = coworkDocumentPreview(broken, artifact('broken.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
    expect(html).toContain('could not be parsed');
    expect(html).toContain('broken.docx');
  });
});
