import React from 'react';
import { View } from 'react-native';
import { Tap, Chip, T } from './ui';
import { Collapsible, FadeIn } from './motion';
import { C, R } from '@/theme';
import { SHIRT_SIZES } from '@/lib/types';
import { shirtPriceLabel, type ShirtPrices, type ShirtChoice } from '@/lib/event-shirt-pricing';

// Selector de opción y talla. Las dos opciones son superficies con hairline
// (la activa se marca con el borde y el tinte suave del acento, sin sombras
// marcadas) y la talla aparece con altura animada, no de golpe.
export default function EventShirtOptions({ prices, value, onChange, disabled = false }: { prices: ShirtPrices; value: ShirtChoice; onChange: (value: ShirtChoice) => void; disabled?: boolean }) {
  const withShirt = value !== null && value !== 'ninguna';
  return <View style={{ gap: 12 }}>
    <View>
      <T v="label">Inscripción</T>
      <T v="h2" style={{ fontSize: 19, letterSpacing: -0.4, marginTop: 4 }}>Elige tu opción</T>
    </View>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {([{ id: 'ninguna', label: 'Sin camiseta', cents: prices.withoutCents }, { id: 'with_shirt', label: 'Con camiseta', cents: prices.withCents }] as const).map((option, i) => {
        const active = option.id === 'ninguna' ? value === 'ninguna' : withShirt;
        return <FadeIn key={option.id} index={i} style={{ flex: 1 }}>
          <Tap accessibilityLabel={`${option.label}, ${shirtPriceLabel(option.cents)}`} accessibilityState={{ selected: active }} disabled={disabled} onPress={() => onChange(option.id)}
            style={{ flex: 1, minHeight: 82, padding: 14, borderRadius: R.lg, borderWidth: active ? 1 : 0.5, borderColor: active ? C.blue : C.border, backgroundColor: active ? C.accentSoft : C.surface, justifyContent: 'space-between' }}>
            <T v="label" color={active ? C.blueDeep : C.muted}>{option.label}</T>
            <T v="h2" style={{ fontSize: 20, letterSpacing: -0.5, marginTop: 6 }}>{shirtPriceLabel(option.cents)}</T>
          </Tap>
        </FadeIn>;
      })}
    </View>
    <Collapsible open={withShirt}>
      <View style={{ gap: 8, paddingTop: 4 }}>
        <T v="small">Elige la talla de tu camiseta</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {SHIRT_SIZES.filter(s => s !== 'ninguna').map(size => <Chip key={size} label={size} active={value === size} onPress={() => { if (!disabled) onChange(size); }} />)}
        </View>
      </View>
    </Collapsible>
    <T v="tiny">El pago lo gestiona el organizador. Tu opción y talla se guardan con la inscripción.</T>
  </View>;
}
