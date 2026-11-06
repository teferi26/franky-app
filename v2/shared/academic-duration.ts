// Keep identical in web/src/lib/academic-duration.ts and mobile/src/lib/academic-duration.ts.
export function parseAcademicDuration(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,2}(?:\.\d)?$/.test(text)) return null;
  const years = Number(text);
  return Number.isFinite(years) && years > 0 && years < 100 ? years : null;
}

export function formatAcademicDuration(value: unknown): string {
  const years = parseAcademicDuration(value);
  return years == null ? '—' : `${years.toLocaleString('es-ES', { maximumFractionDigits: 1 })} ${years === 1 ? 'año' : 'años'}`;
}
