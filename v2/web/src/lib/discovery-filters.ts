/** Public catalogue state. Only recognised fields survive a shared URL. */
export const foldSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
export function readLeisureFilters(params: URLSearchParams) {
  const prices = (params.get('precio') ?? '').split(',').filter(v => /^[0-4]$/.test(v)).map(Number);
  const sort = params.get('orden') ?? 'destacados';
  return {
    city: (params.get('ciudad') ?? '').slice(0, 120), category: (params.get('categoria') ?? '').slice(0, 40),
    university: (params.get('uni') ?? '').slice(0, 40), query: (params.get('q') ?? '').slice(0, 120),
    prices: [...new Set(prices)], features: (params.get('servicios') ?? '').split(',').filter(v => /^[a-z_]{2,40}$/.test(v)),
    rating: ['3', '4', '4.5'].includes(params.get('valoracion') ?? '') ? Number(params.get('valoracion')) : 0,
    sort: ['destacados', 'rating', 'price-asc', 'price-desc', 'name'].includes(sort) ? sort : 'destacados',
    view: params.get('vista') === 'map' ? 'map' : 'grid',
  };
}
export type LeisureFilters = ReturnType<typeof readLeisureFilters>;
export function leisureQuery(f: LeisureFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ciudad: f.city, categoria: f.category, uni: f.university, q: f.query,
    precio: f.prices.join(','), servicios: f.features.join(','), valoracion: f.rating || '',
    orden: f.sort === 'destacados' ? '' : f.sort, vista: f.view === 'map' ? 'map' : '' })) {
    if (v) p.set(k, String(v));
  }
  return p.toString();
}
export function safeOcioReturn(value: unknown): string {
  return typeof value === 'string' && (value === '/ocio' || value.startsWith('/ocio?')) ? value : '/ocio';
}
