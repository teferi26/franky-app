// ─── Ficha de universidad ────────────────────────────────────────────────
// Portada, logo, cifras clave (Stat), atajos y la lista de grados con su nota
// de corte. La nota va en Outfit para que se lea como cifra, no como texto.
import { trackAcademicConsultation } from '@/lib/academic-analytics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Linking, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { GraduationCap, ChevronRight, Compass, Flame, Globe } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Lightbox } from '@/components/Lightbox';
import { Pill, SectionHeader, SkeletonList, Skeleton, Btn, Tap, EmptyState, Card, NavRow, SearchBar, Chip } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { UNIVERSITY_GALLERIES } from '@/lib/university-gallery';
import { getUniversity, getCareers } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { branchLabel } from '@/lib/format';
import { courseAdmission, filterUniversityCourses, universityCourseOptions } from '@/lib/university-catalogue';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, F, S, R, FONT } from '@/theme';
import { toastError } from '@/lib/toast';
import { universityEvidence, hasUniversityEvidenceRecord, universityCheckedDate, type UniversityEvidence } from '@/lib/university-evidence';
import type { University, Career } from '@/lib/types';

function FactSource({ evidence, period = false }: { evidence: UniversityEvidence | null; period?: boolean }) {
  if (!evidence) return period ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Periodo no documentado</Text> : null;
  return <View style={{ gap: 6 }}>
    {period && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{evidence.period ?? 'Periodo no documentado'}</Text>}
    {evidence.note && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{evidence.note}</Text>}
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Comprobado el {universityCheckedDate(evidence.checked_at)}.</Text>
    {evidence.sources.map(source => <Tap key={source.url} onPress={() => Linking.openURL(source.url).catch(() => toastError('No se pudo abrir la fuente'))}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blue, textDecorationLine: 'underline' }]}>{source.title}</Text></Tap>)}
  </View>;
}

// Cifra clave de la ficha: rótulo pequeño arriba y el número grande debajo,
// contando al entrar. Sin tarjetas de colores ni iconos en cuadrados.
function Fact({ label, value, digits = 0 }: { label: string; value: number | null | undefined; digits?: number }) {
  return (
    <View style={{ flex: 1, minWidth: 130, gap: 2 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text>
      {value == null ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 24, fontFamily: FONT.display, color: C.muted }}>—</Text>
      ) : (
        <AnimatedNumber value={value} decimals={digits} style={{ fontSize: 24, letterSpacing: -0.6 }} />
      )}
    </View>
  );
}

export default function UniDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <UniversityDetails key={String(id)} id={String(id)} />;
}

// A new university owns a fresh list and filters. A delayed request for the
// previous campus cannot appear under the next university's heading.
function UniversityDetails({ id }: { id: string }) {
  const router = useRouter();
  const [u, setU] = useState<University | null | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('');
  const [campus, setCampus] = useState('');
  const [campusImage, setCampusImage] = useState<string | null>(null);
  const clearFilters = () => { setQuery(''); setBranch(''); setCampus(''); };
  useEffect(() => { clearFilters(); }, [id]);
  const careersFetch = useCallback(() => getCareers(String(id)), [id]);
  const { rows: careers, loading: loadingCareers, error: careersError, refresh: refreshCareers } = useFetch(careersFetch, `careers:${id}`);

  const filtered = useMemo(() => filterUniversityCourses(careers ?? [], { query, branch, campus }), [careers, query, branch, campus]);
  const branches = useMemo(() => universityCourseOptions(careers ?? [], 'branch'), [careers]);
  const campuses = useMemo(() => universityCourseOptions(careers ?? [], 'campus'), [careers]);
  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelva la
  // carga, no hay setState sobre un componente desmontado. Se usa un ref (y no
  // una variable local del efecto) porque load también sirve para "Reintentar".
  const alive = useRef(true);
  const generation = useRef(0);
  const load = useCallback(() => {
    const current = ++generation.current;
    setU(undefined);
    getUniversity(String(id))
      .then((v) => { if (alive.current && current === generation.current) setU(v); })
      .catch(() => { if (alive.current && current === generation.current) setU(null); });
  }, [id]);
  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; generation.current++; };
  }, [load]);

  useEffect(() => { if (u?.id) void trackAcademicConsultation('university', u.id); }, [u?.id]);
  // Esqueleto con la forma real de la ficha: portada, cabecera, cifras y filas.
  if (u === undefined) return (
    <Screen title="Universidad" back>
      <Skeleton height={190} radius={0} style={{ marginHorizontal: 0 }} />
      <Skeleton height={64} radius={R.md} style={{ marginTop: S.lg }} />
      <Skeleton height={56} radius={R.md} />
      <SkeletonList count={3} height={60} radius={R.md} />
    </Screen>
  );
  if (u === null) return (
    <Screen title="Universidad" back>
      <EmptyState icon={GraduationCap} title="No se pudo cargar"
        subtitle="No encontramos esta universidad o falla tu conexión. Inténtalo de nuevo."
        cta="Reintentar" onCta={load} />
    </Screen>
  );

  const website = u.website && /^https?:\/\//i.test(u.website) ? u.website : null;
  const generated = UNIVERSITY_GALLERIES[u.slug];
  const descriptionEvidence = universityEvidence(u, 'description');
  const heroImage = generated?.images[0] ?? u.image_url;
  const heroIsLogo = !generated && !!heroImage && (heroImage === u.logo_url || /\.svg(?:[/?#]|$)/i.test(heroImage));
  const header = <>
      {/* Cabecera tipográfica: primero el rótulo y el nombre, la foto después y
          siempre dentro de un marco redondeado (nunca a sangre ni con velo). */}
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, gap: 8 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{u.city} · {u.comunidad_autonoma}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, letterSpacing: -0.7 }]}>{u.name}</Text>
            </View>
            {u.logo_url ? (
              <Image source={{ uri: u.logo_url }} style={{ width: 54, height: 54, borderRadius: R.md, backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }} contentFit="contain" cachePolicy="memory-disk" />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pill label={u.type === 'publica' ? 'Pública' : 'Privada'} tone={u.type === 'publica' ? 'blue' : 'gray'} />
            {u.short_name ? <Pill label={u.short_name} tone="gray" /> : null}
          </View>
        </View>
      </FadeIn>

      {heroImage ? (
        <FadeIn index={1}>
          <View style={{ marginHorizontal: S.lg, marginTop: S.lg, borderRadius: R.xl, overflow: 'hidden', backgroundColor: C.input, borderWidth: 0.5, borderColor: C.borderLight }}>
            <Image source={{ uri: heroImage }} accessibilityLabel={`${heroIsLogo ? 'Logotipo' : generated ? 'Recreación del campus' : 'Imagen'} de ${u.name}`} style={{ width: '100%', height: 190 }} contentFit={heroIsLogo ? 'contain' : 'cover'} cachePolicy="memory-disk" transition={150} />
          </View>
        </FadeIn>
      ) : null}
      {generated && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { paddingHorizontal: S.lg, paddingTop: 8 }]}>{generated.label}</Text>}
      <View style={{ padding: S.lg, gap: 14 }}>
        <FadeIn index={2}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 140 }}><Btn full small icon={Flame} label="Ver su FOMO" onPress={() => router.push({ pathname: '/fomo-uni/[id]', params: { id: u.id, name: u.short_name ?? u.name } })} /></View>
            {website && <View style={{ flex: 1, minWidth: 140 }}><Btn full small variant="secondary" icon={Globe} label="Web oficial" onPress={() => Linking.openURL(website).catch(() => toastError('No se pudo abrir la web oficial'))} /></View>}
          </View>
        </FadeIn>

        {/* Cifras clave: rótulo + número grande, en dos columnas y sin recuadros. */}
        <FadeIn index={3}>
          <View style={{ gap: 14, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 8, paddingTop: 12 }}>
              <Fact label="Estudiantes" value={u.student_count ?? null} />
              <Fact label="Campus" value={u.campus_count ?? null} />
              <Fact label="Ofertas en Franky" value={careers ? careers.length : null} />
              <View style={{ flex: 1, minWidth: 130, gap: 2 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Fundación</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 24, fontFamily: FONT.display, color: u.founded_year ? C.text : C.muted, fontVariant: ['tabular-nums'] }}>
                  {u.founded_year ? String(u.founded_year) : '—'}
                </Text>
              </View>
            </View>
            {u.student_count ? <View style={{ gap: 4 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Recuento de estudiantes</Text><FactSource evidence={universityEvidence(u, 'student_count')} period /></View> : null}
            {universityEvidence(u, 'campus_count') && <View style={{ gap: 4 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Campus de la universidad</Text><FactSource evidence={universityEvidence(u, 'campus_count')} /></View>}
          </View>
        </FadeIn>

        {u.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted, lineHeight: 23 }]}>{u.description}</Text> : null}
        {descriptionEvidence && <FactSource evidence={descriptionEvidence} />}
        {!descriptionEvidence && hasUniversityEvidenceRecord(u, 'description') && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Fuente de esta descripción pendiente de comprobar.</Text>}
        {!descriptionEvidence && !hasUniversityEvidenceRecord(u, 'description') && u.description && u.wiki_link && /^https?:\/\//i.test(u.wiki_link) ? <View style={{ gap: 6 }}>
          <Tap onPress={() => Linking.openURL(u.wiki_link!).catch(() => toastError('No se pudo abrir la fuente'))}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blue }]}>Texto adaptado de Wikipedia</Text></Tap>
          <Tap onPress={() => Linking.openURL('https://creativecommons.org/licenses/by-sa/4.0/deed.es').catch(() => toastError('No se pudo abrir la licencia'))}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blue }]}>CC BY-SA 4.0</Text></Tap>
        </View> : null}
        {generated && <View style={{ gap: 10 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Un vistazo al campus</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Desliza para ver las {generated.images.length} imágenes. Toca una para ampliarla.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {generated.images.map((uri, index) => <Tap key={uri} onPress={() => setCampusImage(uri)} accessibilityLabel={`Ampliar recreación con IA ${index + 1} de ${u.name}`}><Image source={{ uri }} accessibilityLabel={`Recreación con IA, vista ${index + 1}`} style={{ width: 260, height: 155, borderRadius: R.lg }} contentFit="cover" cachePolicy="memory-disk" /></Tap>)}
          </ScrollView>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Recreaciones con IA; los detalles pueden variar respecto al campus actual.</Text>
          <Tap accessibilityLabel="Ver la referencia real del campus" onPress={() => Linking.openURL(generated.reference).catch(() => toastError('No se pudo abrir la referencia'))}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blue }]}>Referencia de {generated.author}</Text></Tap>
          <Tap accessibilityLabel="Ver la licencia de la galería" onPress={() => Linking.openURL(generated.licenseUrl).catch(() => toastError('No se pudo abrir la licencia'))}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.blue }]}>{generated.license}</Text></Tap>
        </View>}

      </View>

      <Card style={{ padding: 0 }}>
        <NavRow icon={Compass} title="¿Qué carrera estudiar?" note="Haz el test vocacional y descúbrelo"
          onPress={() => router.push('/test-vocacional')} />
      </Card>

      <SectionHeader title="Grados" subtitle={loadingCareers ? 'Cargando la oferta académica…' : careersError ? 'No se pudo cargar el catálogo' : `${careers?.length ?? 0} ofertas académicas · cada nota conserva su curso`} />
      <SearchBar value={query} onChange={setQuery} placeholder="Buscar carrera o campus"/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:S.lg,paddingBottom:12}}><Chip label="Todas las ramas" active={!branch} onPress={()=>setBranch('')}/>{branches.map(b=><Chip key={b} label={branchLabel[b]??b} active={branch===b} onPress={()=>setBranch(b)}/>)}</ScrollView>
      {campuses.length > 1 ? <><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label,{paddingHorizontal:S.lg,paddingBottom:8}]}>Campus o centro</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:S.lg,paddingBottom:12}}><Chip label="Todos los campus" active={!campus} onPress={()=>setCampus('')}/>{campuses.map(value=><Chip key={value} label={value} active={campus===value} onPress={()=>setCampus(value)}/>)}</ScrollView></> : null}
      {!loadingCareers && !careersError ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" style={[F.tiny,{paddingHorizontal:S.lg,paddingBottom:14}]}>{filtered.length} ofertas encontradas. Un mismo grado puede aparecer en distintos campus o programas.</Text> : null}
      {query.trim() || branch || campus ? <View style={{paddingHorizontal:S.lg,paddingBottom:12}}><Btn variant="secondary" small label="Quitar filtros" onPress={clearFilters}/></View> : null}
    </>;
  const renderCareer = ({ item: c, index }: { item: Career; index: number }) => {
    const admission = courseAdmission(c);
    return (
      <FadeIn index={index}>
          <Tap key={c.id} haptic={false} onPress={() => router.push(`/carrera/${c.id}`)}
            accessibilityLabel={`${c.name}, ${c.campus ?? ''}, ${admission.note}: ${admission.label}, ${admission.period}`}>
            {/* Fila densa: el nombre manda y la nota va a la derecha en cifra tabular. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 12, minHeight: 62, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { letterSpacing: -0.2 }]} numberOfLines={3}>{c.name}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]} numberOfLines={1}>
                  {branchLabel[c.branch] ?? c.branch}{c.campus ? ` · ${c.campus}` : ''}{c.modality && c.modality !== 'presencial' ? ` · ${c.modality}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', maxWidth: 112 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 19, fontFamily: FONT.display, letterSpacing: -0.4, fontVariant: ['tabular-nums'], color: c.cut_off_score != null ? C.text : C.muted }}>
                  {admission.label}
                </Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{admission.period}</Text>
              </View>
              <ChevronRight size={16} color={C.muted} strokeWidth={1.9} />
            </View>
          </Tap>
      </FadeIn>
  );
  };
  return <><Screen<Career> title={u.short_name ?? u.name} back data={filtered} renderItem={renderCareer} keyExtractor={c=>c.id} ListHeaderComponent={header} ListEmptyComponent={loadingCareers ? <SkeletonList count={3} height={60} radius={R.md}/> : careersError ? <EmptyState icon={GraduationCap} title="No se cargaron las carreras" subtitle="Revisa tu conexión e inténtalo de nuevo." cta="Reintentar" onCta={refreshCareers}/> : <EmptyState compact icon={GraduationCap} title={careers?.length ? 'No hay resultados' : 'Catálogo pendiente'} subtitle={careers?.length ? 'Prueba con otra carrera o campus.' : 'Consulta las titulaciones en la web oficial.'} cta={careers?.length ? 'Quitar filtros' : undefined} onCta={clearFilters}/>}/>{campusImage && <Lightbox uri={campusImage} onClose={() => setCampusImage(null)} />}</>;
}
