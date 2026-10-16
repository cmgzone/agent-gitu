import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { captureVerificationScope, refreshScopedVerification } from '../src/evidence/verification-scope.js';
import { EvidenceEngine, hasRegressionProof } from '../src/evidence/evidence.js';
import { selectVerificationCommands } from '../src/evidence/verification-policy.js';
import { getWorkspaceFingerprint, gitExec } from '../src/git/git.js';
import { agentVerificationGate } from '../src/agent/agent-workflow.js';
import { uiVisualGate } from '../src/agent/ui-gate.js';
import { planRisk } from '../src/agent/risk-planner.js';
import { shouldRunFinalQualityReview } from '../src/agent/quality-review.js';
import type { Evidence, TaskLedgerData } from '../src/types.js';

const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-dynamic-verification-'));
  folders.push(root);
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src', 'page.html'), '<h1>Hello</h1>');
  writeFileSync(path.join(root, 'package.json'), '{}');
  writeFileSync(path.join(root, 'README.md'), 'Setup');
  return root;
}
const data = (partial: Partial<TaskLedgerData> = {}): TaskLedgerData => ({ actions: [], evidence: [], acceptanceCriteria: [], plan: [], blockers: [], filesChanged: [], ...partial }) as unknown as TaskLedgerData;
const pass = (command = 'npm test'): Evidence => ({ id: 'ev-1', kind: 'test', command, label: command, outputExcerpt: 'passed', passed: true, workspaceFingerprint: 'current', createdAt: '2026-10-16T10:02:00Z' });

describe('dynamic verification', () => {
  it('selects required/focused checks and adds complementary checks only for strict work', () => {
    const project = { testCommand: 'npm test', typecheckCommand: 'npm run typecheck', lintCommand: 'npm run lint', buildCommand: 'npm run build' };
    const input = { required: [], project, evidence: [], fingerprint: 'current', strict: false };
    expect([...selectVerificationCommands(input)]).toEqual(['npm run typecheck']);
    expect([...selectVerificationCommands({ ...input, required: ['node regression-test.cjs'] })]).toEqual(['node regression-test.cjs']);
    expect([...selectVerificationCommands({ ...input, evidence: [pass()] })]).toEqual([]);
    expect([...selectVerificationCommands({ ...input, strict: true, required: ['node regression-test.cjs'] })]).toEqual(['node regression-test.cjs', 'npm run typecheck']);
  });

  it.each([false, true])('reuses scoped checks and screenshots across unrelated edits, including persisted records (git=%s)', async (git) => {
    const root = fixture();
    if (git) await gitExec(root, ['init', '-q']);
    const before = await getWorkspaceFingerprint(root);
    const scope = await captureVerificationScope({ paths: ['src'], reason: 'This static page uses only src; project configuration is included.' }, root);
    const engine = new EvidenceEngine();
    const ledger = data({ filesChanged: ['src/page.html'], acceptanceCriteria: EvidenceEngine.normalizeCriteria([{ text: 'Page checks pass', verification: 'npm test' }]).map((c) => ({ ...c, id: 'ac-1', evidenceIds: [], satisfied: false })) });
    const evidence = engine.record(ledger, { kind: 'test', label: 'Page test', command: 'npm test', output: 'passed', passed: true, workspaceFingerprint: before, verificationScope: scope });
    expect(engine.link(ledger, 'ac-1', evidence.id, before).ok).toBe(true);
    ledger.actions.push({ tool: 'browse', status: 'success', paramsSummary: 'browse screenshot', createdAt: '2026-10-16T10:00:00Z', verifiedWorkspaceFingerprint: before, verificationScope: scope } as TaskLedgerData['actions'][number]);
    const restored: TaskLedgerData = JSON.parse(JSON.stringify(ledger));
    writeFileSync(path.join(root, 'README.md'), 'Updated setup');
    const after = await getWorkspaceFingerprint(root);
    expect(after).not.toBe(before);
    await refreshScopedVerification(restored, root, after);
    expect(engine.gate(restored, after).open).toBe(true);
    expect(agentVerificationGate(restored, before, after, new Set(['npm test'])).open).toBe(true);
    expect(uiVisualGate(restored, { browserAvailable: true, workspaceFingerprint: after }).verified).toBe(true);
    writeFileSync(path.join(root, 'src', 'page.html'), '<h1>Changed</h1>');
    const changed = await getWorkspaceFingerprint(root);
    await refreshScopedVerification(restored, root, changed);
    expect(engine.gate(restored, changed).open).toBe(false);
    expect(uiVisualGate(restored, { browserAvailable: true, workspaceFingerprint: changed }).verified).toBe(false);
  });

  it('invalidates scoped evidence on project configuration changes and newer failures', async () => {
    const root = fixture();
    const scope = await captureVerificationScope({ paths: ['src'], reason: 'Static page inputs' }, root);
    const ledger = data({ evidence: [{ ...pass(), verificationScope: scope }] });
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    await refreshScopedVerification(ledger, root, await getWorkspaceFingerprint(root));
    expect(scope?.validatedFor).toBeUndefined();
    const fingerprint = await getWorkspaceFingerprint(root);
    const currentScope = await captureVerificationScope({ paths: ['src'], reason: 'Static page inputs' }, root);
    ledger.evidence = [{ ...pass(), workspaceFingerprint: fingerprint, verificationScope: currentScope }, { ...pass(), id: 'ev-2', workspaceFingerprint: fingerprint, passed: false }];
    expect(agentVerificationGate(ledger, 'before', fingerprint, new Set(['npm test'])).open).toBe(false);
    const engine = new EvidenceEngine();
    ledger.acceptanceCriteria = [{ id: 'ac-1', text: 'Test passes', verification: 'npm test', satisfied: true, evidenceIds: ['ev-1'] }];
    writeFileSync(path.join(root, 'README.md'), 'An unrelated edit after the failure');
    const after = await getWorkspaceFingerprint(root);
    await refreshScopedVerification(ledger, root, after);
    expect(engine.gate(ledger, after).open).toBe(false);
  });

  it('automatically includes the verification script in a focused scope', async () => {
    const root = fixture();
    writeFileSync(path.join(root, 'check.cjs'), 'console.log("test");');
    const scope = await captureVerificationScope({ paths: ['src'], reason: 'Page source' }, root, 'node check.cjs');
    expect(scope?.paths).toContain('check.cjs');
    const ledger = data({ evidence: [{ ...pass('node check.cjs'), verificationScope: scope }] });
    writeFileSync(path.join(root, 'check.cjs'), 'throw new Error("changed oracle");');
    await refreshScopedVerification(ledger, root, await getWorkspaceFingerprint(root));
    expect(scope?.validatedFor).toBeUndefined();
  });

  it('rejects scopes outside the project, empty scopes, and model-supplied hashes', async () => {
    const root = fixture();
    for (const paths of [[], ['../outside'], ['C:\\outside'], ['.hermes'], ['missing']]) expect(await captureVerificationScope({ paths, reason: 'Test', fingerprint: 'invented' }, root)).toBeUndefined();
    const scope = await captureVerificationScope({ paths: ['src'], reason: 'Static inputs', fingerprint: 'invented', validatedFor: 'invented' }, root);
    expect(scope?.fingerprint).not.toBe('invented');
    expect(scope?.validatedFor).toBeUndefined();
  });

  it('accepts causal shell edits only when content actually changed', () => {
    const before = { ...pass(), passed: false, createdAt: '2026-10-16T10:00:00Z', workspaceFingerprint: 'before' };
    expect(hasRegressionProof({ evidence: [before, pass()], actions: [] })).toBe(true);
    expect(hasRegressionProof({ evidence: [{ ...before, workspaceFingerprint: 'current' }, pass()], actions: [] })).toBe(false);
    expect(hasRegressionProof({ evidence: [{ ...before, workspaceFingerprint: 'partial-before' }, pass()], actions: [] })).toBe(false);
  });

  it('uses actual diffs to exempt comment-only TSX and API-only PHP, while retaining visible changes', () => {
    for (const [file, lines] of [['src/Page.tsx', '-// Old explanation\n+// Better explanation'], ['api/billing.php', '-return json_encode($old);\n+return json_encode($new);']]) {
      const diff = { changedFiles: [file!], diffBody: `diff --git a/${file} b/${file}\n${lines}\n` };
      expect(uiVisualGate(data({ filesChanged: [file!] }), { browserAvailable: false, diff }).verified).toBe(true);
      expect(uiVisualGate(data({ filesChanged: [file!] }), { browserAvailable: false, diff: { ...diff, diffBodyTruncated: true } }).verified).toBe(false);
    }
    const diff = { changedFiles: ['src/Page.tsx'], diffBody: 'diff --git a/src/Page.tsx b/src/Page.tsx\n-<h1>Old</h1>\n+<h1>New</h1>\n' };
    expect(uiVisualGate(data({ filesChanged: diff.changedFiles }), { browserAvailable: false, diff }).verified).toBe(false);
  });

  it('keeps genuine financial behavior strict but treats a pricing label as presentation work', () => {
    expect(planRisk('Change the pricing button label').strictVerification).toBe(false);
    expect(planRisk('Change the pricing calculation').strictVerification).toBe(true);
    expect(planRisk('Change the pricing button label and charge the new amount').strictVerification).toBe(true);
    expect(planRisk('Change the pricing button label and font').strictVerification).toBe(false);
    expect(planRisk('Copy credentials to a file').strictVerification).toBe(true);
  });

  it('skips another AI review for a low-risk change with behavioral proof, while preserving strict review', () => {
    const input = { effortPlan: { complexity: 'low' as const }, bugFix: true, phaseData: data({ evidence: [pass()], actions: [{ tool: 'run_command', status: 'error' } as TaskLedgerData['actions'][number]] }), diff: { changedFiles: ['src/fix.ts'] }, workspaceFingerprint: 'current', evidenceGateOpen: true, specialistOrVerificationUncertain: false };
    expect(shouldRunFinalQualityReview(input).run).toBe(false);
    expect(shouldRunFinalQualityReview({ ...input, riskPlan: { risk: 'security', strictVerification: true, domains: ['security'] } }).run).toBe(true);
  });
});
