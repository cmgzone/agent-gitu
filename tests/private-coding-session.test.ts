import { expect,it } from 'vitest';
import { createPrivateCodingProgressBridge, privateCodingSession } from '../src/coding/private-coding-session.js';

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

it('streams live worker thinking, tool actions, output, and prose before completion', async () => {
  const seen: Array<{ type: string; source?: string; path?: string; command?: string }> = [];
  let finish!: () => void;
  const runtime = privateCodingSession('Add health route', { type: 'container', containerId: 'owner', path: '/workspace' }, async (_signal, _instruction, emit) => {
    const progress = createPrivateCodingProgressBridge(emit);
    progress({ phase: 'thinking', detail: 'Planning the next step (round 1)…' });
    progress({ phase: 'responding', text: 'Checking routes' });
    progress({ phase: 'responding', text: 'Checking routes and server setup.' });
    progress({ phase: 'tool', tool: 'read_file', toolParams: { path: 'src/routes.ts' } });
    progress({ phase: 'working', tool: 'read_file', toolParams: { path: 'src/routes.ts' }, toolOk: true, toolOutput: 'export const routes = [];' });
    progress({ phase: 'tool', tool: 'write_file', toolParams: { path: 'src/routes.ts' } });
    progress({ phase: 'working', tool: 'write_file', toolParams: { path: 'src/routes.ts' }, toolOk: true, toolOutput: 'Saved.' });
    progress({ phase: 'tool', tool: 'run_command', toolParams: { command: 'npm test' } });
    progress({ phase: 'working', tool: 'run_command', toolParams: { command: 'npm test' }, toolOk: true, toolOutput: '12 passed' });
    progress({ phase: 'responding', text: 'Added the health route and verified tests.', messageDone: true });
    await new Promise<void>(resolve => { finish = resolve; });
    return { ok: true, output: 'Added the health route and verified tests.' };
  });
  const unsub = runtime.subscribe(ev => {
    seen.push({ type: ev.type, source: ev.source, path: 'path' in ev ? ev.path : undefined, command: 'command' in ev ? ev.command : undefined });
  });
  const runPromise = runtime.run();
  await new Promise(resolve => setTimeout(resolve, 10));

  // Before the worker finishes, live events already reached subscribers.
  expect(seen.some(e => e.source === 'think  Planning the next step (round 1)…')).toBe(true);
  expect(seen.some(e => e.source === 'tdelta Checking routes')).toBe(true);
  expect(seen.some(e => e.source === 'tdelta  and server setup.')).toBe(true);
  expect(seen.some(e => e.source === 'run      read src/routes.ts')).toBe(true);
  expect(seen.some(e => e.type === 'file_changed' && e.path === 'src/routes.ts')).toBe(true);
  expect(seen.some(e => e.source === 'run      $ npm test')).toBe(true);
  expect(seen.some(e => e.source === 'out      12 passed')).toBe(true);
  expect(seen.some(e => e.type === 'command_finished' && e.command === 'npm test')).toBe(true);
  expect(seen.some(e => e.source === 'say Added the health route and verified tests.')).toBe(true);

  finish();
  expect((await runPromise).status).toBe('completed');
  unsub();
});
