// ─── Cartera: lo ganado con Franky ───────────────────────────────────────
// Ledger `payments` del organizador (entradas vendidas, y en el futuro visitas
// y rentas) con desglose transparente: recaudado, comisión de servicio Franky
// y neto para el organizador. Los payouts reales (cuenta bancaria, fechas de
// transferencia) viven en el panel de Stripe Express, enlazado abajo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Home, KeyRound, Landmark, PartyPopper, Wallet } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, EmptyState, SkeletonList } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { getMyEarnings, openConnectDashboard, TICKET_FEE_PCT, STRIPE_FEE_LABEL } from '@/lib/payments';
import { dateShort } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import type { SellerPayment } from '@/lib/types';

const money = (cents: number) => `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// Lo que de verdad ha ingresado (o ingresará) el organizador por un pago:
// recaudado menos devoluciones menos comisión, nunca negativo.
const netCents = (p: SellerPayment) =>
  Math.max(0, p.amount_cents - p.refunded_cents - p.application_fee_cents);

// Cada grupo del desglose: un evento concreto, o un cajón por tipo de cobro
// (visitas a pisos, alquileres/fianzas). `kind` decide icono y vocabulario.
type GroupKind = 'event' | 'visit' | 'rent' | 'other';
type EventGroup = { key: string; kind: GroupKind; title: string; count: number; gross: number; fee: number; net: number; last: string };

const GROUP_ICON: Record<GroupKind, typeof PartyPopper> = {
  event: PartyPopper, visit: Home, rent: KeyRound, other: Wallet,
};

export default function Cartera() {
  const router = useRouter();
  const [rows, setRows] = useState<SellerPayment[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { rows, eventTitles } = await getMyEarnings();
      setRows(rows);
      setTitles(eventTitles);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const totals = useMemo(() => {
    const list = rows ?? [];
    const gross = list.reduce((a, p) => a + p.amount_cents - p.refunded_cents, 0);
    const fee = list.reduce((a, p) => a + p.application_fee_cents, 0);
    const net = list.reduce((a, p) => a + netCents(p), 0);
    return { gross, fee, net, count: list.length };
  }, [rows]);

  const groups = useMemo<EventGroup[]>(() => {
    const map = new Map<string, EventGroup>();
    for (const p of rows ?? []) {
      // Los pagos de pisos ('visit' y 'rent') van SIEMPRE a su propio grupo,
      // tenga o no metadata: son cobros de alojamiento, no de un evento. Las
      // entradas siguen agrupándose por evento, como hasta ahora.
      const kind: GroupKind = p.type === 'visit' ? 'visit' : p.type === 'rent' ? 'rent'
        : p.metadata?.event_id ? 'event' : 'other';
      const key = kind === 'event' ? (p.metadata?.event_id as string) : `grupo-${kind}`;
      const title = kind === 'event' ? (titles[p.metadata?.event_id ?? ''] ?? 'Evento')
        : kind === 'visit' ? 'Visitas a pisos'
        : kind === 'rent' ? 'Alquileres/fianzas' : 'Otros cobros';
      const g = map.get(key) ?? { key, kind, title, count: 0, gross: 0, fee: 0, net: 0, last: p.created_at };
      g.count++;
      g.gross += p.amount_cents - p.refunded_cents;
      g.fee += p.application_fee_cents;
      g.net += netCents(p);
      if (p.created_at > g.last) g.last = p.created_at;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [rows, titles]);

  const openPanel = async () => {
    setBusy(true);
    const r = await openConnectDashboard();
    setBusy(false);
    if (!r.ok) toastError('Panel de cobros', r.error ?? 'Inténtalo de nuevo en unos minutos.');
  };

  return (
    <Screen title="Cartera" back refreshing={refreshing} onRefresh={refresh}>
      {rows === null ? (
        <View style={{ marginTop: S.lg }}>
          <SkeletonList count={3} height={110} radius={R.lg} />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Aún no has ganado nada con Franky"
          subtitle="Cuando vendas entradas de tus eventos o cobres visitas y alquileres de tus pisos, aquí verás cuánto has recaudado, la comisión de Franky y tu neto, euro a euro."
          cta="Ver eventos" onCta={() => router.push('/(tabs)/eventos')} />
      ) : (
        <View style={{ marginTop: S.lg }}>
          {/* Saldo: rotulo pequeno y la cifra grande contando al entrar. */}
          <FadeIn style={{ paddingHorizontal: S.lg, paddingBottom: S.xl }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tu dinero con Franky</Text>
            <AnimatedNumber value={totals.net / 100} decimals={2} suffix=" €"
              style={{ fontSize: 46, letterSpacing: -1.8, marginTop: 8, lineHeight: 52 }} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>Neto para ti, de {totals.count} {totals.count === 1 ? 'pago' : 'pagos'}</Text>
          </FadeIn>

          {/* Desglose de a donde va cada euro, en filas con linea fina. */}
          <FadeIn index={1} style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.lg, borderTopWidth: 0.5, borderTopColor: C.borderLight, gap: 12 }}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>Recaudado (tras devoluciones)</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.text }]}>{money(totals.gross)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, paddingRight: 10 }]}>Comisión Franky ({TICKET_FEE_PCT}%) + gastos de pago Stripe ({STRIPE_FEE_LABEL})</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.text }]}>−{money(totals.fee)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>Tasas de App Store / Google Play</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.success }]}>0,00 €</Text>
              </View>
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { lineHeight: 16 }]}>
              La comisión de Franky incluye los gastos de procesamiento del pago (Stripe).
              Apple y Google no cobran tasas por entradas de eventos presenciales, ni siquiera
              cuando se compran desde la app.
            </Text>
            {/* No existe (ni hace falta) una "retirada" en Franky: con Stripe
                Connect el dinero de cada venta ya cae en la cuenta del
                organizador y Stripe lo transfiere solo a su banco. Este botón
                lleva a donde eso se ve de verdad. */}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { lineHeight: 16 }]}>
              Este dinero ya es tuyo: Stripe lo transfiere solo a tu cuenta bancaria. En tu panel
              ves cada transferencia, su fecha y la cuenta de destino.
            </Text>
            <Btn full busy={busy} label="Ver mis transferencias (Stripe)" onPress={openPanel} />
          </FadeIn>

          {/* Movimientos: una fila por evento o por tipo de cobro. */}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.sm }]}>Movimientos</Text>
          {groups.map((g, gi) => {
            const Icon = GROUP_ICON[g.kind];
            const unit = g.kind === 'event' ? (g.count === 1 ? 'venta' : 'ventas') : (g.count === 1 ? 'cobro' : 'cobros');
            return (
            <FadeIn key={g.key} index={gi}>
              <View style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 14,
                paddingHorizontal: S.lg, paddingVertical: 14,
                borderTopWidth: 0.5, borderTopColor: C.borderLight,
              }}>
                <Icon size={20} color={C.blue} strokeWidth={1.75} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{g.title}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>
                    {g.count} {unit} · {dateShort(g.last)}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>
                    Recaudado {money(g.gross)} · comisión −{money(g.fee)}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={{ fontSize: 16, fontFamily: FONT.heading, color: C.text, fontVariant: ['tabular-nums'] }}>{money(g.net)}</Text>
              </View>
            </FadeIn>
            );
          })}

          {/* Payouts reales: cuenta bancaria y transferencias, en Stripe */}
          <View style={{ paddingHorizontal: S.lg, paddingTop: S.xxl, gap: 12, borderTopWidth: 0.5, borderTopColor: C.borderLight, marginTop: S.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <Landmark size={19} color={C.muted} strokeWidth={1.75} style={{ marginTop: 2 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, lineHeight: 19 }]}>
                Las transferencias a tu banco las gestiona Stripe: no hay que pedir nada por la
                app. En tu panel de cobros puedes ver fechas de ingreso y cambiar la cuenta.
              </Text>
            </View>
            <Btn full small variant="ghost" label="Ver mis facturas" onPress={() => router.push('/facturas')} />
          </View>
          <View style={{ height: S.xl }} />
        </View>
      )}
    </Screen>
  );
}
