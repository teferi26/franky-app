"use client";

import { useState } from "react";
import { Share2, Link2, Instagram, Check, Loader2 } from "lucide-react";

/**
 * Compartir un hilo: enlace directo (Web Share API / copiar) y tarjeta para
 * Instagram generada en canvas (1080x1350) que el usuario puede compartir o
 * descargar. No depende del backend — todo client-side.
 */
export default function FomoShareButton({
  threadId,
  slug,
  body,
  authorLabel,
  universityName,
  mediaUrl,
  mediaType,
}: {
  threadId: string;
  slug: string;
  body: string | null;
  authorLabel: string;
  universityName: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [genimg, setGenimg] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/fomo/${slug}/${threadId}`
      : `/fomo/${slug}/${threadId}`;

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `FOMO · ${universityName}`, url });
        setOpen(false);
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function makeCard() {
    setGenimg(true);
    try {
      const { shareIgCard } = await import("@/lib/igCard");
      await shareIgCard({
        kind: "fomo",
        universityName,
        body,
        authorLabel,
        mediaUrl,
        mediaType,
        filename: "franky-fomo.png",
        shareTitle: `FOMO · ${universityName}`,
        shareText: url,
      });
      setOpen(false);
    } finally {
      setGenimg(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-text-muted transition-colors hover:text-text-primary"
        title="Compartir"
      >
        <Share2 className="h-4 w-4" />
      </button>

      {open && (
        <div className="animate-dropdown absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float">
          <button
            type="button"
            onClick={shareLink}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-bg-secondary"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-success" /> Enlace copiado
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" /> Compartir enlace
              </>
            )}
          </button>
          <button
            type="button"
            onClick={makeCard}
            disabled={genimg}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-primary hover:bg-bg-secondary disabled:opacity-50"
          >
            {genimg ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Instagram className="h-4 w-4" />
            )}
            Tarjeta para Instagram
          </button>
        </div>
      )}
    </div>
  );
}
