const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gituDock', {
  snapshot: () => ipcRenderer.invoke('gitu:dock:snapshot'),
  getState: () => ipcRenderer.invoke('gitu:dock:get-state'),
  openChat: (payload) => ipcRenderer.invoke('gitu:dock:open-chat', payload),
  closeChat: () => ipcRenderer.invoke('gitu:dock:close-chat'),
  setCollapsed: (collapsed) => ipcRenderer.invoke('gitu:dock:set-collapsed', collapsed),
  setEdge: (edge) => ipcRenderer.invoke('gitu:dock:set-edge', edge),
  setPinned: (ids) => ipcRenderer.invoke('gitu:dock:set-pinned', ids),
  setCodingShortcut: (include) => ipcRenderer.invoke('gitu:dock:set-coding-shortcut', include),
  setChatPinned: (alwaysOnTop) => ipcRenderer.invoke('gitu:dock:set-chat-pinned', alwaysOnTop),
  openMain: (payload) => ipcRenderer.invoke('gitu:dock:open-main', payload),
  readClipboard: () => ipcRenderer.invoke('gitu:dock:read-clipboard'),
  api: (path, method = 'GET', body) => ipcRenderer.invoke('gitu:dock:api', { path, method, body }),
  createAgent: (payload) => ipcRenderer.invoke('gitu:dock:create-agent', payload),
  onState: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, data) => listener(data);
    ipcRenderer.on('gitu:dock:state', handler);
    return () => ipcRenderer.removeListener('gitu:dock:state', handler);
  },
});
