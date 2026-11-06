// ─── Mensajería (mismo backend que web/src/hooks/useChat.ts) ─────────────
// Lista por RPC get_my_chats (protege quién es "el otro" en directos), los
// mensajes por query directa (RLS de conversation_participants manda) y
// realtime por canales de postgres_changes.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ensureSocialDemoFeature } from './social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from './session';
import { withOwnedRequest } from './owned-request';
import { uploadMedia, uploadLargeFile, signedChatMediaUrl, MAX_VIDEO_BYTES } from './media';
import type { ChatListItem, ChatMessage } from './types';

// Campos de la tabla messages que el type base (src/lib/types.ts) todavia no
// declara: editado (050), borrado logico (062) y responder citando (068). Se
// extiende aqui para no tocar types.ts, que es de otra propiedad. El realtime
// de postgres_changes entrega SIEMPRE la fila completa, asi que estos campos
// llegan aunque el select base no los pidiera.
// message_type se re-declara para admitir 'video' (mejora 41): el CHECK de la
// tabla y el bucket chat-media aun no lo aceptan en prod (falta migracion), asi
// que sendVideoMessage es fail-soft y devuelve ok:false con mensaje si falla.
export interface ChatMessageExt extends Omit<ChatMessage, 'message_type'> {
  message_type: ChatMessage['message_type'] | 'video';
  edited_at?: string | null;
  is_deleted?: boolean | null;
  reply_to_id?: string | null;
  publishing_organization_id?: string | null;
  organization_label?: string | null;
}

// Una reaccion (emoji) de un usuario a un mensaje (tabla message_reactions, 130).
export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

/**
 * Abre (o recupera) el chat directo 1:1 con otra persona, estilo DM de IG.
 * RPC get_or_create_direct_chat (023): idempotente, crea la conversación y
 * mete a ambos como participantes si no existía. Devuelve el id o null.
 */
export async function startDirectChat(otherUserId: string): Promise<string | null> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data, error } = await request.query(supabase.rpc('get_or_create_direct_chat', {
        p_other_user_id: otherUserId,
      }));
      if (error || !data) return null;
      return data as string;
    });
  } catch {
    return null;
  }
}

export async function getMyChats(): Promise<ChatListItem[]> {
  return withOwnedRequest(captureSessionIdentity(), async request => {
    const { data, error } = await request.query(supabase.rpc('get_my_chats'));
    if (error) throw error;
    return (data as unknown as ChatListItem[]) ?? [];
  });
}

export async function getUnreadChatCount(): Promise<number> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data } = await request.query(supabase.rpc('get_unread_chat_count'));
      return (data as number) ?? 0;
    });
  } catch { return 0; }
}

export async function getMessages(chatId: string): Promise<ChatMessageExt[]> {
  return withOwnedRequest(captureSessionIdentity(), async request => {
    // DESC + reverse: con orden ascendente y limit, una conversación larga
    // devolvería los 100 mensajes MÁS ANTIGUOS y lo reciente no se vería nunca.
    const { data, error } = await request.query(supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, message_type, attachment_url, attachment_meta, created_at, read_at, edited_at, is_deleted, reply_to_id, publishing_organization_id, organization_label')
      .eq('conversation_id', chatId)
      .order('created_at', { ascending: false })
      .limit(100));
    if (error) throw error;
    return ((data ?? []) as ChatMessageExt[]).reverse();
  });
}

/** Mensajes que trae la primera carga del chat (los más recientes). */
export const CHAT_FIRST_PAGE = 100;

/**
 * Página de mensajes ANTERIORES a `beforeIso`, para subir por el historial sin
 * descargar la conversación entera de golpe. Mismo orden que getMessages
 * (cronológico ascendente) y mismas columnas.
 */
export async function getMessagesBefore(chatId: string, beforeIso: string, limit = 50): Promise<ChatMessageExt[]> {
  return withOwnedRequest(captureSessionIdentity(), async request => {
    const { data, error } = await request.query(supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, message_type, attachment_url, attachment_meta, created_at, read_at, edited_at, is_deleted, reply_to_id, publishing_organization_id, organization_label')
      .eq('conversation_id', chatId)
      .lt('created_at', beforeIso)
      .order('created_at', { ascending: false })
      .limit(limit));
    if (error) throw error;
    return ((data ?? []) as ChatMessageExt[]).reverse();
  });
}

// replyToId (opcional): al responder citando se guarda en reply_to_id (068) y
// la burbuja del hijo pinta arriba el mensaje citado.
export async function sendTextMessage(chatId: string, content: string, replyToId?: string | null, housingListingId?: string): Promise<{ ok: boolean }> {
  if (!content.trim()) return { ok: false };
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { error } = await request.query(supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: request.owner.userId,
        content: content.trim(),
        message_type: 'text',
        reply_to_id: replyToId ?? null,
        ...(housingListingId ? { housing_listing_id: housingListingId } : {}),
      }));
      // get_my_chats ordena por el created_at del último mensaje: el insert ya
      // sube la conversación arriba, no hace falta tocar conversations.
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}

// Editar un mensaje propio de texto: UPDATE content + edited_at. La RLS de
// messages solo deja actualizar al remitente, asi que basta el update directo.
export async function editMessage(messageId: string, content: string): Promise<{ ok: boolean }> {
  const body = content.trim();
  if (!body) return { ok: false };
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      // .select('id'): un UPDATE que la RLS filtra no da error, solo afecta a 0
      // filas. Sin pedir las filas devueltas, la app daria por hecho un cambio que
      // no ha ocurrido (p. ej. mensaje ajeno o ya borrado).
      const { data, error } = await request.query(supabase
        .from('messages')
        .update({ content: body, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select('id'));
      return { ok: !error && Array.isArray(data) && data.length === 1 };
    });
  } catch { return { ok: false }; }
}

// Borrado logico: is_deleted=true (062). Vaciamos content para no conservar el
// texto borrado. La burbuja pasa a "Mensaje eliminado".
export async function deleteMessage(messageId: string): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      // Igual que editMessage: solo es exito si la fila se actualizo de verdad.
      const { data, error } = await request.query(supabase
        .from('messages')
        .update({ is_deleted: true, content: null })
        .eq('id', messageId)
        .select('id'));
      return { ok: !error && Array.isArray(data) && data.length === 1 };
    });
  } catch { return { ok: false }; }
}

// Nota de voz en el chat: sube al bucket privado chat-media (carpeta = chatId,
// limite 2MB por RLS) y crea el mensaje de tipo audio con la duracion en meta.
// El chat ya reproduce audio con AudioChip via signedChatMediaUrl.
export async function sendAudioMessage(
  chatId: string,
  uri: string,
  durationMs: number,
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      // expo-audio (HIGH_QUALITY) graba un .m4a, cuyo MIME correcto es 'audio/mp4'.
      // Antes se mandaba 'audio/m4a', que no existe como MIME y no está en el
      // allowed_mime_types de chat-media (018/133): Storage lo rechazaba SIEMPRE y
      // ninguna nota de voz se llegaba a enviar.
      const up = await uploadMedia('chat-media', chatId, uri, 'audio/mp4', 2 * 1024 * 1024, request);
      request.check();
      if (!up.ok) return { ok: false, message: up.message };
      const { error } = await request.query(supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: request.owner.userId,
        content: null,
        message_type: 'audio',
        attachment_url: up.path,
        attachment_meta: { duration: durationMs },
      }));
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}

// ── Reacciones a mensajes (tabla message_reactions, 130) ──────────────────
// Fail-soft: si la tabla aun no esta en prod (migracion pendiente), devolvemos
// vacio y el chat sigue funcionando sin reacciones.
export async function getMessageReactions(messageIds: string[]): Promise<MessageReaction[]> {
  if (messageIds.length === 0) return [];
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      // En trozos de 100 ids y en paralelo: con el historial paginado la lista
      // puede tener cientos de mensajes y un único .in() enorme superaría el
      // tamaño máximo de URL.
      const chunks: string[][] = [];
      for (let i = 0; i < messageIds.length; i += 100) chunks.push(messageIds.slice(i, i + 100));
      const results = await Promise.all(chunks.map(ids => request.query(supabase
        .from('message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', ids))));
      if (results.some(r => r.error)) return [];
      return results.flatMap(r => (r.data ?? []) as MessageReaction[]);
    });
  } catch {
    return [];
  }
}

// Toggle de reaccion: una por (mensaje, usuario) por la PK. Si repites la misma
// emoji la quitas; si eliges otra la cambias (upsert); si no tenias, la añades.
export async function setMessageReaction(
  messageId: string,
  emoji: string,
  currentEmoji: string | null,
): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      if (currentEmoji === emoji) {
        const { error } = await request.query(supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', request.owner.userId));
        return { ok: !error };
      }
      const { error } = await request.query(supabase
        .from('message_reactions')
        .upsert({ message_id: messageId, user_id: request.owner.userId, emoji }, { onConflict: 'message_id,user_id' }));
      return { ok: !error };
    });
  } catch {
    return { ok: false };
  }
}

// Realtime de reacciones: sin filtro por conversacion porque la tabla solo
// guarda message_id. El llamador refetch-ea las reacciones de los mensajes
// visibles al recibir cualquier evento (la consulta es barata).
// Nombre de canal ÚNICO por suscripción (mismo motivo que chatListSeq más
// abajo): con el nombre fijo 'msg_reactions', dos chats abiertos seguidos
// compartían el canal cacheado y el segundo .on() tras .subscribe() petaba.
let reactionsSeq = 0;

export function subscribeToReactions(onChange: () => void): RealtimeChannel {
  const owner = captureSessionIdentity();
  return supabase
    .channel(`msg_reactions:${++reactionsSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => { if (owner && isCurrentSessionIdentity(owner)) onChange(); })
    .subscribe();
}

// ── Silenciar conversacion (preferencia local del participante, 130) ──────
export async function muteConversation(chatId: string, muted: boolean): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { error } = await request.query(supabase.rpc('set_conversation_muted', {
        p_conversation_id: chatId,
        p_muted: muted,
      }));
      return { ok: !error };
    });
  } catch {
    return { ok: false };
  }
}

export async function getConversationMuted(chatId: string): Promise<boolean> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data } = await request.query(supabase
        .from('conversation_participants')
        .select('is_muted')
        .eq('conversation_id', chatId)
        .eq('user_id', request.owner.userId)).maybeSingle();
      return !!(data as { is_muted?: boolean } | null)?.is_muted;
    });
  } catch {
    return false;
  }
}

// ── Presencia del otro en un chat 1:1 ─────────────────────────────────────
// bump_last_seen (071) actualiza profiles.last_seen; user_presence es la tabla
// legacy (001). Leemos ambos y nos quedamos con la marca mas reciente. Fail-soft.
export async function getPresence(userId: string): Promise<{ lastSeen: string | null }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const [prof, pres] = await Promise.all([
        request.query(supabase.from('profiles').select('last_seen').eq('id', userId)).maybeSingle(),
        request.query(supabase.from('user_presence').select('last_seen').eq('user_id', userId)).maybeSingle(),
      ]);
      const a = (prof.data as { last_seen?: string | null } | null)?.last_seen ?? null;
      const b = (pres.data as { last_seen?: string | null } | null)?.last_seen ?? null;
      if (a && b) return { lastSeen: a > b ? a : b };
      return { lastSeen: a ?? b };
    });
  } catch {
    return { lastSeen: null };
  }
}

// Heartbeat de mi propia presencia (RPC 071). Fail-soft.
export async function bumpLastSeen(): Promise<void> {
  try {
    await withOwnedRequest(captureSessionIdentity(), async request => { await request.query(supabase.rpc('bump_last_seen')); });
  } catch { /* sin red o migracion pendiente */ }
}

// Imagen en el chat: bucket privado chat-media, path <chatId>/<archivo>.
// El mensaje guarda el PATH; para pintarlo se usa signedChatMediaUrl.
export async function sendImageMessage(
  chatId: string,
  uri: string,
  contentType: string,
  meta: { width?: number; height?: number },
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const up = await uploadMedia('chat-media', chatId, uri, contentType, 5 * 1024 * 1024, request);
      request.check();
      if (!up.ok) return { ok: false, message: up.message };
      const { error } = await request.query(supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: request.owner.userId,
        content: null,
        message_type: 'image',
        attachment_url: up.path,
        attachment_meta: { mime: contentType, ...meta },
      }));
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}

// Vídeo en el chat (mejora 41): mismo patrón que sendImageMessage pero con
// message_type 'video'. FAIL-SOFT real: el bucket chat-media (018) todavía no
// admite mimetypes de vídeo ni el CHECK de messages acepta 'video', así que
// hasta que se pegue esa migración esta función devolverá ok:false con el
// mensaje de uploadMedia/Postgres y el llamador lo muestra en un Alert.
export async function sendVideoMessage(
  chatId: string,
  uri: string,
  contentType: string,
  meta: { width?: number; height?: number; duration?: number },
  onProgress?: (fraccion: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: boolean; message?: string }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      // uploadLargeFile, NO uploadMedia: un vídeo no cabe en memoria. Ver el porqué
      // en la cabecera de esa función (src/lib/media.ts).
      const up = await uploadLargeFile('chat-media', chatId, uri, contentType, MAX_VIDEO_BYTES, onProgress, request.signal, request);
      request.check();
      if (!up.ok) return { ok: false, message: up.message };
      const { error } = await request.query(supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: request.owner.userId,
        content: null,
        message_type: 'video',
        attachment_url: up.path,
        attachment_meta: { mime: contentType, ...meta },
      }));
      return { ok: !error, message: error ? 'El servidor aún no admite vídeos en el chat.' : undefined };
    }, signal);
  } catch { return { ok: false }; }
}

// Reenviar un mensaje (mejora 37): texto se copia tal cual; imagen/audio/vídeo
// se descargan de su URL firmada y se re-suben a la carpeta de la conversación
// destino (RLS de chat-media exige ser participante de esa carpeta), luego se
// inserta un mensaje nuevo con el mismo tipo y meta. Fail-soft en cada paso.
export async function forwardMessage(
  msg: ChatMessageExt,
  targetChatId: string,
): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      if (msg.is_deleted) return { ok: false };
      if (msg.message_type === 'image' || msg.message_type === 'audio' || msg.message_type === 'video') {
        if (!msg.attachment_url) return { ok: false };
        const signedUrl = await signedChatMediaUrl(msg.attachment_url, request);
        request.check();
        if (!signedUrl) return { ok: false };
        const mime = msg.attachment_meta?.mime
          ?? (msg.message_type === 'audio' ? 'audio/mp4' : msg.message_type === 'video' ? 'video/mp4' : 'image/jpeg');
        const maxBytes = msg.message_type === 'image' ? 5 * 1024 * 1024
          : msg.message_type === 'video' ? 50 * 1024 * 1024 : 2 * 1024 * 1024;
        const up = await uploadMedia('chat-media', targetChatId, signedUrl, mime, maxBytes, request);
        request.check();
        if (!up.ok) return { ok: false };
        const { error } = await request.query(supabase.from('messages').insert({
          conversation_id: targetChatId,
          sender_id: request.owner.userId,
          content: null,
          message_type: msg.message_type,
          attachment_url: up.path,
          attachment_meta: msg.attachment_meta ?? null,
        }));
        return { ok: !error };
      }
      if (!msg.content?.trim()) return { ok: false };
      const { error } = await request.query(supabase.from('messages').insert({
        conversation_id: targetChatId, sender_id: request.owner.userId,
        content: msg.content.trim(), message_type: 'text', reply_to_id: null,
      }));
      return { ok: !error };
    });
  } catch {
    return { ok: false };
  }
}

// Archivar/desarchivar una conversación (mejora 43, RPC de la migración 072).
// Por-participante: no afecta a lo que ve el otro. Fail-soft: si la RPC aún no
// está en prod, no rompe nada y el llamador simplemente no quita la fila.
export async function archiveConversation(chatId: string, archive: boolean = true): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { error } = await request.query(supabase.rpc('archive_conversation', {
        p_conversation_id: chatId,
        p_archive: archive,
      }));
      return { ok: !error };
    });
  } catch {
    return { ok: false };
  }
}

// Marca la conversación como leída. Va por RPC (migración 122) porque la RLS
// no permite los UPDATE directos: conversation_participants no tiene política
// de UPDATE y la de messages exige ser el remitente (aquí se marcan mensajes
// ajenos). Mejor esfuerzo: si la RPC aún no está en prod, no rompe nada.
export async function markChatRead(chatId: string): Promise<void> {
  try {
    await withOwnedRequest(captureSessionIdentity(), async request => {
      await request.query(supabase.rpc('mark_chat_read', { p_conversation_id: chatId }));
    });
  } catch {
    // Sin red o migración pendiente: el contador bajará al siguiente intento.
  }
}

export async function leaveGroupChat(chatId: string): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { error } = await request.query(supabase.rpc('leave_group_chat', { p_conv: chatId }));
      return { ok: !error };
    });
  } catch { return { ok: false }; }
}

// ── Chats de grupo creables (mejora 57, RPC de la migración 019) ─────────

export interface GroupMember {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'member';
}

// Resultado de buscar personas para añadir a un grupo: sale de public_profiles
// (la vista curada, sin PII) porque profiles solo deja leer tu propia fila.
export interface PersonResult {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  university: string | null;
}

// Busca por nombre en public_profiles, excluyendo al propio usuario. Fail-soft:
// sin red o sin resultados, lista vacía.
export async function searchPeople(query: string): Promise<PersonResult[]> {
  const term = query.trim();
  if (!term) return [];
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const q = supabase
        .from('public_profiles')
        .select('id, full_name, avatar_url, universities')
        .ilike('full_name', `%${term}%`)
        .limit(20)
        .neq('id', request.owner.userId);
      const { data, error } = await request.query(q);
      if (error || !data) return [];
      return (data as unknown as { id: string; full_name: string | null; avatar_url: string | null; universities: { name?: string; short_name?: string } | null }[])
        .map((p) => ({
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          university: p.universities?.short_name ?? p.universities?.name ?? null,
        }));
    });
  } catch {
    return [];
  }
}

// Crea un grupo con nombre y miembros iniciales (RPC create_group_chat, 019).
// Devuelve el id de la conversación nueva, o null si falla.
export async function createGroupChat(name: string, memberIds: string[]): Promise<string | null> {
  const owner = captureSessionIdentity();
  try {
    if (!await ensureSocialDemoFeature('groups')) return null;
    return await withOwnedRequest(owner, async request => {
      const { data, error } = await request.query(supabase.rpc('create_group_chat', {
        p_name: name.trim(),
        p_members: memberIds,
      }));
      if (error || !data) return null;
      return data as string;
    });
  } catch {
    return null;
  }
}

// Miembros de un grupo: conversation_participants + su perfil público. La RLS
// de conversation_participants (021) deja ver a cualquier participante de la
// misma conversación, así que basta con la query directa.
export async function getGroupMembers(chatId: string): Promise<GroupMember[]> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data: parts, error } = await request.query(supabase
        .from('conversation_participants')
        .select('user_id, role')
        .eq('conversation_id', chatId));
      if (error || !parts?.length) return [];
      const ids = (parts as { user_id: string; role: string }[]).map((p) => p.user_id);
      const { data: profiles } = await request.query(supabase
        .from('public_profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids));
      const byId = new Map((profiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null }) => [p.id, p]));
      return (parts as { user_id: string; role: string }[]).map((p) => {
        const prof = byId.get(p.user_id);
        return {
          id: p.user_id,
          full_name: prof?.full_name ?? null,
          avatar_url: prof?.avatar_url ?? null,
          role: p.role === 'admin' ? 'admin' : 'member',
        };
      });
    });
  } catch {
    return [];
  }
}

// ── Encuestas y quedadas dentro del chat (mejora 58, migración 135) ──────
// AÚN NO está aplicada en producción: todo aquí es fail-soft y devuelve un
// resultado "vacío"/ok:false si la tabla o la RPC todavía no existen, sin
// romper el resto del chat.
export interface ChatPoll {
  id: string; conversation_id: string; author_id: string;
  question: string; options: string[]; multi: boolean;
  meetup_at: string | null; meetup_place: string | null;
  closed_at: string | null; created_at: string;
}

export interface PollResult { option_index: number; votes: number; mine: boolean }

export async function getChatPolls(chatId: string): Promise<ChatPoll[]> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data, error } = await request.query(supabase
        .from('chat_polls')
        .select('id, conversation_id, author_id, question, options, multi, meetup_at, meetup_place, closed_at, created_at')
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: true }));
      if (error) return [];
      return (data ?? []) as ChatPoll[];
    });
  } catch {
    return [];
  }
}

export async function createChatPoll(params: {
  conversationId: string; question: string; options: string[]; multi: boolean;
  meetupAt?: string | null; meetupPlace?: string | null;
}): Promise<{ ok: boolean; id?: string; message?: string }> {
  const owner = captureSessionIdentity();
  try {
    if (!await ensureSocialDemoFeature('chatPolls')) return { ok: false, message: 'Comprueba las funciones disponibles para tu cuenta.' };
    return await withOwnedRequest(owner, async request => {
      const { data, error } = await request.query(supabase.rpc('create_chat_poll', {
        p_conversation: params.conversationId,
        p_question: params.question.trim(),
        p_options: params.options.map((o) => o.trim()).filter(Boolean),
        p_multi: params.multi,
        p_meetup_at: params.meetupAt ?? null,
        p_meetup_place: params.meetupPlace?.trim() || null,
      }));
      if (error || !data) return { ok: false, message: 'Aún no disponible. Inténtalo más tarde.' };
      return { ok: true, id: data as string };
    });
  } catch {
    return { ok: false, message: 'Aún no disponible. Inténtalo más tarde.' };
  }
}

export async function voteChatPoll(pollId: string, optionIndex: number): Promise<{ ok: boolean }> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { error } = await request.query(supabase.rpc('vote_chat_poll', { p_poll: pollId, p_option: optionIndex }));
      return { ok: !error };
    });
  } catch {
    return { ok: false };
  }
}

export async function getChatPollResults(pollId: string): Promise<PollResult[]> {
  try {
    return await withOwnedRequest(captureSessionIdentity(), async request => {
      const { data, error } = await request.query(supabase.rpc('get_chat_poll', { p_poll: pollId }));
      if (error) return [];
      return (data ?? []) as PollResult[];
    });
  } catch {
    return [];
  }
}

// Realtime de encuestas/votos de esta conversación. chat_poll_votes no guarda
// conversation_id, así que se escucha sin filtro (igual que las reacciones,
// migración 130) y el llamador hace un refetch barato de las encuestas visibles.
let chatChannelSeq = 0;

export function subscribeToChatPolls(chatId: string, onChange: () => void): RealtimeChannel {
  const owner = captureSessionIdentity();
  const changed = () => { if (owner && isCurrentSessionIdentity(owner)) onChange(); };
  return supabase
    .channel(`chat_polls:${chatId}:${++chatChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_polls', filter: `conversation_id=eq.${chatId}` }, changed)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_poll_votes' }, changed)
    .subscribe();
}

// Realtime del chat abierto: INSERT y UPDATE de sus mensajes.
// Devuelve el canal; el llamador debe hacer supabase.removeChannel(ch) al salir.
export function subscribeToChat(
  chatId: string,
  onMessage: (msg: ChatMessageExt) => void,
): RealtimeChannel {
  const owner = captureSessionIdentity();
  const changed = (row: ChatMessageExt) => { if (owner && isCurrentSessionIdentity(owner)) onMessage(row); };
  return supabase
    .channel(`chat_msgs:${chatId}:${++chatChannelSeq}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
      (payload) => changed(payload.new as ChatMessageExt),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatId}` },
      (payload) => changed(payload.new as ChatMessageExt),
    )
    .subscribe();
}

// Realtime del listado: cualquier mensaje nuevo o alta en una conversación
// del usuario dispara un refetch de get_my_chats (patrón de la web).
// Contador para dar un nombre de canal ÚNICO por suscripción. Sin esto, dos
// llamadas (p. ej. el badge de la barra de pestañas y la pantalla de Chats)
// reciben el MISMO canal cacheado por nombre y el segundo .on() tras
// .subscribe() peta ("cannot add postgres_changes callbacks after subscribe").
let chatListSeq = 0;

export function subscribeToChatList(userId: string, onChange: () => void): RealtimeChannel {
  const owner = captureSessionIdentity();
  const changed = () => { if (owner?.userId === userId && isCurrentSessionIdentity(owner)) onChange(); };
  return supabase
    .channel(`chat_list:${userId}:${++chatListSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, changed)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${userId}` },
      changed,
    )
    .subscribe();
}
