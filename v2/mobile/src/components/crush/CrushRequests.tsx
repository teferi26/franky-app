// ─── Peticiones: quién te ha pedido el Instagram y espera respuesta ─────────
// Aceptar = pedirle el tuyo de vuelta (request_ig con su id): como esa persona
// ya te lo había pedido, la RPC devuelve match y su @ al momento. Se puede
// aceptar una a una (con el momento MATCH a pantalla completa) o todas de
// golpe (en secuencia, con un toast final, para no encadenar veinte modales).
// No existe RPC de "rechazar": igual que en la web, lo que no se acepta se
// queda en la bandeja sin que la otra persona sepa nada.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { HeartCrack, Check, Sparkles, MapPin, Inbox } from 'lucide-react-native';
import { Avatar, Btn, Card, Pill, SkeletonList, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { TAB_BAR_CLEARANCE } from '@/components/Screen';
import { getIgIncomingRequests, requestIg, type IgIncomingRequest } from '@/lib/crush';
import { toast, toastError } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';
import { CrushLocked, CrushError, CrushNote, PersonTitle, HandleButton } from './shared';
import type { MatchInfo } from './MatchModal';

function RequestRow({ r, accepted, busy, disabled, onAccept }: {
  r: IgIncomingRequest;
  /** undefined = pendiente; string | null = aceptada (su @, o null si no tiene). */
  accepted: string | null | undefined;
  busy: boolean; disabled: boolean; onAccept: () => void;
}) {
  const isAccepted = accepted !== undefined;
  return (
    // Tarjeta del kit (misma superficie, hairline y sombra suave que el resto
    // de la app), no un marco a mano con sus propios valores.
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 }}>
      <Avatar name={r.full_name} uri={r.avatar_url} size={52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <PersonTitle name={r.full_name} age={r.age} verified={r.verified} />
        {isAccepted ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blue, fontFamily: FONT.semibold, marginTop: 2 }]}>
            ¡Match! Ya podéis veros
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Quiere intercambiar contigo · {timeAgo(r.requested_at)}</Text>
            {r.city ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <MapPin size={11} color={C.muted} strokeWidth={1.9} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{r.city}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
      {isAccepted ? (
        accepted
          ? <HandleButton handle={accepted} name={r.full_name} maxWidth={104} />
          : <Pill label="Match" tone="green" icon={Check} />
      ) : (
        <Btn small label="Aceptar" icon={Check} busy={busy} disabled={disabled} onPress={onAccept}
          accessibilityLabel={`Aceptar la petición de ${r.full_name ?? 'esta persona'}`} />
      )}
    </Card>
  );
}

export function CrushRequests({ optedIn, onActivate, onChanged, onMatch }: {
  optedIn: boolean; onActivate: () => void;
  /** Se llama tras cada aceptación para refrescar el badge de pendientes. */
  onChanged: () => void;
  onMatch: (m: MatchInfo) => void;
}) {
  const [items, setItems] = useState<IgIncomingRequest[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  // id -> @ revelado al aceptar (queda a la vista hasta salir de la pestaña).
  const [accepted, setAccepted] = useState<Record<string, string | null>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setItems(null);
    setError(false);
    const r = await getIgIncomingRequests(100);
    setError(r.error);
    setItems(r.rows);
    setAccepted({});
  }, []);

  useEffect(() => { if (optedIn) load(); }, [optedIn, load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(true); setRefreshing(false); }, [load]);

  // Devuelve el @ (o null) si fue bien; undefined si falló.
  const accept = useCallback(async (r: IgIncomingRequest): Promise<string | null | undefined> => {
    const res = await requestIg(r.id);
    if (!res.ok) { toastError('No se pudo aceptar', res.message); return undefined; }
    const handle = res.instagram ?? null;
    setAccepted((m) => ({ ...m, [r.id]: handle }));
    onChanged();
    return handle;
  }, [onChanged]);

  const acceptOne = useCallback(async (r: IgIncomingRequest) => {
    setAcceptingId(r.id);
    const handle = await accept(r);
    setAcceptingId(null);
    if (handle === undefined) return;
    onMatch({ id: r.id, name: r.full_name, avatar: r.avatar_url, handle, verified: r.verified });
  }, [accept, onMatch]);

  const acceptAll = useCallback(async () => {
    if (!items) return;
    const pending = items.filter((r) => !(r.id in accepted));
    setAcceptingAll(true);
    setProgress([0, pending.length]);
    let done = 0;
    let ok = 0;
    // En secuencia: cada llamada revela su @ y así no se satura la RPC.
    for (const r of pending) {
      const handle = await accept(r);
      done += 1;
      if (handle !== undefined) ok += 1;
      setProgress([done, pending.length]);
    }
    setAcceptingAll(false);
    if (ok > 0) toast(ok === 1 ? '1 match nuevo' : `${ok} matches nuevos`, { body: 'Ya tenéis vuestros Instagram. Míralos en Matches.' });
  }, [items, accepted, accept]);

  if (!optedIn) return <CrushLocked onActivate={onActivate} what="ver quién te ha pedido el Instagram" />;
  if (items === null) return <View style={{ paddingTop: S.lg }}><SkeletonList count={4} height={78} radius={R.lg} /></View>;
  if (error) return <CrushError onRetry={() => load()} />;

  const pendingCount = items.filter((r) => !(r.id in accepted)).length;

  return (
    <FlatList<IgIncomingRequest>
      data={items}
      keyExtractor={(r) => r.id}
      renderItem={({ item, index }) => (
        // Entrada en cascada al primer pintado (respeta "reducir movimiento").
        <FadeIn index={index}>
          <RequestRow r={item} accepted={accepted[item.id]}
            busy={acceptingId === item.id} disabled={acceptingAll || (acceptingId !== null && acceptingId !== item.id)}
            onAccept={() => acceptOne(item)} />
        </FadeIn>
      )}
      ListHeaderComponent={pendingCount > 0 ? (
        <View>
          <CrushNote icon={Inbox}>
            {pendingCount === 1
              ? 'Una persona espera tu respuesta. Aceptar es pedirle su Instagram de vuelta: se lo cambiáis en el momento.'
              : `${pendingCount} personas esperan tu respuesta. Aceptar es pedirles su Instagram de vuelta: se lo cambiáis en el momento.`}
          </CrushNote>
          {pendingCount > 1 ? (
            <View style={{ paddingHorizontal: S.lg, paddingBottom: 12 }}>
              <Btn full icon={Sparkles} busy={acceptingAll} disabled={acceptingId !== null}
                label={acceptingAll ? `Aceptando ${progress[0]} de ${progress[1]}` : `Aceptar todas (${pendingCount})`}
                onPress={acceptAll} />
            </View>
          ) : null}
        </View>
      ) : <View style={{ height: S.lg }} />}
      ListEmptyComponent={
        <EmptyState icon={HeartCrack} title="Nadie te ha pedido el Instagram todavía"
          subtitle="Cuando alguien quiera intercambiar contigo, aparecerá aquí para que lo aceptes. Mientras, publica en el tablón o descubre gente."
          cta="Actualizar" onCta={() => load()} />
      }
      contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} />}
      showsVerticalScrollIndicator={false}
    />
  );
}
