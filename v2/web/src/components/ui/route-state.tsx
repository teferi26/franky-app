"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home, AlertTriangle, type LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyIllustration } from "@/components/ui/empty-state";
import { reportError } from "@/lib/report-error";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/components/motion";

/**
 * Pantallas de error y de "no encontrado" con marca, compartidas por todas las
 * rutas. Cada `error.tsx` y `not-found.tsx` de app/ se reduce a diez líneas
 * que llaman aquí con su icono y su texto; así el aspecto es idéntico en toda
 * la web y un cambio se hace en un sitio.
 *
 * El error se reporta a /api/client-error (igual que el error.tsx raíz):
 * antes los boundaries de sección solo tenían el botón de reintentar y el
 * fallo se perdía.
 */
export function RouteError({
  error,
  reset,
  icon: Icon = AlertTriangle,
  title = "Algo ha fallado",
  description = "Ha ocurrido un error inesperado. Suele ser cosa de un momento: prueba a recargar.",
  boundary,
  homeHref = "/",
  homeLabel = "Volver al inicio",
}: {
  error?: (Error & { digest?: string }) | null;
  reset: () => void;
  icon?: LucideIcon;
  title?: string;
  description?: string;
  /** Nombre de la sección para los logs ("eventos", "alojamiento"...). */
  boundary?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  useEffect(() => {
    if (!error) return;
    console.error("[%s]", boundary ?? "route", error);
    // El recolector solo distingue route/global/window; la sección va en el
    // path que él mismo añade (window.location.pathname).
    reportError(error, { boundary: "route", digest: error.digest });
  }, [error, boundary]);

  return (
    // v3: composición editorial (eyebrow, titular grande, una frase) sobre la
    // retícula fina; el CTA principal con imán y el de apoyo en contorno.
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" aria-hidden="true" />
      <EmptyIllustration className="relative h-24 w-24 text-error animate-scale-in">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </EmptyIllustration>
      <p className="eyebrow relative mt-6 animate-slide-up [animation-delay:60ms]">Error</p>
      <h1 className="relative mt-3 text-fluid-h2 font-extrabold text-text-primary animate-slide-up [animation-delay:120ms]">{title}</h1>
      <p className="relative mt-3 max-w-md text-text-muted animate-slide-up [animation-delay:180ms]">{description}</p>
      {error?.digest && (
        <p className="relative mt-3 font-mono text-xs text-text-muted animate-slide-up [animation-delay:220ms]">Código: {error.digest}</p>
      )}
      <div className="relative mt-8 flex flex-col gap-3 sm:flex-row animate-slide-up [animation-delay:260ms]">
        <Magnetic>
          <button type="button" onClick={reset} className={cn(buttonVariants({ variant: "dark", size: "lg" }), "btn-shine w-full sm:w-auto")}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        </Magnetic>
        <Link href={homeHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Home className="h-4 w-4" aria-hidden="true" />
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
