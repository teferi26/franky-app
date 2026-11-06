"use client";

// Overlay "Cómo llegar" DENTRO de la web: en vez de saltar a Google Maps (que
// te saca de Franky), pintamos el camino sobre un mapa Leaflet propio. El
// trazado, la distancia y el tiempo vienen SIEMPRE de la respuesta de OSRM
// (servicio publico de rutas, sin clave): jamas se inventan. Si OSRM no
// responde, caemos a una linea recta con la distancia haversine y SIN tiempo,
// avisando claramente de que no pudimos trazar el camino exacto.
// Paridad con la pantalla de ruta de la app movil (v2/mobile/app/ruta.tsx).
//
// Este fichero importa Leaflet directamente, asi que debe cargarse siempre en
// cliente: o dentro de un componente ya cargado con next/dynamic + ssr:false
// (caso EventsMap) o envuelto el mismo en next/dynamic (caso ficha de ocio).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Footprints, Car, LocateFixed } from "lucide-react";

export interface RouteDestination {
  lat: number;
  lng: number;
  name: string;
}

type Mode = "foot" | "driving";

interface RouteResult {
  // Polilinea en [lat, lng] lista para Leaflet.
  line: [number, number][];
  // Metros: de OSRM, o haversine solo en el respaldo de linea recta.
  meters: number;
  // Segundos: SOLO de OSRM. En el respaldo es null y no se enseña tiempo.
  seconds: number | null;
  fallback: boolean;
}

type LocState = "pending" | "granted" | "denied" | "unavailable";

const VIOLET = "#7C3AED";
const OSRM_BASE = "https://router.project-osrm.org/route/v1";

// Distancia en linea recta (haversine), en metros. Solo para el respaldo.
function straightMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R_EARTH = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// Llama a OSRM con el perfil pedido. Devuelve null si algo falla o si la
// respuesta no trae distancia y duracion reales: nunca rellenamos con
// estimaciones propias.
async function fetchOsrm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: Mode
): Promise<RouteResult | null> {
  const url =
    `${OSRM_BASE}/${mode}/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    "?overview=full&geometries=geojson";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.routes?.[0];
    const coords: unknown = route?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    if (typeof route.distance !== "number" || typeof route.duration !== "number") return null;
    // GeoJSON viene como [lng, lat]: hay que darle la vuelta para Leaflet.
    const line = (coords as [number, number][]).map(
      ([lng, lat]) => [lat, lng] as [number, number]
    );
    return { line, meters: route.distance, seconds: route.duration, fallback: false };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pin del destino: gota violeta de marca, igual que en el resto de mapas.
function destIcon() {
  return L.divIcon({
    className: "franky-route-dest",
    html: `<div style="
      display:flex;align-items:center;justify-content:center;
      width:34px;height:34px;background:${VIOLET};
      border:2.5px solid #fff;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "><span style="transform:rotate(45deg);font-size:14px;">📍</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

// Punto azul del origen (tu ubicacion), estilo "estas aqui".
function originIcon() {
  return L.divIcon({
    className: "franky-route-origin",
    html: `<div style="
      width:16px;height:16px;border-radius:50%;
      background:#2563eb;border:3px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function RouteOverlay({
  destination,
  onClose,
}: {
  destination: RouteDestination;
  onClose: () => void;
}) {
  const { lat, lng, name } = destination;

  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<LocState>("pending");
  const [mode, setMode] = useState<Mode>("foot");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  // Cache por modo: al alternar A pie / En coche no se repite la llamada.
  // Los respaldos de linea recta NO se cachean, para reintentar OSRM al volver.
  const cacheRef = useRef<Partial<Record<Mode, RouteResult>>>({});

  // Pide la geolocalizacion del navegador. Sin permiso no hay ruta, pero el
  // destino se sigue enseñando en el mapa con un mensaje claro.
  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocState("unavailable");
      return;
    }
    setLocState("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocState("granted");
      },
      (err) => {
        setLocState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Al abrir: pedir ubicacion una vez.
  useEffect(() => {
    requestLocation();
  }, []);

  // Accesibilidad del modal: foco inicial en la X, Escape cierra, Tab queda
  // atrapado dentro del dialogo y al cerrar se devuelve el foco donde estaba.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, []);

  // Creacion del mapa del overlay (una sola vez), centrado en el destino.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    L.marker([lat, lng], { icon: destIcon() }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // El contenedor acaba de pintarse dentro del modal: recalcular tamaño.
    requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch {
        /* el mapa pudo cerrarse antes del frame: no pasa nada */
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculo de la ruta con el perfil elegido cuando ya tenemos origen.
  useEffect(() => {
    if (!origin) return;
    const cached = cacheRef.current[mode];
    if (cached) {
      setResult(cached);
      return;
    }
    let cancelled = false;
    setLoadingRoute(true);
    (async () => {
      const r = await fetchOsrm(origin, { lat, lng }, mode);
      if (cancelled) return;
      if (r) {
        cacheRef.current[mode] = r;
        setResult(r);
      } else {
        // Respaldo: linea recta con distancia haversine y SIN tiempo.
        setResult({
          line: [
            [origin.lat, origin.lng],
            [lat, lng],
          ],
          meters: straightMeters(origin, { lat, lng }),
          seconds: null,
          fallback: true,
        });
      }
      setLoadingRoute(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, mode, lat, lng]);

  // Pintado de la ruta y del origen + encuadre sobre el camino completo.
  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (result && result.line.length > 1) {
      L.polyline(result.line, {
        color: VIOLET,
        weight: 5,
        opacity: 0.9,
        // La linea recta del respaldo va discontinua para que se note que no
        // es el camino real.
        dashArray: result.fallback ? "8 10" : undefined,
      }).addTo(layer);
    }
    if (origin) {
      L.marker([origin.lat, origin.lng], { icon: originIcon() }).addTo(layer);
    }
    try {
      if (result && result.line.length > 1) {
        map.fitBounds(L.latLngBounds(result.line).pad(0.18));
      } else if (origin) {
        map.fitBounds(
          L.latLngBounds([
            [origin.lat, origin.lng],
            [lat, lng],
          ]).pad(0.18)
        );
      }
    } catch {
      /* sin bounds validos: se queda el encuadre del destino */
    }
  }, [result, origin, lat, lng]);

  // Mensajes de estado, siempre honestos: si no hay dato, se dice.
  const note =
    locState === "denied"
      ? "Has bloqueado la ubicación en el navegador. Actívala para calcular el camino desde donde estás."
      : locState === "unavailable"
      ? "No pudimos obtener tu ubicación, así que no podemos calcular el camino."
      : result?.fallback
      ? "No pudimos trazar el camino exacto: te enseñamos la línea recta y su distancia. Sin ruta real no damos tiempo."
      : null;

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-colors cursor-pointer ${
      active
        ? "bg-violet text-white border-violet"
        : "bg-white text-text-secondary border-border hover:bg-violet-50"
    }`;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-6">
      {/* Fondo: clic fuera cierra */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Cómo llegar a ${name}`}
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-border-light"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-light">
          <h2 className="font-bold font-heading text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-violet" />
            Cómo llegar
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-full text-text-secondary hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mapa propio del overlay */}
        <div ref={mapContainerRef} className="w-full h-[260px] sm:h-[320px] z-0" />

        <div className="px-5 py-4 space-y-3">
          <p className="font-semibold text-sm text-text-primary truncate" title={name}>
            {name}
          </p>

          {/* Modo de transporte: recalcula (o saca de cache) al cambiar */}
          <div className="flex items-center gap-2" role="group" aria-label="Modo de transporte">
            <button
              type="button"
              onClick={() => setMode("foot")}
              className={chip(mode === "foot")}
              aria-pressed={mode === "foot"}
            >
              <Footprints className="h-4 w-4" />
              A pie
            </button>
            <button
              type="button"
              onClick={() => setMode("driving")}
              className={chip(mode === "driving")}
              aria-pressed={mode === "driving"}
            >
              <Car className="h-4 w-4" />
              En coche
            </button>
          </div>

          {/* Datos: SIEMPRE los de OSRM. En el respaldo, solo distancia. */}
          {locState === "pending" && !origin ? (
            <p className="text-sm text-text-muted">Pidiendo tu ubicación al navegador…</p>
          ) : loadingRoute ? (
            <p className="text-sm text-text-muted animate-pulse">Calculando el camino…</p>
          ) : result ? (
            <div className="flex items-end gap-8">
              <div>
                <p className="text-xs text-text-muted">
                  {result.fallback ? "Distancia (línea recta)" : "Distancia"}
                </p>
                <p className="text-xl font-extrabold font-heading text-text-primary">
                  {fmtDistance(result.meters)}
                </p>
              </div>
              {result.seconds != null && (
                <div>
                  <p className="text-xs text-text-muted">Tiempo estimado</p>
                  <p className="text-xl font-extrabold font-heading text-text-primary">
                    {fmtDuration(result.seconds)}
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {note && <p className="text-xs text-text-muted">{note}</p>}

          {/* Reintento cuando no hubo ubicacion */}
          {(locState === "denied" || locState === "unavailable") && (
            <button
              type="button"
              onClick={requestLocation}
              className="inline-flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-xl gradient-bg text-white text-sm font-semibold hover:shadow-glow transition-all cursor-pointer"
            >
              <LocateFixed className="h-4 w-4" />
              Reintentar con mi ubicación
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
