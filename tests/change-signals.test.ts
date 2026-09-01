import { describe, expect, it } from 'vitest';
import { scoreRecentChangePaths } from '../src/context/change-signals.js';

describe('change-history context signals', () => {
  it('prefers recently changed paths and gives dirty work an extra bounded boost', () => {
    const scores = scoreRecentChangePaths('src/current.ts\nsrc/shared.ts\n\nsrc/older.ts\nsrc/shared.ts\n', ' M src/older.ts\n?? src/new-file.ts\n');

    expect(scores.get('src/current.ts')).toBeGreaterThan(0.5);
    expect(scores.get('src/shared.ts')).toBeGreaterThan(scores.get('src/current.ts') ?? 1);
    expect(scores.get('src/older.ts')).toBe(1); // dirty work is strongest
    expect(scores.get('src/new-file.ts')).toBeGreaterThan(0.5);
  });

  it('drops empty and escaping paths', () => {
    const scores = scoreRecentChangePaths('\n../secret.txt\n./src/ok.ts\n');
    expect([...scores.keys()]).toEqual(['src/ok.ts']);
  });
});
