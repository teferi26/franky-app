import { captureSessionIdentity, type SessionIdentity } from './session';
import { getAnalyticsConsent } from './analytics';
import { workspaceRpc } from './workspaces';

export function cityContentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? '');
  if (/session_changed|workspace_changed|request_cancelled/.test(message)) return 'La cuenta o el espacio ha cambiado. Vuelve a intentarlo.';
  if (/post_not_approved|post_not_eligible|reviewed_city_post_required/.test(message)) return 'La publicación necesita una revisión vigente de Franky.';
  if (/request_key_conflict|request_conflict/.test(message)) return 'La solicitud anterior tiene otros datos. Actualiza la lista antes de enviar otra.';
  if (/invalid_campaign|invalid_dates|invalid_budget/.test(message)) return 'Revisa las fechas (máximo 90 días), la ciudad y el presupuesto.';
  if (/permission|forbidden|not_available/.test(message)) return 'Tu cuenta no tiene acceso a esta operación.';
  if (/rate|limit/.test(message)) return 'Has enviado varias solicitudes. Espera un momento antes de continuar.';
  return 'No se ha podido completar la operación. Comprueba la conexión y vuelve a intentarlo.';
}

/** Consent is optional and these events never authorize money or points. */
export async function trackCityPost(resourceId: string, kind: 'view' | 'open', owner: SessionIdentity | null = captureSessionIdentity()): Promise<void> {
  try {
    if (!owner || !await getAnalyticsConsent()) return;
    await workspaceRpc('record_city_workspace_activity', { p_resource_id: resourceId, p_kind: kind, p_consent: true }, owner);
  } catch { /* Optional analytics cannot block reading. */ }
}
