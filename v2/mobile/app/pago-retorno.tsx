import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '@/components/Screen';
import { Btn } from '@/components/ui';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { readPaymentReturn, type PaymentReturnState } from '@/lib/payment-return';
import { F, S } from '@/theme';

const COPY: Record<PaymentReturnState | 'loading', [string, string]> = {
  loading: ['Comprobando tu pago', 'Estamos consultando la confirmación del servidor.'],
  paid: ['Pago confirmado', 'Puedes consultar tu compra y su estado actualizado.'],
  pending: ['Confirmación pendiente', 'Tu pago todavía se está comprobando. Actualiza en unos segundos; evita iniciar otra compra.'],
  cancelled: ['Pago cerrado', 'El servidor indica que este pago se ha cancelado o reembolsado. Consulta tu reserva para ver el detalle.'],
  failed: ['Pago no completado', 'El servidor ha registrado un pago fallido. Puedes revisar tu reserva antes de reintentarlo.'],
  unavailable: ['No pudimos comprobarlo', 'Revisa la conexión y asegúrate de utilizar la cuenta con la que hiciste la compra.'],
};

export default function PaymentReturn() {
  const owner = useSessionOwner();
  const router = useRouter();
  const { order_id } = useLocalSearchParams<{ order_id?: string | string[] }>();
  const orderId = typeof order_id === 'string' ? order_id : '';
  useEffect(() => { try { WebBrowser.dismissBrowser(); } catch { /* No browser after a cold launch. */ } }, []);
  if (!owner) return <Screen title="Estado del pago"><View style={{ padding: S.lg, gap: S.md }}>
    <Text style={F.body}>Inicia sesión con la cuenta de la compra. Después podrás consultar su estado desde tus entradas o reservas.</Text>
    <Btn label="Iniciar sesión" onPress={() => router.push('/welcome')} />
  </View></Screen>;
  return <OwnedReturn key={owner.userId + ':' + owner.generation + ':' + orderId} owner={owner} orderId={orderId} />;
}
function OwnedReturn({ owner, orderId }: { owner: SessionIdentity; orderId: string }) {
  const current = useOwnerGuard(owner);
  const router = useRouter();
  const [status, setStatus] = useState<PaymentReturnState | 'loading'>('loading');
  const [type, setType] = useState<string>();
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try { const result = await readPaymentReturn(orderId, owner); if (current()) { setStatus(result.status); setType(result.type); } }
    catch { if (current()) setStatus('unavailable'); }
    finally { if (current()) setBusy(false); }
  }, [orderId, owner, current]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (status !== 'pending') return;
    const timer = setTimeout(() => void refresh(), 2500);
    return () => clearTimeout(timer);
  }, [status, refresh]);
  return <Screen title="Estado del pago" back><View style={{ padding: S.lg, gap: S.md }}>
    <Text style={F.h2}>{COPY[status][0]}</Text><Text style={F.body}>{COPY[status][1]}</Text>
    <Btn label="Actualizar estado" busy={busy} onPress={() => void refresh()} />
    <Btn variant="secondary" label={type === 'rent' ? 'Mi alquiler' : type === 'visit' ? 'Mis visitas' : 'Mis entradas'} onPress={() => router.replace(type === 'rent' ? '/mi-alquiler' : type === 'visit' ? '/mis-visitas' : '/entradas')} />
  </View></Screen>;
}

