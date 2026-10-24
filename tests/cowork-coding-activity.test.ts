import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { COWORK_CODING_JS } from '../src/server/ui-cowork-coding.js';

function fixture() {
  const state = { codingTasks: [] as any[] };
  let writes = 0, markup = '';
  const host = { hidden: true, contains: () => false, get innerHTML() { return markup; }, set innerHTML(value: string) { writes++; markup = value; } };
  const context = createContext({ cwEnsure: () => state, $: (id: string) => id === 'cwCodingActivity' ? host : null, document: { activeElement: null }, esc: (value: string) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), cwAvaImg: () => '<span class="cw-plush"></span>', cwIcon: () => '<svg></svg>' });
  new Script(COWORK_CODING_JS).runInContext(context);
  return { state, host, context, writes: () => writes };
}

describe('Cowork coding activity', () => {
  it('keeps the working scene alive through unrelated updates and stops it for gates and terminal states', () => {
    const f = fixture();
    f.context.cwRenderCodingActivity();
    expect(f.host.hidden).toBe(true);
    f.state.codingTasks = [{ runId: 'coding-1', status: 'running', goal: 'Fix the mobile layout' }];
    f.context.cwRenderCodingActivity();
    expect(f.host.hidden).toBe(false);
    expect(f.host.innerHTML).toContain('data-coding-state="working"');
    expect(f.host.innerHTML).toContain('data-main-coding-task="coding-1"');
    expect(f.host.innerHTML).toContain('cw-coding-water');
    expect(f.host.innerHTML).not.toContain('cw-plush');
    expect(f.host.innerHTML).not.toContain('cw-coding-laptop');
    const before = f.writes();
    f.context.cwRenderCodingActivity();
    expect(f.writes()).toBe(before);
    f.state.codingTasks[0].needsAttention = true;
    f.context.cwRenderCodingActivity();
    expect(f.host.innerHTML).toContain('Waiting for your response');
    expect(f.host.innerHTML).not.toContain('data-coding-state="working"');
    for (const [status, label] of [['completed', 'Coding completed'], ['failed', 'Coding failed'], ['aborted', 'Coding stopped'], ['waiting_for_model', 'Waiting for model'], ['blocked', 'Needs attention']]) {
      f.state.codingTasks[0].status = status;
      f.context.cwRenderCodingActivity();
      expect(f.host.innerHTML).toContain(label);
      expect(f.host.innerHTML).not.toContain('data-coding-state="working"');
    }
  });

  it('retains every active task, limits old cards and escapes task content', () => {
    const f = fixture();
    f.state.codingTasks = Array.from({ length: 6 }, (_, i) => ({ runId: 'done-' + i, status: 'completed', goal: 'Earlier task' }));
    f.state.codingTasks.push({ runId: 'active-1', status: 'running', goal: '<img src=x onerror="attack()">' });
    f.context.cwRenderCodingActivity();
    expect(f.host.innerHTML.match(/class="cw-coding-card"/g)).toHaveLength(4);
    expect(f.host.innerHTML).toContain('data-main-coding-task="active-1"');
    expect(f.host.innerHTML).toContain('&lt;img');
    expect(f.host.innerHTML).not.toContain('<img');
    expect(f.context.cwCodingCardHtml({ runId: 'bad" onclick="attack()', status: 'running' })).toBe('');
    f.state.codingTasks = [];
    f.context.cwRenderCodingActivity();
    expect(f.host.hidden).toBe(true);
  });
});
