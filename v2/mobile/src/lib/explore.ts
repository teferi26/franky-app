// ─── Datos ligeros para La Lupa (Explorar) ────────────────────────────────
// El "Para ti" mezcla como mucho 60 tarjetas, de las que unas 12 son sitios de
// ocio, y solo necesita el nombre corto de las universidades para rotular
// publicaciones y perfiles. Antes descargaba 500 zonas con todas sus columnas
// (descripción, detalles, fuentes...) y las 200 universidades completas.
import { supabase } from '@/lib/supabase';
import type { LeisureSpot } from '@/lib/types';

export type ExploreSpot = Pick<LeisureSpot, 'id' | 'name' | 'city' | 'category' | 'rating' | 'image_url'> & {
  owner_id?: string | null;
};

const SPOT_COLUMNS = 'id, name, city, category, rating, image_url, owner_id';

/**
 * Locales con negocio detrás (primero) y las zonas mejor valoradas, con las
 * columnas justas de la tarjeta. Mismo criterio de visibilidad que el
 * catálogo: verificada y pagada.
 */
export async function getExploreSpots(): Promise<{ rows: ExploreSpot[]; live: boolean }> {
  const base = () => supabase.from('leisure_spots').select(SPOT_COLUMNS)
    .eq('is_verified', true).eq('is_paid', true);
  const [negocios, catalogo] = await Promise.all([
    base().not('owner_id', 'is', null).order('rating', { ascending: false, nullsFirst: false }).limit(20),
    base().order('rating', { ascending: false, nullsFirst: false }).limit(40),
  ]);
  if (negocios.error && catalogo.error) throw catalogo.error;
  const byId = new Map<string, ExploreSpot>();
  for (const row of [...(negocios.data ?? []), ...(catalogo.data ?? [])] as ExploreSpot[]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return { rows: [...byId.values()], live: true };
}

export type UniversityName = { id: string; name: string; short_name: string | null };

/** Nombre y siglas de las universidades, sin el resto de la ficha. */
export async function getUniversityNames(): Promise<{ rows: UniversityName[]; live: boolean }> {
  const { data, error } = await supabase.from('universities')
    .select('id, name, short_name').order('name').limit(200);
  if (error) throw error;
  return { rows: (data ?? []) as UniversityName[], live: true };
}
