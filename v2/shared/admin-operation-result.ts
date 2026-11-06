const MESSAGES: Record<string, string> = {
  admin_mfa_required: 'Verifica de nuevo tu acceso con el código de seguridad.',
  restore_requires_specific_workflow: 'Este tipo de registro necesita una restauración específica.',
  restore_requires_billing_review: 'Este local necesita revisar su facturación antes de restaurarlo.',
  restore_target_already_exists: 'La ficha ya existe. Revisa la restauración anterior antes de continuar.',
  restored_target_missing: 'La ficha se volvió a eliminar después de restaurarla. Revisa la entrada más reciente de la papelera.',
  snapshot_schema_changed: 'La copia necesita revisión porque ha cambiado su estructura.',
  snapshot_identity_mismatch: 'La identidad de la copia no coincide con la ficha. Es necesaria una revisión.',
  invalid_record_snapshot: 'La copia guardada no permite restaurar esta ficha.',
  discarded_record_not_found: 'La entrada ya no está disponible. Actualiza la papelera.',
  approved_spot_missing: 'Esta sugerencia ya se aprobó, pero su local no está disponible. Revisa el catálogo.',
  suggestion_already_processed: 'La sugerencia ya ha sido revisada. Actualiza la lista.',
  suggestion_not_found: 'La sugerencia ya no está disponible. Actualiza la lista.',
  suggestion_needs_correction: 'La sugerencia necesita completar o corregir sus datos antes de crear el local.',
  report_already_resolved: 'El reporte ya ha sido resuelto. Actualiza la lista.',
  report_not_found: 'El reporte ya no está disponible. Actualiza la lista.',
  strike_target_missing: 'La cuenta reportada ya no está disponible.',
  admin_account_protected: 'Esta cuenta administradora está protegida frente a esta acción.',
  report_changed_retry: 'El reporte ha cambiado durante la revisión. Actualiza antes de repetirla.',
  report_target_mismatch: 'El strike anterior no corresponde a este reporte. Es necesaria una revisión.',
  catalogue_record_has_dependencies: 'Esta ficha está relacionada con otros datos. Revisa esas relaciones antes de eliminarla.',
  delete_requires_specific_workflow: 'Este registro necesita eliminarse desde su gestión específica.',
  delete_requires_billing_review: 'Este local tiene un propietario o una suscripción. Revisa su facturación antes de retirarlo.',
  catalogue_record_not_found: 'La ficha ya no está disponible. Actualiza el catálogo.',
  catalogue_dependency_schema_changed: 'Las relaciones del catálogo han cambiado. Es necesaria una revisión antes de borrar.',
};

export function adminOperationError(error: unknown, fallback = 'No se pudo completar la operación. Actualiza antes de repetirla.'): string {
  const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  return MESSAGES[code] ?? fallback;
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const isUuidResult = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
export function isCatalogueDeleteResult(value: unknown, table: string, id: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return isUuidResult(row.discarded_record_id) && row.original_table === table && row.original_id === id && row.snapshot_complete === true
    && typeof row.deleted_at === 'string' && Number.isFinite(Date.parse(row.deleted_at));
}

export function isReportStrikeResult(value: unknown, reportId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return isUuidResult(row.strike_id) && row.report_id === reportId && isUuidResult(row.user_id)
    && typeof row.already_issued === 'boolean' && ['reviewed', 'actioned'].includes(String(row.report_status));
}

export function isRestorationResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return isUuidResult(row.original_id) && ['universities', 'careers', 'scholarships', 'leisure_spots'].includes(String(row.original_table))
    && typeof row.already_restored === 'boolean' && typeof row.restored_at === 'string' && Number.isFinite(Date.parse(row.restored_at));
}

/** UI hint only. The RPC independently validates the stored snapshot. */
export function restorationHint(table: unknown, snapshot: unknown): string | null {
  if (!['universities', 'careers', 'scholarships', 'leisure_spots'].includes(String(table))) return MESSAGES.restore_requires_specific_workflow;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return MESSAGES.invalid_record_snapshot;
  const row = snapshot as Record<string, unknown>;
  if (table === 'leisure_spots' && (row.owner_id !== null || row.subscription_id !== null)) return MESSAGES.restore_requires_billing_review;
  return null;
}
