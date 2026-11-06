// Mapa de eventos sobre las zonas de ocio reales (catálogo Wikidata, migración
// 121). Pines azules = eventos (anclados a su zona si el venue coincide, o al
// centroide de la ciudad); puntos grises = zonas de ocio mejor valoradas de
// las ciudades con eventos. Tocar un pin abre la tarjeta inferior con el CTA
// de apuntarse (gratis) o comprar entrada (de pago).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Star, MapPin, X, LocateFixed, Check, PartyPopper, BookOpen, Trophy, Drama,
  Handshake, Store, Pin, Disc3, Beer, Wine, UtensilsCrossed, Coffee, Landmark,
  Trees, Dumbbell, Laptop, Navigation, Plus, type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
// Import estático: este archivo solo se resuelve en iOS/Android; la web usa
// EventsMap.web.tsx (resolución por plataforma de Metro) y nunca lo carga.
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';
import { Tap, Btn, Pill } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getCityMapSpots, joinEvent } from '@/lib/api';
import { primeEventCache } from '@/lib/event-cache';
import { getMapSpotsInBox, cachedMapSpotsInBox, type MapBox } from '@/lib/leisure-pages';
import { ensureLocationPermission, requestLocationPermission, locateFast, getMyMapCity, cachedMyMapCity, type Coords } from '@/lib/map-location';
import { buildEventPins, cityKey, norm, initialRegion, centroid, clusterSpots, type EventPin, type MapSpot, type ZoneCluster } from '@/lib/geo';
import { eur, dateShort, typeLabel } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT, SHADOW } from '@/theme';
import type { EventItem } from '@/lib/types';

// Iconos por categoría en vez de los emojis de lib/format (eventEmoji /
// zoneEmoji): un emoji cambia de dibujo según el sistema, no se tiñe con el
// tema y en un pin de mapa se ve borroso. Un icono vectorial, no.
const EVENT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};
const ZONE_ICON: Record<string, LucideIcon> = {
  discoteca: Disc3, pub: Beer, bar: Wine, restaurante: UtensilsCrossed,
  cafeteria: Coffee, cultural: Landmark, parque: Trees, deportivo: Dumbbell,
  coworking: Laptop,
};

// Caché de zonas por ciudad (viven mientras viva la app: el catálogo no cambia
// en mitad de una sesión y así volver al mapa es instantáneo).
const spotCache = new Map<string, MapSpot[]>();

// Categorías de zona con las que tiene sentido filtrar el mapa.
const ZONE_CATS = ['todos', 'discoteca', 'pub', 'bar', 'restaurante', 'cafeteria', 'cultural'];
const MAX_ZONE_MARKERS = 90;

// Icono dominante de un grupo de eventos (el de la categoría más repetida).
function dominantIcon(events: EventItem[]): LucideIcon {
  const count = new Map<string, number>();
  for (const e of events) count.set(e.category, (count.get(e.category) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return EVENT_ICON[top ?? 'otro'] ?? Pin;
}

type Selected = { kind: 'events'; pin: EventPin } | { kind: 'spot'; spot: MapSpot };

// Chip flotante ligero para los filtros rápidos sobre el mapa (Gratis, Hoy,
// Esta semana): discreto y de una sola línea, sin abrir el panel completo.
function QuickChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Tap haptic onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={{
        backgroundColor: active ? C.blue : 'rgba(255,255,255,0.94)',
        borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 8, minHeight: 34, justifyContent: 'center',
        borderWidth: 0.5, borderColor: active ? C.blue : C.border,
        ...SHADOW.card,
      }}>
      {/* El chip flota sobre el MAPA, que es claro en los tres temas, así que
          el fondo es blanco fijo. Por eso el texto NO puede ser C.text: en modo
          oscuro sería casi blanco sobre blanco (era ilegible). Color fijo. */}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, fontFamily: FONT.semibold, letterSpacing: -0.1, color: active ? C.onAccent : '#1F1F1F' }}>{label}</Text>
    </Tap>
  );
}

// (La creación de eventos ya es nativa: /crear-evento, con la zona prefijada
// por params. El formulario web completo queda para vender entradas.)

// "Cómo llegar" se queda DENTRO de Franky: abre /ruta, que pinta el camino
// sobre el mapa de la app con distancia y tiempo. Antes saltaba a Google/Apple
// Maps y sacaba al usuario de la aplicación.
function directionsHref(name: string, lat: number, lng: number) {
  return { pathname: '/ruta' as const, params: { lat: String(lat), lng: String(lng), name } };
}

// Memoizada: la tarjeta inferior se re-renderiza al apuntarse a CUALQUIER
// evento del pin, y estas filas llevan imagen.
const EventRow = React.memo(function EventRow({ e, joined, busy, onJoin, onOpen }: {
  e: EventItem; joined: boolean; busy: boolean;
  onJoin: () => void; onOpen: () => void;
}) {
  const free = !e.price || Number(e.price) === 0;
  const CatIcon = EVENT_ICON[e.category] ?? Pin;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 }}>
      <Tap onPress={onOpen} haptic={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
        accessibilityLabel={e.title} accessibilityHint="Abre la ficha del evento">
        {e.image_url ? (
          <Image source={{ uri: e.image_url }} recyclingKey={e.id} cachePolicy="memory-disk" transition={120}
            style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.input }} contentFit="cover" />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon size={20} color={C.blue} strokeWidth={2} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{e.title}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
            {dateShort(e.start_date)} · {free ? 'Gratis' : eur(e.price)}
          </Text>
        </View>
      </Tap>
      {joined
        ? <Pill label="Apuntado" tone="green" icon={Check} />
        : <Btn small busy={busy} label={free ? 'Apuntarme' : 'Entradas'} onPress={free ? onJoin : onOpen} />}
    </View>
  );
}, (prev, next) => prev.e === next.e && prev.joined === next.joined && prev.busy === next.busy);

// Región recordada entre montajes: alternar Lista/Mapa desmonta el mapa, y al
// volver debe aparecer donde estaba, no en toda España.
let rememberedView: { region: Region; level: number } | null = null;

// Prioridad del encuadre automático: lo más fiable manda y nunca se pisa con
// algo peor. Si el usuario mueve el mapa, ya no se le mueve solo.
const FRAME = { events: 1, city: 2, lastKnown: 3, gps: 4, user: 5 } as const;
const SPAIN: Region = { latitude: 40.2, longitude: -3.7, latitudeDelta: 9, longitudeDelta: 9 };

function regionAround(c: Coords, delta = 0.04): Region {
  return { latitude: c.latitude, longitude: c.longitude, latitudeDelta: delta, longitudeDelta: delta };
}

// Caja algo mayor que lo visible para que un paneo corto no deje huecos.
function boxFor(r: Region, grow = 1.4): MapBox {
  const dLat = (r.latitudeDelta * grow) / 2;
  const dLng = (r.longitudeDelta * grow) / 2;
  return { minLat: r.latitude - dLat, maxLat: r.latitude + dLat, minLng: r.longitude - dLng, maxLng: r.longitude + dLng };
}
function inBox(b: MapBox, p: { latitude: number; longitude: number }) {
  return p.latitude >= b.minLat && p.latitude <= b.maxLat && p.longitude >= b.minLng && p.longitude <= b.maxLng;
}

// Marcadores memoizados: abrir la tarjeta, apuntarse o tocar un filtro rápido
// no vuelve a mandar al mapa nativo cada marcador (solo cambian los suyos).
const ZoneMarker = React.memo(function ZoneMarker({ cl, tracks, onCluster, onSpot }: {
  cl: ZoneCluster; tracks: boolean;
  onCluster: (cl: ZoneCluster) => void; onSpot: (s: MapSpot) => void;
}) {
  // Cluster con varias zonas: círculo con el número; al tocar, zoom.
  if (cl.spots.length > 1) {
    return (
      <Marker
        coordinate={{ latitude: cl.latitude, longitude: cl.longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={tracks}
        onPress={() => onCluster(cl)}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: `${C.blue}2E`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{
              minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5, backgroundColor: '#fff',
              borderWidth: 1.5, borderColor: C.blue, alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            }}>
              <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 12, fontFamily: FONT.heading, color: C.blue }}>{cl.spots.length}</Text>
            </View>
          </View>
        </View>
      </Marker>
    );
  }
  // Zona suelta: el icono de la categoría (antes era un emoji).
  const s = cl.spots[0];
  const ZoneIcon = ZONE_ICON[s.category] ?? MapPin;
  return (
    <Marker
      coordinate={{ latitude: s.latitude, longitude: s.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracks}
      onPress={() => onSpot(s)}>
      {/* Contenedor de 44pt para un touch target decente; el icono dice
          la categoría de un vistazo. */}
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          borderWidth: 1, borderColor: C.border,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}>
          <ZoneIcon size={14} color={C.blueDeep} strokeWidth={2.2} />
        </View>
      </View>
    </Marker>
  );
});

const EventMarker = React.memo(function EventMarker({ pin, tracks, onPin }: {
  pin: EventPin; tracks: boolean; onPin: (p: EventPin) => void;
}) {
  const PinIcon = dominantIcon(pin.events);
  return (
    <Marker
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={10}
      tracksViewChanges={tracks}
      onPress={() => onPin(pin)}>
      <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 7,
          backgroundColor: C.blue, borderWidth: 2.5, borderColor: '#fff',
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3,
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}>
          <PinIcon size={15} color={C.onAccent} strokeWidth={2.4} />
          {pin.events.length > 1 ? (
            <Text maxFontSizeMultiplier={1.2} style={{ color: C.onAccent, fontSize: 12, fontFamily: FONT.heading }}>{pin.events.length}</Text>
          ) : null}
        </View>
      </View>
    </Marker>
  );
});

// Memoizado: abrir el panel de filtros de la pantalla o cualquier otro estado
// ajeno no vuelve a renderizar el mapa si sus eventos y su filtro no cambian.
export const EventsMap = React.memo(function EventsMap({ events, zoneCat = 'todos' }: { events: EventItem[]; zoneCat?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Hueco para que la píldora del tab bar flotante no tape la tarjeta.
  const bottomClear = Math.max(insets.bottom, 10) + 82;
  const [spotsVersion, setSpotsVersion] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [joining, setJoining] = useState<string | null>(null);
  // Los marcadores con vista custom se "congelan" (snapshot nativa) con
  // tracksViewChanges=false; si se congela antes del primer pintado salen en
  // blanco (bug conocido de react-native-maps). Se deja rastrear un instante
  // tras cada cambio de marcadores y después se congela para no re-renderizar
  // cada vista en cada frame del mapa.
  const [trackMarkers, setTrackMarkers] = useState(true);
  // Mi ubicación: con permiso, el punto azul del sistema y el encuadre en ti.
  const [hasLocationPerm, setHasLocationPerm] = useState(false);
  // Zoom actual (latitudeDelta) para el clustering. Empieza en el delta del
  // encuadre por ciudad; se actualiza al acercar o alejar.
  const [mapDelta, setMapDelta] = useState(rememberedView?.region.latitudeDelta ?? 0.06);
  const mapDeltaRef = useRef(mapDelta);
  mapDeltaRef.current = mapDelta;
  // Región visible (solo se actualiza con movimientos grandes): decide qué
  // zonas se piden y se pintan.
  const [viewRegion, setViewRegion] = useState<Region | null>(rememberedView?.region ?? null);
  const viewRegionRef = useRef(viewRegion);
  viewRegionRef.current = viewRegion;
  // Filtros rápidos sobre el mapa (encima de los pines de eventos, sin panel).
  const [quickFree, setQuickFree] = useState(false);
  const [quickWhen, setQuickWhen] = useState<'all' | 'today' | 'week'>('all');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // ── Encuadre ──────────────────────────────────────────────────────────
  const mapRef = useRef<MapView | null>(null);
  const mapReady = useRef(false);
  const pendingRegion = useRef<Region | null>(null);
  const frameLevel = useRef<number>(rememberedView?.level ?? 0);
  const moveTo = useCallback((r: Region, level: number, duration = 450) => {
    if (level <= frameLevel.current) return;
    frameLevel.current = level;
    rememberedView = { region: r, level };
    if (!mapReady.current || !mapRef.current) { pendingRegion.current = r; return; }
    mapRef.current.animateToRegion(r, duration);
  }, []);
  const onMapReady = useCallback(() => {
    mapReady.current = true;
    const r = pendingRegion.current;
    pendingRegion.current = null;
    if (r) mapRef.current?.animateToRegion(r, 0);
  }, []);

  // Ubicación primero y sin bloquear nada: el mapa ya está pintado con la
  // región por defecto mientras tanto, y los eventos se cargan en paralelo
  // (vienen de la pantalla). La última posición conocida centra al instante
  // y el GPS la afina por detrás.
  useEffect(() => {
    (async () => {
      const granted = await ensureLocationPermission(true);
      if (!alive.current) return;
      setHasLocationPerm(granted);
      if (!granted) return;
      await locateFast((c, precise) => {
        if (!alive.current) return;
        moveTo(regionAround(c), precise ? FRAME.gps : FRAME.lastKnown, precise ? 500 : 250);
      });
    })();
  }, [moveTo]);

  // Ciudad de la universidad del usuario: sin ubicación, el mapa se encuadra
  // ahí; sus zonas se descargan siempre, haya o no eventos en esa ciudad.
  const [uniCity, setUniCity] = useState<string | null>(() => cachedMyMapCity());
  useEffect(() => {
    getMyMapCity().then(c => { if (alive.current && c) setUniCity(c); }).catch(() => {});
  }, []);

  // Ciudades (normalizadas) presentes en los eventos + la de la universidad
  // del usuario → descarga sus zonas (para anclar eventos a su local).
  const cityQueries = useMemo(() => {
    const m = new Map<string, string>(); // cityKey → texto crudo para el ilike
    for (const e of events) {
      const ck = cityKey(e.city);
      if (ck && !m.has(ck)) m.set(ck, (e.city ?? '').split(',')[0].trim());
    }
    if (uniCity) {
      const ck = cityKey(uniCity);
      if (ck && !m.has(ck)) m.set(ck, uniCity.split(',')[0].trim());
    }
    return m;
  }, [events, uniCity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = [...cityQueries].filter(([ck]) => !spotCache.has(ck));
      if (!missing.length) return;
      await Promise.all(missing.map(async ([ck, raw]) => {
        try {
          let { rows } = await getCityMapSpots(raw);
          // El texto crudo puede venir con alias ("Alacant") que no existe en
          // el catálogo: reintenta con la clave canónica ("alicante").
          if (!rows.length && norm(raw) !== ck) ({ rows } = await getCityMapSpots(ck));
          spotCache.set(ck, rows.filter(s => s.latitude != null && s.longitude != null));
          // Cada ciudad se pinta en cuanto llega, sin esperar a las demás.
          if (!cancelled && alive.current) setSpotsVersion(v => v + 1);
        } catch {
          // Sin red: el mapa se queda sin zonas de esa ciudad, no es fatal.
        }
      }));
    })();
    return () => { cancelled = true; };
  }, [cityQueries]);

  const spotsByCity = useMemo(() => {
    void spotsVersion; // recalcular cuando termina una descarga
    const m = new Map<string, MapSpot[]>();
    for (const ck of cityQueries.keys()) m.set(ck, spotCache.get(ck) ?? []);
    return m;
  }, [cityQueries, spotsVersion]);

  // Zonas de la región visible (tope MAP_BOX_LIMIT), para que el mapa tenga
  // contexto también donde estás aunque no haya eventos en tu ciudad.
  const [boxSpots, setBoxSpots] = useState<MapSpot[]>(() => (viewRegion ? cachedMapSpotsInBox(boxFor(viewRegion)) ?? [] : []));
  useEffect(() => {
    if (!viewRegion || viewRegion.latitudeDelta > 1.2) return; // vista de país: sin contexto
    const box = boxFor(viewRegion);
    const hit = cachedMapSpotsInBox(box);
    if (hit) { setBoxSpots(hit); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      getMapSpotsInBox(box)
        .then(rows => { if (!cancelled && alive.current) setBoxSpots(rows); })
        .catch(() => { /* sin red: se queda lo que había */ });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [viewRegion]);

  // Eventos tras los filtros rápidos del mapa. Los pines y el aviso de "sin
  // ubicación" trabajan sobre estos; la descarga de zonas sigue usando `events`
  // (el contexto del mapa no depende de los filtros rápidos).
  const filteredEvents = useMemo(() => {
    if (!quickFree && quickWhen === 'all') return events;
    const now = new Date();
    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
    const week = new Date(now); week.setDate(week.getDate() + 7);
    return events.filter(e => {
      if (quickFree && Number(e.price ?? 0) > 0) return false;
      const d = new Date(e.start_date);
      if (quickWhen === 'today' && d > endToday) return false;
      if (quickWhen === 'week' && d > week) return false;
      return true;
    });
  }, [events, quickFree, quickWhen]);

  const pins = useMemo(() => buildEventPins(filteredEvents, spotsByCity), [filteredEvents, spotsByCity]);
  const placedCount = useMemo(() => pins.reduce((n, p) => n + p.events.length, 0), [pins]);

  // Zonas de ocio de contexto: las de la región visible, mejor valoradas y sin
  // duplicar las que ya tienen pin de evento. Tope MAX_ZONE_MARKERS.
  const zoneMarkers = useMemo(() => {
    const used = new Set(pins.map(p => p.spot?.id).filter(Boolean));
    const box = viewRegion ? boxFor(viewRegion) : null;
    const byId = new Map<string, MapSpot>();
    const add = (s: MapSpot) => {
      if (used.has(s.id) || byId.has(s.id)) return;
      if (box && !inBox(box, s)) return;
      byId.set(s.id, s);
    };
    for (const spots of spotsByCity.values()) for (const s of spots) add(s);
    for (const s of boxSpots) add(s);
    return [...byId.values()]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, MAX_ZONE_MARKERS);
  }, [pins, spotsByCity, boxSpots, viewRegion]);

  // Zonas visibles según el filtro de categoría y, sobre ellas, el clustering
  // por zoom. Filtramos ANTES de agrupar para que el número del cluster cuente
  // solo lo que se ve (los pines de EVENTOS van aparte y nunca se agrupan).
  const zoneClusters = useMemo(() => {
    const visible = zoneCat === 'todos' ? zoneMarkers : zoneMarkers.filter(s => s.category === zoneCat);
    return clusterSpots(visible, mapDelta);
  }, [zoneMarkers, zoneCat, mapDelta]);

  useEffect(() => {
    setTrackMarkers(true);
    const t = setTimeout(() => { if (alive.current) setTrackMarkers(false); }, 500);
    return () => clearTimeout(t);
  }, [pins, zoneClusters]);

  // Encuadre de reserva (solo si aún no hay ubicación): la ciudad de la
  // universidad manda; sin uni/ciudad, los pines de eventos.
  useEffect(() => {
    const uniSpots = uniCity ? (spotsByCity.get(cityKey(uniCity)) ?? []) : [];
    const c = uniSpots.length ? centroid(uniSpots) : null;
    if (c) { moveTo(regionAround(c, 0.06), FRAME.city, 600); return; }
    if (!uniCity && pins.length) moveTo(initialRegion(pins), FRAME.events, 600);
  }, [pins, spotsByCity, uniCity, moveTo]);

  // Región con la que nace el MapView (solo se lee al montar): la recordada,
  // si no la de la ciudad ya conocida, si no los pines, y si no España.
  const initialMapRegion = useRef<Region | null>(null);
  if (!initialMapRegion.current) {
    let r: Region | null = rememberedView?.region ?? null;
    if (!r && uniCity) {
      const c = centroid(spotCache.get(cityKey(uniCity)) ?? []);
      if (c) { r = regionAround(c, 0.06); frameLevel.current = Math.max(frameLevel.current, FRAME.city); }
    }
    if (!r && pins.length) { r = initialRegion(pins); frameLevel.current = Math.max(frameLevel.current, FRAME.events); }
    initialMapRegion.current = r ?? SPAIN;
  }

  // Centrar el mapa en la posición del usuario (pide permiso si hace falta).
  // Centra ya con la última posición conocida y afina con el GPS.
  const centerOnMe = async () => {
    const granted = hasLocationPerm || await requestLocationPermission();
    if (!alive.current) return;
    if (granted !== hasLocationPerm) setHasLocationPerm(granted);
    if (!granted) return; // sin permiso no pasa nada: sigue el encuadre por ciudad
    let first = true;
    await locateFast(c => {
      if (!alive.current) return;
      frameLevel.current = FRAME.user;
      const r = regionAround(c);
      rememberedView = { region: r, level: FRAME.user };
      mapRef.current?.animateToRegion(r, first ? 350 : 500);
      first = false;
    });
  };

  // Tocar un cluster de zonas acerca el mapa a su centro (lo "abre").
  const zoomToCluster = useCallback((cl: ZoneCluster) => {
    frameLevel.current = FRAME.user;
    const nd = Math.max(0.008, mapDeltaRef.current / 2.6);
    mapRef.current?.animateToRegion({ latitude: cl.latitude, longitude: cl.longitude, latitudeDelta: nd, longitudeDelta: nd }, 400);
  }, []);
  const selectSpot = useCallback((s: MapSpot) => setSelected({ kind: 'spot', spot: s }), []);
  const selectPin = useCallback((p: EventPin) => setSelected({ kind: 'events', pin: p }), []);

  // Solo reclustereamos cuando el zoom cambia de verdad (>25%) y solo se
  // piden zonas nuevas si el centro se ha movido bastante: el paneo corto no
  // toca el conjunto de marcadores (evita parpadeos).
  const onRegionChangeComplete = useCallback((r: Region, details?: { isGesture?: boolean }) => {
    if (details?.isGesture) frameLevel.current = FRAME.user;
    rememberedView = { region: r, level: frameLevel.current };
    const d = r.latitudeDelta;
    const md = mapDeltaRef.current;
    if (d > 0 && (d > md * 1.25 || d < md * 0.8)) setMapDelta(d);
    const v = viewRegionRef.current;
    if (!v || Math.abs(r.latitude - v.latitude) > v.latitudeDelta * 0.3
      || Math.abs(r.longitude - v.longitude) > v.longitudeDelta * 0.3
      || d > v.latitudeDelta * 1.25 || d < v.latitudeDelta * 0.8) {
      setViewRegion(r);
    }
  }, []);
  const onPanDrag = useCallback(() => { frameLevel.current = FRAME.user; }, []);
  const onMapPress = useCallback((ev: MapPressEvent) => {
    // En Android el onPress del mapa también salta al tocar un marcador.
    if (ev.nativeEvent.action !== 'marker-press') setSelected(null);
  }, []);

  const join = async (e: EventItem) => {
    setJoining(e.id);
    try {
      const r = await joinEvent(e.id);
      if (!alive.current) return;
      if (r.ok) {
        setJoined(prev => new Set(prev).add(e.id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast('Plaza confirmada', 'Estás dentro. Te llegará un recordatorio.');
      } else if (r.reason === 'auth') {
        // Decisión con dos botones: aquí el Alert sí es lo correcto.
        Alert.alert('Inicia sesión', 'Necesitas una cuenta para apuntarte.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entrar', onPress: () => router.push('/welcome') },
        ]);
      } else {
        toastError('No se pudo completar', '¿Quizá ya estás apuntado?');
      }
    } catch {
      if (alive.current) toastError('No se pudo completar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (alive.current) setJoining(null);
    }
  };

  // Los marcadores solo se reconstruyen cuando cambian ELLOS, no al abrir la
  // tarjeta, apuntarse o cambiar un filtro rápido que no les afecta.
  const zoneMarkerEls = useMemo(() => zoneClusters.map(cl => (
    <ZoneMarker key={cl.key} cl={cl} tracks={trackMarkers} onCluster={zoomToCluster} onSpot={selectSpot} />
  )), [zoneClusters, trackMarkers, zoomToCluster, selectSpot]);
  const eventMarkerEls = useMemo(() => pins.map(p => (
    <EventMarker key={p.key} pin={p} tracks={trackMarkers} onPin={selectPin} />
  )), [pins, trackMarkers, selectPin]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialMapRegion.current}
        showsPointsOfInterest={false}
        showsCompass={false}
        showsUserLocation={hasLocationPerm}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        onMapReady={onMapReady}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}>
        {zoneMarkerEls}
        {eventMarkerEls}
      </MapView>

      {/* Tarjeta inferior del pin seleccionado */}
      {selected ? (
        // Entra con opacidad y una subida corta (FadeIn respeta "reducir
        // movimiento"): la posicion va en el contenedor animado.
        <FadeIn style={{ position: 'absolute', left: 10, right: 10, bottom: bottomClear }}>
        <View style={{
          backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 0.5, borderColor: C.border,
          padding: S.lg, maxHeight: 320, ...SHADOW.float,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <MapPin size={15} color={C.blue} strokeWidth={1.9} />
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1, marginLeft: 6, letterSpacing: -0.3 }]} numberOfLines={1}>
              {selected.kind === 'events'
                ? (selected.pin.spot?.name ?? `Eventos en ${selected.pin.city}`)
                : selected.spot.name}
            </Text>
            <Tap onPress={() => setSelected(null)} accessibilityLabel="Cerrar tarjeta" hitSlop={12}
              style={{ width: 28, height: 28, alignItems: 'flex-end', justifyContent: 'center' }}>
              <X size={19} color={C.muted} strokeWidth={1.9} />
            </Tap>
          </View>

          {selected.kind === 'events' ? (
            <ScrollView style={{ maxHeight: 230 }} showsVerticalScrollIndicator={false}>
              {selected.pin.spot ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginBottom: 4 }]}>
                  {typeLabel[selected.pin.spot.category] ?? selected.pin.spot.category} · {selected.pin.city}
                  {selected.pin.spot.rating ? ` · ${selected.pin.spot.rating.toFixed(1)} de 5` : ''}
                </Text>
              ) : (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginBottom: 4 }]}>
                  {selected.pin.events.length === 1 ? '1 evento' : `${selected.pin.events.length} eventos`} sin zona exacta · toca uno para ver el sitio
                </Text>
              )}
              {selected.pin.events.map(e => (
                <EventRow key={e.id} e={e}
                  joined={joined.has(e.id)} busy={joining === e.id}
                  onJoin={() => join(e)}
                  onOpen={() => { primeEventCache(e); router.push(`/evento/${e.id}`); }} />
              ))}
              {selected.pin.spot ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Btn small full variant="secondary" label="Ver la zona"
                        onPress={() => router.push(`/ocio/${selected.pin.spot!.id}`)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Btn small full variant="secondary" icon={Navigation} label="Cómo llegar"
                        onPress={() => router.push(directionsHref(selected.pin.spot!.name, selected.pin.latitude, selected.pin.longitude))} />
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <Btn small full variant="ghost" icon={Plus} label="Crear otro evento aquí"
                      onPress={() => router.push({ pathname: '/crear-evento', params: { venue: selected.pin.spot!.name, city: selected.pin.spot!.city ?? '', lat: String(selected.pin.spot!.latitude), lng: String(selected.pin.spot!.longitude) } })} />
                  </View>
                </>
              ) : null}
            </ScrollView>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {selected.spot.image_url ? (
                  <Image source={{ uri: selected.spot.image_url }} recyclingKey={selected.spot.id}
                    cachePolicy="memory-disk" transition={120}
                    style={{ width: 74, height: 74, borderRadius: R.lg, backgroundColor: C.input }} contentFit="cover" />
                ) : null}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Pill label={typeLabel[selected.spot.category] ?? selected.spot.category} tone="blue"
                      icon={ZONE_ICON[selected.spot.category]} />
                    {selected.spot.rating ? (
                      <Pill label={selected.spot.rating.toFixed(1)} tone="orange" icon={Star} />
                    ) : null}
                  </View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 5 }]} numberOfLines={2}>
                    {selected.spot.tagline ?? selected.spot.city}
                  </Text>
                </View>
              </View>
              {/* CTA principal: montar un evento/actividad en ESTA zona */}
              <View style={{ marginTop: 12 }}>
                <Btn small full icon={Plus} label="Crear evento aquí"
                  onPress={() => router.push({ pathname: '/crear-evento', params: { venue: selected.spot.name, city: selected.spot.city ?? '', lat: String(selected.spot.latitude), lng: String(selected.spot.longitude) } })} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Btn small full variant="secondary" label="Ver la zona" onPress={() => router.push(`/ocio/${selected.spot.id}`)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn small full variant="secondary" icon={Navigation} label="Cómo llegar"
                    onPress={() => router.push(directionsHref(selected.spot.name, selected.spot.latitude, selected.spot.longitude))} />
                </View>
              </View>
            </View>
          )}
        </View>
        </FadeIn>
      ) : null}

      {/* Aquí había un segundo botón "+" flotante para crear evento. Se quitó:
          la cabecera de la pestaña Eventos ya tiene el suyo arriba, y tener dos
          "+" en la misma pantalla confundía. Crear una zona concreta sigue
          disponible desde la tarjeta inferior al tocar un pin. */}

      {/* Filtros rápidos sobre el mapa: discretos, arriba, sin abrir el panel */}
      <View style={{
        position: 'absolute', top: 8, left: 10, right: 10,
        flexDirection: 'row', gap: 8, alignItems: 'center',
      }}>
        <QuickChip label="Gratis" active={quickFree} onPress={() => setQuickFree(v => !v)} />
        <QuickChip label="Hoy" active={quickWhen === 'today'} onPress={() => setQuickWhen(w => w === 'today' ? 'all' : 'today')} />
        <QuickChip label="Esta semana" active={quickWhen === 'week'} onPress={() => setQuickWhen(w => w === 'week' ? 'all' : 'week')} />
      </View>

      {/* Botón "centrar en mí": pide permiso la primera vez; si no lo dan, nada */}
      <Tap
        haptic
        accessibilityLabel="Centrar en mi ubicación"
        onPress={centerOnMe}
        style={{
          position: 'absolute', left: 14, bottom: (selected ? 340 : 0) + bottomClear,
          width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface,
          borderWidth: 0.5, borderColor: C.border,
          alignItems: 'center', justifyContent: 'center',
          ...SHADOW.float,
        }}>
        <LocateFixed size={21} color={C.blue} strokeWidth={1.9} />
      </Tap>

      {/* Aviso si hay eventos que no se han podido situar en el mapa */}
      {filteredEvents.length > 0 && placedCount < filteredEvents.length ? (
        <View style={{
          // Solo top O bottom, nunca los dos: fijar ambos estiraba la píldora
          // de arriba abajo y con el borderRadius grande salía un óvalo oscuro
          // gigante en medio del mapa. Con la tarjeta abierta va arriba; sin
          // ella, abajo (encima del hueco del tab bar).
          position: 'absolute', alignSelf: 'center',
          ...(selected ? { top: 54 } : { bottom: bottomClear }),
          backgroundColor: 'rgba(18,16,25,0.86)', borderRadius: R.full,
          paddingHorizontal: 13, paddingVertical: 7,
        }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.white, fontSize: 11.5, fontFamily: FONT.semibold, letterSpacing: -0.1 }}>
            {filteredEvents.length - placedCount} eventos sin ubicación · míralos en la lista
          </Text>
        </View>
      ) : null}
    </View>
  );
});
