import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react-native';
import { onToast, type ToastMsg } from '@/lib/toast';
import { C, FONT, R, SHADOW } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

// Host único de toasts (montado en app/_layout.tsx). Cada aviso entra desde
// arriba con un muelle, se queda ~2,6 s y se va solo. Un aviso nuevo
// reemplaza al anterior: mejor uno legible que una pila.
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const y = useRef(new Animated.Value(-120)).current;
  // Escala: el aviso entra con un muelle desde 0,94 hasta su tamaño. Da la
  // sensación de "aterrizar" en vez de deslizar plano.
  const s = useRef(new Animated.Value(0.94)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onToast((m) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    s.setValue(0.94);
    Animated.parallel([
      Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 15, bounciness: 9 }),
      Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 15, bounciness: 9 }),
    ]).start();
    timer.current = setTimeout(() => {
      Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
    }, m.kind === 'error' ? 3600 : 2600);
  }), [y, s]);

  if (!msg) return null;
  const Icon = msg.kind === 'success' ? CheckCircle2 : msg.kind === 'error' ? AlertCircle : Info;
  const tint = msg.kind === 'success' ? C.success : msg.kind === 'error' ? C.error : C.blue;
  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 9998, transform: [{ translateY: y }, { scale: s }] }}>
      <View style={[{
        flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.surface,
        borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 0.5, borderColor: C.border,
      }, SHADOW.float]}>
        <Icon size={19} color={tint} strokeWidth={1.9} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={2}>{msg.title}</Text>
          {msg.body ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, color: C.muted, marginTop: 1 }} numberOfLines={2}>{msg.body}</Text> : null}
        </View>
      </View>
    </Animated.View>
  );
}
