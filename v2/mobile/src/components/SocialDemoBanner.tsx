import React from 'react';
import { Text, View } from 'react-native';
import { useSocialDemoAccess } from '@/lib/social-demo';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, FONT } from '@/theme';

export function SocialDemoBanner() {
  const access = useSocialDemoAccess();
  if (!access?.demo) return null;
  return <View accessibilityRole="summary" style={{ marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }}>Demostración aislada · personas ficticias</Text>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11, lineHeight: 16, color: C.muted }}>Prueba FOMO, Crush, chats individuales, denuncias y bloqueo. Los mensajes precargados no son respuestas de personas reales. Las funciones que no cubre esta demo se indican en cada pantalla.</Text>
  </View>;
}
