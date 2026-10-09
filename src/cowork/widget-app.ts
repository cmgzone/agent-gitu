import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { CoworkWidget } from './store.js';

export const WIDGET_APP_CSP = "default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src https: http: data: blob:; media-src https: http: blob:; font-src https: data:; connect-src 'none'; frame-src https:; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-forms";

export const WIDGET_APP_TOOL_GUIDE = 'Interactive mini apps: kind="app", data={html:"HTML UI",css:"optional CSS",js:"optional JS",state:{...},height:360,sources:[{name:"weather",url:"https://public-api.example/data",refreshMs:60000}],actions:[{name:"refresh-report",label:"Update report",prompt:"Fetch current results and update this widget"}]}. Build custom UI in HTML/CSS/JS: calculators, editors, forms, charts, timers, trackers, games, dashboards, media or tool controls. The sandbox provides window.gitu: await gitu.ready; gitu.getState(); await gitu.setState({key:value}) (durable shallow patch); gitu.onState(fn); await gitu.fetch("source-name") (parsed JSON or text); gitu.onData((name,data,error)=>...) (sources refresh automatically while visible); gitu.refresh(name); gitu.resize(height); gitu.requestAgent("action-name",{input:...}) stages a named action in chat for the user to send. Declared actions also render as host buttons. Public GET sources are fetched without credentials; use connected tools through named agent actions for authenticated services or writes, never embed API keys. Handle loading/errors in the app; never fabricate live values. The SDK is injected before your scripts. Keep independent apps in separate widgets with distinct titles, not one ever-growing card. Optional top-level shared=true makes a widget available across chats; order sets its position. State survives app-definition updates. For actual reminders/automation also use schedule_manage or follow-up tools rather than only displaying dates. action=get with id returns the saved definition. ';

export function widgetState(value: unknown): Record<string, unknown> {
  const text = JSON.stringify(value ?? {});
  if (text.length > 128_000) throw new Error('Widget state exceeds 128 KB');
  const state = JSON.parse(text, (key, item: unknown) => ['__proto__', 'constructor', 'prototype'].includes(key) ? undefined : item) as unknown;
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Widget state must be an object');
  return state as Record<string, unknown>;
}

export function sanitizeWidgetApp(value: unknown): Record<string, unknown> {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const html = String(raw['html'] ?? '').trim();
  const css = String(raw['css'] ?? '');
  const js = String(raw['js'] ?? '');
  if (html.length + css.length + js.length > 512_000) throw new Error('Widget app exceeds 512 KB');
  if (!html) throw new Error('A widget app needs HTML');
  const named = (item: unknown) => item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const name = (item: Record<string, unknown>) => /^[a-zA-Z][\w-]{0,63}$/.test(String(item['name'])) ? String(item['name']) : '';
  const sources = (Array.isArray(raw['sources']) ? raw['sources'] : []).slice(0, 32).map(item => {
    const row = named(item);
    let url: URL;
    try { url = new URL(String(row['url'])); } catch { return null; }
    if (!name(row) || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { name: name(row), url: url.href, refreshMs: Math.max(5_000, Math.min(3_600_000, Number(row['refreshMs']) || 60_000)) };
  }).filter(Boolean);
  const actions = (Array.isArray(raw['actions']) ? raw['actions'] : []).slice(0, 32).map(item => {
    const row = named(item);
    const prompt = String(row['prompt'] ?? '').trim().slice(0, 8_000);
    return name(row) && prompt ? { name: name(row), label: String(row['label'] ?? name(row)).slice(0, 100), prompt } : null;
  }).filter(Boolean);
  return { html, css, js, state: widgetState(raw['state']), sources, actions, height: Math.max(180, Math.min(900, Number(raw['height']) || 360)) };
}

/** Opaque-origin frames have no access to the host, cookies, keys or tools.
 * Their SDK can only ask the parent for named data sources and saved state.
 * Agent actions are staged in the normal composer for the user to send. */
export function widgetAppDocument(widget: CoworkWidget): string {
  const data = widget.data;
  const config = JSON.stringify({ state: data['state'] ?? {}, sources: data['sources'] ?? [] }).replace(/</g, '\\u003c');
  const sdk = `<script>(function(){
  var config=${config},state=config.state,pending={},listeners=[],dataListeners=[],queries={},seq=0,loaded=false;
  function rpc(method,payload){return new Promise(function(resolve,reject){var id=String(++seq),timer=setTimeout(function(){delete pending[id];reject(new Error('Widget request timed out'));},20000);pending[id]={resolve:resolve,reject:reject,timer:timer};parent.postMessage({type:'gitu-widget',id:id,method:method,payload:payload},'*');});}
  window.addEventListener('message',function(e){if(e.source!==parent||!e.data)return;if(e.data.type==='gitu-widget-visibility'){if(e.data.visible&&loaded)config.sources.forEach(function(source){api.refresh(source.name).catch(function(){});});return;}if(e.data.type==='gitu-widget-state'){if(JSON.stringify(state)!==JSON.stringify(e.data.state))update(e.data.state);return;}if(e.data.type!=='gitu-widget-result')return;var m=e.data,p=pending[m.id];if(!p)return;clearTimeout(p.timer);delete pending[m.id];if(m.error)p.reject(new Error(m.error));else p.resolve(m.result);});
  function snapshot(){return JSON.parse(JSON.stringify(state));}
  function update(next){state=next;listeners.forEach(function(fn){fn(snapshot());});return snapshot();}
  var ready=rpc('state',{}).then(update),queue=ready;
  var api={ready:ready,getState:snapshot,setState:function(patch){queue=queue.catch(function(){}).then(function(){return rpc('saveState',patch);}).then(update);return queue;},onState:function(fn){listeners.push(fn);return function(){listeners=listeners.filter(function(item){return item!==fn;});};},fetch:function(name,query){if(query)queries[name]=query;return rpc('fetch',{name:name,params:queries[name]||{}});},onData:function(fn){dataListeners.push(fn);return function(){dataListeners=dataListeners.filter(function(item){return item!==fn;});};},requestAgent:function(name,input){return rpc('agent',{name:name,input:input||{}});},resize:function(height){return rpc('resize',{height:height});}};
  api.refresh=function(name){return api.fetch(name).then(function(data){dataListeners.forEach(function(fn){fn(name,data,null);});return data;}).catch(function(error){if(error.message==='widget-hidden')return;dataListeners.forEach(function(fn){fn(name,null,error);});throw error;});};
  Object.defineProperty(window,'gitu',{value:api});
  window.addEventListener('DOMContentLoaded',function(){loaded=true;config.sources.forEach(function(source){function refresh(){if(!document.hidden)api.refresh(source.name).catch(function(){});}refresh();setInterval(refresh,source.refreshMs);});});
  })();</script>`;
  const base = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light dark}body{margin:0;font:13px/1.5 system-ui;background:transparent}*{box-sizing:border-box}</style>' + sdk;
  let html = String(data['html']);
  if (/<head(?:\s[^>]*)?>/i.test(html)) html = html.replace(/<head(?:\s[^>]*)?>/i, head => head + base);
  else html = '<!doctype html><head>' + base + '</head><body>' + html + '</body>';
  return html + '<style>' + String(data['css'] ?? '') + '</style><script>' + String(data['js'] ?? '') + '</script>';
}

export function publicWidgetAddress(address: string): boolean {
  if (address.toLowerCase().startsWith('::ffff:')) return publicWidgetAddress(address.slice(7));
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a !== 0 && a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 172 && b! >= 16 && b! <= 31) && !(a === 192 && b === 168) && !(a === 100 && b! >= 64 && b! <= 127) && a! < 224;
  }
  return isIP(address) === 6 && /^[23]/.test(address) && !/^2001:(?:db8|0:)/i.test(address);
}

/** GET-only public data, pinned to its validated DNS address. Redirects are
 * checked again; app-authored headers/cookies and private hosts are excluded. */
export async function fetchWidgetSource(raw: string, redirects = 0): Promise<unknown> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Use a public HTTP or HTTPS data source');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => !publicWidgetAddress(item.address))) throw new Error('Widget sources cannot access private network addresses');
  const address = addresses[0]!;
  const response = await new Promise<{ status: number; location?: string; type: string; body: string }>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(url, { method: 'GET', headers: { accept: 'application/json, text/plain;q=0.8', 'user-agent':'AgentGitu-Widget/1.0' }, lookup: (_hostname, options, callback) => options.all ? callback(null, [address], address.family) : callback(null, address.address, address.family) }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1_000_000) { res.destroy(new Error('Data source response exceeds 1 MB')); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode ?? 500, location: res.headers.location, type: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(new Error('Data source timed out')), 12_000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
  });
  if (response.status >= 300 && response.status < 400 && response.location) {
    if (redirects >= 3) throw new Error('Too many data source redirects');
    return fetchWidgetSource(new URL(response.location, url).href, redirects + 1);
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`Data source returned ${response.status}`);
  return response.type.includes('json') ? JSON.parse(response.body) : response.body;
}
