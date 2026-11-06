"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Volume2, VolumeX, X, Flag, ShieldBan } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { fomoTimeAgo } from "@/app/fomo/types";
import type { WebStoryGroup } from "@/components/StoriesBar";
import { useSession } from '@/components/SessionProvider';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { suppressSocialContent } from '@/lib/social-moderation-client';

const IMAGE_MS = 5000; // imagen: 5 s por story (igual que el móvil)
const VIDEO_MAX_MS = 15000; // vídeo: máximo 15 s (o antes, cuando termine)

// ─── Visor de stories a pantalla completa (port del visor del móvil) ────────
//
// Overlay con barras de progreso arriba, toque en el tercio izquierdo =
// anterior, resto = siguiente, X o Escape para salir. Al acabar las stories
// de un autor pasa al siguiente con story activa. Registra la vista en
// story_views (fail-soft) y avisa al padre para actualizar los aros.
// Accesible: dialog modal con foco atrapado, flechas del teclado y aria-labels.
export default function StoriesViewer({
  groups,
  startIndex,
  onSeen,
  onClose,
}: {
  groups: WebStoryGroup[];
  startIndex: number;
  onSeen: (storyId: string) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const { user } = useSession();
  const isCurrent = useSessionGuard(user?.id ?? null);
  const confirm = useConfirm();
  const [moderating, setModerating] = useState(false);
  const [moderationError, setModerationError] = useState(false);
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true); // muted por defecto para el autoplay
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<Element | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const group = groups[gi] ?? null;
  const story = group?.stories[si] ?? null;
  const isVideo = story?.media_type === "video";
  async function moderate(block: boolean) {
    if (!story || !user || moderating) return;
    const target = story.id, owner = user.id;
    setModerating(true); setModerationError(false); videoRef.current?.pause();
    try {
      const ok = await confirm({ title: block ? 'Bloquear a esta persona' : 'Denunciar historia', description: block ? 'Dejarás de ver sus publicaciones.' : 'La historia desaparecerá de tu vista y el equipo revisará la denuncia.', confirmText: block ? 'Bloquear' : 'Denunciar', variant: 'danger' });
      if (!ok || !isCurrent()) return;
      await suppressSocialContent(owner, isCurrent, 'story', target, block);
      if (isCurrent()) onClose();
    } catch { if (isCurrent()) setModerationError(true); }
    finally { if (isCurrent()) { setModerating(false); void videoRef.current?.play().catch(() => {}); } }
  }

  const advance = useCallback(() => {
    if (!group) return;
    if (si + 1 < group.stories.length) {
      setSi(si + 1);
      return;
    }
    if (gi + 1 < groups.length) {
      setGi(gi + 1);
      setSi(0);
      return;
    }
    onClose();
  }, [group, groups.length, gi, si, onClose]);

  const goBackOne = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
      return;
    }
    if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, prev.stories.length - 1));
    }
  }, [groups, gi, si]);

  // Registrar la vista de cada story ajena (tabla story_views, como el móvil).
  // Fail-soft: sin red o sin migración en prod, la vista no se cuenta y ya.
  useEffect(() => {
    if (!story || !group || group.isMine) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        await supabase
          .from("story_views")
          .upsert(
            { story_id: story.id, viewer_id: user.id },
            { onConflict: "story_id,viewer_id", ignoreDuplicates: true }
          );
      } catch {
        /* fail-soft */
      }
    })();
    onSeen(story.id);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // Temporizador de auto-avance con barra de progreso. En vídeo la barra dura
  // hasta 15 s: si el vídeo termina antes, onEnded adelanta.
  useEffect(() => {
    if (!story || moderating) return;
    setProgress(0);
    const total = isVideo ? VIDEO_MAX_MS : IMAGE_MS;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const p = (Date.now() - startedAt) / total;
      if (p >= 1) advance();
      else setProgress(p);
    }, 50);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, advance, moderating]);

  // Accesibilidad del overlay: bloquear el scroll de fondo, foco al abrir,
  // devolver el foco al cerrar, Escape cierra, flechas navegan y Tab queda
  // atrapado dentro del dialog.
  useEffect(() => {
    previousFocus.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (moderating) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBackOne();
        return;
      }
      if (e.key === "Tab") {
        // Foco atrapado: Tab circula solo entre los controles del visor
        const focusables = overlayRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled])"
        );
        if (!focusables || focusables.length === 0) return;
        const list = Array.from(focusables);
        const current = document.activeElement as HTMLElement | null;
        const idx = current ? list.indexOf(current) : -1;
        e.preventDefault();
        const next = e.shiftKey
          ? list[(idx - 1 + list.length) % list.length]
          : list[(idx + 1) % list.length];
        next.focus();
      }
    },
    [advance, goBackOne, onClose, moderating]
  );

  if (!group || !story) return null;

  const displayName = group.isMine
    ? "Tu historia"
    : group.name ?? "Estudiante";

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Stories de ${displayName}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black outline-none animate-fade-in"
    >
      {/* Media a pantalla completa */}
      {isVideo ? (
        <video
          key={story.id}
          ref={videoRef}
          src={story.media_url}
          autoPlay
          playsInline
          muted={muted}
          onEnded={() => { if (!moderating) advance(); }}
          className="h-full w-full object-contain animate-fade-in"
          aria-label="Vídeo de la story"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={story.id}
          src={story.media_url}
          alt={story.caption ?? "Story"}
          className="h-full w-full object-contain animate-fade-in"
        />
      )}

      {/* Zonas de toque: tercio izquierdo = anterior, resto = siguiente */}
      <button
        type="button"
        onClick={goBackOne}
        aria-label="Story anterior"
        className="absolute bottom-24 left-0 top-24 w-1/3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      />
      <button
        type="button"
        onClick={advance}
        aria-label="Siguiente story"
        className="absolute bottom-24 right-0 top-24 w-2/3 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      />

      {/* Barras de progreso + cabecera */}
      <div className="absolute left-3 right-3 top-3">
        <div className="flex gap-1" aria-hidden>
          {group.stories.map((s, i) => (
            <div
              key={s.id}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <div
                className="h-full bg-white"
                style={{
                  width:
                    i < si
                      ? "100%"
                      : i === si
                      ? `${Math.round(progress * 100)}%`
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          {group.avatarUrl ? (
            <Image
              src={group.avatarUrl}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover ring-1 ring-white/30"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 font-heading text-sm font-bold text-white ring-1 ring-white/30"
            >
              {(group.name ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
            {displayName}
            <span className="ml-2 font-normal text-white/70">
              {fomoTimeAgo(story.created_at)}
            </span>
          </p>
          {isVideo && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Activar sonido" : "Silenciar"}
              className="rounded-full p-1.5 text-white outline-none transition-colors duration-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
            >
              {muted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
          )}
          {!group.isMine && <>
            <button type="button" disabled={moderating} onClick={() => void moderate(false)} aria-label="Denunciar historia" className="rounded-full p-1.5 text-white hover:bg-white/10"><Flag className="h-5 w-5" /></button>
            <button type="button" disabled={moderating} onClick={() => void moderate(true)} aria-label="Bloquear a esta persona" className="rounded-full p-1.5 text-white hover:bg-white/10"><ShieldBan className="h-5 w-5" /></button>
          </>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar el visor de stories"
            className="rounded-full p-1.5 text-white outline-none transition-colors duration-200 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        {moderationError && <p role="alert" className="mt-2 text-sm text-white">No se ha guardado. Inténtalo de nuevo.</p>}
      </div>

      {/* Caption al pie, si la hay */}
      {story.caption && (
        <p className="absolute bottom-6 left-6 right-6 text-center text-[15px] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]">
          {story.caption}
        </p>
      )}
    </div>
  );
}
