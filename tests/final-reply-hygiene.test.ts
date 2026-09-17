import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('final-reply output hygiene end-to-end', () => {
  it('sanitizes decorative rules in a chat-mode reply before it reaches the report', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gitu-hygiene-'));
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'hygiene-check', scripts: { test: 'node --version' } }));
    const reply = [
      'Here is the summary.',
      '',
      '--------------------',
      'CATEGORY',
      '--------------------',
      '',
      'First important finding.',
    ].join('\n');
    const llm = new ScriptedMockLlm([() => reply]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'chat' });
    const { report } = await hermes.run('Summarize the categories');
    expect(report.summary).toContain('## CATEGORY');
    expect(report.summary).not.toMatch(/-{4,}/);
  }, 30000);
});
