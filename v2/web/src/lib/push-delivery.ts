import { dndFrom, dndTo, parsePushPrefs } from './push-prefs';

export function pushCategory(type: unknown): string {
  switch (type) {
    case 'message': return 'messages';
    case 'match': case 'roomie_like': return 'crush';
    case 'comment': return 'comments';
    case 'post': return 'follows';
    case 'event': case 'promotion': return 'events';
    case 'news': return 'news';
    case 'accommodation': return 'housing';
    default: return 'other';
  }
}
export function pushSuppression(raw: unknown, type: unknown, at = new Date()): string | null {
  const prefs = parsePushPrefs(raw);
  if (prefs.all === false || prefs[pushCategory(type)] === false) return 'muted';
  if (prefs.dnd === true) {
    const time = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
    const from = dndFrom(prefs), to = dndTo(prefs);
    if (from !== to && (from < to ? time >= from && time < to : time >= from || time < to)) return 'dnd';
  }
  return null;
}
export const validExpoToken = (token: string) => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);
export type DeviceResult = { device_id: string; status: 'accepted' | 'permanent_error' | 'retry' | 'unknown'; ticket_id?: string; error?: string };
export function expoResults(ids: string[], payload: unknown, httpOk: boolean): DeviceResult[] {
  const rows = payload && typeof payload === 'object' && 'data' in payload && Array.isArray(payload.data) ? payload.data : [];
  return ids.map((id, index) => {
    if (!httpOk) return { device_id: id, status: 'retry', error: 'http_error' };
    const ticket = rows[index];
    if (httpOk && ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0) return { device_id: id, status: 'accepted', ticket_id: ticket.id };
    // A successful HTTP response with a missing/malformed ticket can have
    // accepted the notification. Retrying it automatically could duplicate it.
    if (ticket?.status !== 'error' || typeof ticket?.details?.error !== 'string') return { device_id: id, status: 'unknown', error: 'invalid_ticket' };
    const code = ticket.details.error.slice(0, 80);
    return { device_id: id, status: ['DeviceNotRegistered', 'MessageTooBig'].includes(code) ? 'permanent_error' : 'retry', error: code };
  });
}

/** Canal Android por categoría: los chats y los matches saltan como aviso emergente (HIGH); el resto, sin molestar. */
export function pushChannel(type: unknown): 'messages' | 'crush' | 'social' | 'default' {
  switch (pushCategory(type)) {
    case 'messages': return 'messages';
    case 'crush': return 'crush';
    case 'comments': case 'follows': return 'social';
    default: return 'default';
  }
}
const clip = (value: unknown, max: number): string => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
};
export type PushMessage = { user_id: string; title: string; body?: string | null; data?: Record<string, unknown> };
/**
 * Contenido que ve la persona en la pantalla bloqueada: título y texto reales
 * (quién te escribe y por qué), subtítulo de contexto en iOS (data.subtitle),
 * canal por categoría en Android, contador de no leídos en el icono y el
 * hilo (threadId) para que iOS agrupe los mensajes de una misma conversación.
 */
export function pushContent(message: PushMessage, unread: number | null) {
  const data: Record<string, unknown> = { ...(message.data ?? {}), recipient_user_id: message.user_id };
  const type = data.type;
  const category = pushCategory(type);
  const subtitle = clip(data.subtitle, 80);
  const conversation = typeof data.conversation_id === 'string' ? data.conversation_id : null;
  return {
    title: clip(message.title, 100) || 'Franky',
    body: clip(message.body, 240) || (category === 'messages' ? 'Te ha enviado un mensaje' : 'Toca para verlo en Franky'),
    ...(subtitle ? { subtitle } : {}),
    ...(conversation ? { threadId: conversation } : {}),
    ...(typeof unread === 'number' && unread > 0 ? { badge: unread } : {}),
    data,
    sound: 'default' as const,
    channelId: pushChannel(type),
    priority: (category === 'messages' || category === 'crush' ? 'high' : 'default') as 'high' | 'default',
    ttl: category === 'messages' || category === 'crush' ? 3600 : 86400,
  };
}
