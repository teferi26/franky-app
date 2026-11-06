// ─── Mis entradas ────────────────────────────────────────────────────────
// Cada entrada se pinta como un TICKET de verdad: cabecera con la foto del
// evento, troquelado (dos círculos del color del fondo y una línea de puntos) y
// el QR sobre blanco puro. El QR es qr_token tal cual (lo escanea el
// organizador), así que necesita contraste máximo: siempre sobre C.white,
// nunca sobre la superficie del tema.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CalendarDays, MapPin, Ticket, QrCode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { Screen } from '@/components/Screen';
import { Btn, EmptyState, Skeleton, Pill } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getMyTickets, cancelPendingTicket } from '@/lib/api';
import { TICKET_FEE_PCT, STRIPE_FEE_LABEL, holdIsLive, resumeTicketPayment } from '@/lib/payments';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { eur, dateLong } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT, SHADOW } from '@/theme';
import type { EventTicket } from '@/lib/types';

// Estado de la entrada → tono de Pill del kit (nada de colores fijos: en modo
// oscuro los verdes/ámbar claros de antes se veían casi blancos).
const STATUS: Record<string, { label: string; tone: 'gray' | 'green' | 'orange' | 'red' }> = {
  valid: { label: 'Válida', tone: 'green' },
  used: { label: 'Usada', tone: 'gray' },
  pending_payment: { label: 'Pago pendiente', tone: 'orange' },
  refunded: { label: 'Reembolsada', tone: 'gray' },
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

// Troquelado del ticket: dos semicírculos del color del fondo mordiendo los
// bordes, con la línea de puntos entre ellos. Es lo que hace que se lea como
// una entrada de papel y no como una tarjeta más.
function Perforation() {
  const bite = 22;
  return (
    <View style={{ height: bite, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: bite / 2, gap: 6 }}>
        {Array.from({ length: 22 }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 1.5, borderRadius: 1, backgroundColor: C.border }} />
        ))}
      </View>
      <View style={{ position: 'absolute', left: -bite / 2, width: bite, height: bite, borderRadius: bite / 2, backgroundColor: C.bg }} />
      <View style={{ position: 'absolute', right: -bite / 2, width: bite, height: bite, borderRadius: bite / 2, backgroundColor: C.bg }} />
    </View>
  );
}

function InfoRow({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
      <Icon size={15} color={C.muted} strokeWidth={1.75} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

// Memoizada: refrescar la lista o cambiar el estado de OTRA entrada no debe
// repintar los QR (react-native-qrcode-svg dibuja cientos de rects).
const TicketCard = React.memo(function TicketCard({
  t, busy, onPay, onCancel, onRefund, refundRequested, onOpenEvent, index = 0,
}: {
  t: EventTicket; busy: boolean; refundRequested: boolean; index?: number;
  onPay: () => void; onCancel: () => void; onRefund: () => void; onOpenEvent: () => void;
}) {
  const ev = t.event;
  const s = STATUS[t.status] ?? STATUS.used;
  const futuro = !!ev?.start_date && new Date(ev.start_date).getTime() > Date.now();

  return (
    <FadeIn index={index}>
    <View style={{
      marginHorizontal: S.lg, marginBottom: S.lg, backgroundColor: C.surface,
      borderRadius: R.xl, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border, ...SHADOW.card,
    }}>
      {/* Cabecera del ticket: la foto del evento como banda limpia (sin velos
          ni texto encima) y el titular debajo, sobre la superficie. */}
      {ev?.image_url ? (
        <Image source={{ uri: ev.image_url }} style={{ width: '100%', height: 112, backgroundColor: C.input }} contentFit="cover"
          cachePolicy="memory-disk" recyclingKey={t.id} transition={150} />
      ) : null}
      <View style={{ paddingHorizontal: S.lg, paddingTop: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ticket size={12} color={C.blue} strokeWidth={1.9} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontSize: 10.5, fontFamily: FONT.semibold, letterSpacing: 1.3 }}>
            ENTRADA FRANKY
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.3} numberOfLines={2}
          style={{ color: C.text, fontFamily: FONT.display, fontSize: 23, lineHeight: 27, letterSpacing: -0.8 }}>
          {ev?.title ?? 'Evento'}
        </Text>
      </View>

      {/* Cuerpo: cuándo, dónde y cuánto */}
      <View style={{ paddingHorizontal: S.lg, paddingTop: 12, gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pill label={s.label} tone={s.tone} />
          <View style={{ flex: 1 }} />
          <Text maxFontSizeMultiplier={1.2} style={[F.h2, { fontSize: 18, fontVariant: ['tabular-nums'], letterSpacing: -0.4 }]}>
            {eur(t.price_cents == null ? null : t.price_cents / 100)}
          </Text>
        </View>
        {ev?.start_date ? (
          <InfoRow icon={CalendarDays}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textTransform: 'capitalize', fontFamily: FONT.medium }]} numberOfLines={1}>
              {dateLong(ev.start_date)}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Puertas a las {hora(ev.start_date)}</Text>
          </InfoRow>
        ) : null}
        <InfoRow icon={MapPin}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontFamily: FONT.medium }]} numberOfLines={1}>
            {ev?.venue ?? ev?.city ?? 'Sitio por confirmar'}
          </Text>
          {ev?.venue && ev?.city ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{ev.city}</Text> : null}
        </InfoRow>
      </View>

      <View style={{ marginTop: 14 }}><Perforation /></View>

      {/* Talón: el QR (o las acciones de la reserva pendiente) */}
      <View style={{ paddingHorizontal: S.lg, paddingTop: 6, paddingBottom: S.lg }}>
        {t.status === 'valid' ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ backgroundColor: C.white, padding: 16, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border }}>
              {/* Blanco y negro puros: el escáner de la puerta necesita el máximo
                  contraste, así que este QR NO sigue el tema. */}
              <QRCode value={t.qr_token} size={216} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <QrCode size={13} color={C.muted} strokeWidth={1.75} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Enseña este QR en la puerta</Text>
            </View>
            {t.price_cents ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                Incluye {TICKET_FEE_PCT}% de comisión de servicio Franky y los gastos de pago
                con tarjeta de Stripe ({STRIPE_FEE_LABEL}). Sin tasas de App Store ni Google Play.
              </Text>
            ) : null}
              <View style={{ alignSelf: 'stretch', marginTop: 2 }}>
                <Btn full small variant="ghost"
                  label="Solicitar o consultar devolución"
                  disabled={busy} onPress={onRefund} />
              </View>
          </View>
        ) : t.status === 'used' ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ backgroundColor: C.white, padding: 10, borderRadius: R.md, opacity: 0.3 }}>
              <QRCode value={t.qr_token} size={104} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Ya la usaste en la puerta. Que fuera bien.</Text>
            <Btn full small variant="ghost" label="Consultar o solicitar devolución" disabled={busy} onPress={onRefund} />
          </View>
        ) : t.status === 'refunded' ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>
            {t.price_cents ? 'Esta entrada se reembolsó. El importe vuelve por el mismo medio de pago.' : 'Esta entrada quedó cerrada y ya no da acceso.'}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {/* La reserva guarda la plaza un rato, no para siempre (migración
                165). Se dice cuándo caduca para que nadie crea que la tiene
                asegurada sin pagar. */}
            {t.reserved_until ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                {holdIsLive(t.reserved_until)
                  ? `Reserva guardada hasta las ${hora(t.reserved_until)}: si no pagas antes, la plaza vuelve a estar libre.`
                  : 'La reserva ha caducado: la plaza ya está libre. Vuelve al evento para intentarlo de nuevo.'}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                {/* Con la reserva caducada no se ofrece pagar: la plaza volvió
                    al aforo y hay que pasar por la ficha del evento, que es lo
                    único que comprueba si queda sitio (migración 165). */}
                {t.reserved_until && !holdIsLive(t.reserved_until) ? (
                  <Btn full small label="Volver al evento" onPress={onOpenEvent} />
                ) : (
                  <Btn full small label="Completar pago" busy={busy} onPress={onPay} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Btn full small variant="danger" label="Cancelar reserva" disabled={busy} onPress={onCancel} />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
    </FadeIn>
  );
}, (prev, next) =>
  prev.t === next.t && prev.busy === next.busy && prev.refundRequested === next.refundRequested);

export default function Entradas() {
  const owner = useSessionOwner();
  return owner ? <OwnedEntradas key={owner.userId + ':' + owner.generation} owner={owner} /> : null;
}
function OwnedEntradas({ owner }: { owner: SessionIdentity }) {
  const current = useOwnerGuard(owner);
  const payLock = useRef(false);
  const router = useRouter();
  const [tickets, setTickets] = useState<EventTicket[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // La solicitud se conserva en el buzón del equipo; no ejecuta un reembolso.
  const [refundRequested, setRefundRequested] = useState<Set<string>>(new Set());
  const refundSending = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      const { rows } = await getMyTickets();
      if (!current()) return;
      setTickets(rows);
      setError(false);
    } catch {
      if (!current()) return;
      setTickets([]);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Mismo endpoint y flujo que buyTicket (src/lib/payments.ts): el servidor
  // crea el Stripe Checkout de la reserva pendiente y lo abrimos in-app.
  const completePayment = useCallback(async (t: EventTicket) => {
    if (payLock.current || !current()) return;
    payLock.current = true; setBusyId(t.id);
    try {
      const result = await resumeTicketPayment(t.id, owner);
      if (!current()) return;
      if (result.status === 'paid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast('Entrada confirmada', 'Tu entrada ya está disponible.');
      } else if (result.status === 'error') toastError('Pago', result.message);
      else if (result.status === 'pending') toastInfo('Confirmación pendiente', 'Tu reserva se conserva. Actualiza tus entradas en unos segundos.');
      else toastInfo('Reserva cerrada', 'Consulta el estado de tus entradas.');
      await load();
    } catch { if (current()) toastInfo('Confirmación pendiente', 'Consulta tus entradas antes de volver a intentarlo.'); }
    finally { payLock.current = false; if (current()) setBusyId(null); }
  }, [load, owner, current]);

  // The buyer creates a durable financial case and can follow provider-confirmed progress.
  const requestRefund = useCallback((t: EventTicket) => {
    if (current()) router.push({ pathname: '/devoluciones', params: { ticket: t.id } });
  }, [current, router]);
  // Destructivo (libera la plaza y no se deshace): Alert con dos botones.
  const confirmCancel = useCallback((t: EventTicket) => {
    Alert.alert(
      'Cancelar reserva',
      `Se liberará tu plaza en "${t.event?.title ?? 'este evento'}". Esta acción no se puede deshacer.`,
      [
        { text: 'Mantener', style: 'cancel' },
        {
          text: 'Cancelar reserva', style: 'destructive',
          onPress: async () => {
            setBusyId(t.id);
            try {
              const { ok } = await cancelPendingTicket(t.id);
              if (ok) toastInfo('Reserva cancelada', 'Tu plaza vuelve a estar libre.');
              else toastError('No se pudo cancelar', 'Inténtalo de nuevo en unos minutos.');
              await load();
            } catch {
              toastError('No se pudo cancelar', 'Revisa tu conexión e inténtalo de nuevo.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }, [load]);

  const keyExtractor = useCallback((t: EventTicket) => t.id, []);
  const renderItem = useCallback(({ item: t, index }: { item: EventTicket; index: number }) => (
    <TicketCard
      t={t} index={index} busy={busyId === t.id} refundRequested={refundRequested.has(t.id)}
      onPay={() => completePayment(t)} onCancel={() => confirmCancel(t)} onRefund={() => requestRefund(t)}
      onOpenEvent={() => router.push(`/evento/${t.event_id}`)}
    />
  ), [busyId, refundRequested, completePayment, confirmCancel, requestRefund, router]);

  return (
    <Screen<EventTicket>
      title="Mis entradas" back refreshing={refreshing} onRefresh={refresh}
      data={tickets ?? []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListEmptyComponent={
        tickets === null ? (
          // Esqueleto con la silueta real del ticket (cabecera + talón del QR).
          <View style={{ paddingTop: S.lg }}>
            <Skeleton height={420} radius={R.xl} />
            <Skeleton height={420} radius={R.xl} />
          </View>
        ) : error ? (
          <EmptyState icon={Ticket} title="No se pudieron cargar tus entradas"
            subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refresh} />
        ) : (
          <EmptyState icon={Ticket} title="Sin entradas todavía"
            subtitle="Cuando consigas una entrada aparecerá aquí con su QR para la puerta."
            cta="Ver eventos" onCta={() => router.push('/(tabs)/eventos')} />
        )
      }
      ListHeaderComponent={
        tickets && tickets.length > 0 ? (
          <View><Btn variant="ghost" label="Mis devoluciones" onPress={() => router.push('/devoluciones')} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm }]}>
            {tickets.length === 1 ? '1 entrada' : `${tickets.length} entradas`}
          </Text></View>
        ) : null
      }
    />
  );
}

