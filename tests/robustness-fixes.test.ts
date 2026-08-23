import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyTaskComplexity } from '../src/agent/effort-planner.js';
import { Hermes } from '../src/agent/hermes.js';
import { EvidenceEngine, isWeakEvidenceLink } from '../src/evidence/evidence.js';
import { getWorkspaceFingerprint } from '../src/git/git.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { toolApplyEdit, toolWriteFile, type ToolContext } from '../src/tools/tools.js';
import { Reporter } from '../src/report/reporter.js';
import { SkillStore } from '../src/skills/skills.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-fixes-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `fixes-${name}` }, null, 2));
  return dir;
}

function ctx(dir: string): ToolContext {
  return { guard: ProjectGuard.detect(dir), cwd: dir };
}

describe('apply_edit line-ending tolerance', () => {
  it('edits a CRLF file using LF oldString', () => {
    const dir = makeProject('crlf');
    const file = path.join(dir, 'app.js');
    writeFileSync(file, 'function a() {\r\n  return 1;\r\n}\r\n', 'utf8');
    const result = toolApplyEdit(ctx(dir), {
      path: 'app.js',
      oldString: 'function a() {\n  return 1;\n}',
      newString: 'function a() {\n  return 42;\n}',
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('normalized line endings');
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('return 42;');
    expect(after).toContain('\r\n'); // CRLF style preserved
  });

  it('still fails cleanly when the text truly does not exist', () => {
    const dir = makeProject('nomatch');
    writeFileSync(path.join(dir, 'app.js'), 'const x = 1;\n', 'utf8');
    const result = toolApplyEdit(ctx(dir), { path: 'app.js', oldString: 'nope', newString: 'yep' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('not found');
  });
});

describe('write_file truncation heuristic', () => {
  it('warns on badly unbalanced output', () => {
    const dir = makeProject('trunc');
    const truncated = `function big() {\n${Array.from({ length: 30 }, (_x, i) => `  if (x${i}) { foo(${i});`).join('\n')}`;
    const result = toolWriteFile(ctx(dir), { path: 'big.js', content: truncated });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('TRUNCATED');
  });

  it('stays silent on balanced files', () => {
    const dir = makeProject('balanced');
    const fine = `function ok() {\n  return [1, 2].map((n) => ({ n }));\n}\n`;
    const result = toolWriteFile(ctx(dir), { path: 'ok.js', content: fine });
    expect(result.output).not.toContain('TRUNCATED');
  });
});

describe('prose stream survives braces in commentary', () => {
  it('does not cut user-facing text at a literal brace before the JSON action', async () => {
    const dir = makeProject('brace-prose');
    const events: string[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n, messages) => {
        const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return 'The config uses {braces} like {a}: 1.\n' + JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });
    const { report } = await hermes.run('Verify node works');

    expect(report.status).toBe('complete');
    const say = events.filter((e) => e.startsWith('say ')).join('\n');
    expect(say).toContain('{braces}');
    expect(say).toContain('{a}: 1');
  }, 30000);
});

describe('skill resolver word boundaries', () => {
  function storeWith(names: string[]): SkillStore {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-skillb-'));
    const store = new SkillStore(dir);
    for (const name of names) {
      store.create({ name, description: `${name} skill`, instructions: `do ${name} steps` });
    }
    return store;
  }

  it('does not auto-activate "test" for the word "latest"', () => {
    const resolver = storeWith(['test']).resolver();
    const result = resolver.resolve('fix the latest bug');
    expect(result.highConfidence).toHaveLength(0);
  });

  it('still activates on whole-word matches', () => {
    const resolver = storeWith(['deploy-checklist']).resolver();
    const result = resolver.resolve('please run deploy-checklist for release');
    expect(result.highConfidence.map((s) => s.name)).toContain('deploy-checklist');
  });

  it('activates on whole-word alias matches only', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-skilla-'));
    const store = new SkillStore(dir);
    store.create({ name: 'release-flow', description: 'release steps', instructions: 'steps', aliases: ['ship'] });
    expect(store.resolver().resolve('ship it now').highConfidence.length).toBe(1);
    expect(store.resolver().resolve('membership report').highConfidence.length).toBe(0);
  });
});

describe('effort planner keyword precision', () => {
  it('data formatting is NOT low complexity anymore', () => {
    expect(classifyTaskComplexity('Format the data as JSON for the API').complexity).toBe('medium');
  });

  it('code formatting stays low', () => {
    expect(classifyTaskComplexity('Run prettier on src').complexity).toBe('low');
    expect(classifyTaskComplexity('Fix indentation and whitespace').complexity).toBe('low');
  });

  it('non-database migrations are no longer auto-high', () => {
    expect(classifyTaskComplexity('Migrate the blog to Hugo').complexity).toBe('medium');
  });

  it('database migrations stay high', () => {
    expect(classifyTaskComplexity('Migrate the database schema').complexity).toBe('high');
  });
});

describe('non-git workspace fingerprint', () => {
  it('is stable while untouched and changes on writes', async () => {
    const dir = makeProject('fingerprint');
    writeFileSync(path.join(dir, 'a.txt'), 'one');
    const fp1 = await getWorkspaceFingerprint(dir);
    expect(fp1).not.toBe('non-git-repo');
    const fp2 = await getWorkspaceFingerprint(dir);
    expect(fp2).toBe(fp1);

    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(path.join(dir, 'a.txt'), 'two');
    const fp3 = await getWorkspaceFingerprint(dir);
    expect(fp3).not.toBe(fp1);
  });
});

describe('weak evidence links are surfaced', () => {
  function ledgerWith(criteria: Parameters<typeof EvidenceEngine.criteriaFromTexts>[0] | ReturnType<typeof EvidenceEngine.criteriaFromSpecs>): Parameters<EvidenceEngine['record']>[0] {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      taskId: 't',
      goal: 'g',
      status: 'executing',
      mode: 'standard',
      project: { name: 'p', repoRoot: '/x', techStack: [], entrypoints: [], ignorePaths: [], lockedAt: now },
      acceptanceCriteria: criteria as never,
      constraints: [],
      nonGoals: [],
      plan: [],
      actions: [],
      evidence: [],
      filesChanged: [],
      checkpoints: [],
      blockers: [],
      createdAt: now,
      updatedAt: now,
    } as Parameters<EvidenceEngine['record']>[0];
  }

  it('flags command-kind evidence on unpinned criteria', () => {
    const engine = new EvidenceEngine();
    const ledger = ledgerWith(EvidenceEngine.criteriaFromTexts(['login works']));
    const ev = engine.record(ledger, {
      kind: 'command',
      label: 'node --version',
      command: 'node --version',
      exitCode: 0,
      passed: true,
      output: 'v24',
    });
    expect(isWeakEvidenceLink(ledger.acceptanceCriteria[0]!, ev)).toBe(true);
  });

  it('pinned verification commands are not weak', () => {
    const engine = new EvidenceEngine();
    const ledger = ledgerWith(
      EvidenceEngine.criteriaFromSpecs([{ text: 'tests pass', verification: 'npm test', evidenceType: 'test_success' }]),
    );
    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', command: 'npm test', exitCode: 0, passed: true, output: 'ok' });
    expect(isWeakEvidenceLink(ledger.acceptanceCriteria[0]!, ev)).toBe(false);
  });
});

describe('report summary shows its backing', () => {
  it('marks complete reports without passing verification', () => {
    const report = new Reporter().build(
      { data: { taskId: 't', goal: 'g', status: 'completed', mode: 'standard', blockers: [], actions: [], evidence: [], filesChanged: [], plan: [], checkpoints: [], createdAt: '', updatedAt: '' } } as never,
      'complete',
      { summary: 'all done', risks: [], followUps: [] },
    );
    const rendered = new Reporter().render(report);
    expect(rendered).toContain('no passing verification recorded');
  });
});
