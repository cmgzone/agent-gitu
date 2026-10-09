import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_DIALOGS_JS } from '../src/server/ui-cowork-dialogs.js';

function fixture() {
  const document: any = { activeElement: null };
  function control(patch = {}) {
    const node: any = {
      disabled: false, hidden: false, isConnected: true, tabIndex: 0,
      getClientRects: () => [{}], closest: () => null,
      focus: vi.fn(() => { document.activeElement = node; }), ...patch,
    };
    return node;
  }
  const opener = control(), composer = control(), cancel = control(), title = control(), topic = control(), save = control();
  const items = [cancel, title, topic, save];
  document.activeElement = opener;
  const modal: any = {
    isConnected: true, onkeydown: null,
    querySelectorAll: () => items,
    querySelector: (selector: string) => selector === '#title' ? title : null,
    remove: vi.fn(() => { modal.isConnected = false; items.forEach(item => { item.isConnected = false; }); }),
  };
  const pending: (() => void)[] = [];
  const context = createContext({
    document, $: (id: string) => id === 'cwInput' ? composer : null,
    setTimeout: vi.fn((callback: () => void) => { pending.push(callback); return pending.length; }), clearTimeout: vi.fn(),
  });
  new Script(COWORK_DIALOGS_JS).runInContext(context);
  return { context, document, modal, opener, composer, cancel, title, topic, save, items, control, focusInitial: () => pending.forEach(callback => callback()) };
}

function key(key: string, shiftKey = false) {
  return { key, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe('Cowork form dialog keyboard behavior', () => {
  it('focuses the requested field and restores the captured opener when cancelled', () => {
    const f = fixture(), close = f.context.cwBindDialog(f.modal, '#title');
    expect(f.opener.focus).not.toHaveBeenCalled();expect(f.title.focus).not.toHaveBeenCalled();
    f.focusInitial();expect(f.title.focus).toHaveBeenCalledWith({ preventScroll: true });
    close();expect(f.modal.remove).toHaveBeenCalledOnce();expect(f.opener.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(f.modal.onkeydown).toBeNull();close();expect(f.modal.remove).toHaveBeenCalledOnce();
  });

  it('closes on Escape without bubbling into another surface and prevents delayed focus after cancellation', () => {
    const f = fixture(), close = f.context.cwBindDialog(f.modal, '#title'), event = key('Escape');
    f.modal.onkeydown(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(f.modal.remove).toHaveBeenCalledOnce();expect(f.opener.focus).toHaveBeenCalledOnce();expect(f.context.clearTimeout).toHaveBeenCalledWith(1);
    f.focusInitial();expect(f.title.focus).not.toHaveBeenCalled();close();expect(f.opener.focus).toHaveBeenCalledOnce();
  });

  it('wraps Tab in both directions and allows ordinary movement within the dialog', () => {
    const f = fixture();f.context.cwBindDialog(f.modal, '#title');
    f.document.activeElement = f.save;
    const forward = key('Tab');f.modal.onkeydown(forward);expect(forward.preventDefault).toHaveBeenCalledOnce();expect(f.document.activeElement).toBe(f.cancel);
    const backward = key('Tab', true);f.modal.onkeydown(backward);expect(backward.preventDefault).toHaveBeenCalledOnce();expect(f.document.activeElement).toBe(f.save);
    f.document.activeElement = f.title;
    const middle = key('Tab');f.modal.onkeydown(middle);expect(middle.preventDefault).not.toHaveBeenCalled();
  });

  it('skips disabled, hidden, and untabbable controls, including those hidden by ancestors', () => {
    const f = fixture();f.save.disabled = true;f.cancel.hidden = true;
    f.items.push(f.control({ getClientRects: () => [] }), f.control({ tabIndex: -1 }), f.control({ closest: () => ({ hidden: true }) }), f.control({ type: 'hidden' }), f.control({ matches: (selector: string) => selector === ':disabled' }));
    f.context.cwBindDialog(f.modal, '#title');f.focusInitial();
    f.document.activeElement = f.topic;
    const forward = key('Tab');f.modal.onkeydown(forward);expect(f.document.activeElement).toBe(f.title);
    const backward = key('Tab', true);f.modal.onkeydown(backward);expect(f.document.activeElement).toBe(f.topic);
    f.title.hidden = true;f.topic.disabled = true;
    const empty = key('Tab');f.modal.onkeydown(empty);expect(empty.preventDefault).toHaveBeenCalledOnce();
  });

  it('returns focus to the composer when the opener was removed by search or navigation', () => {
    const f = fixture(), close = f.context.cwBindDialog(f.modal, '#title');
    f.focusInitial();f.opener.isConnected = false;close();
    expect(f.opener.focus).not.toHaveBeenCalled();expect(f.composer.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('recovers focus inside the dialog and falls back to its first control when the requested field is unavailable', () => {
    const f = fixture();f.title.disabled = true;f.context.cwBindDialog(f.modal, '#title');f.focusInitial();
    expect(f.document.activeElement).toBe(f.cancel);expect(f.title.focus).not.toHaveBeenCalled();
    f.document.activeElement = f.opener;f.modal.onkeydown(key('Tab', true));expect(f.document.activeElement).toBe(f.save);
    f.document.activeElement = f.opener;f.modal.onkeydown(key('Tab'));expect(f.document.activeElement).toBe(f.cancel);
  });
});
