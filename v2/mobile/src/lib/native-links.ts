/** Maps public website URLs to existing native screens, without navigation or writes. */
export type PublicLinkLookup = (table: 'universities' | 'careers', slug: string) => Promise<string | null>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Expo's warm-link listener ignores an empty href; an older lookup must not navigate. */
export function createNativeIntentHandler(resolve: (path: string) => Promise<string>) {
  let latestWarmLink = 0;
  return async ({ path, initial }: { path: string; initial: boolean }): Promise<string> => {
    if (initial) return resolve(path);
    const generation = ++latestWarmLink;
    const href = await resolve(path);
    return generation === latestWarmLink ? href : '';
  };
}

export async function resolveIncomingLink(path: string, lookup: PublicLinkLookup): Promise<string> {
  try {
    // OAuth/custom scheme callbacks and other domains retain their existing handling.
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^https?:\/\//i.test(path)) return path;
    const url = new URL(path, 'https://franky.es');
    if (url.origin !== 'https://franky.es' && url.origin !== 'http://franky.es') return path;
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const [area, value, detail] = segments;
    // Routing parameters come from the path, never from a conflicting query.
    for (const key of ['id', 'slug', 'threadId']) url.searchParams.delete(key);
    const suffix = url.search;
    if (area === 'franky-card' && (segments.length === 1 || segments.length === 2 && value === 'retorno')) {
      const order = url.searchParams.get('order');
      return order && UUID.test(order) ? '/franky-card?order=' + encodeURIComponent(order) : '/franky-card';
    }
    if (area === 'pago' && value === 'retorno' && segments.length === 2) {
      const orderId = url.searchParams.get('order_id');
      return orderId && UUID.test(orderId) ? '/pago-retorno?order_id=' + encodeURIComponent(orderId) : '/pago-retorno';
    }
    if (segments.some(s => s.length > 220 || s.includes('/') || s.includes('\\'))) return '/+not-found';
    if (area === 'mis-visitas' && segments.length === 1) return '/mis-visitas';
    if (area === 'devoluciones' && segments.length === 1) {
      const booking=url.searchParams.get('booking'),ticket=url.searchParams.get('ticket');
      if(booking&&UUID.test(booking))return '/devoluciones?booking='+booking;
      return ticket&&UUID.test(ticket)?'/devoluciones?ticket='+ticket:'/devoluciones';
    }
    if (area === 'contratos' && segments.length === 2) return UUID.test(value) ? '/contrato/' + value : '/mi-alquiler';
    const targetId = async (table: 'universities' | 'careers', value: string) => {
      if (UUID.test(value)) return value;
      if (!SLUG.test(value)) return null;
      try { const id = await lookup(table, value); return id && UUID.test(id) ? id : null; }
      catch { return null; }
    };
    if (area === 'fomo') {
      if (segments.length === 1) return '/(tabs)/feed' + suffix;
      if (segments.length === 3 && UUID.test(detail)) return '/fomo/' + detail + suffix;
      if (segments.length === 2) {
        // Existing native notification links already contain the thread UUID.
        if (UUID.test(value)) return '/fomo/' + value + suffix;
        const id = await targetId('universities', value);
        return id ? '/fomo-uni/' + id + suffix : '/(tabs)/feed';
      }
    }
    if (area === 'universidades' && segments.length === 2) {
      if (value === 'comparar') return '/comparar-unis';
      const id = await targetId('universities', value);
      return id ? '/uni/' + id + suffix : '/universidades';
    }
    if (area === 'carreras' && segments.length <= 2) {
      if (!value) return '/notas-corte' + suffix;
      const id = await targetId('careers', value);
      return id ? '/carrera/' + id + suffix : '/notas-corte';
    }
    if (area === 'becas' && segments.length === 2) return UUID.test(value) ? '/beca/' + value + suffix : '/becas';
    if (area === 'eventos' && segments.length === 2) {
      if (value === 'crear') return '/crear-evento';
      if (value === 'swipe') return '/(tabs)/eventos';
      return UUID.test(value) ? '/evento/' + value + suffix : '/(tabs)/eventos';
    }
    if (area === 'noticias') return value && SLUG.test(value) ? '/noticia/' + value + suffix : '/novedades';
    if (area === 'alojamiento') return value && UUID.test(value) ? '/piso/' + value + suffix : '/pisos';
    if (area === 'roomie-match' && segments.length === 1) return '/roomie' + suffix;
    if (area === 'roomie-match' && value === 'conexiones' && segments.length === 2) return '/roomie-conexiones' + suffix;
    return path;
  } catch { return '/+not-found'; }
}
