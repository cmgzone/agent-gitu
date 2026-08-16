const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const logFile = path.join(os.tmpdir(), 'webview-probe.log');
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

const PAGE = `<!doctype html><html><body>
<div id="host" style="position:fixed;left:-10000px;top:0;width:1280px;height:900px">
  <div id="view" style="position:relative;width:100%;height:100%"></div>
</div>
<script>
  function c(m){ console.log('PROBE ' + m); }
  c('page loaded, userAgent=' + navigator.userAgent.slice(0, 60));
  var wv = document.createElement('webview');
  wv.addEventListener('dom-ready', function(){ c('dom-ready url=' + wv.getURL()); });
  wv.addEventListener('did-start-loading', function(){ c('did-start-loading'); });
  wv.addEventListener('did-stop-loading', function(){ c('did-stop-loading url=' + wv.getURL() + ' title=' + wv.getTitle()); });
  wv.addEventListener('did-fail-load', function(e){ c('did-fail-load ' + e.errorCode + ' ' + e.errorDescription); });
  document.getElementById('view').appendChild(wv);
  c('webview appended');
  setTimeout(function(){
    try {
      var p = wv.loadURL('https://example.com/');
      c('loadURL called, promise=' + Boolean(p && p.then));
      if (p && p.then) p.then(function(){ c('loadURL resolved'); }, function(e){ c('loadURL rejected ' + e.message); });
    } catch (e) { c('loadURL threw ' + e.message); }
  }, 2500);
  setTimeout(function(){
    try {
      wv.capturePage().then(function(img){ c('capturePage isEmpty=' + img.isEmpty() + ' size=' + img.getSize().width + 'x' + img.getSize().height); });
    } catch (e) { c('capturePage threw ' + e.message); }
  }, 7000);
</script>
</body></html>`;

app.whenReady().then(() => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
  });
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    log(`probe server on ${port}`);
    const win = new BrowserWindow({
      show: false,
      webPreferences: { webviewTag: true, contextIsolation: true },
    });
    win.webContents.on('console-message', (ev) => {
      log(`console: ${ev.message}`);
    });
    win.loadURL(`http://127.0.0.1:${port}/`).then(() => {
      log('probe page loaded');
    });
    setTimeout(() => {
      log('probe done');
      app.quit();
    }, 12000);
  });
});
