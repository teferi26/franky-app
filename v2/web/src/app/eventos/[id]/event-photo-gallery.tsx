"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function EventPhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  if (photos.length === 0) return null;
  const current = photos[active];

  const next = () => setActive((i) => (i + 1) % photos.length);
  const prev = () => setActive((i) => (i - 1 + photos.length) % photos.length);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
        <div className="relative aspect-[16/10] bg-bg-secondary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt={alt}
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={() => setLightbox(true)}
            draggable={false}
          />

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute top-1/2 left-3 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                aria-label="Foto anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute top-1/2 right-3 -translate-y-1/2 h-10 w-10 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                aria-label="Siguiente foto"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white tabular">
                {active + 1}/{photos.length}
              </div>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex gap-1.5 p-2 overflow-x-auto">
            {photos.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => setActive(i)}
                className={`shrink-0 h-14 w-14 rounded-lg overflow-hidden border-2 transition-colors ${
                  i === active ? "border-violet" : "border-transparent opacity-70 hover:opacity-100"
                }`}
                aria-label={`Foto ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(false);
            }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt={alt}
            className="max-h-[92vh] max-w-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
