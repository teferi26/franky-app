// ─── Capa de datos de Crush (ligar): descubrir, peticiones, matches, invitar ──
// Vive aparte de lib/api.ts a propósito: api.ts lo edita otra persona y aquí
// solo entran las RPC del intercambio de Instagram (migraciones 083, 084, 096,
// 100). Todo es fail-soft: nunca se lanza, se devuelve `{ ok }` o una lista
// vacía con `error: true` para que la pantalla decida qué enseñar.
//
// Firmas verificadas contra supabase/migrations:
//   request_ig(p_target uuid) -> jsonb { matched, instagram_handle }        (100)
//   get_ig_incoming_requests(p_limit int = 50) -> setof jsonb                (100)
//   get_ig_pending_count() -> int                                             (083)
//   get_ig_candidates(p_limit int = 20) -> setof jsonb                       (096)
//   get_ig_matches() -> setof jsonb                                           (096)
//   report_ig(p_target uuid, p_reason text = null) -> void                    (096)
//   get_ligar_nominatable() -> setof jsonb                                    (084)
//   nominate_friend(p_nominee uuid) -> jsonb { ok }                           (084)
//   get_ligar_nomination_count() -> int                                       (084)
import { supabase } from './supabase';
import { startDirectChat } from './chat';

// ─── Tipos ──────────────────────────────────────────────────────────────────

/** Persona que se puede descubrir (get_ig_candidates). */
export interface IgCandidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  verified: boolean;
}

/** Alguien que te ha pedido el Instagram y aún no has correspondido. */
export interface IgIncomingRequest extends IgCandidate {
  requested_at: string;
}

/** Match confirmado: las dos partes se pidieron el Instagram. */
export interface IgMatch {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  instagram_handle: string | null;
  verified: boolean;
  matched_at: string;
}

/** Contacto de chat al que se puede invitar a Crush (get_ligar_nominatable). */
export interface NominatableContact {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

/** Resultado de pedir el Instagram a alguien. `instagram` solo llega si hay match. */
export interface RequestIgResult {
  ok: boolean;
  matched?: boolean;
  instagram?: string | null;
  /** Mensaje ya en español para enseñar tal cual si `ok` es false. */
  message?: string;
}

/** Lo mínimo de mi perfil para pintar el momento MATCH (mi avatar junto al suyo). */
export interface CrushIdentity {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

type ListResult<T> = { rows: T[]; error: boolean };

// ─── Helpers ────────────────────────────────────────────────────────────────

// Las RPC lanzan sus errores en español (RAISE EXCEPTION '...'); aquí se
// traducen a frases completas para la UI y se cubre el caso de red.
function humanizeRpcError(raw: string | undefined, fallback: string): string {
  const msg = raw ?? '';
  if (msg.includes('Activa Crush') || msg.includes('Activa ligar')) return 'Activa Crush primero para poder hacer esto.';
  if (msg.includes('no participa')) return 'Esa persona ya no participa en Crush.';
  if (msg.includes('ti mismo')) return 'No puedes hacer eso contigo.';
  if (msg.includes('mayores de 18')) return 'Solo puedes invitar a mayores de 18.';
  if (msg.includes('ya participa')) return 'Esa persona ya está en Crush.';
  if (msg.includes('demasiada gente')) return 'Has invitado a demasiada gente hoy. Inténtalo mañana.';
  if (msg.includes('No puedes invitar')) return 'No puedes invitar a esta persona.';
  if (msg.includes('hecho match')) return 'Solo puedes denunciar un Instagram con el que has hecho match.';
  if (msg.includes('auth required')) return 'Inicia sesión para continuar.';
  return fallback;
}

async function rpcList<T>(name: string, args?: Record<string, unknown>): Promise<ListResult<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { rows: [], error: true };
    return { rows: ((data as unknown) as T[]) ?? [], error: false };
  } catch {
    return { rows: [], error: true };
  }
}

async function rpcCount(name: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc(name);
    if (error || typeof data !== 'number') return 0;
    return data;
  } catch {
    return 0;
  }
}

// ─── Contadores ─────────────────────────────────────────────────────────────

/** Cuántas personas te han pedido el Instagram y aún no has aceptado (badge). */
export const getCrushPendingCount = (): Promise<number> => rpcCount('get_ig_pending_count');

/** Cuántos amigos te han invitado a Crush y aún no has entrado (gancho de activación). */
export const getCrushNominationCount = (): Promise<number> => rpcCount('get_ligar_nomination_count');

// ─── Descubrir y peticiones ─────────────────────────────────────────────────

/** Perfiles de tu universidad a los que aún no has pedido el Instagram (aleatorio, máx. 50). */
export const getIgCandidates = (limit = 20): Promise<ListResult<IgCandidate>> =>
  rpcList<IgCandidate>('get_ig_candidates', { p_limit: limit });

/** Gente que te ha pedido el Instagram y espera tu respuesta (máx. 100). */
export const getIgIncomingRequests = (limit = 100): Promise<ListResult<IgIncomingRequest>> =>
  rpcList<IgIncomingRequest>('get_ig_incoming_requests', { p_limit: limit });

/** Matches confirmados, del más reciente al más antiguo. */
export const getIgMatches = (): Promise<ListResult<IgMatch>> => rpcList<IgMatch>('get_ig_matches');

/**
 * Pedir el Instagram a una persona por id (Descubrir) o aceptar su petición
 * (Peticiones): es la misma RPC. Si esa persona ya te lo había pedido, hay
 * match y `instagram` trae su @.
 */
export async function requestIg(targetId: string): Promise<RequestIgResult> {
  try {
    const { data, error } = await supabase.rpc('request_ig', { p_target: targetId });
    if (error) {
      return { ok: false, message: humanizeRpcError(error.message, 'No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo.') };
    }
    const res = data as { matched?: boolean; instagram_handle?: string | null } | null;
    return { ok: true, matched: !!res?.matched, instagram: res?.instagram_handle ?? null };
  } catch {
    return { ok: false, message: 'No se pudo enviar. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

/**
 * Denunciar el Instagram de alguien con quien has hecho match (falso, no es
 * esa persona...). A los 3 reportes distintos el servidor lo pone en cuarentena.
 */
export async function reportIgUser(targetId: string, reason?: string | null): Promise<{ ok: boolean; message?: string }> {
  try {
    const { error } = await supabase.rpc('report_ig', { p_target: targetId, p_reason: reason ?? null });
    if (error) return { ok: false, message: humanizeRpcError(error.message, 'No se pudo enviar la denuncia. Inténtalo de nuevo en unos segundos.') };
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo enviar la denuncia. Inténtalo de nuevo en unos segundos.' };
  }
}

// ─── Invitar amigos ─────────────────────────────────────────────────────────

/** Contactos de chat 1:1 (mayores de 18, aún fuera de Crush, sin invitar todavía). */
export const getNominatableContacts = (): Promise<ListResult<NominatableContact>> =>
  rpcList<NominatableContact>('get_ligar_nominatable');

/** Invitar a un contacto. Le llega una notificación anónima; no se le activa nada. */
export async function nominateFriend(nomineeId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const { error } = await supabase.rpc('nominate_friend', { p_nominee: nomineeId });
    if (error) return { ok: false, message: humanizeRpcError(error.message, 'No se pudo enviar la invitación. Inténtalo de nuevo.') };
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo enviar la invitación. Inténtalo de nuevo.' };
  }
}

// ─── Identidad y chat ───────────────────────────────────────────────────────

/** Mi nombre y avatar, para el momento MATCH. null si no hay sesión o falla. */
/** Como getMyCrushIdentity, con el id ya conocido: sin auth.getUser (red + candado). */
export async function getCrushIdentityFor(userId: string): Promise<CrushIdentity | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return { id: userId, full_name: null, avatar_url: null };
    return data as CrushIdentity;
  } catch {
    return null;
  }
}

export async function getMyCrushIdentity(): Promise<CrushIdentity | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (error || !data) return { id: user.id, full_name: null, avatar_url: null };
    return data as CrushIdentity;
  } catch {
    return null;
  }
}

/** Abre (o recupera) el chat 1:1 con un match. Devuelve el id de conversación o null. */
export const openCrushChat = (userId: string): Promise<string | null> => startDirectChat(userId);
