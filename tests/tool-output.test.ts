import { describe, expect, it } from 'vitest';
import { formatToolOutput } from '../src/agent/tool-output.js';

describe('model tool output', () => {
  it('retains ordinary bounded source reads including existing continuation notes', () => {
    const source = '1: ' + 'source '.repeat(700) + '\n[... 12 more lines]';
    expect(formatToolOutput('read_file', source)).toBe(source);
  });

  it('gives the next complete source line when a read exceeds the context cap', () => {
    const source = Array.from({ length: 1000 }, (_, i) => `${i + 1}: ${'code '.repeat(10)}`).join('\n');
    const shown = formatToolOutput('read_file', source, 30_000);
    const lastLine = Number([...shown.matchAll(/^(\d+): /gm)].at(-1)![1]);
    expect(shown).toContain('OUTPUT TRUNCATED');
    expect(shown).toContain(`offset=${lastLine + 1}`);
    expect(shown.length).toBeLessThan(30_400);
  });

  it('does not skip a partially shown oversized source line', () => {
    const shown = formatToolOutput('read_file', `42: ${'x'.repeat(40_000)}`, 30_000);
    expect(shown).toContain('offset=42');
  });

  it('marks shortened command results explicitly', () => {
    const shown = formatToolOutput('run_command', 'output '.repeat(1000), 2500);
    expect(shown).toContain('OUTPUT TRUNCATED');
    expect(shown.length).toBeLessThan(2800);
  });
});
