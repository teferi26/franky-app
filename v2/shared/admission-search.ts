/** Public catalogue labels/search shared by the web and native explorers. */
export type SearchableAdmission = {
  name: string;
  campus?: string | null;
  modality?: string | null;
  universities?: { name?: string | null; short_name?: string | null; city?: string | null } | null;
};

export const ADMISSION_MODES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' },
  { value: 'hibrida', label: 'Híbrida' },
] as const;

export function normalizeAdmissionText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function admissionModeLabel(mode?: string | null): string {
  return ADMISSION_MODES.find(option => option.value === mode)?.label ??
    (mode === 'semipresencial' ? 'Semipresencial' : '');
}

export function admissionLocation(career: SearchableAdmission): string {
  return career.campus?.trim() || career.universities?.city?.trim() || '';
}

export function matchesAdmissionSearch(career: SearchableAdmission, query: string): boolean {
  const terms = normalizeAdmissionText(query).split(/\s+/).filter(Boolean);
  const haystack = normalizeAdmissionText([
    career.name, career.campus, career.universities?.name,
    career.universities?.short_name, career.universities?.city,
    admissionModeLabel(career.modality),
  ].filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
}
