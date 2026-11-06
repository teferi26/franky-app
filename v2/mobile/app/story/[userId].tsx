import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, useWindowDimensions, Alert, Share, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Modal, FlatList, Animated, Easing, ActivityIndicator, StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { X, Trash2, Share2, Star, Eye, Send, Camera, Flag } from 'lucide-react-native';
import { confirmSocialAction, hideSocialContent } from '@/lib/social-moderation';
import { Avatar, Tap, EmptyState, OptionsSheet } from '@/components/ui';
import { VideoPlayer } from '@/components/VideoPlayer';
import { supabase } from '@/lib/supabase';
import {
  getActiveStories, recordStoryView, getStoryViewers, saveHighlight,
  type StoryGroup, type StoryViewer, type Story,
} from '@/lib/social';
import { startDirectChat, sendTextMessage } from '@/lib/chat';
import { timeAgo } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';

const STORY_MS = 5000;      // imagen: 5s por story
const VIDEO_MAX_MS = 15000; // vídeo: máximo 15s (o antes, cuando termine)

// El visor va SIEMPRE sobre negro (es el único sitio de la app con fondo fijo:
// una foto a pantalla completa se ve mejor así en los tres temas), y los
// controles encima en blanco. Las hojas que se abren desde aquí (vistas) sí
// siguen el tema.
const ON_MEDIA = '#FFFFFF';
const ON_MEDIA_SOFT = 'rgba(255,255,255,0.7)';
const SCRIM = 'rgba(0,0,0,0.45)';

// Visor de stories a pantalla completa: barras de progreso arriba, toque en
// el tercio izquierdo = anterior, resto = siguiente, mantener pulsado = pausa,
// X para salir. Al acabar las stories del autor pasa al siguiente autor con
// story activa.
export default function StoryViewer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [gi, setGi] = useState(0);
  const [si, setSi] = useState(0);

  // Vistas de la story actual (solo relevante si es mía) y estado del modal.
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  // Respuesta por privado (solo en stories ajenas).
  const [reply, setReply] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const [sending, setSending] = useState(false);
  // Mantener pulsada la pantalla congela la story (como en IG).
  const [holding, setHolding] = useState(false);

  const load = useCallback(async () => {
    try {
      const gs = await getActiveStories();
      setGroups(gs);
      setLoadError(false);
      const idx = gs.findIndex((g) => g.authorId === userId);
      setGi(Math.max(0, idx));
      setSi(0);
    } catch {
      setGroups((prev) => prev ?? []);
      setLoadError(true);
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const group = groups?.[gi] ?? null;
  const story = group?.stories[si] ?? null;
  const isVideo = story?.media_type === 'video';

  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/feed')), [router]);

  // Mientras el campo de respuesta está enfocado, el modal de vistas está
  // abierto o se mantiene pulsado, el auto-avance se para.
  const paused = replyFocused || viewersOpen || holding || safetyOpen;

  // Navegación con refs: así advance/goBackOne no cambian de identidad con
  // cada story y el temporizador no se reinicia por un simple repintado.
  const navRef = useRef({ groups, gi, si });
  navRef.current = { groups, gi, si };
  const advance = useCallback(() => {
    const { groups: gs, gi: g, si: s } = navRef.current;
    const grp = gs?.[g];
    if (!gs || !grp) return;
    if (s + 1 < grp.stories.length) { setSi(s + 1); return; }
    if (g + 1 < gs.length) { setGi(g + 1); setSi(0); return; }
    close();
  }, [close]);
  const goBackOne = useCallback(() => {
    const { groups: gs, gi: g, si: s } = navRef.current;
    if (s > 0) { setSi(s - 1); return; }
    if (g > 0 && gs) {
      const prev = gs[g - 1];
      setGi(g - 1);
      setSi(Math.max(0, prev.stories.length - 1));
    }
  }, []);

  // Al mostrar cada story: si es mía cargo quién la vio (para el contador); si
  // es ajena registro mi vista. Todo fail-soft (migración 129 puede no estar).
  useEffect(() => {
    if (!story || !group) return;
    setReply('');
    if (group.isMine) {
      getStoryViewers(story.id).then(setViewers).catch(() => setViewers([]));
    } else {
      setViewers([]);
      recordStoryView(story.id).catch?.(() => {});
    }
  }, [story, group]);

  // Precarga de la siguiente imagen para que el cambio sea instantáneo.
  useEffect(() => {
    if (!groups || !group) return;
    const next: Story | undefined = group.stories[si + 1] ?? groups[gi + 1]?.stories[0];
    if (next && next.media_type === 'image') Image.prefetch(next.media_url).catch(() => {});
  }, [groups, group, gi, si]);

  // ── Barra de progreso animada ────────────────────────────────────────────
  // Un Animated.timing en el hilo nativo (scaleX de 0 a 1) en vez de un
  // setInterval de 50 ms que repintaba TODO el visor 20 veces por segundo. El
  // tiempo transcurrido se lleva con reloj (Date.now) para poder pausar y
  // reanudar desde el mismo punto: con el driver nativo el valor JS no se
  // actualiza durante la animación.
  const progress = useRef(new Animated.Value(0)).current;
  const elapsedMs = useRef(0);
  const startedAt = useRef(0);
  useEffect(() => { elapsedMs.current = 0; progress.setValue(0); }, [story?.id, progress]);
  useEffect(() => {
    if (!story || paused) return;
    const total = isVideo ? VIDEO_MAX_MS : STORY_MS;
    const from = Math.min(elapsedMs.current, total);
    startedAt.current = Date.now() - from;
    progress.setValue(from / total);
    const anim = Animated.timing(progress, {
      toValue: 1, duration: total - from, easing: Easing.linear, useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) advance(); });
    return () => {
      anim.stop();
      elapsedMs.current = Math.min(Date.now() - startedAt.current, total);
    };
  }, [story, paused, isVideo, advance, progress]);

  // Compartir la propia story a otras apps (Instagram, WhatsApp…). Sin
  // expo-sharing instalado, usamos Share.share de RN: compartimos el enlace a
  // franky.es junto con la URL del media (la mayoría de apps abren el enlace).
  const shareStory = async () => {
    if (!story) return;
    try {
      await Share.share({
        message: `Mira mi historia en Franky\n${story.media_url}\n\nhttps://franky.es`,
        url: story.media_url, // iOS usa este campo para adjuntar el media
      });
    } catch { /* el usuario canceló o no hay apps compatibles */ }
  };

  // Destacar la propia story: guarda una copia persistente en story_highlights
  // (las stories caducan a 24h, las destacadas no). Aparecen en el perfil.
  const highlightMine = async () => {
    if (!group?.isMine || !story) return;
    try {
      const out = await saveHighlight(story);
      if (out.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast('Destacada', 'La tienes en Destacadas de tu perfil.');
      } else {
        toastError('No se pudo destacar', out.message);
      }
    } catch {
      toastError('No se pudo destacar', 'Revisa tu conexión e inténtalo de nuevo.');
    }
  };

  // Responder a una story ajena por privado: abre (o recupera) el chat 1:1 y
  // envía el texto como mensaje. El aviso va por toast para no cortar el visor.
  const sendReply = async () => {
    if (!group || group.isMine || sending) return;
    const text = reply.trim();
    if (!text) return;
    setSending(true);
    try {
      const chatId = await startDirectChat(group.authorId);
      if (!chatId) { toastError('No se pudo enviar', 'Inténtalo de nuevo.'); return; }
      const out = await sendTextMessage(chatId, text);
      if (!out.ok) { toastError('No se pudo enviar', 'Inténtalo de nuevo.'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setReply('');
      Keyboard.dismiss();
      toast('Enviado', `Le llegó a ${group.name ?? 'esta persona'} por privado.`);
    } catch {
      toastError('No se pudo enviar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  // Borrar es destructivo: aquí sí un Alert con confirmación.
  const deleteMine = () => {
    if (!group?.isMine || !story) return;
    Alert.alert('Eliminar story', '¿Quitar esta story?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            // .select('id'): si la RLS no deja borrar, no hay error, solo 0 filas.
            const { data, error } = await supabase.from('stories').delete().eq('id', story.id).select('id');
            if (error) throw error;
            if (data?.length !== 1) throw new Error('story_not_deleted');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            toast('Story eliminada');
            const gs = await getActiveStories();
            if (!gs.length) { close(); return; }
            setGroups(gs);
            setGi(0); setSi(0);
          } catch {
            toastError('No se pudo eliminar', 'Revisa tu conexión e inténtalo de nuevo.');
          }
        },
      },
    ]);
  };

  // Zonas de toque: mantener pulsado congela; al soltar sigue. Pressable no
  // dispara onPress si ya hubo onLongPress, así que soltar tras una pausa no
  // cambia de story.
  const holdProps = {
    delayLongPress: 180,
    onLongPress: () => setHolding(true),
    onPressOut: () => setHolding(false),
  };

  if (!groups) {
    return (
      <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={ON_MEDIA} />
      </View>
    );
  }
  if (!group || !story) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: S.lg, alignItems: 'flex-end' }}>
          <Tap onPress={close} accessibilityLabel="Cerrar" hitSlop={10}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color={C.text} strokeWidth={2.2} />
          </Tap>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {loadError ? (
            <EmptyState icon={Camera} title="No se pudieron cargar las stories"
              subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={load} />
          ) : (
            <EmptyState icon={Camera} title="No hay stories activas"
              subtitle="Las historias duran 24 horas. Sube la tuya desde el Fomo." cta="Volver" onCta={close} />
          )}
        </View>
      </View>
    );
  }

  const firstName = (group.name ?? 'Estudiante').split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.black }}>
      <StatusBar barStyle="light-content" />
      {isVideo ? (
        // Vídeo a pantalla completa: con sonido y sin controles de toque propios
        // (los toques de navegación los gestionan los Pressable de abajo). Al
        // terminar, onEnd adelanta a la siguiente story.
        <VideoPlayer
          key={story.id}
          uri={story.media_url}
          style={{ width, height }}
          contentFit="contain"
          autoPlay
          startMuted={false}
          showMuteButton={false}
          tapToggles={false}
          onEnd={advance}
        />
      ) : (
        <Image source={{ uri: story.media_url }} style={{ width, height }} contentFit="contain" transition={100}
          cachePolicy="memory-disk" recyclingKey={story.id} accessibilityLabel={story.caption ? `Story: ${story.caption}` : 'Story'} />
      )}

      {/* Velos arriba y abajo para que barras, nombre y respuesta se lean sobre cualquier foto. */}
      <LinearGradient pointerEvents="none" colors={[SCRIM, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 110 }} />
      <LinearGradient pointerEvents="none" colors={['transparent', SCRIM]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: insets.bottom + 140 }} />

      {/* zonas de toque: izquierda = anterior, derecha = siguiente, mantener = pausa */}
      <Pressable onPress={goBackOne} {...holdProps} accessibilityRole="button" accessibilityLabel="Story anterior"
        style={{ position: 'absolute', left: 0, top: insets.top + 90, bottom: 110, width: width / 3 }} />
      <Pressable onPress={advance} {...holdProps} accessibilityRole="button" accessibilityLabel="Siguiente story"
        accessibilityHint="Mantén pulsado para pausar"
        style={{ position: 'absolute', right: 0, top: insets.top + 90, bottom: 110, width: (width * 2) / 3 }} />

      {/* barras de progreso + cabecera */}
      <View style={{ position: 'absolute', top: insets.top + 8, left: 10, right: 10 }}>
        <View style={{ flexDirection: 'row', gap: 4 }} accessible accessibilityRole="progressbar"
          accessibilityLabel={`Story ${si + 1} de ${group.stories.length}`}>
          {/* Barra fina blanca: es el único "chrome" del visor y sobre una foto
              cualquiera el blanco es lo que siempre se lee. */}
          {group.stories.map((s, i) => (
            <View key={s.id} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              {i < si ? (
                <View style={{ width: '100%', height: '100%', backgroundColor: ON_MEDIA }} />
              ) : i === si ? (
                <Animated.View style={{ width: '100%', height: '100%', transformOrigin: 'left', transform: [{ scaleX: progress }], backgroundColor: ON_MEDIA }} />
              ) : null}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          {/* Tocar el autor abre su perfil público (solo si la story no es mía). */}
          <Tap style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
            disabled={group.isMine}
            accessibilityLabel={group.isMine ? 'Tu historia' : `Ver el perfil de ${group.name ?? 'Estudiante'}`}
            onPress={group.isMine ? undefined : () => router.push(`/perfil/${group.authorId}`)}>
            <Avatar name={group.name} uri={group.avatarUrl} size={34} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ color: ON_MEDIA, fontFamily: FONT.semibold, fontSize: 14.5, flex: 1 }}>
              {group.isMine ? 'Tu historia' : (group.name ?? 'Estudiante')}
              <Text style={{ color: ON_MEDIA_SOFT, fontFamily: undefined, fontSize: 13 }}>  {timeAgo(story.created_at)}</Text>
            </Text>
          </Tap>
          {group.isMine ? (
            <>
              <ChromeButton icon={Star} label="Destacar story" onPress={highlightMine} />
              <ChromeButton icon={Share2} label="Compartir story" onPress={shareStory} />
              <ChromeButton icon={Trash2} label="Eliminar story" onPress={deleteMine} />
            </>
          ) : <ChromeButton icon={Flag} label="Ocultar, denunciar o bloquear" onPress={() => setSafetyOpen(true)} />}
          <ChromeButton icon={X} label="Cerrar" onPress={close} size={22} />
        </View>
      </View>

      {/* Pie: caption + (mía) contador de vistas / (ajena) responder por privado. */}
      {group.isMine ? (
        <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 20, right: 20, alignItems: 'center' }}>
          {story.caption ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: ON_MEDIA, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 14 }}>{story.caption}</Text>
          ) : null}
          {/* Vistas: al tocar, lista de quién la vio. */}
          <Tap onPress={() => viewers.length > 0 && setViewersOpen(true)} haptic
            accessibilityLabel={`${viewers.length} ${viewers.length === 1 ? 'vista' : 'vistas'}`}
            accessibilityHint={viewers.length > 0 ? 'Abre la lista de quién la ha visto' : undefined}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: R.full, paddingHorizontal: 14, minHeight: 36 }}>
            <Eye size={17} color={ON_MEDIA} strokeWidth={1.9} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: ON_MEDIA, fontSize: 14, fontFamily: FONT.semibold }}>{viewers.length}</Text>
          </Tap>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={{ paddingHorizontal: S.lg, paddingBottom: insets.bottom + 10, paddingTop: 8 }}>
            {story.caption ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: ON_MEDIA, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 12 }}>{story.caption}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={reply}
                onChangeText={setReply}
                onFocus={() => setReplyFocused(true)}
                onBlur={() => setReplyFocused(false)}
                placeholder={`Responder a ${firstName}…`}
                placeholderTextColor={ON_MEDIA_SOFT}
                accessibilityLabel={`Responder a ${firstName} por privado`}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  flex: 1, color: ON_MEDIA, fontSize: 15, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
                  borderRadius: R.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(0,0,0,0.25)',
                }}
                returnKeyType="send"
                onSubmitEditing={sendReply}
                editable={!sending}
                maxLength={500}
              />
              {reply.trim().length > 0 ? (
                <Tap onPress={sendReply} disabled={sending} accessibilityLabel="Enviar respuesta" accessibilityState={{ busy: sending }} haptic>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
                    {sending ? <ActivityIndicator color={ON_MEDIA} size="small" /> : <Send size={19} color={ON_MEDIA} strokeWidth={2} style={{ marginLeft: -2 }} />}
                  </View>
                </Tap>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <OptionsSheet visible={safetyOpen} title="Opciones de la historia" onClose={() => setSafetyOpen(false)} options={story ? [
        { label: 'Ocultar historia', onPress: () => void hideSocialContent('story', story.id, close) },
        { label: 'Denunciar historia', destructive: true, onPress: () => void confirmSocialAction('story', story.id, false, close) },
        { label: 'Bloquear a esta persona', destructive: true, onPress: () => void confirmSocialAction('story', story.id, true, close) },
        { label: 'Contactar con seguridad', onPress: () => router.push('/centro-seguridad') },
      ] : []} />
      {/* Lista de quién vio la story (solo el autor la puede abrir). Hoja
          inferior con el patrón del kit: asa, R.xl, superficie del tema. */}
      <Modal visible={viewersOpen} animationType="slide" transparent onRequestClose={() => setViewersOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setViewersOpen(false)}
          accessibilityRole="button" accessibilityLabel="Cerrar" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '70%', paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 10 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>
              {viewers.length === 1 ? '1 vista' : `${viewers.length} vistas`}
            </Text>
            <Tap onPress={() => setViewersOpen(false)} accessibilityLabel="Cerrar" hitSlop={10}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color={C.text} strokeWidth={1.9} />
            </Tap>
          </View>
          <FlatList
            data={viewers}
            keyExtractor={(v) => v.id}
            initialNumToRender={12}
            renderItem={({ item }) => (
              <Tap onPress={() => { setViewersOpen(false); router.push(`/perfil/${item.id}`); }}
                accessibilityLabel={`Ver el perfil de ${item.full_name ?? 'Estudiante'}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 9, minHeight: 56 }}>
                  <Avatar name={item.full_name} uri={item.avatar_url} size={40} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]} numberOfLines={1}>
                    {item.full_name ?? 'Estudiante'}
                  </Text>
                </View>
              </Tap>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

// Botón de la cabecera del visor: disco translúcido de 40 px sobre la foto.
function ChromeButton({ icon: Icon, label, onPress, size = 20 }: {
  icon: typeof X; label: string; onPress: () => void; size?: number;
}) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size} color={ON_MEDIA} strokeWidth={1.9} />
    </Tap>
  );
}
