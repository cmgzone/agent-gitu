import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = new URL('../', import.meta.url);

/** Emit data rather than source-tree paths: desktop, CLI, and Docker packages
 * all include dist/, and can render the complete offline UI from there alone. */
export function bundleUiAssets(source = fileURLToPath(new URL('src/server/ui-assets/', project)), output = fileURLToPath(new URL('dist/server/ui-assets.js', project))) {
  const assets = Object.fromEntries(
    readdirSync(source, { recursive: true })
      .filter((name) => /\.(?:html|css|js)$/.test(name))
      .sort()
      .map((name) => [name.replaceAll('\\', '/'), readFileSync(path.join(source, name), 'utf8').replace(/\r\n?/g, '\n')]),
  );
  if (!assets['index.html']) throw new Error('UI bundle is missing index.html');
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, '// Generated from src/server/ui-assets by npm run build.\nexport const UI_ASSETS = ' + JSON.stringify(assets) + ';\n');
  return Object.keys(assets).length;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  console.log('Bundled ' + bundleUiAssets() + ' UI assets.');
}
