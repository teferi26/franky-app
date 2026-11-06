// Keep identical in web/src/lib and mobile/src/lib.
import { parseAcademicDuration } from './academic-duration';

export type AcademicReference = {
  duration: number;
  credits: number;
  title: string;
  url: string;
  checkedDate: string;
  note: string | null;
};

/** Only show a reference while both displayed values still match it. */
export function academicReference(career: {
  duration_years?: unknown;
  credits?: unknown;
  academic_sources?: unknown;
}): AcademicReference | null {
  const all = career.academic_sources;
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null;
  const raw = (all as Record<string, unknown>).duration_credits;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const reference = item.reference_value;
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;
  const values = reference as Record<string, unknown>;
  const duration = parseAcademicDuration(career.duration_years);
  const credits = career.credits;
  if (duration === null || duration !== values.duration_years
      || typeof credits !== 'number' || !Number.isInteger(credits) || credits <= 0
      || credits !== values.credits) return null;
  const { title, url, checked_at: checked, note } = item;
  if (typeof title !== 'string' || !title.trim() || title.length > 200
      || typeof url !== 'string' || url.length > 2000
      || typeof checked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(checked)) return null;
  const day = new Date(`${checked}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== checked) return null;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  return {
    duration, credits, title: title.trim(), url: parsed.href,
    checkedDate: day.toLocaleDateString('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }),
    note: typeof note === 'string' && note.trim() && note.length <= 600 ? note.trim() : null,
  };
}
