import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CompanyCoordinator } from '../src/company/coordinator.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();vi.useRealTimers();vi.unstubAllEnvs();});
function stores(){
  const root=mkdtempSync(path.join(os.tmpdir(),'company-rolling-'));
  const old=new CompanyStore(root),next=new CompanyStore(root);
  cleanup.push(()=>{next.close();old.close();rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const company=old.create({name:'Studio',purpose:'Useful work',monthlyBudgetUsd:null,maxFileBytes:null});
  old.update(company.id,{leadId:'lead',conversationId:'chat'});old.transition(company.id,'running');
  return{root,old,next,company};
}

it('starts in standby, leaves old work untouched, then admits it once after the old scheduler drains',async()=>{
  vi.useFakeTimers();const f=stores();let finish!:()=>void;
  const oldWork=vi.fn(async()=>new Promise<void>(resolve=>{finish=resolve;})),nextWork=vi.fn(async()=>{}),prepare=vi.fn(),error=vi.fn();
  const old=new CompanyCoordinator(f.old,oldWork),next=new CompanyCoordinator(f.next,nextWork,error,vi.fn(),prepare);
  cleanup.push(async()=>{old.stop();finish?.();await old.drain();next.stop();await next.drain();});
  old.start();const running=f.old.jobs(f.company.id).find(job=>job.state==='running')!;
  expect(running).toBeDefined();const recover=vi.spyOn(f.next,'recover');
  expect(()=>next.start()).not.toThrow();next.start();await vi.advanceTimersByTimeAsync(10000);
  expect(recover).not.toHaveBeenCalled();expect(prepare).not.toHaveBeenCalled();expect(nextWork).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();
  expect(f.next.jobs(f.company.id).find(job=>job.id===running.id)?.state).toBe('running');
  const queued=f.old.enqueue(f.company.id,'wake',{note:'Next task'},'after-update');
  old.stop();next.tick();expect(nextWork).not.toHaveBeenCalled();
  finish();await old.drain();await vi.advanceTimersByTimeAsync(5000);
  expect(recover).toHaveBeenCalledOnce();expect(prepare).toHaveBeenCalledWith(true);
  expect(nextWork).toHaveBeenCalledTimes(1);expect(nextWork.mock.calls[0]![0]?.id).toBe(queued.id);
  expect(f.next.jobs(f.company.id).find(job=>job.id===running.id)?.state).toBe('done');
});

it('recovers queued work after a crashed owner lease expires without stealing a live lease',async()=>{
  vi.useFakeTimers();const f=stores();f.old.acquireScheduler('crashed-container');
  const job=f.old.enqueue(f.company.id,'wake',{note:'Resume safely'},'resume');f.old.claim(job);
  const execute=vi.fn(async()=>{}),recover=vi.spyOn(f.next,'recover');
  const next=new CompanyCoordinator(f.next,execute);cleanup.push(async()=>{next.stop();await next.drain();});
  next.start();await vi.advanceTimersByTimeAsync(60000);expect(execute).not.toHaveBeenCalled();expect(recover).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);expect(recover).toHaveBeenCalledOnce();expect(execute.mock.calls.filter(call=>call[0]?.id===job.id)).toHaveLength(1);
});

it('serves Coolify health checks while another container owns the scheduler and acquires it after release',async()=>{
  const home=mkdtempSync(path.join(os.tmpdir(),'company-rolling-http-'));vi.stubEnv('AGENT_GITU_HOME',home);
  const owner=new CompanyStore(path.join(home,'Companies'));
  owner.create({name:'Existing company',purpose:'Preserve data',monthlyBudgetUsd:null,maxFileBytes:null});owner.acquireScheduler('old-container');
  const server=new GituServer({cwd:home,port:0,llm:new ScriptedMockLlm([]),mailInboxWatching:false});
  cleanup.push(async()=>{await server.stop();owner.close();rmSync(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  const base='http://127.0.0.1:'+await server.start();
  expect((await fetch(base+'/healthz')).status).toBe(200);expect((await fetch(base+'/api/cowork/agents')).status).toBe(401);
  const store=(server as unknown as {companies():CompanyStore;companyCoordinator:CompanyCoordinator}).companies();const recover=vi.spyOn(store,'recover');
  const coordinator=(server as unknown as {companyCoordinator:CompanyCoordinator}).companyCoordinator;
  coordinator.tick();expect(recover).not.toHaveBeenCalled();owner.releaseScheduler('old-container');coordinator.tick();expect(recover).toHaveBeenCalledOnce();
  expect((await fetch(base+'/healthz')).status).toBe(200);
});
