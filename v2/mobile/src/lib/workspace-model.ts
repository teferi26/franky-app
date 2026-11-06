import type { Workspace, WorkspaceKind, WorkspaceResourceType, WorkspacePermission } from '../../../shared/workspaces';
export type { Workspace, WorkspaceKind, WorkspaceResourceType, WorkspaceDashboard, WorkspaceResource, WorkspaceMember } from '../../../shared/workspaces';
export { WORKSPACE_LABELS, ROLE_LABELS } from '../../../shared/workspaces';
export const RESOURCE_LABELS: Record<WorkspaceResourceType, string> = {
  housing: 'Pisos', visit: 'Visitas', community: 'Comunidades', event: 'Actividades', venue: 'Locales',
  post: 'Publicaciones', academic: 'Información académica', conversation: 'Mensajes', moderation: 'Moderación de FOMO',
};
export function primaryResource(kind: WorkspaceKind): WorkspaceResourceType {
  return ({ housing: 'housing', community: 'event', leisure: 'venue', university: 'academic' } as const)[kind];
}
export function secondaryResource(kind: WorkspaceKind): WorkspaceResourceType {
  return ({ housing: 'visit', community: 'community', leisure: 'event', university: 'event' } as const)[kind];
}
export function hasWorkspacePermission(workspace: Workspace | null, permission: WorkspacePermission): boolean {
  return Boolean(workspace?.status === 'active' && workspace.permissions.includes(permission));
}
export function errorForWorkspace(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (/event_audience_has_registrations/.test(message)) return 'Ya hay inscripciones en esta actividad. Revisa esas reservas antes de cambiar quién puede asistir.';
  if (/event_audience_forbidden/.test(message)) return 'Esta persona ya no cumple las condiciones de acceso. Revisa la invitación, membresía o acreditación antes de continuar.';
  if (/event_community_required/.test(message)) return 'Elige una comunidad publicada y aprobada de este mismo espacio.';
  if (/event_campus_required|campus_forbidden/.test(message)) return 'Elige un campus autorizado para este espacio.';
  if (/event_invitee_unavailable/.test(message)) return 'La persona necesita una cuenta activa con ese correo verificado en Franky.';
  if (/event_invitation_mode_required|publish_event_first/.test(message)) return 'Publica la actividad con acceso por invitación antes de autorizar cuentas.';
  if (/contract_changed|proposal_changed|academic_catalogue_changed/.test(message)) return 'Otra persona ha actualizado esta información. Recarga y revisa la versión actual antes de continuar.';
  if (/proposal_locked/.test(message)) return 'Esta propuesta ya está enviada o aprobada. Puedes preparar una nueva propuesta para otros cambios.';
  if (/academic_|invalid_source_url/.test(message)) return 'Revisa los campos propuestos, la fuente oficial y el curso académico.';
  if (/tenant_unavailable/.test(message)) return 'Comprueba el correo: la persona necesita una cuenta activa con ese correo verificado.';
  if (/contract_not_signed|tenancy_confirmation_required/.test(message)) return 'El inquilino debe confirmar su vínculo con el piso y el contrato debe completar las firmas requeridas.';
  if (/invalid_receipt|rent_has_receipts|receipt_not_reversible/.test(message)) return 'Revisa el cobro y su importe pendiente. Los registros se corrigen mediante un ajuste, conservando el original.';
  if (/thread_unavailable|invalid_reply/.test(message)) return 'La publicación no está disponible para responder o la respuesta no es válida. Actualiza el contenido.';
  if (/community_invitee_unavailable/.test(message)) return 'Comprueba el correo. La persona necesita una cuenta de Franky con ese correo verificado.';
  if (/community_not_published/.test(message)) return 'La comunidad debe estar publicada y aprobada para gestionar su admisión.';
  if (/community_admin_protected/.test(message)) return 'Este miembro es responsable de la comunidad. Revisa primero la continuidad de su gestión.';
  if (/admission_transition_invalid|admission_not_found/.test(message)) return 'El estado de esta persona ha cambiado. Actualiza la lista antes de continuar.';
  if (/workspace_source_changed/.test(message)) return 'La ficha publicada ha cambiado desde que empezaste. Revisa esos cambios antes de guardar o publicar tu borrador.';
  if (/visit_payment_review_required/.test(message)) return 'Esta visita tiene un pago asociado. Solicita la revisión del cobro antes de cambiarla o cancelarla; la reserva y el pago se conservan.';
  if (/interest_changed/.test(message)) return 'Otra persona ha actualizado este seguimiento. Recarga y revisa su estado antes de guardar.';
  if (/lead_result_reason_required/.test(message)) return 'Explica el resultado con al menos 5 caracteres y un máximo de 500.';
  if (/venue_hours_overlap/.test(message)) return 'Hay horarios que se solapan; revisa también los cierres de madrugada.';
  if (/invalid_venue_hours/.test(message)) return 'Revisa los días y las horas del local. Usa HH:mm e indica si cierra al día siguiente.';
  if (/invalid_venue_category/.test(message)) return 'Elige uno de los tipos de local disponibles.';
  if (/visit_unavailable|visit_time_invalid|visit_duplicate/.test(message)) return 'Ese horario ya no está disponible. Actualiza las opciones y elige otra franja.';
  if (/request_reused/.test(message)) return 'La solicitud cambió después de enviarla. Actualiza la información para comprobar lo que se guardó antes de volver a intentarlo.';
  if (/visit_not_started/.test(message)) return 'Podrás marcar la visita como realizada después de su hora de inicio.';
  if (/visit_payment_required/.test(message)) return 'La visita está pendiente de pago. Se confirmará cuando el cobro esté completado.';
  if (/mfa_required/.test(message)) return 'Esta acción requiere verificar tu cuenta con el código de tu app de autenticación.';
  if (/connect_setup_required/.test(message)) return 'El responsable debe completar la configuración de cobros antes de publicar una actividad de pago.';
  if (/overlapping_schedule/.test(message)) return 'Hay franjas de horario que se solapan. Revisa las horas de ese día.';
  if (/publish_housing_first/.test(message)) return 'Publica el piso antes de configurar su horario de visitas.';
  if (/event_has_registrations|event_refund_review_required/.test(message)) return 'Esta actividad ya tiene inscripciones. Solicita la revisión de cambios o devoluciones antes de modificarla.';
  if (/session_changed|request_cancelled|workspace_changed/.test(message)) return 'Has cambiado de cuenta o de espacio. Vuelve a intentarlo desde el espacio actual.';
  if (/forbidden|permission|not authorized|insufficient|access denied|42501/i.test(message)) return 'Tu acceso a esta función ha cambiado. Actualiza el espacio o consulta con su responsable.';
  if (/last_owner|last owner/i.test(message)) return 'Debe quedar al menos una persona responsable del espacio.';
  if (/disabled|not enabled|rollout/i.test(message)) return 'Este espacio todavía no está disponible para tu cuenta.';
  if (/capacity|aforo/i.test(message)) return 'Se ha completado el aforo. Actualiza la lista.';
  return 'No se pudo completar la operación. Comprueba la conexión e inténtalo de nuevo.';
}
