import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Alert, Switch, ScrollView, Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  X, ImagePlus, BarChart3, Plus, Video as VideoIcon, Heart, MessageCircle, Send, Bookmark, EyeOff, Flame,
} from 'lucide-react-native';
import { publishThread, publishLigar } from '@/lib/api';
import { ensureCommunityTerms } from '@/lib/community-terms';
import { uploadMedia, uploadLargeFile, normalizeImage, MAX_VIDEO_BYTES } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { toast, toastError } from '@/lib/toast';
import { Btn, Chip, Tap, Avatar, ProgressBar, Pill } from '@/components/ui';
import { EmailVerifyBanner, resendVerificationEmail } from '@/components/EmailVerifyBanner';
import { AudioNote, RichText } from '@/components/fomo';
import { t } from '@/lib/i18n';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { SocialDemoBanner } from '@/components/SocialDemoBanner';
import { SocialDemoFeatureNotice } from '@/components/SocialDemoFeatureNotice';
import { ensureSocialDemoFeature, useSocialDemoAccessState } from '@/lib/social-demo';
import { VideoPlayer } from '@/components/VideoPlayer';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, R, S, FONT } from '@/theme';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // los buckets fomo/ligar aceptan audio ≤10MB
// El tope de vídeo vive en src/lib/media.ts, junto a la explicación de los tres
// límites encadenados (app, bucket y proyecto de Supabase).
// RecordingPresets.HIGH_QUALITY graba un .m4a: su MIME es 'audio/mp4'. Con
// 'audio/m4a' (que no es un MIME real) los buckets fomo/ligar-media rechazaban
// la subida y la nota de voz nunca se publicaba.
const AUDIO_MIME = 'audio/mp4';
// Límites de texto: los mismos que el maxLength de cada TextInput.
const MAX_BODY_FOMO = 2000;
const MAX_BODY_CRUSH = 1000;
const MAX_OFFER = 1000;

const MEDIA_PREVIEW_HEIGHT = 220;

// Borrador local (57): solo el texto (cuerpo, oferta, encuesta); la foto/audio/
// vídeo no se guardan porque su uri local puede dejar de existir entre
// sesiones, y resubirlos sin que el usuario lo pida sería raro. Clave por
// modo (FOMO/Crush comparten pantalla con `type`), así no se mezclan.
type Draft = {
  at: number; body: string; offer: string; audience: 'todos' | 'hombre' | 'mujer'; anonymous: boolean;
  pollOn: boolean; pollQuestion: string; pollOptions: string[];
};

// Contador de caracteres: discreto hasta el 90 %, en aviso cerca del tope y en
// error al llegar. Va bajo el campo, alineado a la derecha, como en X/Threads.
function CharCount({ length, max }: { length: number; max: number }) {
  const ratio = length / max;
  const color = ratio >= 1 ? C.error : ratio >= 0.9 ? C.warning : C.muted;
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel={`${length} de ${max} caracteres`}
      style={[F.tiny, { color, textAlign: 'right', marginTop: -6, fontFamily: ratio >= 0.9 ? FONT.semibold : undefined }]}>
      {length} / {max}
    </Text>
  );
}

export default function Publicar() {
  const owner = useSessionOwner();
  if (!owner) return null;
  return <SessionComposer key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function SessionComposer({ owner }: { owner: SessionIdentity }) {
  const isCurrent = useOwnerGuard(owner);
  return <OwnedComposer owner={owner.userId} isSessionCurrent={isCurrent} />;
}

function OwnedComposer({ owner, isSessionCurrent }: { owner: string | null; isSessionCurrent: () => boolean }) {
  const { access: demoAccess, retry: retryDemoAccess, checking: checkingDemoAccess } = useSocialDemoAccessState();
  const { type, prompt } = useLocalSearchParams<{ type?: string; prompt?: string }>();
  const isCrush = type === 'crush';
  const DRAFT_KEY = `franky.draft.publicar.${isCrush ? 'crush' : 'fomo'}.v2.${owner ?? 'signed-out'}`;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState(typeof prompt === 'string' ? prompt.slice(0, 150) : '');
  const [offer, setOffer] = useState('');
  const [audience, setAudience] = useState<'todos' | 'hombre' | 'mujer'>('todos');
  const [anonymous, setAnonymous] = useState(true);
  const [photo, setPhoto] = useState<{ uri: string; mime: string } | null>(null);
  // Nota de voz grabada (excluyente con la foto: un post lleva un solo media).
  const [audio, setAudio] = useState<{ uri: string; durationMs: number } | null>(null);
  // Vídeo adjunto (excluyente con foto y audio; sube a fomo/ligar-media).
  const [video, setVideo] = useState<{ uri: string; mime: string } | null>(null);
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Progreso de la subida del vídeo (0 a 1). Con ficheros de cientos de MB la
  // subida tarda minutos: sin esto el botón se queda girando y parece colgado.
  const [videoProgreso, setVideoProgreso] = useState(0);
  // Controlador de la subida en curso: "Cancelar subida" lo aborta. Sin esto,
  // una subida colgada dejaba al usuario encerrado en la vista previa (el
  // botón Editar y el gesto de cerrar estaban bloqueados mientras busy).
  const uploadAbortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; uploadAbortRef.current?.abort(); }; }, []);
  // Nombre y foto propios para que la vista previa sea la del feed de verdad
  // (con tu avatar si publicas con nombre). Fail-soft: sin perfil, iniciales.
  const [me, setMe] = useState<{ name: string | null; avatar: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle();
        if (alive && data) setMe({ name: data.full_name ?? null, avatar: data.avatar_url ?? null });
      } catch { /* la vista previa usa "Estudiante" */ }
    })();
    return () => { alive = false; };
  }, []);

  // ── Borrador local (57) ────────────────────────────────────────────────
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        if (!owner || !isSessionCurrent()) return;
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!alive.current || !isSessionCurrent()) return;
        if (!raw) { draftLoadedRef.current = true; return; }
        const d: Partial<Draft> = JSON.parse(raw);
        if (!d.at || Date.now()-d.at > 86400000 || d.at > Date.now()+60000) { await AsyncStorage.removeItem(DRAFT_KEY); draftLoadedRef.current = true; return; }
        const hasContent = !!(d.body?.trim() || d.offer?.trim() || d.pollQuestion?.trim() || d.pollOptions?.some(o => o.trim()));
        if (!hasContent) { draftLoadedRef.current = true; return; }
        // Alert con dos botones: aquí sí hay que elegir.
        Alert.alert('Tienes un borrador', '¿Quieres continuar donde lo dejaste?', [
          { text: 'Descartar', style: 'cancel', onPress: () => { AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); draftLoadedRef.current = true; } },
          {
            text: 'Continuar', onPress: () => {
              if (!alive.current || !isSessionCurrent()) return;
              if (d.body != null) setBody(d.body);
              if (d.offer != null) setOffer(d.offer);
              if (d.audience) setAudience(d.audience);
              if (d.anonymous != null) setAnonymous(d.anonymous);
              if (d.pollOn != null) setPollOn(d.pollOn);
              if (d.pollQuestion != null) setPollQuestion(d.pollQuestion);
              if (d.pollOptions && d.pollOptions.length >= 2) setPollOptions(d.pollOptions);
              draftLoadedRef.current = true;
            },
          },
        ]);
      } catch { draftLoadedRef.current = true; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!owner || !isSessionCurrent() || !draftLoadedRef.current) return;
    const draft: Draft = { at: Date.now(), body, offer, audience, anonymous, pollOn, pollQuestion, pollOptions };
    const h = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 400);
    return () => clearTimeout(h);
  }, [body, offer, audience, anonymous, pollOn, pollQuestion, pollOptions, DRAFT_KEY, owner, isSessionCurrent]);

  const pickPhoto = async () => {
    try {
      if (!await ensureSocialDemoFeature('publicMedia') || !isSessionCurrent()) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!isSessionCurrent() || res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      // quality solo comprime, no reduce dimensiones: una foto de 4000px se
      // pasaría del límite de 5MB o tardaría una eternidad en datos móviles.
      // normalizeImage reescala SI hace falta y transcodifica SIEMPRE a JPEG.
      // Antes solo se tocaba la foto por encima de 1440 px, así que una HEIC
      // estrecha del iPhone llegaba en crudo al bucket y este la rechazaba
      // (ver el porqué en src/lib/media.ts).
      const { uri, mime } = await normalizeImage(a.uri, a.width, 1440, a.mimeType ?? 'image/jpeg');
      if (!isSessionCurrent()) return;
      Haptics.selectionAsync().catch(() => {});
      setPhoto({ uri, mime });
      setAudio(null); setVideo(null); // foto, audio y vídeo son excluyentes
    } catch {
      toastError('No se pudo abrir la foto', 'Prueba con otra imagen.');
    }
  };

  // Vídeo desde la galería. No lo recomprimimos (los recodificadores en el móvil
  // son lentos): confiamos en el límite de tamaño del bucket (uploadMedia corta
  // a 50MB) y avisamos si se pasa. Se sube tal cual al bucket del modo.
  const pickVideo = async () => {
    try {
      if (!await ensureSocialDemoFeature('publicMedia') || !isSessionCurrent()) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7 });
      if (!isSessionCurrent() || res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      Haptics.selectionAsync().catch(() => {});
      setVideo({ uri: a.uri, mime: a.mimeType ?? 'video/mp4' });
      setPhoto(null); setAudio(null); // excluyente con foto y audio
    } catch {
      toastError('No se pudo abrir el vídeo', 'Prueba con otro archivo.');
    }
  };

  const setOption = (i: number, v: string) =>
    setPollOptions(prev => prev.map((o, idx) => (idx === i ? v : o)));
  const removeOption = (i: number) =>
    setPollOptions(prev => prev.filter((_, idx) => idx !== i));

  // Valida el contenido (los avisos van por toast: no hay nada que decidir) y,
  // si todo está bien, abre la previsualización (59) antes de publicar de verdad.
  const openPreview = () => {
    const cleanOptions = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!isCrush && pollOn) {
      if (!pollQuestion.trim()) { toastError('Falta la pregunta', 'Una encuesta sin pregunta no engancha a nadie.'); return; }
      if (cleanOptions.length < 2) { toastError('Faltan opciones', 'Pon al menos 2 opciones para que la gente pueda votar.'); return; }
    }
    // El backend permite hilos de FOMO solo con media o solo con encuesta
    // (create_fomo_thread, 080); en Crush el texto sí es obligatorio.
    const hasText = body.trim().length >= 3;
    const hasMedia = !!photo || !!audio || !!video;
    const hasPoll = !isCrush && pollOn && !!pollQuestion.trim() && cleanOptions.length >= 2;
    if (isCrush && !hasText) { toastError('Escribe algo primero', 'Cuenta a quién viste o qué pasó.'); return; }
    if (!isCrush && !hasText && !hasMedia && !hasPoll) {
      toastError('Añade algo', 'Un texto, una foto o un vídeo, una nota de voz o una encuesta.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPreviewOpen(true);
  };

  // Cancela la subida en curso y devuelve el control al usuario. El vídeo se
  // aborta de verdad (XHR); una foto o un audio pequeños simplemente se
  // ignoran al volver. La vista previa se queda abierta para reintentar.
  const cancelUpload = () => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    setVideoProgreso(0);
    setBusy(false);
  };

  // Cerrar la vista previa (gesto atrás de Android / swipe): si hay una subida
  // en marcha se pide confirmación en vez de ignorar el gesto, que era lo que
  // encerraba al usuario cuando la subida se colgaba.
  const closePreview = () => {
    if (!busy) { setPreviewOpen(false); return; }
    Alert.alert('¿Cancelar la subida?', 'Tu publicación no se enviará todavía. Podrás volver a intentarlo.', [
      { text: 'Seguir subiendo', style: 'cancel' },
      { text: 'Cancelar subida', style: 'destructive', onPress: () => { cancelUpload(); setPreviewOpen(false); } },
    ]);
  };

  const submit = async () => {
    if (uploadAbortRef.current || !owner || !isSessionCurrent()) return;
    const cleanOptions = pollOptions.map(o => o.trim()).filter(Boolean);
    const ctrl = new AbortController();
    uploadAbortRef.current = ctrl;
    setBusy(true);

    // try/finally: si algo lanza (getUser sin red, un rechazo inesperado)
    // busy vuelve a false igualmente; antes se quedaba en "Publicando…" para
    // siempre.
    try {
      if (!await ensureCommunityTerms() || !isSessionCurrent()) return;
      // Media opcional (foto, VÍDEO o nota de voz, excluyentes): se sube primero
      // al bucket del modo (carpeta = uid, exigido por RLS). El media_type lo
      // decide el tipo. El vídeo estaba seleccionándose pero NO se subía: el
      // bloque solo miraba photo/audio, así que se publicaba sin nada.
      let mediaUrl: string | null = null;
      let mediaType: 'image' | 'audio' | 'video' | null = null;
      if (photo || video || audio) {
        if (!await ensureSocialDemoFeature('publicMedia') || !isSessionCurrent()) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (ctrl.signal.aborted) return;
        if (!user) {
          setPreviewOpen(false);
          Alert.alert('Inicia sesión', 'Necesitas una cuenta para publicar.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Entrar', onPress: () => router.push('/welcome') },
          ]);
          return;
        }
        const bucket = isCrush ? 'ligar-media' : 'fomo-media';
        // El vídeo va por uploadLargeFile: no cabe en memoria y una subida larga
        // sin barra de progreso parece la app colgada. Se le pasa la señal de
        // cancelación para que "Cancelar subida" corte el XHR de verdad.
        const up = photo
          ? await uploadMedia(bucket, user.id, photo.uri, photo.mime, MAX_IMAGE_BYTES)
          : video
            ? await uploadLargeFile(bucket, user.id, video.uri, video.mime, MAX_VIDEO_BYTES, setVideoProgreso, ctrl.signal)
            : await uploadMedia(bucket, user.id, audio!.uri, AUDIO_MIME, MAX_AUDIO_BYTES);
        setVideoProgreso(0);
        // Cancelado por el usuario: sin avisos, ya sabe lo que ha hecho.
        if (ctrl.signal.aborted) return;
        if (!up.ok) {
          toastError(
            photo ? 'No se pudo subir la foto' : video ? 'No se pudo subir el vídeo' : 'No se pudo subir la nota de voz',
            up.message,
          );
          return;
        }
        mediaUrl = up.publicUrl;
        mediaType = photo ? 'image' : video ? 'video' : 'audio';
      }

      if (!alive.current || !isSessionCurrent() || ctrl.signal.aborted) return;
      const res = isCrush
        ? await publishLigar({
            body: body.trim(), offer: offer.trim(), audience, anonymous,
            mediaUrl, mediaType,
          })
        : await publishThread({
            body: body.trim(), anonymous,
            mediaUrl, mediaType,
            pollQuestion: pollOn ? pollQuestion.trim() : null,
            pollOptions: pollOn ? cleanOptions : null,
          });
      if (!alive.current || !isSessionCurrent()) return;
      if (res.ok) {
        // Aunque se haya pulsado cancelar mientras respondía el servidor, la
        // publicación YA existe: se cierra igual para no provocar un duplicado.
        setPreviewOpen(false);
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); // borrador limpio al publicar con éxito
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast(res.review === 'approved' ? (isCrush ? 'Crush publicado' : 'Publicado') : res.review === 'rejected' ? 'Publicación no admitida' : 'Enviado a revisión', res.review === 'approved' ? 'Ya se ve en el campus.' : res.review === 'rejected' ? 'El contenido incumple las normas de la comunidad.' : 'Se mostrará cuando supere la revisión.');
        router.back();
        return;
      }
      if (ctrl.signal.aborted) return;
      await handlePublishError(res.reason);
    } catch {
      if (ctrl.signal.aborted) return;
      toastError('No se pudo publicar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      // Solo apaga busy si este submit sigue siendo el activo: tras cancelar,
      // el usuario puede haber pulsado Publicar otra vez y ese intento nuevo
      // no debe apagarse cuando termine (o falle) la subida vieja.
      if (uploadAbortRef.current === ctrl) {
        uploadAbortRef.current = null;
        setBusy(false);
      }
    }
  };

  // Avisos según el motivo por el que el backend rechazó la publicación. Los
  // que llevan a otra pantalla van en Alert (tienen botones); el genérico, toast.
  const handlePublishError = async (reason: 'auth' | 'profile' | 'opt_in' | 'db' | undefined) => {
    if (reason === 'auth') {
      Alert.alert('Inicia sesión', 'Necesitas una cuenta para publicar.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Entrar', onPress: () => router.push('/welcome') },
      ]);
    } else if (reason === 'profile') {
      Alert.alert('Completa tu perfil', 'Elige tu universidad en el perfil para poder publicar.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Ir al perfil', onPress: () => router.push('/perfil') },
      ]);
    } else if (reason === 'opt_in') {
      Alert.alert(
        'Activa tu perfil de Crush',
        'Para publicar aquí necesitas activar Crush con tu Instagram. Así, si hay match, podréis intercambiarlo.',
        [
          { text: 'Ahora no', style: 'cancel' },
          { text: 'Activarlo', onPress: () => router.push('/(tabs)/crush') },
        ],
      );
    } else {
      // ¿El fallo viene del gate de email de la 145? La excepción del trigger
      // dice "Confirma tu email para poder publicar..." pero la capa de api no
      // propaga el mensaje (solo reason 'db'), así que se confirma preguntando
      // a is_email_verified() (141). Fail-soft: ante la duda, error genérico.
      let unverified = false;
      try {
        const { data, error } = await supabase.rpc('is_email_verified');
        unverified = !error && data === false;
      } catch { /* fail-soft: la RPC puede no existir aún en este entorno */ }
      if (unverified) {
        Alert.alert(t('verifyEmail.alertTitle'), t('verifyEmail.alertBody'), [
          { text: t('common.close'), style: 'cancel' },
          {
            text: t('verifyEmail.resend'),
            onPress: async () => {
              // Mismo POST que el banner (Authorization: Bearer al endpoint web).
              const r = await resendVerificationEmail();
              if (r.status === 'sent' || r.status === 'already') {
                toast(t('verifyEmail.sentTitle'), t('verifyEmail.sent'));
              } else if (r.status === 'wait') {
                toastError(t('verifyEmail.alertTitle'), t('verifyEmail.wait', { minutes: r.retryAfterMinutes }));
              } else {
                toastError(t('verifyEmail.alertTitle'), t('verifyEmail.sendError'));
              }
            },
          },
        ]);
      } else {
        toastError('No se pudo publicar', 'Inténtalo de nuevo en unos segundos.');
      }
    }
  };

  // Mismo campo en toda la app: superficie limpia con hairline, radio medio.
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, textAlignVertical: 'top' as const,
  };
  const maxBody = isCrush ? MAX_BODY_CRUSH : MAX_BODY_FOMO;
  const trimmedBody = body.trim();
  const previewName = anonymous ? 'Anónimo' : (me?.name ?? 'Estudiante');
  const previewUsername = previewName.toLowerCase().replace(/\s+/g, '.');
  const cleanPreviewOptions = pollOptions.map(o => o.trim()).filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Cabecera del modal: misma altura y tipografía que Header, con X en
          vez de chevron (es una hoja que se cierra, no una pantalla que vuelve). */}
      <View style={{
        paddingTop: insets.top, borderBottomWidth: 0.5, borderBottomColor: C.borderLight, backgroundColor: C.bg,
      }}>
        <View style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 12 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="Cerrar" accessibilityHint="Cierra sin publicar; el texto se guarda como borrador" hitSlop={8}
            style={{ marginLeft: -6, width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' }}>
            <X size={23} color={C.text} strokeWidth={1.9} />
          </Tap>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
            style={{ flex: 1, textAlign: 'center', fontSize: 17, fontFamily: FONT.heading, color: C.text, letterSpacing: -0.2 }}>
            {isCrush ? 'Nuevo crush' : 'Nueva publicación'}
          </Text>
          <View style={{ width: 30 }} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: 14, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <SocialDemoBanner />
          {/* Aviso de email sin verificar (145): si la cuenta es nueva y no ha
              confirmado el correo, el backend rechazará publicar. Mejor avisarlo
              aquí arriba que dejar que el error salte al final. */}
          <EmailVerifyBanner />
          {isCrush ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, padding: 12 }}>
              <Flame size={17} color={C.accent2} strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1, color: C.text }]}>Si esa persona reacciona, podréis intercambiar Instagram.</Text>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <TextInput
              multiline autoFocus value={body} onChangeText={setBody}
              placeholder={isCrush ? 'Describe a esa persona o ese momento…' : '¿Qué está pasando en el campus?'}
              placeholderTextColor={C.muted}
              accessibilityLabel={isCrush ? 'Texto del crush' : 'Texto de la publicación'}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[input, { minHeight: 130, lineHeight: 21 }]}
              maxLength={maxBody}
            />
            <CharCount length={body.length} max={maxBody} />
          </View>

          {/* media adjunto (ambos modos): foto, vídeo o nota de voz, excluyentes */}
          {photo ? (
            <View>
              <Image
                source={{ uri: photo.uri }}
                style={{ width: '100%', height: MEDIA_PREVIEW_HEIGHT, borderRadius: R.lg, backgroundColor: C.input }}
                contentFit="cover" transition={150} accessibilityLabel="Foto adjunta"
              />
              <RemoveBadge label="Quitar foto" onPress={() => setPhoto(null)} />
            </View>
          ) : video ? (
            // Vídeo elegido: se previsualiza con el mismo reproductor del feed.
            <View>
              <VideoPlayer uri={video.uri} style={{ width: '100%', height: MEDIA_PREVIEW_HEIGHT }} radius={R.lg} contentFit="cover" />
              <RemoveBadge label="Quitar vídeo" onPress={() => setVideo(null)} />
            </View>
          ) : audio ? (
            // Nota de voz grabada: se escucha con el mismo reproductor del feed.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><AudioNote uri={audio.uri} /></View>
              <Tap onPress={() => setAudio(null)} accessibilityLabel="Quitar nota de voz" hitSlop={8}
                style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </View>
          ) : demoAccess?.demo === false ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
              <Chip label="Foto" icon={ImagePlus} onPress={busy ? undefined : pickPhoto} accessibilityHint="Elige una foto de la galería" />
              <Chip label="Vídeo" icon={VideoIcon} onPress={busy ? undefined : pickVideo} accessibilityHint="Elige un vídeo de la galería" />
              <VoiceRecorder disabled={busy}
                beforeRecord={async () => await ensureSocialDemoFeature('publicMedia') && isSessionCurrent()}
                onRecorded={(uri, durationMs) => { if (isSessionCurrent()) { setAudio({ uri, durationMs }); setPhoto(null); setVideo(null); } }} />
            </View>
          ) : <SocialDemoFeatureNotice access={demoAccess} feature="publicMedia" retry={retryDemoAccess} checking={checkingDemoAccess} />}

          {isCrush ? (
            <>
              <View style={{ gap: 8 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Qué ofreces tú</Text>
                <TextInput
                  multiline value={offer} onChangeText={setOffer}
                  placeholder="Un café, una cerveza, apuntes de primero…"
                  placeholderTextColor={C.muted}
                  accessibilityLabel="Qué ofreces tú"
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[input, { minHeight: 80 }]}
                  maxLength={MAX_OFFER}
                />
              </View>
              <View style={{ gap: 8 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Para quién</Text>
                <View style={{ flexDirection: 'row' }}>
                  {(['todos', 'hombre', 'mujer'] as const).map(a => (
                    <Chip key={a} label={a === 'todos' ? 'Para todos' : a === 'hombre' ? 'Para chicos' : 'Para chicas'}
                      accessibilityRole="tab" active={audience === a} onPress={() => { Haptics.selectionAsync().catch(() => {}); setAudience(a); }} />
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              {/* encuesta opcional (solo FOMO): 2 a 4 opciones */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <BarChart3 size={20} color={C.blue} strokeWidth={1.75} />
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Añadir encuesta</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Que vote el campus (de 2 a 4 opciones)</Text>
                  </View>
                </View>
                <Switch
                  value={pollOn}
                  onValueChange={(v) => { Haptics.selectionAsync().catch(() => {}); setPollOn(v); }}
                  trackColor={{ true: C.blue, false: C.border }}
                  accessibilityLabel="Añadir encuesta"
                />
              </View>
              {pollOn ? (
                <View style={{ gap: 8, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 12 }}>
                  <TextInput
                    value={pollQuestion} onChangeText={setPollQuestion}
                    placeholder="¿Qué le preguntamos al campus?"
                    placeholderTextColor={C.muted}
                    accessibilityLabel="Pregunta de la encuesta"
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={input}
                    maxLength={200}
                  />
                  {pollOptions.map((opt, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        value={opt} onChangeText={v => setOption(i, v)}
                        placeholder={`Opción ${i + 1}`}
                        placeholderTextColor={C.muted}
                        accessibilityLabel={`Opción ${i + 1}`}
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        style={[input, { flex: 1, paddingVertical: 10 }]}
                        maxLength={80}
                      />
                      {pollOptions.length > 2 ? (
                        <Tap onPress={() => removeOption(i)} accessibilityLabel={`Quitar opción ${i + 1}`} hitSlop={10}
                          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
                          <X size={18} color={C.muted} strokeWidth={2} />
                        </Tap>
                      ) : null}
                    </View>
                  ))}
                  {pollOptions.length < 4 ? (
                    <Btn variant="link" small icon={Plus} label="Añadir opción" onPress={() => setPollOptions(prev => [...prev, ''])} />
                  ) : null}
                </View>
              ) : null}
            </>
          )}

          {/* anónimo (ambos modos; en Crush activado por defecto) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <EyeOff size={20} color={C.blue} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Publicar como anónimo</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{anonymous ? 'Tu nombre no se mostrará' : 'Saldrá con tu nombre y tu foto'}</Text>
              </View>
            </View>
            <Switch
              value={anonymous}
              onValueChange={(v) => { Haptics.selectionAsync().catch(() => {}); setAnonymous(v); }}
              trackColor={{ true: C.blue, false: C.border }}
              accessibilityLabel="Publicar como anónimo"
              accessibilityHint="Si está activado, tu nombre no se mostrará en la publicación"
            />
          </View>
        </ScrollView>

        {/* CTA fijo abajo: siempre a la vista, también con el teclado abierto. */}
        <View style={{
          paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 0.5, borderTopColor: C.borderLight, backgroundColor: C.bg,
        }}>
          <Btn full label={busy ? 'Publicando…' : 'Revisar y publicar'} onPress={busy ? undefined : openPreview} disabled={busy} busy={busy}
            accessibilityHint="Abre una vista previa antes de publicar" />
        </View>
      </KeyboardAvoidingView>

      {/* Previsualización antes de publicar (59): la publicación tal cual se
          verá en el feed, dentro de una hoja inferior del kit. */}
      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={closePreview}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={closePreview}
          accessibilityRole="button" accessibilityLabel="Cerrar la vista previa" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '88%', paddingTop: 8 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { textAlign: 'center', paddingVertical: 8 }]}>
            {isCrush ? 'Así se verá tu crush' : 'Así se verá tu publicación'}
          </Text>
          <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
            {/* Réplica del post del feed: misma cabecera, mismo cuerpo, mismos iconos. */}
            <View style={{ backgroundColor: C.bg, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingBottom: 10, gap: 10 }}>
                <Avatar name={anonymous ? '?' : previewName} uri={anonymous ? null : me?.avatar} size={36} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.username} numberOfLines={1}>{previewUsername}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{anonymous ? 'Publicación anónima' : 'Tu universidad'} · ahora</Text>
                </View>
                {isCrush ? <Pill label={audience === 'todos' ? 'Para todos' : audience === 'hombre' ? 'Para chicos' : 'Para chicas'} tone="red" icon={Flame} /> : null}
              </View>
              {trimmedBody ? <RichText text={trimmedBody} style={[F.body, { paddingHorizontal: S.md, marginBottom: 10 }]} /> : null}
              {photo ? (
                <Image source={{ uri: photo.uri }} style={{ marginHorizontal: S.md, height: 200, borderRadius: R.lg, backgroundColor: C.input, marginBottom: 10 }} contentFit="cover" />
              ) : video ? (
                <View style={{ marginHorizontal: S.md, height: 200, marginBottom: 10 }}>
                  <VideoPlayer uri={video.uri} radius={R.lg} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </View>
              ) : audio ? (
                <View style={{ marginHorizontal: S.md, marginBottom: 10 }}><AudioNote uri={audio.uri} /></View>
              ) : null}
              {isCrush && offer.trim() ? (
                <View style={{ marginHorizontal: S.md, marginBottom: 10, backgroundColor: C.input, borderRadius: R.md, padding: 10 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Ofrece</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 2 }]}>{offer.trim()}</Text>
                </View>
              ) : null}
              {!isCrush && pollOn && pollQuestion.trim() ? (
                <View style={{ marginHorizontal: S.md, marginBottom: 10, borderWidth: 0.5, borderColor: C.border, backgroundColor: C.surface, borderRadius: R.lg, padding: 12, gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{pollQuestion.trim()}</Text>
                  {cleanPreviewOptions.map((o, i) => (
                    <View key={i} style={{ borderWidth: 1.5, borderColor: C.blue, borderRadius: R.md, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.blue, textAlign: 'center' }} numberOfLines={1}>{o}</Text>
                    </View>
                  ))}
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>0 votos · voto único</Text>
                </View>
              ) : null}
              <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, gap: 18 }}>
                <Heart size={22} color={C.text} strokeWidth={2} />
                <MessageCircle size={22} color={C.text} strokeWidth={2} style={{ transform: [{ scaleX: -1 }] }} />
                <Send size={22} color={C.text} strokeWidth={2} />
                <View style={{ flex: 1 }} />
                <Bookmark size={22} color={C.text} strokeWidth={2} />
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 13, paddingHorizontal: S.md, marginTop: 8 }]}>Añadir un comentario…</Text>
            </View>

            {busy && video ? (
              <View style={{ marginTop: 16, gap: 8 }}>
                <ProgressBar value={Math.round(videoProgreso * 100)} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                  Subiendo el vídeo… {Math.round(videoProgreso * 100)} %. No cierres la app.
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <View style={{ flex: 1 }}>
                <Btn full variant="secondary" label="Editar" onPress={() => setPreviewOpen(false)} disabled={busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn full busy={busy} label="Publicar" onPress={submit} />
              </View>
            </View>
            {/* Salida siempre disponible mientras se publica: si la subida se
                cuelga, el usuario no se queda atrapado con Editar apagado. */}
            {busy ? (
              <View style={{ marginTop: 10 }}>
                <Btn full variant="ghost" label="Cancelar subida" onPress={cancelUpload} haptic={false} />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// Botón "quitar" sobre una foto o un vídeo adjuntos: disco oscuro en la esquina.
function RemoveBadge({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} hitSlop={8}
      style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
      {/* Blanco fijo: va sobre el disco oscuro, encima de la foto. */}
      <X size={16} color="#FFFFFF" strokeWidth={2.5} />
    </Tap>
  );
}
