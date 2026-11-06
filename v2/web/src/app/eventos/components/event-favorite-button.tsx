"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function EventFavoriteButton({
  eventId,
  className,
}: {
  eventId: string;
  className?: string;
}) {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();

  if (!user) return null;
  const saved = isFavorite(eventId, "event");

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(eventId, "event");
      }}
      aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={cn(
        // Botón neutro sobre la foto: el color lo pone el corazón, no un circulo
        // tintado. Escala al pulsar, como el resto del sistema.
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg-primary/95 shadow-card",
        "transition-[transform,box-shadow,color] duration-200 hover:shadow-card-hover active:scale-95 motion-reduce:active:scale-100",
        saved ? "text-rose-500" : "text-text-muted hover:text-rose-500",
        className
      )}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-current")} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
