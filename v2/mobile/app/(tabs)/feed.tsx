import { useSessionOwner } from '@/lib/useSessionOwner';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { markOwnedCacheFresh, readOwnedCache, writeOwnedCache } from '@/lib/owner-cache';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Share, Alert, ActivityIndicator, Pressable, Animated, LayoutAnimation } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Heart, MessageCircle, Send, Bookmark, MoreHorizontal, PenSquare, Bell, Lock,
  School, ArrowUp, Play, Search, WifiOff,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Tap, Skeleton, EmptyState, SearchBar, Chip, OptionsSheet, type SheetOption } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { AudioNote, ThreadPoll, RichText, SendPostSheet } from '@/components/fomo';
import { VideoPlayer } from '@/components/VideoPlayer';
import { StoriesBar } from '@/components/StoriesBar';
import { HomeSwitch } from '@/components/HomeSwitch';
import { DiscoverChecklist } from '@/components/DiscoverChecklist';
import { TodayStrip } from '@/components/TodayStrip';
import { Lightbox } from '@/components/Lightbox';
import {
  getThreads, getMyUniversity, getMyUniversitySlug, toggleFomoReaction, setFomoReaction,
  saveFomoThread, unsaveFomoThread, getSavedFomoThreadIds, type FomoSort,
} from '@/lib/api';
import { toggleFollow } from '@/lib/social';
import { SPACES } from '@/lib/spaces';
import { getStaffRole } from '@/lib/admin';
import { captureError } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
// Alias como `trans`: en este fichero `t` ya es el nombre de la publicación
// (FomoThread) en el componente Post y en el bucle de renderItem, así que
// usar `t` para traducir chocaría con esa variable en todo el fichero.
import { t as trans } from '@/lib/i18n';
import { C, S, F, R, FONT, SHADOW } from '@/theme';
import type { FomoThread } from '@/lib/types';
import { hideSocialContent, reportSocialContent, confirmSocialAction, useSocialModerationRefresh } from '@/lib/social-moderation';
import { CardPromoIfEligible } from '@/components/card/CardPromo';

// Reacciones rápidas. Se persisten con set_fomo_reaction (migración
// 129): una reacción por usuario, tocar el mismo emoji la quita. El feed solo
// devuelve my_reaction como booleano, así que al cargar mostramos ❤️ por defecto
// cuando ya había reacción (no sabemos el emoji exacto sin una consulta extra).
// Son reacciones (contenido), no iconos de interfaz: por eso sí van en emoji.
const REACTIONS = ['❤️', '😂', '😮', '😍', '🔥'];

const PAGE = 20;
// Altura de la foto/vídeo de un post. Es la misma en el skeleton para que la
// carga no "salte" al llegar el contenido real.
const MEDIA_HEIGHT = 340;
// Las funciones (en vez de valores fijos) permiten que estas listas se
// re-evalúen en el idioma actual sin tener que reconstruirlas al vuelo cada
// render: se llaman justo donde se usan (en SORTS.map / SPACES.map).
const SORTS: { key: FomoSort; label: () => string }[] = [
  { key: 'recent', label: () => trans('feed.sortRecent') },
  { key: 'top', label: () => trans('feed.sortTop') },
  { key: 'oldest', label: () => trans('feed.sortOldest') },
];

// Los "espacios" del carrusel salen de la lista compartida con La Lupa
// (src/lib/spaces.ts): antes eran una copia literal de sus categorías y ya se
// habían desincronizado. Añadir una categoría ahora es tocar un solo sitio.

// Denuncia de contenido con motivo (mejora 23; requisito Apple 1.2). El
// objetivo en Fomo es el hilo. report_fomo(p_target_type, p_target_id, p_reason):
// La supresión personal es inmediata y persistente, independiente de la revisión global.
const REPORT_REASONS: { key: string; label: () => string }[] = [
  { key: 'spam', label: () => trans('feed.reportSpam') },
  { key: 'inapropiado', label: () => trans('feed.reportInappropriate') },
  { key: 'acoso', label: () => trans('feed.reportHarassment') },
  { key: 'otro', label: () => trans('feed.reportOther') },
];

async function submitThreadReport(threadId: string, reason: string, onSuppressed?: (id: string) => void) {
  if (await reportSocialContent('fomo_thread', threadId, reason)) onSuppressed?.(threadId);
}

// media_type admite 'video' en prod (migración 132) aunque el tipo compartido
// aún no lo declare; lo tratamos como string para no romper el build (igual
// que ya hace explorar.tsx).
const isVideoPost = (t: FomoThread): boolean => (t.media_type as string | null) === 'video';

// Corazón con "latido": al dar me gusta escala con un muelle (como en IG). Con
// "reducir movimiento" activado se salta la animación y solo cambia el color.
function useHeartBeat() {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const beat = useCallback(() => {
    if (reduceMotion) return;
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 14 }).start();
  }, [reduceMotion, scale]);
  return { scale, beat };
}

const Post = React.memo(function Post({ t, followed, saved, hasStory, amAdmin, onToggleSave, onFollowChange, onDeleted, onOpenImage }: {
  t: FomoThread;
  followed?: boolean;
  saved?: boolean;
  /** El autor tiene una story activa: el avatar lleva el anillo de marca y
      tocarlo abre la story (como en IG). Sin story, el avatar abre el perfil. */
  hasStory?: boolean;
  /** El RPC delete_fomo_thread deja borrar a los admins (moderación); sin esto
      la papelera solo salía en los posts propios (is_mine). */
  amAdmin?: boolean;
  onToggleSave?: (threadId: string) => void;
  onFollowChange?: (authorId: string, followed: boolean) => void;
  onDeleted?: (threadId: string) => void;
  onOpenImage?: (uri: string) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(t.my_reaction);
  // Emoji de la reacción. Al cargar solo sabemos si hubo reacción (booleano), así
  // que por defecto ❤️; al reaccionar, set_fomo_reaction devuelve el emoji real.
  const [reaction, setReaction] = useState<string | null>(t.my_reaction ? '❤️' : null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Menú de opciones del post (mejora 59): "Enviar por privado" + eliminar/
  // denunciar según sea propio o ajeno.
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // Las hojas (opciones, denuncia, enviar) se montan la primera vez que se
  // abren y ya se quedan: antes cada post del feed montaba las tres.
  const [sheetsMounted, setSheetsMounted] = useState(false);
  useEffect(() => { if (menuOpen || reportOpen || sendOpen) setSheetsMounted(true); }, [menuOpen, reportOpen, sendOpen]);
  const [followBusy, setFollowBusy] = useState(false);
  const { scale: heartScale, beat } = useHeartBeat();
  const name = t.is_anonymous ? trans('feed.anonymous') : (t.author?.full_name ?? trans('common.student'));
  const username = t.author?.is_organization ? name : name.toLowerCase().replace(/\s+/g, '.');
  // Nombre real de la universidad del autor (mejora 21). Ninguna RPC lo devuelve
  // todavía (el tipo FomoAuthor no tiene el campo): fail-soft con un cast
  // opcional, listo para cuando el backend lo incluya sin tocar este fichero.
  const authorUniName = !t.is_anonymous
    ? (t.author as unknown as { university_name?: string | null } | null)?.university_name
    : null;
  const likes = t.reaction_count - (t.my_reaction ? 1 : 0) + (liked ? 1 : 0);
  const openThread = () => router.push(`/fomo/${t.id}`);
  // Seguir al autor (grafo social, migración 123): solo con autor visible y ajeno.
  const authorId = !t.is_anonymous && !t.is_mine && !t.author?.is_organization ? t.author?.id : undefined;
  // Perfil público: solo si el autor es visible (los anónimos no enlazan a nadie).
  const profileId = !t.is_anonymous && !t.author?.is_organization ? t.author?.id : undefined;
  const openProfile = profileId ? () => router.push(`/perfil/${profileId}`) : undefined;
  const openStory = profileId && hasStory ? () => router.push(`/story/${profileId}`) : undefined;

  // Reacción con emoji persistente (set_fomo_reaction). Optimista: aplicamos el
  // cambio ya y usamos el retorno de la RPC como fuente de verdad. Si la RPC no
  // existe aún (undefined), caemos al toggle binario para no perder el like.
  const applyReaction = async (targetEmoji: string | null, emojiForRpc: string) => {
    const prevLiked = liked, prevReaction = reaction;
    const nextLiked = targetEmoji !== null;
    if (nextLiked) beat();
    setLiked(nextLiked); setReaction(targetEmoji);
    const result = await setFomoReaction(t.id, emojiForRpc);
    if (result === undefined) {
      // Fail-soft: la RPC de emoji no está disponible. Solo togglear el like
      // binario si el estado de like cambió (cambiar solo de emoji no llama).
      if (nextLiked !== prevLiked) {
        const { ok } = await toggleFomoReaction(t.id);
        if (!ok) { setLiked(prevLiked); setReaction(prevReaction); }
      }
      return;
    }
    // result es el emoji real ahora (o null si se quitó): sincroniza el estado.
    setLiked(result !== null);
    setReaction(result);
  };

  // Toque del corazón: pone ❤️ (o reactiva el último emoji) o quita la reacción.
  const toggleLike = () => {
    setPickerOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const emoji = reaction ?? '❤️';
    // Para quitar mandamos el emoji actual: set_fomo_reaction lo togglea a null.
    applyReaction(liked ? null : emoji, emoji);
  };

  // Elegir un emoji de la fila: si ya era ese, lo quita; si no, pone/cambia a él.
  const pickReaction = (emoji: string) => {
    setPickerOpen(false);
    Haptics.selectionAsync().catch(() => {});
    const removing = liked && reaction === emoji;
    applyReaction(removing ? null : emoji, emoji);
  };

  const onFollow = async () => {
    if (!authorId || !onFollowChange || followBusy) return;
    setFollowBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const now = await toggleFollow(authorId);
      onFollowChange(authorId, now);
    } catch (e) {
      // No rompemos el feed, pero tampoco lo enterramos: durante meses
      // seguir estuvo roto (política de la 123) y aquí no se veía nada.
      captureError(e, { where: 'feed.toggleFollow', authorId });
      toastError('No se pudo seguir', trans('common.tryAgainSoon'));
    } finally {
      setFollowBusy(false);
    }
  };

  const share = async () => {
    // Enlace público del campus (/fomo/{slug}, migración 144): la web no
    // tiene página por hilo, así que un UUID ahí caía en una landing
    // vacía. Sin slug (perfil sin uni, sin red), a la portada. El texto
    // del post viaja en el mensaje para dar contexto al enlace.
    const slug = await getMyUniversitySlug();
    const url = slug ? `https://franky.es/fomo/${slug}` : 'https://franky.es';
    Share.share({ message: `${t.body ?? trans('feed.shareDefaultMessage')}\n\n${url}` }).catch(() => {});
  };

  return (
    <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight, paddingBottom: 12, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10, gap: 10 }}>
        {openProfile ? (
          <Tap onPress={openStory ?? openProfile} hitSlop={4}
            accessibilityLabel={openStory ? `Ver la historia de ${name}` : trans('feed.viewProfileA11y', { name })}>
            {/* Anillo SOLO si hay historia activa: si no, un anillo en todos
                los avatares deja de significar nada. */}
            <Avatar name={name} uri={t.author?.avatar_url} size={36} ring={!!hasStory} />
          </Tap>
        ) : (
          <Avatar name={name} uri={null} size={36} ring={false} />
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Tap onPress={openProfile} disabled={!openProfile} style={{ flexShrink: 1 }}
            accessibilityLabel={openProfile ? trans('feed.viewProfileA11y', { name }) : name}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.username} numberOfLines={1}>{username}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>
              {t.is_anonymous ? trans('feed.anonymousPost') : t.author?.is_organization ? t.author.verified ? '✓ Universidad verificada' : 'Organización' : (authorUniName || trans('feed.yourUniversity'))} · {timeAgo(t.created_at)}
            </Text>
          </Tap>
          {authorId && onFollowChange ? (
            <Tap onPress={onFollow} disabled={followBusy} hitSlop={8}
              accessibilityLabel={followed ? trans('feed.following') : trans('feed.follow')}
              accessibilityState={{ selected: !!followed, busy: followBusy }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, fontFamily: FONT.semibold, color: followed ? C.muted : C.blue }}>
                {followed ? trans('feed.following') : trans('feed.follow')}
              </Text>
            </Tap>
          ) : null}
        </View>
        <Tap onPress={() => setMenuOpen(true)} accessibilityRole="button" accessibilityLabel={trans('feed.postOptionsA11y')} hitSlop={10}>
          <MoreHorizontal size={22} color={C.text} strokeWidth={2} />
        </Tap>
      </View>
      {/* Menú de opciones del post: enviar por privado siempre; eliminar (propio)
          o denunciar (ajeno), igual que antes. */}
      {sheetsMounted || menuOpen ? <>
      <OptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          { label: trans('feed.sendPrivately'), icon: Send, onPress: () => setSendOpen(true) },
          ...(t.is_mine || amAdmin ? [{
            label: trans('common.delete'), destructive: true,
            onPress: () => Alert.alert(trans('common.deleteConfirmTitle'), trans('common.deleteConfirmBody'), [
              { text: trans('common.cancel'), style: 'cancel' },
              {
                text: trans('common.delete'), style: 'destructive',
                onPress: async () => {
                  const { error } = await supabase.rpc('delete_fomo_thread', { p_thread_id: t.id });
                  if (error) { toastError(trans('common.deleteError'), trans('common.deleteErrorBody')); return; }
                  onDeleted?.(t.id);
                },
              },
            ]),
          } as SheetOption] : [
            { label: trans('feed.reportPost'), destructive: true, onPress: () => setReportOpen(true) } as SheetOption,
            { label: 'Ocultar publicación', onPress: () => void hideSocialContent('fomo_thread', t.id, () => onDeleted?.(t.id)) },
            { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
            ...(!t.author?.is_organization ? [{ label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('fomo_thread', t.id, true, () => onDeleted?.(t.id)) } as SheetOption] : []),
          ]),
        ]}
      />
      {/* Denunciar con motivo (mejora 23): spam / inapropiado / acoso / otro. */}
      <OptionsSheet
        visible={reportOpen}
        title={trans('feed.reportPostTitle')}
        onClose={() => setReportOpen(false)}
        options={REPORT_REASONS.map((r) => ({ label: r.label(), onPress: () => submitThreadReport(t.id, r.key, onDeleted) }))}
      />
      {/* Enviar por privado (mejora 59): selector de conversaciones. */}
      <SendPostSheet thread={sendOpen ? { id: t.id, body: t.body } : null} onClose={() => setSendOpen(false)} />
      </> : null}
      {t.body ? (
        <RichText text={t.body} style={[F.body, { paddingHorizontal: S.lg, marginBottom: 10 }]} />
      ) : null}
      {t.media_url && t.media_type === 'image' ? (
        // Tocar la foto la abre a pantalla completa (Lightbox con pinch-to-zoom).
        // La foto va con margen y esquinas redondeadas (R.lg): se lee como una
        // tarjeta dentro del post, no como una franja a sangre.
        <Tap onPress={() => onOpenImage?.(t.media_url!)} accessibilityLabel={trans('feed.viewPhotoA11y')}
          style={{ marginHorizontal: S.lg, marginBottom: 10 }}>
          <Image
            source={{ uri: t.media_url }}
            recyclingKey={t.id}
            style={{ width: '100%', height: MEDIA_HEIGHT, borderRadius: R.lg, backgroundColor: C.input }}
            contentFit="cover" transition={150} cachePolicy="memory-disk"
          />
        </Tap>
      ) : t.media_url && isVideoPost(t) ? (
        // Vídeo del FOMO (migración 132). Inline, silenciado por defecto, tap
        // para sonido; igual que en Crush/stories. media_type 'video' no está en
        // el tipo FomoThread (no editable aquí), de ahí el cast a string.
        // Insignia "Vídeo" (mejora 65): distingue el post de un vistazo, igual
        // que ya hace explorar.tsx en su grid de descubrimiento.
        <View style={{ marginHorizontal: S.lg, height: MEDIA_HEIGHT, marginBottom: 10 }}>
          <VideoPlayer uri={t.media_url} radius={R.lg} style={{ width: '100%', height: '100%' }} />
          <View pointerEvents="none" style={{
            position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
            backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.sm, paddingHorizontal: 7, paddingVertical: 3,
          }}>
            <Play size={11} color="#fff" fill="#fff" />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 10.5, fontFamily: FONT.semibold }}>{trans('feed.video')}</Text>
          </View>
        </View>
      ) : t.media_url && t.media_type === 'audio' ? (
        <View style={{ marginHorizontal: S.lg, marginBottom: 10 }}>
          <AudioNote uri={t.media_url} />
        </View>
      ) : null}
      {t.poll ? (
        <View style={{ marginHorizontal: S.lg, marginBottom: 10 }}>
          <ThreadPoll poll={t.poll} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 18 }}>
        {/* Corazón con reacciones: toque = like; mantener pulsado = fila de emojis. */}
        <View>
          {pickerOpen ? (
            <View style={[{
              position: 'absolute', bottom: 40, left: -8, flexDirection: 'row', gap: 6,
              backgroundColor: C.surface, borderRadius: R.full, borderWidth: 1, borderColor: C.borderLight,
              paddingHorizontal: 10, paddingVertical: 6,
            }, SHADOW.float]}>
              {REACTIONS.map((e) => (
                <Pressable key={e} onPress={() => pickReaction(e)} hitSlop={6}
                  style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  accessibilityRole="button" accessibilityLabel={trans('feed.reactWithA11y', { emoji: e })}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={toggleLike}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setPickerOpen(true); }}
            delayLongPress={220}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={liked ? trans('feed.removeLikeA11y') : trans('feed.likeA11y')}
            accessibilityState={{ selected: liked }}
            accessibilityHint={trans('feed.reactionHintA11y')}>
            <Animated.View style={{ transform: [{ scale: heartScale }], minWidth: 28, alignItems: 'center' }}>
              {liked && reaction && reaction !== '❤️'
                ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 22 }}>{reaction}</Text>
                : <Heart size={24} color={liked ? C.red : C.text} fill={liked ? C.red : 'transparent'} strokeWidth={2} />}
            </Animated.View>
          </Pressable>
        </View>
        <Tap onPress={openThread} hitSlop={8} accessibilityLabel={trans('feed.addComment')}>
          <MessageCircle size={24} color={C.text} strokeWidth={2} style={{ transform: [{ scaleX: -1 }] }} />
        </Tap>
        <Tap onPress={share} hitSlop={8} accessibilityLabel="Compartir publicación">
          <Send size={24} color={C.text} strokeWidth={2} />
        </Tap>
        <View style={{ flex: 1 }} />
        <Tap onPress={() => onToggleSave?.(t.id)} hitSlop={8}
          accessibilityLabel={saved ? trans('feed.unsaveA11y') : trans('feed.saveA11y')}
          accessibilityState={{ selected: !!saved }}>
          <Bookmark size={24} color={saved ? C.blue : C.text} fill={saved ? C.blue : 'transparent'} strokeWidth={2} />
        </Tap>
      </View>
      <View style={{ paddingHorizontal: S.lg, marginTop: 8, gap: 2 }}>
        {likes > 0 ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>
            {trans('feed.likesCount', { count: likes })}
          </Text>
        ) : null}
        <Tap haptic={false} onPress={openThread} accessibilityLabel={t.reply_count > 0 ? trans('feed.viewComments', { count: t.reply_count }) : trans('feed.addComment')}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 13, paddingVertical: 2 }]}>
            {t.reply_count > 0 ? trans('feed.viewComments', { count: t.reply_count }) : trans('feed.addComment')}
          </Text>
        </Tap>
      </View>
    </View>
  );
});

// Esqueleto con la MISMA silueta que un post (cabecera con avatar, dos líneas
// de texto y bloque de foto): el contenido real lo sustituye sin saltos.
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
      <Skeleton height={14} radius={7} style={{ width: '65%', marginBottom: 12, marginHorizontal: 0 }} />
      <Skeleton height={MEDIA_HEIGHT} radius={R.lg} style={{ marginBottom: 12, marginHorizontal: 0 }} />
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={24} radius={12} style={{ width: 24, marginBottom: 0, marginHorizontal: 0 }} />)}
      </View>
    </View>
  );
}

// Carrusel de "espacios" (Eventos/Pisos/Becas...). Va como cabecera de la lista.
function SpacesCarousel() {
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}
      contentContainerStyle={{ paddingHorizontal: S.md, paddingVertical: 10, gap: 14 }}>
      {SPACES.map(sp => (
        <Tap key={sp.key} onPress={() => router.push(sp.href)} accessibilityLabel={sp.label()}>
          <View style={{ alignItems: 'center', width: 66 }}>
            {/* Marco limpio con hairline y el icono suelto dentro: sin anillos
                de degradado ni discos tintados. */}
            <View style={{
              width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
            }}>
              <sp.icon size={23} color={C.blue} strokeWidth={1.7} />
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontSize: 11, fontFamily: FONT.medium, color: C.text, marginTop: 6 }}>{sp.label()}</Text>
          </View>
        </Tap>
      ))}
    </ScrollView>
  );
}

// Píldora flotante "N nuevas" (mejora 20): violeta sólido, sombra
// flotante y entrada animada desde arriba (sin animación con "reducir
// movimiento").
function NewPostsPill({ count, onPress, top }: { count: number; onPress: () => void; top: number }) {
  const reduceMotion = useReduceMotion();
  const anim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { anim.setValue(1); return; }
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [anim, reduceMotion]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  return (
    <Animated.View pointerEvents="box-none"
      style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center', opacity: anim, transform: [{ translateY }] }}>
      <Tap haptic onPress={onPress} accessibilityLabel={trans('feed.newPostsA11y', { count })}>
        <View style={[{
          flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.blue,
          borderRadius: R.full, paddingHorizontal: 16, minHeight: 40, paddingVertical: 8,
        }, SHADOW.float]}>
          <ArrowUp size={15} color={C.onAccent} strokeWidth={2.1} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontSize: 13.5, fontFamily: FONT.semibold }}>
            {trans('feed.newPosts', { count })}
          </Text>
        </View>
      </Tap>
    </Animated.View>
  );
}


type Gate = 'loading' | 'no-auth' | 'no-uni' | 'ok';

// Primera página del FOMO por cuenta (orden Recientes, sin búsqueda): al volver
// a montar la pestaña se pinta al instante y se revisa en segundo plano.
type FeedSnapshot = { uni: { id: string; name: string }; rows: FomoThread[] };
const FEED_CACHE = 'fomo-feed';
const STAFF_CACHE = 'fomo-staff-role';

export default function Feed() {
  const owner = useSessionOwner();
  return <OwnedFeed key={owner ? `${owner.userId}:${owner.generation}` : 'guest'} owner={owner} />;
}
function OwnedFeed({ owner }: { owner: SessionIdentity | null }) {
  const alive = useRef(true);
  const savesVersion = useRef(0);
  const confirmedSaves = useRef(new Map<string, { saved: boolean; version: number }>());
  const pendingSaves = useRef(new Set<string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = useCallback(() => alive.current && (owner ? isCurrentSessionIdentity(owner) : captureSessionIdentity() === null), [owner]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [cached] = useState(() => readOwnedCache<FeedSnapshot>(owner, FEED_CACHE));
  const [gate, setGate] = useState<Gate>(cached ? 'ok' : 'loading');
  const [uni, setUni] = useState<{ id: string; name: string } | null>(cached?.uni ?? null);
  const [rows, setRows] = useState<FomoThread[] | null>(cached?.rows ?? null);
  const uniRef = useRef(uni);
  uniRef.current = uni;
  // La primera página falló (sin red): se enseña "Reintentar" en vez de un
  // vacío que parece que el campus está callado.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const generation = useRef(0);
  const pageBusy = useRef(false);
  const nextOffset = useRef(0);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FomoSort>('recent');
  // Píldora "N nuevas" (mejora 20): cuántos hilos más recientes que el primero
  // cargado hay disponibles. Se comprueba cada cierto tiempo en segundo plano
  // (solo en Recientes sin búsqueda, que es donde "más nuevo" tiene sentido) y
  // se resetea al refrescar o cambiar de orden/búsqueda.
  const [newAvailable, setNewAvailable] = useState(0);
  // Forzar el remontaje del FlatList para volver arriba del todo (Screen no
  // expone una ref propia; es la única forma de "scroll arriba" sin tocar ese fichero).
  const [remountKey, setRemountKey] = useState(0);
  const topIdRef = useRef<string | null>(null);
  // A quién sigo (para el botón Seguir/Siguiendo de cada post). Fail-soft:
  // sin migración 123 el set queda vacío y el botón muestra "Seguir".
  const [following, setFollowing] = useState<Set<string>>(new Set());
  // Si soy admin, el menú ⋯ ofrece Eliminar en cualquier post (moderación).
  const [amAdmin, setAmAdmin] = useState(false);
  // Publicaciones guardadas (favorites 'fomo_thread'): para el bookmark relleno.
  // Fail-soft: sin sesión o sin migración 129 el set queda vacío.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Ref espejo del set de guardados: onToggleSave lo lee de aquí y así su
  // identidad no cambia con cada guardado (antes cada bookmark repintaba TODOS
  // los posts de la lista porque el callback era nuevo).
  const savedIdsRef = useRef(savedIds);
  useEffect(() => { savedIdsRef.current = savedIds; }, [savedIds]);
  // Autores con story activa (lo comunica StoriesBar, que ya las carga): solo
  // esos avatares llevan anillo.
  const [storyAuthors, setStoryAuthors] = useState<Set<string>>(new Set());
  // Imagen abierta en el Lightbox (null = cerrado); una sola instancia al final.
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const openImage = useCallback((uri: string) => setLightboxUri(uri), []);

  useEffect(() => {
    if (!owner || !active()) return;
    let cancelled = false;
    const version = savesVersion.current;
    void withOwnedRequest(owner, async request => request.query(supabase.from('follows')
      .select('followee_id').eq('follower_id', owner.userId).limit(1000)))
      .then(({ data }) => { if (!cancelled && active() && data) setFollowing(new Set(data.map(f => f.followee_id))); }).catch(() => {});
    void getSavedFomoThreadIds(owner).then(ids => {
      if (!cancelled && active()) {
        const merged = new Set(ids);
        for (const [id, change] of confirmedSaves.current) {
          if (change.version <= version) continue;
          if (change.saved) merged.add(id); else merged.delete(id);
        }
        savedIdsRef.current = merged; setSavedIds(merged);
      }
    }).catch(() => {});
    // El rol casi nunca cambia y getStaffRole pasa por auth.getUser (red y
    // candado de auth): una vez por cuenta y sesión basta.
    const knownRole = readOwnedCache<boolean>(owner, STAFF_CACHE);
    if (knownRole !== null) setAmAdmin(knownRole);
    else void getStaffRole().then(role => {
      writeOwnedCache(owner, STAFF_CACHE, role === 'admin');
      if (!cancelled && active()) setAmAdmin(role === 'admin');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [gate, owner, active]);

  const onToggleSave = useCallback(async (threadId: string) => {
    if (!owner || !active() || pendingSaves.current.has(threadId)) return;
    pendingSaves.current.add(threadId);
    const wasSaved = savedIdsRef.current.has(threadId);
    try {
      const { ok } = wasSaved ? await unsaveFomoThread(threadId, owner) : await saveFomoThread(threadId, owner);
      if (!active()) return;
      if (!ok) { toastError(wasSaved ? 'No se pudo quitar' : 'No se pudo guardar', trans('common.tryAgainSoon')); return; }
      confirmedSaves.current.set(threadId, { saved: !wasSaved, version: ++savesVersion.current });
      const next = new Set(savedIdsRef.current);
      if (wasSaved) next.delete(threadId); else next.add(threadId);
      savedIdsRef.current = next; setSavedIds(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!wasSaved) toast('Guardado', 'Lo tienes en Guardado, en tu perfil.');
    } finally { pendingSaves.current.delete(threadId); }
  }, [owner, active]);

  const onFollowChange = useCallback((authorId: string, followed: boolean) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (followed) next.add(authorId); else next.delete(authorId);
      return next;
    });
  }, []);

  // Debounce del buscador: la RPC solo se llama ~400 ms después de dejar de teclear.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  // Carga la primera página (offset 0). Cambiar búsqueda u orden re-crea este
  // callback, y el efecto de abajo lo relanza: eso resetea el offset solo.
  const load = useCallback(async () => {
    const current = ++generation.current;
    pageBusy.current = true;
    setLoadingMore(false); setMoreError(false); setHasMore(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (current !== generation.current) return;
      if (!session) { setGate('no-auth'); setRows([]); return; }
      // Con el campus ya conocido, la página se pide A LA VEZ que se confirma
      // la universidad (antes: sesión, luego universidad, luego feed, en fila).
      const knownUni = uniRef.current;
      const early = knownUni ? getThreads(knownUni.id, { limit: PAGE, offset: 0, search, sort }) : null;
      early?.catch(() => {});
      const u = await getMyUniversity();
      if (current !== generation.current) return;
      if (!u) { setGate('no-uni'); setRows([]); return; }
      setUni(u); setGate('ok');
      const page = (await (early && knownUni?.id === u.id ? early : getThreads(u.id, { limit: PAGE, offset: 0, search, sort }))).rows;
      if (current !== generation.current) return;
      nextOffset.current = page.length;
      setRows(page); setHasMore(page.length === PAGE); setNewAvailable(0); setLoadError(false);
      if (owner && sort === 'recent' && !search) {
        writeOwnedCache<FeedSnapshot>(owner, FEED_CACHE, { uni: u, rows: page });
        markOwnedCacheFresh(owner, FEED_CACHE);
      }
    } catch {
      if (current !== generation.current) return;
      setGate('ok'); setRows(prev => prev ?? []); setLoadError(true);
    } finally { if (current === generation.current) pageBusy.current = false; }
  }, [search, sort, owner]);

  useSocialModerationRefresh(load);

  const firstLoad = useRef(true);
  useEffect(() => {
    // Primera carga con caché de esta cuenta: se enseña y se revisa detrás.
    // Cambiar orden o búsqueda sí vuelve al esqueleto, como antes.
    const keep = firstLoad.current && rows !== null;
    firstLoad.current = false;
    if (!keep) setRows(null);
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') { setGate('loading'); setRows(null); void load(); }
    });
    return () => { generation.current++; sub.subscription.unsubscribe(); };
  }, [load]);

  // Recuerda el id del primer hilo cargado: es la referencia para saber
  // cuántos hilos "más nuevos" han llegado desde entonces.
  useEffect(() => { topIdRef.current = rows?.[0]?.id ?? null; }, [rows]);

  // Sondeo en segundo plano (mejora 20): solo en Recientes sin búsqueda activa,
  // que es donde "hilo más nuevo que el primero" tiene sentido. Fail-soft: un
  // fallo de red simplemente no actualiza la píldora.
  useEffect(() => {
    if (gate !== 'ok' || !uni || sort !== 'recent' || search) { setNewAvailable(0); return; }
    const iv = setInterval(async () => {
      try {
        const fresh = (await getThreads(uni.id, { limit: PAGE, offset: 0, sort: 'recent' })).rows;
        const topId = topIdRef.current;
        if (!topId) return;
        const idx = fresh.findIndex(r => r.id === topId);
        setNewAvailable(idx === -1 ? fresh.length : idx);
      } catch { /* sin red: se reintenta en el siguiente ciclo */ }
    }, 45000);
    return () => clearInterval(iv);
  }, [gate, uni, sort, search]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Tocar la píldora "N nuevas": refresca desde arriba y fuerza el remontaje
  // del FlatList para que el scroll quede en la primera publicación.
  const onPressNew = useCallback(async () => {
    setNewAvailable(0);
    await load();
    setRemountKey(k => k + 1);
  }, [load]);

  // Scroll infinito: offset = hilos ya cargados; hay más mientras la página venga completa.
  const loadMore = useCallback(async () => {
    if (pageBusy.current || gate !== 'ok' || !uni || !rows || !hasMore || loadError) return;
    const current = generation.current;
    pageBusy.current = true; setLoadingMore(true); setMoreError(false);
    try {
      const page = (await getThreads(uni.id, { limit: PAGE, offset: nextOffset.current, search, sort })).rows;
      if (current !== generation.current) return;
      nextOffset.current += page.length;
      setRows(prev => {
        const seen = new Set((prev ?? []).map(r => r.id));
        return [...(prev ?? []), ...page.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })];
      });
      setHasMore(page.length === PAGE);
    } catch { if (current === generation.current) setMoreError(true); }
    finally { if (current === generation.current) { pageBusy.current = false; setLoadingMore(false); } }
  }, [gate, uni, rows, hasMore, loadError, search, sort]);

  const onDeleted = useCallback((threadId: string) => {
    // El hueco del post borrado se cierra con animación (salvo con "reducir
    // movimiento") en vez de que la lista pegue un salto seco.
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRows(prev => (prev ?? []).filter(r => r.id !== threadId));
    void load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast('Publicación eliminada');
  }, [reduceMotion, load]);

  // Cada publicación entra en cascada (FadeIn con su índice): las primeras se
  // escalonan y a partir de la 12 entran ya sin retraso.
  const renderItem = useCallback(({ item, index }: { item: FomoThread; index: number }) => (
    <FadeIn index={index} distance={12}>
      <Post t={item}
        followed={item.author?.id && !item.author.is_organization ? following.has(item.author.id) : false}
        saved={savedIds.has(item.id)}
        hasStory={item.author?.id && !item.author.is_organization ? storyAuthors.has(item.author.id) : false}
        amAdmin={amAdmin}
        onToggleSave={onToggleSave}
        onFollowChange={onFollowChange}
        onDeleted={onDeleted}
        onOpenImage={openImage} />
    </FadeIn>
  ), [following, savedIds, storyAuthors, amAdmin, onToggleSave, onFollowChange, onDeleted, openImage]);
  const keyExtractor = useCallback((item: FomoThread) => item.id, []);

  // Cabecera de la lista: stories + carrusel de espacios + buscador + orden.
  // Depende de "hay filas" y no de las filas: antes cada página nueva o cada
  // borrado rehacía toda la cabecera (historias, tira de hoy, carrusel...).
  const hasRows = !!rows && rows.length > 0;
  const header = useMemo(() => (
    <>
      <StoriesBar onActiveAuthors={setStoryAuthors} />
      <TodayStrip />
      <CardPromoIfEligible style={{ marginHorizontal: S.lg, marginTop: S.md }} />
      <SpacesCarousel />
      <DiscoverChecklist compact />
      <View style={{ paddingTop: S.md }}>
        <SearchBar value={query} onChange={setQuery} placeholder={trans('feed.searchPlaceholder')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.sm }}>
          {SORTS.map(s => (
            <Chip key={s.key} label={s.label()} active={sort === s.key} accessibilityRole="tab" onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>
      </View>
      {loadError && hasRows ? (
        // Refresco fallido con contenido previo: aviso discreto, sin vaciar.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: S.lg, marginBottom: S.sm, padding: 10, borderRadius: R.md, backgroundColor: `${C.warning}1F` }}>
          <WifiOff size={16} color={C.warning} strokeWidth={2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>Sin conexión: esto es lo último que cargamos.</Text>
        </View>
      ) : null}
    </>
  ), [query, sort, loadError, hasRows]);

  const footer = useMemo(() => (
    loadingMore ? <ActivityIndicator color={C.muted} style={{ paddingVertical: 18 }} /> : moreError ? <View style={{ padding: S.lg, gap: 8 }}><Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se pudo cargar la siguiente página.</Text><Tap onPress={loadMore} accessibilityLabel="Reintentar carga" style={{ minHeight: 44, justifyContent: 'center' }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body,{color:C.blue}]}>Reintentar</Text></Tap></View> : null
  ), [loadingMore, moreError, loadMore]);

  // Estado mientras carga: esqueletos con la silueta real de un post.
  const loadingHeader = useMemo(() => (
    <>
      <SpacesCarousel />
      <DiscoverChecklist compact />
      <View style={{ paddingTop: S.sm }}><PostSkeleton /><PostSkeleton /></View>
    </>
  ), []);

  const screenChrome = {
    // Interruptor Fomo/Crush: las dos comparten la pestaña "Inicio".
    logo: <HomeSwitch active="fomo" />,
    right: (
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <Tap onPress={() => router.push('/(tabs)/explorar')} accessibilityLabel={trans('tabs.search')} hitSlop={12}>
          <Search size={23} color={C.text} strokeWidth={1.75} />
        </Tap>
        <Tap onPress={() => router.push({ pathname: '/publicar', params: { type: 'thread' } })} accessibilityLabel={trans('feed.createPost')} hitSlop={12}>
          <PenSquare size={23} color={C.text} strokeWidth={1.75} />
        </Tap>
        <Tap onPress={() => router.push('/notificaciones')} accessibilityLabel="Notificaciones" hitSlop={12}>
          <Bell size={23} color={C.text} strokeWidth={1.75} />
        </Tap>
      </View>
    ),
    refreshing, onRefresh: refresh,
    scrollTopKey: 'feed',
  };

  // Gates a pantalla completa (cargando / sin sesión / sin universidad): el
  // carrusel no aplica, así que usamos la variante clásica con children.
  if (gate === 'loading' || rows === null) {
    return (
      <Screen {...screenChrome}>
        {loadingHeader}
      </Screen>
    );
  }
  if (gate === 'no-auth') {
    return (
      <Screen {...screenChrome}>
        <SpacesCarousel />
      <DiscoverChecklist compact />
        <EmptyState icon={Lock} title={trans('feed.noAuthTitle')}
          subtitle={trans('feed.noAuthBody')}
          cta={trans('common.loginCta')} onCta={() => router.push('/welcome')} />
      </Screen>
    );
  }
  if (gate === 'no-uni') {
    return (
      <Screen {...screenChrome}>
        <SpacesCarousel />
      <DiscoverChecklist compact />
        <EmptyState icon={School} title={trans('feed.noUniTitle')}
          subtitle={trans('feed.noUniBody')}
          cta={trans('feed.completeProfile')} onCta={() => router.push('/perfil')} />
      </Screen>
    );
  }

  // Feed cargado: lista virtualizada con el carrusel como cabecera.
  return (
    <>
      <Screen<FomoThread>
        key={remountKey}
        {...screenChrome}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={moreError ? undefined : loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loadError ? (
            <EmptyState icon={WifiOff} title="No se pudo cargar el Fomo"
              subtitle="Revisa tu conexión e inténtalo de nuevo."
              cta="Reintentar" onCta={refresh} />
          ) : search ? (
            <EmptyState icon={MessageCircle} title={trans('feed.emptySearchTitle')}
              subtitle={trans('feed.emptySearchBody', { query: search })} />
          ) : (
            <EmptyState icon={MessageCircle} title={trans('feed.emptyTitle')}
              subtitle={trans('feed.emptyBody', { uni: uni?.name ?? trans('feed.yourCampus') })}
              cta={trans('feed.createPost')} onCta={() => router.push({ pathname: '/publicar', params: { type: 'thread' } })} />
          )
        }
      />
      {/* Píldora flotante "N nuevas" (mejora 20): toca para subir arriba y refrescar. */}
      {newAvailable > 0 ? (
        <NewPostsPill count={newAvailable} onPress={onPressNew} top={insets.top + 54} />
      ) : null}
      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </>
  );
}
