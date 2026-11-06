import HousingSearchAlert, { recordHousingSearch } from '@/components/HousingSearchAlert';
import CatalogueRefreshNotice from '@/components/CatalogueRefreshNotice';
import { useSessionOwner } from '@/lib/useSessionOwner';
import { captureSessionIdentity, isCurrentSessionIdentity, type SessionIdentity } from '@/lib/session';
import { toast, toastError } from '@/lib/toast';
// Guardar es privado; contactar y reservar son acciones explícitas en la ficha.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Home as HomeIcon, BadgeCheck, Bookmark, MapPin, Info, GitCompare, Check, X, BedDouble, Ruler, Bath } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Screen';
import { SwipeDeck, type SwipeDeckHandle } from '@/components/SwipeDeck';
import { ViviendaSwitch } from '@/components/HomeSwitch';
import { Tap, Skeleton, Chip, EmptyState, Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { getAccommodations, getAccommodationCities, getMyCity, type AccommodationFull } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { addFav, addPassed, getPassed, clearPassed, removeFav, removeLastPassed } from '@/lib/favs';
import { eur, typeLabel } from '@/lib/format';
import { C, S, R, F, FONT } from '@/theme';

// Undo preserves favorites that were already saved before this gesture.
type LastSwiped = { id: string; action: 'smash' | 'pass'; alreadySaved?: boolean } | null;

const MAX_COMPARE = 3;

// Píldora blanca translúcida sobre la foto: el fondo es una imagen, así que
// los colores aquí son fijos a propósito (no dependen del tema).
function GlassPill({ icon: Icon, label }: { icon?: typeof BedDouble; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: R.full, paddingHorizontal: 9, paddingVertical: 4 }}>
      {Icon ? <Icon size={11} color="#fff" strokeWidth={2.4} /> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: '#fff', fontSize: 11.5, fontFamily: FONT.semibold }}>{label}</Text>
    </View>
  );
}

// Memoizada: el mazo re-renderiza mucho durante el gesto y la foto a pantalla
// completa es lo más caro que hay en esta pantalla.
const PisoCard = React.memo(function PisoCard({ a, onInfo }: { a: AccommodationFull; onInfo: () => void }) {
  // Anuncio dirigido a un perfil concreto: se etiqueta, no se esconde (mismo
  // criterio que la web, donde estos anuncios no los veía nadie).
  const soloPara = a.gender_preference === 'mujer' ? 'Solo chicas'
    : a.gender_preference === 'hombre' ? 'Solo chicos' : null;
  return (
    <View style={{ flex: 1 }}>
      {a.images && a.images.length > 0 ? (
        <Image source={{ uri: a.images[0] }} recyclingKey={a.id} style={{ flex: 1 }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <View style={{ flex: 1, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
          <HomeIcon size={70} color={C.border} strokeWidth={1.1} />
        </View>
      )}
      <Tap
        onPress={onInfo}
        accessibilityLabel="Ver la ficha completa del piso"
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center', justifyContent: 'center',
        }}>
        {/* Blanco fijo: el icono va sobre el disco oscuro de la foto. */}
        <Info size={22} color="#fff" strokeWidth={2} />
      </Tap>
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 100, paddingBottom: 18, paddingHorizontal: 18, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          {/* El precio es LA cifra de esta pantalla: tamaño display de la marca. */}
          <Text maxFontSizeMultiplier={1.2} style={{ color: '#fff', fontSize: 34, fontFamily: FONT.display, letterSpacing: -1.2, fontVariant: ['tabular-nums'] }}>{eur(a.price)}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>/mes</Text>
          {/* Verde fijo, no C.success: va sobre la FOTO, y el verde del tema
              claro es demasiado oscuro para leerse ahí. */}
          {a.is_verified ? <BadgeCheck size={18} color="#4ADE80" strokeWidth={2.2} style={{ marginLeft: 4 }} /> : null}
        </View>
        <Text maxFontSizeMultiplier={1.3} style={{ color: '#fff', fontSize: 18, fontFamily: FONT.heading, lineHeight: 23 }} numberOfLines={2}>{a.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <MapPin size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1 }}>
            {a.address ? `${a.address}, ` : ''}{a.city}
          </Text>
        </View>
        {/* Características en píldoras: se leen de un vistazo mientras deslizas */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <GlassPill label={typeLabel[a.type] ?? a.type} />
          <GlassPill icon={BedDouble} label={`${a.rooms ?? 1} hab`} />
          {a.bathrooms ? <GlassPill icon={Bath} label={`${a.bathrooms} baño${a.bathrooms === 1 ? '' : 's'}`} /> : null}
          {a.sqm ? <GlassPill icon={Ruler} label={`${a.sqm} m²`} /> : null}
          {soloPara ? <GlassPill label={soloPara} /> : null}
        </View>
      </LinearGradient>
    </View>
  );
}, (prev, next) => prev.a === next.a);

export default function Pisos() {
  const owner = useSessionOwner();
  return <OwnedPisos key={owner ? `${owner.userId}:${owner.generation}` : 'guest'} owner={owner} />;
}
function OwnedPisos({ owner }: { owner: SessionIdentity | null }) {
  const searchOwner = owner?.userId ?? null;
  const alive = useRef(true);
  const mutation = useRef(false);
  const deckBusy = useRef(false);
  const deckGeneration = useRef(0);
  const undoReady = useRef(false);
  const passedDuringSession = useRef(new Set<string>());
  const [undoVersion, setUndoVersion] = useState(0);
  const [changing, setChanging] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const active = useCallback(() => alive.current && (owner ? isCurrentSessionIdentity(owner) : captureSessionIdentity() === null), [owner]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState('todos');
  const [passed, setPassed] = useState<string[] | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  // Filtro por ciudad: sin él la app traía pisos de toda España. `null` = aún
  // sin resolver la ciudad del perfil (no se consulta hasta saberla).
  const [city, setCity] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([getAccommodationCities(), getMyCity()]).then(([list, mine]) => {
      if (!alive) return;
      setCities(list);
      const match = mine ? list.find((c) => c.toLowerCase() === mine.toLowerCase()) : undefined;
      setCity(match ?? '');
    }).catch(() => { if (alive) setCity(''); });
    return () => { alive = false; };
  }, []);

  const fetcher = useCallback(
    () => (city === null
      ? Promise.resolve({ rows: [] as AccommodationFull[], live: false })
      : getAccommodations(city || undefined)),
    [city],
  );
  const { rows, loading, error, refreshError, refreshing, refresh } = useFetch(fetcher, city === null ? undefined : `accommodations:${city}`);
  const deckRef = useRef<SwipeDeckHandle>(null);
  // 140: último swipe (para "deshacer", un solo uso). Se local: pisos no pasa
  // por swipe_actions, así que deshacer aquí es local también (AsyncStorage).
  const [lastSwiped, setLastSwiped] = useState<LastSwiped>(null);
  useEffect(() => { getPassed('accommodation', owner).then(items => { if (active()) setPassed(items); }).catch(() => { if (active()) { setPassed([]); toastError('No se pudieron cargar tus descartes'); } }); }, [active, owner]);
  useEffect(() => { if (!changing && undoReady.current) { undoReady.current = false; deckRef.current?.undo(); } }, [changing, undoVersion]);

  const deck = useMemo(() => (rows ?? [])
    .filter(a => type === 'todos' || a.type === type)
    .filter(a => !(passed ?? []).includes(a.id) && !passedDuringSession.current.has(a.id)),
  // Keep the current deck stable during a gesture. On a filter/catalogue change,
  // rebuild it with all confirmed choices made since the screen was opened.
  [rows, type, passed, city]);
  useEffect(() => { deckGeneration.current += 1; setLastSwiped(null); undoReady.current = false; }, [deck]);
  const onDeckBusy = useCallback((busy: boolean) => { deckBusy.current = busy; }, []);

  // Lista para el comparador: mismos pisos del filtro activo (sin excluir los
  // pasados: comparar es una decision consciente, no el deck de descubrimiento).
  const comparables = useMemo(() => (rows ?? [])
    .filter(a => type === 'todos' || a.type === type),
  [rows, type]);

  const toggleSelect = (id: string) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id)
      : prev.length >= MAX_COMPARE ? prev : [...prev, id]);

  const openCompare = () => {
    setCompareOpen(false);
    router.push({ pathname: '/comparar-pisos', params: { ids: selected.join(',') } });
  };

  const handleUndo = async () => {
    if (!lastSwiped || !active() || mutation.current) return;
    mutation.current = true; setChanging(true);
    const generation = deckGeneration.current;
    try {
      if (lastSwiped.action === 'pass') {
        if (owner) {
          const removed = await removeLastPassed('accommodation', owner, lastSwiped.id);
          if (removed !== lastSwiped.id) throw new Error('discard_changed');
        }
        passedDuringSession.current.delete(lastSwiped.id);
      } else if (!lastSwiped.alreadySaved && !(await removeFav('accommodation', lastSwiped.id, owner)).ok) throw new Error('remove_failed');
      if (!active()) return;
      setLastSwiped(null);
      undoReady.current = generation === deckGeneration.current;
      setUndoVersion(version => version + 1);
    } catch { if (active()) toastError('No se pudo deshacer', 'Conservamos tu elección. Vuelve a intentarlo.'); }
    finally { mutation.current = false; if (active()) setChanging(false); }
  };
  const savePiso = async (a: AccommodationFull) => {
    if (!active() || mutation.current) return false;
    if (!owner) { router.push('/welcome'); return false; }
    mutation.current = true;
    const generation = deckGeneration.current;
    try {
      const result = await addFav({ type: 'accommodation', id: a.id, title: a.title, subtitle: `${eur(a.price)}/mes · ${a.city}`, image: a.images?.[0] ?? null }, owner);
      if (!active()) return false;
      if (!result.ok) { toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.'); return false; }
      if (generation === deckGeneration.current) setLastSwiped({ id: a.id, action: 'smash', alreadySaved: result.alreadySaved });
      toast('Piso guardado', 'Solo tú lo ves. Contacta desde su ficha cuando decidas.');
      return true;
    } finally { mutation.current = false; }
  };
  const passPiso = async (a: AccommodationFull) => {
    if (!active() || mutation.current) return false;
    mutation.current = true;
    const generation = deckGeneration.current;
    try {
      if (owner) await addPassed('accommodation', a.id, owner);
      if (!active()) return false;
      passedDuringSession.current.add(a.id);
      if (generation === deckGeneration.current) setLastSwiped({ id: a.id, action: 'pass' });
      return true;
    } catch { if (active()) toastError('No se pudo guardar tu descarte'); return false; }
    finally { mutation.current = false; }
  };
  const resetPassed = async () => {
    if (!active() || mutation.current) return false;
    mutation.current = true;
    try {
      if (owner) await clearPassed('accommodation', owner);
      if (!active()) return false;
      passedDuringSession.current.clear();
      setPassed([]); setLastSwiped(null);
      return true;
    } catch { if (active()) toastError('No se pudieron recuperar los descartados'); return false; }
    finally { mutation.current = false; }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingBottom: insets.bottom }}>
      <Header logo={<ViviendaSwitch active="pisos" />} back />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: S.lg, gap: 4 }}>
        {/* Keep housing actions beside the filters, leaving the same header
            width for the selector in Pisos and Compañeros. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{ paddingLeft: S.lg, paddingVertical: 8 }}>
          {['todos', 'habitacion', 'piso_completo', 'estudio'].map(t => (
            <Chip key={t} label={t === 'todos' ? 'Todos' : typeLabel[t]} accessibilityRole="tab"
              active={type === t} onPress={() => { if (!mutation.current && !deckBusy.current) setType(t); }} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          <Tap onPress={() => { setSelected([]); setCompareOpen(true); }} accessibilityLabel="Comparar pisos" hitSlop={6}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <GitCompare size={22} color={C.text} strokeWidth={1.9} />
          </Tap>
          <Tap onPress={() => router.push('/favoritos')} accessibilityLabel="Pisos guardados" hitSlop={6}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Bookmark size={22} color={C.text} strokeWidth={1.9} />
          </Tap>
        </View>
      </View>
      {cities.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 8 }}>
          <Chip label="Toda España" active={city === ''} onPress={() => { if (!mutation.current && !deckBusy.current) setCity(''); }} accessibilityRole="tab" />
          {cities.map(c => <Chip key={c} label={c} active={city === c} onPress={() => { if (mutation.current || deckBusy.current) return; setCity(c); if (searchOwner) void recordHousingSearch(searchOwner, c); }} accessibilityRole="tab" />)}
        </ScrollView>
      ) : null}
      <HousingSearchAlert city={city} />
      <CatalogueRefreshNotice visible={refreshError} refreshing={refreshing} onRefresh={refresh}/>
      {loading || passed === null || city === null ? (
        // Esqueleto con la silueta real del mazo: la tarjeta grande y la fila
        // de botones de debajo.
        <View style={{ flex: 1, padding: S.lg }}>
          <Skeleton height={420} radius={R.xl} style={{ marginHorizontal: 0 }} />
          <Skeleton height={64} radius={R.full} style={{ marginHorizontal: 40 }} />
        </View>
      ) : error ? (
        <EmptyState
          icon={HomeIcon}
          title="No se han podido cargar los pisos"
          subtitle="Comprueba tu conexión e inténtalo de nuevo."
          cta="Reintentar"
          onCta={refresh}
        />
      ) : (rows ?? []).length === 0 ? (
        /* Catálogo vacío de verdad (no quedan pisos PORQUE no hay ninguno
           publicado). El empty state del deck decia "has visto todos los
           disponibles", que a quien no ha visto ni uno le suena a avería.
           Desde el muro de pago de agosto de 2026 este caso es real: solo se
           ven los pisos de propietarios en prueba o pagando. */
        <EmptyState
          icon={HomeIcon}
          title="Todavía no hay pisos publicados"
          subtitle="Estamos dando de alta a las primeras inmobiliarias. Mientras tanto puedes buscar compañero de piso, que es por donde empieza casi todo el mundo."
          cta="Buscar compañero de piso"
          onCta={() => router.push('/roomie')}
        />
      ) : (
        <SwipeDeck
          ref={deckRef}
          items={deck}
          renderCard={(a) => <PisoCard a={a} onInfo={() => router.push(`/piso/${a.id}`)} />}
          disabled={changing}
          onBusyChange={onDeckBusy}
          onSmash={savePiso}
          onPass={passPiso}
          onUndo={lastSwiped ? handleUndo : undefined}
          onReset={resetPassed}
          showResetMidDeck={false}
          resetLabel="Volver a ver los que descarté"
          onOpenSaved={() => router.push('/favoritos')}
          // Rótulos del mazo en el idioma de la pantalla: aquí se guardan
          // pisos, no se "liga" con nadie.
          likeLabel="GUARDAR"
          likeActionLabel="Guardar piso"
          passLabel="NO ES"
          savedLabel="Ver pisos guardados"
          emptyTitle="No quedan pisos"
          emptySubtitle="Has visto todos los disponibles con este filtro. Recupera solo lo que descartaste (tus pisos guardados se conservan)."
        />
      )}

      {/* Selector de comparacion: marca de 2 a 3 pisos y abre la tabla lado a lado. */}
      <Modal visible={compareOpen} animationType="slide" transparent onRequestClose={() => setCompareOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: C.overlay }} onPress={() => setCompareOpen(false)}
          accessibilityLabel="Cerrar" accessibilityRole="button" />
        <View accessibilityViewIsModal style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '82%', paddingBottom: insets.bottom + 10 }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 19 }]}>Comparar pisos</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Marca de 2 a {MAX_COMPARE} pisos ({selected.length} seleccionados)</Text>
            </View>
            <Tap onPress={() => setCompareOpen(false)} accessibilityLabel="Cerrar" hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color={C.text} strokeWidth={2.2} />
            </Tap>
          </View>
          {comparables.length === 0 ? (
            <EmptyState compact icon={HomeIcon} title="No hay pisos que comparar" subtitle="Cambia el filtro y vuelve a intentarlo." />
          ) : (
            <ScrollView contentContainerStyle={{ paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
              {comparables.map((a, i) => {
                const on = selected.includes(a.id);
                const full = !on && selected.length >= MAX_COMPARE;
                return (
                  <FadeIn key={a.id} index={i}>
                  <Tap onPress={() => toggleSelect(a.id)} disabled={full}
                    accessibilityLabel={a.title} accessibilityState={{ selected: on }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 72, opacity: full ? 0.4 : 1, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                      {/* Foto en marco redondeado, nunca a sangre en las filas. */}
                      {a.images && a.images.length > 0 ? (
                        <Image source={{ uri: a.images[0] }} recyclingKey={a.id} style={{ width: 56, height: 56, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                      ) : (
                        <View style={{ width: 56, height: 56, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                          <HomeIcon size={22} color={C.border} strokeWidth={1.2} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{a.title}</Text>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{eur(a.price)}/mes · {a.city} · {typeLabel[a.type]}</Text>
                      </View>
                      <View style={{
                        width: 24, height: 24, borderRadius: 6, borderWidth: 1.6,
                        borderColor: on ? C.blue : C.border, backgroundColor: on ? C.blue : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {on ? <Check size={16} color={C.onAccent} strokeWidth={3} /> : null}
                      </View>
                    </View>
                  </Tap>
                  </FadeIn>
                );
              })}
            </ScrollView>
          )}
          <View style={{ paddingHorizontal: S.lg, paddingTop: 10 }}>
            <Btn full label={selected.length < 2 ? 'Elige al menos 2 pisos' : `Comparar ${selected.length} pisos`}
              disabled={selected.length < 2} onPress={openCompare} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
