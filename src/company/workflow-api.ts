import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
import { canonicalAction } from './store.js';
import { CompanyOrganization } from './organization.js';
import { CompanyWorkflows } from './workflows.js';
import { coworkNativeTools } from '../cowork/tools.js';
export function companyWorkflowService(company: Company, deps: CompanyApiDeps): CompanyWorkflows {
  if (deps.workflows) return deps.workflows(company.id);
  const org = new CompanyOrganization(deps.store, company.id, deps.cowork());
  return new CompanyWorkflows(org, (id) => {
    const a = org.cowork.getAgent(id);
    return a ? coworkNativeTools(a, true).map((t) => t.name) : [];
  });
}
export async function companyWorkflowApi(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, deps: CompanyApiDeps): Promise<boolean> {
  if (!/^\/(workflows|workflow-runs)(\/|$)/.test(suffix)) return false;
  const service = companyWorkflowService(company, deps),
    actor = { kind: 'director' as const };
  if (suffix === '/workflows' && method === 'GET') deps.send(res, 200, { workflows: service.list(actor), runs: service.runs(actor) });
  else if (suffix === '/workflows' && method === 'POST') deps.send(res, 201, { workflow: service.save(actor, (await deps.body(req)) as never) });
  else {
    const match = suffix.match(/^\/(workflows|workflow-runs)\/([\w-]+)(?:\/([\w-]+))?$/);
    if (!match) {
      deps.send(res, 404, { error: 'Workflow route not found.' });
      return true;
    }
    const [, area, id, action] = match;
    if (!action && method === 'GET')
      deps.send(
        res,
        200,
        area === 'workflows'
          ? { workflow: service.read(actor, id!) }
          : { run: service.run(actor, id!), version: service.version(actor, service.run(actor, id!).workflowId, service.run(actor, id!).version) },
      );
    else if (method === 'POST') {
      const input = await deps.body(req);
      let value: unknown;
      if (area === 'workflows') {
        if (action === 'save') value = { workflow: service.save(actor, { ...input, id } as never) };
        else if (action === 'approve') value = { workflow: service.approve(actor, id!, Number(input['version']), Number(input['revision'])) };
        else if (action === 'archive') value = { workflow: service.archive(actor, id!, Number(input['version']), Number(input['revision'])) };
        else if (action === 'validate') value = { issues: service.validate(service.version(actor, id!, Number(input['version'])), input['input']) };
        else if (action === 'simulate')
          value = { simulation: service.simulate(actor, id!, Number(input['version']), input['input'] ?? {}, (input['samples'] ?? {}) as Record<string, unknown>) };
        else if (action === 'start') {
          value = { run: service.start(actor, id!, Number(input['version']), input['input'] ?? {}, typeof input['requestId'] === 'string' ? input['requestId'] : undefined) };
          deps.start();
        } else {
          deps.send(res, 404, { error: 'Workflow action not found.' });
          return true;
        }
      } else {
        if (action === 'review')
          value = { run: service.review(actor, id!, String(input['stepId']), input['approved'] as boolean, String(input['digest']), Number(input['revision'])) };
        else if (action === 'retry') value = { run: service.retry(actor, id!, String(input['stepId']), Number(input['revision'])) };
        else if (action === 'cancel') value = { run: service.cancel(actor, id!, Number(input['revision'])) };
        else {
          deps.send(res, 404, { error: 'Workflow run action not found.' });
          return true;
        }
        deps.start();
      }
      deps.send(res, 200, value);
    } else deps.send(res, 405, { error: 'Method not allowed.' });
  }
  return true;
}
export function executeWorkflowTool(service: CompanyWorkflows, agentId: string, args: Record<string, unknown>, invocation = 'native-unscoped') {
  const actor = { kind: 'agent' as const, agentId };
  let value: unknown;
  switch (args['action']) {
    case 'list':
      value = { workflows: service.list(actor), runs: service.runs(actor) };
      break;
    case 'read':
      value = service.read(actor, String(args['id']));
      break;
    case 'save':
      value = service.save(actor, args['input'] as never);
      break;
    case 'validate':
      value = service.validate(service.version(actor, String(args['id']), Number(args['version'])));
      break;
    case 'simulate':
      value = service.simulate(actor, String(args['id']), Number(args['version']), args['input'] ?? {}, (args['samples'] ?? {}) as Record<string, unknown>);
      break;
    case 'start':
      value = service.start(
        actor,
        String(args['id']),
        Number(args['version']),
        args['input'] ?? {},
        createHash('sha256')
          .update(canonicalAction({ agentId, invocation, id: args['id'], version: args['version'], input: args['input'] ?? {} }))
          .digest('hex'),
      );
      break;
    case 'run':
      value = service.run(actor, String(args['id']));
      break;
    default:
      throw new Error('Choose list, read, save, validate, simulate, start or run. Director approval remains separate.');
  }
  return { ok: true, output: JSON.stringify(value) };
}
