import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalyticsFilters } from '../app/admin/analytics/hooks/useAnalyticsFilters';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
beforeEach(() => window.history.replaceState(null, '', '/admin/analytics?tab=academic&range=7d#estudios'));

describe('Analytics filter navigation', () => {
  it('keeps the selected section and anchor when changing a profile filter', () => {
    const hook = renderHook(() => useAnalyticsFilters()); act(() => hook.result.current.setFilters({ city: ['Madrid'] })); hook.rerender();
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('academic'); expect(window.location.hash).toBe('#estudios');
    expect(hook.result.current.filters.city).toEqual(['Madrid']); expect(hook.result.current.queryString).not.toContain('tab');
  });
  it('preserves a section selected after the previous filter render', () => {
    const hook = renderHook(() => useAnalyticsFilters()); window.history.replaceState(null, '', '/admin/analytics?tab=growth&range=7d');
    act(() => hook.result.current.setFilters({ range: '30d' })); expect(window.location.search).toBe('?tab=growth');
  });
  it('normalizes malformed ranges and academic years before they reach the query', () => {
    window.history.replaceState(null, '', '/admin/analytics?range=invalid&year=1oops,2'); const hook = renderHook(() => useAnalyticsFilters());
    expect(hook.result.current.filters.range).toBe('30d'); expect(hook.result.current.filters.year).toEqual([2]);
  });
});
