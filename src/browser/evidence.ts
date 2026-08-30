/**
 * Non-visual browser evidence: the model's "eyes" that do not need vision.
 *
 * One structured probe per collection — DOM counts, accessibility gaps,
 * layout geometry, clipping, visibility — plus SEMANTIC findings (bounded,
 * severity-rated) so the model reasons over conclusions instead of hundreds
 * of raw DOM properties. Screenshots become an ESCALATION for genuinely
 * visual criteria; everything else is provable from this structure, which
 * also works for text-only models.
 */
import type { BrowserBridge } from './browser.js';

export interface BrowserFinding {
  finding: string;
  severity: 'high' | 'medium' | 'low';
  selector?: string;
  detail: string;
}

/** Bounded semantic map of an interactive control and the region it affects. */
export interface BrowserControl {
  role: string;
  name: string;
  selector: string;
  region: string;
  destination?: string;
}

export interface BrowserEvidence {
  url: string;
  title: string;
  readyState: string;
  console: { errors: string[] };
  dom: { buttons: number; links: number; inputs: number; images: number };
  accessibility: { unlabeledInputs: number; buttonsWithoutNames: number; imagesWithoutAlt: number };
  layout: {
    viewportWidth: number;
    viewportHeight: number;
    scrollWidth: number;
    horizontalOverflow: boolean;
    zeroSizeInteractive: number;
    elementsOutsideViewport: number;
  };
  styles: { clippedText: number; invisibleInteractive: number };
  /** Visible controls, capped by the page probe, for interaction-logic review. */
  controls: BrowserControl[];
  findings: BrowserFinding[];
  collected: boolean;
  reason?: string;
}

/** The probe runs as ONE executeJavaScript call — bounded samples, no heavy loops. */
const PROBE = `(function(){
  var out = {
    readyState: document.readyState,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    dom: { buttons: 0, links: 0, inputs: 0, images: 0 },
    a11y: { unlabeledInputs: 0, buttonsWithoutNames: 0, imagesWithoutAlt: 0 },
    layout: { zeroSize: 0, outsideViewport: 0 },
    styles: { clippedText: 0, invisibleInteractive: 0 },
    samples: [],
    controls: []
  };
  function sel(el) {
    if (!el || el === document.body || el === document.documentElement) return el && el.tagName ? el.tagName.toLowerCase() : '?';
    var s = el.tagName ? el.tagName.toLowerCase() : '?';
    if (el.id) return s + '#' + el.id;
    if (el.className && typeof el.className === 'string' && el.className.trim()) return s + '.' + el.className.trim().split(/\\s+/)[0];
    return s;
  }
  function sample(finding, severity, el, detail) {
    if (out.samples.length < 12) out.samples.push({ finding: finding, severity: severity, selector: sel(el), detail: String(detail || '').slice(0, 140) });
  }
  function accessibleName(el) {
    if (el.getAttribute('aria-label') && el.getAttribute('aria-label').trim()) return el.getAttribute('aria-label');
    if (el.getAttribute('aria-labelledby')) return 'labelled';
    if (el.getAttribute('title') && el.getAttribute('title').trim()) return el.getAttribute('title');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (el.labels && el.labels.length > 0) return 'label';
      var pid = el.id ? document.querySelector('label[for="' + (el.id || '').replace(/"/g, '') + '"]') : null;
      if (pid) return 'label';
      if ((el.getAttribute('placeholder') || '').trim()) return 'placeholder';
    }
    return '';
  }
  function controlRegion(el) {
    var box = el.closest('form, dialog, [role="dialog"], header, nav, main, aside, footer, section');
    if (!box) return 'document';
    var region = sel(box);
    var heading = box.querySelector && box.querySelector('h1, h2, h3, legend');
    var headingText = heading && heading.textContent ? heading.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60) : '';
    return headingText ? region + ' "' + headingText + '"' : region;
  }
  function controlDestination(el) {
    if (el.tagName === 'A') return (el.getAttribute('href') || '').slice(0, 100);
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') {
      var type = (el.getAttribute('type') || (el.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
      if (type === 'submit') {
        var form = el.form || el.closest('form');
        return 'submit' + (form && form.getAttribute('action') ? ' ' + form.getAttribute('action').slice(0, 90) : '');
      }
      return type ? 'type=' + type : '';
    }
    return '';
  }
  var interactive = document.querySelectorAll('button, input, select, textarea, a[href], [role="button"]');
  for (var i = 0; i < interactive.length; i++) {
    var el = interactive[i];
    var tag = el.tagName;
    if (tag === 'BUTTON' || el.getAttribute('role') === 'button') out.dom.buttons += 1;
    else if (tag === 'A') out.dom.links += 1;
    else if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') out.dom.inputs += 1;
    var r = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    var invisible = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0;
    var zero = r.width < 1 || r.height < 1;
    if (!invisible && !zero && out.controls.length < 24) {
      var role = (el.getAttribute('role') || (tag === 'INPUT' ? (el.getAttribute('type') || 'input') : tag.toLowerCase())).slice(0, 30);
      var controlName = ((el.textContent || '').trim() || accessibleName(el) || el.value || '').replace(/\\s+/g, ' ').slice(0, 80);
      var destination = controlDestination(el);
      out.controls.push({ role: role, name: controlName || '(unnamed)', selector: sel(el), region: controlRegion(el), destination: destination });
    }
    if (zero && !invisible) {
      out.layout.zeroSize += 1;
      if (out.samples.length < 12) sample('zero-size-interactive', 'high', el, r.width + 'x' + r.height);
    }
    if (invisible && !zero) {
      out.styles.invisibleInteractive += 1;
      if (out.samples.length < 12) sample('invisible-interactive', 'high', el, 'display=' + style.display + ' visibility=' + style.visibility + ' opacity=' + style.opacity);
    }
    if (!zero && !invisible && tag !== 'A') {
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight) {
        var top = document.elementFromPoint(cx, cy);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) {
          out.samples.length < 12 && sample('interactive-covered', 'medium', el, 'covered by ' + sel(top));
        }
      }
    }
  }
  var links = document.querySelectorAll('a');
  out.dom.links = links.length;
  var inputs = document.querySelectorAll('input, select, textarea');
  for (var j = 0; j < inputs.length; j++) {
    var inp = inputs[j];
    if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button') continue;
    if (!accessibleName(inp)) {
      out.a11y.unlabeledInputs += 1;
      if (out.samples.length < 12) sample('input-without-accessible-name', 'high', inp, inp.type || inp.tagName);
    }
  }
  var imgs = document.querySelectorAll('img');
  out.dom.images = imgs.length;
  for (var k = 0; k < imgs.length; k++) {
    if (imgs[k].hasAttribute('alt') === false) {
      out.a11y.imagesWithoutAlt += 1;
      if (out.samples.length < 12) sample('image-without-alt', 'low', imgs[k], (imgs[k].src || '').slice(0, 80));
    }
  }
  var buttons2 = document.querySelectorAll('button, [role="button"]');
  for (var m = 0; m < buttons2.length; m++) {
    var b = buttons2[m];
    var name = (b.textContent || '').trim() || accessibleName(b);
    if (!name) {
      out.a11y.buttonsWithoutNames += 1;
      if (out.samples.length < 12) sample('button-without-name', 'high', b, 'no text, no aria-label');
    }
  }
  out.layout.horizontalOverflow = out.scrollWidth > out.viewport.w + 2;
  var clipped = document.querySelectorAll('*');
  var clippedChecked = 0;
  for (var n = 0; n < clipped.length && clippedChecked < 400 && out.styles.clippedText < 5; n++) {
    var cel = clipped[n];
    if (cel.children.length > 0 || !cel.textContent || !cel.textContent.trim()) continue;
    clippedChecked += 1;
    var cs = window.getComputedStyle(cel);
    if ((cs.overflowX === 'hidden' || cs.overflow === 'hidden') && cel.scrollWidth > cel.clientWidth + 4) {
      out.styles.clippedText += 1;
      if (out.samples.length < 12) sample('text-clipped', 'medium', cel, cel.clientWidth + 'px visible of ' + cel.scrollWidth + 'px');
    }
  }
  return out;
})()`;

export async function collectBrowserEvidence(bridge: BrowserBridge): Promise<BrowserEvidence> {
  const state = bridge.state();
  const base: BrowserEvidence = {
    url: state.url,
    title: state.title,
    readyState: 'unknown',
    console: { errors: bridge.consoleErrors?.() ?? [] },
    dom: { buttons: 0, links: 0, inputs: 0, images: 0 },
    accessibility: { unlabeledInputs: 0, buttonsWithoutNames: 0, imagesWithoutAlt: 0 },
    layout: { viewportWidth: 0, viewportHeight: 0, scrollWidth: 0, horizontalOverflow: false, zeroSizeInteractive: 0, elementsOutsideViewport: 0 },
    styles: { clippedText: 0, invisibleInteractive: 0 },
    controls: [],
    findings: [],
    collected: false,
  };
  if (!bridge.evaluate) {
    return { ...base, reason: 'this browser bridge cannot run page probes (no evaluate support)' };
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await bridge.evaluate(PROBE)) as Record<string, unknown>;
  } catch (err) {
    return { ...base, reason: `page probe failed: ${(err as Error).message.slice(0, 120)}` };
  }
  if (!raw || typeof raw !== 'object') {
    return { ...base, reason: 'page probe returned no data' };
  }
  const viewport = (raw['viewport'] ?? {}) as { w?: number; h?: number };
  const dom = (raw['dom'] ?? {}) as Record<string, number>;
  const a11y = (raw['a11y'] ?? {}) as Record<string, number>;
  const layout = (raw['layout'] ?? {}) as Record<string, unknown>;
  const styles = (raw['styles'] ?? {}) as Record<string, number>;
  const samples = Array.isArray(raw['samples']) ? (raw['samples'] as BrowserFinding[]) : [];
  const controls = Array.isArray(raw['controls']) ? (raw['controls'] as BrowserControl[]) : [];
  const evidence: BrowserEvidence = {
    url: state.url,
    title: state.title,
    readyState: String(raw['readyState'] ?? 'unknown'),
    console: { errors: bridge.consoleErrors?.() ?? [] },
    dom: { buttons: dom['buttons'] ?? 0, links: dom['links'] ?? 0, inputs: dom['inputs'] ?? 0, images: dom['images'] ?? 0 },
    accessibility: {
      unlabeledInputs: a11y['unlabeledInputs'] ?? 0,
      buttonsWithoutNames: a11y['buttonsWithoutNames'] ?? 0,
      imagesWithoutAlt: a11y['imagesWithoutAlt'] ?? 0,
    },
    layout: {
      viewportWidth: Number(viewport['w'] ?? 0),
      viewportHeight: Number(viewport['h'] ?? 0),
      scrollWidth: Number(raw['scrollWidth'] ?? 0),
      horizontalOverflow: Boolean(layout['horizontalOverflow']),
      zeroSizeInteractive: Number(layout['zeroSize'] ?? 0),
      elementsOutsideViewport: Number(layout['outsideViewport'] ?? 0),
    },
    styles: { clippedText: styles['clippedText'] ?? 0, invisibleInteractive: styles['invisibleInteractive'] ?? 0 },
    controls: controls
      .filter((control) => control && typeof control.role === 'string' && typeof control.name === 'string')
      .slice(0, 24)
      .map((control) => ({
        role: String(control.role).slice(0, 30),
        name: String(control.name).slice(0, 80),
        selector: String(control.selector ?? '?').slice(0, 100),
        region: String(control.region ?? 'document').slice(0, 120),
        ...(control.destination ? { destination: String(control.destination).slice(0, 100) } : {}),
      })),
    findings: samples.filter((s) => s && typeof s.finding === 'string'),
    collected: true,
  };
  // Aggregate findings derived from the counts (samples carry the specifics).
  if (evidence.layout.horizontalOverflow) {
    evidence.findings.unshift({
      finding: 'horizontal-overflow',
      severity: 'high',
      detail: `document is ${evidence.layout.scrollWidth}px wide in a ${evidence.layout.viewportWidth}px viewport`,
    });
  }
  if (evidence.console.errors.length > 0) {
    evidence.findings.unshift({
      finding: 'console-errors',
      severity: 'high',
      detail: evidence.console.errors.slice(0, 3).join(' | ').slice(0, 200),
    });
  }
  if (evidence.readyState !== 'complete') {
    evidence.findings.push({ finding: 'load-incomplete', severity: 'low', detail: `readyState=${evidence.readyState}` });
  }
  return evidence;
}

/** Compact, model-facing digest. `BROWSER EVIDENCE` doubles as the UI-gate marker. */
export function formatBrowserEvidence(e: BrowserEvidence): string {
  if (!e.collected) {
    return `BROWSER EVIDENCE: not collected — ${e.reason ?? 'unknown reason'}`;
  }
  const lines: string[] = [];
  lines.push(`BROWSER EVIDENCE (non-visual) — ${e.url}`);
  lines.push(`page: "${e.title}" readyState=${e.readyState}`);
  lines.push(`console errors: ${e.console.errors.length}${e.console.errors.length ? ` — ${e.console.errors[0]!.slice(0, 120)}` : ''}`);
  lines.push(`dom: buttons=${e.dom.buttons} links=${e.dom.links} inputs=${e.dom.inputs} images=${e.dom.images}`);
  lines.push(
    `accessibility: unlabeledInputs=${e.accessibility.unlabeledInputs} buttonsWithoutNames=${e.accessibility.buttonsWithoutNames} imagesWithoutAlt=${e.accessibility.imagesWithoutAlt}`,
  );
  lines.push(
    `layout: viewport=${e.layout.viewportWidth}x${e.layout.viewportHeight} scrollWidth=${e.layout.scrollWidth} horizontalOverflow=${e.layout.horizontalOverflow} zeroSizeInteractive=${e.layout.zeroSizeInteractive}`,
  );
  lines.push(`styles: clippedText=${e.styles.clippedText} invisibleInteractive=${e.styles.invisibleInteractive}`);
  if (e.controls.length > 0) {
    lines.push(`interactive controls (${e.controls.length} sampled):`);
    for (const control of e.controls.slice(0, 24)) {
      lines.push(
        `  ${control.role} "${control.name}" @ ${control.region} [${control.selector}]${control.destination ? ` -> ${control.destination}` : ''}`,
      );
    }
  }
  const high = e.findings.filter((f) => f.severity === 'high');
  const rest = e.findings.filter((f) => f.severity !== 'high');
  if (e.findings.length === 0) {
    lines.push('findings: none — no high-severity issues detected by structured probes');
  } else {
    lines.push(`findings (${e.findings.length}, ${high.length} high):`);
    for (const f of [...high, ...rest].slice(0, 8)) {
      lines.push(`  ${f.severity === 'high' ? '!!' : ' -'} ${f.severity}: ${f.finding}${f.selector ? ` — "${f.selector}"` : ''} (${f.detail})`);
    }
  }
  lines.push(`[browser-evidence collected=true highFindings=${high.length} totalFindings=${e.findings.length}]`);
  return lines.join('\n');
}

// ── Multi-viewport responsive verification ─────────────────────────────────
// A layout that is clean at 1440px can be broken at 375px. The collector
// re-probes the SAME page at each requested viewport size and labels every
// finding with the viewport that produced it.

export const VIEWPORT_PRESETS: Record<string, { width: number; height: number }> = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

export function resolveViewports(spec: unknown): { width: number; height: number }[] | undefined {
  if (spec === undefined) return undefined;
  const names = Array.isArray(spec) ? spec.map(String) : [String(spec)];
  const out: { width: number; height: number }[] = [];
  for (const name of names) {
    const preset = VIEWPORT_PRESETS[name.toLowerCase()];
    if (preset) {
      out.push(preset);
      continue;
    }
    const m = /^(\d{3,4})x(\d{3,4})$/i.exec(name.trim());
    if (m) out.push({ width: Number(m[1]), height: Number(m[2]) });
  }
  return out.length > 0 ? out : undefined;
}

export interface ViewportPass {
  size: { width: number; height: number };
  evidence: BrowserEvidence;
}

export interface ResponsiveEvidence {
  passes: ViewportPass[];
  findings: BrowserFinding[];
  collected: boolean;
  reason?: string;
}

/**
 * Probe the page at EVERY requested viewport: set size → structured probe →
 * label findings with the viewport. Overflow, clipping, zero-size controls
 * and a11y gaps are caught per width — the "clean at desktop, broken at
 * mobile" class of bug becomes mechanically visible.
 */
export async function collectViewportEvidence(
  bridge: BrowserBridge,
  sizes: { width: number; height: number }[],
): Promise<ResponsiveEvidence> {
  if (!bridge.setViewport || !bridge.evaluate) {
    return { passes: [], findings: [], collected: false, reason: 'this browser bridge cannot resize or probe pages' };
  }
  const passes: ViewportPass[] = [];
  const findings: BrowserFinding[] = [];
  try {
    for (const size of sizes) {
      await bridge.setViewport(size.width, size.height);
      const evidence = await collectBrowserEvidence(bridge);
      if (!evidence.collected) continue;
      passes.push({ size, evidence });
      for (const f of evidence.findings) {
        findings.push({ ...f, finding: `${f.finding}@${size.width}x${size.height}`, selector: f.selector });
      }
    }
  } finally {
    // Leave the browser at the desktop size for any follow-up screenshots.
    const desktop = VIEWPORT_PRESETS['desktop'] ?? { width: 1440, height: 900 };
    await bridge.setViewport(desktop.width, desktop.height).catch(() => {});
  }
  if (passes.length === 0) {
    return { passes, findings, collected: false, reason: 'no viewport probe succeeded' };
  }
  // Responsive-specific aggregate: a page that overflows at ANY width is a
  // single high-severity finding listing every offending size.
  const overflowing = passes.filter((p) => p.evidence.layout.horizontalOverflow).map((p) => `${p.size.width}x${p.size.height}`);
  if (overflowing.length > 0) {
    findings.unshift({
      finding: 'responsive-horizontal-overflow',
      severity: 'high',
      detail: `page overflows horizontally at: ${overflowing.join(', ')}`,
    });
  }
  return { passes, findings, collected: true };
}

export function formatResponsiveEvidence(r: ResponsiveEvidence): string {
  if (!r.collected) return `RESPONSIVE EVIDENCE: not collected — ${r.reason ?? 'unknown reason'}`;
  const lines: string[] = [`RESPONSIVE EVIDENCE — ${r.passes.length} viewport pass(es)`];
  for (const pass of r.passes) {
    const high = pass.evidence.findings.filter((f) => f.severity === 'high').length;
    lines.push(
      `  ${pass.size.width}x${pass.size.height}: overflow=${pass.evidence.layout.horizontalOverflow} zeroSize=${pass.evidence.layout.zeroSizeInteractive} clipped=${pass.evidence.styles.clippedText} highFindings=${high}`,
    );
  }
  const high = r.findings.filter((f) => f.severity === 'high');
  lines.push(`findings (${r.findings.length}, ${high.length} high):`);
  for (const f of [...high, ...r.findings.filter((x) => x.severity !== 'high')].slice(0, 10)) {
    lines.push(`  ${f.severity === 'high' ? '!!' : ' -'} ${f.severity}: ${f.finding}${f.selector ? ` — "${f.selector}"` : ''} (${f.detail})`);
  }
  lines.push(`[responsive-evidence collected=true viewports=${r.passes.length} highFindings=${high.length}]`);
  return lines.join('\n');
}
