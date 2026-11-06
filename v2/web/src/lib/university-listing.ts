export const UNIVERSITY_PAGE_SIZE = 24;
export type UniversityParams = { tipo?: string; comunidad?: string; ciudad?: string; q?: string; pagina?: string };
export function universityParams(input: Record<string, string | string[] | undefined>): UniversityParams {
  const params: UniversityParams = {};
  for (const key of ['tipo', 'comunidad', 'ciudad', 'q', 'pagina'] as const) {
    const value = input[key];
    params[key] = Array.isArray(value) ? value[0] : value;
  }
  return params;
}
type UniversityLocation = { name: string; type: string; comunidad_autonoma: string | null; city: string | null };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

export function universityPageHref(params: UniversityParams, page: number) {
  const query = new URLSearchParams();
  for (const key of ['tipo', 'comunidad', 'ciudad', 'q'] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  if (page > 1) query.set('pagina', String(page));
  return `/universidades${query.size ? `?${query}` : ''}`;
}

/** Filtering always happens against the full cached catalogue, before pagination. */
export function universityListing<T extends UniversityLocation>(catalogue: T[], params: UniversityParams) {
  const search = normalized(params.q ?? '');
  const filtered = catalogue.filter(uni =>
    (!params.tipo || uni.type === params.tipo)
    && (!params.comunidad || uni.comunidad_autonoma === params.comunidad)
    && (!params.ciudad || uni.city === params.ciudad)
    && (!search || normalized(uni.name).includes(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / UNIVERSITY_PAGE_SIZE));
  const requested = /^\d+$/.test(params.pagina ?? '') ? Number(params.pagina) : 1;
  const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, pages)) : 1;
  const start = (page - 1) * UNIVERSITY_PAGE_SIZE;
  return { filtered, visible: filtered.slice(start, start + UNIVERSITY_PAGE_SIZE), page, pages, start };
}
