import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

describe('UI — responsive task shell and trustworthy controls', () => {
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
    expect(UI_HTML).toContain('.run-side { width: min(430px, 100vw); }');
    expect(UI_HTML).toContain('.bottom-composer { padding: 8px 10px 10px; }');
  });

  it('summarizes task state and bounds long timeline rendering', () => {
    expect(UI_HTML).toContain('id="runOverview"');
    expect(UI_HTML).toContain('function renderRunOverview(session, ledger)');
    expect(UI_HTML).not.toContain('id="runOverviewGoal"');
    expect(UI_HTML).toContain('Run stopped — see Details to review and retry.');
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

  it('exposes keyboard and screen-reader semantics for primary controls', () => {
    expect(UI_HTML).toContain('button:focus-visible');
    expect(UI_HTML).toContain('aria-label="Workflow mode"');
    expect(UI_HTML).toContain('aria-haspopup="listbox"');
    expect(UI_HTML).toContain('aria-label="Attach files or documents"');
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

  it('clears live transport and thinking state after a terminal status', () => {
    expect(UI_HTML).toContain("if (sess.session && sess.session.status !== 'running') setWorking(null);");
    expect(UI_HTML).toContain("if (S.es) { try { S.es.close(); } catch (e) {} S.es = null; }");
    expect(UI_HTML).toContain('if (!S.es) connect(runId);');
    expect(UI_HTML).toContain('polling only');
  });
});
