// Variante web del mapa: react-native-maps es solo nativo y Metro resuelve
// los require() estáticamente, así que este archivo .web.tsx evita que el
// módulo nativo entre en el bundle de `expo start --web` (la resolución por
// plataforma elige este placeholder y nunca toca EventsMap.tsx).
import React from 'react';
import { View, Text } from 'react-native';
import { Map as MapIcon } from 'lucide-react-native';
import { C, F } from '@/theme';
import type { EventItem } from '@/lib/types';
import { MAX_FONT_SCALE } from '@/lib/a11y';

export function EventsMap(_props: { events: EventItem[] }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 }}>
      <MapIcon size={40} color={C.muted} strokeWidth={1.3} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', color: C.muted }]}>
        El mapa está disponible en la app de iOS y Android.
      </Text>
    </View>
  );
}
