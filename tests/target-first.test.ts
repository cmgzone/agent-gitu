import { describe, expect, it } from 'vitest';
import { determineInvestigationDepth } from '../src/agent/task-strategy.js';
import { classifyTaskComplexity, planEffort } from '../src/agent/effort-planner.js';
import { planRisk } from '../src/agent/risk-planner.js';
import { ContextEngine } from '../src/context/context-engine.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import type { ProjectLock } from '../src/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createMockProject(): { repoRoot: string; guard: ProjectGuard; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-target-test-'));
  fs.mkdirSync(path.join(repoRoot, 'src', 'llm'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'src', 'llm', 'llm.ts'), 'export function stream() {}');
  fs.writeFileSync(path.join(repoRoot, 'src', 'index.ts'), 'import "./llm/llm.js";');

  const project: ProjectLock = {
    name: 'test-project',
    repoRoot,
    techStack: ['typescript'],
    entrypoints: ['src/index.ts'],
    ignorePaths: ['node_modules'],
    lockedAt: new Date().toISOString(),
  };
  const guard = new ProjectGuard(project);
  return {
    repoRoot,
    guard,
    cleanup: () => {
      try {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

describe('Target-First Investigation & Evidence-First Planning', () => {
  it('determines direct investigation depth when explicit file or target hint is provided', () => {
    expect(determineInvestigationDepth('Fix crash in src/llm/llm.ts on line 40')).toBe('direct');
    expect(determineInvestigationDepth('Fix bug', { files: ['src/llm/llm.ts'], symbols: [], errors: [] })).toBe('direct');
    expect(determineInvestigationDepth('DeepSeek V4 streaming parser error in parseSSEChunk')).toBe('local');
    expect(determineInvestigationDepth('Refactor state machine')).toBe('dependency');
    expect(determineInvestigationDepth('Audit entire repository for security issues')).toBe('repository');
  });

  it('classifies focused single-file bugs as low complexity', () => {
    const classification = classifyTaskComplexity('llm.ts still drops the final DeepSeek SSE chunk');
    expect(classification.complexity).toBe('low');
    expect(classification.reason).toContain('focused target in known file');

    const effort = planEffort('llm.ts still drops the final DeepSeek SSE chunk');
    expect(effort.complexity).toBe('low');
  });

  it('risk planner does not delegate exploration specialists for focused tasks', () => {
    const risk = planRisk('Fix llm.ts chunking issue', {
      complexity: 'low',
      specialists: [{ name: 'explore', role: 'Exploration and architecture mapping' }],
      maxSpecialists: 1,
    });
    // For low complexity bug with zero strict risks, recommended specialists should be 0
    expect(risk.recommendedSpecialists.length).toBe(0);
  });

  it('context engine heavily prioritizes explicitly named target files over entrypoints', () => {
    const { guard, cleanup } = createMockProject();
    try {
      const engine = new ContextEngine(guard);
      const pack = engine.buildPack('Fix stream error in src/llm/llm.ts');
      expect(pack.primaryFiles.length).toBeGreaterThan(0);
      expect(pack.primaryFiles[0]!.path).toBe('src/llm/llm.ts');
    } finally {
      cleanup();
    }
  });

  it('buildTargetedPack reads hinted targets directly and skips repository scoring', () => {
    const { guard, cleanup } = createMockProject();
    try {
      fs.writeFileSync(path.join(guard.lock.repoRoot, 'src', 'llm', 'llm.test.ts'), 'it("stream")\n');
      const engine = new ContextEngine(guard);

      // Basename hint resolves; nearest test attaches; unrelated files absent.
      const pack = engine.buildTargetedPack('Fix llm.ts streaming', ['llm.ts'], { maxFiles: 6, maxBytes: 20_000 });
      expect(pack).toBeDefined();
      expect(pack!.primaryFiles.map((f) => f.path)).toEqual(['src/llm/llm.ts']);
      expect(pack!.testFiles[0]!.path).toBe('src/llm/llm.test.ts');
      expect(pack!.relatedFiles).toEqual([]);

      // Unresolvable hint → no fast path, caller falls back to ranked pack.
      const miss = engine.buildTargetedPack('Fix something', ['does-not-exist.ts'], { maxFiles: 6, maxBytes: 20_000 });
      expect(miss).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it('investigation depth is recorded once and escalates one ladder level at a time', () => {
    const { repoRoot, guard, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix llm.ts bug', project: guard.lock, mode: 'standard' });
      ledger.setInvestigationDepth('direct');
      expect(ledger.data.investigationDepth).toBe('direct');

      expect(ledger.escalateInvestigationDepth()).toBe('local');
      expect(ledger.escalateInvestigationDepth()).toBe('dependency');
      expect(ledger.escalateInvestigationDepth()).toBe('subsystem');
      expect(ledger.escalateInvestigationDepth()).toBe('repository');
      // Top of the ladder: no further escalation exists.
      expect(ledger.escalateInvestigationDepth()).toBeUndefined();
      expect(ledger.data.investigationDepth).toBe('repository');
    } finally {
      cleanup();
    }
  });

  it('state message renders the investigation depth with the escalation ladder', () => {
    const { repoRoot, guard, cleanup } = createMockProject();
    try {
      const ledger = TaskLedger.create({ repoRoot, goal: 'Fix llm.ts bug', project: guard.lock, mode: 'standard' });
      ledger.setInvestigationDepth('direct');
      const state = buildStateMessage(ledger);
      expect(state).toContain('INVESTIGATION DEPTH: DIRECT');
      expect(state).toContain('direct → local → dependency → subsystem → repository');
    } finally {
      cleanup();
    }
  });
});
