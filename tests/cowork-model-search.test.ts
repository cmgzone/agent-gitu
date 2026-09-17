import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { UI_MODEL_CATALOG_JS } from '../src/server/ui-model-catalog.js';

function harness() {
  const element = (value = '') => ({ value, innerHTML: '', textContent: '', disabled: false, oninput: () => {}, onchange: () => {} });
  const elements = {
    '#cwAmProv': element('custom-lab'),
    '#cwAmModel': element('old-model'),
    '#cwAmModelSearch': element(),
    '#cwAmModelCount': element(),
  };
  const state = {
    models: [
      { id: 'custom-lab', models: [{ id: 'old-model' }, { id: 'other-model' }] },
      { id: 'other-provider', models: [{ id: 'foreign-model' }] },
    ],
  };
  let refreshed = state.models;
  const context = {
    S: state, d: { model: 'old-model' },
    modal: { isConnected: true, querySelector: (id: keyof typeof elements) => elements[id] },
    esc: (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
    modelSearchText: (p: { id: string }, m: { id: string }) => (p.id + ' ' + m.id).toLowerCase(),
    api: async () => ({ providers: refreshed }),
    $: () => null, ensureUsableModelSelection: () => {}, syncModelLabel: () => {}, updateModelMeta: () => {},
    toast: () => {},
  };
  // Execute the actual modal event wiring, including its asynchronous catalog refresh.
  const start = UI_HTML.indexOf("    var provSel = modal.querySelector('#cwAmProv');");
  const end = UI_HTML.indexOf("    modal.querySelector('#cwAmCancel').onclick", start);
  if (start < 0 || end < 0) throw new Error('Cowork picker wiring not found');
  const controls = runInNewContext(UI_MODEL_CATALOG_JS + UI_HTML.slice(start, end) +
    '\n({ refresh: function () { return loadModelCatalog(true).then(fillModels); } });', context);
  return { elements, context, controls, setRefreshed: (models: typeof state.models) => { refreshed = models; } };
}

describe('Cowork model search', () => {
  it('exposes an accessible search input associated with the model select', () => {
    expect(UI_HTML).toMatch(/<input type="text" id="cwAmModelSearch"[^>]*aria-controls="cwAmModel"/);
    expect(UI_HTML).toContain('id="cwAmModelCount" class="meta" role="status" aria-live="polite"');
    expect(() => new Function(UI_HTML.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
  });

  it('filters client-side without losing the current selection or mixing providers', () => {
    const { elements } = harness();
    elements['#cwAmModelSearch'].value = ' OTHER ';
    elements['#cwAmModelSearch'].oninput();
    expect(elements['#cwAmModel'].innerHTML).toContain('value="other-model"');
    expect(elements['#cwAmModel'].innerHTML).toContain('old-model (current selection)');
    expect(elements['#cwAmModel'].innerHTML).not.toContain('foreign-model');
    expect(elements['#cwAmModelCount'].textContent).toBe('1 model match · current selection kept');
  });

  it('filters newly discovered models after a provider catalog refresh', async () => {
    const { elements, controls, setRefreshed } = harness();
    elements['#cwAmModelSearch'].value = 'newly-added';
    elements['#cwAmModelSearch'].oninput();
    expect(elements['#cwAmModelCount'].textContent).toContain('No models match');
    setRefreshed([
      { id: 'custom-lab', models: [{ id: 'old-model' }, { id: 'newly-added' }] },
      { id: 'other-provider', models: [{ id: 'newly-added-foreign' }] },
    ]);
    await controls.refresh();
    expect(elements['#cwAmModel'].innerHTML).toContain('value="newly-added"');
    expect(elements['#cwAmModel'].innerHTML).not.toContain('newly-added-foreign');
    expect(elements['#cwAmModelSearch'].value).toBe('newly-added');
    expect(elements['#cwAmModelCount'].textContent).toContain('1 model match');
  });

  it('clears the query and choice on provider switch and disables search for server default', () => {
    const { elements, context } = harness();
    elements['#cwAmModelSearch'].value = 'old-model';
    elements['#cwAmProv'].value = 'other-provider';
    elements['#cwAmProv'].onchange();
    expect(elements['#cwAmModelSearch'].value).toBe('');
    expect(context.d.model).toBe('');
    expect(elements['#cwAmModel'].innerHTML).toContain('foreign-model');
    expect(elements['#cwAmModel'].innerHTML).not.toContain('old-model');
    elements['#cwAmProv'].value = '';
    elements['#cwAmProv'].onchange();
    expect(elements['#cwAmModelSearch'].disabled).toBe(true);
    expect(elements['#cwAmModelCount'].textContent).toBe('Choose a provider to search models');
  });
});
