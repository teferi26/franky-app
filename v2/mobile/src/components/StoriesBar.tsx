import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { Avatar, Tap } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { supabase } from '@/lib/supabase';
import { getActiveStoriesFor, publishStory, type StoryGroup } from '@/lib/social';
import { normalizeImage } from '@/lib/media';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, FONT } from '@/theme';
import { useSocialModerationRefresh } from '@/lib/social-moderation';
import { ensureSocialDemoFeature, useSocialDemoAccess } from '@/lib/social-demo';
import { captureSessionIdentity, isCurrentSessionIdentity } from '@/lib/session';
import { markOwnedCacheFresh, ownedCacheAge, readOwnedCache, writeOwnedCache } from '@/lib/owner-cache';

type StoriesSnapshot = { me: { id: string; name: string | null; avatar: string | null }; groups: StoryGroup[] };
const CACHE_KEY = 'stories-bar';
// Al volver a la pestaña no se repite la carga si la última tiene menos de esto.
const MIN_RELOAD_MS = 30_000;

// Barra de historias (24h) del feed: primero "Tu historia" con el
// botón de subir, después la gente a la que sigues con story activa. Acepta
// imagen y vídeo (el visor pinta el vídeo con VideoPlayer a pantalla completa).

// Burbuja de una persona. Vive FUERA del componente de la barra (y en memo)
// para que no se recree en cada render: antes se declaraba dentro y React la
// desmontaba y volvía a montar entera con cada refresco.
const Bubble = React.memo(function Bubble({ name, uri, hasRing, onPress, plus, onPressPlus, busy, label, a11y }: {
  name: string | null; uri: string | null; hasRing: boolean; onPress: () => void;
  plus?: boolean; onPressPlus?: () => void; busy?: boolean; label: string; a11y: string;
}) {
  return (
    <Tap onPress={onPress} haptic accessibilityLabel={a11y} accessibilityState={{ busy: !!busy }}>
      <View style={{ alignItems: 'center', width: 72 }}>
        <View>
          <Avatar name={name ?? 'yo'} uri={uri} size={58} ring={hasRing} />
          {busy ? (
            // Subiendo: velo sobre el avatar con el indicador, en vez de solo
            // cambiar el rótulo (que casi nadie lee).
            <View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32,
              backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center',
            }}>
              <ActivityIndicator color={C.white} />
            </View>
          ) : null}
          {plus && !busy ? (
            // Tap anidado: en RN gana el más interno, así que el + sube una
            // story nueva sin disparar el onPress de la burbuja.
            <Tap onPress={onPressPlus ?? onPress} accessibilityLabel="Subir una story nueva" hitSlop={8}>
              <View style={{
                position: 'absolute', bottom: -1, right: -1, width: 22, height: 22, borderRadius: 11,
                backgroundColor: C.blue, borderWidth: 2, borderColor: C.bg,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Plus size={13} color={C.onAccent} strokeWidth={2.4} />
              </View>
            </Tap>
          ) : null}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontSize: 11, fontFamily: FONT.medium, color: busy ? C.muted : C.text, marginTop: 5, maxWidth: 68 }}>
          {label}
        </Text>
      </View>
    </Tap>
  );
});

export function StoriesBar({ onActiveAuthors }: {
  /** Avisa de qué autores tienen story activa: el feed lo usa para pintar
   *  el anillo solo en los avatares con historia, como en Instagram. */
  onActiveAuthors?: (ids: Set<string>) => void;
}) {
  const router = useRouter();
  const demoAccess = useSocialDemoAccess();
  // Lo último conocido para ESTA cuenta se pinta al instante (sin hueco que
  // luego empuja el feed hacia abajo) y se refresca en segundo plano.
  const [initial] = useState(() => readOwnedCache<StoriesSnapshot>(captureSessionIdentity(), CACHE_KEY));
  const [groups, setGroups] = useState<StoryGroup[]>(initial?.groups ?? []);
  const [me, setMe] = useState<{ id: string; name: string | null; avatar: string | null } | null>(initial?.me ?? null);
  const [busy, setBusy] = useState(false);

  // Bandera de vida: load() se dispara al montar y en cada foco del feed; si el
  // usuario sale antes de que resuelva, no hay setState sobre un componente
  // desmontado (aviso de React y, con dos cargas cruzadas, datos de la vieja
  // pisando a la nueva).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Ref al callback del padre para que load() no cambie de identidad (y con
  // ella el useFocusEffect) cada vez que el feed se repinta.
  const onActiveAuthorsRef = useRef(onActiveAuthors);
  useEffect(() => { onActiveAuthorsRef.current = onActiveAuthors; }, [onActiveAuthors]);

  // Antes: auth.getUser (red, con el candado de auth cogido) → perfil →
  // getActiveStories (otra vez getUser → follows → stories → perfiles), todo en
  // fila, y dos veces al montar (efecto + foco). Ahora el id sale de la
  // identidad de sesión en memoria y perfil e historias van en paralelo.
  const load = useCallback(async (force = true) => {
    const owner = captureSessionIdentity();
    try {
      if (!owner) { setMe(null); setGroups([]); onActiveAuthorsRef.current?.(new Set()); return; }
      if (!force && ownedCacheAge(owner, CACHE_KEY) < MIN_RELOAD_MS) return;
      markOwnedCacheFresh(owner, CACHE_KEY);
      const [{ data: p }, nextGroups] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', owner.userId).maybeSingle(),
        getActiveStoriesFor(owner.userId),
      ]);
      if (!alive.current || !isCurrentSessionIdentity(owner)) return;
      const nextMe = { id: owner.userId, name: p?.full_name ?? null, avatar: p?.avatar_url ?? null };
      setMe(nextMe);
      setGroups(nextGroups);
      writeOwnedCache<StoriesSnapshot>(owner, CACHE_KEY, { me: nextMe, groups: nextGroups });
      onActiveAuthorsRef.current?.(new Set(nextGroups.map((g) => g.authorId)));
    } catch { /* fail-soft: la barra simplemente queda vacía */ }
  }, []);

  // Anillos del feed con lo que ya había en caché, sin esperar a la red.
  useEffect(() => {
    if (initial) onActiveAuthorsRef.current?.(new Set(initial.groups.map((g) => g.authorId)));
  }, [initial]);
  useFocusEffect(useCallback(() => { void load(false); }, [load]));
  const forceLoad = useCallback(() => { void load(true); }, [load]);
  useSocialModerationRefresh(forceLoad);

  const pickAndPublish = useCallback(async () => {
    if (busy) return;
    const owner = captureSessionIdentity();
    if (!owner || !await ensureSocialDemoFeature('publicMedia') || !isCurrentSessionIdentity(owner)) return;
    // Ahora también vídeos: el endpoint /api/stories/upload y el bucket ya los
    // aceptan, y el visor los reproduce con VideoPlayer.
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
    setBusy(true);
    let out: Awaited<ReturnType<typeof publishStory>> = { ok: false, message: 'Sin conexión. Inténtalo de nuevo.' };
    try {
      // Vídeo: el contentType lo decide el asset (mp4/quicktime). Imagen: NUNCA
      // el mimeType en crudo; el iPhone entrega HEIC y el servidor lo rechaza,
      // así que se transcodifica a JPEG (mismo motivo que en publicar.tsx).
      const media = isVideo
        ? { uri: asset.uri, mime: asset.mimeType ?? 'video/mp4' }
        : await normalizeImage(asset.uri, asset.width, 1440, asset.mimeType ?? 'image/jpeg');
      if (!await ensureSocialDemoFeature('publicMedia') || !isCurrentSessionIdentity(owner)) return;
      out = await publishStory(media.uri, media.mime);
    } finally {
      // Pase lo que pase, "Subiendo…" no puede quedarse fijo en la burbuja.
      if (alive.current) setBusy(false);
    }
    if (!alive.current || !isCurrentSessionIdentity(owner)) return;
    if (!out.ok) { toastError('No se pudo subir la story', out.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(out.review==='approved'?'Historia publicada':out.review==='rejected'?'Historia no admitida':'Historia enviada a revisión',out.review==='approved'?'Se ve durante 24 horas.':out.review==='rejected'?'El contenido incumple las normas de la comunidad.':'Se mostrará cuando supere la revisión.');
    load();
  }, [busy, load]);

  const myGroup = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);

  const onPressMine = useCallback(() => {
    // Como en IG: si ya tienes story, tocar tu burbuja la ABRE directamente;
    // subir otra es el botón + pequeño (su propio tap). Sin story, cualquier
    // toque abre la galería.
    if (!myGroup) { pickAndPublish(); return; }
    router.push(`/story/${me?.id}`);
  }, [myGroup, me?.id, pickAndPublish, router]);

  if (!me) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}
      contentContainerStyle={{ paddingHorizontal: S.md, paddingVertical: 10, gap: 10 }}>
      <Bubble name={me.name} uri={me.avatar} hasRing={Boolean(myGroup)} busy={busy}
        label={busy ? 'Subiendo…' : demoAccess?.demo ? 'Historias: no disponible' : 'Tu historia'}
        a11y={myGroup ? 'Ver tu historia' : demoAccess?.demo ? 'Historias no disponibles en demo. Ver explicación' : 'Subir una story'}
        onPress={onPressMine} plus={demoAccess?.demo === false} onPressPlus={pickAndPublish} />
      {/* Las historias de los demás entran en cascada de izquierda a derecha. */}
      {others.map((g, i) => {
        const first = (g.name ?? 'Estudiante').split(' ')[0];
        return (
          <FadeIn key={g.authorId} index={i + 1} distance={8} from="right">
            <Bubble name={g.name} uri={g.avatarUrl} hasRing label={first}
              a11y={`Ver la historia de ${g.name ?? 'Estudiante'}`}
              onPress={() => router.push(`/story/${g.authorId}`)} />
          </FadeIn>
        );
      })}
    </ScrollView>
  );
}
