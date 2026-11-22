const ALLOWED_APP_SIGN_IN_HOSTS = new Set(['connect.composio.dev', 'backend.composio.dev', 'app.composio.dev', 'pikpam.com', 'www.pikpam.com']);

// Keep this bridge limited to app sign-in from the trusted app frame.
function registerAppSignIn(webContents, appOriginOrPredicate, openExternal) {
  const isTrustedOrigin = typeof appOriginOrPredicate === 'function'
    ? appOriginOrPredicate
    : (origin) => origin === appOriginOrPredicate;

  webContents.ipc.handle('gitu:open-app-sign-in', async (event, value) => {
    if (webContents.isDestroyed() || event.senderFrame !== webContents.mainFrame) return false;
    try {
      if (!isTrustedOrigin(new URL(event.senderFrame.url).origin) || typeof value !== 'string' || value.length > 8192) return false;
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !ALLOWED_APP_SIGN_IN_HOSTS.has(url.hostname)) return false;
      await openExternal(url.href);
      return true;
    } catch { return false; }
  });
}

module.exports = { registerAppSignIn };
