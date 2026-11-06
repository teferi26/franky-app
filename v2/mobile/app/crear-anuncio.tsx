// ─── Publicar un anuncio en el mercado de estudiantes (84 y 86) ──────────
// Un solo formulario para vender algo o para pedir/ofrecer algo (tablón):
// cambia el `kind`, no la pantalla. La universidad se hereda sola del autor
// (trigger de la migración 137), así que aquí no se pide.
//
// Diseño: pantalla del kit (Screen con cabecera y volver), etiquetas en
// F.label, campos de 48 px en C.input con R.md, validación inline (título y
// precio se marcan en C.error bajo el campo al intentar enviar) y toast al
// publicar. Los fallos de red van por toast.
import React, { useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  Camera, Trash2, ImagePlus, Tag, Search, HandHelping, BookOpen, Sofa, Bike, GraduationCap, Home, Package,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { createStudentListing, KINDS, CATEGORIES, type ListingKind, type ListingCategory } from '@/lib/market';
import { toast, toastError, toastInfo } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

const KIND_ICON: Record<ListingKind, LucideIcon> = { venta: Tag, busco: Search, ofrezco: HandHelping };
const CATEGORY_ICON: Record<ListingCategory, LucideIcon> = {
  libros: BookOpen, muebles: Sofa, transporte: Bike, clases: GraduationCap, vivienda: Home, otros: Package,
};

const MIN_TITLE = 3;

// Precio en céntimos a partir de lo tecleado ("12,50" o "12.50"); null si está
// vacío y NaN si no es un número válido.
function parsePrice(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return Number.NaN;
  return Math.round(n * 100);
}

export default function CrearAnuncio() {
  const router = useRouter();
  const [kind, setKind] = useState<ListingKind>('venta');
  const [category, setCategory] = useState<ListingCategory>('otros');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Los errores se enseñan solo tras intentar publicar (no mientras se escribe).
  const [tried, setTried] = useState(false);

  const titleError = tried && title.trim().length < MIN_TITLE
    ? `Ponle un título de al menos ${MIN_TITLE} letras.` : null;
  const priceCents = parsePrice(price);
  const priceError = tried && priceCents !== null && Number.isNaN(priceCents)
    ? 'Escribe solo números, por ejemplo 12,50.' : null;

  // Imagen pública de mercado, separada de la revisión privada de FOMO.
  // La primera carpeta conserva el UID exigido por Storage.
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
    if (!user) { toastInfo('Inicia sesión', 'Necesitas una cuenta para publicar.'); return; }
    setUploadingPhoto(true);
    try {
      const up = await uploadPickedImage('avatars', `${user.id}/market`, res.assets[0], 5 * 1024 * 1024);
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
    if (title.trim().length < MIN_TITLE || (priceCents !== null && Number.isNaN(priceCents))) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setSaving(true);
    try {
      const res = await createStudentListing({
        kind, category, title: title.trim(),
        body: description.trim() || null,
        price_cents: priceCents,
        image_url: photoUrl,
        city: city.trim() || null,
      });
      if (!res.ok || !res.id) {
        toastError('No se pudo publicar', res.message ?? 'Inténtalo de nuevo en unos segundos.');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Anuncio publicado', 'Ya lo ve tu universidad.');
      router.replace(`/mercado/${res.id}`);
    } catch {
      toastError('No se pudo publicar', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const input = (error?: boolean) => ({
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: error ? C.error : C.border,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15.5, color: C.text, minHeight: 48,
  });

  const label = (text: string) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{text}</Text>
  );
  const errorText = (text: string | null) => text ? (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" style={[F.tiny, { color: C.error, marginTop: 5 }]}>{text}</Text>
  ) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Publicar anuncio" back style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.lg }}>
        {/* Foto: los anuncios con foto generan más confianza. */}
        <Tap onPress={pickPhoto} disabled={uploadingPhoto} accessibilityLabel={photoUrl ? 'Cambiar foto del anuncio' : 'Añadir foto del anuncio'}
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
          {label('Tipo de anuncio')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
            {KINDS.map((k) => (
              <Chip key={k.value} label={k.label} icon={KIND_ICON[k.value]} active={kind === k.value} onPress={() => setKind(k.value)} />
            ))}
          </View>
        </View>

        <View>
          {label('Categoría')}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }} accessibilityRole="radiogroup">
            {CATEGORIES.map((c) => (
              <Chip key={c.value} label={c.label} icon={CATEGORY_ICON[c.value]} active={category === c.value} onPress={() => setCategory(c.value)} />
            ))}
          </View>
        </View>

        <View>
          {label('Título')}
          <TextInput value={title} onChangeText={setTitle}
            placeholder="Libro de Cálculo I, busco piso en agosto, clases de inglés"
            placeholderTextColor={C.muted} maxLength={120} style={input(!!titleError)}
            accessibilityLabel="Título del anuncio" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          {errorText(titleError)}
        </View>

        <View>
          {label('Descripción (opcional)')}
          <TextInput value={description} onChangeText={setDescription}
            placeholder="Cuenta los detalles: estado, condiciones, horarios"
            placeholderTextColor={C.muted} maxLength={2000} multiline
            accessibilityLabel="Descripción del anuncio" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[input(), { minHeight: 96, textAlignVertical: 'top' }]} />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            {label('Precio (opcional)')}
            <View style={[input(!!priceError), { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 }]}>
              <TextInput value={price} onChangeText={setPrice} placeholder="Sin precio"
                placeholderTextColor={C.muted} maxLength={8} keyboardType="decimal-pad"
                accessibilityLabel="Precio en euros" maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{ flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 12 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15.5, fontFamily: FONT.semibold, color: C.muted, marginLeft: 6 }}>€</Text>
            </View>
            {errorText(priceError)}
          </View>
          <View style={{ flex: 1 }}>
            {label('Ciudad (opcional)')}
            <TextInput value={city} onChangeText={setCity} placeholder="Alicante"
              placeholderTextColor={C.muted} maxLength={80} style={input()}
              accessibilityLabel="Ciudad" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>
        </View>

        <View style={{ marginTop: 4 }}>
          <Btn full busy={saving} disabled={uploadingPhoto} label="Publicar anuncio" onPress={submit} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 10, lineHeight: 16 }]}>
            El anuncio se ve solo dentro de tu universidad. El contacto se hace por el chat de Franky.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
