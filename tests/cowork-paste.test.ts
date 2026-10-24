import { createContext, Script } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const readers: {finish:(id?:string)=>void;onerror:()=>void}[] = [];
  const remove = { getAttribute: () => '0', onclick: undefined as undefined | (() => void) };
  const pending = { innerHTML: '', querySelectorAll: (selector:string) => selector.includes('retry')?[]:[remove] };
  const input = { value: '', style: { height: '' } };
  const send = { disabled: false, classList: { toggle: vi.fn() }, setAttribute: vi.fn() };
  const elements: Record<string, unknown> = { cwPending: pending, cwInput: input, cwSend: send };
  const context = createContext({
    S: { cw: { active: 'chat', pendingFiles: [], msgs: [], busy: false } },
    window: { addEventListener: vi.fn() }, crypto: { randomUUID },
    attachBinary:(file:{name:string;type:string;size:number},pendingFiles:Record<string,unknown>[],_scope:string,render:()=>void)=>{const entry:Record<string,unknown>={name:file.name||'pasted-image.png',type:file.type,size:file.size,loading:true,previewUrl:'blob:preview',cancel:vi.fn()};pendingFiles.push(entry);readers.push({finish:(id='artifact-fixture')=>{entry.artifactId=id;entry.loading=false;render();},onerror:()=>{entry.error='Upload interrupted. Resume or remove it.';entry.loading=false;render();}});render();},
    $: (id: string) => elements[id], toast: vi.fn(),
    esc: (text: unknown) => String(text ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
  });
  new Script(COWORK_JS).runInContext(context);
  context.cwEnsure();
  context.cwPostLocal = vi.fn();
  context.cwSaveDraft = vi.fn();
  context.cwRenderReferences = vi.fn();
  return { context, cw: context.S.cw, readers, pending, input, send, remove };
}
const png = (name = 'image.png') => ({ name, type: 'image/png', size: 1024 });
function paste(files: ReturnType<typeof png>[], text = '', filesOnly = false) {
  return { preventDefault: vi.fn(), clipboardData: {
    items: filesOnly ? [] : files.map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    files, getData: () => text,
  } };
}

describe('Cowork clipboard images', () => {
  it('attaches pasted screenshots, previews them, and sends an image-only message', async () => {
    const u = fixture(), event = paste([png()]);
    u.context.cwPasteImages(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(u.send.disabled).toBe(true);
    await u.context.cwSend();
    expect(u.context.cwPostLocal).not.toHaveBeenCalled();
    u.readers[0].finish();
    expect(u.send.disabled).toBe(false);
    expect(u.pending.innerHTML).toContain('<img src="blob:preview"');
    await u.context.cwSend();
    expect(u.context.cwPostLocal.mock.calls[0][0].payload).toMatchObject({
      text: '', files: [expect.objectContaining({ name: 'image.png', type: 'image/png', artifactId:'artifact-fixture' })],
    });
    expect(u.cw.pendingFiles).toEqual([]);
  });

  it('keeps plain text and mixed image/text pasting intact', () => {
    const u = fixture(), plain = paste([], 'some text'), mixed = paste([png()], 'caption');
    u.context.cwPasteImages(plain);
    expect(plain.preventDefault).not.toHaveBeenCalled();
    expect(u.readers).toHaveLength(0);
    u.context.cwPasteImages(mixed);
    expect(mixed.preventDefault).not.toHaveBeenCalled();
    expect(u.readers).toHaveLength(1);
  });

  it('supports a files-only clipboard without duplicating item and file representations', () => {
    const u = fixture();
    u.context.cwPasteImages(paste([png('')], '', true));
    u.readers[0].finish();
    expect(u.cw.pendingFiles[0].name).toBe('pasted-image.png');
    u.context.cwPasteImages(paste([png('second.png')]));
    expect(u.cw.pendingFiles).toHaveLength(2);
  });

  it('reserves attachment slots across rapid pastes and preserves order as reads finish', () => {
    const u = fixture();
    u.context.cwPasteImages(paste([png('first.png'), png('second.png'), png('third.png')]));
    u.context.cwPasteImages(paste([png('fourth.png'), png('fifth.png')]));
    expect(u.readers).toHaveLength(4);
    u.readers[1].finish('second-artifact');
    u.readers[0].finish();
    expect(u.cw.pendingFiles[0].name).toBe('first.png');
    expect(u.cw.pendingFiles[1].artifactId).toBe('second-artifact');
    expect(u.context.toast).toHaveBeenCalledWith('You can attach up to 4 files at once', true);
  });

  it('does not resurrect removed images or leak a pending read into another chat', () => {
    const u = fixture();
    u.context.cwPasteImages(paste([png()]));
    u.remove.onclick?.();
    u.readers[0].finish();
    expect(u.cw.pendingFiles).toEqual([]);
    u.context.cwPasteImages(paste([png()]));
    u.cw.pendingFiles = [];
    u.cw.active = 'other-chat';
    u.readers[1].finish();
    expect(u.cw.pendingFiles).toEqual([]);
  });

  it('accepts files above 20 MB and keeps interrupted transfers available for resume or removal', () => {
    const u = fixture();
    u.context.cwPasteImages(paste([{ ...png(), size: 20000001 }]));
    expect(u.readers).toHaveLength(1);
    expect(u.context.toast).not.toHaveBeenCalled();
    u.readers[0].onerror?.();
    expect(u.cw.pendingFiles[0].error).toContain('interrupted');expect(u.pending.innerHTML).toContain('Resume');u.remove.onclick?.();expect(u.cw.pendingFiles).toEqual([]);
  });
});
