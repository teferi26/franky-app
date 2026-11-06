"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase-client";
import { prepareImageForUpload, isImageFile } from "@/lib/image-upload";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OtherProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  university?: string | null;
}

export type MessageType = "text" | "image" | "audio" | "system";

export interface AttachmentMeta {
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  name?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  /** Assigned by the server when a teammate replies on behalf of an organization. */
  organization_label?: string | null;
  content: string | null;
  message_type: MessageType;
  attachment_url: string | null;
  attachment_meta: AttachmentMeta | null;
  created_at: string;
  read_at: string | null;
}

export const CHAT_MEDIA_BUCKET = "chat-media";
export const CHAT_MEDIA_IMAGE_MAX = 5 * 1024 * 1024; // 5MB
export const CHAT_MEDIA_AUDIO_MAX = 2 * 1024 * 1024; // 2MB
export const CHAT_MEDIA_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const CHAT_MEDIA_AUDIO_MIME = ["audio/webm", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav"];

export interface Conversation {
  id: string;
  other_user: OtherProfile | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
  member_count: number;
}

// Una reacción (emoji) de un usuario a un mensaje (tabla message_reactions, 130).
export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

// Encuesta o quedada dentro de una conversación (tabla chat_polls, 135/148).
export interface ChatPoll {
  id: string;
  conversation_id: string;
  author_id: string;
  question: string;
  options: string[];
  multi: boolean;
  meetup_at: string | null;
  meetup_place: string | null;
  closed_at: string | null;
  created_at: string;
}

// Recuento por opción que devuelve la RPC get_chat_poll.
export interface PollResult {
  option_index: number;
  votes: number;
  mine: boolean;
}

// ── Caché de URLs firmadas de medios (a nivel de módulo, persiste entre montajes) ──
// path → { url, expiresAt(ms) }. Evita pedir una signed URL nueva por cada burbuja
// y por cada re-render del hilo.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL = 3600; // segundos
// Margen para refrescar antes de que caduque de verdad (evita usar una URL recién expirada).
const SIGNED_URL_REFRESH_MARGIN_MS = 60_000;

// ── Validación ligera de payloads realtime ─────────────────────────────────────
// payload.new llega sin garantías de forma: comprobamos los campos clave antes de
// confiar en él para no romper el render si cambian las columnas de messages.
function isValidMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.conversation_id === "string" &&
    typeof m.sender_id === "string" &&
    typeof m.created_at === "string"
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(chatId?: string) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  // Memoizado: createClient devuelve un singleton, pero así no se recrea por render
  // y queda estable como dependencia de callbacks y efectos.
  const supabase = useMemo(() => createClient(), []);
  const msgChannelRef = useRef<RealtimeChannel | null>(null);
  const listChannelRef = useRef<RealtimeChannel | null>(null);
  const reactChannelRef = useRef<RealtimeChannel | null>(null);
  const pollChannelRef = useRef<RealtimeChannel | null>(null);
  // Conversaciones silenciadas por el usuario (130): pinta la campana tachada.
  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set());
  // Reacciones de los mensajes del chat abierto (130). Fail-soft: si la tabla
  // no existiera, la lista queda vacía y el chat funciona igual.
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Encuestas y quedadas del chat abierto (135/148) + recuento por encuesta.
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const [pollResults, setPollResults] = useState<Record<string, PollResult[]>>({});

  // ── Fetch conversations (single RPC, see migration 022) ───────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase.rpc("get_my_chats");
    if (error) {
      console.error("get_my_chats error:", error);
      setConversations([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      is_group: boolean | null;
      group_name: string | null;
      group_avatar_url: string | null;
      member_count: number | null;
      other_user: OtherProfile | null;
      last_message: string | null;
      last_message_at: string | null;
      unread_count: number | null;
    }>;

    const convList: Conversation[] = rows.map((r) => ({
      id: r.id,
      other_user: r.other_user ?? null,
      last_message: r.last_message ?? null,
      last_message_at: r.last_message_at ?? null,
      unread_count: r.unread_count ?? 0,
      is_group: !!r.is_group,
      group_name: r.group_name,
      group_avatar_url: r.group_avatar_url,
      member_count: r.member_count ?? 1,
    }));

    // ── Fallback: hydrate missing other_user for 1:1 chats ─────────────────
    // get_my_chats may return null other_user when the SECURITY DEFINER
    // join can't resolve the counterpart (RLS edge cases on profiles).
    const missingIds = convList.filter((c) => !c.is_group && !c.other_user).map((c) => c.id);
    if (missingIds.length > 0) {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("conversation_id, user_id, profiles:profiles!conversation_participants_user_id_fkey(id, full_name, avatar_url, university)")
        .in("conversation_id", missingIds)
        .neq("user_id", user.id);
      const byConv = new Map<string, OtherProfile>();
      type ProfileRow = { id: string; full_name: string; avatar_url: string | null; university: string | null };
      type PartRow = { conversation_id: string; user_id: string; profiles: ProfileRow | ProfileRow[] | null };
      for (const p of ((parts ?? []) as unknown) as PartRow[]) {
        const prof = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
        if (prof) byConv.set(p.conversation_id, {
          id: prof.id,
          full_name: prof.full_name,
          avatar_url: prof.avatar_url,
          university: prof.university,
        });
      }
      for (const c of convList) {
        if (!c.is_group && !c.other_user && byConv.has(c.id)) {
          c.other_user = byConv.get(c.id)!;
        }
      }
    }

    // ── Silenciadas (130) y archivadas (072): fail-soft. Si la columna o la
    // RPC no existieran aún, la lista se muestra completa y sin indicadores.
    let archived = new Set<string>();
    try {
      const [mutedRes, archivedRes] = await Promise.all([
        supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", user.id)
          .eq("is_muted", true),
        supabase.rpc("list_archived_chat_ids"),
      ]);
      if (!mutedRes.error) {
        setMutedIds(
          new Set(
            ((mutedRes.data ?? []) as Array<{ conversation_id: string }>).map(
              (r) => r.conversation_id
            )
          )
        );
      }
      if (!archivedRes.error) {
        archived = new Set((archivedRes.data ?? []) as string[]);
      }
    } catch {
      // Migración pendiente o sin red: seguimos sin filtrar ni marcar nada.
    }

    setConversations(archived.size > 0 ? convList.filter((c) => !archived.has(c.id)) : convList);
    setLoading(false);
  }, [user, supabase]);

  // ── Fetch messages ─────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!chatId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, organization_label, content, message_type, attachment_url, attachment_meta, created_at, read_at")
      .eq("conversation_id", chatId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      // Distinguir "error de carga" de "sin mensajes": no pisamos el estado previo.
      console.error("fetchMessages error:", error);
      setLoading(false);
      return;
    }

    setMessages((data as Message[]) || []);
    setLoading(false);
  }, [chatId, supabase]);

  // ── Send message (text) ────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string, housingListingId?: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user || !chatId || !content.trim()) return { ok: false, error: "Mensaje vacío" };
      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: chatId,
        sender_id: user.id,
        content: content.trim(),
        message_type: "text",
        ...(housingListingId ? { housing_listing_id: housingListingId } : {}),
      });
      if (msgErr) return { ok: false, error: msgErr.message };
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);
      return { ok: true };
    },
    [user, chatId, supabase]
  );

  // ── Send media message (image / audio) ─────────────────────────────────────
  const sendMediaMessage = useCallback(
    async (
      file: Blob,
      type: "image" | "audio",
      meta?: AttachmentMeta
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user || !chatId) return { ok: false, error: "No autenticado" };

      // Lo que se sube de verdad. Solo cambia en las imágenes: el audio (que
      // llega como Blob grabado, sin nombre de archivo) va tal cual.
      let body: Blob = file;
      let mime = (file as File).type || meta?.mime || "";
      let ext: string | null = null;

      if (type === "image") {
        if (file instanceof File) {
          if (!isImageFile(file)) return { ok: false, error: "Formato de imagen no admitido" };
          // Convierte a JPEG antes de subir: las fotos del iPhone llegan en
          // HEIC y el bucket las rechaza con un 415 (ver lib/image-upload.ts).
          const prep = await prepareImageForUpload(file);
          if (!prep.ok) return { ok: false, error: prep.message };
          body = prep.blob;
          mime = prep.contentType;
          ext = prep.ext;
        } else if (!CHAT_MEDIA_IMAGE_MIME.includes(mime)) {
          return { ok: false, error: "Formato de imagen no admitido" };
        }
        // El peso se mide sobre la imagen ya convertida.
        if (body.size > CHAT_MEDIA_IMAGE_MAX) return { ok: false, error: "La imagen supera 5MB" };
      } else {
        if (!CHAT_MEDIA_AUDIO_MIME.includes(mime)) return { ok: false, error: "Formato de audio no admitido" };
        if (body.size > CHAT_MEDIA_AUDIO_MAX) return { ok: false, error: "El audio supera 2MB" };
      }

      const extMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "audio/webm": "webm",
        "audio/mpeg": "mp3",
        "audio/mp4": "m4a",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
      };
      const finalExt = ext || extMap[mime] || "bin";
      const size = body.size;
      const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const path = `${chatId}/${rand}.${finalExt}`;

      const { error: upErr } = await supabase.storage
        .from(CHAT_MEDIA_BUCKET)
        .upload(path, body, { contentType: mime, upsert: false });

      if (upErr) return { ok: false, error: "No se pudo subir el archivo. Inténtalo de nuevo." };

      const fullMeta: AttachmentMeta = { mime, size, ...meta };

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: chatId,
        sender_id: user.id,
        content: null,
        message_type: type,
        attachment_url: path,
        attachment_meta: fullMeta,
      });

      if (msgErr) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([path]);
        return { ok: false, error: msgErr.message };
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", chatId);

      return { ok: true };
    },
    [user, chatId, supabase]
  );

  // ── Get signed URL for a chat media path (cached for session) ──────────────
  const getSignedMediaUrl = useCallback(async (path: string): Promise<string | null> => {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
      return cached.url;
    }
    const { data, error } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error) return null;
    const url = data?.signedUrl ?? null;
    if (url) {
      signedUrlCache.set(path, { url, expiresAt: Date.now() + SIGNED_URL_TTL * 1000 });
    }
    return url;
  }, [supabase]);

  // ── Mark conversation as read ──────────────────────────────────────────────
  // Vía RPC (migración 122): la RLS no permite los UPDATE directos que se
  // necesitan aquí (conversation_participants no tiene política FOR UPDATE y
  // la de messages exige ser el remitente, pero se marcan mensajes ajenos).
  const markRead = useCallback(
    async (convId: string) => {
      if (!user) return;
      const { error } = await supabase.rpc("mark_chat_read", {
        p_conversation_id: convId,
      });
      if (error) {
        console.error("markRead error:", error);
        return;
      }
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
      );
    },
    [user, supabase]
  );

  // ── Silenciar conversación (RPC set_conversation_muted, 130) ───────────────
  // Optimista: la campana cambia al momento y se revierte si el RPC falla.
  const setConversationMuted = useCallback(
    async (convId: string, muted: boolean): Promise<{ ok: boolean }> => {
      if (!user) return { ok: false };
      setMutedIds((prev) => {
        const next = new Set(prev);
        if (muted) next.add(convId); else next.delete(convId);
        return next;
      });
      try {
        const { error } = await supabase.rpc("set_conversation_muted", {
          p_conversation_id: convId,
          p_muted: muted,
        });
        if (error) throw error;
        return { ok: true };
      } catch {
        setMutedIds((prev) => {
          const next = new Set(prev);
          if (muted) next.delete(convId); else next.add(convId);
          return next;
        });
        return { ok: false };
      }
    },
    [user, supabase]
  );

  // ── Archivar conversación (RPC archive_conversation, 072) ──────────────────
  // Quitado optimista de la lista; si el RPC falla se recarga la lista real
  // para no dejar el estado desincronizado (mismo patrón que el móvil).
  const archiveChat = useCallback(
    async (convId: string): Promise<{ ok: boolean }> => {
      if (!user) return { ok: false };
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      try {
        const { error } = await supabase.rpc("archive_conversation", {
          p_conversation_id: convId,
          p_archive: true,
        });
        if (error) throw error;
        return { ok: true };
      } catch {
        fetchConversations();
        return { ok: false };
      }
    },
    [user, supabase, fetchConversations]
  );

  // ── Reacciones: refetch de las de los mensajes visibles (130) ──────────────
  const refetchReactions = useCallback(async () => {
    if (!chatId) return;
    const ids = messages.map((m) => m.id);
    if (ids.length === 0) { setReactions([]); return; }
    try {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", ids);
      if (error) { setReactions([]); return; }
      setReactions((data ?? []) as MessageReaction[]);
    } catch {
      setReactions([]);
    }
  }, [chatId, messages, supabase]);

  useEffect(() => { refetchReactions(); }, [refetchReactions]);

  // Toggle de reacción: una por (mensaje, usuario) por la PK. Repetir la misma
  // emoji la quita; otra distinta la sustituye (upsert). Optimista + refetch
  // si el servidor falla.
  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const current =
        reactions.find((r) => r.message_id === messageId && r.user_id === user.id)?.emoji ?? null;
      setReactions((prev) => {
        const rest = prev.filter((r) => !(r.message_id === messageId && r.user_id === user.id));
        return current === emoji
          ? rest
          : [...rest, { message_id: messageId, user_id: user.id, emoji }];
      });
      try {
        if (current === emoji) {
          const { error } = await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", user.id);
          if (error) refetchReactions();
        } else {
          const { error } = await supabase
            .from("message_reactions")
            .upsert(
              { message_id: messageId, user_id: user.id, emoji },
              { onConflict: "message_id,user_id" }
            );
          if (error) refetchReactions();
        }
      } catch {
        refetchReactions();
      }
    },
    [user, reactions, supabase, refetchReactions]
  );

  // ── Encuestas y quedadas (135/148) ─────────────────────────────────────────
  // getChatPolls devuelve [] si la tabla no existe: el chat sigue funcionando.
  const loadPolls = useCallback(async () => {
    if (!chatId) return;
    try {
      const { data, error } = await supabase
        .from("chat_polls")
        .select("id, conversation_id, author_id, question, options, multi, meetup_at, meetup_place, closed_at, created_at")
        .eq("conversation_id", chatId)
        .order("created_at", { ascending: true });
      if (error) { setPolls([]); return; }
      const rows = (data ?? []) as ChatPoll[];
      setPolls(rows);
      // El recuento se pide aparte porque get_chat_poll agrega los votos.
      const entries = await Promise.all(
        rows.map(async (p) => {
          const { data: res, error: rErr } = await supabase.rpc("get_chat_poll", { p_poll: p.id });
          return [p.id, rErr ? [] : ((res ?? []) as PollResult[])] as const;
        })
      );
      setPollResults(Object.fromEntries(entries));
    } catch {
      setPolls([]);
    }
  }, [chatId, supabase]);

  useEffect(() => {
    setPolls([]);
    setPollResults({});
    if (chatId) loadPolls();
  }, [chatId, loadPolls]);

  // Votar: en opción única sustituye el voto; en multi hace de interruptor
  // (lo resuelve la propia RPC). Tras votar, refresco solo de esa encuesta.
  const votePoll = useCallback(
    async (pollId: string, optionIndex: number): Promise<{ ok: boolean }> => {
      try {
        const { error } = await supabase.rpc("vote_chat_poll", {
          p_poll: pollId,
          p_option: optionIndex,
        });
        if (error) return { ok: false };
        const { data } = await supabase.rpc("get_chat_poll", { p_poll: pollId });
        setPollResults((prev) => ({ ...prev, [pollId]: (data ?? []) as PollResult[] }));
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [supabase]
  );

  // Crear encuesta o quedada. Desde la 148 la RPC ya inserta el mensaje ancla
  // ("📊 Encuesta: ..."): aquí NO se duplica ese insert.
  const createPoll = useCallback(
    async (params: {
      question: string;
      options: string[];
      multi: boolean;
      meetupAt?: string | null;
      meetupPlace?: string | null;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user || !chatId) return { ok: false, error: "No autenticado" };
      try {
        const { data, error } = await supabase.rpc("create_chat_poll", {
          p_conversation: chatId,
          p_question: params.question.trim(),
          p_options: params.options.map((o) => o.trim()).filter(Boolean),
          p_multi: params.multi,
          p_meetup_at: params.meetupAt ?? null,
          p_meetup_place: params.meetupPlace?.trim() || null,
        });
        if (error || !data) {
          return { ok: false, error: "Las encuestas aún no están disponibles. Inténtalo más tarde." };
        }
        await loadPolls();
        return { ok: true };
      } catch {
        return { ok: false, error: "Las encuestas aún no están disponibles. Inténtalo más tarde." };
      }
    },
    [user, chatId, supabase, loadPolls]
  );

  // ── Block a user ───────────────────────────────────────────────────────────
  const blockUser = useCallback(
    async (targetUserId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user) return { ok: false, error: "No autenticado" };
      const { error } = await supabase.from("user_blocks").insert({
        blocker_id: user.id,
        blocked_id: targetUserId,
      });
      if (error) {
        console.error("blockUser error:", error);
        return { ok: false, error: error.message };
      }
      setConversations((prev) =>
        prev.filter((c) => c.other_user?.id !== targetUserId)
      );
      return { ok: true };
    },
    [user, supabase]
  );

  // ── Report user ────────────────────────────────────────────────────────────
  const reportUser = useCallback(
    async (targetUserId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user) return { ok: false, error: "No autenticado" };
      // Map UI labels → user_reports.reason CHECK enum values (migration 010)
      const reasonMap: Record<string, string> = {
        "Spam o publicidad": "spam",
        "Contenido inapropiado": "contenido_ofensivo",
        "Acoso o comportamiento abusivo": "acoso",
        "Información falsa": "comportamiento_inapropiado",
        "Otro motivo": "otro",
      };
      const enumReason = reasonMap[reason] ?? "otro";
      const { error: reportErr } = await supabase.from("user_reports").insert({
        reporter_id: user.id,
        reported_user_id: targetUserId,
        context: "chat",
        reason: enumReason,
        description: reason,
      });
      if (reportErr) {
        console.error("reportUser error:", reportErr);
        return { ok: false, error: reportErr.message };
      }
      // La notificación de confirmación es secundaria: si falla, el reporte ya se guardó.
      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: user.id,
        type: "system",
        title: "Reporte enviado",
        body: `Hemos recibido tu reporte. Lo revisaremos lo antes posible.`,
        data: { reported_user_id: targetUserId, reason },
      });
      if (notifErr) console.error("reportUser (notification) error:", notifErr);
      return { ok: true };
    },
    [user, supabase]
  );

  // ── Realtime: messages in active chat ─────────────────────────────────────
  useEffect(() => {
    if (!chatId || !user) return;

    fetchMessages();

    msgChannelRef.current?.unsubscribe();
    msgChannelRef.current = supabase
      .channel(`chat_msgs:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${chatId}`,
        },
        (payload) => {
          // Validamos la forma del payload antes de confiar en él (las columnas
          // de messages podrían cambiar): si no es válido, lo ignoramos.
          if (!isValidMessage(payload.new)) return;
          const msg = payload.new;
          setMessages((prev) => [...prev, msg]);
          if (msg.sender_id !== user.id) markRead(chatId);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${chatId}`,
        },
        (payload) => {
          if (!isValidMessage(payload.new)) return;
          const updated = payload.new;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    return () => { msgChannelRef.current?.unsubscribe(); };
    // Dependemos de user?.id, no del objeto user: useAuth emite un user nuevo en
    // cada evento (p. ej. TOKEN_REFRESHED, ~cada hora) y no queremos re-suscribir
    // el canal realtime sin que cambie nada relevante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user?.id]);

  // ── Realtime: reacciones y encuestas del chat abierto ─────────────────────
  // Los callbacks van por ref para no re-suscribir el canal en cada render.
  // message_reactions y chat_poll_votes no guardan conversation_id, así que se
  // escuchan sin filtro y se refetch-ea lo visible (consulta barata), igual que
  // hace el móvil.
  const refetchReactionsRef = useRef(refetchReactions);
  useEffect(() => { refetchReactionsRef.current = refetchReactions; }, [refetchReactions]);
  const loadPollsRef = useRef(loadPolls);
  useEffect(() => { loadPollsRef.current = loadPolls; }, [loadPolls]);

  useEffect(() => {
    if (!chatId || !user) return;

    reactChannelRef.current?.unsubscribe();
    reactChannelRef.current = supabase
      .channel(`msg_reactions:${chatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => refetchReactionsRef.current()
      )
      .subscribe();

    pollChannelRef.current?.unsubscribe();
    pollChannelRef.current = supabase
      .channel(`chat_polls:${chatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_polls", filter: `conversation_id=eq.${chatId}` },
        () => loadPollsRef.current()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_poll_votes" },
        () => loadPollsRef.current()
      )
      .subscribe();

    return () => {
      reactChannelRef.current?.unsubscribe();
      pollChannelRef.current?.unsubscribe();
    };
    // Mismo criterio que arriba: user?.id, no el objeto user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user?.id]);

  // ── Realtime: conversation list updates ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetchConversations();

    listChannelRef.current?.unsubscribe();
    listChannelRef.current = supabase
      .channel(`chat_list:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        fetchConversations();
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_participants",
          filter: `user_id=eq.${user.id}`,
        },
        () => { fetchConversations(); }
      )
      .subscribe();

    return () => { listChannelRef.current?.unsubscribe(); };
    // Igual que arriba: dependemos de user?.id para no re-suscribir el canal de
    // la lista de chats en cada refresco de token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    messages,
    conversations,
    loading,
    sendMessage,
    sendMediaMessage,
    getSignedMediaUrl,
    markRead,
    blockUser,
    reportUser,
    fetchConversations,
    fetchMessages,
    // Silenciar y archivar (072/130)
    mutedIds,
    setConversationMuted,
    archiveChat,
    // Reacciones (130)
    reactions,
    toggleReaction,
    // Encuestas y quedadas (135/148)
    polls,
    pollResults,
    votePoll,
    createPoll,
  };
}
