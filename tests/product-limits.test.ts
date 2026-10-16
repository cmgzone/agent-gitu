import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAction } from '../src/agent/action-parser.js';
import { resolveAutonomy, turnCeilingFor } from '../src/agent/autonomy.js';
import { CodeIndex } from '../src/context/code-index.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { toolListFiles, toolReadFile, toolSearchFiles, type ToolContext } from '../src/tools/tools.js';
import { CoworkLiveMailbox } from '../src/cowork/live-messages.js';
import { CoworkRecall } from '../src/cowork/recall.js';
import { CoworkStore } from '../src/cowork/store.js';
import { sanitizeAgentProfile } from '../src/cowork/profile-config.js';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-no-product-cap-'));
  writeFileSync(path.join(root, 'package.json'), '{"name":"unrestricted-fixture"}');
  const guard = ProjectGuard.detect(root);
  return { root, guard, context: { guard } as ToolContext };
}

describe('user-controlled product limits', () => {
  it('retains guidance, profile roles and recall results above their old count caps', async () => {
    const { root } = fixture();
    const store = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = store.saveAgent({ name: 'Reader', systemPrompt: 'Follow the saved guidance.' });
    const conversation = store.saveConversation({ memberIds: [agent.id], kind: 'dm' });
    const mailbox = new CoworkLiveMailbox();
    for (let i = 0; i < 60; i++) {
      const message = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: `unique recallmarker requirement ${i}` });
      expect(mailbox.add(message)).toBe(true);
    }
    expect(mailbox.take(agent.id)).toHaveLength(60);
    expect(mailbox.take(agent.id)).toHaveLength(0);
    const profile = sanitizeAgentProfile({ roles: Array.from({ length: 20 }, (_, i) => ({ id: `role-${i}`, name: `Role ${i}`, responsibilities: 'Full instructions '.repeat(100) })) });
    expect(profile.roles).toHaveLength(20);
    expect(profile.roles?.[19]?.responsibilities).toBe('Full instructions '.repeat(100).trim());
    const recall = new CoworkRecall(path.join(root, 'recall.db'), store);
    try {
      expect(await recall.search('recallmarker')).toHaveLength(60);
      expect(await recall.search('recallmarker', { limit: 3 })).toHaveLength(3);
    } finally { recall.close(); }
  }, 60000);
  it('reads full text beyond the old line and character caps and honors requested ranges', () => {
    const { root, context } = fixture();
    const text = Array.from({ length: 3000 }, (_, i) => `Line ${i} ${'content '.repeat(10)}`).join('\n') + '\nLAST_REQUESTED_LINE';
    writeFileSync(path.join(root, 'large.txt'), text);
    const full = toolReadFile(context, { path: 'large.txt' });
    expect(full.ok).toBe(true);
    expect(full.output).toContain('LAST_REQUESTED_LINE');
    expect(full.output.length).toBeGreaterThan(60_000);
    const requested = toolReadFile(context, { path: 'large.txt', offset: 1, limit: 1 });
    expect(requested.output).toContain('1: Line 0');
    expect(requested.output).not.toContain('2: Line 1');
  });

  it('allows files above the old byte limit with an explicitly narrow read', () => {
    const { root, context } = fixture();
    writeFileSync(path.join(root, 'large.txt'), 'Readable header\n' + 'x'.repeat(21 * 1024 * 1024));
    const result = toolReadFile(context, { path: 'large.txt', limit: 1 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Readable header');
  });

  it('indexes and lists a deep project above the old file count and per-file size caps', () => {
    const { root, context } = fixture();
    for (let i = 0; i < 2100; i++) writeFileSync(path.join(root, `file-${i}.ts`), `export const value${i} = ${i};`);
    const deep = path.join(root, ...Array.from({ length: 12 }, (_, i) => `nested${i}`));
    mkdirSync(deep, { recursive: true });
    writeFileSync(path.join(deep, 'deep.ts'), 'export const deepmarker = true;');
    writeFileSync(path.join(root, 'wide.ts'), '// padding\n'.repeat(30_000) + 'export const widemarker = true;');
    const index = new CodeIndex(root, path.join(mkdtempSync(path.join(tmpdir(), 'gitu-index-limit-')), 'index.db'));
    try {
      const result = index.refresh(root, context.guard.lock.ignorePaths);
      expect(result.added).toBeGreaterThan(2000);
      expect(index.contentMatches(['deepmarker']).size).toBe(1);
      expect(index.contentMatches(['widemarker']).has('wide.ts')).toBe(true);
      const listing = toolListFiles(context, {});
      expect(listing.output).toContain('file-2099.ts');
      expect(listing.output).toContain('deep.ts');
    } finally { index.close(); }
  }, 60000);

  it('searches all matches in larger files and honors an explicit requested result limit', async () => {
    const { root, context } = fixture();
    writeFileSync(path.join(root, 'wide.txt'), 'padding '.repeat(40_000) + '\n' + 'needle\n'.repeat(700));
    const full = await toolSearchFiles(context, { path: '.', pattern: 'needle', mode: 'literal' });
    expect(full.output).toContain('matches=700');
    const chosen = await toolSearchFiles(context, { path: '.', pattern: 'needle', mode: 'literal', maxResults: 3 });
    expect(chosen.output).toContain('matches=3');
  });

  it('preserves large plans, todos, criteria and user turn ceilings', () => {
    const { root, guard } = fixture();
    const description = 'A complete requested requirement '.repeat(30);
    const steps = Array.from({ length: 40 }, () => ({ description, verification: description, subtasks: Array.from({ length: 20 }, (_, i) => description + i) }));
    const parsed = parseAction({ action: { type: 'set_plan', steps } });
    expect(parsed?.type).toBe('set_plan');
    if (parsed?.type !== 'set_plan') throw new Error('Plan was not parsed');
    expect(parsed.steps).toHaveLength(40);
    expect(parsed.steps[39]?.subtasks).toHaveLength(20);
    expect(parsed.steps[39]?.subtasks?.[19]).toBe(description + '19');
    const ledger = TaskLedger.create({ repoRoot: root, project: guard.lock, goal: description, mode: 'agent' });
    ledger.setPlan(steps);
    expect(ledger.data.plan).toHaveLength(40);
    expect(ledger.data.plan[39]?.description).toBe(description);
    expect(ledger.data.plan[39]?.subtasks).toHaveLength(20);
    expect(turnCeilingFor(resolveAutonomy())).toBe(Infinity);
    expect(turnCeilingFor(resolveAutonomy({ maxTurns: 5000 }))).toBe(5000);
  });
});
