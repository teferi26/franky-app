"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase-client";
import { MessageSquare, Send, Reply, Trash2, Loader2, EyeOff } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { publishCareerComment, type CareerCommentDraft } from "@/lib/career-comment";
import VerifiedBadge from "@/components/VerifiedBadge";

interface Comment {
  id: string;
  career_id: string;
  user_id: string | null;
  content: string;
  parent_id: string | null;
  is_anonymous?: boolean;
  is_mine?: boolean;
  created_at: string;
  updated_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
    student_email_verified?: boolean | null;
  } | null;
  replies?: Comment[];
}

export default function CareerComments({ careerId }: { careerId: string }) {
  const { user, loading } = useSession();
  if (loading) return <div className="p-8 text-text-muted" role="status">Cargando comentarios…</div>;
  return <AccountComments key={`${careerId}:${user?.id ?? 'guest'}`} careerId={careerId} userId={user?.id ?? null} />;
}

function AccountComments({ careerId, userId }: { careerId: string; userId: string | null }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = useRef(false);
  const draft = useRef<CareerCommentDraft | null>(null);
  const scope = useRef({ alive: true, uid: userId, revision: 0 });
  const isCurrent = useCallback(() => scope.current.alive && scope.current.uid === userId, [userId]);

  useEffect(() => {
    scope.current.alive = true;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (scope.current.uid !== (session?.user.id ?? null)) scope.current.revision++;
      scope.current.uid = session?.user.id ?? null;
    });
    return () => { scope.current.alive = false; scope.current.revision++; data.subscription.unsubscribe(); };
  }, []);

  const supabase = createClient();

  const fetchComments = useCallback(async () => {
    const revision = ++scope.current.revision;
    const valid = () => isCurrent() && revision === scope.current.revision;
    setLoadError(false);
    try {
    // Only the curated view may supply public comments. Never fall back to author rows.
    const rows: Comment[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("career_comments_public").select("*")
        .eq("career_id", careerId).order("created_at", { ascending: true }).order("id")
        .range(offset, offset + 499);
      if (!valid()) return;
      if (error) throw error;
      rows.push(...((data ?? []) as Comment[]));
      if (!data || data.length < 500) break;
    }

    // Nombres solo de los autores no anónimos, en una query (sin N+1).
    const ids = [...new Set(rows.map((c) => c.user_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("public_profiles")
        // student_email_verified va en la misma consulta agrupada: una opinión
        // sobre una carrera pesa más si viene de un estudiante verificado.
        .select("id, full_name, avatar_url, student_email_verified")
        .in("id", ids);
      const names = new Map(
        ((profs as {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          student_email_verified: boolean | null;
        }[] | null) ?? [])
          .map((p) => [
            p.id,
            {
              full_name: p.full_name,
              avatar_url: p.avatar_url,
              student_email_verified: p.student_email_verified,
            },
          ])
      );
      for (const c of rows) c.profile = c.user_id ? names.get(c.user_id) ?? null : null;
    }
    const tops = rows
      .filter((c) => !c.parent_id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((c) => ({ ...c, replies: rows.filter((r) => r.parent_id === c.id) }));
    if (valid()) setComments(tops);
    } catch {
      if (valid()) setLoadError(true);
    } finally {
      if (valid()) setLoading(false);
    }
  }, [careerId, supabase, isCurrent]);

  useEffect(() => { void fetchComments(); }, [fetchComments]);

  const handleSubmit = async (parentId: string | null = null) => {
    const content = (parentId ? replyText : newComment).trim();
    if (!content || !userId || locked.current || !isCurrent()) return;
    locked.current = true;
    setSubmitting(true); setActionError(null); setNotice(null);
    const fields = { career_id: careerId, user_id: userId, content,
      parent_id: parentId, is_anonymous: parentId ? replyAnonymous : anonymous };
    if (!draft.current || Object.entries(fields).some(([key, value]) =>
      draft.current![key as keyof CareerCommentDraft] !== value)) {
      draft.current = { id: crypto.randomUUID(), ...fields };
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== userId) return;
      await publishCareerComment(supabase, draft.current);
      if (!isCurrent()) return;
      draft.current = null;
      if (parentId) { setReplyText(""); setReplyTo(null); setReplyAnonymous(false); }
      else { setNewComment(""); setAnonymous(false); }
      setNotice(fields.is_anonymous ? "Comentario publicado en anónimo." : "Comentario publicado.");
      await fetchComments();
    } catch {
      if (isCurrent()) setActionError("No hemos podido confirmar la publicación. Conservamos tu texto y tu elección de privacidad; puedes reintentar.");
    } finally {
      locked.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!userId || locked.current || !isCurrent()) return;
    locked.current = true; setSubmitting(true); setActionError(null); setNotice(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== userId) return;
      const { error } = await supabase.from("career_comments").delete()
        .eq("id", commentId).eq("user_id", userId);
      if (error) throw error;
      if (isCurrent()) { setNotice("Comentario eliminado."); await fetchComments(); }
    } catch {
      if (isCurrent()) setActionError("No se pudo eliminar el comentario. Inténtalo de nuevo.");
    } finally {
      locked.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "ahora mismo";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `hace ${days}d`;
    return new Date(dateStr).toLocaleDateString("es-ES");
  };

  const displayName = (c: Comment) =>
    c.is_anonymous ? "Anónimo" : c.profile?.full_name || "Usuario";

  const canDelete = (c: Comment) => (c.is_mine ?? false) || (!!userId && c.user_id === userId);

  const AnonToggle = ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <label className="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
      <input
        type="checkbox"
        disabled={submitting}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-border-light text-violet focus:ring-violet/30"
      />
      <EyeOff className="h-3 w-3" />
      Publicar como anónimo
    </label>
  );

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
      <h2 className="text-xl font-bold font-heading mb-1 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-violet" />
        Comentarios
        {comments.length > 0 && (
          <span className="text-sm font-normal text-text-muted">({comments.length})</span>
        )}
      </h2>
      <p className="text-xs text-text-muted mb-4">
        Cuenta tu experiencia para orientar a futuros estudiantes. Puedes publicar con tu nombre o en anónimo.
      </p>

      {actionError && <p role="alert" className="mb-4 rounded-xl border border-error/30 bg-bg-primary p-3 text-sm text-error">{actionError}</p>}
      {notice && <p role="status" className="mb-4 rounded-xl border border-border bg-bg-secondary p-3 text-sm text-text-primary">{notice}</p>}
      {/* New comment form */}
      {userId ? (
        <div className="mb-6">
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full border border-border bg-bg-secondary flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-violet">Tú</span>
            </div>
            <div className="flex-1">
              <textarea
                aria-label="Tu comentario"
                disabled={submitting}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Comparte tu experiencia o pregunta sobre esta carrera..."
                className="w-full px-4 py-3 rounded-xl border border-border bg-bg-primary text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20 resize-none min-h-[80px]"
                maxLength={2000}
              />
              <div className="flex items-center justify-between mt-2">
                <AnonToggle checked={anonymous} onChange={setAnonymous} />
                <button
                  onClick={() => handleSubmit(null)}
                  disabled={submitting || !newComment.trim()}
                  className="inline-flex h-10 items-center gap-1.5 px-5 rounded-xl bg-text-primary text-bg-primary text-sm font-semibold transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-card-hover disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Comentar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-6 p-4 rounded-xl border border-border bg-bg-secondary/60">
          <a href={`/login?next=${encodeURIComponent(`/carreras/${careerId}`)}`} className="text-violet font-medium hover:underline">Inicia sesión</a> para dejar un comentario.
        </p>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-violet" />
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-xl border border-border-light p-4 text-sm">
          <p>No se han podido cargar los comentarios.</p>
          <button onClick={() => void fetchComments()} className="mt-2 font-semibold text-violet">Reintentar carga</button>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">
          Sé el primero en comentar sobre esta carrera.
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-3">
              {/* Main comment */}
              <div className="flex gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${comment.is_anonymous ? "bg-bg-secondary" : "border border-border bg-bg-secondary"}`}>
                  {comment.is_anonymous ? (
                    <EyeOff className="h-3.5 w-3.5 text-text-muted" />
                  ) : (
                    <span className="text-xs font-bold text-violet">
                      {displayName(comment)[0].toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${comment.is_anonymous ? "text-text-muted italic" : ""}`}>
                      {displayName(comment)}
                    </span>
                    {/* En anónimo no se pinta nada: no se filtra quién es. */}
                    <VerifiedBadge verified={!comment.is_anonymous && comment.profile?.student_email_verified} />
                    <span className="text-xs text-text-muted">{timeAgo(comment.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-secondary mt-1 whitespace-pre-line break-words">{comment.content}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {userId && (
                      <button
                        disabled={submitting}
                        onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                        className="text-xs text-text-muted hover:text-violet transition-colors flex items-center gap-1"
                      >
                        <Reply className="h-3 w-3" />
                        Responder
                      </button>
                    )}
                    {canDelete(comment) && (
                      <button
                        disabled={submitting}
                        onClick={() => handleDelete(comment.id)}
                        className="text-xs text-text-muted hover:text-red-500 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Reply form */}
              {replyTo === comment.id && userId && (
                <div className="ml-11 flex gap-3">
                  <div className="flex-1">
                    <textarea
                      aria-label="Tu respuesta"
                      disabled={submitting}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escribe tu respuesta..."
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-primary text-sm transition-colors focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-violet/20 resize-none min-h-[60px]"
                      maxLength={2000}
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <AnonToggle checked={replyAnonymous} onChange={setReplyAnonymous} />
                      <div className="flex gap-2">
                        <button
                          disabled={submitting}
                          onClick={() => { setReplyTo(null); setReplyText(""); setReplyAnonymous(false); }}
                          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleSubmit(comment.id)}
                          disabled={submitting || !replyText.trim()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-text-primary text-bg-primary text-xs font-semibold hover:shadow-card-hover disabled:opacity-50 cursor-pointer"
                        >
                          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                          Responder
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-11 space-y-3 border-l-2 border-violet/10 pl-4">
                  {comment.replies.map((reply: Comment) => (
                    <div key={reply.id} className="flex gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${reply.is_anonymous ? "bg-bg-secondary" : "bg-fuchsia/10"}`}>
                        {reply.is_anonymous ? (
                          <EyeOff className="h-3 w-3 text-text-muted" />
                        ) : (
                          <span className="text-[10px] font-bold text-fuchsia">
                            {displayName(reply)[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-semibold ${reply.is_anonymous ? "text-text-muted italic" : ""}`}>
                            {displayName(reply)}
                          </span>
                          <VerifiedBadge verified={!reply.is_anonymous && reply.profile?.student_email_verified} />
                          <span className="text-xs text-text-muted">{timeAgo(reply.created_at)}</span>
                        </div>
                        <p className="text-sm text-text-secondary mt-0.5 whitespace-pre-line break-words">{reply.content}</p>
                        {canDelete(reply) && (
                          <button
                            disabled={submitting}
                        onClick={() => handleDelete(reply.id)}
                            className="text-xs text-text-muted hover:text-red-500 transition-colors flex items-center gap-1 mt-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
