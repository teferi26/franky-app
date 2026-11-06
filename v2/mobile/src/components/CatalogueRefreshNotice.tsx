import React from 'react';
import { Text, View } from 'react-native';
import { Tap } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, R, S } from '@/theme';

export default function CatalogueRefreshNotice({ visible, refreshing, onRefresh }: { visible: boolean; refreshing: boolean; onRefresh: () => void }) {
  if (!visible) return null;
  // Aviso sobrio: filete y texto, sin bloque tintado que compita con la lista.
  return <View style={{ marginHorizontal: S.lg, marginVertical: 8, padding: 14, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border, gap: 6 }}>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" style={F.small}>No hemos podido actualizar esta lista. Estás viendo los últimos datos guardados.</Text>
    <Tap accessibilityLabel="Actualizar datos guardados" disabled={refreshing} onPress={onRefresh} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blue }]}>{refreshing ? 'Actualizando…' : 'Volver a actualizar'}</Text>
    </Tap>
  </View>;
}
