/* A regular desktop Chrome session for human sign-in; no automation endpoint. */
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const requested = process.argv[2];
const url = requested && /^https?:\/\//.test(requested) ? requested : 'about:blank';
const profile = '/home/agent/manual-browser';
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
const log = fs.openSync('/tmp/gitu-manual-browser.log', 'a', 0o600);
// The desktop's no-new-privileges policy prevents Chrome's setuid sandbox.
// As with its existing Chromium, the unprivileged container provides isolation.
const child = spawn('google-chrome-stable', ['--no-sandbox', '--no-default-browser-check', '--user-data-dir=' + profile, url], { stdio: ['ignore', log, log], detached: true });
fs.closeSync(log);
child.once('error', (error) => { console.error('Could not open Google Chrome:', error.message); process.exitCode = 1; });
child.unref();
