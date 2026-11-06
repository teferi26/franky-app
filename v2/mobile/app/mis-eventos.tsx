// ─── Estadísticas del evento para el organizador (mejora 78) ─────────────
// Lista los eventos creados por el usuario con sus números básicos:
//   - apuntados: tabla event_participants (sin cancelados).
//   - entradas vendidas e ingreso bruto: MISMO enfoque que app/cartera.tsx
//     (tabla payments, filtrando por seller_id + metadata.event_id), pero
//     reutilizando directamente getMyEarnings() de src/lib/payments.ts y
//     agrupando aquí por evento (sin tocar cartera.tsx).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, Users, Ticket, Hourglass, Tag, Pencil, QrCode, TrendingUp } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Card, EmptyState, Skeleton, Pill, Tap } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { getCachedSession } from '@/lib/session';
import { getMyEarnings } from '@/lib/payments';
import { dateShort } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import type { EventItem, SellerPayment } from '@/lib/types';

// Mismo formato de céntimos que usa Cartera (duplicado a propósito: cartera.tsx no se toca).
const money = (cents: number) =>
  `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

type EventStats = {
  event: EventItem;
  apuntados: number;
  entradasVendidas: number;
  ingresoBruto: number; // céntimos, recaudado tras devoluciones (igual que "gross" en Cartera)
  enListaEspera: number; // mejora 71: demanda real cuando el evento se agota
};

// Cifra + rótulo de una métrica del evento. La cifra manda (Outfit, tamaño
// mayor) y el rótulo la explica debajo: se lee de un vistazo.
function StatTile({ icon: Icon, value, label }: { icon: typeof Users; value: number | string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 84, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, paddingVertical: 11, paddingHorizontal: 12, gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={13} color={C.muted} strokeWidth={1.75} />
        {typeof value === 'number'
          ? <AnimatedNumber value={value} style={{ fontSize: 19, letterSpacing: -0.5 }} />
          : <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 19, fontFamily: FONT.display, color: C.text, letterSpacing: -0.5 }}>{value}</Text>}
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// Memoizada: refrescar la lista solo repinta las tarjetas cuyos datos cambian.
const EventStatsCard = React.memo(function EventStatsCard({
  r, onOpen, onEdit, onAttendees, onCodes, index = 0,
}: {
  r: EventStats; onOpen: () => void; onEdit: () => void; onAttendees: () => void; onCodes: () => void; index?: number;
}) {
  const pasado = new Date(r.event.start_date).getTime() < Date.now();
  return (
    <FadeIn index={index}>
    <Card style={{ gap: 12 }}>
      <Tap onPress={onOpen} haptic={false} accessibilityLabel={`Ver el evento ${r.event.title}`}
        accessibilityHint="Abre la ficha del evento">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2} numberOfLines={2}>{r.event.title}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textTransform: 'capitalize', marginTop: 2 }]}>
              {dateShort(r.event.start_date)}
            </Text>
          </View>
          <Pill label={pasado ? 'Pasado' : 'Próximo'} tone={pasado ? 'gray' : 'green'} />
        </View>
      </Tap>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
        <StatTile icon={Users} value={r.apuntados} label="apuntados" />
        {r.entradasVendidas > 0 ? <StatTile icon={Ticket} value={r.entradasVendidas} label="entradas" /> : null}
        {r.enListaEspera > 0 ? <StatTile icon={Hourglass} value={r.enListaEspera} label="en espera" /> : null}
      </View>

      {r.ingresoBruto > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={15} color={C.success} strokeWidth={1.9} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>Recaudado</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 20, fontFamily: FONT.display, color: C.success, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>
            {money(r.ingresoBruto)}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Btn small full variant="secondary" icon={Users} label="Asistentes" onPress={onAttendees} />
        </View>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Btn small full variant="ghost" icon={Pencil} label="Editar" onPress={onEdit} />
        </View>
        {/* Códigos de descuento (mejora 77): solo tiene sentido en eventos de pago */}
        {r.event.price ? (
          <View style={{ flex: 1, minWidth: 120 }}>
            <Btn small full variant="ghost" icon={Tag} label="Códigos" onPress={onCodes} />
          </View>
        ) : null}
      </View>
    </Card>
    </FadeIn>
  );
}, (prev, next) => prev.r === next.r);

export default function MisEventos() {
  const router = useRouter();
  const [rows, setRows] = useState<EventStats[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      // Sesión de la caché local: no hace falta ir al servidor de auth antes
      // de pedir los eventos.
      const session = await getCachedSession();
      const user = session?.user;
      if (!user) { setRows([]); return; }

      const { data: evs, error } = await supabase
        .from('events').select('*')
        .eq('organizer_id', user.id)
        .order('start_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      const events = (evs as EventItem[]) ?? [];
      if (events.length === 0) { setRows([]); return; }
      const ids = events.map(e => e.id);

      // Las tres cifras son independientes: se piden A LA VEZ (antes iban una
      // detrás de otra). Cada una es fail-soft por separado: si falla, se
      // queda a 0 pero el resto de la pantalla funciona.
      const apuntadosByEvent: Record<string, number> = {};
      const ventasByEvent: Record<string, { count: number; gross: number }> = {};
      const listaEsperaByEvent: Record<string, number> = {};
      await Promise.all([
        // Apuntados por evento (event_participants, sin cancelados).
        (async () => {
          try {
            const { data: parts } = await supabase
              .from('event_participants').select('event_id')
              .in('event_id', ids).neq('status', 'cancelled');
            for (const p of (parts ?? []) as { event_id: string }[]) {
              apuntadosByEvent[p.event_id] = (apuntadosByEvent[p.event_id] ?? 0) + 1;
            }
          } catch { /* se queda a 0 */ }
        })(),
        // Entradas vendidas e ingreso bruto: reutiliza getMyEarnings (el mismo
        // ledger que Cartera) y agrupa por metadata.event_id, solo tipo 'ticket'.
        (async () => {
          try {
            const { rows: payments } = await getMyEarnings();
            for (const p of payments as SellerPayment[]) {
              const evId = p.metadata?.event_id;
              if (!evId || p.type !== 'ticket') continue;
              const g = ventasByEvent[evId] ?? { count: 0, gross: 0 };
              g.count++;
              g.gross += p.amount_cents - p.refunded_cents;
              ventasByEvent[evId] = g;
            }
          } catch { /* se queda a 0 */ }
        })(),
        // Lista de espera por evento (mejora 71). Si la tabla event_waitlist
        // (migración 136) todavía no existe en producción, se queda a 0.
        (async () => {
          try {
            const { data: wl } = await supabase
              .from('event_waitlist').select('event_id').in('event_id', ids);
            for (const w of (wl ?? []) as { event_id: string }[]) {
              listaEsperaByEvent[w.event_id] = (listaEsperaByEvent[w.event_id] ?? 0) + 1;
            }
          } catch { /* se queda a 0 */ }
        })(),
      ]);

      setRows(events.map(e => ({
        event: e,
        apuntados: apuntadosByEvent[e.id] ?? 0,
        entradasVendidas: ventasByEvent[e.id]?.count ?? 0,
        ingresoBruto: ventasByEvent[e.id]?.gross ?? 0,
        enListaEspera: listaEsperaByEvent[e.id] ?? 0,
      })));
    } catch {
      setRows([]);
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const keyExtractor = useCallback((r: EventStats) => r.event.id, []);
  const renderItem = useCallback(({ item: r, index }: { item: EventStats; index: number }) => (
    <EventStatsCard
      r={r} index={index}
      onOpen={() => router.push(`/evento/${r.event.id}`)}
      onEdit={() => router.push(`/evento-editar?id=${r.event.id}`)}
      onAttendees={() => router.push(`/asistentes/${r.event.id}`)}
      onCodes={() => router.push(`/codigos/${r.event.id}`)}
    />
  ), [router]);

  return (
    <Screen<EventStats>
      title="Mis eventos" back refreshing={refreshing} onRefresh={refresh}
      data={rows ?? []}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={
        rows && rows.length > 0 ? (
          // Check-in en la puerta (mejora 73): no depende de un evento
          // concreto, valida cualquier entrada de la que seas organizador.
          <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.md }}>
            <Btn full variant="secondary" icon={QrCode} label="Check-in en la puerta" onPress={() => router.push('/checkin')} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        rows === null ? (
          // Esqueleto con la silueta real de la tarjeta de estadísticas.
          <View style={{ marginTop: S.lg }}>
            <Skeleton height={210} radius={R.lg} />
            <Skeleton height={210} radius={R.lg} />
          </View>
        ) : error ? (
          <EmptyState icon={CalendarDays} title="No se pudieron cargar tus eventos"
            subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refresh} />
        ) : (
          <EmptyState icon={CalendarDays} title="Aún no has creado eventos"
            subtitle="Cuando organices un evento, aquí verás cuánta gente se apunta, cuántas entradas vendes y cuánto ingresas."
            cta="Crear evento" onCta={() => router.push('/crear-evento')} />
        )
      }
    />
  );
}
