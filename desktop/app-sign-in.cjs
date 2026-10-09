// Keep this bridge limited to Composio sign-in from the trusted app frame.
function registerAppSignIn(webContents, appOrigin, openExternal) {
  webContents.ipc.handle('gitu:open-app-sign-in', async (event, value) => {
    if (webContents.isDestroyed() || event.senderFrame !== webContents.mainFrame) return false;
    try {
      if (new URL(event.senderFrame.url).origin !== appOrigin || typeof value !== 'string' || value.length > 8192) return false;
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !['connect.composio.dev', 'backend.composio.dev'].includes(url.hostname)) return false;
      await openExternal(url.href);
      return true;
    } catch { return false; }
  });
}

module.exports = { registerAppSignIn };
