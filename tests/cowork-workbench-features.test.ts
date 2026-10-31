import { createContext, Script } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const nodes: Record<string, any> = {};
  function makeNode(id = ''): any {
    const children: any[] = [];
    const attrs: Record<string, string> = {};
    return {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      hidden: true,
      disabled: false,
      selectionStart: 0,
      selectionEnd: 0,
      scrollHeight: 48,
      style: { height: '' },
      children,
      onclick: null as null | ((e?: any) => unknown),
      onchange: null as null | ((e?: any) => unknown),
      oninput: null as null | ((e?: any) => unknown),
      onkeydown: null as null | ((e?: any) => unknown),
      focus: vi.fn(),
      remove: vi.fn(),
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      getAttribute: (k: string) => attrs[k] || '',
      appendChild: vi.fn((c: any) => children.push(c)),
      querySelectorAll: (_sel: string) => [],
      querySelector: (sel: string) => {
        const key = sel.replace(/^#/, '');
        return (nodes[key] ||= makeNode(key));
      },
    };
  }
  const input = (nodes.cwInput = makeNode('cwInput'));
  nodes.cwSlashMenu = makeNode('cwSlashMenu');
  nodes.cwPlusContext = makeNode('cwPlusContext');
  nodes.cwContextBar = makeNode('cwContextBar');
  nodes.cwWorkbench = makeNode('cwWorkbench');
  nodes.cwReferences = makeNode('cwReferences');
  nodes.cwMentions = makeNode('cwMentions');

  const keyListeners: Array<(e: any) => void> = [];
  const api = vi.fn().mockResolvedValue({});
  const copy = vi.fn().mockResolvedValue(undefined);
  const toast = vi.fn();

  const cw = {
    active: 'conv-1',
    selectedAgentId: 'atlas',
    threadId: null,
    msgs: [
      { id: 'm-user', seq: 1, role: 'user', text: 'Inspect src/llm/providers.ts and https://docs.deepseek.com/vision', ts: '2026-10-30T10:00:00Z' },
      { id: 'm-agent', seq: 2, role: 'agent', agentId: 'atlas', agentName: 'Atlas', text: 'Updated `src/llm/providers.ts` and verified against https://api-docs.deepseek.com/guides/vision/.', ts: '2026-10-30T10:01:00Z' },
    ],
    workHistory: [
      { id: 'step-1', tool: 'read_file', ok: true, agentName: 'Atlas', ts: '2026-10-30T10:00:20Z', publicUpdate: 'Reading provider model config.' },
      { id: 'step-2', tool: 'run_command', ok: false, agentName: 'Atlas', ts: '2026-10-30T10:00:40Z', publicUpdate: 'Initial test run failed.' },
    ],
    requests: [
      { id: 'req-1', status: 'open', kind: 'permission', title: 'Approve production deploy', detail: 'Needs confirmation' },
    ],
    missions: [
      { id: 'mis-1', conversationId: 'conv-1', title: 'Vision verification', status: 'running', summary: 'Validating 3 paths' },
    ],
    todos: [
      { id: 'todo-1', text: 'Check DeepSeek Pro text-only guard', status: 'blocked', agentId: 'atlas' },
      { id: 'todo-2', text: 'Write unit tests', status: 'completed', agentId: 'atlas' },
    ],
    threads: [{ id: 'th-1', title: 'Vision Thread', topic: 'DeepSeek Flash' }],
    agents: [
      { id: 'atlas', name: 'Atlas', model: 'deepseek-flash', provider: 'deepseek', tagline: 'Lead Engineer' },
      { id: 'nova', name: 'Nova', model: 'claude-sonnet-4-5', provider: 'anthropic', tagline: 'Reviewer' },
    ],
    convs: [{ id: 'conv-1', title: 'Atlas', kind: 'dm', memberIds: ['atlas'] }],
  };

  const context = createContext({
    S: { active: 'cowork', cw },
    window: {
      innerWidth: 1440,
      addEventListener: vi.fn((type: string, fn: (e: any) => void) => {
        if (type === 'keydown') keyListeners.push(fn);
      }),
    },
    document: {
      addEventListener: vi.fn(),
      querySelector: () => null,
      createElement: () => makeNode('modal'),
      body: { appendChild: vi.fn() },
    },
    navigator: { clipboard: { writeText: copy } },
    crypto: { randomUUID },
    URL,
    $: (id: string) => nodes[id],
    api,
    toast,
    confirm: () => true,
    esc: (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    clearInterval: vi.fn(),
    setInterval: vi.fn(),
  });

  new Script(COWORK_JS).runInContext(context);
  context.cwEnsure();
  return { context, cw: context.S.cw, nodes, input, api, copy, toast, keyListeners };
}

describe('Cowork 6 next-gen UI features', () => {
  it('1. Slash menu & Ctrl+K Command Palette filter commands, teammates, and execute slash actions', () => {
    const u = fixture();
    u.input.value = '/pu';
    u.context.cwUpdateSlashMenu();
    expect(u.nodes.cwSlashMenu.hidden).toBe(false);
    expect(u.nodes.cwSlashMenu.innerHTML).toContain('/pulse');

    // Run /handoff slash command
    expect(u.context.cwRunSlashCommand('/handoff')).toBe(true);
    expect(u.input.value).toContain('@Nova Handoff request');

    // Run /compare slash command
    expect(u.context.cwRunSlashCommand('/compare')).toBe(true);
    expect(u.input.value).toContain('@Atlas @Nova Compare approaches');

    // Ctrl+K opens Command Palette
    const paletteItems = u.context.cwCommandPaletteItems('nova');
    expect(paletteItems.some((item: any) => item.kind === 'Teammate' && item.title === 'Nova')).toBe(true);

    const preventDefault = vi.fn();
    u.keyListeners.forEach((fn) => fn({ ctrlKey: true, key: 'k', preventDefault }));
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('2. Side-by-Side Live Workbench opens messages, tracks revisions, and computes line diffs', () => {
    const u = fixture();
    // Agent message action menu includes Open in Workbench
    const actionsHtml = u.context.cwMessageActionsHtml(u.cw.msgs[1]);
    expect(actionsHtml).toContain('data-cwaction="workbench"');
    expect(actionsHtml).toContain('Open in Workbench');

    // Open message in Workbench via cwMessageAction
    u.context.cwMessageAction('workbench', 'm-agent');
    expect(u.cw.workbench.open).toBe(true);
    expect(u.cw.workbench.items).toHaveLength(1);
    expect(u.nodes.cwWorkbench.hidden).toBe(false);
    expect(u.nodes.cwWorkbench.innerHTML).toContain('Updated `src/llm/providers.ts`');

    // Push a second revision and verify line diff
    u.context.cwOpenWorkbench({ title: 'Revision 2', content: 'Updated `src/llm/pi-native.ts`' });
    expect(u.cw.workbench.items).toHaveLength(2);
    const diff = u.context.cwComputeLineDiff('line 1\nold line', 'line 1\nnew line');
    expect(diff).toContain('- old line');
    expect(diff).toContain('+ new line');
  });

  it('3. Live Context, Token & Cost Meter Pill renders inside the + menu (#cwPlusContext) and uses real Cowork usage & catalog pricing when available', () => {
    const u = fixture();
    // Fallback estimation before any turn has run
    const fallbackUsage = u.context.cwEstimateContextUsage();
    expect(fallbackUsage.tokens).toBeGreaterThan(0);
    expect(fallbackUsage.maxTokens).toBe(128000);
    expect(fallbackUsage.isReal).toBe(false);
    expect(fallbackUsage.modelLabel).toBe('deepseek-flash');

    // Wire real S.models catalog metadata and real Cowork snapshot usage
    u.context.S.models = [
      {
        id: 'deepseek',
        models: [
          {
            id: 'deepseek-flash',
            metadata: {
              displayName: 'DeepSeek V4.1 Flash',
              contextTokens: 64000,
              inputPricePerMillion: 0.14,
              outputPricePerMillion: 0.28,
              cachedInputPricePerMillion: 0.014,
            },
          },
        ],
      },
    ];
    u.cw.usage = {
      provider: 'deepseek',
      model: 'deepseek-flash',
      contextWindow: 64000,
      inputTokens: 16000,
      outputTokens: 2000,
      cachedTokens: 4000,
      contextTokens: 16000,
      turns: 2,
      costUsd: 0.0425,
      budgetMaxCostUsd: 2.5,
    };

    const liveUsage = u.context.cwEstimateContextUsage();
    expect(liveUsage.isReal).toBe(true);
    expect(liveUsage.tokens).toBe(16000);
    expect(liveUsage.maxTokens).toBe(64000);
    expect(liveUsage.percent).toBe(25);
    expect(liveUsage.costUsd).toBe(0.0425);
    expect(liveUsage.costFormatted).toBe('$0.04');
    expect(liveUsage.budgetMaxCostUsd).toBe(2.5);
    expect(liveUsage.modelLabel).toBe('DeepSeek V4.1 Flash');

    u.context.cwRenderContextMeter();
    expect(u.nodes.cwPlusContext.hidden).toBe(false);
    expect(u.nodes.cwPlusContext.innerHTML).toContain('16.0k/64k tok · 25% · $0.04');
    expect(u.nodes.cwPlusContext.innerHTML).toContain('Live Cowork usage (DeepSeek V4.1 Flash)');
    expect(u.nodes.cwPlusContext.innerHTML).toContain('Spend: $0.04 / $2.50 budget');
    expect(COWORK_JS).toContain('data-cwplus="workbench"');
    expect(COWORK_JS).toContain('data-cwplus="pulse"');
    expect(COWORK_JS).toContain('data-cwplus="compact"');
    expect(COWORK_JS).toContain('data-cwplus="palette"');

    // /compact prefills a professional emoji-free checkpoint prompt
    u.context.cwRunSlashCommand('/compact');
    expect(u.input.value).toContain('Completed, In Progress, Blocked, Failed, Pending, Requires Approval');
  });

  it('4. Grounded Citation Chips extract file paths and web domains from agent replies without leaking raw tool names', () => {
    const u = fixture();
    const citations = u.context.cwExtractCitations(u.cw.msgs[1]);
    expect(citations).toEqual([
      { kind: 'Web', label: 'api-docs.deepseek.com', target: 'https://api-docs.deepseek.com/guides/vision/' },
      { kind: 'File', label: 'src/llm/providers.ts', target: 'src/llm/providers.ts' },
    ]);

    const bubbleHtml = u.context.cwBubbleHtml(u.cw.msgs[1]);
    expect(bubbleHtml).toContain('class="cw-citations"');
    expect(bubbleHtml).toContain('api-docs.deepseek.com');
    expect(bubbleHtml).toContain('src/llm/providers.ts');
  });

  it('5. Visual Timeline & Step Replay Branching renders Branch buttons on work history steps and quotes step context', () => {
    const u = fixture();
    const historyHtml = u.context.cwWorkHistoryHtml(u.cw.workHistory);
    expect(historyHtml).toContain('data-cwbranch-step="0"');
    expect(historyHtml).toContain('Branch</button>');

    u.input.value = '';
    u.context.cwBranchFromStep(0);
    expect(u.input.value).toContain('[Branch from step: Ran workspace command (Failed) — "Initial test run failed."]');
  });

  it('6. Proactive Pulse Digest summarizes items using strictly emoji-free professional status labels', () => {
    const u = fixture();
    const digest = u.context.cwBuildPulseDigest();
    expect(digest.counts).toEqual({
      'Requires Approval': 1,
      'Blocked': 1,
      'In Progress': 1,
      'Failed': 1,
      'Pending': 0,
      'Completed': 2,
    });

    const modal = u.context.cwOpenPulseModal();
    expect(modal.innerHTML).toContain('Pulse Operational Digest');
    expect(modal.innerHTML).toContain('Requires Approval');
    expect(modal.innerHTML).toContain('Blocked');
    expect(modal.innerHTML).toContain('In Progress');
    expect(modal.innerHTML).toContain('Failed');
    expect(modal.innerHTML).toContain('Completed');
    // Verify no emojis are used in the Pulse report
    expect(modal.innerHTML).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
