import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { COWORK_PROFILE_JS } from '../src/server/ui-cowork-profile.js';

function fixture() {
  const agent = { id: 'atlas', name: 'Atlas', allowShell: true, allowWrites: true, useHostComputer: true };
  const cw: any = { agents: [agent], requests: [], appAccountStates: { atlas: { accounts: [{ id: 'github-own', toolkit: 'github', status: 'ACTIVE' }], requests: [{ agentId: 'atlas', status: 'accepted', appConnection: { service: 'github', name: 'GitHub', reason: 'Review repositories.' } }] } } };
  const elements: Record<string, any> = {};
  const context = createContext({ S: { cw }, URL, window: { addEventListener: vi.fn() }, document: { addEventListener: vi.fn() },
    $: (id: string) => elements[id], esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  new Script(COWORK_JS + CONNECTED_APPS_JS + COWORK_PROFILE_JS).runInContext(context);
  return { context, cw, agent, elements };
}

describe('Cowork teammate profile tools', () => {
  it('builds each grid from that teammate’s assigned apps and actual shell permission', () => {
    const u = fixture();
    u.cw.requests.push({ agentId: 'nova', status: 'open', appConnection: { service: 'instagram', name: 'Instagram' } });
    const atlas = u.context.cwProfileTools(u.agent);
    expect(atlas.map((tool: any) => tool.id)).toEqual(['app:github', 'native:browser', 'native:files', 'native:terminal']);
    expect(atlas[0].status).toBe('Connected');
    const nova = u.context.cwProfileTools({ id: 'nova', name: 'Nova', allowShell: false, useHostComputer: true });
    expect(nova.map((tool: any) => tool.id)).toEqual(['native:browser', 'native:files', 'app:instagram']);
    expect(nova.some((tool: any) => tool.service === 'github')).toBe(false);
    expect(nova.find((tool: any) => tool.service === 'instagram').connected).toBe(false);
  });

  it('supports newly assigned services without inventing a connection status', () => {
    const u = fixture();
    u.cw.appAccountStates.atlas.accounts.push({ id: 'future-app', toolkit: 'new_service', status: 'ACTIVE' });
    u.cw.appAccountStates.atlas.accounts.push({ id: 'calendar', toolkit: 'googlecalendar', status: 'INITIATED' });
    const tools = u.context.cwProfileTools(u.agent);
    expect(tools.find((tool: any) => tool.service === 'new_service').connected).toBe(true);
    expect(tools.find((tool: any) => tool.service === 'googlecalendar').status).toBe('Waiting for sign-in');
    u.cw.appAccountStates.atlas.accounts[0].disabled = true;
    expect(u.context.cwProfileTools(u.agent).find((tool: any) => tool.service === 'github').connected).toBe(false);
  });

  it('switches one contextual panel with click and arrow-key navigation', () => {
    const u = fixture();
    const html = u.context.cwProfileAppsHtml(u.agent);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
    const tools = u.context.cwProfileTools(u.agent);
    const buttons = tools.map((tool: any, index: number) => ({ id: 'cwProfileTool' + index, tabIndex: -1, focus: vi.fn(),
      attributes: { 'data-profile-tool': tool.id } as Record<string, string>,
      getAttribute(name: string) { return this.attributes[name]; }, setAttribute(name: string, value: string) { this.attributes[name] = value; },
      onclick: null as any, onkeydown: null as any,
    }));
    const action = { onclick: null as any };
    const panel = { innerHTML: '', offsetWidth: 200, classList: { remove: vi.fn(), add: vi.fn() }, setAttribute: vi.fn(), querySelector: () => action, querySelectorAll: () => [] };
    u.elements.cwInfo = { querySelectorAll: (selector: string) => selector === '[data-profile-tool]' ? buttons : [] };
    u.elements.cwProfileToolContext = panel;
    u.context.cwOpenConnections = vi.fn();
    u.context.cwOpenDesktop = vi.fn();
    u.context.cwBindProfileTools(u.agent);
    expect(panel.innerHTML).toContain('<strong>GitHub</strong>');
    buttons[1]!.onclick();
    expect(panel.innerHTML).toContain('<strong>Browser</strong>');
    expect(panel.innerHTML).not.toContain('<strong>GitHub</strong>');
    expect(buttons.filter((button: any) => button.attributes['aria-selected'] === 'true')).toHaveLength(1);
    expect(u.context.cwOpenDesktop).not.toHaveBeenCalled();
    const event = { key: 'ArrowDown', preventDefault: vi.fn() };
    buttons[0]!.onkeydown(event);
    expect(buttons[3]!.focus).toHaveBeenCalledOnce();
    expect(panel.innerHTML).toContain('<strong>Terminal</strong>');
    expect(panel.classList.add).toHaveBeenCalledWith('is-switching');
    action.onclick();
    expect(u.context.cwOpenDesktop).toHaveBeenCalledWith('atlas');
    buttons.forEach((button: any) => { button.onclick(); expect(u.cw.profileToolSelection.atlas).toBe(button.attributes['data-profile-tool']); });
  });

  it('keeps runtime errors behind a collapsed technical-details disclosure', () => {
    const u = fixture();
    u.cw.computers = [{ agentId: 'atlas', state: 'unavailable', error: 'spawn docker ENOENT', reason: 'runtime_not_installed' }];
    const html = u.context.cwComputerHtml({ ...u.agent, useHostComputer: false }, true);
    expect(html).toContain('<details class="cw-computer-technical">');
    expect(html).not.toContain('<details class="cw-computer-technical" open');
    expect(html.indexOf('spawn docker ENOENT')).toBeGreaterThan(html.indexOf('View technical details'));
    expect(html).toContain('data-action="start"');
    expect(html).toContain('data-action="stop" disabled');
    expect(html).toContain('Private computer');
  });
});
