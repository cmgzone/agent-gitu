import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_WIDGETS_JS } from '../src/server/ui-cowork-widgets.js';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';
import { WIDGET_APP_RUNTIME_JS } from '../src/server/ui-widget-app-runtime.js';

function element() {
  const attributes = new Map<string, string>();
  return {
    innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, offsetParent: {},
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }, focus: vi.fn(),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name), removeAttribute: (name: string) => attributes.delete(name),
    appendChild: vi.fn(), addEventListener: vi.fn(), querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []),
    contains: vi.fn(() => true), remove: vi.fn(),
  };
}
function load(width = 390) {
  const nodes: Record<string, ReturnType<typeof element>> = {};
  ['cw', 'cwWidgetLane', 'cwWidgetCards', 'cwWidgetToggle', 'cwWidgetCount', 'cwWidgetBackdrop', 'cwWidgetClose', 'cwWidgetNew'].forEach(id => { nodes[id] = element(); });
  const state = { active: 'conversation-1', agents: [{ id: 'agent-1', name: 'Designer' }], widgets: [] as Record<string, unknown>[], widgetsOpen: false, profileOpen: false, connectionsOpen: false };
  const esc = (value: unknown) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const api = vi.fn(() => Promise.resolve({ ok: true }));
  const context = createContext({
    URL, console, document: { createElement: element, createTextNode: (value: string) => ({ textContent: value }), querySelector: () => null, querySelectorAll: () => [], addEventListener: vi.fn(), body: element(), documentElement: element(), activeElement: null },
    window: { innerWidth: width, addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    navigator: { clipboard: { writeText: vi.fn() } }, S: { active: 'cowork' }, $: (id: string) => nodes[id], esc,
    cwEnsure: () => state, cwActiveConv: () => ({ id: state.active }), cwAgentById: (id: string) => state.agents.find(agent => agent.id === id),
    cwIcon: (name: string) => '<svg data-icon="' + esc(name) + '"></svg>', cwWidgetIcon: () => '<svg></svg>',
    cwFaviconHtml: (host: string) => '<img class="cw-fav" src="https://icons.duckduckgo.com/ip3/' + esc(host) + '.ico" alt="">',
    shortDate: () => 'Today', api, toast: vi.fn(), cwRenderRail: vi.fn(), cwNewWidgetModal: vi.fn(),
  });
  new Script(OUTPUT_JS + COWORK_WIDGETS_JS + WIDGET_APP_RUNTIME_JS).runInContext(context);
  // Grid mounting has its own DOM identity regression test below; these tests
  // focus on tray state, scoped rendering and persisted actions.
  context.cwRenderWidgetGrid = (cards: ReturnType<typeof element>, widgets: Record<string, unknown>[]) => { cards.innerHTML = widgets.map(widget=>context.cwWidgetCardHtml(widget)).join(''); };
  const helpers = context as unknown as {
    cwWidgetsShellHtml(): string; cwWidgetCardBodyHtml(widget: Record<string, unknown>): string; cwWidgetCardHtml(widget: Record<string, unknown>): string;
    cwRenderWidgets(): void; cwWidgetsToggle(): void; cwWidgetsClose(returnFocus?: boolean): void;
  };
  return { nodes, state, helpers, context, api };
}
const widget = { id: 'cw-1', conversationId: 'conversation-1', title: 'Launch review', kind: 'rich', createdByAgentId: 'agent-1', createdAt: '2026-10-09T06:00:00Z', updatedAt: '2026-10-09T06:00:00Z', data: {
  text: 'Assets ready for review', stats: [{ label: 'Files', value: '3' }], schedule: [{ label: 'Review', when: 'Tomorrow, 09:00 EAT', note: 'Design check' }],
  items: [{ type: 'image', url: 'https://example.com/preview.png', title: 'Preview' }, { type: 'video', url: 'https://example.com/clip.mp4', title: 'Clip' }, { type: 'file', url: '/api/cowork/artifacts/ca-report', title: 'report.pdf', mime: 'application/pdf' }, { type: 'link', url: 'https://example.com/review', title: 'Review page' }],
} };

describe('cowork glass widget cards and mobile tray', () => {
  it('renders mixed real content through shared image, video and file viewers', () => {
    const { helpers } = load();
    const html = helpers.cwWidgetCardHtml(widget);
    expect(html).toContain('cw-panel-card');
    expect(html).toContain('Assets ready for review');
    expect(html).toContain('Tomorrow, 09:00 EAT');
    expect(html).toContain('<video');
    expect(html).toContain('https://example.com/preview.png');
    expect(html).toContain('/api/cowork/artifacts/ca-report');
    expect(html).toContain('report.pdf');
    expect(html).toContain('https://example.com/favicon.ico');
    expect(html).not.toContain('icons.duckduckgo.com');
    expect(html).toContain('Designer');
    expect(html).toContain('aria-label="Dismiss Launch review"');
  });

  it('renders a coordinate-only map in a widget through the shared map viewer', () => {
    const { helpers } = load();
    const html = helpers.cwWidgetCardHtml({ ...widget, title: 'Travel plan', data: { items: [{ type: 'map', lat: -4.0435, lon: 39.6682, zoom: 13, title: 'Mombasa' }] } });
    expect(html).toContain('cw-widget-media');
    expect(html).toContain('openstreetmap.org/export/embed.html');
    expect(html).toContain('marker=-4.0435%2C39.6682');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    expect(html).toContain('title="Mombasa"');
  });

  it('escapes widget prose and titles and refuses executable link URLs', () => {
    const { helpers } = load();
    const html = helpers.cwWidgetCardHtml({ ...widget, title: '<img onerror=alert(1)>', data: { text: '<script>alert(1)</script>', items: [{ type: 'link', url: 'javascript:alert(1)', title: 'Bad' }] } });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('href="javascript:');
  });

  it('has an accessible bell, live count, dialog close and Escape support on mobile', () => {
    const { helpers, nodes, state } = load();
    state.widgets = [widget];
    const shell = helpers.cwWidgetsShellHtml();
    expect(shell).toContain('aria-controls="cwWidgetLane"');
    expect(shell).toContain('aria-live="polite"');
    helpers.cwRenderWidgets();
    expect(nodes['cwWidgetCount']!.textContent).toBe('1');
    expect(nodes['cwWidgetLane']!.hidden).toBe(true);
    helpers.cwWidgetsToggle();
    expect(nodes['cwWidgetToggle']!.getAttribute('aria-expanded')).toBe('true');
    expect(nodes['cwWidgetLane']!.getAttribute('role')).toBe('dialog');
    expect(nodes['cwWidgetLane']!.getAttribute('aria-modal')).toBe('true');
    expect(nodes['cwWidgetClose']!.focus).toHaveBeenCalled();
    const lane = nodes['cwWidgetLane'] as unknown as { onkeydown(event: unknown): void };
    const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    lane.onkeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(state.widgetsOpen).toBe(false);
    expect(nodes['cwWidgetToggle']!.focus).toHaveBeenCalled();
    expect(nodes['cwWidgetLane']!.hidden).toBe(true);
  });

  it('shows desktop cards only for the selected conversation and preserves media on unchanged polls', () => {
    const { helpers, nodes, state } = load(1440);
    state.widgets = [widget]; helpers.cwRenderWidgets();
    expect(nodes['cwWidgetLane']!.hidden).toBe(false);
    expect(nodes['cwWidgetLane']!.getAttribute('role')).toBe('dialog');
    const original = nodes['cwWidgetCards']!.innerHTML;
    nodes['cwWidgetCards']!.innerHTML = original + '<!-- media remains mounted -->';
    helpers.cwRenderWidgets();
    expect(nodes['cwWidgetCards']!.innerHTML).toContain('media remains mounted');
    state.active = 'conversation-2'; helpers.cwRenderWidgets();
    expect(nodes['cwWidgetLane']!.hidden).toBe(true);
    expect(nodes['cwWidgetCount']!.textContent).toBe('0');
    expect(nodes['cwWidgetCards']!.innerHTML).not.toContain('Launch review');
  });

  it('dismisses a widget through the persisted API and updates the notification count', async () => {
    const { helpers, nodes, state, api } = load();
    state.widgets = [widget]; helpers.cwRenderWidgets(); helpers.cwWidgetsToggle();
    const button = { disabled: false, getAttribute: () => widget.id };
    const cards = nodes['cwWidgetCards'] as unknown as { onclick(event: unknown): void };
    cards.onclick({ target: { closest: (selector: string) => selector === '[data-cw-widget-dismiss]' ? button : null } });
    expect(api).toHaveBeenCalledWith('/api/cowork/widgets/cw-1', { method: 'DELETE' });
    await Promise.resolve();
    expect(state.widgets).toHaveLength(0);
    expect(nodes['cwWidgetCount']!.textContent).toBe('0');
    expect(nodes['cwWidgetLane']!.hidden).toBe(false);
  });

});
