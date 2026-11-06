import { openSocialInstagram } from '@/lib/social-demo';
// ─── Franky Tap: acercad los móviles y hacéis match ─────────────────────────
// Una sola pantalla para todo: la radio busca sola (banda ultraancha en iPhone
// reciente, Bluetooth en el resto), el código escaneable está siempre a la
// vista como respaldo, y cualquier móvil detectado se puede confirmar con un
// toque. Al hacer match, celebración con la otra persona y acceso al chat.
import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { AtSign, Camera, Heart, MessageCircle, RefreshCw, Settings, Smartphone, Sparkles, X, Zap } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Avatar, Btn, EmptyState, Skeleton, Tap } from '@/components/ui';
import { Pulse } from '@/components/motion';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { useTap } from '@/lib/useTap';
import { isUuid, parseTapCode, tapCode } from '@/lib/tap';
import { toastError } from '@/lib/toast';
import { emitScrollTop } from '@/lib/scroll-top';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, FONT, R, S } from '@/theme';

export default function TapExperience() {
  const { uid } = useSessionIdentity();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; eventId?: string }>();
  if (uid === undefined) return <Screen title="Franky Tap" back pad><Skeleton height={380} /></Screen>;
  if (!uid) {
    return <Screen title="Franky Tap" back>
      <EmptyState icon={Heart} title="Entra para hacer match" subtitle="Acerca tu móvil al de la otra persona y hacéis match al instante." cta="Iniciar sesión" onCta={() => router.push('/welcome')} />
    </Screen>;
  }
  const eventId = isUuid(params.eventId) ? params.eventId : null;
  return <OwnedTap key={uid + ':' + eventId} owner={uid} eventId={eventId} />;
}

function OwnedTap({ owner, eventId }: { owner: string; eventId: string | null }) {
  const router = useRouter();
  const tap = useTap(owner, eventId);
  const [camera, setCamera] = useState(false);
  const [permission, requestCamera] = useCameraPermissions();

  const scan = async () => {
    const granted = permission?.granted ? permission : await requestCamera();
    if (!granted.granted) {
      toastError('Permite usar la cámara en Ajustes', 'También puedes enseñar tu código para que lo escanee la otra persona.');
      return;
    }
    setCamera(true);
  };
  const onCode = (raw: string) => {
    if (!camera) return;
    const peer = parseTapCode(raw);
    if (!peer) { setCamera(false); toastError('Ese código no es de Franky Tap', 'Abrid los dos Franky Tap y escanead el código de esa pantalla.'); return; }
    setCamera(false);
    tap.confirm(peer);
  };

  const noRadio = !!tap.capability && !tap.capability.available;
  const radioHint = !tap.capability ? null
    : tap.capability.reason === 'no_permission' ? 'Falta el permiso de Bluetooth. Concédelo en Ajustes o usad el código.'
    : tap.capability.reason === 'radio_off' ? 'Enciende el Bluetooth para detectar el otro móvil, o usad el código.'
    : tap.capability.reason === 'unavailable' ? 'Esta versión de Franky no incluye la detección por radio (pasa en Expo Go). Usad el código: funciona igual.'
    : tap.capability.reason === 'no_hardware' || tap.capability.reason === 'unsupported_os' ? 'Este móvil no puede detectar por radio. Usad el código: funciona igual.'
    : null;

  const status = tap.phase === 'connecting' ? '¡Móvil detectado! Haciendo match…'
    : tap.sighting?.precise && tap.sighting.distanceCm != null ? Math.round(tap.sighting.distanceCm) + ' cm · acercadlos un poco más'
    : tap.sighting ? 'Hay un móvil de Franky cerca · juntadlos'
    : noRadio ? 'Enseña tu código o escanea el suyo'
    : 'Buscando el otro móvil…';

  return <Screen title="Franky Tap" subtitle={eventId ? 'Match en el evento' : 'Acercad los móviles'} back pad scrollTopKey="franky-tap">
    {tap.phase === 'matched' && tap.result ? (
      <View style={{ gap: 18 }}>
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: C.accent2, padding: 26, borderRadius: 30, gap: 14, alignItems: 'center' }}>
          <Avatar name={tap.result.peer.full_name} uri={tap.result.peer.avatar_url} size={112} ring />
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.display, fontSize: 32, color: C.onAccent, textAlign: 'center', letterSpacing: -0.8 }}>
            ¡Match con {tap.result.peer.full_name}! 💜
          </Text>
          {tap.result.peer.university ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, opacity: 0.9, fontSize: 15, textAlign: 'center' }}>{tap.result.peer.university}</Text> : null}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
            {tap.result.ig_matched ? 'Os habéis acercado con Franky Tap. Ya tenéis chat y su Instagram.' : 'Os habéis acercado con Franky Tap. Ya podéis hablar.'}
          </Text>
        </View>
        {tap.result.conversation_id ? <Btn full icon={MessageCircle} label="Abrir el chat" onPress={() => router.push(`/chat/${tap.result!.conversation_id}`)} /> : null}
        {tap.result.ig_matched && tap.result.peer.instagram_handle ? (
          <Btn full variant="secondary" icon={AtSign} label={'Abrir @' + tap.result.peer.instagram_handle.replace(/^@/, '')} onPress={() => {
            const handle = tap.result?.peer.instagram_handle?.replace(/^@/, '');
            if (handle) void openSocialInstagram(handle);
          }} />
        ) : (
          <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderLight, borderRadius: 22, padding: 16, gap: 6 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>¿Y el Instagram?</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Se cruza solo cuando los dos tenéis Crush activo con vuestro usuario. Actívalo en Crush y el próximo Tap lo incluirá.</Text>
          </View>
        )}
        <Btn full variant="ghost" icon={RefreshCw} label="Hacer otro Tap" onPress={() => { tap.again(); emitScrollTop('franky-tap'); }} />
      </View>
    ) : (
      <View style={{ gap: 18 }}>
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: C.input, borderRadius: 28, padding: 24, alignItems: 'center', gap: 14 }}>
          <Pulse>
            <View style={{ width: 116, height: 116, borderRadius: 58, backgroundColor: C.surface, borderWidth: 2, borderColor: C.accent2, alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={50} color={C.accent2} />
              <View style={{ position: 'absolute', right: 9, bottom: 12, backgroundColor: C.accent2, borderRadius: 15, padding: 5 }}><Zap size={18} color={C.onAccent} /></View>
            </View>
          </Pulse>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, textAlign: 'center' }]}>Acerca tu móvil al suyo</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center' }]}>
            {tap.phase === 'idle' && !tap.error ? 'Preparando Franky Tap…' : status}
          </Text>
          {tap.session ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.accent2 }]}>Tu referencia · {tap.session.token.slice(-6).toUpperCase()}</Text> : null}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Los dos con esta pantalla abierta · {tap.elapsed} s</Text>
        </View>

        {tap.error ? (
          <View accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: C.error, borderRadius: 18, padding: 15, gap: 10 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{tap.error}</Text>
            {!tap.session ? <Btn full variant="ghost" label="Reintentar" onPress={() => void tap.retry()} /> : null}
          </View>
        ) : null}

        {tap.candidate && tap.phase !== 'connecting' ? (
          <View style={{ padding: 18, borderRadius: 22, borderColor: C.accent2, borderWidth: 1.5, gap: 12, backgroundColor: C.surface }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>Móvil detectado · {tap.candidate.reference}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
              {tap.candidate.precise ? 'Juntad los móviles y el match salta solo. Si no, confírmalo aquí.' : 'Comprueba que su referencia coincide con la que ves en su pantalla y confirma.'}
            </Text>
            <Btn full icon={Heart} label="Hacer match con este móvil" onPress={() => tap.confirm(tap.candidate!.token)} />
            <Btn full variant="ghost" label="No es esa persona" onPress={tap.dismissCandidate} />
          </View>
        ) : null}

        {radioHint || tap.radioError ? (
          <View style={{ padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 18, gap: 12 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{tap.radioError ?? radioHint}</Text>
            {(tap.capability?.reason === 'no_permission' || tap.capability?.reason === 'radio_off' || tap.radioError) ? <Btn full variant="ghost" icon={Settings} label="Abrir Ajustes" onPress={() => void Linking.openSettings()} /> : null}
          </View>
        ) : null}

        {camera ? (
          <View style={{ height: 300, borderRadius: 24, overflow: 'hidden' }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={v => onCode(v.data)} />
            <Tap onPress={() => setCamera(false)} accessibilityLabel="Cerrar cámara" style={{ position: 'absolute', right: 12, top: 12, backgroundColor: C.surface, padding: 12, borderRadius: 30 }}><X color={C.text} size={24} /></Tap>
          </View>
        ) : tap.session ? (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ padding: 16, backgroundColor: C.white, borderRadius: 22 }}>
              <QRCode value={tapCode(tap.session.token)} size={180} color={C.black} backgroundColor={C.white} />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>Si no conecta solo: que la otra persona escanee este código, o escanea tú el suyo.</Text>
          </View>
        ) : null}

        {tap.session && !camera ? <Btn full variant={noRadio ? 'primary' : 'ghost'} icon={Camera} label="Escanear su código" onPress={() => void scan()} /> : null}

        <View style={{ gap: 14 }}>
          {[
            ['1', 'Abrid Franky Tap en los dos móviles', 'Crush → Franky Tap. Sin perfiles ni cuestionarios.'],
            ['2', 'Juntad los móviles', 'Pantallas encendidas y Bluetooth activado. En iPhone reciente basta con acercarlos; en el resto, pegadlos un par de segundos.'],
            ['3', 'Match al instante', 'Los dos veis a la otra persona, se abre vuestro chat y, si tenéis Crush, se cruza el Instagram.'],
          ].map(([number, title, detail]) => (
            <View key={number} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.accent2 }]}>{number}</Text></View>
              <View style={{ flex: 1, gap: 4 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{title}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{detail}</Text></View>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.lg, padding: 12, backgroundColor: C.input }}>
          <Sparkles size={16} color={C.accent2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>Por el aire solo viaja un código aleatorio que caduca en minutos. Tu nombre y tu foto solo los ve la persona con la que haces match.</Text>
        </View>
      </View>
    )}
  </Screen>;
}
