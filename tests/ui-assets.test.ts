import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderUiDocument } from '../src/server/ui-template.js';
import { bundleUiAssets } from '../scripts/build-ui-assets.mjs';

describe('portable UI assets', () => {
  it('preserves include order and literal script bindings without evaluating them', () => {
    const assets = {
      'index.html': '<style><!-- GITU_ASSET:styles/base.css --></style><script><!-- GITU_ASSET:scripts/main.js --></script>',
      'styles/base.css': 'body{color:red}',
      'scripts/main.js': '/* GITU_BINDING_BOOT */var title=/* GITU_VALUE_TITLE */ null;',
    };
    expect(renderUiDocument(assets, { BOOT: 'window.boot="$&";', TITLE: '"A title"' })).toBe(
      '<style>body{color:red}</style><script>window.boot="$&";var title="A title";</script>',
    );
    expect(() => renderUiDocument(assets, {})).toThrow('Missing UI binding');
  });

  it('fails a broken or cyclic include before serving an incomplete UI', () => {
    expect(() => renderUiDocument({ 'index.html': '<!-- GITU_ASSET:missing.js -->' }, {})).toThrow('Missing UI asset');
    expect(() => renderUiDocument({ 'index.html': '<!-- GITU_ASSET:index.html -->' }, {})).toThrow('Cyclic UI asset');
  });

  it('builds an importable bundle that renders after its source assets are removed', () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'gitu-ui-bundle-'));
    const source = path.join(home, 'source'),
      output = path.join(home, 'bundled.mjs');
    try {
      mkdirSync(source);
      writeFileSync(path.join(source, 'index.html'), '<h1><!-- GITU_ASSET:title.js --></h1>\r\n');
      writeFileSync(path.join(source, 'title.js'), 'portable\r\n');
      expect(bundleUiAssets(source, output)).toBe(2);
      rmSync(source, { recursive: true });
      const loaded = JSON.parse(
        execFileSync(
          process.execPath,
          ['--input-type=module', '-e', 'const m=await import(process.argv[1]);console.log(JSON.stringify(m.UI_ASSETS));', pathToFileURL(output).href],
          { encoding: 'utf8', windowsHide: true },
        ),
      );
      expect(renderUiDocument(loaded, {})).toBe('<h1>portable\n</h1>\n');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
