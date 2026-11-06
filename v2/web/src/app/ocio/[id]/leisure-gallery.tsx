"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Galería de la ficha de ocio.
 *
 * El local sube hasta 20 fotos en el alta (columna `images`) y la ficha solo
 * pintaba `image_url`: 19 de cada 20 fotos que subía el negocio no las veía
 * nadie. Mismo comportamiento que la galería de piso: visor con `object-contain`
 * (las fotos verticales no se recortan), miniaturas, teclado y lightbox.
 */
export default function LeisureGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const total = images.length;

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

  useEffect(() => {
    const strip = thumbsRef.current;
    if (!strip) return;
    strip.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [index]);

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

  if (total === 0) return null;

  return (
    <>
      <div
        className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card"
        role="group"
        aria-roledescription="galería"
        aria-label={`Fotos de ${name}`}
      >
        <div
          ref={viewerRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative aspect-[4/3] sm:aspect-[16/10] bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-inset"
        >
          <button
            type="button"
            onClick={() => setLightbox(true)}
            aria-label={`Ampliar foto ${index + 1} de ${total}`}
            className="absolute inset-0 w-full h-full cursor-zoom-in"
          >
            <Image
              key={images[index]}
              src={images[index]}
              alt={`${name} · foto ${index + 1} de ${total}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 800px"
              className="object-contain"
            />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Anterior"
                className="absolute top-1/2 left-3 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Siguiente"
                className="absolute top-1/2 right-3 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <p
                aria-live="polite"
                className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/55 text-white text-xs font-semibold tabular-nums"
              >
                {index + 1}/{total}
              </p>
            </>
          )}
        </div>

        {total > 1 && (
          <div ref={thumbsRef} className="flex gap-2 p-2 overflow-x-auto">
            {images.map((url, i) => (
              <button
                key={url}
                type="button"
                data-active={i === index}
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === index}
                className={`relative shrink-0 h-16 w-20 rounded-lg overflow-hidden border-2 bg-bg-tertiary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet ${
                  i === index ? "border-violet" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${index + 1} de ${total} de ${name}`}
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

          <div className="max-w-5xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[index]}
              alt={`${name} · foto ${index + 1} de ${total}`}
              className="max-h-[85vh] max-w-full object-contain rounded-lg"
              draggable={false}
            />
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
