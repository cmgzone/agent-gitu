import type { ModelCatalog, ModelInfo } from './providers.js';

export interface ModelBrand { id: string; kind: 'lab' | 'provider'; iconUrl: string }
const aliases: Record<string, string> = { qwen: 'alibaba', gemini: 'google', codex: 'openai', chatgpt: 'openai', mistralai: 'mistral', 'meta-llama': 'meta', 'x-ai': 'xai', 'z-ai': 'zai', 'moonshot-ai': 'moonshotai' };
const routers = new Set(['openrouter', 'alibaba', 'opencode-zen', 'opencode-go', 'groq', 'together', 'fireworks', 'siliconflow', 'nvidia', 'azure']);
const offlineFamilies: Record<string, string> = { deepseek:'deepseek', qwen:'alibaba', claude:'anthropic', gpt:'openai', gemini:'google', glm:'zai', kimi:'moonshotai', grok:'xai', llama:'meta', minimax:'minimax', mistral:'mistral' };
const slug = (value: string | undefined) => { const id = (value ?? '').trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? aliases[id] ?? id : undefined; };
const apiId = (value: string) => value.toLowerCase().replace(/:free$/, '');
interface BrandIndex { exact: Map<string, Set<string>>; scoped: Map<string, string>; families: Map<string, Set<string>> }
const indexes = new WeakMap<ModelCatalog, BrandIndex>();
function brandIndex(catalog: ModelCatalog): BrandIndex {
  const cached = indexes.get(catalog); if (cached) return cached;
  const index: BrandIndex = { exact:new Map(), scoped:new Map(), families:new Map() };
  const add = (map: Map<string, Set<string>>, key: string, author: string) => { const entries = map.get(key) ?? new Set<string>(); entries.add(author); map.set(key, entries); };
  for (const [host, models] of catalog) for (const [key, meta] of models) {
    const canonical = meta.canonicalModelId, author = canonical && slug(canonical.split('/')[0]);
    if (!canonical || !author) continue;
    const id = apiId(canonical), leaf = id.split('/').at(-1)!;
    add(index.exact,id,author); add(index.exact,leaf,author);
    index.scoped.set(host+'\0'+apiId(key),author);
    const family = leaf.match(/^[a-z]+/)?.[0]; if (family) add(index.families,family,author);
  }
  indexes.set(catalog,index); return index;
}

/** Catalog author wins over routing host; identifiers remain opaque API values. */
export function modelBrandFor(catalog: ModelCatalog | undefined, providerId: string, model: ModelInfo, custom = false): ModelBrand {
  const id = apiId(model.id), leaf = id.split('/').at(-1) ?? id;
  const family = leaf.match(/^[a-z]+/)?.[0];
  const index = catalog && brandIndex(catalog), exact = index?.exact.get(id), families = family && index?.families.get(family);
  const namespace = id.includes('/') ? slug(id.split('/')[0]) : undefined;
  const owner = slug(model.ownedBy);
  const inferred = !custom && routers.has(providerId) ? families && families.size === 1 ? [...families][0] : family && offlineFamilies[family] : undefined;
  const publisher = index?.scoped.get(providerId+'\0'+id) ?? (exact?.size === 1 ? [...exact][0] : namespace ?? inferred ?? (owner && !routers.has(owner) ? owner : undefined));
  const kind = publisher ? 'lab' : 'provider';
  const brand = publisher ?? slug(providerId) ?? 'custom';
  return { id: brand, kind, iconUrl: '/api/model-icons/' + kind + '/' + brand + '.svg' };
}
