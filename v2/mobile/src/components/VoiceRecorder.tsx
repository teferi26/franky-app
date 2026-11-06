// ─── Grabadora de nota de voz (expo-audio) ───────────────────────────────
// Dos formas de usarla:
//   · `useVoiceRecorder(...)`: el hook pelado, para pintar la grabación donde
//     haga falta (el chat la mete en la propia barra de escritura).
//   · `<VoiceRecorder/>`: el botón de siempre (lo usa publicar.tsx).
// En ambos casos el PRIMER toque empieza a grabar de verdad, sin pantallas ni
// hojas intermedias, y el segundo para y entrega el audio a quien la usa.
// La subida (uploadMedia) y el media_type los gestiona quien la usa.
//
// Los avisos van por toast (no por Alert): un modal para decir "muy corta" o
// "sin permiso" corta el ritmo de grabar y obliga a un toque extra.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Mic, Square } from 'lucide-react-native';
import { Tap } from './ui';
import { Pulse } from './motion';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, FONT } from '@/theme';

/** Corte automático, igual que la web (chats/client.tsx). */
const MAX_MS = 60_000;
/** Por debajo de esto es un toque accidental, no una nota de voz. */
const MIN_MS = 800;

export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function useVoiceRecorder({ onRecorded, maxMs = MAX_MS, beforeRecord }: {
  /** Se llama al parar (no al cancelar): uri local del audio y duración en ms. */
  onRecorded: (uri: string, durationMs: number) => void;
  maxMs?: number;
  /** Optional availability check before asking for microphone permission. */
  beforeRecord?: () => Promise<boolean>;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [busy, setBusy] = useState(false);
  // Evita que el corte por tiempo y el toque del usuario se pisen.
  const finishingRef = useRef(false);
  const startingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const start = useCallback(async () => {
    if (finishingRef.current || startingRef.current || !alive.current) return;
    startingRef.current = true;
    try {
      if (beforeRecord && !await beforeRecord()) return;
      if (!alive.current) return;
      const perm = await requestRecordingPermissionsAsync();
      if (!alive.current) return;
      if (!perm.granted) {
        toastError('Permiso de micrófono', 'Actívalo en los ajustes del móvil para grabar una nota de voz.');
        return;
      }
      // allowsRecording (iOS necesita esto para poder grabar en modo silencio).
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!alive.current) return;
      await recorder.prepareToRecordAsync();
      if (!alive.current) return;
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      if (alive.current) toastError('No se pudo grabar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      startingRef.current = false;
    }
  }, [recorder, beforeRecord]);

  const finish = useCallback(async (send: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setBusy(true);
    const durationMs = state.durationMillis; // se lee antes de parar (luego se resetea)
    try {
      await recorder.stop();
      // playsInSilentMode se REPONE al salir de grabación: si se deja a false
      // (el valor por defecto de iOS), la nota de voz recién grabada y todo lo
      // que se reproduzca después suena mudo con el móvil en silencio.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      if (!send) return;
      if (!uri) { toastError('No se guardó', 'La grabación salió vacía, inténtalo de nuevo.'); return; }
      if (durationMs < MIN_MS) {
        toastError('Nota de voz muy corta', 'Mantén el micrófono activo al menos un segundo.');
        return;
      }
      onRecorded(uri, durationMs);
    } catch {
      toastError('No se pudo guardar', 'Inténtalo de nuevo en unos segundos.');
    } finally {
      setBusy(false);
      finishingRef.current = false;
    }
  }, [recorder, state.durationMillis, onRecorded]);

  /** Para y entrega el audio. */
  const stop = useCallback(() => { void finish(true); }, [finish]);
  /** Para y lo tira: el usuario se ha arrepentido. */
  const cancel = useCallback(() => { void finish(false); }, [finish]);

  // Corte automático al llegar al máximo: se envía lo grabado, como la web.
  useEffect(() => {
    if (state.isRecording && state.durationMillis >= maxMs) void finish(true);
  }, [state.isRecording, state.durationMillis, maxMs, finish]);

  return {
    recording: state.isRecording,
    durationMillis: state.durationMillis,
    busy,
    start,
    stop,
    cancel,
    /** Un toque: si no graba empieza, si graba para y entrega. */
    toggle: useCallback(() => { if (state.isRecording) stop(); else void start(); }, [state.isRecording, start, stop]),
  };
}

export function VoiceRecorder({ onRecorded, disabled, beforeRecord }: {
  onRecorded: (uri: string, durationMs: number) => void;
  disabled?: boolean;
  beforeRecord?: () => Promise<boolean>;
}) {
  const { recording, durationMillis, busy, toggle } = useVoiceRecorder({ onRecorded, beforeRecord });

  return (
    <Tap onPress={disabled ? undefined : toggle} disabled={disabled || busy}
      accessibilityLabel={recording ? 'Parar grabación y adjuntar' : 'Grabar nota de voz'}
      accessibilityState={{ busy }}
      style={{ alignSelf: 'flex-start' }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46,
        borderWidth: 0.5, borderColor: recording ? C.error : C.border, borderRadius: R.md,
        paddingVertical: 8, paddingHorizontal: 14, opacity: disabled ? 0.4 : 1,
        // Tinte translúcido del color de error: funciona en los tres temas
        // (un rosa fijo se veía blanco sobre el fondo oscuro).
        backgroundColor: recording ? `${C.error}12` : 'transparent',
      }}>
        {/* Grabando: el cuadrado late (Pulse respeta "reducir movimiento"). */}
        {recording
          ? <Pulse min={0.4}><Square size={15} color={C.error} fill={C.error} strokeWidth={2} /></Pulse>
          : <Mic size={18} color={C.text} strokeWidth={1.75} />}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.semibold, color: recording ? C.error : C.text }}>
          {recording ? `Grabando ${fmtDur(durationMillis)} · toca para parar` : 'Grabar nota de voz'}
        </Text>
      </View>
    </Tap>
  );
}
