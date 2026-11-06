import { formatAcademicScore } from '@/lib/academic-score';
// ─── Simulador de admisión: "con tu nota, ¿en qué entras?" ─────────────────
// Réplica móvil de la web /simulador. Todo el cálculo es local sobre el
// catálogo de notas de corte (getCutOffScores, el mismo que /notas-corte):
// cambiar la nota no dispara ninguna petición. Sin deslizador nativo para no
// meter dependencias: botones de +/-0,1 y +/-1 sobre una cifra grande, más
// entrada numérica para escribirla directamente.
//
// REGLA DE ORO (igual que en notas-corte): los valores se pintan TAL CUAL
// vienen de la BD; el "margen" es tu nota menos la de corte, sin redondear
// la de corte. Solo cuentan las titulaciones con nota publicada (> 0).
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Share } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Calculator, ChevronRight, Minus, Plus, Share2, TrendingUp, GraduationCap } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Pill, SkeletonList, EmptyState, Tap, Card } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { getCutOffScores, type CutOffRow } from '@/lib/api';
import { branchLabel } from '@/lib/format';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

const MIN_NOTA = 5;
const MAX_NOTA = 14;
const PAGE = 60;

const BRANCHES = [
  'todas', 'ciencias_salud', 'ingenieria_arquitectura',
  'ciencias_sociales_juridicas', 'ciencias', 'artes_humanidades',
];

const clamp = (v: number) => Math.min(MAX_NOTA, Math.max(MIN_NOTA, v));
/** Redondea a 2 decimales para evitar 10,100000001 tras sumar 0,1. */
const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtNota = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Fila memoizada: cada pulsación de +/- recalcula el margen de TODAS las
// titulaciones al alcance; sin memo, la lista entera se repintaba de golpe.
const ReachRow = memo(function ReachRow({ c, nota, onOpen }: { c: CutOffRow; nota: number; onOpen: (id: string) => void }) {
  const corte = Number(c.cut_off_score);
  const margen = round2(nota - corte);
  // Margen holgado (>= 0,5) en verde; justo, en naranja: la nota de corte
  // cambia cada año y con poco margen no hay garantía.
  const tone = margen >= 0.5 ? 'green' : 'orange';
  return (
    <Tap haptic={false} onPress={() => onOpen(c.id)}
      accessibilityLabel={`${c.name}, nota de corte ${formatAcademicScore(c.cut_off_score)}, margen ${fmtNota(margen)}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { fontSize: 15.5, letterSpacing: -0.2 }]} numberOfLines={2}>{c.name}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>
            {c.universities?.short_name ?? c.universities?.name ?? 's/d'}
            {c.universities?.city ? ` · ${c.universities.city}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{branchLabel[c.branch] ?? c.branch}</Text>
            <Pill tone={tone} label={`Margen +${fmtNota(margen)}`} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 74 }}>
          {/* Nota oficial con coma decimal y precisión de milésimas */}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 25, lineHeight: 29, letterSpacing: -0.8, fontVariant: ['tabular-nums'] }]}>{formatAcademicScore(c.cut_off_score)}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{c.cut_off_year ? `${c.cut_off_year}/${c.cut_off_year + 1}` : 'Curso por confirmar'}</Text>
        </View>
        <ChevronRight size={16} color={C.muted} strokeWidth={1.9} />
      </View>
    </Tap>
  );
});

export default function Simulador() {
  const router = useRouter();
  const [rows, setRows] = useState<CutOffRow[] | null>(null);
  const [errored, setErrored] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [nota, setNota] = useState(10);
  // Texto del campo: se sincroniza con la cifra al pulsar +/- y se aplica al
  // salir del campo, para poder escribir "11," sin que salte a mitad.
  const [notaText, setNotaText] = useState(fmtNota(10));
  const [branch, setBranch] = useState('todas');
  const [city, setCity] = useState('');
  const [uni, setUni] = useState('');
  const [visible, setVisible] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getCutOffScores(); // fail-soft: nunca lanza
      if (!alive) return;
      setRows(r.rows);
      setErrored(!r.live);
    })();
    return () => { alive = false; };
  }, [reloadNonce]);

  // Solo titulaciones con nota publicada y mayor que 0 (como la web).
  const scored = useMemo(
    () => (rows ?? []).filter((c) => c.cut_off_score != null && Number(c.cut_off_score) > 0),
    [rows],
  );

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const c of scored) if (c.universities?.city) set.add(c.universities.city);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [scored]);

  const unis = useMemo(() => {
    const set = new Set<string>();
    for (const c of scored) {
      if (city && c.universities?.city !== city) continue;
      if (c.universities?.name) set.add(c.universities.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [scored, city]);

  const pickCity = useCallback((next: string) => { setCity(next); setUni(''); setVisible(PAGE); }, []);

  // Universo tras filtros (para el porcentaje) y las que están a tu alcance.
  const { pool, reach, byBranch } = useMemo(() => {
    let p = scored;
    if (branch !== 'todas') p = p.filter((c) => c.branch === branch);
    if (city) p = p.filter((c) => c.universities?.city === city);
    if (uni) p = p.filter((c) => c.universities?.name === uni);
    const r = p
      .filter((c) => Number(c.cut_off_score) <= nota)
      .sort((a, b) => Number(b.cut_off_score) - Number(a.cut_off_score));
    const map = new Map<string, number>();
    for (const c of r) map.set(c.branch, (map.get(c.branch) ?? 0) + 1);
    return { pool: p, reach: r, byBranch: [...map.entries()].sort((a, b) => b[1] - a[1]) };
  }, [scored, branch, city, uni, nota]);

  const pct = pool.length > 0 ? Math.round((reach.length / pool.length) * 100) : 0;

  const applyNota = useCallback((next: number) => {
    const v = round2(clamp(next));
    setNota(v);
    setNotaText(fmtNota(v));
    setVisible(PAGE);
  }, []);
  const step = (d: number) => applyNota(nota + d);
  const commitText = () => {
    const parsed = Number(notaText.replace(',', '.').trim());
    if (Number.isFinite(parsed)) applyNota(parsed);
    else setNotaText(fmtNota(nota));
  };

  const share = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await Share.share({
        message: `Con un ${fmtNota(nota)} llego a ${reach.length.toLocaleString('es-ES')} carreras. Compruébalo con tu nota: https://franky.es/simulador?nota=${nota.toFixed(2)}`,
      });
    } catch { /* hoja cancelada: no es un error */ }
  };

  const open = useCallback((id: string) => router.push(`/carrera/${id}`), [router]);
  const renderItem = useCallback(({ item, index }: { item: CutOffRow; index: number }) => (
    <FadeIn index={index}><ReachRow c={item} nota={nota} onOpen={open} /></FadeIn>
  ), [open, nota]);

  const stepBtn = (label: string, delta: number, Icon: typeof Plus) => (
    <Tap onPress={() => step(delta)} haptic accessibilityLabel={`${delta > 0 ? 'Subir' : 'Bajar'} ${label}`}
      style={{ minWidth: 60, height: 44, borderRadius: R.md, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2, paddingHorizontal: 8 }}>
      <Icon size={14} color={C.text} strokeWidth={2.4} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.text }}>{label}</Text>
    </Tap>
  );

  const header = (
    <View>
      {/* Control de nota */}
      <FadeIn>
      <Card style={{ marginTop: S.lg, alignItems: 'center', gap: 10 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tu nota de admisión (sobre 14)</Text>
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[F.display, { fontSize: 58, color: C.blue, lineHeight: 66, letterSpacing: -2, fontVariant: ['tabular-nums'] }]}>{fmtNota(nota)}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {stepBtn('1', -1, Minus)}
          {stepBtn('0,1', -0.1, Minus)}
          {stepBtn('0,1', 0.1, Plus)}
          {stepBtn('1', 1, Plus)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>O escríbela</Text>
          <TextInput
            value={notaText}
            onChangeText={setNotaText}
            onBlur={commitText}
            onSubmitEditing={commitText}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel="Nota de admisión"
            placeholder="10,00" placeholderTextColor={C.muted}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{
              minWidth: 96, textAlign: 'center', backgroundColor: C.input, borderRadius: R.md, minHeight: 44,
              paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, fontFamily: FONT.semibold, color: C.text,
            }}
          />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>Entre {MIN_NOTA} y {MAX_NOTA}. Cada botón mueve la nota.</Text>
      </Card>
      </FadeIn>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.sm }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
        {BRANCHES.map((b) => (
          <Chip key={b} label={b === 'todas' ? 'Todas las ramas' : branchLabel[b]}
            active={branch === b} onPress={() => { setBranch(b); setVisible(PAGE); }} accessibilityRole="tab" />
        ))}
      </ScrollView>
      {cities.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.sm }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
          <Chip label="Todas las ciudades" active={!city} onPress={() => pickCity('')} accessibilityRole="tab" />
          {cities.map((ci) => <Chip key={ci} label={ci} active={city === ci} onPress={() => pickCity(ci)} accessibilityRole="tab" />)}
        </ScrollView>
      ) : null}
      {unis.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.sm }} contentContainerStyle={{ paddingHorizontal: S.lg }}>
          <Chip label="Todas las unis" active={!uni} onPress={() => { setUni(''); setVisible(PAGE); }} accessibilityRole="tab" />
          {unis.map((u) => <Chip key={u} label={u} active={uni === u} onPress={() => { setUni(u); setVisible(PAGE); }} accessibilityRole="tab" />)}
        </ScrollView>
      ) : null}

      {/* Resultado */}
      {rows !== null && !errored ? (
        <Card flat style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <AnimatedNumber value={reach.length} duration={520} style={{ fontSize: 38, lineHeight: 44, letterSpacing: -1.2, color: C.blue }} />
            <View style={{ flex: 1, paddingBottom: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontFamily: FONT.semibold }]}>
                {reach.length === 1 ? 'carrera a tu alcance' : 'carreras a tu alcance'}
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>el {pct}% de las {pool.length.toLocaleString('es-ES')} con nota publicada</Text>
            </View>
          </View>
          {byBranch.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Por rama</Text>
              {byBranch.map(([b, n]) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { width: 118 }]} numberOfLines={1}>{branchLabel[b] ?? b}</Text>
                  {/* Filete de progreso en el acento, sin degradado. */}
                  <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: reach.length, now: n }}
                    style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: C.borderLight, overflow: 'hidden' }}>
                    <View style={{ width: `${reach.length > 0 ? (n / reach.length) * 100 : 0}%`, height: '100%', backgroundColor: C.blue }} />
                  </View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { width: 40, textAlign: 'right', color: C.text, fontFamily: FONT.semibold, fontVariant: ['tabular-nums'] }]}>{n}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
              No hay titulaciones con nota publicada que encajen con esta nota y estos filtros. Puedes revisar otras opciones en el catálogo.
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <View style={{ flex: 1 }}>
              <Btn small full label="Compartir mi resultado" icon={Share2} onPress={share} />
            </View>
            <Btn small variant="secondary" label="Ver todas" onPress={() => router.push('/notas-corte')} />
          </View>
        </Card>
      ) : null}

      {!errored && rows?.some(c => c.admission_without_cutoff) && <Card style={{ gap: 8 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>También hay acceso sin nota de corte</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>El catálogo incluye {rows.filter(c => c.admission_without_cutoff).length} titulaciones sin corte. Debes cumplir su vía de acceso y el plazo de matrícula. Se muestran aparte del cálculo por nota.</Text>
        <Btn small variant="secondary" label="Ver titulaciones y requisitos" onPress={() => router.push('/notas-corte?acceso=sin-corte')} />
      </Card>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: S.lg, marginBottom: S.sm }}>
        <TrendingUp size={13} color={C.muted} strokeWidth={2} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>Cada nota conserva su curso de referencia. La comparación orienta y no garantiza plaza.</Text>
      </View>
      {reach.length > 0 ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { paddingHorizontal: S.lg, paddingBottom: S.sm }]}>
          A las que llegas, de mayor a menor corte
        </Text>
      ) : null}
    </View>
  );

  const footer = reach.length > visible ? (
    <View style={{ paddingVertical: S.md, alignItems: 'center' }}>
      <Btn variant="link" label={`Ver más (${reach.length - visible})`} onPress={() => setVisible((v) => v + PAGE)} />
    </View>
  ) : null;

  if (rows === null) {
    return (
      <Screen title="Simulador de admisión" back>
        {header}
        <SkeletonList count={5} height={84} radius={R.sm} />
      </Screen>
    );
  }

  return (
    <Screen<CutOffRow>
      title="Simulador de admisión"
      subtitle="Con tu nota, ¿en qué entras?"
      back
      data={reach.slice(0, visible)}
      renderItem={renderItem}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={
        errored ? (
          <EmptyState icon={Calculator} title="No se pudieron cargar las notas"
            subtitle="Revisa tu conexión e inténtalo de nuevo."
            cta="Reintentar" onCta={() => { setRows(null); setErrored(false); setReloadNonce((n) => n + 1); }} />
        ) : scored.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Aún no hay notas aquí" compact
            subtitle="Vamos cargando las notas de corte oficiales universidad a universidad. Vuelve pronto." />
        ) : (
          <EmptyState icon={GraduationCap} title="Ninguna con estos filtros" compact
            subtitle="Sube la nota o quita algún filtro para ver titulaciones." />
        )
      }
    />
  );
}
