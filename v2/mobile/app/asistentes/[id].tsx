// ─── Asistentes de mi evento (organizador) ─────────────────────────────────
// Réplica móvil de la web /eventos/[id]/asistentes (y de /entradas para los
// eventos de pago por la app): lista completa de quién va, con estado de la
// entrada y, si el evento reparte camisetas (164), la talla de cada uno y
// el recuento para saber cuántas llevar.
//
// Datos: src/lib/events-extra.ts (event_participants por la política de
// organizador de la 150, event_tickets por la 095, public_profiles y
// event_shirt_sizes). La RLS ya limita todo al organizador y a admins.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Users, BadgeCheck, Shirt, Lock, Ticket, ChevronRight } from 'lucide-react-native';
import { shirtPriceLabel } from '@/lib/event-shirt-pricing';
import { Screen } from '@/components/Screen';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { Avatar, Card, EmptyState, Pill, SkeletonList, Tap } from '@/components/ui';
import { getEventAttendees, shirtSizeLabel, type AttendeesResult, type AttendeeRow } from '@/lib/events-extra';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const fechaHora = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Estado de la entrada o inscripción como píldora.
function EntryPill({ entry }: { entry: AttendeeRow['entry'] }) {
  if (entry === 'used') return <Pill label="Ya entró" tone="green" icon={Ticket} />;
  if (entry === 'valid') return <Pill label="Entrada válida" tone="blue" icon={Ticket} />;
  return <Pill label="Apuntado" tone="gray" />;
}

// Fila memoizada: al refrescar, o al cambiar el recuento de camisetas de la
// cabecera, no se repinta la lista entera (avatares incluidos).
const AttendeeItem = React.memo(function AttendeeItem({ a, shirtsEnabled, onPress, index = 0 }: {
  a: AttendeeRow; shirtsEnabled: boolean; onPress: () => void; index?: number;
}) {
  if(a.originGuestEmail)return <View style={{paddingHorizontal:S.lg,paddingVertical:14,gap:5,borderBottomWidth:0.5,borderBottomColor:C.borderLight}}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{a.full_name}</Text>
    <Text selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{a.originGuestEmail}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><Pill label="Pagada en ORIGIN" tone="green" icon={Ticket}/>{a.shirt&&<Pill label={shirtSizeLabel(a.shirt)} tone="gray"/>}</View>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{a.quotedPriceCents!=null?shirtPriceLabel(a.quotedPriceCents):''} · cobrado por Franky</Text>
    <Text selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Referencia: {a.id}</Text>
  </View>;
  return (
    <FadeIn index={index} distance={10}>
    <Tap haptic={false} onPress={onPress}
      accessibilityLabel={`${a.full_name ?? 'Asistente'}${a.shirt ? `, talla ${shirtSizeLabel(a.shirt)}` : ''}`}
      accessibilityHint="Abre su perfil">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 11, minHeight: 68, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
        <Avatar name={a.full_name} uri={a.avatar_url} size={44} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flexShrink: 1 }]} numberOfLines={1}>{a.full_name || 'Asistente'}</Text>
            {a.verified ? <BadgeCheck size={15} color={C.blue} strokeWidth={1.9} /> : null}
          </View>
          {fechaHora(a.since) ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
              {a.entry === 'registered' ? 'Se apuntó el ' : 'Compró el '}{fechaHora(a.since)}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <EntryPill entry={a.entry} />
            {a.quotedPriceCents != null && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{shirtPriceLabel(a.quotedPriceCents)} · pago al organizador</Text>}
            {shirtsEnabled ? (
              a.shirt === null
                ? <Pill label="Sin talla" tone="orange" icon={Shirt} />
                : <Pill label={shirtSizeLabel(a.shirt)} tone={a.shirt === 'ninguna' ? 'gray' : 'blue'} icon={Shirt} />
            ) : null}
          </View>
        </View>
        <ChevronRight size={17} color={C.muted} strokeWidth={1.75} />
      </View>
    </Tap>
    </FadeIn>
  );
}, (prev, next) => prev.a === next.a && prev.shirtsEnabled === next.shirtsEnabled);

export default function Asistentes() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // undefined = cargando; el resto es el resultado (ok o motivo de error).
  const [res, setRes] = useState<AttendeesResult | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await getEventAttendees(String(id)); // nunca lanza, pero por si acaso
      if (alive.current) setRes(r);
    } catch {
      if (alive.current) setRes({ ok: false, reason: 'error' });
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [id]);
  const retry = useCallback(() => { setRes(undefined); void load(); }, [load]);
  const refresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  const shirtsOn = !!(res?.ok && res.shirtsEnabled);
  const renderItem = useCallback(({ item: a, index }: { item: AttendeeRow; index: number }) => (
    <AttendeeItem a={a} index={index} shirtsEnabled={shirtsOn} onPress={() => router.push(`/perfil/${a.id}`)} />
  ), [router, shirtsOn]);

  if (res === undefined) {
    return (
      <Screen title="Asistentes" back>
        <View style={{ paddingTop: S.lg }}>
          <SkeletonList count={5} height={72} radius={R.md} />
        </View>
      </Screen>
    );
  }

  if (!res.ok) {
    const map = {
      auth: { icon: Lock, title: 'Inicia sesión', subtitle: 'Solo el organizador puede ver quién va a su evento.', cta: 'Entrar', onCta: () => router.push('/welcome') },
      forbidden: { icon: Lock, title: 'Solo para el organizador', subtitle: 'Esta lista la ve quien organiza el evento.', cta: undefined, onCta: undefined },
      not_found: { icon: Users, title: 'Evento no encontrado', subtitle: 'Puede que se haya borrado.', cta: undefined, onCta: undefined },
      error: { icon: Users, title: 'No se pudo cargar', subtitle: 'Revisa tu conexión e inténtalo de nuevo.', cta: 'Reintentar', onCta: retry },
    }[res.reason];
    return (
      <Screen title="Asistentes" back>
        <EmptyState icon={map.icon} title={map.title} subtitle={map.subtitle} cta={map.cta} onCta={map.onCta} />
      </Screen>
    );
  }

  const { event, attendees, shirtsEnabled, tally, mode } = res;
  const n = attendees.length;

  const header = (
    <View style={{ paddingTop: S.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: S.lg, marginBottom: S.md }}>
        <AnimatedNumber value={n} style={{ fontSize: 32, letterSpacing: -1.2 }} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>
          {n === 1 ? 'persona ' : 'personas '}{mode === 'tickets' ? 'con entrada válida o usada' : 'apuntadas'}
        </Text>
      </View>

      {/* Camisetas que hay que llevar, por talla (164) */}
      {shirtsEnabled && tally ? (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Shirt size={17} color={C.blue} strokeWidth={1.75} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Camisetas para este evento</Text>
          </View>
          {tally.answered === 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Todavía nadie ha elegido talla. Se les pregunta al apuntarse.</Text>
          ) : (
            <>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
                Hay que llevar <Text style={{ fontFamily: FONT.heading }}>{tally.shirtsNeeded}</Text> {tally.shirtsNeeded === 1 ? 'camiseta' : 'camisetas'}.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {tally.bySize.map(({ size, count }) => (
                  <Pill key={size} tone={size === 'ninguna' ? 'gray' : 'blue'} label={`${shirtSizeLabel(size)}: ${count}`} />
                ))}
              </View>
            </>
          )}
          {tally.missing > 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
              {tally.missing === 1 ? '1 persona apuntada no ha elegido talla todavía.' : `${tally.missing} personas apuntadas no han elegido talla todavía.`}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  return (
    <Screen<AttendeeRow>
      title="Asistentes"
      subtitle={event.title}
      back
      refreshing={refreshing}
      onRefresh={refresh}
      data={attendees}
      renderItem={renderItem}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState icon={Users} compact title="Todavía no se ha apuntado nadie"
          subtitle={mode === 'tickets' ? 'Cuando alguien compre una entrada aparecerá aquí.' : 'Cuando alguien se inscriba aparecerá aquí.'} />
      }
    />
  );
}
