import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_COMPAT_JS } from '../apps/mobile/src/gitu/workspace-runtime.js';

const bootstrap = readFileSync(new URL('../src/server/ui-assets/scripts/bootstrap.js', import.meta.url), 'utf8').split('  /* GITU_BINDING_UI_MOTION_JS */')[0]!;
function fixture(native = false, copyWorks = true) {
  const random = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const previous = { focus: vi.fn() }, field = { value: '', style: { cssText: '' }, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
  const document = { activeElement: previous, createElement: () => field, body: { appendChild: vi.fn() }, execCommand: vi.fn(() => copyWorks) };
  const context = createContext({ window: { crypto: random, addEventListener: vi.fn() }, navigator: {}, document });
  new Script(native ? WORKSPACE_COMPAT_JS : bootstrap).runInContext(context);
  return { context, document, previous, field };
}

describe('LAN browser compatibility', () => {
  for (const native of [false, true]) {
    it(`generates unique RFC 4122 v4 message IDs without the secure-only API (${native ? 'APK' : 'server'})`, () => {
      const { context } = fixture(native);
      const ids = new Set(Array.from({ length: 1000 }, () => context.window.crypto.randomUUID()));
      expect(ids.size).toBe(1000);
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const installed = context.window.crypto.randomUUID;
      new Script(native ? WORKSPACE_COMPAT_JS : bootstrap).runInContext(context);
      expect(context.window.crypto.randomUUID).toBe(installed);
    });
  }
  it('copies on HTTP, removes its temporary field, and restores composer focus', async () => {
    const f = fixture();
    await f.context.navigator.clipboard.writeText('Copied message');
    expect(f.field.value).toBe('Copied message');
    expect(f.document.execCommand).toHaveBeenCalledWith('copy');
    expect(f.field.remove).toHaveBeenCalledOnce();
    expect(f.previous.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it('reports an unsuccessful copy rather than claiming it succeeded', async () => {
    const f = fixture(false, false);
    await expect(f.context.navigator.clipboard.writeText('Message')).rejects.toThrow('Could not copy');
    expect(f.field.remove).toHaveBeenCalledOnce();
    expect(f.previous.focus).toHaveBeenCalledOnce();
  });
});
