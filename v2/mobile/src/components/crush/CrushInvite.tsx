// ─── Invitar: nominar a amigos de tus chats para que entren en Crush ────────
// get_ligar_nominatable devuelve contactos de chat 1:1 mayores de 18 que aún
// no participan; nominate_friend les manda una notificación ANÓNIMA y no les
// activa nada (RGPD: solo entran si quieren). Tope del servidor: 10 al día.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { Users, Check, ShieldCheck } from 'lucide-react-native';
import { Avatar, Btn, Card, Pill, SkeletonList, EmptyState } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { TAB_BAR_CLEARANCE } from '@/components/Screen';
import { getNominatableContacts, nominateFriend, type NominatableContact } from '@/lib/crush';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, F } from '@/theme';
import { CrushLocked, CrushError, CrushNote } from './shared';

// La nota de cabecera es la MISMA pieza que en Peticiones (superficie con
// hairline e icono suelto), no un bloque tintado propio de esta pestaña.
function InviteBanner() {
  return (
    <CrushNote icon={ShieldCheck}>
      Le llegará una invitación anónima. Tú no le activas nada: solo entra si quiere. Cero presión.
    </CrushNote>
  );
}

export function CrushInvite({ optedIn, onActivate }: { optedIn: boolean; onActivate: () => void }) {
  const [contacts, setContacts] = useState<NominatableContact[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setContacts(null);
    setError(false);
    const r = await getNominatableContacts();
    setError(r.error);
    setContacts(r.rows);
  }, []);

  useEffect(() => { if (optedIn) load(); }, [optedIn, load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(true); setRefreshing(false); }, [load]);

  const invite = useCallback(async (c: NominatableContact) => {
    setSending(c.id);
    const res = await nominateFriend(c.id);
    setSending(null);
    if (!res.ok) { toastError('No se pudo invitar', res.message); return; }
    setSent((s) => new Set(s).add(c.id));
    toast('Invitación enviada', { body: `${c.full_name ?? 'Tu contacto'} no sabrá que has sido tú.` });
  }, []);

  if (!optedIn) return <CrushLocked onActivate={onActivate} what="invitar a tus amigos" />;
  if (contacts === null) {
    return (
      <View>
        <InviteBanner />
        <SkeletonList count={5} height={60} radius={R.lg} />
      </View>
    );
  }
  if (error) return <CrushError onRetry={() => load()} />;

  return (
    <FlatList<NominatableContact>
      data={contacts}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={<InviteBanner />}
      renderItem={({ item: c, index }) => {
        const done = sent.has(c.id);
        return (
          // Tarjeta del kit (misma pieza que las peticiones), no un marco a
          // mano: así las pestañas de Crush se sienten la misma app.
          <FadeIn index={index}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10, minHeight: 64 }}>
              <Avatar name={c.full_name} uri={c.avatar_url} size={40} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[F.h3, { flex: 1, fontSize: 15.5, letterSpacing: -0.25 }]}>{c.full_name ?? 'Contacto'}</Text>
              {done
                ? <Pill label="Invitado" tone="green" icon={Check} />
                : <Btn small label="Invitar" busy={sending === c.id} disabled={sending !== null && sending !== c.id} onPress={() => invite(c)}
                    accessibilityLabel={`Invitar a ${c.full_name ?? 'este contacto'} a Crush`} />}
            </Card>
          </FadeIn>
        );
      }}
      ListEmptyComponent={
        <EmptyState icon={Users} title="No hay nadie a quien invitar"
          subtitle="Solo puedes invitar a contactos con los que ya chateas, que sean mayores de 18 y que aún no estén en Crush."
          cta="Actualizar" onCta={() => load()} />
      }
      contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} />}
      showsVerticalScrollIndicator={false}
    />
  );
}
