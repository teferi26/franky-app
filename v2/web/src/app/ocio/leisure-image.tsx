"use client";

import { useState } from "react";
import {
  Beer, Martini, UtensilsCrossed, Coffee, Music, Trees, Landmark, Dumbbell, Laptop, MapPin,
  type LucideIcon,
} from "lucide-react";

/**
 * Iconos de categoría de ocio (v3): un solo mapa de iconos de lucide en vez de
 * emojis, que se pintaban distinto en cada sistema y no heredaban el color.
 * Lo usan el explorador, la ficha y esta imagen de respaldo.
 */
export const LEISURE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  bar: Beer,
  pub: Martini,
  restaurante: UtensilsCrossed,
  cafeteria: Coffee,
  discoteca: Music,
  parque: Trees,
  cultural: Landmark,
  deportivo: Dumbbell,
  coworking: Laptop,
};

export function leisureCategoryIcon(category: string | null | undefined): LucideIcon {
  return (category && LEISURE_CATEGORY_ICONS[category]) || MapPin;
}

// Imagen de zona de ocio con fallback robusto: si la URL falla (o no hay),
// muestra un fondo neutro con el icono de la categoría. Así NUNCA queda en
// blanco. Las fotos reales viven en Supabase Storage, pero esto cubre
// cualquier fallo.
export default function LeisureImage({
  src,
  alt,
  category,
  className = "",
  sizes,
}: {
  src?: string | null;
  alt: string;
  category: string;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = leisureCategoryIcon(category);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-bg-secondary ${className}`}>
        <Icon className="h-10 w-10 text-text-muted/40" strokeWidth={1.25} aria-hidden="true" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
