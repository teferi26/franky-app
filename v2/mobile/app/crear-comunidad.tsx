// ─── Crear comunidad: nombre + tipo + descripción + privacidad (56/66/85) ──
// Un solo formulario para las tres mejoras (carrera, residencia, estudio o
// afición): cambia el `kind`, no la pantalla. La universidad se hereda sola
// del creador (trigger de la migración 138), así que aquí no se pide.
//
// Diseño: pantalla del kit (Screen con cabecera y volver), etiquetas en
// F.label, campos de 48 px en C.input con R.md, validación inline (el error
// aparece bajo el campo, en C.error, al intentar enviar) y toast al crear.
// Los fallos de red van por toast: un Alert para decir "no se pudo" corta
// el ritmo y obliga a un toque extra.
import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, Trash2, Lock, GraduationCap, Building2, BookOpen, Heart, ImagePlus, type LucideIcon } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { createCommunity, KINDS, type CommunityKind } from '@/lib/communities';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

const KIND_ICON: Record<CommunityKind, LucideIcon> = {
  carrera: GraduationCap, residencia: Building2, estudio: BookOpen, aficion: Heart,
};

const MIN_NAME = 3;

export default function CrearComunidad() {
  const router = useRouter();
  const [kind, setKind] = useState<CommunityKind>('carrera');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Se enseña el error del nombre solo tras intentar enviar: marcar en rojo
  // un campo que aún no se ha tocado se siente como una bronca.
  const [tried, setTried] = useState(false);

  const nameError = tried && name.trim().length < MIN_NAME
    ? `Ponle un nombre de al menos ${MIN_NAME} letras.` : null;

  // Foto pública de comunidad en su subcarpeta, separada del staging de FOMO.
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
    if (!user) { toastInfo('Inicia sesión', 'Necesitas una cuenta para crear una comunidad.'); return; }
    setUploadingPhoto(true);
    // finally: si la subida lanza, el bloque de foto se quedaba en "Subiendo".
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

  const submit = async () => {
    setTried(true);
    if (name.trim().length < MIN_NAME) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setSaving(true);
    try {
      const res = await createCommunity({
        name: name.trim(),
        description: description.trim() || null,
        kind,
        image_url: photoUrl,
        is_private: isPrivate,
      });
      if (!res.ok || !res.id) {
        toastError('No se pudo crear', res.message ?? 'Inténtalo de nuevo en unos segundos.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Comunidad enviada a revisión', 'Se mostrará cuando comprobemos que cumple las normas.');
      router.replace(`/comunidad/${res.id}`);
    } catch {
      toastError('No se pudo crear', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const input = (error?: boolean) => ({
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: error ? C.error : C.border,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15.5, color: C.text, minHeight: 48,
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Crear comunidad" back style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.lg }}>
        {/* Foto: una comunidad con imagen genera más confianza para unirse. */}
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
                {uploadingPhoto ? 'Subiendo foto' : 'Añadir foto (opcional)'}
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
            placeholder="Ing. Informática 2026, Residencia El Prado, Cálculo I"
            placeholderTextColor={C.muted} maxLength={80} style={input(!!nameError)}
            accessibilityLabel="Nombre de la comunidad" maxFontSizeMultiplier={MAX_FONT_SCALE}
            returnKeyType="next" />
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

        <View style={{ marginTop: 4 }}>
          <Btn full busy={saving} disabled={uploadingPhoto} label="Crear comunidad" onPress={submit} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 10, lineHeight: 16 }]}>
            Entrarás como administrador. La comunidad se ve dentro de tu universidad.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
