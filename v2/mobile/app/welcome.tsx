// ─── Bienvenida y acceso ──────────────────────────────────────────────────
// Es la primera pantalla que ve alguien que llega de un QR o de Instagram, así
// que manda la jerarquía: logotipo, qué gana (tres beneficios con icono de
// marca), accesos sociales y, por último, el formulario de email.
//
// Los errores de validación se pintan DEBAJO del campo, no en un Alert: un
// modal para decir "el email no vale" saca al usuario del formulario, le tapa
// lo que estaba escribiendo y en un embudo de captación cuesta registros. Los
// fallos de servidor van en toast, que tampoco interrumpe.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Linking, ScrollView, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { GraduationCap, Home, Sparkles } from 'lucide-react-native';
import { supabase, WEB_URL, beginAuthAttempt, fetchConTimeout } from '@/lib/supabase';
import type { AuthAttempt } from '@/lib/auth-coordinator';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { withOwnedRequest } from '@/lib/owned-request';
import { PASSWORD_MIN, PASSWORD_MAX, passwordValidationIssue } from '@/lib/password-policy';
import { Btn, Tap, BrandWordmark } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { t } from '@/lib/i18n';
import { getGrowthSignupMetadata, setGrowthExplicitCode } from '@/lib/growth-attribution';
import { rememberedWorkspaceDestination } from '@/lib/workspaces';
import { hasSeenTour } from '@/lib/tour';
import { toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

// ─── Con qué modo arranca la pantalla ────────────────────────────────────
// Esta pantalla arrancaba SIEMPRE en "login", así que un usuario nuevo (el
// caso mayoritario de una app en captación) tenía que pulsar "Regístrate"
// antes de poder hacer nada. Ahora arranca en REGISTRO mientras este móvil no
// haya iniciado sesión nunca; en cuanto entra una vez (email o Google) se
// guarda esta marca y a partir de ahí vuelve a arrancar en login, que es lo
// que espera quien ya tiene cuenta (aunque haya cerrado sesión).
const SIGNED_IN_BEFORE_KEY = 'franky_signed_in_before';

type FieldErrors = { name?: string; email?: string; password?: string };

// Acceso: logotipo Franky, acceso con Google/Apple y formulario de email.
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  // Hasta leer la marca no pintamos nada: si no, un usuario que ya tiene
  // cuenta vería el formulario de registro un instante antes de cambiar solo.
  const [modeReady, setModeReady] = useState(false);
  const [name, setName] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const passwordRef = useRef<TextInput>(null);
  const activeAttempt = useRef<AuthAttempt | null>(null);
  const attemptBusy = useRef(false);
  const alive = useRef(true);
  const signupAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; activeAttempt.current?.cancel(); signupAbort.current?.abort(); };
  }, []);
  const startAttempt = () => {
    if (attemptBusy.current) return null;
    attemptBusy.current = true;
    const attempt = beginAuthAttempt();
    activeAttempt.current = attempt;
    return attempt;
  };
  const currentAttempt = (attempt: AuthAttempt) => alive.current && activeAttempt.current === attempt && attempt.isCurrent();
  const finishAttempt = (attempt: AuthAttempt) => {
    if (activeAttempt.current !== attempt) return;
    attemptBusy.current = false;
    if (alive.current) { setBusy(false); setGoogleBusy(false); setAppleBusy(false); }
  };

  // Entrada suave del bloque de acceso (se anula con "reducir movimiento").
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!modeReady) return;
    if (reduceMotion) { appear.setValue(1); return; }
    Animated.timing(appear, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [modeReady, reduceMotion, appear]);

  // ── Sign in with Apple ──────────────────────────────────────────────────
  // Apple exige (guía 4.8) que una app que ofrece un login social de terceros
  // (aquí Google) ofrezca también una alternativa que limite los datos al
  // nombre y el email y permita ocultar el email. Sin este botón, la revisión
  // de la App Store lo puede rechazar.
  //
  // El botón solo aparece en iOS, solo si el dispositivo lo soporta y solo si
  // EXPO_PUBLIC_APPLE_AUTH está activado: el provider Apple hay que habilitarlo
  // ANTES en Supabase (Authentication → Providers → Apple, con
  // es.franky.app como Client ID). Si se enseñara el botón sin ese paso hecho,
  // el revisor se encontraría un login roto, que es peor que no tenerlo.
  const appleAuthEnabled = process.env.EXPO_PUBLIC_APPLE_AUTH === '1';
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !appleAuthEnabled) return;
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => { if (alive) setAppleAvailable(ok); })
      .catch(() => { /* sin Apple Sign In disponible: no se pinta el botón */ });
    return () => { alive = false; };
  }, [appleAuthEnabled]);

  const signInWithApple = async () => {
    const attempt = startAttempt();
    if (!attempt) return;
    setAppleBusy(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!currentAttempt(attempt)) return;
      if (!credential.identityToken || !credential.authorizationCode) {
        toastError(t('welcome.errorTitle'), t('welcome.appleStartError'));
        return;
      }
      // Nativo: se canjea el identityToken directamente, sin navegador.
      const { error } = await attempt.run('signInWithIdToken', {
        provider: 'apple',
        token: credential.identityToken,
      });
      if (!currentAttempt(attempt)) return;
      if (error) { toastError(t('welcome.errorTitle'), error.message); return; }

      // Apple solo manda el nombre en el PRIMER acceso: si viene, se guarda,
      // porque después ya no hay forma de recuperarlo.
      const nombre = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean).join(' ').trim();
      const owner = captureSessionIdentity();
      try {
        await withOwnedRequest(owner, async request => {
          const response = await fetchConTimeout(`${WEB_URL}/api/account/apple-credentials`, {
            method: 'POST', signal: request.signal,
            headers: { 'Content-Type': 'application/json', Authorization: request.authorization },
            body: JSON.stringify({ identityToken: credential.identityToken, authorizationCode: credential.authorizationCode }),
          });
          request.check();
          if (!response.ok) throw new Error('apple_setup_failed');
        });
      } catch {
        if (owner && isCurrentSessionIdentity(owner) && currentAttempt(attempt)) {
          await beginAuthAttempt().run('signOut', { scope: 'local' }).catch(() => {});
          toastError('No se ha completado el acceso', 'Vuelve a pulsar Iniciar sesión con Apple.');
        }
        return;
      }
      if (nombre) {
        await withOwnedRequest(owner, async request => {
          const { data: perfil, error: profileError } = await request.query(supabase
            .from('profiles').select('full_name').eq('id', request.owner.userId)).maybeSingle();
          request.check();
          if (!profileError && !perfil?.full_name && currentAttempt(attempt)) {
            await request.query(supabase.from('profiles').update({ full_name: nombre.slice(0, 80) }).eq('id', request.owner.userId));
          }
        }).catch(() => {});
      }
      if (owner && isCurrentSessionIdentity(owner)) await goAfterLogin(attempt, true);
    } catch (e) {
      // ERR_REQUEST_CANCELED = el usuario cerró la hoja de Apple: sin ruido.
      const code = (e as { code?: string } | null)?.code;
      if (currentAttempt(attempt) && code !== 'ERR_REQUEST_CANCELED') {
        toastError(t('welcome.errorTitle'), t('welcome.appleStartError'));
      }
    } finally {
      finishAttempt(attempt);
    }
  };

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SIGNED_IN_BEFORE_KEY)
      .then((v) => {
        if (!alive) return;
        if (v === '1') setMode('login');
        setModeReady(true);
      })
      .catch(() => { if (alive) setModeReady(true); }); // sin disco: registro por defecto
    return () => { alive = false; };
  }, []);

  // Este móvil ya ha entrado alguna vez: la próxima visita arranca en login.
  const rememberSignedIn = () => {
    AsyncStorage.setItem(SIGNED_IN_BEFORE_KEY, '1').catch(() => {});
  };

  // Tras un login con éxito vamos a donde estaba el usuario (gate de compra/comentario);
  // si no hay nada a lo que volver, al feed. Mismo destino que el login por email.
  const goAfterLogin = async (attempt: AuthAttempt, checkOnboarding = false) => {
    const owner = captureSessionIdentity();
    const current = () => !!owner && currentAttempt(attempt) && isCurrentSessionIdentity(owner);
    if (!current()) return;
    rememberSignedIn();
    const workspaceDestination = await rememberedWorkspaceDestination(owner);
    if (!current()) return;
    if (workspaceDestination) { router.replace(workspaceDestination); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (checkOnboarding) {
      try {
        const { data: profile, error } = await withOwnedRequest(owner, async request => await request.query(supabase
          .from('profiles').select('university_id').eq('id', request.owner.userId)).maybeSingle());
        if (!current()) return;
        if (!error && profile && !profile.university_id) { router.replace('/onboarding-intro'); return; }
      } catch { if (!current()) return; }
    }
    // Primera vez en este móvil: la guía de la app antes del feed (se salta
    // en un toque y no vuelve a salir).
    let seen = true;
    try { seen = await hasSeenTour(); } catch { /* ante la duda, no bloquear */ }
    if (!current()) return;
    if (!seen) { router.replace('/tour'); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/feed');
  };

  // ── Login con Google (OAuth nativo de Supabase para Expo) ───────────────
  // PASOS MANUALES NECESARIOS para que esto funcione en producción:
  //  1. Supabase → Authentication → Providers → Google: habilitar el provider
  //     y pegar el Client ID / Client Secret del OAuth client de Google Cloud.
  //  2. Supabase → Authentication → URL Configuration → Redirect URLs: añadir
  //     el esquema de la app, en concreto `franky://auth-callback` (y, por
  //     comodidad en Expo Go/dev, el que imprima Linking.createURL en consola).
  //  3. Google Cloud → APIs & Services → Credentials → OAuth client (Web):
  //     en "Authorized redirect URIs" debe estar el callback de Supabase,
  //     `https://<PROJECT-REF>.supabase.co/auth/v1/callback`.
  // Flujo: flowType 'pkce' se fija EXPLÍCITAMENTE en src/lib/supabase.ts (ojo:
  // el default de supabase-js v2 es implicit, no PKCE), así que el navegador
  // vuelve con `?code=...` y lo canjeamos con exchangeCodeForSession.
  // De forma defensiva también soportamos el caso (implicit) de tokens en el
  // fragmento `#access_token=...&refresh_token=...` -> setSession.
  const signInWithGoogle = async () => {
    const attempt = startAttempt();
    if (!attempt) return;
    setGoogleBusy(true);
    try {
      // En build nativo produce `franky://auth-callback`; en Expo Go produce el
      // proxy de desarrollo. Sirve igual como redirectTo y para cerrar la sesión
      // de WebBrowser al detectar esta URL de vuelta.
      const redirectTo = ExpoLinking.createURL('auth-callback');

      const { data, error } = await attempt.run('signInWithOAuth', {
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (!currentAttempt(attempt)) return;
      if (error || !data?.url) {
        toastError(t('welcome.errorTitle'), error?.message ?? t('welcome.googleStartError'));
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (!currentAttempt(attempt)) return;
      if (result.type !== 'success' || !result.url) {
        // Cancelado por el usuario (type 'cancel'/'dismiss') o cerrado: salimos en silencio.
        return;
      }

      // La URL de retorno puede traer el código en la query (?code=) con PKCE,
      // o los tokens en el fragmento (#access_token=) en flujo implícito.
      const returned = new URL(result.url);
      const expected = new URL(redirectTo);
      if (returned.protocol !== expected.protocol || returned.host !== expected.host || returned.pathname !== expected.pathname) {
        throw new Error(t('welcome.googleNoSession'));
      }
      const code = returned.searchParams.get('code');
      const hash = returned.hash.startsWith('#') ? returned.hash.slice(1) : returned.hash;
      const fragment = new URLSearchParams(hash);
      const accessToken = fragment.get('access_token');
      const refreshToken = fragment.get('refresh_token');
      // Algunos errores OAuth vuelven como ?error= o #error=
      const oauthError = returned.searchParams.get('error') ?? fragment.get('error_description') ?? fragment.get('error');

      if (code) {
        const { error: exErr } = await attempt.run('exchangeCodeForSession', code);
        if (!currentAttempt(attempt)) return;
        if (exErr) { toastError(t('welcome.errorTitle'), exErr.message); return; }
      } else if (accessToken && refreshToken) {
        const { error: setErr } = await attempt.run('setSession', {
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!currentAttempt(attempt)) return;
        if (setErr) { toastError(t('welcome.errorTitle'), setErr.message); return; }
      } else {
        toastError(t('welcome.errorTitle'), oauthError ?? t('welcome.googleNoSession'));
        return;
      }
      await goAfterLogin(attempt, true);
    } catch (e) {
      if (currentAttempt(attempt)) toastError(t('welcome.errorTitle'), e instanceof Error ? e.message : t('welcome.googleUnexpectedError'));
    } finally {
      finishAttempt(attempt);
    }
  };

  const submit = async () => {
    if (mode === 'login') {
      const next: FieldErrors = {};
      if (!email.includes('@')) next.email = t('welcome.loginValidation');
      if (password.length < 6) next.password = t('welcome.loginValidation');
      setErrors(next);
      if (Object.keys(next).length > 0) return;
      const attempt = startAttempt();
      if (!attempt) return;
      setBusy(true);
      try {
        const { error } = await attempt.run('signInWithPassword', { email: email.trim(), password });
        if (!currentAttempt(attempt)) return;
        if (error) {
          // Keep credential validation next to the password field.
          if (error.message === 'Invalid login credentials') {
            setErrors({ password: t('welcome.invalidCredentials') });
          } else {
            toastError(t('welcome.errorTitle'), error.message);
          }
          return;
        }
        await goAfterLogin(attempt);
      } catch (error) {
        if (currentAttempt(attempt)) toastError(t('welcome.errorTitle'), error instanceof Error ? error.message : t('welcome.serverUnreachable'));
      } finally {
        finishAttempt(attempt);
      }
      return;
    }

    // ── Registro por /api/auth/signup (igual que la web desde jul-2026) ────
    // Crea la cuenta YA confirmada en el servidor (el email de confirmación
    // está retirado: el SMTP integrado de Supabase lo capaba y mataba el
    // embudo) y entramos con la contraseña al momento.
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t('welcome.missingNameBody');
    // Mismas restricciones que el cambio de contraseña y la API de registro.
    if (!email.includes('@')) next.email = t('welcome.signupValidation', { min: PASSWORD_MIN });
    const passwordIssue = passwordValidationIssue(password);
    if (passwordIssue) next.password = t(`welcome.passwordErrors.${passwordIssue}`, { min: PASSWORD_MIN, max: PASSWORD_MAX });
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const attempt = startAttempt();
    if (!attempt) return;
    const controller = new AbortController();
    signupAbort.current = controller;
    setBusy(true);
    try {
      const res = await fetchConTimeout(`${WEB_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email, password, attribution: await getGrowthSignupMetadata() }),
        signal: controller.signal,
      });
      if (!currentAttempt(attempt)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!currentAttempt(attempt)) return;
        toastError(t('welcome.signupError'),
          res.status === 429
            ? t('welcome.tooManySignups')
            : (data as { message?: string }).message ?? t('common.tryAgain'));
        return;
      }
      const { error } = await attempt.run('signInWithPassword', { email: email.trim(), password });
      if (!currentAttempt(attempt)) return;
      if (error) {
        toastInfo(t('welcome.accountCreated'), t('welcome.loginWithNewAccount'));
        setMode('login');
        setErrors({});
        return;
      }
      rememberSignedIn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Primera vez dentro: guía rápida de la app.
      router.replace('/onboarding-intro');
    } catch {
      if (currentAttempt(attempt)) toastError(t('welcome.noConnection'), t('welcome.serverUnreachable'));
    } finally {
      if (signupAbort.current === controller) signupAbort.current = null;
      finishAttempt(attempt);
    }
  };

  const forgotPassword = () => {
    // Pantalla nativa de reset; le pasamos el email ya escrito para prerellenarlo.
    router.push({ pathname: '/recuperar', params: email ? { email } : {} });
  };

  // Campo estándar v3: superficie limpia con hairline (no un bloque relleno),
  // R.md y 50 px de alto. El borde se pone rojo cuando hay error debajo.
  const input = (bad?: boolean) => ({
    backgroundColor: C.surface, borderWidth: bad ? 1 : 0.5, borderColor: bad ? C.error : C.border,
    borderRadius: R.md, paddingHorizontal: 14, minHeight: 50, paddingVertical: 13,
    fontSize: 15.5, color: C.text,
  } as const);

  const perks = useMemo(() => ([
    { icon: GraduationCap, text: t('welcome.perkFriends') },
    { icon: Home, text: t('welcome.perkRoomie') },
    { icon: Sparkles, text: t('welcome.perkInfo') },
  ]), []);

  const anyBusy = busy || googleBusy || appleBusy;

  // Un frame en blanco mientras se resuelve el modo (lectura de AsyncStorage,
  // milisegundos): evita que el formulario cambie de forma delante del usuario.
  if (!modeReady) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingTop: insets.top + S.lg, paddingBottom: S.xl }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{
            opacity: appear,
            transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}>
            {/* Marca a la izquierda y la frase en grande: la tipografía es la
                que da la bienvenida, no una ilustración ni un degradado. */}
            <FadeIn>
              <BrandWordmark size={32} style={{ alignSelf: 'flex-start', marginBottom: mode === 'signup' ? 20 : 26 }} />
            </FadeIn>

            {/* En modo registro, antes de pedir nada explicamos qué gana el usuario:
                el formulario deja de sentirse tedioso cuando el esfuerzo tiene
                lógica. Iconos de marca (lucide) sueltos, nunca emojis. */}
            {mode === 'signup' && (
              <View style={{ marginBottom: 26 }}>
                <FadeIn index={1}>
                  <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[F.h1, { fontSize: 30, lineHeight: 34, letterSpacing: -1, marginBottom: 18 }]}>
                    {t('welcome.joinCommunity')}
                  </Text>
                </FadeIn>
                <View style={{ gap: 13 }}>
                  {perks.map((p, i) => (
                    <FadeIn key={p.text} index={i + 2} distance={10}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                        <p.icon size={20} color={C.blue} strokeWidth={1.6} />
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1, fontSize: 14.5 }]}>{p.text}</Text>
                      </View>
                    </FadeIn>
                  ))}
                </View>
              </View>
            )}

            {/* Sign in with Apple: primero en iOS y con el botón NATIVO de Apple,
                que es lo que exigen sus normas de diseño (no vale uno pintado a
                mano). Solo aparece si el provider está habilitado en Supabase
                (EXPO_PUBLIC_APPLE_AUTH=1) y el dispositivo lo soporta. */}
            {appleAvailable && (
              <View style={{ marginBottom: 10 }}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    mode === 'signup'
                      ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                  }
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={R.md}
                  style={{ height: 48, opacity: anyBusy ? 0.5 : 1 }}
                  onPress={() => {
                    if (anyBusy) return;
                    signInWithApple();
                  }}
                />
              </View>
            )}

            {mode === 'signup' && <View style={{ marginBottom: 14 }}>
              <Text style={[F.label, { marginBottom: 6 }]}>Código de invitación (opcional)</Text>
              <TextInput accessibilityLabel="Código de invitación opcional" value={invitationCode}
                onChangeText={value => { setInvitationCode(value); void setGrowthExplicitCode(value); }}
                maxLength={64} autoCapitalize="none" placeholder="Si alguien te ha invitado" placeholderTextColor={C.muted}
                style={input(false)} />
            </View>}

            {/* Botón Google prominente: misma jerarquía que el primario, arriba del
                formulario. Como el Btn del kit no admite el color de marca de
                Google, se compone con Tap. */}
            <Tap onPress={anyBusy ? undefined : signInWithGoogle} disabled={anyBusy}
              accessibilityLabel={t('welcome.continueWithGoogle')}
              accessibilityState={{ busy: googleBusy }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: R.md,
                minHeight: 48, paddingVertical: 12, opacity: anyBusy ? 0.5 : 1,
              }}>
              {/* Azul de Google: color de marca ajeno, por eso es fijo. */}
              <View style={{
                width: 20, height: 20, borderRadius: 10, backgroundColor: '#4285F4',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text maxFontSizeMultiplier={1.2} style={{ color: '#FFFFFF', fontFamily: FONT.heading, fontSize: 12.5 }}>G</Text>
              </View>
              {/* El fondo del botón es blanco fijo (marca Google), así que el
                  texto NO puede usar C.text: en modo oscuro sería blanco sobre
                  blanco. Color oscuro fijo, legible en los tres temas. */}
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#1F1F1F', fontFamily: FONT.semibold, fontSize: 15 }}>
                {googleBusy ? t('welcome.connectingGoogle') : t('welcome.continueWithGoogle')}
              </Text>
            </Tap>

            {/* Separador "o" entre los accesos sociales y el formulario de email */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 }}>
              <View style={{ flex: 1, height: 0.5, backgroundColor: C.border }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{t('welcome.or')}</Text>
              <View style={{ flex: 1, height: 0.5, backgroundColor: C.border }} />
            </View>

            <View style={{ gap: 14 }}>
              {mode === 'signup' && (
                <View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{t('welcome.namePlaceholder')}</Text>
                  <TextInput
                    autoCapitalize="words" textContentType="name" autoComplete="name"
                    returnKeyType="next" placeholderTextColor={C.muted}
                    accessibilityLabel={t('welcome.namePlaceholder')} maxFontSizeMultiplier={MAX_FONT_SCALE}
                    value={name} onChangeText={(v) => { setName(v); if (errors.name) setErrors(e => ({ ...e, name: undefined })); }}
                    style={input(!!errors.name)} />
                  {errors.name ? <FieldError text={errors.name} /> : null}
                </View>
              )}

              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{t('welcome.emailPlaceholder')}</Text>
                <TextInput placeholder="tu@email.com" placeholderTextColor={C.muted}
                  autoCapitalize="none" keyboardType="email-address"
                  textContentType="emailAddress" autoComplete="email"
                  returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} blurOnSubmit={false}
                  accessibilityLabel={t('welcome.emailPlaceholder')} maxFontSizeMultiplier={MAX_FONT_SCALE}
                  value={email} onChangeText={(v) => { setEmail(v); if (errors.email) setErrors(e => ({ ...e, email: undefined })); }}
                  style={input(!!errors.email)} />
                {errors.email ? <FieldError text={errors.email} /> : null}
              </View>

              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{t('welcome.passwordPlaceholder')}</Text>
                <TextInput ref={passwordRef} placeholderTextColor={C.muted}
                  secureTextEntry
                  textContentType={mode === 'login' ? 'password' : 'newPassword'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  returnKeyType="go" onSubmitEditing={submit}
                  accessibilityLabel={t('welcome.passwordPlaceholder')} maxFontSizeMultiplier={MAX_FONT_SCALE}
                  value={password} onChangeText={(v) => { setPassword(v); if (errors.password) setErrors(e => ({ ...e, password: undefined })); }}
                  style={input(!!errors.password)} />
                {errors.password ? <FieldError text={errors.password} />
                  : mode === 'signup' ? (
                    // La regla se ve ANTES de fallar: nadie debería descubrir el
                    // mínimo de 12 caracteres a base de errores.
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 5, lineHeight: 16 }]}>{t('welcome.signupValidation', { min: PASSWORD_MIN })}</Text>
                  ) : null}
              </View>

              <View style={{ marginTop: 4 }}>
                <Btn full busy={busy} disabled={googleBusy || appleBusy}
                  label={mode === 'login' ? t('welcome.login') : t('welcome.signupCta')} onPress={submit} />
              </View>

              {mode === 'login' ? (
                <Tap onPress={forgotPassword} style={{ alignItems: 'center', marginTop: 2 }}
                  accessibilityRole="link" accessibilityLabel={t('welcome.forgotPassword')}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blueDeep, fontSize: 13, fontFamily: FONT.semibold }}>
                    {t('welcome.forgotPassword')}
                  </Text>
                </Tap>
              ) : (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 2, lineHeight: 16 }]}>
                  {t('welcome.termsPrefix')}{' '}
                  <Text style={{ color: C.blueDeep, fontFamily: FONT.semibold }}
                    onPress={() => Linking.openURL(`${WEB_URL}/terminos`)}>{t('welcome.terms')}</Text>
                  {' '}{t('welcome.and')}{' '}
                  <Text style={{ color: C.blueDeep, fontFamily: FONT.semibold }}
                    onPress={() => Linking.openURL(`${WEB_URL}/privacidad`)}>{t('welcome.privacyPolicy')}</Text>.
                </Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={{
          borderTopWidth: 0.5, borderTopColor: C.border, paddingVertical: 16,
          paddingBottom: insets.bottom + 14, alignItems: 'center',
        }}>
          <Tap disabled={anyBusy} onPress={() => { if (!attemptBusy.current) { setMode(mode === 'login' ? 'signup' : 'login'); setErrors({}); } }} haptic
            accessibilityLabel={mode === 'login' ? `${t('welcome.noAccount')}${t('welcome.signup')}` : `${t('welcome.hasAccount')}${t('welcome.enter')}`}
            style={{ paddingHorizontal: S.lg, paddingVertical: 8, minHeight: 44, justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, color: C.muted }}>
              {mode === 'login' ? t('welcome.noAccount') : t('welcome.hasAccount')}
              <Text style={{ color: C.blue, fontFamily: FONT.semibold }}>{mode === 'login' ? t('welcome.signup') : t('welcome.enter')}</Text>
            </Text>
          </Tap>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// Error inline bajo un campo: se anuncia al lector de pantalla en cuanto sale.
function FieldError({ text }: { text: string }) {
  return (
    <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[F.tiny, { color: C.error, marginTop: 5, lineHeight: 16 }]}>{text}</Text>
  );
}
