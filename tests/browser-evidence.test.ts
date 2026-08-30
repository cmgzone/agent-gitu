import { describe, expect, it } from 'vitest';
import type { ActionRecord, TaskLedgerData } from '../src/types.js';
import type { BrowserBridge } from '../src/browser/browser.js';
import { collectBrowserEvidence, formatBrowserEvidence } from '../src/browser/evidence.js';
import { uiVisualGate } from '../src/agent/ui-gate.js';

function stubBridge(page: Record<string, unknown>, opts: { evaluate?: boolean; consoleErrors?: string[] } = {}): BrowserBridge {
  return {
    available: () => true,
    state: () => ({ available: true, url: 'http://localhost:5173/', title: 'Test Page', canBack: false, canForward: false, loading: false }),
    navigate: async () => ({ available: true, url: 'http://localhost:5173/', title: 'Test Page', canBack: false, canForward: false, loading: false }),
    screenshot: async () => ({ pngBase64: 'x'.repeat(300), state: { available: true, url: '', title: '', canBack: false, canForward: false, loading: false } }),
    ...(opts.evaluate === false
      ? {}
      : {
          evaluate: async () => page,
        }),
    ...(opts.consoleErrors !== undefined ? { consoleErrors: () => opts.consoleErrors! } : {}),
  } as BrowserBridge;
}

const CLEAN_PAGE = {
  readyState: 'complete',
  viewport: { w: 1440, h: 900 },
  scrollWidth: 1440,
  horizontalOverflow: false,
  dom: { buttons: 7, links: 14, inputs: 3, images: 8 },
  a11y: { unlabeledInputs: 0, buttonsWithoutNames: 0, imagesWithoutAlt: 0 },
  layout: { zeroSize: 0, outsideViewport: 0 },
  styles: { clippedText: 0, invisibleInteractive: 0 },
  controls: [
    { role: 'button', name: 'Save record', selector: 'button.save', region: 'form#record "Edit record"', destination: 'submit /records/7' },
  ],
  samples: [],
};

describe('collectBrowserEvidence — non-visual eyes', () => {
  it('collects structured evidence with no findings on a healthy page', async () => {
    const evidence = await collectBrowserEvidence(stubBridge(CLEAN_PAGE, { consoleErrors: [] }));
    expect(evidence.collected).toBe(true);
    expect(evidence.dom.buttons).toBe(7);
    expect(evidence.layout.horizontalOverflow).toBe(false);
    expect(evidence.findings).toHaveLength(0);
    const digest = formatBrowserEvidence(evidence);
    expect(digest).toContain('BROWSER EVIDENCE');
    expect(digest).toContain('interactive controls (1 sampled)');
    expect(digest).toContain('button "Save record" @ form#record "Edit record"');
    expect(digest).toContain('findings: none');
    expect(digest).toContain('highFindings=0');
  });

  it('derives a high-severity finding from horizontal overflow', async () => {
    const page = { ...CLEAN_PAGE, scrollWidth: 1872, layout: { ...CLEAN_PAGE.layout, horizontalOverflow: true } };
    const evidence = await collectBrowserEvidence(stubBridge(page));
    expect(evidence.layout.horizontalOverflow).toBe(true);
    expect(evidence.findings.some((f) => f.finding === 'horizontal-overflow' && f.severity === 'high')).toBe(true);
  });

  it('derives high-severity findings from console errors and page samples', async () => {
    const page = {
      ...CLEAN_PAGE,
      a11y: { unlabeledInputs: 1, buttonsWithoutNames: 0, imagesWithoutAlt: 0 },
      layout: { zeroSize: 1, outsideViewport: 0 },
      samples: [{ finding: 'zero-size-interactive', severity: 'high', selector: 'button.cta', detail: '0x0' }],
    };
    const evidence = await collectBrowserEvidence(stubBridge(page, { consoleErrors: ['Uncaught TypeError: x is not a function'] }));
    expect(evidence.findings.some((f) => f.finding === 'console-errors' && f.severity === 'high')).toBe(true);
    expect(evidence.findings.some((f) => f.finding === 'zero-size-interactive')).toBe(true);
    const digest = formatBrowserEvidence(evidence);
    expect(digest).toContain('!! high');
    expect(digest).toContain('highFindings=2');
  });

  it('reports honestly when the bridge cannot run page probes', async () => {
    const evidence = await collectBrowserEvidence(stubBridge(CLEAN_PAGE, { evaluate: false }));
    expect(evidence.collected).toBe(false);
    expect(formatBrowserEvidence(evidence)).toContain('not collected');
  });
});

// ── UI gate: screenshots for vision, structured evidence for text-only ───

function uiLedger(actions: Partial<ActionRecord>[]): TaskLedgerData {
  const now = Date.now();
  const rec = (i: number, a: Partial<ActionRecord>): ActionRecord => ({
    id: `a${i}`,
    stepId: undefined,
    tool: a.tool ?? 'browse',
    paramsHash: `h${i}`,
    paramsSummary: a.paramsSummary ?? 'browse evidence',
    status: a.status ?? 'success',
    createdAt: a.createdAt ?? new Date(now + i * 1000).toISOString(),
    ...(a.observation !== undefined ? { observation: a.observation } : {}),
  });
  return {
    schemaVersion: 1,
    taskId: 't',
    goal: 'build ui',
    status: 'running',
    mode: 'standard',
    project: {} as TaskLedgerData['project'],
    acceptanceCriteria: [],
    constraints: [],
    nonGoals: [],
    planDesign: { frontend: 'dashboard' },
    plan: [],
    actions: actions.map((a, idx) => rec(idx, a)),
    evidence: [],
    filesChanged: ['src/app.css'],
    checkpoints: [],
    blockers: [],
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  } as unknown as TaskLedgerData;
}

const CLEAN_OBS = 'BROWSER EVIDENCE (non-visual) — http://x/\nfindings: none';
const HIGH_OBS = 'BROWSER EVIDENCE (non-visual) — http://x/\n  !! high: horizontal-overflow (432px)';

describe('uiVisualGate — tiered looks', () => {
  const browser = { browserAvailable: true };

  it('text-only model: a clean structured evidence pass after the last edit verifies', () => {
    const data = uiLedger([
      { tool: 'apply_edit', status: 'success', paramsSummary: 'edit src/app.css' },
      { tool: 'browse', status: 'success', paramsSummary: 'browse evidence', observation: CLEAN_OBS },
    ]);
    expect(uiVisualGate(data, { ...browser, visionAvailable: false }).verified).toBe(true);
  });

  it('text-only model: evidence with high-severity findings does NOT verify', () => {
    const data = uiLedger([
      { tool: 'apply_edit', status: 'success', paramsSummary: 'edit src/app.css' },
      { tool: 'browse', status: 'success', paramsSummary: 'browse evidence', observation: HIGH_OBS },
    ]);
    const gate = uiVisualGate(data, { ...browser, visionAvailable: false });
    expect(gate.verified).toBe(false);
  });

  it('vision-capable model: structured evidence alone is not enough — screenshot required', () => {
    const data = uiLedger([
      { tool: 'apply_edit', status: 'success', paramsSummary: 'edit src/app.css' },
      { tool: 'browse', status: 'success', paramsSummary: 'browse evidence', observation: CLEAN_OBS },
    ]);
    const gate = uiVisualGate(data, { ...browser, visionAvailable: true });
    expect(gate.verified).toBe(false);
    expect(gate.reason).toContain('screenshot');
  });

  it('vision-capable model: screenshot after last edit still verifies as before', () => {
    const data = uiLedger([
      { tool: 'apply_edit', status: 'success', paramsSummary: 'edit src/app.css' },
      { tool: 'browse', status: 'success', paramsSummary: 'browse screenshot' },
    ]);
    expect(uiVisualGate(data, { ...browser, visionAvailable: true }).verified).toBe(true);
  });

  it('any look before the last edit is stale for both tiers', () => {
    const data = uiLedger([
      { tool: 'browse', status: 'success', paramsSummary: 'browse evidence', observation: CLEAN_OBS },
      { tool: 'apply_edit', status: 'success', paramsSummary: 'edit src/app.css' },
    ]);
    const gate = uiVisualGate(data, { ...browser, visionAvailable: false });
    expect(gate.verified).toBe(false);
    expect(gate.reason).toContain('never seen');
  });
});

import { collectViewportEvidence, formatResponsiveEvidence, resolveViewports, VIEWPORT_PRESETS } from '../src/browser/evidence.js';

describe('multi-viewport responsive evidence', () => {
  function responsiveBridge(overflowAt: number[]): { bridge: BrowserBridge; sizes: string[] } {
    const sizes: string[] = [];
    const bridge = {
      available: () => true,
      state: () => ({ available: true, url: 'http://x/', title: 't', canBack: false, canForward: false, loading: false }),
      navigate: async () => ({ available: true, url: 'http://x/', title: 't', canBack: false, canForward: false, loading: false }),
      screenshot: async () => ({ pngBase64: 'xxx', state: { available: true, url: '', title: '', canBack: false, canForward: false, loading: false } }),
      evaluate: async () => {
        const w = current;
        return {
          ...CLEAN_PAGE,
          viewport: { w, h: 812 },
          scrollWidth: overflowAt.includes(w) ? w + 400 : w,
          layout: { ...CLEAN_PAGE.layout, horizontalOverflow: overflowAt.includes(w) },
        };
      },
      setViewport: async (width: number) => {
        current = width;
        sizes.push(String(width));
        return { available: true, url: 'http://x/', title: 't', canBack: false, canForward: false, loading: false };
      },
    } as unknown as BrowserBridge;
    let current = 1440;
    return { bridge, sizes };
  }

  it('resolves preset names and explicit WxH sizes', () => {
    expect(resolveViewports(['mobile', 'tablet'])).toEqual([VIEWPORT_PRESETS.mobile, VIEWPORT_PRESETS.tablet]);
    expect(resolveViewports('desktop')).toEqual([VIEWPORT_PRESETS.desktop]);
    expect(resolveViewports(['375x812'])).toEqual([{ width: 375, height: 812 }]);
    expect(resolveViewports(undefined)).toBeUndefined();
    expect(resolveViewports(['nonsense'])).toBeUndefined();
  });

  it('labels findings with the viewport that produced them', async () => {
    const { bridge } = responsiveBridge([375]);
    const result = await collectViewportEvidence(bridge, [VIEWPORT_PRESETS.mobile, VIEWPORT_PRESETS.desktop]);
    expect(result.collected).toBe(true);
    expect(result.passes).toHaveLength(2);
    const overflowFindings = result.findings.filter((f) => f.finding.startsWith('horizontal-overflow'));
    expect(overflowFindings.some((f) => f.finding.includes('@375x812'))).toBe(true);
    expect(overflowFindings.some((f) => f.finding.includes('@1440x900'))).toBe(false);
    // The aggregate names every offending size.
    expect(result.findings.some((f) => f.finding === 'responsive-horizontal-overflow' && f.detail.includes('375x812'))).toBe(true);
  });

  it('restores the desktop viewport after the pass', async () => {
    const { bridge, sizes } = responsiveBridge([]);
    await collectViewportEvidence(bridge, [VIEWPORT_PRESETS.mobile]);
    expect(sizes.at(-1)).toBe('1440');
  });

  it('formats a per-viewport digest', async () => {
    const { bridge } = responsiveBridge([375, 768]);
    const result = await collectViewportEvidence(bridge, [VIEWPORT_PRESETS.mobile, VIEWPORT_PRESETS.tablet, VIEWPORT_PRESETS.desktop]);
    const digest = formatResponsiveEvidence(result);
    expect(digest).toMatch(/RESPONSIVE EVIDENCE . 3 viewport pass\(es\)/);
    expect(digest).toContain('responsive-horizontal-overflow');
    expect(digest).toContain('375x812, 768x1024');
    expect(digest).toContain('highFindings=1');
  });

  it('reports honestly without viewport support', async () => {
    const plain = {
      available: () => true,
      state: () => ({ available: true, url: '', title: '', canBack: false, canForward: false, loading: false }),
      screenshot: async () => ({ pngBase64: 'x', state: { available: true, url: '', title: '', canBack: false, canForward: false, loading: false } }),
    } as unknown as BrowserBridge;
    const result = await collectViewportEvidence(plain, [VIEWPORT_PRESETS.mobile]);
    expect(result.collected).toBe(false);
    expect(formatResponsiveEvidence(result)).toContain('not collected');
  });
});
