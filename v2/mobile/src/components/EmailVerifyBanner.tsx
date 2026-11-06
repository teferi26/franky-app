import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Mail } from 'lucide-react-native';
import { supabase, WEB_URL, fetchConTimeout } from '@/lib/supabase';
import { Tap } from '@/components/ui';
import { t } from '@/lib/i18n';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

// ─── Banner de verificación de email (migración 145) ─────────────────────
// Desde el 25-jul-2026 el backend exige email verificado para publicar,
// comentar y chatear (trigger enforce_email_verified de la 145). La web ya
// tiene su banner; este es el equivalente móvil, pensado para montarse
// encima de cualquier formulario de publicación (publicar.tsx hoy, chat y
// comentarios después).
//
// Filosofía fail-soft en todo: si la RPC is_email_verified (141) no existe,
// falla o no hay sesión, el banner simplemente NO se muestra. Nunca puede
// romper la pantalla que lo monta.

type ResendResult =
  | { status: 'sent' }
  | { status: 'already' }
  | { status: 'auth' }
  | { status: 'error' }
  | { status: 'wait'; retryAfterMinutes: number };

/**
 * Reenvía el correo de verificación del usuario con sesión llamando al
 * endpoint de la web (POST /api/auth/resend-verification) con el access
 * token en Authorization. Exportado aparte para que otras pantallas (por
 * ejemplo el Alert de publicar.tsx) reutilicen exactamente el mismo POST.
 * Nunca lanza: cualquier fallo se devuelve como { status: 'error' }.
 */
export async function resendVerificationEmail(): Promise<ResendResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { status: 'auth' };
    const res = await fetchConTimeout(`${WEB_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      // El rate limit del servidor (3/hora) responde con retryAfter en
      // segundos, tanto en el JSON como en la cabecera Retry-After.
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      const raw = (data as { retryAfter?: number }).retryAfter;
      const secs = typeof raw === 'number' && raw > 0
        ? raw
        : Number(res.headers.get('Retry-After')) || 0;
      return { status: 'wait', retryAfterMinutes: Math.max(1, Math.ceil(secs / 60)) };
    }
    if (!res.ok) return { status: 'error' };
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    return { status: (data as { already?: boolean }).already ? 'already' : 'sent' };
  } catch {
    return { status: 'error' };
  }
}

export function EmailVerifyBanner() {
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return; // sin sesión no hay nada que verificar
        const { data, error } = await supabase.rpc('is_email_verified');
        if (cancelled || error) return; // fail-soft: ante la duda, no molestar
        if (data === false) setVisible(true);
      } catch {
        // fail-soft: RPC inexistente o sin red, el banner no aparece
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resend = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setFeedback(null);
    const res = await resendVerificationEmail();
    setSending(false);
    if (res.status === 'sent') {
      setFeedback(t('verifyEmail.sent'));
    } else if (res.status === 'already') {
      // El servidor dice que ya está verificado: el banner sobra.
      setVisible(false);
    } else if (res.status === 'wait') {
      setFeedback(t('verifyEmail.wait', { minutes: res.retryAfterMinutes }));
    } else {
      setFeedback(t('verifyEmail.sendError'));
    }
  }, [sending]);

  if (!visible) return null;

  // Banda limpia: superficie con hairline y el icono suelto, sin bloque
  // tintado. Funciona igual en los tres temas (light, dark, franky).
  return (
    <View accessibilityLiveRegion="polite" style={{
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
      borderRadius: R.md, padding: S.md, gap: 6,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Mail size={19} color={C.blue} strokeWidth={1.75} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ flex: 1, fontSize: 13.5, fontFamily: FONT.semibold, color: C.text, lineHeight: 18 }}>
          {t('verifyEmail.banner')}
        </Text>
        <Tap onPress={sending ? undefined : resend} disabled={sending}
          accessibilityLabel={t('verifyEmail.resend')}
          accessibilityState={{ busy: sending }}
          style={{ paddingHorizontal: 8, paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.blue, opacity: sending ? 0.5 : 1 }}>
            {sending ? t('verifyEmail.sending') : t('verifyEmail.resend')}
          </Text>
        </Tap>
      </View>
      {feedback ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { lineHeight: 16 }]}>{feedback}</Text>
      ) : null}
    </View>
  );
}

export default EmailVerifyBanner;
