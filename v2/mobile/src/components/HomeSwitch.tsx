import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { C, FONT, SHADOW } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

// Interruptor segmentado genérico: pinta N opciones y hace router.replace a
// la ruta de la opción pulsada (fade, sin apilar histórico). Lo reutilizan
// HomeSwitch (Fomo/Crush) y ViviendaSwitch (Pisos/Compañeros): mismo patrón
// visual y de navegación, una sola implementación.
function SegmentedSwitch<T extends string>({ active, options }: {
  active: T;
  options: { key: T; label: string; href: string }[];
}) {
  const router = useRouter();
  const go = (opt: { key: T; href: string }) => {
    if (opt.key === active) return;
    router.replace(opt.href);
  };

  return (
    // The selected surface belongs to the button itself. A separately measured
    // absolute indicator can collapse on native when its sibling has nested flex.
    <View style={{ flexDirection: 'row', backgroundColor: C.input, borderRadius: 18, padding: 4, gap: 4 }}>
      {options.map((opt) => {
        const on = active === opt.key;
        return (
          <Pressable key={opt.key} onPress={() => go(opt)} accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [{
              flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44,
              alignItems: 'center', justifyContent: 'center', borderRadius: 14,
              backgroundColor: on ? C.surface : 'transparent', opacity: pressed ? 0.75 : 1,
            }, on && SHADOW.card]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ alignSelf: 'stretch', minWidth: 0, fontSize: 15, fontFamily: on ? FONT.heading : FONT.medium, letterSpacing: -0.2, textAlign: 'center', color: on ? C.text : C.muted }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Interruptor Fomo / Crush para la pestaña "Inicio": las dos comparten una
// sola ranura en la barra y aquí se cambia de una a otra. Al pulsar la otra
// opción hace router.replace a su ruta (fade), así se siente como el mismo
// sitio cambiando de contenido, no como navegar a otra pantalla.
export function HomeSwitch({ active }: { active: 'fomo' | 'crush' }) {
  return (
    <SegmentedSwitch
      active={active}
      options={[
        { key: 'fomo', label: 'FOMO', href: '/(tabs)/feed' },
        { key: 'crush', label: 'Crush', href: '/(tabs)/crush' },
      ]}
    />
  );
}

// Interruptor Pisos / Compañeros: mismo patrón que HomeSwitch pero para las
// dos pantallas de vivienda (buscar piso vs buscar compañero de piso), para
// que cambiar de una a otra sea un toque en vez de volver atrás y entrar
// a otra pantalla.
export function ViviendaSwitch({ active }: { active: 'pisos' | 'roomie' }) {
  return (
    <SegmentedSwitch
      active={active}
      options={[
        { key: 'pisos', label: 'Pisos', href: '/pisos' },
        { key: 'roomie', label: 'Compañeros', href: '/roomie' },
      ]}
    />
  );
}
