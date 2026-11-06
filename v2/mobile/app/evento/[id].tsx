// ─── Ficha de evento ─────────────────────────────────────────────────────
// Editorial v3: cabecera normal (volver, editar, compartir), foto dentro de un
// marco con esquinas y hairline, fecha en bloque tipográfico (día grande y mes
// en rótulo), título en Outfit, datos en filas y precio + CTA fijo abajo. Toda la lógica de inscripción, compra (Stripe), lista de espera,
// códigos, camisetas, calendario y Crush Live es la de siempre: aquí solo
// cambia cómo se presenta y cómo se avisa (toasts en vez de Alert salvo en
// las decisiones con botones).
import {OrganizationEventBadge} from '@/components/OrganizationEventBadge';
import { EventAdmissionNotice } from '@/components/EventAdmissionNotice';
import { EVENT_ADMISSION_REJECTED } from '../../../shared/event-admission';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Alert, Share, Platform, useWindowDimensions, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays, Heart, MapPin, Users, Ticket, Shirt, Sparkles, Camera, ImagePlus,
  Share2, CalendarPlus, BellRing, Pencil, BarChart3, Clock, Tag,
  PartyPopper, BookOpen, Trophy, Drama, Handshake, Store, Pin, type LucideIcon,
} from 'lucide-react-native';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { Screen, Header } from '@/components/Screen';
import { Avatar, Btn, Chip, Pill, EmptyState, Tap, Skeleton, OptionsSheet } from '@/components/ui';
import { Lightbox } from '@/components/Lightbox';
import { FadeIn } from '@/components/motion';
import EventShirtOptions from '@/components/EventShirtOptions';
import { shirtPrices, shirtChoiceReady, shirtChoiceCents, shirtPriceLabel, type ShirtChoice } from '@/lib/event-shirt-pricing';
import { getEvent, joinEvent, getMyEventShirt, setMyEventShirt } from '@/lib/api';
import { getEventPhotos, addEventPhoto, MAX_EVENT_PHOTOS, type EventWithPhotos } from '@/lib/events-extra';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { buyTicket, ticketBreakdown, STRIPE_FEE_LABEL } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { getCachedSession } from '@/lib/session';
import { cachedEvent, primeEventCache, forgetEvent } from '@/lib/event-cache';
import { eur, dateLong, typeLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT, SHADOW } from '@/theme';
import type { EventItem, ShirtSize } from '@/lib/types';
import { SHIRT_SIZES } from '@/lib/types';

// Icono por categoría: sustituye al emoji (no se tiñe ni es consistente entre
// sistemas). Solo se usa cuando el evento no tiene foto.
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};

// Motivo de la RPC check_discount_code (136) → mensaje en español. Si la RPC
// no existe todavía (migración sin aplicar) o falla la red, no se muestra
// ningún error: el campo simplemente no aplica descuento (fail-soft).
const DISCOUNT_REASONS: Record<string, string> = {
  not_found: 'Ese código no existe para este evento.',
  expired: 'Ese código ha caducado.',
  exhausted: 'Ese código ya no tiene usos disponibles.',
  no_auth: 'Inicia sesión para usar un código.',
};

type Attendee = { id: string; full_name: string | null; avatar_url: string | null };

// Estado visible del evento: color y si bloquea apuntarse. 'agotado' depende
// del aforo y de cuántos van, así que se calcula fuera con soldOut. Los
// colores salen de C EN RENDER (la paleta es mutable con el tema).
function statusMeta(status: string | null | undefined, soldOut: boolean):
  { label: string; color: string; blocks: boolean } | null {
  if (status === 'cancelled') return { label: 'Cancelado', color: C.error, blocks: true };
  if (soldOut) return { label: 'Agotado', color: C.warning, blocks: true };
  if (status === 'ongoing') return { label: 'En curso', color: C.success, blocks: false };
  return null;
}

// Calendario por defecto donde crear el evento (iOS y Android difieren).
async function defaultCalendarId(): Promise<string | null> {
  try {
    if (Platform.OS === 'ios') {
      const cal = await Calendar.getDefaultCalendarAsync();
      return cal?.id ?? null;
    }
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.find(c => c.allowsModifications && c.accessLevel === Calendar.CalendarAccessLevel.OWNER)
      ?? cals.find(c => c.allowsModifications);
    return writable?.id ?? null;
  } catch { return null; }
}

// Fecha y hora por separado para las píldoras de la cabecera.
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
// Trozos de la fecha para el bloque tipográfico (día grande, mes en rótulo).
const diaNum = (iso: string) => String(new Date(iso).getDate());
const mesCorto = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase();
const diaSemana = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'long' });

const money = (c: number) => `${(c / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`;

// Icono suelto de la cabecera (editar, compartir): trazo fino, sin disco ni
// cuadrado tintado alrededor.
function HeaderIcon({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} hitSlop={12} haptic
      style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={21} color={C.text} strokeWidth={1.9} />
    </Tap>
  );
}

// Etiqueta de la ficha: contorno hairline, sin relleno de color (salvo el
// distintivo de Evento Franky, que va en violeta sólido).
function TagPill({ icon: Icon, label, solid, color }: { icon?: LucideIcon; label: string; solid?: boolean; color?: string }) {
  const bg = solid ? (color ?? C.blue) : 'transparent';
  const fg = solid ? C.onAccent : (color ?? C.text);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: bg, borderRadius: R.full,
      borderWidth: solid ? 0 : 0.5, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4.5, maxWidth: '100%',
    }}>
      {Icon ? <Icon size={12} color={fg} strokeWidth={1.9} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
        style={{ fontSize: 11.5, fontFamily: FONT.semibold, color: fg, letterSpacing: 0.1, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}

// Fecha como bloque tipográfico: día enorme en Outfit y mes en rótulo debajo.
function DateBlock({ iso }: { iso: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 58, paddingRight: 16, borderRightWidth: 0.5, borderRightColor: C.border }}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: FONT.display, fontSize: 38, lineHeight: 42, letterSpacing: -1.4, color: C.text }}>{diaNum(iso)}</Text>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: FONT.semibold, fontSize: 11.5, letterSpacing: 1.2, color: C.muted }}>{mesCorto(iso)}</Text>
    </View>
  );
}

// Acción secundaria en fila (calendario, recordatorio, compartir): icono
// suelto de trazo fino y rótulo debajo, área táctil de 44 px.
function ActionTile({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} haptic
      style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border }}>
      <Icon size={19} color={C.text} strokeWidth={1.75} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.text, textAlign: 'center' }]} numberOfLines={1}>{label}</Text>
    </Tap>
  );
}

// Fila de dato: icono suelto (sin cuadrado tintado) y el texto al lado.
function MetaRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <Icon size={17} color={C.muted} strokeWidth={1.75} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export default function EventoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [ev, setEv] = useState<EventItem | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Asistentes: número siempre; avatares solo si el organizador deja ver el
  // conteo (events.show_participant_count) y la RLS permite leer los perfiles.
  const [going, setGoing] = useState<{ count: number; showAvatars: boolean; avatars: Attendee[] }>(
    { count: 0, showAvatars: false, avatars: [] },
  );
  // Organizador del evento (mejora 76/78): enlace a su ficha pública y, si el
  // que mira es él mismo, acceso directo a sus estadísticas (Mis eventos).
  const [organizer, setOrganizer] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null);
  const [isMine, setIsMine] = useState(false);
  // Lista de espera (mejora 71): solo importa cuando el aforo está completo.
  // `available` en false oculta el bloque entero si la tabla aún no existe en
  // producción (fail-soft: se comporta exactamente como hoy).
  const [waitlist, setWaitlist] = useState<{ available: boolean; joined: boolean; busy: boolean }>({
    available: true, joined: false, busy: false,
  });
  // Código de descuento (mejora 77): solo informativo, el cobro real lo fija
  // el servidor al comprar (buyTicket no admite todavía aplicar el código).
  const [discountCode, setDiscountCode] = useState('');
  const [discountChecking, setDiscountChecking] = useState(false);
  const [discount, setDiscount] = useState<{ code: string; cents: number } | null>(null);
  const [discountMsg, setDiscountMsg] = useState<string | null>(null);
  // Galería (events.photos, 027): null = las que trae el evento; tras subir
  // una foto se sobrescribe con la lista nueva sin recargar la ficha.
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Hoja "¿cuándo te avisamos?" (antes era un Alert de tres botones).
  const [reminderOpen, setReminderOpen] = useState(false);
  const { width: screenWidth } = useWindowDimensions();

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para "Reintentar".
  const alive = useRef(true);
  // Si la ficha ya se conoce (viene de la lista o del mapa, o se abrió antes)
  // se pinta al instante y se revalida por detrás; sin esqueleto.
  const load = useCallback(() => {
    const known = cachedEvent(String(id));
    setEv(known ?? undefined);
    setPhotos(null);
    getEvent(String(id))
      .then((v) => {
        if (v) primeEventCache(v); else forgetEvent(String(id));
        if (!alive.current) return;
        // Misma ficha que la cacheada: se conserva la referencia para no
        // relanzar los efectos que dependen de `ev`.
        setEv(prev => (prev && v && JSON.stringify(prev) === JSON.stringify(v) ? prev : v));
      })
      .catch(() => { if (alive.current) setEv(prev => prev ?? null); });
  }, [id]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  // Conteo de asistentes (status distinto de cancelado) + avatares opcionales.
  const loadGoing = useCallback(async () => {
    if (!id) return;
    try {
      // event_participants ya no se lee en bloque (migración 150): el conteo y
      // los avatares vienen por RPC, que ya respetan show_participant_count.
      // Conteo y preferencia de visibilidad a la vez (antes, una detrás de otra).
      const [{ data: countData }, { data: evShow }] = await Promise.all([
        supabase.rpc('get_event_participant_count', { p_event_id: String(id) }),
        supabase.from('events').select('show_participant_count').eq('id', String(id)).maybeSingle(),
      ]);
      const count = (countData as number | null) ?? 0;
      const show = (evShow as { show_participant_count?: boolean } | null)?.show_participant_count !== false;
      let avatars: Attendee[] = [];
      if (show) {
        const { data: parts } = await supabase
          .rpc('get_event_attendee_preview', { p_event_id: String(id), p_limit: 8 });
        const ids = ((parts ?? []) as { user_id: string }[]).map((p) => p.user_id);
        if (ids.length) {
          const { data: profs } = await supabase
            .from('public_profiles').select('id, full_name, avatar_url').in('id', ids);
          avatars = (profs as Attendee[]) ?? [];
        }
      }
      if (alive.current) setGoing({ count: count ?? 0, showAvatars: show, avatars });
    } catch { /* sin red: dejamos el conteo a cero, no es fatal */ }
  }, [id]);
  useEffect(() => { loadGoing(); }, [loadGoing]);

  // Talla de camiseta (164): solo se pregunta si el evento reparte camisetas y
  // esta persona participa de verdad (inscrita o con entrada). Así el recuento
  // del organizador cuadra con su lista de asistentes.
  const [shirt, setShirt] = useState<{ participa: boolean; size: ShirtSize | null; priceCents?: number | null }>(
    { participa: false, size: null },
  );
  const [shirtChoice, setShirtChoice] = useState<ShirtChoice>(null);
  useEffect(() => { setShirtChoice(null); setShirt({ participa: false, size: null }); }, [id]);
  const [shirtBusy, setShirtBusy] = useState<ShirtSize | null>(null);
  const loadShirt = useCallback(async () => {
    if (!id || !ev?.shirts_enabled) return;
    try { const saved = await getMyEventShirt(String(id)); setShirt(saved); if (saved.size) setShirtChoice(saved.size); } catch { /* sin red: no se pinta */ }
  }, [id, ev?.shirts_enabled]);
  useEffect(() => { loadShirt(); }, [loadShirt]);
  const elegirTalla = async (size: ShirtSize) => {
    setShirtBusy(size);
    try {
      const r = await setMyEventShirt(String(id), size);
      if (r.ok) {
        setShirt((s) => ({ ...s, size, priceCents: r.priceCents }));
        setShirtChoice(size);
        Haptics.selectionAsync().catch(() => {});
        toast(size === 'ninguna' ? 'Anotado: sin camiseta' : `Talla ${size} guardada`);
      } else toastError('No se pudo guardar la talla', 'Inténtalo de nuevo en unos segundos.');
    } catch {
      toastError('No se pudo guardar la talla', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setShirtBusy(null);
    }
  };

  // Datos públicos del organizador (public_profiles) + si soy yo el que organiza.
  useEffect(() => {
    if (!ev?.organizer_id) { setOrganizer(null); setIsMine(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Sesión local (sin viaje al servidor de auth): solo decide si se
        // enseña el acceso a "Mis eventos"; los permisos reales los pone la BD.
        const [session, { data: prof }] = await Promise.all([
          getCachedSession(),
          supabase.from('public_profiles').select('id, full_name, avatar_url').eq('id', ev.organizer_id).maybeSingle(),
        ]);
        if (cancelled) return;
        setOrganizer((prof as { id: string; full_name: string | null; avatar_url: string | null }) ?? null);
        setIsMine(!!session?.user && session.user.id === ev.organizer_id);
      } catch {
        if (!cancelled) { setOrganizer(null); setIsMine(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [ev?.organizer_id]);

  // Aforo completo, calculado aparte de `soldOut` (que vive tras el early
  // return) para poder decidir aquí si hace falta comprobar la lista de espera.
  const soldOutForWaitlist = !!(ev && ev.max_capacity != null && going.count >= ev.max_capacity);

  // ¿Ya estoy apuntado a la lista de espera de este evento agotado? Si la
  // tabla event_waitlist todavía no existe en producción, la consulta falla y
  // ocultamos el bloque entero (comportamiento idéntico al de hoy).
  useEffect(() => {
    if (!ev || !soldOutForWaitlist) return;
    let cancelled = false;
    (async () => {
      try {
        const user = (await getCachedSession())?.user;
        if (!user) { if (!cancelled) setWaitlist(w => ({ ...w, joined: false })); return; }
        const { data, error } = await supabase
          .from('event_waitlist').select('event_id')
          .eq('event_id', ev.id).eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        if (!cancelled) setWaitlist({ available: true, joined: !!data, busy: false });
      } catch {
        if (!cancelled) setWaitlist(w => ({ ...w, available: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [ev, soldOutForWaitlist]);

  // Pedir sesión con un Alert de dos botones: es una decisión, no un aviso.
  const askLogin = (msg: string) => Alert.alert('Inicia sesión', msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Entrar', onPress: () => router.push('/welcome') },
  ]);

  // Apuntarse o salir de la lista de espera. Optimista sobre `joined`: si la
  // escritura falla, se revierte y se avisa.
  const joinWaitlist = async () => {
    if (!ev) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { askLogin('Necesitas una cuenta para apuntarte a la lista de espera.'); return; }
    setWaitlist(w => ({ ...w, busy: true }));
    const { error } = await supabase.from('event_waitlist').insert({ event_id: ev.id, user_id: user.id });
    setWaitlist(w => ({ available: w.available, busy: false, joined: error ? w.joined : true }));
    if (error) toastError('No se pudo apuntar', error.message?.includes('event_audience_forbidden') ? EVENT_ADMISSION_REJECTED : 'Inténtalo de nuevo en unos segundos.');
    else { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); toast('En la lista de espera', 'Te avisamos si se libera una plaza.'); }
  };
  const leaveWaitlist = async () => {
    if (!ev) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setWaitlist(w => ({ ...w, busy: true }));
    const { error } = await supabase.from('event_waitlist').delete()
      .match({ event_id: ev.id, user_id: user.id });
    setWaitlist(w => ({ available: w.available, busy: false, joined: error ? w.joined : false }));
    if (error) toastError('No se pudo salir', 'Inténtalo de nuevo en unos segundos.');
    else toastInfo('Fuera de la lista de espera');
  };

  // Valida un código de descuento contra check_discount_code (136). Si la RPC
  // no existe todavía o falla la red, no se muestra error: sencillamente no
  // se aplica ningún descuento (fail-soft, tal y como pide la mejora 77).
  const applyDiscountCode = async () => {
    if (!ev || !discountCode.trim()) return;
    setDiscountChecking(true);
    setDiscountMsg(null);
    try {
      const cents = Math.round(Number(ev.price) * 100);
      const { data, error } = await supabase.rpc('check_discount_code', {
        p_event: ev.id, p_code: discountCode.trim(), p_price_cents: cents,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as
        { valid: boolean; discount_cents: number; reason: string | null } | null;
      if (row?.valid) {
        setDiscount({ code: discountCode.trim().toUpperCase(), cents: row.discount_cents });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        setDiscount(null);
        setDiscountMsg(DISCOUNT_REASONS[row?.reason ?? ''] ?? 'Ese código no es válido.');
      }
    } catch {
      setDiscount(null);
      setDiscountMsg(null);
    } finally {
      setDiscountChecking(false);
    }
  };

  // ── Cargando: esqueleto con la silueta real de la ficha (foto + líneas) ──
  if (ev === undefined) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back />
      <Skeleton height={210} radius={R.xl} style={{ marginTop: S.md, marginBottom: S.lg }} />
      <Skeleton height={30} radius={R.sm} style={{ width: '70%' }} />
      <Skeleton height={20} radius={R.sm} style={{ width: '45%' }} />
      <Skeleton height={64} radius={R.md} />
      <Skeleton height={120} radius={R.lg} />
    </View>
  );
  if (ev === null) return (
    <Screen title="Evento" back>
      <EmptyState icon={CalendarDays} title="No se pudo cargar el evento"
        subtitle="Puede que ya no esté disponible o que falle tu conexión. Inténtalo de nuevo."
        cta="Reintentar" onCta={load} />
    </Screen>
  );

  const prices = shirtPrices(ev);
  const selectedCents = prices ? (shirt.participa && shirt.priceCents != null && shirtChoice === shirt.size ? shirt.priceCents : shirtChoiceCents(prices, shirtChoice)) : null;
  const free = !ev.price || Number(ev.price) === 0;
  // Modo de cobro (migración 097), igual que en la web (/eventos/[id]):
  //   'app'  → Franky cobra la entrada con Stripe (event_tickets).
  //   'info' → el precio es ORIENTATIVO: la gente se apunta gratis y paga
  //            aparte (en persona, Bizum...). Aquí NO se cobra nada.
  //   'free' → gratuito.
  // Fallback a la semántica antigua (precio > 0 ⇒ app) por si alguna fila no
  // tuviera todavía payment_mode. Sin esto, la app enseñaba "Comprar entrada"
  // en eventos de pago en mano e intentaba cobrar por Stripe.
  const paymentMode = ev.payment_mode ?? (Number(ev.price) > 0 ? 'app' : 'free');
  const payViaApp = !free && paymentMode === 'app';
  const infoPrice = !free && paymentMode !== 'app';
  // Aforo completo: hay tope y ya lo alcanzan (o superan) los inscritos.
  const soldOut = ev.max_capacity != null && going.count >= ev.max_capacity;
  const st = statusMeta(ev.status, soldOut);
  const blocked = st?.blocks ?? false;
  const CatIcon = CAT_ICON[ev.category] ?? Pin;
  const priceCents = Math.round(Number(ev.price) * 100);
  const finalCents = discount ? Math.max(0, priceCents - discount.cents) : priceCents;

  // Añadir a mi calendario (expo-calendar). Recordatorio propio del sistema; el
  // aviso por push ya lo manda un cron de servidor, esto es complementario.
  const addToCalendar = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      toastError('Permiso necesario', 'Activa el acceso al calendario para guardar el evento.');
      return;
    }
    const calId = await defaultCalendarId();
    if (!calId) {
      toastError('Sin calendario', 'No encontramos un calendario donde guardar el evento.');
      return;
    }
    const start = new Date(ev.start_date);
    const end = ev.end_date ? new Date(ev.end_date) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    try {
      await Calendar.createEventAsync(calId, {
        title: ev.title,
        startDate: start,
        endDate: end,
        location: [ev.venue, ev.address, ev.city].filter(Boolean).join(', '),
        notes: ev.description ?? undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Añadido a tu calendario', 'Te avisará cuando se acerque el evento.');
    } catch {
      toastError('No se pudo añadir', 'Inténtalo de nuevo en unos segundos.');
    }
  };

  // Recordatorio propio configurable (1 día o 1 hora antes). Es una
  // notificación LOCAL del teléfono: funciona aunque el push de servidor no
  // esté configurado, y el usuario elige cuándo. Si la fecha ya pasó, avisamos.
  const scheduleReminder = async (minutesBefore: number, label: string) => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      let granted = perm.granted;
      if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) {
        toastError('Permiso necesario', 'Activa las notificaciones para que podamos avisarte.');
        return;
      }
      const when = new Date(new Date(ev.start_date).getTime() - minutesBefore * 60 * 1000);
      if (when.getTime() <= Date.now()) {
        toastInfo('Demasiado tarde', `El evento empieza antes de ${label}.`);
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: ev.title,
          body: `Empieza ${label === '1 hora' ? 'en una hora' : 'mañana'}. ${[ev.venue, ev.city].filter(Boolean).join(', ')}`.trim(),
          data: { route: `/evento/${ev.id}` },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Recordatorio puesto', `Te avisaremos ${label} antes.`);
    } catch {
      toastError('No se pudo programar', 'Inténtalo de nuevo en unos segundos.');
    }
  };

  // Compartir el evento (hoja nativa de compartir).
  const shareEvent = async () => {
    try {
      const when = dateLong(ev.start_date);
      const where = [ev.venue, ev.city].filter(Boolean).join(', ');
      await Share.share({
        // OJO: la web sirve /eventos/[id] (plural). /evento/{id} daba 404 a
        // quien recibía el enlace sin la app instalada.
        message: `${ev.title}\n${when}${where ? `\n${where}` : ''}\nhttps://franky.es/eventos/${ev.id}`,
      });
    } catch { /* el usuario canceló la hoja de compartir */ }
  };

  // Fotos a enseñar: portada + photos (027), sin repetir. Solo el organizador
  // puede añadir (la política de UPDATE de events es suya): la BD no tiene
  // sitio para fotos de asistentes, así que no se ofrece a nadie más.
  const galeria = photos ?? getEventPhotos(ev as EventWithPhotos);
  const cell = Math.floor((screenWidth - S.lg * 2 - 12) / 3);
  const addPhoto = async () => {
    if (photoBusy) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    setPhotoBusy(true);
    try {
      // addEventPhoto pasa por uploadPickedImage (JPEG siempre): nunca el mimeType en crudo.
      const r = await addEventPhoto(ev.id, res.assets[0]);
      if (!r.ok) { toastError('No se pudo subir la foto', r.message); return; }
      setPhotos(getEventPhotos({ ...(ev as EventWithPhotos), photos: r.photos }));
      toast('Foto añadida');
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const buy = async () => {
    // Gratis y "precio informativo" comparten flujo: inscripción sin cobro. En
    // el modo informativo el dinero se paga fuera de Franky, así que jamás se
    // abre un checkout de Stripe.
    if (!payViaApp) {
      if (busy || (prices && !shirtChoiceReady(shirtChoice))) return;
      setBusy(true);
      try {
        const r = await joinEvent(ev.id, prices ? shirtChoice as ShirtSize : undefined);
        if (r.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast(
            'Plaza confirmada',
            infoPrice
              ? `Estás dentro. El pago (${r.priceCents != null ? shirtPriceLabel(r.priceCents) : eur(ev.price)}) lo gestiona el organizador, no se cobra por la app.`
              : 'Estás dentro. Te llegará un recordatorio.',
          );
          loadGoing();
          // Con camisetas, la pregunta de la talla aparece justo al apuntarse.
          loadShirt();
        } else if (r.reason === 'auth') {
          askLogin('Necesitas una cuenta para apuntarte.');
        } else toastError('No se pudo completar', r.message?.includes('event_audience_forbidden') ? EVENT_ADMISSION_REJECTED : /Aforo completo|event_full/.test(r.message ?? '') ? 'Aforo completo. No se ha guardado la inscripción.' : 'Revisa la opción elegida e inténtalo de nuevo.');
      } catch {
        toastError('No se pudo completar', 'Revisa tu conexión e inténtalo de nuevo.');
      } finally {
        setBusy(false);
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { askLogin('Necesitas una cuenta para comprar entradas.'); return; }
      setBusy(true);
      try {
        // El código validado viaja al servidor: si no, se cobraría el precio
        // completo tras haber enseñado el precio rebajado.
        const r = await buyTicket(ev.id, discount?.code);
        if (r.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast('Entrada confirmada', 'Tu entrada con QR está en Perfil, Mis entradas.');
          loadGoing();
          loadShirt();
        } else if (r.status === 'pending') {
          toastInfo('Pago en proceso', 'Si has terminado el pago, tu entrada se confirmará en unos segundos.');
        } else if (r.status === 'cancelled') {
          toastInfo('Pago no completado', 'La reserva se libera automáticamente.');
        } else {
          toastError('No se pudo comprar', r.message);
        }
      } catch {
        toastError('No se pudo comprar', 'Revisa tu conexión e inténtalo de nuevo.');
      } finally {
        setBusy(false);
      }
    }
  };

  const ctaLabel = prices && shirt.participa ? 'Ya estás inscrito'
    : prices && !shirtChoiceReady(shirtChoice) ? 'Elige opción y talla'
    : ev.status === 'cancelled' ? 'Evento cancelado'
    : soldOut ? 'Aforo completo'
    : payViaApp && discount && finalCents <= 0 ? 'Conseguir entrada gratis'
    : payViaApp ? 'Comprar entrada'
    : infoPrice ? 'Apuntarme (pago aparte)'
    : 'Apuntarme gratis';

  const heroH = 210;
  const barH = insets.bottom + 78;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header back right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isMine ? <HeaderIcon icon={Pencil} label="Editar evento" onPress={() => router.push(`/evento-editar?id=${ev.id}`)} /> : null}
          <HeaderIcon icon={Share2} label="Compartir evento" onPress={shareEvent} />
        </View>
      } />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: barH + S.lg }}>
        {/* ── Foto en marco (nunca a sangre) ── */}
        <FadeIn>
          <View style={{
            height: heroH, marginHorizontal: S.lg, marginTop: S.md, borderRadius: R.xl, overflow: 'hidden',
            backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border,
          }}>
            {ev.image_url ? (
              <Image source={{ uri: ev.image_url }} recyclingKey={ev.id} cachePolicy="memory-disk" transition={200}
                style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              // Sin foto: bloque neutro con el icono de la categoría, nada de degradado.
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <CatIcon size={54} color={C.muted} strokeWidth={1.2} />
              </View>
            )}
          </View>
        </FadeIn>

        {/* ── Titular editorial: etiquetas, título y fecha en bloque ── */}
        <FadeIn index={1}>
          <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* Evento Franky (164): lo marca la BD por el rol del organizador */}
              {ev.is_official ? <TagPill icon={Sparkles} label="Evento Franky" solid /> : null}<OrganizationEventBadge eventId={ev.id}/>
              <TagPill icon={CatIcon} label={typeLabel[ev.category] ?? ev.category} />
              {st ? <TagPill label={st.label} solid color={st.color} /> : null}
            </View>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3}
              style={{ color: C.text, fontFamily: FONT.display, fontSize: 29, lineHeight: 34, letterSpacing: -1 }}>{ev.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 2 }}>
              <DateBlock iso={ev.start_date} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
                  style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.text, textTransform: 'capitalize' }}>
                  {diaSemana(ev.start_date)} · {horaCorta(ev.start_date)}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{ev.venue ?? ev.city}</Text>
              </View>
            </View>
          </View>
        </FadeIn>

        <View style={{ padding: S.lg, gap: 14 }}>
          {organizer ? (
            <Tap onPress={() => router.push(`/organizador/${organizer.id}`)} haptic={false}
              accessibilityLabel={`Ver eventos de ${organizer.full_name ?? 'el organizador'}`} accessibilityHint="Abre la página del organizador">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar name={organizer.full_name} uri={organizer.avatar_url} size={34} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Organiza</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{organizer.full_name ?? 'Un organizador'}{isMine ? ' (tú)' : ''}</Text>
                </View>
                {going.count > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {going.showAvatars && going.avatars.length ? (
                      <View style={{ flexDirection: 'row', width: 22 + Math.min(going.avatars.length, 4) * 14 }}>
                        {going.avatars.slice(0, 4).map((a, i) => (
                          <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: C.bg, borderRadius: 13 }}>
                            <Avatar name={a.full_name} uri={a.avatar_url} size={22} />
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text, fontFamily: FONT.semibold }]}>{going.count} {going.count === 1 ? 'va' : 'van'}</Text>
                  </View>
                ) : null}
              </View>
            </Tap>
          ) : null}

          {/* Datos clave en una tarjeta */}
          <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 16, gap: 14, borderWidth: 0.5, borderColor: C.border, ...SHADOW.card }}>
            <MetaRow icon={CalendarDays}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textTransform: 'capitalize', fontFamily: FONT.medium }]}>{dateLong(ev.start_date)}</Text>
              {ev.end_date ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Hasta las {horaCorta(ev.end_date)}{new Date(ev.end_date).toDateString() !== new Date(ev.start_date).toDateString() ? ` del ${fechaCorta(ev.end_date)}` : ''}</Text> : null}
            </MetaRow>
            <MetaRow icon={MapPin}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontFamily: FONT.medium }]}>{ev.venue ?? ev.city}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{[ev.address, ev.city].filter(Boolean).join(' · ')}</Text>
            </MetaRow>
            {ev.max_capacity ? (
              <MetaRow icon={Users}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontFamily: FONT.medium }]}>
                  Aforo de {ev.max_capacity} personas{soldOut ? ', completo' : ''}
                </Text>
                {going.count > 0 && !soldOut ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Quedan {Math.max(0, ev.max_capacity - going.count)} plazas</Text> : null}
              </MetaRow>
            ) : null}
          </View>

          {/* Acciones secundarias: calendario, recordatorio, compartir, estadísticas */}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <ActionTile icon={CalendarPlus} label="Calendario" onPress={addToCalendar} />
            <ActionTile icon={BellRing} label="Avísame" onPress={() => setReminderOpen(true)} />
            <ActionTile icon={Share2} label="Compartir" onPress={shareEvent} />
            {isMine ? <ActionTile icon={BarChart3} label="Mis eventos" onPress={() => router.push('/mis-eventos')} /> : null}
          </View>

          {/* Si el que mira es el organizador: asistentes y códigos */}
          {isMine ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Btn small full variant="secondary" icon={Users} label="Asistentes" onPress={() => router.push(`/asistentes/${ev.id}`)} />
              </View>
              {payViaApp ? (
                <View style={{ flex: 1 }}>
                  <Btn small full variant="secondary" icon={Tag} label="Códigos" onPress={() => router.push(`/codigos/${ev.id}`)} />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Talla de camiseta (164): se pregunta a quien ya participa, y se
              puede cambiar hasta el día del evento. */}
          {prices && <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 10, borderWidth: 0.5, borderColor: C.border }}>
            {shirt.participa && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Tu inscripción{shirt.priceCents != null ? ` · ${shirtPriceLabel(shirt.priceCents)}` : ' · opción pendiente'}</Text>}
            <EventShirtOptions prices={prices} value={shirtChoice} disabled={busy || shirtBusy !== null || ev.status === 'cancelled' || new Date(ev.start_date).getTime() <= Date.now()} onChange={next => {
              if (shirt.participa && shirtChoiceReady(next)) void elegirTalla(next as ShirtSize);
              else setShirtChoice(next);
            }} />
            {shirt.participa && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Cambiar entre con y sin camiseta aplica el precio mostrado. Cambiar solo la talla conserva tu importe.</Text>}
          </View>}
          {ev.shirts_enabled && !prices && shirt.participa ? (
            <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 8, borderWidth: 0.5, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shirt size={17} color={C.blue} strokeWidth={1.9} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>
                  {shirt.size ? 'Tu talla de camiseta' : '¿Qué talla de camiseta usas?'}
                </Text>
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                {shirt.size
                  ? 'Guardada. Puedes cambiarla hasta el día del evento.'
                  : 'En este evento se reparten camisetas: elige tu talla para que te reserven la tuya.'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                {SHIRT_SIZES.map((s) => (
                  <Chip
                    key={s}
                    label={s === 'ninguna' ? 'No quiero' : shirtBusy === s ? `${s}...` : s}
                    active={shirt.size === s}
                    onPress={() => elegirTalla(s)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {/* Crush Live: solo existe en eventos oficiales habilitados por el
              equipo. La propia pantalla vuelve a comprobar inscripción, edad,
              verificación y consentimiento antes de mostrar candidatos. */}
          {ev.crush_live_enabled ? (
            <View style={{ borderRadius: R.lg, padding: 16, gap: 12, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.surface, ...SHADOW.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Heart size={22} color={C.blue} fill={C.blue} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontFamily: FONT.heading, fontSize: 18, letterSpacing: -0.4 }}>Crush Live</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>Descubre asistentes afines. Los likes son secretos.</Text>
                </View>
              </View>
              <Btn full label="Buscar mi match en el evento" onPress={() => router.push({ pathname: '/crush-live', params: { eventId: ev.id } })} />
            </View>
          ) : null}

          {/* Lista de espera (mejora 71): solo cuando el aforo está completo
              y la tabla existe (si no, waitlist.available queda en false y no
              se pinta nada, igual que hoy). */}
          {soldOut && !isMine && waitlist.available ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: C.surface, borderRadius: R.lg, padding: 14, borderWidth: 0.5, borderColor: C.border,
            }}>
              <Clock size={19} color={C.muted} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>
                  {waitlist.joined ? 'Estás en la lista de espera' : 'Aforo completo por ahora'}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                  {waitlist.joined
                    ? 'Te avisamos si se libera una plaza.'
                    : 'Apúntate y te avisamos si queda sitio.'}
                </Text>
              </View>
              <Btn small variant={waitlist.joined ? 'secondary' : 'primary'} busy={waitlist.busy}
                label={waitlist.joined ? 'Salir' : 'Avísame'}
                onPress={waitlist.joined ? leaveWaitlist : joinWaitlist} />
            </View>
          ) : null}

          <EventAdmissionNotice eventId={ev.id} />
          {ev.description ? (
            <View style={{ gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Sobre el plan</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{ev.description}</Text>
            </View>
          ) : null}

          {/* Fotos del evento (events.photos, 027): rejilla de 3 y visor a
              pantalla completa. El organizador puede añadir hasta 5. */}
          {galeria.length > 0 || isMine ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Camera size={17} color={C.text} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>Fotos del evento</Text>
                {galeria.length > 1 ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{galeria.length} fotos</Text> : null}
              </View>
              {galeria.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {galeria.map((uri, i) => (
                    <Tap key={uri} haptic={false} onPress={() => setLightbox(uri)}
                      accessibilityRole="imagebutton" accessibilityLabel={`Foto ${i + 1} de ${galeria.length}, ampliar`}>
                      <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk" transition={120} recyclingKey={uri}
                        style={{ width: cell, height: cell, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border }} />
                    </Tap>
                  ))}
                </View>
              ) : (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Aún no hay fotos. Sube alguna para que la gente vea el ambiente.</Text>
              )}
              {isMine ? (
                galeria.length < MAX_EVENT_PHOTOS ? (
                  <Btn small full variant="ghost" icon={ImagePlus} busy={photoBusy}
                    label={`Añadir foto (${galeria.length}/${MAX_EVENT_PHOTOS})`} onPress={addPhoto} />
                ) : (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Ya tienes las {MAX_EVENT_PHOTOS} fotos que admite un evento.</Text>
                )
              ) : null}
            </View>
          ) : null}

          {infoPrice ? (
            // Precio orientativo: se paga fuera de Franky. Se dice claro para
            // que nadie espere pagar con tarjeta desde la app.
            <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 4, borderWidth: 0.5, borderColor: C.border }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Se paga aparte, no por la app</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                {prices ? 'El importe de la opción elegida lo cobra el organizador directamente' : `El organizador indica un precio de ${eur(ev.price)}, pero lo cobra él directamente`}
                (en persona, Bizum...). Apuntarte aquí es gratis y no se te cobra nada.
              </Text>
            </View>
          ) : null}

          {payViaApp && !isMine ? (
            // Código de descuento (mejora 77): solo comprueba y muestra el
            // precio resultante ANTES de comprar. Si no hay migración/RPC,
            // simplemente no pasa nada al pulsar "Aplicar" (fail-soft).
            <View style={{ gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>¿Tienes un código?</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, minHeight: 46 }}>
                  <Tag size={16} color={C.muted} strokeWidth={1.75} />
                  <TextInput
                    value={discountCode}
                    onChangeText={(t) => { setDiscountCode(t); setDiscount(null); setDiscountMsg(null); }}
                    placeholder="CÓDIGO" placeholderTextColor={C.muted}
                    autoCapitalize="characters" autoCorrect={false}
                    accessibilityLabel="Código de descuento"
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    onSubmitEditing={applyDiscountCode} returnKeyType="done"
                    style={{ flex: 1, fontSize: 15, color: C.text, fontFamily: FONT.semibold, letterSpacing: 0.5, paddingVertical: 0 }}
                  />
                </View>
                <Btn small variant="secondary" label="Aplicar" busy={discountChecking}
                  disabled={!discountCode.trim()} onPress={applyDiscountCode} />
              </View>
              {discountMsg ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.error }]}>{discountMsg}</Text> : null}
              {discount ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.success, fontFamily: FONT.semibold }]}>
                  Código {discount.code} aplicado: -{money(discount.cents)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {payViaApp ? (() => {
            // Desglose transparente ANTES de pagar: a dónde va cada euro. El
            // importe real lo fija el servidor; esto es informativo (mismo %).
            const b = ticketBreakdown(priceCents);
            const Row = ({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) => (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }, strong && { color: C.text, fontFamily: FONT.semibold }, color ? { color } : null]}>{label}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text }, strong && { fontFamily: FONT.heading }, color ? { color } : null]}>{value}</Text>
              </View>
            );
            return (
              <View style={{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 6, borderWidth: 0.5, borderColor: C.border }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginBottom: 2 }]}>¿A dónde va tu dinero?</Text>
                <Row label="Al organizador del evento" value={money(b.organizerCents)} />
                <Row label={`Comisión de servicio Franky (${b.feePct}%)`} value={money(b.frankyCents)} />
                <Row label={`Gastos de pago con tarjeta, Stripe (${STRIPE_FEE_LABEL})`} value={money(b.stripeCents)} />
                <Row label="Tasa App Store / Google Play" value="0,00 €" />
                {discount ? (
                  <>
                    <Row label={`Descuento (${discount.code})`} value={`-${money(discount.cents)}`} color={C.success} />
                    <View style={{ height: 0.5, backgroundColor: C.border, marginVertical: 4 }} />
                    <Row label="Precio final" value={money(finalCents)} strong />
                  </>
                ) : null}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 4 }]}>
                  Apple y Google no cobran tasas por entradas de eventos presenciales.
                </Text>
              </View>
            );
          })() : null}
          {payViaApp ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ticket size={14} color={C.muted} strokeWidth={1.75} style={{ marginTop: 2 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>Pago seguro con Stripe (tarjeta, Apple Pay y Google Pay). Entrada con QR. Cancelación hasta 24 h antes.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Bloque de precio + CTA fijo abajo ── */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.surface,
        borderTopWidth: 0.5, borderTopColor: C.border,
        paddingHorizontal: S.lg, paddingTop: 12, paddingBottom: insets.bottom + 12,
        flexDirection: 'row', alignItems: 'center', gap: 14, ...SHADOW.float,
      }}>
        <View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{prices && shirtChoice === null ? 'Desde' : payViaApp ? 'Entrada' : infoPrice ? 'Se paga allí' : 'Precio'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text maxFontSizeMultiplier={1.2} style={[F.display, { fontSize: 25, letterSpacing: -0.9, color: free ? C.success : C.text, fontVariant: ['tabular-nums'] }]}>
              {selectedCents !== null ? shirtPriceLabel(selectedCents) : payViaApp && discount ? money(finalCents) : eur(ev.price)}
            </Text>
            {payViaApp && discount ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textDecorationLine: 'line-through' }]}>{eur(ev.price)}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Btn full busy={busy} disabled={blocked || !!(prices && (shirt.participa || !shirtChoiceReady(shirtChoice)))} icon={blocked ? undefined : (payViaApp ? Ticket : undefined)}
            label={ctaLabel} onPress={buy} />
        </View>
      </View>

      <OptionsSheet
        visible={reminderOpen}
        title="¿Cuándo te avisamos?"
        onClose={() => setReminderOpen(false)}
        options={[
          { label: '1 día antes', icon: CalendarDays, onPress: () => scheduleReminder(24 * 60, '1 día') },
          { label: '1 hora antes', icon: Clock, onPress: () => scheduleReminder(60, '1 hora') },
        ]}
      />
      <Lightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}
