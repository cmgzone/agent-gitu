import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture(width=1440) {
  const classes=new Set<string>(),saved=new Map<string,string>();
  const classList={contains:(name:string)=>classes.has(name),toggle:(name:string,on:boolean)=>on?classes.add(name):classes.delete(name),add:(name:string)=>classes.add(name),remove:(name:string)=>classes.delete(name)};
  function element(){const attributes:Record<string,string>={};return {hidden:false,focus:vi.fn(),setAttribute:(key:string,value:string)=>{attributes[key]=value;},getAttribute:(key:string)=>attributes[key],classList:{add:vi.fn(),remove:vi.fn()},setPointerCapture:vi.fn()};}
  const rail={inert:false};
  const elements:any={cw:{clientWidth:width,classList,style:{setProperty:vi.fn()},querySelector:()=>rail},cwInfoPanel:{style:{}},cwChat:{inert:false},cwPanelBackdrop:{hidden:true},cwBack:element(),cwInfoBtn:element(),cwCollapseRail:element(),cwHomeBtn:element(),cwCurrentChat:element(),cwInput:{value:'Keep my draft',focus:vi.fn()}};
  // Handles need separate attribute stores, as they do in the real DOM.
  for(const id of ['cwRailResize','cwInfoResize']){const attrs:Record<string,string>={};elements[id]={...element(),getAttribute:(key:string)=>attrs[key],setAttribute:(key:string,value:string)=>{attrs[key]=value;}};}
  const cw:any={convs:[{id:'dm',kind:'dm',memberIds:['atlas']}],active:'dm',infoOpen:true};
  const context=createContext({S:{cw},window:{innerWidth:width,addEventListener:vi.fn()},document:{body:{classList:{add:vi.fn(),remove:vi.fn()}},addEventListener:vi.fn()},$: (id:string)=>elements[id],localStorage:{getItem:(key:string)=>saved.get(key),setItem:(key:string,value:string)=>saved.set(key,value)}});
  new Script(COWORK_JS).runInContext(context);
  return {context,cw,elements,rail,saved,classes};
}

describe('Cowork chat rail and full-page profile navigation',()=>{
  it('keeps search and the chat usable when the retired sidebar is absent, including saved collapsed preferences',()=>{
    const u=fixture();u.cw.railCollapsed=true;u.elements.cw.querySelector=()=>null;delete u.elements.cwCollapseRail;delete u.elements.cwRailResize;
    u.context.cwBindPanelControls();u.context.cwSyncPanels();
    expect(u.elements.cwBack.hidden).toBe(false);expect(u.classes.has('rail-collapsed')).toBe(false);
    expect(u.elements.cwChat.inert).toBe(false);expect(u.elements.cwPanelBackdrop.hidden).toBe(true);
  });
  it('hides the redundant desktop chat button and provides a way to reopen a collapsed rail',()=>{
    const u=fixture();u.context.cwBindPanelControls();u.context.cwSyncPanels();
    expect(u.elements.cwBack.hidden).toBe(true);expect(u.elements.cwInfoBtn.hidden).toBe(false);
    u.elements.cwCollapseRail.onclick();
    expect(u.classes.has('rail-collapsed')).toBe(true);expect(u.elements.cwBack.hidden).toBe(false);expect(u.rail.inert).toBe(true);expect(u.elements.cwRailResize.hidden).toBe(true);
    expect(u.elements.cwBack.focus).toHaveBeenCalledOnce();
    expect(JSON.parse(u.saved.get('hermes.cowork.panels')!).railCollapsed).toBe(true);
  });
  it('keeps Profile available and returns to the current chat without losing the draft',()=>{
    const u=fixture();u.context.cwExit=vi.fn();u.context.cwBindTopNav();u.context.cwSyncPanels();
    expect(u.elements.cwInfoBtn.getAttribute('aria-expanded')).toBe('false');
    expect(u.elements.cwInfoPanel.style.display).toBe('none');
    expect(u.elements.cwInfoPanel.inert).toBe(true);
    expect(COWORK_JS).not.toContain('id="cwInfoPanel"');
    expect(COWORK_JS).not.toContain('id="cwInfoResize"');
    u.elements.cwCurrentChat.onclick();
    expect(u.cw.infoOpen).toBe(false);expect(u.classes.has('info-open')).toBe(false);
    expect(u.elements.cwInfoBtn.hidden).toBe(false);expect(u.elements.cwInfoBtn.getAttribute('aria-expanded')).toBe('false');
    expect(u.elements.cwCurrentChat.getAttribute('aria-pressed')).toBe('true');
    expect(u.elements.cwInput.value).toBe('Keep my draft');expect(u.elements.cwInput.focus).toHaveBeenCalledOnce();
    expect(JSON.parse(u.saved.get('hermes.cowork.panels')!).infoOpen).toBe(false);
    u.elements.cwHomeBtn.onclick();expect(u.context.cwExit).toHaveBeenCalledOnce();
  });
  it('resizes the chat rail and keeps the removed profile divider hidden',()=>{
    const u=fixture();u.context.cwBindPanelControls();u.context.cwSyncPanels();
    const left=u.elements.cwRailResize,right=u.elements.cwInfoResize;
    left.onkeydown({key:'ArrowRight',preventDefault:vi.fn()});expect(u.cw.railWidth).toBe(274);
    expect(right.hidden).toBe(true);expect(right.onkeydown).toBeUndefined();
    left.onpointerdown({button:0,clientX:274,pointerId:1,preventDefault:vi.fn()});left.onpointermove({clientX:350});left.onpointerup();expect(u.cw.railWidth).toBe(350);
    expect(left.setPointerCapture).toHaveBeenCalledWith(1);expect(u.context.document.body.classList.remove).toHaveBeenCalledWith('cw-resizing');
    expect(JSON.parse(u.saved.get('hermes.cowork.panels')!).infoOpen).toBe(false);
    u.elements.cw.clientWidth=856;u.context.cwApplyPanelWidths();
    expect(Number(left.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(548);
  });
  it('restores valid preferences and clamps corrupt or oversized widths',()=>{
    const u=fixture();u.saved.set('hermes.cowork.panels',JSON.stringify({railWidth:9999,infoWidth:440,railCollapsed:true,infoOpen:true}));
    u.context.cwBindPanelControls();expect(u.cw.railWidth).toBe(400);expect(u.cw.infoOpen).toBe(false);expect(u.cw.railCollapsed).toBe(true);
    u.saved.set('hermes.cowork.panels','not json');expect(u.context.cwPanelPreferences().railWidth).toBe(264);
  });
  it('preserves the mobile drawer and keeps desktop collapse separate from mobile visibility',()=>{
    const u=fixture(477);u.cw.railCollapsed=true;u.context.cwBindPanelControls();u.cw.railCollapsed=true;u.context.cwSyncPanels();
    expect(u.elements.cwBack.hidden).toBe(false);expect(u.classes.has('rail-collapsed')).toBe(false);expect(u.rail.inert).toBe(true);
    u.classes.add('rail-open');u.context.cwSyncPanels();expect(u.rail.inert).toBe(false);expect(u.elements.cwChat.inert).toBe(true);expect(u.elements.cwPanelBackdrop.hidden).toBe(false);
  });
});
