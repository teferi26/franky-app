// Pantalla base: cabecera Franky (título en Outfit, iconos a la derecha) y
// cuerpo en ScrollView o FlatList con las mismas props.
import React from 'react';
import {
  ScrollView, View, Text, RefreshControl, StyleProp, ViewStyle,
  FlatList, ListRenderItem, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Tap } from './ui';
import { onScrollTop } from '@/lib/scroll-top';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, FONT } from '@/theme';
import { SocialDemoBanner } from './SocialDemoBanner';

// Hueco inferior para que el tab bar flotante no tape el contenido.
export const TAB_BAR_CLEARANCE = 130;

export function Header({ title, subtitle, logo, back, right, transparent, onBack, scrollY }: {
  title?: string; subtitle?: string; logo?: React.ReactNode; back?: boolean; right?: React.ReactNode;
  /** Sin fondo ni línea: para cabeceras sobre degradados o imágenes. */
  transparent?: boolean;
  onBack?: () => void;
  /** Desplazamiento de la lista: el titular grande se ENCOGE al bajar. */
  scrollY?: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = () => {
    if (onBack) { onBack(); return; }
    // Sin historial (deep link, notificación): al inicio en vez de no hacer nada.
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)/feed');
  };
  // Titular grande que se ENCOGE al bajar: solo en pantallas de primer nivel
  // (título propio, sin "volver" ni logotipo) y cuando la lista nos pasa su
  // desplazamiento. El escalado se compensa con la mitad del ancho medido para
  // que el texto se quede anclado al margen izquierdo en vez de desplazarse.
  const big = !!scrollY && !!title && !back && !logo;
  const [titleW, setTitleW] = React.useState(0);
  const bigStyle = big && scrollY && titleW
    ? {
      alignItems: 'flex-start' as const,
      transform: [
        { translateX: -titleW / 2 },
        { scale: scrollY.interpolate({ inputRange: [0, 56], outputRange: [1, 0.78], extrapolate: 'clamp' }) },
        { translateX: titleW / 2 },
      ],
    }
    : null;
  return (
    <View style={{
      paddingTop: insets.top, backgroundColor: transparent ? 'transparent' : C.bg,
      borderBottomWidth: transparent ? 0 : 0.5, borderBottomColor: C.borderLight,
    }}>
      <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, gap: 10 }}>
        {/* Volver: icono SUELTO de trazo fino con hitSlop generoso, sin
            cuadrado ni círculo tintado alrededor. */}
        {back ? (
          <Tap onPress={goBack} accessibilityLabel="Volver" accessibilityHint="Vuelve a la pantalla anterior" hitSlop={14}
            style={{ marginLeft: -6, width: 32, flexShrink: 0, height: 36, alignItems: 'flex-start', justifyContent: 'center' }}>
            <ChevronLeft size={26} color={C.text} strokeWidth={1.9} />
          </Tap>
        ) : null}
        {logo ? (
          // Give the selector the remaining row width, after the back/action
          // buttons. An unconstrained logo can size itself beyond the screen.
          <View style={{ flex: 1, minWidth: 0 }}>{logo}</View>
        ) : (title ? (
          <Animated.View
            onLayout={big ? (e) => { const w = e.nativeEvent.layout.width; if (w && w !== titleW) setTitleW(w); } : undefined}
            style={[{ flex: 1, minWidth: 0 }, bigStyle]}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontSize: back ? 19 : 25, fontFamily: back ? FONT.heading : FONT.display, color: C.text, letterSpacing: back ? -0.4 : -0.7 }} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12.5, color: C.muted, marginTop: 0 }} numberOfLines={1}>{subtitle}</Text>
            ) : null}
          </Animated.View>
        ) : <View style={{ flex: 1 }} />)}
        {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      </View>
      <SocialDemoBanner />
    </View>
  );
}

// Props comunes del header/título/refresh, compartidas por las dos variantes.
// `scrollTopKey`: si se pasa el nombre de la ruta (p. ej. "feed"), tocar esa
// pestaña estando ya en ella hace scroll al principio (bus scroll-top).
type ScreenCommonProps = {
  title?: string; subtitle?: string; logo?: React.ReactNode; back?: boolean;
  right?: React.ReactNode; refreshing?: boolean; onRefresh?: () => void;
  pad?: boolean; style?: StyleProp<ViewStyle>; scrollTopKey?: string;
  onBack?: () => void;
};

// Variante clásica: cuerpo en ScrollView con children. Es el comportamiento por
// defecto y NO cambia para nadie que no pase `data`.
type ScreenScrollProps = ScreenCommonProps & {
  children: React.ReactNode;
  data?: undefined;
};

// Variante virtualizada: si se pasa `data`, el cuerpo se monta como FlatList
// (mismo header, título, right slot, safe areas, refreshControl y paddings).
// Es uno U otro: nunca un FlatList dentro del ScrollView.
type ScreenListProps<T> = ScreenCommonProps & {
  data: ReadonlyArray<T>;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  ListHeaderComponent?: React.ComponentProps<typeof FlatList>['ListHeaderComponent'];
  ListEmptyComponent?: React.ComponentProps<typeof FlatList>['ListEmptyComponent'];
  ListFooterComponent?: React.ComponentProps<typeof FlatList>['ListFooterComponent'];
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  numColumns?: number;
  children?: undefined;
};

export function Screen<T>(props: ScreenScrollProps | ScreenListProps<T>) {
  const { title, subtitle, logo, back, right, refreshing, onRefresh, pad, style, scrollTopKey, onBack } = props;

  const contentStyle = [
    { paddingBottom: TAB_BAR_CLEARANCE },
    pad && { paddingHorizontal: S.lg, paddingTop: S.lg },
    style,
  ];

  const refreshControl = onRefresh
    ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.blue} colors={[C.blue]} />
    : undefined;

  // "Volver arriba" al tocar la pestaña ya activa (bus scroll-top). Un ref por
  // variante; solo se suscribe si la pantalla declara su scrollTopKey.
  const listRef = React.useRef<FlatList<T>>(null);
  const scrollRef = React.useRef<ScrollView>(null);

  // Desplazamiento de la lista para que el titular de la cabecera se encoja.
  // useNativeDriver: false porque la lista NO es un componente Animated (y
  // cambiarla obligaría a tocar refs y props de decenas de pantallas); son dos
  // interpolaciones por fotograma, sin coste apreciable.
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const onScroll = React.useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }),
    [scrollY],
  );
  React.useEffect(() => {
    if (!scrollTopKey) return;
    return onScrollTop(scrollTopKey, () => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    });
  }, [scrollTopKey]);

  // Variante virtualizada (FlatList) cuando llega `data`.
  if ('data' in props && props.data !== undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title={title} subtitle={subtitle} logo={logo} back={back} right={right} onBack={onBack} scrollY={scrollY} />
        <FlatList<T>
          ref={listRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          data={props.data as ReadonlyArray<T>}
          renderItem={props.renderItem}
          keyExtractor={props.keyExtractor}
          ListHeaderComponent={props.ListHeaderComponent}
          ListEmptyComponent={props.ListEmptyComponent}
          ListFooterComponent={props.ListFooterComponent}
          onEndReached={props.onEndReached}
          onEndReachedThreshold={props.onEndReachedThreshold}
          numColumns={props.numColumns}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={11}
        />
      </View>
    );
  }

  // Variante clásica (ScrollView con children): comportamiento original intacto.
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={title} subtitle={subtitle} logo={logo} back={back} right={right} onBack={onBack} scrollY={scrollY} />
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}>
        {props.children}
      </ScrollView>
    </View>
  );
}
