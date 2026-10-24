import type { CompanyStore } from './store.js';

/** Small owner-facing projections keep discussions discoverable without polling transcripts. */
export function companyManagementSummary(store: CompanyStore, companyId: string) {
  const rows = <T>(sql: string) =>
    store.db
      .prepare(sql)
      .all(companyId)
      .map((row) => JSON.parse(String(row['data'])) as T);
  const meetingRequests = rows<{
    id: string;
    revision: number;
    title: string;
    reason: string;
    requestedBy: string;
    participants: { agentId: string }[];
    agenda: string[];
    directionVersion: number;
    createdAt: string;
  }>(
    `SELECT json_object('id',id,'revision',json_extract(data,'$.revision'),'title',json_extract(data,'$.title'),
      'reason',json_extract(data,'$.reason'),'requestedBy',json_extract(data,'$.requestedBy'),'participants',json_extract(data,'$.participants'),'agenda',json_extract(data,'$.agenda'),
      'directionVersion',json_extract(data,'$.directionVersion'),'createdAt',json_extract(data,'$.createdAt')) AS data
      FROM records WHERE kind='meeting-request' AND company_id=? AND json_extract(data,'$.state')='pending' ORDER BY rowid DESC LIMIT 20`,
  );
  const meetings = rows<{
    id: string;
    title: string;
    state: string;
    startAt: string;
    chairId: string;
    organizer: unknown;
    requestedBy?: string;
    contributions: number;
    pendingDecisions: number;
    latestText?: string;
    updatedAt: string;
  }>(
    `SELECT json_object('id',id,'title',json_extract(data,'$.title'),'state',json_extract(data,'$.state'),
      'startAt',json_extract(data,'$.startAt'),'chairId',json_extract(data,'$.chairId'),'organizer',json_extract(data,'$.organizer'),'requestedBy',json_extract(data,'$.requestedBy'),
      'contributions',json_array_length(data,'$.contributions'),'latestText',substr(json_extract(data,'$.contributions[#-1].text'),1,600),
      'pendingDecisions',(SELECT count(*) FROM json_each(records.data,'$.decisions') AS decision WHERE json_extract(decision.value,'$.state') IN ('proposed','under-review','approval-required')),
      'updatedAt',json_extract(data,'$.updatedAt')) AS data FROM records WHERE kind='meeting' AND company_id=?
      ORDER BY CASE json_extract(data,'$.state') WHEN 'active' THEN 0 WHEN 'interrupted' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
      json_extract(data,'$.updatedAt') DESC LIMIT 8`,
  );
  const workflowDrafts = rows<{ id: string; title: string; revision: number; version: number; createdBy: unknown }>(
    `SELECT json_object('id',id,'title',json_extract(data,'$.title'),'revision',json_extract(data,'$.revision'),
      'version',json_extract(data,'$.versions[#-1].version'),'createdBy',json_extract(data,'$.versions[#-1].createdBy')) AS data
      FROM records WHERE kind='workflow' AND company_id=? AND json_extract(data,'$.versions[#-1].state')='draft' ORDER BY rowid DESC LIMIT 20`,
  );
  const workflowRuns = rows<{ id: string; workflowId: string; state: string; reason?: string; pendingReviews: number }>(
    `SELECT json_object('id',id,'workflowId',json_extract(data,'$.workflowId'),'state',json_extract(data,'$.state'),
      'reason',json_extract(data,'$.reason'),'pendingReviews',(SELECT count(*) FROM json_each(records.data,'$.steps') AS step
        WHERE json_extract(step.value,'$.approval.state')='pending')) AS data
      FROM records WHERE kind='workflow-run' AND company_id=? AND json_extract(data,'$.state') IN ('running','queued','waiting','blocked','failed')
      ORDER BY json_extract(data,'$.updatedAt') DESC LIMIT 8`,
  );
  const counts = store.db
    .prepare(
      `SELECT
    sum(CASE WHEN kind='meeting-request' AND json_extract(data,'$.state')='pending' THEN 1 ELSE 0 END) AS requests,
    sum(CASE WHEN kind='meeting' AND json_extract(data,'$.state') IN ('active','scheduled','interrupted') THEN 1 ELSE 0 END) AS meetings,
    sum(CASE WHEN kind='workflow' AND json_extract(data,'$.versions[#-1].state')='draft' THEN 1 ELSE 0 END) AS drafts
    FROM records WHERE company_id=? AND kind IN ('meeting-request','meeting','workflow')`,
    )
    .get(companyId);
  return {
    meetingRequests,
    meetings,
    workflowDrafts,
    workflowRuns,
    counts: { requests: Number(counts?.['requests'] ?? 0), meetings: Number(counts?.['meetings'] ?? 0), drafts: Number(counts?.['drafts'] ?? 0) },
  };
}
