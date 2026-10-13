import type { Company, CompanyStore } from './store.js';

/** Aggregate usage without returning prompts, credentials or per-attempt payloads. */
export function companyDashboard(store: CompanyStore, company: Company, days = 14, now = new Date()) {
  if (![7, 14, 30].includes(days)) throw new Error('Choose a 7, 14 or 30 day chart range.');
  const formatter = new Intl.DateTimeFormat('en', { timeZone: company.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (date: Date) => {
    const parts = formatter.formatToParts(date),
      part = (name: string) => parts.find((p) => p.type === name)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  // Calendar dates rather than elapsed hours keep the window correct across DST.
  const today = dayKey(now),
    anchor = new Date(today + 'T12:00:00Z');
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() - days + index + 1);
    return { day: date.toISOString().slice(0, 10), calls: 0, knownCostUsd: 0, unknownCalls: 0, inputTokens: 0, outputTokens: 0 };
  });
  const byDay = new Map(daily.map((day) => [day.day, day]));
  const rows = store.db
    .prepare(
      `SELECT json_extract(data,'$.createdAt') AS ts,
    json_extract(data,'$.costUsd') AS cost, json_extract(data,'$.inputTokens') AS input,
    json_extract(data,'$.outputTokens') AS output FROM records WHERE kind='usage' AND company_id=?
    AND json_extract(data,'$.createdAt')>=?`,
    )
    .iterate(company.id, new Date(now.getTime() - (days + 2) * 86400000).toISOString());
  for (const row of rows) {
    const date = new Date(String(row['ts']));
    if (!Number.isFinite(date.getTime())) continue;
    const day = byDay.get(dayKey(date));
    if (!day) continue;
    day.calls++;
    const cost = row['cost'];
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) day.knownCostUsd += cost;
    else day.unknownCalls++;
    day.inputTokens += Math.max(0, Number(row['input']) || 0);
    day.outputTokens += Math.max(0, Number(row['output']) || 0);
  }
  return { days, timezone: company.timezone, daily, monthly: store.monthlyAccounting(company.id), updatedAt: now.toISOString() };
}
