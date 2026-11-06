// Capa de datos: SIEMPRE datos reales de Supabase (sin datos de ejemplo).
import { supabase, WEB_URL, fetchConTimeout } from './supabase';
import type {
  University, Career, Scholarship, EventItem, LeisureSpot,
  Accommodation, FomoThread, LigarPost, LigarProfile, EventTicket,
  ShirtSize, CrushLiveAction, CrushLiveAnswers, CrushLiveCandidate,
  CrushLiveEvent, CrushLiveGender, CrushLiveGoal, CrushLiveMatch,
  CrushLiveProfile, CrushLiveState,
} from './types';
import { SHIRT_SIZES } from './types';
import { SCHOLARSHIP_ALIASES } from './scholarship-aliases';
import { completeCatalogue } from './complete-catalogue';
import { captureSessionIdentity } from './session';
import { withOwnedRequest, type OwnedRequest } from './owned-request';
import { requestPublicationReview } from './publication-review';
import type { MapSpot } from './geo';

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ rows: T[]; live: boolean }> {
  const { data, error } = await q;
  if (error) throw error;
  return { rows: data ?? [], live: true };
}

export const getUniversities = () =>
  rows<University>(supabase.from('universities').select('*').order('name').limit(200));

export const getCareers = (universityId?: string) => {
  let q = supabase.from('careers').select('*, universities(name, short_name)')
    .order('cut_off_score', { ascending: false, nullsFirst: false }).limit(400);
  if (universityId) q = q.eq('university_id', universityId);
  return rows<Career>(q);
};

export const searchCareers = (term: string) =>
  rows<Career>(
    supabase.from('careers').select('*, universities(name, short_name)')
      .ilike('name', `%${term}%`)
      .order('cut_off_score', { ascending: false, nullsFirst: false }).limit(50),
  );

// ── Notas de corte (réplica exacta de la web /notas-corte) ──
// Misma tabla (careers) y mismos campos que la web: TODAS las titulaciones,
// ordenadas de mayor a menor nota, y las que aún no tienen nota publicada
// (cut_off_score null) al final. Los datos son OFICIALES y curados: se pintan
// tal cual vienen de la BD, sin transformar.
export interface CutOffRow {
  id: string;
  slug: string | null;
  name: string;
  branch: string;
  cut_off_score: number | null;
  cut_off_year: number | null;
  cut_off_score_prev?: number | null;
  cut_off_year_prev?: number | null;
  admission_without_cutoff?: boolean;
  campus: string | null;
  modality?: string | null;
  places_offered: number | null;
  demand_ratio: number | null;
  employment_rate: number | null;
  duration_years: number | null;
  universities: {
    name: string;
    short_name: string | null;
    city: string | null;
    comunidad_autonoma: string | null;
    slug: string | null;
  } | null;
}

// A partial catalogue must never look like a complete result or admission count.
export async function getCutOffScores(): Promise<{ rows: CutOffRow[]; live: boolean }> {
  try {
    const all = await completeCatalogue((from, to) => supabase
        .from('careers')
        .select('id, slug, name, branch, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, campus, modality, places_offered, demand_ratio, duration_years, universities(name, short_name, city, comunidad_autonoma, slug)')
        // Sin filtro de cut_off_score: esta pantalla absorbió el listado de
        // carreras, así que también lista las que aún no tienen nota publicada
        // (salen como "Sin nota", al final). Paridad con la web.
        .order('cut_off_score', { ascending: false, nullsFirst: false })
        // Desempate estable: sin él, el bloque de filas sin nota (todas
        // empatadas) puede reordenarse entre páginas y duplicar o perder filas.
        .order('id', { ascending: true })
        .range(from, to));
      // El embed puede llegar como array u objeto según la relación: se
      // normaliza la FORMA (como hace la web), nunca los valores.
      const rows = (all as unknown[]).map((r) => {
        const c = r as CutOffRow & { universities: CutOffRow['universities'] | CutOffRow['universities'][] };
        return { ...c, universities: Array.isArray(c.universities) ? (c.universities[0] ?? null) : c.universities } as CutOffRow;
      });
    return { rows, live: true };
  } catch {
    return { rows: [], live: false };
  }
}

export const getScholarships = async () => {
  const catalogue: Scholarship[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('scholarships').select('*').eq('is_active', true)
      .order('id').range(offset, offset + 499);
    if (error) throw error;
    catalogue.push(...(data ?? []) as Scholarship[]);
    if ((data?.length ?? 0) < 500) break;
  }
  return { rows: catalogue.filter(row => !SCHOLARSHIP_ALIASES[row.id]), live: true };
};

export const getEvents = () =>
  rows<EventItem>(
    supabase.from('events').select('*').in('status', ['upcoming', 'ongoing']).order('start_date').limit(100),
  );

export const getEvent = async (id: string): Promise<EventItem | null> => {
  const { data } = await supabase.from('events').select('*').eq('id', id)
    .in('status', ['upcoming', 'ongoing']).maybeSingle();
  return (data as EventItem) ?? null;
};

// ── Zonas de ocio ────────────────────────────────────────────────────────
// Un local dado de alta por su dueño (owner_id != null) es un negocio que PAGA
// la ficha. Su rating nace en 0, así que ordenar solo por rating lo mandaba al
// final de la lista y, con el tope de 400 filas, directamente NO llegaba a la
// app. Por eso van en su propia consulta y se pintan primero.
export interface LeisureSpotFull extends LeisureSpot {
  owner_id?: string | null;
  images?: string[] | null;
  email?: string | null;
  instagram?: string | null;
  extra_info?: string | null;
  min_age?: number | null;
  capacity?: number | null;
  opening_hours?: Record<string, string> | null;
  has_wifi?: boolean | null;
  has_billiards?: boolean | null;
  has_air_conditioning?: boolean | null;
  has_terrace?: boolean | null;
  has_outdoor_seating?: boolean | null;
  has_parking?: boolean | null;
  has_food?: boolean | null;
  has_live_music?: boolean | null;
  accepts_groups?: boolean | null;
  accepts_pets?: boolean | null;
  student_discount?: boolean | null;
  card_payment?: boolean | null;
  reservations?: boolean | null;
}

/** Limpia los comodines de PostgREST antes de meter texto libre en un ilike. */
const safeLike = (v: string) => v.replace(/[%_,()]/g, ' ').trim();

/** Local de pago primero; dentro de cada grupo, mejor valorado y luego A-Z. */
function rankSpots(a: LeisureSpotFull, b: LeisureSpotFull): number {
  const pa = a.owner_id ? 1 : 0;
  const pb = b.owner_id ? 1 : 0;
  if (pa !== pb) return pb - pa;
  const ra = a.rating ?? 0;
  const rb = b.rating ?? 0;
  if (ra !== rb) return rb - ra;
  return a.name.localeCompare(b.name, 'es');
}

export type LeisureSpotPreview = Pick<LeisureSpotFull, 'id' | 'name' | 'city' | 'category' | 'tagline' | 'image_url' | 'price_range' | 'rating' | 'owner_id'>;
export async function listLeisureSpots(city?: string): Promise<{ rows: LeisureSpotPreview[]; live: boolean }> {
  const rows: LeisureSpotPreview[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from('leisure_spots').select('id,name,city,category,tagline,image_url,price_range,rating,owner_id').eq('is_verified', true).eq('is_paid', true).order('id').range(from, from + 999);
    if (city) q = q.eq('city', city);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []) as LeisureSpotPreview[]);
    if (!data || data.length < 1000) break;
  }
  return { rows: rows.sort((a, b) => Number(!!b.owner_id) - Number(!!a.owner_id) || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name, 'es')), live: true };
}

export async function getSpots(city?: string): Promise<{ rows: LeisureSpotFull[]; live: boolean }> {
  const base = () => {
    const q = supabase.from('leisure_spots').select('*')
      .eq('is_verified', true).eq('is_paid', true);
    return city ? q.ilike('city', `%${safeLike(city)}%`) : q;
  };
  const [negocios, catalogo] = await Promise.all([
    base().not('owner_id', 'is', null).limit(100),
    base().order('rating', { ascending: false, nullsFirst: false }).limit(400),
  ]);
  if (negocios.error && catalogo.error) throw catalogo.error;
  const byId = new Map<string, LeisureSpotFull>();
  for (const r of [...(negocios.data ?? []), ...(catalogo.data ?? [])] as LeisureSpotFull[]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return { rows: [...byId.values()].sort(rankSpots), live: true };
}

// Ficha de una zona de ocio con el MISMO criterio que la web (/ocio/[id]):
// solo se ve si está verificada y pagada. Antes la app pintaba cualquier fila,
// incluidas las de locales que no habían pagado todavía.
// Devuelve null SOLO cuando la zona no existe o no es visible; un fallo de red
// o de servidor se lanza, para que la ficha enseñe "no se pudo cargar" con
// Reintentar en vez de "no encontramos este sitio".
export const getSpot = async (id: string): Promise<LeisureSpotFull | null> => {
  const { data, error } = await supabase.from('leisure_spots').select('*').eq('id', id)
    .eq('is_verified', true).eq('is_paid', true).maybeSingle();
  if (error) throw error;
  return (data as LeisureSpotFull) ?? null;
};

/** Ciudades con zonas de ocio publicadas (para el filtro por ciudad). */
export async function getLeisureCities(): Promise<string[]> {
  const cities = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('leisure_spots').select('id,city').eq('is_verified', true).eq('is_paid', true).order('id').range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) if (row.city) cities.add(row.city);
    if (!data || data.length < 1000) break;
  }
  return [...cities].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Ciudades con pisos publicados (para el filtro por ciudad). */
export async function getAccommodationCities(): Promise<string[]> {
  const { data } = await supabase.from('accommodations').select('city')
    .eq('status', 'active').eq('is_paid', true).limit(2000);
  return [...new Set(((data ?? []) as { city: string | null }[])
    .map((r) => r.city).filter((c): c is string => !!c))]
    .sort((a, b) => a.localeCompare(b, 'es'));
}

/** Ciudad del perfil, para preseleccionar el filtro. Fail-soft: null. */
export async function getMyCity(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('profiles').select('city').eq('id', user.id).maybeSingle();
    const c = (data?.city as string | null) ?? null;
    return c && c.trim() ? c.trim() : null;
  } catch { return null; }
}

// Zonas de ocio con coordenadas de una ciudad, para el mapa de eventos.
// Campos mínimos (nada de details/description) y tope de 400: el catálogo real
// tiene miles de zonas y el mapa solo necesita las mejor valoradas. A
// diferencia del deck de Ocio, aquí NO se exige is_verified/is_paid: ciudades
// como Alicante capital solo tienen las zonas seed (reales y con foto) y sin
// ellas el mapa se quedaría sin centroide ni contexto.
export const getCityMapSpots = (city: string) =>
  rows<MapSpot>(
    supabase.from('leisure_spots')
      .select('id, name, city, category, rating, image_url, tagline, google_maps_url, latitude, longitude')
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .ilike('city', `%${city.replace(/[%_,()]/g, ' ').trim()}%`)
      .order('rating', { ascending: false, nullsFirst: false })
      .limit(400),
  );

// ── Alojamiento ──────────────────────────────────────────────────────────
// El alta (/negocio/registro) escribe COLUMNAS booleanas, no el array heredado
// `amenities`: por eso la ficha tiene que leer estas y no aquel.
export interface AccommodationFull extends Accommodation {
  extra_info?: string | null;
  comunidad_autonoma?: string | null;
  room_size_sqm?: number | null;
  min_stay_months?: number | null;
  deposit_months?: number | null;
  agency_commission_pct?: number | null;
  available_until?: string | null;
  current_flatmates_count?: number | null;
  current_flatmates_genders?: string[] | null;
  gender_preference?: string | null;
  videos?: string[] | null;
  is_furnished?: boolean | null;
  bills_included?: boolean | null;
  water_included?: boolean | null;
  electricity_included?: boolean | null;
  allows_smokers?: boolean | null;
  students_only?: boolean | null;
  pets_allowed?: boolean | null;
  has_wifi?: boolean | null;
  has_air_conditioning?: boolean | null;
  has_heating?: boolean | null;
  has_elevator?: boolean | null;
  has_parking?: boolean | null;
  has_terrace?: boolean | null;
  has_balcony?: boolean | null;
  has_washing_machine?: boolean | null;
  has_dishwasher?: boolean | null;
  has_pool?: boolean | null;
  has_gym?: boolean | null;
  has_double_bed?: boolean | null;
  has_private_bathroom?: boolean | null;
}

/**
 * Características que el alta escribe de verdad, en el orden en que se pintan.
 * Vive aquí (y no en cada pantalla) para que la ficha y el comparador nunca se
 * desincronicen. Los iconos los pone cada pantalla.
 */
export const ACCOMMODATION_FEATURES: { key: keyof AccommodationFull; label: string }[] = [
  { key: 'has_wifi', label: 'Wifi' },
  { key: 'has_air_conditioning', label: 'Aire acondicionado' },
  { key: 'has_heating', label: 'Calefacción' },
  { key: 'has_elevator', label: 'Ascensor' },
  { key: 'has_parking', label: 'Parking' },
  { key: 'has_terrace', label: 'Terraza' },
  { key: 'has_balcony', label: 'Balcón' },
  { key: 'has_washing_machine', label: 'Lavadora' },
  { key: 'has_dishwasher', label: 'Lavavajillas' },
  { key: 'has_pool', label: 'Piscina' },
  { key: 'has_gym', label: 'Gimnasio' },
  { key: 'is_furnished', label: 'Amueblado' },
  { key: 'has_double_bed', label: 'Cama doble' },
  { key: 'has_private_bathroom', label: 'Baño privado' },
  { key: 'bills_included', label: 'Gastos incluidos' },
  { key: 'water_included', label: 'Agua incluida' },
  { key: 'electricity_included', label: 'Luz incluida' },
  { key: 'pets_allowed', label: 'Admite mascotas' },
  { key: 'students_only', label: 'Solo estudiantes' },
  { key: 'allows_smokers', label: 'Se permite fumar' },
];

// is_paid: la RLS (161) ya lo impone en servidor; el filtro explícito es
// defensa en profundidad y paridad con la query del catálogo web.
export const getAccommodations = (city?: string) => {
  const q = supabase.from('accommodations').select('*').eq('status', 'active').eq('is_paid', true);
  return rows<AccommodationFull>(
    (city ? q.ilike('city', `%${safeLike(city)}%`) : q)
      .order('created_at', { ascending: false }).limit(100),
  );
};

export const getAccommodation = async (id: string): Promise<AccommodationFull | null> => {
  const { data } = await supabase.from('accommodations').select('*').eq('id', id)
    .eq('status', 'active').eq('is_paid', true).maybeSingle();
  return (data as AccommodationFull) ?? null;
};

// El feed del Fomo se sirve por RPC (protege el anonimato); requiere sesión.
// Firma completa de la migración 094: offset para scroll infinito, búsqueda
// ILIKE sobre el cuerpo y orden 'recent' | 'oldest' | 'top'.
export type FomoSort = 'recent' | 'oldest' | 'top';
export const getThreads = async (
  universityId: string,
  opts: { limit?: number; offset?: number; search?: string | null; sort?: FomoSort } = {},
): Promise<{ rows: FomoThread[]; live: boolean }> => {
  const { data, error } = await supabase.rpc('get_fomo_feed', {
    p_university_id: universityId,
    p_limit: opts.limit ?? 20,
    p_offset: opts.offset ?? 0,
    p_search: opts.search || null,
    p_sort: opts.sort ?? 'recent',
  });
  if (error) throw error;
  return { rows: (data as unknown as FomoThread[]) ?? [], live: true };
};

// Voto de encuesta FOMO (único por usuario, no editable; migración 080).
export async function voteFomoPoll(optionId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('vote_fomo_poll', { p_option_id: optionId });
  return { ok: !error };
}

// Devuelve ok para que la UI pueda revertir el corazon optimista si falla (sin sesion o sin red).
export async function toggleFomoReaction(threadId: string): Promise<{ ok: boolean }> {
  const { error } = await supabase.rpc('toggle_fomo_reaction', { p_thread_id: threadId });
  return { ok: !error };
}

// Reacción con emoji del FOMO (migración 129). set_fomo_reaction pone/cambia/quita
// (una por usuario) y devuelve el emoji resultante o null si quedó sin reacción.
// Distinguimos tres estados de retorno para que la UI actúe:
//   string   → esa es mi reacción ahora
//   null     → me quedé sin reacción (la quité)
//   undefined→ la RPC no existe aún o falló: la UI cae al toggle binario (fail-soft)
export async function setFomoReaction(threadId: string, emoji: string): Promise<string | null | undefined> {
  const { data, error } = await supabase.rpc('set_fomo_reaction', { p_thread_id: threadId, p_emoji: emoji });
  if (error) return undefined;
  return (data as string | null) ?? null;
}

// Desglose de reacciones por emoji de un hilo (fomo_reaction_summary, 129).
// Fail-soft: si la RPC no existe todavía, devuelve lista vacía.
export async function getReactionSummary(threadId: string): Promise<{ emoji: string; count: number }[]> {
  const { data, error } = await supabase.rpc('fomo_reaction_summary', { p_thread_id: threadId });
  if (error) return [];
  return (data as { emoji: string; count: number }[]) ?? [];
}

// Private saved posts and reactions always retain the initiating account.
export async function saveFomoThread(id: string, owner = captureSessionIdentity()): Promise<{ ok: boolean }> {
  if (!owner) return { ok: false };
  try {
    return await withOwnedRequest(owner, async request => {
      const { error } = await request.query(supabase.from('favorites').upsert(
        { user_id: owner.userId, target_type: 'fomo_thread', target_id: id },
        { onConflict: 'user_id,target_type,target_id' },
      ));
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}
export async function unsaveFomoThread(id: string, owner = captureSessionIdentity()): Promise<{ ok: boolean }> {
  if (!owner) return { ok: false };
  try {
    return await withOwnedRequest(owner, async request => {
      const { error } = await request.query(supabase.from('favorites').delete()
        .match({ user_id: owner.userId, target_type: 'fomo_thread', target_id: id }));
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}

async function readPrivateFomoIds(request: OwnedRequest, kind: 'saved' | 'liked'): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const query = kind === 'saved'
      ? supabase.from('favorites').select('target_id, created_at').eq('user_id', request.owner.userId)
        .eq('target_type', 'fomo_thread').order('created_at', { ascending: false }).order('target_id')
      : supabase.from('fomo_reactions').select('thread_id').eq('user_id', request.owner.userId).order('thread_id');
    const { data, error } = await request.query(query.range(offset, offset + 499));
    request.check();
    if (error) throw error;
    const rows = (data ?? []) as unknown as { target_id?: string; thread_id?: string }[];
    ids.push(...rows.map(row => kind === 'saved' ? row.target_id! : row.thread_id!));
    if (rows.length < 500) return ids;
  }
}
export async function getSavedFomoThreadIds(owner = captureSessionIdentity()): Promise<Set<string>> {
  if (!owner) return new Set();
  return withOwnedRequest(owner, async request => new Set(await readPrivateFomoIds(request, 'saved')));
}
export interface SavedFomoThread {
  id: string; body: string | null; media_url: string | null;
  media_type: 'image' | 'audio' | 'video' | null; is_anonymous: boolean; created_at: string;
}
async function readPrivateFomoThreads(request: OwnedRequest, kind: 'saved' | 'liked'): Promise<SavedFomoThread[]> {
  const ids = await readPrivateFomoIds(request, kind);
  const byId = new Map<string, SavedFomoThread>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await request.query(supabase.from('fomo_threads')
      .select('id, body, media_url, media_type, is_anonymous, created_at')
      .in('id', ids.slice(offset, offset + 100)).eq('is_deleted', false));
    request.check();
    if (error) throw error;
    for (const thread of (data ?? []) as SavedFomoThread[]) byId.set(thread.id, thread);
  }
  const threads = ids.map(id => byId.get(id)).filter((thread): thread is SavedFomoThread => !!thread);
  return kind === 'liked' ? threads.sort((a, b) => b.created_at.localeCompare(a.created_at)) : threads;
}
export async function getSavedFomoThreads(owner = captureSessionIdentity()): Promise<SavedFomoThread[]> {
  if (!owner) return [];
  return withOwnedRequest(owner, request => readPrivateFomoThreads(request, 'saved'));
}
export async function getLikedFomoThreads(owner = captureSessionIdentity()): Promise<SavedFomoThread[]> {
  if (!owner) return [];
  return withOwnedRequest(owner, request => readPrivateFomoThreads(request, 'liked'));
}

// Universidad del usuario con sesión (para el Fomo de SU campus)
// Una sola consulta (perfil + universidad embebida) y la sesión local en vez de
// auth.getUser: getUser va a la red y retiene el candado de auth, así que antes
// el FOMO esperaba tres idas y vueltas en fila antes de pedir el feed.
export async function getMyUniversity(): Promise<{ id: string; name: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) return null;
  const { data: prof, error } = await supabase.from('profiles')
    .select('university_id, universities(id, name, short_name)').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!prof?.university_id) return null;
  const embedded = (prof as { universities?: unknown }).universities;
  const uni = (Array.isArray(embedded) ? embedded[0] : embedded) as { id: string; name: string; short_name: string | null } | null | undefined;
  return uni ? { id: uni.id, name: uni.short_name ?? uni.name } : null;
}

// Cache en memoria del slug de la universidad del usuario (por sesión de la
// app): el slug no cambia en la práctica y así compartir no dispara dos
// consultas cada vez. Se invalida solo si cambia el usuario con sesión.
let uniSlugCache: { userId: string; slug: string | null } | null = null;

// Slug de la universidad del usuario (universities.slug), para construir el
// enlace público de compartir del FOMO: la web solo sirve /fomo/{slug} (la
// landing del campus, migración 144), no páginas por hilo. Fail-soft: sin
// sesión, sin universidad o sin red devuelve null y quien llama enlaza a la
// portada.
export async function getMyUniversitySlug(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    if (uniSlugCache && uniSlugCache.userId === user.id) return uniSlugCache.slug;
    const { data: prof } = await supabase.from('profiles').select('university_id').eq('id', user.id).maybeSingle();
    if (!prof?.university_id) { uniSlugCache = { userId: user.id, slug: null }; return null; }
    const { data: uni } = await supabase.from('universities').select('slug').eq('id', prof.university_id).maybeSingle();
    const slug = (uni?.slug as string | null) ?? null;
    uniSlugCache = { userId: user.id, slug };
    return slug;
  } catch { return null; }
}

// Muro Crush por RPC: usa la universidad y el género del que mira; requiere sesión.
// Mismos parámetros extra que FOMO (migración 094).
export const getLigarPosts = async (
  opts: { limit?: number; offset?: number; search?: string | null; sort?: FomoSort } = {},
): Promise<{ rows: LigarPost[]; live: boolean }> => {
  const { data, error } = await supabase.rpc('get_ligar_feed', {
    p_limit: opts.limit ?? 20,
    p_offset: opts.offset ?? 0,
    p_search: opts.search || null,
    p_sort: opts.sort ?? 'recent',
  });
  if (error) throw error;
  return { rows: (data as unknown as LigarPost[]) ?? [], live: true };
};

// "¿Eres tú? Pídele el Instagram": resuelve el autor en el servidor (incluye
// posts anónimos) y devuelve el handle SOLO si hay reciprocidad (match).
export async function requestIgForPost(
  postId: string,
): Promise<{ ok: boolean; matched?: boolean; instagram?: string | null }> {
  const { data, error } = await supabase.rpc('request_ig_for_post', { p_post_id: postId });
  if (error) return { ok: false };
  const res = data as { matched?: boolean; instagram_handle?: string | null } | null;
  return { ok: true, matched: res?.matched, instagram: res?.instagram_handle ?? null };
}

// Perfil de Crush (opt-in + handle de Instagram; migración 082).
export async function getLigarProfile(): Promise<LigarProfile | null> {
  const { data, error } = await supabase.rpc('get_ligar_profile');
  if (error) return null;
  return (data as LigarProfile) ?? null;
}

// Activar (o desactivar) el perfil de Crush. El servidor normaliza el handle
// (quita @, minúsculas) y exige 18+ para activar.
export async function setLigarProfile(
  instagramHandle: string,
  optedIn: boolean,
): Promise<{ ok: boolean; profile?: LigarProfile; message?: string }> {
  const { data, error } = await supabase.rpc('set_ligar_profile', {
    p_instagram_handle: instagramHandle,
    p_opted_in: optedIn,
  });
  if (error) {
    // La RPC (082) lanza los errores en español: 'Debes ser mayor de 18…',
    // 'Instagram no válido', 'Necesitas indicar tu Instagram…'.
    const raw = error.message ?? '';
    const msg = raw.includes('mayor de')
      ? 'Crush es solo para mayores de 18 años.'
      : raw.includes('Instagram')
        ? 'Ese usuario de Instagram no parece válido. Escríbelo como @tuusuario.'
        : 'No se pudo guardar tu perfil de Crush.';
    return { ok: false, message: msg };
  }
  return { ok: true, profile: (data as LigarProfile) ?? undefined };
}

// ── Crush Live (eventos oficiales Franky) ────────────────────────────────
// Todas las operaciones pasan por RPC: preferencias, likes y candidatos son
// privados y nunca se consultan como tablas desde el cliente.
export async function getCrushLiveEvents(): Promise<CrushLiveEvent[]> {
  const { data, error } = await supabase.rpc('get_crush_live_events');
  if (error) throw error;
  return (data as unknown as CrushLiveEvent[]) ?? [];
}

export async function getCrushLiveState(eventId: string): Promise<CrushLiveState> {
  const { data, error } = await supabase.rpc('get_crush_live_state', { p_event_id: eventId });
  if (error) throw error;
  return data as unknown as CrushLiveState;
}

export async function setCrushLiveProfile(opts: {
  eventId: string;
  active: boolean;
  goal: CrushLiveGoal;
  preferredGenders: CrushLiveGender[];
  ageMin: number;
  ageMax: number;
  answers: CrushLiveAnswers;
}): Promise<CrushLiveProfile> {
  const { data, error } = await supabase.rpc('set_crush_live_profile', {
    p_event_id: opts.eventId,
    p_active: opts.active,
    p_goal: opts.goal,
    p_preferred_genders: opts.preferredGenders,
    p_age_min: opts.ageMin,
    p_age_max: opts.ageMax,
    p_answers: opts.answers,
  });
  if (error) throw error;
  return data as unknown as CrushLiveProfile;
}

export async function getCrushLiveFeed(eventId: string, limit = 50): Promise<CrushLiveCandidate[]> {
  const { data, error } = await supabase.rpc('get_crush_live_feed', {
    p_event_id: eventId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data as unknown as CrushLiveCandidate[]) ?? [];
}

export async function swipeCrushLive(opts: {
  eventId: string;
  targetId: string;
  action: CrushLiveAction;
  idempotencyKey: string;
}): Promise<{ match: boolean; conversation_id: string | null; compatibility?: number }> {
  const { data, error } = await supabase.rpc('crush_live_swipe', {
    p_event_id: opts.eventId,
    p_target_id: opts.targetId,
    p_action: opts.action,
    p_idempotency_key: opts.idempotencyKey,
  });
  if (error) throw error;
  return (data as unknown as { match: boolean; conversation_id: string | null; compatibility?: number })
    ?? { match: false, conversation_id: null };
}

export async function getCrushLiveMatches(eventId?: string | null): Promise<CrushLiveMatch[]> {
  const { data, error } = await supabase.rpc('get_crush_live_matches', {
    p_event_id: eventId ?? null,
  });
  if (error) throw error;
  return (data as unknown as CrushLiveMatch[]) ?? [];
}

// Devuelve ok, si quedo reaccionado y el contador real del servidor para que la UI no quede desincronizada.
export async function reactLigarPost(postId: string): Promise<{ ok: boolean; reacted?: boolean; count?: number }> {
  const { data, error } = await supabase.rpc('react_ligar_post', { p_post_id: postId });
  if (error) return { ok: false };
  const res = data as { reacted?: boolean; reaction_count?: number } | null;
  return { ok: true, reacted: res?.reacted, count: res?.reaction_count };
}

export const getUniversity = async (id: string): Promise<University | null> => {
  const { data } = await supabase.from('universities').select('*').eq('id', id).maybeSingle();
  return (data as University) ?? null;
};

// ── Acciones autenticadas ──
type PublicationResult = {ok:true;review:'approved'|'rejected'|'pending';reason?:undefined}|{ok:false;reason:'auth'|'profile'|'db'|'opt_in'};
// Publicar en FOMO con todo lo que soporta la RPC (080): texto, media
// (imagen/audio ya subidos a fomo-media) y encuesta de 2 a 4 opciones.
export async function publishThread(opts: {
  body: string;
  anonymous: boolean;
  mediaUrl?: string | null;
  // 'video' desde la migración 132 (fomo_threads.media_type admite vídeo).
  mediaType?: 'image' | 'audio' | 'video' | null;
  pollQuestion?: string | null;
  pollOptions?: string[] | null;
}):Promise<PublicationResult> {
  const owner=captureSessionIdentity();
  if(!owner)return {ok:false,reason:'auth' as const};
  return withOwnedRequest<PublicationResult>(owner,async request=>{
  const { data: prof } = await request.query(supabase.from('profiles').select('university_id').eq('id', owner.userId)).maybeSingle();
  if (!prof?.university_id) return { ok: false, reason: 'profile' as const };
  const { data, error } = await request.query(supabase.rpc('create_fomo_thread', {
    p_university_id: prof.university_id,
    p_body: opts.body || null,
    p_media_url: opts.mediaUrl ?? null,
    p_media_type: opts.mediaType ?? null,
    p_is_anonymous: opts.anonymous,
    p_poll_question: opts.pollQuestion ?? null,
    p_poll_options: opts.pollOptions?.length ? opts.pollOptions : null,
  }));
  if(error)return {ok:false,reason:'db' as const};
  return {ok:true,reason:undefined,review:await requestPublicationReview(request,String(data))};
  });
}

// Publicar en Crush con media y anónimo opcional (092). Requiere el opt-in de
// Crush activo (set_ligar_profile); si no, la RPC falla y la UI debe llevar a
// activar el perfil.
export async function publishLigar(opts: {
  body: string;
  offer: string;
  audience: 'todos' | 'hombre' | 'mujer';
  anonymous: boolean;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'audio' | 'video' | null;
}):Promise<PublicationResult> {
  const owner=captureSessionIdentity();
  if(!owner)return {ok:false,reason:'auth' as const};
  return withOwnedRequest<PublicationResult>(owner,async request=>{
  const { data: prof } = await request.query(supabase.from('profiles').select('university_id').eq('id', owner.userId)).maybeSingle();
  if (!prof?.university_id) return { ok: false, reason: 'profile' as const };
  const { data, error } = await request.query(supabase.rpc('create_ligar_post', {
    p_body: opts.body,
    p_offer: opts.offer || null,
    p_media_url: opts.mediaUrl ?? null,
    p_media_type: opts.mediaType ?? null,
    p_audience: opts.audience,
    p_is_anonymous: opts.anonymous,
  }));
  if (error) {
    const optIn = error.message?.includes('opt') || error.message?.includes('ligar');
    return { ok: false, reason: optIn ? ('opt_in' as const) : ('db' as const) };
  }
  return { ok: true, reason: undefined,review:await requestPublicationReview(request,typeof data==='string'?data:String(data?.id)) };
  });
}

// ── Mis entradas (el QR de acceso es qr_token) ──
export async function getMyTickets(): Promise<{ rows: EventTicket[]; live: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rows: [], live: false };
  const { data, error } = await supabase
    .from('event_tickets')
    // select('*'): trae reserved_until (165) cuando existe sin romper la
    // pantalla si la migración aún no está aplicada. RLS solo devuelve las
    // entradas de esta persona.
    .select('*')
    .eq('holder_id', user.id)
    .in('status', ['valid', 'used', 'pending_payment'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  const tickets = (data ?? []) as EventTicket[];
  const eventIds = [...new Set(tickets.map((t) => t.event_id))];
  if (eventIds.length) {
    const { data: events } = await supabase
      .from('events')
      .select('id, title, start_date, venue, city, image_url')
      .in('id', eventIds);
    const byId = new Map((events ?? []).map((e) => [e.id as string, e]));
    for (const t of tickets) t.event = (byId.get(t.event_id) as EventTicket['event']) ?? null;
  }
  return { rows: tickets, live: true };
}

// Cancela una entrada reservada pero sin pagar (libera el aforo). Mismo
// endpoint web que usa /mis-entradas, con Bearer de la sesión del móvil.
export async function cancelPendingTicket(ticketId: string): Promise<{ ok: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false };
  try {
    const res = await fetchConTimeout(`${WEB_URL}/api/tickets/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ticket_id: ticketId }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// ── Camisetas del evento (164) ───────────────────────────────────────────
// En los eventos que reparten camiseta se pregunta la talla a quien participa.
// La pregunta solo tiene sentido (y solo cuenta para el organizador) si la
// persona está apuntada de verdad: inscrita en un evento gratuito o con entrada
// en uno de pago. Se comprueban las dos vías porque la talla vive en su propia
// tabla, común a las dos.
export async function getMyEventShirt(
  eventId: string,
): Promise<{ participa: boolean; size: ShirtSize | null; priceCents?: number | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { participa: false, size: null };

  const [{ data: parte }, { data: entrada }] = await Promise.all([
    supabase.from('event_participants').select('id')
      .eq('event_id', eventId).eq('user_id', user.id).eq('status', 'registered').maybeSingle(),
    supabase.from('event_tickets').select('id')
      .eq('event_id', eventId).eq('holder_id', user.id).in('status', ['valid', 'used']).limit(1).maybeSingle(),
  ]);
  const participa = !!parte || !!entrada;
  if (!participa) return { participa: false, size: null };

  const { data } = await supabase.from('event_shirt_sizes').select('size,quoted_price_cents')
    .eq('event_id', eventId).eq('user_id', user.id).maybeSingle();
  const size = (data as { size?: string } | null)?.size;
  return {
    participa,
    size: SHIRT_SIZES.includes(size as ShirtSize) ? (size as ShirtSize) : null,
    priceCents: data?.quoted_price_cents ?? null,
  };
}

export async function setMyEventShirt(eventId: string, size: ShirtSize): Promise<{ ok: boolean; priceCents?: number | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data, error } = await supabase.from('event_shirt_sizes').upsert(
    { event_id: eventId, user_id: user.id, size },
    { onConflict: 'event_id,user_id' },
  ).select('quoted_price_cents').single();
  return { ok: !error, priceCents: data?.quoted_price_cents ?? null };
}

export async function joinEvent(eventId: string, size?: ShirtSize) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'auth' as const };
  const { data, error } = size ? await supabase.rpc('register_event_shirt_option', { p_event_id: eventId, p_size: size }) : await supabase.from('event_participants')
    .upsert({ event_id: eventId, user_id: user.id, status: 'registered' }, { onConflict: 'event_id,user_id' });
  if (error) return { ok: false, reason: 'db' as const, message: error.message };
  // Mete al inscrito en el chat de grupo del evento (mejor esfuerzo: no bloquea la inscripcion).
  try { await supabase.rpc('join_event_chat', { p_event_id: eventId, p_user_id: user.id }); } catch { /* el chat puede tardar */ }
  return { ok: true, priceCents: data?.price_cents as number | undefined };
}
