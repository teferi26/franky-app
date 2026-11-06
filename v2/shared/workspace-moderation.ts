export type ModerationAction = 'hide' | 'remove' | 'restore' | 'resolve' | 'sanction' | 'lift_sanction';
export const MODERATION_LABELS: Record<ModerationAction, string> = { hide: 'Ocultar publicación', remove: 'Retirar publicación', restore: 'Restaurar publicación', resolve: 'Resolver reporte', sanction: 'Suspender participación', lift_sanction: 'Levantar sanción' };
export type ModerationDecision = { id: string; action: ModerationAction; reason: string; created_at: string; sanction_expires_at: string | null; sanction_status: 'active' | 'expired' | 'revoked' | null; appeal_status: 'pending' | 'upheld' | 'overturned' | null };
export type ModerationHistory = { items: ModerationDecision[]; next_cursor: string | null; can_restore: boolean; target_state: 'visible' | 'hidden' | 'removed' };
export function moderationPayload(action: ModerationAction, reason: string, days: string | null, decisionId?: string): Record<string, unknown> {
  const text = reason.trim();
  if (text.length < 5 || text.length > 1000) throw Error('Escribe un motivo de entre 5 y 1.000 caracteres.');
  if (action === 'sanction' && days !== null && (!/^\d{1,3}$/.test(days) || Number(days) < 1 || Number(days) > 365)) throw Error('Elige una duración entre 1 y 365 días o indefinida.');
  if (action === 'lift_sanction' && !decisionId) throw Error('Selecciona la sanción que quieres levantar.');
  return { reason: text, ...(action === 'sanction' ? { duration_days: days === null ? null : Number(days) } : {}), ...(action === 'lift_sanction' ? { decision_id: decisionId } : {}) };
}
export function moderationError(error: unknown): string {
 const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
 if (/global_review_required/.test(message)) return 'La restauración necesita revisión de Franky. Esta universidad no puede retirar una decisión global o una revisión pendiente.';
 if (/campus_sanction_already_active/.test(message)) return 'Esta persona ya tiene una sanción vigente de tu universidad en este campus. Revisa el historial antes de continuar.';
 if (/self_moderation_forbidden/.test(message)) return 'Otra persona autorizada debe revisar las publicaciones de tu propia cuenta.';
 if (/forbidden|42501|permission/.test(message)) return 'Tu permiso para moderar este campus ha cambiado. Actualiza el espacio.';
 if (/request_key_conflict/.test(message)) return 'Esta solicitud ya se usó para otra decisión. Actualiza la página y revisa el historial.';
 if (/sanction_not_found/.test(message)) return 'La sanción ha cambiado. Actualiza el historial antes de continuar.';
 return 'No se pudo confirmar la decisión. Revisa el historial e inténtalo de nuevo.';
}
