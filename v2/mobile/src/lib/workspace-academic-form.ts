export type AcademicTargetType = 'university' | 'career';
export type AcademicTarget = { id: string; title: string; university_id: string; data: Record<string, unknown>; current_updated_at?: string | null };
export type AcademicField = { key: string; label: string; kind?: 'url' | 'email' | 'phone' | 'number'; multiline?: boolean; maxLength: number; min?: number; max?: number; integer?: boolean; required?: boolean; precision?: number };
export const ACADEMIC_FIELDS: Record<AcademicTargetType, AcademicField[]> = {
  university: [
    { key: 'description', label: 'Descripción institucional', multiline: true, maxLength: 6000 },
    { key: 'website', label: 'Web oficial', kind: 'url', maxLength: 2048 },
    { key: 'phone', label: 'Teléfono de contacto', kind: 'phone', maxLength: 40 },
    { key: 'email', label: 'Correo de contacto', kind: 'email', maxLength: 254 },
    { key: 'jpa_url', label: 'Enlace de jornadas de puertas abiertas', kind: 'url', maxLength: 2048 },
    { key: 'jpa_label', label: 'Nombre de las jornadas de puertas abiertas', maxLength: 160 },
  ],
  career: [
    { key: 'name', label: 'Nombre oficial de la titulación', required: true, maxLength: 200 },
    { key: 'description', label: 'Descripción de la titulación', multiline: true, maxLength: 6000 },
    { key: 'campus', label: 'Campus', maxLength: 160 },
    { key: 'duration_years', label: 'Duración en años', kind: 'number', min: 1, max: 12, precision: 1, maxLength: 8 },
    { key: 'credits', label: 'Créditos ECTS', kind: 'number', min: 1, max: 720, integer: true, maxLength: 4 },
    { key: 'places_offered', label: 'Plazas ofertadas', kind: 'number', min: 0, max: 100000, integer: true, maxLength: 6 },
    { key: 'career_url', label: 'Enlace oficial de la titulación', kind: 'url', maxLength: 2048 },
    { key: 'plan_url', label: 'Enlace del plan de estudios', kind: 'url', maxLength: 2048 },
    { key: 'cut_off_score', label: 'Nota de corte', kind: 'number', min: 0, max: 14, maxLength: 6 },
    { key: 'cut_off_year', label: 'Año de inicio del curso de la nota', kind: 'number', min: 2000, max: 2100, required: true, integer: true, maxLength: 4 },
    { key: 'cut_off_round', label: 'Convocatoria de la nota de corte', maxLength: 120 },
  ],
};
export type AcademicDraft = {
  targetType: AcademicTargetType; target: AcademicTarget | null; selected: string[]; values: Record<string, string>;
  sourceUrl: string; academicYear: string; reason: string; clientRequestId: string; resourceId?: string;
};
export function newAcademicDraft(): AcademicDraft {
  return { targetType: 'university', target: null, selected: [], values: {}, sourceUrl: '', academicYear: '', reason: '', clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
}
export function restoreAcademicDraft(value: unknown): AcademicDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  if (!['university', 'career'].includes(String(saved.targetType)) || !Array.isArray(saved.selected) || !saved.values || typeof saved.values !== 'object' || Array.isArray(saved.values)) return null;
  if (['sourceUrl', 'academicYear', 'reason', 'clientRequestId'].some(key => typeof saved[key] !== 'string') || (saved.clientRequestId as string).length < 8 || (saved.clientRequestId as string).length > 100) return null;
  const type = saved.targetType as AcademicTargetType; const allowed = ACADEMIC_FIELDS[type].map(field => field.key); const fields = saved.values as Record<string, unknown>;
  const values: Record<string, string> = {};
  for (const key of allowed) { if (Object.hasOwn(fields, key) && typeof fields[key] !== 'string') return null; if (typeof fields[key] === 'string') values[key] = fields[key]; }
  let target: AcademicTarget | null = null;
  if (saved.target !== null) {
    if (!saved.target || typeof saved.target !== 'object' || Array.isArray(saved.target)) return null;
    const candidate = saved.target as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || typeof candidate.title !== 'string' || !candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) return null;
    target = { id: candidate.id, title: candidate.title, university_id: typeof candidate.university_id === 'string' ? candidate.university_id : '', data: candidate.data as Record<string, unknown>, current_updated_at: typeof candidate.current_updated_at === 'string' ? candidate.current_updated_at : null };
  }
  return { targetType: type, target, selected: saved.selected.filter((key): key is string => typeof key === 'string' && allowed.includes(key)), values, sourceUrl: saved.sourceUrl as string, academicYear: saved.academicYear as string, reason: saved.reason as string, clientRequestId: saved.clientRequestId as string, resourceId: typeof saved.resourceId === 'string' ? saved.resourceId : undefined };
}
export function isAcademicSource(value: string): boolean {
  try { const url = new URL(value); return !/[\s@]/.test(value) && url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname); } catch { return false; }
}
export function academicChanges(draft: AcademicDraft): Record<string, string | number | null> {
  const changes: Record<string, string | number | null> = {};
  for (const field of ACADEMIC_FIELDS[draft.targetType]) {
    if (!draft.selected.includes(field.key)) continue;
    const value = (draft.values[field.key] ?? '').trim();
    changes[field.key] = value === '' ? null : field.kind === 'number' ? Number(value.replace(',', '.')) : value;
  }
  return changes;
}
export function validateAcademicDraft(draft: AcademicDraft, submit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.target?.id) errors.target = 'Selecciona una universidad o una titulación de tu ámbito.';
  const chosen = ACADEMIC_FIELDS[draft.targetType].filter(field => draft.selected.includes(field.key));
  if (!chosen.length) errors.selected = 'Elige al menos un campo que quieras actualizar.';
  for (const field of chosen) {
    const value = (draft.values[field.key] ?? '').trim();
    if (!value) { if (field.required) errors[field.key] = 'Este campo no puede quedar vacío.'; continue; }
    if (field.key === 'name' && value.length < 3) errors[field.key] = 'Escribe el nombre oficial con al menos 3 caracteres.';
    if (value.length > field.maxLength) errors[field.key] = `Utiliza como máximo ${field.maxLength} caracteres.`;
    if (field.kind === 'url' && !isAcademicSource(value)) errors[field.key] = 'Introduce una dirección HTTPS sin credenciales.';
    if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = 'Introduce un correo válido.';
    if (field.kind === 'number') {
      const number = Number(value.replace(',', '.'));
      if (!/^\d+(?:[.,]\d{1,3})?$/.test(value) || !Number.isFinite(number) || (field.integer && !Number.isInteger(number)) || number < (field.min ?? 0) || number > (field.max ?? Infinity)) errors[field.key] = `Introduce ${field.integer ? 'un número entero' : 'un número'} entre ${field.min} y ${field.max}.`;
      if (field.precision && (value.split(/[.,]/)[1]?.length ?? 0) > field.precision) errors[field.key] = `Utiliza como máximo ${field.precision} decimal.`;
    }
  }
  if (draft.sourceUrl.trim() && (!isAcademicSource(draft.sourceUrl.trim()) || draft.sourceUrl.trim().length > 2000)) errors.sourceUrl = 'Añade un enlace HTTPS de la fuente oficial, sin credenciales.';
  if (draft.academicYear.trim() && (!/^20\d{2}-20\d{2}$/.test(draft.academicYear.trim()) || Number(draft.academicYear.slice(5)) !== Number(draft.academicYear.slice(0, 4)) + 1)) errors.academicYear = 'Escribe dos años consecutivos: por ejemplo, 2026-2027.';
  if (draft.reason.trim().length > 2000) errors.reason = 'Resume la explicación en un máximo de 2000 caracteres.';
  if (submit) {
    if (!draft.sourceUrl.trim()) errors.sourceUrl = 'Añade la fuente oficial que respalda este cambio.';
    if (!draft.academicYear.trim()) errors.academicYear = 'Indica a qué curso académico corresponde.';
    if (draft.reason.trim().length < 10) errors.reason = 'Explica el motivo del cambio en al menos 10 caracteres.';
  }
  const cutoffSelected = chosen.some(field => ['cut_off_score', 'cut_off_year', 'cut_off_round'].includes(field.key));
  if (cutoffSelected) {
    if (!draft.selected.includes('cut_off_score') || !draft.selected.includes('cut_off_year')) errors.cut_off_score = 'La nota de corte y su año deben proponerse juntos.';
    const year = (draft.values.cut_off_year ?? '').trim();
    if (!year) errors.cut_off_year = 'Indica el año, también cuando propongas retirar una nota.';
    if (draft.academicYear && year !== draft.academicYear.slice(0, 4)) errors.cut_off_year = 'El año debe coincidir con el inicio del curso indicado.';
  }
  return errors;
}
export function academicProposalPayload(draft: AcademicDraft, submit: boolean) {
  return { p_target_type: draft.targetType, p_target_id: draft.target?.id ?? null, p_changes: academicChanges(draft), p_source_url: draft.sourceUrl.trim(), p_academic_year: draft.academicYear.trim(), p_reason: draft.reason.trim(), p_resource_id: draft.resourceId ?? null, p_submit: submit, p_client_request_id: draft.clientRequestId };
}
export function academicDraftFromResource(resource: { id: string; title: string; data: Record<string, unknown> }): AcademicDraft {
  const data = resource.data; const targetType: AcademicTargetType = data.academic_target_type === 'career' ? 'career' : 'university';
  const raw = data.proposed_changes && typeof data.proposed_changes === 'object' && !Array.isArray(data.proposed_changes) ? data.proposed_changes as Record<string, unknown> : {};
  const allowed = ACADEMIC_FIELDS[targetType].map(field => field.key); const values: Record<string, string> = {};
  for (const key of allowed) if (Object.hasOwn(raw, key)) values[key] = raw[key] == null ? '' : String(raw[key]);
  return { ...newAcademicDraft(), resourceId: resource.id, targetType,
    target: typeof data.academic_target_id === 'string' ? { id: data.academic_target_id, title: String(data.academic_target_title ?? resource.title), university_id: String(data.university_id ?? ''), data: data.academic_target_data && typeof data.academic_target_data === 'object' ? data.academic_target_data as Record<string, unknown> : {}, current_updated_at: typeof data.academic_target_updated_at === 'string' ? data.academic_target_updated_at : null } : null,
    selected: Object.keys(values), values, sourceUrl: String(data.source_url ?? ''), academicYear: String(data.academic_year ?? ''), reason: String(data.reason ?? data.description ?? ''),
    clientRequestId: typeof data.client_request_id === 'string' ? data.client_request_id : newAcademicDraft().clientRequestId,
  };
}
