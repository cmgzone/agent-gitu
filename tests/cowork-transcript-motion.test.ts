import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

class Row {
  parentElement?: Wrap;
  _cwTranscriptSignature?: string;
  className='cw-row';
  writes=0;
  constructor(public key:string,public body:string,public id='') {}
  get outerHTML(){return '<div class="'+this.className+'" data-cwentrance="'+this.key+'">'+this.body+'</div>';}
  get innerHTML(){return this.body;}
  set innerHTML(value:string){this.body=value;this.writes++;}
  getAttribute(name:string){return name==='data-cwentrance' ? this.key || null : null;}
  remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(row=>row!==this);this.parentElement=undefined;}}
}
class Wrap {
  children:Row[]=[];
  insertBefore(row:Row,before:Row|null){row.remove();const at=before?this.children.indexOf(before):this.children.length;this.children.splice(at,0,row);row.parentElement=this;}
}
function fixture(){
  let next:Row[]=[];
  const context=createContext({document:{createElement:()=>({set innerHTML(_value:string){},get children(){return next;}})}});
  const source=COWORK_JS.slice(COWORK_JS.indexOf('  function cwReplaceTranscript('),COWORK_JS.indexOf('  function cwActivityLabel('));
  new Script(source).runInContext(context);
  const wrap=new Wrap();
  return {wrap,render:(rows:Row[])=>{next=rows;context.cwReplaceTranscript(wrap,'');}};
}
describe('chat transcript motion continuity',()=>{
  it('keeps message nodes mounted through polls and delivery updates so entrances can finish',()=>{
    const f=fixture(),sent=new Row('one','Sending…');f.render([sent]);
    f.render([new Row('one','Sending…')]);
    expect(f.wrap.children[0]).toBe(sent);expect(sent.writes).toBe(0);
    f.render([new Row('one','Sent'),new Row('two','Reply')]);
    expect(f.wrap.children[0]).toBe(sent);expect(sent.body).toBe('Sent');expect(sent.writes).toBe(1);
    expect(f.wrap.children).toHaveLength(2);
  });
  it('preserves the live reply and working indicator while removing deleted messages',()=>{
    const f=fixture(),old=new Row('old','Old'),live=new Row('','Streaming text','cwLive'),working=new Row('','Working','cwWorkingBubble');
    f.render([old,live,working]);
    f.render([new Row('fresh','New'),new Row('','','cwLive'),new Row('','','cwWorkingBubble')]);
    expect(f.wrap.children).not.toContain(old);expect(f.wrap.children[1]).toBe(live);expect(live.body).toBe('Streaming text');expect(f.wrap.children[2]).toBe(working);
  });
});
