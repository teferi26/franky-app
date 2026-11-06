// ─── Verificación del email universitario (migración 025) ─────────────────
// Da el badge de "estudiante verificado". La RPC
// request_student_email_verification valida el dominio académico y genera el
// token; el envío del correo lo hace la capa web.
//
// Diseño: cabecera estándar (Screen back) y tres estados con la misma forma
// (icono en círculo, titular y explicación): ya verificado, correo enviado y
// formulario. El error va debajo del campo, nunca en un Alert.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BadgeCheck, MailCheck } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, SkeletonList } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase, WEB_URL, fetchConTimeout } from '@/lib/supabase';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F } from '@/theme';

export default function VerificarEstudiante() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [already, setAlready] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/welcome'); return; }
      const { data } = await supabase.from('profiles')
        .select('student_email_verified, student_email').eq('id', user.id).maybeSingle();
      setAlready(Boolean(data?.student_email_verified));
      if (data?.student_email && !data?.student_email_verified) setEmail(String(data.student_email));
      setLoaded(true);
    })();
  }, [router]);

  // Traduce los códigos que lanza la RPC (RAISE EXCEPTION) a mensajes claros.
  const humanError = (raw: string): string => {
    if (raw.includes('unsupported_domain')) return 'Ese dominio no es de una universidad reconocida. Usa tu correo oficial (por ejemplo el acabado en .edu o el de tu campus).';
    if (raw.includes('invalid_email')) return 'Ese email no es válido. Revísalo e inténtalo de nuevo.';
    if (raw.includes('email_taken')) return 'Ese correo ya está verificado en otra cuenta.';
    if (raw.includes('not_authenticated')) return 'Tu sesión ha caducado. Vuelve a entrar.';
    return 'No se pudo enviar la verificación. Inténtalo de nuevo.';
  };

  const submit = async () => {
    if (!email.includes('@')) {
      setError('Escribe tu correo de la universidad para poder verificarlo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // El correo lo envía el ENDPOINT web (Resend), no la RPC: antes se
      // llamaba a la RPC directamente, que generaba el token... y nadie
      // mandaba el email, así que "Revisa tu correo" era mentira. El endpoint
      // acepta el Bearer del móvil y además sobrevive a la migración 149 (que
      // deja de exponer el token a los clientes por seguridad).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Tu sesión ha caducado. Vuelve a entrar.'); return; }
      const res = await fetchConTimeout(`${WEB_URL}/api/auth/student-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        const code = (body as { error?: string }).error ?? '';
        if (code === 'email_not_configured' || code === 'send_failed') {
          setError('Ahora mismo no podemos enviar el correo. Inténtalo más tarde.');
        } else if (res.status === 429) {
          setError('Demasiados intentos. Espera un rato antes de pedir otro correo.');
        } else {
          setError(humanError(code));
        }
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent(true);
    } catch {
      setError('Sin conexión. Revisa tu red e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Verificar estudiante" back>
      {!loaded ? (
        <View style={{ paddingTop: S.xl }}><SkeletonList count={2} height={90} /></View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingHorizontal: 28, paddingTop: S.xl }}>
            {already ? (
              <FadeIn style={{ alignItems: 'center', paddingTop: 24 }}>
                <BadgeCheck size={44} color={C.success} strokeWidth={1.5} />
                <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[F.display, { fontSize: 27, letterSpacing: -1, textAlign: 'center', marginTop: 18 }]}>
                  Ya estás verificado
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 10 }]}>
                  Tu email universitario ya está confirmado y luces el badge de estudiante verificado.
                </Text>
              </FadeIn>
            ) : sent ? (
              <FadeIn style={{ alignItems: 'center', paddingTop: 24 }}>
                <MailCheck size={44} color={C.blue} strokeWidth={1.5} />
                <Text accessibilityRole="header" accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[F.display, { fontSize: 27, letterSpacing: -1, textAlign: 'center', marginTop: 18 }]}>
                  Revisa tu correo
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 10 }]}>
                  Te hemos enviado un enlace de verificación a ese correo. Ábrelo para conseguir tu badge.
                </Text>
                <View style={{ marginTop: 26, alignSelf: 'stretch' }}>
                  <Btn full label="Entendido" onPress={() => router.back()} />
                </View>
              </FadeIn>
            ) : (
              <>
                {/* Cabecera editorial: rotulo pequeno, titular grande y texto. */}
                <FadeIn>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <BadgeCheck size={18} color={C.blue} strokeWidth={1.75} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Estudiante verificado</Text>
                  </View>
                  <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[F.display, { fontSize: 28, letterSpacing: -1, lineHeight: 33, marginTop: 10, marginBottom: 10 }]}>
                    Verifica tu email universitario
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, lineHeight: 22, marginBottom: 26 }]}>
                    Confirma tu correo oficial de la universidad para conseguir el badge de estudiante verificado. Da confianza a tu comunidad.
                  </Text>
                </FadeIn>

                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Correo de la universidad</Text>
                <TextInput
                  placeholder="tunombre@universidad.es" placeholderTextColor={C.muted}
                  autoCapitalize="none" keyboardType="email-address"
                  textContentType="emailAddress" autoComplete="email"
                  autoFocus returnKeyType="send" onSubmitEditing={busy ? undefined : submit}
                  accessibilityLabel="Correo de la universidad" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  value={email} onChangeText={(v) => { setEmail(v); setError(null); }}
                  style={{
                    backgroundColor: C.surface, borderWidth: error ? 1 : 0.5, borderColor: error ? C.error : C.border,
                    borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12,
                    fontSize: 15, color: C.text,
                  }} />
                {error ? (
                  <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={{ color: C.error, fontSize: 13, marginTop: 8, lineHeight: 18 }}>{error}</Text>
                ) : null}
                <View style={{ marginTop: 18 }}>
                  <Btn full busy={busy} label="Enviar verificación" onPress={submit} />
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </Screen>
  );
}
