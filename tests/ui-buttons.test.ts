import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { UI_BUTTON_JS } from '../src/server/ui-buttons.js';

function controls() {
  const context = createContext({
    document: { body: { nodeType: 1, matches: () => false, querySelectorAll: () => [] } },
    MutationObserver: class { observe() {} }, icon: (name: string) => `<svg data-icon="${name}"></svg>`,
  });
  new Script(UI_BUTTON_JS).runInContext(context);
  function button(text: string, existing = false) {
    return { textContent: text, matches: () => false, querySelector: () => existing ? { tagName: 'svg', setAttribute: vi.fn() } : null,
      getAttribute: () => null, setAttribute: vi.fn(), insertAdjacentHTML: vi.fn() };
  }
  return { context, button };
}

describe('Button icon decoration', () => {
  it('leaves plain labels and model names alone instead of adding a generic arrow', () => {
    const f = controls();
    for (const label of ['Chat', 'Qwen3.8-Max', 'Personality', 'Preferences']) {
      const button = f.button(label); f.context.decorateActionButton(button);
      expect(button.insertAdjacentHTML).not.toHaveBeenCalled();
      expect(button.textContent).toBe(label);
    }
  });

  it('retains useful action icons and does not duplicate an explicit icon', () => {
    const f = controls(), save = f.button('Save'), cancel = f.button('Cancel'), explicit = f.button('Chat', true);
    f.context.decorateActionButton(save); f.context.decorateActionButton(cancel); f.context.decorateActionButton(explicit);
    expect(save.insertAdjacentHTML).toHaveBeenCalledWith('afterbegin', expect.stringContaining('data-icon="check"'));
    expect(cancel.insertAdjacentHTML).toHaveBeenCalledWith('afterbegin', expect.stringContaining('data-icon="x"'));
    expect(explicit.insertAdjacentHTML).not.toHaveBeenCalled();
  });

  it('keeps the widget focus backdrop visually empty', () => {
    const f = controls(), backdrop = f.button('');
    backdrop.matches = (...selectors: string[]) => selectors[0]?.split(',').includes('.cw-widget-backdrop') ?? false;
    backdrop.getAttribute = () => 'Close widgets';
    f.context.decorateActionButton(backdrop);
    expect(backdrop.insertAdjacentHTML).not.toHaveBeenCalled();
  });
});
