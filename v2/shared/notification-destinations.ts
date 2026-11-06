/** Pure notification routing, mirrored in mobile so persisted payloads stay compatible. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
type Data = Record<string, unknown> | null | undefined;

export function safeNotificationPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (/%(?:2f|5c|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(pathname)) return null;
  try {
    const parsed = new URL(value, 'https://franky.es');
    if (parsed.origin !== 'https://franky.es' || parsed.pathname.startsWith('//')) return null;
    decodeURIComponent(parsed.pathname);
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return null; }
}

export function webNotificationPath(raw: unknown): string | null {
  const value = safeNotificationPath(raw);
  if (!value) return null;
  for (const [from, to] of [['/crush-live', '/crush/live'], ['/ligar', '/crush'], ['/noticia', '/noticias'], ['/beca', '/becas'], ['/piso', '/alojamiento'], ['/novedades', '/noticias']]) {
    if (value === from || value.startsWith(from + '/') || value.startsWith(from + '?') || value.startsWith(from + '#')) return to + value.slice(from.length);
  }
  return value;
}

function roomieTab(data: Record<string, unknown>, type?: string | null): 'received' | 'matches' | null {
  if (type === 'roomie_like' || data.type === 'roomie_like' || data.kind === 'roomie_like') return 'received';
  if (data.kind === 'roomie_match' || data.target_type === 'roomie') return 'matches';
  // Legacy target_user_id payloads come from the roommate match triggers.
  if (id(data.target_user_id) && !data.kind && !data.url) return 'matches';
  return null;
}

export function notificationWebDestination(data: Data, type?: string | null): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const tab = roomieTab(data, type);
  if (tab) return `/roomie-match?tab=${tab}#roomie-likes`;
  const explicit = webNotificationPath(data.url);
  if (explicit) return explicit;
  if (data.kind === 'ig_request' || data.kind === 'ig_match') return '/crush';
  if (id(data.conversation_id)) return '/chats?chat=' + data.conversation_id;
  if (id(data.thread_id)) return '/fomo';
  return null;
}

export function notificationNativeDestination(data: Data, type?: string | null): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const tab = roomieTab(data, type);
  if (tab) return `/roomie-conexiones?tab=${tab}`;
  const explicit = safeNotificationPath(data.route) ?? safeNotificationPath(data.url);
  if (explicit) {
    const url = new URL(explicit, 'https://franky.es');
    const parts = url.pathname.split('/').filter(Boolean);
    const [area, value, detail] = parts;
    for (const key of ['id', 'slug', 'threadId']) url.searchParams.delete(key);
    const suffix = url.search + url.hash;
    if ((area === 'crush' && value === 'live' && parts.length === 2) || (area === 'crush-live' && parts.length === 1)) return '/crush-live' + suffix;
    if (area === 'ligar' && parts.length === 1) return '/(tabs)/crush' + suffix;
    if (area === 'roomie-match' && parts.length === 1) return '/roomie' + suffix;
    if (area === 'chats' && parts.length === 1) return id(url.searchParams.get('chat')) ? '/chat/' + url.searchParams.get('chat') : '/(tabs)/chats';
    if (area === 'fomo' && parts.length === 3 && id(detail)) return '/fomo/' + detail + suffix;
    const mapped = ({ noticias: 'noticia', eventos: 'evento', becas: 'beca', alojamiento: 'piso' } as Record<string, string>)[area];
    if (mapped && parts.length === 2 && (area === 'noticias' ? /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) : id(value))) return '/' + mapped + '/' + value + suffix;
    const lists: Record<string, string> = { noticias: '/novedades', alojamiento: '/pisos', eventos: '/(tabs)/eventos', fomo: '/(tabs)/feed', crush: '/(tabs)/crush', becas: '/becas' };
    if (parts.length === 1 && lists[area]) return lists[area] + suffix;
    const nativeLists = ['horario', 'tareas', 'agenda', 'racha', 'novedades', 'notificaciones', 'roomie', 'roomie-conexiones', 'pisos', 'becas', 'ocio', 'universidades', 'notas-corte'];
    if (parts.length === 1 && nativeLists.includes(area)) return url.pathname + suffix;
    if (parts.length === 2 && area === '(tabs)' && ['feed', 'chats', 'eventos', 'crush', 'explorar', 'estudio', 'perfil'].includes(value)) return url.pathname + suffix;
    if (parts.length === 2 && ['chat', 'fomo', 'fomo-uni', 'piso', 'beca', 'evento', 'ocio', 'uni', 'carrera'].includes(area) && id(value)) return url.pathname + suffix;
    if (parts.length === 2 && area === 'noticia' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return url.pathname + suffix;
  }
  if (data.kind === 'ig_request' || data.kind === 'ig_match') return '/(tabs)/crush';
  if (id(data.thread_id)) return '/fomo/' + data.thread_id;
  if (id(data.conversation_id)) return '/chat/' + data.conversation_id;
  return null;
}
