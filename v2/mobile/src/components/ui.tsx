// ─── Kit de UI Franky ───────────────────────────────────────────────────────
// Piezas base de toda la app. Todo sale de los tokens de src/theme.ts (paleta
// mutable C, tipografía F/FONT, radios R, sombras SHADOW), así que cambiar el
// tema o el modo oscuro repinta el kit entero sin tocar las pantallas.
import React, { useEffect, useRef } from 'react';
import {
  View, Text, Pressable, TextInput, Animated, StyleSheet,
  ViewStyle, StyleProp, ActivityIndicator, AccessibilityRole, Modal, TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Search, X, Check, ChevronRight, LucideIcon } from 'lucide-react-native';
import { C, S, R, F, FONT, BRAND_RING, BRAND_GRADIENT, AVATAR_COLORS, SHADOW, isDarkMode } from '@/theme';
import { getThemeMode } from '@/lib/theme-switch';
import { useReduceMotion, MAX_FONT_SCALE } from '@/lib/a11y';

export function Tap({ children, onPress, onLongPress, style, haptic = false, disabled, accessibilityRole, accessibilityLabel, accessibilityHint, accessibilityState, hitSlop }: {
  children: React.ReactNode; onPress?: () => void; onLongPress?: () => void;
  style?: StyleProp<ViewStyle>; haptic?: boolean; disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string; accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; busy?: boolean; expanded?: boolean };
  hitSlop?: number;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number) => {
    // Con "reducir movimiento" activado nos quedamos en el estado final: sin
    // animación de escala al presionar. Los haptics no se ven afectados.
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };
  // El Pressable debe ocupar la misma posición que la imagen del botón.
  // Posicionar solo el hijo animado deja el área pulsable en el flujo normal.
  const flat = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: ViewStyle = { ...flat };
  for (const k of ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'minWidth', 'maxWidth', 'alignSelf'] as const) {
    if (flat[k] !== undefined) (outer as Record<string, unknown>)[k] = flat[k];
  }
  for (const k of ['position', 'top', 'right', 'bottom', 'left', 'start', 'end', 'zIndex'] as const) {
    if (flat[k] !== undefined) {
      (outer as Record<string, unknown>)[k] = flat[k];
      delete inner[k];
    }
  }
  if (flat.position === 'absolute' && flat.top !== undefined && flat.bottom !== undefined && flat.height === undefined) {
    inner.flex = inner.flex ?? 1;
  }
  return (
    <Pressable
      style={outer}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      disabled={disabled}
      onPressIn={() => animate(0.965)}
      onPressOut={() => animate(1)}
      onLongPress={onLongPress}
      onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}>
      <Animated.View style={[{ transform: [{ scale }] }, inner]}>{children}</Animated.View>
    </Pressable>
  );
}

// Fila plana con hairline abajo (listas de ajustes, resultados).
export function Row({ children, style, onPress, accessibilityLabel, accessibilityHint }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void;
  accessibilityLabel?: string; accessibilityHint?: string;
}) {
  const inner = <View style={[st.row, style]}>{children}</View>;
  return onPress ? (
    <Tap onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>{inner}</Tap>
  ) : inner;
}

// Tarjeta elevada: superficie blanca, radio grande y sombra suave. Es la
// pieza que da el aire "producto" a la app (frente al hairline plano).
export function Card({ children, style, onPress, accessibilityLabel, accessibilityHint, flat }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void;
  accessibilityLabel?: string; accessibilityHint?: string;
  /** Sin sombra ni borde: solo la superficie (para agrupar dentro de otra tarjeta). */
  flat?: boolean;
}) {
  const inner = <View style={[flat ? st.cardFlat : st.card, style]}>{children}</View>;
  return onPress ? (
    <Tap onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}>{inner}</Tap>
  ) : inner;
}

export function Btn({
  label, onPress, variant = 'primary', full, small, disabled, busy, haptic = true, icon: Icon,
  accessibilityLabel, accessibilityHint, accessibilityState,
}: {
  label: string; onPress?: () => void;
  /** primary = degradado de marca; secondary = superficie tintada; ghost = solo borde; danger; link. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  full?: boolean; small?: boolean; disabled?: boolean; busy?: boolean;
  /** Vibración al pulsar. Los botones (acciones) vibran por defecto; pásalo a false para un caso puntual. */
  haptic?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string; accessibilityHint?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean };
}) {
  if (variant === 'link') {
    return (
      <Tap onPress={disabled ? undefined : onPress} disabled={disabled} haptic={haptic}
        accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.blue, fontFamily: FONT.semibold, fontSize: small ? 13 : 14.5, opacity: disabled ? 0.4 : 1 }}>{label}</Text>
      </Tap>
    );
  }
  const height = small ? 44 : 48;
  const fontSize = small ? 13.5 : 15.5;
  const fg = variant === 'primary' ? C.onAccent : variant === 'danger' ? C.errorText : variant === 'ghost' ? C.text : C.blue;
  const bg = variant === 'secondary' ? C.accentSoft : variant === 'danger' ? `${C.error}1A` : 'transparent';
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : (
        <>
          {Icon ? <Icon size={small ? 15 : 18} color={fg} strokeWidth={1.9} /> : null}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}
            style={{ color: fg, fontFamily: FONT.semibold, fontSize, letterSpacing: 0 }}>{label}</Text>
        </>
      )}
    </View>
  );
  return (
    <Tap onPress={disabled || busy ? undefined : onPress} disabled={disabled || busy} haptic={haptic}
      accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!busy, ...accessibilityState }}
      style={[{ borderRadius: R.md, opacity: disabled ? 0.45 : 1 }, full && { alignSelf: 'stretch' }]}>
      {/* Primario: violeta SÓLIDO (v3 Editorial, sin degradados). */}
      <View style={{
        minHeight: height, borderRadius: R.md, paddingHorizontal: small ? 14 : 22, justifyContent: 'center',
        backgroundColor: variant === 'primary' ? C.blue : bg,
        borderWidth: variant === 'ghost' ? 1 : 0, borderColor: C.border,
      }}>
        {content}
      </View>
    </Tap>
  );
}

export function Chip({ label, active, onPress, accessibilityRole = 'button', accessibilityHint, icon: Icon }: {
  label: string; active?: boolean; onPress?: () => void;
  /** 'tab' cuando el chip funciona como pestaña de un selector (p. ej. filtros exclusivos). */
  accessibilityRole?: 'button' | 'tab'; accessibilityHint?: string;
  icon?: LucideIcon;
}) {
  const fg = active ? C.onAccent : C.text;
  return (
    <Tap onPress={onPress} accessibilityRole={accessibilityRole} accessibilityLabel={label}
      accessibilityHint={accessibilityHint} accessibilityState={{ selected: !!active }}
      style={[st.chip, active && { backgroundColor: C.blue, borderColor: C.blue }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {Icon ? <Icon size={14} color={fg} strokeWidth={1.9} /> : null}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: active ? FONT.semibold : FONT.medium, color: fg, letterSpacing: -0.1 }}>{label}</Text>
      </View>
    </Tap>
  );
}

export function Pill({ label, tone = 'gray', icon: Icon }: { label: string; tone?: 'gray' | 'blue' | 'red' | 'green' | 'orange'; icon?: LucideIcon }) {
  // Tintes TRANSLÚCIDOS sobre el fondo del tema en vez de colores claros fijos:
  // los fijos se veían casi blancos (y el texto ilegible) en modo oscuro.
  const dark = isDarkMode(getThemeMode());
  const green = dark ? '#7BE04F' : '#166534';
  const orange = dark ? '#F5B76A' : '#92400E';
  const map = {
    gray: { bg: C.input, fg: C.muted },
    blue: { bg: C.accentSoft, fg: C.blue },
    red: { bg: `${C.error}1F`, fg: C.errorText },
    green: { bg: `${green}22`, fg: green },
    orange: { bg: `${orange}22`, fg: orange },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: map.bg, borderRadius: R.full, paddingHorizontal: 9, paddingVertical: 3.5 }}>
      {Icon ? <Icon size={11} color={map.fg} strokeWidth={2.4} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: map.fg, fontSize: 11.5, fontFamily: FONT.semibold }}>{label}</Text>
    </View>
  );
}

// Avatar circular; ring=true → anillo degradado de marca (historias activas)
export function Avatar({ name, size = 40, ring, uri }: { name?: string | null; size?: number; ring?: boolean; uri?: string | null }) {
  const initials = (name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  // Tonos de marca para las iniciales: cada persona sale siempre del mismo.
  let h = 0; for (const ch of (name ?? 'x')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const core = (
    <View accessible accessibilityRole="image" accessibilityLabel={name ? `Foto de perfil de ${name}` : 'Foto de perfil'} style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: hue.background,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    }}>
      {/* Las iniciales son un relleno visual: la etiqueta accesible ya va en el contenedor. */}
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ color: hue.foreground, fontFamily: FONT.heading, fontSize: size * 0.38 }}>{initials}</Text>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : null}
    </View>
  );
  if (!ring) return core;
  return (
    <LinearGradient colors={[...BRAND_RING]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
      style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ backgroundColor: C.bg, borderRadius: (size + 3) / 2, padding: 2 }}>{core}</View>
    </LinearGradient>
  );
}

// Icono dentro de un círculo tintado. Es la forma canónica de "icono con
// presencia" en toda la app (estados vacíos, atajos, filas de ajustes).
export function IconCircle({ icon: Icon, size = 44, color, bg, gradient, strokeWidth = 2 }: {
  icon: LucideIcon; size?: number; color?: string; bg?: string; gradient?: boolean; strokeWidth?: number;
}) {
  const iconSize = Math.round(size * 0.5);
  if (gradient) {
    return (
      <LinearGradient colors={[...BRAND_GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={iconSize} color="#fff" strokeWidth={strokeWidth} />
      </LinearGradient>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg ?? C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={iconSize} color={color ?? C.blue} strokeWidth={strokeWidth} />
    </View>
  );
}

export function SectionHeader({ title, action, onAction, subtitle }: { title: string; action?: string; onAction?: () => void; subtitle?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: S.lg, marginTop: S.xl, marginBottom: S.sm }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>{title}</Text>
        {subtitle ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 1 }]}>{subtitle}</Text> : null}
      </View>
      {action ? <Btn variant="link" small label={action} onPress={onAction} /> : null}
    </View>
  );
}

export function SearchBar({ value, onChange, placeholder, autoFocus, onSubmit }: {
  value: string; onChange: (t: string) => void; placeholder: string; autoFocus?: boolean; onSubmit?: () => void;
}) {
  return (
    <View style={st.search}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Search size={17} color={C.muted} strokeWidth={1.9} />
      </View>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} autoFocus={autoFocus}
        placeholderTextColor={C.muted}
        returnKeyType="search" autoCorrect={false} autoCapitalize="none"
        onSubmitEditing={onSubmit}
        accessibilityLabel={placeholder}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 0, marginLeft: 9 }}
      />
      {value ? (
        <Tap onPress={() => onChange('')} style={{ marginLeft: 8 }} accessibilityLabel="Limpiar búsqueda" hitSlop={8}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} color={C.text} strokeWidth={2.4} />
          </View>
        </Tap>
      ) : null}
    </View>
  );
}

// Estado vacío editorial: icono SUELTO de trazo fino (nada de círculos
// gigantes tintados), título grande en Outfit y CTA opcional.
export function EmptyState({ icon: Icon, title, subtitle, cta, onCta, compact }: {
  icon: LucideIcon; title: string; subtitle?: string; cta?: string; onCta?: () => void; compact?: boolean;
}) {
  // Entrada propia (opacidad + subida) en vez de importar motion.tsx: el kit
  // no debe arrastrar mas modulos de los imprescindibles.
  const reduceMotion = useReduceMotion();
  const appear = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) { appear.setValue(1); return; }
    const anim = Animated.timing(appear, { toValue: 1, duration: 420, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [appear, reduceMotion]);
  return (
    <Animated.View style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
      <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', paddingVertical: compact ? 28 : 56, paddingHorizontal: 36 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginBottom: 14 }}>
          <Icon size={compact ? 24 : 28} color={C.muted} strokeWidth={1.5} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.h1, { fontSize: compact ? 19 : 24, letterSpacing: -0.6, textAlign: 'center' }]}>{title}</Text>
        {subtitle ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 21, maxWidth: 320 }]}>{subtitle}</Text> : null}
        {cta ? <View style={{ marginTop: 20 }}><Btn label={cta} onPress={onCta} /></View> : null}
      </View>
    </Animated.View>
  );
}

// Skeleton base: un bloque que pulsa mientras carga. Radio y color derivados
// siempre de C.input/C.borderLight (nunca hardcodeados) para que funcione en
// los 3 temas. Respeta "reducir movimiento": si está activo, se queda fijo en
// la opacidad media, sin pulsar.
export function Skeleton({ height = 80, radius = R.md, style }: { height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0.65);
      return;
    }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulse, reduceMotion]);
  return (
    <Animated.View
      accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}
      style={[{ height, borderRadius: radius, backgroundColor: C.borderLight, opacity: pulse, marginBottom: S.md, marginHorizontal: S.lg }, style]}
    />
  );
}

// Variante para listas: N bloques agrupados en un único elemento accesible
// (se anuncia una sola vez "Cargando", en vez de repetirlo por cada bloque).
export function SkeletonList({ count = 3, height = 80, radius = R.md, gap = 0, style }: {
  count?: number; height?: number; radius?: number; gap?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} radius={radius} style={[style, gap ? { marginBottom: gap } : null]} />
      ))}
    </View>
  );
}

export type SheetOption = {
  label: string;
  destructive?: boolean;
  /** Marca la opción activa con un check (p. ej. el tema del chat elegido). */
  selected?: boolean;
  icon?: LucideIcon;
  onPress: () => void;
};

// Hoja de opciones inferior, estilo action sheet. Existe porque Alert.alert
// en Android solo admite 3 botones: cualquier menú más largo (temas del chat,
// motivos de denuncia, menú ⋯) tiene que ir en un Modal propio.
export function OptionsSheet({ visible, title, options, onClose }: {
  visible: boolean; title?: string | null; options: SheetOption[]; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={onClose}
        accessibilityLabel="Cerrar menú" accessibilityRole="button" />
      <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 8, paddingBottom: 30 }}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 6 }} />
        {title ? (
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[F.h3, { paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: 6, color: C.muted }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {options.map((o) => (
          <Tap key={o.label} accessibilityLabel={o.label} accessibilityState={{ selected: !!o.selected }}
            onPress={() => {
              onClose();
              // Espera a que el Modal termine de cerrarse: presentar otro Modal
              // o un Alert mientras este se desmonta se traga la presentación en iOS.
              setTimeout(o.onPress, 320);
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 48 }}>
              {o.icon ? <o.icon size={20} color={o.destructive ? C.error : C.text} strokeWidth={2} /> : null}
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, color: o.destructive ? C.error : C.text, flex: 1 }}>{o.label}</Text>
              {o.selected ? (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Check size={18} color={C.blue} strokeWidth={2.4} />
                </View>
              ) : null}
            </View>
          </Tap>
        ))}
        <Tap onPress={onClose} accessibilityLabel="Cancelar">
          <View style={{ paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 48, justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, color: C.muted }}>Cancelar</Text>
          </View>
        </Tap>
      </View>
    </Modal>
  );
}

export function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const inner = (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 18, fontFamily: FONT.heading, color: C.text }}>{value}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, color: C.muted }}>{label}</Text>
    </View>
  );
  return onPress ? (
    <Tap onPress={onPress} accessibilityLabel={`${value} ${label}`} style={{ flex: 1 }}>{inner}</Tap>
  ) : inner;
}

// Barra de progreso fina, violeta sólido, con el avance animado.
export function ProgressBar({ value, height = 4, style }: { value: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const pct = Math.max(0, Math.min(100, value));
  const reduceMotion = useReduceMotion();
  const w = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    if (reduceMotion) { w.setValue(pct); return; }
    const anim = Animated.timing(w, { toValue: pct, duration: 520, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [pct, w, reduceMotion]);
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[{ height, borderRadius: height / 2, backgroundColor: C.borderLight, overflow: 'hidden' }, style]}>
      <Animated.View style={{
        width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
        height: '100%', borderRadius: height / 2, backgroundColor: C.blue,
      }} />
    </View>
  );
}

// Fila de navegación estándar (ajustes, hubs): icono en círculo, título,
// nota opcional y chevron. Sustituye a las filas hechas a mano por pantalla.
export function NavRow({ icon: Icon, title, note, onPress, right, tone, accessibilityLabel, badge }: {
  icon: LucideIcon; title: string; note?: string; onPress?: () => void; right?: React.ReactNode;
  tone?: 'default' | 'danger'; accessibilityLabel?: string; badge?: string | number;
}) {
  const danger = tone === 'danger';
  return (
    <Tap onPress={onPress} accessibilityLabel={accessibilityLabel ?? title} accessibilityHint={note}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 56 }}>
        <IconCircle icon={Icon} size={38} color={danger ? C.error : C.blue} bg={danger ? `${C.error}1A` : C.accentSoft} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, danger && { color: C.errorText }]} numberOfLines={1}>{title}</Text>
          {note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 1 }]} numberOfLines={1}>{note}</Text> : null}
        </View>
        {badge !== undefined && badge !== 0 && badge !== '' ? (
          <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontSize: 11, fontFamily: FONT.semibold }}>{String(badge)}</Text>
          </View>
        ) : null}
        {right ?? (onPress ? <ChevronRight size={18} color={C.muted} strokeWidth={2} /> : null)}
      </View>
    </Tap>
  );
}

// Bloque destacado con degradado de marca (cabeceras de hub, rachas, CTAs).
export function GradientCard({ children, style, onPress, colors, accessibilityLabel }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void;
  colors?: readonly [string, string, ...string[]]; accessibilityLabel?: string;
}) {
  const inner = (
    <LinearGradient colors={[...(colors ?? BRAND_GRADIENT)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[{ borderRadius: R.xl, padding: S.lg, marginHorizontal: S.lg, marginBottom: S.md }, SHADOW.glow, style]}>
      {children}
    </LinearGradient>
  );
  return onPress ? <Tap onPress={onPress} haptic accessibilityLabel={accessibilityLabel}>{inner}</Tap> : inner;
}

// Logotipo de la marca: la marca "iF" + Franky en Outfit. Sustituye a la
// caligrafía anterior en la bienvenida y las cabeceras.
export function BrandWordmark({ size = 34, color, style, markOnly }: {
  size?: number; color?: string; style?: StyleProp<ViewStyle>; markOnly?: boolean;
}) {
  const mark = Math.round(size * 1.15);
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.round(size * 0.28) }, style]}
      accessible accessibilityRole="image" accessibilityLabel="Franky">
      <Image source={require('../../assets/images/splash-icon.png')} style={{ width: mark, height: mark, borderRadius: mark * 0.24 }} contentFit="cover" />
      {markOnly ? null : (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: FONT.display, fontSize: size, color: color ?? C.blue, letterSpacing: -size * 0.03 }}>
          Franky
        </Text>
      )}
    </View>
  );
}

/** Texto con estilo de tipografía de marca, para no repetir fontFamily por todas partes. */
export function T({ v = 'body', style, children, numberOfLines, color }: {
  v?: keyof typeof F; style?: StyleProp<TextStyle>; children: React.ReactNode; numberOfLines?: number; color?: string;
}) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={numberOfLines} style={[F[v], color ? { color } : null, style]}>
      {children}
    </Text>
  );
}

// OJO: esto NO puede ser un StyleSheet.create a nivel de módulo. C es una
// paleta MUTABLE que cambia con el tema, y StyleSheet.create congelaba los
// colores del modo claro para siempre. Con getters se recalculan en cada
// acceso (el árbol se remonta al cambiar de tema), y además devuelven un
// objeto nuevo cada vez, así que React Native nunca los congela.
const st = {
  get row(): ViewStyle {
    return {
      backgroundColor: C.bg, paddingHorizontal: S.lg, paddingVertical: 12,
      borderBottomWidth: 0.5, borderBottomColor: C.borderLight,
    };
  },
  // Tarjeta v3: superficie limpia, hairline SIEMPRE (también en claro) y una
  // sombra suave. El borde es lo que le da el aire editorial.
  get card(): ViewStyle {
    return {
      backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5,
      borderColor: isDarkMode(getThemeMode()) ? C.borderLight : C.border,
      padding: S.lg, marginHorizontal: S.lg, marginBottom: S.md, ...SHADOW.card,
    };
  },
  get cardFlat(): ViewStyle {
    return { backgroundColor: C.input, borderRadius: R.lg, padding: S.lg, marginHorizontal: S.lg, marginBottom: S.md };
  },
  get chip(): ViewStyle {
    return {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full, minHeight: 34,
      backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, marginRight: 8,
    };
  },
  // Buscador: campo con hairline sobre la superficie, no un bloque relleno.
  get search(): ViewStyle {
    return {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface,
      borderRadius: R.md, borderWidth: 0.5, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 11, minHeight: 46,
      marginHorizontal: S.lg, marginBottom: S.md,
    };
  },
};
