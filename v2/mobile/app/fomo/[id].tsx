// ─── Detalle de hilo Fomo: comentarios reales + responder ───────────────
// get_fomo_thread devuelve el hilo con sus replies; create_fomo_reply publica.
// El hilo va como cabecera de un FlatList de comentarios (un hilo popular
// puede tener cientos) y el compositor queda fijo abajo, sobre el teclado.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, FlatList,
  RefreshControl, Animated, Pressable, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Heart, Send, CornerUpLeft, X, MoreHorizontal, MessageCircle, EyeOff, WifiOff, Play } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Screen';
import { Avatar, Tap, Skeleton, OptionsSheet, EmptyState, Chip } from '@/components/ui';
import { AudioNote, ThreadPoll, RichText, SendPostSheet } from '@/components/fomo';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Lightbox } from '@/components/Lightbox';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { toggleFomoReaction } from '@/lib/api';
import { timeAgo, buildQuotedReply, splitQuotedReply } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, F, R, FONT, SHADOW } from '@/theme';
import type { FomoThread } from '@/lib/types';
import { hideSocialContent, confirmSocialAction, useSocialModerationRefresh } from '@/lib/social-moderation';
import { ensureCommunityTerms } from '@/lib/community-terms';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { requestPublicationReview } from '@/lib/publication-review';

const MEDIA_HEIGHT = 340;

// Resultado de búsqueda de menciones (mejora 63): id + lo mínimo para pintar
// la fila del desplegable. Se busca en public_profiles (vista sin PII, RLS de
// profiles solo deja leer la fila propia) en vez de profiles directamente.
type MentionHit = { id: string; full_name: string | null; avatar_url: string | null };

// Detecta un "@algo" sin espacios al final del texto (lo que se está
// escribiendo ahora mismo). \p{L}\d_ coincide con el token que resalta
// parseRichText en format.ts (no admite espacios ni puntos).
const MENTION_TRIGGER = /(?:^|\s)@([\p{L}\d_]{1,30})$/u;

type Reply = {
  id: string; body: string | null; media_url: string | null; media_type: string | null;
  is_anonymous: boolean; created_at: string; is_mine: boolean;
  author: { full_name: string | null; avatar_url: string | null; is_organization?: boolean; verified?: boolean } | null;
};
type ThreadDetail = FomoThread & { replies: Reply[] };

// Estado de "me gusta" de un comentario: cuenta + si yo lo he dado.
type ReplyLikeState = { count: number; liked: boolean };
const NO_LIKE: ReplyLikeState = { count: 0, liked: false };

// Likes de comentarios (fomo_reply_reactions, migración 129). No hay RPC
// todavía, así que se consulta la tabla directa: RLS permite SELECT a todo
// autenticado y solo el propio usuario inserta/borra su fila. Fail-soft: si la
// tabla no existe aún en prod, se devuelve el mapa vacío sin romper la pantalla.
async function loadReplyLikes(replyIds: string[]): Promise<Record<string, ReplyLikeState>> {
  if (!replyIds.length) return {};
  try {
    // Identidad de sesión en memoria: auth.getUser iba a la red y retenía el
    // candado de auth justo mientras se abría el hilo.
    const viewer = captureSessionIdentity();
    const user = viewer ? { id: viewer.userId } : null;
    const { data, error } = await supabase
      .from('fomo_reply_reactions').select('reply_id, user_id').in('reply_id', replyIds);
    if (error || !data) return {};
    const map: Record<string, ReplyLikeState> = {};
    for (const id of replyIds) map[id] = { count: 0, liked: false };
    for (const row of data as { reply_id: string; user_id: string }[]) {
      const st = map[row.reply_id] ?? (map[row.reply_id] = { count: 0, liked: false });
      st.count += 1;
      if (user && row.user_id === user.id) st.liked = true;
    }
    return map;
  } catch {
    return {};
  }
}

// Corazón con latido (muelle) al dar me gusta; sin animación con "reducir movimiento".
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

// Fila de comentario en memo: dar me gusta a uno no repinta los demás.
const ReplyRow = React.memo(function ReplyRow({ r, like, onLike, onReply, index = 0 }: {
  r: Reply; like: ReplyLikeState; onLike: (id: string) => void; onReply: (r: Reply) => void; index?: number;
}) {
  const { scale, beat } = useHeartBeat();
  const router = useRouter();
  const [moderationOpen, setModerationOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const rname = r.is_anonymous ? 'Anónimo' : (r.author?.full_name ?? 'Estudiante');
  // Cita incrustada (mejora 19): si el body empieza con "↩ autor: "texto"",
  // se separa en un bloque citado + el texto propio de la respuesta.
  const quoted = r.body ? splitQuotedReply(r.body) : null;
  const text = quoted ? quoted.text : r.body;
  return suppressed ? null : (
    <FadeIn index={index} distance={10}>
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
      <Avatar name={r.is_anonymous ? '?' : rname} uri={r.is_anonymous ? null : r.author?.avatar_url} size={34} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.username} numberOfLines={1}>{rname}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{r.author?.is_organization ? r.author.verified ? '✓ Universidad verificada · ' : 'Organización · ' : ''}{timeAgo(r.created_at)}{r.is_mine ? ' · tú' : ''}</Text>
          {!r.is_mine && <Tap onPress={() => setModerationOpen(true)} accessibilityLabel="Opciones del comentario" hitSlop={10}>
            <MoreHorizontal size={18} color={C.muted} />
          </Tap>}
        </View>
        {quoted ? (
          <View style={{ marginTop: 4, borderLeftWidth: 2, borderLeftColor: C.blue, paddingLeft: 8 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={2}>{quoted.quoteAuthor}: &quot;{quoted.quoteText}&quot;</Text>
          </View>
        ) : null}
        {text ? <RichText text={text} style={[F.body, { marginTop: 2 }]} /> : null}
        {/* Acciones del comentario: me gusta + responder (citando), mejora 19 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 6 }}>
          {/* El latido solo al DAR me gusta: al quitarlo no hay nada que celebrar. */}
          <Pressable onPress={() => { if (!like.liked) beat(); onLike(r.id); }} hitSlop={10} accessibilityRole="button"
            accessibilityLabel={like.liked ? 'Quitar me gusta al comentario' : 'Me gusta al comentario'}
            accessibilityState={{ selected: like.liked }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }}>
            <Animated.View style={{ transform: [{ scale }] }}>
              <Heart size={16} color={like.liked ? C.red : C.muted} fill={like.liked ? C.red : 'transparent'} strokeWidth={1.9} />
            </Animated.View>
            {like.count > 0 ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontFamily: FONT.semibold }]}>{like.count}</Text> : null}
          </Pressable>
          <Tap onPress={() => onReply(r)} accessibilityLabel={`Responder a ${rname}`} hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }}>
            <CornerUpLeft size={15} color={C.muted} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontFamily: FONT.semibold }]}>Responder</Text>
          </Tap>
        </View>
      </View>
    </View>
    <OptionsSheet visible={moderationOpen} onClose={() => setModerationOpen(false)} options={[
      { label: 'Denunciar comentario', destructive: true, onPress: () => void confirmSocialAction('fomo_reply', r.id, false, () => setSuppressed(true)) },
      { label: 'Ocultar comentario', onPress: () => void hideSocialContent('fomo_reply', r.id, () => setSuppressed(true)) },
      { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
      ...(!r.author?.is_organization ? [{ label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('fomo_reply', r.id, true, () => setSuppressed(true)) }] : []),
    ]} />
    </FadeIn>
  );
});

// Esqueleto con la silueta del hilo: cabecera, texto, foto y dos comentarios.
function DetailSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}
      style={{ paddingHorizontal: S.lg, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Skeleton height={36} radius={18} style={{ width: 36, marginBottom: 0, marginHorizontal: 0 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton height={12} radius={6} style={{ width: '45%', marginBottom: 0, marginHorizontal: 0 }} />
          <Skeleton height={10} radius={5} style={{ width: '30%', marginBottom: 0, marginHorizontal: 0 }} />
        </View>
      </View>
      <Skeleton height={14} radius={7} style={{ width: '92%', marginBottom: 6, marginHorizontal: 0 }} />
      <Skeleton height={14} radius={7} style={{ width: '70%', marginBottom: 12, marginHorizontal: 0 }} />
      <Skeleton height={MEDIA_HEIGHT} radius={R.lg} style={{ marginBottom: 20, marginHorizontal: 0 }} />
      {[0, 1].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Skeleton height={32} radius={16} style={{ width: 32, marginBottom: 0, marginHorizontal: 0 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={11} radius={5} style={{ width: '35%', marginBottom: 0, marginHorizontal: 0 }} />
            <Skeleton height={13} radius={6} style={{ width: '85%', marginBottom: 0, marginHorizontal: 0 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function FomoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<ThreadDetail | null | undefined>(undefined);
  // Fallo de red al cargar (distinto de "el hilo no existe"): ofrece reintentar.
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Comentario al que se está respondiendo (mejora 19, cita). Solo vive en el
  // cliente: se incrusta como texto en el body del reply (ver format.ts).
  const [quoting, setQuoting] = useState<Reply | null>(null);
  // Likes por comentario (id de reply → {count, liked}); se recarga tras load().
  const [replyLikes, setReplyLikes] = useState<Record<string, ReplyLikeState>>({});
  const replyLikesRef = useRef(replyLikes);
  useEffect(() => { replyLikesRef.current = replyLikes; }, [replyLikes]);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<Reply>>(null);
  // Menú "..." del hilo (mejora 59): por ahora solo "Enviar por privado".
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  // Autocompletado de menciones (mejora 63): mentionQuery !== null mientras se
  // está escribiendo un "@algo" al final del texto; null = desplegable cerrado.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionHit[]>([]);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_fomo_thread', { p_thread_id: String(id) });
      if (error) {
        if (error.message?.includes('auth required')) {
          Alert.alert('Inicia sesión', 'El Fomo es solo para estudiantes con cuenta.', [
            { text: 'Volver', onPress: () => router.back() },
            { text: 'Entrar', onPress: () => router.push('/welcome') },
          ]);
          setT(null);
          return;
        }
        // Un error de red no es "no existe": se deja reintentar.
        setLoadError(true);
        setT((prev) => (prev === undefined ? null : prev));
        return;
      }
      setLoadError(false);
      const detail = (data as unknown as ThreadDetail) ?? null;
      setT(detail);
      if (detail?.replies.length) {
        loadReplyLikes(detail.replies.map((r) => r.id)).then(setReplyLikes);
      }
    } catch {
      setLoadError(true);
      setT((prev) => (prev === undefined ? null : prev));
    } finally {
      setRefreshing(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);
  useSocialModerationRefresh(load);

  const refresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // Tocar "Responder" en un comentario: prepara la cita y enfoca el compositor.
  const startReply = useCallback((r: Reply) => {
    Haptics.selectionAsync().catch(() => {});
    setQuoting(r);
    inputRef.current?.focus();
  }, []);

  // Me gusta de un comentario (fail-soft: optimista, revierte si falla). Lee el
  // estado del ref para que el callback sea estable y las filas en memo no se
  // repinten todas con cada like.
  const toggleReplyLike = useCallback(async (replyId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const prev = replyLikesRef.current[replyId] ?? NO_LIKE;
    const next: ReplyLikeState = { count: prev.count + (prev.liked ? -1 : 1), liked: !prev.liked };
    setReplyLikes((m) => ({ ...m, [replyId]: next }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('sin sesión');
      if (prev.liked) {
        const { error } = await supabase.from('fomo_reply_reactions').delete()
          .match({ reply_id: replyId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('fomo_reply_reactions')
          .insert({ reply_id: replyId, user_id: user.id });
        if (error) throw error;
      }
    } catch {
      setReplyLikes((m) => ({ ...m, [replyId]: prev })); // sin tabla/red: revertir
    }
  }, []);

  // Al escribir, si el texto termina en "@consulta" se abre el desplegable;
  // si no, se cierra. La búsqueda en sí va en el useEffect de abajo (debounce).
  const onChangeCommentText = useCallback((v: string) => {
    setText(v);
    const m = MENTION_TRIGGER.exec(v);
    setMentionQuery(m ? m[1] : null);
  }, []);

  // Búsqueda de gente para mencionar: public_profiles (vista sin PII que sí se
  // puede consultar por cualquiera, a diferencia de profiles, cuya RLS solo
  // deja leer la fila propia). Debounce corto y fail-soft: sin red o sin
  // migración, el desplegable simplemente se queda vacío.
  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); return; }
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('public_profiles')
          .select('id, full_name, avatar_url')
          .ilike('full_name', `%${mentionQuery}%`)
          .limit(8);
        if (!alive) return;
        if (error || !data) { setMentionResults([]); return; }
        setMentionResults(data as MentionHit[]);
      } catch {
        if (alive) setMentionResults([]);
      }
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [mentionQuery]);

  // Elegir una persona del desplegable: sustituye el "@consulta" final por
  // "@NombreCompleto" (sin espacios: el resaltado de RichText no admite
  // espacios dentro del token) y añade un espacio para seguir escribiendo.
  const pickMention = useCallback((hit: MentionHit) => {
    const clean = (hit.full_name ?? 'Estudiante').replace(/\s+/g, '');
    setText((prev) => prev.replace(MENTION_TRIGGER, (full) => {
      const lead = full.startsWith('@') ? '' : full.slice(0, 1);
      return `${lead}@${clean} `;
    }));
    setMentionQuery(null);
    inputRef.current?.focus();
  }, []);

  const reply = async () => {
    if (text.trim().length < 1 || busy) return;
    const owner = captureSessionIdentity();
    if (!owner) return;
    setBusy(true);
    try {
      if (!await ensureCommunityTerms() || !isCurrentSessionIdentity(owner)) return;
      // Citando un comentario: el texto citado se incrusta en el body (ver
      // buildQuotedReply en format.ts). Funciona con la RPC actual, sin depender
      // de que create_fomo_reply exponga parent_id todavía.
      const quotedName = quoting
        ? (quoting.is_anonymous ? 'Anónimo' : (quoting.author?.full_name ?? 'Estudiante'))
        : null;
      const body = quoting && quotedName
        ? buildQuotedReply(quotedName, quoting.body ?? '', text.trim())
        : text.trim();
      const { error, review } = await withOwnedRequest(owner, async request => {
        const result = await request.query(supabase.rpc('create_fomo_reply', {
          p_thread_id: String(id), p_body: body, p_is_anonymous: anonymous,
        }));
        request.check();
        return { error: result.error, review: !result.error && typeof result.data === 'string' ? await requestPublicationReview(request, result.data) : 'pending' };
      });
      if (error) {
        if (error.message?.includes('auth')) {
          Alert.alert('Inicia sesión', 'Necesitas una cuenta para comentar.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Entrar', onPress: () => router.push('/welcome') },
          ]);
        } else {
          toastError('No se pudo comentar', 'Inténtalo de nuevo en unos segundos.');
        }
        return;
      }
      if (review === 'rejected') { toastError('Comentario no admitido', 'Revisa las normas y modifica el mensaje.'); return; }
      if (review !== 'approved') toast('Enviado a revisión', 'Se mostrará cuando supere la revisión.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setText('');
      setQuoting(null);
      setMentionQuery(null);
      await load(); // números y comentarios reales del servidor
      // El comentario nuevo va al final: se lleva la lista hasta él.
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 250);
    } catch {
      toastError('No se pudo comentar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const renderReply = useCallback(({ item, index }: { item: Reply; index: number }) => (
    <ReplyRow r={item} index={index} like={replyLikes[item.id] ?? NO_LIKE} onLike={toggleReplyLike} onReply={startReply} />
  ), [replyLikes, toggleReplyLike, startReply]);
  const keyExtractor = useCallback((r: Reply) => r.id, []);

  const name = t ? (t.is_anonymous ? 'Anónimo' : (t.author?.full_name ?? 'Estudiante')) : '';
  const authorId = t && !t.is_anonymous && !t.author?.is_organization ? t.author?.id : undefined;

  // Cabecera de la lista: el hilo entero (autor, texto, media, encuesta, me gusta).
  const threadHeader = useMemo(() => {
    if (!t) return null;
    return (
      <View style={{ borderBottomWidth: 0.5, borderBottomColor: C.border, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10, gap: 10 }}>
          <Tap onPress={authorId ? () => router.push(`/perfil/${authorId}`) : undefined} disabled={!authorId}
            accessibilityLabel={authorId ? `Ver el perfil de ${name}` : name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar name={t.is_anonymous ? '?' : name} uri={authorId ? t.author?.avatar_url : null} size={40} />
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.username, { fontSize: 15 }]} numberOfLines={1}>{name}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t.is_anonymous ? 'Publicación anónima' : t.author?.is_organization ? t.author.verified ? '✓ Universidad verificada' : 'Organización' : 'Tu universidad'} · {timeAgo(t.created_at)}</Text>
            </View>
          </Tap>
        </View>
        {t.body ? <RichText text={t.body} style={[F.body, { paddingHorizontal: S.lg, marginBottom: 10 }]} /> : null}
        {t.media_url && t.media_type === 'image' ? (
          <Tap onPress={() => setLightboxUri(t.media_url)} accessibilityLabel="Ver la foto a pantalla completa"
            style={{ marginHorizontal: S.lg, marginBottom: 10, borderRadius: R.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border }}>
            <Image source={{ uri: t.media_url }} recyclingKey={t.id}
              style={{ width: '100%', height: MEDIA_HEIGHT, backgroundColor: C.input }}
              contentFit="cover" transition={150} cachePolicy="memory-disk" />
          </Tap>
        ) : t.media_url && t.media_type === 'video' ? (
          // Esta pantalla es a la que se llega al tocar un post desde la Lupa,
          // el perfil o los guardados: sin esta rama un vídeo solo se veía en el feed.
          <View style={{ marginHorizontal: S.lg, height: MEDIA_HEIGHT, marginBottom: 10 }}>
            <VideoPlayer uri={t.media_url} radius={R.lg} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, marginTop: 4 }}>
          <LikeButton threadId={t.id} initial={t.my_reaction} count={t.reaction_count} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginLeft: 'auto' }]}>
            {t.replies.length === 1 ? '1 comentario' : `${t.replies.length} comentarios`}
          </Text>
        </View>
      </View>
    );
  }, [t, name, authorId, router]);

  if (t === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Publicación" back />
        <DetailSkeleton />
      </View>
    );
  }
  if (t === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Publicación" back />
        {loadError ? (
          <EmptyState icon={WifiOff} title="No se pudo cargar"
            subtitle="Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={() => { setT(undefined); load(); }} />
        ) : (
          <EmptyState icon={MessageCircle} title="Esta publicación no está disponible"
            subtitle="Puede que se haya borrado o que ya no esté visible."
            cta="Volver al Fomo" onCta={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed'))} />
        )}
      </View>
    );
  }

  const canSend = text.trim().length > 0 && !busy;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Publicación" back right={
        <Tap onPress={() => setMenuOpen(true)} accessibilityLabel="Opciones de la publicación" hitSlop={10}>
          <MoreHorizontal size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
      } />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList<Reply>
          ref={listRef}
          data={t.replies}
          renderItem={renderReply}
          keyExtractor={keyExtractor}
          ListHeaderComponent={threadHeader}
          ListEmptyComponent={
            <EmptyState compact icon={MessageCircle} title="Sé quien empiece"
              subtitle="Todavía nadie ha comentado. Escribe abajo y arranca la conversación." />
          }
          ListFooterComponent={loadError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: S.lg, padding: 10, borderRadius: R.md, backgroundColor: `${C.warning}1F` }}>
              <WifiOff size={16} color={C.warning} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>Sin conexión: esto es lo último que cargamos.</Text>
            </View>
          ) : <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={9}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.blue} colors={[C.blue]} />}
        />

        {/* Compositor fijo abajo: cita activa, menciones, anónimo y campo de texto. */}
        <View style={{
          borderTopWidth: 0.5, borderTopColor: C.border, backgroundColor: C.bg,
          paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8),
        }}>
          {/* Cita activa (mejora 19): se puede cancelar sin perder lo escrito. */}
          {quoting ? (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
              backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 8,
              borderLeftWidth: 3, borderLeftColor: C.blue,
            }}>
              <CornerUpLeft size={13} color={C.blue} strokeWidth={2.2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]} numberOfLines={1}>
                Respondiendo a <Text style={{ fontFamily: FONT.semibold, color: C.text }}>{quoting.is_anonymous ? 'Anónimo' : (quoting.author?.full_name ?? 'Estudiante')}</Text>
              </Text>
              <Tap onPress={() => setQuoting(null)} accessibilityLabel="Cancelar respuesta" hitSlop={10}>
                <X size={16} color={C.muted} strokeWidth={2.2} />
              </Tap>
            </View>
          ) : null}
          {/* Autocompletado de menciones (mejora 63): aparece mientras se escribe
              un "@algo" al final del texto. Fail-soft, no bloquea el compositor. */}
          {mentionQuery !== null && mentionResults.length > 0 ? (
            <View style={[{
              backgroundColor: C.surface, borderRadius: R.md, marginBottom: 8, borderWidth: 0.5, borderColor: C.border,
              maxHeight: 190, overflow: 'hidden',
            }, SHADOW.card]}>
              <ScrollView keyboardShouldPersistTaps="always">
                {mentionResults.map((hit) => {
                  const hitName = hit.full_name ?? 'Estudiante';
                  return (
                    <Tap key={hit.id} onPress={() => pickMention(hit)} accessibilityLabel={`Mencionar a ${hitName}`}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44 }}>
                        <Avatar name={hitName} uri={hit.avatar_url} size={28} />
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontSize: 14 }]} numberOfLines={1}>{hitName}</Text>
                      </View>
                    </Tap>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {/* Anónimo como chip conmutable: más claro que un Switch diminuto y
                ocupa el mismo sitio que en el compositor de publicar. */}
            <Chip label="Anónimo" icon={EyeOff} active={anonymous} onPress={() => { Haptics.selectionAsync().catch(() => {}); setAnonymous((v) => !v); }}
              accessibilityHint={anonymous ? 'Tu comentario saldrá sin tu nombre' : 'Tu comentario saldrá con tu nombre'} />
            <TextInput
              ref={inputRef}
              value={text} onChangeText={onChangeCommentText}
              placeholder={quoting ? 'Escribe tu respuesta…' : 'Añade un comentario… (usa @ para mencionar)'}
              placeholderTextColor={C.muted} multiline maxLength={1000}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel="Escribe un comentario"
              style={{ flex: 1, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: C.text, maxHeight: 100, minHeight: 42 }}
            />
            <Tap hitSlop={8} onPress={reply} disabled={!canSend} accessibilityLabel="Enviar comentario" accessibilityState={{ busy }} haptic>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: canSend ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <ActivityIndicator color={C.muted} size="small" /> : <Send size={18} color={canSend ? C.onAccent : C.muted} strokeWidth={2} style={{ marginLeft: -2 }} />}
              </View>
            </Tap>
          </View>
        </View>
      </KeyboardAvoidingView>
      {/* Menú del hilo: enviar por privado (mejora 59). */}
      <OptionsSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={[
          { label: 'Enviar por privado', icon: Send, onPress: () => setSendOpen(true) },
          ...(!t.is_mine ? [
            { label: 'Denunciar publicación', destructive: true, onPress: () => void confirmSocialAction('fomo_thread', t.id, false, () => setT(null)) },
            { label: 'Ocultar publicación', onPress: () => void hideSocialContent('fomo_thread', t.id, () => setT(null)) },
            { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
            ...(!t.author?.is_organization ? [{ label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('fomo_thread', t.id, true, () => setT(null)) }] : []),
          ] : []),
        ]}
      />
      <SendPostSheet thread={sendOpen ? { id: t.id, body: t.body } : null} onClose={() => setSendOpen(false)} />
      <Lightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}

// Me gusta del hilo: estado por fila (no recarga todo el detalle al reaccionar,
// que antes hacía saltar la lista), corazón con latido y haptic.
function LikeButton({ threadId, initial, count }: { threadId: string; initial: boolean; count: number }) {
  const [liked, setLiked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { scale, beat } = useHeartBeat();
  const likes = count - (initial ? 1 : 0) + (liked ? 1 : 0);
  const toggle = async () => {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !liked;
    setLiked(next);
    if (next) beat();
    setBusy(true);
    try {
      const { ok } = await toggleFomoReaction(threadId);
      if (!ok) { setLiked(!next); toastError('No se pudo reaccionar', 'Inténtalo de nuevo en unos segundos.'); }
    } catch {
      setLiked(!next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={toggle} hitSlop={8} accessibilityRole="button"
      accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'} accessibilityState={{ selected: liked, busy }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Heart size={24} color={liked ? C.red : C.text} fill={liked ? C.red : 'transparent'} strokeWidth={1.9} />
      </Animated.View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: C.text }}>
        {likes > 0 ? (likes === 1 ? '1 me gusta' : `${likes} me gusta`) : 'Me gusta'}
      </Text>
    </Pressable>
  );
}
