// ─── Ficha de una comunidad: cabecera + muro de publicaciones (56/66/85) ───
// Cabecera con imagen/nombre/descripción/miembros y botón Unirme/Salir. El
// muro son las publicaciones de la comunidad; solo los miembros pueden
// publicar (RLS de community_posts_member_insert en la migración 138).
//
// Diseño: portada con velo oscuro para que el título se lea encima, píldoras de
// tipo/privacidad, dato clave (miembros) y una sola acción principal.
// Publicaciones como tarjetas del kit y compositor con la misma barra que el
// chat (campo en píldora + enviar en violeta sólido). Los errores van por toast;
// las confirmaciones destructivas (salir) siguen con Alert nativo.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, RefreshControl, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  Users, GraduationCap, Building2, BookOpen, Heart, Send, Camera, X, Lock, Pencil, MessageSquare, type LucideIcon,
} from 'lucide-react-native';
import { Header } from '@/components/Screen';
import { SocialSafetyMenu } from '@/components/SocialSafetyMenu';
import { useSocialModerationRefresh } from '@/lib/social-moderation';
import { FadeIn } from '@/components/motion';
import { Tap, Skeleton, Pill, Btn, EmptyState, Avatar, Card } from '@/components/ui';
import {
  getCommunity, getCommunityPosts, joinCommunity, leaveCommunity, createCommunityPost, declineCommunityInvitation,
  kindLabel, COMMUNITY_POSTS_PAGE_SIZE,
  type CommunityDetail, type CommunityPost, type CommunityKind,
} from '@/lib/communities';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { timeAgo } from '@/lib/format';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { C, S, F, R, FONT } from '@/theme';

const KIND_ICON: Record<CommunityKind, LucideIcon> = {
  carrera: GraduationCap,
  residencia: Building2,
  estudio: BookOpen,
  aficion: Heart,
};

// Publicación del muro como tarjeta. Memoizada: el muro se repinta al
// paginar y solo deben pintarse las tarjetas nuevas.
const PostCard = React.memo(function PostCard({ p, onSuppressed }: { p: CommunityPost; onSuppressed: () => void }) {
  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.author_name} uri={p.author_avatar} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{p.author_name ?? 'Estudiante'}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{timeAgo(p.created_at)}{p.is_mine ? ' · tú' : ''}</Text>
        </View>
        {p.is_mine ? <Pill label="Tuya" tone="blue" /> : null}
        {!p.is_mine && <SocialSafetyMenu kind="community_post" id={p.id} onSuppressed={onSuppressed} />}
      </View>
      {p.body ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 8 }]}>{p.body}</Text> : null}
      {p.image_url ? (
        <Image source={{ uri: p.image_url }} recyclingKey={p.id}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: R.md, backgroundColor: C.input, marginTop: 10, borderWidth: 0.5, borderColor: C.border }}
          contentFit="cover" cachePolicy="memory-disk" transition={120} accessibilityLabel="Foto de la publicación" />
      ) : null}
    </Card>
  );
});

export default function ComunidadDetalle() {
  const { uid, isCurrent } = useSessionIdentity();
  if (uid === undefined) return <ActivityIndicator color={C.blue} />;
  return <CommunityDetailScreen key={uid ?? 'signed-out'} isCurrent={isCurrent} />;
}

function CommunityDetailScreen({ isCurrent }: { isCurrent(): boolean }) {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const communityId = String(id);

  const [community, setCommunity] = useState<CommunityDetail | null | undefined>(undefined);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [text, setText] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [posting, setPosting] = useState(false);
  const offsetRef = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  // Fallo de red al cargar: se distingue de "no hay nada" para no confundir.
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadCommunity = useCallback(async () => {
    setCommunity(undefined);
    try { const loaded = await getCommunity(communityId); if (isCurrent()) setCommunity(loaded); }
    catch { if (isCurrent()) setCommunity(null); }
  }, [communityId, isCurrent]);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const page = await getCommunityPosts(communityId, { offset: 0 });
      setPosts(page.rows); setLoadError(!page.ok);
      offsetRef.current = page.rows.length;
      setHasMore(page.rows.length === COMMUNITY_POSTS_PAGE_SIZE);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingPosts(false);
      setRefreshing(false);
    }
  }, [communityId]);

  useEffect(() => { loadCommunity(); loadPosts(); }, [loadCommunity, loadPosts]);
  useSocialModerationRefresh(() => { loadCommunity(); void loadPosts(); });

  const loadMorePosts = useCallback(async () => {
    if (loadingPosts || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getCommunityPosts(communityId, { offset: offsetRef.current });
      setPosts((prev) => [...prev, ...page.rows]);
      offsetRef.current += page.rows.length;
      setHasMore(page.rows.length === COMMUNITY_POSTS_PAGE_SIZE);
    } catch {
      // Sin red al paginar: se reintenta al volver a llegar al final.
    } finally {
      setLoadingMore(false);
    }
  }, [communityId, loadingPosts, loadingMore, hasMore]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCommunity();
    loadPosts();
  }, [loadCommunity, loadPosts]);

  if (community === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Comunidad" back />
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
          <Skeleton height={190} radius={0} style={{ marginHorizontal: 0, marginBottom: S.lg }} />
          <Skeleton height={26} style={{ width: '60%' }} />
          <Skeleton height={16} style={{ width: '85%' }} />
          <Skeleton height={48} style={{ marginTop: S.sm }} />
          <Skeleton height={110} radius={R.lg} style={{ marginTop: S.lg }} />
          <Skeleton height={110} radius={R.lg} />
        </View>
      </View>
    );
  }
  if (community === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Comunidad" back />
        <EmptyState icon={Users} title="No se pudo cargar"
          subtitle="Esta comunidad ya no está disponible o falla tu conexión. Inténtalo de nuevo."
          cta="Reintentar" onCta={loadCommunity} />
      </View>
    );
  }

  const Icon = KIND_ICON[community.kind] ?? Users;
  const members = `${community.member_count} ${community.member_count === 1 ? 'miembro' : 'miembros'}`;

  // Unirse es directo; salir es destructivo y lleva confirmación nativa.
  const toggleMembership = async () => {
    if (!isCurrent() || joining) return;
    if (community.is_member) {
      Alert.alert('Salir de la comunidad', `Dejarás de ver el muro de ${community.name} y de poder publicar en él.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir', style: 'destructive',
          onPress: async () => {
            if (!isCurrent()) return;
            setJoining(true);
            try {
              const res = await leaveCommunity(communityId);
              if (!isCurrent()) return;
              if (res.ok) {
                setPosts([]);
                toast('Has salido de la comunidad');
                router.replace('/comunidades');
              } else {
                toastError('No se pudo salir', 'Inténtalo de nuevo en unos segundos.');
              }
            } catch {
              toastError('No se pudo salir', 'Revisa tu conexión e inténtalo de nuevo.');
            } finally {
              setJoining(false);
            }
          },
        },
      ]);
      return;
    }
    setJoining(true);
    try {
      const res = await joinCommunity(communityId);
      if (!isCurrent()) return;
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await Promise.all([loadCommunity(), loadPosts()]);
        if (res.requested) toast('Solicitud enviada', 'El equipo de la comunidad revisará tu solicitud.');
        else toast('Ya estás dentro', 'Ahora puedes publicar en el muro.');
      } else {
        toastError('No se pudo unir', res.message ?? 'Inténtalo de nuevo en unos segundos.');
      }
    } catch {
      toastError('No se pudo unir', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setJoining(false);
    }
  };

  const pickPhoto = async () => {
    if (uploadingPhoto) return;
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    } catch {
      toastError('No se pudo abrir el carrete');
      return;
    }
    if (res.canceled || !res.assets?.[0]) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toastInfo('Inicia sesión', 'Necesitas una cuenta para publicar.'); return; }
    setUploadingPhoto(true);
    // finally: si la subida lanza, el icono de la cámara se quedaba girando.
    try {
      const up = await uploadPickedImage('community-media', user.id, res.assets[0], 5 * 1024 * 1024);
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setPhotoUrl(up.publicUrl);
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const canPost = (text.trim().length > 0 || !!photoUrl) && !posting && !uploadingPhoto;

  const submitPost = async () => {
    if (!canPost) return;
    setPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const res = await createCommunityPost(communityId, text.trim() || null, photoUrl);
      if (!res.ok) {
        toastError('No se pudo publicar', res.message ?? 'Inténtalo de nuevo en unos segundos.');
        return;
      }
      setText('');
      setPhotoUrl(null);
      toast('Enviado a revisión', { body: 'Se mostrará cuando comprobemos que cumple las normas.' });
      loadPosts();
    } catch {
      toastError('No se pudo publicar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setPosting(false);
    }
  };

  const iconBtn = { width: 40, height: 40, borderRadius: 20, backgroundColor: C.input, alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={community.name} subtitle={`${kindLabel(community.kind)} · ${members}`} back
        right={community.is_mine ? (
          // Quien la creó puede cambiar foto, nombre, tipo y descripción.
          <Tap onPress={() => router.push(`/comunidad-editar?id=${community.id}`)} accessibilityLabel="Editar comunidad"
            accessibilityHint="Cambia la foto, el nombre o la descripción" hitSlop={6}
            style={{ width: 34, height: 38, alignItems: 'center', justifyContent: 'center' }}>
            <Pencil size={19} color={C.text} strokeWidth={1.9} />
          </Tap>
        ) : <SocialSafetyMenu kind="community" id={community.id} onSuppressed={() => router.replace('/comunidades')} />} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) loadMorePosts();
          }}
          scrollEventThrottle={300}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} colors={[C.blue]} />}>
          {/* Portada: foto dentro de un marco con esquinas y hairline; el
              nombre y las etiquetas van DEBAJO, sobre el fondo de la app. */}
          <FadeIn>
            <View style={{
              height: 180, marginHorizontal: S.lg, marginTop: S.md, borderRadius: R.xl, overflow: 'hidden',
              backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
            }}>
              {community.image_url ? (
                <Image source={{ uri: community.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150}
                  accessibilityLabel={`Foto de ${community.name}`} />
              ) : (
                <Icon size={52} color={C.muted} strokeWidth={1.3} />
              )}
            </View>
          </FadeIn>

          <FadeIn index={1}>
          <View style={{ paddingHorizontal: S.lg, paddingTop: 16, paddingBottom: 6, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={kindLabel(community.kind)} tone="blue" icon={Icon} />
              {community.is_private ? <Pill label="Privada" icon={Lock} /> : null}
              {community.is_member ? <Pill label="Miembro" tone="green" /> : null}
            </View>
            <Text maxFontSizeMultiplier={1.3} accessibilityRole="header"
              style={{ fontSize: 28, fontFamily: FONT.display, color: C.text, letterSpacing: -1, lineHeight: 32 }} numberOfLines={3}>
              {community.name}
            </Text>
            {community.description ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{community.description}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Users size={15} color={C.muted} strokeWidth={1.75} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.text }]}>{members}</Text>
            </View>
            {(community.join_policy === 'invite' || (!community.join_policy && community.is_private)) && !community.is_member && community.admission_status !== 'invited' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, padding: 12 }}>
                <Lock size={16} color={C.muted} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>Comunidad privada: necesitas una invitación para entrar.</Text>
              </View>
            ) : (
              <Btn full
                label={community.is_member ? 'Salir de la comunidad' : community.admission_status === 'invited' ? 'Aceptar invitación' : community.admission_status === 'requested' ? 'Solicitud pendiente' : community.join_policy === 'request' ? 'Solicitar acceso' : 'Unirme'}
                variant={community.is_member ? 'ghost' : 'primary'}
                icon={community.is_member ? undefined : Users}
                busy={joining}
                disabled={!community.is_member && community.admission_status === 'requested'}
                onPress={toggleMembership}
              />
            )}
            {!community.is_member && community.admission_status === 'invited' && community.admission_id ? <Btn label="Declinar invitación" variant="ghost" disabled={joining} onPress={async () => {
              if (!isCurrent() || joining || !community.admission_id) return; setJoining(true);
              const declined = await declineCommunityInvitation(community.admission_id);
              if (!isCurrent()) return; setJoining(false);
              if (declined) router.replace('/comunidades'); else toastError('No se pudo declinar la invitación', 'Inténtalo de nuevo.');
            }} /> : null}
          </View>
          </FadeIn>

          {/* muro */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, marginTop: S.lg, marginBottom: S.sm }}>
            <MessageSquare size={16} color={C.text} strokeWidth={1.75} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={F.h2}>Muro</Text>
          </View>
          {loadingPosts ? (
            <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
              <Skeleton height={110} radius={R.lg} /><Skeleton height={110} radius={R.lg} />
            </View>
          ) : loadError && posts.length === 0 ? (
            <EmptyState compact icon={Users} title="No se pudo cargar el muro"
              subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={loadPosts} />
          ) : posts.length === 0 ? (
            <EmptyState compact icon={MessageSquare}
              title={community.is_member ? 'El muro está vacío' : 'Todavía no hay publicaciones'}
              subtitle={community.is_member ? 'Escribe lo primero: una duda, un plan o una foto.' : 'Únete y estrena el muro.'} />
          ) : (
            posts.map((p, i) => <FadeIn key={p.id} index={i} distance={10}><PostCard p={p} onSuppressed={() => setPosts(current => current.filter(item => item.id !== p.id))} /></FadeIn>)
          )}
          {loadingMore ? <ActivityIndicator color={C.muted} style={{ marginVertical: S.lg }} /> : null}
        </ScrollView>

        {/* compositor: solo miembros pueden publicar */}
        {community.is_member ? (
          <View style={{
            borderTopWidth: 0.5, borderTopColor: C.borderLight, backgroundColor: C.bg,
            paddingHorizontal: S.md, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8),
          }}>
            {photoUrl ? (
              <View style={{ marginBottom: 8, marginLeft: 4, alignSelf: 'flex-start' }}>
                <Image source={{ uri: photoUrl }} style={{ width: 72, height: 72, borderRadius: R.md, backgroundColor: C.input }} contentFit="cover" />
                <Tap onPress={() => setPhotoUrl(null)} accessibilityLabel="Quitar foto" hitSlop={8}
                  style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: C.border }}>
                  <X size={13} color={C.text} strokeWidth={2.4} />
                </Tap>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <Tap onPress={pickPhoto} disabled={uploadingPhoto} accessibilityLabel="Añadir foto a la publicación"
                accessibilityState={{ busy: uploadingPhoto }} style={iconBtn} hitSlop={8}>
                {uploadingPhoto ? <ActivityIndicator size="small" color={C.blue} /> : <Camera size={20} color={C.text} strokeWidth={1.9} />}
              </Tap>
              <View style={{ flex: 1, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.xl, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 }}>
                <TextInput
                  value={text} onChangeText={setText}
                  placeholder="Publica algo en el muro"
                  placeholderTextColor={C.muted} multiline maxLength={1000}
                  accessibilityLabel="Texto de la publicación"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  // Crece hasta 5 líneas y luego hace scroll, como el chat.
                  style={{ fontSize: 15, lineHeight: 21, color: C.text, maxHeight: 21 * 5 + 20, paddingVertical: Platform.OS === 'ios' ? 10 : 8, paddingTop: Platform.OS === 'ios' ? 10 : 8 }}
                />
              </View>
              <Tap hitSlop={8} onPress={canPost ? submitPost : undefined} disabled={!canPost} haptic
                accessibilityLabel="Publicar" accessibilityState={{ busy: posting }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: canPost ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}>
                  {posting
                    ? <ActivityIndicator size="small" color={C.onAccent} />
                    : <Send size={18} color={canPost ? C.onAccent : C.muted} strokeWidth={2} style={{ marginLeft: -2, marginTop: 1 }} />}
                </View>
              </Tap>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}
