import { createPublicSupabase } from "@/lib/supabase-server";

/**
 * Resuelve el parámetro de /carreras/[id], que ahora acepta DOS formas:
 *   * el slug legible (medicina-universidad-de-alicante) — la forma canónica;
 *   * el UUID antiguo — para no romper enlaces, carteles y QR ya impresos.
 *
 * Detecta cuál es por su forma (un UUID tiene el patrón fijo con guiones y
 * hex) y devuelve además el slug canónico, para que la página redirija el UUID
 * a la URL bonita con un 301 y consolide la autoridad en una sola URL.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Devuelve el slug canónico de una carrera a partir de su UUID, o null. */
export async function slugForCareerId(id: string): Promise<string | null> {
  if (!looksLikeUuid(id)) return null;
  const supabase = createPublicSupabase();
  const { data } = await supabase
    .from("careers")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return data?.slug ?? null;
}

/**
 * Cláusula de filtro para buscar una carrera por slug O por id, según la forma
 * del parámetro. Se usa como `query.eq(column, value)`.
 */
export function careerMatch(idOrSlug: string): { column: "id" | "slug"; value: string } {
  return looksLikeUuid(idOrSlug)
    ? { column: "id", value: idOrSlug }
    : { column: "slug", value: idOrSlug };
}
