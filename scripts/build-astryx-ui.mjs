import {build} from 'vite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const clientRoot = path.join(rootDir, 'src', 'client-astryx');
const doctorOutDir = path.join(rootDir, 'dist-astryx');
const assetsOutDir = path.join(rootDir, 'src', 'server', 'ui-assets', 'astryx');
const embedTmpDir = path.join(os.tmpdir(), 'gitu-astryx-embed');

function onRollupWarn(warning, warn) {
  if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
  warn(warning);
}

async function main() {
  // 1. Standard Vite app build for `npx astryx doctor --built dist-astryx`
  await build({
    root: clientRoot,
    logLevel: 'warn',
    esbuild: {jsx: 'automatic'},
    build: {
      outDir: doctorOutDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      rollupOptions: {
        onwarn: onRollupWarn,
      },
    },
  });

  // 2. Single-bundle IIFE + CSS build embedded into `src/server/ui-assets/astryx/`
  fs.rmSync(embedTmpDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  await build({
    root: rootDir,
    logLevel: 'warn',
    esbuild: {jsx: 'automatic'},
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    build: {
      outDir: embedTmpDir,
      emptyOutDir: true,
      sourcemap: false,
      minify: true,
      cssCodeSplit: false,
      lib: {
        entry: path.join(clientRoot, 'main.tsx'),
        name: 'GituAstryxUI',
        formats: ['iife'],
        fileName: () => 'astryx-ui.js',
      },
      rollupOptions: {
        onwarn: onRollupWarn,
        output: {
          assetFileNames: 'astryx-ui[extname]',
        },
      },
    },
  });

  fs.mkdirSync(assetsOutDir, {recursive: true});
  const jsPath = path.join(embedTmpDir, 'astryx-ui.js');
  const cssCandidates = fs
    .readdirSync(embedTmpDir)
    .filter(name => name.endsWith('.css'));
  if (!fs.existsSync(jsPath)) {
    throw new Error('Expected built astryx-ui.js bundle was not generated');
  }
  const rawJs = fs.readFileSync(jsPath, 'utf8');
  const safeJs = rawJs.replace(/<\/(script)/gi, '<\\/$1');
  fs.writeFileSync(path.join(assetsOutDir, 'astryx-ui.js'), safeJs, 'utf8');

  const rawCss = cssCandidates
    .map(name => fs.readFileSync(path.join(embedTmpDir, name), 'utf8'))
    .join('\n');
  const safeCss = rawCss.replace(/<\/(style)/gi, '\\3c /$1');
  fs.writeFileSync(path.join(assetsOutDir, 'astryx-ui.css'), safeCss, 'utf8');

  try {
    fs.rmSync(embedTmpDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  } catch {}
  try {
    fs.rmSync(path.join(rootDir, '.tmp-astryx-embed'), {recursive: true, force: true, maxRetries: 3, retryDelay: 50});
  } catch {}
  console.log(
    `Built Astryx UI (${Math.round(safeJs.length / 1024)} KB JS, ${Math.round(safeCss.length / 1024)} KB CSS)`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
