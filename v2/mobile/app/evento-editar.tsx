import { parseEventPrice, eventPriceMeetsPaymentMinimum } from '@/lib/event-shirt-pricing';
// ─── Editar un evento propio ─────────────────────────────────────────────
// Faltaba entera en la app: la web tiene /eventos/[id]/editar desde hace
// tiempo, pero en el móvil no había forma de cambiar NADA de un evento ya
// creado (el motivo real de "no me deja cambiar las fotos de los eventos que
// he creado yo"). La RLS ya lo permitía: "Organizers can update events"
// (001_schema.sql:727) deja al organizador actualizar su propia fila.
//
// Alcance a propósito: foto, título, tipo, descripción, ciudad, lugar y fechas.
// El PRECIO y el modo de cobro NO se tocan aquí: si ya hay entradas vendidas,
// cambiarlos por detrás rompería el desglose de lo que la gente pagó. Para eso
// está el formulario web.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  Camera, Trash2, CalendarDays, Clock, PartyPopper, BookOpen, Trophy, Drama,
  Handshake, Store, Pin, type LucideIcon,
} from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Header } from '@/components/Screen';
import { Btn, Chip, Tap, EmptyState, Skeleton } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { toast, toastError } from '@/lib/toast';
import { typeLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';
import type { EventItem } from '@/lib/types';

const CATS = ['fiesta', 'academico', 'deportivo', 'cultural', 'networking', 'feria', 'otro'];

// Icono por categoría en vez del emoji de lib/format: un emoji cambia de
// dibujo en cada sistema y no se puede teñir con el tema; un icono sí.
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};

const fechaLarga = (d: Date) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const horaCorta = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export default function EditarEvento() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [cargando, setCargando] = useState(true);
  const [denegado, setDenegado] = useState<string | null>(null);
  // Fallo de red al cargar (distinto de "no es tuyo"): se ofrece reintentar.
  const [errorCarga, setErrorCarga] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const [organizerId, setOrganizerId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('fiesta');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [venue, setVenue] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date | null>(null);
  // Reparto de camisetas (164): con esto activado, a quien se apunte se le
  // pregunta la talla y el organizador ve el recuento en la web.
  const [camisetas, setCamisetas] = useState(false);
  const [infoPayment, setInfoPayment] = useState(false);
  const [dualPrices, setDualPrices] = useState(false);
  const [withoutShirt, setWithoutShirt] = useState('');
  const [withShirt, setWithShirt] = useState('');
  // Estado al cargar: la columna solo se manda si está activa ahora o lo estaba
  // antes (para poder desactivarla). Así guardar un evento que nunca repartió
  // camisetas funciona igual aunque la 164 no esté aplicada.
  const [camisetasIniciales, setCamisetasIniciales] = useState(false);
  // Crush Live solo puede activarse en eventos oficiales; la base de datos
  // vuelve a imponer esta regla aunque se manipule el cliente.
  const [eventoOficial, setEventoOficial] = useState(false);
  const [crushLive, setCrushLive] = useState(false);
  const [picker, setPicker] = useState<null | 'startDate' | 'startTime' | 'endDate' | 'endTime'>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    // Un `return` tras router.replace no debe apagar el spinner: la pantalla
    // se está yendo y enseñar el formulario vacío un instante queda raro.
    let redirigido = false;
    try {
      if (!id) { setDenegado('No encontramos ese evento.'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { redirigido = true; router.replace('/welcome'); return; }
      const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      // Un error de red también cae aquí: se enseña como fallo con reintento,
      // no como "no encontramos ese evento".
      if (error) { setErrorCarga(true); return; }
      if (!data) { setDenegado('No encontramos ese evento.'); return; }
      const ev = data as EventItem;
      if (ev.organizer_id !== user.id) {
        setDenegado('Solo quien organiza el evento puede editarlo.');
        return;
      }
      setOrganizerId(ev.organizer_id);
      setTitle(ev.title ?? '');
      setCategory(ev.category ?? 'fiesta');
      setDescription(ev.description ?? '');
      setCity(ev.city ?? '');
      setVenue(ev.venue ?? '');
      setPhotoUrl(ev.image_url ?? null);
      setStart(ev.start_date ? new Date(ev.start_date) : new Date());
      setEnd(ev.end_date ? new Date(ev.end_date) : null);
      setCamisetas(ev.shirts_enabled === true);
      setInfoPayment(ev.payment_mode === 'info');
      setDualPrices(ev.price_without_shirt != null && ev.price_with_shirt != null);
      setWithoutShirt(String(ev.price_without_shirt ?? ev.price ?? ''));
      setWithShirt(String(ev.price_with_shirt ?? ''));
      setCamisetasIniciales(ev.shirts_enabled === true);
      setEventoOficial(ev.is_official === true);
      setCrushLive(ev.crush_live_enabled === true);
    } catch {
      // getUser o la query han lanzado (sin red): antes el spinner se quedaba
      // para siempre porque nada ponía cargando a false.
      setErrorCarga(true);
    } finally {
      if (!redirigido) setCargando(false);
    }
  }, [id, router]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Foto: al bucket `avatars` ({uid}/…, 3 MB), el mismo que usa crear-evento y
  // el formulario web. uploadPickedImage transcodifica a JPEG, así que el HEIC
  // del iPhone deja de ser un problema (ver src/lib/media.ts).
  const pickPhoto = useCallback(async () => {
    if (subiendoFoto) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSubiendoFoto(true);
    const up = await uploadPickedImage('avatars', user.id, res.assets[0], 3 * 1024 * 1024);
    setSubiendoFoto(false);
    if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
    setPhotoUrl(up.publicUrl);
  }, [subiendoFoto]);

  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    const cual = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (e.type !== 'set' || !d || !cual) return;
    const aplica = (base: Date) => {
      const out = new Date(base);
      if (cual.endsWith('Date')) out.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      else out.setHours(d.getHours(), d.getMinutes(), 0, 0);
      return out;
    };
    if (cual.startsWith('start')) setStart((prev) => aplica(prev));
    else setEnd((prev) => aplica(prev ?? start));
  };

  const guardar = async () => {
    // Validaciones sin decisión que tomar: un toast basta y no corta el flujo
    // con un modal que hay que cerrar a mano.
    if (title.trim().length < 3) { toastError('Falta el título', 'Ponle un nombre al plan (mínimo 3 letras).'); return; }
    if (city.trim().length < 2) { toastError('Falta la ciudad', '¿En qué ciudad es el evento?'); return; }
    if (venue.trim().length < 3) { toastError('Falta el lugar', 'Di dónde es exactamente: la sala, el bar, la facultad…'); return; }
    if (end && end.getTime() <= start.getTime()) {
      toastError('Hora de fin no válida', 'La hora de fin debe ser posterior al inicio.');
      return;
    }
    const useDual = infoPayment && camisetas && dualPrices;
    const without = parseEventPrice(withoutShirt), withValue = parseEventPrice(withShirt);
    if (useDual && (without === null || withValue === null || withValue < without)) { toastError('Revisa los precios', 'Indica ambos precios positivos; con camiseta no puede costar menos.'); return; }
    if (useDual && !eventPriceMeetsPaymentMinimum(without!, "info", organizerId)) { toastError("Precio mínimo", "Cada opción con pago por tarjeta debe costar al menos 0,50 €."); return; }
    setGuardando(true);
    // .select() a propósito: un update sin él devuelve ok aunque la RLS no haya
    // dejado tocar ninguna fila. Si vuelve vacío, es que no se guardó nada.
    const { data, error } = await supabase
      .from('events')
      .update({
        title: title.trim(),
        category,
        description: description.trim() || null,
        city: city.trim(),
        venue: venue.trim(),
        image_url: photoUrl,
        start_date: start.toISOString(),
        end_date: end ? end.toISOString() : null,
        ...(infoPayment ? { price_without_shirt: useDual ? without : null, price_with_shirt: useDual ? withValue : null } : {}),
        ...(camisetas || camisetasIniciales ? { shirts_enabled: camisetas } : {}),
        ...(eventoOficial ? { crush_live_enabled: crushLive } : {}),
      })
      .eq('id', id)
      .select('id');
    setGuardando(false);
    if (error || !data?.length) {
      toastError(
        'No se pudo guardar',
        error?.message ?? 'El evento no se actualizó. Comprueba que sigue siendo tuyo.',
      );
      return;
    }
    // Confirmación háptica: el cambio ya está guardado cuando la pantalla se va.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast('Cambios guardados', 'Tu evento ya se ve actualizado.');
    router.back();
  };

  // Un solo estilo de campo para toda la pantalla, con los tokens del kit
  // (superficie C.input, radio R.md y 15 px, como el resto de formularios).
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.md,
    paddingHorizontal: 14, paddingVertical: 13, minHeight: 48, fontSize: 15, color: C.text,
  } as const;

  // Rótulo de campo: F.label en todos los formularios (nada de fontWeight suelto).
  const Label = ({ children }: { children: React.ReactNode }) => (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 6 }]}>{children}</Text>
  );

  if (cargando) {
    // Esqueleto con la silueta real del formulario (foto, campos): así el salto
    // al contenido no mueve nada de sitio.
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Editar evento" back />
        <View style={{ paddingTop: S.lg }}>
          <Skeleton height={160} radius={R.lg} />
          <Skeleton height={70} radius={R.md} />
          <Skeleton height={70} radius={R.md} />
          <Skeleton height={70} radius={R.md} />
          <Skeleton height={120} radius={R.md} />
        </View>
      </View>
    );
  }

  if (errorCarga) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Editar evento" back />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState icon={CalendarDays} title="No se pudo cargar"
            subtitle="No pudimos traer tu evento. Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={cargar} />
        </View>
      </View>
    );
  }

  if (denegado) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Editar evento" back />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState icon={CalendarDays} title="Este evento no es tuyo" subtitle={denegado}
            cta="Volver" onCta={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Editar evento" subtitle={title || undefined} back />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: insets.bottom + 28, gap: 18 }}>

          <Tap onPress={pickPhoto} accessibilityLabel="Cambiar foto del evento" accessibilityHint="Abre tu galería de fotos">
            {photoUrl ? (
              <View style={{ borderRadius: R.lg, overflow: 'hidden', borderWidth: 0.5, borderColor: C.border }}>
                <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 180 }} contentFit="cover"
                  cachePolicy="memory-disk" recyclingKey={photoUrl} transition={150} />
                <View style={{ position: 'absolute', right: 10, top: 10, flexDirection: 'row', gap: 8 }}>
                  <Tap onPress={pickPhoto} accessibilityLabel="Cambiar foto" hitSlop={6}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={17} color="#fff" strokeWidth={1.9} />
                    </View>
                  </Tap>
                  <Tap onPress={() => setPhotoUrl(null)} accessibilityLabel="Quitar foto" hitSlop={6}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={17} color="#fff" strokeWidth={1.9} />
                    </View>
                  </Tap>
                </View>
              </View>
            ) : (
              <View style={{
                height: 132, borderRadius: R.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border,
                backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Camera size={24} color={C.blue} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, fontFamily: FONT.semibold, color: C.text }}>
                  {subiendoFoto ? 'Subiendo foto...' : 'Añadir foto del evento'}
                </Text>
              </View>
            )}
          </Tap>

          <View>
            <Label>¿Qué plan es?</Label>
            <TextInput value={title} onChangeText={setTitle} placeholder="Fiesta de bienvenida, quedada de pádel…"
              placeholderTextColor={C.muted} maxLength={120} style={input}
              accessibilityLabel="Título del evento" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Label>Tipo</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
              {CATS.map((c) => (
                <Chip key={c} label={typeLabel[c] ?? c} icon={CAT_ICON[c]} accessibilityRole="tab"
                  active={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          <View>
            <Label>Cuándo empieza</Label>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Tap onPress={() => setPicker('startDate')} style={{ flex: 1 }} accessibilityLabel="Cambiar el día">
                <View style={{ ...input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <CalendarDays size={17} color={C.muted} strokeWidth={1.75} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 15, color: C.text, textTransform: 'capitalize' }}>{fechaLarga(start)}</Text>
                </View>
              </Tap>
              <Tap onPress={() => setPicker('startTime')} accessibilityLabel="Cambiar la hora">
                <View style={{ ...input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Clock size={17} color={C.muted} strokeWidth={1.75} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15, color: C.text }}>{horaCorta(start)}</Text>
                </View>
              </Tap>
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Cuándo acaba (opcional)</Text>
              <Chip label={end ? 'Quitar' : 'Añadir'} active={!!end}
                onPress={() => setEnd((prev) => {
                  if (prev) return null;
                  const d = new Date(start); d.setHours(d.getHours() + 3); return d;
                })} />
            </View>
            {end ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Tap onPress={() => setPicker('endDate')} style={{ flex: 1 }} accessibilityLabel="Cambiar el día de fin">
                  <View style={{ ...input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CalendarDays size={17} color={C.muted} strokeWidth={1.75} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 15, color: C.text, textTransform: 'capitalize' }}>{fechaLarga(end)}</Text>
                  </View>
                </Tap>
                <Tap onPress={() => setPicker('endTime')} accessibilityLabel="Cambiar la hora de fin">
                  <View style={{ ...input, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Clock size={17} color={C.muted} strokeWidth={1.75} />
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15, color: C.text }}>{horaCorta(end)}</Text>
                  </View>
                </Tap>
              </View>
            ) : null}
          </View>

          <View>
            <Label>Ciudad</Label>
            <TextInput value={city} onChangeText={setCity} placeholder="Alicante"
              placeholderTextColor={C.muted} maxLength={80} style={input}
              accessibilityLabel="Ciudad" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Label>Lugar</Label>
            <TextInput value={venue} onChangeText={setVenue} placeholder="La sala, el bar, la facultad…"
              placeholderTextColor={C.muted} maxLength={120} style={input}
              accessibilityLabel="Lugar" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Label>Descripción</Label>
            <TextInput value={description} onChangeText={setDescription} multiline
              placeholder="Cuenta el plan: qué hay, para quién, qué llevar…"
              placeholderTextColor={C.muted} maxLength={2000}
              accessibilityLabel="Descripción" maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[input, { minHeight: 120, paddingTop: 13, textAlignVertical: 'top' }]} />
          </View>

          {/* Camisetas (164) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Se reparten camisetas</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>
                A quien se apunte le preguntaremos su talla. El recuento por talla lo ves
                en la lista de asistentes del evento.
              </Text>
            </View>
            <Switch value={camisetas} onValueChange={setCamisetas}
              accessibilityLabel="Repartir camisetas en este evento"
              trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
          </View>

          {infoPayment && camisetas ? <View style={{ gap: 12, padding: 14, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>Dos precios: con y sin camiseta</Text><Switch accessibilityLabel="Dos precios: con y sin camiseta" value={dualPrices} onValueChange={setDualPrices} /></View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Precios finales. El pago lo gestiona el organizador.</Text>
            {dualPrices ? <><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Sin camiseta (€)</Text><TextInput accessibilityLabel="Sin camiseta (€)" keyboardType="decimal-pad" value={withoutShirt} onChangeText={setWithoutShirt} style={{ minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: C.surface, color: C.text }} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Con camiseta (€)</Text><TextInput accessibilityLabel="Con camiseta (€)" keyboardType="decimal-pad" value={withShirt} onChangeText={setWithShirt} style={{ minHeight: 48, padding: 12, borderRadius: 10, backgroundColor: C.surface, color: C.text }} /></> : null}
          </View> : null}

          {eventoOficial ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Crush Live</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>
                  Permite que los asistentes mayores de edad participen voluntariamente,
                  descubran perfiles afines y conserven sus matches.
                </Text>
              </View>
              <Switch value={crushLive} onValueChange={setCrushLive}
                accessibilityLabel="Activar Crush Live en este evento"
                trackColor={{ true: C.accent2, false: C.border }} thumbColor={C.white} />
            </View>
          ) : null}

          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
            Las tarifas con y sin camiseta se editan aquí cuando el pago es al organizador. La venta por Stripe se gestiona desde la web: si ya hay
            gente que ha pagado, cambiarlos descuadraría lo que compraron. Para
            eso, entra desde la web.
          </Text>

          <Btn full busy={guardando} label="Guardar cambios" onPress={guardar} disabled={guardando || subiendoFoto} />
        </ScrollView>
      </KeyboardAvoidingView>

      {picker ? (
        <DateTimePicker
          value={picker.startsWith('start') ? start : (end ?? start)}
          mode={picker.endsWith('Date') ? 'date' : 'time'}
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPick}
        />
      ) : null}

      {/* En iOS el picker es en línea y no se cierra solo: botón explícito. */}
      {picker && Platform.OS === 'ios' ? (
        <View style={{ paddingHorizontal: S.lg, paddingBottom: insets.bottom + 10 }}>
          <Btn full variant="secondary" label="Listo" onPress={() => setPicker(null)} />
        </View>
      ) : null}
    </View>
  );
}
