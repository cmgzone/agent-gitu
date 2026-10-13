import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';
export async function companyCalendarApi(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, deps: CompanyApiDeps): Promise<boolean> {
  if (suffix !== '/calendar' && !suffix.startsWith('/calendar/')) return false;
  if (!deps.calendar) {
    deps.send(res, 503, { error: 'Calendar transport is unavailable on this host.' });
    return true;
  }
  const calendar = deps.calendar(company.id),
    actor = { kind: 'director' as const };
  if (suffix === '/calendar' && method === 'GET') {
    let accounts: Awaited<ReturnType<typeof calendar.accounts>> = [],
      error: string | undefined;
    try {
      accounts = await calendar.accounts();
    } catch {
      error = 'Calendar accounts could not be checked. Reconnect in Resources.';
    }
    deps.send(res, 200, {
      accounts,
      links: calendar.list().map((link) => ({ ...link, outOfDate: calendar.needsSync(link) })),
      meetings: deps.store.db
        .prepare(
          "SELECT json_object('id',id,'title',json_extract(data,'$.title'),'state',json_extract(data,'$.state'),'startAt',json_extract(data,'$.startAt'),'endAt',json_extract(data,'$.endAt'),'timezone',json_extract(data,'$.timezone'),'revision',json_extract(data,'$.revision')) AS metadata FROM records WHERE kind='meeting' AND company_id=? ORDER BY json_extract(data,'$.startAt') DESC LIMIT 200",
        )
        .all(company.id)
        .map((row) => JSON.parse(String(row['metadata']))),
      error,
    });
  } else if (method === 'POST') {
    const input = await deps.body(req);
    if (suffix === '/calendar') {
      const link = await calendar.configure(actor, String(input['meetingId']), input as never);
      deps.start();
      deps.send(res, 201, { link });
    } else {
      const match = suffix.match(/^\/calendar\/([^/]+)\/sync$/);
      if (!match) {
        deps.send(res, 404, { error: 'Calendar route not found.' });
        return true;
      }
      if (input['force'] !== undefined && typeof input['force'] !== 'boolean') throw new Error('Choose an explicit Calendar refresh preference.');
      deps.send(res, 200, { link: await calendar.sync(actor, decodeURIComponent(match[1]!), Number(input['revision']), input['force'] === true) });
    }
  } else deps.send(res, 405, { error: 'Method not allowed.' });
  return true;
}
