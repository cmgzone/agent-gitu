import { expect,it } from 'vitest';
import { privateCodingSession } from '../src/coding/private-coding-session.js';

it('queues direct instructions on the assigned computer and can continue a settled task',async()=>{
  const calls:string[]=[];let finish!:()=>void;
  const runtime=privateCodingSession('Fix parser',{type:'container',containerId:'owner',path:'/workspace'},async(signal,instruction)=>{
    expect(signal.aborted).toBe(false);calls.push(instruction!);
    if(calls.length===1)await new Promise<void>(resolve=>{finish=resolve;});
    return{ok:true,output:'Verified parser behavior.'};
  });
  const work=runtime.run();
  expect((await runtime.continue('Also test unicode input')).status).toBe('running');
  finish();expect((await work).status).toBe('completed');
  expect(calls).toHaveLength(2);expect(calls[1]).toContain('Also test unicode input');
  expect((await runtime.continue('Add empty input handling')).status).toBe('completed');
  expect(calls[2]).toContain('Add empty input handling');
  expect(runtime.getState().workspace).toEqual({type:'container',containerId:'owner',path:'/workspace'});
});

it('stops queued instructions and does not claim success after cancellation',async()=>{
  let release!:()=>void,calls=0;
  const runtime=privateCodingSession('Fix parser',{type:'container',containerId:'owner',path:'/workspace'},async()=>{
    calls++;await new Promise<void>(resolve=>{release=resolve;});return{ok:true,output:'Late result'};
  });
  const work=runtime.run();await runtime.continue('Queued update');await runtime.cancel('Stopped by user');release();
  expect((await work).status).toBe('blocked');expect(calls).toBe(1);expect(runtime.getState().report).toBeUndefined();
});
