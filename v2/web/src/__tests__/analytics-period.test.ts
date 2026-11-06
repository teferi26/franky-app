import { describe, expect, it } from 'vitest';
import { normalizeAnalyticsRange, resolveAnalyticsPeriod } from '../lib/analytics-period';
import { parseFilters } from '../lib/analytics-filters';

describe('Analytics date boundaries', () => {
  it('includes the whole last date, even for a single selected day', () => {
    expect(resolveAnalyticsPeriod('custom:2026-09-01,2026-09-01')).toEqual({ days: 1, since: '2026-09-01T00:00:00.000Z', until: '2026-09-02T00:00:00.000Z' });
  });
  it('uses UTC calendar dates across daylight saving changes', () => {
    expect(resolveAnalyticsPeriod('custom:2026-03-28,2026-03-30')).toEqual({ days: 3, since: '2026-03-28T00:00:00.000Z', until: '2026-03-31T00:00:00.000Z' });
  });
  it.each(['custom:2026-02-30,2026-03-01', 'custom:2026-13-01,2026-13-02', 'custom:2026-09-02,2026-09-01', 'custom:2026-09-01', 'custom:2026-09-01,2026-09-02,2026-09-03', 'custom:2026-09-01T00:00:00Z,2026-09-02', 'custom:1900-01-01,2026-01-01', 'custom:9999-12-31,9999-12-31'])('normalizes malformed or unbounded date range without a 500: %s', raw => {
    expect(normalizeAnalyticsRange(raw)).toBe('30d'); expect(resolveAnalyticsPeriod(raw, Date.parse('2026-09-06T10:00:00Z')).days).toBe(30);
  });
  it('accepts a real leap date and rejects a non-leap date', () => {
    expect(normalizeAnalyticsRange('custom:2024-02-29,2024-03-01')).toBe('custom:2024-02-29,2024-03-01'); expect(normalizeAnalyticsRange('custom:2026-02-29,2026-03-01')).toBe('30d');
  });
  it('bounds rolling history to ten years without limiting all-time profile filters', () => { expect(resolveAnalyticsPeriod('all')).toEqual({ days: 3650 }); });
  it('does not convert malformed year filters into real academic years', () => { expect(parseFilters(new URLSearchParams('year=1junk,2,3.5,-1,7')).year).toEqual([2]); });
});
