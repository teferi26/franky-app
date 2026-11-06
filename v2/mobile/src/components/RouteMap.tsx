// Mapa de la ruta (nativo). react-native-maps es solo iOS/Android: el
// fichero .web.tsx hermano lo sustituye en `expo start --web`, y así la
// pantalla app/ruta.tsx no tiene que duplicarse por plataforma.
import React, { useEffect, useRef } from 'react';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

export type Coord = { latitude: number; longitude: number };

export function RouteMap({ initial, dest, name, line }: {
  initial: Region; dest: Coord; name: string; line: Coord[];
}) {
  const mapRef = useRef<MapView>(null);
  // Encaja la ruta en pantalla cuando cambia.
  useEffect(() => {
    if (line.length < 2 || !mapRef.current) return;
    mapRef.current.fitToCoordinates(line, {
      edgePadding: { top: 70, right: 60, bottom: 220, left: 60 },
      animated: true,
    });
  }, [line]);
  return (
    <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initial} showsUserLocation>
      {/* Acento de marca v3 (#6D3DF0): el mapa es nativo y no lee C.*, por eso
          el color va literal aquí. */}
      <Marker coordinate={dest} title={name} pinColor="#6D3DF0" />
      {line.length > 1 ? <Polyline coordinates={line} strokeWidth={5} strokeColor="#6D3DF0" /> : null}
    </MapView>
  );
}
