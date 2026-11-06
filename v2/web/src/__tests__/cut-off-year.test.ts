import { describe, expect, it } from 'vitest';
import { CURRENT_CUT_OFF_YEAR, PREVIOUS_CUT_OFF_YEAR, cutOffForView, cutOffViewLabel, missingCutOffLabel } from '@/lib/academic-year';
import { courseAdmissionForView } from '@/lib/university-catalogue';

describe('current and previous cut-off course', () => {
  it('labels the current course 26/27 and the previous one 25/26', () => {
    expect(CURRENT_CUT_OFF_YEAR).toBe(2026);
    expect(PREVIOUS_CUT_OFF_YEAR).toBe(2025);
    expect(cutOffViewLabel('current')).toBe('26/27');
    expect(cutOffViewLabel('previous')).toBe('25/26');
    expect(missingCutOffLabel('current')).toBe('Sin nota 26/27');
  });
  it('reads each course from either column and never promotes an old or undated score', () => {
    const both = { cut_off_score: '12.500', cut_off_year: 2026, cut_off_source_url: 'https://a.es', cut_off_score_prev: 11, cut_off_year_prev: 2025, cut_off_source_url_prev: 'http://inseguro.es' };
    expect(cutOffForView(both, 'current')).toEqual({ score: 12.5, year: 2026, round: null, sourceUrl: 'https://a.es' });
    expect(cutOffForView(both, 'previous')).toEqual({ score: 11, year: 2025, round: null, sourceUrl: null });
    const stale = { cut_off_score: 9, cut_off_year: 2025 };
    expect(cutOffForView(stale, 'current')).toBeNull();
    expect(cutOffForView(stale, 'previous')?.score).toBe(9);
    expect(cutOffForView({ cut_off_score: 9, cut_off_year: null }, 'current')).toBeNull();
    expect(cutOffForView({ cut_off_score: 15, cut_off_year: 2026 }, 'current')).toBeNull();
  });
  it('gives university rows the chosen course without inventing a score', () => {
    const course = { id: 'a', name: 'Grado', cut_off_score: 9.5, cut_off_year: 2025 };
    expect(courseAdmissionForView(course, 'current')).toMatchObject({ label: 'Sin nota', period: '2026/2027', score: null });
    expect(courseAdmissionForView(course, 'previous')).toMatchObject({ label: '9,500', period: '2025/2026', score: 9.5 });
    expect(courseAdmissionForView({ ...course, admission_without_cutoff: true }, 'current')).toMatchObject({ label: 'Sin corte' });
  });
});
