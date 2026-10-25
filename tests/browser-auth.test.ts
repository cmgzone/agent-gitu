import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { sanitizeBrowserAuth } from '../src/cowork/browser-auth.js';
const {createBrowserAuth}=createRequire(import.meta.url)('../assets/cowork-computer/browser-auth.cjs');
it('accepts only HTTPS destination metadata and removes values, query secrets and unknown fields',()=>{
 const value={challengeId:'a'.repeat(32),computer:'gitu-cowork-'+'b'.repeat(24),origin:'https://login.example.test',url:'https://login.example.test/login?token=private',mode:'signin',expiresAt:Date.now()+60000,fields:[{id:'f0',label:'Password',type:'password',required:true,value:'never-store'}],terms:[]};
 const card=sanitizeBrowserAuth(value)!;expect(card.url).toBe('https://login.example.test/login');expect(JSON.stringify(card)).not.toContain('never-store');
 expect(sanitizeBrowserAuth({...value,origin:'https://attacker.example'})).toBeUndefined();expect(sanitizeBrowserAuth({...value,url:'http://login.example.test'})).toBeUndefined();
});
const real=process.env.GITU_REAL_BROWSER_TEST==='1'?describe:describe.skip;
real('secure cards in an actual isolated Chrome browser',()=>{
 let browser:Browser,page:Page,auth:any;
 beforeAll(async()=>{browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});},30000);
 afterAll(async()=>{await browser?.close();});
 async function fixture(signup=false){
  page=await browser.newPage();await page.route('https://login.example.test/**',route=>route.fulfill({contentType:'text/html',body:'<form><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label>'+(signup?'<label><input name="terms" type="checkbox" required>I agree to the <a href="/terms">Terms</a></label>':'')+'<button type="submit">'+(signup?'Create account':'Sign in')+'</button></form><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();window.received=Object.fromEntries(new FormData(e.target));document.body.innerHTML="Signed in";}</script>'}));
  await page.goto('https://login.example.test/login');auth=createBrowserAuth(async()=>page);return JSON.parse((await auth.execute('prepare',{mode:signup?'signup':'signin'},false)).output);
 }
 it('fills and submits once without returning credentials, persisting field values or requiring desktop control',async()=>{
  const card=await fixture();expect(JSON.stringify(card)).not.toContain('value');expect(card.fields.map((f:any)=>f.label)).toEqual(['Email','Password']);
  const result=await auth.execute('submit',{challengeId:card.challengeId,values:{f0:'owner@example.test',f1:'fake-private-password'},terms:[]},true);
  expect(result.ok).toBe(true);expect(JSON.stringify(result)).not.toContain('fake-private-password');
  expect(await page.evaluate(()=>(window as any).received)).toMatchObject({email:'owner@example.test',password:'fake-private-password'});
  expect(auth.redact('Echo fake-private-password')).toBe('Echo [redacted]');
  expect((await auth.execute('replay',{challengeId:card.challengeId,values:{f0:'owner@example.test',f1:'fake-private-password'},terms:[]},true)).ok).toBe(false);await page.close();
 });
 it('rejects navigation or a changed destination before filling or submitting',async()=>{
  const card=await fixture();await page.evaluate(()=>{document.querySelector('form')!.action='https://attacker.example/collect';});
  expect((await auth.execute('submit',{challengeId:card.challengeId,values:{f0:'owner@example.test',f1:'fake-password'},terms:[]},true)).ok).toBe(false);
  expect(await page.locator('input[type=password]').inputValue()).toBe('');await page.goto('https://login.example.test/other');
  expect((await auth.execute('submit',{challengeId:card.challengeId,values:{f0:'owner@example.test',f1:'fake-password'},terms:[]},true)).ok).toBe(false);await page.close();
 });
 it('requires the user to choose signup terms and performs only one final submit',async()=>{
  const card=await fixture(true),payload={challengeId:card.challengeId,values:{f0:'owner@example.test',f1:'fake-password'},terms:[] as string[]};
  expect(card.terms[0]).toMatchObject({required:true,label:'I agree to the Terms',url:'https://login.example.test/terms'});
  expect((await auth.execute('submit',payload,true)).ok).toBe(false);expect(await page.locator('input[type=password]').inputValue()).toBe('');
  expect((await auth.execute('submit',{...payload,terms:['t0']},true)).ok).toBe(true);expect(await page.evaluate(()=>(window as any).received.terms)).toBe('on');await page.close();
 });
});
