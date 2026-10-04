import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture(){
  const nodes=Object.fromEntries(['cwChat','cwInfoPanel'].map(id=>[id,{style:{setProperty:vi.fn(),removeProperty:vi.fn()},setAttribute:vi.fn(),removeAttribute:vi.fn()}]));
  const cw={active:'atlas-dm',convs:[{id:'atlas-dm',kind:'dm',memberIds:['atlas']},{id:'nova-dm',kind:'dm',memberIds:['nova']},{id:'team',kind:'group',memberIds:['atlas','nova']}],agents:[{id:'atlas',avatar:{shape:'dot-blue',color:'#e66ca9'}},{id:'nova',avatar:{shape:'dot-orange',color:'#f39b52'}}]};
  const context=createContext({S:{cw},window:{addEventListener:vi.fn()},document:{addEventListener:vi.fn(),documentElement:{getAttribute:()=> 'light'}},$: (id:string)=>nodes[id]});
  new Script(COWORK_JS).runInContext(context);return {context,cw,nodes};
}
describe('Cowork character colors',()=>{
  it('recolors the selected character while retaining bundled assets and safe attributes',()=>{
    const u=fixture(),original=u.context.cwAvaImg({shape:'dot-blue',color:'#5ba8ff'}),rose=u.context.cwAvaImg({shape:'dot-blue',color:'#e66ca9'});
    expect(original).toContain('/characters/blue.png');expect(original).not.toContain('hue-rotate');
    expect(rose).toContain('/characters/blue.png');expect(rose).toContain('hue-rotate(');
    expect(u.context.cwAvaImg({shape:'dot-blue',color:'#000000'})).toContain('saturate(0.00) brightness(0.25)');
    const unsafe=u.context.cwAvaImg({shape:'dot-blue',color:'" onerror="alert(1)'});expect(unsafe).not.toContain('onerror');expect(unsafe).not.toContain('alert');
  });
  it('changes only the current teammate’s chat and profile and clears the tint for group chats',()=>{
    const u=fixture();u.context.cwApplyCharacterTheme();
    for(const node of Object.values(u.nodes))expect(node.style.setProperty).toHaveBeenCalledWith('--character-color','#e66ca9');
    u.cw.active='nova-dm';u.context.cwApplyCharacterTheme();expect(u.nodes.cwChat!.style.setProperty).toHaveBeenLastCalledWith('--selected','color-mix(in srgb,#f39b52 12%,var(--card))');
    u.cw.active='team';u.context.cwApplyCharacterTheme();expect(u.nodes.cwChat!.removeAttribute).toHaveBeenCalledWith('data-character-color');expect(u.nodes.cwChat!.style.removeProperty).toHaveBeenCalledWith('--accent');
  });
  it('maintains at least 4.5:1 text contrast in both themes, including very pale and dark colors',()=>{
    const u=fixture();for(const light of [true,false])for(const color of ['#ffffff','#000000','#ffff00','#e66ca9','#3fd68f','#5ba8ff']){
      const adjusted=u.context.cwReadableAccent(color,light),lum=u.context.cwColorLuminance(u.context.cwColorRgb(adjusted)),bg=u.context.cwColorLuminance(light?[250,250,249]:[17,17,17]);
      expect((Math.max(lum,bg)+.05)/(Math.min(lum,bg)+.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
