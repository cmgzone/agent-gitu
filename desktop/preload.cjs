const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gituDesktop', {
  openAppSignIn: (url) => ipcRenderer.invoke('gitu:open-app-sign-in', url),
});

// The main process validates the sender for both appearance and sign-in.
window.addEventListener('DOMContentLoaded', () => {
  let previous;
  const syncTheme = () => {
    const theme = document.documentElement.getAttribute('data-theme');
    if ((theme === 'light' || theme === 'dark') && theme !== previous) {
      previous = theme;
      ipcRenderer.send('gitu:theme', theme);
    }
  };
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  syncTheme();
}, { once: true });
