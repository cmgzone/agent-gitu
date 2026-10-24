import { createHash } from 'node:crypto';
import type { Company, CompanyStore } from './store.js';
import type { CoworkStore } from '../cowork/store.js';
import type { CoworkMemory } from '../cowork/memory.js';
import type { CompanyMeeting } from './management-models.js';
import type { CompanyWorkflowRun } from './workflow-models.js';

/** Deterministic, restart-safe summaries; model claims never become approved policy. */
export function syncCompanyOutcomes(store: CompanyStore, company: Company, cowork: CoworkStore, memory: CoworkMemory, maxChanges = 10): void {
  const records: { kind: string; id: string; text: string }[] = [];
  for (const meeting of store.list<CompanyMeeting>('meeting', company.id).filter((m) => m.state === 'completed')) {
    // Share outcomes, not restricted attendance transcripts or private personal notes.
    records.push({
      kind: 'meeting',
      id: meeting.id,
      text:
        'Meeting "' +
        meeting.title +
        '" completed. Record ' +
        meeting.id +
        '. Decisions: ' +
        (meeting.decisions.map((d) => d.title + ' [' + d.state + ']').join('; ') || 'None recorded') +
        '. Follow-up work: ' +
        (meeting.actionItems.map((a) => a.title + ' (' + a.agentId + ', ' + a.state + ')' + (a.missionId ? ', task ' + a.missionId : '')).join('; ') || 'None recorded') +
        '. Discussion remains available in the meeting record.',
    });
  }
  for (const task of cowork.missions().filter((m) => m.status === 'done' && m.result?.trim())) {
    records.push({
      kind: 'task',
      id: task.id,
      text:
        'Task "' +
        task.goal +
        '" recorded complete by ' +
        (cowork.getAgent(task.agentId)?.name ?? task.agentId) +
        '. Record ' +
        task.id +
        '. Reported result: ' +
        task.result!.slice(0, 2400) +
        (task.result!.length > 2400 ? '… Read the task for the full result.' : ''),
    });
  }
  for (const run of store.list<CompanyWorkflowRun>('workflow-run', company.id).filter((r) => r.state === 'completed')) {
    records.push({
      kind: 'run',
      id: run.id,
      text:
        'Workflow run ' +
        run.id +
        ' completed for workflow ' +
        run.workflowId +
        ', version ' +
        run.version +
        '. Steps: ' +
        run.steps.map((s) => s.stepId + ' [' + s.state + ']' + (s.missionId ? ' task ' + s.missionId : '')).join('; ') +
        '. Read the run for full outputs.',
    });
  }
  let changes = 0;
  for (const record of records) {
    const key = 'outcome:' + company.id + ':' + record.kind + ':' + record.id;
    const hash = createHash('sha256').update(record.text).digest('hex');
    const previous = store.read<{ hash: string; entryId: string }>('cowork-company', key);
    if (previous?.hash === hash) continue; // An owner-archived unchanged memory stays archived.
    // Backfill large histories over scheduler ticks instead of synchronously
    // rewriting the memory file hundreds of times during a status request.
    if (changes >= maxChanges) break;
    const entryId = memory.rememberCompanyOutcome(company.id, company.name, record.kind + ':' + record.id, record.text, previous?.entryId);
    store.saveResource('cowork-company', key, company.id, { hash, entryId });
    changes++;
  }
}
