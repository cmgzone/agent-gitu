export type ScheduleRecurrence = 'interval' | 'daily' | 'weekdays' | 'weekly' | 'once';

export interface CalendarScheduleFields {
  /** Recurrence pattern; omitted or 'interval' uses relative `every` durations. */
  recurrence?: ScheduleRecurrence;
  /** Local wall-clock time "HH:MM" (24h) for daily/weekdays/weekly schedules. */
  atTime?: string;
  /** Weekday numbers (0 = Sun .. 6 = Sat) for weekly schedules. */
  daysOfWeek?: number[];
  /** Specific ISO timestamp for one-shot ('once') schedules. */
  runAt?: string;
  /** Optional IANA timezone identifier (informational / display). */
  timezone?: string;
}

const VALID_RECURRENCES: ReadonlySet<string> = new Set(['interval', 'daily', 'weekdays', 'weekly', 'once']);

export function normalizeAtTime(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeDaysOfWeek(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const days = [...new Set(raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b,
  );
  return days.length > 0 ? days : undefined;
}

export function normalizeRunAt(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function normalizeRecurrence(raw: unknown): ScheduleRecurrence | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  return VALID_RECURRENCES.has(v) ? (v as ScheduleRecurrence) : undefined;
}

export function sanitizeCalendarFields(raw: Record<string, unknown>): CalendarScheduleFields {
  const recurrence = normalizeRecurrence(raw['recurrence']);
  const atTime = normalizeAtTime(raw['atTime']);
  const daysOfWeek = normalizeDaysOfWeek(raw['daysOfWeek']);
  const runAt = normalizeRunAt(raw['runAt']);
  const timezone = typeof raw['timezone'] === 'string' && raw['timezone'].trim().length <= 64
    ? raw['timezone'].trim()
    : undefined;

  const out: CalendarScheduleFields = {};
  if (recurrence) out.recurrence = recurrence;
  if (atTime) out.atTime = atTime;
  if (daysOfWeek) out.daysOfWeek = daysOfWeek;
  if (runAt) out.runAt = runAt;
  if (timezone) out.timezone = timezone;
  return out;
}

export function defaultEveryForRecurrence(fields: CalendarScheduleFields, fallbackEvery?: string): string {
  if (fallbackEvery && fallbackEvery.trim()) return fallbackEvery.trim();
  switch (fields.recurrence) {
    case 'daily':
    case 'weekdays':
      return '1d';
    case 'weekly':
      return '1w';
    case 'once':
      return '1d';
    default:
      return '1h';
  }
}

export function matchingWeekdays(fields: CalendarScheduleFields): number[] {
  if (fields.recurrence === 'weekdays') return [1, 2, 3, 4, 5];
  if (fields.recurrence === 'weekly') return fields.daysOfWeek?.length ? fields.daysOfWeek : [1];
  return [0, 1, 2, 3, 4, 5, 6];
}

function parseAtTimeParts(atTime?: string): { hour: number; minute: number } {
  const norm = normalizeAtTime(atTime) ?? '09:00';
  const [h, m] = norm.split(':').map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
}

/**
 * Determine whether a calendar-aware schedule is due at `nowMs`.
 * Returns `null` when the schedule is a plain relative `interval` schedule so
 * callers can run their existing `parseEvery` duration check.
 */
export function isCalendarScheduleDue(
  fields: CalendarScheduleFields,
  opts: { lastRunAt?: string; createdAt?: string; nowMs?: number },
): boolean | null {
  const nowMs = opts.nowMs ?? Date.now();
  const recurrence = fields.recurrence;
  if (!recurrence || recurrence === 'interval') {
    if (fields.runAt && !recurrence) {
      const targetMs = Date.parse(fields.runAt);
      if (!Number.isFinite(targetMs)) return false;
      const lastMs = opts.lastRunAt ? Date.parse(opts.lastRunAt) : 0;
      return nowMs >= targetMs && lastMs < targetMs;
    }
    return null;
  }

  if (recurrence === 'once') {
    if (!fields.runAt) return false;
    const targetMs = Date.parse(fields.runAt);
    if (!Number.isFinite(targetMs)) return false;
    const lastMs = opts.lastRunAt ? Date.parse(opts.lastRunAt) : 0;
    return nowMs >= targetMs && lastMs < targetMs;
  }

  const { hour, minute } = parseAtTimeParts(fields.atTime);
  const allowedDays = matchingWeekdays(fields);
  const nowDate = new Date(nowMs);
  if (!allowedDays.includes(nowDate.getDay())) return false;

  const scheduledToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
    hour,
    minute,
    0,
    0,
  ).getTime();

  if (nowMs < scheduledToday) return false;
  const lastMs = opts.lastRunAt ? Date.parse(opts.lastRunAt) : 0;
  if (lastMs >= scheduledToday) return false;

  // Avoid firing immediately on creation if the user created a daily/weekly
  // rule whose today slot already passed earlier today.
  const createdMs = opts.createdAt ? Date.parse(opts.createdAt) : 0;
  if (!opts.lastRunAt && Number.isFinite(createdMs) && createdMs > scheduledToday) {
    return false;
  }
  return true;
}

/**
 * Compute the next ISO occurrence timestamp for any schedule (calendar-aware or
 * relative interval) so Web/Desktop/Mobile clients render consistent countdowns
 * and projections.
 */
export function computeNextCalendarRunIso(
  fields: CalendarScheduleFields & { every?: string; enabled?: boolean; lastRunAt?: string; nextRetryAt?: string },
  parseIntervalMs: (every: string) => number,
  nowMs = Date.now(),
): string | undefined {
  if (fields.enabled === false) return undefined;
  if (fields.nextRetryAt) {
    const retryMs = Date.parse(fields.nextRetryAt);
    if (Number.isFinite(retryMs) && retryMs > nowMs) return new Date(retryMs).toISOString();
  }

  const recurrence = fields.recurrence ?? (fields.runAt ? 'once' : 'interval');

  if (recurrence === 'once') {
    if (!fields.runAt) return undefined;
    const targetMs = Date.parse(fields.runAt);
    if (!Number.isFinite(targetMs)) return undefined;
    const lastMs = fields.lastRunAt ? Date.parse(fields.lastRunAt) : 0;
    if (lastMs >= targetMs) return undefined;
    return new Date(targetMs).toISOString();
  }

  if (recurrence === 'daily' || recurrence === 'weekdays' || recurrence === 'weekly') {
    const { hour, minute } = parseAtTimeParts(fields.atTime);
    const allowedDays = matchingWeekdays(fields);
    const lastMs = fields.lastRunAt ? Date.parse(fields.lastRunAt) : 0;
    const base = new Date(nowMs);
    for (let offset = 0; offset <= 14; offset++) {
      const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, hour, minute, 0, 0);
      if (!allowedDays.includes(cand.getDay())) continue;
      const ms = cand.getTime();
      if (ms > nowMs && ms > lastMs) {
        return cand.toISOString();
      }
    }
    return undefined;
  }

  if (!fields.every) return undefined;
  let intervalMs: number;
  try {
    intervalMs = parseIntervalMs(fields.every);
  } catch {
    return undefined;
  }
  const lastMs = fields.lastRunAt ? Date.parse(fields.lastRunAt) : 0;
  const nextMs = lastMs > 0 ? Math.max(nowMs, lastMs + intervalMs) : nowMs + intervalMs;
  return new Date(nextMs).toISOString();
}
