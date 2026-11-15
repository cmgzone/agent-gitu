import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_CLEAN_ACTIVITY_CSS, COWORK_CLEAN_ACTIVITY_JS } from '../src/server/ui-cowork-activity.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { summarizeParams } from '../src/util.js';

function activity(withWorkingBubble = false) {
  const state = { busy: true, progresses: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[], workHistory: [] as unknown[] };
  const summary = { focus: vi.fn() };
  const history = { open: false, scrollIntoView: vi.fn(), querySelector: () => summary };
  const elements: Record<string, any> = {
    cwCleanActivity: { hidden: true }, cwCleanStatus: { hidden: true },
    cwCleanLabel: { textContent: '' }, cwCleanDetails: { hidden: true, textContent: '', onclick: null },
    cwMsgs: { querySelectorAll: () => [history], scrollHeight: 1000, scrollTop: 100, clientHeight: 500 },
  };
  if (withWorkingBubble) { elements.cwWorkingBubble = { hidden: true }; elements.cwWorkingLabel = { textContent: '' }; }
  const context = createContext({ cwEnsure: () => state, $: (id: string) => elements[id], cwToolProgressText: () => 'Checking the relevant files…', cwVisibleReply: (text: string) => text || '' });
  new Script(COWORK_CLEAN_ACTIVITY_JS).runInContext(context);
  return { state, elements, context, history, summary };
}

describe('Cowork clean activity', () => {
  it('updates the translucent bubble from live tool activity without exposing private details', () => {
    const u = activity(true);
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(false);
    expect(u.elements.cwWorkingLabel.textContent).toBe('Working on your request…');
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
    u.state.progresses = [{ tool: 'read_file', params: 'private-path', reasoning: 'private reasoning' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Checking the relevant files…');
    u.context.cwToolProgressText = () => 'Updating the requested files…';
    u.state.progresses = [{ tool: 'write_file', params: 'private-path' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Updating the requested files…');
    expect(u.elements.cwMsgs.scrollTop).toBe(100);
  });

  it('gives way to public streamed replies and disappears when work stops', () => {
    const u = activity(true);
    u.state.progresses = [{ phase: 'responding', text: '' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Writing a reply…');
    u.state.progresses[0].text = 'Here is the comparison.';
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(true);
    expect(u.elements.cwWorkingLabel.textContent).toBe('');
    u.state.busy = false;
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
  });

  it('keeps failures truthful and puts unanswered requests near the input', () => {
    const u = activity(true);
    u.state.progresses = [{ tool: 'read_file', toolOk: false }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('A step failed');
    u.state.requests = [{ status: 'open' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(true);
    expect(u.elements.cwCleanStatus.hidden).toBe(false);
    expect(u.elements.cwCleanLabel.textContent).toBe('Waiting for your response');
  });

  it('shows a short fallback before the first progress event and disappears when idle', () => {
    const u = activity();
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(false);
    expect(u.elements.cwCleanLabel.textContent).toBe('Working on your request…');
    expect(u.elements.cwCleanDetails.hidden).toBe(true);
    u.state.busy = false;
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
  });

  it('uses a public tool category without exposing parameters, reasoning, or live reply text', () => {
    const u = activity();
    u.state.progresses = [{ agentId: 'one', tool: 'read_file', params: 'secret-path', reasoning: 'private reasoning', text: 'Long reply' }, { agentId: 'two', tool: 'read_file' }, { agentId: 'one', tool: 'read_file' }];
    expect(u.context.cwCleanActivityText()).toBe('Checking the relevant files… · 2 teammates');
  });

  it('makes an unresolved question visible even when the agent is idle', () => {
    const u = activity();
    u.state.busy = false;
    u.state.requests = [{ status: 'open' }];
    expect(u.context.cwCleanActivityText()).toBe('Waiting for your response');
    u.state.requests = [{ status: 'accepted' }];
    expect(u.context.cwCleanActivityText()).toBe('');
  });

  it('opens the latest work history on demand and keeps it available when work stops', () => {
    const u = activity();
    u.state.busy = false;
    u.state.workHistory = [{}, {}];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanStatus.hidden).toBe(true);
    expect(u.elements.cwCleanDetails.textContent).toBe('Work details · 2');
    expect(u.history.open).toBe(false);
    u.elements.cwCleanDetails.onclick();
    expect(u.history.open).toBe(true);
    expect(u.summary.focus).toHaveBeenCalledOnce();
  });

  it('reports a failed step without claiming the task succeeded', () => {
    const u = activity();
    u.state.progresses = [{ agentId: 'one', tool: 'read_file', toolOk: false }];
    expect(u.context.cwCleanActivityText()).toBe('A step failed');
  });

  it('keeps the fallback working bubble hidden while streamed status text is visible during tool execution', () => {
    const u = activity();
    const working = { hidden: false, textContent: '' };
    const workingLabel = { hidden: false, textContent: '' };
    const msgs = { scrollHeight: 100, scrollTop: 100, clientHeight: 100 };
    Object.assign(u.elements, { cwWorkingBubble: working, cwWorkingLabel: workingLabel, cwMsgs: msgs });
    u.context.cwVisibleReply = (raw: string) => String(raw ?? '').trim();

    u.state.progresses = [{ agentId: 'one', phase: 'working', text: 'Working…' }];
    u.context.cwRenderCleanActivity();
    expect(working.hidden).toBe(false);
    expect(workingLabel.textContent).toBe('Working on your request…');

    u.state.progresses = [{ agentId: 'one', phase: 'working', tool: 'read_file', text: 'Checking package.json to inspect the build scripts…' }];
    u.context.cwRenderCleanActivity();
    expect(working.hidden).toBe(true);
    expect(u.elements.cwCleanStatus.hidden).toBe(false);
    expect(u.elements.cwCleanLabel.textContent).toBe('Checking the relevant files…');
  });

  it('renders escaped, redacted text updates without working animations or secret leaks', () => {
    const state = {
      active: 'c1',
      activeThreadId: 't1',
      busy: true,
      agents: [{ id: 'a1', name: 'P.A<script>', avatar: { shape: 'dot-orb', color: '#ff6b57' } }],
      todos: [{ agentId: 'a1', status: 'in_progress', text: 'Verify pull request status' }],
      progresses: [] as Record<string, unknown>[],
      requests: [],
      workHistory: [],
    };
    const elements: Record<string, any> = {
      cwCleanActivity: { hidden: true }, cwCleanStatus: { hidden: true }, cwCleanLabel: { textContent: '' }, cwCleanDetails: { hidden: true, textContent: '', onclick: null },
      cwWorkingBubble: { hidden: true }, cwWorkingLabel: { textContent: '' },
      cwWorkingLead: { hidden: false, innerHTML: 'stale', _cwSig: 'stale' },
      cwWorkingStage: { hidden: true, innerHTML: '', _cwSig: '' },
      cwWorkingElapsed: { hidden: true, textContent: '' },
      cwTeamStrip: { hidden: false, innerHTML: 'stale', _cwSig: 'stale', onclick: null },
      cwWorkReceipt: { hidden: true, innerHTML: '', _cwSig: '', onclick: null },
      cwMsgs: { scrollHeight: 100, scrollTop: 100, clientHeight: 100 },
    };
    const context = createContext({
      document: {},
      cwEnsure: () => state,
      $: (id: string) => elements[id],
      cwAgentById: (id: string) => state.agents.find((a) => a.id === id),
      cwVisibleReply: (text: string) => text || '',
    });
    new Script(COWORK_CLEAN_ACTIVITY_JS).runInContext(context);

    state.progresses = [{ agentId: 'a1', agentName: 'P.A<script>', phase: 'thinking' }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingBubble.hidden).toBe(false);
    expect(elements.cwWorkingLabel.textContent).toBe('Working on: Verify pull request status');
    expect(elements.cwWorkingLead.hidden).toBe(true);
    expect(elements.cwWorkingLead.innerHTML).toBe('');
    expect(elements.cwTeamStrip.hidden).toBe(true);
    expect(elements.cwWorkingStage.hidden).toBe(true);

    state.progresses = [{ agentId: 'a1', agentName: 'P.A<script>', tool: 'github_list_prs', appService: 'github', detail: 'src/secret-token.ts && cat .env' }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toBe('Using github…');
    expect(elements.cwWorkingStage.hidden).toBe(false);
    expect(elements.cwWorkingStage.innerHTML).toContain('Working on: Verify pull request status');
    expect(elements.cwWorkingStage.innerHTML).toContain('Using github…');

    state.progresses = [{ agentId: 'a1', agentName: 'P.A<script>', tool: 'web_fetch', webUrl: 'https://docs.github.com/en/private/repo?token=supersecret' }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toBe('Fetching docs.github.com…');
    expect(elements.cwWorkingStage.hidden).toBe(false);
    expect(elements.cwWorkingStage.innerHTML).toContain('P.A&lt;script&gt;');
    expect(elements.cwWorkingStage.innerHTML).toContain('Using github…');
    expect(elements.cwWorkingStage.innerHTML).toContain('docs.github.com');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('cw-conn-packet');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('cw-conn-bridge');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('cw-stage-ava');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('<script>');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('secret-token');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('.env');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('supersecret');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('/en/private');

    state.progresses = [{ agentId: 'a1', agentName: 'P.A<script>', tool: 'run_command', detail: '$ curl -H "Authorization: Bearer my-secret" https://api.example.com?token=abc' }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toContain('Running:');
    expect(elements.cwWorkingLabel.textContent).toContain('https://api.example.com');
    expect(elements.cwWorkingLabel.textContent).not.toContain('my-secret');
    expect(elements.cwWorkingLabel.textContent).not.toContain('abc');

    state.progresses = [{ agentId: 'a1', agentName: 'P.A<script>', tool: 'mcp_notion_search', mcpServer: 'Notion<img onerror=1>' }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingStage.innerHTML).toContain('Notion&lt;img onerror=1&gt;');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('<img onerror=1>');
  });

  it('formats real Cowork tool summaries into readable live text updates via cwToolProgressText', () => {
    const fnStart = COWORK_JS.indexOf('  function cwRedactActivityDetail(');
    const fnEnd = COWORK_JS.indexOf('\n\n  /** thinking / reasoning', fnStart);
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);

    const state = { active: 'c1', activeThreadId: 'main', busy: true, progresses: [] as Record<string, unknown>[], requests: [], workHistory: [] };
    const elements: Record<string, any> = {
      cwCleanActivity: { hidden: true }, cwCleanStatus: { hidden: true }, cwCleanLabel: { textContent: '' }, cwCleanDetails: { hidden: true, textContent: '', onclick: null },
      cwWorkingBubble: { hidden: true }, cwWorkingLabel: { textContent: '' },
      cwWorkingLead: { hidden: true, innerHTML: '', _cwSig: '' }, cwWorkingStage: { hidden: true, innerHTML: '', _cwSig: '' }, cwWorkingElapsed: { hidden: true, textContent: '' },
      cwTeamStrip: { hidden: true, innerHTML: '', _cwSig: '', onclick: null }, cwWorkReceipt: { hidden: true, innerHTML: '', _cwSig: '', onclick: null },
      cwMsgs: { scrollHeight: 100, scrollTop: 100, clientHeight: 100 },
    };
    const context = createContext({ cwEnsure: () => state, $: (id: string) => elements[id], cwVisibleReply: (text: string) => text || '' });
    new Script(COWORK_JS.slice(fnStart, fnEnd)).runInContext(context);
    new Script(COWORK_CLEAN_ACTIVITY_JS).runInContext(context);

    state.progresses = [{ agentId: 'a1', agentName: 'Jelly', tool: 'read_file', detail: summarizeParams('read_file', { path: 'src/server/ui-cowork.ts' }) }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toBe('Reading src/server/ui-cowork.ts…');

    state.progresses = [{ agentId: 'a1', agentName: 'Jelly', tool: 'run_command', detail: summarizeParams('run_command', { command: 'npm test' }) }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toBe('Running: npm test');

    state.progresses = [{ agentId: 'a1', agentName: 'Jelly', tool: 'search_web', detail: summarizeParams('search_web', { query: 'pikpam oauth docs' }) }];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingLabel.textContent).toBe('Searching web: "pikpam oauth docs"');

    expect(elements.cwWorkingStage.innerHTML).toContain('✓');
    expect(elements.cwWorkingStage.innerHTML).toContain('Reading src/server/ui-cowork.ts…');
    expect(elements.cwWorkingStage.innerHTML).toContain('Searching web: &quot;pikpam oauth docs&quot;');
  });

  it('renders plain-text multi-agent updates inline and shows a static completion receipt', () => {
    const state = {
      active: 'g1',
      activeThreadId: 'main',
      busy: true,
      agents: [
        { id: 'pa', name: 'P.A' },
        { id: 'forge', name: 'Forge' },
      ],
      progresses: [] as Record<string, unknown>[],
      requests: [],
      workHistory: [],
    };
    const elements: Record<string, any> = {
      cwCleanActivity: { hidden: true }, cwCleanStatus: { hidden: true }, cwCleanLabel: { textContent: '' }, cwCleanDetails: { hidden: true, textContent: '', onclick: null },
      cwWorkingBubble: { hidden: true }, cwWorkingLabel: { textContent: '' },
      cwWorkingLead: { hidden: true, innerHTML: '', _cwSig: '' }, cwWorkingStage: { hidden: true, innerHTML: '', _cwSig: '' }, cwWorkingElapsed: { hidden: true, textContent: '' },
      cwTeamStrip: { hidden: true, innerHTML: '', _cwSig: '', onclick: null }, cwWorkReceipt: { hidden: true, innerHTML: '', _cwSig: '', onclick: null },
      cwMsgs: { scrollHeight: 100, scrollTop: 100, clientHeight: 100 },
    };
    const context = createContext({
      document: {},
      cwEnsure: () => state,
      $: (id: string) => elements[id],
      cwActiveConv: () => ({ id: 'g1', kind: 'group', memberIds: ['pa', 'forge'] }),
      cwAgentById: (id: string) => state.agents.find((a) => a.id === id),
      cwToolProgressText: (p: any) => (p.tool === 'message_teammate' ? 'Coordinating with Forge…' : 'Editing src/server.ts…'),
      cwVisibleReply: (text: string) => text || '',
    });
    new Script(COWORK_CLEAN_ACTIVITY_JS).runInContext(context);

    state.progresses = [
      { agentId: 'pa', agentName: 'P.A', tool: 'message_teammate' },
      { agentId: 'forge', agentName: 'Forge', tool: 'write_file', detail: 'write src/server.ts' },
    ];
    context.cwRenderCleanActivity();
    expect(elements.cwTeamStrip.hidden).toBe(true);
    expect(elements.cwWorkingStage.hidden).toBe(false);
    expect(elements.cwWorkingStage.innerHTML).toContain('P.A');
    expect(elements.cwWorkingStage.innerHTML).toContain('Coordinating with Forge…');
    expect(elements.cwWorkingStage.innerHTML).toContain('Forge');
    expect(elements.cwWorkingStage.innerHTML).toContain('Editing src/server.ts…');
    expect(elements.cwWorkingStage.innerHTML).not.toContain('cw-collab-arrow');
    expect(elements.cwWorkReceipt.hidden).toBe(true);

    state.busy = false;
    state.progresses = [];
    context.cwRenderCleanActivity();
    expect(elements.cwWorkingBubble.hidden).toBe(true);
    expect(elements.cwWorkReceipt.hidden).toBe(false);
    expect(elements.cwWorkReceipt.innerHTML).toContain('2 teammates finished');

    elements.cwWorkReceipt.onclick({ target: { closest: (sel: string) => sel === '[data-cw-receipt-toggle]' } });
    expect(elements.cwWorkReceipt.innerHTML).toContain('Hide steps');
    elements.cwWorkReceipt.onclick({ target: { closest: (sel: string) => sel === '[data-cw-receipt-dismiss]' } });
    expect(elements.cwWorkReceipt.hidden).toBe(true);
  });

  it('exports calm text-update styles without keyframe working animations', () => {
    expect(COWORK_CLEAN_ACTIVITY_CSS).toContain('.cw .cw-live-row .cw-meta { display:flex;');
    expect(COWORK_CLEAN_ACTIVITY_CSS).toContain('.cw .cw-live-row .cw-progress-activity :is(.cw-phase-dot,.spinner,.thinking-waves) { display:none; }');
    expect(COWORK_CLEAN_ACTIVITY_CSS).toContain('.cw .cw-live-row .cw-progress-text:not(:empty)::after { display:none; }');
    expect(COWORK_CLEAN_ACTIVITY_CSS).toContain('.cw-work-lead, .cw-working-dot, .cw-team-strip { display:none; }');
    expect(COWORK_CLEAN_ACTIVITY_CSS).not.toContain('@keyframes');
  });
});
