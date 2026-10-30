import { describe, expect, it } from 'vitest';
import {
  canonicalToolDefinition,
  codingServiceToolIds,
  coworkGate,
  coworkToolIds,
  decideToolAccess,
  toolDescription,
  toolSchema,
  TOOL_CATALOG,
  TOOL_DESCRIPTORS,
  type CoworkAccessInput,
} from '../src/tools/catalog.js';
import { COWORK_TOOLS } from '../src/cowork/tools.js';
import { KNOWN_TOOL_NAMES } from '../src/tools/tools.js';
import { nativeGituTools } from '../src/coding/native-codex-supervisor.js';

/** Every grant combination, so equality is proven across the whole matrix. */
function grantMatrix(): CoworkAccessInput[] {
  const out: CoworkAccessInput[] = [];
  for (const allowShell of [false, true])
    for (const allowWrites of [false, true])
      for (const allowConfig of [false, true])
        for (const chief of [false, true])
          for (const browser of [false, true])
            for (const company of [false, true]) {
              out.push({ allowShell, allowWrites, allowConfig, chief, browser, company });
            }
  return out;
}

/**
 * The gate each Cowork capability required before the catalog existed. Frozen
 * here as a fixture: it is the oracle the catalog must still reproduce, and it
 * is deliberately not read from production code.
 */
const HISTORICAL_GATES: Record<string, 'shell' | 'writes' | 'config' | 'chief' | 'browser'> = {
  app_manage: 'chief',
  browse: 'browser',
  configure_mcp: 'config',
  connection_execute: 'writes',
  computer_process: 'shell',
  create_document: 'writes',
  create_project: 'config',
  create_skill: 'config',
  desktop_input: 'shell',
  desktop_screenshot: 'browser',
  gitu_task: 'writes',
  mission_manage: 'chief',
  receive_file: 'writes',
  request_browser_auth: 'browser',
  run_command: 'shell',
  share_file: 'writes',
  ssh_exec: 'shell',
  team_manage: 'chief',
  update_connection: 'config',
  update_skill: 'config',
  write_file: 'writes',
  apply_edit: 'writes',
};

/**
 * The pre-catalog availability rule, kept verbatim as the oracle. The catalog
 * is only correct if it reproduces this exactly for every grant combination.
 */
function legacyAvailable(input: CoworkAccessInput): string[] {
  const gated = (gate: string | undefined): boolean => {
    switch (gate) {
      case 'shell':
        return Boolean(input.allowShell);
      case 'writes':
        return Boolean(input.allowWrites);
      case 'config':
        return Boolean(input.allowConfig);
      case 'chief':
        return Boolean(input.chief);
      case 'browser':
        return Boolean(input.browser);
      default:
        return true;
    }
  };
  return COWORK_TOOLS.filter(
    (t) =>
      (HISTORICAL_GATES[t.name] === undefined ||
        gated(HISTORICAL_GATES[t.name]) ||
        (t.name === 'mission_manage' && Boolean(input.company))) &&
      (t.name !== 'mcp_call' || (input.allowConfig && input.allowShell && input.allowWrites)) &&
      (!['company_organization', 'company_boardroom', 'company_handbook', 'company_onboarding', 'company_workflow'].includes(t.name) ||
        Boolean(input.company)),
  )
    .map((t) => t.name)
    .sort();
}

describe('the one tool catalog', () => {
  it('declares every capability once', () => {
    expect(TOOL_CATALOG.size).toBe(TOOL_DESCRIPTORS.length);
    const ids = TOOL_DESCRIPTORS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers the Cowork surface exactly, with the historical gates', () => {
    const declared = COWORK_TOOLS.map((t) => t.name).sort();
    const catalogued = TOOL_DESCRIPTORS.filter((t) => t.routes.cowork).map((t) => t.id).sort();
    expect(catalogued).toEqual(declared);
    const cataloguedGates = Object.fromEntries(
      catalogued.filter((id) => coworkGate(id)).map((id) => [id, coworkGate(id)]),
    );
    expect(cataloguedGates).toEqual(HISTORICAL_GATES);
    // The seat no longer declares gates at all, so there is nothing to drift.
    for (const tool of COWORK_TOOLS) expect(tool).not.toHaveProperty('gate');
  });

  it('covers the coding service surface exactly', () => {
    // The set the native seat accepted before the catalog existed.
    const expected = [
      ...KNOWN_TOOL_NAMES,
      'capability_action',
      'connection_action',
      'connection_operation',
      'connection_discovery',
      'bind_criterion_verification',
    ].sort();
    expect(codingServiceToolIds().sort()).toEqual(expected);
  });

  it('offers the coding seat only capabilities it can dispatch', () => {
    for (const entry of nativeGituTools()) {
      const name = String(entry['name']);
      if (name === 'gitu_service' || name === 'gitu_task') continue;
      const id = name.replace(/^gitu_/, '');
      expect(codingServiceToolIds(), `${name} must be catalogued`).toContain(id);
    }
  });

  it('provides canonical tool schemas and definitions for core capabilities', () => {
    for (const id of ['read_file', 'write_file', 'apply_edit', 'list_files', 'search_files', 'run_command', 'gitu_task', 'gitu_service']) {
      const def = canonicalToolDefinition(id);
      expect(def, `${id} must have a canonical definition`).toBeDefined();
      expect(def?.name).toBe(id);
      expect(def?.inputSchema.type).toBe('object');
      expect(toolSchema(id)).toEqual(def?.inputSchema);
      expect(toolDescription(id)).toBe(def?.description);
    }
  });

  it('reproduces Cowork availability exactly across every grant combination', () => {
    for (const grants of grantMatrix()) {
      expect(coworkToolIds(grants).sort(), JSON.stringify(grants)).toEqual(legacyAvailable(grants));
    }
  });
});

describe('one access decision, two profiles', () => {
  /** Every grant open, no company assignment. */
  const all: CoworkAccessInput = {
    allowShell: true,
    allowWrites: true,
    allowConfig: true,
    chief: true,
    browser: true,
  };

  it('withholds a gated capability until its grant is enabled', () => {
    expect(decideToolAccess({ tool: 'write_file', profile: 'cowork', grants: {} })).toMatchObject({
      allowed: false,
    });
    expect(decideToolAccess({ tool: 'write_file', profile: 'cowork', grants: { ...all, allowWrites: false } })).toMatchObject({
      allowed: false,
    });
    expect(decideToolAccess({ tool: 'write_file', profile: 'cowork', grants: all })).toMatchObject({
      allowed: true,
      dispatcher: 'cowork',
    });
  });

  it('lets a company own mission management without the chief grant', () => {
    expect(decideToolAccess({ tool: 'mission_manage', profile: 'cowork', grants: { ...all, chief: false, company: false } })).toMatchObject({
      allowed: false,
    });
    expect(decideToolAccess({ tool: 'mission_manage', profile: 'cowork', grants: { ...all, chief: false, company: true } })).toMatchObject({
      allowed: true,
    });
  });

  it('requires the whole MCP write path for mcp_call', () => {
    for (const missing of ['allowConfig', 'allowShell', 'allowWrites'] as const) {
      expect(
        decideToolAccess({ tool: 'mcp_call', profile: 'cowork', grants: { ...all, [missing]: false } }),
        missing,
      ).toMatchObject({ allowed: false });
    }
    expect(decideToolAccess({ tool: 'mcp_call', profile: 'cowork', grants: all })).toMatchObject({ allowed: true });
  });

  it('withholds company capabilities from a team without a company', () => {
    expect(decideToolAccess({ tool: 'company_workflow', profile: 'cowork', grants: all })).toMatchObject({ allowed: false });
    expect(decideToolAccess({ tool: 'company_workflow', profile: 'company', grants: all })).toMatchObject({ allowed: true });
  });

  it('never widens a profile by sharing the id', () => {
    // Shared capability, different authority: coding runs it through PolicyEngine.
    expect(decideToolAccess({ tool: 'run_command', profile: 'coding' })).toMatchObject({
      allowed: true,
      dispatcher: 'executor',
    });
    expect(decideToolAccess({ tool: 'run_command', profile: 'cowork', grants: { ...all, allowShell: false } })).toMatchObject({
      allowed: false,
    });
    // Cowork-only capabilities are not reachable from coding.
    for (const tool of ['ask_user', 'mission_manage', 'company_boardroom', 'computer_process']) {
      expect(decideToolAccess({ tool, profile: 'coding' }), tool).toMatchObject({ allowed: false });
    }
    // Coding-only capabilities are not reachable from Cowork.
    for (const tool of ['delegate', 'lsp_symbols', 'capability_action', 'gitu_service']) {
      expect(decideToolAccess({ tool, profile: 'cowork', grants: all }), tool).toMatchObject({ allowed: false });
    }
  });

  it('denies an unknown name instead of guessing a capability', () => {
    const decision = decideToolAccess({ tool: 'run_shell_magic', profile: 'cowork', grants: all });
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toContain('not in the Gitu tool catalog');
  });

  it('declares the id whose meaning depends on the seat', () => {
    const shared = TOOL_CATALOG.get('gitu_task');
    expect(shared?.conflict).toBeTruthy();
    expect(shared?.routes.coding?.dispatcher).toBe('supervision');
    expect(shared?.routes.cowork?.gate).toBe('writes');
  });
});
