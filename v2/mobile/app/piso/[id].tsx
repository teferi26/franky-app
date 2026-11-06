// ─── Ficha de piso ───────────────────────────────────────────────────────
// Enseña TODO lo que el propietario rellena en /negocio/registro, igual que la
// ficha web (/alojamiento/[id]). La versión anterior pintaba `amenities`, un
// array heredado que el alta NUNCA escribe: por eso un piso con wifi, piscina y
// terraza salía sin una sola característica. Los datos reales viven en las
// COLUMNAS booleanas (has_wifi, has_pool…).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView, Linking, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BadgeCheck, BedDouble, Bath, Ruler, MapPin, Home as HomeIcon,
  Wifi, Wind, Flame, ArrowUpDown, Car, Trees, Building2, WashingMachine,
  UtensilsCrossed, WavesLadder, Dumbbell, Sofa, ShowerHead, Droplets, Zap, Sparkles,
  GraduationCap, Cigarette, Dog, Users, Clock, Coins, CalendarRange, Info,
  Mail, AtSign, MessageCircle, Percent,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { Btn, Pill, EmptyState, Tap, Avatar, Skeleton } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { VideoPlayer } from '@/components/VideoPlayer';
import { VisitBookingSheet } from '@/components/VisitBookingSheet';
import { getAccommodation, type AccommodationFull } from '@/lib/api';
import { getFlatPublicResidents, type FlatResident } from '@/lib/events-extra';
import { registerAccommodationView, requestAccommodationContact } from '@/lib/housing';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { supabase } from '@/lib/supabase';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { dateShort, typeLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, R, S, FONT } from '@/theme';

type FeatureIcon = typeof Wifi;

// Las características REALES del alta (columnas booleanas de accommodations).
const FEATURES: { key: keyof AccommodationFull; label: string; icon: FeatureIcon }[] = [
  { key: 'has_wifi', label: 'Wifi', icon: Wifi },
  { key: 'has_air_conditioning', label: 'Aire acondicionado', icon: Wind },
  { key: 'has_heating', label: 'Calefacción', icon: Flame },
  { key: 'has_elevator', label: 'Ascensor', icon: ArrowUpDown },
  { key: 'has_parking', label: 'Parking', icon: Car },
  { key: 'has_terrace', label: 'Terraza', icon: Trees },
  { key: 'has_balcony', label: 'Balcón', icon: Building2 },
  { key: 'has_washing_machine', label: 'Lavadora', icon: WashingMachine },
  { key: 'has_dishwasher', label: 'Lavavajillas', icon: UtensilsCrossed },
  { key: 'has_pool', label: 'Piscina', icon: WavesLadder },
  { key: 'has_gym', label: 'Gimnasio', icon: Dumbbell },
  { key: 'is_furnished', label: 'Amueblado', icon: Sofa },
  { key: 'has_double_bed', label: 'Cama doble', icon: BedDouble },
  { key: 'has_private_bathroom', label: 'Baño privado', icon: ShowerHead },
];

const GENDER_LABELS: Record<string, string> = {
  hombre: 'Chicos', mujer: 'Chicas', no_binario: 'No binario',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, paddingTop: 18, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>{title}</Text>
      {children}
    </View>
  );
}

// Píldora de característica: el icono va en el color del acento (o en verde
// para lo que suma dinero), y el color sale de C EN RENDER, no de un hex fijo.
function FeatureChip({ icon: Icon, label, tone = 'blue' }: { icon: FeatureIcon; label: string; tone?: 'blue' | 'green' }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.input,
      borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36,
    }}>
      <Icon size={15} color={tone === 'green' ? C.success : C.blue} strokeWidth={2} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text }]}>{label}</Text>
    </View>
  );
}

export default function PisoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const owner = useSessionOwner();
  return <OwnedPisoDetail key={`${id}:${owner?.userId ?? 'guest'}:${owner?.generation ?? 0}`} id={String(id)} owner={owner} />;
}
function OwnedPisoDetail({ id, owner }: { id: string; owner: SessionIdentity | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Ancho de cada foto de la galería: el ancho útil dentro del marco.
  const galleryWidth = Math.max(1, width - S.lg * 2);
  const [a, setA] = useState<AccommodationFull | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  // Para no ofrecerte contactar ni chatear con tu propio anuncio.
  const me = owner?.userId ?? null;
  const working = useRef(false);
  const lifetime = useRef(new AbortController());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    return () => { alive.current = false; lifetime.current.abort(); };
  }, []);
  const loadVersion = useRef(0);
  // 161: hoja de reserva de visita con los huecos reales del propietario.
  const [visitOpen, setVisitOpen] = useState(false);
  // Estado de mi solicitud sobre este piso (074): sin esto, pulsar "Contactar"
  // cinco veces manda cinco notificaciones al dueño (el INSERT en
  // accommodation_requests es ON CONFLICT DO NOTHING, pero el de notifications
  // no) y siempre responde "Solicitud enviada", incluso si ya la rechazó.
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  // Residentes públicos (RPC get_flat_public_residents, 086): inquilinos con
  // tenencia activa que la han hecho pública. Solo con sesión (101); para
  // anónimos y ante cualquier fallo queda vacío y la sección no cambia.
  const [residents, setResidents] = useState<FlatResident[]>([]);
  // Foto visible del carrusel, para pintar los puntitos de posición.
  const [photo, setPhoto] = useState(0);

  // 161: vista de la ficha para las métricas del propietario. Fire and forget
  // (dedupe por usuario/día en el servidor); nunca afecta a la carga.
  useEffect(() => { if (id) registerAccommodationView(String(id)); }, [id]);

  // ¿Ya escribí a este piso? Fail-soft: si la RPC no está, el botón se queda
  // como estaba y como mucho se manda una solicitud repetida.
  useEffect(() => {
    if (!id || !me) return;
    let alive = true;
    withOwnedRequest(owner, async request => request.query(supabase.rpc('get_my_request_status', { p_accommodation_id: String(id) })), lifetime.current.signal)
      .then(({ data }) => { if (alive) setRequestStatus((data as string | null) ?? null); },
            () => { /* silencioso */ });
    return () => { alive = false; };
  }, [id, me, owner]);

  useEffect(() => {
    if (!id || !me) return;
    let alive = true;
    getFlatPublicResidents(String(id)).then((r) => { if (alive && owner && isCurrentSessionIdentity(owner)) setResidents(r); }).catch(() => {});
    return () => { alive = false; };
  }, [id, me]);

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para "Reintentar".
  const active = () => alive.current && (owner ? isCurrentSessionIdentity(owner) : captureSessionIdentity() === null);
  const load = useCallback(() => {
    const version = ++loadVersion.current;
    setA(undefined);
    getAccommodation(String(id))
      .then((v) => { if (alive.current && version === loadVersion.current) setA(v); })
      .catch(() => { if (alive.current && version === loadVersion.current) setA(null); });
  }, [id]);
  useEffect(() => {
    load();
    return () => { loadVersion.current += 1; };
  }, [load]);

  // Esqueleto con la silueta real de la ficha: fotos, precio, título y bloques.
  if (a === undefined) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen title="Alojamiento" back>
        <Skeleton height={260} radius={0} style={{ marginHorizontal: 0, marginBottom: S.lg }} />
        <Skeleton height={30} radius={R.sm} style={{ width: '40%' }} />
        <Skeleton height={22} radius={R.sm} style={{ width: '75%' }} />
        <Skeleton height={90} radius={R.md} />
        <Skeleton height={130} radius={R.md} />
      </Screen>
    </View>
  );
  if (a === null) return (
    <Screen title="Alojamiento" back>
      <EmptyState icon={HomeIcon} title="No se pudo cargar"
        subtitle="Este anuncio ya no está disponible o falla tu conexión. Inténtalo de nuevo."
        cta="Reintentar" onCta={load} />
    </Screen>
  );

  const askLogin = (msg: string) => Alert.alert('Inicia sesión', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Entrar', onPress: () => { if (active()) router.push('/welcome'); } },
  ]);

  // Solicitud de contacto. Antes insertaba en `visit_requests`, una tabla de
  // otra función (019) que el panel del propietario NO lee: la petición se
  // perdía siempre. Ahora va por process_swipe_action, que crea la fila en
  // accommodation_requests y notifica al dueño (ver src/lib/housing.ts).
  const contact = async () => {
    if (!active() || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const r = await requestAccommodationContact(a.id, owner, lifetime.current.signal);
      if (!active()) return;
      if (r.ok) {
        setRequestStatus('pending');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast('Solicitud enviada', 'El propietario ya la tiene en su panel. Te avisamos cuando responda.');
        return;
      }
      if (r.needsAuth) { askLogin('Necesitas una cuenta para escribir al propietario.'); return; }
      toastError('No se pudo enviar', r.message);
    } catch {
      if (active()) toastError('No pudimos confirmar la solicitud', 'Consulta su estado antes de volver a enviarla.');
    } finally {
      working.current = false;
      if (active()) setBusy(false);
    }
  };

  // Chat directo con el anunciante (RPC get_or_create_direct_chat, idempotente).
  // Se llama a la RPC en crudo y no a startDirectChat() porque esa helper se
  // traga el error, y aquí hace falta distinguir 'not_allowed' (el propietario
  // limita quién puede escribirle, migración 148) de un fallo cualquiera.
  const openChat = async () => {
    if (!a.owner_id || !active() || working.current) return;
    if (!me) { askLogin('Necesitas una cuenta para escribir al anunciante.'); return; }
    working.current = true;
    setChatBusy(true);
    try {
      const { data, error } = await withOwnedRequest(owner, async request => request.query(supabase.rpc('get_or_create_housing_chat', { p_accommodation_id: a.id })), lifetime.current.signal);
      if (!active()) return;
      if (!error && data) { router.push(`/chat/${data as string}?housing=${a.id}`); return; }
      if (error?.message?.includes('not_allowed')) {
        toastInfo('No se puede escribir', 'El anunciante limita quién puede mandarle mensajes. Prueba con Contactar: le llegará tu solicitud igual.');
        return;
      }
      toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.');
    } catch {
      if (active()) toastError('No se pudo abrir el chat', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      working.current = false;
      if (active()) setChatBusy(false);
    }
  };

  const isOwner = !!a.owner_id && me === a.owner_id;

  // Cada dato solo se pinta si existe: nada de "0 baños" ni de filas con guion.
  // Los números del piso (habitaciones, baños, m²) van ahora en las píldoras de
  // la cabecera, junto al tipo, en vez de en una fila de iconos aparte.
  // "Disponible desde" desapareció porque el alta nunca escribe available_from;
  // lo que sí se rellena es hasta cuándo está libre (available_until).
  const features = FEATURES.filter((f) => a[f.key] === true);

  const bills = [
    a.bills_included ? { icon: Sparkles, label: 'Todos los gastos incluidos' } : null,
    a.water_included ? { icon: Droplets, label: 'Agua incluida' } : null,
    a.electricity_included ? { icon: Zap, label: 'Luz incluida' } : null,
  ].filter((v): v is { icon: FeatureIcon; label: string } => v !== null);

  const stay = [
    ...(a.min_stay_months ? [{ icon: Clock, label: `Estancia mínima: ${a.min_stay_months} ${plural(a.min_stay_months, 'mes', 'meses')}` }] : []),
    ...(a.deposit_months != null && Number(a.deposit_months) > 0
      ? [{ icon: Coins, label: `Fianza: ${Number(a.deposit_months)} ${Number(a.deposit_months) === 1 ? 'mensualidad' : 'mensualidades'}` }] : []),
    ...(a.agency_commission_pct != null
      ? [{ icon: Percent, label: `Comisión de inmobiliaria: ${Number(a.agency_commission_pct)}%` }] : []),
    ...(a.available_until ? [{ icon: CalendarRange, label: `Disponible hasta ${dateShort(a.available_until)}` }] : []),
  ];

  const rules = [
    ...(a.students_only ? [{ icon: GraduationCap, label: 'Solo estudiantes' }] : []),
    ...(a.allows_smokers ? [{ icon: Cigarette, label: 'Se permite fumar' }] : []),
    ...(a.pets_allowed ? [{ icon: Dog, label: 'Se admiten mascotas' }] : []),
    ...(a.gender_preference === 'hombre' ? [{ icon: Users, label: 'Solo chicos' }] : []),
    ...(a.gender_preference === 'mujer' ? [{ icon: Users, label: 'Solo chicas' }] : []),
  ];

  const flatmateGenders = (a.current_flatmates_genders ?? []).filter(Boolean);
  const videos = (a.videos ?? []).filter(Boolean);
  const instagramUrl = a.instagram ? `https://instagram.com/${a.instagram.replace(/^@+/, '').trim()}` : null;
  // Mensaje ya escrito: el enlace pelado abría una conversación en blanco y la
  // inmobiliaria no sabía ni de qué piso le hablaban ni que venía de Franky.
  const whatsappUrl = (() => {
    const numero = (a.whatsapp ?? '').replace(/[^\d]/g, '');
    if (numero.length < 6) return null;
    const texto = `Hola, he visto en Franky el piso «${a.title}» y me gustaría más información.`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen title={typeLabel[a.type]} back>
        {a.images && a.images.length > 0 ? (
          <View style={{ marginHorizontal: S.lg, marginTop: S.md, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input }}>
            {/* La galería vive en un marco redondeado: nada de foto a sangre. */}
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
                setPhoto(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, galleryWidth)))}>
              {a.images.map((img, i) => (
                <Image key={img} source={{ uri: img }} recyclingKey={img} transition={150}
                  style={{ width: galleryWidth, height: 260, backgroundColor: C.input }}
                  contentFit="cover" cachePolicy="memory-disk" />
              ))}
            </ScrollView>
            {a.images.length > 1 ? (
              <>
                {/* Blanco fijo: contador y puntitos van SOBRE la foto, no sobre
                    una superficie del tema. */}
                <View style={{ position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 11.5, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] }}>
                    {photo + 1} / {a.images.length}
                  </Text>
                </View>
                {/* Puntitos de posición: sin ellos no se ve que hay más fotos. */}
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                  {a.images.map((img, i) => (
                    <View key={img} style={{
                      width: i === photo ? 16 : 6, height: 6, borderRadius: 3,
                      backgroundColor: i === photo ? '#fff' : 'rgba(255,255,255,0.55)',
                    }} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
        <View style={{ padding: S.lg, gap: 12 }}>
          <FadeIn style={{ gap: 10 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[F.h1, { fontSize: 27, lineHeight: 32, letterSpacing: -0.7 }]}>{a.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <MapPin size={14} color={C.muted} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>
                {a.address ? `${a.address}, ` : ''}{a.city}
                {a.comunidad_autonoma ? ` · ${a.comunidad_autonoma}` : ''}
              </Text>
            </View>
            {/* El precio manda en esta pantalla: cifra grande que cuenta al abrir. */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 4 }}>
              <AnimatedNumber value={a.price ?? 0} suffix=" €" style={{ fontSize: 38, lineHeight: 44, letterSpacing: -1.4 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>/mes</Text>
              {a.is_verified ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                  <BadgeCheck size={16} color={C.blue} strokeWidth={2.2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, color: C.blue, fontFamily: FONT.semibold }}>Verificado</Text>
                </View>
              ) : null}
            </View>
          </FadeIn>
          {/* Lo esencial en píldoras: tipo, gastos y los números del piso. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pill label={typeLabel[a.type] ?? a.type} tone="blue" icon={HomeIcon} />
            {a.bills_included ? <Pill label="Gastos incluidos" tone="green" /> : null}
            {a.rooms && a.rooms > 0 ? <Pill label={`${a.rooms} ${plural(a.rooms, 'habitación', 'habitaciones')}`} icon={BedDouble} /> : null}
            {a.bathrooms && a.bathrooms > 0 ? <Pill label={`${a.bathrooms} ${plural(a.bathrooms, 'baño', 'baños')}`} icon={Bath} /> : null}
            {a.sqm ? <Pill label={`${a.sqm} m²`} icon={Ruler} /> : null}
            {a.room_size_sqm ? <Pill label={`Habitación de ${a.room_size_sqm} m²`} icon={Ruler} /> : null}
          </View>
          {a.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{a.description}</Text> : null}

          {features.length ? (
            <Section title="Qué tiene">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {features.map(f => <FeatureChip key={String(f.key)} icon={f.icon} label={f.label} />)}
              </View>
            </Section>
          ) : null}

          {bills.length ? (
            <Section title="Gastos">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {bills.map(b => <FeatureChip key={b.label} icon={b.icon} label={b.label} tone="green" />)}
              </View>
            </Section>
          ) : null}

          {stay.length ? (
            <Section title="Estancia y condiciones">
              <View style={{ gap: 8 }}>
                {stay.map(s => (
                  <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <s.icon size={16} color={C.text} strokeWidth={1.8} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {rules.length ? (
            <Section title="Normas y perfil">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {rules.map(r => <FeatureChip key={r.label} icon={r.icon} label={r.label} />)}
              </View>
            </Section>
          ) : null}

          {(a.current_flatmates_count || flatmateGenders.length || residents.length) ? (
            <Section title="Quién vive aquí">
              {/* Residentes con perfil público (RPC get_flat_public_residents):
                  conócelos antes de mudarte. Cada fila abre su perfil. */}
              {residents.length ? (
                <View style={{ gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Estudiantes que ya viven en este piso.</Text>
                  {residents.map((r) => (
                    <Tap key={r.id} haptic={false} onPress={() => router.push(`/perfil/${r.id}`)}
                      accessibilityLabel={`Ver el perfil de ${r.full_name ?? 'un residente'}`}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.input,
                        borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8,
                      }}>
                        <Avatar name={r.full_name} uri={r.avatar_url} size={40} />
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{r.full_name ?? 'Estudiante'}</Text>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
                            {[r.career, r.university_course].filter(Boolean).join(' · ') || 'Compañero de piso'}
                          </Text>
                          {r.room_label ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{r.room_label}</Text> : null}
                        </View>
                      </View>
                    </Tap>
                  ))}
                </View>
              ) : null}
              {(a.current_flatmates_count || flatmateGenders.length) ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {a.current_flatmates_count ? (
                    <FeatureChip icon={Users}
                      label={`${a.current_flatmates_count} ${plural(a.current_flatmates_count, 'persona', 'personas')}`} />
                  ) : null}
                  {flatmateGenders.map(g => <Pill key={g} label={GENDER_LABELS[g] ?? g} tone="blue" />)}
                </View>
              ) : null}
            </Section>
          ) : null}

          {a.extra_info ? (
            <Section title="Información extra">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Info size={16} color={C.muted} strokeWidth={1.8} style={{ marginTop: 2 }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, color: C.muted }]}>{a.extra_info}</Text>
              </View>
            </Section>
          ) : null}

          {videos.length ? (
            <Section title={videos.length === 1 ? 'Vídeo' : 'Vídeos'}>
              <View style={{ gap: 10 }}>
                {videos.map((uri) => (
                  <VideoPlayer key={uri} uri={uri} radius={R.md} contentFit="cover"
                    style={{ width: '100%', height: 210 }} />
                ))}
              </View>
            </Section>
          ) : null}

          {/* Contacto directo que deja el anunciante en el alta. */}
          {!isOwner && (whatsappUrl || a.contact_email || instagramUrl) ? (
            <Section title="Contacto del anunciante">
              <View style={{ gap: 10 }}>
                {whatsappUrl ? (
                  <Tap onPress={() => Linking.openURL(whatsappUrl)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MessageCircle size={16} color={C.blue} strokeWidth={1.9} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blueDeep }]}>WhatsApp · {a.whatsapp}</Text>
                    </View>
                  </Tap>
                ) : null}
                {a.contact_email ? (
                  <Tap onPress={() => Linking.openURL(`mailto:${a.contact_email}`)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Mail size={16} color={C.blue} strokeWidth={1.9} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blueDeep }]}>{a.contact_email}</Text>
                    </View>
                  </Tap>
                ) : null}
                {instagramUrl ? (
                  <Tap onPress={() => Linking.openURL(instagramUrl)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <AtSign size={16} color={C.blue} strokeWidth={1.9} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blueDeep }]}>{a.instagram}</Text>
                    </View>
                  </Tap>
                ) : null}
              </View>
            </Section>
          ) : null}

          {/* Salida a chat con quien publica (la ficha no tenía ninguna: solo
              se podía "Contactar" a ciegas y esperar). Oculto en tu propio
              anuncio y en fichas antiguas sin owner_id. */}
          {a.owner_id && !isOwner ? (
            <View style={{ marginTop: 4 }}>
              <Btn full variant="secondary" busy={chatBusy}
                label="Chatear con el anunciante" onPress={openChat} />
            </View>
          ) : null}
          {/* Hueco para la barra de acciones fija de abajo. */}
          <View style={{ height: isOwner ? 0 : 90 }} />
        </View>
      </Screen>
      {/* La barra de acciones no se pinta en tu propio anuncio: reservar una
          visita a tu piso o mandarte una solicitud a ti mismo no tiene sentido
          (y el servidor tampoco lo impide para 'accommodation'). */}
      {!isOwner ? (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.surface,
          borderTopWidth: 0.5, borderTopColor: C.border,
          paddingHorizontal: S.lg, paddingTop: 12, paddingBottom: insets.bottom + 12,
          flexDirection: 'row', gap: 10,
        }}>
          <View style={{ flex: 1 }}>
            <Btn full label="Reservar visita" onPress={() => setVisitOpen(true)} />
          </View>
          <View style={{ flex: 1 }}>
            {requestStatus ? (
              <Btn
                full
                variant="secondary"
                disabled
                label={
                  requestStatus === 'accepted' ? 'Solicitud aceptada'
                    : requestStatus === 'rejected' ? 'Solicitud rechazada'
                    : 'Solicitud enviada'
                }
                onPress={() => {}}
              />
            ) : (
              <Btn full variant="secondary" busy={busy} label="Contactar" onPress={contact} />
            )}
          </View>
        </View>
      ) : null}

      {/* Los mismos huecos que en el swipe de pisos (componente compartido). */}
      <VisitBookingSheet
        visible={visitOpen}
        accommodation={{ id: a.id, title: a.title }}
        onClose={() => setVisitOpen(false)}
      />
    </View>
  );
}
