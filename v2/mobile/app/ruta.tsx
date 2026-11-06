// Ruta DENTRO de la app: en vez de saltar a Google/Apple Maps (que te saca de
// Franky), pintamos el camino sobre el mismo mapa que ya usa la app. El
// trazado viene de OSRM (servicio público de rutas, sin clave); si falla,
// caemos a una línea recta con la distancia en línea recta, para que la
// pantalla siga siendo útil sin conexión al router.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { Footprints, Car, MapPin, Route as RouteIcon, Clock } from 'lucide-react-native';
import { RouteMap, type Coord } from '@/components/RouteMap';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Skeleton } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';

type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
type Mode = 'foot' | 'driving';

// Distancia en línea recta (haversine), en metros. Se usa como respaldo si el
// servicio de rutas no responde.
function straightMeters(a: Coord, b: Coord): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R_EARTH = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(s));
}

function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// Región que encuadra los dos puntos con un margen.
function regionFor(a: Coord, b: Coord): Region {
  const latitude = (a.latitude + b.latitude) / 2;
  const longitude = (a.longitude + b.longitude) / 2;
  const latitudeDelta = Math.max(Math.abs(a.latitude - b.latitude) * 1.8, 0.01);
  const longitudeDelta = Math.max(Math.abs(a.longitude - b.longitude) * 1.8, 0.01);
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export default function Ruta() {
  const params = useLocalSearchParams<{ lat?: string; lng?: string; name?: string }>();
  const dest: Coord = {
    latitude: Number(params.lat ?? 0),
    longitude: Number(params.lng ?? 0),
  };
  const name = params.name ?? 'Destino';

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [mode, setMode] = useState<Mode>('foot');
  const [line, setLine] = useState<Coord[]>([]);
  const [meters, setMeters] = useState<number | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  // Ubicación del usuario (permiso incluido). Sin permiso no hay ruta, pero
  // seguimos enseñando el destino en el mapa.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setNote('Activa la ubicación para calcular el camino desde donde estás.');
          setLoading(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        setNote('No pudimos obtener tu ubicación.');
        setLoading(false);
      }
    })();
  }, []);

  // Cálculo de la ruta con el perfil elegido (a pie o en coche).
  const computeRoute = useCallback(async (from: Coord, profile: Mode) => {
    setLoading(true);
    setNote(null);
    const fallback = () => {
      setLine([from, dest]);
      setMeters(straightMeters(from, dest));
      setSeconds(null);
      setNote('No pudimos trazar el camino exacto: te enseñamos la línea recta.');
    };
    try {
      const url = `https://router.project-osrm.org/route/v1/${profile}/`
        + `${from.longitude},${from.latitude};${dest.longitude},${dest.latitude}`
        + '?overview=full&geometries=geojson';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const json = await res.json();
      const route = json?.routes?.[0];
      const coords: [number, number][] | undefined = route?.geometry?.coordinates;
      if (!coords?.length) { fallback(); return; }
      // GeoJSON viene como [lng, lat]: hay que darle la vuelta para el mapa.
      setLine(coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })));
      setMeters(typeof route.distance === 'number' ? route.distance : null);
      setSeconds(typeof route.duration === 'number' ? route.duration : null);
    } catch {
      fallback();
    } finally {
      setLoading(false);
    }
  }, [dest.latitude, dest.longitude]);

  useEffect(() => {
    if (origin) computeRoute(origin, mode);
  }, [origin, mode, computeRoute]);

  const initial = origin ? regionFor(origin, dest) : { ...dest, latitudeDelta: 0.02, longitudeDelta: 0.02 };

  return (
    <Screen title="Cómo llegar" back>
      <View style={{ height: 420, marginHorizontal: S.lg, borderRadius: R.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border, backgroundColor: C.input }}>
        <RouteMap initial={initial} dest={dest} name={name} line={line} />
      </View>

      <View style={{ paddingHorizontal: S.lg, paddingTop: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <MapPin size={19} color={C.blue} strokeWidth={1.75} style={{ marginTop: 4 }} />
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[F.display, { flex: 1, fontSize: 23, letterSpacing: -0.8, lineHeight: 27 }]} numberOfLines={2}>{name}</Text>
        </View>

        {/* Modo de transporte: recalcula la ruta al cambiar */}
        <View style={{ flexDirection: 'row' }}>
          <Chip label="A pie" icon={Footprints} active={mode === 'foot'} accessibilityRole="tab" onPress={() => setMode('foot')} />
          <Chip label="En coche" icon={Car} active={mode === 'driving'} accessibilityRole="tab" onPress={() => setMode('driving')} />
        </View>

        {loading ? (
          // Esqueleto con la forma de las dos cifras: al llegar el dato no
          // salta nada de sitio.
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton height={72} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
            <Skeleton height={72} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
          </View>
        ) : (
          <FadeIn style={{ flexDirection: 'row', gap: S.lg, paddingTop: 4 }}>
            {meters != null ? (
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RouteIcon size={14} color={C.muted} strokeWidth={1.75} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Distancia</Text>
                </View>
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 26, fontFamily: FONT.display, color: C.text, letterSpacing: -0.9 }}>{fmtDistance(meters)}</Text>
              </View>
            ) : null}
            {seconds != null ? (
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color={C.muted} strokeWidth={1.75} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tiempo</Text>
                </View>
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 26, fontFamily: FONT.display, color: C.text, letterSpacing: -0.9 }}>{fmtDuration(seconds)}</Text>
              </View>
            ) : null}
          </FadeIn>
        )}

        {note ? (
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.muted }]}>{note}</Text>
        ) : null}

        {!origin && !loading ? (
          <Btn full label="Reintentar con mi ubicación" onPress={async () => {
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') return;
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            } catch { /* sin ubicación: se queda como está */ }
          }} />
        ) : null}
      </View>
    </Screen>
  );
}
