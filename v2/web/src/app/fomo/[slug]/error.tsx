"use client";

import { Flame } from "lucide-react";
import { RouteError } from "@/components/ui/route-state";

// Boundary de sección. La pantalla (ilustración de marca, botón de reintentar
// y vuelta atrás) vive en components/ui/route-state.tsx: aquí solo se elige el
// icono y el texto, para que un fallo en cualquier parte de la web se vea
// igual y el error se reporte siempre por el mismo sitio.
export default function FomoError({
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
      icon={Flame}
      title="No hemos podido cargar el FOMO"
      description="Ha fallado la carga de los hilos de tu campus. Prueba a reintentar."
      boundary="fomo"
      homeHref="/"
      homeLabel="Volver al inicio"
    />
  );
}
