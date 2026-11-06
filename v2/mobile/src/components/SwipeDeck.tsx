// ─── Mazo de cartas Franky: arrastra para decidir ───────────────────────────
// Desliza a la derecha para quedarte con la carta (piso, sitio, persona) y a
// la izquierda para pasar. Los sellos y los botones usan la paleta de marca
// (violeta para "me gusta", tinta suave para "paso"); las pantallas ponen el
// rótulo que toque ("Me gusta", "Guardar", "Paso").
import React, { useCallback, useRef, useState, useEffect, useLayoutEffect, forwardRef, useImperativeHandle } from 'react';
import { View, Text, Animated, PanResponder, Platform, useWindowDimensions, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart, X, RotateCcw, BookmarkCheck } from 'lucide-react-native';
import { Tap, Btn } from './ui';
import { C, S, R, FONT, SHADOW } from '@/theme';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';

// Ref imperativo (140): deshacer y "quitar sin contar como swipe" (denuncia de
// foto) necesitan mover el índice interno del mazo desde fuera. Ninguno de los
// dos dispara onSmash/onPass: quien llama ya gestionó el efecto real (RPC,
// favoritos locales...) ANTES de invocar el método.
export interface SwipeDeckHandle {
  /** Vuelve a mostrar la carta anterior. false si no había ninguna. */
  undo: () => boolean;
  /** Retira la carta actual sin que cuente como like ni pass (p. ej. tras
   * denunciar su foto). false si no había carta que retirar. */
  advance: (expectedItemId?: string) => boolean;
}

function SwipeDeckInner<T extends { id: string }>(
  {
    items, renderCard, onSmash, onPass, onReset, onUndo, onOpenSaved,
    emptyTitle, emptySubtitle, resetLabel = 'Empezar de nuevo', showResetMidDeck = true,
    likeLabel = 'ME GUSTA', likeActionLabel = 'Me gusta', passLabel = 'PASO', disabled = false, onBusyChange, savedLabel = 'Ver guardados',
  }: {
    items: T[];
    renderCard: (item: T) => React.ReactNode;
    /** `false` restaura la carta: sirve cuando una escritura remota falla. */
    onSmash: (item: T) => void | boolean | Promise<void | boolean>;
    onPass: (item: T) => void | boolean | Promise<void | boolean>;
    onReset?: () => void | boolean | Promise<void | boolean>;
    /** Deshacer el último swipe (140). Si se pasa, aparece un icono junto a
     * los botones de acción mientras haya mazo. El "deshacer" real (RPC o
     * almacén local) lo hace quien llama; este callback solo se dispara al
     * pulsar el icono, y luego usa el ref para recolocar la carta. */
    onUndo?: () => void;
    onOpenSaved?: () => void;
    emptyTitle: string;
    emptySubtitle: string;
    /** Texto del botón de reinicio en el estado vacío. Por defecto "Empezar de nuevo". */
    resetLabel?: string;
    /** Si el icono de reinicio (ligado a onReset) se ve también DURANTE el
     * swipe, no solo en el estado vacío. Por defecto true. Las pantallas con
     * su propio botón de deshacer (onUndo) lo ponen a false. */
    showResetMidDeck?: boolean;
    likeLabel?: string;
    likeActionLabel?: string;
    passLabel?: string;
    savedLabel?: string;
    /** Bloquea gestos y acciones mientras la pantalla ejecuta otra mutación. */
    disabled?: boolean;
    /** Notifica el bloqueo desde que empieza la animación hasta resolver la escritura. */
    onBusyChange?: (busy: boolean) => void;
  },
  ref: React.Ref<SwipeDeckHandle>,
) {
  const { width: W } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const THRESHOLD = W * 0.28;

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const updateBusy = useCallback((value: boolean) => {
    setBusy(value);
    onBusyChange?.(value);
  }, [onBusyChange]);
  const pan = useRef(new Animated.ValueXY()).current;
  // Referencias actualizadas durante render para que una escritura asíncrona
  // no avance un mazo que el padre haya reemplazado mientras esperaba.
  const itemsRef = useRef(items);
  const resetItemsRef = useRef(items);
  const operationRef = useRef(0);
  itemsRef.current = items;
  // bloquea pulsaciones repetidas mientras una carta se está yendo (evita saltar dos cartas)
  const settling = useRef(false);
  // umbral háptico: solo dispara una vez por gesto al cruzar el límite
  const crossed = useRef(false);

  // Si llega otra lista mientras una escritura sigue pendiente, cancelamos la
  // animación y restablecemos también el bloqueo, no solo el índice.
  useLayoutEffect(() => {
    // El montaje ya empieza en la primera carta: no invalida una pulsación
    // temprana ni reinicia el mazo si solo cambia el callback del padre.
    if (resetItemsRef.current === items) return;
    resetItemsRef.current = items;
    operationRef.current += 1;
    pan.stopAnimation();
    pan.setValue({ x: 0, y: 0 });
    settling.current = false;
    crossed.current = false;
    updateBusy(false);
    setIndex(0);
  }, [items, pan, updateBusy]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const rotate = pan.x.interpolate({ inputRange: [-W, 0, W], outputRange: ['-16deg', '0deg', '16deg'] });
  const likeOpacity = pan.x.interpolate({ inputRange: [20, THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pan.x.interpolate({ inputRange: [-THRESHOLD, -20], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pan.x.interpolate({ inputRange: [-W, 0, W], outputRange: [1, 0.95, 1], extrapolate: 'clamp' });

  const current = items[index];
  const next = items[index + 1];
  const interactionBusy = busy || disabled;

  useImperativeHandle(ref, () => ({
    undo: () => {
      if (index <= 0 || settling.current || disabled) return false;
      operationRef.current += 1;
      pan.setValue({ x: 0, y: 0 });
      setIndex(i => Math.max(0, i - 1));
      return true;
    },
    advance: (expectedItemId?: string) => {
      if (!items[index] || settling.current || disabled) return false;
      if (expectedItemId && items[index]?.id !== expectedItemId) return false;
      const operation = ++operationRef.current;
      settling.current = true;
      updateBusy(true);
      // Misma animación que un pass, pero SIN llamar a onPass: la carta se va
      // sin contar como swipe (uso: denuncia de foto).
      Animated.timing(pan, { toValue: { x: -W * 1.4, y: 0 }, duration: reduceMotion ? 0 : 220, useNativeDriver: true })
        .start(({ finished }) => {
          if (operation !== operationRef.current) return;
          settling.current = false;
          updateBusy(false);
          if (!finished) return;
          pan.setValue({ x: 0, y: 0 });
          setIndex(i => i + 1);
        });
      return true;
    },
  }), [index, items, W, reduceMotion, disabled, updateBusy]);

  const restoreCard = (operation: number) => {
    if (operation !== operationRef.current) return;
    if (reduceMotion) {
      pan.setValue({ x: 0, y: 0 });
      settling.current = false;
      updateBusy(false);
      return;
    }
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 })
      .start(() => {
        if (operation !== operationRef.current) return;
        settling.current = false;
        updateBusy(false);
      });
  };

  const settle = (dir: 1 | -1 | 0) => {
    if (disabled) return;
    if (dir === 0) {
      if (reduceMotion) {
        pan.setValue({ x: 0, y: 0 });
        return;
      }
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
      return;
    }
    if (settling.current) return;
    const itemsAtStart = items;
    const item = items[index];
    if (!item) return;
    const operation = ++operationRef.current;
    settling.current = true;
    updateBusy(true);
    Animated.timing(pan, {
      toValue: { x: dir * W * 1.4, y: 0 }, duration: reduceMotion ? 0 : 220, useNativeDriver: true,
    }).start(({ finished }) => {
      if (operation !== operationRef.current) return;
      if (!finished) { settling.current = false; updateBusy(false); return; }
      // Empezar desde una promesa también captura excepciones síncronas del
      // callback, por lo que la carta nunca queda bloqueada fuera de pantalla.
      Promise.resolve()
        .then(() => (dir === 1 ? onSmash : onPass)(item))
        .then((saved) => {
          if (operation !== operationRef.current) return;
          if (saved === false) { restoreCard(operation); return; }
          // Si llegó un filtro/reset/evento nuevo, solo avanzamos cuando la
          // lista sigue siendo la misma instancia con la que empezó el gesto.
          // Comparar solo el id no basta para cambios [A,B] -> [A,C].
          if (itemsRef.current !== itemsAtStart) {
            pan.setValue({ x: 0, y: 0 });
            settling.current = false;
            updateBusy(false);
            return;
          }
          pan.setValue({ x: 0, y: 0 });
          setIndex(i => i + 1);
          settling.current = false;
          updateBusy(false);
        })
        .catch(() => restoreCard(operation));
    });
  };

  const reset = async () => {
    if (!onReset || disabled || settling.current) return;
    const operation = ++operationRef.current;
    settling.current = true;
    updateBusy(true);
    try {
      const result = await onReset();
      if (operation !== operationRef.current || result === false) return;
      pan.setValue({ x: 0, y: 0 });
      setIndex(0);
    } catch { /* Keep the current card when the reset is not confirmed. */ }
    finally {
      if (operation === operationRef.current) { settling.current = false; updateBusy(false); }
    }
  };

  // PanResponder se crea una sola vez; la ref evita que sus callbacks se
  // queden con la primera carta/índice capturados al montar el componente.
  const settleRef = useRef(settle);
  settleRef.current = settle;

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { crossed.current = false; },
      onPanResponderMove: (e, g) => {
        if (!crossed.current && Math.abs(g.dx) > THRESHOLD) {
          crossed.current = true;
          if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(e, g);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > THRESHOLD) settleRef.current(1);
        else if (g.dx < -THRESHOLD) settleRef.current(-1);
        else settleRef.current(0);
      },
    }),
  ).current;

  if (!current) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 }}>
        <View style={{ marginBottom: 14 }}><BookmarkCheck size={28} color={C.muted} strokeWidth={1.5} /></View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 24, letterSpacing: -0.6, fontFamily: FONT.display, color: C.text, textAlign: 'center' }}>{emptyTitle}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{emptySubtitle}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {onUndo ? <Btn variant="secondary" label="Deshacer el último swipe" disabled={interactionBusy} onPress={onUndo} /> : null}
          {onReset ? <Btn variant="secondary" label={resetLabel} disabled={interactionBusy} onPress={() => { void reset(); }} /> : null}
          {onOpenSaved ? <Btn label={savedLabel} disabled={interactionBusy} onPress={onOpenSaved} /> : null}
        </View>
      </View>
    );
  }

  const cardStyle: StyleProp<ViewStyle> = {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.input,
    borderWidth: 0.5, borderColor: C.border,
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, margin: S.lg, marginBottom: 8 }}>
        {next ? (
          <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
            style={[cardStyle, { transform: [{ scale: nextScale }] }]}>
            {renderCard(next)}
          </Animated.View>
        ) : null}
        <Animated.View
          pointerEvents={interactionBusy ? 'none' : 'auto'}
          {...responder.panHandlers}
          style={[cardStyle, {
            transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
          }, SHADOW.float]}>
          {renderCard(current)}
          {/* Sellos al deslizar: violeta de marca para quedarse, tinta para pasar. */}
          <Animated.View style={{
            position: 'absolute', top: 26, left: 20, opacity: likeOpacity,
            borderRadius: R.md, overflow: 'hidden', transform: [{ rotate: '-12deg' }],
          }}>
            <View style={{ backgroundColor: C.blue, paddingHorizontal: 14, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Heart size={20} color={C.onAccent} fill={C.onAccent} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontSize: 22, fontFamily: FONT.display, letterSpacing: 0.6 }}>{likeLabel}</Text>
            </View>
          </Animated.View>
          <Animated.View style={{
            position: 'absolute', top: 26, right: 20, opacity: passOpacity,
            borderRadius: R.md, backgroundColor: 'rgba(36,27,51,0.88)', paddingHorizontal: 14, paddingVertical: 6,
            flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ rotate: '12deg' }],
          }}>
            <X size={20} color="#fff" strokeWidth={3} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 22, fontFamily: FONT.display, letterSpacing: 1 }}>{passLabel}</Text>
          </Animated.View>
        </Animated.View>
      </View>

      {/* botones de acción */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingBottom: 6 }}>
        <Tap haptic disabled={interactionBusy} onPress={() => settle(-1)} accessibilityLabel="Pasar"
          accessibilityState={{ busy: interactionBusy }} style={{ opacity: interactionBusy ? 0.55 : 1 }}>
          <View style={[{
            width: 60, height: 60, borderRadius: 30, backgroundColor: C.surface,
            borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
          }, SHADOW.card]}>
            <X size={26} color={C.text} strokeWidth={1.9} />
          </View>
        </Tap>
        {onUndo ? (
          <Tap disabled={interactionBusy} onPress={onUndo} accessibilityLabel="Deshacer el último swipe"
            accessibilityState={{ busy: interactionBusy }} style={{ opacity: interactionBusy ? 0.55 : 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={19} color={C.muted} strokeWidth={1.9} />
            </View>
          </Tap>
        ) : null}
        {onReset && showResetMidDeck ? (
          <Tap disabled={interactionBusy} onPress={() => { void reset(); }} accessibilityLabel="Volver a empezar"
            accessibilityState={{ busy: interactionBusy }} style={{ opacity: interactionBusy ? 0.55 : 1 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
              <RotateCcw size={19} color={C.muted} strokeWidth={1.9} />
            </View>
          </Tap>
        ) : null}
        <Tap haptic disabled={interactionBusy} onPress={() => settle(1)} accessibilityLabel={likeActionLabel}
          accessibilityState={{ busy: interactionBusy }} style={{ opacity: interactionBusy ? 0.55 : 1 }}>
          <View style={[{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, SHADOW.float]}>
            <Heart size={26} color={C.onAccent} fill={C.onAccent} strokeWidth={1.9} />
          </View>
        </Tap>
      </View>
      <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ textAlign: 'center', fontSize: 11, color: C.muted, paddingBottom: 4, fontFamily: FONT.medium }}>
        {index + 1} de {items.length} · desliza o usa los botones
      </Text>
    </View>
  );
}

// forwardRef + genéricos no combinan de forma directa en TS: se declara la
// función genérica aparte (SwipeDeckInner) y se envuelve con un cast que
// conserva el tipo genérico de cara a quien la consume. En runtime es un
// forwardRef normal.
export const SwipeDeck = forwardRef(SwipeDeckInner) as <T extends { id: string }>(
  props: Parameters<typeof SwipeDeckInner<T>>[0] & { ref?: React.Ref<SwipeDeckHandle> },
) => ReturnType<typeof SwipeDeckInner>;
