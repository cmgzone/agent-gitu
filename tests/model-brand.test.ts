import { describe, expect, it } from 'vitest';
import { modelBrandFor } from '../src/llm/model-brand.js';
import { parseModelCatalog } from '../src/llm/providers.js';

describe('model publisher identity', () => {
  it('uses canonical publisher references for future models served through a routing host', () => {
    const catalog = parseModelCatalog({ router: { models: { 'opaque-api-id': { canonical_model_id: 'future-lab/stellar-9' } } } });
    expect(modelBrandFor(catalog, 'router', { id: 'opaque-api-id', ownedBy: 'router' })).toEqual({ id:'future-lab', kind:'lab', iconUrl:'/api/model-icons/lab/future-lab.svg' });
  });
  it('maps case-insensitive API IDs to the publisher and never changes the actual selected ID', () => {
    const catalog = parseModelCatalog({ alibaba: { models: { 'deepseek-v4-flash': { canonical_model_id: 'deepseek/deepseek-v4-flash' } } } });
    const model = Object.freeze({ id:'DeepSeek-V4-Flash', ownedBy:'alibaba' });
    expect(modelBrandFor(catalog,'alibaba',model).id).toBe('deepseek');
    expect(model.id).toBe('DeepSeek-V4-Flash');
  });
  it('learns unambiguous model families dynamically and keeps ambiguous or custom IDs separate', () => {
    const catalog = parseModelCatalog({ router: { models: { one:{canonical_model_id:'new-lab/stellar-1'}, two:{canonical_model_id:'other-lab/shared-1'}, three:{canonical_model_id:'third-lab/shared-2'} } } });
    expect(modelBrandFor(catalog,'openrouter',{id:'stellar-99'}).id).toBe('new-lab');
    expect(modelBrandFor(catalog,'openrouter',{id:'shared-99'}).kind).toBe('provider');
    expect(modelBrandFor(catalog,'custom',{id:'stellar-99'},true).kind).toBe('provider');
  });
  it('keeps explicit namespaces and uses safe fallbacks offline', () => {
    expect(modelBrandFor(undefined,'openrouter',{id:'new-author/release'}).id).toBe('new-author');
    expect(modelBrandFor(undefined,'alibaba',{id:'DeepSeek-V4-Flash'}).id).toBe('deepseek');
    expect(modelBrandFor(undefined,'bad/../../host',{id:'unknown',ownedBy:'https://secret.test'}).iconUrl).toBe('/api/model-icons/provider/custom.svg');
  });
});
