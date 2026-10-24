import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture(){
  const node=()=>({style:{setProperty:vi.fn(),removeProperty:vi.fn()},setAttribute:vi.fn(),removeAttribute:vi.fn()});
  const nodes=Object.fromEntries(['cw','cwChat','cwInfoPanel'].map(id=>[id,node()])),body=node();
  const cw={active:'atlas-dm',selectedAgentId:undefined as string|undefined,profileOpen:false,profileAgentId:undefined as string|undefined,convs:[{id:'atlas-dm',kind:'dm',memberIds:['atlas']},{id:'nova-dm',kind:'dm',memberIds:['nova']},{id:'team',kind:'group',memberIds:['atlas','nova']}],agents:[{id:'atlas',avatar:{shape:'dot-blue',color:'#e66ca9'}},{id:'nova',avatar:{shape:'dot-orange',color:'#f39b52'}}]};
  const context=createContext({S:{cw},window:{addEventListener:vi.fn()},document:{body,addEventListener:vi.fn(),documentElement:{getAttribute:()=> 'light'}},$: (id:string)=>nodes[id]});
  new Script(COWORK_JS).runInContext(context);return {context,cw,nodes,body,node};
}
describe('Cowork character colors',()=>{
  it('recolors the selected character while retaining bundled assets and safe attributes',()=>{
    const u=fixture(),original=u.context.cwAvaImg({shape:'dot-blue',color:'#5ba8ff'}),rose=u.context.cwAvaImg({shape:'dot-blue',color:'#e66ca9'});
    expect(original).toContain('/characters/blue.png');expect(original).not.toContain('hue-rotate');
    expect(rose).toContain('/characters/blue.png');expect(rose).toContain('hue-rotate(');
    expect(u.context.cwAvaImg({shape:'dot-blue',color:'#000000'})).toContain('saturate(0.00) brightness(0.25)');
    const unsafe=u.context.cwAvaImg({shape:'dot-blue',color:'" onerror="alert(1)'});expect(unsafe).not.toContain('onerror');expect(unsafe).not.toContain('alert');
  });
  it('follows the selected teammate in DMs, team chats and profiles',()=>{
    const u=fixture();u.context.cwApplyCharacterTheme();
    for(const node of [u.nodes.cwChat!,u.nodes.cwInfoPanel!])expect(node.style.setProperty).toHaveBeenCalledWith('--character-color','#e66ca9');
    u.cw.active='nova-dm';u.context.cwApplyCharacterTheme();expect(u.nodes.cwChat!.style.setProperty).toHaveBeenLastCalledWith('--selected','color-mix(in srgb,#f39b52 12%,var(--card))');
    u.cw.active='team';u.cw.selectedAgentId='nova';u.context.cwApplyCharacterTheme();
    expect(u.nodes.cw!.setAttribute).toHaveBeenLastCalledWith('data-character-color','#f39b52');
    u.cw.profileOpen=true;u.cw.profileAgentId='atlas';u.context.cwApplyCharacterTheme();
    expect(u.body.setAttribute).toHaveBeenLastCalledWith('data-character-color','#e66ca9');
  });
  it('lets sibling widgets and body-mounted overlays inherit tokens without changing global accent',()=>{
    const u=fixture();u.context.cwApplyCharacterTheme();
    expect(u.body.style.setProperty).toHaveBeenCalledWith('--cw-control-color',u.context.cwReadableAccent('#e66ca9',true));
    expect(u.body.style.setProperty.mock.calls.some(([property])=>property==='--accent')).toBe(false);
    const overlay=u.node();u.context.cwThemeElement(overlay,u.cw.agents[1]);
    expect(overlay.setAttribute).toHaveBeenCalledWith('data-character-color','#f39b52');
    expect(overlay.style.setProperty.mock.calls).toEqual([['--cw-control-color',u.context.cwReadableAccent('#f39b52',true)],['--cw-message-color','#f39b52'],['--cw-user-ink','#000000']]);
    u.cw.active='missing';u.context.cwApplyCharacterTheme();
    expect(u.body.removeAttribute).toHaveBeenCalledWith('data-character-color');
    expect(u.nodes.cw!.style.removeProperty).toHaveBeenCalledWith('--cw-control-color');
  });
  it('maintains at least 4.5:1 text contrast in both themes, including very pale and dark colors',()=>{
    const u=fixture();for(const light of [true,false])for(const color of ['#ffffff','#000000','#ffff00','#e66ca9','#3fd68f','#5ba8ff']){
      const adjusted=u.context.cwReadableAccent(color,light),lum=u.context.cwColorLuminance(u.context.cwColorRgb(adjusted)),bg=u.context.cwColorLuminance(light?[250,250,249]:[17,17,17]);
      expect((Math.max(lum,bg)+.05)/(Math.min(lum,bg)+.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

it('uses the avatar colour for user messages with readable text for pale and dark colours',()=>{const u=fixture();for(const color of ['#ffffff','#000000','#5ba8ff','#757575','#ffff00']){const node=u.node();u.context.cwThemeElement(node,{avatar:{shape:'dot-blue',color}});const ink=node.style.setProperty.mock.calls.find(([key])=>key==='--cw-user-ink')![1],lum=u.context.cwColorLuminance(u.context.cwColorRgb(color)),text=u.context.cwColorLuminance(u.context.cwColorRgb(ink));expect((Math.max(lum,text)+.05)/(Math.min(lum,text)+.05)).toBeGreaterThanOrEqual(4.5);expect(node.style.setProperty).toHaveBeenCalledWith('--cw-message-color',color);}});
