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
  it('is not required for non-UI tasks and when no browser exists', () => {
    const data = ledger({ filesChanged: ['index.html'] });
    expect(uiVisualGate(data, { browserAvailable: false })).toMatchObject({ required: false, verified: true });
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
    expect(gate.reason).toContain('AFTER your last screenshot');
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
