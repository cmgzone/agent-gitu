import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_COMPUTER_JS } from '../src/server/ui-cowork-computer.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const agent={id:'gitu',name:'Gitu',useHostComputer:false};
  const cw:any={agents:[agent],convs:[{id:'chat',memberIds:['gitu']}],active:'chat',busy:false,computers:[{agentId:'gitu',state:'running',control:'shared'}],requests:[],progresses:[]};
  const nodes:Record<string,any>={};
  function element() {
    const children:any[]=[],attrs:Record<string,string>={},parts:Record<string,any>={};
    return {children,attrs,hidden:false,innerHTML:'',textContent:'',scrollTop:0,scrollHeight:500,clientHeight:500,scrollIntoView:vi.fn(),
      setAttribute:(name:string,value:string)=>{attrs[name]=value;},removeAttribute:(name:string)=>{delete attrs[name];},querySelector:(selector:string)=>parts[selector]??=element(),
      appendChild:(child:any)=>{children.push(child);if(child.id)nodes[child.id]=child;},replaceChildren:vi.fn(()=>{children.length=0;}),
      remove:vi.fn(function(this:any){if(this.id)delete nodes[this.id];})};
  }
  nodes.cwMsgs=element();nodes.cwComputerBtn=element();
  const frames:any[]=[];
  const context=createContext({S:{active:'cowork'},cwEnsure:()=>cw,cwActiveConv:()=>cw.convs.find((conv:any)=>conv.id===cw.active),cwConvMembers:(conv:any)=>cw.agents.filter((member:any)=>conv.memberIds.includes(member.id)),
    $:(id:string)=>nodes[id],cwIcon:(name:string)=>'<svg>'+name+'</svg>',cwOpenDesktop:vi.fn(),cwAnimateChatBubbles:vi.fn(),
    window:{matchMedia:()=>({matches:true})},document:{createElement:(tag:string)=>{const node=element();if(tag==='iframe')frames.push(node);return node;}},api:vi.fn()});
  new Script(COWORK_COMPUTER_JS).runInContext(context);
  return {context,cw,agent,nodes,frames};
}

describe('contextual inline computer',()=>{
  it('keeps the live computer node connected when new transcript messages arrive',()=>{
    const old={id:'old',getAttribute:()=>null,remove:vi.fn()},computer={id:'cwInlineComputer',getAttribute:()=>null,remove:vi.fn()},fresh={id:'new',getAttribute:()=>null};
    const wrap:any={children:[old,computer],insertBefore:vi.fn((node:any,before:any)=>{wrap.children.splice(before?wrap.children.indexOf(before):wrap.children.length,0,node);})};
    old.remove.mockImplementation(()=>{wrap.children=wrap.children.filter((node:any)=>node!==old);});
    const context=createContext({S:{cw:{}},window:{addEventListener:vi.fn()},document:{addEventListener:vi.fn(),createElement:()=>({children:[fresh]})}});
    new Script(COWORK_JS).runInContext(context);context.cwReplaceTranscript(wrap,'new message');
    expect(computer.remove).not.toHaveBeenCalled();expect(wrap.children).toEqual([fresh,computer]);expect(wrap.insertBefore).toHaveBeenCalledOnce();
  });
  it('keeps the current agent shortcut available while idle without showing an activity card',()=>{
    const f=fixture();f.context.cwRenderComputerActivity();
    expect(f.nodes.cwComputerBtn.hidden).toBe(false);expect(f.nodes.cwInlineComputer).toBeUndefined();
    expect(f.nodes.cwComputerBtn.attrs['aria-label']).toBe('Open Gitu computer');expect(f.nodes.cwComputerBtn.attrs['aria-controls']).toBeUndefined();
    expect(f.context.cwOpenDesktop).not.toHaveBeenCalled();f.nodes.cwComputerBtn.onclick();expect(f.context.cwOpenDesktop).toHaveBeenCalledWith('gitu');
    f.cw.busy=true;f.cw.progresses=[{agentId:'gitu',phase:'reasoning'}];f.context.cwRenderComputerActivity();
    expect(f.nodes.cwComputerBtn.hidden).toBe(false);expect(f.nodes.cwInlineComputer).toBeUndefined();expect(f.frames).toHaveLength(0);expect(f.context.api).not.toHaveBeenCalled();
  });
  it('reveals a live read-only preview, preserves it through progress changes, and removes it after work',()=>{
    const f=fixture();f.cw.busy=true;f.cw.progresses=[{agentId:'gitu',tool:'browse'}];f.context.cwRenderComputerActivity();
    const card=f.nodes.cwInlineComputer;
    expect(f.nodes.cwComputerBtn.hidden).toBe(false);expect(f.frames[0].src).toBe('/api/cowork/agents/gitu/computer/view?preview=1');expect(f.frames[0].tabIndex).toBe(-1);
    f.cw.progresses=[{agentId:'gitu',phase:'responding'}];f.context.cwRenderComputerActivity();
    expect(f.nodes.cwInlineComputer).toBe(card);expect(f.frames).toHaveLength(1);
    f.nodes.cwComputerBtn.onclick();expect(card.scrollIntoView).toHaveBeenCalledWith({behavior:'instant',block:'center'});
    card.querySelector('[data-expand-computer]').onclick();expect(f.context.cwOpenDesktop).toHaveBeenCalledWith('gitu');
    f.cw.busy=false;f.context.cwRenderComputerActivity();
    expect(card.remove).toHaveBeenCalledOnce();expect(f.nodes.cwComputerBtn.hidden).toBe(false);expect(f.nodes.cwComputerBtn.attrs['aria-controls']).toBeUndefined();
    f.nodes.cwComputerBtn.onclick();expect(f.context.cwOpenDesktop).toHaveBeenLastCalledWith('gitu');
  });
  it('shows a handoff until resolved and never automatically expands or starts a desktop',()=>{
    const f=fixture();f.cw.requests=[{id:'handoff',agentId:'gitu',conversationId:'chat',desktopHandoff:true,status:'open',detail:'Please sign in.'}];
    f.context.cwRenderComputerActivity();
    const card=f.nodes.cwInlineComputer;
    expect(card.querySelector('[data-computer-title]').textContent).toBe('Your turn · Gitu');
    expect(card.querySelector('[data-computer-description]').textContent).toBe('Please sign in.');
    expect(f.context.cwOpenDesktop).not.toHaveBeenCalled();expect(f.context.api).not.toHaveBeenCalled();
    f.cw.requests[0].status='answered';f.context.cwRenderComputerActivity();expect(card.remove).toHaveBeenCalledOnce();
  });
  it('does not show another conversation’s handoff or start a private desktop for a host agent',()=>{
    const f=fixture();f.cw.computers[0]={agentId:'gitu',state:'running',control:'user',handoff:{requestId:'elsewhere'}};
    f.cw.requests=[{id:'elsewhere',agentId:'gitu',conversationId:'other',desktopHandoff:true,status:'open'}];f.context.cwRenderComputerActivity();
    expect(f.nodes.cwComputerBtn.hidden).toBe(false);expect(f.nodes.cwComputerBtn.attrs['data-handoff']).toBe('false');expect(f.nodes.cwInlineComputer).toBeUndefined();
    f.agent.useHostComputer=true;f.cw.busy=true;f.cw.progresses=[{agentId:'gitu',tool:'browse'}];f.context.cwRenderComputerActivity();
    expect(f.nodes.cwInlineComputer.querySelector('[data-expand-computer]').hidden).toBe(true);expect(f.frames).toHaveLength(0);expect(f.context.api).not.toHaveBeenCalled();
  });
  it('disconnects the inline stream on profile navigation and while the desktop is expanded',()=>{
    const f=fixture();f.cw.busy=true;f.cw.progresses=[{agentId:'gitu',tool:'desktop_input'}];f.context.cwRenderComputerActivity();
    const preview=f.nodes.cwInlineComputer.querySelector('[data-computer-preview]');
    f.cw.desktopSession={agentId:'gitu'};f.context.cwRenderComputerActivity();expect(preview.hidden).toBe(true);expect(preview.children).toHaveLength(0);
    f.cw.desktopSession=null;f.context.cwRenderComputerActivity();expect(preview.hidden).toBe(false);
    const card=f.nodes.cwInlineComputer;f.cw.profileOpen=true;f.context.cwRenderComputerActivity();expect(card.remove).toHaveBeenCalledOnce();expect(f.nodes.cwComputerBtn.hidden).toBe(true);
  });
  it('keeps the group shortcut on the selected agent when another teammate has a handoff',()=>{
    const f=fixture();f.cw.agents.push({id:'atlas',name:'Atlas',useHostComputer:false});f.cw.convs[0]={id:'chat',kind:'group',chiefId:'atlas',memberIds:['gitu','atlas']};f.cw.selectedAgentId='atlas';
    f.cw.requests=[{id:'handoff',agentId:'gitu',conversationId:'chat',desktopHandoff:true,status:'open'}];f.context.cwRenderComputerActivity();
    const card=f.nodes.cwInlineComputer;
    expect(card.querySelector('[data-computer-title]').textContent).toBe('Your turn · Gitu');expect(f.nodes.cwComputerBtn.attrs['aria-label']).toBe('Open Atlas computer');expect(f.nodes.cwComputerBtn.attrs['data-handoff']).toBe('false');
    f.nodes.cwComputerBtn.onclick();expect(f.context.cwOpenDesktop).toHaveBeenCalledWith('atlas');expect(card.scrollIntoView).not.toHaveBeenCalled();
    f.cw.selectedAgentId='gitu';f.context.cwRenderComputerActivity();expect(f.nodes.cwComputerBtn.attrs['data-handoff']).toBe('true');expect(f.nodes.cwComputerBtn.attrs['aria-controls']).toBe('cwInlineComputer');
    f.nodes.cwComputerBtn.onclick();expect(card.scrollIntoView).toHaveBeenCalledOnce();
  });
  it('hides the shortcut when the active conversation has no agent',()=>{
    const f=fixture();f.cw.convs[0].memberIds=[];f.context.cwRenderComputerActivity();
    expect(f.nodes.cwComputerBtn.hidden).toBe(true);expect(f.nodes.cwInlineComputer).toBeUndefined();
  });
});
