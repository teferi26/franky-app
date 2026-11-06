// ─── Becas: listado con asistente de elegibilidad ────────────────────────
// Diseño: la cuantía es el dato que la gente busca, así que va en Outfit y
// grande; el plazo se resume en una píldora con color semántico (abierta en
// verde, cierra pronto en naranja, próxima convocatoria en gris). La lista es
// una FlatList (variante de Screen) con filas memoizadas: con 100+ becas y
// tres carruseles de filtros, un ScrollView con todo montado tartamudeaba.
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Coins, Clock, ChevronRight, Bookmark, Bell, SlidersHorizontal, CalendarClock, ArrowUpRight } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Chip, SkeletonList, EmptyState, Pill, Btn, Tap, Card, NavRow } from '@/components/ui';
import { CatalogueHero, CatalogueToolbar, CatalogueResults, CatalogueFilterSheet } from '@/components/CatalogueUI';
import { normalizeAdmissionText } from '@/lib/admission-search';
import { FadeIn } from '@/components/motion';
import { getScholarshipList, type ScholarshipListItem } from '@/lib/catalogue-pages';
import { useDebouncedValue } from '@/lib/catalogue-debounce';
import { useFetch } from '@/lib/useFetch';
import { typeLabel } from '@/lib/format';
import {
  NIVELES, plazoInfo, plazoAbierto, plazoOrden, mesAnyo, matchesPerfil,
  PERFIL_VACIO, perfilActivo, type NivelValue, type PerfilBecas,
} from '@/lib/becas';
import { BecasWizard, resumenPerfil } from '@/components/BecasWizard';
import { MecAssessment } from '@/components/MecQuestions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { getMyScholarshipAlertIds } from '@/lib/becas-alerts';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';

// ── Guardar becas (favorites.target_type 'scholarship', migración 129) ──
// Insert/delete directo por RLS (auth.uid()=user_id). El cron de la 130 recorre
// estas becas guardadas y avisa 3 días antes del cierre. Fail-soft: sin sesión
// devuelve reason 'auth' para que la UI lleve a iniciar sesión.
async function getSavedScholarshipIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();
  const { data, error } = await supabase.from('favorites')
    .select('target_id').eq('user_id', user.id).eq('target_type', 'scholarship');
  if (error) return new Set();
  return new Set((data ?? []).map(r => r.target_id as string));
}
async function toggleSavedScholarship(id: string, wasSaved: boolean): Promise<{ ok: boolean; reason?: 'auth' | 'db' }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'auth' };
  const q = wasSaved
    ? supabase.from('favorites').delete().match({ user_id: user.id, target_type: 'scholarship', target_id: id })
    : supabase.from('favorites').upsert(
        { user_id: user.id, target_type: 'scholarship', target_id: id },
        { onConflict: 'user_id,target_type,target_id' });
  const { error } = await q;
  return error ? { ok: false, reason: 'db' } : { ok: true };
}

const TYPES = ['todas', 'nacional', 'autonomica', 'privada', 'europea', 'internacional'];
const NIVEL_OPTS: { value: NivelValue | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos los niveles' },
  ...NIVELES,
];
const PAGE = 80;
const PERFIL_KEY = 'franky.becas.perfil.v1';
type Orden = 'cierran' | 'cuantia';

/** Píldora de plazo con color semántico. Devuelve null si la beca no tiene fecha. */
export function PlazoPill({ deadline, opens_at, closes_at }: { deadline: string | null | undefined; opens_at?: string | null; closes_at?: string | null }) {
  const p = plazoInfo(deadline, Date.now(), { opens_at, closes_at });
  if (p.estado === 'pendiente_apertura') return <Pill tone="gray" icon={CalendarClock} label="Abre próximamente" />;
  if (p.estado === 'abierta') return <Pill tone="green" icon={Clock} label={p.dias != null ? `Abierta · ${p.dias} d` : 'Abierta'} />;
  if (p.estado === 'proxima') return <Pill tone="orange" icon={Clock} label={`Cierra en ${p.dias} d`} />;
  if (p.estado === 'estimada' && p.fecha) return <Pill tone="gray" icon={CalendarClock} label={'Plazo cerrado'} />;
  return null;
}

/** Cuantía legible: "1.500 €", "500 a 2.000 €" o "Cuantía variable". */
export function cuantiaLabel(s: { amount_min: number | null; amount_max: number | null }): string {
  if (s.amount_min != null && s.amount_max != null) {
    return s.amount_min === s.amount_max
      ? `${s.amount_max.toLocaleString('es-ES')} €`
      : `${s.amount_min.toLocaleString('es-ES')} a ${s.amount_max.toLocaleString('es-ES')} €`;
  }
  if (s.amount_min != null) return `Desde ${s.amount_min.toLocaleString('es-ES')} €`;
  if (s.amount_max != null) return `Hasta ${s.amount_max.toLocaleString('es-ES')} €`;
  return 'Cuantía variable';
}

// La lista mezcla becas y un separador para el grupo "sin nivel declarado".
type Row =
  | { kind: 'beca'; key: string; s: ScholarshipListItem }
  | { kind: 'sep'; key: string; count: number }
  | { kind: 'more'; key: string; rest: number };

/** Una fila del listado, memoizada: extraída para no duplicarla en los dos grupos. */
const BecaRow = memo(function BecaRow({ s, saved, alerted, onOpen, onSave }: {
  s: ScholarshipListItem; saved: boolean; alerted?: boolean; onOpen: (id: string) => void; onSave: (id: string) => void;
}) {
  const hasAmount = s.amount_min != null || s.amount_max != null;
  return <View style={{ marginHorizontal: S.lg, marginBottom: 14, borderWidth: 1, borderColor: C.border, borderRadius: 21, backgroundColor: C.surface }}>
    <Pressable onPress={() => onOpen(s.id)} accessibilityRole="button" accessibilityLabel={`${s.name}, ${cuantiaLabel(s)}`} accessibilityHint="Abre los requisitos y la solicitud"
      style={({ pressed }) => ({ padding: 18, opacity: pressed ? 0.82 : 1 })}>
      <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', paddingRight: 40, minHeight: 26, marginBottom: 10 }}><Coins size={16} color={C.blueDeep} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blueDeep, fontFamily: FONT.semibold, flex: 1 }]}>{typeLabel[s.type] ?? s.type}{s.comunidad_autonoma ? ` · ${s.comunidad_autonoma}` : ''}</Text></View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 18, lineHeight: 23, letterSpacing: -0.3, color: C.text }}>{s.name}</Text>
      {s.provider ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 7 }]} numberOfLines={2}>{s.provider}</Text> : null}
      {s.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 10, lineHeight: 19 }]} numberOfLines={2}>{s.description}</Text> : null}
      <View style={{ marginTop: 16, padding: 13, backgroundColor: C.input, borderRadius: 13, gap: 4 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Cuantía de la ayuda</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: hasAmount ? 24 : 17, color: C.blueDeep, letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{cuantiaLabel(s)}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 13 }}>
        <PlazoPill deadline={s.deadline} opens_at={s.opens_at} closes_at={s.closes_at} />
        {alerted ? <Pill label="Aviso activo" tone="green" icon={Bell} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blueDeep, fontFamily: FONT.semibold }]}>Ver requisitos</Text><ArrowUpRight size={16} color={C.blueDeep} /></View>
      </View>
    </Pressable>
    <Pressable onPress={() => onSave(s.id)} accessibilityRole="button" accessibilityLabel={saved ? 'Quitar de guardadas' : 'Guardar beca'} accessibilityState={{ selected: saved }}
      style={{ position: 'absolute', right: 9, top: 9, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }}>
      <Bookmark size={21} color={saved ? C.blue : C.muted} fill={saved ? C.blue : 'transparent'} />
    </Pressable>
  </View>;
});

export default function Becas() {
  const router = useRouter();
  const [type, setType] = useState('todas');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // El nivel vive DENTRO del perfil: si tuviera estado propio, los chips y el
  // asistente se pisarían y el usuario vería un filtro distinto del que eligió.
  const [perfil, setPerfil] = useState<PerfilBecas>(PERFIL_VACIO);
  const [preferencesLoaded,setPreferencesLoaded] = useState(false);
  const [wizard, setWizard] = useState(false);
  const nivel = perfil.nivel;
  const setNivel = useCallback((v: NivelValue | 'todos') => setPerfil(p => ({ ...p, nivel: v })), []);
  const [soloAbiertas, setSoloAbiertas] = useState(false);
  const [orden, setOrden] = useState<Orden>('cierran');
  const [visible, setVisible] = useState(PAGE);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  // Solo las columnas que pinta la lista y usan buscador, plazo y perfil:
  // ~550 KB en vez de ~2,4 MB (requisitos, documentos y fuentes se leen en la
  // ficha). Clave de caché propia para no mezclarse con filas completas.
  const fetcher = useCallback(() => getScholarshipList(), []);
  const { rows, loading, error, refreshing, refresh } = useFetch(fetcher, 'scholarships-list');
  // El filtrado se rehace cuando se deja de teclear, no en cada letra.
  const debouncedQuery = useDebouncedValue(query, 250);
  // Texto de búsqueda normalizado una sola vez por carga, no en cada filtrado.
  const searchable = useMemo(() => (rows ?? []).map(s => ({
    s, text: normalizeAdmissionText(`${s.name} ${s.provider ?? ''} ${s.description ?? ''}`),
  })), [rows]);

  // Ids ya guardados (favorites.target_type 'scholarship'), para pintar el
  // bookmark relleno. Sin sesión devuelve un set vacío (fail-soft).
  useEffect(() => { getSavedScholarshipIds().then(setSaved); }, []);
  // Becas con alerta activa (scholarship_alerts, 146): pintan la píldora
  // "Aviso" en su fila. Se activan desde la ficha. Fail-soft: set vacío.
  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  useEffect(() => { getMyScholarshipAlertIds().then(setAlerts); }, []);

  // El perfil se guarda en el móvil: al volver a abrir Becas sigue puesto, sin
  // tener que repetir el asistente cada vez. Fail-soft, como el resto.
  useEffect(() => {
    AsyncStorage.getItem(PERFIL_KEY)
      .then(raw => { if (raw) setPerfil({ ...PERFIL_VACIO, ...JSON.parse(raw) }); })
      .catch(() => {}).finally(()=>setPreferencesLoaded(true));
  }, []);
  useEffect(() => {
    if(!preferencesLoaded)return;
    const { mec: _privateAnswers, ...preferences } = perfil;
    AsyncStorage.setItem(PERFIL_KEY, JSON.stringify(preferences)).catch(() => {});
  }, [perfil,preferencesLoaded]);

  const toggleSave = useCallback(async (id: string) => {
    const wasSaved = saved.has(id);
    // Optimista: actualizamos el set al momento y revertimos si el servidor falla.
    setSaved(prev => { const n = new Set(prev); if (wasSaved) n.delete(id); else n.add(id); return n; });
    const res = await toggleSavedScholarship(id, wasSaved);
    if (!res.ok) {
      setSaved(prev => { const n = new Set(prev); if (wasSaved) n.add(id); else n.delete(id); return n; });
      if (res.reason === 'auth') {
        // Alert con botones: aquí hay una decisión que tomar (Entrar / Ahora no).
        Alert.alert('Inicia sesión', 'Necesitas una cuenta para guardar becas y recibir el aviso de cierre.',
          [{ text: 'Ahora no', style: 'cancel' }, { text: 'Entrar', onPress: () => router.push('/welcome') }]);
      } else {
        toastError('No se pudo guardar', 'Revisa tu conexión e inténtalo de nuevo.');
      }
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Al guardar (no al quitar) explicamos el recordatorio del cron de la 130.
    if (!wasSaved) toast('Beca guardada', 'Te avisaremos 3 días antes del cierre del plazo.');
    else toast('Quitada de guardadas');
  }, [saved, router]);

  // Dos grupos: las compatibles de verdad y las que NO dicen a qué nivel van
  // dirigidas. Estas últimas ya no se cuelan como si supiéramos que valen.
  const { compatibles, sinNivel } = useMemo(() => {
    const now = Date.now();
    const needle = normalizeAdmissionText(debouncedQuery);
    const base = searchable
      .filter(({ s, text }) => (type === 'todas' || s.type === type) && text.includes(needle)
        && (!soloAbiertas || plazoAbierto(s.deadline, now, s)))
      .map(({ s }) => s);
    // La clave de orden por plazo se calcula una vez por beca, no en cada comparación.
    const plazo = new Map<string, number>();
    if (orden !== 'cuantia') for (const s of base) plazo.set(s.id, plazoOrden(s.deadline, now, s));
    const cmp = (a: ScholarshipListItem, b: ScholarshipListItem) => orden === 'cuantia'
      ? (b.amount_max ?? b.amount_min ?? -1) - (a.amount_max ?? a.amount_min ?? -1)
      : plazo.get(a.id)! - plazo.get(b.id)!;
    const ok: typeof base = [];
    const sd: typeof base = [];
    for (const s of base) {
      const r = matchesPerfil(s, perfil);
      if (!r.ok) continue;
      (r.sinNivel ? sd : ok).push(s);
    }
    return { compatibles: ok.sort(cmp), sinNivel: sd.sort(cmp) };
  }, [searchable, type, soloAbiertas, orden, perfil, debouncedQuery]);

  const filtered = compatibles;
  useEffect(() => setVisible(PAGE), [type, soloAbiertas, orden, perfil, debouncedQuery]);

  // Lista plana para la FlatList: compatibles (paginadas), "ver más", separador
  // y las sin nivel declarado.
  const data = useMemo<Row[]>(() => {
    const out: Row[] = filtered.slice(0, visible).map(s => ({ kind: 'beca', key: s.id, s }));
    if (filtered.length > visible) out.push({ kind: 'more', key: 'more', rest: filtered.length - visible });
    if (sinNivel.length > 0) {
      out.push({ kind: 'sep', key: 'sep', count: sinNivel.length });
      for (const s of sinNivel) out.push({ kind: 'beca', key: s.id, s });
    }
    return out;
  }, [filtered, sinNivel, visible]);

  const open = useCallback((id: string) => router.push(`/beca/${id}`), [router]);
  const renderItem = useCallback(({ item, index }: { item: Row; index: number }) => {
    if (item.kind === 'more') {
      return (
        <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, alignItems: 'center' }}>
          <Btn variant="link" label={`Ver más becas (${item.rest})`} onPress={() => setVisible(v => v + PAGE)} />
        </View>
      );
    }
    if (item.kind === 'sep') {
      return (
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.xl, paddingBottom: 4, marginTop: S.sm, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { fontSize: 18, letterSpacing: -0.3 }]}>No dicen a qué nivel van dirigidas ({item.count})</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]}>
            Su ficha no especifica el nivel de estudios, así que no podemos confirmarte
            que puedas pedirlas. Compruébalo en la web oficial.
          </Text>
        </View>
      );
    }
    return (
      <FadeIn index={index}>
        <BecaRow s={item.s} saved={saved.has(item.s.id)} alerted={alerts.has(item.s.id)} onOpen={open} onSave={toggleSave} />
      </FadeIn>
    );
  }, [saved, alerts, open, toggleSave]);

  const filterCount = Number(type !== 'todas') + Number(nivel !== 'todos') + Number(soloAbiertas) + Number(orden !== 'cierran');
  const filterModal = filtersOpen ? <CatalogueFilterSheet values={{ type, nivel, open: soloAbiertas ? 'yes' : 'all', orden }} defaults={{ type: 'todas', nivel: 'todos', open: 'all', orden: 'cierran' }}
      onClose={() => setFiltersOpen(false)} onApply={v => { setType(v.type); setNivel(v.nivel as NivelValue | 'todos'); setSoloAbiertas(v.open === 'yes'); setOrden(v.orden as Orden); }}
      sections={() => [
        { key: 'type', label: 'Tipo de ayuda', options: TYPES.map(t => ({ value: t, label: t === 'todas' ? 'Todas las ayudas' : typeLabel[t] ?? t })) },
        { key: 'nivel', label: 'Nivel de estudios', options: NIVEL_OPTS },
        { key: 'open', label: 'Plazo de solicitud', options: [{ value: 'all', label: 'Todas las convocatorias' }, { value: 'yes', label: 'Solo con plazo abierto' }] },
        { key: 'orden', label: 'Ordenar resultados', options: [{ value: 'cierran', label: 'Cierran antes' }, { value: 'cuantia', label: 'Mayor cuantía' }] },
      ]} /> : null;
  const header = <View>
    <CatalogueHero eyebrow="Más oportunidades" title="Que nada frene tus estudios." icon={Coins}
      description="Encuentra ayudas, revisa sus requisitos y guarda las que te interesan."
      action={perfilActivo(perfil) ? 'Revisar mi perfil de becas' : 'Encontrar ayudas para mí'} onAction={() => setWizard(true)} />
    {perfilActivo(perfil) ? <View style={{ marginHorizontal: S.lg, marginBottom: 16, padding: 14, borderRadius: 15, backgroundColor: C.accentSoft, gap: 6 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.blueDeep }]}>Tu búsqueda personalizada</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{resumenPerfil(perfil)}</Text>
      <Pressable onPress={() => setPerfil(PERFIL_VACIO)} accessibilityRole="button" style={{ paddingVertical: 8 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blueDeep }]}>Quitar perfil</Text></Pressable>
    </View> : null}
    {perfil.mec ? <View style={{ marginHorizontal: S.lg, marginBottom: 16 }}><MecAssessment region={perfil.comunidad} draft={perfil.mec} level={perfil.nivel} grade={perfil.nota==null?'':String(perfil.nota)} /></View> : null}
    <CatalogueToolbar query={query} onQuery={setQuery} placeholder="Busca una beca o entidad…" count={filterCount} onFilters={() => setFiltersOpen(true)}
      onClear={() => { setType('todas'); setNivel('todos'); setSoloAbiertas(false); setOrden('cierran'); }}
      chips={[type !== 'todas' ? typeLabel[type] : null, nivel !== 'todos' ? NIVEL_OPTS.find(n => n.value === nivel)?.label : null, soloAbiertas ? 'Plazo abierto' : null, orden === 'cuantia' ? 'Mayor cuantía' : null].filter(Boolean) as string[]} />
    {!loading ? <CatalogueResults count={filtered.length} noun={filtered.length === 1 ? 'ayuda' : 'ayudas'} note={perfilActivo(perfil) ? 'Opciones para revisar según tus respuestas. Confirma los requisitos de cada convocatoria.' : 'Consulta la convocatoria y sus fechas antes de solicitarla.'} /> : null}

  </View>;

  const wizardModal = (
    <BecasWizard
      visible={wizard}
      inicial={perfil}
      onClose={() => setWizard(false)}
      onDone={(p) => { setPerfil(p); setWizard(false); setVisible(PAGE); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }}
    />
  );

  if (loading) {
    return (
      <Screen title="Becas" back>
        {header}
        <SkeletonList count={4} height={132} radius={R.md} />
        {wizardModal}
        {filterModal}
      </Screen>
    );
  }

  return (
    <>
      <Screen<Row>
        title="Becas" back refreshing={refreshing} onRefresh={refresh}
        data={data} renderItem={renderItem} keyExtractor={(r) => r.key}
        ListHeaderComponent={header}
        ListEmptyComponent={
          error && filtered.length === 0 && sinNivel.length === 0
            ? <EmptyState icon={Coins} title="No se pudieron cargar las becas" subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refresh} />
            // Ojo: el vacío exige que TAMPOCO haya becas "sin nivel declarado"; si
            // no, ese grupo quedaría escondido detrás del mensaje de "no hay becas".
            : <EmptyState icon={Coins}
                title={perfilActivo(perfil) ? 'Ninguna beca encaja con tu perfil' : 'No hay becas aquí'}
                subtitle={perfilActivo(perfil)
                  ? 'Prueba a quitar algún filtro o a cambiar el tipo de ayuda que buscas.'
                  : 'Prueba con otra categoría.'}
                cta={perfilActivo(perfil) ? 'Editar mi perfil' : (filterCount > 0 || query ? 'Quitar filtros' : undefined)}
                onCta={perfilActivo(perfil) ? () => setWizard(true) : () => { setType('todas'); setSoloAbiertas(false); setQuery(''); setNivel('todos'); }} />
        }
      />
      {wizardModal}
      {filterModal}
    </>
  );
}
