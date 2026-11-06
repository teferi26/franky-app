import { parseEventPrice, eventPriceMeetsPaymentMinimum } from "../src/lib/event-shirt-pricing";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform, Modal, Switch, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Camera, Trash2, Clock, Search, Check, Gift, Banknote, Ticket, Shirt, CalendarDays, MapPin,
  PartyPopper, BookOpen, Trophy, Drama, Handshake, Store, Pin, type LucideIcon,
} from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Header } from '@/components/Screen';
import { Btn, Chip, Tap, ProgressBar } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { uploadPickedImage } from '@/lib/media';
import { LocationPicker } from '@/components/LocationPicker';
import { getCityMapSpots } from '@/lib/api';
import { centroid, norm, type MapSpot } from '@/lib/geo';
import { typeLabel } from '@/lib/format';
import { toast, toastError, toastInfo } from '@/lib/toast';
import {
  ticketBreakdown, TICKET_FEE_PCT, STRIPE_FEE_PCT, STRIPE_FEE_FIXED_CENTS, STRIPE_FEE_LABEL,
  getPayoutStatus, startPayoutsOnboarding, type PayoutStatus,
} from '@/lib/payments';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, S, F, FONT } from '@/theme';

// Creación rápida de eventos, nativa (antes solo existía el formulario web).
// Mismo insert que la web (/eventos/crear): fila en `events` con
// status=upcoming + auto-inscripción del organizador. Paridad total de cobro
// con la web (097): precio 0 = 'free'; con precio, el organizador elige entre
// 'info' (orientativo, se paga allí) y 'app' (Franky vende las entradas con
// Stripe: se teclea el NETO deseado y se publica el BRUTO con la comisión).
const CATS = ['fiesta', 'academico', 'deportivo', 'cultural', 'networking', 'feria', 'otro'];
const HOURS = ['12:00', '16:00', '18:00', '20:00', '22:00', '23:00'];

// Icono por categoría (en vez del emoji de lib/format: se tiñe y es igual en
// todos los sistemas).
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};

// ── Precio neto → bruto (paridad EXACTA con la web) ───────────────────────
// La web (src/lib/pricing.ts) guarda en events.price el BRUTO (lo que paga el
// asistente) y el organizador teclea el NETO que quiere recibir. Se replica
// aquí céntimo a céntimo reutilizando ticketBreakdown (misma comisión
// TICKET_FEE_PCT y mismo redondeo que applicationFeeCents en la web): si las
// fórmulas divergieran, el organizador cobraría distinto según desde dónde
// creó el evento.
const toCents = (eur: number) => Math.round(eur * 100);
// Neto que recibe el organizador para un bruto dado (gross - comisión redondeada).
const netFromGrossCents = (grossCents: number) => ticketBreakdown(grossCents).organizerCents;
// Inversa: el MENOR bruto que garantiza el neto pedido. Igual que la web:
// división directa de arranque y ajuste céntimo a céntimo (la comisión se
// redondea y la división puede quedarse un céntimo corta o larga).
function grossFromNetCents(netCents: number): number {
  if (netCents <= 0) return 0;
  let gross = Math.max(
    1,
    Math.ceil((netCents + STRIPE_FEE_FIXED_CENTS) / (1 - (TICKET_FEE_PCT + STRIPE_FEE_PCT) / 100)),
  );
  while (netFromGrossCents(gross) < netCents) gross++;
  while (gross > 1 && netFromGrossCents(gross - 1) >= netCents) gross--;
  return gross;
}
const money = (cents: number) =>
  `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// Borrador local (57): se guarda mientras se escribe y se ofrece restaurar al
// volver a entrar. No incluye la foto (la URL ya subida sí se guarda: no hay
// que resubir nada) ni las coordenadas exactas del mapa (se recalculan al
// buscar/tocar de nuevo, evita anclar un pin viejo si el venue cambia).
const DRAFT_KEY = 'franky.draft.crear-evento.v1';
type Draft = {
  title: string; category: string; dayKey: string; hour: string;
  endEnabled: boolean; endDayKey: string; endHour: string;
  city: string; venue: string; price: string; description: string; photoUrl: string | null;
  // Modo de cobro elegido (097). Opcional para no romper borradores viejos.
  payMode?: 'info' | 'app';
  // Reparto de camisetas (164). También opcional por lo mismo.
  camisetas?: boolean;
};

// Próximos 7 días como chips: Hoy, Mañana, y el resto con su día de semana.
function nextDays(): { key: string; label: string; date: Date }[] {
  const out = [];
  const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric' });
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      key: d.toDateString(),
      label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : fmt.format(d),
      date: d,
    });
  }
  return out;
}

// ── Piezas del formulario ─────────────────────────────────────────────────
// Rótulo de campo: mismo aspecto en todo el formulario (y que evento-editar).
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.text }}>{children}</Text>
      {hint ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{hint}</Text> : null}
    </View>
  );
}

// Cabecera de paso: número en círculo (violeta sólido cuando el paso está
// hecho), título y subtítulo. Da la sensación de recorrido, no de formulario infinito.
function StepHeader({ n, title, done, subtitle }: { n: number; title: string; done: boolean; subtitle?: string }) {
  const circle = { width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
      {done ? (
        <View style={{ ...circle, backgroundColor: C.blue }}>
          <Check size={15} color={C.onAccent} strokeWidth={2.6} />
        </View>
      ) : (
        <View style={{ ...circle, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13, fontFamily: FONT.heading, color: C.muted }}>{n}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>{title}</Text>
        {subtitle ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// Chip "Otra hora": mismo formato que Chip pero con reloj y estado activo cuando
// la hora elegida no es una de las rápidas.
function OtherHourChip({ hour, onPress, label }: { hour: string; onPress: () => void; label: string }) {
  const custom = !HOURS.includes(hour);
  return (
    <Tap onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected: custom }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34,
        backgroundColor: custom ? C.blue : C.surface, borderWidth: 0.5, borderColor: custom ? C.blue : C.border,
        borderRadius: R.full, paddingHorizontal: 13, paddingVertical: 8,
      }}>
      <Clock size={14} color={custom ? C.onAccent : C.text} strokeWidth={1.9} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: custom ? C.onAccent : C.text }}>
        {custom ? hour : 'Otra hora'}
      </Text>
    </Tap>
  );
}

export default function CrearEvento() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Prefill desde el mapa: tocar una zona de ocio → "Crear evento aquí".
  const params = useLocalSearchParams<{ venue?: string; city?: string; lat?: string; lng?: string }>();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('fiesta');
  const days = useMemo(nextDays, []);
  const [dayKey, setDayKey] = useState(days[0].key);
  const [hour, setHour] = useState('22:00');
  // Hora de fin OPCIONAL (se guarda en events.end_date). Por defecto apagada.
  // El día de fin (58) puede ser distinto al de inicio: eventos de varios días
  // (un festival, un torneo de fin de semana...) quedan bien representados.
  const [endEnabled, setEndEnabled] = useState(false);
  const [endDayKey, setEndDayKey] = useState(days[0].key);
  const [endHour, setEndHour] = useState('23:59');
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [city, setCity] = useState(params.city ?? '');
  const [venue, setVenue] = useState(params.venue ?? '');
  const [venueFocused, setVenueFocused] = useState(false);
  const [price, setPrice] = useState('');
  // Modo de cobro cuando hay precio (097): 'info' (orientativo, se paga allí)
  // o 'app' (Franky vende las entradas vía Stripe). Por defecto 'info', como
  // en la web, para no obligar a nadie a activar cobros por poner un precio.
  const [payMode, setPayMode] = useState<'info' | 'app'>('info');
  // Reparto de camisetas (164): activa la encuesta de talla al apuntarse.
  const [camisetas, setCamisetas] = useState(false);
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Punto exacto en el mapa (128). Si se llega desde una zona de ocio, el pin
  // viene puesto; si no, el mini-mapa se centra en las zonas de la ciudad.
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    params.lat && params.lng ? { latitude: Number(params.lat), longitude: Number(params.lng) } : null
  );
  const [cityCenter, setCityCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  // Zonas de ocio del catálogo de la ciudad escrita (55): sirven tanto para el
  // centroide del mini-mapa como para sugerir venues mientras se escribe.
  const [citySpots, setCitySpots] = useState<MapSpot[]>([]);
  useEffect(() => {
    if (city.trim().length < 2) { setCitySpots([]); return; }
    let alive = true;
    getCityMapSpots(city).then(({ rows }) => {
      if (!alive) return;
      setCitySpots(rows);
      if (!coords) {
        const c = centroid(rows.filter(r => r.latitude != null && r.longitude != null));
        if (c) setCityCenter(c);
      }
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);
  // Sugerencias de venue: catálogo propio filtrado por lo que se va escribiendo
  // (fail-soft: si no hay catálogo para la ciudad, simplemente no sale nada).
  const venueSuggestions = useMemo(() => {
    const q = norm(venue.trim());
    if (q.length < 2) return [];
    return citySpots.filter(sp => norm(sp.name).includes(q)).slice(0, 5);
  }, [venue, citySpots]);
  const pickVenueSuggestion = (sp: MapSpot) => {
    setVenue(sp.name);
    setCoords({ latitude: sp.latitude, longitude: sp.longitude });
    setVenueFocused(false);
    Haptics.selectionAsync().catch(() => {});
  };
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  // Selector de hora nativo (además de los chips rápidos): en Android es un
  // diálogo, en iOS un spinner inline. Se abre con "Otra hora".
  const [showTimePicker, setShowTimePicker] = useState(false);
  const onPickTime = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (e.type === 'set' && d) {
      setHour(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
  };
  const hourAsDate = () => {
    const [h, m] = (/^\d{1,2}:\d{2}$/.test(hour) ? hour : '22:00').split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  };
  const onPickEndTime = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowEndPicker(false);
    if (e.type === 'set' && d) {
      setEndHour(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    }
  };
  const endHourAsDate = () => {
    const [h, m] = (/^\d{1,2}:\d{2}$/.test(endHour) ? endHour : '23:59').split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  };
  // Si el día de inicio avanza más allá del día de fin elegido, lo sincroniza
  // (un evento no puede terminar antes de empezar).
  useEffect(() => {
    const startIdx = days.findIndex(d => d.key === dayKey);
    const endIdx = days.findIndex(d => d.key === endDayKey);
    if (startIdx !== -1 && endIdx !== -1 && endIdx < startIdx) setEndDayKey(dayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  // ── Borrador local (57) ────────────────────────────────────────────────
  // No se pisa el borrador guardado mientras aún no se ha decidido si se
  // restaura o no (draftLoadedRef evita que el efecto de autoguardado corra
  // con los valores iniciales vacíos y borre lo que había).
  const draftLoadedRef = useRef(false);
  useEffect(() => {
    // Si se llega desde el mapa con venue/city prefijados, no tiene sentido
    // ofrecer un borrador antiguo: se respeta el prefill.
    if (params.venue) { draftLoadedRef.current = true; return; }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) { draftLoadedRef.current = true; return; }
        const d: Partial<Draft> = JSON.parse(raw);
        const hasContent = (d.title && d.title.length > 0) || (d.venue && d.venue.length > 0) || (d.description && d.description.length > 0);
        if (!hasContent) { draftLoadedRef.current = true; return; }
        // Decisión con dos botones: aquí sí toca un Alert.
        Alert.alert('Tienes un borrador', '¿Quieres continuar donde lo dejaste?', [
          { text: 'Descartar', style: 'cancel', onPress: () => { AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); draftLoadedRef.current = true; } },
          {
            text: 'Continuar', onPress: () => {
              if (d.title != null) setTitle(d.title);
              if (d.category) setCategory(d.category);
              if (d.dayKey) setDayKey(d.dayKey);
              if (d.hour) setHour(d.hour);
              if (d.endEnabled != null) setEndEnabled(d.endEnabled);
              if (d.endDayKey) setEndDayKey(d.endDayKey);
              if (d.endHour) setEndHour(d.endHour);
              if (d.city != null) setCity(d.city);
              if (d.venue != null) setVenue(d.venue);
              if (d.price != null) setPrice(d.price);
              if (d.payMode === 'info' || d.payMode === 'app') setPayMode(d.payMode);
              if (typeof d.camisetas === 'boolean') setCamisetas(d.camisetas);
              if (d.description != null) setDescription(d.description);
              if (d.photoUrl) setPhotoUrl(d.photoUrl);
              draftLoadedRef.current = true;
            },
          },
        ]);
      } catch { draftLoadedRef.current = true; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const draft: Draft = { title, category, dayKey, hour, endEnabled, endDayKey, endHour, city, venue, price, payMode, camisetas, description, photoUrl };
    const t = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [title, category, dayKey, hour, endEnabled, endDayKey, endHour, city, venue, price, payMode, camisetas, description, photoUrl]);

  // Buscar el lugar por nombre y mover el pin del mini-mapa (fail-soft: si no
  // se encuentra, se marca a mano tocando el mapa).
  const searchOnMap = async () => {
    const q = [venue.trim(), city.trim()].filter(Boolean).join(', ');
    if (q.length < 3) { toastInfo('Escribe el lugar', 'Pon el nombre del sitio y la ciudad para buscarlo.'); return; }
    setGeocoding(true);
    try {
      const res = await Location.geocodeAsync(q);
      if (res && res[0]) {
        setCoords({ latitude: res[0].latitude, longitude: res[0].longitude });
        toast('Sitio encontrado', 'Revisa el pin y ajústalo si hace falta.');
      } else {
        toastInfo('No encontrado', 'Marca el punto a mano tocando el mapa.');
      }
    } catch {
      toastError('No se pudo buscar', 'Marca el punto a mano tocando el mapa.');
    } finally {
      setGeocoding(false);
    }
  };

  // Foto del evento: al bucket `avatars` ({uid}/..., 3MB), el mismo que usa
  // el formulario web de eventos. Se sube al elegirla, con vista previa.
  const pickPhoto = async () => {
    if (uploadingPhoto) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUploadingPhoto(true);
    try {
      const up = await uploadPickedImage('avatars', user.id, res.assets[0], 3 * 1024 * 1024);
      if (!up.ok) { toastError('No se pudo subir la foto', up.message); return; }
      setPhotoUrl(up.publicUrl);
    } catch {
      toastError('No se pudo subir la foto', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Ciudad por defecto: la del perfil (si no llegó del mapa).
  useEffect(() => {
    if (params.city) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('city').eq('id', user.id).maybeSingle();
        if (data?.city) setCity((prev) => prev || data.city);
      } catch { /* sin red: la ciudad se escribe a mano */ }
    })();
  }, [params.city]);

  // Día y hora ya validados y calculados (usados por la validación y por la
  // previsualización, para no repetir la lógica).
  const day = days.find((d) => d.key === dayKey) ?? days[0];
  const endDay = days.find((d) => d.key === endDayKey) ?? day;

  // Precio y modo de cobro, derivados una sola vez (los usan el formulario,
  // la previsualización y el insert, para que no puedan divergir entre sí).
  const parsedPrice = parseEventPrice(price, { allowFree: true, max: 9999 });
  const typedPrice = parsedPrice ?? 0;
  // Con venta de entradas, lo tecleado es el NETO que quiere el organizador.
  const isTicketed = typedPrice > 0 && payMode === 'app';
  const grossCents = isTicketed ? grossFromNetCents(toCents(typedPrice)) : 0;
  const breakdown = isTicketed ? ticketBreakdown(grossCents) : null;

  // ── Progreso del formulario ──────────────────────────────────────────────
  // Cada paso se da por hecho cuando lo obligatorio de ese paso está relleno.
  // La barra de arriba resume cuánto queda y qué falta.
  const stepDone = {
    plan: title.trim().length >= 3,
    cuando: /^\d{1,2}:\d{2}$/.test(hour.trim()),
    donde: city.trim().length >= 2 && venue.trim().length >= 3,
    precio: parsedPrice !== null,
    extras: true,
  };
  const doneCount = Object.values(stepDone).filter(Boolean).length;
  const progress = Math.round((doneCount / 5) * 100);
  const falta = [
    !stepDone.plan ? 'el título' : null,
    !stepDone.precio ? 'un precio válido' : null,
    !stepDone.donde ? (city.trim().length < 2 ? 'la ciudad' : 'el lugar') : null,
  ].filter(Boolean);

  // ── Cuenta de cobros (Stripe Connect) ──────────────────────────────────
  // Vender entradas exige tenerla activa. Se consulta en cuanto el organizador
  // elige "Vender entradas en Franky" para decirle en qué punto está de verdad
  // (y poder activarla aquí mismo) en vez de mandarle a la web tras publicar.
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | 'loading'>('loading');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const payoutCheckedRef = useRef(false);
  useEffect(() => {
    if (!isTicketed || payoutCheckedRef.current) return;
    payoutCheckedRef.current = true;
    getPayoutStatus().then(setPayoutStatus).catch(() => setPayoutStatus('unknown'));
  }, [isTicketed]);
  const activarCobros = async () => {
    setPayoutBusy(true);
    try {
      const r = await startPayoutsOnboarding();
      if (!r.ok) {
        toastError('Cuenta de cobros', r.error ?? 'Inténtalo de nuevo en unos minutos.');
      } else {
        // Al cerrar el navegador in-app: releer el estado (Stripe puede tardar en
        // activar la cuenta, así que puede seguir en "pendiente").
        setPayoutStatus(await getPayoutStatus());
      }
    } catch {
      toastError('Cuenta de cobros', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setPayoutBusy(false);
    }
  };

  // Valida el formulario (mismos avisos de siempre, ahora como toast) y, si
  // todo está bien, abre la previsualización (59) en vez de publicar directamente.
  const openPreview = () => {
    if (!eventPriceMeetsPaymentMinimum(isTicketed ? grossCents / 100 : typedPrice, payMode, "")) { toastError("Precio mínimo", "El precio final del pago con tarjeta debe ser de al menos 0,50 €."); return; }
    if (parsedPrice === null) { toastError("Precio no válido", "Usa un importe entre 0 y 9999 €, con un máximo de 2 decimales. Puedes usar coma o punto."); return; }
    if (title.trim().length < 3) { toastError('Falta el título', 'Ponle un nombre al plan (mínimo 3 letras).'); return; }
    if (city.trim().length < 2) { toastError('Falta la ciudad', '¿En qué ciudad es el evento?'); return; }
    // El lugar es OBLIGATORIO: un evento sin sitio concreto no sirve de nada
    // (y sin venue el mapa no puede anclarlo a su zona).
    if (venue.trim().length < 3) { toastError('Falta el lugar', 'Di dónde es exactamente: la sala, el bar, la facultad... La gente tiene que saber dónde ir.'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(hour.trim())) { toastError('Hora no válida', 'Usa el formato HH:MM, por ejemplo 22:30.'); return; }

    const [h, m] = hour.trim().split(':').map(Number);
    const start = new Date(day.date);
    start.setHours(h, m, 0, 0);
    if (start.getTime() < Date.now() - 60_000) {
      toastError('Esa hora ya ha pasado', 'Elige una hora de hoy que aún no haya pasado, u otro día.');
      return;
    }
    if (endEnabled) {
      const [eh, em] = (/^\d{1,2}:\d{2}$/.test(endHour) ? endHour : '23:59').split(':').map(Number);
      const end = new Date(endDay.date);
      end.setHours(eh, em, 0, 0);
      if (end.getTime() <= start.getTime()) {
        toastError('Hora de fin no válida', 'La hora de fin debe ser posterior al inicio (elige otro día u otra hora).');
        return;
      }
    }
    setPreviewOpen(true);
  };

  const submit = async () => {
    if (parsedPrice === null) { toastError("Precio no válido", "Revisa el importe antes de publicar."); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPreviewOpen(false); router.push('/welcome'); return; }

      // Fecha: día elegido + hora, en la zona horaria del dispositivo (España
      // para nuestro público; la web usa Europe/Madrid explícito).
      const [h, m] = hour.trim().split(':').map(Number);
      const start = new Date(day.date);
      start.setHours(h, m, 0, 0);

      // Fecha/hora de fin opcional: puede ser un día distinto al de inicio (58),
      // para planes de varios días (festivales, torneos de fin de semana...).
      let endIso: string | null = null;
      if (endEnabled) {
        const [eh, em] = (/^\d{1,2}:\d{2}$/.test(endHour) ? endHour : '23:59').split(':').map(Number);
        const end = new Date(endDay.date);
        end.setHours(eh, em, 0, 0);
        endIso = end.toISOString();
      }

      // Igual que la web: con venta de entradas se publica el BRUTO (neto que
      // pidió el organizador + comisión Franky); en el resto, lo tecleado tal
      // cual. payment_mode: 'free' si el precio es 0, si no el modo elegido.
      const publishedPrice = isTicketed ? grossCents / 100 : typedPrice;
      if (!eventPriceMeetsPaymentMinimum(publishedPrice, payMode, user.id)) { setPreviewOpen(false); toastError("Precio mínimo", "El precio final del pago con tarjeta debe ser de al menos 0,50 €."); return; }
      const basePayload = {
          title: title.trim(),
          description: description.trim() || null,
          organizer_id: user.id,
          city: city.trim(),
          venue: venue.trim(),
          start_date: start.toISOString(),
          end_date: endIso,
          category,
          price: publishedPrice,
          payment_mode: typedPrice > 0 ? payMode : 'free',
          // Igual que en la web: solo viaja si se activa, para no depender de que
          // la migración 164 esté aplicada para poder publicar un evento normal.
          ...(camisetas ? { shirts_enabled: true } : {}),
          image_url: photoUrl,
          photos: photoUrl ? [photoUrl] : [],
          status: 'upcoming',
      };
      let { data, error } = await supabase
        .from('events')
        .insert({ ...basePayload, latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null })
        .select('id')
        .single();
      // Migración 128 sin aplicar: reintenta sin coordenadas antes que fallar.
      if (error && /latitude|longitude|column/i.test(error.message)) {
        ({ data, error } = await supabase.from('events').insert(basePayload).select('id').single());
      }

      if (error || !data) {
        toastError('No se pudo crear', 'Inténtalo de nuevo en unos segundos.');
        return;
      }
      // Auto-inscripción del organizador. El CHECK de event_participants solo
      // admite 'registered'/'attended'/'cancelled', así que el organizador se
      // apunta como 'registered' (con 'confirmed' la fila se rechazaba en
      // silencio y no contaba entre los asistentes).
      await supabase.from('event_participants').insert({
        event_id: data.id, user_id: user.id, status: 'registered',
      }).then(() => {}, () => {});

      setPreviewOpen(false);
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {}); // borrador limpio al publicar con éxito
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Evento publicado', 'Ya está visible para todo el mundo.');
      router.replace(`/evento/${data.id}`);
    } catch {
      toastError('No se pudo crear', 'Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Estilo único de input en todo el formulario (y el mismo que evento-editar).
  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
    fontSize: 15, color: C.text,
  } as const;

  // Texto de fecha/hora legible para la previsualización.
  const dateSummary = endEnabled
    ? (endDayKey === dayKey ? `${day.label} · ${hour} a ${endHour}` : `${day.label} ${hour} hasta ${endDay.label} ${endHour}`)
    : `${day.label} · ${hour}`;

  const CatIcon = CAT_ICON[category] ?? Pin;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Crear evento" back onBack={() => router.back()} subtitle={`${doneCount} de 5 pasos listos`} />
      {/* Barra de progreso: siempre visible bajo la cabecera */}
      <View style={{ paddingHorizontal: S.lg, paddingTop: 10, paddingBottom: 6, gap: 6 }}>
        <ProgressBar value={progress} height={5} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
          {falta.length === 0 ? 'Todo listo: revisa y publica cuando quieras.' : `Falta ${falta.join(' y ')}.`}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: insets.bottom + 28, gap: 14 }}>

          {/* ── Paso 1: el plan ── */}
          <StepHeader n={1} title="El plan" done={stepDone.plan} subtitle="Foto, nombre y tipo" />

          {/* Foto del evento: los planes con foto se tocan mucho más. */}
          <Tap onPress={pickPhoto} accessibilityLabel={photoUrl ? 'Cambiar foto del evento' : 'Añadir foto del evento'} haptic={false}>
            {photoUrl ? (
              <View style={{ borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.border }}>
                <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 170 }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                <View style={{ position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 8 }}>
                  <Tap hitSlop={8} onPress={pickPhoto} accessibilityLabel="Cambiar foto"
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={16} color="#fff" strokeWidth={2.2} />
                  </Tap>
                  <Tap hitSlop={8} onPress={() => setPhotoUrl(null)} accessibilityLabel="Quitar foto"
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={16} color="#fff" strokeWidth={2.2} />
                  </Tap>
                </View>
              </View>
            ) : (
              <View style={{
                height: 128, borderRadius: R.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border,
                backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Camera size={24} color={C.blue} strokeWidth={1.75} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13.5, fontFamily: FONT.semibold, color: C.text }}>
                  {uploadingPhoto ? 'Subiendo foto...' : 'Añadir foto del evento'}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Opcional, pero los planes con foto se tocan más</Text>
              </View>
            )}
          </Tap>

          <View>
            <Label>¿Qué plan es?</Label>
            <TextInput value={title} onChangeText={setTitle} placeholder="Fiesta de bienvenida, quedada de pádel..."
              placeholderTextColor={C.muted} maxLength={120} style={input} accessibilityLabel="Título del evento" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Label>Tipo</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
              {CATS.map((c) => (
                <Chip key={c} label={typeLabel[c] ?? c} icon={CAT_ICON[c]}
                  active={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>

          {/* ── Paso 2: cuándo ── */}
          <StepHeader n={2} title="Cuándo" done={stepDone.cuando} subtitle="Día y hora de inicio, fin opcional" />

          <View>
            <Label>Día</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: S.lg }}>
              {days.map((d) => (
                <Chip key={d.key} label={d.label} active={dayKey === d.key} onPress={() => setDayKey(d.key)} accessibilityRole="tab" />
              ))}
            </ScrollView>
          </View>

          <View>
            <Label>Hora</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
              {HOURS.map((hh) => (
                <Chip key={hh} label={hh} active={hour === hh} onPress={() => setHour(hh)} accessibilityRole="tab" />
              ))}
              <OtherHourChip hour={hour} label="Elegir otra hora" onPress={() => setShowTimePicker(true)} />
            </View>
            {showTimePicker && (
              <DateTimePicker
                value={hourAsDate()} mode="time" is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onPickTime}
              />
            )}
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Label hint="opcional">Fin o varios días</Label>
              <Chip label={endEnabled ? 'Quitar' : 'Añadir'} active={endEnabled} onPress={() => setEndEnabled(v => !v)} />
            </View>
            {endEnabled && (
              <View style={{ gap: 8, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, padding: 12 }}>
                {/* Día de fin (58): por defecto el mismo día, pero puede ser
                    otro distinto para eventos de varios días (solo se pueden
                    elegir días desde el de inicio en adelante). */}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Termina el día</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {days.filter((_, i) => i >= days.findIndex(d => d.key === dayKey)).map((d) => (
                    <Chip key={d.key} label={d.label} active={endDayKey === d.key} onPress={() => setEndDayKey(d.key)} accessibilityRole="tab" />
                  ))}
                </ScrollView>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>A las</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 8 }}>
                  {HOURS.map((hh) => (
                    <Chip key={hh} label={hh} active={endHour === hh} onPress={() => setEndHour(hh)} accessibilityRole="tab" />
                  ))}
                  <OtherHourChip hour={endHour} label="Elegir otra hora de fin" onPress={() => setShowEndPicker(true)} />
                </View>
              </View>
            )}
            {showEndPicker && (
              <DateTimePicker
                value={endHourAsDate()} mode="time" is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onPickEndTime}
              />
            )}
          </View>

          {/* ── Paso 3: dónde ── */}
          <StepHeader n={3} title="Dónde" done={stepDone.donde} subtitle="Ciudad, lugar y punto en el mapa" />

          <View>
            <Label>Ciudad</Label>
            <TextInput value={city} onChangeText={setCity} placeholder="Alicante"
              placeholderTextColor={C.muted} maxLength={80} style={input} accessibilityLabel="Ciudad" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          <View>
            <Label>Lugar</Label>
            <TextInput value={venue} onChangeText={setVenue}
              onFocus={() => setVenueFocused(true)}
              onBlur={() => setTimeout(() => setVenueFocused(false), 150)}
              placeholder="La sala, el bar, la facultad... ¿dónde hay que ir?"
              placeholderTextColor={C.muted} maxLength={120} style={input} accessibilityLabel="Lugar del evento" maxFontSizeMultiplier={MAX_FONT_SCALE} />
            {/* Sugerencias del catálogo propio de zonas de ocio (55): al elegir
                una, se rellenan nombre + coordenadas exactas automáticamente. */}
            {venueFocused && venueSuggestions.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: R.md, marginTop: 6, overflow: 'hidden', backgroundColor: C.surface }}>
                {venueSuggestions.map((sp, i) => (
                  <Tap key={sp.id} onPress={() => pickVenueSuggestion(sp)} accessibilityLabel={`Usar ${sp.name}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48, borderBottomWidth: i === venueSuggestions.length - 1 ? 0 : 0.5, borderBottomColor: C.borderLight }}>
                      <MapPin size={15} color={C.blue} strokeWidth={2} />
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{sp.name}</Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{sp.tagline || sp.city || 'Del catálogo de Franky'}</Text>
                      </View>
                    </View>
                  </Tap>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>
                Búscalo por nombre o marca el punto a mano en el mapa.
              </Text>
              <Btn small variant="secondary" icon={Search} busy={geocoding} label="Buscar en el mapa" onPress={searchOnMap} />
            </View>
          </View>

          <LocationPicker coords={coords} onChange={setCoords} initialCenter={cityCenter} />

          {/* ── Paso 4: precio ── */}
          <StepHeader n={4} title="Precio" done={stepDone.precio} subtitle="Gratis, se paga allí, o entradas por Franky" />

          <View>
            {/* Con venta de entradas, lo que se teclea es el NETO del organizador. */}
            <Label hint={isTicketed ? 'neto, sin comisión' : 'deja vacío si es gratis'}>{isTicketed ? 'Tú recibes (€)' : 'Precio (€)'}</Label>
            <TextInput value={price} onChangeText={setPrice} placeholder="Gratis"
              placeholderTextColor={C.muted} maxLength={6} keyboardType="decimal-pad" style={input}
              accessibilityLabel="Precio en euros" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          {/* Modo de cobro (097): solo aparece cuando hay precio. Tres opciones,
              como en la web: gratis (deja el precio a 0), precio orientativo
              que se paga allí, o venta de entradas por Franky (Stripe). */}
          {typedPrice > 0 && (
            <View>
              <Label>¿Cómo se cobra?</Label>
              <View style={{ gap: 8 }}>
                {([
                  {
                    key: 'gratis' as const, icon: Gift,
                    title: 'Gratis',
                    desc: 'El plan no cuesta nada. Toca aquí para dejar el precio a 0.',
                    active: false,
                    onPress: () => setPrice(''),
                  },
                  {
                    key: 'info' as const, icon: Banknote,
                    title: 'Se paga allí (precio orientativo)',
                    desc: 'La gente se apunta gratis y paga en el sitio (o por Bizum). No necesitas activar cobros.',
                    active: payMode === 'info',
                    onPress: () => setPayMode('info'),
                  },
                  {
                    key: 'app' as const, icon: Ticket,
                    title: 'Vender entradas en Franky',
                    desc: `Franky cobra las entradas (con QR) y te transfiere el dinero. Comisión del ${TICKET_FEE_PCT}% más los gastos de pago con tarjeta de Stripe (${STRIPE_FEE_LABEL}), que se suman al precio: tú recibes justo lo que pidas.`,
                    active: payMode === 'app',
                    onPress: () => setPayMode('app'),
                  },
                ]).map((opt) => (
                  <Tap key={opt.key} onPress={opt.onPress} accessibilityLabel={opt.title} accessibilityHint={opt.desc}
                    accessibilityState={{ selected: opt.active }}
                    style={{
                      flexDirection: 'row', gap: 12, alignItems: 'flex-start',
                      borderWidth: opt.active ? 1.5 : 1,
                      borderColor: opt.active ? C.blue : C.border,
                      backgroundColor: opt.active ? C.accentSoft : C.surface,
                      borderRadius: R.lg, paddingHorizontal: 12, paddingVertical: 12,
                    }}>
                    <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: opt.active ? C.blue : C.input, alignItems: 'center', justifyContent: 'center' }}>
                      <opt.icon size={17} color={opt.active ? C.onAccent : C.muted} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, opt.active && { color: C.blueDeep }]}>{opt.title}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2, lineHeight: 16 }]}>{opt.desc}</Text>
                    </View>
                  </Tap>
                ))}
              </View>

              {/* Desglose transparente (igual que la web): neto pedido, comisión
                  y precio final. El evento se publica con el BRUTO. */}
              {isTicketed && breakdown && (
                <View style={{ marginTop: 8, borderRadius: R.lg, padding: 14, gap: 6, backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>El asistente pagará</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 20, fontFamily: FONT.display, color: C.blue }}>{money(grossCents)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Comisión Franky ({breakdown.feePct}%)</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>-{money(breakdown.feeCents)}</Text>
                  </View>
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between',
                    borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6,
                  }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Tú recibes por entrada</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 14, fontFamily: FONT.heading, color: C.text }}>{money(breakdown.organizerCents)}</Text>
                  </View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>
                    El evento se publicará a {money(grossCents)} por entrada: es lo que verá la gente al apuntarse.
                  </Text>
                </View>
              )}

              {/* Vender entradas exige una cuenta de cobros (Stripe Connect).
                  Se dice el estado REAL de la cuenta y se puede activar aquí
                  mismo, sin publicar nada primero: antes el aviso mandaba a la
                  web "después de publicar el evento" y se leía como un círculo
                  vicioso. */}
              {isTicketed && (
                <View style={{
                  marginTop: 8, borderRadius: R.lg, padding: 12, gap: 8,
                  backgroundColor: payoutStatus === 'active' ? `${C.success}14` : C.accentSoft,
                }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.text, lineHeight: 16 }]}>
                    {payoutStatus === 'loading'
                      ? 'Comprobando tus cobros...'
                      : payoutStatus === 'active'
                      ? 'Tus cobros están activos: recibirás el dinero de cada entrada vendida (menos la comisión). Los ingresos los ves en la Cartera.'
                      : payoutStatus === 'pending'
                      ? 'Ya empezaste el alta y Stripe está verificando tu cuenta. Puedes publicar igualmente: las entradas se pondrán a la venta en cuanto la activen.'
                      : 'Para vender entradas necesitas una cuenta de cobros (la gestiona Stripe: nombre, DNI e IBAN, unos minutos). Puedes activarla ahora o después de publicar; hasta que esté activa, el evento se ve pero nadie puede comprar entradas.'}
                  </Text>
                  {(payoutStatus === 'none' || payoutStatus === 'pending' || payoutStatus === 'unknown') && (
                    <Btn
                      label={payoutStatus === 'pending' ? 'Continuar en Stripe' : 'Activar mis cobros'}
                      variant="secondary"
                      small
                      busy={payoutBusy}
                      onPress={activarCobros}
                    />
                  )}
                </View>
              )}
            </View>
          )}

          {/* ── Paso 5: extras ── */}
          <StepHeader n={5} title="Extras" done={stepDone.extras} subtitle="Descripción y camisetas, opcionales" />

          <View>
            <Label hint="opcional">Descripción</Label>
            <TextInput value={description} onChangeText={setDescription}
              placeholder="Cuenta el plan en dos líneas" placeholderTextColor={C.muted}
              maxLength={2000} multiline style={[input, { minHeight: 84, textAlignVertical: 'top' }]}
              accessibilityLabel="Descripción" maxFontSizeMultiplier={MAX_FONT_SCALE} />
          </View>

          {/* Camisetas (164): activa la encuesta de talla al apuntarse */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Shirt size={17} color={C.blue} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Se reparten camisetas</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { lineHeight: 16 }]}>
                A quien se apunte le preguntaremos su talla (XS a XXL, o si no quiere).
                Verás cuántas llevar de cada talla en la lista de asistentes.
              </Text>
            </View>
            <Switch value={camisetas} onValueChange={setCamisetas} accessibilityLabel="Se reparten camisetas"
              trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
          </View>

          <View style={{ marginTop: 6 }}>
            <Btn full label="Previsualizar y publicar" onPress={openPreview} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center', marginTop: 8 }]}>
              Con precio 0 el plan es gratis. Si pones precio, elige si se paga
              allí o si vendes las entradas por Franky.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Previsualización antes de publicar (59): mismo aspecto que tendrá el
          evento, con opción de volver a editar o confirmar. */}
      <Modal visible={previewOpen} transparent animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => (saving ? null : setPreviewOpen(false))}
          accessibilityLabel="Cerrar previsualización" accessibilityRole="button" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '86%', paddingBottom: insets.bottom + 10 }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border }} />
          </View>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { textAlign: 'center', paddingVertical: 12 }]}>Así se verá tu evento</Text>
          <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 16 }}>
            {/* Igual que la ficha: foto en marco y el titular DEBAJO, no encima. */}
            <View style={{ borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input, height: 170, borderWidth: 0.5, borderColor: C.border }}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <CatIcon size={48} color={C.muted} strokeWidth={1.2} />
                </View>
              )}
            </View>
            <View style={{ gap: 8, marginTop: 14, marginBottom: 14 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
                borderRadius: R.full, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: 10, paddingVertical: 4.5,
              }}>
                <CatIcon size={12} color={C.text} strokeWidth={1.9} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 11.5, fontFamily: FONT.semibold }}>{typeLabel[category] ?? category}</Text>
              </View>
              <Text maxFontSizeMultiplier={1.3} style={{ color: C.text, fontFamily: FONT.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.9 }} numberOfLines={3}>{title.trim()}</Text>
            </View>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CalendarDays size={16} color={C.blue} strokeWidth={2} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { textTransform: 'capitalize' }]}>{dateSummary}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} color={C.blue} strokeWidth={2} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>{venue.trim()}{city.trim() ? `, ${city.trim()}` : ''}</Text>
              </View>
              {/* El precio refleja el modo de cobro: entradas por Franky (bruto
                  publicado + neto del organizador), orientativo, o gratis. */}
              {isTicketed ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Ticket size={16} color={C.blue} strokeWidth={2} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Entradas a {money(grossCents)} en Franky</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>
                      Tú recibes {money(breakdown?.organizerCents ?? 0)} por entrada (comisión del {TICKET_FEE_PCT}%, {money(breakdown?.frankyCents ?? 0)}, y gastos de Stripe, {money(breakdown?.stripeCents ?? 0)}, ya incluidos)
                    </Text>
                  </View>
                </View>
              ) : typedPrice > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Banknote size={16} color={C.blue} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{price.trim()} € (se paga allí)</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Gift size={16} color={C.success} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.success, fontFamily: FONT.semibold }]}>Gratis</Text>
                </View>
              )}
              {camisetas ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Shirt size={16} color={C.blue} strokeWidth={2} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Con camiseta: se preguntará la talla al apuntarse</Text>
                </View>
              ) : null}
            </View>
            {description.trim() ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 12, color: C.muted }]}>{description.trim()}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              <View style={{ flex: 1 }}>
                <Btn full variant="secondary" label="Editar" onPress={() => setPreviewOpen(false)} disabled={saving} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn full busy={saving} label="Publicar" onPress={submit} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
