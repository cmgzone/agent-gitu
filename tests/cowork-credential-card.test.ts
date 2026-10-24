import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createContext,Script} from 'node:vm';
import {afterEach,expect,it,vi} from 'vitest';
import {GituServer} from '../src/server/server.js';
import {CoworkStore} from '../src/cowork/store.js';
import {ConnectionRegistry} from '../src/connections/connections.js';
import {COWORK_JS} from '../src/server/ui-cowork.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();vi.restoreAllMocks();vi.unstubAllEnvs();});

it('saves only the key against the current card settings and rejects stale or removed cards',async()=>{
 const home=mkdtempSync(path.join(os.tmpdir(),'cowork-key-card-'));vi.stubEnv('AGENT_GITU_HOME',home);
 const server=new GituServer({cwd:home,port:0,mailInboxWatching:false});
 cleanup.push(async()=>{await server.stop();rmSync(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
 const service=server as unknown as {cowork():CoworkStore;connections:ConnectionRegistry;dispatchAgentWake:()=>boolean};
 const wake=vi.spyOn(service,'dispatchAgentWake').mockReturnValue(true);
 const store=service.cowork(),agent=store.saveAgent({name:'P.A',systemPrompt:'Help'}),chat=store.saveConversation({kind:'dm',memberIds:[agent.id]});
 const card=store.addRequest({conversationId:chat.id,agentId:agent.id,kind:'credential',title:'Connect my API',detail:'Enter your key.',credential:{providerHint:'custom',label:'My API',baseUrl:'https://api.example.test',validationPath:'/me',auth:{type:'header',header:'X-API-Key'}}});
 const base='http://127.0.0.1:'+await server.start();
 let cookie='';const post=(route:string,body:object,origin=base)=>fetch(base+route,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const route='/api/cowork/requests/'+card.id;
 const secret='private-fixture-key-for-card';
 const oldSetup=JSON.stringify(card.credential);
 expect((await post(route+'/credential-save',{token:secret,setup:oldSetup})).status).toBe(401);
 const account={name:'Owner',email:'owner@example.com',password:'Disposable connection card password'};
 expect((await post('/api/auth/register',account)).status).toBe(201);const login=await post('/api/auth/login',account);cookie=login.headers.get('set-cookie')!.split(';')[0]!;
 expect((await post(route+'/credential-save',{token:secret,setup:oldSetup},'https://attacker.example')).status).toBe(403);
 store.updateCredentialRequest(card.id,agent.id,chat.id,{title:'Connect corrected API',detail:'Ready for your key.',credential:{...card.credential!,baseUrl:'https://correct.example.test'}});
 expect((await post(route+'/credential-save',{token:secret,setup:oldSetup})).status).toBe(409);
 expect(service.connections.list()).toHaveLength(0);
 const setup=JSON.stringify(card.credential);
 const saved=await post(route+'/credential-save',{token:secret,setup});expect(saved.status).toBe(200);
 const data=await saved.json() as {connection:{id:string}};
 const profile=service.connections.get(data.connection.id)!;
 expect(profile).toMatchObject({baseUrl:'https://correct.example.test',auth:{type:'header',header:'X-API-Key'},operations:[expect.objectContaining({path:'/me'})]});
 expect(JSON.stringify(card)).not.toContain(secret);expect(readFileSync(path.join(home,'Cowork','cowork.json'),'utf8')).not.toContain(secret);
 const verify=vi.spyOn(service.connections,'validate').mockResolvedValue({ok:true,status:200,operation:profile.operations[0]!});
 expect((await post(route,{action:'provide',connectionId:profile.id,setup:oldSetup})).status).toBe(409);expect(verify).not.toHaveBeenCalled();
 let finish!:()=>void;let entered!:()=>void;const began=new Promise<void>(resolve=>{entered=resolve;});
 verify.mockImplementation(async()=>{entered();await new Promise<void>(resolve=>{finish=resolve;});return {ok:true,status:200,operation:profile.operations[0]!};});
 const response=post(route,{action:'provide',connectionId:profile.id,setup});await began;
 store.updateCredentialRequest(card.id,agent.id,chat.id,{title:'Corrected test',detail:'Updated',credential:{...card.credential!,validationPath:'/account'}});finish();
 expect((await response).status).toBe(409);expect(wake).not.toHaveBeenCalled();expect(card.status).toBe('open');
 store.removeRequestCard(card.id);expect((await post(route+'/credential-save',{token:secret,setup:JSON.stringify(card.credential)})).status).toBe(404);
});

it('shows only one API-key input with a readable destination, including custom authentication',()=>{
 const context=createContext({esc:(value:unknown)=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),connectionInputHtml:(name:string)=>'<input name="'+name+'" type="password">'});
 new Script(COWORK_JS.slice(COWORK_JS.indexOf('  function cwCredentialFormHtml('),COWORK_JS.indexOf('  function cwBindCredentialForms('))).runInContext(context);
 const html=context.cwCredentialFormHtml({id:'card',credential:{providerHint:'custom',label:'Production API',baseUrl:'https://api.example.test',validationPath:'/me',auth:{type:'header',header:'X-API-Key'}}}) as string;
 expect(html.match(/<input /g)).toHaveLength(1);expect(html).toContain('name="token"');expect(html).toContain('Production API');expect(html).toContain('https://api.example.test');
 expect(html).not.toContain('<select');expect(html).not.toContain('name="baseUrl"');expect(html).not.toContain('name="authHeader"');expect(html).toContain('data-cwcredential-setup=');
});
