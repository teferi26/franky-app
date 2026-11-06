// Eventos: feed vertical de tarjetas, ordenado por relevancia, con filtros
// completos y mapa por zonas de ocio (toggle Lista/Mapa en la cabecera).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CalendarDays, MapPin, SlidersHorizontal, Bookmark, X, Ticket, List, Map as MapIcon, Plus,
  PartyPopper, BookOpen, Trophy, Drama, Handshake, Store, Pin, Shirt, Sparkles,
  Disc3, Beer, Wine, UtensilsCrossed, Coffee, Landmark, type LucideIcon,
} from 'lucide-react-native';
import { Screen, Header } from '@/components/Screen';
import { Pill, Skeleton, EmptyState, Tap, Btn, Chip } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { getEvents } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { addFav } from '@/lib/favs';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { toast, toastError } from '@/lib/toast';
import { eur, dateLong, typeLabel } from '@/lib/format';
import { EventsMap } from '@/components/EventsMap';
import { primeEventCache } from '@/lib/event-cache';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT, SHADOW } from '@/theme';
import type { EventItem } from '@/lib/types';

/**
 * ¿Puede este dispositivo pintar el mapa de verdad?
 *
 * iOS usa Apple Maps y no necesita clave. Android usa Google Maps y SIN clave
 * react-native-maps deja un recuadro gris. Se comprueba la clave en la config
 * efectiva de la app, así que en cuanto se añada, el mapa vuelve a ser la vista
 * por defecto sin tocar este código.
 */
function canRenderMap(): boolean {
  if (Platform.OS !== 'android') return true;
  const cfg = Constants.expoConfig as
    | { android?: { config?: { googleMaps?: { apiKey?: string } } } }
    | null;
  return Boolean(cfg?.android?.config?.googleMaps?.apiKey);
}

const CATS = ['fiesta', 'academico', 'deportivo', 'cultural', 'networking', 'feria', 'otro'];
// Categorías de zonas de ocio del mapa (filtro en el mismo panel que el resto).
const ZONE_CATS = ['todos', 'discoteca', 'pub', 'bar', 'restaurante', 'cafeteria', 'cultural'];

// Iconos por categoría (sustituyen a los emojis de lib/format: un emoji cambia
// de dibujo según el sistema y no se puede teñir con el tema; un icono sí).
const CAT_ICON: Record<string, LucideIcon> = {
  fiesta: PartyPopper, academico: BookOpen, deportivo: Trophy, cultural: Drama,
  networking: Handshake, feria: Store, otro: Pin,
};
const ZONE_ICON: Record<string, LucideIcon> = {
  todos: MapPin, discoteca: Disc3, pub: Beer, bar: Wine, restaurante: UtensilsCrossed,
  cafeteria: Coffee, cultural: Landmark,
};

const PRICES = [
  { key: 'all', label: 'Cualquiera' }, { key: 'free', label: 'Gratis' },
  { key: 'lte10', label: 'Hasta 10 €' }, { key: 'lte25', label: 'Hasta 25 €' },
] as const;
const WHEN = [
  { key: 'all', label: 'Cualquier fecha' }, { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' }, { key: 'month', label: 'Este mes' },
] as const;

type Filters = { cats: string[]; cities: string[]; price: typeof PRICES[number]['key']; when: typeof WHEN[number]['key'] };
const EMPTY: Filters = { cats: [], cities: [], price: 'all', when: 'all' };

// Relevancia: destacados primero, después los más próximos en el tiempo.
function relevance(e: EventItem): number {
  const days = Math.max(0, (new Date(e.start_date).getTime() - Date.now()) / 864e5);
  return (e.is_featured ? 1000 : 0) - days;
}

function applyFilters(rows: EventItem[], f: Filters): EventItem[] {
  const now = new Date();
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59);
  const week = new Date(now); week.setDate(week.getDate() + 7);
  const month = new Date(now); month.setMonth(month.getMonth() + 1);
  return rows.filter(e => {
    if (f.cats.length && !f.cats.includes(e.category)) return false;
    if (f.cities.length && !f.cities.includes(e.city)) return false;
    const p = Number(e.price ?? 0);
    if (f.price === 'free' && p > 0) return false;
    if (f.price === 'lte10' && p > 10) return false;
    if (f.price === 'lte25' && p > 25) return false;
    const d = new Date(e.start_date);
    if (f.when === 'today' && d > endOfDay) return false;
    if (f.when === 'week' && d > week) return false;
    if (f.when === 'month' && d > month) return false;
    return true;
  }).sort((a, b) => relevance(b) - relevance(a));
}

// Fecha corta para la etiqueta sobre la foto ("vie 12 · 22:00").
function dateChip(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }).replace('.', '');
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

// Sello "Evento Franky" (164): violeta SÓLIDO, es la insignia con más peso.
// Blanco sobre violeta es la única excepción a usar siempre tokens.
function FrankyBadge({ compact }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: compact ? 8 : 10, paddingVertical: 4 }}>
      <Sparkles size={11} color={C.onAccent} strokeWidth={2} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontSize: 11, fontFamily: FONT.heading, letterSpacing: 0.1 }}>
        {compact ? 'Franky' : 'Evento Franky'}
      </Text>
    </View>
  );
}

// Memoizado: con la lista virtualizada, abrir el modal de filtros o cambiar de
// vista no debe re-renderizar cada tarjeta (pesan por la imagen).
const EventPost = React.memo(function EventPost({ e }: { e: EventItem }) {
  const owner = useSessionOwner();
  return <OwnedEventPost key={`${e.id}:${owner?.userId ?? 'guest'}:${owner?.generation ?? 0}`} e={e} owner={owner} />;
});
function OwnedEventPost({ e, owner }: { e: EventItem; owner: SessionIdentity | null }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async () => {
    if (!alive.current || savingRef.current || saved) return;
    if (!owner) { router.push('/welcome'); return; }
    if (!isCurrentSessionIdentity(owner)) return;
    savingRef.current = true; setSaving(true);
    try {
      const result = await addFav({ type: 'event', id: e.id, title: e.title, subtitle: `${eur(e.price)} · ${e.city}`, image: e.image_url }, owner);
      if (!alive.current || !isCurrentSessionIdentity(owner)) return;
      if (!result.ok) { toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.'); return; }
      setSaved(true); toast('Evento guardado');
    } finally {
      savingRef.current = false;
      if (alive.current && isCurrentSessionIdentity(owner)) setSaving(false);
    }
  };
  const free = !e.price || Number(e.price) === 0;
  const CatIcon = CAT_ICON[e.category] ?? Pin;
  // La ficha ya tiene la fila completa: se pinta al instante al abrirla.
  const open = () => { primeEventCache(e); router.push(`/evento/${e.id}`); };
  return (
    <View style={{ marginHorizontal: S.lg, marginBottom: S.lg, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border, overflow: 'hidden', ...SHADOW.card }}>
      <Tap onPress={open} haptic={false} accessibilityLabel={`${e.title}, ${dateChip(e.start_date)}, ${eur(e.price)}`} accessibilityHint="Abre la ficha del evento">
        <View style={{ height: 200, backgroundColor: C.input }}>
          {e.image_url ? (
            <Image source={{ uri: e.image_url }} recyclingKey={e.id} cachePolicy="memory-disk"
              style={{ width: '100%', height: 200 }} contentFit="cover" transition={150} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <CatIcon size={44} color={C.border} strokeWidth={1.3} />
            </View>
          )}
          {/* Velo inferior para que la fecha y las píldoras se lean sobre cualquier foto */}
          <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.55)']}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 }} />
          {/* Píldoras sobre la foto: fondo blanco fijo y texto #1B1530 fijo. No
              son tokens a propósito: el sustrato (una foto) no cambia con el tema,
              y C.text en oscuro saldría casi blanco sobre blanco. */}
          <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 6 }}>
            {e.is_official ? <FrankyBadge compact /> : null}
            {e.is_featured ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: R.full, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11, fontFamily: FONT.semibold, color: '#1B1530' }}>Destacado</Text>
              </View>
            ) : null}
          </View>
          <View style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5 }}>
            <CalendarDays size={12} color="#1B1530" strokeWidth={2.2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.semibold, color: '#1B1530', textTransform: 'capitalize' }}>{dateChip(e.start_date)}</Text>
          </View>
          {e.status === 'cancelled' || e.status === 'ongoing' ? (
            <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
              <Pill label={e.status === 'cancelled' ? 'Cancelado' : 'En curso'} tone={e.status === 'cancelled' ? 'red' : 'green'} />
            </View>
          ) : null}
        </View>
      </Tap>
      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill label={typeLabel[e.category] ?? e.category} tone="blue" icon={CatIcon} />
          {free ? <Pill label="Gratis" tone="green" /> : null}
          {e.shirts_enabled ? <Pill label="Camiseta" tone="blue" icon={Shirt} /> : null}
          <View style={{ flex: 1 }} />
          <Tap haptic disabled={saving || saved} onPress={save} hitSlop={8}
            accessibilityLabel={saved ? 'Guardado' : 'Guardar evento'} accessibilityState={{ selected: saved, busy: saving }}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: -6, marginTop: -4 }}>
            <Bookmark size={21} color={saved ? C.blue : C.text} fill={saved ? C.blue : 'transparent'} strokeWidth={1.9} />
          </Tap>
        </View>
        <Tap onPress={open} haptic={false} accessibilityLabel={e.title} accessibilityHint="Abre la ficha del evento">
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18 }]} numberOfLines={2}>{e.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
            <MapPin size={13} color={C.muted} strokeWidth={2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]} numberOfLines={1}>{e.venue ? `${e.venue} · ` : ''}{e.city}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 16, fontFamily: FONT.heading, color: free ? C.success : C.text }}>{eur(e.price)}</Text>
          </View>
        </Tap>
      </View>
    </View>
  );
}

export default function Eventos() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // El mapa es la vista por defecto (pedido 20-jul-2026): se ve de un vistazo
  // qué se mueve cerca; la lista queda a un toque.
  //
  // SALVO en Android sin API key de Google Maps: ahí react-native-maps pinta un
  // recuadro gris vacío, así que abrir en mapa sería la peor primera impresión
  // posible. Mientras no exista la clave, Android arranca en lista (el mapa
  // sigue disponible a un toque). En iOS se usa Apple Maps, que no necesita
  // clave. En cuanto se añada android.config.googleMaps.apiKey en app.json,
  // esto vuelve solo a abrir en mapa.
  const [mode, setMode] = useState<'list' | 'map'>(canRenderMap() ? 'map' : 'list');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  // Filtro de zonas de ocio del mapa: vive en el MISMO panel de filtros que
  // los eventos (el botón de arriba a la derecha), nada de filas de chips
  // tapando el mapa.
  const [zoneCat, setZoneCat] = useState('todos');
  const [zoneDraft, setZoneDraft] = useState('todos');
  const fetcher = useCallback(() => getEvents(), []);
  const { rows, loading, error, refreshing, refresh } = useFetch(fetcher, 'events');

  const cities = useMemo(() => [...new Set((rows ?? []).map(e => e.city))].sort(), [rows]);
  const list = useMemo(() => applyFilters(rows ?? [], filters), [rows, filters]);
  const active = filters.cats.length + filters.cities.length + (filters.price !== 'all' ? 1 : 0) + (filters.when !== 'all' ? 1 : 0) + (zoneCat !== 'todos' ? 1 : 0);

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const keyExtractor = useCallback((e: EventItem) => e.id, []);
  const renderItem = useCallback(({ item: e, index }: { item: EventItem; index: number }) => (
    <FadeIn index={index} distance={12}><EventPost e={e} /></FadeIn>
  ), []);

  // Acción de cabecera: icono SUELTO de trazo fino con hitSlop generoso, sin
  // círculo tintado (v3 Editorial). El globo del contador se mantiene.
  const HeaderBtn = ({ icon: Icon, label, onPress, badge }: { icon: LucideIcon; label: string; onPress: () => void; badge?: number }) => (
    <Tap haptic onPress={onPress} accessibilityLabel={label} hitSlop={12}
      style={{ width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={22} color={C.text} strokeWidth={1.75} />
      {badge ? (
        <View style={{ position: 'absolute', top: 0, right: -3, backgroundColor: C.blue, borderRadius: 9, minWidth: 17, height: 17, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.bg }}>
          <Text maxFontSizeMultiplier={1.2} style={{ color: C.onAccent, fontSize: 9.5, fontFamily: FONT.heading }}>{badge}</Text>
        </View>
      ) : null}
    </Tap>
  );

  // Cabecera compartida por lista y mapa: crear + toggle de vista + filtros.
  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <HeaderBtn icon={Plus} label="Crear evento" onPress={() => router.push('/crear-evento')} />
      <HeaderBtn icon={mode === 'list' ? MapIcon : List} label={mode === 'list' ? 'Ver mapa' : 'Ver lista'}
        onPress={() => setMode(m => m === 'list' ? 'map' : 'list')} />
      <HeaderBtn icon={SlidersHorizontal} label={active > 0 ? `Filtros, ${active} activos` : 'Filtros'} badge={active}
        onPress={() => { setDraft(filters); setZoneDraft(zoneCat); setOpen(true); }} />
    </View>
  );

  // El mapa solo se monta en modo mapa: en lista no hay MapView vivo por detrás.
  const body = mode === 'map' ? (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title="Eventos" right={headerRight} />
      <EventsMap events={list} zoneCat={zoneCat} />
    </View>
  ) : (
    <Screen<EventItem> title="Eventos" right={headerRight} scrollTopKey="eventos"
      refreshing={refreshing} onRefresh={refresh}
      data={loading ? [] : list}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={
        loading ? null : (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm }]}>
            {list.length === 1 ? '1 evento' : `${list.length} eventos`} · por relevancia
          </Text>
        )
      }
      ListEmptyComponent={
        loading ? (
          <View style={{ paddingTop: S.lg }}>
            <Skeleton height={300} radius={R.xl} />
            <Skeleton height={300} radius={R.xl} />
          </View>
        ) : error && !(rows ?? []).length ? (
          <EmptyState icon={Ticket} title="No se pudieron cargar los eventos"
            subtitle="Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={refresh} />
        ) : active > 0 ? (
          <EmptyState icon={Ticket} title="Nada con estos filtros"
            subtitle="Afloja un poco los filtros o vuelve a mirar en unos días."
            cta="Quitar filtros" onCta={() => { setFilters(EMPTY); setZoneCat('todos'); }} />
        ) : (
          <EmptyState icon={CalendarDays} title="Todavía no hay planes"
            subtitle="Sé quien monte el primero: en dos minutos tienes tu evento publicado."
            cta="Crear evento" onCta={() => router.push('/crear-evento')} />
        )
      }
    />
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginBottom: 10 }]}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>{children}</View>
    </View>
  );

  return (
    <>
      {body}

      {/* ─── Panel de filtros (misma hoja inferior que OptionsSheet) ─── */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setOpen(false)}
          accessibilityLabel="Cerrar filtros" accessibilityRole="button" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingBottom: 30, maxHeight: '84%' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 }}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1, fontSize: 19 }]}>Filtros</Text>
            <Tap onPress={() => setOpen(false)} accessibilityLabel="Cerrar filtros" hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color={C.text} strokeWidth={2.2} />
            </Tap>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: S.md, gap: 20 }}>
            <Section title="Tipo de evento">
              {CATS.map(c => (
                <Chip key={c} label={typeLabel[c] ?? c} icon={CAT_ICON[c]} active={draft.cats.includes(c)}
                  onPress={() => setDraft({ ...draft, cats: toggle(draft.cats, c) })} />
              ))}
            </Section>
            {cities.length > 0 ? (
              <Section title="Ciudad">
                {cities.map(c => (
                  <Chip key={c} label={c} active={draft.cities.includes(c)}
                    onPress={() => setDraft({ ...draft, cities: toggle(draft.cities, c) })} />
                ))}
              </Section>
            ) : null}
            <Section title="Precio">
              {PRICES.map(p => (
                <Chip key={p.key} label={p.label} active={draft.price === p.key} accessibilityRole="tab"
                  onPress={() => setDraft({ ...draft, price: p.key })} />
              ))}
            </Section>
            <Section title="Fecha">
              {WHEN.map(w => (
                <Chip key={w.key} label={w.label} active={draft.when === w.key} accessibilityRole="tab"
                  onPress={() => setDraft({ ...draft, when: w.key })} />
              ))}
            </Section>
            <Section title="Zonas de ocio en el mapa">
              {ZONE_CATS.map(z => (
                <Chip key={z} label={z === 'todos' ? 'Todas' : (typeLabel[z] ?? z)} icon={ZONE_ICON[z]}
                  active={zoneDraft === z} accessibilityRole="tab" onPress={() => setZoneDraft(z)} />
              ))}
            </Section>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Btn variant="secondary" full label="Limpiar" onPress={() => { setDraft(EMPTY); setZoneDraft('todos'); }} />
              </View>
              <View style={{ flex: 2 }}>
                <Btn full label="Aplicar filtros" onPress={() => { setFilters(draft); setZoneCat(zoneDraft); setOpen(false); }} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
