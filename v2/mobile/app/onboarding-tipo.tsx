import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, Check, GraduationCap, type LucideIcon, Store, UsersRound, Landmark } from 'lucide-react-native';
import { Btn, Tap } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { type AccountType, setAccountType } from '@/lib/account-type';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { allowAccountPanel } from '@/pro/legacy-panel';
import { C, F, FONT, R, S } from '@/theme';

type Option = { type: AccountType; icon: LucideIcon; title: string; detail: string };

const OPTIONS: Option[] = [
  { type: 'estudiante', icon: GraduationCap, title: 'Soy estudiante', detail: 'Planes, gente de tu uni, pisos, becas y descuentos con la Franky Card.' },
  { type: 'ocio', icon: Store, title: 'Tengo un negocio', detail: 'Peluquería, cafetería, bar, restaurante, gimnasio, pádel, academia, discoteca…' },
  { type: 'vivienda', icon: Building2, title: 'Alquilo pisos o habitaciones', detail: 'Inmobiliaria o propietario particular.' },
  { type: 'comunidad', icon: UsersRound, title: 'Llevo una asociación o comunidad', detail: 'Asociaciones de estudiantes, clubes, colectivos.' },
  { type: 'universidad', icon: Landmark, title: 'Represento a una universidad', detail: 'Servicios, vicerrectorados y oficinas de estudiantes.' },
];

/**
 * Primera pregunta tras el registro: cada tipo de cuenta tiene su propia app.
 * Los estudiantes siguen a su guía; negocios, pisos, comunidades y
 * universidades van a Franky Pro.
 */
export default function OnboardingTipo() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const owner = useSessionOwner();
  const { canCreate } = useWorkspace();
  const [choice, setChoice] = useState<AccountType | null>(null);
  const [busy, setBusy] = useState(false);

  const next = async () => {
    if (!choice || !owner) return;
    setBusy(true);
    await setAccountType(owner.userId, choice);
    if (choice === 'estudiante') {
      router.replace({ pathname: '/tour', params: { next: '/onboarding-perfil' } });
      return;
    }
    if (canCreate) {
      // El alta directa de espacios está abierta para esta cuenta.
      allowAccountPanel();
      router.replace({ pathname: '/espacios', params: { onboarding: '1' } });
      return;
    }
    router.replace({ pathname: '/pro/alta', params: { grupo: choice } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + S.xl, paddingHorizontal: S.lg, paddingBottom: insets.bottom + 120, gap: S.md }}>
        <FadeIn>
          <Text style={F.label} maxFontSizeMultiplier={1.3}>Te damos la bienvenida</Text>
          <Text style={{ fontFamily: FONT.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.8, color: C.text, marginTop: S.sm }} maxFontSizeMultiplier={1.25}>
            ¿Cómo vas a usar Franky?
          </Text>
          <Text style={[F.body, { color: C.muted, marginTop: S.sm }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Cada tipo de cuenta tiene su propia app. Elige la tuya y te llevamos directamente.
          </Text>
        </FadeIn>
        {OPTIONS.map((option) => {
          const on = choice === option.type;
          const Icon = option.icon;
          return (
            <Tap
              key={option.type}
              onPress={() => setChoice(option.type)}
              haptic
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={option.title}
              style={{ flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: on ? 2 : 1, borderColor: on ? C.blue : C.border, backgroundColor: on ? C.accentSoft : C.surface }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: on ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} color={on ? '#FFFFFF' : C.text} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={F.h3} maxFontSizeMultiplier={MAX_FONT_SCALE}>{option.title}</Text>
                <Text style={F.small} maxFontSizeMultiplier={MAX_FONT_SCALE}>{option.detail}</Text>
              </View>
              {on ? <Check size={20} color={C.blue} strokeWidth={2.4} /> : null}
            </Tap>
          );
        })}
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: S.lg, paddingBottom: insets.bottom + S.lg, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.borderLight }}>
        <Btn label="Continuar" full disabled={!choice || !owner} busy={busy} onPress={() => void next()} />
      </View>
    </View>
  );
}
