import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Users, PartyPopper, Sparkles, Check, LucideIcon } from 'lucide-react-native';
import { Btn, ProgressBar } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { setIntent, hasSeenGuide, type UserIntent } from '@/lib/intent';
import { track } from '@/lib/analytics';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F } from '@/theme';

// ─── Paso "¿para qué vas a usar Franky?" del onboarding ─────────────────────
// Cadena completa tras el registro: onboarding-intro (guía visual de 4
// pantallas) -> onboarding-perfil (uni y ciudad) -> ESTA PANTALLA -> guia
// (guía de uso paso a paso, ya personalizada con la intención elegida aquí)
// -> feed. Solo se llega hasta aquí desde un alta nueva (ver welcome.tsx,
// que solo navega a /onboarding-intro tras crear la cuenta).
//
// Al elegir, se guarda con setIntent (AsyncStorage; ver src/lib/intent.ts
// para el porqué no se guarda también en el perfil de Supabase) y se
// continúa a /guia. La intención se puede cambiar luego desde
// app/ajustes-uso.tsx.
const OPTIONS: { key: UserIntent; icon: LucideIcon; title: string; text: string }[] = [
  {
    key: 'piso', icon: Home,
    title: 'Busco piso o compañero',
    // TODO i18n
    text: 'Te destacamos primero Pisos y Roomies en La Lupa.',
  },
  {
    key: 'gente', icon: Users,
    title: 'Conocer gente de mi uni',
    text: 'Te llevamos primero al Fomo y al Crush de tu campus.',
  },
  {
    key: 'planes', icon: PartyPopper,
    title: 'Hacer planes con mi gente',
    text: 'Verás antes los Eventos y los planes de Ocio cerca de ti.',
  },
  {
    key: 'todo', icon: Sparkles,
    title: 'Un poco de todo',
    text: 'Te enseñamos la app completa, sin prioridades.',
  },
];

export default function OnboardingIntencion() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Barrera de seguridad: si este dispositivo YA vio la guía alguna vez (ya
  // completó el onboarding entero antes), no volvemos a preguntar aunque
  // algo navegue aquí de nuevo. Ver comentario de GUIDE_SEEN_KEY en intent.ts.
  const [checking, setChecking] = useState(true);
  // Opción tocada: se marca ANTES de navegar para que el usuario vea qué
  // eligió. Sin esto la pantalla saltaba en seco y la elección no se confirmaba.
  const [chosen, setChosen] = useState<UserIntent | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const seen = await hasSeenGuide();
      if (!alive) return;
      if (seen) { router.replace('/(tabs)/feed'); return; }
      setChecking(false);
    })();
    return () => { alive = false; };
  }, [router]);

  const confirm = () => {
    if (!chosen) return;
    setIntent(chosen);
    track('onboarding_intent_selected', { intent: chosen });
    router.replace('/guia');
  };

  // Mientras se comprueba la marca no pintamos nada (evita el parpadeo de
  // mostrar la pregunta un instante y saltar al feed justo después).
  if (checking) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: S.lg, paddingTop: 24, paddingBottom: 4 }}>
        {/* Paso 3 de 4 del onboarding (uni → estudios → intención → guía): el
            usuario debe ver cuánto le queda, no una pantalla suelta sin contexto. */}
        <ProgressBar value={75} height={3} style={{ marginBottom: 20 }} />
        <FadeIn>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 10 }]}>Paso 3 de 4</Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[F.h1, { fontSize: 30, lineHeight: 34, letterSpacing: -1, marginBottom: 10 }]}>
            Hagamos Franky más tuyo.
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14.5, lineHeight: 21 }]}>
            ¿Qué te trae por aquí? Elige tu punto de partida. Podrás cambiarlo cuando quieras.
          </Text>
        </FadeIn>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.lg, gap: 10 }}
        showsVerticalScrollIndicator={false}>
        {OPTIONS.map((o, i) => (
          <FadeIn key={o.key} index={i + 1}>
            <OptionCard option={o} selected={chosen === o.key} onPress={() => setChosen(o.key)} />
          </FadeIn>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: S.lg, paddingTop: 12, paddingBottom: insets.bottom + 18 }}><Btn full label="Este es mi punto de partida" disabled={!chosen} onPress={confirm} /></View>
    </View>
  );
}

function OptionCard({ option, selected, onPress }: {
  option: { key: UserIntent; icon: LucideIcon; title: string; text: string };
  selected: boolean; onPress: () => void;
}) {
  return <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={option.title} accessibilityHint={option.text} accessibilityState={{ checked: selected }}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 13, padding: 17, borderRadius: 21, borderWidth: 1.5, borderColor: selected ? C.blue : C.border, backgroundColor: selected ? C.accentSoft : C.surface, opacity: pressed ? 0.8 : 1 })}>
    <View style={{ width: 45, height: 45, borderRadius: 16, backgroundColor: selected ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}><option.icon size={23} color={selected ? C.onAccent : C.blueDeep} strokeWidth={1.7} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 17 }]}>{option.title}</Text><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{option.text}</Text></View>
    {selected ? <Check size={20} color={C.blue} /> : null}
  </Pressable>;
}
