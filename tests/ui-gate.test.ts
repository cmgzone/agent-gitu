import { describe, expect, it } from 'vitest';
import { isUiTask, uiVisualGate } from '../src/agent/ui-gate.js';
import type { ActionRecord, TaskLedgerData } from '../src/types.js';

let seq = 0;
function action(partial: Partial<ActionRecord>): ActionRecord {
  seq += 1;
  return {
    id: `a-${seq}`,
    paramsHash: '',
    paramsSummary: partial.tool ?? '',
    status: 'success',
    reason: '',
    expected: '',
    durationMs: 1,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, seq)).toISOString(),
    ...partial,
  } as ActionRecord;
}

function ledger(partial: Partial<TaskLedgerData>): TaskLedgerData {
  return {
    actions: [],
    plan: [],
    acceptanceCriteria: [],
    filesChanged: [],
    ...partial,
  } as unknown as TaskLedgerData;
}

describe('isUiTask', () => {
  it('detects UI work via recorded design notes', () => {
    expect(isUiTask(ledger({ planDesign: { frontend: 'landing + pricing views' } }))).toBe(true);
    expect(isUiTask(ledger({ planDesign: { backend: 'routes only' } }))).toBe(false);
  });

  it('detects UI work via frontend-tagged plan steps or changed files', () => {
    expect(isUiTask(ledger({ plan: [{ id: 's', description: 'x', verification: 'v', status: 'pending', attempts: 0, area: 'frontend' }] }))).toBe(true);
    expect(isUiTask(ledger({ filesChanged: ['src/app/page.css'] }))).toBe(true);
    expect(isUiTask(ledger({ filesChanged: ['src/server/db.ts'] }))).toBe(false);
  });
});

describe('uiVisualGate', () => {
  it('reuses a host-bound screenshot after checks that leave the workspace unchanged', () => {
    const data = ledger({ filesChanged: ['index.html'], actions: [
      action({ tool: 'apply_edit' }),
      action({ tool: 'browse', paramsSummary: 'browse screenshot', verifiedWorkspaceFingerprint: 'verified-source' }),
      action({ tool: 'run_command', paramsSummary: 'npm test' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'verified-source' }).verified).toBe(true);
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'changed-source' }).verified).toBe(false);
    // Legacy snapshots retain conservative protection against shell edits.
    delete data.actions[1]!.verifiedWorkspaceFingerprint;
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'verified-source' }).verified).toBe(false);
  });

  it('detects a stale host-bound screenshot even when no later edit action was recorded', () => {
    const data = ledger({ filesChanged: ['app.css'], actions: [
      action({ tool: 'browse', paramsSummary: 'browse screenshot', verifiedWorkspaceFingerprint: 'old-source' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'new-source' }).verified).toBe(false);
  });

  it('reuses a complete content-bound look after an identical rewrite but rejects real changes', () => {
    const data = ledger({ filesChanged: ['large.html'], actions: [
      action({ tool: 'browse', paramsSummary: 'browse screenshot', verifiedWorkspaceFingerprint: 'same-source' }),
      action({ tool: 'apply_edit', paramsSummary: 'edit large.html' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'same-source' }).verified).toBe(true);
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'changed-source' }).verified).toBe(false);
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'partial-source' }).verified).toBe(false);
    expect(uiVisualGate(data, { browserAvailable: true }).verified).toBe(false);
  });

  it('keeps conservative command freshness when the workspace scan is incomplete', () => {
    const data = ledger({ filesChanged: ['index.html'], actions: [
      action({ tool: 'browse', paramsSummary: 'browse screenshot', verifiedWorkspaceFingerprint: 'partial-source' }),
      action({ tool: 'run_command', paramsSummary: 'node change-large-file.cjs' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true, workspaceFingerprint: 'partial-source' }).verified).toBe(false);
  });

  it('reuses clean structured evidence for text-only models without waiving visual checks for vision models', () => {
    const data = ledger({ filesChanged: ['index.html'], actions: [
      action({ tool: 'browse', paramsSummary: 'browse evidence', observation: 'BROWSER EVIDENCE: no findings', verifiedWorkspaceFingerprint: 'verified-source' }),
      action({ tool: 'run_command', paramsSummary: 'npm run typecheck' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true, visionAvailable: false, workspaceFingerprint: 'verified-source' }).verified).toBe(true);
    expect(uiVisualGate(data, { browserAvailable: true, visionAvailable: true, workspaceFingerprint: 'verified-source' }).verified).toBe(false);
    data.actions[0]!.observation = 'BROWSER EVIDENCE: high: covered control';
    expect(uiVisualGate(data, { browserAvailable: true, visionAvailable: false, workspaceFingerprint: 'verified-source' }).verified).toBe(false);
  });

  it('does not invalidate a legacy screenshot for a host-classified observation or status poll', () => {
    const data = ledger({ filesChanged: ['index.html'], actions: [
      action({ tool: 'browse', paramsSummary: 'browse screenshot' }),
      action({ tool: 'run_command', observationOnly: true, paramsSummary: 'status job-1' }),
    ] });
    expect(uiVisualGate(data, { browserAvailable: true }).verified).toBe(true);
  });

  it('requires a browser for UI tasks and skips non-UI tasks', () => {
    const data = ledger({ filesChanged: ['index.html'] });
    expect(uiVisualGate(data, { browserAvailable: false })).toMatchObject({ required: true, verified: false });
    expect(uiVisualGate(ledger({ filesChanged: ['api.ts'] }), { browserAvailable: true })).toMatchObject({ required: false, verified: true });
  });

  it('rejects a UI task that never took a screenshot', () => {
    const data = ledger({
      filesChanged: ['index.html'],
      actions: [action({ tool: 'write_file', paramsSummary: 'write index.html' })],
    });
    const gate = uiVisualGate(data, { browserAvailable: true });
    expect(gate).toMatchObject({ required: true, verified: false });
    expect(gate.reason).toContain('no screenshot');
  });

  it('rejects completion when files were edited after the last screenshot', () => {
    const data = ledger({
      filesChanged: ['index.html'],
      actions: [
        action({ tool: 'browse', paramsSummary: 'browse screenshot' }),
        action({ tool: 'apply_edit', paramsSummary: 'edit styles.css' }),
      ],
    });
    const gate = uiVisualGate(data, { browserAvailable: true });
    expect(gate).toMatchObject({ required: true, verified: false });
    expect(gate.reason).toContain('AFTER your last look at the page');
  });

  it('accepts when the final state was seen after the last edit', () => {
    const data = ledger({
      filesChanged: ['index.html'],
      planDesign: { frontend: 'views' },
      actions: [
        action({ tool: 'apply_edit', paramsSummary: 'edit index.html' }),
        action({ tool: 'browse', paramsSummary: 'browse screenshot' }),
        action({ tool: 'read_file', paramsSummary: 'read notes.md' }),
      ],
    });
    expect(uiVisualGate(data, { browserAvailable: true })).toMatchObject({ required: true, verified: true });
  });

  it('ignores failed screenshots and failed edits', () => {
    const data = ledger({
      filesChanged: ['app.css'],
      actions: [
        action({ tool: 'browse', paramsSummary: 'browse screenshot', status: 'error' }),
        action({ tool: 'browse', paramsSummary: 'browse screenshot' }),
        action({ tool: 'write_file', paramsSummary: 'write app.css', status: 'denied' }),
      ],
    });
    expect(uiVisualGate(data, { browserAvailable: true })).toMatchObject({ verified: true });
  });
});
