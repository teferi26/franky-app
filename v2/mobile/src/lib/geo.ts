// Utilidades de geolocalización para el mapa de eventos.
//
// Los eventos NO tienen coordenadas propias (venue/city son texto libre que
// escribe el organizador), pero las zonas de ocio del catálogo real (migración
// 121, datos Wikidata) sí. La estrategia es anclar cada evento a su zona de
// ocio cuando el nombre del venue coincide con el catálogo y, si no hay
// coincidencia, agruparlo en el centroide de las zonas de su ciudad.
import type { EventItem, LeisureSpot } from './types';

// Campos mínimos de una zona para pintar el mapa sin bajar el catálogo entero.
export type MapSpot = Pick<
  LeisureSpot,
  'id' | 'name' | 'city' | 'category' | 'rating' | 'image_url' | 'tagline' | 'google_maps_url'
> & { latitude: number; longitude: number };

// Un pin del mapa: o una zona de ocio, o un grupo de eventos anclado a una
// zona concreta, o un grupo de eventos a nivel de ciudad (sin venue conocido).
export type EventPin = {
  key: string;
  latitude: number;
  longitude: number;
  events: EventItem[];
  spot: MapSpot | null; // null = pin de ciudad (centroide)
  city: string;         // etiqueta legible
};

// Normaliza texto libre: minúsculas, sin acentos, espacios colapsados.
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clave de ciudad: "Alicante, San Juan" → "alicante"; "Alacant" → "alicante".
const CITY_ALIASES: Record<string, string> = {
  alacant: 'alicante',
  'sant vicent del raspeig': 'san vicente del raspeig',
};
export function cityKey(s: string | null | undefined): string {
  const base = norm((s ?? '').split(',')[0]);
  return CITY_ALIASES[base] ?? base;
}

// ¿El venue del evento "suena" a esta zona? Comparación por tokens (no por
// substring: "Casa Pepe" no debe emparejar con "Casa de la Cultura"): todos
// los tokens del nombre más corto deben estar en el más largo, y al menos uno
// de los comunes debe ser distintivo (≥ 4 letras) para no anclar por palabras
// genéricas tipo "bar" o "club".
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'y', 'en', 'al', 'a']);
function tokens(s: string): string[] {
  return norm(s).split(' ').filter(t => t && !STOPWORDS.has(t));
}
function venueMatches(venueTokens: string[], spotTokens: string[]): boolean {
  const [shorter, longer] = venueTokens.length <= spotTokens.length
    ? [venueTokens, spotTokens] : [spotTokens, venueTokens];
  if (!shorter.length) return false;
  const set = new Set(longer);
  if (!shorter.every(t => set.has(t))) return false;
  return shorter.some(t => t.length >= 4);
}

// Centroide (mediana, robusta frente a outliers) de un conjunto de puntos.
export function centroid(points: { latitude: number; longitude: number }[]):
  { latitude: number; longitude: number } | null {
  if (!points.length) return null;
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return { latitude: med(points.map(p => p.latitude)), longitude: med(points.map(p => p.longitude)) };
}

// Construye los pines de eventos a partir de los eventos visibles y las zonas
// descargadas por ciudad. Los eventos cuyo venue coincide con una zona se
// anclan a sus coordenadas exactas; el resto se agrupa por ciudad en el
// centroide de sus zonas. Eventos de ciudades sin zonas en catálogo no se
// pueden situar y quedan fuera del mapa (siguen en la lista).
export function buildEventPins(events: EventItem[], spotsByCity: Map<string, MapSpot[]>): EventPin[] {
  const bySpot = new Map<string, { spot: MapSpot; events: EventItem[] }>();
  const byCity = new Map<string, EventItem[]>();

  // Pines con coordenadas propias (128): el organizador fijó el punto exacto
  // en el formulario; agrupamos por coordenada redondeada (~10 m).
  const byCoord = new Map<string, { latitude: number; longitude: number; events: EventItem[]; city: string }>();

  for (const e of events) {
    if (e.latitude != null && e.longitude != null) {
      const key = `${e.latitude.toFixed(4)},${e.longitude.toFixed(4)}`;
      const cur = byCoord.get(key) ?? { latitude: e.latitude, longitude: e.longitude, events: [], city: (e.city ?? '').split(',')[0].trim() };
      cur.events.push(e);
      byCoord.set(key, cur);
      continue;
    }
    const ck = cityKey(e.city);
    const spots = spotsByCity.get(ck) ?? [];
    const v = tokens(e.venue ?? '');
    const match = v.length ? spots.find(sp => venueMatches(v, tokens(sp.name))) : undefined;
    if (match) {
      const cur = bySpot.get(match.id) ?? { spot: match, events: [] };
      cur.events.push(e);
      bySpot.set(match.id, cur);
    } else {
      byCity.set(ck, [...(byCity.get(ck) ?? []), e]);
    }
  }

  const pins: EventPin[] = [];
  for (const [key, g] of byCoord) {
    pins.push({ key: `coord:${key}`, latitude: g.latitude, longitude: g.longitude, events: g.events, spot: null, city: g.city });
  }
  for (const { spot, events: evs } of bySpot.values()) {
    pins.push({
      key: `spot:${spot.id}`, latitude: spot.latitude, longitude: spot.longitude,
      events: evs, spot, city: spot.city,
    });
  }
  for (const [ck, evs] of byCity) {
    const c = centroid(spotsByCity.get(ck) ?? []);
    if (!c) continue; // ciudad sin zonas en catálogo: no hay dónde pintarla
    pins.push({
      key: `city:${ck}`, latitude: c.latitude, longitude: c.longitude,
      events: evs, spot: null, city: evs[0]?.city?.split(',')[0]?.trim() || ck,
    });
  }
  return pins;
}

// Un grupo de zonas agrupadas por proximidad para el clustering del mapa.
// spots.length === 1 → se pinta el emoji de la zona; > 1 → un círculo con el
// número que, al tocarlo, hace zoom.
export type ZoneCluster = {
  key: string;
  latitude: number;
  longitude: number;
  spots: MapSpot[];
};

// Clustering simple por zoom: agrupa las zonas en celdas de una rejilla en
// coordenadas del mundo cuyo tamaño depende del latitudeDelta actual. Muy de
// cerca (delta pequeño) no agrupa nada (cada zona con su emoji); alejado, las
// zonas próximas caen en la misma celda y se pintan como un solo círculo con
// el número. Las celdas son fijas en el mundo, así que hacer paneo con el mismo
// zoom NO cambia la agrupación (solo cambia al acercar o alejar).
export function clusterSpots(spots: MapSpot[], latitudeDelta: number): ZoneCluster[] {
  // Umbral de cerca: por debajo de este delta no tiene sentido agrupar.
  if (latitudeDelta <= 0.035 || spots.length <= 1) {
    return spots.map(s => ({ key: `z:${s.id}`, latitude: s.latitude, longitude: s.longitude, spots: [s] }));
  }
  const cell = latitudeDelta * 0.14; // ~14% del alto visible por celda
  const groups = new Map<string, MapSpot[]>();
  for (const s of spots) {
    const gx = Math.floor(s.longitude / cell);
    const gy = Math.floor(s.latitude / cell);
    const k = `${gx}:${gy}`;
    const arr = groups.get(k);
    if (arr) arr.push(s); else groups.set(k, [s]);
  }
  const out: ZoneCluster[] = [];
  for (const [k, arr] of groups) {
    if (arr.length === 1) {
      out.push({ key: `z:${arr[0].id}`, latitude: arr[0].latitude, longitude: arr[0].longitude, spots: arr });
    } else {
      const c = centroid(arr);
      if (c) out.push({ key: `c:${k}`, latitude: c.latitude, longitude: c.longitude, spots: arr });
    }
  }
  return out;
}

// Región inicial del mapa: encuadra los pines de eventos (o las zonas si no
// hay eventos posicionables); España entera como último recurso.
export function initialRegion(points: { latitude: number; longitude: number }[]) {
  if (!points.length) {
    return { latitude: 40.2, longitude: -3.7, latitudeDelta: 9, longitudeDelta: 9 };
  }
  const lats = points.map(p => p.latitude);
  const lngs = points.map(p => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.5),
  };
}
