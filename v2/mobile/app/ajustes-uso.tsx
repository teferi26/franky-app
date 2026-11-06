import React, { useEffect, useState } from 'react';
import { View, Text, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Home, Users, PartyPopper, Sparkles, LucideIcon } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Tap } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getIntent, setIntent, loadStoredIntent, type UserIntent } from '@/lib/intent';
import { track } from '@/lib/analytics';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, R, F } from '@/theme';

// LayoutAnimation en Android necesita este interruptor explícito; sin él el
// check de la opción elegida aparece de golpe.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Ajustes > Cómo usas Franky ──────────────────────────────────────────
// Permite cambiar más tarde la intención elegida en el onboarding
// (onboarding-intencion.tsx). Mismas cuatro opciones, mismo significado (ver
// getTabPriority en src/lib/intent.ts para el detalle de qué reordena cada
// una). Incluye además "Ver la guía otra vez", que reabre app/guia.tsx bajo
// demanda (esa pantalla no comprueba si ya se vio: solo el onboarding
// automático respeta esa marca).
const OPTIONS: { key: UserIntent; icon: LucideIcon; title: string; text: string }[] = [
  { key: 'piso', icon: Home, title: 'Busco piso o compañero', text: 'Destaca Pisos y Roomies en La Lupa.' },
  { key: 'gente', icon: Users, title: 'Conocer gente de mi uni', text: 'Prioriza el Fomo y el Crush.' },
  { key: 'planes', icon: PartyPopper, title: 'Hacer planes con mi gente', text: 'Prioriza Eventos y los planes de Ocio.' },
  { key: 'todo', icon: Sparkles, title: 'Un poco de todo', text: 'Sin prioridades: la app completa.' },
];

export default function AjustesUso() {
  const router = useRouter();
  // getIntent() puede devolver todavía el valor por defecto si nada cargó el
  // storage en esta sesión: a diferencia del tema o el idioma, el arranque de
  // la app no precarga la intención (no toco app/_layout.tsx, fuera de mi
  // alcance), así que la recargamos aquí explícitamente para no mostrar mal
  // marcada la opción activa.
  const [current, setCurrent] = useState<UserIntent>(getIntent());
  const reduceMotion = useReduceMotion();
  useEffect(() => { loadStoredIntent().then(setCurrent); }, []);

  const choose = (i: UserIntent) => {
    // La tarjeta elegida crece un pelo y saca el check: sin animación el
    // cambio pasa desapercibido porque no hay ningún otro aviso.
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrent(i);
    setIntent(i);
    track('intent_changed', { intent: i });
  };

  return (
    <Screen title="Cómo usas Franky" back>
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm }}>
          {/* TODO i18n */}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14, lineHeight: 20 }]}>
            Elige qué te interesa más: reordenamos el Inicio y La Lupa según esto. Puedes cambiarlo cuando quieras.
          </Text>
        </View>
      </FadeIn>

      {/* Opciones: iconos SUELTOS de trazo fino y la elegida marcada con el
          borde violeta, sin relleno tintado ni degradados. */}
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, gap: 10 }}>
        {OPTIONS.map((o, i) => {
          const active = current === o.key;
          return (
            <FadeIn key={o.key} index={i + 1}>
              <Tap
                onPress={() => choose(o.key)}
                haptic
                accessibilityLabel={o.title}
                accessibilityHint={o.text}
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: S.lg, paddingVertical: 15,
                  borderWidth: active ? 1.5 : 0.5, borderColor: active ? C.blue : C.border,
                }}>
                <o.icon size={22} color={active ? C.blue : C.text} strokeWidth={1.75} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginBottom: 2 }]}>
                    {o.title}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                    {o.text}
                  </Text>
                </View>
                {active ? <Check size={20} color={C.blue} strokeWidth={2.2} /> : null}
              </Tap>
            </FadeIn>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: S.lg, paddingTop: S.xl }}>
        <Btn variant="ghost" full label="Ver la guía otra vez" onPress={() => router.push({ pathname: '/guia', params: { from: 'ajustes' } })} />
      </View>
    </Screen>
  );
}
