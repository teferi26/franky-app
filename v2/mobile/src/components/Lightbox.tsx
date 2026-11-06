// ─── Visor de imagen a pantalla completa (pinch-to-zoom) ─────────────────
// Fondo negro, pellizco para acercar, doble toque para alternar zoom y
// arrastre hacia abajo para cerrar (el gesto que todo el mundo espera de un
// visor de fotos). Usa react-native-gesture-handler (GestureDetector +
// Gesture.Pinch/Tap/Pan). En este proyecto NO está instalado
// react-native-reanimated, así que animamos con el Animated de RN y forzamos
// los callbacks de los gestos al hilo JS (runOnJS). El árbol raíz no monta
// GestureHandlerRootView, por eso lo envolvemos aquí (los Modal viven en su
// propia jerarquía nativa y necesitan su propia raíz).
import React, { useEffect, useRef } from 'react';
import { Modal, View, Animated, useWindowDimensions, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Tap } from './ui';
import { useReduceMotion } from '@/lib/a11y';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const MAX_ZOOM = 4;
// Arrastre vertical (sin zoom) a partir del cual soltar cierra el visor.
const DISMISS_DISTANCE = 110;

export function Lightbox({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const saved = useRef(1);   // escala consolidada entre gestos
  const live = useRef(1);    // escala en curso durante el pellizco

  // Al abrir otra imagen, volvemos a escala 1 y sin desplazamiento.
  useEffect(() => {
    if (uri) { saved.current = 1; live.current = 1; scale.setValue(1); translateY.setValue(0); }
  }, [uri, scale, translateY]);

  const springTo = (to: number) => {
    saved.current = to; live.current = to;
    if (reduceMotion) { scale.setValue(to); return; }
    Animated.spring(scale, { toValue: to, useNativeDriver: true, bounciness: 4 }).start();
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((e) => {
      live.current = clamp(saved.current * e.scale, 1, MAX_ZOOM);
      scale.setValue(live.current);
    })
    .onEnd(() => {
      // Por debajo de ~1 volvemos a encajar la imagen.
      if (live.current < 1.05) springTo(1);
      else saved.current = live.current;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => springTo(saved.current > 1 ? 1 : 2.5));

  // Arrastre para cerrar: solo sin zoom (con zoom el arrastre sería para
  // moverse por la foto, que no soportamos; mejor no robarle el gesto).
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      if (saved.current > 1) return;
      translateY.setValue(e.translationY);
    })
    .onEnd((e) => {
      if (saved.current > 1) return;
      if (Math.abs(e.translationY) > DISMISS_DISTANCE) { onClose(); return; }
      if (reduceMotion) { translateY.setValue(0); return; }
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    });

  const gesture = Gesture.Simultaneous(pinch, doubleTap, pan);

  // El fondo se aclara a medida que se arrastra: avisa de que soltar cierra.
  const backdropOpacity = translateY.interpolate({
    inputRange: [-DISMISS_DISTANCE * 2, 0, DISMISS_DISTANCE * 2],
    outputRange: [0.5, 1, 0.5],
    extrapolate: 'clamp',
  });

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* Negro y blanco fijos: un visor de fotos es negro en los tres temas. */}
        <Animated.View style={{ flex: 1, backgroundColor: '#000', opacity: backdropOpacity }}>
          <GestureDetector gesture={gesture}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              {uri ? (
                <Animated.View style={{ width, height, transform: [{ translateY }, { scale }] }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain"
                    transition={120} cachePolicy="memory-disk" accessibilityLabel="Foto a pantalla completa" />
                </Animated.View>
              ) : null}
            </View>
          </GestureDetector>

          <Tap onPress={onClose} accessibilityLabel="Cerrar imagen" accessibilityHint="También puedes arrastrar la foto hacia abajo" hitSlop={8}
            style={{ position: 'absolute', top: insets.top + 8, right: 14 }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.42)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={23} color="#fff" strokeWidth={1.9} />
            </View>
          </Tap>
        </Animated.View>
      </GestureHandlerRootView>
      <StatusBar barStyle="light-content" />
    </Modal>
  );
}
