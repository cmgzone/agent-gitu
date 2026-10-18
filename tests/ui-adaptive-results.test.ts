import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';

function load() {
  const toast = vi.fn(), api = vi.fn(), cwSend = vi.fn(), sendFollow = vi.fn();
  const context = createContext({
    document: { addEventListener: vi.fn() },
    window: { location: { href: 'https://gitu.example/' } },
    URL, Event, toast, api, cwSend, sendFollow,
  });
  new Script(OUTPUT_JS).runInContext(context);
  return { context, toast, api, cwSend, sendFollow };
}

describe('universal visual results', () => {
  it('composes multiple topics and visual blocks with independent tones', () => {
    const { context } = load();
    const html = context.outRenderBlock('ui', {
      title: 'Launch overview', tone: 'violet', layout: 'columns', width: 'wide', density: 'compact',
      blocks: [
        { type: 'section', title: 'Delivery', blocks: [
          { type: 'metrics', items: [{ label: 'Checks', value: '18', detail: 'Passed', tone: 'green' }] },
          { type: 'progress', label: 'Reviewed', value: 3, max: 4 },
        ] },
        { type: 'timeline', title: 'Next', tone: 'teal', items: [{ time: 'Tuesday', text: 'Design review', detail: 'Bring the latest copy.' }] },
        { type: 'callout', tone: 'amber', title: 'Decision', text: 'Choose a headline.' },
      ],
    });
    expect(html).toContain('data-out-kind="ui"');
    expect(html).toContain('data-out-tone="violet"');
    expect(html).toContain('data-out-tone="green"');
    expect(html).toContain('data-out-tone="teal"');
    expect(html).toContain('data-layout="columns"');
    expect(html).toContain('data-out-width="wide"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('Bring the latest copy.');
    expect(html).not.toContain('response-code');
  });

  it('accepts a bounded custom color and ignores CSS or attribute injection', () => {
    const { context } = load();
    expect(context.outVisualAttrs({ tone: '#E4A591' })).toContain('--out-wash:#e4a591;--out-tone:var(--text)');
    expect(context.outVisualAttrs({ tone: 'blue" onclick="alert(1)', width: 'wide" onload="bad', density: 'evil' })).toBe('');
    expect(context.outVisualAttrs({ tone: '#ffffff;background:url(https://evil.example)' })).toBe('');
    const html = context.outRenderBlock('ui', { title: '<script>x</script>', blocks: [
      { type: 'table', columns: ['Name'], rows: [['<img src=x onerror=alert(1)>']] },
      { type: 'quote', text: '<b>Quoted</b>', author: '<svg>' },
    ] });
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });

  it('applies presentation choices and safe actions to existing result kinds', () => {
    const { context } = load();
    const html = context.outRenderBlock('email', {
      tone: 'rose', messages: [{ subject: 'Review request', summary: 'Please check the copy.' }],
      actions: [
        { label: 'Draft reply', prompt: 'Draft a reply about the review request.' },
        { label: 'Inbox', url: 'https://mail.example/inbox' },
        { label: 'Unsafe', url: 'javascript:alert(1)' },
        { label: 'Secret URL', url: 'https://user:password@example.com' },
        { label: 'Invalid', execute: 'send_mail' },
      ],
    });
    expect(html).toContain('data-out-tone="rose"');
    expect(html).toContain('data-out-prompt="Draft a reply about the review request."');
    expect(html).toContain('href="https://mail.example/inbox"');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('user:password');
    expect(html).not.toContain('send_mail');
    expect(context.outRenderBlock('files', { title: 'Reading', tone: 'teal', items: [{ name: 'Report.pdf', url: '/report.pdf' }] })).toContain('download="Report.pdf"');
  });

  it('automatically widens paired sections and stacks them when explicitly requested', () => {
    const { context } = load();
    const data = { blocks: [
      { type: 'section', title: 'Option A', blocks: [{ type: 'text', text: 'A quiet option.' }] },
      { type: 'section', title: 'Option B', blocks: [{ type: 'text', text: 'A different option.' }] },
    ] };
    expect(context.outRenderBlock('ui', data)).toContain('data-layout="columns"');
    expect(context.outRenderBlock('ui', data)).toContain('data-out-width="wide"');
    expect(context.outRenderBlock('ui', { ...data, layout: 'stack' })).toContain('data-layout="stack"');
    expect(context.outRenderBlock('ui', { ...data, layout: 'stack' })).not.toContain('data-out-width="wide"');
  });

  it('keeps invalid, unknown, unfinished and overnested compositions visible as original text', () => {
    const { context } = load();
    const payloads = [
      { blocks: [{ type: 'execute', command: 'delete everything' }] },
      { blocks: [{ type: 'progress', value: 10, max: 0 }] },
      { blocks: [{ type: 'progress', value: -1, max: 10 }] },
      { blocks: [{ type: 'table', columns: ['One'], rows: [['Two', 'Three']] }] },
      { blocks: Array.from({ length: 31 }, () => ({ type: 'text', text: 'Too many' })) },
    ];
    let nested: object = { type: 'text', text: 'Deep' };
    for (let i = 0; i < 6; i++) nested = { type: 'section', blocks: [nested] };
    payloads.push({ blocks: [nested] } as typeof payloads[number]);
    for (const payload of payloads) {
      const fence = '```output ui\n' + JSON.stringify(payload) + '\n```';
      expect(context.outRenderBlocks(fence)).toBe(fence);
    }
    const partial = '```output ui\n{"blocks":[';
    expect(context.outRenderBlocks(partial)).toBe(partial);
  });
});

describe('contextual result actions', () => {
  it.each(['cowork', 'company', 'main'])('stages a request in the %s composer and preserves the draft', scope => {
    const { context, api, cwSend, sendFollow } = load();
    const input = { value: 'Existing draft', disabled: false, readOnly: false, dispatchEvent: vi.fn(), focus: vi.fn() };
    const root = { id: scope === 'cowork' ? 'cw' : '', classList: { contains: () => scope === 'company' }, querySelector: vi.fn(() => input) };
    const button = { isConnected: true, getAttribute: () => 'Draft a reply to Amina about the launch.', closest: (selector: string) => selector === (scope === 'company' ? '.company-chat' : scope === 'cowork' ? '#cw' : '.run-chat') ? root : null };
    expect(context.outStagePrompt(button)).toBe(true);
    expect(root.querySelector).toHaveBeenCalledWith(scope === 'company' ? '#companyChatText' : scope === 'cowork' ? '#cwInput' : '#follow');
    expect(input.value).toBe('Existing draft\n\nDraft a reply to Amina about the launch.');
    expect(input.dispatchEvent.mock.calls[0][0].type).toBe('input');
    expect(input.focus).toHaveBeenCalledOnce();
    expect(api).not.toHaveBeenCalled();
    expect(cwSend).not.toHaveBeenCalled();
    expect(sendFollow).not.toHaveBeenCalled();
    context.outStagePrompt(button);
    expect(input.value).toBe('Existing draft\n\nDraft a reply to Amina about the launch.');
  });

  it('rejects a detached result after switching chats, including an old expanded panel', () => {
    const { context, toast } = load();
    const original = { isConnected: false, closest: vi.fn() };
    const button = { getAttribute: () => 'A request from the previous chat', closest: () => ({ _outCard: original }) };
    expect(context.outStagePrompt(button)).toBe(false);
    expect(original.closest).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('Open the original chat to use this action.', true);
  });
});
