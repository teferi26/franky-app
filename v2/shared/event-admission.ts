export type EventAdmission = { audience: 'public' | 'member' | 'invited' | 'verified_university'; eligible: boolean; reason: string | null; target_name?: string | null };
export function eventAdmissionMessage(admission: EventAdmission): string {
  if (admission.reason === 'event_cancelled') return 'Esta actividad está cancelada.';
  const requirement = ({ public: 'Esta actividad tiene acceso abierto.', member: 'Esta actividad está reservada a miembros de la comunidad organizadora.', invited: 'Esta actividad requiere una invitación del organizador a tu cuenta de Franky.', verified_university: 'Esta actividad requiere afiliación universitaria acreditada y vigente. La universidad declarada en el perfil no sirve como acreditación.' })[admission.audience];
  const target = admission.target_name ? ` ${admission.target_name}.` : '';
  return admission.eligible ? `${requirement}${target} Tu cuenta cumple las condiciones actuales; se comprobarán de nuevo al entrar.` : `${requirement}${target} Tu cuenta no cumple las condiciones actuales. Contacta con el organizador si necesitas revisarlas.`;
}
export const EVENT_ADMISSION_REJECTED = 'Tu cuenta no cumple las condiciones de acceso actuales. Revisa tu invitación, membresía o afiliación universitaria con el organizador.';
