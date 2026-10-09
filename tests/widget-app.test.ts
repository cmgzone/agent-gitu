import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { fetchWidgetSource, publicWidgetAddress, sanitizeWidgetApp, widgetAppDocument, widgetState, WIDGET_APP_CSP } from '../src/cowork/widget-app.js';
import { coworkTranscript } from '../src/cowork/context.js';

const homes: string[] = [];
function setup() {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-app-widget-')); homes.push(home);
  const file = path.join(home, 'cowork.json'), store = new CoworkStore(file);
  const agent = store.saveAgent({ name:'Builder',systemPrompt:'Build apps.' });
  const conv = store.saveConversation({kind:'dm',memberIds:[agent.id]});
  const other = store.saveConversation({kind:'dm',memberIds:[agent.id]});
  const app = store.saveWidget({ conversationId:conv.id,title:'Counter',kind:'app',data:{ html:'<button id="add">Add</button>',js:'window.loaded = true;',state:{count:0} } });
  return { file,store,agent,conv,other,app };
}
afterEach(() => homes.splice(0).forEach(home => rmSync(home,{recursive:true,force:true})));

describe('dynamic widget apps', () => {
  it('persists interaction state and keeps it when an agent updates the app definition', () => {
    const {file,store,app,conv} = setup();
    store.updateWidgetState(app.id,{count:3,notes:['Review']},0);
    expect(() => store.updateWidgetState(app.id,{count:99},0)).toThrow('state changed');
    store.saveWidget({id:app.id,conversationId:conv.id,title:app.title,kind:'app',data:{html:'<button>New UI</button>'}});
    const restored = new CoworkStore(file).getWidget(app.id)!;
    expect(restored.data['state']).toEqual({count:3,notes:['Review']});
    expect(restored.data['html']).toBe('<button>New UI</button>');
  });
  it('keeps each app separate, orders cards, shares across chats and restores dismissal after restart', () => {
    const {file,store,app,conv,other} = setup();
    const second = store.saveWidget({conversationId:conv.id,title:'Weather',kind:'app',data:{html:'<p>Weather</p>'},shared:true,order:1});
    expect(store.widgets(conv.id).map(item=>item.id)).toEqual([second.id,app.id]);
    expect(store.widgets(other.id).map(item=>item.id)).toEqual([second.id]);
    store.archiveWidget(second.id);
    const restored = new CoworkStore(file);
    expect(restored.widgets(other.id)).toHaveLength(0);
    restored.archiveWidget(second.id,true);
    expect(restored.widgets(other.id)[0]?.data['html']).toBe('<p>Weather</p>');
  });
  it('bounds app and state sizes, strips dangerous state keys, and validates named capabilities', () => {
    expect(widgetState(JSON.parse('{"__proto__":{"polluted":true},"count":1}'))).toEqual({count:1});
    expect(() => widgetState({text:'x'.repeat(128001)})).toThrow('128 KB');
    expect(() => sanitizeWidgetApp({html:'x'.repeat(512001)})).toThrow('512 KB');
    const app = sanitizeWidgetApp({html:'<p>App</p>',sources:[{name:'feed',url:'https://example.com/feed',refreshMs:1},{name:'bad',url:'javascript:run()'}],actions:[{name:'update',label:'Update',prompt:'Update my report'},{name:'bad name',prompt:'bad'}]});
    expect(app['sources']).toEqual([{name:'feed',url:'https://example.com/feed',refreshMs:5000}]);
    expect(app['actions']).toEqual([{name:'update',label:'Update',prompt:'Update my report'}]);
  });
  it('injects the state/live-data SDK before app scripts and enforces opaque isolation', () => {
    const {app} = setup();
    const doc = widgetAppDocument(app);
    expect(doc.indexOf("Object.defineProperty(window,'gitu'")).toBeLessThan(doc.indexOf('window.loaded = true'));
    expect(doc).toContain('gitu-widget-state');
    expect(doc).toContain('setInterval(refresh,source.refreshMs)');
    expect(doc).toContain('e.source!==parent');
    expect(WIDGET_APP_CSP).toContain('sandbox allow-scripts allow-forms');
    expect(WIDGET_APP_CSP).toContain("connect-src 'none'");
    expect(WIDGET_APP_CSP).not.toContain('allow-same-origin');
  });
  it('refuses private, credentialed and non-HTTP live data sources before connecting', async () => {
    for (const url of ['http://127.0.0.1:8345/api','http://10.0.0.1/','http://169.254.169.254/','http://[::1]/','https://user:secret@example.com/','file:///C:/secret']) await expect(fetchWidgetSource(url)).rejects.toThrow();
    expect(publicWidgetAddress('192.168.1.1')).toBe(false);
    expect(publicWidgetAddress('::ffff:127.0.0.1')).toBe(false);
    expect(publicWidgetAddress('8.8.8.8')).toBe(true);
    expect(publicWidgetAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('refreshes a live source when reopening a card and keeps hidden requests quiet', async () => {
    const {app}=setup();
    app.data['sources']=[{name:'feed',url:'https://example.com/feed',refreshMs:60000}];
    const handlers:Record<string,(event?:unknown)=>void>={},data=vi.fn();
    let hidden=true;
    const parent={postMessage:vi.fn((message:{id:string;method:string})=>{
      handlers['message']!({source:parent,data:{type:'gitu-widget-result',id:message.id,...(message.method==='fetch' && hidden ? {error:'widget-hidden'} : {result:message.method==='state' ? {} : {value:7}})}});
    })};
    const window={addEventListener:(type:string,fn:(event?:unknown)=>void)=>{handlers[type]=fn;},gitu:undefined as unknown};
    const context=createContext({window,parent,document:{hidden:false},setTimeout:()=>1,clearTimeout:vi.fn(),setInterval:vi.fn()});
    const sdk=/<script>([\s\S]+?)<\/script>/.exec(widgetAppDocument(app))![1]!;
    new Script(sdk).runInContext(context);
    (window.gitu as {onData:(fn:typeof data)=>void}).onData(data);
    handlers['DOMContentLoaded']!();
    await Promise.resolve();await Promise.resolve();
    expect(data).not.toHaveBeenCalled();
    hidden=false;
    handlers['message']!({source:parent,data:{type:'gitu-widget-visibility',visible:true}});
    await Promise.resolve();await Promise.resolve();
    expect(data).toHaveBeenCalledWith('feed',{value:7},null);
    expect(parent.postMessage.mock.calls.filter(([message])=>message.method==='fetch')).toHaveLength(2);
  });
  it('passes explicit creation intent and existing app state to the agent transcript', () => {
    const {store,conv,agent,app}=setup();
    const create=store.appendMessage(conv.id,{role:'user',via:'web',text:'Build a timer',widgetRequest:{mode:'create'}});
    expect(coworkTranscript([create],agent.id,store)[0]?.content).toContain('Create a working persisted widget');
    const edit=store.appendMessage(conv.id,{role:'user',via:'web',text:'Add a reset button',widgetRequest:{mode:'edit',widgetId:app.id}});
    expect(coworkTranscript([edit],agent.id,store)[0]?.content).toContain('"state":{"count":0}');
  });
});
