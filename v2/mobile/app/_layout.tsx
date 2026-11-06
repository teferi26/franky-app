import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { WifiOff } from 'lucide-react-native';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { setAudioModeAsync } from 'expo-audio';
import { C, isDarkMode, type ThemeMode } from '@/theme';
import { ToastHost } from '@/components/Toast';
import { CommunityTermsGate } from '@/components/CommunityTermsGate';
import { WorkspaceProvider } from '@/components/WorkspaceProvider';
import { captureGrowthInvite, claimPendingGrowthInvite } from '@/lib/growth-attribution';
import { watchAppleSession } from '@/lib/apple-session';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumeAccountStorageErasure } from '@/lib/account-storage';
import { loadStoredTheme, onThemeChange } from '@/lib/theme-switch';
import { loadStoredLocale, onLocaleChange } from '@/lib/i18n';
import { loadStoredIntent } from '@/lib/intent';
import { track } from '@/lib/analytics';
import { screenName } from '@/lib/screen-name';
import { subscribeNet } from '@/lib/net';
import { initOfflineQueue } from '@/lib/offline-queue';
import { initMonitoring } from '@/lib/monitoring';
import { supabase } from '@/lib/supabase';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import {
  registerForPushNotifications,
  addNotificationResponseListener,
  canPresentNotification,
} from '@/lib/push';
import { isNotificationForActiveConversation } from '@/lib/active-conversation';
import { touchStreak } from '@/lib/streak';
import { rescheduleDigest, scheduleStreakNudge, pullStudyFromCloudIfEmpty, pruneOldTasks } from '@/lib/study';
import { MAX_FONT_SCALE } from '@/lib/a11y';

// Mantiene el splash nativo visible hasta que la fuente esté lista,
// evitando el frame en blanco entre el splash y la UI.
// (expo-splash-screen directo, no el re-export de expo-router: es el mismo
// módulo nativo pero este trae setOptions, que el del router no expone.)
SplashScreen.preventAutoHideAsync().catch(() => {});
// El logo desaparecía de un frame al siguiente, a lo bruto: eso es gran parte
// del "queda horrible" al abrir. Un fundido corto y se acabó el golpe.
// (El resto era el asset: se usaba icon.png, el icono a sangre, que se veía
// como un cuadrado morado de esquinas duras flotando sobre la interfaz ya
// pintada. Ahora es splash-icon.png, con las esquinas redondeadas y el fondo
// del splash igual al de la app: durante el fundido ya no hay velo ni recorte.)
SplashScreen.setOptions({ fade: true, duration: 220 });

// Handler de foreground: con la app abierta, mostramos igualmente la
// notificacion (banner + sonido) en lugar de tragarla en silencio.
// Excepción: si el aviso es del chat que ya está abierto, no se pinta banner
// (la persona lo está leyendo); sí queda en la lista del sistema.
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const data = notification.request.content.data;
    const allowed = canPresentNotification(data);
    const reading = allowed && isNotificationForActiveConversation(data);
    return { shouldShowBanner: allowed && !reading, shouldShowList: allowed, shouldPlaySound: allowed && !reading, shouldSetBadge: false };
  },
});

// expo-router renderiza esta pantalla si una ruta lanza un error en render,
// en lugar de dejar la app en blanco sin que nadie se entere.
export { ErrorBoundary } from 'expo-router';

// Aviso global "sin conexión": aparece bajo la barra de estado cuando la capa
// de red (net.ts) detecta que no se llega al backend, y desaparece solo al
// recuperarse. No bloquea la app: solo informa.
function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = React.useState(true);
  React.useEffect(() => subscribeNet(setOnline), []);
  if (online) return null;
  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
      paddingTop: insets.top, backgroundColor: '#B00020',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }}>
        <WifiOff size={15} color="#fff" strokeWidth={2.2} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Sin conexión. Reintentando…</Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  // Outfit es la tipografía de la marca (títulos, botones, cifras); el cuerpo
  // usa la fuente del sistema. Si la carga fallara, `error` desbloquea el
  // arranque igualmente: mejor con la fuente del sistema que con un splash
  // clavado para siempre.
  const [fontsLoaded, fontsError] = useFonts({ Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold });
  const loaded = fontsLoaded || !!fontsError;
  const router = useRouter();
  const segments = useSegments();

  // ── Tema claro/oscuro: se aplica el guardado antes del primer render y un
  // cambio en caliente remonta el árbol (key) para repintar la paleta mutada.
  const [themeReady, setThemeReady] = React.useState(false);
  const [themeMode, setThemeModeState] = React.useState<ThemeMode>('light');
  React.useEffect(() => {
    loadStoredTheme().then((m) => { setThemeModeState(m); setThemeReady(true); });
    return onThemeChange((m) => setThemeModeState(m));
  }, []);

  // ── Idioma: mismo patrón que el tema. Se carga el guardado antes del primer
  // render y un cambio remonta el árbol (va en la key junto al tema) para que
  // TODA la interfaz se repinte en el idioma nuevo, no solo lo que se re-renderice.
  const [localeReady, setLocaleReady] = React.useState(false);
  const [locale, setLocaleState] = React.useState('es');
  React.useEffect(() => {
    loadStoredLocale().then((l) => { setLocaleState(l); setLocaleReady(true); });
    return onLocaleChange((l) => setLocaleState(l));
  }, []);

  // ── Intención de uso: igual que el tema y el idioma, se lee del storage
  // ANTES del primer render. Sin esto getIntent() devolvía siempre 'todo' en
  // frío y la barra de pestañas y La Lupa se pintaban con el orden por
  // defecto aunque la persona hubiera elegido otra cosa en el onboarding.
  // No hace falta remontar el árbol al cambiarla (no muta la paleta): quien
  // la usa se suscribe con onIntentChange (ver app/(tabs)/_layout.tsx).
  const [intentReady, setIntentReady] = React.useState(false);
  React.useEffect(() => {
    loadStoredIntent().then(() => setIntentReady(true), () => setIntentReady(true));
  }, []);

  // Analítica de producto: una traza al abrir la app (best-effort).
  React.useEffect(() => { track('app_open'); }, []);
  React.useEffect(() => {
    void Linking.getInitialURL().then(url => { if (url) void captureGrowthInvite(url); }).catch(() => {});
    const subscription = Linking.addEventListener('url', event => { void captureGrowthInvite(event.url); });
    return () => subscription.remove();
  }, []);
  const currentScreen = screenName(segments.join('/'));
  React.useEffect(() => {
    if (loaded) void track('screen_view', { screen: currentScreen });
  }, [currentScreen, loaded]);

  // Cola offline: al recuperar conexión reintenta lo que quedó pendiente
  // (publicar, enviar). Idempotente, se arranca una sola vez.
  React.useEffect(() => { initOfflineQueue(); }, []);

  // Monitorización de crashes (Sentry): no hace nada si no hay DSN
  // configurado en EXPO_PUBLIC_SENTRY_DSN (ver cabecera de monitoring.ts).
  React.useEffect(() => { initMonitoring(); }, []);

  // ── Sesión de audio para REPRODUCIR ──────────────────────────────────────
  // Bug real (31-jul-2026): las notas de voz se enviaban pero al darle a play
  // no se oía nada. La app configuraba la sesión de audio SOLO al grabar
  // (VoiceRecorder), nunca para reproducir, y el valor por defecto de iOS es
  // `playsInSilentMode: false`: con el interruptor de silencio del iPhone
  // puesto (que casi todo el mundo lleva puesto) el audio se reproduce mudo,
  // sin ningún error. Se fija una vez al arrancar y vale para todos los
  // reproductores de la app: notas de voz del chat, audios de FOMO y de Crush.
  React.useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  }, []);

  // ── Gate de sesión: la app entera exige cuenta ──────────────────────────
  // Sin sesión, cualquier ruta que no sea /welcome (o el intro post-registro)
  // rebota al acceso. Cerrar sesión desde cualquier pantalla también rebota.
  const { uid } = useSessionIdentity();
  React.useEffect(() => watchAppleSession(), [uid]);
  React.useEffect(() => { void resumeAccountStorageErasure(AsyncStorage).catch(() => {}); }, [uid]);
  const authed = uid === undefined ? null : Boolean(uid);
  React.useEffect(() => {
    if (uid) void supabase.rpc('ensure_my_profile').then(() => {}, () => {});
  }, [uid]);
  React.useEffect(() => { if (uid) void claimPendingGrowthInvite().catch(() => {}); }, [uid]);

  React.useEffect(() => {
    if (authed === null) return;
    // Rutas abiertas SIN sesión. OJO: /recuperar tiene que estar aquí; se
    // navega desde welcome sin cuenta activa y el gate la expulsaba antes de
    // poder usarla (el "olvidé mi contraseña" nativo era inalcanzable).
    const open = segments[0] === 'welcome' || segments[0] === 'onboarding-intro'
      || segments[0] === 'recuperar' || segments[0] === 'tour'
      || ['terminos', 'privacidad', 'cookies', 'centro-seguridad'].includes(segments[0] ?? '');
    if (!authed && !open) router.replace('/welcome');
  }, [authed, segments, router]);

  // ── Cuándo se retira el splash ───────────────────────────────────────────
  // Además de fuentes/tema/idioma/intención, se espera a saber si hay sesión
  // y, si no la hay, a que la redirección a /welcome haya aterrizado. Antes se
  // retiraba en cuanto cargaba la fuente: sin sesión se veía un frame de la
  // app (las pestañas) y el salto a la bienvenida; ese parpadeo, sumado al
  // corte sin fundido, es el "logo atascado y luego un golpe" del arranque.
  React.useEffect(() => {
    if (!(loaded && themeReady && localeReady && intentReady)) return;
    if (authed === null) return;
    const enAbierta = segments[0] === 'welcome' || segments[0] === 'onboarding-intro'
      || segments[0] === 'recuperar' || segments[0] === 'tour'
      || ['terminos', 'privacidad', 'cookies', 'centro-seguridad'].includes(segments[0] ?? '');
    if (authed || enAbierta) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, themeReady, localeReady, intentReady, authed, segments]);

  // Red de seguridad: pase lo que pase (storage que se cuelga, fuente que no
  // resuelve, sesión que tarda), el splash se retira solo. Un splash clavado
  // indefinidamente es el peor arranque posible, y 4 s se hacían eternos: con
  // el fondo ya igualado al de la app, retirarlo antes no enseña ningún salto.
  React.useEffect(() => {
    const id = setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 2200);
    return () => clearTimeout(id);
  }, []);

  // ── Racha y resumen del día ─────────────────────────────────────────────
  // Cada arranque y cada vuelta a primer plano cuenta como "día abierto"
  // (touchStreak, idempotente por día). De paso se reprograma el resumen de la
  // mañana con los datos actuales, se protege la racha con un aviso para
  // mañana y, en un móvil nuevo, se restaura el material de estudio de la
  // nube. Todo best-effort: nada de esto puede romper el arranque.
  React.useEffect(() => {
    if (!uid) return;
    const owner = captureSessionIdentity();
    if (!owner) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await pullStudyFromCloudIfEmpty(owner);
        if (cancelled || !isCurrentSessionIdentity(owner)) return;
        const s = await touchStreak(owner);
        if (cancelled || !isCurrentSessionIdentity(owner)) return;
        await pruneOldTasks(owner);
        if (cancelled || !isCurrentSessionIdentity(owner)) return;
        await rescheduleDigest({}, owner);
        if (cancelled || !isCurrentSessionIdentity(owner)) return;
        await scheduleStreakNudge(s.count, owner);
      } catch { /* best-effort */ }
    };
    tick();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') tick(); });
    return () => { cancelled = true; sub.remove(); };
  }, [uid]);

  // Registration and tap handling are scoped to the resolved account.
  React.useEffect(() => {
    if (!uid) return;
    void registerForPushNotifications(uid);
    const appState = AppState.addEventListener('change', value => {
      if (value === 'active') void registerForPushNotifications(uid);
    });
    const removeResponseListener = addNotificationResponseListener(route => router.push(route as never), uid);
    return () => { appState.remove(); removeResponseListener(); };
  }, [uid, router]);

  if (!loaded || !themeReady || !localeReady || !intentReady) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider key={`${themeMode}:${locale}`}>
      <WorkspaceProvider>
      <StatusBar style={isDarkMode(themeMode) ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(workspace)" />
        <Stack.Screen name="espacios" />
        <Stack.Screen name="pro" />
        <Stack.Screen name="espacio-editar" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding-intro" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="tour" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="publicar" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="editar-perfil" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="roomie-editar" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ajustes-notificaciones" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="crear-evento" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="story/[userId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      </Stack>
      <CommunityTermsGate />
      <OfflineBanner />
      <ToastHost />
      </WorkspaceProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
