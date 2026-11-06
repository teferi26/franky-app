// ─── Página del organizador (mejora 76) ──────────────────────────────────
// Dado el id de un perfil, lista TODOS sus eventos (tabla events, columna
// organizer_id) separados en "Próximos" y "Pasados" por fecha. Visible para
// cualquiera (RLS "Events are viewable by everyone"), no solo para el propio
// organizador: es la ficha pública a la que se llega desde la ficha de un evento.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  CalendarDays, MapPin, UserX, ChevronRight, PartyPopper, BookOpen, Trophy,
  Drama, Handshake, Store, Pin, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Avatar, Tap, EmptyState, Skeleton, Pill } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { dateLong, typeLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import type { EventItem } from '@/lib/types';

type OrganizerProfile = { id: string; full_name: string | null; avatar_url: string | null };

// Icono por categoría en vez del emoji del catálogo: se tiñe con el tema y se
// ve igual en iOS y Android (un emoji no).
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};

// Filas de la lista: cabecera de sección o evento. Una sola FlatList para las
// dos secciones (nada de ScrollView con dos bucles de 200 filas dentro).
type Row = { kind: 'header'; id: string; label: string } | { kind: 'event'; id: string; e: EventItem };

// Memoizada: al refrescar no se repintan las miniaturas de toda la lista.
const EventRow = React.memo(function EventRow({ e, onPress, index = 0 }: { e: EventItem; onPress: () => void; index?: number }) {
  const CatIcon = CAT_ICON[e.category] ?? Pin;
  const pasado = new Date(e.start_date).getTime() < Date.now();
  return (
    <FadeIn index={index} distance={10}>
    <Tap onPress={onPress} haptic={false}
      accessibilityLabel={`${e.title}, ${e.venue ?? e.city}`} accessibilityHint="Abre la ficha del evento">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: S.lg, paddingVertical: 11, minHeight: 72,
      }}>
        <View style={{ width: 56, height: 56, borderRadius: R.md, backgroundColor: C.input, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', opacity: pasado ? 0.75 : 1 }}>
          {e.image_url ? (
            <Image source={{ uri: e.image_url }} recyclingKey={e.id} cachePolicy="memory-disk" transition={120}
              style={{ width: 56, height: 56 }} contentFit="cover" />
          ) : (
            <CatIcon size={22} color={C.muted} strokeWidth={1.75} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{e.title}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textTransform: 'capitalize', marginTop: 1 }]} numberOfLines={1}>
            {dateLong(e.start_date)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MapPin size={12} color={C.muted} strokeWidth={1.75} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]} numberOfLines={1}>
              {e.venue ?? e.city} · {typeLabel[e.category] ?? e.category}
            </Text>
          </View>
        </View>
        {e.status === 'cancelled'
          ? <Pill label="Cancelado" tone="red" />
          : <ChevronRight size={18} color={C.muted} strokeWidth={1.75} />}
      </View>
    </Tap>
    </FadeIn>
  );
}, (prev, next) => prev.e === next.e);

export default function OrganizadorPerfil() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const organizerId = String(id);
  const router = useRouter();
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setNotFound(false);
      const [{ data: prof }, { data: evs, error }] = await Promise.all([
        supabase.from('public_profiles').select('id, full_name, avatar_url').eq('id', organizerId).maybeSingle(),
        supabase.from('events').select('*').eq('organizer_id', organizerId)
          .order('start_date', { ascending: false }).limit(200),
      ]);
      if (error) throw error;
      if (!prof) { setNotFound(true); setEvents([]); return; }
      setProfile(prof as OrganizerProfile);
      setEvents((evs as EventItem[]) ?? []);
    } catch {
      // Sin red: fail-soft, mostramos el estado de "no disponible" con reintento.
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [organizerId]);

  useEffect(() => { load(); }, [load]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Próximos primero (de más cercano a más lejano) y luego pasados, aplanados
  // en una sola lista con sus cabeceras.
  const rows = useMemo<Row[]>(() => {
    const now = Date.now();
    const upcoming = events
      .filter(e => new Date(e.start_date).getTime() >= now)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const past = events
      .filter(e => new Date(e.start_date).getTime() < now)
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    const out: Row[] = [];
    if (upcoming.length) {
      out.push({ kind: 'header', id: 'h-up', label: 'Próximos' });
      for (const e of upcoming) out.push({ kind: 'event', id: e.id, e });
    }
    if (past.length) {
      out.push({ kind: 'header', id: 'h-past', label: 'Pasados' });
      for (const e of past) out.push({ kind: 'event', id: e.id, e });
    }
    return out;
  }, [events]);

  const keyExtractor = useCallback((r: Row) => r.id, []);
  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => (
    item.kind === 'header' ? (
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.sm }]}>{item.label}</Text>
    ) : (
      <EventRow e={item.e} index={index} onPress={() => router.push(`/evento/${item.e.id}`)} />
    )
  ), [router]);

  if (loading) {
    return (
      <Screen title="Organizador" back>
        <View style={{ alignItems: 'center', paddingTop: S.xl, gap: 10 }}>
          <Skeleton height={82} radius={41} style={{ width: 82, marginHorizontal: 0 }} />
          <Skeleton height={20} radius={R.sm} style={{ width: 160, marginHorizontal: 0 }} />
        </View>
        <View style={{ marginTop: S.lg }}>
          <Skeleton height={72} radius={R.lg} />
          <Skeleton height={72} radius={R.lg} />
          <Skeleton height={72} radius={R.lg} />
        </View>
      </Screen>
    );
  }

  if (notFound || !profile) {
    return (
      <Screen title="Organizador" back>
        <EmptyState icon={UserX} title="Organizador no disponible"
          subtitle="Esta cuenta no existe, ya no está activa o falla tu conexión."
          cta="Reintentar" onCta={refresh} />
      </Screen>
    );
  }

  return (
    <Screen<Row>
      title="Organizador" back refreshing={refreshing} onRefresh={refresh}
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={
        <View style={{ alignItems: 'center', paddingTop: S.lg, paddingHorizontal: S.lg, gap: 6 }}>
          <Avatar name={profile.full_name} uri={profile.avatar_url} size={82} ring />
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[F.h1, { textAlign: 'center', fontFamily: FONT.display, fontSize: 27, letterSpacing: -0.8 }]} numberOfLines={2}>
            {profile.full_name ?? 'Organizador'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: C.border, borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 5 }}>
            <CalendarDays size={13} color={C.blue} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 12.5, fontFamily: FONT.semibold }}>
              {events.length} {events.length === 1 ? 'evento' : 'eventos'}
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon={CalendarDays} title="Sin eventos"
          subtitle="Este organizador todavía no ha publicado ningún evento." />
      }
    />
  );
}
