import {afterEach,beforeEach,expect,it,vi} from 'vitest';

const runtime=vi.hoisted(()=>({requests:[] as {method:string;params:Record<string,unknown>}[],children:[] as any[],omitCode:false}));
vi.mock('node:child_process',async importOriginal=>{
 const original=await importOriginal<typeof import('node:child_process')>();
 const {EventEmitter}=await import('node:events');
 const {PassThrough,Writable}=await import('node:stream');
 return {...original,spawn:vi.fn(()=>{
  const child:any=new EventEmitter(); child.stdout=new PassThrough();child.stderr=new PassThrough();
  child.kill=vi.fn(()=>{child.emit('exit',0);return true;});
  child.stdin=new Writable({write(chunk,_encoding,done){
   const message=JSON.parse(String(chunk));runtime.requests.push(message);
   let result:Record<string,unknown>={};
   if(message.method==='account/read')result={account:null};
   if(message.method==='model/list')result={data:[]};
   if(message.method==='account/login/start')result=message.params.type==='chatgptDeviceCode'
    ? {type:'chatgptDeviceCode',loginId:'login-fixture',verificationUrl:'https://auth.openai.com/codex/device',...(!runtime.omitCode?{userCode:'TEST-1234'}:{})}
    : {type:'chatgpt',loginId:'login-fixture',authUrl:'https://auth.openai.com/authorize?redirect_uri=http://localhost:1455/auth/callback'};
   if(typeof message.id==='number')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:message.id,result})+'\n'));
   done();
  }});
  runtime.children.push(child);return child;
 })};
});

beforeEach(()=>{vi.resetModules();runtime.requests=[];runtime.children=[];runtime.omitCode=false;vi.stubEnv('GITU_CODEX_PATH',process.execPath);vi.stubEnv('AGENT_GITU_PUBLIC_ORIGIN','');});
afterEach(()=>{
 for(const child of runtime.children)child.stdout.write(JSON.stringify({method:'account/login/completed',params:{loginId:'login-fixture',success:false}})+'\n');
 vi.useRealTimers();vi.unstubAllEnvs();
});
const complete=(success:boolean)=>runtime.children.at(-1).stdout.write(JSON.stringify({method:'account/login/completed',params:{loginId:'login-fixture',success}})+'\n');

it('uses device authorization on a hosted app and reuses its pending link and code',async()=>{
 vi.stubEnv('AGENT_GITU_PUBLIC_ORIGIN','https://gitu.example.test');
 const codex=await import('../src/llm/codex-subscription.js');
 const started=await codex.startCodexSubscriptionLogin();
 expect(started).toMatchObject({authUrl:'https://auth.openai.com/codex/device',userCode:'TEST-1234',loginId:'login-fixture'});
 expect(codex.codexSubscriptionLoginPending()).toBe(true);
 expect(await codex.startCodexSubscriptionLogin()).toEqual(started);
 expect(runtime.requests.filter(r=>r.method==='account/login/start').map(r=>r.params)).toEqual([{type:'chatgptDeviceCode'}]);
 const done=codex.waitForCodexSubscriptionLogin(started.loginId!);complete(true);
 expect(await done).toBe(true);expect(codex.codexSubscriptionLoginPending()).toBe(false);
});

it('retains the local browser callback flow for desktop sign-in',async()=>{
 const codex=await import('../src/llm/codex-subscription.js');
 const started=await codex.startCodexSubscriptionLogin();
 expect(started.authUrl).toContain('localhost');expect(started.userCode).toBeUndefined();
 expect(runtime.requests.find(r=>r.method==='account/login/start')?.params).toMatchObject({type:'chatgpt',useHostedLoginSuccessPage:true});
 const done=codex.waitForCodexSubscriptionLogin(started.loginId!);complete(false);
 expect(await done).toBe(false);expect(codex.codexSubscriptionLoginPending()).toBe(false);
});

it('shares one device authorization attempt between concurrent callers',async()=>{
 vi.stubEnv('AGENT_GITU_PUBLIC_ORIGIN','https://gitu.example.test');
 const codex=await import('../src/llm/codex-subscription.js');
 const starts=await Promise.all([codex.startCodexSubscriptionLogin(),codex.startCodexSubscriptionLogin()]);
 expect(starts[0]).toEqual(starts[1]);
 expect(runtime.requests.filter(r=>r.method==='account/login/start')).toHaveLength(1);
});

it('rejects an incomplete device response rather than offering an unusable sign-in',async()=>{
 vi.stubEnv('AGENT_GITU_PUBLIC_ORIGIN','https://gitu.example.test');runtime.omitCode=true;
 const codex=await import('../src/llm/codex-subscription.js');
 await expect(codex.startCodexSubscriptionLogin()).rejects.toThrow('complete ChatGPT sign-in instructions');
 expect(codex.codexSubscriptionLoginPending()).toBe(false);
});

it('releases an expired pending login and allows a fresh attempt',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const codex=await import('../src/llm/codex-subscription.js');
 const started=await codex.startCodexSubscriptionLogin();
 const done=codex.waitForCodexSubscriptionLogin(started.loginId!);
 await vi.advanceTimersByTimeAsync(5*60000);
 expect(await done).toBe(false);expect(codex.codexSubscriptionLoginPending()).toBe(false);
 expect((await codex.startCodexSubscriptionLogin()).loginId).toBeDefined();
 expect(runtime.requests.filter(r=>r.method==='account/login/start')).toHaveLength(2);
});
