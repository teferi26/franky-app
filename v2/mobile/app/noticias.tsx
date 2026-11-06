// ─── Noticias de Franky ──────────────────────────────────────────────────
// Lista editorial (tabla news) con paridad con web/src/app/noticias: portada,
// categoría, fecha, título y entradilla. Tocar una lleva a /noticia/[slug].
import React, { memo, useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Newspaper, Star } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, Pill, Chip, EmptyState, SkeletonList, SearchBar, Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { listNewsPage, categoryLabel, NEWS_CATEGORY_LABEL, type NewsItem } from '@/lib/news';
import { useServerPages, useDebouncedValue } from '@/lib/useServerPages';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const NEWS_CATEGORIES = Object.keys(NEWS_CATEGORY_LABEL);

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// Tarjeta memoizada: la lista se repinta al refrescar y cada tarjeta lleva
// una portada; sin memo se vuelven a montar todas.
// Portada de la seccion: la primera noticia se pinta grande, como en un
// periodico. Foto en marco redondeado, nunca a sangre.
const NewsLead = memo(function NewsLead({ item, onPress }: { item: NewsItem; onPress: () => void }) {
  const cat = categoryLabel(item.category);
  return (
    <Tap onPress={onPress} accessibilityLabel={item.title} accessibilityHint="Abre la noticia"
      style={{ marginHorizontal: S.lg, marginBottom: S.xl }}>
      <View style={{ gap: 12 }}>
        <View style={{ height: 210, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} recyclingKey={item.id}
              contentFit="cover" cachePolicy="memory-disk" transition={150} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Newspaper size={40} color={C.border} strokeWidth={1.3} />
            </View>
          )}
          {item.is_featured ? (
            <View style={{ position: 'absolute', top: 10, left: 10 }}>
              <Pill label="Destacado" tone="orange" icon={Star} />
            </View>
          ) : null}
        </View>
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{fecha(item.created_at)}</Text>
            {cat ? <Pill label={cat} tone="blue" /> : null}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.7, color: C.text }} numberOfLines={3}>{item.title}</Text>
          {item.excerpt ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, lineHeight: 22 }]} numberOfLines={3}>{item.excerpt}</Text> : null}
        </View>
      </View>
    </Tap>
  );
});

// Resto del listado: fila densa con la miniatura a la derecha, en marco.
const NewsRow = memo(function NewsRow({ item, onPress }: { item: NewsItem; onPress: () => void }) {
  const cat = categoryLabel(item.category);
  return (
    <Tap onPress={onPress} accessibilityLabel={item.title} accessibilityHint="Abre la noticia">
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: S.lg, paddingVertical: 14, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>
            {[fecha(item.created_at), cat].filter(Boolean).join(' · ')}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 17, lineHeight: 22, letterSpacing: -0.3 }]} numberOfLines={3}>{item.title}</Text>
          {item.excerpt ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={2}>{item.excerpt}</Text> : null}
        </View>
        <View style={{ width: 88, height: 88, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} recyclingKey={item.id}
              contentFit="cover" cachePolicy="memory-disk" transition={150} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Newspaper size={22} color={C.border} strokeWidth={1.4} />
            </View>
          )}
        </View>
      </View>
    </Tap>
  );
});

export default function Noticias() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  // Búsqueda y categoría se resuelven en el servidor, por páginas de 20: la
  // lista ya no descarga todas las noticias para filtrarlas en el móvil.
  const search = useDebouncedValue(query.trim(), 300);
  const fetchPage = useCallback((offset: number, limit: number) =>
    listNewsPage({ offset, limit, category: category || null, search }), [category, search]);
  const { rows, error, loading, refreshing, loadingMore, loadMore, refresh, reload } =
    useServerPages<NewsItem>(fetchPage, `${category}|${search}`, 20);
  const items = rows ?? [];
  const failed = !!error && items.length === 0;
  const filtering = !!category || !!search;
  const onRefresh = useCallback(() => { void refresh(); }, [refresh]);

  // Cabecera del catálogo: mismo patrón que universidades, becas y notas de
  // corte (rótulo, entradilla, buscador del kit y chips). Se pinta también
  // mientras carga, para que la pantalla no salte al llegar los datos.
  const header = (
    <FadeIn>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Novedades</Text>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 26, letterSpacing: -0.9, lineHeight: 30, marginTop: 6 }]}>
          Que no se te pase
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 6, fontSize: 14, lineHeight: 20 }]}>Becas, oportunidades, planes y todo lo que cambia en Franky.</Text>
      </View>
      <SearchBar value={query} onChange={setQuery} placeholder="Buscar una novedad…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: S.lg }}>
        <Chip label="Todo" active={!category} accessibilityRole="tab" onPress={() => setCategory('')} />
        {NEWS_CATEGORIES.map(c => <Chip key={c} label={categoryLabel(c) ?? c} active={category === c} accessibilityRole="tab" onPress={() => setCategory(c)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.md }}>
        <Btn variant="link" small label="Gestionar mis avisos" onPress={() => router.push('/ajustes-notificaciones')} />
      </View>
    </FadeIn>
  );

  // Una sola variante de lista en todos los estados: si la pantalla cambiara
  // de ScrollView a FlatList al llegar los datos, el buscador se desmontaría y
  // el teclado se cerraría a cada búsqueda.
  const empty = loading ? (
    <SkeletonList count={3} height={260} radius={R.lg} />
  ) : failed ? (
    <EmptyState icon={Newspaper} title="No se pudieron cargar"
      subtitle="Revisa tu conexión e inténtalo de nuevo."
      cta="Reintentar" onCta={() => { void reload(); }} />
  ) : (
    <EmptyState icon={Newspaper} title={filtering ? "No hay coincidencias" : "La próxima novedad aparecerá aquí"}
      subtitle={filtering ? "Prueba otra búsqueda o cambia de tema." : "En cuanto publiquemos algo lo verás aquí."} compact />
  );

  return (
    <Screen<NewsItem>
      title="Novedades" back
      data={items}
      keyExtractor={(n) => n.id}
      onRefresh={onRefresh} refreshing={refreshing}
      ListHeaderComponent={header}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loadingMore ? <SkeletonList count={1} height={110} radius={R.lg} /> : null}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => {
        const open = () => router.push({ pathname: '/noticia/[slug]', params: { slug: item.slug } });
        // La primera abre la seccion en grande; el resto va en lista densa.
        return (
          <FadeIn index={index}>
            {index === 0
              ? <NewsLead item={item} onPress={open} />
              : <NewsRow item={item} onPress={open} />}
          </FadeIn>
        );
      }}
    />
  );
}
