// Temporary verification server: serves the CURRENT built UI_HTML from dist/,
// plus a /demo route that renders sample skill output through the REAL
// shared viewer code (OUTPUT_CSS + OUTPUT_JS from the same dist build).
const http = require('node:http');

(async () => {
  const { UI_HTML } = await import('./dist/server/ui.js');
  const { OUTPUT_CSS, OUTPUT_JS } = await import('./dist/server/ui-outputs.js');
  const { UI_RESPONSE_JS } = await import('./dist/server/ui-response.js');
  const port = Number(process.env.PORT || 8481);

  const bt = String.fromCharCode(96).repeat(3);
  const fence = (kind, payload) => bt + 'output ' + kind + '\n' + payload + '\n' + bt;

  const chart = JSON.stringify({
    type: 'bar',
    title: 'Latency by surface',
    labels: ['Coding', 'Cowork', 'CLI'],
    series: [
      { name: 'p50 ms', data: [120, 118, 95] },
      { name: 'p95 ms', data: [310, 340, 240] },
    ],
  });
  const table = [
    '| Skill | Output |',
    '| --- | --- |',
    '| Research | comparison, sources |',
    '| Data | chart, sortable table |',
  ].join('\n');
  const docs = JSON.stringify([
    { name: 'q3-report.pdf', url: '/files/q3-report.pdf', mime: 'application/pdf', size: 245760 },
    { name: 'dataset.csv', url: '/files/dataset.csv', mime: 'text/csv', size: 18432 },
  ]);
  const gallery = JSON.stringify([
    { url: 'https://placehold.co/240x150/1c2333/8ab4ff?text=One', caption: 'Dashboard v1' },
    { url: 'https://placehold.co/240x150/1c2333/8ab4ff?text=Two', caption: 'Dashboard v2' },
  ]);

  const sample = [
    'Here is what the skills produced.',
    '',
    fence('chart', chart),
    '',
    fence('table', table),
    '',
    fence('docs', docs),
    '',
    fence('json', '{"ok":true,"rows":42}'),
    '',
    fence('map', '{"q":"Berlin"}'),
    '',
    fence('gallery', gallery),
    '',
    fence('video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    '',
    fence('preview', '<h3>Inline mini-app</h3><p>Preview block rendered.</p>'),
    '',
    'Ordinary text and code keep flowing:',
    '',
    bt + 'js',
    'const notAViewer = 1;',
    bt,
  ].join('\n');

  const sampleLiteral = JSON.stringify(sample).replace(/</g, '\\u003c');

  const demoHtml = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>Shared output viewers</title>',
    '<style>',
    'body{background:#0f1116;color:#e6e9ef;font:14px/1.5 system-ui,Segoe UI,sans-serif;padding:20px;max-width:900px}',
    'pre{background:#0b0d12;padding:10px;border-radius:8px;overflow:auto}',
    OUTPUT_CSS,
    '</style></head><body>',
    '<h1 style="font-size:16px">Shared output viewers</h1>',
    '<div id="wrap"></div>',
    '<script>window.__SAMPLE__=' + sampleLiteral + ';</' + 'script>',
    '<script>(function(){',
    OUTPUT_JS,
    'var el=document.getElementById("wrap");',
    'el.innerHTML=outRenderBlocks(window.__SAMPLE__);',
    'document.body.setAttribute("data-rendered","1");',
    '})();<' + '/script>',
    '</body></html>',
  ].join('');

  // Renders a real Coding assistant message body through the REAL renderResponseText
  // from dist, so a bare markdown table is exercised on the page rather than only
  // inside unit tests. Output order matters: the shared viewers must be defined
  // before the Coding renderer, which delegates to them.
  const codingSample = [
    'The research skill returned a comparison you can sort by clicking a column:',
    '',
    table,
    '',
    'Ordinary prose, bold and a list still render normally:',
    '',
    '- **Bold item** with `inline code`',
    '- Second item',
    '',
    fence('chart', chart),
    '',
    bt + 'js',
    'const stillPlainCode = 1;',
    bt,
  ].join('\n');

  const codingHtml = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<title>Coding surface message body</title>',
    '<style>',
    'body{background:#0f1116;color:#e6e9ef;font:14px/1.5 system-ui,Segoe UI,sans-serif;padding:20px;max-width:900px}',
    '.bubble{background:#151922;border:1px solid #232936;border-radius:10px;padding:14px 16px}',
    'h1{font-size:16px}',
    OUTPUT_CSS,
    '</style></head><body>',
    '<h1>Coding surface: one assistant message body</h1>',
    '<div class="bubble" id="wrap"></div>',
    '<script>window.__SAMPLE__=' + JSON.stringify(codingSample).replace(/</g, '\\u003c') + ';</' + 'script>',
    '<script>(function(){',
    OUTPUT_JS,
    UI_RESPONSE_JS,
    'var el=document.getElementById("wrap");',
    'el.innerHTML=renderResponseText(window.__SAMPLE__);',
    'document.body.setAttribute("data-rendered","1");',
    '})();<' + '/script>',
    '</body></html>',
  ].join('');

  http
    .createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: UI_HTML.length }));
        return;
      }
      if (req.url === '/demo') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(demoHtml);
        return;
      }
      if (req.url === '/coding') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(codingHtml);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(UI_HTML);
    })
    .listen(port, '127.0.0.1', () => console.log('serving UI_HTML on ' + port));
})();
