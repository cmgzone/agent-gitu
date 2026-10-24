import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { codingAutoApprove, codingPermissions, saveCodingPermissions } from '../src/workspace/coding-permissions.js';

const originalHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [];
afterEach(() => {
  if (originalHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = originalHome;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

it('uses the shared owner choice over stale client flags and supports the legacy full-access choice', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'coding-access-'));
  homes.push(home);
  process.env.AGENT_GITU_HOME = home;
  expect(codingPermissions()).toEqual({ access: 'ask', configured: false });
  expect(codingAutoApprove()).toBe(false);
  expect(codingAutoApprove(true)).toBe(true);
  saveCodingPermissions('full');
  expect(codingAutoApprove(false)).toBe(true);
  saveCodingPermissions('ask');
  expect(codingAutoApprove(true)).toBe(false);
  expect(() => saveCodingPermissions(true)).toThrow('Choose ask or full');
  expect(codingPermissions()).toEqual({ access: 'ask', configured: true });
});
