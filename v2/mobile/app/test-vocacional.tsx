// ─── Test vocacional (nativo) ────────────────────────────────────────────
// Muestra el RESULTADO guardado del usuario con la RPC get_my_vocational_result
// (migración 030): carreras, universidades y ciudades recomendadas, más el
// perfil de personalidad (Holland/MBTI, narrativa, fortalezas, estilo de
// trabajo). El test en sí es un motor adaptativo muy grande que vive en la web
// (RIASEC + Big Five + matching de cientos de carreras); reproducirlo en el
// móvil daría resultados peores, así que HACER el test abre la versión web
// (${WEB_URL}/test-vocacional) como fallback honesto y el resultado se guarda
// solo en Supabase, listo para verlo aquí.
import React, { useCallback, useRef, useState } from 'react';
import { AppState, Platform, View, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Compass, Lock, GraduationCap, Building2, MapPin, Sparkles, Award, Briefcase, ExternalLink } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { EmptyState, Pill, Btn, Skeleton, SkeletonList, Card, SectionHeader } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { supabase, WEB_URL } from '@/lib/supabase';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { isCurrentVocationalResult } from '@/lib/vocational-version';
import { C, S, F, R, FONT } from '@/theme';

type CareerMatch = {
  career_id?: string;
  name: string; branch?: string; score?: number; justification?: string;
  university_name?: string; university_short?: string; city?: string;
  cut_off?: number | null; is_aspirational?: boolean;
  cut_off_year?: number | null; campus?: string | null; modality?: string | null;
};
type UniMatch = { name: string; short_name?: string; city?: string; score?: number; campus?: string | null; modality?: string | null };
type CityMatch = { name: string; comunidad?: string; score?: number };
type VocResult = {
  profile_snapshot?: Record<string, unknown> | null;
  created_at: string;
  top_categories: string[] | null;
  mbti_type: string | null;
  holland_code: string | null;
  personality_narrative: string | null;
  strengths: string[] | null;
  work_style: string | null;
  top_careers: CareerMatch[] | null;
  top_universities: UniMatch[] | null;
  top_cities: CityMatch[] | null;
  questions_answered: number | null;
};

// RIASEC → etiqueta humana para las categorías dominantes.
const RIASEC: Record<string, string> = {
  R: 'Realista', I: 'Investigador', A: 'Artístico',
  S: 'Social', E: 'Emprendedor', C: 'Convencional',
};

// Porcentaje de afinidad: píldora verde del kit (antes un verde fijo que no
// existía en la paleta y se veía apagado en oscuro).
function Score({ value }: { value?: number }) {
  if (value == null) return null;
  return <AnimatedNumber value={Math.round(value)} suffix=" % afinidad" duration={900}
    style={{ fontSize: 13, letterSpacing: -0.1, color: C.success }} />;
}

function CareerCard({ c, rank, onOpen }: { c: CareerMatch; rank: number; onOpen?: () => void }) {
  return (
    <Card style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {/* Numero de orden como cifra editorial, no dentro de un circulo. */}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.display, fontSize: 20, letterSpacing: -0.5, color: C.muted, fontVariant: ['tabular-nums'], minWidth: 22 }}>{rank}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1, fontSize: 16, letterSpacing: -0.25 }]}>{c.name}</Text>
        <Score value={c.score} />
      </View>
      {c.university_name || c.city ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
          {c.university_short || c.university_name || ''}{c.city ? ` · ${c.city}` : ''}
          {c.cut_off != null ? ` · corte de referencia${c.cut_off_year ? ` ${c.cut_off_year}` : ''}: ${c.cut_off.toLocaleString('es-ES', { maximumFractionDigits: 3 })}` : ''}
        </Text>
      ) : null}
      {c.campus || c.modality ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{[c.campus, c.modality].filter(Boolean).join(' · ')}</Text> : null}
      {c.is_aspirational ? <View style={{ alignSelf: 'flex-start' }}><Pill label="Corte superior a tu nota" tone="orange" /></View> : null}
      {c.justification ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{c.justification}</Text> : null}
      {onOpen ? <Btn variant="ghost" small label="Ver carrera y requisitos" onPress={onOpen} /> : null}
    </Card>
  );
}

const loadingSkeleton = (
  <View style={{ paddingTop: S.lg }}>
    <Skeleton height={22} radius={R.full} style={{ width: 180 }} />
    <Skeleton height={120} radius={R.lg} />
    <SkeletonList count={3} height={96} radius={R.lg} />
  </View>
);

export default function TestVocacional() {
  const { uid, isCurrent } = useSessionIdentity();
  const router = useRouter();
  if (uid === undefined) return <Screen title="Test vocacional" back>{loadingSkeleton}</Screen>;
  if (!uid) return <Screen title="Test vocacional" back><EmptyState icon={Lock} title="Descubre qué estudiar" subtitle="Inicia sesión para ver tu orientación y guardar el test." cta="Iniciar sesión" onCta={() => router.push('/welcome')} /></Screen>;
  return <OwnedVocationalResult key={uid} owner={uid} isCurrent={isCurrent} />;
}

function OwnedVocationalResult({ owner, isCurrent }: { owner: string; isCurrent: () => boolean }) {
  const router = useRouter();
  const request = useRef(0);
  const focused = useRef(false);
  const pendingTest = useRef<{ id: number; background: boolean } | null>(null);
  const testSequence = useRef(0);
  const [browserError, setBrowserError] = useState(false);
  const [gate, setGate] = useState<'loading' | 'no-auth' | 'ok'>('loading');
  const [result, setResult] = useState<VocResult | null | undefined>(undefined);
  // Fallo de red al cargar: se enseña con "Reintentar" en vez de dejar el
  // esqueleto (gate en 'loading') o fingir que no hay resultado.
  const [loadErr, setLoadErr] = useState(false);

  const load = useCallback(async () => {
    const run = ++request.current;
    const current = () => focused.current && run === request.current && isCurrent();
    if (!current()) return;
    setLoadErr(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!current()) return;
      if (!user || user.id !== owner) { setResult(undefined); setGate('no-auth'); return; }
      setGate('ok');
      const { data, error } = await supabase.rpc('get_my_vocational_result');
      if (!current()) return;
      if (error) {
        // La RPC no existe aún (migración 030 sin aplicar): no hay resultado.
        // Cualquier otro error (red) es un fallo y se ofrece reintentar.
        const missing = error.code === '42883' || error.code === 'PGRST202' || /does not exist|could not find/i.test(error.message ?? '');
        if (missing) { setResult(null); return; }
        setLoadErr(true);
        return;
      }
      setResult((data as VocResult) ?? null);
    } catch {
      if (!current()) return;
      // getUser o la RPC han lanzado (sin red): sin esto gate se quedaba en
      // 'loading' y la pantalla en esqueleto para siempre.
      setLoadErr(true);
    }
  }, [owner, isCurrent]);

  const refreshAfterTest = useCallback((id: number) => {
    if (pendingTest.current?.id !== id) return;
    pendingTest.current = null;
    if (focused.current && isCurrent()) void load();
  }, [isCurrent, load]);

  const launchTest = useCallback(async (repeat: boolean) => {
    if (!focused.current || !isCurrent() || pendingTest.current) return;
    const attempt = { id: ++testSequence.current, background: false };
    pendingTest.current = attempt;
    setBrowserError(false);
    try {
      const response = await WebBrowser.openBrowserAsync(`${WEB_URL}/test-vocacional${repeat ? '?redo=1' : ''}`);
      // iOS resolves on dismissal. Android resolves immediately with `opened`;
      // only its subsequent background -> active transition means a return.
      if (response.type !== 'opened') refreshAfterTest(attempt.id);
    } catch {
      if (pendingTest.current?.id !== attempt.id) return;
      pendingTest.current = null;
      if (focused.current && isCurrent()) setBrowserError(true);
    }
  }, [isCurrent, refreshAfterTest]);
  const openTest = () => { void launchTest(false); };
  const repeatTest = () => { void launchTest(true); };

  // Router focus does not change when an in-app browser is dismissed.
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== owner) { request.current += 1; pendingTest.current = null; setResult(undefined); }
    });
    const appState = AppState.addEventListener('change', state => {
      if (Platform.OS !== 'android') return;
      const attempt = pendingTest.current;
      if (!attempt) return;
      if (state === 'background' || state === 'inactive') attempt.background = true;
      else if (state === 'active' && attempt.background) refreshAfterTest(attempt.id);
    });
    void load();
    return () => { focused.current = false; request.current += 1; pendingTest.current = null; appState.remove(); data.subscription.unsubscribe(); };
  }, [load, owner, refreshAfterTest]));

  if (loadErr) {
    return (
      <Screen title="Test vocacional" back>
        <EmptyState icon={Compass} title="No se pudo cargar"
          subtitle="No pudimos traer tu resultado. Revisa tu conexión e inténtalo de nuevo."
          cta="Reintentar" onCta={load} />
      </Screen>
    );
  }
  if (gate === 'loading') {
    return <Screen title="Test vocacional" back>{loadingSkeleton}</Screen>;
  }
  if (gate === 'no-auth') {
    return (
      <Screen title="Test vocacional" back>
        <EmptyState icon={Lock} title="Descubre qué estudiar"
          subtitle="Inicia sesión para hacer el test vocacional y guardar tu resultado con las carreras que mejor encajan contigo."
          cta="Iniciar sesión" onCta={() => router.push('/welcome')} />
      </Screen>
    );
  }
  if (result === undefined) {
    return <Screen title="Test vocacional" back>{loadingSkeleton}</Screen>;
  }
  if (result === null) {
    return (
      <Screen title="Test vocacional" back>
        <EmptyState icon={Compass} title="Aún no has hecho el test"
          subtitle="Responde unas preguntas y te diremos qué carreras, universidades y ciudades encajan contigo. Tu resultado quedará guardado aquí."
          cta="Hacer el test" onCta={openTest} />
        {browserError ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="alert" style={[F.small, { padding: S.lg }]}>No se pudo abrir el test. Inténtalo de nuevo.</Text> : null}
        <View style={{ paddingHorizontal: S.xl, marginTop: 4, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <ExternalLink size={13} color={C.muted} strokeWidth={2} style={{ marginTop: 2 }} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>El test se completa en la web (motor completo con cientos de carreras) y el resultado se guarda en tu cuenta para verlo desde la app.</Text>
        </View>
      </Screen>
    );
  }

  const cats = (result.top_categories ?? []).map(k => RIASEC[k] ?? k).filter(Boolean);
  const careers = result.top_careers ?? [];
  const unis = result.top_universities ?? [];
  const cities = result.top_cities ?? [];
  const strengths = result.strengths ?? [];

  return (
    <Screen title="Test vocacional" back>
      {browserError ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="alert" style={[F.small, { padding: S.lg }]}>No se pudo abrir el test. Inténtalo de nuevo.</Text> : null}
      {/* Perfil de personalidad */}
      <FadeIn>
      <View style={{ padding: S.lg, gap: 10 }}>
        <View style={{ gap: 4 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>
            Resultado del {new Date(result.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            {result.questions_answered ? ` · ${result.questions_answered} preguntas` : ''}
          </Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, letterSpacing: -0.8 }]}>Tu perfil vocacional</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {result.holland_code ? <Pill label={`Holland ${result.holland_code}`} tone="blue" /> : null}
          {result.mbti_type ? <Pill label={result.mbti_type} tone="blue" /> : null}
          {cats.map(c => <Pill key={c} label={c} />)}
        </View>
        {result.personality_narrative ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{result.personality_narrative}</Text> : null}
        {strengths.length > 0 ? (
          <View style={{ marginTop: 4, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Award size={14} color={C.muted} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tus fortalezas</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {strengths.map(s => <Pill key={s} label={s} tone="green" />)}
            </View>
          </View>
        ) : null}
        {result.work_style ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Briefcase size={15} color={C.muted} strokeWidth={1.9} style={{ marginTop: 2 }} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>{result.work_style}</Text>
          </View>
        ) : null}
      </View>
      </FadeIn>

      {!isCurrentVocationalResult(result.profile_snapshot) ? <Card style={{ gap: 10 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Puedes actualizar tus recomendaciones</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Hemos revisado cómo se comparan tus intereses y tus condiciones para estudiar. Este resultado conserva el cálculo anterior. Repite el test para actualizar tu orientación.</Text>
        <Btn label="Actualizar mi orientación" onPress={repeatTest} />
      </Card> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { padding: S.lg }]}>La afinidad orienta sobre tus preferencias; no mide la probabilidad de admisión ni garantiza una plaza.</Text>

      {/* Carreras recomendadas */}
      {careers.length > 0 ? (
        <>
          <SectionHeader title="Carreras que encajan contigo" subtitle={`${careers.length} recomendaciones`} />
          {careers.map((c, i) => (
            <FadeIn key={`${c.name}-${i}`} index={i}>
              <CareerCard c={c} rank={i + 1}
                onOpen={c.career_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c.career_id)
                  ? () => { if (isCurrent()) router.push(`/carrera/${c.career_id}`); } : undefined} />
            </FadeIn>
          ))}
        </>
      ) : null}

      {/* Universidades */}
      {unis.length > 0 ? (
        <>
          <SectionHeader title="Universidades para ti" />
          <Card style={{ padding: 0 }}>
            {unis.map((u, i) => (
              <View key={`${u.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.lg, paddingVertical: 10, minHeight: 56, borderBottomWidth: i < unis.length - 1 ? 0.5 : 0, borderBottomColor: C.borderLight }}>
                <Building2 size={18} color={C.muted} strokeWidth={1.7} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{u.short_name || u.name}</Text>
                  {u.campus || u.city || u.modality ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{[u.campus ? `Campus: ${u.campus}` : u.city ? `Sede: ${u.city}` : '', u.modality].filter(Boolean).join(' · ')}</Text> : null}
                </View>
                <Score value={u.score} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Ciudades */}
      {cities.length > 0 ? (
        <>
          <SectionHeader title="Ciudades donde encajarías" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: S.lg }}>
            {cities.map((c, i) => (
              <View key={`${c.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: R.full, paddingLeft: 12, paddingRight: 6, paddingVertical: 6 }}>
                <MapPin size={13} color={C.blue} strokeWidth={2} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{c.name}</Text>
                <Score value={c.score} />
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Rehacer */}
      <View style={{ padding: S.lg, marginTop: S.md, gap: 8 }}>
        <Btn full variant="secondary" icon={Sparkles} label="Repetir el test" onPress={repeatTest} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { textAlign: 'center' }]}>El test se completa en la web y tu nuevo resultado aparecerá aquí al volver.</Text>
        <View style={{ marginTop: 4 }}>
          <Btn full variant="ghost" icon={GraduationCap} label="Ver notas de corte" onPress={() => router.push('/notas-corte')} />
        </View>
      </View>
    </Screen>
  );
}
