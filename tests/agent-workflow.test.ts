import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as effortPlanner from '../src/agent/effort-planner.js';
import { agentVerificationGate, agentWorkflowPrompt, asksOnlyForVerificationChoice, isObservationTool } from '../src/agent/agent-workflow.js';
import type { BrowserBridge } from '../src/browser/browser.js';
import { planEffort } from '../src/agent/effort-planner.js';
import { Gitu } from '../src/agent/gitu.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { TaskLedgerData } from '../src/types.js';

type Reply = (call: number, messages: LlmMessage[]) => string;
const action = (a: Record<string, unknown>): Reply => () => JSON.stringify({ action: a });
const read = action({ type: 'tool_call', tool: 'read_file', params: { path: 'README.md' }, reason: 'Read the requested text', expected: 'Current wording' });
const edit = action({ type: 'tool_call', tool: 'write_file', params: { path: 'README.md', content: 'Hello world\n' }, reason: 'Correct the typo', expected: 'Corrected wording' });
const verify = action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs' }, reason: 'Check the corrected text', expected: 'Text matches the requested wording' });
const done = action({ type: 'complete', summary: 'Corrected the wording and checked it.' });
const reviewer: Reply = () => 'VERDICT: PASS\nFEEDBACK: The requested text is correct.';
function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-agent-workflow-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'agent-workflow', scripts: { test: 'node check.cjs' } }));
  writeFileSync(path.join(dir, 'README.md'), 'Helo world\n');
  writeFileSync(path.join(dir, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('README.md', 'utf8'), 'Hello world\\n');\n");
  return dir;
}

describe('unified Agent workflow', () => {
  it('classifies only safe inspection commands as observation, without treating checks or writes as conversation', () => {
    for (const command of ['git status --short', 'git diff --stat', 'git log -3 --oneline', 'pwd', 'node --version', 'Get-Content README.md | Select-Object -First 10']) {
      expect(isObservationTool('run_command', { command }), command).toBe(true);
    }
    for (const command of ['npm test', 'git status && node change.cjs', 'node --version && node change.cjs', 'git diff --output=changes.txt', 'git diff --ext-diff', 'git push', 'node -e "require(\'fs\').writeFileSync(\'x\', \'y\')"', 'Get-Content README.md > copy.md']) {
      expect(isObservationTool('run_command', { command }), command).toBe(false);
    }
    expect(isObservationTool('run_command', { action: 'stop', command: 'git status' })).toBe(false);
  });

  it('finishes a real shell investigation without inventing another verification command', async () => {
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([
        action({ type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'Inspect the installed Node version', expected: 'Installed version' }),
        action({ type: 'complete', summary: 'The installed Node version was reported by node --version.' }),
      ]),
    }).run('What Node version is installed?');
    expect(result.report.status).toBe('complete');
    expect(result.ledger.data.actions).toHaveLength(1);
    expect(result.ledger.data.actions[0]).toMatchObject({ tool: 'run_command', status: 'success', observationOnly: true });
    expect(result.ledger.data.actions[0]?.observation).toMatch(/v\d+\.\d+/);
  }, 30000);

  it.each([false, true])('reuses the actual browser workspace stamp after an unchanged check (parallel=%s)', async (parallel) => {
    const dir = project();
    writeFileSync(path.join(dir, 'index.html'), '<h1>Helo world</h1>\n');
    writeFileSync(path.join(dir, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('index.html', 'utf8'), '<h1>Hello world</h1>\\n');\n");
    let screenshots = 0;
    const state = { available: true, url: 'http://localhost:3000/', title: 'Greeting', canBack: false, canForward: false, loading: false };
    const browser = {
      available: () => true,
      state: () => state,
      screenshot: async () => { screenshots++; return { pngBase64: 'x'.repeat(300), state, textDigest: 'Hello world' }; },
    } as BrowserBridge;
    const look = { tool: 'browse', params: { action: 'screenshot' }, reason: 'Inspect the final greeting', expected: 'Correct greeting' };
    const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false, browser,
      llm: new ScriptedMockLlm([
        action({ type: 'tool_call', tool: 'read_file', params: { path: 'index.html' }, reason: 'Read greeting', expected: 'Current greeting' }),
        action({ type: 'tool_call', tool: 'write_file', params: { path: 'index.html', content: '<h1>Hello world</h1>\n' }, reason: 'Correct the greeting', expected: 'Correct greeting' }),
        action(parallel ? { type: 'parallel', calls: [
          { tool: 'read_file', params: { path: 'README.md' }, reason: 'Inspect the project greeting documentation', expected: 'Current documentation' },
          look,
        ] } : { type: 'tool_call', ...look }),
        verify, done, reviewer,
      ]),
    }).run('Correct the typo in index.html');
    expect(result.report.status, JSON.stringify(result.ledger.data.blockers)).toBe('complete');
    expect(screenshots).toBe(1);
    expect(result.ledger.data.actions.find(a => a.tool === 'browse')?.verifiedWorkspaceFingerprint).toBeTruthy();
    expect(result.ledger.data.actions.filter(a => a.tool === 'run_command')).toHaveLength(1);
  }, 30000);

  it('does not turn a useful single-surface plan into a second design and todo round', async () => {
    let planningNudge = false;
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([
        action({ type: 'set_plan', steps: [
          { description: 'Inspect the greeting', verification: 'Read the current wording', area: 'backend' },
          { description: 'Inspect the configured check', verification: 'Read check.cjs', area: 'backend' },
          { description: 'Explain findings', verification: 'Summarize the observed files', area: 'backend' },
        ] }),
        (_call, messages) => {
          planningNudge = messages.some(message => String(message.content).includes('PLANNING NOTE:'));
          return read(0, messages);
        },
        action({ type: 'complete', summary: 'The greeting contains a typo.' }),
      ]),
    }).run('Investigate how the greeting behaves');
    expect(result.report.status).toBe('complete');
    expect(planningNudge).toBe(false);
  }, 30000);

  it('chooses verification itself instead of repeatedly asking the user to select checks', async () => {
    const questions = [{ header: 'Verification', question: 'Which checks should I run: the focused test or the full build?', options: ['focused test', 'full build'] }];
    expect(asksOnlyForVerificationChoice(questions)).toBe(true);
    expect(asksOnlyForVerificationChoice([{ question: 'Which style do you want?', options: ['modern', 'classic'] }])).toBe(false);
    expect(asksOnlyForVerificationChoice([{ question: 'May I run tests against production with your credentials?', options: [] }])).toBe(false);
    expect(agentWorkflowPrompt(false)).toContain('Do not ask the user which tests');

    let asked = 0;
    let redirected = false;
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      askUserHandler: async () => { asked++; return 'focused test'; },
      llm: new ScriptedMockLlm([read, edit,
        action({ type: 'ask_user', questions }),
        (_call, messages) => {
          redirected = messages.some(message => String(message.content).includes('Do not ask the user to choose checks again.'));
          return verify(0, messages);
        },
        done, reviewer,
      ]),
    }).run('Correct the typo in README.md');
    expect(asked).toBe(0);
    expect(redirected).toBe(true);
    expect(result.report.status).toBe('complete');
  }, 30000);

  it('allows three different repairs to complete instead of accumulating old rejections', async () => {
    const repair = (content: string) => action({ type: 'tool_call', tool: 'write_file', params: { path: 'README.md', content }, reason: 'Repair the wording', expected: 'Correct text' });
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, repair('Hello one\n'), done,
        action({ type: 'tool_call', tool: 'write_file', params: { path: 'repair-notes.md', content: 'First diagnosis' }, reason: 'Save new diagnosis', expected: 'Saved notes' }), done,
        action({ type: 'tool_call', tool: 'write_file', params: { path: 'repair-details.md', content: 'Second diagnosis' }, reason: 'Save further diagnosis', expected: 'Saved details' }), done,
        edit, verify, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(result.report.status, JSON.stringify(result.ledger.data.blockers)).toBe('complete');
    expect(result.ledger.data.blockers).toEqual([]);
  }, 30000);

  it('keeps extending productive work past four checkpoints', async () => {
    const dir = project();
    const replies: Reply[] = [];
    for (let i = 0; i < 54; i++) {
      writeFileSync(path.join(dir, `note-${i}.md`), `Finding ${i}\n`);
      replies.push(action({ type: 'tool_call', tool: 'read_file', params: { path: `note-${i}.md` }, reason: `Inspect requested note ${i}`, expected: 'Requested content' }));
    }
    const effort = effortPlanner.planEffort('Inspect requested notes', { mode: 'agent' });
    const spy = vi.spyOn(effortPlanner, 'planEffort').mockReturnValue({ ...effort, maxTurns: 2 });
    try {
      const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false, llm: new ScriptedMockLlm([...replies, action({ type: 'complete', summary: 'Read all requested notes.' })]) }).run('Read all requested notes');
      expect(result.report.status).toBe('complete');
      expect(result.ledger.data.budgetExtensions!.length).toBeGreaterThan(4);
      expect(result.ledger.data.actions.filter(a => a.tool === 'read_file' && a.status === 'success')).toHaveLength(54);
    } finally { spy.mockRestore(); }
  }, 60000);

  it('never waives final UI verification after repeated completion attempts', async () => {
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, edit, action({ type: 'tool_call', tool: 'write_file', params: { path: 'index.html', content: '<h1>Hello</h1>' }, reason: 'Create the requested page', expected: 'Hello page' }), verify, done, done, done]),
    }).run('Create a Hello page and correct the wording in README.md');
    expect(result.report.status).toBe('blocked');
    expect(result.ledger.data.blockers.join(' ')).toContain('browser');
    expect(result.report.risks ?? []).not.toContain('Final UI state was never verified with a screenshot');
  }, 30000);

  it('stops repeated evidence rejection without claiming unverified work completed', async () => {
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, edit, done, done, done]),
    }).run('Correct the typo in README.md');
    expect(result.report.status).toBe('blocked');
    expect(result.ledger.data.blockers.join(' ')).toContain('two correction opportunities');
  }, 30000);

  it('accepts current document/browser verification without inventing a shell test', () => {
    const data = { actions: [{ tool: 'create_document', status: 'success' }], evidence: [{ kind: 'file', passed: true, workspaceFingerprint: 'after' }] } as unknown as TaskLedgerData;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(true);
    data.actions[0]!.tool = 'write_file';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.actions[0]!.tool = 'browse';
    data.evidence[0]!.kind = 'manual';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(true);
    data.evidence[0]!.stale = true;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
  });
  it('requires fresh passing evidence for every formal criterion command', () => {
    const data = {
      actions: [{ tool: 'write_file', status: 'success' }],
      acceptanceCriteria: [{ id: 'ac-1', text: 'Typecheck and test', status: 'pending', criterionCommands: ['npm run typecheck', 'npm test'] }],
      evidence: [{ kind: 'command', passed: true, command: 'npm run typecheck', workspaceFingerprint: 'after' }],
    } as unknown as TaskLedgerData;

    const criterionCommands = new Set(['npm run typecheck', 'npm test']);
    expect(agentVerificationGate(data, 'before', 'after', criterionCommands).open).toBe(false);
    data.evidence.push({ kind: 'command', passed: true, command: 'npm test', workspaceFingerprint: 'after' });
    expect(agentVerificationGate(data, 'before', 'after', criterionCommands).open).toBe(true);
  });

  it('keeps high model effort while giving a typo edit a lightweight task budget', () => {
    const effort = planEffort('Correct a typo in README.md', { mode: 'agent', explicitEffort: 'high' });
    expect(effort.complexity).toBe('low');
    expect(effort.llmEffort).toBe('high');
    expect(effort.verificationDepth).toBe('light');
  });

  it('answers directly and then edits in the same task without criteria or a formal plan', async () => {
    const dir = project();
    const first = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([action({ type: 'complete', chat: true, summary: 'I can help with questions or changes.' })]),
    }).run('Hello');
    expect(first.report.status).toBe('complete');
    const second = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      resume: { taskId: first.ledger.data.taskId, message: 'Correct the typo in README.md' },
      llm: new ScriptedMockLlm([read, edit, verify, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(second.report.status).toBe('complete');
    expect(second.ledger.data.acceptanceCriteria).toEqual([]);
    expect(second.ledger.data.plan).toEqual([]);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Hello world\n');
    expect(second.ledger.data.evidence.some(e => e.passed && e.command === 'node check.cjs')).toBe(true);
  }, 30000);

  it('answers repository questions after reading without demanding code changes or tests', async () => {
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, action({ type: 'complete', summary: 'The README currently says Helo world.' })]),
    }).run('What does README.md say?');
    expect(result.report.status).toBe('complete');
    expect(result.ledger.data.evidence).toEqual([]);
    expect(result.ledger.data.plan).toEqual([]);
  }, 30000);

  it('pauses execution and discusses first when the user asks it to stop', async () => {
    const dir = project();
    const guard = ProjectGuard.detect(dir);
    const unfinished = TaskLedger.create({ repoRoot: guard.lock.repoRoot, goal: 'Correct the typo in README.md', project: guard.lock, mode: 'agent' });
    unfinished.setPlan([{ description: 'Edit the greeting', verification: 'node check.cjs' }]);
    const events: string[] = [];
    const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false, onEvent: (event) => events.push(event),
      resume: { taskId: unfinished.data.taskId, message: 'Stop and discuss first before you edit README.md. What wording should we use?' },
      llm: new ScriptedMockLlm([
        edit,
        action({ type: 'complete', chat: true, summary: 'I paused the edit. The typo is in the greeting, and we can decide the exact wording before I change it.' }),
      ]),
    }).run('Stop and discuss first before you edit README.md. What wording should we use?');

    expect(result.report.status).toBe('blocked');
    expect(result.ledger.data.blockers).toContain('Paused for discussion with the user.');
    expect(result.ledger.data.actions).toHaveLength(0);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Helo world\n');
    expect(events).toContain('say I paused the edit. The typo is in the greeting, and we can decide the exact wording before I change it.');
  }, 30000);

  it('starts the requested work after a paused discussion', async () => {
    const dir = project();
    const guard = ProjectGuard.detect(dir);
    const unfinished = TaskLedger.create({ repoRoot: guard.lock.repoRoot, goal: 'Correct the typo in README.md', project: guard.lock, mode: 'agent' });
    unfinished.setPlan([{ description: 'Edit the greeting', verification: 'node check.cjs' }]);

    const discussed = await new Gitu({
      cwd: dir,
      mode: 'agent',
      autoLearn: false,
      resume: { taskId: unfinished.data.taskId, message: 'Stop and discuss first. What wording should we use?' },
      llm: new ScriptedMockLlm([action({ type: 'complete', chat: true, summary: 'I paused the edit so we can choose the wording.' })]),
    }).run('Stop and discuss first. What wording should we use?');
    expect(discussed.ledger.data.blockers).toContain('Paused for discussion with the user.');

    const resumed = await new Gitu({
      cwd: dir,
      mode: 'agent',
      autoLearn: false,
      resume: { taskId: unfinished.data.taskId, message: 'Can you now fix the typo in README.md?' },
      llm: new ScriptedMockLlm([read, edit, verify, done, reviewer]),
    }).run('Can you now fix the typo in README.md?');

    expect(resumed.ledger.data.blockers).not.toContain('Paused for discussion with the user.');
    expect(resumed.ledger.data.actions.some((item) => item.tool === 'write_file' && item.status === 'success')).toBe(true);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Hello world\n');
  }, 30000);

  it('uses the actual action reason for progress without a Next prefix or private thoughts', async () => {
    const events: string[] = [];
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      onEvent: event => events.push(event),
      llm: new ScriptedMockLlm([
        () => JSON.stringify({ thought: 'Private internal deliberation', action: { type: 'tool_call', tool: 'read_file', params: { path: 'README.md' }, reason: 'Next: Reading README.md to confirm the current wording', expected: 'Current text' } }),
        action({ type: 'complete', summary: 'The README currently says Helo world.' }),
      ]),
    }).run('What does README.md say?');

    expect(result.report.status).toBe('complete');
    expect(events).toContain('say Reading README.md to confirm the current wording');
    expect(events.some(event => event.startsWith('say Next:'))).toBe(false);
    expect(events.some(event => event.startsWith('say ') && event.includes('Private internal deliberation'))).toBe(false);
  }, 30000);

  it('preserves the full developed conversational answer in the report', async () => {
    const explanation = [
      'A focused check confirms the part of the project that changed. For a wording correction, that can be an assertion against the updated text; for a behavior change, it should exercise that behavior.',
      'Broader verification checks how the change interacts with the rest of the application. It may include type checking, the relevant existing tests, a build, and a browser inspection for visible behavior. Each check establishes a different part of the result.',
      'Evidence records the command, its result, and the workspace version it checked. A passing check from before the latest edit cannot establish that the current result works. The final response should explain which checks ran, what they proved, and any important limits so you can assess the result.',
    ].join('\n\n');
    expect(explanation.length).toBeGreaterThan(600);
    const result = await new Gitu({ cwd: project(), mode: 'chat', autoLearn: false,
      llm: new ScriptedMockLlm([() => explanation]),
    }).run('Explain focused checks, broader verification, and evidence.');

    expect(result.report.status).toBe('complete');
    expect(result.report.summary).toBe(explanation);
    expect(result.ledger.data.report?.summary).toBe(explanation);
  }, 30000);

  it('rejects an unverified edit even when the model calls it a chat reply', async () => {
    let rejected = false;
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([read, edit, action({ type: 'complete', chat: true, summary: 'Done' }), (_call, messages) => {
        rejected = messages.some(m => typeof m.content === 'string' && m.content.includes('COMPLETION REJECTED'));
        return verify(0, messages);
      }, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(rejected).toBe(true);
    expect(result.report.status).toBe('complete');
  }, 30000);

  it('holds writes until plan approval, then builds, and does not review the next request', async () => {
    const dir = project();
    let reviews = 0;
    const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false, requirePlanReview: true,
      planReviewHandler: () => {
        reviews++;
        expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('Helo world\n');
        return { approved: true };
      },
      llm: new ScriptedMockLlm([edit, read,
        action({ type: 'set_plan', steps: [{ description: 'Correct README.md wording', verification: 'node check.cjs' }] }),
        edit, verify, done, done, reviewer]),
    }).run('Correct the typo in README.md');
    expect(reviews).toBe(1);
    expect(result.report.status).toBe('complete');
    const next = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      resume: { taskId: result.ledger.data.taskId, message: 'What does README.md say now?' },
      planReviewHandler: () => { reviews++; return { approved: true }; },
      llm: new ScriptedMockLlm([read, action({ type: 'complete', summary: 'It says Hello world.' })]),
    }).run('What does README.md say now?');
    expect(next.report.status).toBe('complete');
    expect(reviews).toBe(1);
  }, 30000);

  it('rejects stale, failed, or trivial evidence and accepts a fresh focused check', () => {
    const data = { actions: [{ tool: 'write_file', status: 'success' }], evidence: [] } as unknown as TaskLedgerData;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence = [{ command: 'node check.cjs', passed: true, workspaceFingerprint: 'before' }] as TaskLedgerData['evidence'];
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence[0]!.workspaceFingerprint = 'after';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(true);
    data.evidence[0]!.passed = false;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
    data.evidence[0]!.passed = true;
    data.evidence[0]!.command = 'echo done';
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
  });

  it('completes when current criterion evidence passes after an abandoned command failure', async () => {
    const dir = project();
    const failed = action({ type: 'tool_call', tool: 'run_command', params: { command: 'node -e "process.exit(1)"' }, reason: 'Try a combined check', expected: 'exit 0' });
    const claim: Reply = (_call, messages) => {
      const evidenceId = [...messages].reverse().map(message => /EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6}) \[PASS\]/.exec(String(message.content))?.[1]).find(Boolean);
      return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evidenceId ?? 'ev-missing' } });
    };
    const result = await new Gitu({ cwd: dir, mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([
        action({ type: 'set_criteria', criteria: [{ text: 'The corrected wording passes its configured check', verification: 'node check.cjs', evidenceType: 'command_success' }] }),
        edit, failed, verify, claim, done, reviewer,
      ]),
    }).run('Correct the typo in README.md');

    expect(result.ledger.data.evidence.map(e => e.passed)).toEqual([false, true]);
    expect(result.ledger.data.acceptanceCriteria[0]?.satisfied).toBe(true);
    expect(result.ledger.data.acceptanceCriteria[0]).toMatchObject({
      text: 'The corrected wording passes its configured check',
      verification: 'node check.cjs', evidenceType: 'command_success',
    });
    expect(result.report.status).toBe('complete');
  }, 30000);

  it('reuses current supporting evidence without requiring obsolete linked commands', async () => {
    const claim: Reply = (_call, messages) => {
      const evidenceId = [...messages].reverse().map(message => /EVIDENCE RECORDED: (ev-\d{8}-[0-9a-f]{6}) \[PASS\]/.exec(String(message.content))?.[1]).find(Boolean);
      return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId } });
    };
    const result = await new Gitu({ cwd: project(), mode: 'agent', autoLearn: false,
      llm: new ScriptedMockLlm([
        action({ type: 'set_criteria', criteria: ['The corrected wording is verified'] }),
        edit, verify, claim,
        action({ type: 'tool_call', tool: 'write_file', params: { path: 'notes.md', content: 'Updated verification notes' }, reason: 'Record the result', expected: 'Notes saved' }),
        action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs --focused' }, reason: 'Verify the final workspace', expected: 'Correct wording' }),
        claim, done, reviewer,
      ]),
    }).run('Correct the typo in README.md');
    expect(result.ledger.data.acceptanceCriteria[0]?.evidenceIds).toHaveLength(2);
    expect(result.report.status).toBe('complete');
  }, 30000);

  it('allows a corrected diagnostic to replace an earlier unpinned failure', () => {
    const data = { actions: [{ tool: 'write_file', status: 'success' }], evidence: [
      { command: 'node wrong-assertion.cjs', passed: false, workspaceFingerprint: 'after' },
      { command: 'node corrected-assertion.cjs', passed: true, workspaceFingerprint: 'after' },
    ] } as unknown as TaskLedgerData;
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(true);
    data.evidence.push({ command: 'node wrong-assertion.cjs', passed: false, workspaceFingerprint: 'after', outputExcerpt: 'Expected 200, got 500' } as TaskLedgerData['evidence'][number]);
    const gate = agentVerificationGate(data, 'before', 'after');
    expect(gate.open).toBe(false);
    expect(gate.reason).toContain('node wrong-assertion.cjs');
    expect(gate.reason).toContain('Expected 200, got 500');
    data.evidence.push({ command: 'node -e "console.log(\'PASS\')"', passed: true, workspaceFingerprint: 'after' } as TaskLedgerData['evidence'][number]);
    expect(agentVerificationGate(data, 'before', 'after').open).toBe(false);
  });

  it('still blocks a later failure of the required verification command', () => {
    const data = { actions: [{ tool: 'write_file', status: 'success' }], evidence: [
      { command: 'node exploratory.cjs', passed: false, workspaceFingerprint: 'after' },
      { command: 'node check.cjs', passed: true, workspaceFingerprint: 'after' },
    ] } as unknown as TaskLedgerData;
    const required = new Set(['node check.cjs']);
    expect(agentVerificationGate(data, 'before', 'after', required).open).toBe(true);
    data.evidence.push({ command: 'node check.cjs', passed: false, workspaceFingerprint: 'after' } as TaskLedgerData['evidence'][number]);
    expect(agentVerificationGate(data, 'before', 'after', required).open).toBe(false);
  });
});
