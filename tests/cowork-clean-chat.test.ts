import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { COWORK_CSS, COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const cw: any = {
    agents: [{ id: 'pa', name: 'P.A', avatar: { color: '#ff6b57', shape: 'dot-orb' } }],
    convs: [{ id: 'dm', kind: 'dm', title: 'P.A', memberIds: ['pa'] }],
    active: 'dm',
    msgs: [],
    requests: [],
    workHistory: [],
    subAgents: { nodes: [] },
    messageLocks: {},
    outbox: {},
  };
  const context = createContext({
    S: { active: 'cowork', cw },
    $: () => null,
    esc: (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    cwEnsure: () => cw,
    cwActiveConv: () => cw.convs[0],
    cwConvMembers: () => cw.agents,
    cwAgentById: (id: string) => cw.agents.find((a: any) => a.id === id) || null,
    cwAva: (a: any) => '<div class="cw-ava" data-agent="' + (a?.name || '') + '"></div>',
    cwIcon: (n: string) => '<svg data-ico="' + n + '"></svg>',
    cwTime: () => '10:15 AM',
    cwFilesHtml: () => '',
    cwPhotoCardsHtml: () => '',
    cwChatMediaHtml: () => '',
    cwChatImageParts: (text: string) => ({ text, images: [] }),
    chatQuestionHtml: (req: any) => '<div class="chat-q">' + req.title + '</div>',
    cardRequestPresentation: (req: any) => ({ title: req.title, detail: req.detail || '', technical: '' }),
    cardTechnicalDetails: () => '',
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    document: { addEventListener: () => {}, querySelectorAll: () => [], getElementById: () => null },
    navigator: {},
    Date,
    Math,
    JSON,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
  });
  new Script(COWORK_JS).runInContext(context);
  return { cw, context };
}

describe('Clean low-noise Cowork chat transcript', () => {
  it('hides routine internal system receipts and wakeups while preserving real errors, coding task links, and email notices', () => {
    const f = fixture();
    f.cw.msgs = [
      { id: 'u1', role: 'user', text: 'Check my inbox', ts: '2026-11-20T08:00:00Z' },
      { id: 's1', role: 'system', text: 'Question answered: Ship & debug my code projects.', ts: '2026-11-20T08:00:05Z' },
      { id: 's2', role: 'system', text: 'Permission approved: Allow shell.', ts: '2026-11-20T08:00:06Z' },
      { id: 's3', role: 'system', text: 'The user responded to your question "Focus": Code. Continue from that decision.', ts: '2026-11-20T08:00:07Z' },
      { id: 's4', role: 'system', text: 'The user connected gmail (account acc-1) for you. Immediately inspect read-only context...', ts: '2026-11-20T08:00:08Z' },
      { id: 's5', role: 'system', text: 'The user removed the recommendation card.', ts: '2026-11-20T08:00:09Z' },
      { id: 's6', role: 'system', text: 'Inbox — task from @P.A: Review docs.', ts: '2026-11-20T08:00:10Z' },
      { id: 's7', role: 'system', text: 'Error: provider rate limit exceeded.', ts: '2026-11-20T08:00:11Z' },
      { id: 's8', role: 'system', text: 'Main Agent Gitu started coding. [View task](#run=run-42)', ts: '2026-11-20T08:00:12Z' },
      { id: 's9', role: 'system', text: 'NEW EMAIL NOTIFICATION.\n{"mailbox":"Work","from":"boss@co.com","subject":"Launch"}', ts: '2026-11-20T08:00:13Z' },
    ];
    const html = f.context.cwTranscriptHtml();
    expect(html).toContain('Check my inbox');
    expect(html).not.toContain('Question answered:');
    expect(html).not.toContain('Permission approved:');
    expect(html).not.toContain('The user responded to your question');
    expect(html).not.toContain('The user connected gmail');
    expect(html).not.toContain('The user removed the recommendation');
    expect(html).not.toContain('Inbox — task from @P.A');
    // Important user-facing notices stay visible.
    expect(html).toContain('provider rate limit exceeded');
    expect(html).toContain('data-main-coding-task="run-42"');
    expect(html).toContain('New email received');
  });

  it('collapses resolved requests to 1-line pills, hides dismissed cards, and keeps open cards interactive', () => {
    const f = fixture();
    f.cw.msgs = [{ id: 'a1', role: 'agent', agentId: 'pa', agentName: 'P.A', text: 'Ready.', ts: '2026-11-20T08:00:00Z' }];
    f.cw.requests = [
      { id: 'r1', agentId: 'pa', kind: 'question', title: 'Choose region', status: 'answered', response: 'Europe', createdAt: '2026-11-20T08:01:00Z', resolvedAt: '2026-11-20T08:01:05Z' },
      { id: 'r2', agentId: 'pa', kind: 'recommendation', title: 'Connect Slack', status: 'dismissed', createdAt: '2026-11-20T08:02:00Z', resolvedAt: '2026-11-20T08:02:05Z' },
      { id: 'r3', agentId: 'pa', kind: 'permission', title: 'Allow shell', status: 'denied', createdAt: '2026-11-20T08:03:00Z', resolvedAt: '2026-11-20T08:03:05Z' },
      { id: 'r4', agentId: 'pa', kind: 'question', title: 'Deploy now?', status: 'open', options: ['Yes', 'Later'], createdAt: '2026-11-20T08:04:00Z' },
    ];
    const html = f.context.cwTranscriptHtml();
    expect(html).toContain('class="cw-resolved-pill" data-cwresolved-request="r1"');
    expect(html).toContain('Answered');
    expect(html).toContain('Choose region: Europe');
    expect(html).not.toContain('Connect Slack');
    expect(html).toContain('class="cw-resolved-pill is-denied" data-cwresolved-request="r3"');
    expect(html).toContain('Declined');
    expect(html).toContain('data-cwrequest-row="r4"');
    expect(html).toContain('Deploy now?');
  });

  it('renders checkpoint reports collapsed by default and groups consecutive same-speaker messages within 5 minutes', () => {
    const f = fixture();
    f.cw.msgs = [
      { id: 'u1', role: 'user', text: 'First line', ts: '2026-11-20T08:00:00Z' },
      { id: 'u2', role: 'user', text: 'Second quick follow-up', ts: '2026-11-20T08:01:00Z' },
      { id: 'a1', role: 'agent', agentId: 'pa', agentName: 'P.A', text: 'Working on it.', ts: '2026-11-20T08:01:30Z' },
      { id: 'a2', role: 'agent', agentId: 'pa', agentName: 'P.A', text: 'All done!', ts: '2026-11-20T08:02:00Z' },
      { id: 'a3', role: 'agent', agentId: 'pa', agentName: 'P.A', text: 'Much later update.', ts: '2026-11-20T08:20:00Z' },
      { id: 'cp1', role: 'system', agentId: 'pa', agentName: 'P.A', text: '', ts: '2026-11-20T08:21:00Z', checkpoint: { accomplished: 'Verified build and tests', next: 'Deploy' } },
    ];
    const html = f.context.cwTranscriptHtml();
    // u2 and a2 are grouped; u1, a1, and a3 (18 min later) are not.
    expect(html).toMatch(/class="cw-row me" data-cwentrance="u1"/);
    expect(html).toMatch(/class="cw-row cw-grouped me" data-cwentrance="u2"/);
    expect(html).toMatch(/class="cw-row" data-cwentrance="a1"/);
    expect(html).toMatch(/class="cw-row cw-grouped" data-cwentrance="a2"/);
    expect(html).toMatch(/class="cw-row" data-cwentrance="a3"/);
    // Checkpoint is rendered as a collapsed <details class="cw-checkpoint-report cw-checkpoint-compact">
    expect(html).toContain('<details class="cw-checkpoint-report cw-checkpoint-compact"');
    expect(html).not.toContain('<details class="cw-checkpoint-report cw-checkpoint-compact" open');
    // CSS includes hover-reveal timestamps/actions and hidden "You" label on user bubbles.
    expect(COWORK_CSS).toContain('.cw-row.me .cw-meta .nm { display: none; }');
    expect(COWORK_CSS).toContain('.cw-row.cw-grouped .cw-meta { display: none; }');
  });
});
