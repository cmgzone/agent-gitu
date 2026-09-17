import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { UI_MODEL_CATALOG_JS } from '../src/server/ui-model-catalog.js';

function functionSource(name: string, next: string): string {
  const start = UI_HTML.indexOf('function ' + name + '(');
  const end = UI_HTML.indexOf('function ' + next + '(', start);
  if (start < 0 || end < 0) throw new Error('Missing UI function: ' + name);
  return UI_HTML.slice(start, end);
}

const provider = (ids: string[]) => ({
  id: 'test-provider', label: 'Test', usable: true, defaultModel: 'configured-default',
  models: ids.map((id) => ({ id })),
});

function renderMenus(chatProvider: ReturnType<typeof provider>, settingsProvider = chatProvider) {
  const list = { innerHTML: '', querySelector: () => null };
  const wrap = {
    getAttribute: () => '0',
    querySelector: (selector: string) => selector === '.model-list' ? list : { value: '', textContent: '' },
  };
  const context = {
    S: { models: [chatProvider], sel: { model: '' } }, prov: [settingsProvider], wrap,
    providerIsUsable: () => true, modelSearchText: (_p: unknown, m: { id: string }) => m.id,
    esc: String, titleCase: String, isFreeModelId: () => false, modelMetaText: () => '', markMatch: String,
  };
  const result = runInNewContext(
    UI_MODEL_CATALOG_JS +
    functionSource('modelOptionsHtml', 'modelLabelText') +
    functionSource('modelMenuGroups', 'renderModelMenu') +
    functionSource('pmRender', 'pickProvModel') +
    '\npmRender(wrap); ({ chat: modelMenuGroups("")[0].models.map(m => m.id), select: modelOptionsHtml() });', context,
  );
  return { ...result, settings: list.innerHTML };
}

describe('shared model selector regression', () => {
  it('renders the same discovered model with identical API snapshots', () => {
    const result = renderMenus(provider(['newly-discovered']));
    expect(result.chat).toContain('newly-discovered');
    expect(result.settings).toContain('test-provider::newly-discovered');
  });

  it('Settings reads the shared catalog even when its provider card captured older rows', () => {
    const result = renderMenus(provider(['newly-discovered']), provider(['offline-seed']));
    expect(result.chat).toContain('newly-discovered');
    expect(result.settings).toContain('test-provider::newly-discovered');
    expect(result.settings).not.toContain('test-provider::offline-seed');
  });

  it('never synthesizes options outside the resolved catalog in the hidden Chat select', () => {
    const result = renderMenus(provider(['newly-discovered']));
    expect(result.select).not.toContain('test-provider::configured-default');
    expect(result.chat).not.toContain('configured-default');
    expect(result.settings).not.toContain('test-provider::configured-default');
  });
});
