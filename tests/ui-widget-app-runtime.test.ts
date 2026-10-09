import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { WIDGET_APP_RUNTIME_JS } from '../src/server/ui-widget-app-runtime.js';

class Node {
  children: Node[] = []; parent?: Node; firstElementChild?: Node;
  signature?: string; _widgetSignature?: string;
  frame = { contentWindow:{postMessage:vi.fn()} };
  constructor(public id = '') {}
  set innerHTML(value: string) { this.children=[]; this.firstElementChild=new Node(/data-cw-widget-card="([^"]+)"/.exec(value)?.[1] || ''); }
  getAttribute(name:string) { return name==='data-cw-widget-card' ? this.id : null; }
  querySelector(selector:string): Node | typeof this.frame | null { return selector.includes('iframe') ? this.frame : this.children.find(item=>selector.includes(item.id)) || null; }
  appendChild(node:Node) { node.remove(); this.children.push(node); node.parent=this; }
  remove() { if(this.parent) { this.parent.children=this.parent.children.filter(item=>item!==this);this.parent=undefined; } }
  replaceWith(node:Node) { if(this.parent) { const parent=this.parent,index=parent.children.indexOf(this);this.remove();parent.children.splice(index,0,node);node.parent=parent; } }
  insertBefore(node:Node,before:Node|null) { node.remove();const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,node);node.parent=this; }
}
function fixture() {
  const cw = {active:'conv',widgets:[] as Record<string,unknown>[],widgetRequest:null as Record<string,unknown>|null};
  const input = {value:'Keep my draft',dataset:{} as Record<string,string>,placeholder:'Message Agent',getAttribute:()=> 'Message Agent',focus:vi.fn()};
  const nodes:Record<string,unknown>={cwInput:input,cwWidgetIntent:{hidden:true},cwWidgetIntentLabel:{textContent:''},cwWidgetIntentCancel:{onclick:null}};
  const handlers:Record<string,(event:unknown)=>void>={},frames:unknown[]=[],api=vi.fn().mockResolvedValue({state:{count:2},revision:1});
  const context=createContext({
    window:{addEventListener:(type:string,handler:(event:unknown)=>void)=>{handlers[type]=handler;}},document:{createElement:()=>new Node(),querySelectorAll:()=>frames},
    cwEnsure:()=>cw,$:(id:string)=>nodes[id],cwWidgetsClose:vi.fn(),cwClosePanels:vi.fn(),cwSaveDraft:vi.fn(),cwRenderComposerAction:vi.fn(),cwRenderWidgets:vi.fn(),cwPoll:vi.fn(),cwOpenConv:vi.fn((id:string)=>{cw.active=id;}),
    cwWidgetCardHtml:(widget:Record<string,unknown>)=>'<article data-cw-widget-card="'+widget['id']+'"></article>',crypto:{randomUUID:()=> 'request-1'},esc:String,cwIcon:()=>'<svg></svg>',api,toast:vi.fn(),
  });
  new Script(WIDGET_APP_RUNTIME_JS).runInContext(context);
  return {cw,input,nodes,context,handlers,frames,api};
}
describe('widget app runtime and creation flow',()=>{
  it('takes creation to the composer without losing or submitting the current draft',()=>{
    const f=fixture();f.context.cwBeginWidgetRequest('create');
    expect(f.cw.widgetRequest).toEqual({mode:'create',widgetId:undefined,action:undefined,input:undefined});
    expect(f.input.value).toBe('Keep my draft');expect(f.input.placeholder).toContain('mini app');
    expect(f.input.focus).toHaveBeenCalled();expect(f.api).not.toHaveBeenCalled();
    (f.nodes['cwWidgetIntentCancel'] as {onclick:()=>void}).onclick();
    expect(f.cw.widgetRequest).toBeNull();expect(f.input.value).toBe('Keep my draft');
  });
  it('keeps an app iframe mounted through saved-state and unrelated-card updates',()=>{
    const f=fixture(),cards=new Node();
    const app={id:'app-1',kind:'app',data:{html:'<button>Add</button>',state:{count:1}},updatedAt:'first'};
    const text={id:'text-1',kind:'text',data:{text:'First'}};
    f.context.cwRenderWidgetGrid(cards,[app,text]);
    const appCard=cards.children[0],frame=appCard!.frame;
    f.context.cwRenderWidgetGrid(cards,[{...app,data:{...app.data,state:{count:2}},updatedAt:'second'},{...text,data:{text:'Updated'}}]);
    expect(cards.children[0]).toBe(appCard);expect(cards.children[0]!.frame).toBe(frame);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith({type:'gitu-widget-state',state:{count:2}},'*');
    expect(cards.children).toHaveLength(2);
  });
  it('rejects messages from other windows and routes owned-frame state through the saved API',async()=>{
    const f=fixture(),source={},post=vi.fn();
    const frame={contentWindow:{postMessage:post},isConnected:true,offsetParent:{},getAttribute:()=> 'app-1'};
    f.frames.push(frame);f.cw.widgets=[{id:'app-1',kind:'app',data:{state:{count:0}}}];
    const message={type:'gitu-widget',id:'1',method:'saveState',payload:{count:2}};
    f.handlers['message']!({source,data:message});expect(f.api).not.toHaveBeenCalled();
    f.handlers['message']!({source:frame.contentWindow,data:message});await Promise.resolve();await Promise.resolve();
    expect(f.api).toHaveBeenCalledWith('/api/cowork/widgets/app-1/runtime',expect.objectContaining({method:'POST',body:JSON.stringify({op:'saveState',state:{count:2}})}));
    expect(post).toHaveBeenCalledWith(expect.objectContaining({type:'gitu-widget-result',result:{count:2}}),'*');
  });
  it('runs a declared host action through the agent without submitting or overwriting a draft',async()=>{
    const f=fixture();await f.context.cwRunWidgetAction({id:'app-1',conversationId:'conv'},{name:'refresh',prompt:'Update this widget'});
    const payload=JSON.parse(f.api.mock.calls[0]![1].body);
    expect(payload.widgetRequest).toEqual({mode:'action',widgetId:'app-1',action:'refresh'});
    expect(payload.text).toBe('Update this widget');expect(f.input.value).toBe('Keep my draft');
  });
});
