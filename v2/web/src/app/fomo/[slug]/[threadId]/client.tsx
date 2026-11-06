"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Heart, MessageCircle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/ui/toast";
import { FomoAuthorHeader, FomoMedia } from "../../FomoThreadCard";
import FomoComposer from "../../FomoComposer";
import FomoReportButton from "../../FomoReportButton";
import { useSocialModerationRefresh } from '@/lib/social-moderation-client';
import FomoShareButton from "../../FomoShareButton";
import { fomoTimeAgo, type FomoThreadDetail, type FomoReply, type FomoPoll } from "../../types";

// Reacciones rápidas del FOMO (mismas que la app móvil, migración 129).
const QUICK_REACTIONS = ["❤️", "😂", "😮", "😍", "🔥"];

interface EmojiCount {
  emoji: string;
  count: number;
}

interface ReplyLike {
  count: number;
  mine: boolean;
}

// Ajuste optimista del desglose de reacciones: resta la reacción anterior del
// usuario y suma la nueva, sin esperar a la RPC.
function bumpSummary(
  summary: EmojiCount[],
  prevEmoji: string | null,
  nextEmoji: string | null
): EmojiCount[] {
  const counts = new Map(summary.map((s) => [s.emoji, s.count]));
  if (prevEmoji) counts.set(prevEmoji, Math.max(0, (counts.get(prevEmoji) ?? 0) - 1));
  if (nextEmoji) counts.set(nextEmoji, (counts.get(nextEmoji) ?? 0) + 1);
  return [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

function VotablePoll({
  poll,
  onVote,
}: {
  poll: FomoPoll;
  onVote: (optionId: string) => void;
}) {
  const voted = poll.my_option_id !== null;
  const total = poll.total_votes || 0;
  return (
    <div className="mt-3 space-y-2">
      <p className="font-heading text-[15px] font-bold text-text-primary">{poll.question}</p>
      {poll.options.map((o) => {
        const pct = total > 0 ? Math.round((o.vote_count / total) * 100) : 0;
        const mine = poll.my_option_id === o.id;
        if (voted) {
          return (
            <div
              key={o.id}
              className="relative overflow-hidden rounded-xl border border-border px-3.5 py-2.5"
            >
              <div
                className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-[var(--ease-out-expo)] ${mine ? "bg-violet-100" : "bg-violet-50"}`}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <div className="relative flex items-center justify-between text-sm">
                <span className={mine ? "font-semibold text-violet-deep" : "text-text-primary"}>
                  {o.label}
                </span>
                <span className="text-text-muted">{pct}%</span>
              </div>
            </div>
          );
        }
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onVote(o.id)}
            className="block w-full rounded-xl border border-border px-3.5 py-2.5 text-left text-sm font-medium text-text-primary transition-colors hover:border-violet hover:bg-violet-50 hover:text-violet-deep"
          >
            {o.label}
          </button>
        );
      })}
      <p className="text-xs text-text-muted">
        {total} {total === 1 ? "voto" : "votos"}
      </p>
    </div>
  );
}

function ReplyItem({
  reply,
  like,
  canModerate,
  onToggleLike,
  onDelete,
}: {
  reply: FomoReply;
  like: ReplyLike;
  canModerate: boolean;
  onToggleLike: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const anon = reply.is_anonymous || !reply.author;
  const [suppressed, setSuppressed] = useState(false);
  if (suppressed) return null;
  return (
    <div className="border-t border-border-light py-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">
          {anon ? "Anónimo" : reply.author?.full_name || "Estudiante"}
          {reply.author?.is_organization && <span className="ml-2 text-xs text-violet">{reply.author.verified?'Universidad verificada':'Perfil institucional'}</span>}
          {!anon && reply.author?.age ? (
            <span className="font-normal text-text-muted"> · {reply.author.age}</span>
          ) : null}
        </span>
        <span className="text-xs text-text-muted">· {fomoTimeAgo(reply.created_at)}</span>
        <span className="ml-auto flex items-center gap-3">
          {reply.is_mine || canModerate ? (
            <button
              type="button"
              onClick={() => onDelete(reply.id)}
              className="text-text-muted transition-colors hover:text-error"
              title="Borrar"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <FomoReportButton targetType="reply" targetId={reply.id} onSuppressed={() => setSuppressed(true)} />
          )}
        </span>
      </div>
      {reply.body && (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-text-primary">
          {reply.body}
        </p>
      )}
      {reply.media_url && reply.media_type && (
        <FomoMedia url={reply.media_url} type={reply.media_type} />
      )}
      {/* Me gusta del comentario (fomo_reply_reactions, migración 129). */}
      <button
        type="button"
        onClick={() => onToggleLike(reply.id)}
        aria-pressed={like.mine}
        aria-label={like.mine ? "Quitar me gusta" : "Me gusta"}
        className={`mt-2 flex items-center gap-1 text-xs tabular transition-colors ${
          like.mine ? "text-rose-600" : "text-text-muted hover:text-text-primary"
        }`}
      >
        <Heart key={like.mine ? "on" : "off"} className={`h-3.5 w-3.5 ${like.mine ? "fill-current animate-heart-pop" : ""}`} />
        {like.count > 0 ? like.count : null}
      </button>
    </div>
  );
}

export default function FomoThreadClient({
  slug,
  threadId,
  universityName,
}: {
  slug: string;
  threadId: string;
  universityName: string;
}) {
  const supabase = createClient();
  const toast = useToast();
  // Rol del que mira: el RPC delete_fomo_thread ya deja borrar a los admins
  // (moderación), pero la UI solo enseñaba la papelera al autor (is_mine).
  const { role } = useSession();
  const isAdmin = role === "admin";
  const [thread, setThread] = useState<FomoThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Mi emoji actual. Al cargar solo sabemos si hubo reacción (booleano de la
  // RPC), así que por defecto ❤️; luego lo afinamos leyendo fomo_reactions.
  const [myEmoji, setMyEmoji] = useState<string | null>(null);
  // Desglose "❤️ 12 · 😂 3" (fomo_reaction_summary, migración 129).
  const [summary, setSummary] = useState<EmojiCount[]>([]);
  // Likes por comentario: contador y si el mío está entre ellos.
  const [replyLikes, setReplyLikes] = useState<Record<string, ReplyLike>>({});
  useSocialModerationRefresh(() => void load());

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_fomo_thread", {
      p_thread_id: threadId,
    });
    if (error || !data) {
      setThread(null);
      setNotFound(true);
    } else {
      const t = data as FomoThreadDetail;
      setThread(t);
      // Sin más datos, una reacción previa se pinta como ❤️ (igual que la
      // móvil); si ya sabíamos el emoji exacto, lo conservamos.
      setMyEmoji((prev) => (t.my_reaction ? prev ?? "❤️" : null));
    }
    setLoading(false);
  }, [supabase, threadId]);

  // Desglose de reacciones por emoji. Fail-soft: si la RPC no existe o falla,
  // se queda vacío y la UI enseña el contador binario de siempre.
  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc("fomo_reaction_summary", {
      p_thread_id: threadId,
    });
    if (!error && Array.isArray(data)) setSummary(data as EmojiCount[]);
  }, [supabase, threadId]);

  // Usuario con sesión + mi emoji exacto (fomo_reactions solo deja leer el
  // propio por RLS, que es justo lo que necesitamos). Fail-soft.
  const loadMe = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data, error } = await supabase
      .from("fomo_reactions")
      .select("emoji")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error && data?.emoji) setMyEmoji(data.emoji as string);
  }, [supabase, threadId]);

  useEffect(() => {
    load();
    loadSummary();
    loadMe();
  }, [load, loadSummary, loadMe]);

  // Likes de los comentarios: una sola consulta para todos los ids visibles.
  // Fail-soft: si la tabla no existe todavía, no pintamos contadores.
  useEffect(() => {
    if (!thread || thread.replies.length === 0) return;
    let cancelled = false;
    const ids = thread.replies.map((r) => r.id);
    (async () => {
      const { data, error } = await supabase
        .from("fomo_reply_reactions")
        .select("reply_id, user_id")
        .in("reply_id", ids);
      if (cancelled || error || !data) return;
      const next: Record<string, ReplyLike> = {};
      for (const row of data as { reply_id: string; user_id: string }[]) {
        const cur = next[row.reply_id] ?? { count: 0, mine: false };
        cur.count += 1;
        if (userId && row.user_id === userId) cur.mine = true;
        next[row.reply_id] = cur;
      }
      setReplyLikes(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [thread, userId, supabase]);

  // Reacción con emoji (set_fomo_reaction, una por usuario): tocar el mismo
  // emoji la quita. Optimista, y con fail-soft al toggle binario (migración
  // 080) si la RPC de emoji no estuviera disponible.
  const applyReaction = useCallback(
    async (targetEmoji: string | null, emojiForRpc: string) => {
      if (!thread) return;
      const prevEmoji = myEmoji;
      const prevLiked = prevEmoji !== null;
      const nextLiked = targetEmoji !== null;

      // Optimista: mi emoji, el contador total y el desglose a la vez.
      setMyEmoji(targetEmoji);
      setThread((t) =>
        t
          ? {
              ...t,
              my_reaction: nextLiked,
              reaction_count:
                t.reaction_count + (nextLiked ? 1 : 0) - (prevLiked ? 1 : 0),
            }
          : t
      );
      setSummary((s) => bumpSummary(s, prevEmoji, targetEmoji));

      const { data, error } = await supabase.rpc("set_fomo_reaction", {
        p_thread_id: thread.id,
        p_emoji: emojiForRpc,
      });
      if (error) {
        // Fail-soft: sin la RPC de emoji conservamos al menos el like binario,
        // y solo si el estado de like cambió (cambiar de emoji no togglea).
        if (nextLiked !== prevLiked) {
          const { error: err2 } = await supabase.rpc("toggle_fomo_reaction", {
            p_thread_id: thread.id,
          });
          if (err2) {
            // Nada funcionó: recargamos para no mentir con el optimista.
            setMyEmoji(prevEmoji);
            load();
          }
        }
        return;
      }
      // La RPC devuelve el emoji real ahora (o null si se quitó): sincroniza
      // y refresca el desglose con los datos de verdad.
      setMyEmoji((data as string | null) ?? null);
      loadSummary();
    },
    [thread, myEmoji, supabase, load, loadSummary]
  );

  // Elegir un emoji de la fila: si ya era el mío, se quita; si no, pone/cambia.
  const pickReaction = useCallback(
    (emoji: string) => {
      applyReaction(myEmoji === emoji ? null : emoji, emoji);
    },
    [applyReaction, myEmoji]
  );

  // Like de un comentario: insert/delete directo por RLS (cada uno lo suyo).
  // Optimista con reversión si falla (sin sesión, sin red o sin migración).
  const toggleReplyLike = useCallback(
    async (replyId: string) => {
      if (!userId) return;
      const cur = replyLikes[replyId] ?? { count: 0, mine: false };
      const next: ReplyLike = cur.mine
        ? { count: Math.max(0, cur.count - 1), mine: false }
        : { count: cur.count + 1, mine: true };
      setReplyLikes((m) => ({ ...m, [replyId]: next }));
      const { error } = cur.mine
        ? await supabase
            .from("fomo_reply_reactions")
            .delete()
            .match({ reply_id: replyId, user_id: userId })
        : await supabase
            .from("fomo_reply_reactions")
            .insert({ reply_id: replyId, user_id: userId });
      if (error) setReplyLikes((m) => ({ ...m, [replyId]: cur }));
    },
    [userId, replyLikes, supabase]
  );

  const votePoll = useCallback(
    async (optionId: string) => {
      const { error } = await supabase.rpc("vote_fomo_poll", {
        p_option_id: optionId,
      });
      if (!error) load();
    },
    [supabase, load]
  );

  const router = useRouter();

  const deleteThread = useCallback(async () => {
    if (!thread) return;
    const { error } = await supabase.rpc("delete_fomo_thread", {
      p_thread_id: thread.id,
    });
    if (error) {
      toast.error("No se pudo eliminar la publicación", "Inténtalo de nuevo.");
      return;
    }
    router.push(`/fomo/${slug}`);
  }, [thread, supabase, router, slug, toast]);

  const deleteReply = useCallback(
    async (id: string) => {
      const { error } = await supabase.rpc("delete_fomo_reply", { p_reply_id: id });
      if (error) {
        toast.error("No se pudo eliminar la respuesta", "Inténtalo de nuevo.");
        return;
      }
      load();
    },
    [supabase, load, toast]
  );

  return (
    <div className="min-h-screen bg-bg-primary animate-page-in">
      {/* Cabecera del hilo: vuelta al muro y rótulo, sin barra pegajosa. */}
      <div className="border-b border-border-light">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link
            href={`/fomo/${slug}`}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            aria-label="Volver al feed"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
            Volver al muro
          </Link>
          <h1 className="eyebrow ml-auto">Hilo</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {loading && (
          <div className="flex justify-center py-20 text-text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!loading && notFound && (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-text-muted">
            Este hilo no existe o ya no está disponible.
          </div>
        )}

        {!loading && thread && (
          <>
            <div className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
              <FomoAuthorHeader thread={thread} />
              {thread.body && (
                <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed text-text-primary">
                  {thread.body}
                </p>
              )}
              {thread.media_url && thread.media_type && (
                <FomoMedia url={thread.media_url} type={thread.media_type} />
              )}
              {thread.poll && <VotablePoll poll={thread.poll} onVote={votePoll} />}
              <div className="mt-4 border-t border-border-light pt-3">
                {/* Fila de reacciones rápidas: una por usuario; tocar la tuya la quita. */}
                <div className="flex items-center gap-1">
                  {QUICK_REACTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => pickReaction(e)}
                      aria-pressed={myEmoji === e}
                      aria-label={
                        myEmoji === e ? `Quitar reacción ${e}` : `Reaccionar con ${e}`
                      }
                      className={`rounded-full border px-2 py-1 text-lg leading-none transition-all duration-200 ${
                        myEmoji === e
                          ? "animate-heart-pop border-violet bg-violet-50"
                          : "border-transparent hover:border-border hover:bg-bg-secondary"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                  <span className="ml-auto flex items-center gap-3 text-sm text-text-muted">
                    <FomoShareButton
                      threadId={thread.id}
                      slug={slug}
                      body={thread.body}
                      authorLabel={
                        thread.is_anonymous || !thread.author
                          ? "Anónimo"
                          : thread.author.full_name || "Estudiante"
                      }
                      universityName={universityName}
                      mediaUrl={thread.media_url}
                      mediaType={thread.media_type}
                    />
                    {thread.is_mine || isAdmin ? (
                      <button
                        type="button"
                        onClick={deleteThread}
                        className="flex items-center gap-1 text-text-muted transition-colors hover:text-error"
                        title="Borrar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <FomoReportButton targetType="thread" targetId={thread.id} onSuppressed={() => { setThread(null); setNotFound(true); }} />
                    )}
                  </span>
                </div>
                {/* Desglose "❤️ 12 · 😂 3"; si no hay datos de emoji (RPC caída
                    o sin migración), contador binario de siempre. */}
                <div className="mt-2 flex items-center gap-4 text-sm text-text-muted tabular">
                  {summary.length > 0 ? (
                    <span aria-label="Desglose de reacciones">
                      {summary.map((s) => `${s.emoji} ${s.count}`).join(" · ")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Heart
                        className={`h-4 w-4 ${
                          thread.my_reaction ? "fill-rose-600 text-rose-600" : ""
                        }`}
                      />
                      {thread.reaction_count}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4" />
                    {thread.reply_count}
                  </span>
                </div>
              </div>
            </div>

            {/* Reply composer */}
            <div className="mt-5">
              <FomoComposer mode="reply" threadId={thread.id} onCreated={load} />
            </div>

            <div className="mt-4">
              <h2 className="eyebrow mb-1">
                Respuestas
              </h2>
              {thread.replies.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">
                  Aún no hay respuestas.
                </p>
              ) : (
                <div>
                  {thread.replies.map((r) => (
                    <ReplyItem
                      key={r.id}
                      reply={r}
                      like={replyLikes[r.id] ?? { count: 0, mine: false }}
                      canModerate={isAdmin}
                      onToggleLike={toggleReplyLike}
                      onDelete={deleteReply}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
