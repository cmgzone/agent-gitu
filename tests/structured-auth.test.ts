import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectionRegistry, normalizeConnectionAuth } from '../src/connections/connections.js';
import { encodeStructuredCredentials, normalizeStructuredAuth } from '../src/connections/structured-auth.js';
const homes: string[] = [], oldHome = process.env.AGENT_GITU_HOME;
afterEach(() => { vi.restoreAllMocks(); if(oldHome===undefined)delete process.env.AGENT_GITU_HOME;else process.env.AGENT_GITU_HOME=oldHome;for(const root of homes.splice(0))rmSync(root,{recursive:true,force:true}); });
const fields = [{ id:'email', label:'Email', secret:false, inputType:'email' as const, required:true }, { id:'client_secret', label:'Client secret', secret:true, required:true }];
function fixture(auth: ReturnType<typeof normalizeStructuredAuth>, values: Record<string,string>) {
  const root=mkdtempSync(path.join(tmpdir(),'gitu-multi-auth-'));homes.push(root);process.env.AGENT_GITU_HOME=root;
  const registry=new ConnectionRegistry(), encoded=encodeStructuredCredentials(auth,values);
  registry.save({id:'service',provider:'custom',label:'Service',baseUrl:'https://api.example.test',auth,token:encoded,capabilities:['account.read'],operations:[{id:'me',label:'Read account',method:'GET',path:'/me',risk:'read',capability:'account.read'}]});
  return {root,registry};
}
it('encrypts named credentials, applies Basic auth and redacts values and encoded headers from replies',async()=>{
 const auth=normalizeStructuredAuth({type:'basic',fields,usernameField:'email',passwordField:'client_secret'});
 const values={email:'owner@example.test',client_secret:'fixture-secret-keep-private'},f=fixture(auth,values);
 const encoded=Buffer.from(values.email+':'+values.client_secret).toString('base64');
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{expect(new Headers(init?.headers).get('authorization')).toBe('Basic '+encoded);return new Response(JSON.stringify({echo:values,header:encoded}));});
 const result=await f.registry.invoke('service','me');
 for(const secret of [...Object.values(values),encoded]){expect(JSON.stringify(result)).not.toContain(secret);expect(readFileSync(path.join(f.root,'Settings','keys.json'),'utf8')).not.toContain(secret);}
 expect(JSON.stringify(f.registry.list())).not.toContain(values.client_secret);
});
it('supports several documented authentication headers',async()=>{
 const auth=normalizeStructuredAuth({type:'headers',fields:[{id:'client_id',label:'Client ID',secret:false,header:'X-Client-ID'},{id:'client_secret',label:'Client secret',header:'X-Client-Secret'},{id:'email',label:'Account email',header:'X-Account-Email',inputType:'email',secret:false}]});
 const f=fixture(auth,{client_id:'client-fixture',client_secret:'secret-fixture',email:'owner@example.test'});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const h=new Headers(init?.headers);expect(h.get('x-client-id')).toBe('client-fixture');expect(h.get('x-client-secret')).toBe('secret-fixture');expect(h.get('x-account-email')).toBe('owner@example.test');expect(h.has('authorization')).toBe(false);return new Response('{}');});
 expect((await f.registry.invoke('service','me')).status).toBe(200);
});
it('exchanges client ID, client secret and email at the same-origin OAuth endpoint and hides the access token',async()=>{
 const auth=normalizeStructuredAuth({type:'oauth2',tokenPath:'/oauth/token',scope:'account.read',fields:[{id:'client_id',label:'Client ID',secret:false},...fields]});
 const values={client_id:'client-fixture',email:'owner@example.test',client_secret:'private-client-fixture'},f=fixture(auth,values);
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url)==='https://api.example.test/oauth/token'){const b=new URLSearchParams(String(init?.body));expect(b.get('client_id')).toBe(values.client_id);expect(b.get('client_secret')).toBe(values.client_secret);expect(b.get('email')).toBe(values.email);expect(b.get('grant_type')).toBe('client_credentials');expect(init?.redirect).toBe('error');return new Response(JSON.stringify({access_token:'private-access-fixture',token_type:'Bearer'}));}
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-access-fixture');return new Response('{"echo":"private-access-fixture"}');
 });
 const result=await f.registry.invoke('service','me');expect(network).toHaveBeenCalledTimes(2);expect(JSON.stringify(result)).not.toContain('private-access-fixture');
});
it('rejects off-origin token URLs, forbidden headers, missing fields and credential values in metadata',()=>{
 expect(()=>normalizeStructuredAuth({type:'oauth2',tokenPath:'https://evil.example/token',fields:[{id:'client_id',label:'Client'},{id:'client_secret',label:'Secret'}]})).toThrow();
 expect(()=>normalizeStructuredAuth({type:'headers',fields:[{id:'key',label:'Key',header:'Host'}]})).toThrow();
 const auth=normalizeStructuredAuth({type:'basic',fields,usernameField:'email',passwordField:'client_secret'});
 expect(()=>encodeStructuredCredentials(auth,{email:'owner@example.test'})).toThrow();
 expect(JSON.stringify(normalizeConnectionAuth({...auth,fields:auth.fields.map(f=>({...f,value:'do-not-persist'}))}))).not.toContain('do-not-persist');
});
