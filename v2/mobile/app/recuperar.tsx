// ─── Recuperar contraseña ─────────────────────────────────────────────────
// Nativo: antes welcome.tsx abría la web; ahora se hace dentro de la app con
// supabase.auth.resetPasswordForEmail. El enlace del correo lleva a
// WEB_URL/restablecer, donde el usuario pone la nueva clave.
//
// Diseño: cabecera estándar (Screen back) y dos estados claros, formulario y
// confirmación ilustrada. El error del email va debajo del campo, no en un
// Alert: aquí solo hay un campo y sacar un modal para eso es desproporcionado.
import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MailCheck } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase, WEB_URL } from '@/lib/supabase';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F } from '@/theme';

export default function Recuperar() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.includes('@')) {
      setError('Escribe un email válido para poder enviarte el enlace.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // No revelamos si la cuenta existe (anti-enumeración): pase lo que pase,
      // mostramos el mismo mensaje de éxito. Solo los errores de red se avisan.
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${WEB_URL}/restablecer`,
      });
      // Un error de rate limit o de red no debe filtrar existencia de cuenta:
      // solo distinguimos "sin conexión" para que el usuario sepa reintentar.
      if (err && /network|fetch|Failed to/i.test(err.message)) {
        setSent(false);
        toastError('Sin conexión', 'No pudimos enviar el enlace. Inténtalo de nuevo.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSent(true);
    } catch {
      toastError('Sin conexión', 'No pudimos enviar el enlace. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={sent ? 'Correo enviado' : 'Recuperar contraseña'} back>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 28, paddingTop: S.xl }}>
          {sent ? (
            <FadeIn style={{ alignItems: 'center', paddingTop: 20 }}>
              <MailCheck size={44} color={C.blue} strokeWidth={1.5} />
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[F.display, { fontSize: 27, letterSpacing: -1, textAlign: 'center', marginTop: 18, marginBottom: 10 }]}>
                Revisa tu correo
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, textAlign: 'center', lineHeight: 22 }]}>
                Te hemos enviado un correo para restablecer tu contraseña. Sigue el enlace para elegir una nueva.
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 10, lineHeight: 16 }]}>
                Si no lo ves en unos minutos, mira en la carpeta de spam.
              </Text>
              <View style={{ marginTop: 28, alignSelf: 'stretch' }}>
                <Btn full label="Volver al inicio de sesión" onPress={() => router.back()} />
              </View>
            </FadeIn>
          ) : (
            <>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[F.display, { fontSize: 29, letterSpacing: -1.1, lineHeight: 33, marginBottom: 10 }]}>
                ¿Olvidaste tu contraseña?
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, lineHeight: 22, marginBottom: 24 }]}>
                Escribe tu email y te enviaremos un enlace para restablecerla.
              </Text>

              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Email</Text>
              <TextInput
                placeholder="tu@email.com" placeholderTextColor={C.muted}
                autoCapitalize="none" keyboardType="email-address"
                textContentType="emailAddress" autoComplete="email"
                autoFocus returnKeyType="send" onSubmitEditing={busy ? undefined : submit}
                accessibilityLabel="Email" maxFontSizeMultiplier={MAX_FONT_SCALE}
                value={email} onChangeText={(v) => { setEmail(v); if (error) setError(null); }}
                style={{
                  backgroundColor: C.surface, borderWidth: error ? 1 : 0.5, borderColor: error ? C.error : C.border,
                  borderRadius: R.md, paddingHorizontal: 14, minHeight: 48, paddingVertical: 12,
                  fontSize: 15, color: C.text,
                }} />
              {error ? (
                <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={[F.tiny, { color: C.error, marginTop: 5, lineHeight: 16 }]}>{error}</Text>
              ) : null}

              <View style={{ marginTop: 16 }}>
                <Btn full busy={busy} label="Enviar enlace" onPress={submit} />
              </View>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 14, lineHeight: 16 }]}>
                Si tienes una cuenta con ese email, recibirás el enlace en unos minutos.
              </Text>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
