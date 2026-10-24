import type { CompanyActor } from './management-models.js';
import type { CompanyBoardroom } from './boardroom.js';
import type { ToolResult } from '../types.js';

/** Identity is supplied by the running session; arguments cannot impersonate a director. */
export function executeBoardroomTool(room: CompanyBoardroom, actor: CompanyActor, args: Record<string, unknown>): ToolResult {
  const action = String(args['action'] ?? 'read'),
    id = String(args['meetingId'] ?? ''),
    input = (args['input'] ?? {}) as Record<string, unknown>;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide an input object.');
  let result: unknown;
  switch (action) {
    case 'request':
      result = room.request(actor, input as unknown as Parameters<CompanyBoardroom['request']>[1]);
      break;
    case 'requests':
      result = room.requests(actor);
      break;
    case 'review_request':
      result = room.reviewRequest(actor, String(input['requestId'] ?? ''), Number(input['revision']), input['approved'] as boolean, String(input['reason'] ?? ''));
      break;
    case 'list':
      result = room.list(actor, String(args['query'] ?? '')).map((m) => ({ id: m.id, title: m.title, state: m.state, startAt: m.startAt, chairId: m.chairId }));
      break;
    case 'read':
      result = room.read(actor, id);
      break;
    case 'create':
      result = room.create(actor, input as unknown as Parameters<CompanyBoardroom['create']>[1]);
      break;
    case 'start':
      result = room.begin(actor, id);
      break;
    case 'raise_hand':
      result = room.raiseHand(actor, id, input as unknown as Parameters<CompanyBoardroom['raiseHand']>[2]);
      break;
    case 'grant':
      result = room.grant(actor, id, input);
      break;
    case 'revoke':
      result = room.revokeFloor(actor, id, String(input['reason'] ?? ''));
      break;
    case 'moderate': {
      if (!['defer', 'reject', 'written'].includes(String(input['response']))) throw new Error('Choose defer, reject or written.');
      result = room.moderate(actor, id, String(input['requestId']), input['response'] as 'defer' | 'reject' | 'written', String(input['reason'] ?? ''));
      break;
    }
    case 'contribute':
      result = room.contribute(actor, id, String(input['turnId']), {
        text: String(input['text'] ?? ''),
        evidence: input['evidence'] as string[] | undefined,
        objectionTo: input['objectionTo'] as string | undefined,
      });
      break;
    case 'written':
      result = room.written(actor, id, String(input['requestId']), String(input['text'] ?? ''));
      break;
    case 'propose':
      result = room.proposeDecision(actor, id, input as unknown as Parameters<CompanyBoardroom['proposeDecision']>[2]);
      break;
    case 'propose_assignment':
      result = room.proposeAssignment(actor, id, input as unknown as Parameters<CompanyBoardroom['proposeAssignment']>[2]);
      break;
    case 'assign':
      result = room.assign(actor, id, String(input['itemId']));
      break;
    case 'decide': {
      if (typeof input['approved'] !== 'boolean') throw new Error('Choose approve or reject.');
      result = room.decide(actor, id, String(input['decisionId']), input['approved']);
      break;
    }
    case 'finish':
      result = room.finish(actor, id, input['reason'] ? String(input['reason']) : undefined);
      break;
    case 'interrupt':
      result = room.interrupt(actor, id, String(input['reason'] ?? ''));
      break;
    case 'cancel':
      result = room.cancel(actor, id, String(input['reason'] ?? ''));
      break;
    default:
      throw new Error('Choose a supported Boardroom action.');
  }
  return { ok: true, output: JSON.stringify(result) };
}
