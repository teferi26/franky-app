// ─── Compra-venta entre estudiantes y tablón busco/ofrezco (mejoras 84 y 86) ──
// Backend: migración 137 (student_listings + RPC get_student_listings /
// delete_student_listing). AÚN NO aplicada en producción: todo aquí es
// fail-soft, si la tabla o las RPC no existen se devuelven listas vacías /
// resultados "no ok" en vez de reventar la pantalla.
import { supabase } from './supabase';
import { isMissingBackendError } from './retry';

export type ListingKind = 'venta' | 'busco' | 'ofrezco';

/**
 * Página de resultados con la verdad sobre cómo fue la petición: ok:false es
 * fallo de red o servidor (la pantalla enseña error con Reintentar), ok:true
 * con lista vacía es "de verdad no hay anuncios" (o la migración 137 aún no
 * está en ese entorno, que para el usuario es lo mismo).
 */
export type Page<T> = { rows: T[]; ok: boolean };
export type ListingCategory = 'libros' | 'muebles' | 'transporte' | 'clases' | 'vivienda' | 'otros';
export type ListingStatus = 'activo' | 'reservado' | 'cerrado';

export const KINDS: { value: ListingKind; label: string }[] = [
  { value: 'venta', label: 'Vendo' },
  { value: 'busco', label: 'Busco' },
  { value: 'ofrezco', label: 'Ofrezco' },
];

export const CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: 'libros', label: 'Libros' },
  { value: 'muebles', label: 'Muebles' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'clases', label: 'Clases' },
  { value: 'vivienda', label: 'Vivienda' },
  { value: 'otros', label: 'Otros' },
];

export const kindLabel = (k: string): string => KINDS.find(x => x.value === k)?.label ?? k;
export const categoryLabel = (c: string): string => CATEGORIES.find(x => x.value === c)?.label ?? c;

export interface StudentListing {
  id: string;
  kind: ListingKind;
  category: string;
  title: string;
  body: string | null;
  price_cents: number | null;
  image_url: string | null;
  city: string | null;
  status: ListingStatus;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
}

const PAGE_SIZE = 20;

/**
 * Listado paginado del campus, filtrable por tipo y categoría. Si la RPC (o
 * la tabla que envuelve) todavía no existe en prod devuelve lista vacía con
 * ok:true; un fallo de red o servidor devuelve ok:false en vez de disfrazarse
 * de "no hay anuncios".
 */
export async function getStudentListings(opts: {
  kind?: ListingKind | null;
  category?: ListingCategory | null;
  offset?: number;
  limit?: number;
} = {}): Promise<Page<StudentListing>> {
  try {
    const { data, error } = await supabase.rpc('get_student_listings', {
      p_kind: opts.kind ?? null,
      p_category: opts.category ?? null,
      p_limit: opts.limit ?? PAGE_SIZE,
      p_offset: opts.offset ?? 0,
    });
    if (error) return { rows: [], ok: isMissingBackendError(error) };
    return { rows: (data ?? []) as StudentListing[], ok: true };
  } catch (err) {
    return { rows: [], ok: isMissingBackendError(err) };
  }
}

export { PAGE_SIZE as STUDENT_LISTINGS_PAGE_SIZE };

/**
 * Ficha de un anuncio por id. No hay RPC de detalle (137 solo trae el
 * listado): se lee la tabla directamente (su RLS de SELECT ya filtra por
 * campus/autor) y se completan los datos del autor desde public_profiles
 * (vista sin PII, legible por cualquier autenticado).
 */
export async function getStudentListing(id: string): Promise<StudentListing | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('student_listings')
      .select('id, kind, category, title, body, price_cents, image_url, city, status, created_at, author_id')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error || !data) return null;

    let author_name: string | null = null;
    let author_avatar: string | null = null;
    try {
      const { data: prof } = await supabase
        .from('public_profiles')
        .select('full_name, avatar_url')
        .eq('id', data.author_id)
        .maybeSingle();
      author_name = (prof as { full_name?: string | null } | null)?.full_name ?? null;
      author_avatar = (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null;
    } catch { /* sin datos del autor: se muestra "Estudiante" */ }

    return {
      ...(data as Omit<StudentListing, 'author_name' | 'author_avatar' | 'is_mine'>),
      author_name,
      author_avatar,
      is_mine: !!user && user.id === data.author_id,
    };
  } catch {
    return null;
  }
}

export type CreateListingInput = {
  kind: ListingKind;
  category: ListingCategory;
  title: string;
  body?: string | null;
  price_cents?: number | null;
  image_url?: string | null;
  city?: string | null;
};

/**
 * Publica un anuncio nuevo. La universidad se hereda sola del autor por
 * trigger (no hace falta mandarla). Fail-soft: si la tabla aún no existe en
 * prod, devuelve ok:false con un mensaje en vez de lanzar.
 */
export async function createStudentListing(input: CreateListingInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Necesitas una cuenta para publicar.' };
    const { data, error } = await supabase
      .from('student_listings')
      .insert({
        author_id: user.id,
        kind: input.kind,
        category: input.category,
        title: input.title.trim(),
        body: input.body?.trim() || null,
        price_cents: input.price_cents ?? null,
        image_url: input.image_url ?? null,
        city: input.city?.trim() || null,
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false, message: 'No se pudo publicar. Inténtalo de nuevo en unos segundos.' };
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    return { ok: false, message: 'Sin conexión al publicar el anuncio.' };
  }
}

/** Borrado lógico de un anuncio propio (RPC delete_student_listing). */
export async function deleteStudentListing(id: string): Promise<{ ok: boolean }> {
  try {
    const { error } = await supabase.rpc('delete_student_listing', { p_id: id });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
