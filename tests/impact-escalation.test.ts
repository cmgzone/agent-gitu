import { describe, expect, it } from 'vitest';
import { analyzeChangeImpact, pickImpactSymbols, summarizeReferences, type ImpactLsp } from '../src/agent/impact.js';
import { escalationFor } from '../src/agent/effort-planner.js';

const sym = (name: string, kind: number, character: number) => ({
  name,
  kind,
  range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
  selectionRange: { start: { line: 0, character }, end: { line: 0, character: character + 5 } },
});

const otherFiles = (n: number): { uri: string }[] =>
  Array.from({ length: n }, (_x, i) => ({ uri: `file:///c:/proj/src/other${i}.ts` }));

describe('pickImpactSymbols', () => {
  it('keeps only class/interface/enum/function/method kinds and caps at 6', () => {
    const picked = pickImpactSymbols([
      sym('AClass', 5, 7),
      sym('aFunction', 12, 16),
      sym('AnInterface', 11, 11),
      sym('AnEnum', 10, 6),
      sym('aVariable', 13, 4), // not probed
      sym('aConst', 14, 4), // not probed
      ...Array.from({ length: 6 }, (_x, i) => sym(`f${i}`, 12, 4)),
    ]);
    expect(picked.map((p) => p.name)).toEqual(['AClass', 'aFunction', 'AnInterface', 'AnEnum', 'f0', 'f1']);
    // selectionRange is 0-based in LSP — the probe must convert to 1-based.
    expect(picked[0]).toMatchObject({ line: 1, column: 8 });
  });

  it('returns empty for non-array payloads', () => {
    expect(pickImpactSymbols(undefined)).toEqual([]);
  });
});

describe('summarizeReferences', () => {
  it('excludes the defining file and counts distinct files', () => {
    const impact = summarizeReferences(
      'validateToken',
      [
        { uri: 'file:///c:/proj/src/auth.ts' }, // self
        { uri: 'file:///c:/proj/src/auth.ts' }, // self again
        { uri: 'file:///c:/proj/src/a.ts' },
        { uri: 'file:///c:/proj/src/a.ts' }, // same file twice
        { uri: 'file:///c:/proj/src/b.ts' },
      ],
      'src/auth.ts',
    );
    expect(impact).toEqual({ name: 'validateToken', refs: 3, files: 2 });
  });
});

describe('analyzeChangeImpact', () => {
  const baseLsp = (refsForWide: unknown, refsForNarrow: unknown): ImpactLsp => ({
    symbols: async () => ({
      ok: true,
      payload: [sym('validateToken', 12, 13), sym('localHelper', 12, 14)],
    }),
    references: async (_file, _line, column) =>
      column === 14 ? { ok: true, payload: refsForWide } : { ok: true, payload: refsForNarrow },
  });

  it('flags only symbols referenced from >= 4 other files', async () => {
    const note = await analyzeChangeImpact(
      baseLsp(otherFiles(5), [{ uri: 'file:///c:/proj/src/only.ts' }]),
      ['src/auth.ts'],
    );
    expect(note).toBeTruthy();
    expect(note).toContain('validateToken');
    expect(note).toContain('5 file(s)');
    expect(note).not.toContain('localHelper');
    expect(note).toContain('lsp_references');
  });

  it('returns undefined when nothing crosses the threshold', async () => {
    const note = await analyzeChangeImpact(
      baseLsp(otherFiles(2), [{ uri: 'file:///c:/proj/src/only.ts' }]),
      ['src/auth.ts'],
    );
    expect(note).toBeUndefined();
  });

  it('returns undefined when the language server is unavailable', async () => {
    const lsp: ImpactLsp = {
      symbols: async () => ({ ok: false, output: 'LSP unavailable' }),
      references: async () => ({ ok: false, output: 'LSP unavailable' }),
    };
    expect(await analyzeChangeImpact(lsp, ['src/auth.ts'])).toBeUndefined();
  });

  it('survives lsp throwing', async () => {
    const lsp: ImpactLsp = {
      symbols: async () => {
        throw new Error('server died');
      },
      references: async () => ({ ok: false, output: '' }),
    };
    expect(await analyzeChangeImpact(lsp, ['src/auth.ts'])).toBeUndefined();
  });
});

describe('escalationFor', () => {
  it('is undefined for modest scope', () => {
    expect(escalationFor({ filesChanged: 3, distinctFailures: 2 })).toBeUndefined();
  });

  it('escalates for a wide change surface', () => {
    const esc = escalationFor({ filesChanged: 8, distinctFailures: 1 });
    expect(esc).toMatchObject({ extraTurns: 10, extraSpecialists: 1 });
    expect(esc!.reason).toContain('wide change surface');
  });

  it('escalates for repeated distinct failures', () => {
    const esc = escalationFor({ filesChanged: 2, distinctFailures: 5 });
    expect(esc).toMatchObject({ extraTurns: 10, extraSpecialists: 1 });
    expect(esc!.reason).toContain('hard problem');
  });

  it('escalates hardest for both signals at once', () => {
    const esc = escalationFor({ filesChanged: 12, distinctFailures: 7 });
    expect(esc).toMatchObject({ extraTurns: 15, extraSpecialists: 2 });
  });
});
