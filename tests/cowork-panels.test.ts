import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture(width=1440) {
  const classes=new Set<string>(),saved=new Map<string,string>();
  const classList={contains:(name:string)=>classes.has(name),toggle:(name:string,on:boolean)=>on?classes.add(name):classes.delete(name),add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name)};
  const attributes:Record<string,string>={};
  function element(){return {hidden:false,focus:vi.fn(),setAttribute:(key:string,value:string)=>{attributes[key]=value;},getAttribute:(key:string)=>attributes[key],classList:{add:vi.fn(),remove:vi.fn()},setPointerCapture:vi.fn()};}
  const rail={inert:false};
  const elements:any={cw:{clientWidth:width,classList,style:{setProperty:vi.fn()},querySelector:()=>rail},cwInfoPanel:{style:{}},cwChat:{inert:false},cwPanelBackdrop:{hidden:true},cwBack:element(),cwInfoBtn:element(),cwCollapseRail:element()};
  // Handles need separate attribute stores, as they do in the real DOM.
  for(const id of ['cwRailResize','cwInfoResize']){const attrs:Record<string,string>={};elements[id]={...element(),getAttribute:(key:string)=>attrs[key],setAttribute:(key:string,value:string)=>{attrs[key]=value;}};}
  const cw:any={convs:[{id:'dm',kind:'dm',memberIds:['atlas']}],active:'dm',infoOpen:true};
  const context=createContext({S:{cw},window:{innerWidth:width,addEventListener:vi.fn()},document:{body:{classList:{add:vi.fn(),remove:vi.fn()}},addEventListener:vi.fn()},$: (id:string)=>elements[id],localStorage:{getItem:(key:string)=>saved.get(key),setItem:(key:string,value:string)=>saved.set(key,value)}});
  new Script(COWORK_JS).runInContext(context);
  return {context,cw,elements,rail,saved,classes};
}

describe('Cowork collapsible and adjustable sidebars',()=>{
  it('hides the redundant desktop chat button and provides a way to reopen a collapsed rail',()=>{
    const u=fixture();u.context.cwBindPanelControls();u.context.cwSyncPanels();
    expect(u.elements.cwBack.hidden).toBe(true);expect(u.elements.cwInfoBtn.hidden).toBe(true);
    u.elements.cwCollapseRail.onclick();
    expect(u.classes.has('rail-collapsed')).toBe(true);expect(u.elements.cwBack.hidden).toBe(false);expect(u.rail.inert).toBe(true);expect(u.elements.cwRailResize.hidden).toBe(true);
    expect(u.elements.cwBack.focus).toHaveBeenCalledOnce();
    expect(JSON.parse(u.saved.get('hermes.cowork.panels')!).railCollapsed).toBe(true);
  });
  it('resizes both sides with keyboard and pointer controls, preserving space for chat',()=>{
    const u=fixture();u.context.cwBindPanelControls();u.context.cwSyncPanels();
    const left=u.elements.cwRailResize,right=u.elements.cwInfoResize;
    left.onkeydown({key:'ArrowRight',preventDefault:vi.fn()});expect(u.cw.railWidth).toBe(274);
    right.onkeydown({key:'ArrowLeft',preventDefault:vi.fn()});expect(u.cw.infoWidth).toBe(330);
    left.onpointerdown({button:0,clientX:274,pointerId:1,preventDefault:vi.fn()});left.onpointermove({clientX:350});left.onpointerup();expect(u.cw.railWidth).toBe(350);
    right.onpointerdown({button:0,clientX:1100,pointerId:2,preventDefault:vi.fn()});right.onpointermove({clientX:1070});right.onpointercancel();expect(u.cw.infoWidth).toBe(360);
    expect(left.setPointerCapture).toHaveBeenCalledWith(1);expect(u.context.document.body.classList.remove).toHaveBeenCalledWith('cw-resizing');
    expect(JSON.parse(u.saved.get('hermes.cowork.panels')!).infoWidth).toBe(360);
    u.elements.cw.clientWidth=856;u.context.cwApplyPanelWidths();
    expect(Number(left.getAttribute('aria-valuenow'))+Number(right.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(548);
  });
  it('restores valid preferences and clamps corrupt or oversized widths',()=>{
    const u=fixture();u.saved.set('hermes.cowork.panels',JSON.stringify({railWidth:9999,infoWidth:'bad',railCollapsed:true,infoOpen:false}));
    u.context.cwBindPanelControls();expect(u.cw.railWidth).toBe(400);expect(u.cw.infoWidth).toBe(320);expect(u.cw.infoOpen).toBe(false);expect(u.cw.railCollapsed).toBe(true);
    u.saved.set('hermes.cowork.panels','not json');expect(u.context.cwPanelPreferences().railWidth).toBe(264);
  });
  it('preserves the mobile drawer and keeps desktop collapse separate from mobile visibility',()=>{
    const u=fixture(477);u.cw.railCollapsed=true;u.context.cwBindPanelControls();u.cw.railCollapsed=true;u.context.cwSyncPanels();
    expect(u.elements.cwBack.hidden).toBe(false);expect(u.classes.has('rail-collapsed')).toBe(false);expect(u.rail.inert).toBe(true);
    u.classes.add('rail-open');u.context.cwSyncPanels();expect(u.rail.inert).toBe(false);expect(u.elements.cwChat.inert).toBe(true);expect(u.elements.cwPanelBackdrop.hidden).toBe(false);
  });
});
