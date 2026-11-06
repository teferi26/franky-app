// ─── Mercado de estudiantes: compra-venta y tablón busco/ofrezco (84 y 86) ──
// Una sola pantalla con el filtro por `kind` tal y como está pensada la tabla
// (migración 137, aún no aplicada en prod: getStudentListings es fail-soft y
// aquí simplemente se ve una lista vacía mientras tanto, sin petar nada).
//
// Diseño: tarjetas elevadas con foto grande a la izquierda, precio en la
// tipografía de cifras (Outfit display) como dato clave, píldora de tipo y
// categoría, chips de filtro con icono, esqueleto/vacío/error del kit.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  Plus, ShoppingBag, WifiOff, Tag, Search, HandHelping, BookOpen, Sofa, Bike, GraduationCap, Home, Package, MapPin,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Tap, Chip, SearchBar, EmptyState, Avatar, Pill, SkeletonList, Card } from '@/components/ui';
import {
  getStudentListings, KINDS, CATEGORIES, kindLabel, categoryLabel, STUDENT_LISTINGS_PAGE_SIZE,
  type StudentListing, type ListingKind, type ListingCategory,
} from '@/lib/market';
import { eur, timeAgo } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

type KindFilter = ListingKind | 'todo';
type CategoryFilter = ListingCategory | 'todas';

// Iconos por tipo y categoría: se reconocen de un vistazo en chips y tarjetas.
const KIND_ICON: Record<ListingKind, LucideIcon> = { venta: Tag, busco: Search, ofrezco: HandHelping };
const CATEGORY_ICON: Record<ListingCategory, LucideIcon> = {
  libros: BookOpen, muebles: Sofa, transporte: Bike, clases: GraduationCap, vivienda: Home, otros: Package,
};

// keyExtractor a nivel de módulo: referencia estable entre renders.
const keyOf = (item: StudentListing) => item.id;

// Tarjeta memoizada: al paginar o filtrar solo se pintan las nuevas.
const ListingCard = React.memo(function ListingCard({ item, onPress, index = 0 }: {
  item: StudentListing; onPress: (id: string) => void; index?: number;
}) {
  const KindIcon = KIND_ICON[item.kind] ?? Tag;
  const CatIcon = CATEGORY_ICON[item.category as ListingCategory] ?? Package;
  const price = item.price_cents != null ? eur(item.price_cents / 100) : null;
  return (
    <FadeIn index={index} distance={12}>
    <Card onPress={() => onPress(item.id)} style={{ padding: 12 }}
      accessibilityLabel={`${kindLabel(item.kind)}: ${item.title}${price ? `, ${price}` : ''}, ${categoryLabel(item.category)}, de ${item.author_name ?? 'estudiante'}`}
      accessibilityHint="Abre el anuncio">
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} recyclingKey={item.id}
            style={{ width: 96, height: 96, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border }}
            contentFit="cover" cachePolicy="memory-disk" transition={120} />
        ) : (
          <View style={{ width: 96, height: 96, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <CatIcon size={30} color={C.muted} strokeWidth={1.4} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={kindLabel(item.kind)} tone={item.kind === 'venta' ? 'blue' : item.kind === 'busco' ? 'orange' : 'green'} icon={KindIcon} />
              <Pill label={categoryLabel(item.category)} icon={CatIcon} />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 16 }]} numberOfLines={2}>{item.title}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <Avatar name={item.author_name} uri={item.author_avatar} size={18} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flexShrink: 1 }]} numberOfLines={1}>
                {item.author_name ?? 'Estudiante'} · {timeAgo(item.created_at)}
              </Text>
            </View>
            {price ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 20, fontFamily: FONT.display, color: C.text, letterSpacing: -0.7, fontVariant: ['tabular-nums'] }}>
                {price}
              </Text>
            ) : item.city ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <MapPin size={12} color={C.muted} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{item.city}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
    </FadeIn>
  );
});

export default function Mercado() {
  const router = useRouter();
  const [kind, setKind] = useState<KindFilter>('todo');
  const [category, setCategory] = useState<CategoryFilter>('todas');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<StudentListing[]>([]);
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
      const page = await getStudentListings({
        kind: kind === 'todo' ? null : kind,
        category: category === 'todas' ? null : category,
        offset: 0,
      });
      setRows(page.rows); setLoadError(!page.ok);
      offsetRef.current = page.rows.length;
      setHasMore(page.rows.length === STUDENT_LISTINGS_PAGE_SIZE);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [kind, category]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getStudentListings({
        kind: kind === 'todo' ? null : kind,
        category: category === 'todas' ? null : category,
        offset: offsetRef.current,
      });
      setRows(prev => [...prev, ...page.rows]);
      offsetRef.current += page.rows.length;
      setHasMore(page.rows.length === STUDENT_LISTINGS_PAGE_SIZE);
    } catch {
      // Sin red al paginar: se reintenta al volver a llegar al final.
    } finally {
      setLoadingMore(false);
    }
  }, [kind, category, loading, loadingMore, refreshing, hasMore]);

  const onRefresh = useCallback(() => { setRefreshing(true); reload(); }, [reload]);

  // Búsqueda en cliente: solo sobre lo ya cargado, tal y como pide el diseño.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(l =>
      l.title.toLowerCase().includes(q) || (l.body ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  const open = useCallback((id: string) => router.push(`/mercado/${id}`), [router]);
  const renderItem = useCallback(({ item, index }: { item: StudentListing; index: number }) => (
    <ListingCard item={item} index={index} onPress={open} />
  ), [open]);

  const filtering = kind !== 'todo' || category !== 'todas';

  const listHeader = (
    <View style={{ paddingTop: S.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 8 }}
        accessibilityRole="tablist">
        <Chip label="Todo" accessibilityRole="tab" active={kind === 'todo'} onPress={() => setKind('todo')} />
        {KINDS.map(k => (
          <Chip key={k.value} label={k.label} icon={KIND_ICON[k.value]} accessibilityRole="tab" active={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 10 }}
        accessibilityRole="tablist">
        <Chip label="Todas" accessibilityRole="tab" active={category === 'todas'} onPress={() => setCategory('todas')} />
        {CATEGORIES.map(c => (
          <Chip key={c.value} label={c.label} icon={CATEGORY_ICON[c.value]} accessibilityRole="tab" active={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </ScrollView>
      <SearchBar value={query} onChange={setQuery} placeholder="Buscar en el mercado del campus" />
    </View>
  );

  return (
    <Screen<StudentListing>
      title="Mercado"
      subtitle="Compra, vende y pide entre estudiantes"
      back
      right={
        <Tap onPress={() => router.push('/crear-anuncio')} accessibilityLabel="Publicar anuncio"
          accessibilityHint="Abre el formulario para publicar un anuncio nuevo" hitSlop={12}
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
          <SkeletonList count={4} height={120} radius={R.lg} />
        ) : loadError ? (
          <EmptyState icon={WifiOff} title="No se pudo cargar"
            subtitle="Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={reload} />
        ) : query.trim() ? (
          <EmptyState compact icon={ShoppingBag} title="Nada con ese texto"
            subtitle="Prueba con otra palabra o cambia los filtros."
            cta="Limpiar búsqueda" onCta={() => setQuery('')} />
        ) : filtering ? (
          <EmptyState compact icon={ShoppingBag} title="Nada con estos filtros"
            subtitle="Quita algún filtro o publica tú el primer anuncio."
            cta="Ver todo" onCta={() => { setKind('todo'); setCategory('todas'); }} />
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No hay anuncios todavía"
            subtitle="Sé quien estrene el mercado de tu campus: libros, muebles, clases, piso temporal."
            cta="Publicar anuncio"
            onCta={() => router.push('/crear-anuncio')}
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
