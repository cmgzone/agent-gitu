/**
 * AST-based implementation-fact extraction (TypeScript compiler API).
 *
 * The regex extractor in file-knowledge.ts is the FALLBACK; this module is
 * the primary path for TS/JS sources because a real parse is what makes the
 * facts reliable: multiline type unions flatten correctly, generics and
 * overloads survive, class/interface members are enumerated structurally,
 * and import/re-export relationships are recorded.
 *
 * Contract:
 *  - returns undefined for non-TS/JS files, sources the parser cannot read
 *    (syntax errors), and runtimes where the parser package is unavailable —
 *    the caller then falls back to the regex extractor;
 *  - selective by design, same as the fallback: EXPORTED declarations only;
 *  - facts stay navigational (signatures + member names), never content dumps.
 *
 * The compiler is loaded LAZILY through createRequire so that an installation
 * without the optional `typescript` package still gets file knowledge (regex
 * quality) rather than an import-time crash of the entire knowledge module.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import type * as TsModule from 'typescript';

const requireFromHere = createRequire(import.meta.url);
let typeScriptModule: typeof TsModule | null | undefined;

/** Load + cache the compiler; undefined when the package is unavailable. */
function loadTypeScript(): typeof TsModule | undefined {
  if (typeScriptModule !== undefined) return typeScriptModule ?? undefined;
  try {
    typeScriptModule = requireFromHere('typescript') as typeof TsModule;
  } catch {
    typeScriptModule = null;
  }
  return typeScriptModule ?? undefined;
}

export interface AstFacts {
  facts: string[];
  symbols: string[];
}

export interface AstExtractionLimits {
  maxFacts: number;
  maxFactChars: number;
  maxSymbols: number;
}

const MEMBER_CAP = 12;
const IMPORT_CAP = 12;
const REEXPORT_NAME_CAP = 8;

function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function scriptKindFor(ts: typeof TsModule, relPath: string): TsModule.ScriptKind | undefined {
  switch (path.extname(relPath).toLowerCase()) {
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.js':
    case '.mjs':
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    default:
      return undefined;
  }
}

function isExported(ts: typeof TsModule, node: TsModule.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function isDefaultExport(ts: typeof TsModule, node: TsModule.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
}

function typeParamsText(sf: TsModule.SourceFile, node: TsModule.InterfaceDeclaration | TsModule.ClassDeclaration | TsModule.TypeAliasDeclaration | TsModule.FunctionDeclaration): string {
  const params = node.typeParameters;
  if (!params || params.length === 0) return '';
  return `<${params.map((p) => p.getText(sf)).join(', ')}>`;
}

function heritageText(ts: typeof TsModule, sf: TsModule.SourceFile, node: TsModule.ClassDeclaration | TsModule.InterfaceDeclaration): string {
  if (!node.heritageClauses || node.heritageClauses.length === 0) return '';
  return (
    ' ' +
    node.heritageClauses
      .map((clause) => {
        const keyword = clause.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements';
        return `${keyword} ${clause.types.map((t) => t.getText(sf)).join(', ')}`;
      })
      .join(' ')
  );
}

/** Full declaration text minus the body — the signature a caller needs. */
function signatureText(sf: TsModule.SourceFile, node: TsModule.FunctionDeclaration): string {
  const text = node.getText(sf);
  if (!node.body) return flatten(text.replace(/;\s*$/, ''));
  const bodyStart = node.body.getStart(sf) - node.getStart(sf);
  return flatten(text.slice(0, bodyStart).replace(/\{\s*$/, ''));
}

/** Public class member names; methods carry a `()` suffix. */
function classMemberNames(ts: typeof TsModule, sf: TsModule.SourceFile, node: TsModule.ClassDeclaration): string[] {
  const names: string[] = [];
  for (const member of node.members) {
    const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
    if (modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
      const name = member.name ? member.name.getText(sf) : undefined;
      if (name && !name.startsWith('#')) names.push(`${name}()`);
    } else if (ts.isPropertyDeclaration(member)) {
      const name = member.name ? member.name.getText(sf) : undefined;
      if (name && !name.startsWith('#')) names.push(name);
    }
  }
  return names;
}

/** Interface member names (properties and method signatures). */
function interfaceMemberNames(sf: TsModule.SourceFile, node: TsModule.InterfaceDeclaration): string[] {
  const names: string[] = [];
  for (const member of node.members) {
    const name = member.name ? member.name.getText(sf) : undefined;
    if (name) names.push(name);
  }
  return names;
}

function capList(names: string[], cap: number): string {
  return names.length > cap ? `${names.slice(0, cap).join(', ')} (+${names.length - cap} more)` : names.join(', ');
}
/**
 * Deterministic AST extraction. Returns undefined when the file is not TS/JS,
 * the parser package is unavailable, or the parser reports errors (the caller
 * then falls back to regex).
 */
export function extractAstFacts(relPath: string, content: string, limits: AstExtractionLimits): AstFacts | undefined {
  const ts = loadTypeScript();
  if (!ts) return undefined;
  const kind = scriptKindFor(ts, relPath);
  if (kind === undefined) return undefined;

  let sf: TsModule.SourceFile;
  try {
    sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true, kind);
  } catch {
    return undefined;
  }
  // parseDiagnostics exists on every SourceFile at runtime but is not part of
  // the public .d.ts surface; a syntax-broken file falls back to regex.
  const parseDiagnostics = (sf as TsModule.SourceFile & { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) return undefined;

  const facts: string[] = [];
  const symbols: string[] = [];
  const add = (fact: string, symbol?: string): void => {
    if (facts.length >= limits.maxFacts) return;
    const flat = flatten(fact);
    facts.push(flat.length > limits.maxFactChars ? `${flat.slice(0, limits.maxFactChars - 1)}…` : flat);
    if (symbol && symbols.length < limits.maxSymbols && !symbols.includes(symbol)) symbols.push(symbol);
  };

  // Overload grouping: same-name exported functions collapse into one fact.
  const overloadCounts = new Map<string, number>();
  const seenFunctions = new Set<string>();
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(ts, node)) overloadCounts.set(node.name.text, (overloadCounts.get(node.name.text) ?? 0) + 1);
  }

  const imports: string[] = [];
  for (const node of sf.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
  }
  if (imports.length > 0) add(`imports: ${capList([...new Set(imports)], IMPORT_CAP)}`);

  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(ts, node)) {
      const name = node.name.text;
      if (seenFunctions.has(name)) continue;
      seenFunctions.add(name);
      const overloads = (overloadCounts.get(name) ?? 1) - 1;
      add(`${signatureText(sf, node)}${overloads > 0 ? ` (+${overloads} overload${overloads === 1 ? '' : 's'})` : ''}`, name);
      continue;
    }
    if (ts.isClassDeclaration(node) && node.name && isExported(ts, node)) {
      const members = classMemberNames(ts, sf, node);
      add(`export class ${node.name.text}${typeParamsText(sf, node)}${heritageText(ts, sf, node)}${members.length ? ` members: ${capList(members, MEMBER_CAP)}` : ''}`, node.name.text);
      continue;
    }
    if (ts.isInterfaceDeclaration(node) && isExported(ts, node)) {
      const members = interfaceMemberNames(sf, node);
      add(`export interface ${node.name.text}${typeParamsText(sf, node)}${heritageText(ts, sf, node)}${members.length ? ` fields: ${capList(members, MEMBER_CAP)}` : ''}`, node.name.text);
      continue;
    }
    if (ts.isTypeAliasDeclaration(node) && isExported(ts, node)) {
      // The full type text — multiline unions flatten here, the regex
      // fallback's biggest blind spot.
      add(`export type ${node.name.text}${typeParamsText(sf, node)} = ${node.type.getText(sf)}`, node.name.text);
      continue;
    }
    if (ts.isEnumDeclaration(node) && isExported(ts, node)) {
      const members = node.members.map((m) => m.name.getText(sf));
      add(`export enum ${node.name.text} { ${capList(members, MEMBER_CAP)} }`, node.name.text);
      continue;
    }
    if (ts.isVariableStatement(node) && isExported(ts, node) && (ts.getCombinedNodeFlags(node.declarationList) & ts.NodeFlags.Const) !== 0) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const name = decl.name.text;
        // Selective: CONSTANTS and explicitly typed exports only.
        if (!/^[A-Z][A-Z0-9_]*$/.test(name) && !decl.type) continue;
        add(`export const ${name}${decl.type ? `: ${decl.type.getText(sf)}` : ''}`, name);
      }
      continue;
    }
    if (ts.isExportDeclaration(node)) {
      const from = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? ` from ${node.moduleSpecifier.text}` : '';
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        const names = node.exportClause.elements.map((e) => e.name.text);
        add(`re-exports${from}: ${capList(names, REEXPORT_NAME_CAP)}`);
      } else {
        add(`re-exports *${from}`);
      }
      continue;
    }
    if (ts.isExportAssignment(node)) {
      add(`export default ${node.expression.getText(sf)}`);
      continue;
    }
    if (isDefaultExport(ts, node) && (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))) {
      const name = node.name?.text ?? '(anonymous)';
      add(`export default ${ts.isFunctionDeclaration(node) ? 'function' : 'class'} ${name}`, name !== '(anonymous)' ? name : undefined);
    }
  }

  return { facts, symbols };
}

