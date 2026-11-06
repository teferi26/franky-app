"use client";

import { useState } from "react";
import { Instagram, Loader2 } from "lucide-react";
import { AUDIENCE_LABEL, type LigarPost } from "./types";

/**
 * Botón para generar y compartir una tarjeta de Instagram (1080x1350) de una
 * publicación del muro de ligar. Mantiene la marca de Franky y muestra la
 * universidad. Todo client-side.
 */
export default function LigarShareButton({
  post,
  universityName,
}: {
  post: LigarPost;
  universityName: string;
}) {
  const [genimg, setGenimg] = useState(false);

  async function makeCard() {
    setGenimg(true);
    try {
      // Rendimiento (sep-2026): el generador de tarjetas (canvas, carga de
      // fuentes e imágenes) solo se descarga cuando alguien pulsa "Compartir",
      // igual que hace FomoShareButton. Antes viajaba en el bundle de /crush
      // para todos, lo pulsaran o no.
      const { shareIgCard } = await import("@/lib/igCard");
      await shareIgCard({
        kind: "ligar",
        universityName,
        body: post.body,
        offer: post.offer,
        audienceLabel: AUDIENCE_LABEL[post.audience],
        mediaUrl: post.media_url,
        mediaType: post.media_type,
        filename: "franky-crush.png",
        shareTitle: `Franky Crush · ${universityName}`,
      });
    } finally {
      setGenimg(false);
    }
  }

  return (
    <button
      type="button"
      onClick={makeCard}
      disabled={genimg}
      className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
      title="Tarjeta para Instagram"
    >
      {genimg ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Instagram className="h-4 w-4" />
      )}
      Compartir
    </button>
  );
}
