const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('startupRetry').addEventListener('click', () => ipcRenderer.send('gitu:startup-retry'));
  ipcRenderer.on('gitu:startup-status', (_event, state) => {
    document.getElementById('startupStatus').textContent = state.text;
    document.getElementById('startupRetry').hidden = !state.failed;
    document.getElementById('startupDots').hidden = Boolean(state.failed);
    document.body.classList.toggle('failed', Boolean(state.failed));
  });
});
