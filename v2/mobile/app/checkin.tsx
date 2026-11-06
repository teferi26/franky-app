// ─── Check-in con QR en la puerta (mejora 73) ────────────────────────────
// Escaneo REAL con la cámara (expo-camera): el organizador apunta al QR de la
// entrada y se valida solo. Se mantiene la entrada manual como respaldo, por
// si el QR está roto, la pantalla del asistente no da brillo o el permiso de
// cámara está denegado.
//
// La validación la hace la RPC check_in_ticket (migración 136), que comprueba
// que quien valida es el organizador del evento y marca la entrada como usada
// de forma idempotente (si ya se usó, lo dice con la hora, no la "desusa").
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Animated } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { QrCode, Keyboard as KeyboardIcon, CameraOff, CheckCircle2, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Tap, IconCircle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { dateLong } from '@/lib/format';
import { useReduceMotion, MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';

type ResultKind = 'ok' | 'warn' | 'error';
type CheckinResult = { kind: ResultKind; title: string; subtitle?: string };

// Icono por resultado: en la puerta, con prisa y poca luz, la forma se lee
// antes que el color (y funciona para quien no distingue verde de rojo).
const RESULT_ICON: Record<ResultKind, LucideIcon> = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle };

// Tras validar dejamos un respiro antes de admitir otro escaneo, para no
// disparar diez lecturas del mismo QR mientras la cámara sigue apuntando.
const RESCAN_MS = 2200;

export default function Checkin() {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  // Bloqueo de relectura: evita validar el mismo QR muchas veces seguidas.
  const lockedRef = useRef(false);

  const validate = useCallback(async (rawToken: string, fromCamera: boolean) => {
    const token = rawToken.trim();
    if (!token) return;
    setChecking(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc('check_in_ticket', { p_qr_token: token });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as {
        ok: boolean; status: string; event_title: string | null;
        holder_name: string | null; used_at: string | null;
      } | null;

      if (row?.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setResult({
          kind: 'ok', title: 'Entrada válida',
          subtitle: `${row.holder_name ?? 'Asistente'} · ${row.event_title ?? 'este evento'}`,
        });
        if (!fromCamera) setCode('');
      } else if (row?.status === 'already_used') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setResult({
          kind: 'warn', title: 'Esta entrada ya se usó',
          subtitle: `${row.holder_name ?? 'Asistente'}${row.used_at ? ` · usada ${dateLong(row.used_at)}` : ''}`,
        });
      } else if (row?.status === 'not_paid') {
        // Estados de la migración 162: antes la RPC dejaba pasar entradas sin
        // pagar y aquí solo salía "Entrada no encontrada", que despista al
        // organizador en la puerta.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResult({
          kind: 'error', title: 'Entrada sin pagar',
          subtitle: `${row.holder_name ?? 'El asistente'} reservó pero no completó el pago. No le dejes pasar hasta que pague.`,
        });
      } else if (row?.status === 'refunded') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResult({
          kind: 'error', title: 'Entrada reembolsada',
          subtitle: `${row.holder_name ?? 'El asistente'} recuperó su dinero, así que esta entrada ya no vale.`,
        });
      } else if (row?.status === 'not_valid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResult({ kind: 'error', title: 'Entrada no válida', subtitle: 'Esta entrada ya no sirve para entrar (cancelada o transferida).' });
      } else if (row?.status === 'not_organizer') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResult({ kind: 'error', title: 'No eres el organizador', subtitle: 'Esta entrada es de otro evento que no organizas tú.' });
      } else if (row?.status === 'no_auth') {
        setResult({ kind: 'error', title: 'Inicia sesión', subtitle: 'Necesitas una cuenta para hacer check-in.' });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        setResult({ kind: 'error', title: 'Entrada no encontrada', subtitle: 'Revisa el código e inténtalo de nuevo.' });
      }
    } catch {
      setResult({ kind: 'error', title: 'No se pudo validar', subtitle: 'Comprueba tu conexión e inténtalo de nuevo.' });
    } finally {
      setChecking(false);
    }
  }, []);

  // Lectura del QR. El token que guardamos en el QR de la entrada es el
  // qr_token tal cual (ver app/entradas.tsx), así que se manda directo.
  const onScanned = useCallback((scan: BarcodeScanningResult) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    validate(scan.data, true).finally(() => {
      setTimeout(() => { lockedRef.current = false; }, RESCAN_MS);
    });
  }, [validate]);

  // Los colores salen de C EN RENDER (la paleta es mutable con el tema): si se
  // calculan a nivel de módulo se congelan los del modo con el que arrancó la app.
  const RESULT_COLOR: Record<ResultKind, string> = { ok: C.success, warn: C.warning, error: C.error };
  const color = result ? RESULT_COLOR[result.kind] : null;

  // Animación de acierto: la tarjeta del resultado entra con un pequeño rebote
  // de escala. En la puerta, el organizador mira de reojo, y el movimiento
  // confirma que SÍ ha habido lectura nueva (aunque el texto sea el mismo).
  const pop = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (!result) return;
    if (reduceMotion) { pop.setValue(1); return; }
    pop.setValue(0.9);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
  }, [result, pop, reduceMotion]);

  const ResultIcon = result ? RESULT_ICON[result.kind] : null;
  const resultCard = result && color && ResultIcon ? (
    <Animated.View
      accessibilityLiveRegion="assertive" accessible
      accessibilityLabel={`${result.title}. ${result.subtitle ?? ''}`}
      style={{
        transform: [{ scale: pop }], flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: `${color}12`, borderRadius: R.lg, borderWidth: 0.5, borderColor: `${color}55`, padding: S.lg,
      }}>
      <ResultIcon size={30} color={color} strokeWidth={1.75} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color, fontSize: 18, fontFamily: FONT.heading, letterSpacing: -0.3 }}>{result.title}</Text>
        {result.subtitle ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.text, marginTop: 2 }]}>{result.subtitle}</Text>
        ) : null}
      </View>
    </Animated.View>
  ) : null;

  // ── Entrada manual (respaldo) ────────────────────────────────────────────
  if (manual) {
    return (
      <Screen title="Check-in en la puerta" back>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ padding: S.lg, gap: 14 }}>
            <View style={{ alignItems: 'center', gap: 10, marginTop: S.sm }}>
              <IconCircle icon={QrCode} size={64} strokeWidth={1.7} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>
                Escribe el código que aparece bajo el QR de la entrada del asistente.
              </Text>
            </View>

            <View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Código de la entrada</Text>
              <TextInput
                value={code} onChangeText={setCode}
                placeholder="Pega o escribe el código" placeholderTextColor={C.muted}
                autoCapitalize="none" autoCorrect={false} autoFocus
                accessibilityLabel="Código de la entrada"
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                returnKeyType="done"
                onSubmitEditing={() => validate(code, false)}
                style={{
                  backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
                  paddingHorizontal: 14, paddingVertical: 13, minHeight: 48,
                  fontSize: 15, color: C.text,
                }}
              />
            </View>

            <Btn full busy={checking} disabled={!code.trim()} label="Validar" onPress={() => validate(code, false)} />
            {resultCard}
            <Btn full variant="secondary" label="Volver al escáner" onPress={() => { setManual(false); setResult(null); }} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  // ── Escáner de cámara ────────────────────────────────────────────────────
  // permission es null mientras se resuelve el estado inicial del permiso.
  if (!permission) {
    return (
      <Screen title="Check-in en la puerta" back>
        <View style={{ padding: S.lg, alignItems: 'center', paddingTop: 40 }}>
          <ActivityIndicator color={C.blue} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen title="Check-in en la puerta" back>
        <View style={{ padding: S.lg, gap: 14, alignItems: 'center', paddingTop: 30 }}>
          <IconCircle icon={CameraOff} size={72} strokeWidth={1.6} />
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 20, textAlign: 'center' }]}>Necesitamos la cámara</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>
            Para escanear el QR de las entradas en la puerta. Solo se usa aquí, y nada se graba.
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
            <Btn full label="Permitir cámara" onPress={() => { requestPermission(); }} />
            <Btn full variant="secondary" label="Escribir el código a mano" onPress={() => setManual(true)} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Check-in en la puerta" back>
      <View style={{ padding: S.lg, gap: 14 }}>
        <View style={{
          height: 340, borderRadius: R.xl, overflow: 'hidden', backgroundColor: '#000',
          borderWidth: 0.5, borderColor: C.border,
        }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={checking ? undefined : onScanned}
          />
          {/* Marco guía: ayuda a encuadrar el QR. Va sobre la imagen de la
              cámara, así que el color es fijo a propósito (no depende del tema).
              Al validar se tiñe del color del resultado: confirmación visual sin
              tener que bajar la vista a la tarjeta. */}
          <View pointerEvents="none" style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Animated.View style={{
              width: 210, height: 210, borderRadius: R.xl,
              transform: [{ scale: pop }],
              borderWidth: 2, borderColor: color ?? 'rgba(255,255,255,0.9)',
            }} />
          </View>
          {checking ? (
            <View style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
              alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
            }}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
        </View>

        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center' }]}>
          Apunta al QR de la entrada. Se valida solo.
        </Text>

        {resultCard}

        <Tap onPress={() => { setManual(true); setResult(null); }}
          accessibilityLabel="Escribir el código a mano"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, minHeight: 44 }}>
          <KeyboardIcon size={17} color={C.blue} strokeWidth={1.9} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontFamily: FONT.semibold, fontSize: 14.5 }}>Escribir el código a mano</Text>
        </Tap>
      </View>
    </Screen>
  );
}
