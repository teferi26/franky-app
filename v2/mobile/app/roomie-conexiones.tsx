import React, { useCallback, useState, useRef } from 'react';
import { View, Text } from 'react-native';
import { Users } from 'lucide-react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Avatar, Btn, Card, Chip, EmptyState, SkeletonList } from '@/components/ui';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useSessionGuard } from '@/lib/useSessionGuard';
import { supabase } from '@/lib/supabase';
import { usePagedFeed } from '@/lib/usePagedFeed';
import { toast, toastError } from '@/lib/toast';
import { F, S, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

type Tab = 'matches' | 'received' | 'given';
type Connection = { id: string; full_name: string | null; avatar_url: string | null; city: string | null; career: string | null; university_name: string | null; budget_min: number | null; budget_max: number | null; compatibility_score: number | null };
const TABS: { key: Tab; label: string }[] = [{ key: 'matches', label: 'Matches' }, { key: 'received', label: 'Les encajas' }, { key: 'given', label: 'Tus likes' }];
export default function RoomieConnections() {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  if (uid === undefined) return <Screen title="Tus conexiones Roomie" back><SkeletonList count={3} /></Screen>;
  if (!uid) return <Screen title="Tus conexiones Roomie" back><EmptyState icon={Users} title="Inicia sesión para ver tus conexiones" cta="Iniciar sesión" onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedConnections key={uid} owner={uid} />;
}
function OwnedConnections({ owner }: { owner: string }) {
  const isCurrent = useSessionGuard(owner);
  const operation = useRef(false);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'received' || params.tab === 'given' ? params.tab : 'matches');
  const [busy, setBusy] = useState<string | null>(null);
  const fetchPage = useCallback(async (offset: number) => {
    if (!isCurrent()) return [];
    const { data, error } = await supabase.rpc('get_my_roomie_connections', { p_tab: tab, p_limit: 30, p_offset: offset });
    if (!isCurrent()) return [];
    if (error) throw error;
    return (data ?? []) as Connection[];
  }, [tab, isCurrent]);
  const { items, loading, loadingMore, hasMore, error, moreError, reload, loadMore } = usePagedFeed(fetchPage, 30);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  const act = async (person: Connection) => {
    if (operation.current || !isCurrent()) return;
    operation.current = true;
    setBusy(person.id);
    try {
      if (tab === 'matches') {
        const { data, error } = await supabase.rpc('get_or_create_direct_chat', { p_other_user_id: person.id });
        if (!isCurrent()) return;
        if (error || !data) throw error ?? new Error('chat_failed');
        router.push(`/chat/${data}`);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isCurrent() || user?.id !== owner) return;
        if (!user) { router.push('/welcome'); return; }
        const { data, error } = await supabase.rpc('process_swipe_action', { p_user_id: user.id, p_target_id: person.id, p_target_type: 'roomie', p_action: 'like' });
        if (!isCurrent()) return;
        if (error) throw error;
        if (data?.match) { setTab('matches'); toast('¡Os encajáis!', data.conversation_id ? 'Tenéis una conversación disponible en Matches.' : 'El interés es mutuo. La conversación depende de vuestras preferencias de privacidad.'); }
        else toast('Like guardado', 'Lo encontrarás en Tus likes.');
        reload();
      }
    } catch (cause) {
      if (!isCurrent()) return;
      const message = (cause as { message?: string })?.message ?? '';
      toastError(message.includes('roomie_profile_incomplete') ? 'Completa tu perfil de Roomie' : message.includes('not_allowed') ? 'Esta persona ha limitado quién puede escribirle' : 'No se pudo completar la acción', 'Revisa tus preferencias o inténtalo de nuevo.');
    } finally { operation.current = false; if (isCurrent()) setBusy(null); }
  };
  return <Screen title="Tus conexiones Roomie" back data={loading || error ? [] : items} keyExtractor={item => item.id} onRefresh={reload} refreshing={loading && items.length > 0}
    ListHeaderComponent={<View style={{ padding: S.lg, gap: 14 }}><Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[F.h1, { fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -1.1 }]}>De encajar a compartir piso.</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Un match significa que ambos os habéis dado like. Hablad de presupuesto, horarios y lo que esperáis de la convivencia.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{TABS.map(item => <Chip key={item.key} label={item.label} accessibilityRole="tab" active={tab === item.key} onPress={() => setTab(item.key)} />)}</View></View>}
    ListEmptyComponent={loading ? <SkeletonList count={3} height={150} /> : error ? <EmptyState icon={Users} title="No se pudieron cargar tus conexiones" subtitle="Comprueba tu sesión y vuelve a intentarlo." cta="Reintentar" onCta={reload} /> : <EmptyState icon={Users} title={tab === 'matches' ? 'Tu próximo compañero puede estar a un like' : tab === 'received' ? 'Aquí aparecerán las personas a las que encajas' : 'Aún no has guardado likes'} subtitle="Completa tu ciudad, presupuesto y hábitos para encontrar con quién vivir." cta="Descubrir roomies" onCta={() => router.replace('/roomie')} />}
    renderItem={({ item: person, index }) => <FadeIn index={index}><Card style={{ gap: 12 }}><View style={{ flexDirection: 'row', gap: 12 }}><Avatar name={person.full_name ?? 'Estudiante'} uri={person.avatar_url} size={56} /><View style={{ flex: 1 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{person.full_name || 'Estudiante'}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{[person.career, person.university_name, person.city].filter(Boolean).join(' · ')}</Text></View></View><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{person.budget_min != null ? `${person.budget_min}–${person.budget_max ?? person.budget_min} €/mes` : 'Presupuesto por consultar'}{person.compatibility_score != null ? ` · ${Math.round(person.compatibility_score)}% afinidad de hábitos` : ''}</Text>{tab === 'given' ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Like guardado. Cuando el interés sea mutuo aparecerá en Matches.</Text> : <Btn full label={tab === 'matches' ? 'Abrir conversación' : 'También me encaja'} busy={busy === person.id} disabled={busy !== null} onPress={() => act(person)} />}</Card></FadeIn>}
    ListFooterComponent={<View style={{ padding: S.lg, gap: 10 }}>{moreError && <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se pudo cargar la siguiente página. Puedes reintentar.</Text>}{hasMore && <Btn full label="Ver más conexiones" busy={loadingMore} onPress={loadMore} />}</View>}
  />;
}
