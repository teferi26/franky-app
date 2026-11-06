// ─── Pantalla de llamada de voz/vídeo 1:1 (mejora 100, migración 139) ──────
// Params: `id` = uid de la otra persona, `kind` = 'audio' | 'video'.
// Si se abre con `callId` (llamada entrante ya creada por el otro), esta
// pantalla actúa de LLAMADO: espera la oferta y muestra aceptar/rechazar.
// Si no, actúa de LLAMANTE: crea la llamada (start_call) y la oferta.
//
// CONTRASTE: la llamada pinta SIEMPRE sobre un fondo negro fijo (es media a
// pantalla completa: el vídeo remoto o el avatar), en los TRES temas de la
// app. Por eso los textos e iconos son blancos fijos (blanco sobre media) y
// NO C.text (casi negro en modo claro: sería ilegible aquí). Lo que sí sale
// del tema son los acentos semánticos: C.error para colgar/rechazar,
// C.success para aceptar y un aro fino de acento para el pulso del avatar.
//
// Diseño: avatar grande con anillo de marca que late mientras suena o
// conecta, nombre en Outfit, estado debajo y botones grandes (64 px) con
// etiqueta, para acertar sin mirar.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft, Mic, MicOff, Phone, PhoneOff, SwitchCamera, VideoOff, type LucideIcon,
} from 'lucide-react-native';
import { Tap, Avatar, Btn } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { SocialDemoFeatureGate } from '@/components/SocialDemoFeatureNotice';
import { ensureSocialDemoFeature } from '@/lib/social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import {
  startCall, setCallStatus, sendSignal, subscribeToCall, isWebRtcAvailable, loadWebRtc,
  type CallKind, type CallStatus, type CallRow, type CallSignal,
} from '@/lib/calls';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, FONT, R, S } from '@/theme';

// Servidores STUN públicos de Google: bastan para resolver el NAT en la
// mayoría de redes. En redes con NAT estricto/simétrico (frecuente en datos
// móviles y algunas wifis universitarias) esto NO basta: hará falta montar
// además un servidor TURN propio (p. ej. coturn) y añadirlo aquí con
// credenciales, o el candidato ICE nunca llegará a conectar el media.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

type Phase = 'checking' | 'unsupported' | 'incoming' | 'outgoing' | 'connecting' | 'active' | 'ended';

// Blanco/negro sobre media: los únicos colores fijos de la pantalla.
const BG = '#000000';
const FG = '#FFFFFF';
const FG_MUTED = 'rgba(255,255,255,0.72)';
const SURFACE = 'rgba(255,255,255,0.16)';
const SURFACE_ACTIVE = 'rgba(255,255,255,0.9)';

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Avatar con dos anillos de marca que se expanden y se desvanecen mientras la
// llamada suena o conecta. Con "reducir movimiento" se queda un anillo fijo.
function PulsingAvatar({ name, uri, pulsing }: { name: string | null; uri: string | null; pulsing: boolean }) {
  const reduceMotion = useReduceMotion();
  const rings = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (!pulsing || reduceMotion) { rings.forEach((r) => r.setValue(0)); return; }
    const anims = rings.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 700),
      Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.delay(Math.max(0, 700 - i * 700)),
    ])));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [pulsing, reduceMotion, rings]);
  const SIZE = 140;
  return (
    <View style={{ width: SIZE + 80, height: SIZE + 80, alignItems: 'center', justifyContent: 'center' }}>
      {rings.map((v, i) => (
        <Animated.View key={i} pointerEvents="none" style={{
          position: 'absolute', width: SIZE + 16, height: SIZE + 16, borderRadius: (SIZE + 16) / 2,
          borderWidth: 1.5, borderColor: C.blue,
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
        }} />
      ))}
      {/* Aro fino de acento alrededor del avatar: sin degradado, como el
          resto del sistema v3. */}
      <View style={{
        width: SIZE + 10, height: SIZE + 10, borderRadius: (SIZE + 10) / 2,
        borderWidth: 1.5, borderColor: C.blue, alignItems: 'center', justifyContent: 'center',
      }}>
        <Avatar name={name} uri={uri} size={SIZE} />
      </View>
    </View>
  );
}

// Botón redondo grande con etiqueta debajo. `tone` da el color de fondo
// (semántico del tema o superficie translúcida sobre el negro).
function CallButton({ icon: Icon, label, onPress, tone = 'surface', active, size = 64, accessibilityState }: {
  icon: LucideIcon; label: string; onPress: () => void;
  tone?: 'surface' | 'danger' | 'accept'; active?: boolean; size?: number;
  accessibilityState?: { selected?: boolean };
}) {
  const bg = tone === 'danger' ? C.error : tone === 'accept' ? C.success : active ? SURFACE_ACTIVE : SURFACE;
  const fg = tone === 'danger' ? C.onError : tone === 'accept' ? C.onSuccess : active ? BG : FG;
  return (
    <View style={{ alignItems: 'center', gap: 8, minWidth: 76 }}>
      <Tap onPress={onPress} haptic accessibilityLabel={label} accessibilityState={accessibilityState}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={Math.round(size * 0.42)} color={fg} strokeWidth={1.9} />
      </Tap>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, fontFamily: FONT.medium, color: FG_MUTED }}>{label}</Text>
    </View>
  );
}

export default function LlamadaScreen() {
  return <SocialDemoFeatureGate feature="calls" title="Llamada"><CallScreen /></SocialDemoFeatureGate>;
}

function CallScreen() {
  const { id: otherId, kind: kindParam, callId: callIdParam } =
    useLocalSearchParams<{ id: string; kind?: string; callId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const kind: CallKind = kindParam === 'video' ? 'video' : 'audio';
  const isCallee = !!callIdParam;

  // Módulo nativo cargado UNA sola vez al montar (lazy, ver src/lib/calls.ts).
  const [webrtc] = useState(() => (isWebRtcAvailable() ? loadWebRtc() : null));

  const [phase, setPhase] = useState<Phase>(webrtc ? 'checking' : 'unsupported');
  const [otherName, setOtherName] = useState<string | null>(null);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  // react-native-webrtc devuelve streams que no son estado de React: este
  // contador fuerza el repintado cuando llega o cambia el stream remoto/local.
  const [, forceRender] = useState(0);

  const callIdRef = useRef<string | null>(callIdParam ?? null);
  const meIdRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localStreamRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteStreamRef = useRef<any>(null);
  const channelRef = useRef<ReturnType<typeof subscribeToCall> | null>(null);
  const endedRef = useRef(false); // evita colgar/marcar el estado dos veces
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingIceRef = useRef<any[]>([]); // ICE llegado antes de tener remoteDescription

  // ── Limpieza total: para media, cierra la peer connection y el canal ─────
  const cleanup = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop());
    } catch { /* nada que limpiar */ }
    try { pcRef.current?.close?.(); } catch { /* nada que cerrar */ }
    pcRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (channelRef.current) {
      try { supabase.removeChannel(channelRef.current); } catch { /* noop */ }
      channelRef.current = null;
    }
  }, []);

  const hangUp = useCallback((finalStatus: CallStatus = 'ended') => {
    if (endedRef.current) { cleanup(); return; }
    endedRef.current = true;
    if (callIdRef.current) setCallStatus(callIdRef.current, finalStatus);
    cleanup();
    setPhase('ended');
    setTimeout(() => { if (router.canGoBack()) router.back(); }, 900);
  }, [cleanup, router]);

  // ── Perfil de la otra persona: solo para la cabecera (nombre/foto) ───────
  useEffect(() => {
    if (!otherId) return;
    supabase.from('public_profiles').select('id, full_name, avatar_url')
      .eq('id', otherId).maybeSingle()
      .then(
        ({ data }) => {
          const p = data as { full_name?: string | null; avatar_url?: string | null } | null;
          setOtherName(p?.full_name ?? null);
          setOtherAvatar(p?.avatar_url ?? null);
        },
        () => { /* fail-soft: la cabecera se queda sin nombre */ },
      );
  }, [otherId]);

  // ── Flujo completo de WebRTC + señalización ──────────────────────────────
  useEffect(() => {
    if (!webrtc || !otherId) return;
    let cancelled = false;

    async function run() {
      const owner = captureSessionIdentity();
      if (!owner) return;
      try {
        const available = await ensureSocialDemoFeature('calls');
        if (cancelled || !isCurrentSessionIdentity(owner)) return;
        if (!available) { setErrorMsg('No se pudo comprobar la disponibilidad. Vuelve al chat e inténtalo de nuevo.'); setPhase('ended'); return; }
        const { data } = await supabase.auth.getUser();
        if (cancelled || !isCurrentSessionIdentity(owner) || data.user?.id !== owner.userId) return;
        meIdRef.current = data.user?.id ?? null;

        // 1) Medios locales: micrófono siempre, cámara solo en vídeo.
        const constraints = kind === 'video'
          ? { audio: true, video: { facingMode: 'user' } }
          : { audio: true, video: false };
        const stream = await webrtc.mediaDevices.getUserMedia(constraints);
        if (cancelled || !isCurrentSessionIdentity(owner)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stream.getTracks().forEach((t: any) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        // 2) Peer connection con las pistas locales ya añadidas.
        const pc = new webrtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pc.onicecandidate = (event: any) => {
          if (event.candidate && callIdRef.current) {
            const cand = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
            sendSignal(callIdRef.current, 'ice', cand);
          }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pc.ontrack = (event: any) => {
          const remote = event.streams?.[0] ?? null;
          remoteStreamRef.current = remote;
          setHasRemoteVideo(kind === 'video' && !!remote);
          forceRender((n) => n + 1);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            setPhase((p) => (p === 'ended' ? p : 'active'));
          }
        };

        // 3) Según el rol: el llamante crea la llamada y manda la oferta; el
        // llamado ya tiene callId (venía en los params) y espera la oferta.
        if (!isCallee) {
          const newCallId = await startCall(otherId, kind);
          if (cancelled || !isCurrentSessionIdentity(owner)) return;
          if (!newCallId) {
            setErrorMsg('No se ha podido iniciar la llamada.');
            setPhase('ended');
            return;
          }
          callIdRef.current = newCallId;
          setPhase('outgoing');

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(newCallId, 'offer', { sdp: offer.sdp, type: offer.type });
        } else {
          setPhase('incoming');
        }

        // 4) Señalización en tiempo real: oferta/respuesta/ICE + cambios de estado.
        const channel = subscribeToCall(callIdRef.current as string, {
          onSignal: async (signal: CallSignal) => {
            if (signal.sender_id === meIdRef.current) return; // ignora mis propias señales
            try {
              if (signal.kind === 'offer' && isCallee) {
                await pc.setRemoteDescription(new webrtc.RTCSessionDescription(signal.payload));
                for (const cand of pendingIceRef.current) {
                  await pc.addIceCandidate(new webrtc.RTCIceCandidate(cand));
                }
                pendingIceRef.current = [];
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await sendSignal(callIdRef.current as string, 'answer', { sdp: answer.sdp, type: answer.type });
              } else if (signal.kind === 'answer' && !isCallee) {
                await pc.setRemoteDescription(new webrtc.RTCSessionDescription(signal.payload));
              } else if (signal.kind === 'ice') {
                if (pc.remoteDescription) {
                  await pc.addIceCandidate(new webrtc.RTCIceCandidate(signal.payload));
                } else {
                  pendingIceRef.current.push(signal.payload);
                }
              }
            } catch {
              // Señal fuera de orden, duplicada o inválida: se ignora sin
              // romper el resto de la llamada.
            }
          },
          onStatusChange: (call: CallRow) => {
            if (call.status === 'accepted') {
              setPhase((p) => (p === 'active' ? p : 'connecting'));
            } else if (call.status === 'rejected') {
              hangUp('rejected');
            } else if (call.status === 'ended') {
              hangUp('ended');
            } else if (call.status === 'missed') {
              hangUp('missed');
            }
          },
        });
        channelRef.current = channel;
      } catch {
        if (!cancelled) {
          setErrorMsg('No se pudo acceder al micrófono o la cámara.');
          setPhase('ended');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      // Si se sale de la pantalla sin colgar explícitamente (gesto/atrás del
      // sistema), avisamos igualmente al otro lado de que la llamada terminó.
      if (!endedRef.current && callIdRef.current) {
        endedRef.current = true;
        setCallStatus(callIdRef.current, 'ended');
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webrtc, otherId]);

  // ── Cronómetro: solo corre mientras la llamada está activa ───────────────
  useEffect(() => {
    if (phase !== 'active') return;
    setElapsed(0);
    // Vibración corta al conectar: confirma sin mirar que ya se oye.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const iv = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  const accept = useCallback(() => {
    if (callIdRef.current) setCallStatus(callIdRef.current, 'accepted');
    setPhase('connecting');
  }, []);

  const reject = useCallback(() => hangUp('rejected'), [hangUp]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream?.getAudioTracks) return;
    const next = !muted;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const flipCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream?.getVideoTracks) return;
    const track = stream.getVideoTracks()[0];
    track?._switchCamera?.();
  }, []);

  const insetsTop = insets.top || 24;

  // ── Sin motor de media (Expo Go): pantalla honesta, sin fingir llamada ───
  if (phase === 'unsupported') {
    return (
      <View style={[styles.container, { paddingTop: insetsTop + 12, paddingHorizontal: 28 }]}>
        <StatusBar style="light" />
        <View style={{ flex: 1 }} />
        <View style={styles.unsupportedIconWrap}>
          <VideoOff size={40} color={FG} strokeWidth={1.6} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={styles.unsupportedTitle}>
          Las llamadas necesitan la app de la tienda
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.unsupportedBody}>
          Estás abriendo Franky con Expo Go, la app de pruebas para desarrollo. Las llamadas de voz y vídeo usan un
          componente nativo que Expo Go no incluye, así que aquí no pueden sonar de verdad.{'\n\n'}
          Instala Franky desde la App Store o Google Play para poder llamar a tus matches.
        </Text>
        <View style={{ flex: 1 }} />
        <Btn full label="Volver" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={{ height: insets.bottom + 16 }} />
      </View>
    );
  }

  if (phase === 'checking') {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={FG} size="large" />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.statusText}>Preparando la llamada</Text>
      </View>
    );
  }

  const RTCView = webrtc?.RTCView;
  const remoteStream = remoteStreamRef.current;
  const localStream = localStreamRef.current;
  const showRemoteVideo = kind === 'video' && hasRemoteVideo && !!RTCView && !!remoteStream;
  const pulsing = phase === 'outgoing' || phase === 'incoming' || phase === 'connecting';

  const statusLabel =
    phase === 'outgoing' ? 'Llamando'
    : phase === 'incoming' ? (kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante')
    : phase === 'connecting' ? 'Conectando'
    : phase === 'active' ? formatElapsed(elapsed)
    : (errorMsg ?? 'Llamada finalizada');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Fondo: vídeo remoto a pantalla completa, o avatar con pulso si es audio/aún sin vídeo */}
      {showRemoteVideo ? (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFillObject} objectFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.avatarBg]}>
          <PulsingAvatar name={otherName} uri={otherAvatar} pulsing={pulsing} />
        </View>
      )}

      {/* Velo superior e inferior para que cabecera y controles se lean sobre el vídeo. */}
      {showRemoteVideo ? (
        <>
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} pointerEvents="none" style={[styles.veil, { top: 0, height: 160 }]} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} pointerEvents="none" style={[styles.veil, { bottom: 0, height: 220 }]} />
        </>
      ) : null}

      {/* Cabecera */}
      <View style={[styles.header, { paddingTop: insetsTop + 8 }]}>
        <Tap
          onPress={() => hangUp(phase === 'incoming' ? 'missed' : 'ended')}
          accessibilityLabel="Volver" accessibilityHint="Cuelga y vuelve al chat" hitSlop={8}
          style={[styles.backBtn, { top: insetsTop + 6 }]}>
          <ChevronLeft size={24} color={FG} strokeWidth={1.9} style={{ marginLeft: -2 }} />
        </Tap>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} accessibilityRole="header" style={styles.nameText}>
          {otherName ?? 'Llamada'}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.statusText, phase === 'active' && styles.timerText]}
          accessibilityLiveRegion="polite">
          {statusLabel}
        </Text>
      </View>

      {/* Vídeo propio en miniatura (solo llamadas de vídeo, mientras dura la llamada) */}
      {kind === 'video' && localStream && RTCView && phase !== 'ended' ? (
        <RTCView streamURL={localStream.toURL()} style={[styles.pip, { top: insetsTop + 88 }]} objectFit="cover" mirror zOrder={1} />
      ) : null}

      {/* Controles */}
      {phase === 'incoming' ? (
        <View style={[styles.controlsRow, { paddingBottom: insets.bottom + 28 }]}>
          <CallButton icon={PhoneOff} label="Rechazar" tone="danger" onPress={reject} size={68} />
          <CallButton icon={Phone} label="Aceptar" tone="accept" onPress={accept} size={68} />
        </View>
      ) : phase !== 'ended' ? (
        <View style={[styles.controlsRow, { paddingBottom: insets.bottom + 28 }]}>
          <CallButton icon={muted ? MicOff : Mic} label={muted ? 'Activar' : 'Silenciar'} onPress={toggleMute}
            active={muted} size={56} accessibilityState={{ selected: muted }} />
          {kind === 'video' ? (
            <CallButton icon={SwitchCamera} label="Cámara" onPress={flipCamera} size={56} />
          ) : null}
          <CallButton icon={PhoneOff} label="Colgar" tone="danger" onPress={() => hangUp('ended')} size={68} />
        </View>
      ) : (
        <View style={[styles.controlsRow, { paddingBottom: insets.bottom + 28 }]}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.endedText}>{errorMsg ?? 'Llamada finalizada'}</Text>
        </View>
      )}
    </View>
  );
}

// Fondo negro fijo y textos/iconos claros fijos: NUNCA C.* del tema aquí (ver
// nota de cabecera). Como los colores son constantes (no la paleta mutable
// del tema), un StyleSheet.create a nivel de módulo es seguro en este fichero.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  avatarBg: { alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  veil: { position: 'absolute', left: 0, right: 0 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: 64, gap: 4,
  },
  backBtn: {
    position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20,
    backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center',
  },
  nameText: { fontSize: 26, fontFamily: FONT.display, color: FG, letterSpacing: -0.9, textAlign: 'center' },
  statusText: { fontSize: 14.5, fontFamily: FONT.medium, color: FG_MUTED, marginTop: 2 },
  timerText: { fontVariant: ['tabular-nums'], color: FG },
  pip: {
    position: 'absolute', right: 16, width: 104, height: 150,
    borderRadius: R.lg, backgroundColor: SURFACE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  controlsRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: S.xl,
  },
  endedText: { fontSize: 15.5, fontFamily: FONT.medium, color: FG_MUTED, paddingHorizontal: S.xl, textAlign: 'center' },
  unsupportedIconWrap: {
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  unsupportedTitle: { fontSize: 24, fontFamily: FONT.display, color: FG, textAlign: 'center', marginBottom: 12, letterSpacing: -0.8 },
  unsupportedBody: { fontSize: 14.5, lineHeight: 21, color: FG_MUTED, textAlign: 'center', marginBottom: 28 },
});
