import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {expect,it} from 'vitest';
import {CHAT_QUESTION_JS} from '../src/server/ui-chat-questions.js';
function fixture(){const context=createContext({esc:(s:unknown)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')});new Script(CHAT_QUESTION_JS).runInContext(context);return context;}
it('explains a test approval without putting its JSON in the visible summary',()=>{const c=fixture(),raw=JSON.stringify({command:'npm test -- --run'}),p=c.cardActionPresentation('run_command','Verify the changes',raw);expect(p.title).toBe('Run the project checks?');expect(p.detail).not.toContain('npm');const html=c.chatQuestionHtml({id:'a1',title:'Approve run_command for @P.A?',detail:'Verify the changes\n\n'+raw,kind:'question',status:'open',options:['Approve','Deny']},{},'cw');expect(html).toContain('Run the project checks?');expect(html).toContain('<details class="card-technical"');expect(html.indexOf(raw.replace(/"/g,'&quot;'))).toBeGreaterThan(html.indexOf('<details'));expect(html).not.toContain('<details open');});
it('keeps deletion, publishing, installation and forced history impacts explicit',()=>{const c=fixture();for(const [command,text]of [['Remove-Item -Recurse ./output','delete files'],['git push --force origin main','overwrite changes'],['npm install','installation instructions'],['npm test && curl https://example.com','Run a command']]){const p=c.cardActionPresentation('run_command','',JSON.stringify({command}));expect(p.detail).toContain(text);}});
it('keeps ordinary questions readable and escapes full technical details',()=>{const c=fixture(),p=c.cardRequestPresentation({title:'Choose a colour',detail:'Would you prefer blue or green?'});expect(p.detail).toBe('Would you prefer blue or green?');expect(p.technical).toBe('');const html=c.cardTechnicalDetails('<script>alert(1)</script>','id');expect(html).toContain('&lt;script>');expect(html).not.toContain('<script>');});
it('moves active coding decisions beneath later narration while preserving the answer field focus',()=>{const c=fixture();const nodes:any[]=[];let focused=0;const input={isConnected:true,selectionStart:2,selectionEnd:4,focus(){focused++;},setSelectionRange(start:number,end:number){expect([start,end]).toEqual([2,4]);}};const stream:any={querySelectorAll(){return nodes.filter(n=>n.card);},insertBefore(node:any,anchor:any){const old=nodes.indexOf(node);if(old>=0)nodes.splice(old,1);const at=anchor?nodes.indexOf(anchor):nodes.length;nodes.splice(at,0,node);}};function node(name:string,card=false){const value:any={name,card,parentNode:stream,contains(other:any){return card&&other===input;}};Object.defineProperty(value,'nextElementSibling',{get(){return nodes[nodes.indexOf(value)+1]||null;}});return value;}const approval=node('approval',true),message=node('latest agent message'),working=node('working');nodes.push(approval,message,working);c.document={activeElement:input};c.$=(id:string)=>id==='working'?working:null;new Script(readFileSync('src/server/ui-assets/scripts/reviews.js','utf8')).runInContext(c);c.placeDecisionCards(stream);expect(nodes.map(n=>n.name)).toEqual(['latest agent message','approval','working']);expect(focused).toBe(1);c.placeDecisionCards(stream);expect(focused).toBe(1);});
it('renders computer control question card with handoff action button',()=>{const c=fixture();const html=c.chatQuestionHtml({id:'req-handoff',agentId:'atlas',title:'Your turn on the desktop',detail:'Please sign in to the service.',kind:'question',desktopHandoff:true,status:'open',options:['Done — continue','Cancel handoff']},{},'cw');expect(html).toContain('Computer control');expect(html).toContain('Needs computer action');expect(html).toContain('data-cwhandoff="atlas"');expect(html).toContain('Open computer');expect(html).not.toContain('chat-question-remember-cb');});
it('keeps multi-line ordinary questions readable without duplicating into technical details',()=>{const c=fixture();const detail='Pick the launch focus:\n- Mobile first\n- Desktop first\n\nWe will build the second platform right after.';const p=c.cardRequestPresentation({title:'Which platform first?',detail});expect(p.kind).toBe('question');expect(p.detail).toBe(detail);expect(p.technical).toBe('');const html=c.chatQuestionHtml({id:'q-multi',title:'Which platform first?',detail,kind:'question',status:'open',options:['Mobile','Desktop']},{},'cw');expect(html).not.toContain('<details class="card-technical"');expect(html).toContain('chat-question-remember-cb');expect(html).toContain('chat-question-remember-pattern');expect(html).toContain('chat-question-remember-scope');});
it('styles delegated approval and plan review cards distinctly and omits the Chief remember toggle',()=>{const c=fixture();const appr=c.chatQuestionHtml({id:'a2',title:'Approve mcp:slack for @P.A?',detail:'Post message',kind:'question',delegatedGate:'approval',status:'open',options:['Approve','Deny']},{},'cw');expect(appr).toContain('is-approval');expect(appr).toContain('Needs approval');expect(appr).not.toContain('chat-question-remember-cb');const plan=c.chatQuestionHtml({id:'p1',title:'Review @P.A\'s plan before implementation',detail:'Criteria: tests pass',kind:'question',delegatedGate:'plan_review',status:'open',options:['Approve','Request changes']},{},'cw');expect(plan).toContain('is-plan');expect(plan).toContain('Needs plan review');expect(plan).not.toContain('chat-question-remember-cb');const picker=c.chatQuestionHtml({id:'f1',title:'Which project folder should I use?',detail:'Pick a folder.',kind:'question',status:'open',options:['/a','/b']},{},'cw');expect(picker).not.toContain('chat-question-remember-cb');});
it('attributes Chief-resolved closed question cards to Chief of Staff instead of the user',()=>{const c=fixture();const html=c.chatQuestionHtml({id:'q-chief',title:'Which test runner?',detail:'Choose runner',kind:'question',status:'answered',response:'Vitest',resolvedBy:'chief',resolvedByLabel:'Chief of Staff',options:['Vitest','Jest']},{},'cw');expect(html).toContain('is-chief-resolved');expect(html).toContain('Handled by Chief');expect(html).toContain('Chief of Staff answered');expect(html).not.toContain('<strong>Your answer</strong>');});
it('dynamically formats arbitrary commands, MCP/custom tools, and external paths without fail-closed jargon',()=>{
  const c=fixture();
  const docker=c.cardActionPresentation('run_command','unrecognized command (fail closed)',JSON.stringify({command:'docker compose up -d db'}));
  expect(docker.title).toBe('Run docker compose?');
  expect(docker.detail.toLowerCase()).not.toContain('unrecognized');
  expect(docker.detail).toContain('docker compose');
  expect(docker.preview).toBe('docker compose up -d db');

  const withReason=c.cardActionPresentation('run_command','Start local database for tests',JSON.stringify({command:'docker compose up -d db'}));
  expect(withReason.title).toBe('Run docker compose?');
  expect(withReason.detail).toBe('Start local database for tests');

  const mcp=c.cardActionPresentation('mcp:github:create_pull_request','unknown tool (fail closed)',JSON.stringify({repo:'cmgzone/agent-gitu',title:'Fix auth',api_key:'secret-123'}));
  expect(mcp.title).toBe('Allow Github · create pull request?');
  expect(mcp.detail).toContain('cmgzone/agent-gitu');
  expect(mcp.detail).not.toContain('secret-123');
  expect(mcp.detail.toLowerCase()).not.toContain('unknown tool');

  const custom=c.cardActionPresentation('sync_warehouse_records','unknown tool (fail closed)',JSON.stringify({target:'eu-west'}));
  expect(custom.title).toBe('Allow sync warehouse records?');
  expect(custom.detail).toContain('eu-west');

  const extWrite=c.cardActionPresentation('write_file','Update router config — Write this file outside the locked project.','C:\\Users\\Admin\\Documents\\api router\\src\\composio.ts');
  expect(extWrite.title).toBe('Update composio.ts outside this project?');
  expect(extWrite.detail).toContain('Update router config');
  expect(extWrite.preview).toContain('composio.ts');
});

it('keeps the custom answer input collapsed until the user presses Custom answer, while keeping open-ended questions expanded',()=>{
  const c=fixture(),owner:Record<string,any>={};
  const withChoices=c.chatQuestionHtml({id:'q-opt',title:'Choose region',detail:'Pick a launch region',kind:'question',status:'open',options:['Europe','US']},owner,'cw');
  expect(withChoices).toContain('data-question-custom aria-expanded="false"');
  expect(withChoices).toContain('>Custom answer</button>');
  expect(withChoices).toContain('data-question-custom-wrap hidden>');

  // Pressing the Custom answer button opens the textarea and focuses it; pressing again closes it.
  let focused=0;
  const attrs:Record<string,string>={'aria-expanded':'false'};
  const customWrap={hidden:true};
  const hintEl={textContent:''};
  const input={value:'',focus(){focused++;},setAttribute(){}};
  const customBtn={textContent:'Custom answer',onclick:null as null|(()=>void),setAttribute(k:string,v:string){attrs[k]=v;}};
  const form={
    getAttribute:()=>'q-opt',
    closest:()=>({getAttribute:()=>'Needs your answer'}),
    querySelector:(sel:string)=>sel==='[data-question-answer]'?input:sel==='[data-question-custom]'?customBtn:sel==='[data-question-custom-wrap]'?customWrap:sel==='.chat-question-hint'?hintEl:sel==='.chat-question-error'?{textContent:''}:sel==='[type=submit]'?{textContent:'Send answer'}:null,
    querySelectorAll:()=>[],
  };
  const root={querySelectorAll:(sel:string)=>sel==='[data-question-form]'?[form]:[]};
  c.chatBindQuestions(root,owner,'cw',async()=>{});
  customBtn.onclick!();
  expect(customWrap.hidden).toBe(false);
  expect(attrs['aria-expanded']).toBe('true');
  expect(focused).toBe(1);
  expect(owner.questionCards.cw['q-opt'].customOpen).toBe(true);
  // Re-rendering while open keeps it expanded.
  const reopened=c.chatQuestionHtml({id:'q-opt',title:'Choose region',detail:'Pick a launch region',kind:'question',status:'open',options:['Europe','US']},owner,'cw');
  expect(reopened).toContain('data-question-custom aria-expanded="true"');
  expect(reopened).not.toContain('data-question-custom-wrap hidden>');
  customBtn.onclick!();
  expect(customWrap.hidden).toBe(true);
  expect(attrs['aria-expanded']).toBe('false');

  // Open-ended questions with no options show the textarea right away without a Custom answer toggle.
  const openEnded=c.chatQuestionHtml({id:'q-free',title:'What is your goal?',detail:'Describe your target outcome.',kind:'question',status:'open',options:[]},owner,'cw');
  expect(openEnded).not.toContain('data-question-custom ');
  expect(openEnded).not.toContain('data-question-custom-wrap hidden>');
});
