/* Generate the PNG and Windows ICO forms from the canonical SVG mark.
 * Run with: npm run generate:brand-icons
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const source = path.join(root, 'assets', 'agent-gitu-mark.svg');
const pngOutput = path.join(root, 'assets', 'agent-gitu-icon.png');
const icoOutput = path.join(root, 'assets', 'agent-gitu-icon.ico');

function icoFromPngFrames(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;
  frames.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entry);
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...frames.map(({ png }) => png)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(source, 'utf8');
  // NativeImage does not rasterize SVG data URLs consistently on Windows.
  // Render through Chromium (the app's own engine) so the generated icon is
  // pixel-for-pixel consistent with the SVG shown in the UI.
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await window.loadURL(`data:text/html,${encodeURIComponent(`<!doctype html><style>html,body,img{margin:0;width:512px;height:512px;overflow:hidden}</style><img src="${svgDataUrl}" alt="">`)}`);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  window.destroy();
  if (image.isEmpty()) throw new Error('Unable to render the Agent Gitu SVG mark');
  const png = image.resize({ width: 512, height: 512, quality: 'best' }).toPNG();
  const frames = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    size,
    png: image.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }));
  fs.writeFileSync(pngOutput, png);
  fs.writeFileSync(icoOutput, icoFromPngFrames(frames));
  console.log(`Generated ${path.relative(root, pngOutput)} and ${path.relative(root, icoOutput)}`);
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exitCode = 1;
  app.quit();
});
