// ─── Grafo social (follows) + stories 24h (migración 123) ────────────────
// Todo es fail-soft: si la migración aún no está aplicada en prod, las
// funciones devuelven valores vacíos y la UI enseña 0/— sin romperse.
import { supabase, WEB_URL, fetchConTimeout, UPLOAD_TIMEOUT_MS } from './supabase';
import { captureError } from './monitoring';
import { captureSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { ensureCommunityTerms } from './community-terms';
import { uploadPrivateSocialFile } from './social-media-upload';
import { requestPublicationReview } from './publication-review';

export type SocialCounts = { posts: number; followers: number; following: number };

/** Actividad del propio perfil: visitas y nuevos seguidores (migración 134). */
export type ProfileActivity = { views: number; newFollowers: number };

export type Story = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
  author?: { full_name: string | null; avatar_url: string | null } | null;
};

/** Grupo de stories activas de un autor, para la barra del feed. */
export type StoryGroup = {
  authorId: string;
  name: string | null;
  avatarUrl: string | null;
  isMine: boolean;
  stories: Story[];
};

/** Perfil básico de quien vio una story (avatar + nombre). */
export type StoryViewer = { id: string; full_name: string | null; avatar_url: string | null };

/** Copia persistente de una story (las stories caducan; las destacadas no). */
export type Highlight = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  caption: string | null;
  created_at: string;
};

export async function getSocialCounts(userId: string): Promise<SocialCounts> {
  try {
    const { data, error } = await supabase.rpc('get_social_counts', { p_user: userId });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      return {
        posts: Number(row?.posts ?? 0),
        followers: Number(row?.followers ?? 0),
        following: Number(row?.following ?? 0),
      };
    }
  } catch { /* sin RPC: caemos al conteo directo */ }
  // Fallback sin RPC (la sección 4 de la migración 123 no llegó a aplicarse en
  // prod por el fallo de storage): tres counts head-only contra las tablas.
  try {
    const [p, fw, fg] = await Promise.all([
      supabase.from('fomo_threads').select('id', { head: true, count: 'exact' })
        .eq('author_id', userId).eq('is_anonymous', false).eq('is_deleted', false).eq('is_hidden', false),
      supabase.from('follows').select('follower_id', { head: true, count: 'exact' }).eq('followee_id', userId),
      supabase.from('follows').select('followee_id', { head: true, count: 'exact' }).eq('follower_id', userId),
    ]);
    return { posts: p.count ?? 0, followers: fw.count ?? 0, following: fg.count ?? 0 };
  } catch {
    return { posts: 0, followers: 0, following: 0 };
  }
}

// 65: helper fail-soft para el badge de estudiante verificado. Devuelve false
// si el campo no viene (columna no expuesta todavía, perfil parcial, etc.),
// nunca lanza ni "adivina" true por accidente.
export function isVerifiedStudent(value: unknown): boolean {
  return value === true;
}

/**
 * 19/70: visitas al perfil y nuevos seguidores en los últimos `days` días
 * (RPC get_profile_activity, migración 134). Fail-soft: 0/0 si la RPC aún no
 * existe en producción o si falla por cualquier motivo.
 */
export async function getProfileActivity(days: number = 7): Promise<ProfileActivity> {
  try {
    const { data, error } = await supabase.rpc('get_profile_activity', { p_days: days });
    if (error || !data) return { views: 0, newFollowers: 0 };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      views: Number(row?.views ?? 0),
      newFollowers: Number(row?.new_followers ?? 0),
    };
  } catch {
    return { views: 0, newFollowers: 0 };
  }
}

/** ¿`followerId` sigue a `followeeId`? Sin auth.getUser: el id ya se conoce. */
export async function isFollowingAs(followerId: string | null | undefined, followeeId: string): Promise<boolean> {
  if (!followerId) return false;
  try {
    const { data } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', followerId)
      .eq('followee_id', followeeId)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function isFollowing(followeeId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from('follows')
      .select('followee_id')
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

/** Devuelve el nuevo estado (true = ahora le sigues). */
export async function toggleFollow(followeeId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Necesitas iniciar sesión.');
  const already = await isFollowing(followeeId);
  if (already) {
    await supabase.from('follows').delete()
      .eq('follower_id', user.id).eq('followee_id', followeeId);
    return false;
  }
  const { error } = await supabase.from('follows')
    .insert({ follower_id: user.id, followee_id: followeeId });
  // 23505 = ya le seguías (doble toque, o carrera con isFollowing). Es el
  // estado que queríamos, así que se da por bueno en vez de enseñar un error.
  if (error && error.code !== '23505') {
    // El error crudo se registra y se añade al mensaje: antes se tiraba a la
    // basura y se sustituía por un texto genérico, así que cuando esto se rompió
    // de verdad (política RLS de la 123, arreglada en la 156) no había forma de
    // saber por qué desde el móvil.
    captureError(error, { where: 'social.toggleFollow', followeeId });
    const detalle = [error.code, error.message].filter(Boolean).join(' · ');
    throw new Error(`No se pudo seguir a esta persona.${detalle ? ` (${detalle})` : ''}`);
  }
  return true;
}

/** Lista de seguidores o seguidos de un usuario, con su perfil básico. */
export async function listFollowLinks(
  userId: string,
  kind: 'followers' | 'following'
): Promise<{ id: string; full_name: string | null; avatar_url: string | null }[]> {
  try {
    const me = kind === 'followers' ? 'followee_id' : 'follower_id';
    const other = kind === 'followers' ? 'follower_id' : 'followee_id';
    const { data, error } = await supabase
      .from('follows').select(other).eq(me, userId).limit(200);
    if (error || !data?.length) return [];
    const ids = (data as unknown as Record<string, string>[]).map((r) => r[other]);
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar_url')
      .in('id', ids);
    return profiles ?? [];
  } catch {
    return [];
  }
}

/**
 * 61: seguidores en común con una lista de candidatos. Para cada id de
 * `candidateIds`, cuenta cuántas de las personas a las que YO sigo también
 * siguen a ese candidato. Se usa para ordenar y explicar las sugerencias de
 * "a quién seguir" en la Lupa. Fail-soft: mapa vacío si falla la consulta o
 * si no hay sesión.
 */
export async function getMutualFollowerCounts(candidateIds: string[]): Promise<Map<string, number>> {
  const empty = new Map<string, number>();
  if (!candidateIds.length) return empty;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return empty;
    // A quién sigo yo: el universo de "seguidores en común" posibles.
    const { data: myFollowingRows } = await supabase
      .from('follows').select('followee_id').eq('follower_id', user.id).limit(2000);
    const myFollowing = (myFollowingRows ?? []).map((r) => r.followee_id as string);
    if (!myFollowing.length) return empty;
    // De esa gente que sigo, quiénes siguen a cada candidato.
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id, followee_id')
      .in('followee_id', candidateIds)
      .in('follower_id', myFollowing)
      .limit(5000);
    if (error || !data) return empty;
    const counts = new Map<string, number>();
    for (const row of data as { follower_id: string; followee_id: string }[]) {
      counts.set(row.followee_id, (counts.get(row.followee_id) ?? 0) + 1);
    }
    return counts;
  } catch {
    return empty;
  }
}

// ─── Stories ───────────────────────────────────────────────────────────────

/** Stories activas: las mías + las de la gente a la que sigo, agrupadas por autor. */
export async function getActiveStories(): Promise<StoryGroup[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    return await getActiveStoriesFor(user.id);
  } catch {
    return [];
  }
}

/**
 * Igual que getActiveStories, pero con el id de la cuenta ya conocido (la
 * identidad de sesión en memoria). Se ahorra auth.getUser, que va a la red y
 * retiene el candado de auth: mientras dura, TODAS las consultas esperan.
 */
export async function getActiveStoriesFor(userId: string): Promise<StoryGroup[]> {
  const user = { id: userId };
  try {
    const { data: follows } = await supabase
      .from('follows').select('followee_id').eq('follower_id', user.id).limit(500);
    const authorIds = [user.id, ...(follows ?? []).map((f) => f.followee_id)];

    const { data, error } = await supabase
      .from('stories')
      .select('id, author_id, media_url, media_type, caption, created_at, expires_at')
      .in('author_id', authorIds)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(200);
    if (error || !data?.length) return [];

    // Perfiles de los autores con story activa (la vista pública ya filtra descartados).
    const uniqueAuthors = [...new Set(data.map((s) => s.author_id))];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar_url')
      .in('id', uniqueAuthors);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    const groups = new Map<string, StoryGroup>();
    for (const s of data) {
      let g = groups.get(s.author_id);
      if (!g) {
        const p = byId.get(s.author_id);
        g = {
          authorId: s.author_id,
          name: p?.full_name ?? null,
          avatarUrl: p?.avatar_url ?? null,
          isMine: s.author_id === user.id,
          stories: [],
        };
        groups.set(s.author_id, g);
      }
      g.stories.push(s as Story);
    }
    // La mía primero, el resto por story más reciente.
    return [...groups.values()].sort((a, b) =>
      a.isMine ? -1 : b.isMine ? 1 :
      (b.stories.at(-1)?.created_at ?? '').localeCompare(a.stories.at(-1)?.created_at ?? '')
    );
  } catch {
    return [];
  }
}

// Extensión de archivo por contentType, incluyendo vídeo (quicktime → mov).
const STORY_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

/**
 * Sube una imagen/vídeo como story (24h) vía POST /api/stories/upload.
 * Va por el servidor (service role) porque las políticas de storage del
 * bucket stories-media no se pueden crear por SQL en Supabase actual.
 */
export async function publishStory(
  uri: string,
  contentType: string
): Promise<{ ok: true; review:'approved'|'rejected'|'pending' } | { ok: false; message: string }> {
  const owner=captureSessionIdentity();
  if(!owner)return {ok:false,message:'Necesitas iniciar sesión.'};
  try {
    if(!await ensureCommunityTerms())return {ok:false,message:'Acepta las normas antes de publicar.'};
    return await withOwnedRequest(owner,async request=>{
    const mediaType=contentType.startsWith('video/')?'video':'image';
    const uploaded=await uploadPrivateSocialFile(uri,contentType,(mediaType==='video'?50:5)*1024*1024,undefined,request.signal,owner.userId);
    request.check();if(!uploaded.ok)return uploaded;
    const res = await fetchConTimeout(`${WEB_URL}/api/stories/upload`, {
      method: 'POST',
      headers: { Authorization:request.authorization,'Content-Type':'application/json' },
      body:JSON.stringify({media_url:uploaded.publicUrl,media_type:mediaType}),signal:request.signal,
    });
    request.check();
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, message: (data as { message?: string }).message ?? 'No se pudo subir la story.' };
    }
    const data=await res.json() as {id:string};
    return { ok:true,review:await requestPublicationReview(request,data.id) };
    });
  } catch {
    return { ok: false, message: 'Sin conexión con el servidor. Inténtalo de nuevo.' };
  }
}

// ─── Vistas de story / quién la vio (migración 129) ──────────────────────────

/**
 * Registra que el usuario actual vio una story. Fail-soft: si es su propia
 * story, si ya la había visto (on conflict) o si la tabla aún no existe en
 * prod, no rompe nada. El upsert con ignoreDuplicates evita duplicados sin
 * necesitar una constraint concreta nombrada.
 */
export async function recordStoryView(storyId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('story_views')
      .upsert(
        { story_id: storyId, viewer_id: user.id },
        { onConflict: 'story_id,viewer_id', ignoreDuplicates: true },
      );
  } catch {
    // Sin migración 129 aplicada o sin red: la vista simplemente no se cuenta.
  }
}

/** Lista de quién vio una story (solo el autor puede leerla, por RLS). */
export async function getStoryViewers(storyId: string): Promise<StoryViewer[]> {
  try {
    const { data, error } = await supabase
      .from('story_views')
      .select('viewer_id')
      .eq('story_id', storyId)
      .limit(500);
    if (error || !data?.length) return [];
    const ids = [...new Set(data.map((r) => r.viewer_id as string))];
    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, full_name, avatar_url')
      .in('id', ids);
    return profiles ?? [];
  } catch {
    return [];
  }
}

// ─── Stories destacadas (migración 129) ──────────────────────────────────────

/** Guarda una story como destacada (copia persistente). Solo el autor. */
export async function saveHighlight(
  story: Story,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const owner = captureSessionIdentity();
  try {
    if (!owner) return { ok: false, message: 'Necesitas iniciar sesión.' };
    const { error } = await withOwnedRequest(owner, async request => await request.query(
      supabase.rpc('save_story_highlight', { p_story_id: story.id })
    ));
    if (error) return { ok: false, message: 'No se pudo destacar la story.' };
    return { ok: true };
  } catch {
    return { ok: false, message: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

/** Destacadas de un usuario, de la más reciente a la más antigua. */
export async function getHighlights(userId: string): Promise<Highlight[]> {
  try {
    const { data, error } = await supabase
      .from('story_highlights')
      .select('id, author_id, media_url, media_type, caption, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return data as Highlight[];
  } catch {
    return [];
  }
}

/** Elimina una destacada (RLS: solo el autor). */
export async function deleteHighlight(id: string): Promise<{ ok: boolean }> {
  try {
    // .select('id'): un DELETE filtrado por la RLS devuelve error=null y 0 filas.
    const { data, error } = await supabase.from('story_highlights').delete().eq('id', id).select('id');
    return { ok: !error && data?.length === 1 };
  } catch {
    return { ok: false };
  }
}
