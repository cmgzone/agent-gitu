const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('workspaceSmokeApi', {
  request: (route, options) => ipcRenderer.invoke('workspace-smoke-request', route, options),
});
