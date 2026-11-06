// ─── Detalle de zona de ocio ─────────────────────────────────────────────
// Ficha real: foto (Storage), descripción rica, por qué ir, imprescindibles,
// datos prácticos y cómo llegar. Datos del catálogo Wikidata enriquecido.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Linking, RefreshControl, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  MapPin, Star, Clock, CheckCircle2, Sparkles, Sun,
  GraduationCap, Bookmark, FileText, Wifi, Wind, Trees, Music, Users, Dog,
  Car, UtensilsCrossed, CreditCard, CalendarCheck, BadgePercent, Armchair,
  Mail, AtSign, Info, Landmark, Dumbbell, Wine, Coffee, Beer, Disc3, Laptop,
  Navigation, type LucideIcon,
} from 'lucide-react-native';
import { Header } from '@/components/Screen';
import { Tap, Skeleton, Pill, Btn, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getSpot, type LeisureSpotFull } from '@/lib/api';
import { typeLabel } from '@/lib/format';
import { addFav } from '@/lib/favs';
import { toast, toastError } from '@/lib/toast';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

// Icono por categoría en vez del emoji: se tiñe con el tema y se ve igual en
// iOS y Android (un emoji cambia de dibujo según el sistema).
const CAT_ICON: Record<string, LucideIcon> = {
  bar: Wine, pub: Beer, restaurante: UtensilsCrossed, cafeteria: Coffee, discoteca: Disc3,
  parque: Trees, cultural: Landmark, deportivo: Dumbbell, coworking: Laptop,
};

// Las 13 características que el negocio marca en el alta (/negocio/registro).
// Se pintan solo las que tiene: nada de listas con cruces y huecos.
type FeatureIcon = typeof Wifi;
const FEATURES: { key: keyof LeisureSpotFull; label: string; icon: FeatureIcon }[] = [
  { key: 'has_wifi', label: 'Wifi', icon: Wifi },
  { key: 'has_billiards', label: 'Billar', icon: Sparkles },
  { key: 'has_air_conditioning', label: 'Aire acondicionado', icon: Wind },
  { key: 'has_terrace', label: 'Terraza', icon: Trees },
  { key: 'has_outdoor_seating', label: 'Mesas fuera', icon: Armchair },
  { key: 'has_parking', label: 'Parking', icon: Car },
  { key: 'has_food', label: 'Comida', icon: UtensilsCrossed },
  { key: 'has_live_music', label: 'Música en vivo', icon: Music },
  { key: 'accepts_groups', label: 'Acepta grupos', icon: Users },
  { key: 'accepts_pets', label: 'Pet-friendly', icon: Dog },
  { key: 'student_discount', label: 'Descuento estudiantes', icon: BadgePercent },
  { key: 'card_payment', label: 'Pago con tarjeta', icon: CreditCard },
  { key: 'reservations', label: 'Admite reservas', icon: CalendarCheck },
];

const DAY_NAMES: Record<string, string> = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
  friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo',
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

function Label({ children }: { children: React.ReactNode }) {
  return <Text maxFontSizeMultiplier={1.3} style={F.label}>{children}</Text>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: C.input, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.borderLight, padding: 12, gap: 4 }}>{children}</View>;
}

// Caché en memoria de fichas (datos públicos del local): volver atrás y
// reabrir una zona no vuelve a enseñar el esqueleto.
const spotDetailCache = new Map<string, LeisureSpotFull>();
function rememberSpot(spot: LeisureSpotFull) {
  spotDetailCache.delete(spot.id);
  spotDetailCache.set(spot.id, spot);
  if (spotDetailCache.size > 60) spotDetailCache.delete(spotDetailCache.keys().next().value!);
}

export default function OcioDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const owner = useSessionOwner();
  return <OwnedSpot key={`${id}:${owner?.userId ?? 'guest'}:${owner?.generation ?? 0}`} id={String(id)} owner={owner} />;
}
function OwnedSpot({ id, owner }: { id: string; owner: SessionIdentity | null }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Ancho de cada foto dentro del marco de la galería.
  const galleryWidth = Math.max(1, width - S.lg * 2);
  // Ficha ya vista en esta sesión: se pinta al instante y se revalida.
  const [s, setS] = useState<LeisureSpotFull | null | undefined>(() => spotDetailCache.get(id));
  const [refreshing, setRefreshing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const loadVersion = useRef(0);
  // Foto visible del carrusel, para los puntitos de posición.
  const [photo, setPhoto] = useState(0);

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para reintentar
  // y para el pull-to-refresh.
  const alive = useRef(true);
  // getSpot aplica el MISMO filtro que la web (is_verified + is_paid): antes la
  // app abría fichas de locales que aún no habían pagado.
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    // Si getSpot rechaza (sin red) el esqueleto se quedaba para siempre: s
    // nunca salía de undefined. Con null aparece el estado "Reintentar"; si
    // ya había ficha (recarga fallida) se conserva.
    try {
      const data = await getSpot(String(id));
      if (data) rememberSpot(data); else spotDetailCache.delete(String(id));
      if (!alive.current || version !== loadVersion.current) return;
      setS(data);
    } catch {
      if (!alive.current || version !== loadVersion.current) return;
      setS((prev) => (prev === undefined ? null : prev));
    }
  }, [id]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  if (s === undefined) {
    // Esqueleto con la silueta real: la foto a sangre y los bloques de texto.
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Ocio" back />
        <Skeleton height={240} radius={0} style={{ marginHorizontal: 0, marginBottom: S.lg }} />
        <Skeleton height={26} radius={R.sm} style={{ width: '60%' }} />
        <Skeleton height={90} radius={R.md} />
        <Skeleton height={120} radius={R.md} />
      </View>
    );
  }
  if (s === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Ocio" back />
        <EmptyState icon={MapPin} title="No se pudo cargar"
          subtitle="No encontramos este sitio o falla tu conexión. Inténtalo de nuevo."
          cta="Reintentar" onCta={load} />
      </View>
    );
  }

  const d = s.details || {};
  const whyGo = (d.why_go || []).filter(Boolean);
  const highlights = (d.highlights || []).filter(Boolean);
  const sources = (d.sources || []).filter((x) => x && x.url);
  const mapsUrl = s.google_maps_url
    || (s.latitude != null && s.longitude != null ? `https://www.google.com/maps?q=${s.latitude},${s.longitude}` : null);
  const priceText = d.price_text || (s.price_range === 0 ? 'Gratis' : s.price_range ? '€'.repeat(Math.min(4, s.price_range)) : null);
  // Galería: `images` es lo que sube el negocio (hasta 20 fotos). La portada
  // (image_url) se antepone si no está ya dentro.
  const gallery = (() => {
    const list = (s.images ?? []).filter(Boolean);
    if (s.image_url && !list.includes(s.image_url)) return [s.image_url, ...list];
    return list.length ? list : (s.image_url ? [s.image_url] : []);
  })();
  const features = FEATURES.filter((f) => s[f.key] === true);
  // Horarios: primero el texto enriquecido del catálogo; si no, el JSONB.
  const hoursRows = (() => {
    const raw = s.opening_hours;
    if (!raw || typeof raw !== 'object') return [];
    // jsonb no conserva el orden de inserción: se recorre la semana, no el
    // objeto, para que no salga "lunes, jueves, martes, sábado...".
    const orden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    const todas: [string, string][] = Object.entries(raw)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '');
    const enSemana = orden
      .map((d) => todas.find(([k]) => k.toLowerCase() === d))
      .filter((e): e is [string, string] => e !== undefined);
    const resto = todas.filter(([k]) => !orden.includes(k.toLowerCase()));
    return [...enSemana, ...resto];
  })();
  const instagramUrl = s.instagram
    ? `https://instagram.com/${s.instagram.replace(/^@+/, '').trim()}`
    : null;

  const CatIcon = CAT_ICON[s.category] ?? MapPin;

  const save = async () => {
    if (!alive.current || savingRef.current || saved) return;
    if (!owner) { router.push('/welcome'); return; }
    if (!isCurrentSessionIdentity(owner)) return;
    savingRef.current = true; setSaving(true);
    try {
      const result = await addFav({ type: 'leisure_spot', id: s.id, title: s.name, subtitle: `${typeLabel[s.category] ?? s.category} · ${s.city}`, image: s.image_url }, owner);
      if (!alive.current || !isCurrentSessionIdentity(owner)) return;
      if (!result.ok) { toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.'); return; }
      setSaved(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      toast('Guardado', 'Lo tienes en tus favoritos.');
    } finally {
      savingRef.current = false;
      if (alive.current && isCurrentSessionIdentity(owner)) setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={typeLabel[s.category] ?? 'Ocio'} back right={
        <Tap onPress={save} disabled={saving || saved} haptic={false} hitSlop={6}
          accessibilityLabel={saved ? 'Guardado' : 'Guardar este sitio'} accessibilityState={{ selected: saved, busy: saving }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.5 : 1 }}>
          <Bookmark size={22} color={saved ? C.blue : C.text} fill={saved ? C.blue : 'transparent'} strokeWidth={1.9} />
        </Tap>
      } />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); if (alive.current) setRefreshing(false); }} tintColor={C.muted} />}>

        {/* Cabecera tipográfica: el nombre se lee sobre el fondo de la página,
            no encima de la foto con un velo oscuro. */}
        <FadeIn>
          <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{typeLabel[s.category] ?? s.category} · {s.city}</Text>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} numberOfLines={3}
              style={[F.h1, { fontSize: 28, lineHeight: 33, letterSpacing: -0.8 }]}>{s.name}</Text>
            {s.tagline ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14, lineHeight: 20 }]}>{s.tagline}</Text>
            ) : null}
          </View>
        </FadeIn>

        {/* galería: se pasan las fotos con el dedo, dentro de un marco redondeado */}
        <FadeIn index={1}>
        <View style={{ height: 240, marginHorizontal: S.lg, marginTop: S.md, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input }}>
          {gallery.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
                setPhoto(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, galleryWidth)))}>
              {gallery.map((uri, i) => (
                <Image key={`${uri}-${i}`} source={{ uri }} recyclingKey={uri} style={{ width: galleryWidth, height: 240 }}
                  contentFit="cover" transition={150} cachePolicy="memory-disk" />
              ))}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <CatIcon size={72} color={C.border} strokeWidth={1.1} />
            </View>
          )}
          {gallery.length > 1 ? (
            <>
              {/* Blanco fijo: contador y puntitos van SOBRE la foto, no sobre
                  una superficie del tema. */}
              <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 11.5, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] }}>{photo + 1} / {gallery.length}</Text>
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                {gallery.map((uri, i) => (
                  <View key={`${uri}-dot-${i}`} style={{
                    width: i === photo ? 16 : 6, height: 6, borderRadius: 3,
                    backgroundColor: i === photo ? '#fff' : 'rgba(255,255,255,0.55)',
                  }} />
                ))}
              </View>
            </>
          ) : null}
        </View>
        </FadeIn>

        {/* meta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: S.lg, marginTop: 4, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
          <Pill label={typeLabel[s.category] ?? s.category} tone="blue" icon={CatIcon} />
          {priceText ? <Pill label={priceText} tone={priceText === 'Gratis' ? 'green' : 'gray'} /> : null}
          {s.rating ? <Pill label={s.rating.toFixed(1)} tone="orange" icon={Star} /> : null}
          {s.min_age ? <Pill label={`+${s.min_age} años`} tone="red" /> : null}
          {s.capacity ? <Pill label={`Aforo ${s.capacity}`} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <MapPin size={13} color={C.muted} strokeWidth={2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{s.city}</Text>
          </View>
        </View>

        {/* descripción */}
        {s.description ? (
          <View style={{ padding: S.lg, gap: 6, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Sobre este lugar</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{s.description}</Text>
          </View>
        ) : null}

        {/* qué ofrece: las características que marca el negocio en su alta */}
        {features.length ? (
          <View style={{ padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Qué ofrece</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {features.map((f) => (
                <View key={String(f.key)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8,
                }}>
                  <f.icon size={15} color={C.blue} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text }]}>{f.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* por qué ir */}
        {whyGo.length ? (
          <View style={{ padding: S.lg, gap: 8, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><CheckCircle2 size={18} color={C.text} strokeWidth={1.9} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Por qué ir</Text></View>
            {whyGo.map((r, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <CheckCircle2 size={15} color={C.success} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{r}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* imprescindibles */}
        {highlights.length ? (
          <View style={{ padding: S.lg, gap: 8, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Sparkles size={18} color={C.text} strokeWidth={1.9} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>No te pierdas</Text></View>
            {highlights.map((h, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Sparkles size={15} color={C.accent3} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{h}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* mejor momento / tip estudiante */}
        {(d.best_time || d.student_tip) ? (
          <View style={{ padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            {d.best_time ? <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Sun size={14} color={C.accent3} strokeWidth={2.2} /><Label>Mejor momento</Label></View><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{d.best_time}</Text></Card> : null}
            {d.student_tip ? <Card><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><GraduationCap size={14} color={C.blue} strokeWidth={2.2} /><Label>Tip de estudiante</Label></View><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{d.student_tip}</Text></Card> : null}
          </View>
        ) : null}

        {/* horarios: texto enriquecido del catálogo o el horario por días */}
        {(d.opening_hours_text || hoursRows.length) ? (
          <View style={{ padding: S.lg, gap: 8, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color={C.text} strokeWidth={1.9} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Horario</Text>
            </View>
            {d.opening_hours_text ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{d.opening_hours_text}</Text>
            ) : (
              hoursRows.map(([day, hours]) => (
                <View key={day} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{DAY_NAMES[day.toLowerCase()] ?? day}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{String(hours)}</Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {/* información extra que escribe el propio negocio */}
        {s.extra_info ? (
          <View style={{ padding: S.lg, gap: 6, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Info size={18} color={C.text} strokeWidth={1.9} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Información extra</Text>
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{s.extra_info}</Text>
          </View>
        ) : null}

        {/* contacto */}
        {(s.website || s.phone || s.email || instagramUrl || s.address) ? (
          <View style={{ padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>Contacto</Text>
            {s.address ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <MapPin size={16} color={C.text} strokeWidth={1.8} style={{ marginTop: 1 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, color: C.muted }]}>{s.address}, {s.city}</Text>
              </View>
            ) : null}
            {s.website ? <Btn variant="secondary" small full label="Visitar web" onPress={() => Linking.openURL(s.website!)} /> : null}
            {s.phone ? <Btn variant="secondary" small full label={`Llamar · ${s.phone}`} onPress={() => Linking.openURL(`tel:${s.phone}`)} /> : null}
            {s.email ? (
              <Tap onPress={() => Linking.openURL(`mailto:${s.email}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Mail size={16} color={C.blue} strokeWidth={1.9} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blueDeep }]}>{s.email}</Text>
                </View>
              </Tap>
            ) : null}
            {instagramUrl ? (
              <Tap onPress={() => Linking.openURL(instagramUrl)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AtSign size={16} color={C.blue} strokeWidth={1.9} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blueDeep }]}>{s.instagram}</Text>
                </View>
              </Tap>
            ) : null}
          </View>
        ) : null}

        {/* Cómo llegar: la ruta se pinta DENTRO de Franky (/ruta), sin saltar a
            una app de mapas externa. Necesita coordenadas de la zona. */}
        {s.latitude != null && s.longitude != null ? (
          <View style={{ padding: S.lg }}>
            <Btn full icon={Navigation} label="Cómo llegar" onPress={() => router.push({
              pathname: '/ruta',
              params: { lat: String(s.latitude), lng: String(s.longitude), name: s.name },
            })} />
          </View>
        ) : mapsUrl ? (
          <View style={{ padding: S.lg }}>
            <Btn full icon={Navigation} label="Cómo llegar" onPress={() => Linking.openURL(mapsUrl)} />
          </View>
        ) : null}

        {/* fuentes */}
        {sources.length ? (
          <View style={{ paddingHorizontal: S.lg, paddingBottom: S.lg, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><FileText size={14} color={C.muted} strokeWidth={2} /><Label>Fuentes</Label></View>
            {sources.map((src, i) => (
              <Tap key={i} onPress={() => Linking.openURL(src.url)} accessibilityRole="link"
                accessibilityLabel={`Abrir la fuente ${src.titulo || src.url}`}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blueDeep, paddingVertical: 3 }]} numberOfLines={1}>· {src.titulo || src.url}</Text>
              </Tap>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
