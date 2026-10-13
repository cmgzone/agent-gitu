import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { companyDashboard } from '../src/company/dashboard.js';
import { COMPANY_DASHBOARD_JS } from '../src/server/ui-company-dashboard.js';
import { COMPANY_WORK_JS } from '../src/server/ui-company-work.js';

describe('Company performance charts', () => {
  it('counts persisted attempts once, scopes companies and groups days in the company timezone', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-charts-')),
      store = new CompanyStore(root);
    try {
      const company = store.create({ timezone: 'Africa/Nairobi' }),
        other = store.create();
      const save = (id: string, companyId: string, createdAt: string, costUsd?: number) =>
        store.db
          .prepare('INSERT OR REPLACE INTO records(kind,id,company_id,data) VALUES(?,?,?,?)')
          .run(
            'usage',
            id,
            companyId,
            JSON.stringify({
              id,
              companyId,
              agentId: 'lead',
              provider: 'fixture',
              model: 'fixture',
              outcome: 'completed',
              provenance: costUsd === undefined ? 'unknown' : 'catalog',
              createdAt,
              costUsd,
              inputTokens: 20,
              outputTokens: 5,
            }),
          );
      save('first', company.id, '2026-10-12T20:59:00Z', 0.25);
      save('second', company.id, '2026-10-12T21:01:00Z', 0.5);
      save('second', company.id, '2026-10-12T21:01:00Z', 0.5);
      save('unpriced', company.id, '2026-10-13T07:00:00Z');
      save('old', company.id, '2026-09-01T00:00:00Z', 99);
      save('other', other.id, '2026-10-13T07:00:00Z', 100);
      const result = companyDashboard(store, company, 7, new Date('2026-10-13T12:00:00Z'));
      expect(result.daily).toHaveLength(7);
      expect(result.daily.find((d) => d.day === '2026-10-12')).toMatchObject({ calls: 1, knownCostUsd: 0.25 });
      expect(result.daily.at(-1)).toMatchObject({ day: '2026-10-13', calls: 2, knownCostUsd: 0.5, unknownCalls: 1, inputTokens: 40, outputTokens: 10 });
      expect(result.daily.reduce((n, d) => n + d.calls, 0)).toBe(3);
      expect(() => companyDashboard(store, company, 100)).toThrow('7, 14 or 30');
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps empty periods empty across DST and supports all chart ranges', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-chart-dst-')),
      store = new CompanyStore(root);
    try {
      const company = store.create({ timezone: 'America/New_York' });
      for (const days of [7, 14, 30]) {
        const result = companyDashboard(store, company, days, new Date('2026-11-02T01:30:00Z'));
        expect(new Set(result.daily.map((d) => d.day)).size).toBe(days);
        expect(result.daily.at(-1)?.day).toBe('2026-11-01');
        expect(result.daily.every((d) => d.calls === 0 && d.knownCostUsd === 0)).toBe(true);
      }
    } finally {
      store.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('renders honest costs, readable task status and escaped identities without turning reviews into tasks', () => {
    const context = runInNewContext(COMPANY_WORK_JS + COMPANY_DASHBOARD_JS + ';({companyDashboardPanels,companyWorkMatches})', {
      Companies: { workFilter: 'all', workStatus: 'blocked', workAgent: 'lead' },
      esc: (v: unknown) => String(v).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    });
    const data = {
      company: { directionVersion: 1 },
      agents: [{ id: 'lead', name: '<script>Ari</script>' }],
      missions: [{ id: 'm', agentId: 'lead', goal: 'Prepare report', status: 'blocked', criteria: [] }],
      helpers: [],
      jobs: [{ kind: 'review', state: 'done' }],
    };
    const html = context.companyDashboardPanels(data, { days: 7, timezone: 'Africa/Nairobi', daily: [{ day: '2026-10-13', calls: 2, knownCostUsd: 0.5, unknownCalls: 1 }] });
    expect(html).toContain('$0.50');
    expect(html).toContain('1 attempt has unknown cost.');
    expect(html).not.toContain('<script>');
    expect(html).toContain('1 saved tasks');
    expect(html).toContain('data-chart-agent="lead"');
    expect(html).toContain('data-chart-status="blocked"');
    expect(context.companyWorkMatches(data)).toHaveLength(1);
    expect(context.companyWorkMatches({ ...data, missions: [{ ...data.missions[0], agentId: 'other' }] })).toHaveLength(0);
  });
});
