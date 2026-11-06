// ─── Comunidades del campus: carrera, residencia, estudio y afición ────────
// Una sola pantalla con filtro por `kind` (mejoras 56, 66 y 85 del ciclo 2).
// Backend: migración 138, aún no aplicada en prod: getCommunities es fail-soft
// y aquí se ve simplemente un estado vacío mientras tanto, sin petar nada.
//
// Diseño: tarjetas elevadas (Card del kit) con imagen a la izquierda, píldoras
// de tipo/privacidad/miembro y el dato clave (miembros) abajo; chips de filtro
// con icono; esqueleto, vacío y error con Reintentar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Plus, Users, GraduationCap, Building2, BookOpen, Heart, WifiOff, Lock, ChevronRight, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Tap, Chip, SearchBar, EmptyState, Pill, SkeletonList, Card } from '@/components/ui';
import {
  getCommunities, getCommunityInvitations, KINDS, kindLabel, COMMUNITIES_PAGE_SIZE,
  type CommunityInvitation,
  type CommunitySummary, type CommunityKind,
} from '@/lib/communities';
import { timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { C, S, F, R } from '@/theme';

type KindFilter = CommunityKind | 'todas';

// Icono por tipo: se reconoce de un vistazo en la tarjeta y en la ficha.
const KIND_ICON: Record<CommunityKind, LucideIcon> = {
  carrera: GraduationCap,
  residencia: Building2,
  estudio: BookOpen,
  aficion: Heart,
};

// keyExtractor a nivel de módulo: referencia estable entre renders.
const keyOf = (item: CommunitySummary) => item.id;

// Tarjeta memoizada: la lista se repinta al paginar o filtrar y solo deben
// volver a pintarse las tarjetas cuyo item cambia.
const CommunityCard = React.memo(function CommunityCard({ item, onPress, index = 0 }: {
  item: CommunitySummary; onPress: (id: string) => void; index?: number;
}) {
  const Icon = KIND_ICON[item.kind] ?? Users;
  const members = `${item.member_count} ${item.member_count === 1 ? 'miembro' : 'miembros'}`;
  return (
    <FadeIn index={index} distance={12}>
    <Card onPress={() => onPress(item.id)} style={{ padding: 12 }}
      accessibilityLabel={`${item.name}, ${kindLabel(item.kind)}, ${members}${item.is_private ? ', privada' : ''}${item.is_member ? ', eres miembro' : ''}`}
      accessibilityHint="Abre la comunidad">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} recyclingKey={item.id}
            style={{ width: 76, height: 76, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border }}
            contentFit="cover" cachePolicy="memory-disk" transition={120} />
        ) : (
          <View style={{ width: 76, height: 76, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={28} color={C.muted} strokeWidth={1.5} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Pill label={kindLabel(item.kind)} tone="blue" icon={Icon} />
            {item.is_private ? <Pill label="Privada" icon={Lock} /> : null}
            {item.is_member ? <Pill label="Miembro" tone="green" /> : null}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 16 }]} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Users size={13} color={C.muted} strokeWidth={1.75} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>
              {members} · {timeAgo(item.created_at)}
            </Text>
          </View>
        </View>
        <ChevronRight size={18} color={C.muted} strokeWidth={1.75} />
      </View>
    </Card>
    </FadeIn>
  );
});

export default function Comunidades() {
  const { uid } = useSessionIdentity();
  if (uid === undefined) return <ActivityIndicator color={C.blue} />;
  return <CommunitiesScreen key={uid ?? 'signed-out'} />;
}

function CommunitiesScreen() {
  const router = useRouter();
  const [kind, setKind] = useState<KindFilter>('todas');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CommunitySummary[]>([]);
  const [invitations, setInvitations] = useState<CommunityInvitation[]>([]);
  const [invitationError, setInvitationError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Fallo de red al cargar: se distingue de "no hay nada" para no confundir.
  const [loadError, setLoadError] = useState(false);
  // Offset del servidor en un ref: no depende de renders de `rows`, así
  // reload/loadMore mantienen una identidad estable entre filtros.
  const offsetRef = useRef(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await getCommunities({
        kind: kind === 'todas' ? null : kind,
        offset: 0,
      });
      setRows(page.rows); setLoadError(!page.ok);
      try { setInvitations(await getCommunityInvitations()); setInvitationError(false); }
      catch { setInvitationError(true); }
      offsetRef.current = page.rows.length;
      setHasMore(page.rows.length === COMMUNITIES_PAGE_SIZE);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getCommunities({
        kind: kind === 'todas' ? null : kind,
        offset: offsetRef.current,
      });
      setRows((prev) => [...prev, ...page.rows]);
      offsetRef.current += page.rows.length;
      setHasMore(page.rows.length === COMMUNITIES_PAGE_SIZE);
    } catch {
      // Sin red al paginar: se reintenta al volver a llegar al final.
    } finally {
      setLoadingMore(false);
    }
  }, [kind, loading, loadingMore, refreshing, hasMore]);

  const onRefresh = useCallback(() => { setRefreshing(true); reload(); }, [reload]);

  // Búsqueda en cliente: solo sobre lo ya cargado.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const open = useCallback((id: string) => router.push(`/comunidad/${id}`), [router]);
  const renderItem = useCallback(({ item, index }: { item: CommunitySummary; index: number }) => (
    <CommunityCard item={item} index={index} onPress={open} />
  ), [open]);

  const listHeader = (
    <View style={{ paddingTop: S.md }}>
      {invitationError ? <Card onPress={() => void reload()} style={{ marginHorizontal: S.lg, marginBottom: 10 }}><Text style={F.small}>No se pudieron consultar tus invitaciones. Toca para reintentar.</Text></Card> : null}
      {invitations.map(invitation => <Card key={invitation.id} onPress={() => open(invitation.community_id)} style={{ marginHorizontal: S.lg, marginBottom: 10 }}><Text style={F.h3}>Invitación a {invitation.name}</Text><Text style={F.small}>Abre la comunidad para aceptar. Disponible hasta el {new Date(invitation.expires_at).toLocaleDateString('es-ES')}.</Text></Card>)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 10 }}
        accessibilityRole="tablist">
        <Chip label="Todas" accessibilityRole="tab" active={kind === 'todas'} onPress={() => setKind('todas')} />
        {KINDS.map((k) => (
          <Chip key={k.value} label={k.label} icon={KIND_ICON[k.value]} accessibilityRole="tab" active={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </ScrollView>
      <SearchBar value={query} onChange={setQuery} placeholder="Buscar comunidades de tu campus" />
    </View>
  );

  return (
    <Screen<CommunitySummary>
      title="Comunidades"
      subtitle="Tu carrera, tu residencia, tu gente"
      back
      right={
        <Tap onPress={() => router.push('/crear-comunidad')} accessibilityLabel="Crear comunidad"
          accessibilityHint="Abre el formulario para crear una comunidad nueva" hitSlop={12}
          style={{ width: 32, height: 36, alignItems: 'flex-end', justifyContent: 'center' }}>
          {/* Icono SUELTO de trazo fino, como en Chats y Eventos: sin círculo tintado. */}
          <Plus size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
      }
      data={filtered}
      keyExtractor={keyOf}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        loading ? (
          <SkeletonList count={4} height={100} radius={R.lg} />
        ) : loadError ? (
          <EmptyState icon={WifiOff} title="No se pudo cargar"
            subtitle="Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={reload} />
        ) : query.trim() ? (
          <EmptyState compact icon={Users} title="Nada con ese texto"
            subtitle="Prueba con otra palabra o cambia el filtro."
            cta="Limpiar búsqueda" onCta={() => setQuery('')} />
        ) : (
          <EmptyState
            icon={Users}
            title={kind === 'todas' ? 'No hay comunidades todavía' : `Sin comunidades de ${kindLabel(kind).toLowerCase()}`}
            subtitle="Sé quien la abra en tu campus: tu carrera, tu residencia, un grupo de estudio o una afición."
            cta="Crear comunidad"
            onCta={() => router.push('/crear-comunidad')}
          />
        )
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={C.muted} style={{ marginVertical: S.lg }} /> : null}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}
