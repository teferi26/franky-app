// ─── Mis pisos: panel de métricas del propietario/inmobiliaria ───────────
// Los pisos se publican desde la web (franky.es/negocio); aquí el propietario
// ve cómo van: vistas, likes, favoritos, solicitudes y reservas de visita.
// Todo sale del RPC get_owner_listing_stats (migración 161), que agrega por
// piso y solo devuelve los del auth.uid(). Al tocar un piso se expande el
// detalle con dos secciones: "Interesados" (accommodation_requests, RLS 011)
// y "Visitas" (visit_bookings de sus slots, RLS 087).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, Linking, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  Home, Eye, Heart, Users, CalendarClock, ChevronDown, ChevronUp, MessageCircle,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, Card, Chip, EmptyState, Pill, SkeletonList, Tap } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { supabase, WEB_URL } from '@/lib/supabase';
import { startDirectChat } from '@/lib/chat';
import { toast, toastError } from '@/lib/toast';
import { dateShort, timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';

// Android necesita este permiso explícito para animar cambios de layout; sin
// él, desplegar un piso es un salto seco. Se activa una vez por proceso.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Fila que devuelve get_owner_listing_stats() por cada piso del propietario.
type ListingStats = {
  accommodation_id: string;
  title: string;
  status: 'active' | 'inactive' | 'rented' | null;
  is_paid: boolean | null;
  price: number | null;
  cover_image: string | null;
  views_total: number;
  views_7d: number;
  likes: number;
  favorites: number;
  requests_pending: number;
  requests_total: number;
  visits_upcoming: number;
  visits_total: number;
  created_at: string;
};

// Solicitud de un estudiante interesado, con su perfil público resuelto.
type Interested = {
  id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
  name: string | null;
  avatar: string | null;
};

// Reserva de visita sobre un hueco de ese piso, con fecha/hora del slot.
type VisitRow = {
  id: string;
  status: 'pending' | 'confirmed' | 'cancelled_by_owner' | 'cancelled_by_visitor' | 'completed';
  payment_status: 'not_required' | 'pending' | 'paid' | 'refunded';
  price_cents: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
  visitor_id: string;
  visitor_name: string | null;
  visitor_avatar: string | null;
};

type Detail = { interested: Interested[]; visits: VisitRow[] };

const REQUEST_STATUS: Record<Interested['status'], { label: string; tone: 'gray' | 'blue' | 'red' | 'green' }> = {
  pending: { label: 'Pendiente', tone: 'blue' },
  accepted: { label: 'Aceptada', tone: 'green' },
  rejected: { label: 'Rechazada', tone: 'gray' },
};

const VISIT_STATUS: Record<VisitRow['status'], { label: string; tone: 'gray' | 'blue' | 'red' | 'green' }> = {
  pending: { label: 'Pendiente', tone: 'blue' },
  confirmed: { label: 'Confirmada', tone: 'green' },
  completed: { label: 'Completada', tone: 'gray' },
  cancelled_by_owner: { label: 'Cancelada por ti', tone: 'red' },
  cancelled_by_visitor: { label: 'Cancelada por el visitante', tone: 'red' },
};

// "10:00:00" → "10:00" (las horas de visit_slots llegan como TIME de Postgres).
const hhmm = (t: string) => t.slice(0, 5);

const money = (cents: number) =>
  `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function MisPisos() {
  const router = useRouter();
  const [rows, setRows] = useState<ListingStats[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Piso expandido + su detalle (se carga bajo demanda al expandir).
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<'interesados' | 'visitas'>('interesados');
  const [details, setDetails] = useState<Record<string, Detail | 'loading'>>({});

  const load = useCallback(async () => {
    try {
      setError(false);
      const { data, error: rpcError } = await supabase.rpc('get_owner_listing_stats');
      if (rpcError) throw rpcError;
      setRows(((data ?? []) as unknown[]).map((r) => r as ListingStats));
    } catch {
      setRows([]);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setDetails({});
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Detalle de un piso: interesados + visitas, con perfiles públicos resueltos
  // en una sola pasada. Fail-soft: cada fuente cae a lista vacía por separado.
  const loadDetail = useCallback(async (accId: string) => {
    setDetails((prev) => ({ ...prev, [accId]: 'loading' }));

    // 1) Solicitudes de estudiantes (RLS 011: el owner ve las de sus pisos) y
    // 2) reservas de visita (primero los huecos del piso, que el owner ve
    //    todos por RLS 087, luego las reservas de esos huecos). Son
    //    independientes: van a la vez en vez de una detrás de otra.
    type RequestRow = { id: string; user_id: string; status: Interested['status']; message: string | null; created_at: string };
    type BookingRow = { id: string; slot_id: string; visitor_id: string; status: VisitRow['status']; payment_status: VisitRow['payment_status']; price_cents: number; created_at: string };
    const slotById = new Map<string, { slot_date: string; start_time: string; end_time: string }>();
    const loadRequests = async (): Promise<RequestRow[]> => {
      try {
        const { data } = await supabase
          .from('accommodation_requests')
          .select('id, user_id, status, message, created_at')
          .eq('accommodation_id', accId)
          .order('created_at', { ascending: false })
          .limit(100);
        return (data ?? []) as RequestRow[];
      } catch { return []; /* sin solicitudes */ }
    };
    const loadBookings = async (): Promise<BookingRow[]> => {
      try {
        const { data: slots } = await supabase
          .from('visit_slots')
          .select('id, slot_date, start_time, end_time')
          .eq('accommodation_id', accId)
          .limit(300);
        for (const s of (slots ?? []) as { id: string; slot_date: string; start_time: string; end_time: string }[]) {
          slotById.set(s.id, s);
        }
        if (slotById.size === 0) return [];
        const { data: bks } = await supabase
          .from('visit_bookings')
          .select('id, slot_id, visitor_id, status, payment_status, price_cents, created_at')
          .in('slot_id', [...slotById.keys()])
          .order('created_at', { ascending: false })
          .limit(200);
        return (bks ?? []) as BookingRow[];
      } catch { return []; /* sin visitas */ }
    };
    const [requests, bookings] = await Promise.all([loadRequests(), loadBookings()]);

    // 3) Nombres y avatares desde public_profiles (vista curada, sin PII).
    const personIds = [...new Set([...requests.map((r) => r.user_id), ...bookings.map((b) => b.visitor_id)])];
    const people = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    if (personIds.length) {
      try {
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, full_name, avatar_url')
          .in('id', personIds);
        for (const p of (profiles ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
          people.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        }
      } catch { /* se pintan como "Estudiante" */ }
    }

    const interested: Interested[] = requests.map((r) => ({
      id: r.id, user_id: r.user_id, status: r.status, message: r.message, created_at: r.created_at,
      name: people.get(r.user_id)?.full_name ?? null,
      avatar: people.get(r.user_id)?.avatar_url ?? null,
    }));
    const visits: VisitRow[] = bookings.map((b) => {
      const slot = slotById.get(b.slot_id);
      return {
        id: b.id, status: b.status, payment_status: b.payment_status, price_cents: b.price_cents,
        slot_date: slot?.slot_date ?? b.created_at, start_time: slot?.start_time ?? '',
        end_time: slot?.end_time ?? '', created_at: b.created_at,
        visitor_id: b.visitor_id,
        visitor_name: people.get(b.visitor_id)?.full_name ?? null,
        visitor_avatar: people.get(b.visitor_id)?.avatar_url ?? null,
      };
    });
    // Próximas primero, luego el histórico por fecha descendente.
    visits.sort((a, b) => (a.slot_date + a.start_time < b.slot_date + b.start_time ? 1 : -1));

    setDetails((prev) => ({ ...prev, [accId]: { interested, visits } }));
  }, []);

  // ── Aceptar / rechazar una solicitud ────────────────────────────────────
  // La RLS de la migración 011 tiene la política "Owners update request status"
  // (FOR UPDATE USING accommodation_id IN (mis pisos)); sin WITH CHECK, Postgres
  // reutiliza el USING para la comprobación, y como no tocamos accommodation_id
  // el UPDATE pasa. Antes esto era solo lectura: el propietario veía "Pendiente"
  // y no tenía forma de responder desde la app.
  const [deciding, setDeciding] = useState<string | null>(null);

  const decide = async (accId: string, req: Interested, next: 'accepted' | 'rejected') => {
    if (deciding) return;
    setDeciding(req.id);
    const { data, error: updateError } = await supabase
      .from('accommodation_requests')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', req.id)
      .select('id');
    setDeciding(null);
    if (updateError) { toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.'); return; }
    // Sin .select() un UPDATE bloqueado por la RLS devuelve error=null y 0
    // filas: la pantalla cantaría victoria sin haber cambiado nada.
    if (!data?.length) {
      toastError('No se pudo guardar', 'No tienes permiso para responder a esta solicitud, o ya no existe.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(next === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada',
      next === 'accepted' ? 'Ya podéis hablar por el chat.' : undefined);
    // Estado local: la fila cambia de Pill y el contador de pendientes baja.
    setDetails((prev) => {
      const d = prev[accId];
      if (!d || d === 'loading') return prev;
      return {
        ...prev,
        [accId]: {
          ...d,
          interested: d.interested.map((i) => (i.id === req.id ? { ...i, status: next } : i)),
        },
      };
    });
    setRows((prev) => (prev ?? []).map((r) => (
      r.accommodation_id === accId
        ? { ...r, requests_pending: Math.max(0, (r.requests_pending ?? 0) - 1) }
        : r
    )));
  };

  const toggle = (accId: string) => {
    // El despliegue crece mucho de golpe: sin animar, la tarjeta "salta".
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (openId === accId) { setOpenId(null); return; }
    setOpenId(accId);
    setOpenTab('interesados');
    if (!details[accId]) loadDetail(accId);
  };

  // Chatear con un interesado/visitante: mismo DM 1:1 que el resto de la app
  // (RPC get_or_create_direct_chat, idempotente).
  /**
   * Retirar un piso: lo saca del catálogo y libera su plaza del plan.
   *
   * No borra la fila. El piso tiene contratos, inquilinos y reservas de visita
   * colgando con borrado en cascada, así que un borrado real destruiría
   * contratos firmados y el rastro de los cobros. La función de servidor
   * archive_accommodation (migración 163) lo marca como retirado y cierra lo
   * que colgaba de él.
   */
  const retirar = (r: ListingStats) => {
    Alert.alert(
      'Retirar este piso',
      `«${r.title}» desaparecerá del catálogo y liberará una plaza de tu plan. No se puede deshacer: para volver a ofrecerlo habría que publicarlo otra vez.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Retirar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error: rpcError } = await supabase.rpc('archive_accommodation', {
                p_id: r.accommodation_id,
                p_reason: null,
              });
              const res = data as { ok?: boolean; error?: string; bloqueos?: string[] } | null;
              if (rpcError || !res?.ok) {
                toastError(
                  'No se ha podido retirar',
                  res?.error === 'tiene_cosas_vivas'
                    ? `Este piso tiene ${(res.bloqueos ?? []).join(', ')} en marcha. Cancélalos o espera a que terminen.`
                    : 'Inténtalo de nuevo en un momento.',
                );
                return;
              }
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setRows((prev) => (prev ?? []).filter((x) => x.accommodation_id !== r.accommodation_id));
              setOpenId(null);
              toast('Piso retirado', 'Has liberado una plaza de tu plan.');
            } catch {
              toastError('No se ha podido retirar', 'Revisa tu conexión e inténtalo de nuevo.');
            }
          },
        },
      ],
    );
  };

  const chatWith = async (userId: string) => {
    try {
      const chatId = await startDirectChat(userId);
      if (!chatId) { toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.'); return; }
      router.push(`/chat/${chatId}`);
    } catch {
      toastError('No se pudo abrir el chat', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  };

  // Totales agregados de la cabecera.
  const list = rows ?? [];
  const totals = {
    views7d: list.reduce((a, r) => a + (r.views_7d ?? 0), 0),
    likes: list.reduce((a, r) => a + (r.likes ?? 0) + (r.favorites ?? 0), 0),
    pending: list.reduce((a, r) => a + (r.requests_pending ?? 0), 0),
    upcoming: list.reduce((a, r) => a + (r.visits_upcoming ?? 0), 0),
  };

  const StatBox = ({ value, label }: { value: number; label: string }) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <AnimatedNumber value={value} style={{ fontSize: 24, letterSpacing: -0.7 }} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );

  const Metric = ({ icon: Icon, value, label }: { icon: typeof Eye; value: string; label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon size={14} color={C.blue} strokeWidth={1.9} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.text, fontFamily: FONT.semibold }}>{value}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{label}</Text>
    </View>
  );

  return (
    <Screen title="Mis pisos" back refreshing={refreshing} onRefresh={refresh}>
      {rows === null ? (
        // Esqueleto con la silueta real: la tarjeta de totales y las de piso.
        <View style={{ marginTop: S.lg }}>
          <SkeletonList count={1} height={120} radius={R.lg} />
          <SkeletonList count={3} height={170} radius={R.lg} />
        </View>
      ) : error ? (
        <EmptyState icon={Home} title="No se pudieron cargar tus pisos"
          subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refresh} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Home} title="Aún no tienes pisos publicados"
          subtitle="Publica tu piso o habitación desde la web y aquí verás quién lo mira, a quién le gusta, quién te escribe y las visitas reservadas."
          cta="Publica tu piso en franky.es/negocio"
          onCta={() => Linking.openURL(`${WEB_URL}/negocio`)} />
      ) : (
        <View style={{ marginTop: S.lg, gap: 12 }}>
          {/* Cabecera: totales de todos los pisos, sin tarjeta */}
          <FadeIn>
            <View style={{ paddingHorizontal: S.lg }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tus pisos</Text>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[F.display, { fontSize: 26, letterSpacing: -0.9, marginTop: 4 }]}>Cómo van tus pisos</Text>
            </View>
            <View style={{
              flexDirection: 'row', marginHorizontal: S.lg, marginTop: S.lg, paddingVertical: 16,
              borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.borderLight,
            }}>
              <StatBox value={totals.views7d} label="vistas (7 días)" />
              <StatBox value={totals.likes} label="likes y favoritos" />
              <StatBox value={totals.pending} label="solicitudes pendientes" />
              <StatBox value={totals.upcoming} label="visitas próximas" />
            </View>
          </FadeIn>

          {/* Tarjeta por piso */}
          {rows.map((r, listingIndex) => {
            const open = openId === r.accommodation_id;
            const detail = details[r.accommodation_id];
            return (
              <FadeIn key={r.accommodation_id} index={listingIndex + 1}>
              <Card style={{ gap: 10, padding: 0, overflow: 'hidden' }}>
                <Tap onPress={() => toggle(r.accommodation_id)}
                  accessibilityLabel={`${r.title}: ver interesados y visitas`}
                  accessibilityState={{ selected: open }}>
                  <View style={{ padding: S.lg, gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {/* Foto de portada (o hueco neutro si no hay imágenes) */}
                      <View style={{ width: 72, height: 72, borderRadius: R.md, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                        {r.cover_image ? (
                          <Image source={{ uri: r.cover_image }} recyclingKey={r.accommodation_id} transition={120}
                            style={{ width: 72, height: 72 }}
                            contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <Home size={26} color={C.muted} strokeWidth={1.5} />
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={2}>{r.title}</Text>
                        {r.price != null ? (
                          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 18, fontFamily: FONT.display, color: C.text, letterSpacing: -0.4 }}>
                            {r.price.toLocaleString('es-ES')} €<Text style={F.tiny}>/mes</Text>
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <Pill
                            label={r.status === 'active' ? 'Activo' : r.status === 'rented' ? 'Alquilado' : 'Inactivo'}
                            tone={r.status === 'active' ? 'green' : 'gray'} />
                          <Pill
                            label={r.is_paid ? 'Publicación pagada' : 'Pago pendiente'}
                            tone={r.is_paid ? 'blue' : 'red'} />
                        </View>
                      </View>
                      {open
                        ? <ChevronUp size={18} color={C.muted} strokeWidth={1.9} />
                        : <ChevronDown size={18} color={C.muted} strokeWidth={1.9} />}
                    </View>
                    {/* "Activo · Pago pendiente" no dice la consecuencia, que es
                        la que importa: mientras no haya plan, el anuncio NO se
                        ve en el catálogo (la RLS solo enseña los pagados). Sin
                        esta línea, el propietario cree que está publicado y se
                        extraña de no recibir ni una visita. */}
                    {!r.is_paid ? (
                      <Tap
                        onPress={() => Linking.openURL(`${WEB_URL}/negocio`)}
                        accessibilityRole="button"
                        accessibilityLabel="Activar el plan para publicar este piso"
                        style={{ backgroundColor: `${C.warning}1F`, borderRadius: R.md, padding: 12, gap: 2 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.text }}>
                          Este piso todavía no lo ve nadie
                        </Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 12 }]}>
                          Publica gratis hasta tu primer interesado. Guarda tu tarjeta
                          sin cobro inicial en franky.es.
                        </Text>
                      </Tap>
                    ) : null}
                    {/* Métricas del piso */}
                    <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', rowGap: 6 }}>
                      <Metric icon={Eye} value={`${r.views_total}`} label={`vistas (${r.views_7d} esta semana)`} />
                      <Metric icon={Heart} value={`${r.likes + r.favorites}`} label="likes y favoritos" />
                      <Metric icon={Users} value={`${r.requests_total}`} label={r.requests_pending > 0 ? `solicitudes (${r.requests_pending} pendientes)` : 'solicitudes'} />
                      <Metric icon={CalendarClock} value={`${r.visits_total}`} label={r.visits_upcoming > 0 ? `visitas (${r.visits_upcoming} próximas)` : 'visitas'} />
                    </View>
                  </View>
                </Tap>

                {/* Detalle expandido: Interesados / Visitas */}
                {open ? (
                  <View style={{ borderTopWidth: 0.5, borderTopColor: C.border, padding: S.lg, paddingTop: 12, gap: 12 }}>
                    <View style={{ flexDirection: 'row' }}>
                      <Chip label={`Interesados (${r.requests_total})`} active={openTab === 'interesados'}
                        accessibilityRole="tab" onPress={() => setOpenTab('interesados')} />
                      <Chip label={`Visitas (${r.visits_total})`} active={openTab === 'visitas'}
                        accessibilityRole="tab" onPress={() => setOpenTab('visitas')} />
                    </View>

                    {detail === 'loading' || !detail ? (
                      <SkeletonList count={2} height={54} radius={R.md} style={{ marginHorizontal: 0 }} />
                    ) : openTab === 'interesados' ? (
                      detail.interested.length === 0 ? (
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center', paddingVertical: 14 }]}>
                          Todavía nadie ha enviado solicitud para este piso.
                        </Text>

                      ) : (
                        detail.interested.map((p) => (
                          <View key={p.id} style={{ gap: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                              <Avatar name={p.name} uri={p.avatar} size={40} />
                              <View style={{ flex: 1, gap: 1 }}>
                                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>
                                  {p.name ?? 'Estudiante'}
                                </Text>
                                {p.message ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={2}>{p.message}</Text> : null}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Pill label={REQUEST_STATUS[p.status].label} tone={REQUEST_STATUS[p.status].tone} />
                                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{timeAgo(p.created_at)}</Text>
                                </View>
                              </View>
                              <Btn small variant="secondary" icon={MessageCircle} label="Chatear"
                                accessibilityLabel={`Chatear con ${p.name ?? 'este estudiante'}`}
                                onPress={() => chatWith(p.user_id)} />
                            </View>
                            {/* Solo las pendientes se pueden responder. Una vez
                                aceptada o rechazada, la fila queda con su Pill. */}
                            {p.status === 'pending' ? (
                              <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 50 }}>
                                <Btn small label="Aceptar" busy={deciding === p.id}
                                  accessibilityLabel={`Aceptar la solicitud de ${p.name ?? 'este estudiante'}`}
                                  onPress={() => decide(r.accommodation_id, p, 'accepted')} />
                                <Btn small variant="danger" label="Rechazar" busy={deciding === p.id}
                                  accessibilityLabel={`Rechazar la solicitud de ${p.name ?? 'este estudiante'}`}
                                  onPress={() => decide(r.accommodation_id, p, 'rejected')} />
                              </View>
                            ) : null}
                          </View>
                        ))
                      )
                    ) : detail.visits.length === 0 ? (
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center', paddingVertical: 14 }]}>
                        Todavía no hay visitas reservadas para este piso.
                      </Text>
                    ) : (
                      detail.visits.map((v) => (
                        <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Avatar name={v.visitor_name} uri={v.visitor_avatar} size={40} />
                          <View style={{ flex: 1, gap: 1 }}>
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>
                              {v.visitor_name ?? 'Estudiante'}
                            </Text>
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                              {dateShort(v.slot_date)}{v.start_time ? ` · ${hhmm(v.start_time)}` : ''}{v.end_time ? `-${hhmm(v.end_time)}` : ''}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Pill label={VISIT_STATUS[v.status].label} tone={VISIT_STATUS[v.status].tone} />
                              {v.price_cents > 0 ? (
                                <Pill
                                  label={v.payment_status === 'paid' ? `Pagada · ${money(v.price_cents)}`
                                    : v.payment_status === 'refunded' ? 'Devuelta'
                                    : `Pago pendiente · ${money(v.price_cents)}`}
                                  tone={v.payment_status === 'paid' ? 'green' : v.payment_status === 'refunded' ? 'gray' : 'blue'} />
                              ) : (
                                <Pill label="Gratis" tone="gray" />
                              )}
                            </View>
                          </View>
                          <Btn small variant="secondary" icon={MessageCircle} label="Chatear"
                            accessibilityLabel={`Chatear con ${v.visitor_name ?? 'este estudiante'}`}
                            onPress={() => chatWith(v.visitor_id)} />
                        </View>
                      ))
                    )}

                    {/* Retirar: la única forma de liberar una plaza del plan.
                        Ocultar el piso NO la libera (migración 163), así que
                        se dice aquí mismo para que nadie lo descubra a base de
                        intentar publicar y que le rebote. */}
                    <View style={{ borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 12, gap: 6 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 12 }]}>
                        Todos tus pisos ocupan plaza del plan, aunque estén ocultos.
                        Retirar libera una.
                      </Text>
                      <Btn
                        small
                        variant="secondary"
                        label="Retirar este piso"
                        onPress={() => retirar(r)}
                      />
                    </View>
                  </View>
                ) : null}
              </Card>
              </FadeIn>
            );
          })}
          <View style={{ height: S.xl }} />
        </View>
      )}
    </Screen>
  );
}
