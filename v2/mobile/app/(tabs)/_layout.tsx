import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Home, MessageCircle, CircleUserRound, Search, Ticket, BedDouble, GraduationCap,
} from 'lucide-react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { getUnreadChatCount, subscribeToChatList } from '@/lib/chat';
import { emitScrollTop } from '@/lib/scroll-top';
import { supabase } from '@/lib/supabase';
import { getThemeMode, onThemeChange } from '@/lib/theme-switch';
import { getIntent, onIntentChange, getTabPriority, type TabKey } from '@/lib/intent';
import { t } from '@/lib/i18n';
import { useReduceMotion } from '@/lib/a11y';
import { C, FONT, SHADOW } from '@/theme';

// ─── Barra de pestañas Franky: 5 ranuras, ordenadas por la INTENCIÓN de uso ─
// Layout por defecto (intención 'todo'): Inicio · Estudio · (Eventos) · Chats
// · Perfil. "Inicio" agrupa Fomo y Crush en una sola ranura (se cambia con
// el interruptor de arriba, ver HomeSwitch). "Estudio" es el hub académico
// (horario, calendario, entregas, apuntes, nota media): es lo que hace que la
// app se abra cada día, así que tiene ranura fija. La Lupa (buscador global y
// catálogos) sigue siendo una ruta de pestaña, pero se abre desde el icono de
// buscar de las cabeceras: cuando estás en ella ninguna ranura sale activa.
//
// La intención elegida en el onboarding (src/lib/intent.ts) decide:
//   · qué pestaña ocupa el botón central destacado, y
//   · en qué orden van las 4 ranuras laterales.
// Perfil se queda SIEMPRE en la última ranura: es la puerta a ajustes, cuenta
// y menú, y moverlo o quitarlo dejaría a la gente sin salida.
//
// LIMITACIÓN CONOCIDA: con la intención 'piso' el botón central va a /pisos,
// que NO es una pestaña, así que en esa intención la barra pinta 4 pestañas +
// ese botón y "Eventos" sale de la barra (sigue a un toque desde el feed).
const TAB_ICONS: Record<TabKey, typeof Home> = {
  feed: Home,
  crush: Home, // nunca ocupa ranura propia: comparte la de "Inicio" con feed
  estudio: GraduationCap,
  explorar: Search,
  eventos: Ticket,
  chats: MessageCircle,
  perfil: CircleUserRound,
};

// Funciones (no valores fijos) para que se re-evalúen en el idioma activo.
const TAB_LABELS: Record<TabKey, () => string> = {
  feed: () => t('tabs.home'),
  crush: () => t('tabs.home'),
  estudio: () => t('tabs.study'),
  explorar: () => t('tabs.search'),
  eventos: () => t('tabs.events'),
  chats: () => t('tabs.chats'),
  perfil: () => t('tabs.profile'),
};

// Pestañas que pueden ocupar una ranura de la barra (crush queda dentro de
// "Inicio" y explorar se abre desde las cabeceras).
const PAINTED: TabKey[] = ['feed', 'estudio', 'eventos', 'chats', 'perfil'];

function useThemeMode() {
  const [mode, setMode] = React.useState(getThemeMode());
  React.useEffect(() => onThemeChange(setMode), []);
  return mode;
}

/** Intención de uso en caliente: si se cambia en /ajustes-uso, la barra se
 *  reordena sola (mismo patrón que el tema). */
function useIntent() {
  const [intent, setIntent] = React.useState(getIntent());
  React.useEffect(() => onIntentChange(setIntent), []);
  return intent;
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // Nos suscribimos al tema para repintar la barra cuando cambia la paleta.
  useThemeMode();
  const router = useRouter();
  const intent = useIntent();
  const prio = React.useMemo(() => getTabPriority(intent), [intent]);

  // Ranuras laterales: por prioridad de la intención, con Perfil siempre al
  // final. Si el botón central es una pestaña, esa pestaña no se repite.
  const sides = React.useMemo(() => {
    const centerIsTab = !prio.featuredHref;
    const rest = prio.tabOrder.filter((k) =>
      PAINTED.includes(k) && k !== 'perfil' && !(centerIsTab && k === prio.featuredTab));
    return [...rest.slice(0, 3), 'perfil' as TabKey];
  }, [prio]);
  const LEFT = sides.slice(0, 2);
  const RIGHT = sides.slice(2);

  // Badge de no leídos EN TIEMPO REAL: conteo inicial + suscripción a la lista
  // de chats (mismo canal que la pestaña Chats), así el globo sube solo sin
  // tener que cambiar de pestaña.
  const [unread, setUnread] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    let channel: RealtimeChannel | null = null;
    const refresh = () => getUnreadChatCount().then((n) => {
      if (!alive) return;
      setUnread(n);
      // Badge del icono de la app (globo rojo sobre el icono en la home del
      // teléfono). Best-effort: en Expo Go no hace nada, en el build EAS sí.
      Notifications.setBadgeCountAsync(n).catch(() => {});
    }).catch(() => {});
    refresh();
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !alive) return;
        channel = subscribeToChatList(user.id, refresh);
      } catch { /* sin sesión o sin red: el badge se queda a cero */ }
    })();
    return () => { alive = false; if (channel) supabase.removeChannel(channel); };
  }, []);

  // Superficie limpia: sin velos ni degradados, solo la superficie del tema
  // con un hairline y la sombra flotante del sistema.
  const barBg = C.surface;
  const borderCol = C.border;
  const iconOn = C.blue;
  const iconOff = C.muted;

  const reduce = useReduceMotion();
  const routeIndex = (name: string) => state.routes.findIndex((r) => r.name === name);
  const isFocused = (name: string) => state.index === routeIndex(name);
  const go = (name: string) => {
    const idx = routeIndex(name);
    if (idx < 0) return;
    // Un toque suave al cambiar de pestaña: se nota, no molesta.
    Haptics.selectionAsync().catch(() => {});
    // Tocar la pestaña que ya está activa = volver arriba (scroll-top).
    if (state.index === idx) { emitScrollTop(name); return; }
    const route = state.routes[idx];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name);
  };

  const TabIcon = ({ name, Icon }: { name: TabKey; Icon: typeof Home }) => {
    // "Inicio" (feed) queda activo también cuando estás en Crush, porque
    // comparten ranura (el interruptor de arriba cambia entre ambas).
    const focused = name === 'feed' ? (isFocused('feed') || isFocused('crush')) : isFocused(name);
    const label = TAB_LABELS[name]();
    // Muelle al activarse: el icono crece un pelo y vuelve. Con "reducir
    // movimiento" se queda en su tamaño final.
    const scale = React.useRef(new Animated.Value(focused ? 1 : 0.92)).current;
    React.useEffect(() => {
      if (reduce) { scale.setValue(1); return; }
      Animated.spring(scale, { toValue: focused ? 1.1 : 1, useNativeDriver: true, speed: 16, bounciness: 12 }).start();
    }, [focused, scale]);
    return (
      <Pressable onPress={() => go(name)} accessibilityRole="button"
        accessibilityLabel={label} accessibilityState={{ selected: focused }}
        style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
        <Animated.View style={{ width: 52, height: 30, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
          <Icon size={23} color={focused ? iconOn : iconOff} strokeWidth={focused ? 2.3 : 1.75} />
          {name === 'chats' && unread > 0 ? (
            <View style={{
              position: 'absolute', top: -3, right: 6, minWidth: 17, height: 17, borderRadius: 9,
              paddingHorizontal: 4, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: C.surface,
            }}>
              <Text maxFontSizeMultiplier={1.2} style={{ color: C.onAccent, fontSize: 9.5, fontFamily: FONT.heading }}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </Animated.View>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 10, fontFamily: focused ? FONT.semibold : FONT.medium, color: focused ? iconOn : iconOff, marginTop: 1, letterSpacing: -0.1 }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  // Botón central: icono, rótulo y "estoy aquí". Con featuredHref el destino
  // no es una pestaña, así que nunca sale enfocado (no vive en este stack).
  const FeaturedIcon = prio.featuredHref ? BedDouble : TAB_ICONS[prio.featuredTab];
  const featuredLabel = prio.featuredHref ? t('feed.spacePisos') : TAB_LABELS[prio.featuredTab]();
  const featuredFocused = !prio.featuredHref && (
    prio.featuredTab === 'feed'
      ? (isFocused('feed') || isFocused('crush'))
      : isFocused(prio.featuredTab));

  // Indicador que se DESLIZA bajo la ranura activa. La barra son 5 ranuras
  // iguales (2 + central + 2); medimos el ancho una vez y movemos una pastilla
  // con Animated a la ranura correspondiente.
  const [barW, setBarW] = React.useState(0);
  const slotW = barW ? (barW - 12) / 5 : 0;
  const activeSlot = React.useMemo(() => {
    const at = (k: TabKey) => (k === 'feed' ? (isFocused('feed') || isFocused('crush')) : isFocused(k));
    if (LEFT[0] && at(LEFT[0])) return 0;
    if (LEFT[1] && at(LEFT[1])) return 1;
    if (RIGHT[0] && at(RIGHT[0])) return 3;
    if (RIGHT[1] && at(RIGHT[1])) return 4;
    return -1; // La Lupa u otra ruta sin ranura: sin indicador
  }, [LEFT, RIGHT, state.index]);

  const slide = React.useRef(new Animated.Value(0)).current;
  const fade = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!slotW || activeSlot < 0) { fade.setValue(0); return; }
    const x = 6 + activeSlot * slotW;
    if (reduce) { slide.setValue(x); fade.setValue(1); return; }
    Animated.parallel([
      Animated.spring(slide, { toValue: x, useNativeDriver: true, speed: 16, bounciness: 6 }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [activeSlot, slotW, reduce, slide, fade]);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 10) + 4, alignItems: 'center' }}>
      <View
        onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w && w !== barW) setBarW(w); }}
        style={[{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: barBg, borderRadius: 28, paddingHorizontal: 6, paddingVertical: 8,
          width: '100%', maxWidth: 440, borderWidth: 0.5, borderColor: borderCol,
        }, SHADOW.float]}>
        {/* Pastilla del indicador: violeta muy suave, detrás de los iconos. */}
        {slotW ? (
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: 6, left: 0, height: 34, width: slotW,
            opacity: fade, transform: [{ translateX: slide }],
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{ width: Math.min(slotW - 10, 48), height: 34, borderRadius: 17, backgroundColor: C.accentSoft }} />
          </Animated.View>
        ) : null}

        {LEFT.map((name) => <TabIcon key={name} name={name} Icon={TAB_ICONS[name]} />)}

        {/* Botón central destacado: violeta sólido, elevado sobre la barra.
            Qué abre depende de la intención: Eventos por defecto, Inicio para
            quien viene a conocer gente y Pisos para quien busca vivienda. */}
        <Pressable
          onPress={() => {
            if (prio.featuredHref) {
              Haptics.selectionAsync().catch(() => {});
              router.push(prio.featuredHref);
              return;
            }
            go(prio.featuredTab);
          }}
          accessibilityRole="button"
          accessibilityLabel={featuredLabel}
          accessibilityState={{ selected: featuredFocused }}
          style={{ flex: 1, alignItems: 'center', marginTop: -22 }}>
          <View
            style={[{
              width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.blue, borderWidth: 3, borderColor: C.surface,
            }, SHADOW.float]}>
            <FeaturedIcon size={24} color={C.onAccent} strokeWidth={2.1}
              fill={featuredFocused ? 'rgba(255,255,255,0.26)' : 'transparent'} />
          </View>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 10, fontFamily: featuredFocused ? FONT.semibold : FONT.medium, color: featuredFocused ? iconOn : iconOff, marginTop: 3, letterSpacing: -0.1 }}>
            {featuredLabel}
          </Text>
        </Pressable>

        {RIGHT.map((name) => <TabIcon key={name} name={name} Icon={TAB_ICONS[name]} />)}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      {/* Las 7 pantallas siguen existiendo como rutas pase lo que pase; la
          barra pinta 5 ranuras y decide cuáles según la intención de uso.
          Crush se alcanza desde el interruptor de "Inicio", La Lupa desde el
          buscador de las cabeceras. */}
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="crush" />
      <Tabs.Screen name="estudio" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="eventos" />
      <Tabs.Screen name="explorar" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
