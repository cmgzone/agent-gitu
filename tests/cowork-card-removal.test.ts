import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { CoworkStore, type CoworkRequest } from '../src/cowork/store.js';

const cleanup: Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();vi.unstubAllEnvs();});

it('removes owner-selected cards persistently without granting permissions, deleting connections or approving coding',async()=>{
  const home=mkdtempSync(path.join(os.tmpdir(),'cowork-card-remove-'));vi.stubEnv('AGENT_GITU_HOME',home);
  const server=new GituServer({cwd:home,port:0,mailInboxWatching:false});
  cleanup.push(async()=>{await server.stop();rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const service=server as unknown as {cowork():CoworkStore;codingFollowupCards:Map<string,{runId:string;gateId:string;kind:'approval'}>;sessions:Map<string,unknown>};
  const store=service.cowork(),agent=store.saveAgent({name:'P.A',systemPrompt:'Help.',allowShell:false}),conversation=store.saveConversation({kind:'dm',memberIds:[agent.id]});
  store.assignAppAccount(agent.id,'github','saved-account');
  const add=(kind:CoworkRequest['kind'])=>store.addRequest({conversationId:conversation.id,agentId:agent.id,kind,title:'Wrong card',detail:'Fixture',permission:kind==='permission'?'shell':undefined,credential:kind==='credential'?{providerHint:'custom',baseUrl:'https://fixture.invalid',label:'Fixture'}:undefined});
  const permission=add('permission'),credential=add('credential'),receipt=add('recommendation');store.resolveRequest(receipt.id,'accepted','Already handled');
  const base='http://127.0.0.1:'+await server.start();
  const post=(url:string,body:object,cookie='')=>fetch(base+url,{method:'POST',headers:{origin:base,'content-type':'application/json',cookie},body:JSON.stringify(body)});
  const remove=(id:string,cookie='',origin=base)=>fetch(base+'/api/cowork/requests/'+id,{method:'DELETE',headers:{cookie,origin}});
  expect((await remove(permission.id)).status).toBe(401);
  const account={name:'Owner',email:'owner@example.com',password:'Disposable request-card fixture password'};
  expect((await post('/api/auth/register',account)).status).toBe(201);const login=await post('/api/auth/login',account),cookie=login.headers.get('set-cookie')!.split(';')[0]!;
  expect((await remove(permission.id,cookie,'https://attacker.example')).status).toBe(403);
  for(const card of [permission,credential,receipt]){expect((await remove(card.id,cookie)).status).toBe(200);expect(store.getRequest(card.id)?.hiddenAt).toBeDefined();}
  expect(store.getRequest(permission.id)?.status).toBe('dismissed');expect(store.getAgent(agent.id)?.allowShell).toBe(false);
  expect(store.getRequest(credential.id)?.status).toBe('dismissed');expect(store.getRequest(receipt.id)?.status).toBe('accepted');
  expect(store.appConnections(agent.id)).toHaveLength(1);expect(store.openRequests(conversation.id)).toHaveLength(0);
  expect(new CoworkStore().getRequest(permission.id)?.hiddenAt).toBeDefined();
  const count=store.messages(conversation.id).length;expect((await remove(permission.id,cookie)).status).toBe(200);expect(store.messages(conversation.id)).toHaveLength(count);
  const gate=add('permission'),approve=vi.fn();service.codingFollowupCards.set(gate.id,{runId:'fixture-coding',gateId:'gate',kind:'approval'});service.sessions.set('fixture-coding',{runtime:{approve}});
  try{expect((await remove(gate.id,cookie)).status).toBe(200);expect(approve).toHaveBeenCalledWith('gate',false);expect(store.getRequest(gate.id)).toMatchObject({status:'denied',hiddenAt:expect.any(String)});}
  finally{service.sessions.delete('fixture-coding');}
});
