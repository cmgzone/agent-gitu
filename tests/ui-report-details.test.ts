import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { REPORT_DETAILS_JS } from '../src/server/ui-report-details.js';
import { UI_HTML } from '../src/server/ui.js';
import { HOME_CHARACTER_HTML } from '../src/server/ui-home.js';

describe('Main agent files and report details',()=>{
  it('deduplicates persisted and streamed files and keeps runs isolated',()=>{
    const sessions:any={one:{session:{files:[{id:'f1',name:'First.txt'}]}},two:{session:{files:[{id:'other',name:'Other.txt'}]}}};
    const context=createContext({S:{sessions}});new Script(REPORT_DETAILS_JS).runInContext(context);
    context.recordRunFile(sessions.one,{id:'f1',name:'Updated.txt'});context.recordRunFile(sessions.one,{id:'f2',name:'Second.txt'});
    expect(context.runSharedFiles('one').map((file:any)=>file.name)).toEqual(['Updated.txt','Second.txt']);
    expect(context.runSharedFiles('two').map((file:any)=>file.name)).toEqual(['Other.txt']);expect(context.runSharedFiles('missing')).toEqual([]);
  });
  it('renders all downloads in a separate view and preserves media on unchanged updates',()=>{
    const holder={appendChild:vi.fn(),innerHTML:''},main={insertAdjacentHTML:vi.fn()},body:any={innerHTML:'',querySelector:(selector:string)=>selector==='#runSharedFiles'?holder:main};
    const files=[{id:'f1',name:'Screenshot.png',previewUrl:'/api/runs/one/files/f1'},{id:'f2',name:'Report.pdf',downloadUrl:'/api/runs/one/files/f2'}];
    const card=vi.fn((file:any)=>({name:file.name}));
    const context=createContext({S:{active:'one',panelKind:'files',sessions:{one:{session:{files,report:{filesChanged:['src/a.ts','src/b.ts']}}},two:{session:{files:[],report:{filesChanged:['other.ts']}}}}},$: (id:string)=>id==='sideBody'?body:{hidden:false},sessionFileCard:card,reportFiles:(report:any)=>report.filesChanged,reportChangedFilesHtml:(_id:string,changed:string[])=>'<section>'+changed.join(',')+'</section>'});
    new Script(REPORT_DETAILS_JS).runInContext(context);context.renderRunFiles('one');
    expect(body.innerHTML).toContain('Files &amp; details');expect(body.innerHTML).toContain('src/a.ts,src/b.ts');expect(card).toHaveBeenCalledTimes(2);expect(holder.appendChild).toHaveBeenCalledTimes(2);
    context.renderRunFiles('one');expect(card).toHaveBeenCalledTimes(2);
    context.renderRunFiles('two');expect(body.innerHTML).not.toContain('other.ts');expect(card).toHaveBeenCalledTimes(2);
    context.S.panelKind='state';context.renderRunFiles('one');expect(card).toHaveBeenCalledTimes(2);
  });
  it('offers attachments only through the plus menu and uses the bundled home character',()=>{
    expect(UI_HTML).toContain('data-hp="attach" role="menuitem"');expect(UI_HTML).toContain('data-cwplus="attach"');
    expect(UI_HTML).not.toContain('id="attachBtn"');expect(UI_HTML).not.toContain('id="cwAttach"');
    expect(HOME_CHARACTER_HTML).toContain('class="home-character" src="/characters/purple.png');
    expect(UI_HTML).toContain(JSON.stringify(HOME_CHARACTER_HTML));
    expect(UI_HTML).toContain('.home-brand-lockup { display: flex; flex-direction:column;');
  });
});
