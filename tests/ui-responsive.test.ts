import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../src/server/ui.js';

// The failure-summary classifier lives inside the static browser bundle; slice
// it out and execute it the same way the typed-gate-card tests do.
const FAILURE_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function failureSummary('),
  UI_HTML.indexOf('  function pollRun('),
);
const SESSION_TITLE_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function sessionTitle(goal) {'),
  UI_HTML.indexOf('  function renderSidebar() {'),
);

function classifier() {
  const context = createContext({
    shortText: (text: string, limit: number) => {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      return t.length > limit ? t.slice(0, limit - 1).trim() + '…' : t;
    },
  });
  new Script(FAILURE_JS).runInContext(context);
  return context.failureSummary as (error: string) => { title: string; hint: string; canSwitchModel: boolean };
}

describe('UI — responsive task shell and trustworthy controls', () => {
  it('turns prompt and pasted-plan text into readable session labels', () => {
    const context = createContext({});
    new Script(SESSION_TITLE_JS).runInContext(context);
    const title = context.sessionTitle as (goal: string) => string;
    expect(title('https://github.com/cmgzone/agent-gitu use this to add real information on the landing page'))
      .toBe('Update landing page with Agent Gitu details');
    expect(title('last session i was working on black box continue working on it please'))
      .toBe('Continue Black Box work');
    expect(title('[cron 1d] Distill old cowork transcripts into durable candidate memories'))
      .toBe('Distill old cowork transcripts into durable candidate memories');
    expect(title('Here is a long plan. '.repeat(20) + '\n### Agent Gitu — Black Box Security Testing Implementation Plan'))
      .toBe('Agent Gitu — Black Box Security Testing Implementation Plan');
  });
  it('uses the native Agent Gitu mark in the app header', () => {
    expect(UI_HTML).toContain('src="/brand/agent-gitu-mark.svg"');
    expect(UI_HTML).toContain('.brand-mark { width: 22px; height: 22px;');
  });

  it('turns the fixed sidebar into an accessible mobile drawer', () => {
    expect(UI_HTML).toContain('@media (max-width: 720px)');
    expect(UI_HTML).toContain('.shell.mobile-nav-open .sb { transform: none; }');
    expect(UI_HTML).toContain('id="mobileNav"');
    expect(UI_HTML).toContain('id="mobileBackdrop"');
    expect(UI_HTML).toContain('function toggleMobileNav(open)');
  });

  it('keeps the task and settings usable at phone width', () => {
    expect(UI_HTML).toContain('.settings { flex-direction: column; }');
    expect(UI_HTML).toContain('.setnav { width: 100%;');
    expect(UI_HTML).toContain('.run-side, .shell.left-collapsed .run-side { left: 0; width: min(430px, 100vw);');
    expect(UI_HTML).toContain('.bottom-composer { padding: 8px 10px 10px; }');
  });

  it('keeps task details accessible and bounds long timeline rendering', () => {
    expect(UI_HTML).not.toContain('id="runOverview"');
    expect(UI_HTML).toContain('data-tool="state"');
    expect(UI_HTML).toContain('Run stopped — see Task details in the left sidebar to review and retry.');
    expect(UI_HTML).toContain("div.className = 'run-stop-note'");
    expect(UI_HTML).not.toContain("div.className = 'runcard-error'");
    expect(UI_HTML).toContain('var MAX_REPLAY_EVENTS = 240;');
    expect(UI_HTML).toContain('var MAX_TIMELINE_NODES = 220;');
    expect(UI_HTML).toContain('Full history remains stored.');
    expect(UI_HTML).toContain('sess.nodes.lastWarn');
  });

  it('uses one project source and prevents unavailable model choices', () => {
    expect(UI_HTML).toContain('function effectiveProjectPath()');
    expect(UI_HTML).toContain('function providerIsUsable(p)');
    expect(UI_HTML).toContain('ensureUsableModelSelection();');
    expect(UI_HTML).toContain("if (!providerIsUsable(p)) return;");
    expect(UI_HTML).toContain('Connect a model provider');
  });

  it('shows ChatGPT subscription state without treating it as an API key', () => {
    expect(UI_HTML).toContain("p.auth === 'chatgpt-subscription'");
    expect(UI_HTML).toContain('Your ChatGPT credentials remain in Codex.');
    expect(UI_HTML).not.toContain('chatgptSignout');
  });

  it('gives runtime recovery guidance instead of blaming the selected model', () => {
    expect(UI_HTML).toContain('function failureSummary(error)');
    expect(UI_HTML).toContain('Changing models will not fix this runtime error.');
  });

  it('keeps the raw error in the details card behind a classified headline', () => {
    expect(UI_HTML).toContain("var failSummary = failure ? failureSummary(failure) : null;");
    expect(UI_HTML).toContain("esc(failSummary.title)");
    expect(UI_HTML).toContain("'<div class=\"fmsg\" title=\"' + esc(failure) + '\">' + esc(failure) + '</div>'");
  });

  it('gives the failure card real recovery actions', () => {
    expect(UI_HTML).toContain('id="sideFailSwitch">Switch model &amp; retry</button>');
    expect(UI_HTML).toContain('id="sideFailSettings">Provider settings</button>');
    expect(UI_HTML).toContain('id="sideFailCopy">Copy error</button>');
    expect(UI_HTML).toContain("openSettings('providers');");
    expect(UI_HTML).toContain('if (pick && !pick.disabled) openModelMenu();');
    expect(UI_HTML).toContain('.side-fail .facts .btn');
  });

  it('classifies provider and runtime failures into human headlines', () => {
    const summary = classifier();

    const billing = summary("ChatGPT subscription request failed: You've hit your usage limit. To get more access now, visit https://chatgpt.com/pricing or try again at 5:46 PM.");
    expect(billing.title).toBe('ChatGPT plan usage limit reached — try again at 5:46 PM');
    expect(billing.canSwitchModel).toBe(true);
    expect(billing.hint).toContain('Switch models to retry now');

    const quota = summary('API error 402: insufficient_quota — purchase more credits');
    expect(quota.title).toBe('The selected model ran out of quota or credits');
    expect(quota.canSwitchModel).toBe(true);

    const runtime = summary('ChatGPT subscription request failed: spawn ENOENT');
    expect(runtime.title).toBe('The local Codex runtime could not start');
    expect(runtime.canSwitchModel).toBe(false);
    expect(runtime.hint).toContain('Changing models will not fix this runtime error.');

    const auth = summary('HTTP 401 Unauthorized: invalid api key');
    expect(auth.title).toBe('The provider rejected its API key');

    const rate = summary('HTTP 429 too many requests: rate limit exceeded');
    expect(rate.title).toBe('The provider rate-limited the request');
    expect(rate.canSwitchModel).toBe(true);

    const net = summary('request failed: fetch failed (ECONNREFUSED)');
    expect(net.title).toBe('Could not reach the model provider');

    const verification = summary('Verification could not be completed after two correction opportunities: A check still fails on the current workspace.');
    expect(verification.title).toBe('Verification stopped this run');
    expect(verification.canSwitchModel).toBe(false);
    expect(verification.hint).toContain('Technical evidence');

    const unknown = summary('some entirely unexpected parser explosion');
    expect(unknown.title).toBe('some entirely unexpected parser explosion');
    expect(unknown.canSwitchModel).toBe(true);
    expect(unknown.hint).toContain('task and history are preserved');
  });

  it('exposes keyboard and screen-reader semantics for primary controls', () => {
    expect(UI_HTML).toContain('button:focus-visible');
    expect(UI_HTML).toContain('plus: SVG_OPEN +');
    expect(UI_HTML).toContain("id=\"homePlusBtn\" title=\"More actions\"");
    expect(UI_HTML).toContain('id="menuPlan" data-hp="plan" role="menuitemradio"');
    expect(UI_HTML).toContain('aria-haspopup="listbox"');
    expect(UI_HTML).toContain('data-hp="attach" role="menuitem"');
    expect(UI_HTML).toContain("e.key === 'Enter' || e.key === ' '");
  });

  it('supports generic files and durable download cards', () => {
    expect(UI_HTML).toContain('id="attachInput" multiple hidden');
    expect(UI_HTML).not.toContain('accept="image/*"');
    expect(UI_HTML).toContain('var MAX_PENDING_FILES = 8;');
    expect(UI_HTML).toContain('function sessionFileCard(meta)');
    expect(UI_HTML).toContain("if (text.indexOf('file ') === 0)");
    expect(UI_HTML).toContain("download.textContent = 'Download'");
    expect(UI_HTML).toContain('replacesLongText');
    expect(UI_HTML).toContain('/project-file?path=');
  });

  it('keeps Browser and Git on the left and token context at the composer', () => {
    expect(UI_HTML).toContain('data-tool="browser"');
    expect(UI_HTML).toContain('data-tool="git"');
    expect(UI_HTML).toContain('function openToolPanel(kind)');
    expect(UI_HTML).toContain('id="contextToggle"');
    expect(UI_HTML).toContain('id="contextCard" hidden');
    expect(UI_HTML).toContain("stat('Model context window'");
    expect(UI_HTML).toContain('Action breakdown');
    expect(UI_HTML).not.toContain('id="sideTabs"');
    expect(UI_HTML).not.toContain('id="rsResize"');
  });

  it('finishes history replay before closing a stopped task stream', () => {
    expect(UI_HTML).toContain("if (sess.session && sess.session.status !== 'running') setWorking(null);");
    expect(UI_HTML).toContain("es.addEventListener('replay-end'");
    expect(UI_HTML).toContain('sess.historyReady = true;');
    expect(UI_HTML).toContain("if (S.es && sess.historyReady) { try { S.es.close(); } catch (e) {} S.es = null; }");
    expect(UI_HTML).toContain('if (!S.es) connect(runId);');
    expect(UI_HTML).toContain('polling only');
  });
});
