import type { WorkspaceResourceType, WorkspaceKind } from './workspace-model';
import { VENUE_CATEGORIES, validateVenueHours, type VenueHours } from '../../../shared/venue-hours';

export type EditableWorkspaceType = Extract<WorkspaceResourceType, 'housing' | 'venue' | 'event' | 'community' | 'post' | 'academic'>;
export type WorkspaceDraft = { values: Record<string, string>; images: string[]; legacyImages?: string[]; weeklyHours?: VenueHours[]; clientRequestId: string; resourceId?: string; expectedSourceRevision?: number };
export type WorkspaceField = { key: string; label: string; numeric?: boolean; multiline?: boolean; date?: boolean; dateOnly?: boolean; required?: boolean; maxLength?: number };
const TITLE: WorkspaceField = { key: 'title', label: 'Título', required: true, maxLength: 160 };
const DESCRIPTION: WorkspaceField = { key: 'description', label: 'Descripción', multiline: true, maxLength: 6000 };
const CITY: WorkspaceField = { key: 'city', label: 'Ciudad', required: true, maxLength: 100 };
const ADDRESS: WorkspaceField = { key: 'address', label: 'Dirección o zona', maxLength: 250 };
export const WORKSPACE_FORM_FIELDS: Record<EditableWorkspaceType, WorkspaceField[]> = {
  housing: [TITLE, DESCRIPTION, CITY, ADDRESS, { key: 'price_monthly', label: 'Alquiler mensual (€)', numeric: true, required: true }, { key: 'bedrooms', label: 'Habitaciones', numeric: true }, { key: 'bathrooms', label: 'Baños', numeric: true }, { key: 'area_m2', label: 'Superficie (m²)', numeric: true }, { key: 'available_from', label: 'Disponible desde', date: true, dateOnly: true }],
  venue: [TITLE, DESCRIPTION, CITY, ADDRESS],
  event: [TITLE, DESCRIPTION, CITY, ADDRESS, { key: 'starts_at', label: 'Inicio', date: true, required: true }, { key: 'ends_at', label: 'Fin', date: true, required: true }, { key: 'capacity', label: 'Aforo', numeric: true, required: true }, { key: 'price_euros', label: 'Precio de la entrada (€)', numeric: true }],
  community: [TITLE, DESCRIPTION, CITY],
  post: [TITLE, { key: 'body', label: 'Publicación', multiline: true, required: true, maxLength: 6000 }],
  academic: [TITLE, DESCRIPTION, { key: 'source_url', label: 'Enlace de la fuente oficial', required: true, maxLength: 1000 }, { key: 'academic_year', label: 'Curso académico (2026-2027)', required: true, maxLength: 9 }],
};
export function isEditableWorkspaceType(value: string): value is EditableWorkspaceType { return Object.prototype.hasOwnProperty.call(WORKSPACE_FORM_FIELDS, value); }
export function workspaceFormFields(type: EditableWorkspaceType, kind?: WorkspaceKind): WorkspaceField[] {
  return type === 'post' && kind !== 'university' ? [...WORKSPACE_FORM_FIELDS.post.map(field => field.key === 'body' ? { ...field, maxLength: 4000 } : field), CITY] : WORKSPACE_FORM_FIELDS[type];
}

export function validateWorkspaceDraft(type: EditableWorkspaceType, draft: WorkspaceDraft, publish: boolean, kind?: WorkspaceKind): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of workspaceFormFields(type, kind)) {
    const text = (draft.values[field.key] ?? '').trim();
    if ((field.key === 'title' || publish && field.required) && !text) errors[field.key] = 'Completa este campo.';
    if (field.key === 'title' && text.length < 3) errors[field.key] = 'Escribe al menos 3 caracteres.';
    if (field.maxLength && text.length > field.maxLength) errors[field.key] = `Máximo ${field.maxLength} caracteres.`;
    if (field.numeric && text) {
      const normalized = text.replace(',', '.');
      if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) > 10_000_000) errors[field.key] = 'Introduce un importe o cantidad válido.';
      if (['capacity', 'bedrooms', 'bathrooms', 'area_m2'].includes(field.key) && !/^\d+$/.test(normalized)) errors[field.key] = 'Introduce un número entero.';
      if (['capacity', 'price_monthly', 'area_m2'].includes(field.key) && Number(normalized) <= 0) errors[field.key] = 'Debe ser mayor que cero.';
      if (['bedrooms', 'bathrooms'].includes(field.key) && Number(normalized) > 100) errors[field.key] = 'Introduce una cantidad inferior a 101.';
      if (['price_monthly', 'area_m2'].includes(field.key) && Number(normalized) > 100_000) errors[field.key] = 'Introduce una cantidad de hasta 100.000.';
    }
    if (field.date && text && !Number.isFinite(Date.parse(text))) errors[field.key] = 'Elige una fecha válida.';
  }
  if (type === 'event') {
    const audience = draft.values.audience || 'public';
    if (!['public', 'member', 'invited', 'verified_university'].includes(audience)) errors.audience = 'Elige quién puede asistir.';
    if (publish && audience === 'member' && !draft.values.community_resource_id) errors.community_resource_id = 'Elige una comunidad de este espacio.';
    if (publish && audience === 'verified_university' && !draft.values.audience_university_id) errors.audience_university_id = 'Elige una universidad autorizada.';
    for (const key of audience === 'member' ? ['community_resource_id'] : audience === 'verified_university' ? ['audience_university_id'] : []) if (draft.values[key] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.values[key])) errors[key] = 'Vuelve a elegir una opción de la lista.';
    const start = Date.parse(draft.values.starts_at ?? ''); const end = Date.parse(draft.values.ends_at ?? '');
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) errors.ends_at = 'El fin debe ser posterior al inicio.';
    if (publish && Number.isFinite(start) && start <= Date.now()) errors.starts_at = 'Elige una fecha futura.';
  }
  if (type === 'academic') {
    if (draft.values.source_url) { try { const url = new URL(draft.values.source_url); if (url.protocol !== 'https:' || url.username || url.password) errors.source_url = 'Introduce un enlace HTTPS válido.'; } catch { errors.source_url = 'Introduce un enlace HTTPS válido.'; } }
    if (draft.values.academic_year && !/^20\d{2}-20\d{2}$/.test(draft.values.academic_year)) errors.academic_year = 'Usa el formato 2026-2027.';
  }
  if (type === 'post') {
    if (kind !== 'university' && publish && (draft.values.body ?? '').trim().length < 3) errors.body = 'Escribe al menos 3 caracteres.';
    if (kind !== 'university' && draft.values.minimum_age && !['0', '18'].includes(draft.values.minimum_age)) errors.minimum_age = 'Elige todos los públicos o mayores de 18 años.';
  }
  if (draft.images.length > 12) errors.images = 'Puedes añadir hasta 12 fotos.';
  if (type === 'venue' && draft.weeklyHours !== undefined) { const message = validateVenueHours(draft.weeklyHours); if (message) errors.weekly_hours = message; }
  if (type === 'venue' && draft.values.category && !VENUE_CATEGORIES.some(([key]) => key === draft.values.category)) errors.category = 'Elige una categoría de la lista.';
  return errors;
}
export function workspaceDraftPayload(type: EditableWorkspaceType, draft: WorkspaceDraft, kind?: WorkspaceKind): Record<string, unknown> {
  const result: Record<string, unknown> = { client_request_id: draft.clientRequestId, images: type === 'post' ? [] : draft.images };
  if (draft.expectedSourceRevision !== undefined) result.expected_source_revision = draft.expectedSourceRevision;
  if (draft.legacyImages) result.retain_legacy_images = draft.legacyImages;
  if (type === 'venue' && draft.weeklyHours !== undefined) result.weekly_hours = draft.weeklyHours;
  if (type === 'venue') result.category = draft.values.category || 'bar';
  for (const field of workspaceFormFields(type, kind)) {
    const text = (draft.values[field.key] ?? '').trim();
    if (!text) continue;
    result[field.key] = field.numeric ? Number(text.replace(',', '.')) : text;
  }
  if (type === 'event') {
    result.price_cents = Math.round(Number(result.price_euros ?? 0) * 100); delete result.price_euros;
    result.audience = draft.values.audience || 'public';
    if (result.audience === 'member' && draft.values.community_resource_id) result.community_resource_id = draft.values.community_resource_id;
    if (result.audience === 'verified_university' && draft.values.audience_university_id) result.audience_university_id = draft.values.audience_university_id;
    if (draft.values.campus_id) result.campus_id = draft.values.campus_id;
  }
  if (type === 'community') { result.visibility = draft.values.visibility === 'private' ? 'private' : 'public'; result.join_policy = ['request', 'invite'].includes(draft.values.join_policy) ? draft.values.join_policy : 'open'; }
  if (type === 'post' && kind !== 'university') result.minimum_age = draft.values.minimum_age === '18' ? 18 : 0;
  return result;
}
