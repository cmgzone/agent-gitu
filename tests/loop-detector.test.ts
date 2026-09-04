import { describe, expect, it } from 'vitest';
import { LoopDetector } from '../src/loop/loop-detector.js';
import type { ActionRecord } from '../src/types.js';

function action(overrides: Partial<ActionRecord> & Pick<ActionRecord, 'tool' | 'paramsHash'>): ActionRecord {
  return {
    id: 'act-1',
    paramsSummary: 'test',
    status: 'error',
    reason: 'r',
    expected: 'e',
    durationMs: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('LoopDetector', () => {
  const detector = new LoopDetector();

  it('allows first attempts', () => {
    const verdict = detector.evaluate([], 'run_command', 'hash-a', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('blocks after two failures with the same error signature', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 'sig-x');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/same error signature/i);
  });

  it('allows retry when the error signature changed', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 'sig-x' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 'sig-y');
    expect(verdict.allowed).toBe(true);
  });

  it('hard-blocks after three failures regardless of signature', () => {
    const actions = [
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'a' }),
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'b' }),
      action({ tool: 'apply_edit', paramsHash: 'h2', errorSignature: 'c' }),
    ];
    const verdict = detector.evaluate(actions, 'apply_edit', 'h2', 'd');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/hard-blocked/i);
  });

  it('does not count successful non-investigation actions as failures', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
      action({ tool: 'run_command', paramsHash: 'h3', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h3', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('blocks a third unchanged investigation read after two successful observations', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'read-region', undefined);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/same investigation evidence already succeeded 2×/i);
  });

  it('allows the same file region to be read again after that file changes', () => {
    const actions = [
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
      action({ tool: 'read_file', paramsHash: 'read-region', paramsSummary: 'read src/game.ts', status: 'success' }),
      action({ tool: 'apply_edit', paramsHash: 'edit-1', paramsSummary: 'edit src/game.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'read_file', 'read-region', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('resets broader search evidence after any successful source edit', () => {
    const actions = [
      action({ tool: 'search_files', paramsHash: 'search-1', paramsSummary: 'search /pipe/ in src', status: 'success' }),
      action({ tool: 'search_files', paramsHash: 'search-1', paramsSummary: 'search /pipe/ in src', status: 'success' }),
      action({ tool: 'write_file', paramsHash: 'write-1', paramsSummary: 'write src/logic.ts', status: 'success' }),
    ];
    const verdict = detector.evaluate(actions, 'search_files', 'search-1', undefined);
    expect(verdict.allowed).toBe(true);
  });

  it('summarizes blocks with prior attempts', () => {
    const actions = [
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 's', paramsSummary: '$ npm test' }),
      action({ tool: 'run_command', paramsHash: 'h1', errorSignature: 's', paramsSummary: '$ npm test' }),
    ];
    const verdict = detector.evaluate(actions, 'run_command', 'h1', 's');
    const summary = LoopDetector.summarizeBlock(verdict);
    expect(summary).toContain('LOOP PREVENTION');
    expect(summary).toContain('$ npm test');
  });
});
