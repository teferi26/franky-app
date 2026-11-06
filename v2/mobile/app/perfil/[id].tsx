// ─── Perfil público de otra persona ───────────────────────────────────────
// Datos de la vista public_profiles (legible por autenticados), contadores
// del grafo social (migración 123) y grid 3x3 con sus publicaciones NO
// anónimas del FOMO. Acciones: Seguir/Siguiendo, Mensaje (DM 1:1) y menú ⋯
// con Reportar (tabla user_reports, mismo esquema que la web) y Bloquear
// (tabla user_blocks, la que get_my_chats usa para ocultar conversaciones).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, Modal, FlatList, Pressable, Share, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { MoreVertical, Camera, UserX, X, Play, Link as LinkIcon, BadgeCheck, MapPin } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, Tap, EmptyState, OptionsSheet, Pill } from '@/components/ui';
import { GridTile } from '@/components/GridTile';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { getSocialCounts, isFollowingAs, listFollowLinks, toggleFollow, isVerifiedStudent, type SocialCounts } from '@/lib/social';
import { captureSessionIdentity } from '@/lib/session';
import { startDirectChat } from '@/lib/chat';
import { toast, toastError } from '@/lib/toast';
import { C, S, F, R, FONT } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

type PublicProfile = {
  id: string; full_name: string | null; avatar_url: string | null;
  bio: string | null; city: string | null; university_id: string | null;
  career: string | null; student_email_verified?: boolean | null;
};

type PublicPostFull = { id: string; body: string | null; media_url: string | null; media_type: string | null; created_at: string };

type FollowPerson = { id: string; full_name: string | null; avatar_url: string | null };

// Publicaciones por página (antes 90 de golpe) y pausa mínima entre recargas
// al volver a la pantalla.
const POSTS_PAGE = 30;
const FOCUS_RELOAD_MS = 15_000;

// Cifra que cuenta al montar, rotulo pequeno debajo y nada de recuadro. Fuera
// del componente: declarada dentro era un componente NUEVO en cada repintado,
// así que las cifras se desmontaban y volvían a contar desde cero cada vez.
function StatTap({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flex: 1, alignItems: 'center' }} accessibilityLabel={`${value} ${label}`}>
      <AnimatedNumber value={value} style={{ fontSize: 23, letterSpacing: -0.7 }} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: 3 }]}>{label}</Text>
    </Tap>
  );
}

// Razones del CHECK de user_reports (migración 010/111), con la misma
// etiqueta → enum que usa la web en useChat.ts para no divergir.
const REPORT_REASONS: { label: string; value: string }[] = [
  { label: 'Spam o publicidad', value: 'spam' },
  { label: 'Contenido inapropiado', value: 'contenido_ofensivo' },
  { label: 'Acoso o comportamiento abusivo', value: 'acoso' },
  { label: 'Suplantación de identidad', value: 'suplantacion' },
  { label: 'Otro motivo', value: 'otro' },
];

export default function PerfilPublico() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = String(id);
  const { width } = useWindowDimensions();

  const [myId, setMyId] = useState<string | null>(() => captureSessionIdentity()?.userId ?? null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const profileRef = useRef<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [uniName, setUniName] = useState<string | null>(null);
  const [counts, setCounts] = useState<SocialCounts>({ posts: 0, followers: 0, following: 0 });
  const [followed, setFollowed] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [posts, setPosts] = useState<PublicPostFull[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [followList, setFollowList] = useState<{ title: string; people: FollowPerson[] } | null>(null);
  // Motivos de denuncia en OptionsSheet: Alert en Android corta a 3 botones.
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 68: silenciar sin bloquear (tabla muted_users, migración 134). Fail-soft.
  const [menuOpen, setMenuOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelvan
  // las cargas, no hay setState (ni router.replace tardío) sobre un componente
  // desmontado. Ref y no variable local del efecto porque load se comparte
  // con el useFocusEffect de recarga.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Perfil propio: este es el perfil PÚBLICO; el tuyo vive en la pestaña.
  useEffect(() => {
    let vivo = true;
    // Sesión local (sin ir a la red): auth.getUser retenía el candado de auth
    // y todas las consultas del perfil esperaban a que volviera.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!vivo) return;
      const user = session?.user ?? null;
      if (user && user.id === userId) { router.replace('/(tabs)/perfil'); return; }
      setMyId(user?.id ?? null);
      // 19/70: registrar la visita a un perfil ajeno. Fire-and-forget y
      // fail-soft: si la RPC aún no existe en producción, no pasa nada.
      if (user) {
        supabase.rpc('register_profile_view', { p_profile: userId }).then(() => {}, () => {});
      }
    });
    return () => { vivo = false; };
  }, [userId, router]);

  const lastLoad = useRef(0);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // Todo lo independiente EN PARALELO. Antes iba en fila: perfil+contadores
  // (con un auth.getUser dentro), universidad, 90 publicaciones, intereses,
  // otro auth.getUser y silenciado; seis o siete idas y vueltas seguidas.
  const load = useCallback(async () => {
    const viewer = captureSessionIdentity()?.userId ?? null;
    try {
      const postsLimit = Math.min(Math.max(POSTS_PAGE, postsRef.current.length), POSTS_PAGE * 4);
      const [{ data: prof }, socials, following, postsRes, interestsRes, mutedRes] = await Promise.all([
        supabase.from('public_profiles')
          .select('id, full_name, avatar_url, bio, city, university_id, career, student_email_verified')
          .eq('id', userId).maybeSingle(),
        getSocialCounts(userId),
        isFollowingAs(viewer, userId),
        // Solo lo público: sin anónimas, sin borradas, sin ocultas por moderación.
        supabase.from('fomo_threads')
          .select('id, body, media_url, media_type, created_at')
          .eq('author_id', userId)
          .eq('is_anonymous', false).eq('is_deleted', false).eq('is_hidden', false)
          .order('created_at', { ascending: false })
          .limit(postsLimit),
        // Intereses: fail-soft aparte. La vista public_profiles puede no exponer
        // la columna en algunos entornos, así que un fallo aquí no rompe el perfil.
        Promise.resolve(supabase.from('public_profiles').select('interests').eq('id', userId).maybeSingle())
          .then(r => r, () => ({ data: null })),
        // 68: ¿ya le tengo silenciado? Fail-soft: si la tabla muted_users aún no
        // existe en producción (migración sin aplicar), se queda en false.
        viewer
          ? Promise.resolve(supabase.from('muted_users').select('muted_id').eq('muter_id', viewer).eq('muted_id', userId).maybeSingle())
            .then(r => r, () => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      if (!alive.current) return;
      if (!prof) { setNotFound(true); return; }
      profileRef.current = prof as PublicProfile;
      setProfile(prof as PublicProfile);
      setCounts(socials);
      setFollowed(following);
      const rows = (postsRes.data as PublicPostFull[] | null) ?? [];
      setPosts(rows);
      setHasMorePosts(rows.length === postsLimit);
      const arr = (interestsRes.data as { interests?: unknown } | null)?.interests;
      setInterests(Array.isArray(arr) ? (arr as string[]) : []);
      setMuted(Boolean(mutedRes.data));
      lastLoad.current = Date.now();

      // Nombre corto de la universidad (una sola fila, no el catálogo entero).
      if ((prof as PublicProfile).university_id) {
        const { data: uni } = await supabase.from('universities')
          .select('id, short_name, name')
          .eq('id', (prof as PublicProfile).university_id).maybeSingle();
        if (!alive.current) return;
        setUniName(uni?.short_name ?? uni?.name ?? null);
      }
    } catch {
      // Sin red: si ya había datos en pantalla se conservan; si no, aviso.
      if (!profileRef.current && alive.current) setNotFound(true);
    }
  }, [userId]);

  // Siguiente página de publicaciones (por fecha).
  const loadMorePosts = useCallback(async () => {
    const last = postsRef.current[postsRef.current.length - 1];
    if (!last || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const { data, error } = await supabase.from('fomo_threads')
        .select('id, body, media_url, media_type, created_at')
        .eq('author_id', userId)
        .eq('is_anonymous', false).eq('is_deleted', false).eq('is_hidden', false)
        .lt('created_at', last.created_at)
        .order('created_at', { ascending: false })
        .limit(POSTS_PAGE);
      if (!alive.current) return;
      if (error) { toastError('No se pudieron cargar más publicaciones', 'Inténtalo de nuevo.'); return; }
      const page = (data as PublicPostFull[] | null) ?? [];
      setPosts(prev => {
        const seen = new Set(prev.map(p => p.id));
        return [...prev, ...page.filter(p => !seen.has(p.id))];
      });
      setHasMorePosts(page.length === POSTS_PAGE);
    } catch {
      if (alive.current) toastError('No se pudieron cargar más publicaciones', 'Inténtalo de nuevo.');
    } finally {
      if (alive.current) setLoadingMorePosts(false);
    }
  }, [userId, loadingMorePosts]);

  // Recarga al volver (p. ej. tras seguirle desde otra pantalla).
  useFocusEffect(useCallback(() => {
    if (Date.now() - lastLoad.current < FOCUS_RELOAD_MS) return;
    void load();
  }, [load]));

  const onFollow = useCallback(async () => {
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const now = await toggleFollow(userId);
      setFollowed(now);
      setCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers + (now ? 1 : -1)) }));
    } catch (e) {
      Alert.alert('No se pudo completar', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
    }
    setFollowBusy(false);
  }, [userId, followBusy]);

  const onMessage = useCallback(async () => {
    // 67: comprobamos can_message_user antes de abrir el chat. Fail-soft: si
    // la RPC todavía no existe en producción (migración sin aplicar) o falla
    // por cualquier motivo, se comporta como hasta ahora (deja escribir).
    try {
      const { data: allowed, error } = await supabase.rpc('can_message_user', { p_target: userId });
      if (!error && allowed === false) {
        const name = profile?.full_name ?? 'Esta persona';
        Alert.alert(
          'No puedes escribirle todavía',
          `${name} solo recibe mensajes de quienes sigue o de estudiantes verificados. Si os seguís mutuamente o verificas tu email de estudiante, podrás escribirle.`,
        );
        return;
      }
    } catch { /* sin RPC: se comporta como hasta ahora */ }
    const chatId = await startDirectChat(userId);
    if (!chatId) { Alert.alert('No se pudo abrir el chat', 'Inténtalo de nuevo.'); return; }
    router.push({ pathname: '/chat/[id]', params: { id: chatId, title: profile?.full_name ?? 'Chat' } });
  }, [userId, router, profile]);

  const openFollowList = useCallback(async (kind: 'followers' | 'following') => {
    const people = await listFollowLinks(userId, kind);
    setFollowList({ title: kind === 'followers' ? 'Seguidores' : 'Siguiendo', people });
  }, [userId]);

  // ── Reportar: insert directo en user_reports (RLS: reporter_id = auth.uid).
  // El UNIQUE (reporter, reported, context, context_id) convierte el segundo
  // reporte en error de duplicado: lo tratamos como "ya recibido".
  const submitReport = useCallback(async (reason: string, label: string) => {
    if (!myId) { Alert.alert('Inicia sesión', 'Necesitas una cuenta para denunciar.'); return; }
    const { error } = await supabase.from('user_reports').insert({
      reporter_id: myId,
      reported_user_id: userId,
      context: 'profile',
      reason,
      description: label,
    });
    if (error && error.code !== '23505') {
      Alert.alert('No se pudo enviar', 'Inténtalo de nuevo en unos segundos.');
      return;
    }
    Alert.alert('Gracias', 'Hemos recibido tu denuncia. La revisaremos lo antes posible.');
  }, [myId, userId]);

  const reportProfile = useCallback(() => setReportOpen(true), []);

  // ── Denunciar la foto de perfil: RPC report_profile_photo (migración 140).
  // Una denuncia por persona (PK reporter+target): el duplicado se da por
  // recibido. Con 2 denuncias el perfil deja de salir en descubrimiento.
  const reportPhoto = useCallback(() => {
    if (!myId) { Alert.alert('Inicia sesión', 'Necesitas una cuenta para denunciar.'); return; }
    Alert.alert(
      'Denunciar foto de perfil',
      'Avisaremos al equipo para que la revise. Si acumula varias denuncias, este perfil dejará de aparecer hasta que la revisemos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Denunciar', style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('report_profile_photo', {
              p_target: userId, p_reason: 'Denunciada desde la app',
            });
            if (error && error.code !== '23505' && !error.message?.includes('duplicate')) {
              toastError('No se pudo enviar', 'Inténtalo de nuevo en unos segundos.');
              return;
            }
            toast('Gracias por avisar', 'Revisaremos la foto lo antes posible.');
          },
        },
      ],
    );
  }, [myId, userId]);

  // ── Silenciar sin bloquear (68): insert/delete directo en muted_users.
  // Es privado y asimétrico: el silenciado nunca se entera. Fail-soft si la
  // tabla aún no existe en producción.
  const toggleMute = useCallback(async () => {
    if (!myId) { Alert.alert('Inicia sesión', 'Necesitas una cuenta para silenciar.'); return; }
    const next = !muted;
    setMuted(next);
    try {
      if (next) {
        const { error } = await supabase.from('muted_users')
          .insert({ muter_id: myId, muted_id: userId });
        if (error && error.code !== '23505') throw error;
      } else {
        const { error } = await supabase.from('muted_users')
          .delete().eq('muter_id', myId).eq('muted_id', userId);
        if (error) throw error;
      }
    } catch {
      setMuted(!next);
      Alert.alert('No se pudo completar', 'Puede que esta función todavía no esté disponible. Inténtalo más tarde.');
    }
  }, [myId, userId, muted]);

  // ── Bloquear: insert en user_blocks. get_my_chats y los feeds sociales ya
  // excluyen a bloqueados en el backend, así que no hace falta nada más aquí.
  const blockUser = useCallback(() => {
    const name = profile?.full_name ?? 'esta persona';
    Alert.alert(
      `Bloquear a ${name}`,
      'Dejaréis de ver vuestros chats y no podrá contactarte. Puedes deshacerlo desde la web.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear', style: 'destructive',
          onPress: async () => {
            if (!myId) { Alert.alert('Inicia sesión', 'Necesitas una cuenta para bloquear.'); return; }
            const { error } = await supabase.from('user_blocks').insert({
              blocker_id: myId, blocked_id: userId,
            });
            if (error && error.code !== '23505') {
              Alert.alert('No se pudo bloquear', 'Inténtalo de nuevo.');
              return;
            }
            Alert.alert('Bloqueado', `Has bloqueado a ${name}.`, [
              { text: 'OK', onPress: () => { if (router.canGoBack()) router.back(); } },
            ]);
          },
        },
      ],
    );
  }, [myId, userId, profile, router]);

  // Compartir este perfil: enlace público (web) con la hoja del sistema.
  const profileUrl = `https://franky.es/perfil/${userId}`;
  const shareLink = useCallback(async () => {
    const name = profile?.full_name ?? 'este perfil';
    try {
      await Share.share({ message: `Mira ${name} en Franky: ${profileUrl}`, url: profileUrl });
    } catch { /* cancelado o sin hoja de compartir */ }
  }, [profileUrl, profile]);

  // Menú ⋯: OptionsSheet en vez de Alert.alert porque Android corta los
  // Alert a 3 botones y ya son 4 opciones (con Silenciar, 5).
  const openMenu = useCallback(() => setMenuOpen(true), []);

  const username = useMemo(
    () => (profile?.full_name ?? 'estudiante').toLowerCase().replace(/\s+/g, '.'),
    [profile],
  );
  const tile = (width - S.lg * 2 - 4) / 3;


  if (notFound) {
    return (
      <Screen title="Perfil" back>
        <EmptyState icon={UserX} title="Perfil no disponible"
          subtitle="Esta cuenta no existe o ya no está activa." />
      </Screen>
    );
  }

  if (!profile) return <Screen title="Perfil" back><View /></Screen>;

  return (
    <Screen
      back
      title={username}
      right={
        <Tap onPress={openMenu} accessibilityLabel="Opciones del perfil" hitSlop={10}>
          <MoreVertical size={24} color={C.text} strokeWidth={1.9} />
        </Tap>
      }>
      {/* Identidad de campus: avatar grande, universidad en rotulo, nombre grande */}
      <FadeIn>
        <View style={{ alignItems: 'center', paddingTop: S.xxl, paddingHorizontal: S.lg }}>
          <Avatar name={profile.full_name ?? 'Estudiante'} uri={profile.avatar_url} size={104} />
          {uniName || profile.career ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginTop: 16, textAlign: 'center' }]} numberOfLines={1}>
              {[uniName, profile.career].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 29, letterSpacing: -1, textAlign: 'center' }]} numberOfLines={1}>{profile.full_name ?? 'Estudiante'}</Text>
            {/* 65: badge de estudiante verificado. Fail-soft: si el campo no
                viene (columna no expuesta todavia), simplemente no se muestra. */}
            {isVerifiedStudent(profile.student_email_verified) ? (
              <View accessibilityLabel="Estudiante verificado">
                <BadgeCheck size={19} color={C.blue} strokeWidth={2.1} />
              </View>
            ) : null}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 1 }]}>@{username}</Text>
          {profile.bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', marginTop: 12, maxWidth: 320 }]}>{profile.bio}</Text> : null}
          {profile.city ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <MapPin size={12} color={C.muted} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{profile.city}</Text>
            </View>
          ) : null}
          {interests.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              {interests.slice(0, 8).map((it) => <Pill key={it} label={it} />)}
            </View>
          ) : null}
        </View>
      </FadeIn>

      {/* Cifras entre dos lineas finas: sin tarjeta y sin sombra. */}
      <FadeIn index={1}>
        <View style={{
          flexDirection: 'row', marginHorizontal: S.lg, marginTop: S.xl, paddingVertical: 16,
          borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.borderLight,
        }}>
          <StatTap value={counts.posts || posts.length} label="Publicaciones" />
          <View style={{ width: 0.5, backgroundColor: C.borderLight }} />
          <StatTap value={counts.followers} label="Seguidores" onPress={() => openFollowList('followers')} />
          <View style={{ width: 0.5, backgroundColor: C.borderLight }} />
          <StatTap value={counts.following} label="Siguiendo" onPress={() => openFollowList('following')} />
        </View>
      </FadeIn>

      <FadeIn index={2}>
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: S.lg, marginTop: S.lg }}>
          <View style={{ flex: 1 }}>
            <Btn full small busy={followBusy}
              variant={followed ? 'ghost' : 'primary'}
              label={followed ? 'Siguiendo' : 'Seguir'} onPress={onFollow} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn variant="ghost" full small label="Mensaje" onPress={onMessage} />
          </View>
        </View>
      </FadeIn>

      {/* rejilla de publicaciones públicas */}
      <View style={{ marginTop: S.xxl, paddingHorizontal: S.lg }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 10 }]}>Publicaciones</Text>
        {posts.length === 0 ? (
          <EmptyState compact icon={Camera} title="Aún no hay publicaciones"
            subtitle="Cuando comparta algo en el FOMO con su nombre, lo verás aquí." />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {posts.map((p, i) => (
              <FadeIn key={p.id} index={Math.min(i, 8)} distance={10}>
                <Tap onPress={() => router.push(`/fomo/${p.id}`)}>
                  <GridTile uri={p.media_url} body={p.body} tile={tile}
                    isVideo={p.media_type === 'video'} />
                </Tap>
              </FadeIn>
            ))}
          </View>
        )}
        {hasMorePosts ? (
          <View style={{ paddingTop: S.md }}>
            <Btn variant="secondary" full small label="Ver más publicaciones" busy={loadingMorePosts} onPress={loadMorePosts} />
          </View>
        ) : null}
      </View>

      {/* ── Lista de seguidores / siguiendo (mismo modal que la pestaña perfil) ── */}
      <Modal visible={followList !== null} animationType="slide" transparent onRequestClose={() => setFollowList(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setFollowList(null)} />
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '70%', paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>{followList?.title}</Text>
            <Tap onPress={() => setFollowList(null)} accessibilityLabel="Cerrar" hitSlop={11}>
              <X size={22} color={C.text} />
            </Tap>
          </View>
          {followList?.people.length === 0 ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center', paddingVertical: 30 }]}>
              {followList.title === 'Seguidores' ? 'Todavía no le sigue nadie.' : 'Todavía no sigue a nadie.'}
            </Text>
          ) : (
            <FlatList
              data={followList?.people ?? []}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10 }}>
                  {/* Tocar la fila navega a ese perfil; push para poder volver atrás. */}
                  <Tap style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                    onPress={() => {
                      setFollowList(null);
                      if (item.id === myId) router.push('/(tabs)/perfil');
                      else router.push(`/perfil/${item.id}`);
                    }}>
                    <Avatar name={item.full_name} uri={item.avatar_url} size={44} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ flex: 1, fontSize: 15, color: C.text, fontFamily: FONT.semibold }} numberOfLines={1}>
                      {item.full_name ?? 'Estudiante'}
                    </Text>
                  </Tap>
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Menú ⋯ del perfil */}
      <OptionsSheet visible={menuOpen} onClose={() => setMenuOpen(false)}
        title={profile.full_name ?? 'Opciones'}
        options={[
          { label: 'Compartir perfil', onPress: () => setShareOpen(true) },
          {
            label: muted ? 'Dejar de silenciar' : 'Silenciar',
            onPress: toggleMute,
          },
          { label: 'Reportar', destructive: true, onPress: reportProfile },
          { label: 'Denunciar foto de perfil', destructive: true, onPress: reportPhoto },
          { label: 'Bloquear', destructive: true, onPress: blockUser },
        ]} />

      {/* Motivos de denuncia (enum del CHECK de user_reports) */}
      <OptionsSheet visible={reportOpen} onClose={() => setReportOpen(false)}
        title={`Denunciar a ${profile.full_name ?? 'este perfil'}`}
        options={REPORT_REASONS.map(r => ({
          label: r.label,
          onPress: () => submitReport(r.value, r.label),
        }))} />

      {/* ── Compartir perfil: QR + enlace ── */}
      <Modal visible={shareOpen} animationType="slide" transparent onRequestClose={() => setShareOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setShareOpen(false)} />
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>Compartir perfil</Text>
            <Tap onPress={() => setShareOpen(false)} accessibilityLabel="Cerrar" hitSlop={11}>
              <X size={22} color={C.text} />
            </Tap>
          </View>
          <View style={{ alignItems: 'center', paddingHorizontal: S.lg, gap: 14 }}>
            {/* Tarjeta blanca para contraste del QR también en modo oscuro */}
            {/* Blanco y negro fijos: un QR solo se lee con contraste maximo,
                asi que no sigue el tema (en oscuro seria ilegible). */}
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: R.lg, padding: 18 }}>
              <QRCode value={profileUrl} size={200} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]} numberOfLines={1}>@{username}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LinkIcon size={16} color={C.blue} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontSize: 13, fontFamily: FONT.semibold }} numberOfLines={1}>franky.es/perfil</Text>
            </View>
            <View style={{ alignSelf: 'stretch' }}>
              <Btn full label="Compartir enlace" onPress={shareLink} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
