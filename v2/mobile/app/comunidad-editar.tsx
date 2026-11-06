// ─── Editar una comunidad propia ─────────────────────────────────────────
// No existía en NINGÚN sitio (ni en la app ni en la web): una vez creada la
// comunidad, su foto y su nombre eran para siempre. La RLS sí lo permitía
// ("communities_owner_update", 138_communities.sql:112), solo faltaba la
// pantalla. Mismo formulario que crear-comunidad, precargado.
//
// Diseño: idéntico al de crear (Screen, F.label, campos de 48 px, validación
// inline y toast al guardar) para que se sientan la misma pantalla.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Switch, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, Trash2, Lock, GraduationCap, Building2, BookOpen, Heart, ImagePlus, ShieldAlert, type LucideIcon } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Tap, Skeleton, EmptyState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { getCommunity, updateCommunity, KINDS, type CommunityKind } from '@/lib/communities';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

const KIND_ICON: Record<CommunityKind, LucideIcon> = {
  carrera: GraduationCap, residencia: Building2, estudio: BookOpen, aficion: Heart,
};

const MIN_NAME = 3;

export default function EditarComunidad() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [cargando, setCargando] = useState(true);
  const [denegado, setDenegado] = useState<string | null>(null);
  const [kind, setKind] = useState<CommunityKind>('carrera');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const nameError = tried && name.trim().length < MIN_NAME
    ? `Ponle un nombre de al menos ${MIN_NAME} letras.` : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) { setDenegado('No encontramos esa comunidad.'); setCargando(false); return; }
      try {
        const c = await getCommunity(id);
        if (!alive) return;
        if (!c) { setDenegado('No encontramos esa comunidad.'); return; }
        if (!c.is_mine) { setDenegado('Solo quien creó la comunidad puede editarla.'); return; }
        setKind(c.kind);
        setName(c.name);
        setDescription(c.description ?? '');
        setIsPrivate(c.is_private);
        setPhotoUrl(c.image_url);
      } catch {
        if (alive) setDenegado('No se pudo cargar la comunidad. Revisa tu conexión.');
      } finally {
        if (alive) setCargando(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // Imagen pública de comunidad: la primera carpeta es el UID del propietario.
  const pickPhoto = async () => {
    if (uploadingPhoto) return;
    let res: ImagePicker.ImagePickerResult;
    try {
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [4, 3],
      });
    } catch {
      toastError('No se pudo abrir el carrete');
      return;
    }
    if (res.canceled || !res.assets?.[0]) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toastInfo('Inicia sesión', 'Necesitas una cuenta para editar la comunidad.'); return; }
    setUploadingPhoto(true);
    try {
      const up = await uploadPickedImage('community-media', user.id, res.assets[0], 5 * 1024 * 1024);
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setPhotoUrl(up.publicUrl);
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const guardar = async () => {
    if (photoUrl && !photoUrl.includes('/ugc-approved/')) {
      toastError('Actualiza la foto', 'Vuelve a elegir la foto o quítala para que podamos revisar la comunidad.');
      return;
    }
    setTried(true);
    if (name.trim().length < MIN_NAME) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setSaving(true);
    try {
      const res = await updateCommunity(id!, {
        name: name.trim(),
        description: description.trim() || null,
        kind,
        image_url: photoUrl,
        is_private: isPrivate,
      });
      if (!res.ok) { toastError('No se pudo guardar', res.message ?? 'Inténtalo de nuevo en unos segundos.'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Cambios enviados a revisión');
      router.back();
    } catch {
      toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const input = (error?: boolean) => ({
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: error ? C.error : C.border,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15.5, color: C.text, minHeight: 48,
  });

  if (cargando) {
    return (
      <Screen title="Editar comunidad" back>
        <View style={{ paddingTop: S.lg }} accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
          <Skeleton height={170} radius={R.lg} />
          <Skeleton height={34} radius={R.full} style={{ width: '70%' }} />
          <Skeleton height={48} />
          <Skeleton height={96} />
          <Skeleton height={56} radius={R.lg} />
        </View>
      </Screen>
    );
  }

  if (denegado) {
    return (
      <Screen title="Editar comunidad" back>
        <EmptyState icon={ShieldAlert} title="No se puede editar" subtitle={denegado}
          cta="Volver" onCta={() => (router.canGoBack() ? router.back() : router.replace('/comunidades'))} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {/* Un solo CTA, al final del formulario (como en Crear comunidad y
          Publicar anuncio): antes había dos botones "Guardar" idénticos. */}
      <Screen title="Editar comunidad" back style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.lg }}>
        <Tap onPress={pickPhoto} disabled={uploadingPhoto} accessibilityLabel={photoUrl ? 'Cambiar foto de la comunidad' : 'Añadir foto de la comunidad'}
          accessibilityState={{ busy: uploadingPhoto }}>
          {photoUrl ? (
            <View style={{ borderRadius: R.lg, overflow: 'hidden', height: 170, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border }}>
              <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
              {/* Botones sobre la foto: negro translúcido sobre media (único color fijo). */}
              <View style={{ position: 'absolute', right: 10, top: 10, flexDirection: 'row', gap: 8 }}>
                <Tap onPress={pickPhoto} accessibilityLabel="Cambiar foto" hitSlop={4}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                  <Camera size={17} color="#FFFFFF" strokeWidth={1.9} />
                </Tap>
                <Tap onPress={() => setPhotoUrl(null)} accessibilityLabel="Quitar foto" hitSlop={4}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={17} color="#FFFFFF" strokeWidth={1.9} />
                </Tap>
              </View>
            </View>
          ) : (
            <View style={{
              height: 128, borderRadius: R.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border,
              backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <ImagePlus size={24} color={C.blue} strokeWidth={1.75} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold, color: C.text }]}>
                {uploadingPhoto ? 'Subiendo foto' : 'Añadir foto'}
              </Text>
            </View>
          )}
        </Tap>

        <View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Tipo de comunidad</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} icon={KIND_ICON[k.value]} active={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </View>
        </View>

        <View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Nombre</Text>
          <TextInput value={name} onChangeText={setName}
            placeholder="Ing. Informática 2026, Residencia El Prado"
            placeholderTextColor={C.muted} maxLength={80} style={input(!!nameError)}
            accessibilityLabel="Nombre de la comunidad" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          {nameError ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" style={[F.tiny, { color: C.error, marginTop: 5 }]}>{nameError}</Text>
          ) : null}
        </View>

        <View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>Descripción (opcional)</Text>
          <TextInput value={description} onChangeText={setDescription}
            placeholder="Cuenta de qué va la comunidad y quién puede unirse"
            placeholderTextColor={C.muted} maxLength={500} multiline
            accessibilityLabel="Descripción de la comunidad" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[input(), { minHeight: 96, textAlignVertical: 'top' }]} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 5, textAlign: 'right' }]}>{description.length}/500</Text>
        </View>

        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 12, minHeight: 58,
        }}>
          <Lock size={19} color={C.muted} strokeWidth={1.75} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Comunidad privada</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Solo entra quien invites. No aparece para unirse libremente.</Text>
          </View>
          <Switch value={isPrivate} onValueChange={setIsPrivate}
            accessibilityLabel="Comunidad privada"
            trackColor={{ false: C.border, true: C.blue }} thumbColor={C.white} />
        </View>

        <Btn full busy={saving} label="Guardar cambios" onPress={guardar} disabled={saving || uploadingPhoto} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
