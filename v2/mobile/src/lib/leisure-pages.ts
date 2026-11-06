// Ocio y mapa de eventos sin bajar el catálogo entero.
//
// Antes, la pantalla de Ocio descargaba las ~4.600 zonas publicadas en bloques
// de 1.000 (unos 1,5 MB, cinco peticiones seguidas) y otras cinco peticiones
// para sacar la lista de ciudades, y filtraba y buscaba en el móvil. Aquí:
//   - listLeisureSpotsPage: una página de 30 con filtros y búsqueda EN EL
//     SERVIDOR (los locales colaboradores, pocos, llegan todos en la primera);
//   - getLeisureCitiesCached: la lista de ciudades se pide una sola vez por
//     sesión (y queda en disco 24 h), en segundo plano, solo para el filtro;
//   - resolveMyLeisureCity: la ciudad del perfil se casa con el catálogo con
//     una consulta de una fila, sin esperar a la lista de ciudades;
//   - getMapSpotsInBox: zonas con coordenadas dentro de la región visible del
//     mapa, con tope, para no pintar miles de marcadores.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getCachedSession } from './session';
import type { LeisureSpotPreview } from './api';
import type { MapSpot } from './geo';

export const LEISURE_PAGE_SIZE = 30;

const PREVIEW_COLUMNS = 'id,name,city,category,tagline,image_url,price_range,rating,owner_id';

export type LeisureFilters = { city: string; category: string; free: boolean; query: string };
export type LeisurePage = { rows: LeisureSpotPreview[]; total: number | null; hasMore: boolean };

/** Mismo plegado que la pantalla: minúsculas y sin tildes. */
export const foldText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Patrón ilike tolerante a tildes: cada vocal (y la ñ/n) pasa a "_" (un
 * carácter cualquiera), así "cafe" encuentra "Café" sin extensiones en la BD.
 * Lo que sobre por esa holgura se descarta en el cliente con el plegado real.
 */
function queryPatterns(query: string): string[] {
  return foldText(query)
    .replace(/[%_*,().:"'\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(t => t.replace(/[aeioun]/g, '_'))
    .filter(t => /[^_]/.test(t));
}

// Filtros comunes a las dos consultas (colaboradores y catálogo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLeisureFilters(q: any, f: LeisureFilters) {
  let out = q.eq('is_verified', true).eq('is_paid', true);
  if (f.city) out = out.eq('city', f.city);
  if (f.category) out = out.eq('category', f.category);
  if (f.free) out = out.eq('price_range', 0);
  for (const t of queryPatterns(f.query)) {
    out = out.or(`name.ilike.*${t}*,city.ilike.*${t}*,tagline.ilike.*${t}*`);
  }
  return out;
}

/** Filtro exacto de siempre (subcadena sobre nombre, ciudad y lema). */
function matchesQuery(s: LeisureSpotPreview, query: string): boolean {
  const q = foldText(query);
  if (!q) return true;
  return foldText(`${s.name} ${s.city} ${s.tagline ?? ''}`).includes(q);
}

function byRatingThenName(a: LeisureSpotPreview, b: LeisureSpotPreview) {
  return (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name, 'es');
}

/**
 * Una página del catálogo de Ocio, con el mismo orden que antes: locales
 * colaboradores primero (todos en la página 0), después el resto por
 * valoración y nombre. `total` es el recuento del servidor.
 */
export async function listLeisureSpotsPage(f: LeisureFilters, page: number): Promise<LeisurePage> {
  const from = page * LEISURE_PAGE_SIZE;
  const catalogue = applyLeisureFilters(
    supabase.from('leisure_spots').select(PREVIEW_COLUMNS, { count: page === 0 ? 'exact' : undefined }),
    f,
  )
    .is('owner_id', null)
    .order('rating', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + LEISURE_PAGE_SIZE - 1);

  const owners = page === 0
    ? applyLeisureFilters(supabase.from('leisure_spots').select(PREVIEW_COLUMNS), f)
      .not('owner_id', 'is', null).limit(200)
    : null;

  const [cat, own] = await Promise.all([catalogue, owners ?? Promise.resolve({ data: [], error: null })]);
  if (cat.error) throw cat.error;
  if (own.error) throw own.error;
  const catRows = (cat.data ?? []) as LeisureSpotPreview[];
  const ownRows = ((own.data ?? []) as LeisureSpotPreview[]).sort(byRatingThenName);
  const rows = [...ownRows, ...catRows].filter(s => matchesQuery(s, f.query));
  const catCount = typeof cat.count === 'number' ? cat.count : null;
  return {
    rows,
    total: catCount == null ? null : catCount + ownRows.length,
    hasMore: catCount != null ? from + catRows.length < catCount : catRows.length === LEISURE_PAGE_SIZE,
  };
}

// ── Ciudades del filtro ────────────────────────────────────────────────────
const CITIES_KEY = 'franky.leisure-cities.v1';
const CITIES_TTL_MS = 24 * 60 * 60 * 1000;
let citiesMemory: string[] | null = null;
let citiesInflight: Promise<string[]> | null = null;

async function fetchLeisureCities(): Promise<string[]> {
  const cities = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('leisure_spots').select('city')
      .eq('is_verified', true).eq('is_paid', true).order('id').range(from, from + 999);
    if (error) throw error;
    for (const row of (data ?? []) as { city: string | null }[]) if (row.city) cities.add(row.city);
    if (!data || data.length < 1000) break;
  }
  return [...cities].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Ciudades con zonas publicadas: memoria, luego disco (24 h), luego red. */
export function getLeisureCitiesCached(): Promise<string[]> {
  if (citiesMemory) return Promise.resolve(citiesMemory);
  if (citiesInflight) return citiesInflight;
  citiesInflight = (async () => {
    try {
      const raw = await AsyncStorage.getItem(CITIES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; cities: string[] };
        if (parsed && Array.isArray(parsed.cities) && Date.now() - parsed.at < CITIES_TTL_MS) {
          citiesMemory = parsed.cities;
          return parsed.cities;
        }
      }
    } catch { /* disco ilegible: se pide a la red */ }
    const cities = await fetchLeisureCities();
    citiesMemory = cities;
    AsyncStorage.setItem(CITIES_KEY, JSON.stringify({ at: Date.now(), cities })).catch(() => {});
    return cities;
  })().finally(() => { citiesInflight = null; });
  return citiesInflight;
}

// ── Ciudad del perfil ──────────────────────────────────────────────────────
let myCityMemory: { uid: string; city: string } | null = null;

/**
 * Ciudad del perfil ya escrita como en el catálogo ("madrid" → "Madrid"), o ''
 * (toda España) si no hay perfil o no hay zonas allí. La sesión se lee de la
 * caché local; nada de ir al servidor de auth antes de pintar.
 */
export async function resolveMyLeisureCity(): Promise<string> {
  try {
    const session = await getCachedSession();
    const uid = session?.user?.id;
    if (!uid) return '';
    if (myCityMemory?.uid === uid) return myCityMemory.city;
    const { data } = await supabase.from('profiles').select('city').eq('id', uid).maybeSingle();
    const mine = ((data?.city as string | null) ?? '').trim();
    let city = '';
    if (mine) {
      // Coincidencia exacta sin distinguir mayúsculas (ilike sin comodines).
      const safe = mine.replace(/[%_\\]/g, ' ');
      const { data: hit } = await supabase.from('leisure_spots').select('city')
        .eq('is_verified', true).eq('is_paid', true).ilike('city', safe).limit(1);
      city = ((hit?.[0] as { city?: string } | undefined)?.city) ?? '';
      if (!city) {
        // Difiere en tildes ("Malaga"): se casa con la lista de ciudades.
        const list = await getLeisureCitiesCached().catch(() => [] as string[]);
        city = list.find(c => foldText(c) === foldText(mine)) ?? '';
      }
    }
    myCityMemory = { uid, city };
    return city;
  } catch {
    return '';
  }
}

// ── Zonas del mapa por región visible ──────────────────────────────────────
export type MapBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export const MAP_BOX_LIMIT = 200;
const boxCache = new Map<string, MapSpot[]>();

/** Clave de caché con la caja redondeada (paneos pequeños reutilizan). */
export function mapBoxKey(b: MapBox): string {
  const r = (n: number) => n.toFixed(2);
  return `${r(b.minLat)}:${r(b.maxLat)}:${r(b.minLng)}:${r(b.maxLng)}`;
}

export function cachedMapSpotsInBox(b: MapBox): MapSpot[] | undefined {
  return boxCache.get(mapBoxKey(b));
}

/**
 * Zonas con coordenadas dentro de la caja, las mejor valoradas primero y con
 * tope: el mapa nunca recibe más de unos cientos. Mismo criterio que
 * getCityMapSpots (sin exigir verificado/pagado: son contexto del mapa).
 */
export async function getMapSpotsInBox(b: MapBox): Promise<MapSpot[]> {
  const key = mapBoxKey(b);
  const hit = boxCache.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.from('leisure_spots')
    .select('id, name, city, category, rating, image_url, tagline, google_maps_url, latitude, longitude')
    .gte('latitude', b.minLat).lte('latitude', b.maxLat)
    .gte('longitude', b.minLng).lte('longitude', b.maxLng)
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(MAP_BOX_LIMIT);
  if (error) throw error;
  const rows = ((data ?? []) as MapSpot[]).filter(s => s.latitude != null && s.longitude != null);
  if (boxCache.size > 60) boxCache.delete(boxCache.keys().next().value!);
  boxCache.set(key, rows);
  return rows;
}
