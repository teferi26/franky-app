"use client";

import { Heart } from "lucide-react";
import { RouteError } from "@/components/ui/route-state";

// Boundary de sección. La pantalla (ilustración de marca, botón de reintentar
// y vuelta atrás) vive en components/ui/route-state.tsx: aquí solo se elige el
// icono y el texto, para que un fallo en cualquier parte de la web se vea
// igual y el error se reporte siempre por el mismo sitio.
export default function CrushError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      icon={Heart}
      title="No hemos podido cargar Crush"
      description="Ha fallado la carga del muro. Prueba a reintentar en unos segundos."
      boundary="crush"
      homeHref="/"
      homeLabel="Volver al inicio"
    />
  );
}
