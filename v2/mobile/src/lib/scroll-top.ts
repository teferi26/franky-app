// Bus "volver arriba": al tocar una pestaña que ya está activa, la barra emite
// aquí y la pantalla correspondiente (si se suscribe) hace scroll al principio,
// como en Instagram/Twitter. Desacoplado: la barra no conoce las listas de cada
// pantalla y cada pantalla se apunta con su propio nombre de ruta.
type Listener = () => void;

const byRoute = new Map<string, Set<Listener>>();

export function emitScrollTop(route: string): void {
  const set = byRoute.get(route);
  if (set) for (const l of set) l();
}

export function onScrollTop(route: string, cb: Listener): () => void {
  let set = byRoute.get(route);
  if (!set) { set = new Set(); byRoute.set(route, set); }
  set.add(cb);
  return () => { set?.delete(cb); };
}
