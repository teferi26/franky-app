"use client";

// Boton "Cómo llegar" de la ficha de ocio: abre el overlay de ruta DENTRO de
// la web (distancia y tiempo reales de OSRM, a pie o en coche) en vez de
// sacarte a Google Maps. Es un client component minimo para que la ficha siga
// siendo un server component con ISR; el overlay (y Leaflet con el) solo se
// descarga cuando alguien pulsa el boton, con el mismo patron next/dynamic +
// ssr:false que usan los mapas existentes.

import { useState } from "react";
import dynamic from "next/dynamic";

const RouteOverlay = dynamic(() => import("@/components/RouteOverlay"), {
  ssr: false,
});

export default function RouteButton({
  lat,
  lng,
  name,
  className,
  children,
}: {
  lat: number;
  lng: number;
  name: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <RouteOverlay destination={{ lat, lng, name }} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
