// ─── Detalle de carrera: perfil profundo + valoración + comentarios ──────
// careers (datos por universidad) + career_profiles (contenido investigado de
// la titulación: etapas pre/uni/post, dificultad, salidas con salarios reales)
// + career_ratings (estrellas) + career_comments (público o anónimo).
// Todo el contenido profundo es opcional: si la migración 118 aún no está
// aplicada o la familia no tiene perfil, la pantalla degrada a la ficha básica.
//
// Diseño: todos los colores salen del tema (antes había 15 hexadecimales
// sueltos que se veían mal en modo oscuro). Los matices de las tarjetas
// (consejo, por qué sí, por qué no) son tintes translúcidos del color
// semántico del tema, así funcionan igual en claro, oscuro y franky.
import { formatAcademicDuration } from '@/lib/academic-duration';
import { academicReference } from '@/lib/academic-reference';
import { trackAcademicConsultation } from '@/lib/academic-analytics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView, RefreshControl, Linking, LayoutAnimation } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Send, GraduationCap, Briefcase, Euro, Users as UsersIcon, School, Gauge, CheckCircle2, BookOpen, ChevronDown, ChevronUp, Star, EyeOff, Award, FileText, AlertTriangle, Lightbulb } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/Screen';
import { Avatar, Tap, Skeleton, SkeletonList, Pill, Btn, EmptyState } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { useSessionIdentity } from '@/lib/useSessionIdentity';
import { publishCareerComment, type CareerCommentDraft } from '@/lib/career-comment';
import { supabase } from '@/lib/supabase';
import { branchLabel, timeAgo } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';
import type { Career } from '@/lib/types';
import { CURRENT_CUT_OFF_YEAR, cutOffForView, cutOffViewLabel, cutOffViewYear, type CutOffView } from '@/lib/cut-off-year';
import { CutOffYearToggle } from '@/components/CutOffYearToggle';
import { finiteNumber, positiveNumber, salaryRange as range, researchDate, nationalLabourReference, workloadGuidance, type LabourReference, PROFILE_SCOPE, LABOUR_SCOPE } from '@/lib/career-evidence';

type CareerFull = Career & {
  career_prospects?: string | null; language?: string | null;
  price_first_year?: number | null; career_url?: string | null; demand_ratio?: number | null;
  profile_id?: string | null;
  cut_off_source_url?: string | null; cut_off_round?: string | null;
  cut_off_verified_at?: string | null; cut_off_extraordinary?: number | null;
};

type Salida = {
  rol: string; descripcion?: string | null; como_llegar?: string[] | null;
  salario_espana_eur?: { junior?: [number, number] | null; con_experiencia?: [number, number] | null; fuente?: string | null } | null;
  salario_extranjero?: { pais: string; rango?: [number, number] | null; moneda?: string | null; fuente?: string | null }[] | null;
  demanda?: string | null;
};

type Profile = {
  id: string; canonical_name: string; overview: string | null;
  difficulty_score: number | null; difficulty_rationale: string | null;
  cut_off_min: number | null; cut_off_max: number | null;
  pre_university: {
    bachillerato_recomendado?: string | null; asignaturas_clave?: string[] | null;
    ebau?: string | null; acceso_fp?: string | null; consejos?: string | null; fp_reviewed_at?: string | null;
  } | null;
  university_stage: {
    curso_a_curso?: { curso: number | string; resumen: string }[] | null;
    asignaturas_dificiles?: { nombre: string; curso?: number | string | null; por_que?: string | null }[] | null;
    tasa_abandono?: { valor_pct: number; fuente?: string | null } | null;
    practicas_tfg?: string | null;
  } | null;
  post_university: {
    insercion_laboral?: LabourReference & { tasa_afiliacion_ss?: number | null; anios_referencia?: string | null; tiempo_medio_primer_empleo?: string | null; fuente?: string | null } | null;
    master_necesario?: string | null; master_motivo?: string | null; guidance_reviewed_at?: string | null;
    masters_habituales?: { nombre: string; para_que?: string | null }[] | null;
    colegiacion_oposiciones?: string | null;
  } | null;
  salidas: Salida[] | null;
  salario_medio: LabourReference & { metric?: string | null; one_year_eur?: number | null; four_years_eur?: number | null; recien_egresado_eur?: number | null; cinco_anios_eur?: number | null; fuente?: string | null } | null;
  empleabilidad: LabourReference & { metric?: string | null; one_year_pct?: number | null; valor_pct?: number | null; definicion?: string | null; fuente?: string | null } | null;
  why_study: string[] | null; why_not_study: string[] | null;
  sources: { titulo?: string | null; url: string }[] | null;
  researched_at: string | null;
};

type Comment = {
  id: string; content: string; created_at: string; user_id: string | null;
  is_anonymous?: boolean; is_mine?: boolean; author_name?: string | null;
};

const masterLabel: Record<string, string> = {
  imprescindible: 'Imprescindible', recomendado: 'Recomendado',
  opcional: 'Opcional', poco_habitual: 'Poco habitual',
};

// ─── bloques de presentación ────────────────────────────────────────────

// Rótulo de sección: el icono va suelto y de trazo fino, nunca dentro de un
// cuadrado tintado (regla del sistema v3).
function SectionTitle({ icon: Icon, title }: { icon: typeof Gauge; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <Icon size={18} color={C.blue} strokeWidth={1.8} />
      <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1, fontSize: 18, letterSpacing: -0.3 }]}>{title}</Text>
    </View>
  );
}

// Tarjeta con matiz semántico. El tinte es el color del tema con alfa (14 en
// hex = 8 %): suficiente para distinguirse, legible con C.text encima en
// cualquiera de los tres temas.
function Tint({ children, tone }: { children: React.ReactNode; tone?: 'warn' | 'good' | 'bad' | 'info' }) {
  const base = tone === 'warn' ? C.warning : tone === 'good' ? C.success : tone === 'bad' ? C.error : tone === 'info' ? C.blue : null;
  return (
    <View style={{ backgroundColor: base ? `${base}14` : C.input, borderRadius: R.lg, borderWidth: 0.5, borderColor: base ? `${base}33` : C.borderLight, padding: 12, gap: 4 }}>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{children}</Text>;
}

// Celda de cifra de la cabecera: sin recuadro, separada de la siguiente por
// un filete. La cifra en Outfit y tabular, el rótulo debajo.
function Figure({ value, label, tone, first }: { value: string; label: string; tone?: string; first?: boolean }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 10, borderLeftWidth: first ? 0 : 0.5, borderLeftColor: C.borderLight }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit
        style={[F.display, { fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ['tabular-nums'], color: tone ?? C.text }]}>{value}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 3 }]}>{label}</Text>
    </View>
  );
}

// Nota, convocatoria y fuente del curso elegido. Los datos propios de la fila
// (convocatoria sin nota, extraordinaria) solo valen para su propio curso, así
// que una nota de otro curso nunca se enseña como vigente.
function cutOffDisplay(c: CareerFull, view: CutOffView) {
  const resolved = c.admission_without_cutoff ? null : cutOffForView(c, view);
  const ownRow = view === 'current' && (c.cut_off_year === CURRENT_CUT_OFF_YEAR || !!c.admission_without_cutoff);
  const source = resolved ? resolved.sourceUrl : ownRow ? c.cut_off_source_url ?? null : null;
  return {
    score: resolved?.score ?? null,
    round: resolved?.round ?? (ownRow ? c.cut_off_round ?? null : null),
    source: source?.startsWith('https://') ? source : null,
    extraordinary: ownRow && !c.admission_without_cutoff ? c.cut_off_extraordinary ?? null : null,
    hasPrevious: !c.admission_without_cutoff && cutOffForView(c, 'previous') !== null,
  };
}

// Nota de corte de esta oferta: la cifra que la gente busca, contada al entrar.
function CutOffHero({ score, caption }: { score: number | null; caption: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 4 }}>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Nota de corte</Text>
        {score == null ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 34, lineHeight: 40, color: C.muted }]}>Sin nota</Text>
        ) : (
          <AnimatedNumber value={score} decimals={3} style={{ fontSize: 52, lineHeight: 58, letterSpacing: -2, color: C.blue }} />
        )}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>{caption}</Text>
      </View>
    </View>
  );
}

function OfficialLabourCard({ reference, title, first, fourth, unit, explanation }: {
  reference: NonNullable<ReturnType<typeof nationalLabourReference>>;
  title: string; first: number | null; fourth: number | null; unit: 'percent' | 'euro'; explanation: string;
}) {
  const format = (value: number | null) => value == null ? 'No publicado' : `${value.toLocaleString('es-ES', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${unit === 'percent' ? ' %' : ' €'}`;
  return <Tint>
    <Label>{title}</Label>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Campo nacional: {reference.field}</Text>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Cohorte {reference.cohort} · seguimiento hasta {reference.followUpYear}</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 10 }}>
      {[{ label: 'Al año de terminar', value: first }, { label: 'A los cuatro años', value: fourth }].map(({label,value})=><View key={label} style={{ flex: 1, padding: 10, borderRadius: R.lg, backgroundColor: C.surface }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{label}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginTop: 4 }]}>{format(value)}</Text>
      </View>)}
    </View>
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{explanation}</Text>
    {(first == null || fourth == null) && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>«No publicado» conserva la ausencia o supresión del dato en la tabla; no significa cero.</Text>}
    <Tap accessibilityRole="link" onPress={() => Linking.openURL(reference.sourceUrl).catch(toastError)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>Abrir tabla oficial del SIIU ↗</Text>
    </Tap>
    {reference.checkedDate && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Fuente comprobada en {reference.checkedDate}.</Text>}
  </Tint>;
}

function DifficultyBar({ score }: { score: number }) {
  const color = score >= 8 ? C.error : score >= 6 ? C.warning : C.success;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 28, lineHeight: 32, color }]}>{String(score).replace(/\.0$/, '')}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>/ 10</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 10, now: score }}
        style={{ flex: 1, height: 8, borderRadius: R.full, backgroundColor: C.input, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(score * 10, 100)}%`, height: '100%', borderRadius: R.full, backgroundColor: color }} />
      </View>
    </View>
  );
}

// Estrellas en el naranja de marca (C.accent3): antes iban en un ámbar fijo
// que en el tema franky chocaba con el resto de la paleta.
function Stars({ value, size = 16, onRate }: { value: number; size?: number; onRate?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: onRate ? 8 : 2 }} accessibilityRole={onRate ? undefined : 'text'}
      accessibilityLabel={onRate ? undefined : `${value.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map(s => {
        const filled = s <= Math.round(value);
        const star = (
          <Star key={s} size={size} color={filled ? C.accent3 : C.border} fill={filled ? C.accent3 : 'transparent'} strokeWidth={1.6} />
        );
        return onRate ? (
          <Tap key={s} onPress={() => onRate(s)} haptic hitSlop={6} accessibilityLabel={`${s} ${s === 1 ? 'estrella' : 'estrellas'}`}
            accessibilityState={{ selected: filled }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            {star}
          </Tap>
        ) : star;
      })}
    </View>
  );
}

// ─── pantalla ────────────────────────────────────────────────────────────

export default function CarreraDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { uid, isCurrent } = useSessionIdentity();
  // Mientras se resuelve la sesión, el mismo esqueleto que la carga de la
  // ficha: el resto de fichas nunca enseña una ruedecita suelta.
  if (uid === undefined) return <View style={{ flex: 1, backgroundColor: C.bg }}><Header title="Carrera" back /><View style={{ paddingTop: S.lg }}><Skeleton height={22} radius={R.full} style={{ width: 120 }} /><Skeleton height={30} radius={R.sm} /><SkeletonList count={2} height={90} radius={R.lg} /></View></View>;
  return <CareerContent key={`${id}:${uid ?? 'guest'}`} id={String(id)} owner={uid} accountIsCurrent={isCurrent} />;
}

function CareerContent({ id, owner, accountIsCurrent }: { id: string; owner: string | null; accountIsCurrent: () => boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<CareerFull | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const draft = useRef<CareerCommentDraft | null>(null);
  const sendLock = useRef(false);
  const ratingLock = useRef(false);
  const commentRevision = useRef(0);
  const loadRevision = useRef(0);
  const ratingRevision = useRef(0);
  const refreshRevision = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<'career' | 'profile' | null>(null);
  const [openSalida, setOpenSalida] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [rating, setRating] = useState<{ avg: number | null; count: number } | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [ratingAvailable, setRatingAvailable] = useState<boolean | null>(null);
  // Curso de la nota: por defecto el vigente; el chip enseña el anterior.
  const [cutView, setCutView] = useState<CutOffView>('current');

  // Guarda de desmontaje: si el usuario vuelve atrás antes de que resuelvan
  // las cargas, no hay setState sobre un componente desmontado. Se usa un ref
  // (y no una variable local del efecto) porque load también sirve para
  // reintentar y para el pull-to-refresh.
  const alive = useRef(true);
  const valid = useCallback(() => alive.current && accountIsCurrent(), [accountIsCurrent]);

  const loadComments = useCallback(async () => {
    const revision = ++commentRevision.current;
    if (valid()) setCommentError(false);
    try {
    const { data, error } = await supabase.from('career_comments_public')
      .select('id, content, created_at, user_id, is_anonymous, is_mine')
      .eq('career_id', String(id)).is('parent_id', null)
      .order('created_at', { ascending: false }).limit(60);
    if (!valid() || revision !== commentRevision.current) return;
    if (error) throw error;
    let list = (data ?? []) as Comment[];
    const ids = [...new Set(list.map(cm => cm.user_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('public_profiles').select('id, full_name').in('id', ids);
      const names = new Map(((profs as { id: string; full_name: string | null }[] | null) ?? []).map(p => [p.id, p.full_name]));
      list = list.map(cm => ({ ...cm, author_name: cm.user_id ? names.get(cm.user_id) ?? null : null }));
    }
    if (!valid() || revision !== commentRevision.current) return;
    setComments(list);
    } catch {
      if (valid() && revision === commentRevision.current) setCommentError(true);
    }
  }, [id, valid]);

  const loadRating = useCallback(async () => {
    const revision = ++ratingRevision.current;
    const current = () => valid() && revision === ratingRevision.current;
    try {
      const { data, error } = await supabase.rpc('career_rating_summary', { p_career_id: String(id) });
      if (!current()) return;
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setRating({ avg: row?.avg_rating != null ? Number(row.avg_rating) : null, count: Number(row?.ratings_count ?? 0) });
      if (owner) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!current()) return;
        if (authError || user?.id !== owner) throw authError ?? new Error('Session changed');
        const { data: mine, error: mineError } = await supabase.from('career_ratings')
          .select('rating').eq('career_id', String(id)).eq('user_id', owner).maybeSingle();
        if (!current()) return;
        if (mineError) throw mineError;
        setMyRating(mine ? (mine as { rating: number }).rating : null);
      } else setMyRating(null);
      setRatingAvailable(true);
    } catch {
      if (current()) setRatingAvailable(false);
    }
  }, [id, owner, valid]);

  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    const current = () => valid() && revision === loadRevision.current;
    if (current()) setLoadError(null);
    try {
      const { data: career, error } = await supabase.from('careers')
        .select('*, universities(name, short_name)').eq('id', String(id)).maybeSingle();
      if (!current()) return;
      if (error) throw error;
      const cf = (career as CareerFull) ?? null;
      let nextProfile: Profile | null = null;
      let profileFailed = false;
      if (cf?.profile_id) {
        try {
          const { data: prof, error: profileError } = await supabase.from('career_profiles').select('*').eq('id', cf.profile_id).maybeSingle();
          if (profileError) throw profileError;
          nextProfile = (prof as Profile) ?? null;
        } catch { profileFailed = true; }
      }
      if (!current()) return;
      // Commit a career and its matching guide together; never keep another guide.
      setC(cf);
      setProfile(previous => profileFailed && previous?.id === cf?.profile_id ? previous : nextProfile);
      setLoadError(profileFailed ? 'profile' : null);
      if (!cf) return;
      await Promise.all([loadComments(), loadRating()]);
    } catch {
      if (!current()) return;
      setC((prev) => (prev === undefined ? null : prev));
      setLoadError('career');
    }
  }, [id, loadComments, loadRating, valid]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      ++loadRevision.current; ++ratingRevision.current; ++commentRevision.current; ++refreshRevision.current;
    };
  }, [load]);

  useEffect(() => { if (c?.id) void trackAcademicConsultation('career', c.id); }, [c?.id]);
  const refresh = async () => {
    const revision = ++refreshRevision.current;
    setRefreshing(true);
    try { await load(); }
    finally { if (valid() && revision === refreshRevision.current) setRefreshing(false); }
  };

  const askLogin = (body: string) => {
    // Alert con botones: aquí sí hace falta una decisión (Entrar / Cancelar).
    Alert.alert('Inicia sesión', body, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Entrar', onPress: () => router.push('/welcome') },
    ]);
  };

  const rate = async (value: number) => {
    if (!valid() || ratingLock.current) return;
    if (!owner) { askLogin('Necesitas una cuenta para valorar la carrera.'); return; }
    ratingLock.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!valid() || user?.id !== owner) return;
      const { error } = await supabase.from('career_ratings').upsert(
        { career_id: id, user_id: owner, rating: value }, { onConflict: 'career_id,user_id' });
      if (error) throw error;
      if (!valid()) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMyRating(value); await loadRating();
    } catch {
      if (valid()) toastError('No se pudo guardar tu valoración', 'Inténtalo de nuevo.');
    } finally { ratingLock.current = false; }
  };

  const send = async () => {
    const content = text.trim();
    if (!content || sendLock.current || !valid()) return;
    if (!owner) { askLogin('Necesitas una cuenta para aportar tu experiencia.'); return; }
    sendLock.current = true; setBusy(true); setActionMessage(null);
    if (!draft.current || draft.current.content !== content || draft.current.is_anonymous !== anon) {
      // An identifier for deduplication, never an authentication secret.
      const random = () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
      const key = `${random()}${random()}-${random()}-4${random().slice(1)}-8${random().slice(1)}-${random()}${random()}${random()}`;
      draft.current = { id: key, career_id: id, user_id: owner, content, is_anonymous: anon, parent_id: null };
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!valid() || user?.id !== owner) return;
      await publishCareerComment(supabase, draft.current);
      if (!valid()) return;
      draft.current = null;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setText(''); setAnon(false);
      setActionMessage(anon ? 'Comentario publicado en anónimo.' : 'Comentario publicado.');
      await loadComments();
    } catch {
      if (valid()) setActionMessage('No hemos podido confirmar la publicación. Conservamos tu texto y tu privacidad; puedes reintentar.');
    } finally {
      sendLock.current = false;
      if (valid()) setBusy(false);
    }
  };

  const toggleSalida = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSalida(openSalida === i ? null : i);
  };

  if (c === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Carrera" back />
        {/* Esqueleto con la forma de la cabecera: píldoras, título, tres cifras y párrafo. */}
        <View style={{ paddingTop: S.lg }}>
          <Skeleton height={22} radius={R.full} style={{ width: 120 }} />
          <Skeleton height={30} radius={R.sm} />
          <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: S.lg, marginBottom: S.md }}>
            <Skeleton height={68} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
            <Skeleton height={68} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
            <Skeleton height={68} radius={R.lg} style={{ flex: 1, marginHorizontal: 0 }} />
          </View>
          <SkeletonList count={2} height={90} radius={R.lg} />
        </View>
      </View>
    );
  }
  if (c === null) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Header title="Carrera" back />
        <EmptyState icon={GraduationCap} title="No se pudo cargar"
          subtitle="No encontramos esta carrera o falla tu conexión. Inténtalo de nuevo."
          cta="Reintentar" onCta={load} />
      </View>
    );
  }

  const pre = profile?.pre_university;
  const workload = workloadGuidance(profile?.difficulty_score, profile?.difficulty_rationale);
  const uni = profile?.university_stage;
  const post = profile?.post_university;
  const whyYes = profile?.why_study?.length ? profile.why_study : null;
  const whyNo = profile?.why_not_study?.length ? profile.why_not_study : null;
  const empleo = finiteNumber(profile?.empleabilidad?.valor_pct, 0, 100);
  const profileDate = researchDate(profile?.researched_at);
  const academic = academicReference(c);
  const cutOff = cutOffDisplay(c, cutView);
  const officialEmployment = profile?.empleabilidad?.metric === 'ss_affiliation_rate' ? nationalLabourReference(profile.empleabilidad) : null;
  const officialSalary = profile?.salario_medio?.metric === 'annual_contribution_base' ? nationalLabourReference(profile.salario_medio) : null;

  const section = { padding: S.lg, gap: 10, borderBottomWidth: 0.5, borderBottomColor: C.border } as const;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header title={c.universities?.short_name ?? 'Carrera'} back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.blue} colors={[C.blue]} />}>
          {loadError && <View style={{ padding: S.lg, gap: 8 }}>
            <Text accessibilityRole="alert" maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{loadError === 'career' ? 'No se ha podido actualizar la ficha. Conservamos los datos que ya veías.' : 'No se ha podido actualizar la guía de esta carrera. Puedes consultar sus datos básicos y reintentar.'}</Text>
            <Btn label="Reintentar ficha" onPress={refresh} busy={refreshing} />
          </View>}

          {/* ── cabecera ── */}
          <FadeIn>
          <View style={section}>
            {/* Rótulo tipográfico arriba (universidad y campus), después el
                titular grande y por último las etiquetas. */}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label} numberOfLines={2}>{c.universities?.name}{c.campus ? ` · Campus ${c.campus}` : ''}</Text>
            <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h1, { fontSize: 28, lineHeight: 33, letterSpacing: -0.7 }]}>{c.name}</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Pill label={branchLabel[c.branch] ?? c.branch} tone="blue" />
              {c.degree_type === 'doble_grado' ? <Pill label="Doble grado" tone="orange" /> : null}
              {c.modality && c.modality !== 'presencial' ? <Pill label={c.modality} /> : null}
              {c.language ? <Pill label={c.language} tone="gray" /> : null}
            </View>

            {rating?.count ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Stars value={rating.avg ?? 0} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{rating.avg?.toFixed(1)} · {rating.count} valoraci{rating.count === 1 ? 'ón' : 'ones'}</Text>
              </View>
            ) : null}

            {/* La nota manda: cifra grande que cuenta al abrir la ficha. */}
            {c.admission_without_cutoff ? (
              <View style={{ marginTop: 4 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Acceso</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 34, lineHeight: 40, letterSpacing: -1.2, color: C.blue }]}>Sin corte</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { marginTop: 2 }]}>Requisitos de acceso</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <CutOffHero score={cutOff.score}
                  caption={`Curso ${cutOffViewYear(cutView)}/${cutOffViewYear(cutView) + 1}`} />
                {cutOff.hasPrevious || cutView === 'previous' ? (
                  <View style={{ flexDirection: 'row' }}><CutOffYearToggle view={cutView} onChange={setCutView} /></View>
                ) : null}
              </View>
            )}

            {/* Datos de esta oferta, separados de las referencias generales. */}
            <View style={{ flexDirection: 'row', marginTop: 10, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
              <Figure first value={positiveNumber(c.duration_years) != null ? formatAcademicDuration(c.duration_years) : '—'} label={positiveNumber(c.duration_years) != null ? 'Duración' : 'Duración por confirmar'} />
              <Figure value={positiveNumber(c.credits) != null ? `${c.credits}` : '—'} label={positiveNumber(c.credits) != null ? 'Créditos ECTS' : 'Créditos por confirmar'} />
              <Figure value={c.price_first_year != null ? `${Number(c.price_first_year).toLocaleString('es-ES')} €` : '—'} label={c.price_first_year != null ? 'Primer curso' : 'Precio por confirmar'} />
            </View>

            <Tint tone="info">
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{c.admission_without_cutoff ? 'Acceso sin nota de corte' : 'Admisión y convocatoria'}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{cutOff.round || 'Convocatoria pendiente de verificar'}.</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{c.admission_without_cutoff ? 'Consulta la vía de acceso y el calendario de matrícula.' : cutOff.score != null ? cutView === 'previous' ? 'Es la nota del curso anterior. Sirve para ver la tendencia, no como nota vigente.' : 'La nota ordinaria es una referencia de la lista indicada. No garantiza una plaza en una próxima adjudicación.' : `No hay una nota ordinaria ${cutOffViewLabel(cutView)} verificada. Esto no significa que el acceso sea libre.`}</Text>
              {cutOff.extraordinary != null && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Extraordinaria: {Number(cutOff.extraordinary).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}. Corresponde a un proceso distinto.</Text>}
              {cutOff.source ? <Tap accessibilityRole="link" onPress={() => Linking.openURL(cutOff.source!).catch(toastError)} style={{ minHeight: 44, justifyContent: 'center' }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>Consultar fuente oficial ↗</Text></Tap> : <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Confirma la última publicación con la universidad.</Text>}
            </Tint>

            <View style={{ gap: 8 }}>
              {academic && <Tint>
                <Label>Duración y créditos comprobados</Label>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Revisados el {academic.checkedDate}.</Text>
                {academic.note && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{academic.note}</Text>}
                <Tap accessibilityRole="link" onPress={() => Linking.openURL(academic.url).catch(toastError)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>{academic.title} ↗</Text>
                </Tap>
              </Tint>}
              {/* El precio del primer curso ya sale como cifra en la cabecera. */}
              {c.demand_ratio != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <UsersIcon size={16} color={C.muted} strokeWidth={1.8} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Demanda: {c.demand_ratio} solicitudes por plaza</Text>
                </View>
              ) : null}
            </View>

            {profile && <Tint tone="info">
              <Label>Conoce la titulación</Label>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{PROFILE_SCOPE}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{profileDate ? `Guía revisada en ${profileDate}.` : 'Fecha de revisión de la guía pendiente.'} Cada indicador conserva el periodo de su fuente.</Text>
            </Tint>}
            {profile?.overview
              ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{profile.overview}</Text>
              : c.description ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { color: C.muted }]}>{c.description}</Text> : null}
            {c.career_url ? (
              <Btn variant="secondary" small full icon={FileText} label="Ver ficha de la carrera" onPress={() => Linking.openURL(c.career_url!).catch(() => {})} />
            ) : null}
          </View>
          </FadeIn>

          {/* ── dificultad ── */}
          {workload ? (
            <FadeIn index={1}>
            <View style={section}>
              <SectionTitle icon={Gauge} title={workload.title} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{workload.scope}</Text>
              {workload.score != null ? <DifficultyBar score={workload.score} /> : null}
              {workload.rationale ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{workload.rationale}</Text> : null}
            </View>
            </FadeIn>
          ) : null}

          {/* ── antes de la universidad ── */}
          {pre && (pre.bachillerato_recomendado || pre.asignaturas_clave?.length || pre.ebau || pre.acceso_fp || pre.consejos) ? (
            <View style={section}>
              <SectionTitle icon={School} title="Antes de la universidad" />
              {pre.bachillerato_recomendado ? (
                <Tint><Label>Bachillerato recomendado</Label><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{pre.bachillerato_recomendado}</Text></Tint>
              ) : null}
              <Tint tone="info">
                <Label>Tu acceso, paso a paso</Label>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Comprueba la convocatoria de esta ficha y las ponderaciones de la universidad. Las notas cambian entre cursos, campus y vías de acceso.</Text>
              </Tint>
              {pre.asignaturas_clave?.length ? (
                <View style={{ gap: 6 }}>
                  <Label>Materias para preparar el comienzo</Label>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {pre.asignaturas_clave.map((a, i) => <Pill key={i} label={a} tone="blue" />)}
                  </View>
                </View>
              ) : null}
              {pre.ebau ? <Tint><Label>PAU / EBAU</Label><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{pre.ebau}</Text></Tint> : null}
              {pre.acceso_fp ? (
                <Tint>
                  <Label>Acceso desde FP</Label>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{pre.acceso_fp}</Text>
                  {researchDate(pre.fp_reviewed_at) ? (
                    <>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Acceso desde FP revisado en {researchDate(pre.fp_reviewed_at)}.</Text>
                      <Tap accessibilityRole="link" onPress={() => Linking.openURL('https://www.todofp.es/como-cuando-y-donde-estudiar/acceso-fp-desde-fp/acceso-a-la-universidad.html').catch(toastError)} style={{ minHeight: 44, justifyContent: 'center' }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>Consultar la información oficial de FP ↗</Text>
                      </Tap>
                    </>
                  ) : null}
                </Tint>
              ) : null}
              {pre.consejos ? (
                <Tint tone="warn">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Lightbulb size={14} color={C.warning} strokeWidth={2} />
                    <Label>Consejos</Label>
                  </View>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{pre.consejos}</Text>
                </Tint>
              ) : null}
            </View>
          ) : null}

          {/* ── durante la carrera ── */}
          {uni && (uni.curso_a_curso?.length || uni.asignaturas_dificiles?.length || uni.practicas_tfg) ? (
            <View style={section}>
              <SectionTitle icon={GraduationCap} title="Durante la carrera" />
              {uni.curso_a_curso?.map((cc, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 26, height: 26, borderRadius: R.full, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.heading, color: C.blue }}>{/^\d{1,2}$/.test(String(cc.curso)) ? cc.curso : i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{/^\d+$/.test(String(cc.curso)) ? `${cc.curso}º curso` : String(cc.curso)}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{cc.resumen}</Text>
                  </View>
                </View>
              ))}
              {uni.asignaturas_dificiles?.length ? (
                <Tint tone="warn">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} color={C.warning} strokeWidth={2} />
                    <Label>Materias que conviene preparar</Label>
                  </View>
                  {uni.asignaturas_dificiles.map((a, i) => (
                    <Text key={i} maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>
                      <Text style={{ fontFamily: FONT.semibold }}>{a.nombre}{a.curso ? ` (${a.curso}º)` : ''}</Text>
                      {a.por_que ? `: ${a.por_que}` : ''}
                    </Text>
                  ))}
                </Tint>
              ) : null}
              {finiteNumber(uni.tasa_abandono?.valor_pct, 0, 100) != null && uni.tasa_abandono?.fuente ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Tasa de abandono: {uni.tasa_abandono.valor_pct}%. Fuente y alcance: {uni.tasa_abandono.fuente}</Text>
              ) : null}
              {uni.practicas_tfg ? <Tint><Label>Prácticas y TFG</Label><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{uni.practicas_tfg}</Text></Tint> : null}
            </View>
          ) : null}

          {/* ── después de la carrera ── */}
          {post && (post.insercion_laboral || post.master_necesario || post.masters_habituales?.length || post.colegiacion_oposiciones) ? (
            <View style={section}>
              <SectionTitle icon={Briefcase} title="Después de la carrera" />
              {!nationalLabourReference(post.insercion_laboral) && finiteNumber(post.insercion_laboral?.tasa_afiliacion_ss, 0, 100) != null && post.insercion_laboral?.fuente && post.insercion_laboral.anios_referencia ? (
                <Tint tone="good">
                  <Label>Afiliación a la Seguridad Social</Label>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { fontSize: 26, lineHeight: 30, color: C.success }]}>
                    {post.insercion_laboral.tasa_afiliacion_ss}%
                    <Text style={[F.small, { fontFamily: undefined }]}>{post.insercion_laboral.anios_referencia ? `  ${post.insercion_laboral.anios_referencia}` : ''}</Text>
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Fuente: {post.insercion_laboral.fuente}</Text>
                  {post.insercion_laboral.tiempo_medio_primer_empleo ? (
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{post.insercion_laboral.tiempo_medio_primer_empleo}</Text>
                  ) : null}
                </Tint>
              ) : null}
              {post.master_necesario ? (
                <Tint>
                  <Label>¿Qué formación necesitas después?</Label>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { fontFamily: FONT.semibold }]}>{masterLabel[post.master_necesario] ?? post.master_necesario}</Text>
                  {post.master_motivo ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{post.master_motivo}</Text> : null}
                </Tint>
              ) : null}
              {post.masters_habituales?.length ? (
                <View style={{ gap: 6 }}>
                  <Label>Opciones de formación y especialización</Label>
                  {post.masters_habituales.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Award size={14} color={C.blue} strokeWidth={2} style={{ marginTop: 3 }} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>
                        <Text style={{ fontFamily: FONT.semibold }}>{m.nombre}</Text>
                        {m.para_que ? `: ${m.para_que}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {post.colegiacion_oposiciones ? (
                <Tint tone="info"><Label>Colegiación y oposiciones</Label><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{post.colegiacion_oposiciones}</Text></Tint>
              ) : null}
              {researchDate(post.guidance_reviewed_at) ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Acceso y recorrido académico revisados en {researchDate(post.guidance_reviewed_at)}. Las referencias laborales indican su propio periodo.</Text> : null}
            </View>
          ) : null}

          {(officialEmployment || officialSalary || empleo != null && profile?.empleabilidad?.fuente && profile.empleabilidad.definicion || profile?.salario_medio?.fuente) ? (
            <View style={section}>
              <SectionTitle icon={Briefcase} title="Datos laborales con contexto" />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{LABOUR_SCOPE}</Text>
              {officialEmployment ? (
                <OfficialLabourCard reference={officialEmployment} title="Afiliación a la Seguridad Social"
                  first={finiteNumber(profile?.empleabilidad?.one_year_pct, 0, 100)} fourth={empleo} unit="percent"
                  explanation="La afiliación en España no es una tasa de empleo. No recoge todo el trabajo en el extranjero ni todos los regímenes alternativos." />
              ) : empleo != null && profile?.empleabilidad?.fuente && profile.empleabilidad.definicion ? (
                <Tint>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h2}>{empleo.toLocaleString('es-ES')} %</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{profile.empleabilidad.definicion}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Fuente: {profile.empleabilidad.fuente}</Text>
                </Tint>
              ) : null}
              {officialSalary ? (
                <OfficialLabourCard reference={officialSalary} title="Base media de cotización anual"
                  first={positiveNumber(profile?.salario_medio?.one_year_eur)} fourth={positiveNumber(profile?.salario_medio?.four_years_eur)} unit="euro"
                  explanation="Referencia de personas afiliadas por cuenta ajena a tiempo completo. No equivale a un sueldo neto ni a una oferta salarial." />
              ) : profile?.salario_medio?.fuente ? (
                <Tint>
                  <Label>Referencias sobre ingresos</Label>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{profile.salario_medio.fuente}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Una base de cotización no equivale a un sueldo neto ni a una oferta salarial. Consulta el periodo y la población de cada estudio.</Text>
                </Tint>
              ) : null}
            </View>
          ) : null}

          {/* ── salidas con salarios ── */}
          {profile?.salidas?.length ? (
            <View style={section}>
              <SectionTitle icon={Briefcase} title="Salidas, paso a paso" />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Toca una salida para explorar sus tareas y posibles pasos de preparación.</Text>
              {profile.salidas.map((s, i) => {
                const open = openSalida === i;
                return (
                  <View key={i} style={{ borderWidth: 1, borderColor: open ? C.blue : C.borderLight, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surface }}>
                    <Tap onPress={() => toggleSalida(i)} accessibilityLabel={s.rol} accessibilityState={{ selected: open }}
                      accessibilityHint={open ? 'Contrae la salida' : 'Despliega la salida'}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 }}>
                        <View style={{ width: 26, height: 26, borderRadius: R.full, backgroundColor: open ? C.blue : C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 12, fontFamily: FONT.heading, color: open ? C.onAccent : C.blue }}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>{s.rol}</Text>
                          {s.salario_espana_eur?.fuente && range(s.salario_espana_eur.con_experiencia) ? (
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>{range(s.salario_espana_eur?.con_experiencia)} con experiencia</Text>
                          ) : null}
                        </View>
                        {s.demanda ? <Pill label={`demanda ${s.demanda}`} tone={s.demanda === 'alta' ? 'green' : 'gray'} /> : null}
                        {open ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
                      </View>
                    </Tap>
                    {open ? (
                      <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
                        {s.descripcion ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 8 }]}>{s.descripcion}</Text> : null}
                        {s.como_llegar?.length ? (
                          <View style={{ gap: 4, marginTop: s.descripcion ? 0 : 8 }}>
                            <Label>Cómo llegar</Label>
                            {s.como_llegar.map((p, j) => (
                              <Text key={j} maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{j + 1}. {p.replace(/^paso \d+:?\s*/i, '')}</Text>
                            ))}
                          </View>
                        ) : null}
                        {s.salario_espana_eur?.fuente && (range(s.salario_espana_eur.junior) || range(s.salario_espana_eur.con_experiencia)) ? (
                          <View style={{ gap: 2 }}>
                            <Label>Rango orientativo en España (bruto/año)</Label>
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Fuente: {s.salario_espana_eur.fuente}</Text>
                            {range(s.salario_espana_eur?.junior) ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Junior: {range(s.salario_espana_eur?.junior)}</Text> : null}
                            {range(s.salario_espana_eur?.con_experiencia) ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>Con experiencia: {range(s.salario_espana_eur?.con_experiencia)}</Text> : null}
                          </View>
                        ) : null}
                        {s.salario_extranjero?.length ? (
                          <View style={{ gap: 2 }}>
                            <Label>En el extranjero</Label>
                            {s.salario_extranjero.map((e, j) => e.fuente && e.moneda && range(e.rango, e.moneda) ? (
                              <Text key={j} maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{e.pais}: {range(e.rango, e.moneda)}. Fuente: {e.fuente}</Text>
                            ) : null)}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : c.career_prospects ? (
            <View style={section}>
              <Tint><Label>Salidas profesionales</Label><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>{c.career_prospects}</Text></Tint>
            </View>
          ) : null}

          {/* ── por qué sí / no ── */}
          {(whyYes || whyNo) ? (
            <View style={section}>
              {whyYes ? (
                <Tint tone="good">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} color={C.success} strokeWidth={2} />
                    <Label>Lo que puede atraerte</Label>
                  </View>
                  {whyYes.map((r, i) => <Text key={i} maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>• {r}</Text>)}
                </Tint>
              ) : null}
              {whyNo ? (
                <Tint tone="info">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <BookOpen size={14} color={C.blue} strokeWidth={2} />
                    <Label>Qué valorar antes de elegir</Label>
                  </View>
                  {whyNo.map((r, i) => <Text key={i} maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.body}>• {r}</Text>)}
                </Tint>
              ) : null}
            </View>
          ) : null}

          {/* ── fuentes ── */}
          {profile?.sources?.length ? (
            <View style={{ padding: S.lg, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <Tap onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setShowSources(!showSources); }}
                accessibilityLabel={`Fuentes de los datos, ${profile.sources.length}`} accessibilityHint={showSources ? 'Oculta las fuentes' : 'Muestra las fuentes'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                  <FileText size={16} color={C.muted} strokeWidth={1.9} />
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { flex: 1 }]}>Fuentes de los datos ({profile.sources.length})</Text>
                  {showSources ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
                </View>
              </Tap>
              {showSources ? (
                <View style={{ gap: 6, marginTop: 8 }}>
                  {profile.sources.map((src, i) => (
                    <Tap key={i} onPress={() => Linking.openURL(src.url).catch(() => {})} accessibilityRole="link" accessibilityLabel={src.titulo || src.url}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { color: C.blueDeep, paddingVertical: 4 }]} numberOfLines={2}>• {src.titulo || src.url}</Text>
                    </Tap>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ── valoración con estrellas ── */}
          {ratingAvailable ? (
            <View style={section}>
              <SectionTitle icon={Star} title="Valora esta carrera" />
              {rating?.count ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Media {rating.avg?.toFixed(1)} de {rating.count} valoraci{rating.count === 1 ? 'ón' : 'ones'}.</Text>
              ) : (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Sé la primera persona en valorarla.</Text>
              )}
              <View style={{ alignItems: 'flex-start' }}>
                <Stars value={myRating ?? 0} size={30} onRate={rate} />
              </View>
              {myRating ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Tu valoración: {myRating} estrella{myRating === 1 ? '' : 's'} (toca para cambiarla)</Text> : null}
            </View>
          ) : <View style={section}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{ratingAvailable === false ? 'No se han podido actualizar las valoraciones.' : 'Cargando valoraciones…'}</Text>
            {ratingAvailable === false && <Btn label="Reintentar valoraciones" onPress={() => void loadRating()} />}
          </View>}

          {/* ── comentarios ── */}
          <View style={{ paddingHorizontal: S.lg, paddingTop: 14, paddingBottom: 6 }}>
            <SectionTitle icon={GraduationCap} title="Lo que cuentan los estudiantes" />
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { paddingHorizontal: S.lg, marginBottom: 8 }]}>
            Experiencias reales de quienes ya la cursan. Puedes publicar con tu nombre o en anónimo.
          </Text>
          {commentError ? <View style={{ paddingHorizontal: S.lg, paddingVertical: 12, gap: 8 }}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>No se han podido cargar los comentarios.</Text><Btn onPress={() => void loadComments()} label="Reintentar" /></View> : comments === null ? <SkeletonList count={2} height={64} radius={R.md} /> :
            comments.length === 0 ? (
              <EmptyState compact icon={GraduationCap} title="Nadie ha opinado todavía" subtitle="Estrena el hilo de esta carrera." />
            ) : (
              comments.map(cm => {
                const cname = cm.is_anonymous ? 'Anónimo' : (cm.author_name ?? 'Estudiante');
                return (
                  <View key={cm.id} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: S.lg, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: C.borderLight }}>
                    {cm.is_anonymous ? (
                      <View style={{ width: 30, height: 30, borderRadius: R.full, backgroundColor: C.input, alignItems: 'center', justifyContent: 'center' }}>
                        <EyeOff size={14} color={C.muted} strokeWidth={1.9} />
                      </View>
                    ) : (
                      <Avatar name={cname} size={30} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 13 }}>
                        <Text style={[F.username, cm.is_anonymous ? { fontStyle: 'italic', color: C.muted } : null]}>
                          {cm.is_anonymous ? 'anónimo' : cname.toLowerCase().replace(/\s+/g, '.')}
                        </Text>
                        <Text style={F.tiny}>  {timeAgo(cm.created_at)}</Text>
                      </Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { marginTop: 2 }]}>{cm.content}</Text>
                    </View>
                  </View>
                );
              })
            )}
        </ScrollView>

        {/* Compositor fijo abajo: el mismo patrón que el chat. */}
        <View style={{
          borderTopWidth: 0.5, borderTopColor: C.border, backgroundColor: C.bg,
          paddingHorizontal: S.lg, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8),
          gap: 6,
        }}>
          {actionMessage && <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" style={F.small}>{actionMessage}</Text>}
          <Tap disabled={busy} onPress={() => setAnon(!anon)} accessibilityRole="button" accessibilityState={{ checked: anon }}
            accessibilityLabel="Publicar como anónimo" hitSlop={6} style={{ alignSelf: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}>
              <EyeOff size={13} color={anon ? C.blue : C.muted} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, anon ? { color: C.blue, fontFamily: FONT.semibold } : null]}>
                {anon ? 'Publicarás como anónimo' : 'Publicar como anónimo'}
              </Text>
            </View>
          </Tap>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              editable={!busy} value={text} onChangeText={setText} placeholder="Cuenta tu experiencia con esta carrera…"
              placeholderTextColor={C.muted} multiline maxLength={2000}
              accessibilityLabel="Tu experiencia con esta carrera"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ flex: 1, backgroundColor: C.input, borderRadius: R.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, maxHeight: 90 }}
            />
            {busy ? <ActivityIndicator color={C.blue} /> : (
              <Tap onPress={send} disabled={text.trim().length === 0} haptic accessibilityLabel="Publicar comentario"
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim().length > 0 ? C.blue : C.input }}>
                <Send size={20} color={text.trim().length > 0 ? C.onAccent : C.muted} strokeWidth={2} />
              </Tap>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
