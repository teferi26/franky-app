"use client";

// Conmutador Lista / Mapa del listado de eventos.
//
// La LISTA sigue siendo el modo por defecto: es la que se renderiza en el
// servidor y la que ve Google, asi que el SEO de /eventos no cambia. El mapa
// es el segundo modo y su codigo (Leaflet + el componente EventsMap) se
// descarga con next/dynamic SOLO cuando el usuario pulsa "Mapa": si nadie lo
// pulsa, no entra ni un kilobyte de Leaflet en la carga inicial.

import { useState } from "react";
import dynamic from "next/dynamic";
import { LayoutGrid, Map as MapIcon } from "lucide-react";
import type { MapEvent, MapSpot } from "@/components/EventsMap";

const EventsMap = dynamic(() => import("@/components/EventsMap"), {
  ssr: false, // Leaflet toca window: nunca en el servidor
  loading: () => (
    <div className="skeleton-shimmer flex h-[420px] w-full items-center justify-center rounded-3xl border border-border bg-bg-secondary lg:h-[540px]">
      <MapIcon className="h-8 w-8 text-text-muted/50" strokeWidth={1.5} aria-hidden="true" />
    </div>
  ),
});

interface Props {
  events: MapEvent[];
  spots: MapSpot[];
  summary: string;
  children: React.ReactNode;
}

export default function EventsViewSwitch({ events, spots, summary, children }: Props) {
  const [mode, setMode] = useState<"lista" | "mapa">("lista");

  // Segmento neutro (mismo lenguaje que Tabs v3): la activa en blanco con sombra hairline.
  const tab = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-[color,background-color,box-shadow] duration-200 cursor-pointer ${
      active
        ? "bg-bg-primary text-text-primary font-semibold shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
        : "text-text-muted hover:text-text-primary"
    }`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-light pt-5">
        <p className="text-sm text-text-muted tabular">{summary}</p>
        <div className="inline-flex items-center gap-1 rounded-xl bg-bg-secondary p-1">
          <button
            type="button"
            onClick={() => setMode("lista")}
            className={tab(mode === "lista")}
            aria-pressed={mode === "lista"}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setMode("mapa")}
            className={tab(mode === "mapa")}
            aria-pressed={mode === "mapa"}
          >
            <MapIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Mapa
          </button>
        </div>
      </div>

      {mode === "lista" ? children : <EventsMap events={events} spots={spots} />}
    </div>
  );
}
