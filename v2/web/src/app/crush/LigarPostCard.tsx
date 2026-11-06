"use client";

import { useState, useRef } from "react";
import { Heart, Flag, Trash2, EyeOff, Users, ShieldBan } from "lucide-react";
import { suppressSocialContent } from '@/lib/social-moderation-client';
import { createClient } from "@/lib/supabase-client";
import { useAccountGuard } from "@/components/AccountScope";
import { useConfirm } from "@/components/ui/confirm-dialog";
import FomoIgButton from "../fomo/FomoIgButton";
import LigarShareButton from "./LigarShareButton";
import { AUDIENCE_LABEL, ligarTimeAgo, type LigarPost } from "./types";

export default function LigarPostCard({
  post,
  onDeleted,
  universityName,
}: {
  post: LigarPost;
  onDeleted: (id: string) => void;
  universityName: string;
}) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const action = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const confirm = useConfirm();
  const [reacted, setReacted] = useState(post.my_reaction);
  const [count, setCount] = useState(post.reaction_count);
  const [reported, setReported] = useState(false);
  const [busy, setBusy] = useState(false);

  const author = post.author;
  // Se puede pedir el IG en cualquier post que no sea el mío. En los anónimos el
  // autor va oculto y la petición se envía por post_id (el servidor resuelve el
  // destinatario sin revelar quién es); en los públicos, por su id de siempre.
  const showIg = !post.is_mine && (post.is_anonymous || (!!author && author.opted_in));

  async function runAction(task: () => Promise<void>) {
    if (action.current || !isCurrent()) return;
    action.current = true; setBusy(true); setActionError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner) return;
      await task();
    } catch { if (isCurrent()) setActionError("No se ha guardado. Inténtalo de nuevo."); }
    finally { action.current = false; if (isCurrent()) setBusy(false); }
  }

  async function toggleReaction() {
    await runAction(async () => {
      const { data, error } = await supabase.rpc("react_ligar_post", { p_post_id: post.id });
      if (!isCurrent()) return;
      if (error || !data) throw error ?? new Error("missing-response");
      setReacted(data.reacted); setCount(data.reaction_count);
    });
  }

  async function report(block = false) {
    if (reported) return;
    await runAction(async () => {
      const ok = await confirm({ title: block ? 'Bloquear a esta persona' : '¿Denunciar esta publicación?', description: block ? 'Dejarás de ver sus publicaciones. Su identidad anónima seguirá oculta.' : 'Dejarás de ver este contenido y el equipo revisará la denuncia.', confirmText: block ? 'Bloquear' : 'Denunciar', variant: 'danger' });
      if (!ok || !isCurrent()) return;
      if (!owner) return;
      await suppressSocialContent(owner, isCurrent, 'crush_post', post.id, block);
      if (!isCurrent()) return;
      setReported(true);
      onDeleted(post.id);
    });
  }

  async function remove() {
    await runAction(async () => {
      const ok = await confirm({ title: "¿Eliminar tu publicación?", description: "Esta acción no se puede deshacer.", confirmText: "Eliminar", variant: "danger" });
      if (!ok || !isCurrent()) return;
      const { error } = await supabase.rpc("delete_ligar_post", { p_post_id: post.id });
      if (!isCurrent()) return;
      if (error) throw error;
      onDeleted(post.id);
    });
  }

  return (
    <article className="hover-lift rounded-2xl border border-border bg-bg-primary p-5 shadow-card hover:border-text-primary/15">
      {actionError && <p role="alert" className="mb-3 text-sm text-error">{actionError}</p>}
      {/* Cabecera */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-secondary ring-1 ring-border">
          {!post.is_anonymous && author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatar_url}
              alt={author.full_name ?? "Perfil"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-muted">
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-primary">
            {post.is_anonymous || !author ? "Anónimo" : author.full_name ?? "Alguien"}
            {!post.is_anonymous && author?.age != null && (
              <span className="font-normal text-text-muted"> · {author.age}</span>
            )}
          </p>
          <p className="text-xs text-text-muted">{ligarTimeAgo(post.created_at)}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-text-secondary">
          <Users className="h-3 w-3" aria-hidden="true" /> {AUDIENCE_LABEL[post.audience]}
        </span>
      </div>

      {/* Cuerpo */}
      {post.body && (
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-text-primary">
          {post.body}
        </p>
      )}
      {post.offer && (
        <div className="mt-3 border-l-2 border-violet pl-3">
          <p className="eyebrow">Lo que aporto</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
            {post.offer}
          </p>
        </div>
      )}

      {/* Media */}
      {post.media_url && post.media_type === "image" && (
        <div className="img-zoom mt-4 overflow-hidden rounded-2xl border border-border bg-bg-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.media_url} alt="Imagen adjunta a la publicación" loading="lazy" decoding="async" className="max-h-96 w-full object-cover" />
        </div>
      )}
      {post.media_url && post.media_type === "video" && (
        <video src={post.media_url} controls className="mt-4 max-h-96 w-full rounded-2xl border border-border bg-bg-dark" />
      )}
      {post.media_url && post.media_type === "audio" && (
        <audio src={post.media_url} controls className="mt-4 w-full" />
      )}

      {/* Acciones */}
      {/* Acciones: corazón que hace el pop al reaccionar (se remonta con la
          key), el resto en gris hasta el hover. */}
      <div className="mt-4 flex items-center gap-4 border-t border-border-light pt-3">
        <button
          type="button"
          onClick={toggleReaction}
          aria-label="Me gusta"
          aria-pressed={reacted}
          className={`flex items-center gap-1.5 text-sm font-semibold tabular transition-colors ${
            reacted ? "text-rose-600" : "text-text-muted hover:text-text-primary"
          }`}
        >
          <Heart
            key={reacted ? "on" : "off"}
            className={`h-4 w-4 ${reacted ? "fill-current animate-heart-pop" : ""}`}
          />
          {count > 0 ? count : ""}
          <span className="sr-only">{count} me gusta</span>
        </button>

        {showIg &&
          (post.is_anonymous ? (
            <FomoIgButton postId={post.id} />
          ) : (
            author && (
              <FomoIgButton authorId={author.id} authorName={author.full_name} />
            )
          ))}

        <div className="ml-auto flex items-center gap-3">
          <LigarShareButton post={post} universityName={universityName} />
          {post.is_mine ? (
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-error"
            >
              <Trash2 className="h-4 w-4" /> Borrar
            </button>
          ) : (
            <><button
              type="button"
              onClick={() => void report()}
              disabled={reported || busy}
              className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-error disabled:opacity-50"
              title="Reportar"
            >
              <Flag className="h-4 w-4" /> {reported ? "Reportado" : "Reportar"}
            </button><button type="button" onClick={() => void report(true)} disabled={reported || busy} title="Bloquear a esta persona" aria-label="Bloquear a esta persona" className="text-text-muted hover:text-error disabled:opacity-50"><ShieldBan className="h-4 w-4" /></button></>
          )}
        </div>
      </div>
    </article>
  );
}
