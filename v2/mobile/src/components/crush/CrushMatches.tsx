import { openSocialInstagram } from '@/lib/social-demo';
// ─── Matches: con quién ya habéis intercambiado Instagram ───────────────────
// Antes era un modal colgado de un icono en la cabecera; ahora es una pestaña
// con las mismas acciones que la web (abrir Instagram, denunciar un @ falso)
// más abrir el chat 1:1, que en móvil es lo natural.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, RefreshControl, Alert, Clipboard } from 'react-native';
import { useRouter } from 'expo-router';
import { HeartCrack, AtSign, MessageCircle, MoreHorizontal, Copy, Flag } from 'lucide-react-native';
import { Avatar, SkeletonList, EmptyState, Tap, OptionsSheet, type SheetOption } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { TAB_BAR_CLEARANCE } from '@/components/Screen';
import { getIgMatches, openCrushChat, reportIgUser, type IgMatch } from '@/lib/crush';
import { toast, toastError } from '@/lib/toast';
import { timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F } from '@/theme';
import { CrushLocked, CrushError, PersonTitle, HandleButton } from './shared';

export function CrushMatches({ optedIn, onActivate, reloadKey, onGoDiscover }: {
  optedIn: boolean; onActivate: () => void;
  /** Cambiarlo fuerza una recarga (la pantalla lo sube cuando hay match nuevo). */
  reloadKey: number;
  onGoDiscover: () => void;
}) {
  const router = useRouter();
  const [matches, setMatches] = useState<IgMatch[] | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetFor, setSheetFor] = useState<IgMatch | null>(null);
  const [chatBusy, setChatBusy] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());

  const load = useCallback(async (silent = false) => {
    if (!silent) setMatches(null);
    setError(false);
    const r = await getIgMatches();
    setError(r.error);
    setMatches(r.rows);
  }, []);

  // Primera carga con skeleton; las siguientes (reloadKey sube tras un match
  // nuevo) en silencio, sobre la lista que ya se ve.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!optedIn) return;
    load(loadedOnce.current);
    loadedOnce.current = true;
  }, [optedIn, reloadKey, load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(true); setRefreshing(false); }, [load]);

  const openInstagram = (m: IgMatch) => {
    if (!m.instagram_handle) return;
    void openSocialInstagram(m.instagram_handle);
  };

  const openChat = async (m: IgMatch) => {
    setChatBusy(m.id);
    const convo = await openCrushChat(m.id);
    setChatBusy(null);
    if (!convo) { toastError('No se pudo abrir el chat', 'Inténtalo de nuevo en unos segundos.'); return; }
    router.push(`/chat/${convo}`);
  };

  // report_ig exige match mutuo: aquí siempre se cumple.
  const report = (m: IgMatch) => {
    Alert.alert(
      'Denunciar Instagram',
      `¿El @ de ${m.full_name ?? 'esta persona'} parece falso o no es suyo? Lo revisaremos y, si se repite, dejará de mostrarse.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Denunciar', style: 'destructive',
          onPress: async () => {
            const res = await reportIgUser(m.id, 'falso o no es esta persona');
            if (!res.ok) { toastError('No se pudo denunciar', res.message); return; }
            setReported((s) => new Set(s).add(m.id));
            toast('Gracias', { body: 'Lo revisaremos lo antes posible.' });
          },
        },
      ],
    );
  };

  const canCopy = typeof Clipboard?.setString === 'function';
  const sheetOptions: SheetOption[] = sheetFor ? [
    ...(sheetFor.instagram_handle ? [{ label: `Abrir @${sheetFor.instagram_handle}`, icon: AtSign, onPress: () => openInstagram(sheetFor) }] : []),
    ...(sheetFor.instagram_handle && canCopy ? [{
      label: 'Copiar @', icon: Copy,
      onPress: () => { Clipboard.setString(`@${sheetFor.instagram_handle}`); toast('Copiado', { body: `@${sheetFor.instagram_handle}` }); },
    }] : []),
    { label: 'Abrir chat', icon: MessageCircle, onPress: () => { openChat(sheetFor); } },
    ...(reported.has(sheetFor.id) ? [] : [{ label: 'Denunciar Instagram falso', icon: Flag, destructive: true, onPress: () => report(sheetFor) }]),
  ] : [];

  if (!optedIn) return <CrushLocked onActivate={onActivate} what="ver tus matches" />;
  if (matches === null) return <View style={{ paddingTop: S.lg }}><SkeletonList count={4} height={68} radius={R.lg} /></View>;
  if (error) return <CrushError onRetry={() => load()} />;

  return (
    <>
      <FlatList<IgMatch>
        data={matches}
        keyExtractor={(m) => m.id}
        renderItem={({ item: m, index }) => (
          // Fila plana con hairline: la lista de matches puede ser larga y el
          // ritmo editorial pide filas, no tarjetas apiladas.
          <FadeIn index={index}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
              <Avatar name={m.full_name} uri={m.avatar_url} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <PersonTitle name={m.full_name} age={m.age} verified={m.verified} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>
                  Match · {timeAgo(m.matched_at)}{reported.has(m.id) ? ' · Denunciado' : ''}
                </Text>
              </View>
              {/* Mismo botón del @ que en Peticiones (pieza compartida). */}
              {m.instagram_handle ? (
                <HandleButton handle={m.instagram_handle} name={m.full_name} maxWidth={96} />
              ) : null}
              {/* Iconos SUELTOS de trazo fino: nada de círculos tintados fuera
                  de las filas de ajustes. */}
              <Tap onPress={() => openChat(m)} disabled={chatBusy === m.id} accessibilityLabel={`Abrir chat con ${m.full_name ?? 'este match'}`}
                accessibilityState={{ busy: chatBusy === m.id }} hitSlop={8}
                style={{ opacity: chatBusy === m.id ? 0.4 : 1 }}>
                <MessageCircle size={20} color={C.blue} strokeWidth={1.9} />
              </Tap>
              <Tap onPress={() => setSheetFor(m)} accessibilityLabel={`Más opciones para ${m.full_name ?? 'este match'}`} hitSlop={8}>
                <MoreHorizontal size={20} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </View>
          </FadeIn>
        )}
        ListEmptyComponent={
          <EmptyState icon={HeartCrack} title="Aún no tienes matches"
            subtitle="Cuando alguien a quien le pediste el Instagram te lo pida también, aparecerá aquí con su @."
            cta="Descubrir gente" onCta={onGoDiscover} />
        }
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.muted} />}
        showsVerticalScrollIndicator={false}
      />
      <OptionsSheet visible={sheetFor !== null} title={sheetFor?.full_name ?? 'Match'} options={sheetOptions} onClose={() => setSheetFor(null)} />
    </>
  );
}
