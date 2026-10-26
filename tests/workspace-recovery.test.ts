import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import { answerQuestionsOnce } from '../src/agent/question-memory.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { CapabilityAwareResolver } from '../src/recovery/prerequisites.js';
import { inspectWorkspace, workspaceQuestionOptions, isWorkspaceIdentityQuestion } from '../src/recovery/workspace.js';
import type { MissingPrerequisite } from '../src/types.js';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, access: vi.fn(actual.access) };
});
const realAccess = vi.mocked(fs.access).getMockImplementation()!;

const roots: string[] = [];
function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-workspace-recovery-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'workspace-recovery' }));
  writeFileSync(path.join(root, 'README.md'), 'Before\n');
  writeFileSync(path.join(root, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('README.md','utf8'),'After\\n');");
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(fs.access).mockImplementation(realAccess);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const prerequisite: MissingPrerequisite = { id: 'writable-project', kind: 'resource', description: 'Open the repository as a writable workspace with read and command-execution tools', requiredFor: 'Implement the requested change' };
const action = (value: Record<string, unknown>) => () => JSON.stringify({ action: value });
const read = action({ type: 'tool_call', tool: 'read_file', params: { path: 'README.md' }, reason: 'Inspect current wording', expected: 'Before' });
const edit = action({ type: 'tool_call', tool: 'write_file', params: { path: 'README.md', content: 'After\n' }, reason: 'Apply requested wording', expected: 'After' });
const check = action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs' }, reason: 'Verify requested wording', expected: 'exit 0' });
const done = action({ type: 'complete', summary: 'Changed wording and verified it.' });
const review = () => 'VERDICT: PASS\nFEEDBACK: Verified the requested wording.';
const gatedCommand = action({ type: 'tool_call', tool: 'run_command', params: { command: 'echo approved > permission.txt' }, reason: 'Create the requested local approval marker', expected: 'Marker file exists' });

describe('selected workspace recovery', () => {
  it('asks about a wrong project even when the selected folder is writable, and waits for explicit confirmation', async () => {
    const root = project();
    const ask = vi.fn(async () => { expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('Before\n'); return root; });
    const result = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false, askUserHandler: ask, approver: async () => true,
      llm: new ScriptedMockLlm([read, action({ type: 'ask_user', questions: [{ kind: 'workspace', question: 'The current folder appears to contain the wrong project. Which folder should I use?', options: [root] }] }), edit, check, done, review]),
    }).run('Change README.md from Before to After and check it');
    expect(ask).toHaveBeenCalledOnce(); expect(result.report.status).toBe('complete');
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('After\n');
  }, 60000);

  it('blocks a wrong-folder question when no user handler is available instead of assuming and editing', async () => {
    const root = project();
    expect(isWorkspaceIdentityQuestion({ question: 'The workspace repository does not match the requested project.' })).toBe(true);
    const result = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, action({ type: 'ask_user', questions: [{ kind: 'workspace', question: 'The selected folder is the wrong project. Which folder is intended?', options: [root] }] }), edit, check, done, review]),
    }).run('Change README.md from Before to After and check it');
    expect(result.report.status).toBe('blocked'); expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('Before\n');
    expect(result.ledger.data.actions.filter(item => item.tool === 'write_file')).toHaveLength(0);
  }, 60000);

  it('reuses the actual authorized checkout, even on repeated blocks, without connector discovery or questions', async () => {
    const root = project();
    const discover = vi.fn();
    const ask = vi.fn(async () => 'not needed');
    const approve = vi.fn(async () => true);
    const result = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false, askUserHandler: ask, approvalHandler: approve,
      prerequisiteRecovery: { providers: [{ id: 'irrelevant', capabilities: [{ id: 'servers.read', provider: 'irrelevant', actions: ['list'], riskClass: 'read' }], discover }] },
      llm: new ScriptedMockLlm([read,
        action({ type: 'request_block', reason: 'The reasoning sandbox is read-only', prerequisite }),
        action({ type: 'request_block', reason: 'Still read-only', prerequisite }),
        action({ type: 'request_block', reason: 'The reasoning sandbox says permission is missing', prerequisite: { ...prerequisite, kind: 'permission' } }),
        action({ type: 'ask_user', questions: [{ question: 'Which writable workspace should I use?', options: ['mailcow-broker-key', 'server', 'server', 'github'] }] }),
        edit, check, done, review]),
    }).run('Change README.md from Before to After and check it');
    expect(result.report.status, JSON.stringify(result.ledger.data.blockers)).toBe('complete');
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('After\n');
    expect(ask).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    expect(result.ledger.data.actions.some(a => a.tool === 'write_file' && a.status === 'success')).toBe(true);
    expect(result.ledger.data.actions.filter(a => a.tool === 'read_file')).toHaveLength(1);
  }, 30000);

  it('does not turn a conversational yes into denied command approval and resumes the same task after approval', async () => {
    const root = project();
    const ask = vi.fn(async () => 'yes');
    const blocked = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false, approvalHandler: async () => false, askUserHandler: ask,
      llm: new ScriptedMockLlm([read, action({ type: 'ask_user', questions: [{ question: 'Can the marker be created?', options: ['Yes', 'No'] }] }), gatedCommand, action({ type: 'request_block', reason: 'Command permission required', prerequisite: { ...prerequisite, kind: 'permission' } })]),
    }).run('Change README.md from Before to After and check it');
    expect(blocked.report.status).toBe('blocked');
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('Before\n');
    expect(ask).toHaveBeenCalledTimes(1); // no redundant question after the approval was denied
    const approval = vi.fn(async () => true);
    const resumed = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false, approvalHandler: approval,
      resume: { taskId: blocked.ledger.data.taskId, message: 'Continue the task' }, llm: new ScriptedMockLlm([gatedCommand, edit, check, done, review]),
    }).run('Change README.md from Before to After and check it');
    expect(resumed.report.status, JSON.stringify(resumed.ledger.data.blockers)).toBe('complete');
    expect(resumed.ledger.data.taskId).toBe(blocked.ledger.data.taskId);
    expect(resumed.ledger.data.actions.filter(a => a.tool === 'read_file')).toHaveLength(1);
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('After\n');
    expect(approval).toHaveBeenCalled();
  }, 30000);

  it('verifies read, write and command working-directory access separately', async () => {
    const root = project(), outside = project();
    const guard = ProjectGuard.detect(root);
    guard.setTaggedReadFolders(() => [outside]);
    expect(await inspectWorkspace(root, guard)).toMatchObject({ exists: true, readable: true, writable: true, executable: true });
    expect(await inspectWorkspace(outside, guard)).toMatchObject({ exists: true, readable: true, writable: false, executable: false });
    expect(await workspaceQuestionOptions([outside], guard)).toEqual([]);
    expect(await workspaceQuestionOptions([outside], guard, 'Choose a read-only reference workspace')).toEqual([outside]);
    guard.setTaggedWriteFolders(() => [outside]);
    expect(await inspectWorkspace(outside, guard)).toMatchObject({ readable: true, writable: true, executable: false });
    guard.setTaggedReadFolders(() => []); guard.setTaggedWriteFolders(() => []);
    expect(await inspectWorkspace(outside, guard)).toMatchObject({ exists: false, readable: false, writable: false });
  });

  it('rejects missing, invalid, ungranted and connector choices; deduplicates real paths without merging distinct folders', async () => {
    const root = project(), outside = project();
    const a = path.join(root, 'a'), b = path.join(root, 'b'); mkdirSync(a); mkdirSync(b);
    const guard = ProjectGuard.detect(root);
    expect(await workspaceQuestionOptions(['server', 'github', outside, path.join(root, 'missing'), path.join(root, 'README.md'), a, path.join(a, '.'), b], guard)).toEqual([a, b]);
    await expect(ProjectGuard.detectAsync(path.join(root, 'missing'))).rejects.toThrow('not an existing directory');
    expect(() => ProjectGuard.detect(path.join(root, 'missing'))).toThrow('not an existing directory');
  });

  it('does not claim a selected but OS read-only directory is writable', async () => {
    const root = project(), guard = ProjectGuard.detect(root);
    vi.mocked(fs.access).mockImplementation(async (candidate, mode) => {
      if (mode === 2) throw Object.assign(new Error('access denied'), { code: 'EACCES' });
      return realAccess(candidate, mode);
    });
    const workspace = await inspectWorkspace(root, guard);
    expect(workspace).toMatchObject({ readable: true, writable: false });
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'Edit text', project: guard.lock, mode: 'agent' });
    const result = await new CapabilityAwareResolver().resolve(prerequisite, { repoRoot: root, goal: 'Edit text', ledger, workspace: async () => workspace });
    expect(result).toMatchObject({ status: 'needs-user', question: { options: [], kind: 'workspace' } });
  });

  it('keeps answers across a ledger reload, but asks again when choices or the goal change', async () => {
    const root = project(), guard = ProjectGuard.detect(root);
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'Clarify region', project: guard.lock, mode: 'agent' });
    const questions = [{ question: 'Which region?', options: ['EU', 'US'] }];
    const ask = vi.fn(async () => 'EU');
    await answerQuestionsOnce(ledger, 'Clarify region', questions, ask);
    const reloaded = TaskLedger.load(root, ledger.data.taskId)!;
    expect(await answerQuestionsOnce(reloaded, 'Clarify region', questions, ask)).toEqual({ answer: 'EU', reused: true });
    await answerQuestionsOnce(reloaded, 'Clarify region', [{ ...questions[0]!, options: ['Asia', 'EU'] }], ask);
    await answerQuestionsOnce(reloaded, 'New task', questions, ask);
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it('does not resolve a request for a different or nonexistent folder using the selected project', async () => {
    const root = project(), guard = ProjectGuard.detect(root);
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'Edit text', project: guard.lock, mode: 'agent' });
    const result = await new CapabilityAwareResolver().resolve({ ...prerequisite, kind: 'workspace', workspacePath: path.join(root, 'missing') }, {
      repoRoot: root, goal: 'Edit text', ledger, workspace: () => inspectWorkspace(root, guard),
    });
    expect(result).toMatchObject({ status: 'needs-user', question: { options: [] } });
  });

  it('drops a read grant revoked while the filesystem probe is pending', async () => {
    const root = project(), outside = project(), guard = ProjectGuard.detect(root);
    let granted = true;
    guard.setTaggedReadFolders(() => granted ? [outside] : []);
    vi.mocked(fs.access).mockImplementation(async (candidate, mode) => { granted = false; return realAccess(candidate, mode); });
    expect(await inspectWorkspace(outside, guard)).toMatchObject({ exists: false, readable: false, writable: false });
  });

  it('pauses instead of substituting the current project for an inaccessible explicit question target', async () => {
    const root = project();
    const ask = vi.fn(async () => 'done');
    const result = await new Gitu({ cwd: root, mode: 'agent', autoLearn: false, askUserHandler: ask,
      llm: new ScriptedMockLlm([read, action({ type: 'ask_user', questions: [{ kind: 'workspace', question: 'Which writable workspace should I use?', options: [path.join(root, 'missing')] }] }), edit, check, done, review]),
    }).run('Change README.md from Before to After and check it');
    expect(result.report.status).toBe('blocked');
    expect(ask).toHaveBeenCalledWith([expect.objectContaining({ kind: 'workspace', options: [] })]);
    expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('Before\n');
    expect(result.ledger.data.actions.filter(action => action.tool === 'write_file')).toHaveLength(0);
  }, 30000);
});
