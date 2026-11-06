import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView, useWindowDimensions, LayoutAnimation } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  Bookmark, Heart, Lock, Trash2, Home as HomeIcon, MapPin, Ticket,
  GraduationCap, Building2, Award, WifiOff, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Chip, Tap, EmptyState, Skeleton, Btn, Pill } from '@/components/ui';
import { GridTile } from '@/components/GridTile';
import { FadeIn } from '@/components/motion';
import { getFavs, getCachedFavs, removeFav, FavItem, FavType } from '@/lib/favs';
import {
  getSavedFomoThreads, getLikedFomoThreads, unsaveFomoThread, type SavedFomoThread,
} from '@/lib/api';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, F, S, R } from '@/theme';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';

// ─── Guardado: TODO lo que has guardado, en una sola pantalla ───────────────
// Publicaciones y Me gusta son PRIVADOS (solo los ve su dueño) y viven en la
// BD. El catálogo guardado (pisos, ocio, eventos, carreras, unis y becas)
// también vive en la BD desde septiembre de 2026: antes se leía solo de
// AsyncStorage y lo guardado desde la web (o las becas, que la propia app ya
// escribía en la tabla) no aparecía aquí. Ahora src/lib/favs.ts lee
// `favorites` y usa AsyncStorage solo como caché: se pinta al instante lo
// último conocido y, si la red falla, se enseña eso con un aviso y un
// "Reintentar" en vez de una lista vacía mentirosa.
//
// Toda la pantalla es UN FlatList (variante virtualizada de Screen): lista de
// filas para el catálogo y rejilla de 3 para las publicaciones. Cambiar de
// numColumns en caliente no está soportado por FlatList, así que la clave del
// Screen cambia entre "lista" y "rejilla" y se remonta.

const ICONS: Record<FavType, LucideIcon> = {
  accommodation: HomeIcon, leisure_spot: MapPin, event: Ticket,
  career: GraduationCap, university: Building2, scholarship: Award,
};
const LABELS: Record<FavType, string> = {
  accommodation: 'Pisos', leisure_spot: 'Ocio', event: 'Eventos',
  career: 'Carreras', university: 'Unis', scholarship: 'Becas',
};
// Ruta de detalle por tipo. Todas tienen pantalla propia en la app.
const ROUTES: Record<FavType, (id: string) => string> = {
  accommodation: (id) => `/piso/${id}`,
  event: (id) => `/evento/${id}`,
  leisure_spot: (id) => `/ocio/${id}`,
  career: (id) => `/carrera/${id}`,
  university: (id) => `/uni/${id}`,
  scholarship: (id) => `/beca/${id}`,
};

// 'posts' = publicaciones guardadas, 'liked' = a las que has reaccionado.
type Filter = 'todos' | FavType | 'posts' | 'liked';
const FILTERS: { key: Filter; label: string; icon?: LucideIcon }[] = [
  { key: 'todos', label: 'Todo' },
  { key: 'posts', label: 'Publicaciones', icon: Bookmark },
  { key: 'liked', label: 'Me gusta', icon: Heart },
  { key: 'accommodation', label: LABELS.accommodation, icon: ICONS.accommodation },
  { key: 'leisure_spot', label: LABELS.leisure_spot, icon: ICONS.leisure_spot },
  { key: 'event', label: LABELS.event, icon: ICONS.event },
  { key: 'career', label: LABELS.career, icon: ICONS.career },
  { key: 'university', label: LABELS.university, icon: ICONS.university },
  { key: 'scholarship', label: LABELS.scholarship, icon: ICONS.scholarship },
];

// Texto del estado vacío según el filtro, con un destino donde ir a guardar.
const EMPTY: Record<FavType, { title: string; subtitle: string; cta: string; route: string }> = {
  accommodation: { title: 'Ningún piso guardado', subtitle: 'Guarda los pisos que te interesen para consultarlos y contactar cuando decidas.', cta: 'Ver pisos', route: '/pisos' },
  leisure_spot: { title: 'Ningún sitio guardado', subtitle: 'Guarda los lugares que quieras visitar desde su ficha.', cta: 'Ver ocio', route: '/ocio' },
  event: { title: 'Ningún evento guardado', subtitle: 'Guarda eventos para tenerlos a mano antes de que se llenen.', cta: 'Ver eventos', route: '/(tabs)/eventos' },
  career: { title: 'Ninguna carrera guardada', subtitle: 'Guarda carreras para comparar notas de corte cuando quieras.', cta: 'Ver carreras', route: '/notas-corte' },
  university: { title: 'Ninguna uni guardada', subtitle: 'Guarda universidades para seguir su FOMO y comparar.', cta: 'Ver universidades', route: '/universidades' },
  scholarship: { title: 'Ninguna beca guardada', subtitle: 'Guarda becas para consultar sus requisitos y fechas de solicitud.', cta: 'Ver becas', route: '/becas' },
};

// Fila del catálogo guardado (piso, evento, beca...). En memo: quitar uno o
// cambiar de filtro no repinta las demás.
const FavRow = React.memo(function FavRow({ f, showType, onOpen, onRemove, removing }: {
  f: FavItem; showType: boolean; removing: boolean; onOpen: (f: FavItem) => void; onRemove: (f: FavItem) => void;
}) {
  const Icon = ICONS[f.type];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 80, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
      <Tap onPress={() => onOpen(f)} style={{ flex: 1 }} accessibilityLabel={`${LABELS[f.type]}: ${f.title}`} accessibilityHint="Abre el detalle">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {f.image ? <Image source={{ uri: f.image }} recyclingKey={`${f.type}-${f.id}`}
            style={{ width: 58, height: 58, borderRadius: R.md, backgroundColor: C.input }}
            contentFit="cover" cachePolicy="memory-disk" transition={120} /> :
            <View style={{ width: 58, height: 58, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={22} color={C.blue} strokeWidth={1.75} />
            </View>}
          <View style={{ flex: 1, gap: 3 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{f.title}</Text>
            {f.subtitle ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={2}>{f.subtitle}</Text> : null}
            {showType ? <View style={{ flexDirection: 'row', marginTop: 2 }}><Pill label={LABELS[f.type]} icon={Icon} /></View> : null}
          </View>
        </View>
      </Tap>
      <Tap disabled={removing} accessibilityState={{ busy: removing }} onPress={() => onRemove(f)} accessibilityLabel={`Quitar ${f.title} de guardados`} hitSlop={4}>
        <View style={{ width: 44, height: 44, opacity: removing ? 0.5 : 1, alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={18} color={C.muted} strokeWidth={1.75} />
        </View>
      </Tap>
    </View>
  );
});

// Celda de la rejilla de publicaciones: tocar abre el hilo, mantener pulsado
// (solo en Guardadas) lo quita de guardados.
const PostCell = React.memo(function PostCell({ p, tile, onOpen, onUnsave }: {
  p: SavedFomoThread; tile: number; onOpen: (id: string) => void; onUnsave?: (id: string) => void;
}) {
  return (
    <Tap onPress={() => onOpen(p.id)} onLongPress={onUnsave ? () => onUnsave(p.id) : undefined}
      accessibilityLabel={p.body ? `Publicación: ${p.body}` : 'Publicación'}
      accessibilityHint={onUnsave ? 'Mantén pulsado para quitarla de guardados' : undefined}
      style={{ marginRight: 2, marginBottom: 2 }}>
      <GridTile uri={p.media_url} body={p.body} tile={tile} isVideo={p.media_type === 'video'} isAnon={p.is_anonymous} />
    </Tap>
  );
});

type Row = FavItem | SavedFomoThread;

export default function Favoritos() {
  const owner = useSessionOwner();
  const router = useRouter();
  if (!owner) return <Screen title="Guardado" back><EmptyState icon={Lock}
    title="Tus guardados, en tu cuenta" subtitle="Inicia sesión para consultar tus favoritos y publicaciones."
    cta="Iniciar sesión" onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedFavorites key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedFavorites({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { width } = useWindowDimensions();
  // ?tab=liked sigue funcionando: era el parámetro de la antigua /guardados y
  // lo usaban los enlaces del menú del perfil.
  const params = useLocalSearchParams<{ tab?: string }>();
  // null = aún no hay nada que pintar (ni caché); [] = lista vacía real.
  const [favs, setFavs] = useState<FavItem[] | null>(null);
  const [favsError, setFavsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Publicaciones del feed guardadas y con me gusta (viven en la BD). Carga
  // perezosa: solo se piden al abrir su filtro.
  const [posts, setPosts] = useState<SavedFomoThread[] | null>(null);
  const [liked, setLiked] = useState<SavedFomoThread[] | null>(null);
  const [filter, setFilter] = useState<Filter>(params.tab === 'liked' ? 'liked' : 'todos');
  const [postsError, setPostsError] = useState(false);
  const [likedError, setLikedError] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const alive = useRef(true);
  const versions = useRef({ favs: 0, posts: 0, liked: 0, refresh: 0 });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = useCallback(() => alive.current && isCurrentSessionIdentity(owner), [owner]);

  const tile = Math.floor((width - 4) / 3);

  const loadFavs = useCallback(async () => {
    if (!active()) return;
    const version = ++versions.current.favs;
    setFavsError(false);
    try {
      const items = await getFavs(owner);
      if (active() && version === versions.current.favs) setFavs(items);
    } catch {
      if (active() && version === versions.current.favs) { setFavsError(true); setFavs(prev => prev ?? []); }
    }
  }, [active, owner]);
  const loadPosts = useCallback(async () => {
    if (!active()) return;
    const version = ++versions.current.posts;
    setPostsError(false);
    try {
      const items = await getSavedFomoThreads(owner);
      if (active() && version === versions.current.posts) setPosts(items);
    } catch {
      if (active() && version === versions.current.posts) { setPostsError(true); setPosts(prev => prev ?? []); }
    }
  }, [active, owner]);
  const loadLiked = useCallback(async () => {
    if (!active()) return;
    const version = ++versions.current.liked;
    setLikedError(false);
    try {
      const items = await getLikedFomoThreads(owner);
      if (active() && version === versions.current.liked) setLiked(items);
    } catch {
      if (active() && version === versions.current.liked) { setLikedError(true); setLiked(prev => prev ?? []); }
    }
  }, [active, owner]);
  useEffect(() => {
    getCachedFavs(owner).then(cached => {
      if (active() && cached.length > 0) setFavs(prev => prev ?? cached);
    }).catch(() => {});
    void loadFavs();
  }, [active, owner, loadFavs]);
  useEffect(() => {
    if (filter === 'posts' && posts === null) void loadPosts();
    if (filter === 'liked' && liked === null) void loadLiked();
  }, [filter, posts, liked, loadPosts, loadLiked]);
  const onRefresh = useCallback(async () => {
    if (!active()) return;
    const version = ++versions.current.refresh;
    setRefreshing(true);
    await Promise.all([loadFavs(), filter === 'posts' ? loadPosts() : filter === 'liked' ? loadLiked() : Promise.resolve()]);
    if (active() && version === versions.current.refresh) setRefreshing(false);
  }, [active, filter, loadFavs, loadPosts, loadLiked]);

  const isPostFilter = filter === 'posts' || filter === 'liked';
  const gridRows = filter === 'posts' ? posts : liked;
  const list = useMemo(() => (favs ?? []).filter((f) => filter === 'todos' || f.type === filter), [favs, filter]);

  const changeFilter = useCallback((key: Filter) => {
    Haptics.selectionAsync().catch(() => {});
    setFilter(key);
  }, []);

  const remove = useCallback(async (f: FavItem) => {
    const key = `${f.type}:${f.id}`;
    if (!active() || pendingRef.current.has(key)) return;
    pendingRef.current.add(key); setPending(new Set(pendingRef.current));
    ++versions.current.favs;
    try {
      const { ok } = await removeFav(f.type, f.id, owner);
      if (!active()) return;
      ++versions.current.favs;
      if (!ok) throw new Error('remove failed');
      if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFavs(cur => (cur ?? []).filter(x => !(x.type === f.type && x.id === f.id)));
      toast('Quitado de guardados');
    } catch {
      if (active()) toastError('No se pudo quitar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      pendingRef.current.delete(key);
      if (active()) setPending(new Set(pendingRef.current));
    }
  }, [active, owner, reduceMotion]);

  const confirmUnsave = useCallback((id: string) => {
    if (!active()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert('Quitar de guardados', '¿Quitar esta publicación de tus guardados?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: async () => {
        const key = `post:${id}`;
        if (!active() || pendingRef.current.has(key)) return;
        pendingRef.current.add(key);
        ++versions.current.posts;
        try {
          const { ok } = await unsaveFomoThread(id, owner);
          if (!active()) return;
          ++versions.current.posts;
          if (!ok) throw new Error('unsave failed');
          if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setPosts(cur => (cur ?? []).filter(p => p.id !== id));
          toast('Quitado de guardados');
        } catch {
          if (active()) toastError('No se pudo quitar', 'Revisa tu conexión e inténtalo de nuevo.');
        } finally { pendingRef.current.delete(key); }
      } },
    ]);
  }, [active, owner, reduceMotion]);

  const openFav = useCallback((f: FavItem) => { if (active()) router.push(ROUTES[f.type](f.id) as never); }, [active, router]);
  const openPost = useCallback((id: string) => { if (active()) router.push(`/fomo/${id}`); }, [active, router]);

  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => {
    if ('type' in item) {
      // Cascada de entrada como en el resto de listados (universidades, becas,
      // notas de corte). La rejilla de publicaciones no la lleva: envolver una
      // celda de tres columnas en otra vista le rompe el ancho.
      return (
        <FadeIn index={index}>
          <FavRow f={item} removing={pending.has(`${item.type}:${item.id}`)} showType={filter === 'todos'} onOpen={openFav} onRemove={remove} />
        </FadeIn>
      );
    }
    return <PostCell p={item} tile={tile} onOpen={openPost} onUnsave={filter === 'posts' ? confirmUnsave : undefined} />;
  }, [filter, tile, openFav, remove, openPost, confirmUnsave, pending]);
  const keyExtractor = useCallback((item: Row) => ('type' in item ? `${item.type}-${item.id}` : `p-${item.id}`), []);

  const currentError = filter === 'posts' ? postsError : filter === 'liked' ? likedError : favsError;
  const retryCurrent = filter === 'posts' ? loadPosts : filter === 'liked' ? loadLiked : loadFavs;
  const hasCurrentRows = isPostFilter ? !!gridRows?.length : list.length > 0;

  // Cabecera: filtros en una fila deslizante (nueve chips no caben en una
  // línea) + aviso de privacidad o de red según el modo.
  const header = useMemo(() => (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: S.lg, paddingVertical: 10 }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} icon={f.icon} active={filter === f.key} accessibilityRole="tab" onPress={() => changeFilter(f.key)} />
        ))}
      </ScrollView>
      {isPostFilter ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.lg, paddingBottom: 10 }}>
          <Lock size={13} color={C.muted} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>
            {filter === 'posts' ? 'Solo tú ves lo que guardas. Mantén pulsada una para quitarla.' : 'Solo tú ves lo que te gusta.'}
          </Text>
        </View>
      ) : null}
      {currentError && hasCurrentRows ? (
        // Aviso de red: se enseña la caché y se ofrece reintentar.
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: S.lg, marginBottom: S.sm,
          padding: 12, borderRadius: R.md, backgroundColor: `${C.warning}1F`,
        }}>
          <WifiOff size={18} color={C.warning} strokeWidth={2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>No se pudo actualizar. Conservamos lo último que pudimos cargar.</Text>
          <Btn small variant="ghost" label="Reintentar" onPress={retryCurrent} />
        </View>
      ) : null}
    </View>
  ), [filter, isPostFilter, currentError, hasCurrentRows, changeFilter, retryCurrent]);

  // Esqueleto con la forma del contenido: filas con miniatura o rejilla 3x3.
  const skeleton = isPostFilter ? (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} height={tile} radius={0} style={{ width: tile, marginBottom: 0, marginHorizontal: 0 }} />)}
    </View>
  ) : (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10 }}>
          <Skeleton height={58} radius={R.md} style={{ width: 58, marginBottom: 0, marginHorizontal: 0 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={13} radius={6} style={{ width: '65%', marginBottom: 0, marginHorizontal: 0 }} />
            <Skeleton height={11} radius={5} style={{ width: '40%', marginBottom: 0, marginHorizontal: 0 }} />
          </View>
        </View>
      ))}
    </View>
  );

  let empty: React.ReactNode;
  if (currentError) {
    empty = <EmptyState icon={WifiOff} title="No se pudo cargar lo guardado"
      subtitle="Comprueba tu conexión y vuelve a intentarlo." cta="Reintentar" onCta={retryCurrent} />;
  } else if (isPostFilter) {
    empty = gridRows === null ? skeleton : filter === 'posts' ? (
      <EmptyState icon={Bookmark} title="Aún no has guardado nada"
        subtitle="Toca el marcador de una publicación del Fomo para guardarla y volver a ella aquí."
        cta="Ir al Fomo" onCta={() => router.push('/(tabs)/feed')} />
    ) : (
      <EmptyState icon={Heart} title="Aún no te gusta nada"
        subtitle="Reacciona a publicaciones del Fomo y aparecerán aquí."
        cta="Ir al Fomo" onCta={() => router.push('/(tabs)/feed')} />
    );
  } else if (favs === null) {
    empty = skeleton;
  } else if (favsError && filter === 'todos') {
    empty = (
      <EmptyState icon={WifiOff} title="No se pudo cargar lo guardado"
        subtitle="Revisa tu conexión. Tus favoritos siguen a salvo en tu cuenta."
        cta="Reintentar" onCta={loadFavs} />
    );
  } else if (filter === 'todos') {
    empty = (
      <EmptyState icon={Bookmark} title="Nada guardado todavía"
        subtitle="Guarda pisos, lugares de ocio, eventos, carreras, unis y becas, y aparecerán aquí. Tus publicaciones del Fomo están en el filtro Publicaciones."
        cta="Explorar" onCta={() => router.push('/(tabs)/explorar')} />
    );
  } else {
    const e = EMPTY[filter as FavType];
    empty = (
      <EmptyState icon={ICONS[filter as FavType]} title={e.title} subtitle={e.subtitle}
        cta={e.cta} onCta={() => router.push(e.route as never)} />
    );
  }

  const data: Row[] = isPostFilter ? (gridRows ?? []) : list;

  return (
    <Screen<Row>
      key={isPostFilter ? 'grid' : 'list'}
      title="Guardado" back refreshing={refreshing} onRefresh={onRefresh}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={isPostFilter ? 3 : 1}
      ListHeaderComponent={header}
      ListEmptyComponent={<View>{empty}</View>}
    />
  );
}
