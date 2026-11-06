import React from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { PenSquare, ImagePlus, Flame, CalendarPlus, Camera, Home } from 'lucide-react-native';
import { OptionsSheet } from '@/components/ui';
import { publishStory } from '@/lib/social';
import { normalizeImage } from '@/lib/media';
import { WEB_URL } from '@/lib/supabase';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { t } from '@/lib/i18n';
import { ensureSocialDemoFeature, useSocialDemoAccess } from '@/lib/social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';

// Menú rápido de crear. Vive en el "+" de la cabecera del perfil (antes estaba
// en el botón central de la barra, que ahora depende de la intención de uso).
// Casi todo es navegación pura: /publicar YA permite elegir foto o vídeo (y
// escribir texto), así que "Escribir algo" y "Subir foto o vídeo" llevan al
// mismo sitio, no se duplica la lógica de subida. Se distinguen solo por el
// rótulo, para que quede claro desde el menú qué se puede hacer.
//
// Se pinta con OptionsSheet, la hoja inferior del kit: antes era un Modal a
// medida con colores fijos (#1c1c22, #F4F4F5, #8b5cf6) que no seguían el tema
// y se veía distinta al resto de menús de la app.
//
// Dos entradas NO son navegación:
//   · story   → abre la galería y publica la historia aquí mismo. Antes solo
//               navegaba al feed y dejaba a la persona buscando el botón, que
//               está en la barra de stories (src/components/StoriesBar.tsx).
//               La subida es la misma llamada (publishStory) que usa esa barra.
//   · housing → publicar un piso es un flujo de propietario que solo existe en
//               la web, así que abre el navegador. Hasta ahora en el móvil no
//               había NADA que hablara de publicar pisos.
type CreateAction =
  | { key: string; label: () => string; icon: typeof PenSquare; kind: 'route'; go: string; params?: Record<string, string> }
  | { key: string; label: () => string; icon: typeof PenSquare; kind: 'story' }
  | { key: string; label: () => string; icon: typeof PenSquare; kind: 'link'; url: string };

const CREATE_ACTIONS: CreateAction[] = [
  { key: 'fomo', label: () => t('crear.writeSomething'), icon: PenSquare, kind: 'route', go: '/publicar', params: { type: 'thread' } },
  { key: 'media', label: () => t('crear.uploadMedia'), icon: ImagePlus, kind: 'route', go: '/publicar', params: { type: 'thread' } },
  { key: 'crush', label: () => t('crear.publishCrush'), icon: Flame, kind: 'route', go: '/publicar', params: { type: 'crush' } },
  { key: 'story', label: () => t('crear.uploadStory'), icon: Camera, kind: 'story' },
  { key: 'evento', label: () => t('crear.createEvent'), icon: CalendarPlus, kind: 'route', go: '/crear-evento' },
  { key: 'housing', label: () => t('crear.publishHousing'), icon: Home, kind: 'link', url: `${WEB_URL}/negocio/registro?type=housing` },
];

export function CreateMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const demoAccess = useSocialDemoAccess();
  const router = useRouter();
  // Evita dos subidas a la vez si se toca "Subir una historia" dos veces
  // seguidas (la hoja ya está cerrada, así que el aviso va por toast).
  const uploading = React.useRef(false);

  // Misma galería y mismo endpoint que la barra de stories del feed: imagen o
  // vídeo, recorte 9:16 y 30 s como máximo. La hoja ya se ha cerrado cuando
  // esto corre (OptionsSheet cierra antes de ejecutar la opción), así que el
  // progreso se comunica con un toast en vez de un spinner dentro del menú.
  const pickAndPublishStory = async () => {
    if (uploading.current) return;
    const owner = captureSessionIdentity();
    if (!owner || !await ensureSocialDemoFeature('publicMedia') || !isCurrentSessionIdentity(owner)) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [9, 16],
      videoMaxDuration: 30,
    });
    if (!isCurrentSessionIdentity(owner) || res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const isVideo = asset.type === 'video';
    uploading.current = true;
    toastInfo('Subiendo tu historia…', isVideo ? 'Un vídeo puede tardar un poco.' : undefined);
    let out: Awaited<ReturnType<typeof publishStory>> = { ok: false, message: 'Sin conexión. Inténtalo de nuevo.' };
    try {
      // Imagen: nunca el mimeType en crudo (HEIC del iPhone rechazado en el
      // servidor); se transcodifica a JPEG igual que en la barra de stories.
      const media = isVideo
        ? { uri: asset.uri, mime: asset.mimeType ?? 'video/mp4' }
        : await normalizeImage(asset.uri, asset.width, 1440, asset.mimeType ?? 'image/jpeg');
      if (!await ensureSocialDemoFeature('publicMedia') || !isCurrentSessionIdentity(owner)) return;
      out = await publishStory(media.uri, media.mime);
    } finally {
      uploading.current = false;
    }
    if (!isCurrentSessionIdentity(owner)) return;
    if (!out.ok) { toastError(t('crear.storyErrorTitle'), out.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast('Story publicada', 'Se ve durante 24 horas.');
    // Al feed: es donde está la barra de stories, que se recarga al enfocarse
    // y ya enseña la historia recién subida.
    router.push('/(tabs)/feed');
  };

  const run = async (a: CreateAction) => {
    if ((a.key === 'story' || a.key === 'media') && !await ensureSocialDemoFeature('publicMedia')) return;
    if (a.kind === 'story') { pickAndPublishStory(); return; }
    if (a.kind === 'link') {
      Linking.openURL(a.url).catch(() => toastError(t('crear.linkErrorTitle'), t('crear.linkErrorBody')));
      return;
    }
    router.push(a.params ? { pathname: a.go as never, params: a.params } : (a.go as never));
  };

  return (
    <OptionsSheet
      visible={visible}
      title={t('crear.title')}
      onClose={onClose}
      options={CREATE_ACTIONS.map((a) => ({
        label: (a.key === 'story' || a.key === 'media') && demoAccess?.demo !== false
          ? `${a.label()} · ${demoAccess?.demo ? 'no disponible en demo' : 'comprobar disponibilidad'}` : a.label(),
        icon: a.icon, onPress: () => run(a),
      }))}
    />
  );
}
