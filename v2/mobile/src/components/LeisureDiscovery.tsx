import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowUpRight, Bookmark, MapPin, Star, Compass } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import CatalogueRefreshNotice from '@/components/CatalogueRefreshNotice';
import { CatalogueHero, CatalogueToolbar, CatalogueResults, CatalogueFilterSheet } from '@/components/CatalogueUI';
import { Btn, EmptyState, SkeletonList } from '@/components/ui';
import type { LeisureSpotPreview } from '@/lib/api';
import { listLeisureSpotsPage, getLeisureCitiesCached, resolveMyLeisureCity, foldText as fold } from '@/lib/leisure-pages';
import { useLeisurePages } from '@/lib/useLeisurePages';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { typeLabel } from '@/lib/format';
import { C, S, F, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';
const categories = ['', 'cafeteria', 'restaurante', 'parque', 'cultural', 'bar', 'pub', 'discoteca', 'deportivo', 'coworking'];
const labels: Record<string, string> = { '': 'Todo tipo de planes', cafeteria: 'Café y charla', restaurante: 'Comer juntos', parque: 'Al aire libre', discoteca: 'Salir de noche', coworking: 'Estudiar fuera' };
const categoryLabel = (value: string) => labels[value] ?? typeLabel[value] ?? value;
const defaults = { city: '', category: '', free: '' };
const keyExtractor = (s: LeisureSpotPreview) => s.id;
const PlaceCard = React.memo(function PlaceCard({ item, width }: { item: LeisureSpotPreview; width: number }) {
  const router = useRouter();
  return <Pressable onPress={() => router.push(`/ocio/${item.id}`)} accessibilityRole="button" accessibilityLabel={`Descubrir ${item.name}, ${item.city}`}
    style={({ pressed }) => ({ width, marginLeft: 16, marginBottom: 16, borderRadius: 19, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: 'hidden', opacity: pressed ? 0.85 : 1 })}>
    <View style={{ height: width > 300 ? 190 : 136, backgroundColor: C.accentSoft }}>
      {item.image_url ? <Image source={{ uri: item.image_url }} recyclingKey={item.id} contentFit="cover" cachePolicy="memory-disk" style={{ width: '100%', height: '100%' }} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}><Compass size={34} color={C.blue} strokeWidth={1.4} /></View></View>}
      {item.price_range === 0 ? <View style={{ position: 'absolute', left: 10, top: 10, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.surface }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.text, fontFamily: FONT.semibold }]}>Gratis</Text></View> : null}
    </View>
    <View style={{ padding: 13, gap: 7, flex: 1 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blueDeep }]}>{categoryLabel(item.category)}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 17, lineHeight: 21 }]} numberOfLines={3}>{item.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><MapPin size={12} color={C.muted} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>{item.city}</Text></View>
      {item.tagline ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={2}>{item.tagline}</Text> : null}
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: 10, marginTop: 3 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flexGrow: 1, color: C.text }]}>{item.price_range == null ? 'Consultar precio' : ['Gratis', '€', '€€', '€€€', '€€€€'][item.price_range] ?? 'Consultar precio'}</Text>
        {!!item.rating && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Star size={12} color={C.blueDeep} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{Number(item.rating).toFixed(1)}</Text></View>}
        <ArrowUpRight size={16} color={C.blueDeep} />
      </View>
      {item.owner_id ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontSize: 10.5 }]}>Publicidad · Local colaborador</Text> : null}
    </View>
  </Pressable>;
});
export default function LeisureDiscovery() {
  const { uid } = useSessionIdentity();
  return <OwnedDiscovery key={uid ?? 'public'} />;
}
function OwnedDiscovery() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.3 || width < 360 ? 1 : width >= 760 ? 3 : 2;
  const cardWidth = (width - 16 * (columns + 1)) / columns;
  const [city, setCity] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [free, setFree] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // La búsqueda va al servidor: se espera a que el usuario deje de teclear.
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);
  // Primero la ciudad del perfil (una fila, sin esperar a la lista de ciudades)
  // y, en paralelo y por detrás, la lista de ciudades solo para el filtro.
  useEffect(() => {
    let alive = true;
    resolveMyLeisureCity().then(mine => { if (alive) setCity(c => c ?? mine); }).catch(() => { if (alive) setCity(c => c ?? ''); });
    getLeisureCitiesCached().then(list => { if (alive) setCities(list); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Una página de 30 con los filtros resueltos en el servidor y la siguiente al
  // acercarse al final. Antes se descargaba el catálogo entero (~4.600 sitios).
  // Catalogue results never consult the old swipe/discard history.
  const fetchPage = useCallback((page: number) => listLeisureSpotsPage({ city: city ?? '', category, free, query: search }, page), [city, category, free, search]);
  const { rows, total, hasMore, loading, loadingMore, loadMore, error, refreshError, refreshing, refresh } =
    useLeisurePages(fetchPage, city === null ? undefined : `spots-discovery:${city}|${category}|${free ? 1 : 0}|${fold(search)}`);
  // Mientras llega la búsqueda nueva, lo ya cargado se afina con el texto actual.
  const filtered = (rows ?? []).filter(s => !query || fold(`${s.name} ${s.city} ${s.tagline ?? ''}`).includes(fold(query)));
  const resultCount = query === search && total != null ? total : filtered.length;
  const remaining = total != null ? Math.max(0, total - (rows?.length ?? 0)) : 0;
  const renderItem = useCallback(({ item }: { item: LeisureSpotPreview }) => <PlaceCard item={item} width={cardWidth} />, [cardWidth]);
  const clear = () => { setCategory(''); setQuery(''); setFree(false); setCity(''); };
  const count = Number(!!city) + Number(!!category) + Number(free);
  return <><Screen<LeisureSpotPreview> key={columns} numColumns={columns} title="Ocio" back data={filtered} keyExtractor={keyExtractor} refreshing={refreshing} onRefresh={refresh}
    right={<Pressable accessibilityRole="button" accessibilityLabel="Ver sitios guardados" onPress={() => router.push('/favoritos')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Bookmark size={22} color={C.text} strokeWidth={1.9} /></Pressable>}
    ListHeaderComponent={<>
      <CatalogueRefreshNotice visible={refreshError} refreshing={refreshing} onRefresh={refresh} />
      <CatalogueHero eyebrow="Fuera de clase" title="Un sitio para cada plan." description="Un café, una tarde fuera o una noche con tu gente. Elige qué te apetece y descubre dónde." icon={Compass} />
      <CatalogueToolbar query={query} onQuery={setQuery} placeholder="Busca un sitio o un plan" count={count} onFilters={() => setFiltersOpen(true)} onClear={clear} chips={[city || 'Toda España', ...(category ? [categoryLabel(category)] : []), ...(free ? ['Gratis'] : [])]} />
      <CatalogueResults count={resultCount} noun="sitios para descubrir" note="Los locales colaboradores se identifican como publicidad y aparecen primero." />
    </>}
    ListEmptyComponent={loading || city === null || (query !== search && !filtered.length) ? <SkeletonList count={2} height={240} /> : error ? <EmptyState icon={MapPin} title="No pudimos cargar los sitios" subtitle="Comprueba tu conexión." cta="Reintentar" onCta={refresh} /> : <EmptyState icon={MapPin} title="Prueba otro plan" subtitle="Amplía la zona o cambia los filtros." cta="Limpiar filtros" onCta={clear} />}
    onEndReachedThreshold={0.6}
    onEndReached={() => { if (hasMore) void loadMore(); }}
    ListFooterComponent={hasMore && filtered.length ? <View style={{ padding: S.lg, alignItems: 'center' }}><Btn variant="link" busy={loadingMore} label={remaining ? `Ver más sitios (${remaining.toLocaleString('es-ES')})` : 'Ver más sitios'} onPress={() => void loadMore()} /></View> : null}
    renderItem={renderItem} />
    {filtersOpen ? <CatalogueFilterSheet values={{ city: city ?? '', category, free: free ? 'yes' : '' }} defaults={defaults} onClose={() => setFiltersOpen(false)}
      onApply={draft => { setCity(draft.city); setCategory(draft.category); setFree(draft.free === 'yes'); }}
      sections={() => [
        { key: 'city', label: 'Ciudad', options: [{ value: '', label: 'Toda España' }, ...cities.map(c => ({ value: c, label: c }))] },
        { key: 'category', label: 'Tipo de plan', options: categories.map(c => ({ value: c, label: categoryLabel(c) })) },
        { key: 'free', label: 'Precio', options: [{ value: '', label: 'Cualquier precio' }, { value: 'yes', label: 'Solo sitios gratis' }] },
      ]} /> : null}
  </>;
}
