// ─── Ajustes > Idioma: Automático / Español / English ────────────────────
// Mismo patrón que el interruptor de tema del perfil, pero a pantalla
// completa (Screen title back) porque aquí no comparte sitio con nada más.
// setLocalePref persiste la preferencia y notifica a onLocaleChange; hasta
// que el root layout no se suscriba (pendiente, ver el comentario final de
// src/lib/i18n.ts) el cambio se aplicará a los textos ya usan t() pero no
// forzará un remount inmediato de toda la app.
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Globe } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { NavRow } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getLocalePref, setLocalePref, t, type LocalePref } from '@/lib/i18n';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F } from '@/theme';

const OPTIONS: { value: LocalePref; label: () => string; note?: () => string }[] = [
  { value: 'auto', label: () => t('ajustesIdioma.auto'), note: () => t('ajustesIdioma.autoNote') },
  { value: 'es', label: () => t('ajustesIdioma.spanish') },
  { value: 'en', label: () => t('ajustesIdioma.english') },
];

export default function AjustesIdioma() {
  // Estado local solo para repintar el check al tocar; la preferencia real
  // vive en el módulo i18n (mismo patrón que theme-switch).
  const [pref, setPref] = useState<LocalePref>(getLocalePref());

  const choose = (value: LocalePref) => {
    Haptics.selectionAsync().catch(() => {});
    setPref(value);
    setLocalePref(value);
  };

  return (
    <Screen title={t('ajustesIdioma.title')} back>
      {/* Grupo de ajustes v3: rotulo pequeno arriba y filas separadas por una
          linea fina, sin recuadro alrededor. */}
      <FadeIn>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: S.sm }]}>
          {t('ajustesIdioma.title')}
        </Text>
        <View style={{ borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
          {OPTIONS.map((opt, i) => {
            const active = pref === opt.value;
            return (
              <View key={opt.value} style={i > 0 ? { borderTopWidth: 0.5, borderTopColor: C.borderLight } : undefined}>
                <NavRow icon={Globe} title={opt.label()} note={opt.note?.()}
                  accessibilityLabel={opt.label()}
                  onPress={() => choose(opt.value)}
                  right={active ? <Check size={20} color={C.blue} strokeWidth={2.2} /> : <View style={{ width: 20 }} />} />
              </View>
            );
          })}
        </View>
      </FadeIn>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { paddingHorizontal: S.lg, paddingTop: 14, lineHeight: 16 }]}>
        {t('ajustesIdioma.footer')}
      </Text>
    </Screen>
  );
}
