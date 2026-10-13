import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import { CompanyOrganization } from './organization.js';
import { CompanyBoardroom } from './boardroom.js';

/** Owner-facing records and floor controls use the existing authenticated/scoped API. */
export async function companyBoardroomApi(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, deps: CompanyApiDeps): Promise<boolean> {
  if (suffix !== '/boardroom' && !suffix.startsWith('/boardroom/')) return false;
  const room = deps.boardroom?.(company.id)??new CompanyBoardroom(new CompanyOrganization(deps.store, company.id, deps.cowork())),
    actor = { kind: 'director' as const };
  if (suffix === '/boardroom') {
    if (method === 'GET') {
      const params = new URL(req.url || '/', 'http://localhost').searchParams,
        query = params.get('q') || '',
        offset = Number(params.get('offset') || 0),
        limit = Number(params.get('limit') || 20);
      if (query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Choose a valid meeting search and page size of 1–100.');
      deps.send(res, 200, room.historyPage(query, offset, limit));
    } else if (method === 'POST') {
      const input = await deps.body(req);
      if (
        Object.keys(input).some(
          (key) =>
            ![
              'title',
              'description',
              'type',
              'chairId',
              'departmentId',
              'participants',
              'agenda',
              'startAt',
              'durationMinutes',
              'maxTurns',
              'budgetUsd',
              'automaticModeration',
            ].includes(key),
        )
      )
        throw new Error('Unsupported meeting configuration fields.');
      const meeting = room.create(actor, input as unknown as Parameters<CompanyBoardroom['create']>[1]);
      deps.meetingChanged?.(meeting.id);
      deps.start();
      deps.send(res, 201, { meeting });
    } else deps.send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  const match = suffix.match(/^\/boardroom\/([\w-]+)(\/.*)?$/);
  if (!match) {
    deps.send(res, 404, { error: 'Meeting route not found.' });
    return true;
  }
  const id = match[1]!,
    action = match[2] || '';
  if (!action && method === 'GET') {
    deps.send(res, 200, { meeting: room.read(actor, id), usage: deps.store.meetingAccounting(company.id, id) });
    return true;
  }
  if (method !== 'POST') {
    deps.send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  const input = await deps.body(req);
  let meeting;
  if(action==='/schedule')meeting=room.reschedule(actor,id,Number(input['revision']),input as never);
  else if (action === '/start') {
    meeting = room.begin(actor, id);
  } else if (action === '/grant') meeting = room.grant(actor, id, input as Parameters<CompanyBoardroom['grant']>[2]);
  else if (action === '/revoke') meeting = room.revokeFloor(actor, id, String(input['reason'] || 'Director took the floor'));
  else if (action === '/return-floor') meeting = room.returnFloor(id);
  else if (action === '/contribute') meeting = room.directorContribution(id, String(input['agendaId']), String(input['text'] ?? ''));
  else if (action === '/moderate') {
    if (!['defer', 'reject', 'written'].includes(String(input['response']))) throw new Error('Choose defer, reject or written contribution.');
    meeting = room.moderate(actor, id, String(input['requestId']), input['response'] as 'defer' | 'reject' | 'written', String(input['reason'] ?? ''));
  } else if (action === '/participant') meeting = room.participantState(actor, id, String(input['agentId']), input['state'] as 'listening' | 'muted' | 'excused');
  else if (action === '/finish') meeting = room.finish(actor, id, String(input['reason'] || 'Director ended the meeting'));
  else if (action === '/interrupt') meeting = room.interrupt(actor, id, String(input['reason'] || 'Director paused the meeting'));
  else if (action === '/cancel') meeting = room.cancel(actor, id, String(input['reason'] || 'Director cancelled the meeting'));
  else if (action === '/assign') meeting = room.assign(actor, id, String(input['itemId']));
  else if (action === '/decide') {
    if (typeof input['approved'] !== 'boolean') throw new Error('Choose approve or reject.');
    meeting = room.decide(actor, id, String(input['decisionId']), input['approved']);
  } else {
    deps.send(res, 404, { error: 'Meeting action not found.' });
    return true;
  }
  deps.meetingChanged?.(id);
  deps.start();
  deps.send(res, 200, { meeting });
  return true;
}
