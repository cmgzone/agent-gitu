import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_APPROACH_JS } from '../src/server/ui-approach.js';
import { UI_HTML } from '../src/server/ui.js';

function setup() {
  const elements = new Map<string, any>();
  function element() {
    return {
      textContent: '', className: '', hidden: false, children: [] as any[],
      scrollTop: 0, scrollHeight: 0, clientHeight: 0,
      classList: { toggle() {} },
      appendChild(child: any) { this.children.push(child); child.parent = this; },
      remove(this: any) { this.parent.children = this.parent.children.filter((c: any) => c !== this); },
    };
  }
  for (const id of ['approachPanel', 'approachLatest', 'approachStatus', 'approachCount', 'approachLog', 'approachEmpty', 'approachHistory']) elements.set(id, element());
  const sess = { nodes: {} as any, chatish: false, replaying: false, session: null as any };
  const context = createContext({ S: { active: 'run-1', sessions: { 'run-1': sess } }, $: (id: string) => elements.get(id), document: { createElement: element } });
  const helpers = UI_HTML.slice(UI_HTML.indexOf('  function toolKind('), UI_HTML.indexOf('  function workingTextFor('));
  new Script(helpers + UI_APPROACH_JS).runInContext(context);
  return { context, sess, elements, update: (text: string) => context.updateApproach('run-1', { text }) };
}

describe('User-visible approach summaries', () => {
  it('shows the actual tool purpose and marks a hypothesis as unverified', () => {
    const r = setup();
    r.update('run read src/ui.ts — Check where the stream is rendered');
    r.update('hypothesis The completion callback may discard buffered text.');
    expect(r.sess.nodes.approach.entries.map((e: any) => [e.label, e.text])).toEqual([
      ['Next action', 'Read src/ui.ts — Check where the stream is rendered'],
      ['Working hypothesis', 'The completion callback may discard buffered text.'],
    ]);
  });

  it('does not use raw provider reasoning, model thoughts, tool output, or prose as summaries', () => {
    const r = setup();
    for (const text of ['reason private trace', 'thought internal protocol field', 'tdelta raw delta', 'say public response', 'out arbitrary tool content', 'telemetry internal state']) {
      expect(r.context.approachEntry(text)).toBeNull();
    }
    r.update('activity reasoning');
    expect(r.sess.nodes.approach.entries).toHaveLength(0);
    expect(r.elements.get('approachStatus').textContent).toBe('Reviewing context');
  });

  it('distinguishes verified outcomes from intended actions', () => {
    const r = setup();
    r.update('run $ npm test — Verify the change');
    r.update('evidence ev-1 FAIL (test)');
    expect(r.sess.nodes.approach.entries[0].tone).toBe('');
    expect(r.sess.nodes.approach.entries[1].tone).toBe('fail');
    expect(r.sess.nodes.approach.entries[1].text).toBe('test check failed · ev-1');
    r.update('evidence ev-2 PASS (test)');
    expect(r.sess.nodes.approach.entries[2].tone).toBe('pass');
    expect(r.context.approachEntry('evidence some unverified claim')).toBeNull();
  });

  it('bounds the DOM, deduplicates consecutive updates, and preserves existing rows', () => {
    const r = setup();
    r.update('decision ad-1 — Reuse the existing renderer');
    const original = r.sess.nodes.approach.entries[0].el;
    r.update('decision ad-1 — Reuse the existing renderer');
    r.update('activity reasoning');
    expect(r.sess.nodes.approach.count).toBe(1);
    expect(r.sess.nodes.approach.entries[0].el).toBe(original);
    for (let i = 0; i < 40; i++) r.update(`run read file-${i}.ts`);
    expect(r.sess.nodes.approach.count).toBe(41);
    expect(r.sess.nodes.approach.entries).toHaveLength(24);
    expect(r.elements.get('approachLog').children).toHaveLength(24);
    expect(r.elements.get('approachHistory').hidden).toBe(false);
  });

  it('uses text nodes so code-like input cannot inject HTML', () => {
    const r = setup();
    r.update('hypothesis <img src=x onerror=alert(1)>');
    expect(r.elements.get('approachLog').children[0].children[1].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(r.elements.get('approachLog').children[0].children[1].children).toHaveLength(0);
  });

  it('stops the live indicator for terminal sessions, including replayed history', () => {
    const r = setup();
    r.sess.replaying = true;
    r.sess.session = { status: 'failed' };
    r.update('run $ npm test — Verify');
    expect(r.sess.nodes.approach.live).toBe(false);
    expect(r.elements.get('approachStatus').textContent).toBe('Failed');
    expect(r.sess.nodes.approach.entries[0].el.className).toContain('replayed');
  });

  it('does not add coding activity to chat mode or an inactive task', () => {
    const r = setup();
    r.sess.chatish = true;
    r.update('run read hidden.ts');
    expect(r.sess.nodes.approach).toBeUndefined();
    r.context.updateApproach('other-run', { text: 'run read hidden.ts' });
    expect(r.elements.get('approachLog').children).toHaveLength(0);
  });
});
