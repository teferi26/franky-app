// ─── Fomo de una universidad concreta (desde su ficha) ───────────────────
// Lista virtualizada de publicaciones de OTRO campus, en modo lectura ligera:
// corazón, ir al hilo y nada más (el feed completo con menú, guardar y
// reacciones con emoji vive en app/(tabs)/feed.tsx, que es el del campus
// propio). Comparte el lenguaje visual de aquel: foto en tarjeta con esquinas
// R.lg, corazón con latido y esqueleto con la misma silueta.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Heart, MessageCircle, Lock, WifiOff, Play, MoreHorizontal } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Tap, Skeleton, EmptyState, Btn, OptionsSheet } from '@/components/ui';
import { VideoPlayer } from '@/components/VideoPlayer';
import { AudioNote, RichText, ThreadPoll } from '@/components/fomo';
import { Lightbox } from '@/components/Lightbox';
import { FadeIn } from '@/components/motion';
import { getThreads, toggleFomoReaction } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { usePagedFeed } from '@/lib/usePagedFeed';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { timeAgo } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';
import type { FomoThread } from '@/lib/types';
import { hideSocialContent, confirmSocialAction, useSocialModerationRefresh } from '@/lib/social-moderation';

const MEDIA_HEIGHT = 320;

const MiniPost = React.memo(function MiniPost({ t, onOpenImage, isSessionCurrent, index = 0 }: { t: FomoThread; onOpenImage: (uri: string) => void; isSessionCurrent: () => boolean; index?: number }) {
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const [liked, setLiked] = useState(t.my_reaction);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [busy, setBusy] = useState(false);
  const reacting = useRef(false);
  const scale = useRef(new Animated.Value(1)).current;
  const likes = t.reaction_count - (t.my_reaction ? 1 : 0) + (liked ? 1 : 0);
  const name = t.is_anonymous ? 'Anónimo' : (t.author?.full_name ?? 'Estudiante');
  const profileId = !t.is_anonymous && !t.author?.is_organization ? t.author?.id : undefined;
  const openThread = () => router.push(`/fomo/${t.id}`);

  // Corazón con latido (como en el feed). Optimista, revierte si la RPC falla.
  const toggleLike = async () => {
    if (reacting.current || !isSessionCurrent()) return;
    reacting.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !liked;
    setLiked(next);
    if (next && !reduceMotion) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
    }
    setBusy(true);
    try {
      const { ok } = await toggleFomoReaction(t.id);
      if (!isSessionCurrent()) return;
      if (!ok) { setLiked(!next); toastError('No se pudo reaccionar', 'Inténtalo de nuevo en unos segundos.'); }
    } catch {
      setLiked(!next);
    } finally {
      reacting.current = false;
      if (isSessionCurrent()) setBusy(false);
    }
  };

  return suppressed ? null : (
    <FadeIn index={index} distance={12}>
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingBottom: 14, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10, gap: 10 }}>
        <Tap onPress={profileId ? () => router.push(`/perfil/${profileId}`) : undefined} disabled={!profileId}
          accessibilityLabel={profileId ? `Ver el perfil de ${name}` : name}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Avatar name={name} uri={profileId ? t.author?.avatar_url : null} size={38} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.username, { fontSize: 15 }]} numberOfLines={1}>{name}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t.is_anonymous ? 'Publicación anónima' : t.author?.is_organization ? t.author.verified ? '✓ Universidad verificada' : 'Organización' : 'Estudiante'} · {timeAgo(t.created_at)}</Text>
          </View>
        </Tap>
        {!t.is_mine && <Tap onPress={() => setModerationOpen(true)} accessibilityLabel="Opciones de la publicación" hitSlop={10}>
          <MoreHorizontal size={22} color={C.text} />
        </Tap>}
      </View>
      <OptionsSheet visible={moderationOpen} onClose={() => setModerationOpen(false)} options={[
        { label: 'Denunciar publicación', destructive: true, onPress: () => void confirmSocialAction('fomo_thread', t.id, false, () => setSuppressed(true)) },
        { label: 'Ocultar publicación', onPress: () => void hideSocialContent('fomo_thread', t.id, () => setSuppressed(true)) },
        { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
        ...(!t.author?.is_organization ? [{ label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('fomo_thread', t.id, true, () => setSuppressed(true)) }] : []),
      ]} />
      {t.body ? <RichText text={t.body} style={[F.body, { paddingHorizontal: S.lg, marginBottom: 10 }]} /> : null}
      {t.media_url && t.media_type === 'image' ? (
        <Tap onPress={() => onOpenImage(t.media_url!)} accessibilityLabel="Ver la foto a pantalla completa"
          style={{ marginHorizontal: S.lg, marginBottom: 10, borderRadius: R.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border }}>
          <Image source={{ uri: t.media_url }} recyclingKey={t.id}
            style={{ width: '100%', height: MEDIA_HEIGHT, backgroundColor: C.input }}
            contentFit="cover" transition={150} cachePolicy="memory-disk" />
        </Tap>
      ) : t.media_url && t.media_type === 'video' ? (
        <View style={{ marginHorizontal: S.lg, height: MEDIA_HEIGHT, marginBottom: 10 }}>
          <VideoPlayer uri={t.media_url} radius={R.lg} style={{ width: '100%', height: '100%' }} />
          <View pointerEvents="none" style={{
            position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3,
          }}>
            <Play size={11} color="#fff" fill="#fff" />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 10.5, fontFamily: FONT.semibold }}>Vídeo</Text>
          </View>
        </View>
      ) : t.media_url && t.media_type === 'audio' ? (
        <View style={{ marginHorizontal: S.lg, marginBottom: 10 }}><AudioNote uri={t.media_url} /></View>
      ) : null}
      {t.poll ? <View style={{ marginHorizontal: S.lg, marginBottom: 10 }}><ThreadPoll poll={t.poll} /></View> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 18 }}>
        <Pressable onPress={toggleLike} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'} accessibilityState={{ selected: liked, busy }}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Heart size={24} color={liked ? C.red : C.text} fill={liked ? C.red : 'transparent'} strokeWidth={1.9} />
          </Animated.View>
        </Pressable>
        <Tap onPress={openThread} hitSlop={8} accessibilityLabel="Ver comentarios">
          <MessageCircle size={24} color={C.text} strokeWidth={1.9} style={{ transform: [{ scaleX: -1 }] }} />
        </Tap>
      </View>
      <View style={{ paddingHorizontal: S.lg, marginTop: 8, gap: 2 }}>
        {likes > 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>
            {likes === 1 ? '1 me gusta' : `${likes} me gusta`}
          </Text>
        ) : null}
        <Tap haptic={false} onPress={openThread} accessibilityLabel={t.reply_count > 0 ? `Ver los ${t.reply_count} comentarios` : 'Añadir un comentario'}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 13, paddingVertical: 2 }]}>
            {t.reply_count > 0 ? `Ver los ${t.reply_count} comentarios` : 'Añadir un comentario…'}
          </Text>
        </Tap>
      </View>
    </View>
    </FadeIn>
  );
});

// Esqueleto con la MISMA silueta que un post: cabecera, texto y bloque de foto.
function PostSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}
      style={{ paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Skeleton height={36} radius={18} style={{ width: 36, marginBottom: 0, marginHorizontal: 0 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton height={12} radius={6} style={{ width: '45%', marginBottom: 0, marginHorizontal: 0 }} />
          <Skeleton height={10} radius={5} style={{ width: '30%', marginBottom: 0, marginHorizontal: 0 }} />
        </View>
      </View>
      <Skeleton height={14} radius={7} style={{ width: '90%', marginBottom: 6, marginHorizontal: 0 }} />
      <Skeleton height={MEDIA_HEIGHT} radius={R.lg} style={{ marginBottom: 0, marginHorizontal: 0 }} />
    </View>
  );
}

type Gate = 'loading' | 'no-auth' | 'ok';

export default function FomoUni() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { uid, isCurrent } = useSessionIdentity();
  if (uid === undefined) return <Screen title="FOMO" back><PostSkeleton /></Screen>;
  if (!uid) return <Screen title="FOMO" back><EmptyState icon={Lock} title="Entra en la conversación" subtitle="Inicia sesión para ver el tablón de esta universidad." cta="Iniciar sesión" onCta={()=>router.push('/welcome')}/></Screen>;
  return <UniversityFeed key={`${uid}:${id}`} id={String(id)} name={name} uid={uid} isSessionCurrent={isCurrent} />;
}

function UniversityFeed({ id, name, uid, isSessionCurrent }: { id:string; name?:string; uid:string; isSessionCurrent:()=>boolean }) {
  const router = useRouter();
  const pageSize = 20;
  const fetchPage = useCallback(async (offset:number) => (await getThreads(id, { limit:pageSize, offset })).rows, [id]);
  const feed = usePagedFeed<FomoThread>(fetchPage,pageSize);
  useSocialModerationRefresh(feed.reload);
  const [ownCampus,setOwnCampus] = useState(false);
  const [lightboxUri,setLightboxUri] = useState<string|null>(null);
  const openImage=useCallback((uri:string)=>setLightboxUri(uri),[]);
  useEffect(()=>{
    let alive=true;
    void supabase.from('profiles').select('university_id').eq('id',uid).maybeSingle().then(({data})=>{
      if(alive&&isSessionCurrent())setOwnCampus(data?.university_id===id);
    });
    return ()=>{alive=false;};
  },[id,uid,isSessionCurrent]);
  const renderItem=useCallback(({item,index}:{item:FomoThread;index:number})=><MiniPost t={item} index={index} onOpenImage={openImage} isSessionCurrent={isSessionCurrent}/>,[openImage,isSessionCurrent]);
  return <>
    <Screen<FomoThread> title={name??'Universidad'} subtitle="FOMO · conversación del campus" back
      data={feed.items} renderItem={renderItem} keyExtractor={item=>item.id}
      refreshing={feed.loading&&feed.items.length>0} onRefresh={feed.reload}
      onEndReached={()=>{if(!feed.moreError)void feed.loadMore();}} onEndReachedThreshold={0.4}
      ListHeaderComponent={<>
        {ownCampus ? <View style={{paddingHorizontal:S.lg,paddingVertical:S.sm}}><Btn label="Escribir en FOMO" variant="secondary" onPress={()=>router.push('/publicar?type=thread')}/></View> : null}
        {feed.error&&feed.items.length>0?<View style={{padding:S.lg}}><Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se ha podido actualizar. Sigues viendo las publicaciones anteriores.</Text><Btn label="Reintentar" onPress={feed.reload}/></View>:null}
      </>}
      ListEmptyComponent={feed.loading?<><PostSkeleton/><PostSkeleton/></>:feed.error?<EmptyState icon={WifiOff} title="No se pudo cargar el tablón" subtitle="Revisa la conexión e inténtalo de nuevo." cta="Reintentar" onCta={feed.reload}/>:<EmptyState icon={MessageCircle} title="Este campus tiene cosas que contar" subtitle={ownCampus?'Rompe el hielo con una pregunta o un plan.':'Todavía no hay publicaciones. Puedes explorar tu propio campus.'} cta={ownCampus?'Abrir una conversación':'Ir a mi campus'} onCta={()=>router.push(ownCampus?'/publicar?type=thread':'/(tabs)/feed')}/>}
      ListFooterComponent={feed.loadingMore?<ActivityIndicator style={{padding:24}} color={C.blue}/>:feed.moreError?<View style={{padding:S.lg,gap:10}}><Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se cargaron más publicaciones.</Text><Btn label="Reintentar" onPress={()=>void feed.loadMore()}/></View>:null}
    />
    <Lightbox uri={lightboxUri} onClose={()=>setLightboxUri(null)}/>
  </>;
}
