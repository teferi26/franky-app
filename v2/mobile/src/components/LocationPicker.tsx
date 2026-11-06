// Mini-mapa para fijar el punto exacto de un evento (formulario rápido).
// Toca el mapa para soltar el pin; también se puede arrastrar. Solo nativo:
// la web de Expo usa LocationPicker.web.tsx (resolución por plataforma).
import React, { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import MapView, { Marker, type MapPressEvent } from 'react-native-maps';
import { MapPin, Hand } from 'lucide-react-native';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, F } from '@/theme';

export function LocationPicker({ coords, onChange, initialCenter }: {
  coords: { latitude: number; longitude: number } | null;
  onChange: (c: { latitude: number; longitude: number }) => void;
  initialCenter?: { latitude: number; longitude: number } | null;
}) {
  const center = coords ?? initialCenter ?? { latitude: 40.2, longitude: -3.7 };
  const zoomed = Boolean(coords ?? initialCenter);
  const mapRef = useRef<MapView | null>(null);
  // Cuando el pin cambia desde fuera (geocoding por nombre, prefill de una
  // zona), acercamos el mini-mapa a ese punto. initialRegion solo aplica al
  // montar, así que sin esto el mapa no seguiría al pin.
  useEffect(() => {
    if (coords) {
      mapRef.current?.animateToRegion(
        { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    }
  }, [coords?.latitude, coords?.longitude]);
  return (
    <View style={{ borderRadius: R.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border }}>
      <MapView
        ref={mapRef}
        style={{ height: 170 }}
        initialRegion={{
          latitude: center.latitude, longitude: center.longitude,
          latitudeDelta: zoomed ? 0.02 : 8, longitudeDelta: zoomed ? 0.02 : 8,
        }}
        showsPointsOfInterest
        toolbarEnabled={false}
        onPress={(e: MapPressEvent) => onChange(e.nativeEvent.coordinate)}>
        {coords && (
          <Marker coordinate={coords} draggable
            onDragEnd={(e) => onChange(e.nativeEvent.coordinate)} />
        )}
      </MapView>
      {/* La pista va con icono suelto de trazo fino, no con emoji: se tiñe con
          el tema y se ve igual en iOS y Android. Va sobre la superficie con un
          hairline arriba, no sobre un bloque relleno. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 7,
        backgroundColor: C.surface, borderTopWidth: 0.5, borderTopColor: C.border,
        paddingHorizontal: 12, paddingVertical: 10,
      }}>
        {coords
          ? <MapPin size={13} color={C.blue} strokeWidth={1.9} />
          : <Hand size={13} color={C.muted} strokeWidth={1.9} />}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1, color: coords ? C.text : C.muted }]}>
          {coords ? 'Pin puesto: el evento saldrá exactamente aquí.' : 'Toca el mapa para marcar el punto exacto.'}
        </Text>
      </View>
    </View>
  );
}
