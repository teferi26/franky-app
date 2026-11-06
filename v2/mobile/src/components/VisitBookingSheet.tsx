// ─── Hoja de reserva de visita a un piso (migraciones 087/161) ───────────
// Bottom sheet compartido entre el swipe de pisos (tras un like) y la ficha
// del piso. Enseña los huecos de get_bookable_visit_times agrupados por día;
// al elegir uno reserva (bookVisit) y, si es de pago, avisa del precio y
// lanza el Checkout de Stripe (payVisit). Si no hay huecos, ofrece "Contactar"
// (accommodation_requests + aviso al propietario), el mismo que la ficha.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { CalendarDays, X } from 'lucide-react-native';
import { Tap, Btn, EmptyState, Skeleton } from '@/components/ui';
import {
  getBookableVisitTimes, bookVisit, payVisit, requestAccommodationContact, type VisitTime,
} from '@/lib/housing';
import { eur } from '@/lib/format';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { C, S, R, F, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';

const eurCents = (cents: number) => eur(Math.round(cents) / 100);
const hhmm = (t: string) => t.slice(0, 5);
const keyOf = (t: VisitTime) => `${t.slot_date}T${t.start_time}`;

// Fecha local (no UTC): cerca de medianoche toISOString() cambiaría de día.
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayLabel(slotDate: string): string {
  const today = new Date();
  if (slotDate === localISO(today)) return 'Hoy';
  const tomorrow = new Date(today.getTime() + 864e5);
  if (slotDate === localISO(tomorrow)) return 'Mañana';
  const s = new Date(`${slotDate}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type VisitBookingProps = {
  visible: boolean;
  accommodation: { id: string; title: string } | null;
  onClose: () => void;
};
export function VisitBookingSheet(props: VisitBookingProps) {
  const owner = useSessionOwner();
  if (!props.visible || !props.accommodation) return null;
  return <OwnedVisitSheet key={`${props.accommodation.id}:${owner?.userId ?? 'guest'}:${owner?.generation ?? 0}`} {...props} owner={owner} />;
}
function OwnedVisitSheet({ visible, accommodation, onClose, owner }: VisitBookingProps & { owner: SessionIdentity | null }) {
  const alive = useRef(true);
  const lifetime = useRef(new AbortController());
  const working = useRef(false);
  const confirming = useRef(false);
  const loadVersion = useRef(0);
  useEffect(() => {
    alive.current = true;
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    return () => { alive.current = false; lifetime.current.abort(); };
  }, []);
  const sameOwner = useCallback(() => owner ? isCurrentSessionIdentity(owner) : captureSessionIdentity() === null, [owner]);
  const active = useCallback(() => alive.current && sameOwner(), [sameOwner]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [times, setTimes] = useState<VisitTime[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Hueco en proceso de reserva/pago: bloquea el resto mientras dura.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [contactBusy, setContactBusy] = useState(false);

  const accId = accommodation?.id ?? null;

  const load = useCallback(() => {
    if (!accId || !active()) return;
    const version = ++loadVersion.current;
    setTimes(null);
    setLoadError(false);
    getBookableVisitTimes(accId)
      .then(items => { if (active() && version === loadVersion.current) setTimes(items); })
      .catch(() => { if (active() && version === loadVersion.current) { setTimes([]); setLoadError(true); } });
  }, [accId, active]);

  useEffect(() => {
    if (visible && accId) load();
    if (!visible) { setBusyKey(null); setContactBusy(false); }
  }, [visible, accId, load]);

  const grouped = useMemo(() => {
    const map = new Map<string, VisitTime[]>();
    for (const t of times ?? []) {
      const arr = map.get(t.slot_date) ?? [];
      arr.push(t);
      map.set(t.slot_date, arr);
    }
    return [...map.entries()];
  }, [times]);

  // Cerrar y avisar DESPUÉS: el toast se pinta sobre la pantalla de debajo, así
  // que se lanza cuando la hoja ya se ha ido (si no, se ve tapado por el Modal).
  const closeThenToast = (title: string, body: string, kind: 'success' | 'info' = 'success') => {
    onClose();
    setTimeout(() => { if (sameOwner()) { if (kind === 'info') toastInfo(title, body); else toast(title, body); } }, 350);
  };

  const askLogin = (msg: string) => Alert.alert('Inicia sesión', msg, [
    { text: 'Ahora no', style: 'cancel' },
    { text: 'Entrar', onPress: () => { if (active()) { onClose(); router.push('/welcome'); } } },
  ]);

  const doBook = async (t: VisitTime) => {
    if (!accId || !active() || working.current) return;
    working.current = true;
    setBusyKey(keyOf(t));
    try {
      const r = await bookVisit(accId, t, owner, lifetime.current.signal);
      if (!active()) return;
      if (!r.ok) {
        if (r.needsAuth) { askLogin('Necesitas una cuenta para reservar una visita.'); return; }
        toastError('No se pudo reservar', r.message);
        load(); // el hueco pudo llenarse o pasar: refrescar lo que se ve
        return;
      }
      if (!r.requiresPayment) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        closeThenToast('Visita reservada', 'El propietario ya la tiene. Te esperan a la hora elegida.');
        return;
      }
      const pay = await payVisit(r.bookingId, owner, lifetime.current.signal);
      if (!active()) return;
      if (pay.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        closeThenToast('Visita reservada y pagada', 'Pago confirmado. El propietario ya tiene tu reserva.');
      } else if (pay.status === 'pending') {
        closeThenToast('Pago en proceso', 'Tu reserva se confirma en cuanto Stripe confirme el pago.', 'info');
      } else {
        toastError('No se pudo completar el pago', `${pay.message} Tu reserva queda pendiente de pago.`);
      }
    } catch {
      if (active()) toastError('No pudimos confirmar la reserva', 'Consulta tus visitas antes de volver a reservar este hueco.');
    } finally {
      working.current = false;
      if (active()) setBusyKey(null);
    }
  };

  const pick = (t: VisitTime) => {
    if (!active() || working.current || confirming.current) return;
    if (t.price_cents > 0) {
      // Aviso del precio ANTES de reservar: nada de cobros sorpresa.
      confirming.current = true;
      Alert.alert(
        'Visita de pago',
        `Reservar este hueco cuesta ${eurCents(t.price_cents)}. Pagas de forma segura con tarjeta, Apple Pay o Google Pay.`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => { confirming.current = false; } },
          { text: 'Continuar', onPress: () => { confirming.current = false; if (active()) void doBook(t); } },
        ],
        { onDismiss: () => { confirming.current = false; } },
      );
      return;
    }
    void doBook(t);
  };

  // Sin huecos: solicitud de contacto al propietario. Antes insertaba en
  // `visit_requests`, que es otra cosa (019) y que el panel del propietario NO
  // lee: la petición se perdía siempre. Ahora va por la misma vía que el like
  // del swipe (accommodation_requests + notificación), ver src/lib/housing.ts.
  const contact = async () => {
    if (!accId || !active() || working.current) return;
    working.current = true;
    setContactBusy(true);
    try {
      const r = await requestAccommodationContact(accId, owner, lifetime.current.signal);
      if (!active()) return;
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        closeThenToast('Solicitud enviada', 'El propietario ya la tiene. Te avisamos cuando responda.');
        return;
      }
      if (r.needsAuth) { askLogin('Necesitas una cuenta para pedir una visita.'); return; }
      toastError('No se pudo enviar', r.message);
    } catch {
      if (active()) toastError('No pudimos confirmar la solicitud', 'Consulta su estado antes de volver a enviarla.');
    } finally {
      working.current = false;
      if (active()) setContactBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose}
        accessibilityLabel="Cerrar" accessibilityRole="button" />
      <View accessibilityViewIsModal style={{
        backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
        maxHeight: '82%', paddingBottom: insets.bottom + 10,
      }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 21, letterSpacing: -0.7 }]}>
              ¿Quieres visitarlo?
            </Text>
            {accommodation ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{accommodation.title}</Text>
            ) : null}
          </View>
          <Tap onPress={onClose} accessibilityLabel="Cerrar" hitSlop={14}
            style={{ width: 32, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
            <X size={22} color={C.text} strokeWidth={1.9} />
          </Tap>
        </View>

        {owner ? <View style={{ paddingHorizontal: S.lg, paddingTop: 10 }}><Btn label="Mis visitas y devoluciones" variant="ghost" onPress={() => { if (active()) { onClose(); router.push('/mis-visitas'); } }} /></View> : null}
        {times === null ? (
          // Esqueleto con la forma real: un día y su fila de horas.
          <View style={{ paddingTop: S.lg }}>
            <Skeleton height={18} radius={R.sm} style={{ width: '35%' }} />
            <Skeleton height={40} radius={R.md} />
            <Skeleton height={18} radius={R.sm} style={{ width: '30%' }} />
            <Skeleton height={40} radius={R.md} />
          </View>
        ) : loadError ? (
          <EmptyState icon={CalendarDays} title="No se pudieron cargar los huecos"
            subtitle="Comprueba tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={load} />
        ) : times.length === 0 ? (
          <View>
            <EmptyState icon={CalendarDays} title="Sin huecos de visita"
              subtitle="El propietario aún no ha publicado horario. Mándale una solicitud y te responderá." />
            <View style={{ paddingHorizontal: S.lg }}>
              <Btn full busy={contactBusy} label="Contactar" onPress={contact} />
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {grouped.map(([date, slots]) => (
              <View key={date} style={{ paddingHorizontal: S.lg, paddingTop: 14 }}>
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>
                  {dayLabel(date)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {slots.map(t => {
                    const k = keyOf(t);
                    const busy = busyKey === k;
                    return (
                      <Tap key={k} onPress={() => pick(t)} disabled={!!busyKey || contactBusy} haptic
                        accessibilityLabel={`Reservar el ${dayLabel(date)} a las ${hhmm(t.start_time)}${t.price_cents > 0 ? `, cuesta ${eurCents(t.price_cents)}` : ', gratis'}`}
                        style={{
                          borderWidth: busy ? 1 : 0.5, borderColor: busy ? C.blue : C.border, borderRadius: R.full,
                          backgroundColor: C.surface,
                          paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, minWidth: 76,
                          alignItems: 'center', justifyContent: 'center',
                          opacity: busyKey && !busy ? 0.4 : 1,
                        }}>
                        {busy ? <ActivityIndicator size="small" color={C.blue} /> : (
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14.5, fontFamily: FONT.semibold, color: C.text }}>
                            {hhmm(t.start_time)}
                            {t.price_cents > 0 ? (
                              <Text style={{ color: C.muted, fontFamily: undefined }}> · {eurCents(t.price_cents)}</Text>
                            ) : null}
                          </Text>
                        )}
                      </Tap>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: S.lg, paddingTop: 10 }}>
          <Btn full variant="secondary" label="Ahora no" onPress={onClose} haptic={false} />
        </View>
      </View>
    </Modal>
  );
}
