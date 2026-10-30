import {mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import path from'node:path';import{afterEach,expect,it}from'vitest';
import{CoworkStore}from'../src/cowork/store.js';import{ensureQuestionCard}from'../src/cowork/question-cards.js';
const roots:string[]=[];afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(path.join(tmpdir(),'gitu-question-card-'));roots.push(root);const store=new CoworkStore(path.join(root,'cowork.json')),agent=store.saveAgent({name:'Agent',systemPrompt:'Help'}),chat=store.saveConversation({kind:'dm',memberIds:[agent.id]});return{store,agent,chat};}
it('turns a clear user dependency into one persistent question card with options',()=>{const f=fixture(),text='Which region should I use?\n- Europe (Recommended)\n- Africa';const card=ensureQuestionCard(f.store,f.chat.id,f.agent.id,text)!;expect(card).toMatchObject({kind:'question',title:'Which region should I use?',options:['Europe','Africa'],recommended:'Europe',status:'open'});expect(ensureQuestionCard(f.store,f.chat.id,f.agent.id,text)?.id).toBe(card.id);expect(f.store.requests(f.chat.id)).toHaveLength(1);});
it('normalizes options, limits length and sets recommendation only when meaningful', () => {
  const f = fixture();
  // With explicit recommendation marker
  const textWithRec = 'Which database engine should we adopt?\n1. Postgres (recommended)\n2. MySQL\n3. SQLite';
  const card1 = ensureQuestionCard(f.store, f.chat.id, f.agent.id, textWithRec)!;
  expect(card1.options).toEqual(['Postgres', 'MySQL', 'SQLite']);
  expect(card1.recommended).toBe('Postgres');

  // Without recommendation marker
  const textPlain = 'Which cloud provider should we use?\n- AWS\n- GCP';
  const card2 = ensureQuestionCard(f.store, f.chat.id, f.agent.id, textPlain)!;
  expect(card2.options).toEqual(['AWS', 'GCP']);
  expect(card2.recommended).toBeUndefined();
});

it('does not turn answers, code examples, quoted questions or requests for secrets into question cards',()=>{const f=fixture();for(const text of ['The deployment is complete.','```\nWhich server should I use?\n```','> Which region should I use?','Can you provide your password?','What is your API key?'])expect(ensureQuestionCard(f.store,f.chat.id,f.agent.id,text)).toBeUndefined();expect(f.store.requests(f.chat.id)).toHaveLength(0);});
