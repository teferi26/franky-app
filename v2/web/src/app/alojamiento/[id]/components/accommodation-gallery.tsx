"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  X,
  Play,
  Images,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useSaveAccommodation } from "./use-save-accommodation";

interface MediaItem {
  url: string;
  kind: "image" | "video";
}

interface Props {
  accommodationId: string;
  title: string;
  images: string[];
  videos: string[];
}

/**
 * Galería de la ficha, estilo Idealista/Fotocasa.
 *
 * El visor pinta la foto con `object-contain` sobre un fondo suave: antes era
 * un banner de 16/4 con `object-cover` y cualquier foto vertical (que es la
 * mayoría, se hacen con el móvil) salía recortada a una franja. Con `contain`
 * la foto se ve entera, pase lo que pase con su proporción.
 *
 * Los vídeos van en la misma galería que las fotos, detrás de ellas, con sus
 * controles nativos.
 */
export default function AccommodationGallery({
  accommodationId,
  title,
  images,
  videos,
}: Props) {
  const media: MediaItem[] = [
    ...images.map((url) => ({ url, kind: "image" as const })),
    ...videos.map((url) => ({ url, kind: "video" as const })),
  ];

  const toast = useToast();
  const { saved, busy, toggle } = useSaveAccommodation(accommodationId);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const total = media.length;

  const viewerRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (total < 2) return;
      setIndex((i) => (i + delta + total) % total);
    },
    [total]
  );

  // La miniatura activa se trae a la vista al cambiar de foto con las flechas.
  useEffect(() => {
    const strip = thumbsRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  // Lightbox: teclado global, bloqueo del scroll de fondo y foco en cerrar.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [lightbox, go]);

  const closeLightbox = () => {
    setLightbox(false);
    // Devolvemos el foco a la galería para no perder al usuario de teclado.
    viewerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "Escape" && lightbox) {
      closeLightbox();
    }
  };

  // Arrastre en móvil, sin librerías: comparamos el punto de inicio y el de fin.
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < 45) return;
    go(delta < 0 ? 1 : -1);
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // Cancelar el diálogo del sistema no es un error que haya que tapar
        // con el portapapeles.
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado", "Ya puedes pegarlo donde quieras.");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const current = media[index];

  const overlayActions = (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
      <button
        type="button"
        onClick={share}
        aria-label="Compartir este piso"
        title="Compartir"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/92 text-text-primary shadow-card backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
      >
        <Share2 className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"}
        title={saved ? "Quitar de favoritos" : "Guardar en favoritos"}
        className={`flex h-10 w-10 items-center justify-center rounded-full shadow-card backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet ${
          saved ? "bg-violet text-white" : "bg-white/92 text-text-primary hover:bg-white"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Heart className={`h-5 w-5 ${saved ? "fill-current animate-heart-pop" : ""}`} />
        )}
      </button>
    </div>
  );

  // Sin fotos: en vez de un hueco negro, un estado vacío honesto.
  if (total === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-border bg-bg-secondary">
        {overlayActions}
        <div className="aspect-[4/3] sm:aspect-[16/9] flex flex-col items-center justify-center gap-2 text-text-muted">
          <Images className="h-10 w-10 opacity-60" />
          <p className="text-sm font-medium">Este anuncio todavía no tiene fotos</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card"
        role="group"
        aria-roledescription="galería"
        aria-label={`Fotos y vídeos de ${title}`}
      >
        <div
          ref={viewerRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative aspect-[4/3] bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet sm:aspect-[16/10]"
        >
          {current.kind === "image" ? (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              aria-label={`Ampliar foto ${index + 1} de ${total}`}
              className="absolute inset-0 w-full h-full cursor-zoom-in"
            >
              <Image
                key={current.url}
                src={current.url}
                alt={`${title} · foto ${index + 1} de ${total}`}
                fill
                priority={index === 0}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1100px"
                className="object-contain"
              />
            </button>
          ) : (
            <video
              key={current.url}
              src={current.url}
              controls
              playsInline
              preload="metadata"
              aria-label={`${title} · vídeo ${index + 1} de ${total}`}
              className="absolute inset-0 w-full h-full object-contain bg-black"
            />
          )}

          {overlayActions}

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Anterior"
                className="absolute top-1/2 left-3 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-text-primary/70 text-bg-primary transition-colors hover:bg-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Siguiente"
                className="absolute top-1/2 right-3 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-text-primary/70 text-bg-primary transition-colors hover:bg-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <p
                aria-live="polite"
                className="absolute bottom-3 right-3 rounded-full bg-text-primary/75 px-2.5 py-1 text-xs font-semibold text-bg-primary tabular"
              >
                {index + 1}/{total}
              </p>
            </>
          )}
        </div>

        {total > 1 && (
          <div ref={thumbsRef} className="flex gap-2 overflow-x-auto border-t border-border-light p-2.5 scrollbar-hide">
            {media.map((item, i) => (
              <button
                key={item.url}
                type="button"
                data-active={i === index}
                onClick={() => setIndex(i)}
                aria-label={
                  item.kind === "video" ? `Ver vídeo ${i + 1}` : `Ver foto ${i + 1}`
                }
                aria-current={i === index}
                className={`relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-bg-secondary transition-[opacity,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet ${
                  i === index
                    ? "border-text-primary"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                {item.kind === "image" ? (
                  <Image
                    src={item.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <>
                    <video
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="p-1 rounded-full bg-black/60 text-white">
                        <Play className="h-3 w-3 fill-current" />
                      </span>
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* El lightbox también admite vídeos: si solo cubriera fotos, pasar a un
          vídeo con las flechas estando ampliado dejaría el <body> con el scroll
          bloqueado y la página muerta. */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${current.kind === "video" ? "Vídeo" : "Foto"} ${index + 1} de ${total} de ${title}`}
          onClick={closeLightbox}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            aria-label="Cerrar"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" />
          </button>

          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              aria-label="Anterior"
              className="absolute left-2 sm:left-6 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          <div
            className="max-w-5xl w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {current.kind === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={current.url}
                alt={`${title} · foto ${index + 1} de ${total}`}
                className="max-h-[85vh] max-w-full object-contain rounded-lg"
                draggable={false}
              />
            ) : (
              <video
                src={current.url}
                controls
                autoPlay
                playsInline
                aria-label={`${title} · vídeo ${index + 1} de ${total}`}
                className="max-h-[85vh] max-w-full rounded-lg bg-black"
              />
            )}
            <p className="text-white/70 text-xs mt-3 tabular-nums">
              {index + 1} / {total}
            </p>
          </div>

          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              aria-label="Siguiente"
              className="absolute right-2 sm:right-6 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
