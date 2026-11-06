import { trackAcademicConsultation } from '@/lib/academic-analytics';
import { formatAcademicDuration } from '@/lib/academic-duration';
import { formatAcademicScore } from '@/lib/academic-score';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GraduationCap, MapPin, ArrowUpRight, BookOpen } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { SkeletonList, EmptyState, Btn } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import type { CutOffRow } from '@/lib/api';
import { getCutOffPage, getCutOffFacets, CUTOFF_PAGE_SIZE, type CutOffFacets, type CutOffFilters } from '@/lib/catalogue-pages';
import { useDebouncedValue } from '@/lib/catalogue-debounce';
import { branchLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';
import { CatalogueHero, CatalogueToolbar, CatalogueResults, CatalogueFilterSheet, type FilterValues } from '@/components/CatalogueUI';
import { ADMISSION_MODES, admissionLocation, admissionModeLabel } from '@/lib/admission-search';

// ─── Carreras y notas de corte ──────────────────────────────────────────────
// Réplica móvil de la web /notas-corte: catálogo con el curso de cada dato de
// titulaciones con su nota de corte, buscador por titulación y filtros por
// rama, ciudad y universidad. REGLA DE ORO: los valores se pintan TAL CUAL
// vienen de la BD (son datos oficiales curados); se conservan las milésimas y no se inventan nulos.
//
// Esta pantalla absorbió a la antigua app/carreras.tsx (agosto 2026): las dos
// listaban titulaciones y empujaban a /carrera/[id], pero aquélla cortaba en
// 60 resultados y no dejaba filtrar por ciudad ni universidad. De allí se
// trajo lo único que le faltaba a ésta: el filtro por RAMA académica.
// Lista TODAS las titulaciones: las que aún no tienen nota publicada salen
// como "Sin nota publicada" y se ordenan al final (paridad con la web).
//
// Carga por páginas (septiembre 2026): antes se descargaban las 4.384
// titulaciones (~2,5 MB en 9 peticiones seguidas) antes de pintar nada, y cada
// tecla filtraba y reordenaba miles de filas. Ahora la búsqueda y los filtros
// se resuelven en el servidor (getCutOffPage), llegan páginas de 30 al hacer
// scroll y las opciones de ciudad y universidad solo se piden al abrir los
// filtros. Lo ya visto queda en memoria para volver atrás sin recargar.

// Cada adjudicación conserva su año, sin presentar notas históricas como actuales.
const course = (year: number | null) => year ? `${year}/${year + 1}` : "Curso s/d";

// Ramas de conocimiento (columna careers.branch). 'todas' no filtra.
const BRANCHES = [
  'todas', 'ciencias_salud', 'ingenieria_arquitectura',
  'ciencias_sociales_juridicas', 'ciencias', 'artes_humanidades',
];

// Fila memoizada: el catálogo tiene cientos de titulaciones y cada tecleo en
// el buscador rehace el filtrado; sin memo, todas las filas visibles se
// volvían a pintar aunque no hubieran cambiado.
const CutRow = memo(function CutRow({ c, onOpen }: { c: CutOffRow; onOpen: (id: string) => void }) {
  return <Pressable onPress={() => onOpen(c.id)} accessibilityRole="button"
    accessibilityLabel={`${c.name}, ${c.universities?.name ?? ''}, ${c.admission_without_cutoff ? 'Acceso sin nota de corte' : c.cut_off_score == null ? 'Sin nota publicada' : `Nota de corte ${formatAcademicScore(c.cut_off_score)}, ${course(c.cut_off_year)}`}`}
    style={({ pressed }) => ({ marginHorizontal: S.lg, marginBottom: 14, padding: 18, backgroundColor: C.surface, borderRadius: 21, borderWidth: 1, borderColor: C.border, opacity: pressed ? 0.82 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      <BookOpen size={15} color={C.blueDeep} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blueDeep, flex: 1, fontFamily: FONT.semibold }]}>{branchLabel[c.branch] ?? c.branch}</Text>
      <ArrowUpRight size={18} color={C.muted} />
    </View>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 19, lineHeight: 24, letterSpacing: -0.4, color: C.text }}>{c.name}</Text>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 8, color: C.text }]}>{c.universities?.name ?? 'Universidad por confirmar'}</Text>
    {admissionLocation(c) ? <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 5 }}><MapPin size={13} color={C.muted} /><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>{admissionLocation(c)}</Text></View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
      {[admissionModeLabel(c.modality), c.duration_years != null ? formatAcademicDuration(c.duration_years) : null].filter(Boolean).map(label => <View key={label} style={{ backgroundColor: C.input, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{label}</Text></View>)}
    </View>
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.borderLight, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 3 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{c.admission_without_cutoff ? 'Acceso' : 'Nota de corte'}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{c.cut_off_score != null && !c.admission_without_cutoff ? course(c.cut_off_year) : 'Consulta los requisitos'}</Text></View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: c.cut_off_score != null && !c.admission_without_cutoff ? 28 : 14, letterSpacing: -0.5, color: C.blueDeep, textAlign: 'right', maxWidth: '58%', fontVariant: ['tabular-nums'] }}>
        {c.admission_without_cutoff ? 'Sin nota de corte' : c.cut_off_score == null ? 'Sin nota publicada' : formatAcademicScore(c.cut_off_score)}
      </Text>
    </View>
  </Pressable>;
});

// Caché en memoria por combinación de filtros: al volver a la pantalla (o
// deshacer un filtro) se pinta al instante lo que ya se había cargado.
type PageState = { rows: CutOffRow[]; total: number | null; hasMore: boolean };
const PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_CACHE_MAX = 20;
const pageCache = new Map<string, PageState & { at: number }>();
function cachedPages(key: string): PageState | null {
  const hit = pageCache.get(key);
  if (!hit || Date.now() - hit.at > PAGE_CACHE_TTL_MS) { pageCache.delete(key); return null; }
  return hit;
}
function storePages(key: string, state: PageState) {
  pageCache.delete(key);
  pageCache.set(key, { ...state, at: Date.now() });
  if (pageCache.size > PAGE_CACHE_MAX) pageCache.delete(pageCache.keys().next().value!);
}

type ListState = PageState & { key: string; status: 'loading' | 'ready' | 'error'; loadingMore: boolean; moreError: boolean };

function initialState(key: string): ListState {
  const hit = cachedPages(key);
  return hit
    ? { ...hit, key, status: 'ready', loadingMore: false, moreError: false }
    : { key, rows: [], total: null, hasMore: false, status: 'loading', loadingMore: false, moreError: false };
}

export default function NotasCorte() {
  const router = useRouter();
  const { acceso } = useLocalSearchParams<{ acceso?: string }>();
  const [withoutCutoff, setWithoutCutoff] = useState(acceso === 'sin-corte');
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('todas'); // 'todas' = sin filtro de rama
  const [city, setCity] = useState(''); // '' = todas
  const [mode, setMode] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [uni, setUni] = useState('');   // '' = todas
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  // Nonce para reintentar: cambiarlo relanza la carga.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [facets, setFacets] = useState<CutOffFacets | null>(null);

  // El buscador consulta al servidor cuando se deja de teclear, no en cada letra.
  const debouncedQ = useDebouncedValue(q.trim(), 300);
  const filters = useMemo<CutOffFilters>(() => ({ q: debouncedQ, branch, city, mode, uni, sort, withoutCutoff }),
    [debouncedQ, branch, city, mode, uni, sort, withoutCutoff]);
  const key = useMemo(() => JSON.stringify(filters), [filters]);

  const [list, setList] = useState<ListState>(() => initialState(key));
  const request = useRef(0);

  // Primera página de cada combinación de filtros (o la caché si la hay).
  useEffect(() => {
    const id = ++request.current;
    const start = initialState(key);
    setList(start);
    if (start.status === 'ready') return;
    getCutOffPage(filters, 0)
      .then(page => {
        if (id !== request.current) return;
        storePages(key, page);
        setList({ ...page, key, status: 'ready', loadingMore: false, moreError: false });
      })
      .catch(() => { if (id === request.current) setList(s => ({ ...s, status: 'error' })); });
  }, [key, filters, reloadNonce]);

  const fetchMore = useCallback((retry: boolean) => {
    if (list.key !== key || list.status !== 'ready' || !list.hasMore || list.loadingMore || (list.moreError && !retry)) return;
    const id = request.current;
    const offset = list.rows.length;
    setList(s => ({ ...s, loadingMore: true, moreError: false }));
    getCutOffPage(filters, offset, CUTOFF_PAGE_SIZE)
      .then(page => {
        if (id !== request.current) return;
        setList(s => {
          const seen = new Set(s.rows.map(r => r.id));
          const rows = [...s.rows, ...page.rows.filter(r => !seen.has(r.id))];
          const next = { rows, total: s.total, hasMore: page.hasMore && page.rows.length > 0 };
          storePages(key, next);
          return { ...s, ...next, loadingMore: false };
        });
      })
      .catch(() => { if (id === request.current) setList(s => ({ ...s, loadingMore: false, moreError: true })); });
  }, [list, key, filters]);
  const loadMore = useCallback(() => fetchMore(false), [fetchMore]);

  // Opciones de ciudad y universidad: solo cuando se abre la hoja de filtros.
  useEffect(() => {
    if (!filtersOpen || facets) return;
    let alive = true;
    getCutOffFacets().then(f => { if (alive) setFacets(f); }).catch(() => {});
    return () => { alive = false; };
  }, [filtersOpen, facets]);

  const cities = facets?.cities ?? (city ? [city] : []);
  const universitiesFor = (selectedCity: string) =>
    facets?.universitiesByCity.get(selectedCity ?? '') ?? (uni ? [uni] : []);

  const ready = list.status === 'ready' && list.key === key;
  const total = list.total ?? list.rows.length;

  const open = useCallback((id: string) => { void trackAcademicConsultation('cutoff', id); router.push(`/carrera/${id}`); }, [router]);
  const renderItem = useCallback(({ item, index }: { item: CutOffRow; index: number }) => (
    <FadeIn index={index}><CutRow c={item} onOpen={open} /></FadeIn>
  ), [open]);
  const keyExtractor = useCallback((c: CutOffRow) => c.id, []);

  const defaults = { branch: 'todas', city: '', mode: '', uni: '', sort: 'desc', access: 'all' };
  const filterValues = { branch, city, mode, uni, sort, access: withoutCutoff ? 'without' : 'all' };
  const filterCount = Object.entries(filterValues).filter(([key, value]) => value !== defaults[key as keyof typeof defaults]).length;
  const hasFilters = !!q || filterCount > 0;
  const applyFilters = (v: FilterValues) => { setBranch(v.branch); setCity(v.city); setMode(v.mode); setUni(v.uni); setSort(v.sort as 'desc' | 'asc'); setWithoutCutoff(v.access === 'without'); };
  const clearFilters = () => { setQ(''); applyFilters(defaults); };
  const filterModal = filtersOpen ? <CatalogueFilterSheet values={filterValues} defaults={defaults} onClose={() => setFiltersOpen(false)} onApply={applyFilters}
      normalize={(v, changed) => changed === 'city' ? { ...v, uni: '' } : v}
      sections={v => [
        { key: 'branch', label: 'Rama de estudios', options: BRANCHES.map(b => ({ value: b, label: b === 'todas' ? 'Todas las ramas' : branchLabel[b] })) },
        { key: 'city', label: 'Campus o ciudad', options: [{ value: '', label: 'Todos los campus' }, ...cities.map(c => ({ value: c, label: c }))] },
        { key: 'uni', label: 'Universidad', options: [{ value: '', label: 'Todas las universidades' }, ...universitiesFor(v.city).map(name => ({ value: name, label: name }))] },
        { key: 'mode', label: 'Modalidad', options: [{ value: '', label: 'Cualquier modalidad' }, ...ADMISSION_MODES] },
        { key: 'access', label: 'Acceso', options: [{ value: 'all', label: 'Todas las titulaciones' }, { value: 'without', label: 'Acceso sin nota de corte' }] },
        { key: 'sort', label: 'Ordenar por nota', options: [{ value: 'desc', label: 'Mayor a menor' }, { value: 'asc', label: 'Menor a mayor' }] },
      ]} /> : null;
  const header = <View>
    <CatalogueHero eyebrow="Tu próximo paso" title="Encuentra tu carrera." icon={GraduationCap}
      description="Explora tus opciones y compara la nota, el campus y la modalidad."
      action="¿Dónde entro con mi nota?" onAction={() => router.push('/simulador')} />
    <CatalogueToolbar query={q} onQuery={setQ} placeholder="Carrera o universidad…" count={filterCount} onFilters={() => setFiltersOpen(true)} onClear={clearFilters}
      chips={[branch !== 'todas' ? branchLabel[branch] : null, city, uni, mode ? admissionModeLabel(mode) : null, withoutCutoff ? 'Sin nota de corte' : null, sort === 'asc' ? 'Menor nota primero' : null].filter(Boolean) as string[]} />
    {ready ? <CatalogueResults count={total} noun={total === 1 ? 'titulación' : 'titulaciones'} note="Cada nota conserva su curso. Es una referencia, no una garantía de admisión." /> : null}

  </View>;

  // Siempre la variante lista de Screen (esqueletos dentro del vacío): si la
  // cabecera se desmontara al cargar, el buscador perdería el foco al teclear.
  const empty = !ready && list.status !== 'error'
    ? <SkeletonList count={5} height={96} radius={R.md} />
    : list.status === 'error' ? (
      <EmptyState icon={GraduationCap} title="No se pudieron cargar"
        subtitle="Revisa tu conexión e inténtalo de nuevo."
        cta="Reintentar" onCta={() => setReloadNonce((n) => n + 1)} />
    ) : (total === 0 && !hasFilters ? (
      <EmptyState icon={GraduationCap} title="Aún no hay notas aquí"
        subtitle="Vamos cargando las notas de corte oficiales universidad a universidad. Vuelve pronto: la tuya está de camino." />
    ) : (
      <EmptyState icon={GraduationCap} title="Sin resultados"
        subtitle="Prueba con otra titulación, campus o modalidad, o quita algún filtro."
        cta={hasFilters ? 'Quitar filtros' : undefined} onCta={clearFilters} />
    ));
  const footer = list.loadingMore
    ? <View style={{ paddingVertical: S.lg }}><ActivityIndicator color={C.muted} accessibilityLabel="Cargando más titulaciones" /></View>
    : list.moreError
      ? <View style={{ paddingVertical: S.md, alignItems: 'center' }}><Btn variant="link" label="Reintentar" onPress={() => fetchMore(true)} /></View>
      : null;

  return (
    <><Screen<CutOffRow>
      title="Carreras y notas de corte"
      back
      data={ready ? list.rows : []}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
    />{filterModal}</>
  );
}
