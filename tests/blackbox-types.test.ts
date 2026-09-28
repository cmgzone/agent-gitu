import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexSource = readFileSync(
  fileURLToPath(new URL('../src/index.ts', import.meta.url)),
  'utf8',
);
const typesSource = readFileSync(
  fileURLToPath(new URL('../src/blackbox/types.ts', import.meta.url)),
  'utf8',
);

describe('Black Box public contracts', () => {
  it('re-exports every Black Box contract through the public barrel as types only', () => {
    expect(indexSource).toContain("export type * from './blackbox/types.js';");
    expect(indexSource).not.toContain("export * from './blackbox/types.js';");

    const exportedContracts = [...typesSource.matchAll(
      /^export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/gm,
    )].map((match) => match[1]);

    expect(exportedContracts.length).toBeGreaterThan(0);
  });

  it('keeps the contract module free of runtime authority and signing secrets', () => {
    expect(typesSource).not.toMatch(/^export\s+(?:class|function|const|let|var)\s+/m);
    expect(typesSource).not.toMatch(/(?:private|secret)[_-]?key\s*[:=]/i);
  });
});
