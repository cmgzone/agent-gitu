import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CronStore, parseEvery } from '../src/cron/scheduler.js';
import { Hermes } from '../src/agent/hermes.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { SkillStore } from '../src/skills/skills.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-ext-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `ext-${name}` }, null, 2));
  return dir;
}

describe('SkillStore', () => {
  it('creates, lists, gets and removes skills', () => {
    const dir = makeProject('skills');
    const store = SkillStore.forProject(dir);
    const skill = store.create({ name: 'Deploy Checklist', description: 'how to deploy', instructions: '1. build\n2. test\n3. ship' });
    expect(skill.name).toBe('deploy-checklist');
    expect(store.list()).toHaveLength(1);
    expect(store.get('deploy-checklist')?.instructions).toContain('ship');
    expect(store.renderForPrompt()).toContain('deploy-checklist');
    expect(store.remove('deploy-checklist')).toBe(true);
    expect(store.list()).toHaveLength(0);
  });

  it('rejects empty instructions', () => {
    const dir = makeProject('skills2');
    const store = SkillStore.forProject(dir);
    expect(() => store.create({ name: 'x', description: '', instructions: ' ' })).toThrow();
  });
});

describe('cron', () => {
  it('parses schedules', () => {
    expect(parseEvery('30s')).toBe(30000);
    expect(parseEvery('5m')).toBe(300000);
    expect(parseEvery('1h')).toBe(3600000);
    expect(parseEvery('80')).toBe(80 * 60000);
    expect(() => parseEvery('soon')).toThrow();
  });

  it('adds and removes jobs', () => {
    const dir = makeProject('cron');
    const store = CronStore.forProject(dir);
    const job = store.add({ every: '10m', goal: 'heartbeat' });
    expect(store.jobs()).toHaveLength(1);
    expect(store.remove(job.id)).toHaveLength(0);
  });
});

describe('resume (same-session continuation)', () => {
  it('adds a new work phase after completed criteria instead of blocking or replacing history', async () => {
    const dir = makeProject('resume');
    const first = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['file exists'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'create file', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'write_file', params: { path: 'src/a.txt', content: 'v1\n' }, reason: 'create', expected: 'created' },
      }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'first task done', risks: [], followUps: [] } }),
    ]);
    const guard = ProjectGuard.detect(dir);
    const hermes1 = new Hermes({ cwd: dir, llm: first, mode: 'fast' });
    const { ledger: l1 } = await hermes1.run('first task');
    expect(l1.data.status).toBe('completed');
    const taskId = l1.data.taskId;

    const second = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['file updated'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'update file', verification: 'node --version' }] } }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-2', tool: 'apply_edit', params: { path: 'src/a.txt', oldString: 'v1', newString: 'v2' }, reason: 'update', expected: 'updated' },
      }),
      () => JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-2', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
      (_n, messages) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-2', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'continuation done', risks: [], followUps: [] } }),
    ]);
    const hermes2 = new Hermes({ cwd: dir, llm: second, mode: 'fast', resume: { taskId, message: 'now update the file to v2' } });
    const { ledger: l2 } = await hermes2.run('first task');

    expect(l2.data.taskId).toBe(taskId);
    expect(l2.data.status).toBe('completed');
    expect(l2.data.acceptanceCriteria).toMatchObject([
      { id: 'ac-1', text: 'file exists', satisfied: true },
      { id: 'ac-2', text: 'file updated', satisfied: true },
    ]);
    expect(l2.data.plan).toMatchObject([
      { id: 'step-1', description: 'create file', status: 'done' },
      { id: 'step-2', description: 'update file', status: 'done' },
    ]);
    void guard;
  }, 60000);
});
