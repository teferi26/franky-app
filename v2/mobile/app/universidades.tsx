// ─── Catálogo de universidades ───────────────────────────────────────────
// Lista virtualizada (variante FlatList de Screen) agrupada por comunidad
// autónoma: con 80+ universidades, un ScrollView con todas montadas a la vez
// tardaba en abrir y tartamudeaba al hacer scroll. Cada fila es un componente
// memoizado y las imágenes van con caché en disco y recyclingKey, que es lo
// que evita el "parpadeo" de logos al reciclar celdas.
import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Building2, ChevronRight, GitCompareArrows } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Chip, SearchBar, SkeletonList, Skeleton, EmptyState, Tap, Pill, Card, NavRow } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getUniversityList, type UniversityListItem } from '@/lib/catalogue-pages';
import { useFetch } from '@/lib/useFetch';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R } from '@/theme';
import { universityStudentContext } from '@/lib/university-evidence';

type TypeFilter = 'todas' | 'publica' | 'privada';

// La lista plana mezcla cabeceras de comunidad y universidades: un FlatList
// solo admite un tipo de dato, así que cada elemento lleva su `kind`. Las
// cabeceras no van "sticky" porque la variante lista de Screen no expone
// stickyHeaderIndices; se dejan como separadores de sección.
type Row =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'uni'; key: string; uni: UniversityListItem };

const UniRow = memo(function UniRow({ uni, onPress }: { uni: UniversityListItem; onPress: (id: string) => void }) {
  const logo = uni.logo_url ?? uni.image_url;
  return (
    <Tap onPress={() => onPress(uni.id)} accessibilityLabel={`${uni.name}, ${uni.city}`} accessibilityHint="Abre la ficha de la universidad">
      <View style={{
        flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 76,
        marginHorizontal: S.lg, marginBottom: S.sm, paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border,
      }}>
        {/* Logo dentro de un marco redondeado, nunca a sangre. */}
        {logo ? (
          <Image source={{ uri: logo }} accessibilityLabel={`Logo de ${uni.name}`} recyclingKey={uni.id} cachePolicy="memory-disk"
            style={{ width: 50, height: 50, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }} contentFit="contain" transition={120} />
        ) : (
          <View style={{ width: 50, height: 50, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={22} color={C.muted} strokeWidth={1.5} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 15.5, letterSpacing: -0.2 }]} numberOfLines={2}>{uni.name}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]} numberOfLines={1}>{uni.city}{uni.short_name ? ` · ${uni.short_name}` : ''}</Text>
          {uni.student_count ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 1, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
              {uni.student_count.toLocaleString('es-ES')} estudiantes · {universityStudentContext(uni)}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Pill label={uni.type === 'publica' ? 'Pública' : 'Privada'} tone={uni.type === 'publica' ? 'blue' : 'gray'} />
          <ChevronRight size={16} color={C.muted} strokeWidth={1.9} />
        </View>
      </View>
    </Tap>
  );
});

function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: 10, backgroundColor: C.bg }}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{title}</Text>
      {/* Filete que empuja la cuenta al margen derecho: rótulo editorial. */}
      <View style={{ flex: 1, height: 0.5, backgroundColor: C.borderLight }} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontVariant: ['tabular-nums'] }]}>{count}</Text>
    </View>
  );
}

export default function Universidades() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState<TypeFilter>('todas');
  // Solo las columnas de la lista (sin descripciones ni curiosidades): ~40 KB
  // en vez de ~185 KB. La misma caché la reutiliza el comparador.
  const fetcher = useCallback(() => getUniversityList(), []);
  const { rows, loading, error, refreshing, refresh } = useFetch(fetcher, 'universities-list');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows ?? []).filter(u =>
      (type === 'todas' || u.type === type) &&
      (term === '' || `${u.name} ${u.short_name ?? ''} ${u.city} ${u.comunidad_autonoma}`.toLowerCase().includes(term)));
  }, [rows, q, type]);

  // Agrupación por comunidad autónoma, ordenada en español; dentro de cada
  // comunidad, por nombre. Se recalcula solo cuando cambia el filtrado.
  const data = useMemo<Row[]>(() => {
    const groups = new Map<string, UniversityListItem[]>();
    for (const u of filtered) {
      const k = u.comunidad_autonoma || 'Otras';
      const arr = groups.get(k);
      if (arr) arr.push(u); else groups.set(k, [u]);
    }
    const out: Row[] = [];
    for (const k of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
      const list = groups.get(k)!.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      out.push({ kind: 'header', key: `h-${k}`, title: k, count: list.length });
      for (const u of list) out.push({ kind: 'uni', key: u.id, uni: u });
    }
    return out;
  }, [filtered]);

  const open = useCallback((id: string) => router.push(`/uni/${id}`), [router]);
  // Cascada solo en las primeras celdas: FadeIn tope el índice a 12, así que
  // al hacer scroll las siguientes aparecen ya en su sitio.
  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => (
    <FadeIn index={index}>
      {item.kind === 'header'
        ? <GroupHeader title={item.title} count={item.count} />
        : <UniRow uni={item.uni} onPress={open} />}
    </FadeIn>
  ), [open]);

  const header = (
    <View>
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Catálogo</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 6, fontSize: 14, lineHeight: 20 }]}>
            Todas las universidades de España, con sus datos oficiales y las carreras que imparten.
          </Text>
        </View>
      </FadeIn>
      <Card style={{ padding: 0 }}>
        <NavRow icon={GitCompareArrows} title="Comparar dos universidades" note="Lado a lado, con datos oficiales"
          onPress={() => router.push('/comparar-unis')} />
      </Card>
      <SearchBar value={q} onChange={setQ} placeholder="Nombre, siglas, ciudad…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.xs }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
        <Chip label="Todas" active={type === 'todas'} onPress={() => setType('todas')} accessibilityRole="tab" />
        <Chip label="Públicas" active={type === 'publica'} onPress={() => setType('publica')} accessibilityRole="tab" />
        <Chip label="Privadas" active={type === 'privada'} onPress={() => setType('privada')} accessibilityRole="tab" />
      </ScrollView>
      {rows && filtered.length > 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingBottom: S.xs, fontVariant: ['tabular-nums'] }]}>
          {filtered.length === 1 ? '1 universidad' : `${filtered.length} universidades`}
        </Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <Screen title="Universidades" back>
        {header}
        {/* Esqueleto con la forma de la lista: un rótulo de comunidad y sus filas. */}
        <View style={{ paddingTop: S.md }}>
          <Skeleton height={20} radius={R.sm} style={{ width: 160 }} />
          <SkeletonList count={6} height={64} radius={R.md} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen<Row>
      title="Universidades" back refreshing={refreshing} onRefresh={refresh}
      data={data} renderItem={renderItem} keyExtractor={(r) => r.key}
      ListHeaderComponent={header}
      ListEmptyComponent={
        error && (rows ?? []).length === 0
          ? <EmptyState icon={Building2} title="No se pudieron cargar" subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refresh} />
          : <EmptyState icon={Building2} title="Sin resultados" subtitle="Prueba con otras siglas o ciudad." cta={q || type !== 'todas' ? 'Quitar filtros' : undefined} onCta={() => { setQ(''); setType('todas'); }} />
      }
    />
  );
}
