// ─── Seguridad de la cuenta ──────────────────────────────────────────────
// Paridad con web/src/app/perfil/seguridad: verificación en dos pasos (TOTP)
// para CUALQUIER usuario, no solo para el staff, y cambio de contraseña con
// reautenticación. La lógica del segundo factor se reutiliza de
// src/lib/admin.ts (enroll, challenge, verify); lo demás vive en
// src/lib/security.ts.
//
// Dos reglas de Supabase que marcan el flujo:
//   1. Quitar un factor verificado exige sesión aal2: si se entró solo con
//      contraseña, primero se pide el código.
//   2. Cambiar la contraseña con MFA activo también exige aal2, y la
//      reautenticación se hace con un cliente aparte para no degradar la
//      sesión (ver security.ts).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Alert, Clipboard } from 'react-native';
import * as Haptics from 'expo-haptics';
import QRCode from 'react-native-qrcode-svg';
import { ShieldCheck, KeyRound, Copy, ShieldOff, Lock, ShieldAlert } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Card, EmptyState, SkeletonList, Tap, Pill } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import {
  getAal, listVerifiedFactors, elevateWithTotp,
  empezarAltaTotp, confirmarAltaTotp, cancelarAltaTotp, type FactorNuevo, type AalLevel,
} from '@/lib/admin';
import {
  getCuentaInfo, cambiarPassword, quitarFactor, validarPassword, PASSWORD_MIN, type CuentaInfo,
} from '@/lib/security';
import { C, S, F, R, FONT } from '@/theme';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';

type Factor = { id: string; name: string | null };

/** Campo de código de 6 cifras, el mismo aspecto que el del panel admin. */
function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad" textContentType="oneTimeCode"
      autoComplete="one-time-code" placeholder="123456" autoFocus={autoFocus}
      placeholderTextColor={C.muted} maxLength={6}
      accessibilityLabel="Código de 6 cifras de tu app de autenticación"
      maxFontSizeMultiplier={1.3}
      style={{
        backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingVertical: 16,
        fontSize: 28, fontFamily: FONT.heading, letterSpacing: 9, textAlign: 'center', color: C.text,
      }}
    />
  );
}

// Campo de contraseña con la etiqueta encima y el error DEBAJO del propio
// campo: los avisos de "no coinciden" iban en Alert y obligaban a un toque
// extra para volver justo al sitio donde estaba el fallo.
function PasswordInput({ value, onChange, placeholder, label, error }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string; error?: string;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={C.muted} secureTextEntry autoCapitalize="none" autoCorrect={false}
        textContentType="password" accessibilityLabel={label} maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{
          backgroundColor: C.surface, borderWidth: error ? 1 : 0.5, borderColor: error ? C.error : C.border,
          borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12, fontSize: 15, color: C.text,
        }}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.tiny, { color: C.error, lineHeight: 16 }]}>{error}</Text>
      ) : null}
    </View>
  );
}

export default function Seguridad() {
  const owner = useSessionOwner();
  if (!owner) return <Screen title="Seguridad" back><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { padding: S.lg }]}>Inicia sesión para revisar la seguridad de tu cuenta.</Text></Screen>;
  return <OwnedSecurity key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}

function OwnedSecurity({ owner }: { owner: SessionIdentity }) {
  const isCurrent = useOwnerGuard(owner);
  const loadRevision = useRef(0);
  const actionBusy = useRef(false);
  useEffect(() => () => { loadRevision.current++; }, []);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aal, setAal] = useState<AalLevel>(null);
  const [factores, setFactores] = useState<Factor[]>([]);
  const [cuenta, setCuenta] = useState<CuentaInfo | null>(null);

  // Alta de un TOTP en curso (QR + secreto). null = sin alta en marcha.
  const [alta, setAlta] = useState<FactorNuevo | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaError, setMfaError] = useState('');
  // Modo "pidiendo código" para una acción que exige aal2: desactivar o cambiar contraseña.
  const [pendiente, setPendiente] = useState<'desactivar' | 'password' | null>(null);

  // Cambio de contraseña.
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErrors, setPwErrors] = useState<{ actual?: string; nueva?: string; repetir?: string }>({});

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    const revision = ++loadRevision.current;
    const current = () => isCurrent() && revision === loadRevision.current;
    setFailed(false);
    try {
      const [a, f, c] = await Promise.all([getAal(), listVerifiedFactors(), getCuentaInfo()]);
      if (!current()) return;
      setAal(a); setFactores(f); setCuenta(c);
    } catch {
      if (current()) setFailed(true);
    } finally {
      if (current()) { setLoading(false); setRefreshing(false); }
    }
  }, [isCurrent]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const activo = factores.length > 0;
  const elevada = aal === 'aal2';

  // ── Activar: enroll -> QR -> primer código ──
  const empezarAlta = async () => {
    if (!isCurrent() || actionBusy.current) return;
    actionBusy.current = true;
    setMfaError(''); setBusy(true);
    try {
      const f = await empezarAltaTotp('Franky', isCurrent);
      if (isCurrent()) setAlta(f);
    } catch (e) {
      if (isCurrent()) setMfaError(e instanceof Error ? e.message : 'No se pudo empezar la activación.');
    } finally {
      actionBusy.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const confirmarAlta = async () => {
    if (!isCurrent() || actionBusy.current || !alta) return;
    actionBusy.current = true;
    setMfaError(''); setBusy(true);
    try {
      await confirmarAltaTotp(alta.factorId, code, isCurrent);
      if (!isCurrent()) return;
      setAlta(null); setCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Verificación en dos pasos activada', 'Guarda la clave en un sitio seguro.');
      await load();
    } catch {
      if (isCurrent()) setMfaError('Ese código no vale. Espera al siguiente y vuelve a probar.');
    } finally {
      actionBusy.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const cancelarAlta = async () => {
    if (!isCurrent() || actionBusy.current) return;
    actionBusy.current = true;
    const f = alta;
    setAlta(null); setCode(''); setMfaError('');
    try { if (f) await cancelarAltaTotp(f.factorId, isCurrent); }
    finally { actionBusy.current = false; }
  };

  const copiarSecreto = () => {
    if (!isCurrent()) return;
    if (!alta) return;
    Clipboard.setString(alta.secret);
    toast('Clave copiada');
  };

  // ── Desactivar: confirmación destructiva y, si hace falta, código antes ──
  const desactivar = async (afterVerification = false) => {
    if (!isCurrent() || (!afterVerification && actionBusy.current)) return;
    const f = factores[0];
    if (!f) return;
    if (!afterVerification) actionBusy.current = true;
    setMfaError(''); setBusy(true);
    try {
      await quitarFactor(f.id, isCurrent);
      if (!isCurrent()) return;
      setPendiente(null); setCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      toast('Verificación en dos pasos desactivada');
      await load();
    } catch (e) {
      if (isCurrent()) setMfaError(e instanceof Error ? e.message : 'No se pudo desactivar.');
    } finally {
      if (!afterVerification) actionBusy.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  const pedirDesactivar = () => {
    if (!isCurrent()) return;
    Alert.alert(
      'Desactivar la verificación en dos pasos',
      'Tu cuenta volverá a protegerse solo con la contraseña. ¿Seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desactivar', style: 'destructive',
          onPress: () => {
            if (!isCurrent()) return;
            if (elevada) { void desactivar(); } else { setPendiente('desactivar'); setCode(''); setMfaError(''); }
          },
        },
      ],
    );
  };

  // ── Cambio de contraseña ──
  const enviarPassword = async (yaElevada = false) => {
    if (!isCurrent() || (!yaElevada && actionBusy.current)) return;
    const errs: { actual?: string; nueva?: string; repetir?: string } = {};
    const motivo = validarPassword(nueva);
    if (motivo) errs.nueva = motivo;
    if (nueva !== repetir) errs.repetir = 'Escribe la misma contraseña nueva en los dos campos.';
    if (!actual) errs.actual = 'Necesitamos tu contraseña actual para comprobar que eres tú.';
    setPwErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (activo && !elevada && !yaElevada) { setPendiente('password'); setCode(''); setMfaError(''); return; }
    if (!yaElevada) actionBusy.current = true;
    setPwBusy(true);
    try {
      await cambiarPassword(actual, nueva, isCurrent);
      if (!isCurrent()) return;
      setActual(''); setNueva(''); setRepetir(''); setPwErrors({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Contraseña cambiada', 'La próxima vez entra con la nueva.');
    } catch (e) {
      if (isCurrent()) toastError('No se pudo cambiar', e instanceof Error ? e.message : 'Inténtalo de nuevo.');
    } finally {
      if (!yaElevada) actionBusy.current = false;
      if (isCurrent()) setPwBusy(false);
    }
  };

  // ── Elevar la sesión con el código y ejecutar lo que estaba pendiente ──
  const verificarPendiente = async () => {
    if (!isCurrent() || actionBusy.current) return;
    const f = factores[0];
    if (!f || !pendiente) return;
    actionBusy.current = true;
    setMfaError(''); setBusy(true);
    try {
      await elevateWithTotp(f.id, code, isCurrent);
      if (!isCurrent()) return;
      setAal('aal2'); setCode('');
      if (pendiente === 'desactivar') { await desactivar(true); return; }
      setPendiente(null);
      await enviarPassword(true);
    } catch {
      if (isCurrent()) setMfaError('Código incorrecto o caducado. Mira la app y prueba con el actual.');
    } finally {
      actionBusy.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Seguridad" back>
        <View style={{ paddingTop: S.lg }}><SkeletonList count={2} height={150} /></View>
      </Screen>
    );
  }

  if (failed) {
    return (
      <Screen title="Seguridad" back>
        <EmptyState icon={ShieldAlert} title="No se pudo cargar"
          subtitle="Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={() => { setLoading(true); load(); }} />
      </Screen>
    );
  }

  return (
    <Screen title="Seguridad" back onRefresh={onRefresh} refreshing={refreshing}>
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.lg }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tu cuenta</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 6, lineHeight: 19 }]}>Añade un segundo factor y nadie podrá entrar solo con tu contraseña.</Text>
        </View>
      </FadeIn>

      {/* ── Estado de la verificación en dos pasos ── */}
      <FadeIn index={1}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Icono suelto de trazo fino, sin cuadrado tintado. */}
          {activo
            ? <ShieldCheck size={24} color={C.success} strokeWidth={1.75} />
            : <KeyRound size={24} color={C.muted} strokeWidth={1.75} />}
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Verificación en dos pasos</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>
              {activo
                ? (elevada ? 'Activada. Esta sesión ya está verificada.' : 'Activada. Esta sesión entró solo con contraseña.')
                : 'Tu cuenta se protege solo con la contraseña.'}
            </Text>
          </View>
          <Pill label={activo ? 'Activada' : 'No activada'} tone={activo ? 'green' : 'gray'} />
        </View>

        {/* Alta en curso: QR + clave + primer código */}
        {alta ? (
          <View style={{ marginTop: S.lg, gap: 14 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
              Escanea el código con Google Authenticator, Authy, 1Password o el llavero del iPhone y escribe el número de 6 cifras que te dé.
            </Text>
            {/* Fondo blanco fijo: un QR sobre fondo oscuro no lo lee ningún lector. */}
            {/* Blanco y negro fijos: un QR solo se lee con contraste maximo,
                asi que no sigue el tema (en oscuro seria ilegible). */}
            <View style={{ alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: R.lg, padding: S.lg, alignSelf: 'center' }}>
              <QRCode value={alta.uri} size={200} backgroundColor="#FFFFFF" color="#000000" />
            </View>
            <View style={{ gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>¿No puedes escanear? Escribe esta clave a mano en tu app:</Text>
              <Tap onPress={copiarSecreto} accessibilityLabel="Copiar la clave">
                <View style={{ backgroundColor: C.input, borderRadius: R.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} selectable style={{ flex: 1, textAlign: 'center', fontSize: 14, letterSpacing: 1.5, color: C.text }}>
                    {alta.secret}
                  </Text>
                  <Copy size={16} color={C.blue} strokeWidth={2.2} />
                </View>
              </Tap>
            </View>
            <CodeInput value={code} onChange={setCode} />
            {mfaError ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.error, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
            <Btn label="Activar" onPress={confirmarAlta} busy={busy} disabled={busy || code.length !== 6} full />
            <Btn variant="link" label="Cancelar" onPress={cancelarAlta} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
              Guarda la clave en un sitio seguro: si pierdes el móvil es la única forma de volver a entrar.
            </Text>
          </View>
        ) : pendiente ? (
          /* Acción que exige aal2: pedir el código antes */
          <View style={{ marginTop: S.lg, gap: 12 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
              {pendiente === 'desactivar'
                ? 'Para desactivarla, escribe el código actual de tu app de autenticación.'
                : 'Como tienes la verificación en dos pasos, escribe el código de tu app para cambiar la contraseña.'}
            </Text>
            <CodeInput value={code} onChange={setCode} autoFocus />
            {mfaError ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.error, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
            <Btn label={pendiente === 'desactivar' ? 'Verificar y desactivar' : 'Verificar y cambiar'}
              variant={pendiente === 'desactivar' ? 'danger' : 'primary'}
              onPress={verificarPendiente} busy={busy} disabled={busy || code.length !== 6} full />
            <Btn variant="link" label="Cancelar" onPress={() => { setPendiente(null); setCode(''); setMfaError(''); }} />
          </View>
        ) : (
          <View style={{ marginTop: S.lg, gap: 10 }}>
            {mfaError ? <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.error, fontSize: 13, textAlign: 'center' }}>{mfaError}</Text> : null}
            {activo ? (
              <>
                {factores.map((f) => (
                  <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11 }}>
                    <ShieldCheck size={16} color={C.success} strokeWidth={2.2} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]} numberOfLines={1}>{f.name || 'App de autenticación'}</Text>
                  </View>
                ))}
                <Btn variant="danger" icon={ShieldOff} label="Desactivar" onPress={pedirDesactivar} busy={busy} full />
              </>
            ) : (
              <>
                <Btn icon={ShieldCheck} label="Activar verificación en dos pasos" onPress={empezarAlta} busy={busy} full />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>
                  Necesitas una app de autenticación (Google Authenticator, Authy, 1Password o el llavero del iPhone).
                </Text>
              </>
            )}
          </View>
        )}
      </Card>
      </FadeIn>

      {/* ── Contraseña ── */}
      <FadeIn index={2}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Lock size={24} color={C.text} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Contraseña</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>
              {cuenta?.tienePassword
                ? `Mínimo ${PASSWORD_MIN} caracteres. Una frase que recuerdes funciona genial.`
                : 'Tu cuenta entra con Google o Apple, así que no tiene contraseña propia.'}
            </Text>
          </View>
        </View>
        {cuenta?.tienePassword ? (
          <View style={{ marginTop: S.lg, gap: 12 }}>
            <PasswordInput label="Contraseña actual" value={actual} error={pwErrors.actual}
              onChange={(v) => { setActual(v); if (pwErrors.actual) setPwErrors(e => ({ ...e, actual: undefined })); }}
              placeholder="Tu contraseña de ahora" />
            <PasswordInput label="Contraseña nueva" value={nueva} error={pwErrors.nueva}
              onChange={(v) => { setNueva(v); if (pwErrors.nueva) setPwErrors(e => ({ ...e, nueva: undefined })); }}
              placeholder={`Mín. ${PASSWORD_MIN} caracteres`} />
            <PasswordInput label="Repite la nueva" value={repetir} error={pwErrors.repetir}
              onChange={(v) => { setRepetir(v); if (pwErrors.repetir) setPwErrors(e => ({ ...e, repetir: undefined })); }}
              placeholder="Otra vez, para no equivocarte" />
            <Btn label="Cambiar contraseña" onPress={() => enviarPassword()} busy={pwBusy}
              disabled={pwBusy || !actual || !nueva || !repetir || pendiente !== null} full />
          </View>
        ) : null}
      </Card>
      </FadeIn>

      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', paddingHorizontal: S.xl, marginTop: S.md }]}>
        Si pierdes el acceso a tu app de autenticación, escríbenos a soporte@franky.es desde el correo de tu cuenta.
      </Text>
    </Screen>
  );
}
