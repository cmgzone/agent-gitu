import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_TOUCH_JS } from '../src/server/desktop-touch.js';

function fixture({ preview = false, coarse = true, endpoint = '/api/cowork/agents/test/computer' } = {}) {
  const element = () => ({ hidden: true, value: '', disabled: true, textContent: '', attrs: {} as Record<string,string>, dataset: {} as Record<string,string>,
    onclick: undefined as (() => void) | undefined, onkeydown: undefined as ((event: { key: string; isComposing?: boolean; preventDefault(): void }) => void) | undefined,
    setAttribute(name: string, value: string) { this.attrs[name] = value; }, focus: vi.fn(), blur: vi.fn(), addEventListener: vi.fn(),
    querySelectorAll: (_selector: string): ReturnType<typeof element>[] => [] });
  const nodes = Object.fromEntries(['bar','keyboard','text','feedback','zoom','pan','toggle','send','help','guide'].map(id => ['touch-'+id,element()]));
  const keys = [element(),element()];keys[0]!.dataset.touchKey='Tab';keys[1]!.dataset.touchKey='Return';
  nodes['touch-keyboard']!.querySelectorAll = selector => selector === 'button' ? [...keys,nodes['touch-send']!] : keys;
  const events: Record<string, () => void> = {}, fetch = vi.fn(async (_url: string, _options: { body: string; signal: AbortSignal }) => ({ok:true}));
  const rfb = { scaleViewport: true, clipViewport: false, dragViewport: false };
  const document = { hidden: false, getElementById: (id: string) => nodes[id], addEventListener: (name: string, callback: () => void) => {events[name]=callback;} };
  const context = { preview, matchMedia: () => ({ matches: coarse }), rfb, document, AbortController, fetch, humanInputEndpoint: endpoint, closed: false, controls: undefined as unknown };
  runInNewContext(DESKTOP_TOUCH_JS+'\nglobalThis.controls=touchControls;',context);
  const controls = context.controls as {connected():void;disconnected():void;privateEnd():void;close():void;viewport(scale:boolean,pan:boolean):void;typing:boolean} | undefined;
  return {nodes,keys,events,fetch,rfb,document,controls};
}

describe('desktop phone touch controls',()=>{
  it('does not add interactive controls or make requests in a read-only preview or mouse-only desktop',()=>{
    for(const options of [{preview:true},{coarse:false}]){
      const f=fixture(options);expect(f.controls).toBeUndefined();expect(f.nodes['touch-bar']!.hidden).toBe(true);expect(f.fetch).not.toHaveBeenCalled();
    }
  });
  it('zooms into pan mode and retains the viewport without sending desktop input',()=>{
    const f=fixture();f.controls!.connected();f.nodes['touch-zoom']!.onclick!();
    expect(f.rfb).toEqual({scaleViewport:false,clipViewport:true,dragViewport:true});
    f.nodes['touch-pan']!.onclick!();expect(f.rfb.dragViewport).toBe(false);
    f.controls!.disconnected();f.controls!.connected();expect(f.rfb.scaleViewport).toBe(false);
    f.nodes['touch-zoom']!.onclick!();expect(f.rfb).toEqual({scaleViewport:true,clipViewport:false,dragViewport:false});
    expect(f.fetch).not.toHaveBeenCalled();f.controls!.close();
  });
  it.each(['/api/cowork/agents/test/computer','/api/companies/company/cowork/agents/test/computer','/api/chrome-profile'])('takes private control before sending phone IME text through %s',async endpoint=>{
    const f=fixture({endpoint});f.controls!.connected();expect(f.fetch).not.toHaveBeenCalled();
    f.nodes['touch-toggle']!.onclick!();await vi.waitFor(()=>expect(f.nodes['touch-send']!.disabled).toBe(false));
    expect(JSON.parse(f.fetch.mock.calls[0]![1].body)).toEqual({action:'take-control'});
    const text=f.nodes['touch-text']!;text.value='Phone IME 日本語';
    const preventDefault=vi.fn();text.onkeydown!({key:'Enter',isComposing:true,preventDefault});expect(f.fetch).toHaveBeenCalledOnce();expect(preventDefault).not.toHaveBeenCalled();
    f.nodes['touch-send']!.onclick!();expect(text.value).toBe('');
    await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledTimes(2));
    expect(f.fetch.mock.calls[1]![0]).toBe(endpoint);
    expect(JSON.parse(f.fetch.mock.calls[1]![1].body)).toEqual({action:'input',input:{action:'type',text:'Phone IME 日本語'}});
    await vi.waitFor(()=>expect(f.nodes['touch-send']!.disabled).toBe(false));
    f.keys[0]!.onclick!();await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledTimes(3));expect(JSON.parse(f.fetch.mock.calls[2]![1].body).input).toEqual({action:'key',key:'Tab'});
    f.controls!.close();
  });
  it('clears a draft and disables sending when private control is rejected',async()=>{
    const f=fixture();f.controls!.connected();f.fetch.mockResolvedValueOnce({ok:false});
    f.nodes['touch-text']!.value='unsent fixture';f.nodes['touch-toggle']!.onclick!();
    await vi.waitFor(()=>expect(f.nodes['touch-feedback']!.textContent).toContain('Could not take control'));
    expect(f.nodes['touch-text']!.value).toBe('');expect(f.nodes['touch-send']!.disabled).toBe(true);
    f.nodes['touch-send']!.onclick!();expect(f.fetch).toHaveBeenCalledOnce();f.controls!.close();
  });
  it('aborts pending typing and ignores its late completion after private control ends',async()=>{
    const f=fixture();f.controls!.connected();f.nodes['touch-toggle']!.onclick!();await vi.waitFor(()=>expect(f.nodes['touch-send']!.disabled).toBe(false));
    let finish!:(result:{ok:boolean})=>void;f.fetch.mockImplementationOnce(async()=>new Promise(resolve=>{finish=resolve;}));
    f.nodes['touch-text']!.value='private fixture';f.nodes['touch-send']!.onclick!();await vi.waitFor(()=>expect(f.fetch).toHaveBeenCalledTimes(2));
    const signal=f.fetch.mock.calls[1]![1].signal;f.controls!.privateEnd();expect(signal.aborted).toBe(true);
    finish({ok:true});await new Promise(resolve=>setTimeout(resolve,0));expect(f.nodes['touch-keyboard']!.hidden).toBe(true);expect(f.nodes['touch-text']!.value).toBe('');expect(f.nodes['touch-feedback']!.textContent).not.toContain('Sent');f.controls!.close();
  });
  it('clears private drafts when the phone backgrounds or the connection drops',async()=>{
    const f=fixture();f.controls!.connected();f.nodes['touch-toggle']!.onclick!();await vi.waitFor(()=>expect(f.nodes['touch-send']!.disabled).toBe(false));
    f.nodes['touch-text']!.value='unsent fixture';f.document.hidden=true;f.events.visibilitychange!();expect(f.nodes['touch-text']!.value).toBe('');expect(f.controls!.typing).toBe(false);
    f.controls!.disconnected();expect(f.nodes['touch-toggle']!.disabled).toBe(true);expect(f.nodes['touch-send']!.disabled).toBe(true);f.controls!.close();
  });
});
