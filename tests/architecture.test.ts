import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditArchitecture,
  decisionConflicts,
  detectExplicitTechnologies,
  normalizeDecisionDraft,
  renderDecisions,
  technologiesIn,
} from '../src/agent/architecture.js';
import type { ArchitectureDecision, TaskLedgerData } from '../src/types.js';

function decision(overrides: Partial<ArchitectureDecision>): ArchitectureDecision {
  return {
    id: 'ad-1',
    decision: 'Vanilla JS',
    alternatives: ['React'],
    repoEvidence: 'static frontend, no build system',
    requirements: [],
    rejected: [{ alternative: 'React', reason: 'no build system; adds tooling' }],
    reconsiderIf: 'state complexity grows',
    basis: 'repository-constraint',
    status: 'active',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function ledgerData(repoRoot: string, filesChanged: string[], decisions: ArchitectureDecision[]): TaskLedgerData {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    goal: 'build frontend',
    status: 'executing',
    mode: 'standard',
    project: {
      name: 'proj',
      repoRoot,
      techStack: [],
      entrypoints: [],
      ignorePaths: [],
      lockedAt: new Date().toISOString(),
    },
    acceptanceCriteria: [],
    constraints: [],
    nonGoals: [],
    architectureDecisions: decisions,
    plan: [],
    actions: [],
    evidence: [],
    filesChanged,
    checkpoints: [],
    blockers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('detectExplicitTechnologies', () => {
  it('detects an explicit positive requirement', () => {
    const scan = detectExplicitTechnologies(['Build a login page using React']);
    expect(scan.required).toContain('react');
    expect(scan.excluded).not.toContain('react');
  });

  it('detects explicit exclusion via negation', () => {
    const scan = detectExplicitTechnologies(['Do not use React, keep it simple']);
    expect(scan.excluded).toContain('react');
    expect(scan.required).not.toContain('react');
  });

  it('handles "X instead of Y"', () => {
    const scan = detectExplicitTechnologies(['Use Svelte instead of React']);
    expect(scan.required).toContain('svelte');
    expect(scan.excluded).toContain('react');
  });

  it('returns empty for goals with no technology mentions', () => {
    const scan = detectExplicitTechnologies(['Fix the streaming renderer', 'tests pass']);
    expect(scan.required).toEqual([]);
    expect(scan.excluded).toEqual([]);
  });
});

describe('decisionConflicts', () => {
  it('flags rejecting a technology the user explicitly requires', () => {
    const draft = normalizeDecisionDraft({
      decision: 'Vanilla JS',
      alternatives: ['React'],
      rejected: [{ alternative: 'React', reason: 'simpler' }],
    })!;
    const conflicts = decisionConflicts(draft, ['react']);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.join(' ')).toMatch(/requires react/i);
  });

  it('allows the decision when it honors the required technology', () => {
    const draft = normalizeDecisionDraft({ decision: 'React SPA', alternatives: ['Vanilla JS'] })!;
    expect(decisionConflicts(draft, ['react'])).toEqual([]);
  });

  it('allows any choice when nothing is explicitly required', () => {
    const draft = normalizeDecisionDraft({ decision: 'Vanilla JS', rejected: [{ alternative: 'React', reason: 'overkill' }] })!;
    expect(decisionConflicts(draft, [])).toEqual([]);
  });
});

describe('normalizeDecisionDraft', () => {
  it('rejects a draft with no decision text', () => {
    expect(normalizeDecisionDraft({ decision: '   ' })).toBeUndefined();
  });

  it('bounds field lengths so decisions stay compact', () => {
    const draft = normalizeDecisionDraft({
      decision: 'x'.repeat(500),
      alternatives: Array.from({ length: 20 }, (_x, i) => `alt-${i}`),
      repoEvidence: 'e'.repeat(1000),
    })!;
    expect(draft.decision.length).toBeLessThanOrEqual(200);
    expect(draft.alternatives.length).toBeLessThanOrEqual(6);
    expect(draft.repoEvidence.length).toBeLessThanOrEqual(300);
  });

  it('only accepts a valid basis', () => {
    expect(normalizeDecisionDraft({ decision: 'x', basis: 'bogus' })!.basis).toBeUndefined();
    expect(normalizeDecisionDraft({ decision: 'x', basis: 'repository-constraint' })!.basis).toBe('repository-constraint');
  });
});

describe('technologiesIn', () => {
  it('finds chosen technologies in the decision text', () => {
    expect(technologiesIn('React SPA with hooks')).toContain('react');
    expect(technologiesIn('Vanilla JS, no framework')).toContain('vanilla');
  });
});

describe('auditArchitecture', () => {
  function makeRepo(files: Record<string, string>, pkg?: Record<string, unknown>): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-audit-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg ?? { name: 'audit-test' }));
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    return dir;
  }

  it('passes when the chosen framework is actually used', () => {
    const dir = makeRepo(
      { 'src/app.tsx': "import React from 'react';\nexport const App = () => null;\n" },
      { name: 'x', dependencies: { react: '^18.0.0' } },
    );
    const data = ledgerData(dir, ['src/app.tsx'], [decision({ decision: 'React SPA', rejected: [{ alternative: 'Vanilla JS', reason: 'user requires React' }] })]);
    const audit = auditArchitecture(data, dir);
    expect(audit.ok).toBe(true);
    expect(audit.checks.length).toBeGreaterThan(0);
  });

  it('flags a chosen framework that is absent from the implementation', () => {
    const dir = makeRepo({ 'src/app.ts': 'export const a = 1;\n' });
    const data = ledgerData(dir, ['src/app.ts'], [decision({ decision: 'React SPA', rejected: [] })]);
    const audit = auditArchitecture(data, dir);
    expect(audit.ok).toBe(false);
    expect(audit.issues.join(' ')).toMatch(/react/i);
  });

  it('flags framework imports introduced despite a vanilla decision', () => {
    const dir = makeRepo({ 'src/app.js': "import { h } from 'preact';\n" });
    const data = ledgerData(dir, ['src/app.js'], [decision({ decision: 'Vanilla JS, no framework', rejected: [] })]);
    const audit = auditArchitecture(data, dir);
    expect(audit.ok).toBe(false);
    expect(audit.issues.join(' ')).toMatch(/vanilla|framework/i);
  });

  it('flags build tooling added despite a no-build-system justification', () => {
    const dir = makeRepo({ 'vite.config.ts': 'export default {};\n', 'src/app.js': 'var x = 1;\n' });
    const data = ledgerData(dir, ['vite.config.ts', 'src/app.js'], [
      decision({ decision: 'Vanilla JS', repoEvidence: 'no build system in this repo', rejected: [] }),
    ]);
    const audit = auditArchitecture(data, dir);
    expect(audit.ok).toBe(false);
    expect(audit.issues.join(' ')).toMatch(/build/i);
  });

  it('is clean when no decisions are active', () => {
    const dir = makeRepo({ 'src/app.ts': 'export const a = 1;\n' });
    const data = ledgerData(dir, ['src/app.ts'], []);
    expect(auditArchitecture(data, dir).ok).toBe(true);
  });
});

describe('renderDecisions', () => {
  it('renders a compact one-line-per-decision summary', () => {
    const text = renderDecisions([decision({})]);
    expect(text).toContain('ad-1');
    expect(text).toContain('Vanilla JS');
    expect(text).toContain('rejected: React');
    expect(text).toContain('reconsider if');
  });

  it('shows a hint when no decisions exist', () => {
    expect(renderDecisions([])).toContain('none recorded');
  });
});
