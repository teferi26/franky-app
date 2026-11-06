// Keep identical in web/src/lib/academic-score.ts and mobile/src/lib/academic-score.ts.
export function formatAcademicScore(value: number | string | null | undefined): string {
  if (value == null || (typeof value === 'string' && !value.trim())) return '—';
  const score = Number(value);
  return Number.isFinite(score) && score >= 5 && score <= 14
    ? score.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : '—';
}
