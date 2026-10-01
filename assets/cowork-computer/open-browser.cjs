/* Open the same persistent browser used by the agent, rather than a second profile. */
const fs = require('node:fs');
const url = process.argv[2];
const params = url && /^https?:\/\//.test(url) ? { action: 'navigate', url } : { action: 'state' };
fetch('http://127.0.0.1:8765', {
  method: 'POST',
  headers: { 'x-gitu-key': fs.readFileSync('/tmp/gitu-computer-key', 'utf8') },
  body: JSON.stringify({ id: require('node:crypto').randomUUID(), tool: 'browse', params }),
}).then(async (response) => {
  const result = await response.json();
  if (!result.ok) throw new Error(result.output);
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
