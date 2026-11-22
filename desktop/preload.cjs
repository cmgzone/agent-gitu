const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gituDesktop', {
  openProjectFolder: (folderPath) => ipcRenderer.invoke('gitu:open-project-folder', folderPath),
  openAppSignIn: (url) => ipcRenderer.invoke('gitu:open-app-sign-in', url),
  phoneAccess: () => ipcRenderer.invoke('gitu:phone-access'),
  allowPhoneAccess: () => ipcRenderer.invoke('gitu:allow-phone-access'),
  cloudAgent: {
    status: () => ipcRenderer.invoke('gitu:cloud-agent:status'),
    refresh: () => ipcRenderer.invoke('gitu:cloud-agent:refresh'),
    connect: (vpsId) => ipcRenderer.invoke('gitu:cloud-agent:connect', vpsId),
    switchToLocal: () => ipcRenderer.invoke('gitu:cloud-agent:switch-local'),
    claimFree: (params) => ipcRenderer.invoke('gitu:cloud-agent:claim-free', params),
    buy: (params) => ipcRenderer.invoke('gitu:cloud-agent:buy', params),
    verifyOrder: (reference) => ipcRenderer.invoke('gitu:cloud-agent:verify-order', reference),
    setAutoConnect: (enabled) => ipcRenderer.invoke('gitu:cloud-agent:set-auto-connect', enabled),
    openTopup: () => ipcRenderer.invoke('gitu:cloud-agent:open-topup'),
  },
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
