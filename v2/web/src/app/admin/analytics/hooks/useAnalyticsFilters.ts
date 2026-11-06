"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeAnalyticsRange, type AnalyticsRangeKey } from '@/lib/analytics-period';

/**
 * Two-way binding between the URL search params and a typed filters object.
 *
 *   const { filters, setFilters, queryString, range } = useAnalyticsFilters();
 *
 * Native history integrates with Next's search params without re-rendering
 * the server tree. Both filters and selected section retain their context.
 */

export type RangeKey = AnalyticsRangeKey;

export type AnalyticsFiltersState = {
  range: RangeKey;
  comunidad: string[];
  city: string[];
  university: string[];
  gender: string[];
  age: string[];
  studentType: string[];
  year: number[];
};

const DEFAULT_RANGE: RangeKey = "30d";

function splitCsv(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function readFiltersFromUrl(sp: URLSearchParams): AnalyticsFiltersState {
  const range = normalizeAnalyticsRange(sp.get('range'));
  return {
    range,
    comunidad: splitCsv(sp.get("comunidad")),
    city: splitCsv(sp.get("city")),
    university: splitCsv(sp.get("university")),
    gender: splitCsv(sp.get("gender")),
    age: splitCsv(sp.get("age")),
    studentType: splitCsv(sp.get("studentType")),
    year: splitCsv(sp.get("year")).filter(s => /^[1-6]$/.test(s)).map(Number),
  };
}

export function filtersToQueryString(filters: AnalyticsFiltersState): string {
  const sp = new URLSearchParams();
  if (filters.range && filters.range !== DEFAULT_RANGE) sp.set("range", filters.range);
  if (filters.comunidad.length) sp.set("comunidad", filters.comunidad.join(","));
  if (filters.city.length) sp.set("city", filters.city.join(","));
  if (filters.university.length) sp.set("university", filters.university.join(","));
  if (filters.gender.length) sp.set("gender", filters.gender.join(","));
  if (filters.age.length) sp.set("age", filters.age.join(","));
  if (filters.studentType.length) sp.set("studentType", filters.studentType.join(","));
  if (filters.year.length) sp.set("year", filters.year.join(","));
  return sp.toString();
}

export function useAnalyticsFilters() {
  const searchParams = useSearchParams();

  const filters = useMemo<AnalyticsFiltersState>(
    () => readFiltersFromUrl(searchParams),
    [searchParams]
  );

  const setFilters = useCallback(
    (next: Partial<AnalyticsFiltersState> | ((prev: AnalyticsFiltersState) => AnalyticsFiltersState)) => {
      const params = new URLSearchParams(window.location.search);
      const current = readFiltersFromUrl(params);
      const updated = typeof next === "function" ? next(current) : { ...current, ...next };
      const values = new URLSearchParams(filtersToQueryString(updated));
      for (const key of ['range', 'comunidad', 'city', 'university', 'gender', 'age', 'studentType', 'year']) params.delete(key);
      values.forEach((value, key) => params.set(key, value));
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    },
    []
  );

  const queryString = useMemo(() => filtersToQueryString(filters), [filters]);

  return { filters, setFilters, queryString };
}
