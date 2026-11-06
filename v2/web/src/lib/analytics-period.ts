export type AnalyticsRangeKey = '7d' | '30d' | '90d' | '12m' | 'all' | `custom:${string},${string}`;
const DAY = 86_400_000;

function calendarDay(value: string | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

export function normalizeAnalyticsRange(raw: string | null): AnalyticsRangeKey {
  if (raw && ['7d', '30d', '90d', '12m', 'all'].includes(raw)) return raw as AnalyticsRangeKey;
  if (raw?.startsWith('custom:')) {
    const parts = raw.slice(7).split(',');
    const start = calendarDay(parts[0]); const end = calendarDay(parts[1]);
    if (parts.length === 2 && start !== null && end !== null && end >= start && end - start < 3660 * DAY
      && end + DAY <= 253402214400000) return raw as AnalyticsRangeKey;
  }
  return '30d';
}

/** Date-only ranges use UTC and include the selected final calendar day. */
export function resolveAnalyticsPeriod(raw: string | null, now = Date.now()): { days: number; since?: string; until?: string } {
  const range = normalizeAnalyticsRange(raw);
  if (range.startsWith('custom:')) {
    const [from, to] = range.slice(7).split(',');
    const start = calendarDay(from)!; const exclusiveEnd = calendarDay(to)! + DAY;
    return { days: (exclusiveEnd - start) / DAY, since: new Date(start).toISOString(), until: new Date(exclusiveEnd).toISOString() };
  }
  if (range === 'all') return { days: 3650 };
  const days = range === '7d' ? 7 : range === '90d' ? 90 : range === '12m' ? 365 : 30;
  return { days, since: new Date(now - days * DAY).toISOString() };
}

export function analyticsPeriodLabel(range: AnalyticsRangeKey): string {
  if (range === 'all') return 'Histórico';
  if (range.startsWith('custom:')) {
    const format = (value: string) => value.split('-').reverse().join('/');
    const [from, to] = range.slice(7).split(','); return `${format(from)} a ${format(to)} (UTC)`;
  }
  return range === '12m' ? 'Últimos 12 meses' : `Últimos ${range.slice(0, -1)} días`;
}
