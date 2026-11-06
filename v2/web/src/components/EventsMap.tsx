"use client";

// Mapa de eventos + zonas de ocio para la web (paridad con la pestaña Eventos
// de la app movil). Pines violeta = eventos (agrupados si caen casi en el mismo
// punto); puntos pequenos de color = zonas de ocio del catalogo. Encima del
// mapa hay filtros rapidos (Gratis, Hoy, Esta semana) que afectan SOLO a los
// eventos: las zonas son el contexto del mapa y no se tocan.
//
// La integracion con Leaflet (import estatico del CSS, divIcon en vez de los
// iconos por defecto que rompen con el bundler, contenedor por ref) sigue el
// mismo enfoque que LeisureMap para no reinventar los problemas de SSR: este
// fichero se carga siempre con next/dynamic + ssr:false.

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin } from "lucide-react";
import { MADRID_TZ } from "@/lib/event-time";
import RouteOverlay, { type RouteDestination } from "@/components/RouteOverlay";

export interface MapEvent {
  id: string;
  title: string;
  city: string;
  venue: string | null;
  start_date: string;
  category: string;
  price: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface MapSpot {
  id: string;
  name: string;
  city: string;
  category: string;
  latitude: number | null;
  longitude: number | null;
  rating?: number | null;
}

// Nombre legible de la categoría de ocio para los globos. Antes había un emoji
// y un color distinto por categoría: el sistema v3 usa un solo acento y nada de
// emoji como icono.
const spotLabels: Record<string, string> = {
  bar: "Bar",
  restaurante: "Restaurante",
  cafeteria: "Cafetería",
  discoteca: "Discoteca",
  parque: "Parque",
  cultural: "Cultura",
  deportivo: "Deporte",
  coworking: "Coworking",
  pub: "Pub",
};

const VIOLET = "#7C3AED";
const MAX_SPOT_MARKERS = 140;

// Escapado obligatorio: los titulos y los nombres de sitio los escriben los
// usuarios y aqui acaban dentro de un string de HTML (popup de Leaflet).
function esc(value: string | null | undefined): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

// Normaliza texto para comparar nombres de sitio y ciudades (sin tildes).
function norm(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// "Alicante, Espana" -> "alicante": la ciudad de un evento puede venir con cola.
function cityKey(value: string | null | undefined): string {
  return norm(String(value ?? "").split(",")[0]);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      timeZone: MADRID_TZ,
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function priceLabel(price: number | null): string {
  return !price || Number(price) === 0 ? "Gratis" : `${price}€`;
}

function isFree(price: number | null | undefined): boolean {
  return !price || Number(price) === 0;
}

interface Located {
  event: MapEvent;
  lat: number;
  lng: number;
  approx: boolean;
}

interface EventPin {
  key: string;
  lat: number;
  lng: number;
  events: MapEvent[];
  approx: boolean;
}

function centroid(spots: MapSpot[]): { lat: number; lng: number } | null {
  const valid = spots.filter((s) => s.latitude != null && s.longitude != null);
  if (!valid.length) return null;
  const lat = valid.reduce((a, s) => a + (s.latitude as number), 0) / valid.length;
  const lng = valid.reduce((a, s) => a + (s.longitude as number), 0) / valid.length;
  return { lat, lng };
}

// Situa cada evento: coordenada propia (migracion 128) > zona de ocio cuyo
// nombre coincide con el venue > centroide de las zonas de su ciudad. Si no hay
// nada de eso, el evento se cuenta como "sin ubicacion" y se avisa.
function locateEvents(events: MapEvent[], spots: MapSpot[]) {
  const byCity = new Map<string, MapSpot[]>();
  for (const s of spots) {
    if (s.latitude == null || s.longitude == null) continue;
    const k = cityKey(s.city);
    if (!k) continue;
    const list = byCity.get(k);
    if (list) list.push(s);
    else byCity.set(k, [s]);
  }

  const located: Located[] = [];
  let withoutLocation = 0;

  for (const e of events) {
    if (e.latitude != null && e.longitude != null) {
      located.push({ event: e, lat: Number(e.latitude), lng: Number(e.longitude), approx: false });
      continue;
    }
    const citySpots = byCity.get(cityKey(e.city)) ?? [];
    const venue = norm(e.venue);
    const match =
      venue.length > 2
        ? citySpots.find((s) => {
            const n = norm(s.name);
            return n === venue || n.includes(venue) || venue.includes(n);
          })
        : undefined;
    if (match) {
      located.push({ event: e, lat: match.latitude as number, lng: match.longitude as number, approx: false });
      continue;
    }
    const c = centroid(citySpots);
    if (c) {
      located.push({ event: e, lat: c.lat, lng: c.lng, approx: true });
      continue;
    }
    withoutLocation++;
  }

  // Agrupacion de pines cercanos: 3 decimales son ~100 m, suficiente para que
  // los eventos del mismo sitio (o del centroide de la misma ciudad) compartan
  // un unico pin con contador en vez de apilarse uno encima de otro.
  const groups = new Map<string, EventPin>();
  for (const item of located) {
    const key = `${item.lat.toFixed(3)}|${item.lng.toFixed(3)}`;
    const pin = groups.get(key);
    if (pin) {
      pin.events.push(item.event);
      pin.approx = pin.approx && item.approx;
    } else {
      groups.set(key, { key, lat: item.lat, lng: item.lng, events: [item.event], approx: item.approx });
    }
  }

  return { pins: [...groups.values()], withoutLocation };
}

function eventIcon(pin: EventPin) {
  const count = pin.events.length;
  const label =
    count > 1
      ? `<span style="color:#fff;font-size:12px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;">${count}</span>`
      : `<span style="width:8px;height:8px;border-radius:50%;background:#fff;display:block;"></span>`;
  return L.divIcon({
    className: "franky-event-marker",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      min-width:28px;height:28px;padding:0 8px;
      background:${VIOLET};
      border:2px solid #fff;border-radius:999px;
      box-shadow:0 2px 8px rgba(18,16,25,0.28);
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function spotIcon() {
  return L.divIcon({
    className: "franky-spot-marker",
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#fff;border:2px solid ${VIOLET};
      box-shadow:0 1px 3px rgba(18,16,25,0.2);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });
}

// Boton "Cómo llegar" de los popups: abre el overlay de ruta DENTRO de la web
// (nada de sacarte a Google Maps). Los popups de Leaflet son strings de HTML y
// la CSP prohibe los onclick inline, asi que el boton solo lleva una clase y
// data-attributes: el clic lo captura un unico listener delegado que el
// componente cuelga del contenedor del mapa (los eventos click de los popups
// burbujean de forma nativa hasta ahi).
function routeButton(lat: number, lng: number, name: string, color: string): string {
  return `<button type="button" class="franky-route-btn"
    data-lat="${lat}" data-lng="${lng}" data-name="${esc(name)}"
    style="display:inline-block;font-size:11.5px;font-weight:700;color:${color};background:none;border:none;padding:0;cursor:pointer;font-family:inherit;">
    Cómo llegar →
  </button>`;
}

function eventPopup(pin: EventPin): string {
  const rows = pin.events
    .slice(0, 6)
    .map(
      (e) => `
      <a href="/eventos/${esc(e.id)}" style="display:block;text-decoration:none;color:inherit;padding:5px 0;border-top:1px solid #EFEAF7;">
        <strong style="font-size:13px;color:#1F1B2E;">${esc(e.title)}</strong><br/>
        <span style="font-size:11.5px;color:#6B5F84;">${esc(fmtDate(e.start_date))}</span>
        <span style="font-size:11.5px;font-weight:700;color:${isFree(e.price) ? "#059669" : VIOLET};"> · ${esc(priceLabel(e.price))}</span>
      </a>`
    )
    .join("");
  const more =
    pin.events.length > 6
      ? `<div style="font-size:11px;color:#6B5F84;padding-top:5px;">y ${pin.events.length - 6} más en la lista</div>`
      : "";
  const head =
    pin.events.length > 1
      ? `<strong style="font-size:13.5px;color:${VIOLET};">${pin.events.length} eventos aquí</strong>`
      : `<strong style="font-size:13.5px;color:${VIOLET};">Evento</strong>`;
  const place = pin.events[0]?.venue || pin.events[0]?.city || "";
  return `
    <div style="min-width:210px;font-family:Inter,sans-serif;">
      ${head}
      <div style="font-size:11.5px;color:#6B5F84;margin-bottom:2px;">${esc(place)}${pin.approx ? " (aprox.)" : ""}</div>
      ${rows}${more}
      <div style="margin-top:8px;">
        ${routeButton(pin.lat, pin.lng, place || "Evento", VIOLET)}
      </div>
    </div>`;
}

function spotPopup(spot: MapSpot): string {
  return `
    <div style="min-width:190px;font-family:Inter,sans-serif;">
      <strong style="font-size:13.5px;color:#1F1B2E;">${esc(spot.name)}</strong><br/>
      <span style="font-size:11.5px;color:#6B5F84;">${esc(spot.city)}</span>
      ${spot.rating ? `<span style="float:right;font-size:11.5px;color:#6B5F84;font-variant-numeric:tabular-nums;">${esc(String(spot.rating))} / 5</span>` : ""}
      <div style="margin-top:6px;">
        <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid #E7E3EF;color:#6B5F84;">
          ${esc(spotLabels[spot.category] || spot.category)}
        </span>
      </div>
      <div style="margin-top:8px;display:flex;gap:10px;">
        <a href="/ocio/${esc(spot.id)}" style="font-size:11.5px;font-weight:700;color:${VIOLET};text-decoration:none;">Ver la zona →</a>
        ${routeButton(spot.latitude as number, spot.longitude as number, spot.name, "#6B5F84")}
      </div>
    </div>`;
}

type When = "all" | "today" | "week";

export default function EventsMap({ events, spots }: { events: MapEvent[]; spots: MapSpot[] }) {
  const [onlyFree, setOnlyFree] = useState(false);
  const [when, setWhen] = useState<When>("all");
  // Destino del overlay "Cómo llegar": lo rellenan los botones de los popups
  // a traves del listener delegado (ver el efecto de creacion del mapa).
  const [routeTarget, setRouteTarget] = useState<RouteDestination | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const framedRef = useRef(false);

  // Filtros rapidos: solo tocan los eventos, nunca las zonas de ocio.
  const filteredEvents = useMemo(() => {
    if (!onlyFree && when === "all") return events;
    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(23, 59, 59, 999);
    const endWeek = new Date(now);
    endWeek.setDate(endWeek.getDate() + 7);
    return events.filter((e) => {
      if (onlyFree && !isFree(e.price)) return false;
      const d = new Date(e.start_date);
      if (Number.isNaN(d.getTime())) return when === "all";
      if (when === "today" && d > endToday) return false;
      if (when === "week" && d > endWeek) return false;
      return true;
    });
  }, [events, onlyFree, when]);

  const { pins, withoutLocation } = useMemo(
    () => locateEvents(filteredEvents, spots),
    [filteredEvents, spots]
  );

  // Zonas de contexto: las mejor valoradas, sin repetir las que ya tienen un
  // pin de evento justo encima (mismo redondeo que la agrupacion).
  const visibleSpots = useMemo(() => {
    const taken = new Set(pins.map((p) => p.key));
    return spots
      .filter((s) => s.latitude != null && s.longitude != null)
      .filter((s) => !taken.has(`${(s.latitude as number).toFixed(3)}|${(s.longitude as number).toFixed(3)}`))
      .slice(0, MAX_SPOT_MARKERS);
  }, [spots, pins]);

  const hasSomething = pins.length > 0 || visibleSpots.length > 0;

  // Creacion del mapa una sola vez: los filtros rapidos no lo recrean, solo
  // repintan la capa de marcadores (asi no se pierde el zoom del usuario).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current;
    const map = L.map(container, {
      center: [40.4168, -3.7038], // Madrid como encuadre de partida
      zoom: 6,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Delegacion de eventos para los botones "Cómo llegar" de los popups: el
    // popup es HTML string (sin handlers por la CSP), asi que un unico
    // listener en el contenedor recoge el clic y abre el overlay de ruta.
    const onContainerClick = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      const btn = target?.closest?.(".franky-route-btn") as HTMLElement | null;
      if (!btn) return;
      const lat = Number(btn.dataset.lat);
      const lng = Number(btn.dataset.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setRouteTarget({ lat, lng, name: btn.dataset.name || "Destino" });
    };
    container.addEventListener("click", onContainerClick);

    return () => {
      container.removeEventListener("click", onContainerClick);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      framedRef.current = false;
    };
  }, [hasSomething]);

  // Repintado de marcadores cuando cambian los datos o los filtros rapidos.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const markers: L.Marker[] = [];

    for (const spot of visibleSpots) {
      const m = L.marker([spot.latitude as number, spot.longitude as number], {
        icon: spotIcon(),
      });
      m.bindPopup(spotPopup(spot), { maxWidth: 260 });
      m.addTo(layer);
    }

    for (const pin of pins) {
      const m = L.marker([pin.lat, pin.lng], { icon: eventIcon(pin), zIndexOffset: 500 });
      m.bindPopup(eventPopup(pin), { maxWidth: 280 });
      m.addTo(layer);
      markers.push(m);
    }

    // Encuadre inicial sobre los eventos (o sobre las zonas si no hay eventos).
    // Solo la primera vez: despues manda el usuario.
    if (!framedRef.current) {
      const forBounds = markers.length
        ? markers.map((m) => m.getLatLng())
        : visibleSpots.map((s) => L.latLng(s.latitude as number, s.longitude as number));
      if (forBounds.length === 1) {
        map.setView(forBounds[0], 14);
        framedRef.current = true;
      } else if (forBounds.length > 1) {
        try {
          map.fitBounds(L.latLngBounds(forBounds).pad(0.15));
          framedRef.current = true;
        } catch {
          /* sin bounds validos: se queda el encuadre por defecto */
        }
      }
    }
  }, [pins, visibleSpots]);

  const chip = (active: boolean) =>
    `cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
      active
        ? "border-violet bg-violet-50/70 text-violet-deep"
        : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/25"
    }`;

  return (
    <div>
      {/* Filtros rapidos del mapa (solo eventos) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOnlyFree((v) => !v)} className={chip(onlyFree)}
          aria-pressed={onlyFree}>
          Gratis
        </button>
        <button type="button" onClick={() => setWhen((w) => (w === "today" ? "all" : "today"))}
          className={chip(when === "today")} aria-pressed={when === "today"}>
          Hoy
        </button>
        <button type="button" onClick={() => setWhen((w) => (w === "week" ? "all" : "week"))}
          className={chip(when === "week")} aria-pressed={when === "week"}>
          Esta semana
        </button>
        <span className="ml-auto text-xs text-text-muted tabular">
          {pins.reduce((n, p) => n + p.events.length, 0)} evento
          {pins.reduce((n, p) => n + p.events.length, 0) !== 1 ? "s" : ""} en el mapa
          {visibleSpots.length > 0 ? ` · ${visibleSpots.length} zonas de ocio` : ""}
        </span>
      </div>

      {hasSomething ? (
        <div
          ref={containerRef}
          className="z-0 h-[420px] w-full overflow-hidden rounded-2xl border border-border shadow-card lg:h-[540px]"
        />
      ) : (
        // Estado vacio: sin coordenadas o sin datos nunca se enseña un error.
        <div className="flex h-[420px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center lg:h-[540px]">
          <MapPin className="h-7 w-7 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-4 font-heading font-bold text-text-primary">Nada que enseñar en el mapa</p>
          <p className="mt-2 max-w-sm text-sm text-text-muted">
            Estos eventos todavía no tienen una ubicación exacta. Cámbiate a la lista para verlos
            todos.
          </p>
        </div>
      )}

      {/* Los eventos sin coordenadas no se pierden: se cuentan aquí */}
      {withoutLocation > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          {withoutLocation} evento{withoutLocation !== 1 ? "s" : ""} sin ubicación · míralos en la
          lista
        </p>
      )}

      {/* Overlay de ruta dentro de la web: distancia y tiempo reales de OSRM */}
      {routeTarget && (
        <RouteOverlay destination={routeTarget} onClose={() => setRouteTarget(null)} />
      )}
    </div>
  );
}
