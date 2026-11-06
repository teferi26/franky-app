// ─── Reproductor de vídeo reutilizable (expo-video) ──────────────────────
// Se usa inline (feed FOMO / Crush) y a pantalla completa (stories). Va
// silenciado por defecto (menos intrusivo y apto para autoplay), con botón de
// sonido, play/pausa al tocar, loop opcional y poster mientras carga. Para
// stories: autoPlay + onEnd, que dispara el avance al terminar el vídeo.
//
// Los colores fijos (negro de fondo, blanco de los controles) son a propósito:
// van SOBRE el vídeo, no sobre el tema, y tienen que verse igual en los tres.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import { Image } from 'expo-image';
import { Play, Volume2, VolumeX, VideoOff, RotateCcw } from 'lucide-react-native';
import { Tap } from './ui';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { FONT, R } from '@/theme';

export type VideoPlayerProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
  loop?: boolean;
  /** Arranca reproduciendo (stories). Inline se deja en false: se toca para ver. */
  autoPlay?: boolean;
  /** Se llama cuando el vídeo llega al final (con loop no se emite nunca). */
  onEnd?: () => void;
  /** Imagen que se pinta mientras el vídeo aún no está listo. */
  poster?: string | null;
  showMuteButton?: boolean;
  /** Si false, el toque no controla play/pausa (stories: lo gestiona el visor). */
  tapToggles?: boolean;
  /** Arranca en silencio (por defecto). Stories lo pasan a false para oír. */
  startMuted?: boolean;
  radius?: number;
};

export function VideoPlayer({
  uri, style, contentFit = 'cover', loop = false, autoPlay = false,
  onEnd, poster, showMuteButton = true, tapToggles = true, startMuted = true, radius = 0,
}: VideoPlayerProps) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.muted = startMuted;   // silenciado por defecto
    p.loop = loop;
    if (autoPlay) p.play();
  });

  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(startMuted);
  const [ready, setReady] = useState(false);
  // status 'error' del player (fichero corrupto, URL firmada caducada, sin
  // red): antes solo se escuchaba readyToPlay y el spinner giraba para siempre.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // El estado puede haber cambiado antes de enganchar los listeners (vídeo
    // en caché ya listo, o que ya falló): se lee al montar.
    setReady(player.status === 'readyToPlay');
    setFailed(player.status === 'error');
    const subs = [
      player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener('statusChange', ({ status }) => {
        setReady(status === 'readyToPlay');
        setFailed(status === 'error');
      }),
      player.addListener('mutedChange', ({ muted: m }) => setMuted(m)),
    ];
    // onEnd (stories): avanzar al terminar el vídeo. Con loop este evento no salta.
    if (onEnd) subs.push(player.addListener('playToEnd', () => onEnd()));
    return () => subs.forEach((s) => s.remove());
  }, [player, onEnd]);

  // Al salir de la pantalla (otra pestaña, un detalle encima) el vídeo se
  // pausa: seguía sonando o gastando batería detrás de otra pantalla. Al
  // desmontar, useVideoPlayer libera el player nativo por sí solo.
  useFocusEffect(useCallback(() => {
    return () => {
      try { if (player.playing) player.pause(); } catch { /* player ya liberado */ }
    };
  }, [player]));

  const togglePlay = () => {
    if (!tapToggles) return;
    if (player.playing) { player.pause(); return; }
    // Sin loop el player queda parado al final: al volver a darle play, reiniciar.
    if (!loop && player.duration > 0 && player.currentTime >= player.duration - 0.2) {
      player.currentTime = 0;
    }
    player.play();
  };

  const toggleMute = () => { player.muted = !player.muted; };

  // Reintentar: vuelve a cargar la misma fuente desde cero. Sirve tanto para
  // un corte de red puntual como para una URL firmada que ya se renovó.
  const retry = () => {
    setFailed(false);
    setReady(false);
    player.replace({ uri });
    if (autoPlay) player.play();
  };

  return (
    <View style={[{ overflow: 'hidden', borderRadius: radius, backgroundColor: '#000' }, style]}>
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit={contentFit}
        nativeControls={false}
      />

      {/* Capa de toque para play/pausa (encima del vídeo). */}
      {tapToggles ? (
        <Tap onPress={togglePlay} accessibilityLabel={playing ? 'Pausar vídeo' : 'Reproducir vídeo'}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {!playing ? (
              <View style={{
                width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(0,0,0,0.45)',
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Play size={25} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
              </View>
            ) : null}
          </View>
        </Tap>
      ) : null}

      {/* Error de carga: icono, texto y botón para reintentar. Va encima de la
          capa de toque para que tocar no intente reproducir lo que no hay. */}
      {failed ? (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: '#000',
        }}>
          <VideoOff size={28} color="rgba(255,255,255,0.8)" strokeWidth={1.6} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' }}>
            No se pudo cargar el vídeo
          </Text>
          <Tap onPress={retry} accessibilityLabel="Reintentar cargar el vídeo" hitSlop={8}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
              backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: R.full, paddingHorizontal: 14, paddingVertical: 7,
            }}>
              <RotateCcw size={14} color="#fff" strokeWidth={1.9} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 13, fontFamily: FONT.semibold }}>Reintentar</Text>
            </View>
          </Tap>
        </View>
      ) : null}

      {/* Poster + spinner mientras carga. */}
      {!ready && !failed ? (
        <View pointerEvents="none" style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center', backgroundColor: poster ? 'transparent' : '#000',
        }}>
          {poster ? (
            <Image source={{ uri: poster }} style={{ position: 'absolute', width: '100%', height: '100%' }}
              contentFit={contentFit === 'contain' ? 'contain' : 'cover'} cachePolicy="memory-disk" />
          ) : null}
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {/* Botón de sonido (encima de todo). hitSlop para llegar a 44 px. */}
      {showMuteButton ? (
        <Tap onPress={toggleMute} accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'} hitSlop={8}
          style={{ position: 'absolute', bottom: 10, right: 10 }}>
          <View style={{
            width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {muted ? <VolumeX size={17} color="#fff" strokeWidth={1.9} /> : <Volume2 size={17} color="#fff" strokeWidth={1.9} />}
          </View>
        </Tap>
      ) : null}
    </View>
  );
}
