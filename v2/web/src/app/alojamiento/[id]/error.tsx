"use client";

import { Home } from "lucide-react";
import { RouteError } from "@/components/ui/route-state";

// Boundary de sección. La pantalla (ilustración de marca, botón de reintentar
// y vuelta atrás) vive en components/ui/route-state.tsx: aquí solo se elige el
// icono y el texto, para que un fallo en cualquier parte de la web se vea
// igual y el error se reporte siempre por el mismo sitio.
export default function PisoError({
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
      icon={Home}
      title="No hemos podido cargar este piso"
      description="Ha fallado la carga del anuncio. Prueba a reintentar o vuelve al listado."
      boundary="alojamiento-detalle"
      homeHref="/alojamiento"
      homeLabel="Ver todos los pisos"
    />
  );
}
