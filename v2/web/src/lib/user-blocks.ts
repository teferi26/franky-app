// ─── Bloqueos entre usuarios (tabla user_blocks, migración 017) ──────────
// Helpers compartidos por la lista de bloqueados (/perfil/bloqueados) y el
// botón de bloquear del perfil ajeno (/perfil/[id]). La tabla no tiene RPC:
// se opera con INSERT/DELETE/SELECT directos y la RLS "Users manage own
// blocks" (blocker_id = auth.uid()) hace de guardia. Todo lo que dependa de
// bloqueos (get_my_chats, feeds sociales, Crush Live) ya mira esta tabla en
// el backend, así que aquí no hace falta tocar nada más.

import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockedProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

/** ¿Tengo bloqueado a `targetId`? Fail-soft: cualquier error cuenta como no. */
export async function isBlockedByMe(
  supabase: SupabaseClient,
  myId: string,
  targetId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", myId)
    .eq("blocked_id", targetId)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * Bloquea a `targetId`. Un 23505 (ya estaba bloqueado) se trata como éxito:
 * el estado final es el que el usuario quería.
 */
export async function blockUser(
  supabase: SupabaseClient,
  myId: string,
  targetId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: myId, blocked_id: targetId });
  return !error || error.code === "23505";
}

export async function unblockUser(
  supabase: SupabaseClient,
  myId: string,
  targetId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", myId)
    .eq("blocked_id", targetId);
  return !error;
}

/**
 * Lista mis bloqueados con nombre y foto, del más reciente al más antiguo.
 * Lanza si el SELECT a user_blocks falla; quien llama decide qué enseñar.
 */
export async function listBlockedProfiles(
  supabase: SupabaseClient,
  myId: string
): Promise<BlockedProfile[]> {
  // 1. Filas propias (la RLS ya filtra por blocker_id = auth.uid()).
  const { data: blocks, error } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", myId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (blocks ?? []).map((b) => b.blocked_id as string);
  if (ids.length === 0) return [];

  // 2. Nombre y foto desde la vista pública (legible por autenticados).
  const { data: profs } = await supabase
    .from("public_profiles")
    .select("id, full_name, avatar_url")
    .in("id", ids);
  const byId = new Map((profs ?? []).map((p) => [p.id as string, p as BlockedProfile]));
  // Conservamos el orden de bloqueo y no perdemos a nadie aunque su perfil
  // no resuelva (cuenta borrada, por ejemplo).
  return ids.map((id) => byId.get(id) ?? { id, full_name: null, avatar_url: null });
}
