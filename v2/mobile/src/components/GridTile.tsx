// ─── Celda de la rejilla de publicaciones ────────────────────────────────
// La usan el perfil propio, el perfil de otra persona y Guardados. Estaba
// duplicada en los tres sitios y en los tres tenía el mismo fallo: pasaba la
// URL del VÍDEO a un <Image>, que no pinta nada. El resultado era una celda
// gris con una chincheta de play diminuta, y la sensación de que el vídeo no
// estaba. Ahora el vídeo tiene su propia celda negra con el botón de play bien
// visible, para que se lea como "esto es un vídeo, tócalo" y no como un hueco.
//
// No se saca un fotograma real de miniatura a propósito: haría falta
// expo-video-thumbnails, que es un módulo nativo nuevo y obligaría a una build
// de EAS solo por esto.
//
// Va en React.memo: las rejillas se repintan al quitar un guardado o al
// cambiar de filtro y cada celda solo depende de sus 5 props.
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Play, EyeOff } from 'lucide-react-native';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, FONT, R } from '@/theme';

export const GridTile = React.memo(function GridTile({ uri, body, tile, isVideo, isAnon }: {
  uri: string | null;
  body: string | null;
  tile: number;
  isVideo: boolean;
  /** Publicación anónima: lleva el ojo tachado (solo la ve su dueño). */
  isAnon?: boolean;
}) {
  const label = isVideo ? 'Vídeo' : uri ? 'Foto' : 'Publicación de texto';
  return (
    <View accessible accessibilityLabel={body ? `${label}: ${body}` : label}
      style={{ width: tile, height: tile, backgroundColor: C.input, overflow: 'hidden' }}>
      {uri && isVideo ? (
        <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{
            width: Math.round(tile * 0.3), height: Math.round(tile * 0.3), borderRadius: tile,
            backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={Math.round(tile * 0.15)} color={C.white} fill={C.white} />
          </View>
          {body ? (
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{
              position: 'absolute', bottom: 6, left: 6, right: 6,
              fontSize: 10.5, lineHeight: 14, color: 'rgba(255,255,255,0.86)',
            }}>
              {body}
            </Text>
          ) : null}
        </View>
      ) : uri ? (
        // recyclingKey: al reciclar la celda en una rejilla larga, expo-image no
        // deja la foto anterior "colgada" mientras llega la nueva.
        <Image source={{ uri }} recyclingKey={uri} style={{ width: tile, height: tile, backgroundColor: C.input }}
          contentFit="cover" cachePolicy="memory-disk" transition={120} />
      ) : (
        // Publicación solo de texto: la celda es una "tarjeta" con el arranque
        // del texto, sobre el tinte suave de marca para que no parezca un hueco.
        <View style={{ flex: 1, padding: 8, justifyContent: 'center', backgroundColor: C.accentSoft }}>
          <Text numberOfLines={5} maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontSize: 11.5, color: C.text, lineHeight: 15.5, letterSpacing: -0.1, fontFamily: FONT.medium }}>
            {body ?? 'Publicación'}
          </Text>
        </View>
      )}
      {isVideo ? (
        <View style={{ position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.sm, padding: 3 }}>
          <Play size={11} color={C.white} fill={C.white} />
        </View>
      ) : null}
      {isAnon ? (
        <View style={{ position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: R.sm, padding: 3 }}>
          <EyeOff size={11} color={C.white} strokeWidth={1.9} />
        </View>
      ) : null}
    </View>
  );
});
