import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { loadCardPromoState, peekCardPromoState } from '@/lib/card-promo-state';
import { isCurrentSessionIdentity } from '@/lib/session';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { ArrowRight, CreditCard } from 'lucide-react-native';
import { Tap } from '@/components/ui';
import { FONT, R, S } from '@/theme';

/**
 * Acceso destacado a la Franky Card para quien todavía no la tiene. Lleva a
 * la pantalla con los pasos, lo que incluye y la calculadora de ahorro.
 */
export function CardPromo({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  return (
    <Tap
      onPress={() => router.push('/franky-card')}
      haptic
      accessibilityRole="button"
      accessibilityLabel="Franky Card: calcula cuánto ahorras al año"
      style={[{ flexDirection: 'row', alignItems: 'center', gap: S.md, backgroundColor: '#121019', borderRadius: R.lg, padding: S.lg }, style]}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#7C4DFF', alignItems: 'center', justifyContent: 'center' }}>
        <CreditCard size={22} color="#FFFFFF" strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: '#FFFFFF' }} maxFontSizeMultiplier={1.3}>Franky Card</Text>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }} maxFontSizeMultiplier={1.3}>
          Descuentos en cafés, comidas, peluquería, gimnasio y ocio. Calcula cuánto ahorras al año.
        </Text>
      </View>
      <ArrowRight size={20} color="#FFFFFF" />
    </Tap>
  );
}

/** Igual que CardPromo, pero solo aparece si Card está activa en la cuenta y aún no eres socio. */
export function CardPromoIfEligible({ style }: { style?: StyleProp<ViewStyle> }) {
  const owner = useSessionOwner();
  // Se parte de lo último conocido para esta cuenta: la tarjeta no parpadea al
  // volver a la pestaña y la consulta solo se repite pasado un minuto.
  const known = peekCardPromoState(owner);
  const [show, setShow] = React.useState(() => !!known && known.enabled && !known.member);
  useFocusEffect(React.useCallback(() => {
    let alive = true;
    if (owner) {
      void loadCardPromoState(owner)
        .then((card) => {
          if (alive && isCurrentSessionIdentity(owner)) setShow(card.enabled && !card.member);
        })
        .catch(() => {});
    } else setShow(false);
    return () => { alive = false; };
  }, [owner]));
  return show ? <CardPromo style={style} /> : null;
}
