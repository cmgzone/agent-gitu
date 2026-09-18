import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gitu } from '../src/agent/gitu.js';
import { UI_HTML } from '../src/server/ui.js';
import type { LlmClient, LlmTurnResult } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `gitu-stream-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `stream-${name}` }, null, 2));
  return dir;
}

describe('Streaming UX — Server side (gitu.ts)', () => {
  it('flushes pending tdelta on a 25ms timer even when no subsequent chunks arrive', async () => {
    const root = makeProject('timer-flush');
    const events: string[] = [];

    const mockLlm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn() {
        return { kind: 'text', text: '', metadata: {} };
      },
      async completeTurnStream(_messages, _opts, onDelta): Promise<LlmTurnResult> {
        // Stream a small chunk (less than 24 chars)
        onDelta('I am checking');
        // Wait 50ms without sending any more chunks — the real timer MUST flush this
        await new Promise((resolve) => setTimeout(resolve, 50));
        // Verify tdelta was emitted before we send the final action
        expect(events.some((e) => e === 'tdelta I am checking')).toBe(true);

        const actionJson = JSON.stringify({
          action: { type: 'complete', summary: 'all good' },
        });
        return { kind: 'text', text: `I am checking.\n${actionJson}`, metadata: {} };
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm: mockLlm,
      mode: 'fast',
      onEvent: (e) => events.push(e),
    });

    await gitu.run('Check timer flush');
    expect(events.some((e) => e.startsWith('tdelta I am checking'))).toBe(true);
    expect(events.some((e) => e.startsWith('say I am checking.'))).toBe(true);

    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  it('flushes immediately when pending buffer reaches threshold (>= 24 chars)', async () => {
    const root = makeProject('threshold-flush');
    const events: string[] = [];

    const mockLlm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn() {
        return { kind: 'text', text: '', metadata: {} };
      },
      async completeTurnStream(_messages, _opts, onDelta): Promise<LlmTurnResult> {
        // 25 chars -> immediately flushes without waiting for timer
        onDelta('This is twenty five chars');
        expect(events.some((e) => e === 'tdelta This is twenty five chars')).toBe(true);

        const actionJson = JSON.stringify({
          action: { type: 'complete', summary: 'done' },
        });
        return { kind: 'text', text: `This is twenty five chars.\n${actionJson}`, metadata: {} };
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm: mockLlm,
      mode: 'fast',
      onEvent: (e) => events.push(e),
    });

    await gitu.run('Check threshold flush');
    expect(events.some((e) => e === 'tdelta This is twenty five chars')).toBe(true);

    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });
});

describe('Streaming UX — UI Template (ui.ts)', () => {
  it('includes the blank-row guard on opening tdelta/thought chunk', () => {
    // Verifies that whitespace-only chunks (e.g. "\n" or " ") never create a thought row
    expect(UI_HTML).toContain('if (!sess.nodes.thought && !chunk.trim()) return;');
  });

  it('includes in-place patching on say instead of inserting duplicate rows', () => {
    // Verifies that say checks sess.nodes.thought and patches its textContent in place
    expect(UI_HTML).toContain('if (sess.nodes.thought) {');
    expect(UI_HTML).toContain('txt.textContent = \'\';');
    expect(UI_HTML).toContain('txt.appendChild(document.createTextNode(prose));');
  });

  it('simulates the DOM logic: suppresses blank row on whitespace and patches on say', () => {
    // Simulate the exact frontend logic from ui.ts with a lightweight DOM mock
    class MockElement {
      className: string = '';
      innerHTML: string = '';
      textContent: string = '';
      children: MockElement[] = [];

      querySelector(selector: string): MockElement | null {
        if (selector === '.txt') {
          return this.children.find((c) => c.className === 'txt') ?? null;
        }
        return null;
      }
      appendChild(child: MockElement | { text: string }) {
        if ('text' in child) {
          this.textContent += child.text;
        } else {
          this.children.push(child);
        }
      }
    }

    const insertedRows: MockElement[] = [];
    const sess = {
      chatish: false,
      nodes: {
        thought: null as MockElement | null,
      },
    };

    function handleEvent(text: string) {
      if (text.indexOf('tdelta ') === 0 || text.indexOf('thought ') === 0) {
        const chunk = text.indexOf('tdelta ') === 0 ? text.slice(7) : text.slice(8);
        // Fix 1 guard
        if (!sess.nodes.thought && !chunk.trim()) return;

        if (!sess.nodes.thought) {
          const t = new MockElement();
          t.className = 'tl-row tl-note-row';
          const txtSpan = new MockElement();
          txtSpan.className = 'txt';
          t.appendChild(txtSpan);
          insertedRows.push(t);
          sess.nodes.thought = t;
        }
        const sink = sess.nodes.thought.querySelector('.txt')!;
        sink.appendChild({ text: chunk });
        return;
      }

      if (text.indexOf('say ') === 0) {
        const prose = text.slice(4);
        if (!prose.trim()) {
          sess.nodes.thought = null;
          return;
        }
        // Fix 3 in-place reconciliation
        if (sess.nodes.thought) {
          const txt = sess.nodes.thought.querySelector('.txt');
          if (txt && txt.textContent !== prose) {
            txt.textContent = '';
            txt.appendChild({ text: prose });
          }
        } else {
          const pp = new MockElement();
          pp.className = 'tl-row tl-note-row';
          const txtSpan = new MockElement();
          txtSpan.className = 'txt';
          txtSpan.textContent = prose;
          pp.appendChild(txtSpan);
          insertedRows.push(pp);
        }
        sess.nodes.thought = null;
        return;
      }
    }

    // Step 1: Whitespace-only opening deltas (common from DeepSeek)
    handleEvent('tdelta \n');
    handleEvent('tdelta   ');
    handleEvent('tdelta \n\n');
    // NO row should have been created yet
    expect(insertedRows.length).toBe(0);
    expect(sess.nodes.thought).toBeNull();

    // Step 2: First visible chunk arrives
    handleEvent('tdelta I am checking');
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].querySelector('.txt')?.textContent).toBe('I am checking');

    // Step 3: Subsequent chunk with whitespace
    handleEvent('tdelta  the database');
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].querySelector('.txt')?.textContent).toBe('I am checking the database');

    // Step 4: Final say arrives with authoritative full sentence
    handleEvent('say I am checking the database and verifying configuration.');
    // MUST NOT create a second row! MUST patch existing row!
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].querySelector('.txt')?.textContent).toBe('I am checking the database and verifying configuration.');
    expect(sess.nodes.thought).toBeNull(); // Closed cleanly
  });

  it('simulates the DOM logic: inserts static row when no tdelta streaming occurred', () => {
    class MockElement {
      className: string = '';
      textContent: string = '';
      children: MockElement[] = [];
      querySelector(selector: string): MockElement | null {
        if (selector === '.txt') return this.children.find((c) => c.className === 'txt') ?? null;
        return null;
      }
      appendChild(child: MockElement | { text: string }) {
        if ('text' in child) this.textContent += child.text;
        else this.children.push(child);
      }
    }

    const insertedRows: MockElement[] = [];
    const sess = {
      chatish: false,
      nodes: { thought: null as MockElement | null },
    };

    function handleSay(text: string) {
      const prose = text.slice(4);
      if (!prose.trim()) return;
      if (sess.nodes.thought) {
        const txt = sess.nodes.thought.querySelector('.txt');
        if (txt && txt.textContent !== prose) {
          txt.textContent = '';
          txt.appendChild({ text: prose });
        }
      } else {
        const pp = new MockElement();
        pp.className = 'tl-row tl-note-row';
        const txtSpan = new MockElement();
        txtSpan.className = 'txt';
        txtSpan.textContent = prose;
        pp.appendChild(txtSpan);
        insertedRows.push(pp);
      }
      sess.nodes.thought = null;
    }

    handleSay('say Task completed directly.');
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].querySelector('.txt')?.textContent).toBe('Task completed directly.');
  });
});