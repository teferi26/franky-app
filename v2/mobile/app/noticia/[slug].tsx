// ─── Ficha de una noticia ────────────────────────────────────────────────
// Paridad con web/src/app/noticias/[slug]: portada, fecha, categoría, título,
// cuerpo, etiquetas, autor y tres noticias más. El cuerpo llega en markdown
// (o HTML antiguo) y se pinta con Text nativos a partir de los bloques de
// src/lib/news.ts: títulos, párrafos, negritas y listas.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Newspaper, Tag, Share2, ChevronRight } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, Pill, EmptyState, Skeleton, SectionHeader } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import {
  getNewsBySlug, listRelatedNews, parseContent, categoryLabel,
  type NewsArticle, type NewsItem, type ContentBlock, type InlineRun,
} from '@/lib/news';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} key={i} style={r.bold ? { fontFamily: FONT.semibold } : undefined}>{r.text}</Text>
      ))}
    </>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (block.type === 'heading') {
    const size = block.level === 1 ? 23 : block.level === 2 ? 20 : 17;
    return (
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: size, letterSpacing: -0.4, marginTop: 20, marginBottom: 6 }]}>
        <Runs runs={block.runs} />
      </Text>
    );
  }
  if (block.type === 'list') {
    return (
      <View style={{ gap: 6, marginVertical: 4 }}>
        {block.items.map((runs, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.blue, fontFamily: FONT.semibold, minWidth: 16 }]}>
              {block.ordered ? `${i + 1}.` : '•'}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, fontSize: 16.5, lineHeight: 26 }]}><Runs runs={runs} /></Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontSize: 16.5, lineHeight: 27, marginBottom: 10 }]}><Runs runs={block.runs} /></Text>
  );
}

export default function Noticia() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const key = String(slug ?? '');

  const [article, setArticle] = useState<NewsArticle | null>(null);
  const [related, setRelated] = useState<NewsItem[]>([]);
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = useCallback(async () => {
    setFailed(false); setNotFound(false);
    try {
      const a = await getNewsBySlug(key);
      if (!alive.current) return;
      if (!a) { setNotFound(true); return; }
      setArticle(a);
      setBlocks(parseContent(a.content));
      // Relacionadas: fail-soft, la ficha se lee igual sin ellas.
      try {
        const r = await listRelatedNews(a.id, 3);
        if (alive.current) setRelated(r);
      } catch { /* sin relacionadas */ }
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, [key]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const share = useCallback(async () => {
    if (!article) return;
    const url = `https://franky.es/noticias/${article.slug}`;
    try {
      await Share.share({ message: `${article.title}\n${url}`, url });
    } catch { /* cancelado o sin hoja de compartir */ }
  }, [article]);

  if (loading) {
    return (
      <Screen title="Noticia" back>
        {/* Esqueleto con la forma real: portada, titular, entradilla y cuerpo. */}
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }} style={{ paddingTop: S.lg }}>
          <Skeleton height={200} radius={R.lg} />
          <Skeleton height={26} radius={R.sm} style={{ width: '80%' }} />
          <Skeleton height={16} radius={R.sm} style={{ width: '55%' }} />
          <Skeleton height={180} radius={R.md} />
        </View>
      </Screen>
    );
  }

  if (failed || notFound || !article) {
    return (
      <Screen title="Noticia" back>
        <EmptyState icon={Newspaper}
          title={notFound ? 'Noticia no encontrada' : 'No se pudo cargar'}
          subtitle={notFound ? 'Puede que se haya retirado o que el enlace esté mal.' : 'Revisa tu conexión e inténtalo de nuevo.'}
          cta={notFound ? 'Ver todas las noticias' : 'Reintentar'}
          onCta={notFound ? () => router.replace('/noticias') : () => { setLoading(true); load(); }} />
      </Screen>
    );
  }

  const cat = categoryLabel(article.category);

  return (
    <Screen
      title="Noticia" back onRefresh={onRefresh} refreshing={refreshing}
      right={
        <Tap onPress={share} haptic accessibilityLabel="Compartir noticia" hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Share2 size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
      }>
      {/* Primero el titular, despues la foto: se lee como un articulo, no
          como una tarjeta con la imagen mandando. */}
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{fecha(article.created_at)}</Text>
            {cat ? <Pill label={cat} tone="blue" /> : null}
          </View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 29, lineHeight: 35, letterSpacing: -0.9 }]}>{article.title}</Text>
          {article.excerpt ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, fontSize: 16.5, lineHeight: 25 }]}>{article.excerpt}</Text>
          ) : null}
        </View>
      </FadeIn>

      {article.image_url ? (
        <FadeIn index={1}>
          <View style={{ marginHorizontal: S.lg, marginTop: S.lg, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }}>
            <Image source={{ uri: article.image_url }} style={{ width: '100%', aspectRatio: 16 / 9 }}
              contentFit="cover" cachePolicy="memory-disk" transition={150}
              accessibilityLabel={article.title} />
          </View>
        </FadeIn>
      ) : null}

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 10 }}>
        <View style={{ marginTop: 6 }}>
          {blocks.length ? blocks.map((b, i) => <Block key={i} block={b} />) : (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Esta noticia no tiene más contenido.</Text>
          )}
        </View>

        {article.tags && article.tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: C.border }}>
            {article.tags.map((t) => <Pill key={t} label={t} tone="blue" icon={Tag} />)}
          </View>
        ) : null}

        {article.author_name ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 8 }]}>
            Por <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{article.author_name}</Text>
          </Text>
        ) : null}
      </View>

      {related.length ? (
        <View style={{ marginTop: S.xl, paddingTop: S.lg, borderTopWidth: 0.5, borderTopColor: C.border }}>
          <SectionHeader title="Más noticias" />
          {related.map((r) => (
            <Tap key={r.id} accessibilityLabel={r.title} accessibilityHint="Abre la noticia"
              onPress={() => router.push({ pathname: '/noticia/[slug]', params: { slug: r.slug } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 64 }}>
                <View style={{ width: 72, height: 54, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                  {r.image_url ? (
                    <Image source={{ uri: r.image_url }} style={{ width: '100%', height: '100%' }} recyclingKey={r.id} contentFit="cover" cachePolicy="memory-disk" />
                  ) : <Newspaper size={20} color={C.muted} strokeWidth={1.6} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{new Date(r.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={2}>{r.title}</Text>
                </View>
                <ChevronRight size={18} color={C.muted} strokeWidth={2} />
              </View>
            </Tap>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
