import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';

function fixture() {
  const root=mkdtempSync(path.join(tmpdir(),'gitu-artifact-path-'));
  const store=new CoworkStore(path.join(root,'cowork.json'));
  const agent=store.saveAgent({name:'Gitu',systemPrompt:'Help.'});
  const conversation=store.saveConversation({kind:'dm',memberIds:[agent.id]});
  return {root,store,conversation,agent};
}

describe('readable artifact paths',()=>{
  it('serves stored files with spaces, punctuation, and Unicode after reload',()=>{
    const f=fixture();
    try {
      for(const name of ['Galaxy A17 5G.avif','Comparison (final).txt','Résumé aperçu.txt']) {
        const bytes=Buffer.from('stored content');
        const artifact=f.store.addArtifact({conversationId:f.conversation.id,agentId:f.agent.id,name,dataBase64:bytes.toString('base64')});
        const reloaded=new CoworkStore(path.join(f.root,'cowork.json'));
        const file=reloaded.artifactPath(artifact.id);
        expect(file).toBeDefined();expect(readFileSync(file!)).toEqual(bytes);
      }
    } finally {rmSync(f.root,{recursive:true,force:true});}
  });
  it('rejects traversal, absolute paths, Windows streams, and corrupt conversation paths',()=>{
    const f=fixture();
    try {
      const artifact=f.store.addArtifact({conversationId:f.conversation.id,name:'file.txt',dataBase64:Buffer.from('stored').toString('base64')});
      const saved=f.store.getArtifact(artifact.id)!;
      const storageName=saved.storageName;
      for(const name of ['../outside.txt','..\\outside.txt',path.join(f.root,'outside.txt'),'file.txt:secret','file\u0000.txt','.','..']) {
        saved.storageName=name;expect(f.store.artifactPath(artifact.id)).toBeUndefined();
      }
      saved.storageName=storageName;saved.conversationId='../outside';expect(f.store.artifactPath(artifact.id)).toBeUndefined();
    } finally {rmSync(f.root,{recursive:true,force:true});}
  });
});
