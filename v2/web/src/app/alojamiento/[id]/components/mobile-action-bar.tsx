"use client";

import { Heart, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSaveAccommodation } from "./use-save-accommodation";

/**
 * Barra inferior fija en móvil: el precio y la acción principal siempre a mano,
 * sin obligar a volver arriba. En escritorio no aparece (allí manda la tarjeta
 * pegajosa de la derecha).
 *
 * z-30 a propósito: la barra del comparador (z-50) y el aviso de cookies
 * (z-9998) deben quedar por encima.
 */
export default function MobileActionBar({
  accommodationId,
  price,
  billsIncluded,
}: {
  accommodationId: string;
  price: number;
  billsIncluded: boolean;
}) {
  const { saved, busy, toggle } = useSaveAccommodation(accommodationId);

  // v3: superficie blanca con borde hairline, precio en cifra tabular oscura y
  // un solo botón oscuro. El corazón es redondo y outline.
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-primary/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0">
          <p className="font-heading text-xl font-extrabold leading-tight tracking-tight text-text-primary tabular">
            {price.toLocaleString("es-ES")}
            <span className="ml-0.5 text-xs font-semibold text-text-muted">€/mes</span>
          </p>
          <p className="truncate text-[11px] leading-tight text-text-muted">
            {billsIncluded ? "Gastos incluidos" : "Gastos aparte"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={saved}
            aria-label={saved ? "Quitar de favoritos" : "Guardar en favoritos"}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border bg-bg-primary transition-colors",
              saved ? "border-text-primary text-violet" : "border-border text-text-secondary hover:border-text-primary/40"
            )}
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Heart className={cn("h-5 w-5", saved && "fill-current animate-heart-pop")} />
            )}
          </button>
          <a href="#contactar" className={cn(buttonVariants({ variant: "dark", size: "lg" }), "h-11 px-6")}>
            Contactar
          </a>
        </div>
      </div>
    </div>
  );
}
