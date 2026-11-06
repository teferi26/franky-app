// ─── Comunidades del campus: carrera, residencia, estudio y afición ────────
// Es UNA sola funcionalidad (mejoras 56, 66 y 85 del ciclo 2): el `kind`
// cambia la etiqueta, no el modelo. Backend: migración 138 (communities,
// community_members, community_posts + RPCs get_communities/join_community/
// leave_community/get_community_posts/create_community_post). AÚN NO aplicada
// en producción: todo aquí es fail-soft, si las tablas o RPC no existen se
// devuelven listas vacías / resultados "no ok" en vez de reventar la pantalla.
import { supabase } from './supabase';
import { isMissingBackendError } from './retry';
import { ensureCommunityTerms } from './community-terms';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';

export type CommunityKind = 'carrera' | 'residencia' | 'estudio' | 'aficion';

/**
 * Página de resultados con la verdad sobre cómo fue la petición. `ok: false`
 * significa fallo de red o de servidor (la pantalla debe enseñar error con
 * Reintentar, no "no hay nada"). Si el backend aún no tiene la tabla o la RPC
 * (migración pendiente), se devuelve `ok: true` con lista vacía: eso sí es
 * "no hay nada que enseñar".
 */
export type Page<T> = { rows: T[]; ok: boolean };
export type CommunityRole = 'admin' | 'miembro';

export const KINDS: { value: CommunityKind; label: string }[] = [
  { value: 'carrera', label: 'Carrera' },
  { value: 'residencia', label: 'Residencia' },
  { value: 'estudio', label: 'Estudio' },
  { value: 'aficion', label: 'Afición' },
];

export const kindLabel = (k: string): string => KINDS.find((x) => x.value === k)?.label ?? k;

export interface CommunitySummary {
  id: string;
  name: string;
  description: string | null;
  kind: CommunityKind;
  image_url: string | null;
  is_private: boolean;
  created_at: string;
  member_count: number;
  is_member: boolean;
}

export interface CommunityDetail extends CommunitySummary {
  created_by: string;
  is_mine: boolean;
  join_policy?: 'open' | 'request' | 'invite';
  admission_id?: string | null;
  admission_status?: string | null;
}

export interface CommunityPost {
  id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
}

export const COMMUNITIES_PAGE_SIZE = 20;
export const COMMUNITY_POSTS_PAGE_SIZE = 20;

/**
 * Listado paginado de comunidades visibles (de tu campus, o donde ya eres
 * miembro), filtrable por tipo. Si la RPC no existe todavía en prod
 * (migración 138 pendiente) devuelve lista vacía con ok:true; cualquier otro
 * fallo (red, servidor) devuelve ok:false para que la pantalla lo distinga.
 */
export async function getCommunities(opts: {
  kind?: CommunityKind | null;
  offset?: number;
  limit?: number;
} = {}): Promise<Page<CommunitySummary>> {
  try {
    const { data, error } = await supabase.rpc('get_communities', {
      p_kind: opts.kind ?? null,
      p_limit: opts.limit ?? COMMUNITIES_PAGE_SIZE,
      p_offset: opts.offset ?? 0,
    });
    if (error) return { rows: [], ok: isMissingBackendError(error) };
    const rows = ((data ?? []) as { member_count: number | string }[]).map((row) => ({
      ...row,
      member_count: Number(row.member_count) || 0,
    })) as unknown as CommunitySummary[];
    return { rows, ok: true };
  } catch (err) {
    return { rows: [], ok: isMissingBackendError(err) };
  }
}

/**
 * Ficha de una comunidad por id. No hay RPC de detalle (la 138 solo trae el
 * listado): se lee la tabla directamente (su RLS de SELECT ya filtra por
 * campus/privacidad) y se completa la membresía propia con una segunda
 * consulta liviana.
 *
 * OJO con member_count: la RLS de community_members solo deja ver tus propias
 * filas si no eres miembro de la comunidad, así que el recuento exacto solo
 * es fiable cuando ya perteneces a ella. Para quien todavía no se ha unido
 * puede salir por debajo del real; es una limitación conocida del modelo
 * (no hay una RPC de detalle que lo calcule con SECURITY DEFINER).
 */
export async function getCommunity(id: string): Promise<CommunityDetail | null> {
  try {
    const owner = captureSessionIdentity();
    if (!owner) return null;
    const admission = await withOwnedRequest(owner, async request => await request.query(supabase.rpc('get_community_admission', { p_id: id })));
    if (!isCurrentSessionIdentity(owner)) return null;
    if (!admission.error) return admission.data as CommunityDetail;
    if (!isMissingBackendError(admission.error)) return null;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('communities')
      .select('id, name, description, kind, image_url, is_private, created_at, created_by')
      .eq('id', id)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as {
      id: string; name: string; description: string | null; kind: string;
      image_url: string | null; is_private: boolean; created_at: string; created_by: string;
    };

    let isMember = false;
    try {
      const { data: mem } = await supabase
        .from('community_members')
        .select('user_id')
        .eq('community_id', id)
        .eq('user_id', user?.id ?? '')
        .maybeSingle();
      isMember = !!mem;
    } catch { /* sin membresía conocida: se trata como no-miembro */ }

    let memberCount = 0;
    try {
      const { count } = await supabase
        .from('community_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('community_id', id);
      memberCount = count ?? 0;
    } catch { /* recuento no disponible: se muestra 0 */ }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      kind: row.kind as CommunityKind,
      image_url: row.image_url,
      is_private: row.is_private,
      created_at: row.created_at,
      created_by: row.created_by,
      member_count: memberCount,
      is_member: isMember,
      is_mine: !!user && user.id === row.created_by,
    };
  } catch {
    return null;
  }
}

/** Une al usuario actual a una comunidad pública (join_community). */
export async function joinCommunity(id: string): Promise<{ ok: boolean; message?: string; requested?: boolean }> {
  try {
    const owner = captureSessionIdentity();
    if (!owner) return { ok: false, message: 'Inicia sesión para continuar.' };
    const result = await withOwnedRequest(owner, async request => {
      const current = await request.query(supabase.rpc('get_community_admission', { p_id: id }));
      if (current.error && !isMissingBackendError(current.error)) throw current.error;
      const state = current.data as CommunityDetail | null;
      const requested = state?.join_policy === 'request' && state?.admission_status !== 'invited';
      const response = state?.admission_status === 'invited' && state.admission_id
        ? await request.query(supabase.rpc('respond_community_invitation', { p_id: state.admission_id, p_accept: true }))
        : await request.query(supabase.rpc(requested ? 'request_community_admission' : 'join_community', { p_id: id }));
      return { ...response, requested };
    });
    if (!isCurrentSessionIdentity(owner)) return { ok: false, message: 'La cuenta ha cambiado. Vuelve a abrir la comunidad.' };
    const { error } = result;
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('community_is_private') || msg.includes('community_invitation_required')) {
        return { ok: false, message: 'Esta comunidad es privada: necesitas una invitación.' };
      }
      if (msg.includes('community_not_found')) {
        return { ok: false, message: 'Esta comunidad ya no existe.' };
      }
      if (msg.includes('community_request_cooldown')) return { ok: false, message: 'La solicitud anterior fue rechazada. Podrás volver a solicitar acceso cuando hayan pasado siete días.' };
      return { ok: false, message: 'No se pudo unir. Inténtalo de nuevo en unos segundos.' };
    }
    return { ok: true, requested: result.requested };
  } catch {
    return { ok: false, message: 'Sin conexión al intentar unirte.' };
  }
}

export type CommunityInvitation = { id: string; community_id: string; name: string; expires_at: string };
export async function getCommunityInvitations(): Promise<CommunityInvitation[]> {
  const owner = captureSessionIdentity(); if (!owner) return [];
  const { data, error } = await withOwnedRequest(owner, async request => await request.query(supabase.rpc('list_my_community_invitations')));
  if (error && !isMissingBackendError(error)) throw error;
  return isCurrentSessionIdentity(owner) && !error ? (data ?? []) as CommunityInvitation[] : [];
}

export async function declineCommunityInvitation(id: string): Promise<boolean> {
  const owner = captureSessionIdentity(); if (!owner) return false;
  try {
    const { error } = await withOwnedRequest(owner, async request => await request.query(supabase.rpc('respond_community_invitation', { p_id: id, p_accept: false })));
    return !error && isCurrentSessionIdentity(owner);
  } catch { return false; }
}

/** Saca al usuario actual de una comunidad (leave_community). */
export async function leaveCommunity(id: string): Promise<{ ok: boolean }> {
  try {
    const owner = captureSessionIdentity(); if (!owner) return { ok: false };
    const { error } = await withOwnedRequest(owner, async request => await request.query(supabase.rpc('leave_community', { p_id: id })));
    return { ok: !error && isCurrentSessionIdentity(owner) };
  } catch {
    return { ok: false };
  }
}

/**
 * Muro paginado de una comunidad. Lista vacía (ok:true) si la RPC no existe
 * todavía; ok:false si la petición falló por red o servidor. Que el usuario
 * no pueda ver el muro (no es miembro de una privada) llega como lista vacía
 * sin error, y así se queda.
 */
export async function getCommunityPosts(communityId: string, opts: {
  offset?: number;
  limit?: number;
} = {}): Promise<Page<CommunityPost>> {
  try {
    const { data, error } = await supabase.rpc('get_community_posts', {
      p_community: communityId,
      p_limit: opts.limit ?? COMMUNITY_POSTS_PAGE_SIZE,
      p_offset: opts.offset ?? 0,
    });
    if (error) return { rows: [], ok: isMissingBackendError(error) };
    return { rows: (data ?? []) as CommunityPost[], ok: true };
  } catch (err) {
    return { rows: [], ok: isMissingBackendError(err) };
  }
}

/** Publica en el muro de una comunidad. Solo los miembros pueden hacerlo. */
export async function createCommunityPost(
  communityId: string,
  body: string | null,
  imageUrl: string | null,
): Promise<{ ok: boolean; id?: string; message?: string }> {
  const owner = captureSessionIdentity();
  try {
    if (!await ensureCommunityTerms() || !owner || !isCurrentSessionIdentity(owner)) return { ok: false, message: 'Acepta las normas antes de publicar.' };
    const { data, error } = await withOwnedRequest(owner, async request => await request.query(supabase.rpc('create_community_post', {
      p_community: communityId,
      p_body: body?.trim() || null,
      p_image_url: imageUrl,
    })));
    if (error || !data) {
      const msg = error?.message ?? '';
      if (msg.includes('not_a_member')) {
        return { ok: false, message: 'Únete a la comunidad para poder publicar.' };
      }
      if (msg.includes('empty_post')) {
        return { ok: false, message: 'Escribe algo o añade una foto.' };
      }
      return { ok: false, message: 'No se pudo publicar. Inténtalo de nuevo en unos segundos.' };
    }
    return { ok: true, id: data as string };
  } catch {
    return { ok: false, message: 'Sin conexión al publicar.' };
  }
}

export type CreateCommunityInput = {
  name: string;
  description?: string | null;
  kind: CommunityKind;
  image_url?: string | null;
  is_private: boolean;
};

/**
 * Crea una comunidad nueva. La universidad se hereda sola del creador (trigger
 * de la migración 138) y el creador entra automáticamente como admin.
 */
export async function createCommunity(input: CreateCommunityInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  const owner = captureSessionIdentity();
  try {
    if (!await ensureCommunityTerms() || !owner || !isCurrentSessionIdentity(owner)) return { ok: false, message: 'Acepta las normas antes de crear una comunidad.' };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: 'Necesitas una cuenta para crear una comunidad.' };
    const name = input.name.trim();
    if (name.length < 3) return { ok: false, message: 'El nombre debe tener al menos 3 letras.' };

    const { data, error } = await withOwnedRequest(owner, async request => await request.query(supabase
      .from('communities')
      .insert({
        created_by: user.id,
        name,
        description: input.description?.trim() || null,
        kind: input.kind,
        image_url: input.image_url ?? null,
        is_private: input.is_private,
      })
      .select('id')).single());
    if (error || !data) return { ok: false, message: 'No se pudo crear la comunidad. Inténtalo de nuevo en unos segundos.' };
    return { ok: true, id: (data as { id: string }).id };
  } catch {
    return { ok: false, message: 'Sin conexión al crear la comunidad.' };
  }
}

export type UpdateCommunityInput = {
  name: string;
  description?: string | null;
  kind: CommunityKind;
  image_url?: string | null;
  is_private: boolean;
};

/**
 * Edita una comunidad propia (foto, nombre, tipo, descripción, privacidad).
 * La RLS ya lo permitía desde la 138 ("communities_owner_update": created_by =
 * auth.uid()), pero no había pantalla en ningún sitio (ni móvil ni web), así
 * que una vez creada la comunidad su foto era para siempre.
 *
 * Se pide `.select('id')`: un UPDATE sin él devuelve ok aunque la RLS no haya
 * dejado tocar ninguna fila, y el usuario se creería que ha guardado.
 */
export async function updateCommunity(
  id: string,
  input: UpdateCommunityInput,
): Promise<{ ok: boolean; message?: string }> {
  const owner = captureSessionIdentity();
  try {
    if (!await ensureCommunityTerms() || !owner || !isCurrentSessionIdentity(owner)) return { ok: false, message: 'Acepta las normas antes de guardar.' };
    const name = input.name.trim();
    if (name.length < 3) return { ok: false, message: 'El nombre debe tener al menos 3 letras.' };
    const { data, error } = await withOwnedRequest(owner, async request => await request.query(supabase
      .from('communities')
      .update({
        name,
        description: input.description?.trim() || null,
        kind: input.kind,
        image_url: input.image_url ?? null,
        is_private: input.is_private,
      })
      .eq('id', id)
      .select('id')));
    if (error || !data?.length) {
      return {
        ok: false,
        message: error?.message ?? 'No se guardó nada. Comprueba que la comunidad sigue siendo tuya.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Sin conexión al guardar los cambios.' };
  }
}
