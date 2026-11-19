import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkStore, type CoworkMessage } from '../src/cowork/store.js';
import { GituServer } from '../src/server/server.js';

const homes:string[]=[];
function setup(){
  const home=mkdtempSync(path.join(tmpdir(),'gitu-widget-route-'));homes.push(home);
  const file=path.join(home,'cowork.json'),store=new CoworkStore(file),agent=store.saveAgent({name:'Builder',systemPrompt:'Build.'});
  const conv=store.saveConversation({kind:'dm',memberIds:[agent.id]}),other=store.saveConversation({kind:'dm',memberIds:[agent.id]});
  let body:Record<string,unknown>={},status=0,result:Record<string,unknown>={},headers:Record<string,string>={},html='';
  type Routes={coworkStore:CoworkStore;readBody:()=>Promise<Record<string,unknown>>;sendJson:(res:ServerResponse,status:number,data:Record<string,unknown>)=>void;publishCowork:()=>void;dispatchCoworkMessage:(id:string,text:string,via:string,from:unknown,artifacts:unknown,thread:unknown,meta:{widgetRequest?:CoworkMessage['widgetRequest']})=>unknown;coworkRoutes:(req:IncomingMessage,res:ServerResponse,path:string,method:string)=>Promise<boolean>};
  const server=Object.create(GituServer.prototype) as Routes;
  server.coworkStore=store;server.readBody=async()=>body;server.publishCowork=vi.fn();
  server.sendJson=(_res,code,data)=>{status=code;result=data;};
  server.dispatchCoworkMessage=(id,text,_via,_from,_artifacts,_thread,meta)=>({ok:true,message:store.appendMessage(id,{role:'user',via:'web',text,widgetRequest:meta.widgetRequest})});
  const req={url:'/'} as IncomingMessage,res={writeHead:(code:number,value:Record<string,string>)=>{status=code;headers=value;},end:(value:string)=>{html=value;}} as unknown as ServerResponse;
  const route=async(url:string,method:string,payload:Record<string,unknown>={})=>{body=payload;result={};status=0;await server.coworkRoutes(req,res,url,method);return {status,result,headers,html};};
  const app=store.saveWidget({conversationId:conv.id,title:'Mini app',kind:'app',data:{html:'<button>Run</button>',state:{count:0},actions:[{name:'update',label:'Update',prompt:'Update my widget'}]}});
  return {file,store,conv,other,app,route};
}
afterEach(()=>homes.splice(0).forEach(home=>rmSync(home,{recursive:true,force:true})));
describe('widget runtime HTTP contract',()=>{
  it('serves an isolated app and persists state through the API',async()=>{
    const f=setup(),root='/api/cowork/widgets/'+f.app.id;
    const page=await f.route(root+'/app','GET');expect(page.status).toBe(200);expect(page.headers['content-security-policy']).toContain('sandbox allow-scripts');expect(page.html).toContain('window');
    const save=await f.route(root+'/runtime','POST',{op:'saveState',state:{count:2},revision:0});expect(save.status).toBe(200);expect(save.result['state']).toEqual({count:2});
    expect(new CoworkStore(f.file).getWidget(f.app.id)?.data['state']).toEqual({count:2});
    expect((await f.route(root+'/runtime','POST',{op:'saveState',state:{count:9},revision:0})).status).toBe(400);
    expect((await f.route(root+'/runtime','POST',{op:'fetch',name:'undeclared'})).status).toBe(400);
  });
  it('dismisses reversibly, restores saved app state, and excludes archived apps from execution',async()=>{
    const f=setup(),root='/api/cowork/widgets/'+f.app.id;
    await f.route(root,'DELETE');expect(f.store.widgets(f.conv.id)).toHaveLength(0);
    expect((await f.route(root+'/app','GET')).status).toBe(404);
    await f.route(root,'PATCH',{op:'restore'});expect(f.store.widgets(f.conv.id)[0]?.data['state']).toEqual({count:0});
  });
  it('updates a real checklist item and shares a widget across chats',async()=>{
    const f=setup(),list=f.store.saveWidget({conversationId:f.conv.id,title:'Tasks',kind:'list',data:{items:[{text:'Review',done:false}]}}),root='/api/cowork/widgets/'+list.id;
    expect((await f.route(root,'PATCH',{op:'toggle',index:0,done:true})).status).toBe(200);
    expect(list.data['items']).toEqual([{text:'Review',done:true}]);
    await f.route(root,'PATCH',{op:'layout',shared:true,order:1});expect(f.store.widgets(f.other.id)[0]?.id).toBe(list.id);
  });
  it('records creation intent, verifies action names and refuses foreign widget context',async()=>{
    const f=setup(),url='/api/cowork/conversations/'+f.conv.id+'/messages';
    const create=await f.route(url,'POST',{text:'Build a calculator',widgetRequest:{mode:'create',widgetId:f.app.id}});
    expect(create.status).toBe(202);expect((create.result['message'] as CoworkMessage).widgetRequest).toEqual({mode:'create',widgetId:undefined,action:undefined,input:undefined});
    expect((await f.route(url,'POST',{text:'Run',widgetRequest:{mode:'action',widgetId:f.app.id,action:'update'}})).status).toBe(202);
    expect((await f.route(url,'POST',{text:'Run',widgetRequest:{mode:'action',widgetId:f.app.id,action:'not-declared'}})).status).toBe(400);
    const foreign='/api/cowork/conversations/'+f.other.id+'/messages';
    expect((await f.route(foreign,'POST',{text:'Edit',widgetRequest:{mode:'edit',widgetId:f.app.id}})).status).toBe(400);
  });
});
