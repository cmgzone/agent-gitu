import { describe, expect, it } from 'vitest';
import { RunTelemetry, renderEfficiencySummary } from '../src/agent/telemetry.js';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TokenTelemetrySnapshot } from '../src/types.js';

function snapshotWith(overrides: Partial<TokenTelemetrySnapshot>): TokenTelemetrySnapshot {
  const base: TokenTelemetrySnapshot = {
    calls: 12,
    inputTokens: 31_200,
    outputTokens: 8_400,
    cachedTokens: 0,
    estimatedInputTokens: 0,
    estimatedBySource: { system: 0, contextPack: 0, history: 0, state: 0, images: 0, digest: 0, strategy: 0, conversation: 0, memory: 0 },
    planningCalls: 0,
    executionCalls: 12,
    estimatedPlanningInput: 0,
    estimatedExecutionInput: 0,
    planningOutputTokens: 0,
    executionOutputTokens: 0,
    compactions: 1,
    screenshots: 0,
    screenshotBytes: 0,
    toolCalls: 10,
    wastedCalls: 0,
    filesInContextPack: 0,
  };
  return { ...base, ...overrides };
}

describe('efficiency summary (real-run replay comparison)', () => {
  it('renders every control-efficiency metric as one greppable line', () => {
    const line = renderEfficiencySummary(
      snapshotWith({
        semanticDuplicateReadsPrevented: 9,
        cachedObservationHits: 4,
        noDecisionImpactRejections: 3,
        investigationDriftBlocks: 1,
        actionsAfterDiagnosisBeforeRepair: 1,
        readsAfterDiagnosisBeforeRepair: 0,
        problemEpisodes: 2,
        episodeSupersessions: 1,
        staleHypothesisReopens: 0,
        mootProblemSupersessions: 0,
        userSteersHandled: 1,
        stateReplayCharsAvoided: 48_200,
      }),
      { actions: 42, stepsDone: 3, stepsTotal: 4, filesChanged: 7 },
    );
    expect(line).toContain('actions=42');
    expect(line).toContain('steps=3/4');
    expect(line).toContain('dupReadsPrevented=9');
    expect(line).toContain('cacheHits=4');
    expect(line).toContain('decisionToAct=1 (reads 0)');
    expect(line).toContain('supersessions=1');
    expect(line).toContain('reopenings=0');
    expect(line).toContain('mootSupersessions=0');
    expect(line).toContain('steers=1');
    expect(line).toContain('stateReplayAvoided=48.2Kc');
    expect(line).toContain('tokensIn=31.2Kt');
  });

  it('falls back to estimated input tokens when the provider reports nothing', () => {
    const line = renderEfficiencySummary(snapshotWith({ inputTokens: 0, estimatedInputTokens: 52_000 }), { actions: 5, stepsDone: 0, stepsTotal: 0, filesChanged: 0 });
    expect(line).toContain('tokensIn=52Kt(est)');
  });

  it('counts moot supersessions on the step-completion path (rare by design)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-moot-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'moot' }));
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'moot counter', project: { name: 'moot', repoRoot: dir, techStack: [], entrypoints: [], ignorePaths: [], lockedAt: new Date().toISOString() }, mode: 'standard' });
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        toolOk: true,
        output: 'Unexpected server-side failure marker',
        expected: '200 OK',
        stepId: 'step-1',
        semanticVerdict: { verdict: 'contradiction', explanation: 'failure state', blocking: true },
      },
      ledger,
    );
    expect(orchestrator.mootProblemSupersessions).toBe(0);
    // The blocked step completes through its own verification → moot.
    orchestrator.supersedeMootProblems(new Set(['step-1']), new Set());
    expect(orchestrator.mootProblemSupersessions).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts applied user steers', () => {
    const telemetry = new RunTelemetry();
    expect(telemetry.snapshot().userSteersHandled).toBe(0);
    telemetry.noteUserSteer();
    telemetry.noteUserSteer();
    expect(telemetry.snapshot().userSteersHandled).toBe(2);
  });
});
