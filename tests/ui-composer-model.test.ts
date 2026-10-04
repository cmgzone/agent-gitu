import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { modelBrandFor } from '../src/llm/model-brand.js';

function fixture(value: string, ownedBy?: string) {
  const label = { innerHTML: '' }, pick = { title: '', setAttribute() {} };
  const model = { value };
  const context = createContext({
    S: { modelsLoaded: true, sel: { model: value } },
    $: (id: string) => ({ model, modelLabel: label, modelPick: pick })[id as 'model'],
    prettyModelName: (name: string) => name,
    modelInfo: () => ({ ownedBy, brand: modelBrandFor(undefined, value.split('::')[0]!, { id: value.split('::')[1]!, ownedBy }) }),
    esc: (text: string) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  });
  const start = UI_HTML.indexOf('  function modelLabelText('), end = UI_HTML.indexOf('  function modelSearchText(', start);
  new Script(UI_HTML.slice(start, end)).runInContext(context);
  return { context, label, pick, model };
}

describe('Compact composer model identity', () => {
  it('shows the model name and its catalog owner icon while preserving the complete API selection', () => {
    const ui = fixture('openrouter::alibaba/qwen3.8-max', 'qwen');
    ui.context.syncModelLabel();
    expect(ui.label.innerHTML).toContain('/api/model-icons/lab/alibaba.svg');
    expect(ui.label.innerHTML).toContain('<span class="model-short-name">qwen3.8-max</span>');
    expect(ui.pick.title).toBe('Model: qwen3.8-max');
    expect(ui.model.value).toBe('openrouter::alibaba/qwen3.8-max');
    expect(ui.context.S.sel.model).toBe(ui.model.value);
  });
  it('uses explicit namespaces or the known provider and never guesses ownership from a display name', () => {
    expect(fixture('openrouter::anthropic/claude-sonnet').context.modelBrandHtml('openrouter::anthropic/claude-sonnet')).toContain('/lab/anthropic.svg');
    expect(fixture('alibaba::qwen3.8-max').context.modelBrandHtml('alibaba::qwen3.8-max')).toContain('/lab/alibaba.svg');
    expect(fixture('alibaba::DeepSeek-V4-Flash').context.modelBrandHtml('alibaba::DeepSeek-V4-Flash')).toContain('/lab/deepseek.svg');
    expect(fixture('openrouter::unknown/qwen-copy').context.modelBrandHtml('openrouter::unknown/qwen-copy')).toContain('/lab/unknown.svg');
    expect(fixture('custom::unknown-model').context.modelBrandHtml('custom::unknown-model')).toContain('model-brand-fallback');
  });
  it('rejects injected icon URLs and never exposes arbitrary remote hosts', () => {
    const ui = fixture('custom::safe');
    const html = ui.context.modelBrandHtml('custom::safe', { brand: { id: '<script>', iconUrl: 'https://private-host.test/key' } });
    expect(html).not.toContain('private-host');
    expect(html).not.toContain('<script>');
    expect(html).toContain('model-brand-fallback');
  });
  it('escapes custom model names and keeps a failed icon from removing the label', () => {
    const ui = fixture('custom::<script>alert(1)</script>');
    ui.context.syncModelLabel();
    expect(ui.label.innerHTML).not.toContain('<script>');
    expect(ui.label.innerHTML).toContain('script&gt;');
    expect(ui.label.innerHTML).toContain('model-short-name');
  });
});
