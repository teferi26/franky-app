// ─── Primitivas de movimiento Franky (móvil) ────────────────────────────────
// Todo con la API Animated de React Native (driver nativo): sin reanimated,
// así no obliga a una build EAS nueva. Cada pieza respeta "reducir
// movimiento" (useReduceMotion) quedándose en el estado final.
//
//   <FadeIn index={i}>…</FadeIn>            entrada (opacidad + 14 px) en cascada
//   <Stagger>{cards}</Stagger>              cada hijo directo entra con su índice
//   <Collapsible open={x}>…</Collapsible>   altura y opacidad animadas
//   <AnimatedNumber value={n} />            cifra que cuenta al montar
//   <ScrollHeader …/>                       cabecera grande que se encoge al bajar
//   useLayoutAnim()                          LayoutAnimation antes de cambiar listas
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, LayoutAnimation, Platform, StyleProp, Text, UIManager, View, ViewStyle, TextStyle,
} from 'react-native';
import { useReduceMotion, MAX_FONT_SCALE } from '@/lib/a11y';
import { C, FONT } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Curva de salida suave (equivale al ease-out-expo de la web). */
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SPRING = { speed: 18, bounciness: 6 } as const;

/** Entrada al montar: opacidad 0→1 y subida de 14 px. `index` escalona 60 ms
 *  por posición (tope 12) y `delay` añade un retraso fijo. */
export function FadeIn({ children, index = 0, delay = 0, distance = 14, duration = 520, style, from = 'bottom' }: {
  children: React.ReactNode; index?: number; delay?: number; distance?: number; duration?: number;
  style?: StyleProp<ViewStyle>; from?: 'bottom' | 'top' | 'left' | 'right' | 'none';
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    const anim = Animated.timing(v, {
      toValue: 1, duration, delay: delay + Math.min(index, 12) * 60, easing: EASE_OUT, useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [v, reduce, delay, index, duration]);
  const axis = from === 'left' || from === 'right' ? 'translateX' : 'translateY';
  const sign = from === 'top' || from === 'left' ? -1 : 1;
  const transform = from === 'none' ? [] : [{ [axis]: v.interpolate({ inputRange: [0, 1], outputRange: [sign * distance, 0] }) } as never];
  return (
    <Animated.View style={[{ opacity: v, transform }, style]}>
      {children}
    </Animated.View>
  );
}

/** Cada hijo directo entra en cascada. Para rejillas y listas cortas (las
 *  FlatList largas usan `FadeIn index={index}` en renderItem). */
export function Stagger({ children, start = 0, style }: {
  children: React.ReactNode; start?: number; style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children);
  return (
    <View style={style}>
      {items.map((child, i) => (
        <FadeIn key={(child as React.ReactElement).key ?? i} index={start + i}>{child}</FadeIn>
      ))}
    </View>
  );
}

/** Escala al pulsar (0.97) con muelle. `Tap` del kit ya lo hace; esto es para
 *  envolver Pressables propios. */
export function PressScale({ children, pressed, to = 0.97, style }: {
  children: React.ReactNode; pressed: boolean; to?: number; style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const s = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.spring(s, { toValue: pressed ? to : 1, useNativeDriver: true, ...EASE_SPRING }).start();
  }, [pressed, s, to, reduce]);
  return <Animated.View style={[{ transform: [{ scale: s }] }, style]}>{children}</Animated.View>;
}

/** Bloque que se abre y cierra animando altura y opacidad. Mide el contenido
 *  una vez con onLayout. */
export function Collapsible({ open, children, style }: {
  open: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const [h, setH] = useState(0);
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(open ? 1 : 0); return; }
    Animated.timing(v, { toValue: open ? 1 : 0, duration: 280, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [open, v, reduce]);
  return (
    <Animated.View style={[{ overflow: 'hidden', height: h ? v.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) : (open ? undefined : 0), opacity: v }, style]}>
      <View style={{ position: h ? 'relative' : 'absolute', width: '100%' }} onLayout={(e) => { const n = e.nativeEvent.layout.height; if (n && n !== h) setH(n); }}>
        {children}
      </View>
    </Animated.View>
  );
}

/** Cifra que cuenta de 0 al valor al montar (o al cambiar). */
export function AnimatedNumber({ value, duration = 1100, style, suffix = '', prefix = '', decimals = 0 }: {
  value: number; duration?: number; style?: StyleProp<TextStyle>; suffix?: string; prefix?: string; decimals?: number;
}) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    v.setValue(0);
    const id = v.addListener(({ value: p }) => setShown(value * p));
    const anim = Animated.timing(v, { toValue: 1, duration, easing: EASE_OUT, useNativeDriver: false });
    anim.start();
    return () => { anim.stop(); v.removeListener(id); };
  }, [value, duration, v, reduce]);
  const txt = shown.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[{ fontFamily: FONT.display, color: C.text, fontVariant: ['tabular-nums'] }, style]}>
      {prefix}{txt}{suffix}
    </Text>
  );
}

/**
 * Cabecera grande que se encoge al bajar. Devuelve `onScroll` para pasarlo a
 * la lista (con `scrollEventThrottle={16}`) y el `Animated.Value` del scroll.
 *
 *   const { scrollY, onScroll } = useScrollHeader();
 *   <ScrollHeader scrollY={scrollY} title="Becas" subtitle="596 activas" />
 *   <Animated.FlatList onScroll={onScroll} scrollEventThrottle={16} … />
 */
export function useScrollHeader() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true });
  return { scrollY, onScroll } as const;
}

export function ScrollHeader({ scrollY, title, subtitle, right, range = 56 }: {
  scrollY: Animated.Value; title: string; subtitle?: string; right?: React.ReactNode; range?: number;
}) {
  const reduce = useReduceMotion();
  const clamp = scrollY.interpolate({ inputRange: [0, range], outputRange: [0, 1], extrapolate: 'clamp' });
  const bigOpacity = reduce ? 1 : clamp.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const bigY = reduce ? 0 : clamp.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const smallOpacity = reduce ? 0 : clamp;
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <Animated.View style={{ opacity: bigOpacity, transform: [{ translateY: bigY }] }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }}>{title}</Text>
          {subtitle ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, color: C.muted, marginTop: 2 }}>{subtitle}</Text> : null}
        </Animated.View>
        {right}
      </View>
      <Animated.Text pointerEvents="none" maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ position: 'absolute', left: 16, top: 8, fontFamily: FONT.heading, fontSize: 16, color: C.text, opacity: smallOpacity }}>
        {title}
      </Animated.Text>
    </View>
  );
}

/** Llamar ANTES de un setState que añade/quita filas: la lista se recoloca con
 *  una transición en vez de saltar. */
export function useLayoutAnim() {
  const reduce = useReduceMotion();
  return React.useCallback(() => {
    if (reduce) return;
    LayoutAnimation.configureNext({
      duration: 260,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
  }, [reduce]);
}

/** Pulso suave en bucle (puntos "en directo", indicador de grabación). */
export function Pulse({ children, style, min = 0.55 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; min?: number }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: min, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, reduce, min]);
  return <Animated.View style={[{ opacity: v }, style]}>{children}</Animated.View>;
}
