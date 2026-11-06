// Keep identical in web/src/lib and mobile/src/lib.
export const UNIVERSITY_EVIDENCE_FIELDS = ['description', 'student_count', 'campus_count', 'founded_year', 'address', 'short_name'] as const;
export type UniversityEvidenceField = typeof UNIVERSITY_EVIDENCE_FIELDS[number];
export type UniversityEvidence = {
  reference_value: string | number;
  checked_at: string;
  period: string | null;
  note: string | null;
  sources: { title: string; url: string }[];
};
type UniversityFacts = Partial<Record<UniversityEvidenceField, unknown>> & { institutional_sources?: unknown };

export function hasUniversityEvidenceRecord(uni: UniversityFacts, field: UniversityEvidenceField): boolean {
  const sources = uni.institutional_sources;
  return !!sources && typeof sources === 'object' && !Array.isArray(sources) && Object.prototype.hasOwnProperty.call(sources, field);
}

function text(value: unknown, limit: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null;
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function universityEvidence(uni: UniversityFacts, field: UniversityEvidenceField): UniversityEvidence | null {
  if (!UNIVERSITY_EVIDENCE_FIELDS.includes(field)) return null;
  const all = uni.institutional_sources;
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
  const item = (all as Record<string, unknown>)[field];
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const value = uni[field];
  if ((typeof value !== 'string' && typeof value !== 'number') || value !== record.reference_value) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const checked = date(record.checked_at);
  if (!checked || !Array.isArray(record.sources) || record.sources.length === 0 || record.sources.length > 10) return null;
  const sources = record.sources.map(source => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const title = text(source.title, 200);
    const url = publicUrl(source.url);
    return title && url ? { title, url } : null;
  });
  if (sources.some(source => source === null)) return null;
  return { reference_value: value, checked_at: checked, period: text(record.period, 100), note: text(record.note, 600), sources: sources as UniversityEvidence['sources'] };
}

export function universityStudentContext(uni: UniversityFacts): string {
  return universityEvidence(uni, 'student_count')?.period ?? 'Periodo no documentado';
}

export function universityCheckedDate(checked: string): string {
  return new Date(`${checked}T00:00:00Z`).toLocaleDateString('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}
