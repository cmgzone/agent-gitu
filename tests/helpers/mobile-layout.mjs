// Isolated headless browser fallback when the app browser bridge is unavailable.
// Exercises rendered React Native Web controls, never React's internal state.
import { writeFileSync } from 'node:fs';
export async function connect() {
  const pages = await fetch('http://127.0.0.1:9844/json/list').then(response => response.json());
  const target = pages.find(page => page.type === 'page');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const pending = waiting.get(message.id); waiting.delete(message.id); if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const next = ++id; waiting.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  return { send, evaluate, close: () => socket.close(), screenshot: async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`release/${name}.png`, Buffer.from(result.data, 'base64'));
  } };
}
if (process.argv[2] === 'open') {
  const browser = await connect();
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.send('Page.navigate', { url: 'http://127.0.0.1:8443/' });
  await new Promise(resolve => setTimeout(resolve, 1800));
  console.log(await browser.evaluate(`JSON.stringify({text:document.body.innerText, inputs:[...document.querySelectorAll('input')].map(x=>({label:x.getAttribute('aria-label'),placeholder:x.placeholder})),buttons:[...document.querySelectorAll('[role="button"]')].map(x=>x.innerText)})`));
  await browser.screenshot('native-mobile-connect'); browser.close();
}
