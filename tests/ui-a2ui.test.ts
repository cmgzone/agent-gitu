import { createContext, Script } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import { basicCatalog as v1BasicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';
import { UI_RESPONSE_JS } from '../src/server/ui-response.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { RICH_OUTPUT_GUIDANCE } from '../src/agent/output-style.js';
import { formatA2uiActionMessage } from '../src/client-astryx/a2ui/actionFormat.js';
import { isSafeAssetUrl } from '../src/client-astryx/a2ui/urlValidation.js';

type AnyRecord = Record<string, unknown>;
type AnyFn = (...args: unknown[]) => unknown;

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const V1_SAMPLE_MESSAGES = [
  {
    version: '1.0',
    createSurface: {
      surfaceId: 'deploy',
      catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
    },
  },
  {
    version: '1.0',
    updateDataModel: {
      surfaceId: 'deploy',
      path: '/',
      value: { env: ['staging'], notes: '' },
    },
  },
  {
    version: '1.0',
    updateComponents: {
      surfaceId: 'deploy',
      components: [
        { id: 'root', component: 'Column', children: ['title', 'submit'] },
        { id: 'title', component: 'Text', text: '## Deploy preview' },
        {
          id: 'submit',
          component: 'Button',
          variant: 'primary',
          child: 'submitLabel',
          action: {
            event: {
              name: 'deploy_confirm',
              context: { env: { path: '/env' } },
            },
          },
        },
        { id: 'submitLabel', component: 'Text', text: 'Continue' },
      ],
    },
  },
];

function stubElement(extra: AnyRecord = {}): AnyRecord {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    dataset: {},
    hidden: false,
    classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), contains: () => false },
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    getAttribute: () => null,
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => null,
    remove: vi.fn(),
    focus: vi.fn(),
    selectionStart: 0,
    disabled: false,
    ...extra,
  };
}

function loadOutputs() {
  const ctx = createContext({
    document: {
      createElement: vi.fn(() => stubElement()),
      createTextNode: vi.fn((v: string) => ({ textContent: v })),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      body: stubElement(),
      documentElement: stubElement(),
      getElementById: vi.fn(() => null),
    },
    window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    navigator: { clipboard: { writeText: vi.fn() } },
    URL,
    atob,
    console,
  });
  new Script(OUTPUT_JS).runInContext(ctx);
  return ctx as unknown as Record<string, AnyFn>;
}

function baseUiContext(extra: AnyRecord = {}): AnyRecord {
  const nodes: AnyRecord = {};
  const win: AnyRecord = { addEventListener: vi.fn(), location: { href: 'http://localhost/' } };
  return createContext({
    document: {
      createElement: vi.fn(() => stubElement()),
      createTextNode: vi.fn((v: string) => ({ textContent: v })),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
      body: stubElement(),
      documentElement: stubElement(),
      getElementById: (id: string) => (nodes[id] ||= stubElement({ id })),
    },
    window: win,
    navigator: { clipboard: { writeText: vi.fn() } },
    crypto: { randomUUID },
    URL,
    console,
    api: vi.fn().mockResolvedValue({}),
    toast: vi.fn(),
    confirm: () => true,
    esc: (s: unknown) => String(s ?? ''),
    setInterval: vi.fn(),
    clearInterval: vi.fn(),
    $: (id: string) => (nodes[id] ||= stubElement({ id })),
    ...extra,
  }) as unknown as AnyRecord;
}

describe('A2UI output blocks, Coding/Cowork parity, Option B actions, and prompt contract', () => {
  it('renders valid A2UI JSON array, {title, messages} wrapper, and JSONL into .out-a2ui-host', () => {
    const outputs = loadOutputs();

    const arrHtml = outputs.outRenderBlock('a2ui', V1_SAMPLE_MESSAGES) as string;
    expect(arrHtml).toContain('data-out-kind="a2ui"');
    expect(arrHtml).toContain('data-out-width="wide"');
    expect(arrHtml).toContain('data-a2ui-surface="1"');
    expect(arrHtml).toContain('data-a2ui-payload="');

    const wrappedHtml = outputs.outRenderBlock('a2ui', {
      title: 'Release Checklist',
      messages: V1_SAMPLE_MESSAGES,
    }) as string;
    expect(wrappedHtml).toContain('data-out-kind="a2ui"');
    expect(wrappedHtml).toContain('Release Checklist');
    expect(wrappedHtml).toContain('data-a2ui-surface="1"');

    const jsonl = V1_SAMPLE_MESSAGES.map((m) => JSON.stringify(m)).join('\n');
    const jsonlFence = ['```output a2ui', jsonl, '```'].join('\n');
    const jsonlHtml = outputs.outRenderBlocks(jsonlFence) as string;
    expect(jsonlHtml).toContain('data-out-kind="a2ui"');
    expect(jsonlHtml).toContain('data-a2ui-surface="1"');
    expect(jsonlHtml).not.toContain('```output');
  });

  it('escapes XSS sequences in data-a2ui-payload and resets claimed portal state on outOpenPanel', () => {
    const outputs = loadOutputs();
    const xssPayload = [
      {
        version: '1.0',
        createSurface: {
          surfaceId: 's1',
          catalogId: 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
        },
      },
      {
        version: '1.0',
        updateComponents: {
          surfaceId: 's1',
          components: [
            {
              id: 'root',
              component: 'Text',
              text: '</script><img src=x onerror="alert(1)"> javascript:alert(2)',
            },
          ],
        },
      },
    ];
    const html = outputs.outRenderBlock('a2ui', xssPayload) as string;
    expect(html).not.toContain('</script>');
    expect(html).not.toContain('<img ');
    expect(html).toContain('&lt;/script&gt;&lt;img');

    const clonedHost = stubElement({
      removeAttribute: vi.fn(),
      innerHTML: '<button>stale portal dom</button>',
    });
    const clonedCard = stubElement({
      querySelector: () => stubElement({ remove: vi.fn() }),
      querySelectorAll: (sel: string) =>
        sel === '[data-a2ui-surface="1"]' ? [clonedHost] : [],
    });
    const ovBody = stubElement({ firstChild: null });
    const ovTitle = stubElement();
    const ovClose = stubElement();
    const ovEl = stubElement({
      querySelector: (sel: string) => {
        if (sel === '.out-title') return ovTitle;
        if (sel === '.out-ov-body') return ovBody;
        if (sel === '[data-out-close]') return ovClose;
        return null;
      },
    });
    const ctx = createContext({
      document: {
        createElement: vi.fn(() => ovEl),
        createTextNode: vi.fn((v: string) => ({ textContent: v })),
        getElementById: vi.fn((id: string) => (id === 'out-overlay' ? ovEl : null)),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        body: stubElement(),
        documentElement: stubElement(),
      },
      window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
      navigator: { clipboard: { writeText: vi.fn() } },
      URL,
      atob,
      console,
    });
    new Script(OUTPUT_JS).runInContext(ctx);
    const sourceCard = stubElement({
      cloneNode: () => clonedCard,
      querySelector: () => ({ textContent: 'Deploy form' }),
    });
    (ctx.outOpenPanel as AnyFn)(sourceCard);
    expect(clonedHost.removeAttribute).toHaveBeenCalledWith('data-a2ui-claimed');
    expect(clonedHost.innerHTML).toContain('Loading interactive view');
  });

  it('rejects malformed, mid-stream truncated, unsupported v0.8, >50 message, and >128KB payloads cleanly', () => {
    const outputs = loadOutputs();

    expect(outputs.outRenderBlock('a2ui', '{not valid json')).toBeNull();

    // Truncated/unclosed fence stays raw text in outRenderBlocks
    const midStream = '```output a2ui\n{"version":"1.0","createSurface":{"surfaceId":"s1"}}';
    expect(outputs.outRenderBlocks(midStream)).toBe(midStream);

    // Missing createSurface
    expect(
      outputs.outRenderBlock('a2ui', [
        { version: '1.0', updateComponents: { surfaceId: 's1', components: [] } },
      ]),
    ).toBeNull();

    // Unsupported v0.8 version
    expect(
      outputs.outRenderBlock('a2ui', [
        {
          version: 'v0.8',
          createSurface: { surfaceId: 's1' },
        },
      ]),
    ).toBeNull();

    // Unrelated plain JSON object
    expect(outputs.outRenderBlock('a2ui', { hello: 'world' })).toBeNull();

    // > 50 messages
    const tooMany = [
      V1_SAMPLE_MESSAGES[0],
      ...Array.from({ length: 50 }, (_, i) => ({
        version: '1.0',
        updateDataModel: { surfaceId: 'deploy', path: `/k${i}`, value: i },
      })),
    ];
    expect(outputs.outRenderBlock('a2ui', tooMany)).toBeNull();

    // > 128 KB
    const oversized = JSON.stringify([
      V1_SAMPLE_MESSAGES[0],
      {
        version: '1.0',
        updateDataModel: {
          surfaceId: 'deploy',
          path: '/big',
          value: 'x'.repeat(132000),
        },
      },
    ]);
    expect(outputs.outRenderBlock('a2ui', oversized)).toBeNull();
  });

  it('routes output a2ui through shared outRenderBlocks on both Coding and Cowork chats', () => {
    const SPY =
      'var __outCalls = [];\nfunction outRenderBlocks(t) { __outCalls.push(String(t)); return "<<A2UI_SHARED>>"; }\n';
    const fence = ['Intro', '', '```output a2ui', JSON.stringify(V1_SAMPLE_MESSAGES), '```'].join(
      '\n',
    );

    const coding = baseUiContext();
    new Script(SPY + UI_RESPONSE_JS).runInContext(coding);
    const codingOut = (coding.renderResponseText as AnyFn)(fence) as string;

    const cowork = baseUiContext({
      S: {
        active: 'cowork',
        cw: {
          active: 'conv',
          threadId: null,
          msgs: [],
          lastSeq: 0,
          agents: [{ id: 'chief', name: 'Chief' }],
          convs: [{ id: 'conv', kind: 'group', memberIds: ['chief'] }],
        },
      },
    });
    new Script(SPY + COWORK_JS).runInContext(cowork);
    for (const fn of [
      'cwRenderMsgs',
      'cwRenderProgress',
      'cwRenderTyping',
      'cwRenderRail',
      'cwRenderInfo',
      'cwRenderChat',
      'cwPoll',
      'cwStartStream',
    ]) {
      cowork[fn] = vi.fn();
    }
    (cowork.cwEnsure as AnyFn)();
    const coworkOut = (cowork.cwBody as AnyFn)(fence, []) as string;

    expect(coding.__outCalls).toHaveLength(1);
    expect(cowork.__outCalls).toEqual(coding.__outCalls);
    expect(codingOut).toContain('<<A2UI_SHARED>>');
    expect(coworkOut).toContain('<<A2UI_SHARED>>');
  });

  it('dispatches Option B actions directly without clearing unsent Coding/Cowork drafts and closes overlay', async () => {
    // 1) Cowork direct send (cwSendText) preserves cwInput.value & pendingFiles
    const cwPostLocal = vi.fn().mockResolvedValue({});
    const coworkCtx = baseUiContext({
      modelSelectionQueue: Promise.resolve(),
      S: {
        active: 'cowork',
        cw: {
          active: 'conv-1',
          threadId: 'thread-1',
          msgs: [],
          outbox: {},
          lastSeq: 0,
          pendingFiles: [{ name: 'notes.txt', loading: false }],
          referencedMessageIds: ['msg-9'],
          agents: [{ id: 'chief', name: 'Chief' }],
          convs: [{ id: 'conv-1', kind: 'dm', memberIds: ['chief'] }],
        },
      },
    });
    new Script(COWORK_JS).runInContext(coworkCtx);
    coworkCtx.cwPostLocal = cwPostLocal;
    coworkCtx.cwRenderMsgs = vi.fn();
    (coworkCtx.$ as AnyFn)('cwInput') as AnyRecord;
    const cwInput = (coworkCtx.$ as AnyFn)('cwInput') as AnyRecord;
    cwInput.value = 'unsent cowork draft';

    const cwHost = (coworkCtx.window as AnyRecord).__gituHost as Record<string, AnyFn>;
    expect(typeof cwHost.sendCoworkText).toBe('function');
    expect(cwHost.sendCoworkText('[A2UI Action] deploy_confirm\n- env: staging')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(cwPostLocal).toHaveBeenCalledTimes(1);
    const postedEntry = cwPostLocal.mock.calls[0]?.[0] as {
      conversationId: string;
      payload: { text: string; files: unknown[]; referencedMessageIds: unknown[] };
    };
    expect(postedEntry.conversationId).toBe('conv-1');
    expect(postedEntry.payload.text).toBe('[A2UI Action] deploy_confirm\n- env: staging');
    expect(postedEntry.payload.files).toEqual([]);
    expect(postedEntry.payload.referencedMessageIds).toEqual([]);
    expect(cwInput.value).toBe('unsent cowork draft');
    expect(((coworkCtx.S as AnyRecord).cw as AnyRecord).pendingFiles).toEqual([
      { name: 'notes.txt', loading: false },
    ]);

    // 2) Settings bridge sendChatAction routes overlay/Coding/Cowork cleanly
    const settingsSrc = readFileSync(
      path.join(repoRoot, 'src', 'server', 'ui-assets', 'scripts', 'settings.js'),
      'utf8',
    );
    const bridgeIdx = settingsSrc.indexOf('(function registerSettingsHostBridge()');
    expect(bridgeIdx).toBeGreaterThan(-1);
    const bridgeScript = settingsSrc.slice(bridgeIdx);

    const followEl = stubElement({ value: 'unsent coding draft' });
    const homeSaveFollowDraft = vi.fn();
    const updateSendState = vi.fn();
    const outClosePanel = vi.fn();
    const sendFollow = vi.fn(() => {
      followEl.value = '';
    });
    const sendCoworkText = vi.fn(() => true);

    const bridgeCtx = createContext({
      window: { __gituHost: { sendCoworkText } },
      document: { getElementById: () => followEl },
      $: (id: string) => (id === 'follow' ? followEl : stubElement()),
      S: { active: 'run-42' },
      api: vi.fn(),
      toast: vi.fn(),
      persist: vi.fn(),
      effectiveProjectPath: vi.fn(),
      basename: vi.fn(),
      loadModelCatalog: vi.fn(),
      catalogModelGroups: vi.fn(),
      syncCodingPermissions: vi.fn(),
      sendFollow,
      homeSaveFollowDraft,
      updateSendState,
      outClosePanel,
    });
    new Script(bridgeScript).runInContext(bridgeCtx);
    const host = ((bridgeCtx as AnyRecord).window as AnyRecord).__gituHost as Record<
      string,
      AnyFn
    >;

    // Coding chat action preserves draft & restores storage
    const codingHostEl = {
      closest: (sel: string) => (sel === '.run-chat' ? {} : null),
    };
    expect(host.sendChatAction('[A2UI Action] check', codingHostEl)).toBe(true);
    expect(sendFollow).toHaveBeenCalledWith('[A2UI Action] check');
    expect(followEl.value).toBe('unsent coding draft');
    expect(homeSaveFollowDraft).toHaveBeenCalledWith('run-42', 'unsent coding draft');
    expect(updateSendState).toHaveBeenCalled();

    // Cowork action inside expanded #out-overlay resolves _outCard to #cw and closes panel
    const coworkCard = {
      closest: (sel: string) => (sel === '#cw' ? { id: 'cw' } : null),
    };
    const overlay = { _outCard: coworkCard };
    const overlayButtonHost = {
      closest: (sel: string) => (sel === '.out-ov' ? overlay : null),
    };
    expect(host.sendChatAction('[A2UI Action] deploy_confirm', overlayButtonHost)).toBe(true);
    expect(sendCoworkText).toHaveBeenCalledWith('[A2UI Action] deploy_confirm');
    expect(outClosePanel).toHaveBeenCalledTimes(1);
  });

  it('formats A2UI action messages safely and validates asset URLs', () => {
    const formatted = formatA2uiActionMessage({
      name: '  submit\u0007_plan  ',
      context: {
        env: 'staging\nnext',
        tags: ['api', 'db'],
        empty: undefined,
      },
    });
    expect(formatted).toBe('[A2UI Action] submit_plan\n- env: staging next\n- tags: ["api","db"]');

    const longVal = 'a'.repeat(5000);
    const capped = formatA2uiActionMessage({ name: 'save', context: { body: longVal } });
    expect(capped.length).toBe(4000);
    expect(capped.endsWith('...')).toBe(true);

    expect(isSafeAssetUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(isSafeAssetUrl('/api/files/chart.png')).toBe('/api/files/chart.png');
    expect(isSafeAssetUrl('data:image/png;base64,AAAA', { allowDataImage: true })).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(isSafeAssetUrl('data:image/png;base64,AAAA')).toBe('');
    expect(isSafeAssetUrl('javascript:alert(1)')).toBe('');
    expect(isSafeAssetUrl('data:text/html,<script>alert(1)</script>', { allowDataImage: true })).toBe('');
    expect(isSafeAssetUrl('//evil.example.com/x.png')).toBe('');
    expect(isSafeAssetUrl('https://user:pass@example.com/secret')).toBe('');
  });

  it('validates the RICH_OUTPUT_GUIDANCE A2UI v1.0 example against MessageProcessor', () => {
    const marker = 'Valid example: ';
    const idx = RICH_OUTPUT_GUIDANCE.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const after = RICH_OUTPUT_GUIDANCE.slice(idx + marker.length);
    const endIdx = after.indexOf('.\n');
    const jsonText = (endIdx > -1 ? after.slice(0, endIdx) : after).replace(/\.$/, '');
    const example = JSON.parse(jsonText) as { title: string; messages: unknown[] };

    expect(example.title).toBe('Deploy options');
    const processor = new MessageProcessor([v1BasicCatalog], undefined, {
      reportErrorsOnly: true,
    });
    const errors = processor.processMessagesWithErrors(example.messages);
    expect(errors).toEqual([]);
    const surface = processor.getSurface('deploy');
    expect(surface).toBeDefined();
    expect(surface?.componentsModel.get('root')).toBeDefined();
    processor.dispose();
  });
});
