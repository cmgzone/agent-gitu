import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readRuntimeSelection, saveRuntimeSelection } from '../src/workspace/runtime-selection.js';
import { projectForCoding } from '../src/coding/project-selection.js';
import { resolveLlm } from '../src/llm/providers.js';
import * as keys from '../src/llm/keys.js';
let home: string;
const prior = process.env.AGENT_GITU_HOME;
beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), 'selected-runtime-'));
  process.env.AGENT_GITU_HOME = home;
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = prior;
});
it('uses the latest persisted model and preserves explicit per-run choices', () => {
  vi.spyOn(keys, 'mergedEnv').mockReturnValue({ OPENAI_API_KEY: 'fixture-key' });
  saveRuntimeSelection({ provider: 'openai', model: 'first-choice' });
  saveRuntimeSelection({ provider: 'openai', model: 'recent-choice' });
  expect(resolveLlm().model).toBe('recent-choice');
  expect(resolveLlm({ provider: 'openai', model: 'explicit-choice' }).model).toBe('explicit-choice');
  expect(readRuntimeSelection().model).toBe('recent-choice');
});
it('never selects Alibaba just because its key exists, but honors an explicit Alibaba choice', () => {
  expect(() => resolveLlm({ env: { DASHSCOPE_API_KEY: 'fixture' } })).toThrow('No LLM configured');
  expect(resolveLlm({ provider: 'alibaba', model: 'explicit-qwen', env: { DASHSCOPE_API_KEY: 'fixture' } }).providerId).toBe('alibaba');
});
it('finds a named existing project instead of the general workspace and does not guess ambiguous names', () => {
  for (const name of ['pikiwebsite', 'another']) {
    mkdirSync(path.join(home, name));
    writeFileSync(path.join(home, name, 'package.json'), '{}');
  }
  expect(projectForCoding(home, 'Improve the existing pikiwebsite homepage', path.join(home, 'another'))).toBe(path.join(home, 'pikiwebsite'));
  expect(projectForCoding(home, 'Compare pikiwebsite and another')).toBe(home);
  expect(projectForCoding(home, 'Continue', path.join(home, 'another'))).toBe(path.join(home, 'another'));
});
