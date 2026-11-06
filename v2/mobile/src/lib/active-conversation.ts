// ─── Qué chat está abierto ahora mismo ──────────────────────────────────────
// La pantalla de chat lo anota al entrar y lo borra al salir. El manejador de
// notificaciones en primer plano (app/_layout.tsx) lo consulta para NO pintar
// un banner del mensaje que la persona ya está viendo en pantalla.
let active: string | null = null;

export function setActiveConversation(id: string | null): void { active = id; }
export function getActiveConversation(): string | null { return active; }
export function clearActiveConversation(id: string): void { if (active === id) active = null; }

/** true cuando el aviso es del chat que está abierto (no hace falta banner). */
export function isNotificationForActiveConversation(data: Record<string, unknown> | null | undefined): boolean {
  return !!active && !!data && typeof data.conversation_id === 'string' && data.conversation_id === active;
}
