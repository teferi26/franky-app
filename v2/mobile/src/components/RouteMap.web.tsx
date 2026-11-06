// Variante web del mapa de ruta: sin react-native-maps, ofrecemos el enlace
// externo. En el móvil (RouteMap.tsx) la ruta se pinta dentro de Franky.
import React from 'react';
import { View, Text, Linking } from 'react-native';
import { Map as MapIcon } from 'lucide-react-native';
import { Btn } from '@/components/ui';
import { C, F } from '@/theme';
import { MAX_FONT_SCALE } from '@/lib/a11y';

export type Coord = { latitude: number; longitude: number };

export function RouteMap({ dest, name }: {
  initial: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  dest: Coord; name: string; line: Coord[];
}) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.latitude},${dest.longitude}`;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      <MapIcon size={40} color={C.muted} strokeWidth={1.3} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textAlign: 'center', color: C.muted }]}>
        El mapa de {name} está disponible en la app de iOS y Android. Desde el navegador lo abrimos en una pestaña nueva.
      </Text>
      <Btn label="Ver la ruta en el mapa" onPress={() => { Linking.openURL(url).catch(() => {}); }} />
    </View>
  );
}
