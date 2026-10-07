import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { SUBAGENT_JS } from '../src/server/ui-subagents.js';
import { Element } from './helpers/subagent-dom.js';

function fixture() {
  const body = new Element(); body.attached = true;
  const wrap = new Element(); body.appendChild(wrap);
  const timers = new Set<() => void>();
  const cw = { active: 'dm', agents: [{ id: 'atlas', name: 'Atlas' }], convs: [{ id: 'dm', kind: 'dm', memberIds: ['atlas'] }], msgs: [
    { id: 'request', role: 'user', ts: '2026-10-07T10:00:00Z', text: 'Research the launch.' },
    { id: 'parent', role: 'agent', agentId: 'atlas', agentName: 'Atlas', ts: '2026-10-07T10:00:01Z', text: 'I am assigning the research.' },
  ], threadId: null as string | null, busy: true, progresses: [] as unknown[], subAgents: { nodes: [] as any[] } };
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const context = createContext({ S: { cw }, esc, icon: () => '<svg></svg>',
    $: (id: string) => id === 'cwMsgs' ? wrap : id === 'cwLive' ? wrap.children.at(-1) : null,
    document: { body, createElement: (tag: string) => new Element(tag), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    window: { innerWidth: 375, innerHeight: 812, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    setInterval: (fn: () => void) => { timers.add(fn); return fn; }, clearInterval: (fn: () => void) => timers.delete(fn),
    setTimeout: () => 1, clearTimeout: vi.fn(),
  });
  new Script(COWORK_JS + SUBAGENT_JS).runInContext(context);
  const render = () => { context.cwReplaceTranscript(wrap, context.cwTranscriptHtml() + '<div id="cwLive" hidden></div>'); context.cwRenderProgress(); };
  return { context, cw, body, wrap, render, timers,
    jobs: () => Object.values(context.S.cw.subagentPresences).flatMap((p: any) => Object.values(p.view.jobs)) as any[] };
}
function worker(overrides: Record<string, unknown> = {}) {
  return { id: 'worker-1', rootAgentId: 'atlas', parentAgentId: 'atlas', role: 'Market researcher', objective: 'Compare Kenyan POS competitors', status: 'running',
    createdAt: '2026-10-07T10:00:02Z', startedAt: '2026-10-07T10:00:03Z', children: [],
    activity: { phase: 'reasoning', current: 'Comparing pricing pages', contextTokens: 18400, entries: [{ seq: 1, at: '2026-10-07T10:00:04Z', text: 'Planning the research' }] }, ...overrides };
}

describe('Cowork subagent presence', () => {
  it('places the shared orbs under the parent message and excludes duplicate child progress cards', () => {
    const u = fixture(); u.cw.subAgents.nodes = [worker()]; u.cw.progresses = [{ agentId: 'worker-1', agentName: 'Market researcher', phase: 'thinking' }];
    const html = u.context.cwTranscriptHtml();
    expect(html.indexOf('I am assigning')).toBeLessThan(html.indexOf('data-cwsubagents'));
    expect(html).not.toContain('cw-tnode'); u.render();
    expect(u.wrap.querySelectorAll('.subagent-orb')).toHaveLength(1);
    expect(u.wrap.children.at(-1)!.hidden).toBe(true);
    expect(u.jobs()[0].button.dataset.phase).toBe('reasoning');
    expect(u.wrap.querySelector('.subagent-caption')!.textContent).toContain('Atlas · Subagents');
    u.context.cwDisposeSubagentOrbs();
  });
  it('keeps ring identity, deduplicates polling history, and updates the open context live', () => {
    const u = fixture(); const node = worker(); u.cw.subAgents.nodes = [node]; u.render();
    const job = u.jobs()[0], button = job.button, ring = button.querySelector('.subagent-ring');
    button.onclick();
    expect(u.body.querySelector('.subagent-peek')!.textContent).toContain('≈18.4k tokens');
    u.body.querySelector('.subagent-open')!.onclick!();
    expect(u.body.querySelector('dialog')!.open).toBe(true);
    node.activity = { ...node.activity, phase: 'tool', current: 'Checking competitor pages', entries: [...node.activity.entries, { seq: 2, at: '2026-10-07T10:00:08Z', text: 'Using web fetch' }] };
    u.render(); u.render();
    expect(u.jobs()[0].button).toBe(button); expect(button.querySelector('.subagent-ring')).toBe(ring);
    expect(button.dataset.phase).toBe('tool'); expect(job.activity).toHaveLength(2);
    expect(u.body.querySelector('dialog')!.textContent).toContain('Checking competitor pages');
    expect(u.body.querySelector('dialog')!.querySelectorAll('li')).toHaveLength(2);
    node.status = 'completed'; Object.assign(node, { finishedAt: '2026-10-07T10:00:45Z' }); u.render();
    expect(button.dataset.phase).toBe('complete'); expect(button.dataset.restored).toBe('false');
    expect(u.body.querySelector('dialog')!.textContent).toContain('42s');
    u.context.cwDisposeSubagentOrbs(); expect(u.body.querySelector('dialog')).toBeNull(); expect(u.timers.size).toBe(0);
  });
  it('restores settled workers without success replays and never presents failed evidence as green', () => {
    const u = fixture(); u.cw.subAgents.nodes = [worker({ status: 'completed', finishedAt: '2026-10-07T10:00:45Z' }), worker({ id: 'worker-2', status: 'failed' })];
    u.render(); u.render();
    expect(u.jobs().map(job => job.button.dataset.phase)).toEqual(['complete', 'failed']);
    expect(u.jobs().every(job => job.button.dataset.restored === 'true')).toBe(true);
    expect(u.wrap.querySelector('.subagent-count')!.textContent).toBe('1 done · 1 need attention');
    u.context.cwDisposeSubagentOrbs();
  });
  it('isolates threads and removes stale popups when leaving the conversation', () => {
    const u = fixture(); u.cw.subAgents.nodes = [worker(), worker({ id: 'other', threadId: 'other-thread' })]; u.render();
    expect(u.jobs().map(job => job.id)).toEqual(['worker-1']);
    u.jobs()[0].button.onclick(); u.context.cwStopPoll();
    expect(u.body.querySelector('.subagent-peek')).toBeNull(); expect(u.jobs()).toEqual([]);
    u.cw.threadId = 'other-thread'; u.render();
    expect(u.jobs().map(job => job.id)).toEqual(['other']);
    u.context.cwDisposeSubagentOrbs();
  });
  it('renders new workers immediately while phase-only snapshots preserve the transcript', () => {
    const u = fixture();
    const renderMessages = vi.fn(u.render), renderProgress = vi.fn(() => u.context.cwSyncSubagentOrbs());
    u.context.cwRenderMsgs = renderMessages; u.context.cwRenderProgress = renderProgress;
    for (const name of ['cwRenderReferences', 'cwRenderRail', 'cwRenderMembers', 'cwRenderWork', 'cwRenderTyping', 'cwRenderInfo', 'cwRenderMissionBadge', 'cwShowDesktopHandoffs']) u.context[name] = vi.fn();
    const node = worker(), snapshot = () => ({ busy: true, subAgents: { nodes: [node] } });
    u.context.cwApplySnapshot(snapshot());
    expect(renderMessages).toHaveBeenCalledOnce();
    renderProgress.mockClear();
    const button = u.jobs()[0].button;
    node.activity = { ...node.activity, phase: 'tool', current: 'Using the browser' };
    u.context.cwApplySnapshot(snapshot());
    expect(renderMessages).toHaveBeenCalledOnce(); expect(renderProgress).toHaveBeenCalledOnce();
    expect(u.jobs()[0].button).toBe(button); expect(button.dataset.phase).toBe('tool');
    u.context.cwDisposeSubagentOrbs();
  });
});
