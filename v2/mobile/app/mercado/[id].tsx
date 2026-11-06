// ─── Ficha de un anuncio del mercado de estudiantes (84 y 86) ────────────
// Foto grande, descripción, precio y autor. "Contactar" abre el chat 1:1 con
// el autor (mismo flujo que el resto de la app); si el anuncio es tuyo, en su
// lugar se ofrece borrarlo (borrado lógico vía RPC).
//
// Diseño: precio como dato clave en la tipografía de cifras (F.display),
// píldoras de tipo/categoría, tarjeta del autor y una única acción principal
// fija abajo. Los errores van por toast; el borrado (destructivo) mantiene la
// confirmación nativa.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  ShoppingBag, MapPin, MessageCircle, Trash2, Tag, Search, HandHelping, BookOpen, Sofa, Bike, GraduationCap, Home, Package, Clock,
  type LucideIcon,
} from 'lucide-react-native';
import { Header } from '@/components/Screen';
import { FadeIn } from '@/components/motion';
import { Skeleton, Pill, Btn, EmptyState, Avatar, Card } from '@/components/ui';
import {
  getStudentListing, deleteStudentListing, kindLabel, categoryLabel,
  type StudentListing, type ListingKind, type ListingCategory,
} from '@/lib/market';
import { startDirectChat } from '@/lib/chat';
import { eur, timeAgo } from '@/lib/format';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const KIND_ICON: Record<ListingKind, LucideIcon> = { venta: Tag, busco: Search, ofrezco: HandHelping };
const CATEGORY_ICON: Record<ListingCategory, LucideIcon> = {
  libros: BookOpen, muebles: Sofa, transporte: Bike, clases: GraduationCap, vivienda: Home, otros: Package,
};

export default function MercadoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<StudentListing | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para "Reintentar".
  const alive = useRef(true);
  const load = useCallback(() => {
    setItem(undefined);
    getStudentListing(String(id))
      .then((v) => { if (alive.current) setItem(v); })
      .catch(() => { if (alive.current) setItem(null); });
  }, [id]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  if (item === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Anuncio" back />
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Cargando" accessibilityState={{ busy: true }}>
          <Skeleton height={280} radius={0} style={{ marginHorizontal: 0, marginBottom: S.lg }} />
          <Skeleton height={22} radius={R.full} style={{ width: '45%' }} />
          <Skeleton height={28} style={{ width: '80%' }} />
          <Skeleton height={40} style={{ width: '35%' }} />
          <Skeleton height={80} radius={R.lg} style={{ marginTop: S.md }} />
        </View>
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Anuncio" back />
        <EmptyState icon={ShoppingBag} title="No se pudo cargar"
          subtitle="Este anuncio ya no está disponible o falla tu conexión. Inténtalo de nuevo."
          cta="Reintentar" onCta={load} />
      </View>
    );
  }

  const KindIcon = KIND_ICON[item.kind] ?? Tag;
  const CatIcon = CATEGORY_ICON[item.category as ListingCategory] ?? Package;
  const price = item.price_cents != null ? eur(item.price_cents / 100) : null;

  const contact = async () => {
    setBusy(true);
    // finally: si startDirectChat lanza, el botón se quedaba girando.
    let chatId: string | null = null;
    try {
      chatId = await startDirectChat(item.author_id);
    } catch {
      chatId = null;
    } finally {
      setBusy(false);
    }
    if (!chatId) {
      toastError('No se pudo abrir el chat', 'Inicia sesión e inténtalo de nuevo.');
      return;
    }
    router.push({ pathname: '/chat/[id]', params: { id: chatId, title: item.author_name ?? '' } });
  };

  const confirmDelete = () => {
    Alert.alert('Eliminar anuncio', '¿Seguro que quieres borrar este anuncio? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          setBusy(true);
          try {
            const res = await deleteStudentListing(item.id);
            if (!res.ok) { toastError('No se pudo eliminar', 'Inténtalo de nuevo en unos segundos.'); return; }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            toast('Anuncio eliminado');
            if (router.canGoBack()) router.back(); else router.replace('/mercado');
          } catch {
            toastError('No se pudo eliminar', 'Revisa tu conexión e inténtalo de nuevo.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={kindLabel(item.kind)} subtitle={categoryLabel(item.category)} back />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        {/* Foto dentro de un marco con esquinas y hairline (nunca a sangre). */}
        <FadeIn>
          <View style={{
            width: 'auto', aspectRatio: 4 / 3, marginHorizontal: S.lg, marginTop: S.md, backgroundColor: C.input,
            borderRadius: R.xl, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150}
                accessibilityLabel={`Foto del anuncio: ${item.title}`} />
            ) : (
              <CatIcon size={56} color={C.muted} strokeWidth={1.2} />
            )}
          </View>
        </FadeIn>

        <FadeIn index={1}>
        <View style={{ padding: S.lg, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Pill label={kindLabel(item.kind)} tone={item.kind === 'venta' ? 'blue' : item.kind === 'busco' ? 'orange' : 'green'} icon={KindIcon} />
            <Pill label={categoryLabel(item.category)} icon={CatIcon} />
            {item.status !== 'activo' ? <Pill label={item.status === 'reservado' ? 'Reservado' : 'Cerrado'} tone="red" /> : null}
          </View>
          <Text maxFontSizeMultiplier={1.3} accessibilityRole="header"
            style={{ fontFamily: FONT.display, fontSize: 27, lineHeight: 31, letterSpacing: -0.9, color: C.text }}>{item.title}</Text>
          {price ? (
            <Text maxFontSizeMultiplier={1.2} style={[F.display, { fontVariant: ['tabular-nums'] }]} accessibilityLabel={`Precio: ${price}`}>{price}</Text>
          ) : (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontFamily: FONT.semibold }]}>Precio a convenir</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {item.city ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <MapPin size={14} color={C.muted} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{item.city}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={14} color={C.muted} strokeWidth={1.75} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{timeAgo(item.created_at)}</Text>
            </View>
          </View>
          {item.body ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 6 }]}>{item.body}</Text>
          ) : null}
        </View>
        </FadeIn>

        <Card style={{ marginTop: S.xs }} accessibilityLabel={`Publicado por ${item.author_name ?? 'estudiante'}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={item.author_name} uri={item.author_avatar} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{item.author_name ?? 'Estudiante'}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{item.is_mine ? 'Este anuncio es tuyo' : 'Estudiante de tu universidad'}</Text>
            </View>
            {item.is_mine ? <Pill label="Tuyo" tone="blue" /> : null}
          </View>
        </Card>
      </ScrollView>

      <View style={{
        borderTopWidth: 0.5, borderTopColor: C.borderLight, backgroundColor: C.bg,
        paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: insets.bottom + 10,
      }}>
        {item.is_mine ? (
          <Btn full variant="danger" icon={Trash2} busy={busy} label="Eliminar anuncio" onPress={confirmDelete} />
        ) : (
          <Btn full icon={MessageCircle} busy={busy} label="Contactar por chat" onPress={contact}
            accessibilityHint="Abre un chat con quien publicó el anuncio" />
        )}
      </View>
    </View>
  );
}
