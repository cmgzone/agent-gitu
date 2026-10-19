import { readFileSync, readdirSync } from 'node:fs';

/** Development/test loader. The build replaces this module with bundled data,
 * so installed packages never depend on the source tree or runtime file reads. */
const root = new URL('./ui-assets/', import.meta.url);
export const UI_ASSETS: Readonly<Record<string, string>> = Object.fromEntries(
  readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((name) => name.toString())
    .filter((name) => /\.(?:html|css|js)$/.test(name))
    .sort()
    .map((name) => [name.replaceAll('\\', '/'), readFileSync(new URL(name.replaceAll('\\', '/'), root), 'utf8').replace(/\r\n?/g, '\n')]),
);
