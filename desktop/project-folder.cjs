const path = require('node:path');
const fs = require('node:fs/promises');

function registerProjectFolder(webContents, appOrigin, openPath) {
  webContents.ipc.handle('gitu:open-project-folder', async (event, value) => {
    if (webContents.isDestroyed() || event.senderFrame !== webContents.mainFrame) return { ok: false, error: 'Open folders from the main app window.' };
    try {
      if (new URL(event.senderFrame.url).origin !== appOrigin || typeof value !== 'string' || value.length > 32768 || value.includes('\0') || !path.isAbsolute(value)) {
        return { ok: false, error: 'Choose a valid project folder.' };
      }
      const resolved = await fs.realpath(value);
      if (!(await fs.stat(resolved)).isDirectory()) return { ok: false, error: 'Choose a folder.' };
      const error = await openPath(resolved);
      return error ? { ok: false, error: 'The system could not open this folder.' } : { ok: true };
    } catch { return { ok: false, error: 'This folder is unavailable. Check its location and access.' }; }
  });
}

module.exports = { registerProjectFolder };
