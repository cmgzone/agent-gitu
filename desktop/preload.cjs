const { ipcRenderer } = require('electron');

// Observe only the app's resolved appearance; no privileged API is exposed to
// page scripts or document previews. The main process validates the sender.
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
