import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { UI_MODEL_CATALOG_JS } from '../src/server/ui-model-catalog.js';

const provider = (ids: string[]) => ({
  id: 'test-provider', label: 'Test', usable: true, defaultModel: 'configured-default',
  models: ids.map((id) => ({ id })),
});



describe('model catalog loading and provider filtering', () => {
  function harness(api: () => Promise<unknown>) {
    const context = {
      S: { models: [provider(['old'])], modelsLoaded: false }, api,
      $: () => null, ensureUsableModelSelection: () => {}, syncModelLabel: () => {}, updateModelMeta: () => {},
      providerIsUsable: (p: { usable: boolean }) => p.usable,
      modelSearchText: (p: { id: string }, m: { id: string }) => p.id + ' ' + m.id,
      esc: String,
    };
    const helpers = runInNewContext(UI_MODEL_CATALOG_JS + '\n({ loadModelCatalog, catalogModelGroups, catalogSelectOptions });', context);
    return { context, helpers };
  }

  it('deduplicates concurrent loads and updates the shared snapshot for every selector', async () => {
    let resolve!: (value: unknown) => void;
    let calls = 0;
    const response = new Promise((r) => { resolve = r; });
    const { context, helpers } = harness(() => { calls++; return response; });
    const first = helpers.loadModelCatalog();
    const second = helpers.loadModelCatalog();
    expect(first).toBe(second);
    resolve({ providers: [provider(['new'])] });
    await first;
    expect(calls).toBe(1);
    expect(context.S.models[0]?.models[0]?.id).toBe('new');
    expect(helpers.catalogSelectOptions('test-provider', 'new')).toContain('value="new" selected');
    expect(helpers.catalogSelectOptions(undefined, '')).toContain('test-provider::new');
  });

  it('prevents a pre-credential-refresh request overwriting newer models', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    const { context, helpers } = harness(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const old = helpers.loadModelCatalog();
    const fresh = helpers.loadModelCatalog(true);
    resolvers[1]!({ providers: [provider(['fresh'])] });
    await fresh;
    resolvers[0]!({ providers: [provider(['stale'])] });
    await old;
    expect(context.S.models[0]?.models[0]?.id).toBe('fresh');
  });

  it('keeps the last catalog on failure and allows retry', async () => {
    let calls = 0;
    const { context, helpers } = harness(async () => {
      if (++calls === 1) throw new Error('offline');
      return { providers: [provider(['retry'])] };
    });
    await expect(helpers.loadModelCatalog()).rejects.toThrow('offline');
    expect(context.S.models[0]?.models[0]?.id).toBe('old');
    await helpers.loadModelCatalog();
    expect(context.S.models[0]?.models[0]?.id).toBe('retry');
  });

  it('filters by provider identity, not model prefixes, and preserves setup restrictions', () => {
    const { context, helpers } = harness(async () => ({}));
    context.S.models = [
      { ...provider(['vendor/shared']), id: 'openrouter' },
      { ...provider(['vendor/shared', 'private-model']), id: 'custom-lab' },
      { ...provider(['locked']), id: 'openai', usable: false },
    ];
    expect(helpers.catalogSelectOptions('openrouter', '')).not.toContain('private-model');
    expect(helpers.catalogSelectOptions('custom-lab', '')).toContain('private-model');
    expect(helpers.catalogSelectOptions('', '')).toBe('');
    expect(helpers.catalogSelectOptions(undefined, '')).toContain('openai::locked');
    expect(helpers.catalogModelGroups(undefined, '', true).map((g: { p: { id: string } }) => g.p.id)).toEqual(['openrouter', 'custom-lab']);
  });

  it('has one API loader and shared options for Specialists and Cowork', () => {
    expect(UI_HTML.match(/api\('\/api\/models'\)/g)).toHaveLength(1);
    expect(UI_HTML).toContain("catalogSelectOptions(undefined, sel)");
    expect(UI_HTML).toContain('catalogSelectOptions(pid, d.model, query)');
    expect(() => new Function(UI_HTML.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
  });
});
