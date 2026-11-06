// ─── Descubrir: mazo de perfiles de tu uni para pedirles el Instagram ───────
// Reutiliza el SwipeDeck (estilo Tinder) que ya existe en la app: deslizar a
// la derecha = pedir el Instagram (request_ig), a la izquierda = pasar (solo
// en local: no hay RPC de "pass", así que esa persona puede volver a salir en
// otra tanda, igual que en la web). La RPC get_ig_candidates ya excluye a
// quien ya has pedido, bloqueados y cuarentenados.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Compass, MapPin } from 'lucide-react-native';
import { SwipeDeck } from '@/components/SwipeDeck';
import { EmptyState, Skeleton, Avatar } from '@/components/ui';
import { getIgCandidates, requestIg, type IgCandidate } from '@/lib/crush';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';
import { CrushLocked, CrushError } from './shared';
import type { MatchInfo } from './MatchModal';

const DECK_SIZE = 20;

function CandidateCard({ c }: { c: IgCandidate }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.input }}>
      {c.avatar_url ? (
        <Image source={{ uri: c.avatar_url }} style={{ flex: 1 }} contentFit="cover" transition={150} cachePolicy="memory-disk"
          accessibilityLabel={c.full_name ? `Foto de ${c.full_name}` : 'Foto de perfil'} />
      ) : (
        // Sin foto: violeta sólido de marca con las iniciales grandes, para
        // que la carta no sea un bloque gris.
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue }}>
          <Avatar name={c.full_name} size={140} />
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.lg, paddingTop: 60, paddingBottom: S.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
            style={{ fontSize: 24, fontFamily: FONT.heading, color: '#FFFFFF', letterSpacing: -0.3, flexShrink: 1 }}>
            {c.full_name ?? 'Estudiante'}{c.age != null ? `, ${c.age}` : ''}
          </Text>
        </View>
        {c.city ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <MapPin size={13} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{c.city}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}

export function CrushDiscover({ optedIn, onActivate, onMatch }: {
  optedIn: boolean; onActivate: () => void; onMatch: (m: MatchInfo) => void;
}) {
  const [candidates, setCandidates] = useState<IgCandidate[] | null>(null);
  const [error, setError] = useState(false);
  // Cartas ya pasadas o pedidas en esta tanda. El SwipeDeck lleva su índice
  // interno; esto solo sirve para saber cuándo enseñar el estado vacío propio
  // (con el EmptyState del kit) en vez del genérico del mazo.
  const [swiped, setSwiped] = useState(0);

  const load = useCallback(async () => {
    setCandidates(null);
    setError(false);
    setSwiped(0);
    const r = await getIgCandidates(DECK_SIZE);
    setError(r.error);
    setCandidates(r.rows);
  }, []);

  useEffect(() => { if (optedIn) load(); }, [optedIn, load]);

  const smash = useCallback(async (c: IgCandidate) => {
    setSwiped((n) => n + 1);
    const res = await requestIg(c.id);
    if (!res.ok) { toastError('No se pudo enviar', res.message); return; }
    if (res.matched) {
      onMatch({ id: c.id, name: c.full_name, avatar: c.avatar_url, handle: res.instagram ?? null, verified: c.verified });
    }
  }, [onMatch]);

  const pass = useCallback(() => setSwiped((n) => n + 1), []);

  if (!optedIn) return <CrushLocked onActivate={onActivate} what="descubrir gente de tu uni y pedirle el Instagram" />;

  if (candidates === null) {
    return (
      <View style={{ flex: 1, paddingTop: S.lg }}>
        <Skeleton height={80} radius={R.md} />
        <Skeleton height={380} radius={R.xl} />
      </View>
    );
  }
  if (error) return <CrushError onRetry={load} />;

  if (candidates.length === 0 || swiped >= candidates.length) {
    return (
      <EmptyState icon={Compass}
        title={candidates.length === 0 ? 'No hay nadie nuevo por ahora' : 'Has visto a todo el mundo'}
        subtitle="Vuelve más tarde: cada día se apunta gente nueva de tu uni. Si alguien te pide el Instagram, lo verás en Peticiones."
        cta="Actualizar" onCta={load} />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, paddingTop: 10, textAlign: 'center' }]}>
        Desliza a la derecha para pedirle el Instagram. Nadie se entera a menos que haya match.
      </Text>
      <SwipeDeck<IgCandidate>
        items={candidates}
        renderCard={(c) => <CandidateCard c={c} />}
        onSmash={smash}
        onPass={pass}
        onReset={load}
        showResetMidDeck={false}
        emptyTitle="Has visto a todo el mundo"
        emptySubtitle="Vuelve más tarde: cada día se apunta gente nueva de tu uni."
        resetLabel="Actualizar"
      />
    </View>
  );
}
