export type CommunityTermsStatus = 'loading' | 'required' | 'accepted' | 'error';

/** Catalog, housing, payments and account settings remain usable independently. */
export function isCommunityRoute(segments: readonly string[]): boolean {
  const first = segments[0] === '(tabs)' ? segments[1] : segments[0];
  return ['feed', 'fomo', 'fomo-uni', 'publicar', 'comunidades', 'comunidad',
    'crear-comunidad', 'comunidad-editar', 'crush', 'crush-live', 'story',
    'chats', 'chat', 'nuevo-grupo', 'llamada', 'roomie', 'roomie-conexiones',
    'roomie-editar', 'mercado', 'crear-anuncio'].includes(first ?? '');
}
