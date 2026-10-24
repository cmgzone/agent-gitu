import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';

it('configures Google without a restart and protects hosted initiation, settings and completion', async()=>{
  const names=['AGENT_GITU_HOME','AGENT_GITU_PUBLIC_ORIGIN','AGENT_GITU_TRUST_LOCAL_PROXY'];
  const previous=Object.fromEntries(names.map(key=>[key,process.env[key]]));
  const home=mkdtempSync(path.join(tmpdir(),'gitu-google-http-'));
  process.env.AGENT_GITU_HOME=home;process.env.AGENT_GITU_TRUST_LOCAL_PROXY='1';delete process.env.AGENT_GITU_PUBLIC_ORIGIN;
  const server=new GituServer({cwd:home,port:0,autoInstallLsp:false});
  try{
    const base='http://127.0.0.1:'+await server.start();
    const call=async(route:string,body?:object,cookie?:string,origin?:string)=>fetch(base+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(origin?{origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
    expect((await call('/api/auth/google/settings')).status).toBe(401);
    const profile={name:'Owner',email:'owner@gmail.com',password:'Disposable hosted Google fixture passphrase'};
    expect((await call('/api/auth/register',profile)).status).toBe(201);
    const login=await call('/api/auth/login',profile),session=login.headers.get('set-cookie')!.split(';')[0]!;
    const credentials={clientId:'fixture.apps.googleusercontent.com',clientSecret:'fixture-client-secret-never-return',origin:'https://gitu.example.test'};
    expect((await call('/api/auth/google/settings',credentials,session,'https://attacker.example')).status).toBe(403);
    const configured=await call('/api/auth/google/settings',credentials,session);expect(configured.status).toBe(200);
    const settings=await configured.json();expect(settings).toMatchObject({enabled:true,hasSecret:true,callback:credentials.origin+'/auth/google/callback'});expect(JSON.stringify(settings)).not.toContain(credentials.clientSecret);
    expect(await(await call('/auth')).text()).toContain('Sign in with Google');
    const hosted=(route:string,body?:object,cookie?:string,secure=true)=>new Promise<{status:number;body:string;cookies:string[]}>((resolve,reject)=>{const req=request(base+route,{method:body?'POST':'GET',headers:{host:'gitu.example.test',origin:(secure?'https:':'http:')+'//gitu.example.test',...(secure?{'x-forwarded-proto':'https'}:{}),...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})}},res=>{let data='';res.on('data',chunk=>{data+=chunk;});res.on('end',()=>resolve({status:res.statusCode!,body:data,cookies:res.headers['set-cookie']??[]}));});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
    expect((await hosted('/api/auth/google/start',{},undefined,false)).status).toBe(400);
    const started=await hosted('/api/auth/google/start',{});expect(started.status).toBe(200);expect(started.cookies[0]).toContain('; Secure');expect(started.cookies[0]).toContain('HttpOnly; SameSite=Strict');
    const start=JSON.parse(started.body);expect(new URL(start.authorizationUrl).searchParams.get('redirect_uri')).toBe(settings.callback);
    expect((await hosted('/api/auth/google/complete',{attemptId:start.attemptId})).status).toBe(400);
    const pending=await hosted('/api/auth/google/complete',{attemptId:start.attemptId},started.cookies[0]!.split(';')[0]);expect(pending.status).toBe(200);expect(JSON.parse(pending.body)).toEqual({pending:true});
    const callback=await call('/auth/google/callback?state=forged&code=forged');expect(callback.status).toBe(400);expect(callback.headers.get('referrer-policy')).toBe('no-referrer');expect(callback.headers.get('set-cookie')).toBeNull();
    expect((await call('/api/server-browser/workspace/view')).status).toBe(401);
    expect((await call('/api/auth/google/settings',undefined,session)).status).toBe(200);
  }finally{await server.stop();for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
},60000);
