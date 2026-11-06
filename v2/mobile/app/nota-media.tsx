import { withStudyAccount } from '@/components/StudyAccount';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';
// Calculadora de nota media y créditos (mejora 87). El usuario añade
// asignaturas (nombre, créditos ECTS, nota) y aquí se calcula:
// - la media ponderada por créditos de TODAS las asignaturas.
// - los créditos superados (nota >= 5) y la media solo sobre esas.
// - la equivalencia cualitativa española de la media general.
// La lista persiste en el dispositivo (AsyncStorage) para no perderla al
// cerrar la app: no hay tabla en Supabase para esto, es una herramienta local.
//
// Diseño: la media va en un anillo cuyo color depende del tramo (suspenso,
// aprobado, notable, sobresaliente) y en cifra display; los errores del
// formulario se pintan bajo el campo en vez de en un Alert.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, LayoutAnimation } from 'react-native';
import { getStudyGrades, addStudyGrade, removeStudyGrade, type StudyGrade } from '@/lib/study-grades';
import * as Haptics from 'expo-haptics';
import { Calculator, Trash2, GraduationCap, Plus } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Tap, EmptyState, Card, Pill, Skeleton, SectionHeader } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { toast } from '@/lib/toast';
import { C, S, F, R, FONT } from '@/theme';

type Subject = StudyGrade;

// Equivalencia cualitativa del sistema español (0-10).
function qualitative(media: number): { label: string; tone: 'red' | 'gray' | 'blue' | 'green' } {
  if (media < 5) return { label: 'Suspenso', tone: 'red' };
  if (media < 7) return { label: 'Aprobado', tone: 'gray' };
  if (media < 9) return { label: 'Notable', tone: 'blue' };
  return { label: 'Sobresaliente', tone: 'green' };
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Anillo de la media: círculo con borde de 6 px del color del tramo y la
// Resultado: cifra enorme en Outfit que cuenta al cambiar, con un filete de
// progreso debajo. Sin anillos ni medidores de plantilla.
function MediaResult({ media, color, empty }: { media: number; color: string; empty?: boolean }) {
  const pct = Math.max(0, Math.min(100, (media / 10) * 100));
  return (
    <View accessible accessibilityLabel={`Media ponderada ${fmt(media)} sobre 10`} style={{ alignSelf: 'stretch', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        {empty ? (
          <Text maxFontSizeMultiplier={1.2} style={[F.display, { fontSize: 62, lineHeight: 68, letterSpacing: -2.4, color: C.border }]}>{fmt(0)}</Text>
        ) : (
          <AnimatedNumber value={media} decimals={2} style={{ fontSize: 62, lineHeight: 68, letterSpacing: -2.4, color }} />
        )}
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 15 }]}>sobre 10</Text>
      </View>
      <View style={{ height: 3, borderRadius: 1.5, backgroundColor: C.borderLight, overflow: 'hidden' }}>
        <View style={{ width: `${empty ? 0 : pct}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}

// Campo con etiqueta encima y error inline debajo: el patrón común de inputs.
function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>{label}</Text>
      {children}
      {error ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: C.error }]}>{error}</Text> : null}
    </View>
  );
}

function NotaMedia({ owner }: { owner: SessionIdentity }) {
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState('');
  const [credits, setCredits] = useState('');
  const [grade, setGrade] = useState('');
  const [errors, setErrors] = useState<{ name?: string; credits?: string; grade?: string }>({});

  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    setLoadError(false);
    try { const data = await getStudyGrades(owner); if (studyStorage.current(owner)) setSubjects(data); }
    catch { if (studyStorage.current(owner)) setLoadError(true); }
  };
  useEffect(() => { void load(); }, [owner.userId, owner.generation]);

  const stats = useMemo(() => {
    const list = subjects ?? [];
    const totalCredits = list.reduce((s, a) => s + a.credits, 0);
    const weightedSum = list.reduce((s, a) => s + a.credits * a.grade, 0);
    const media = totalCredits > 0 ? weightedSum / totalCredits : 0;
    const passed = list.filter((a) => a.grade >= 5);
    const creditsPassed = passed.reduce((s, a) => s + a.credits, 0);
    const weightedPassed = passed.reduce((s, a) => s + a.credits * a.grade, 0);
    const mediaPassed = creditsPassed > 0 ? weightedPassed / creditsPassed : 0;
    return { totalCredits, media, creditsPassed, mediaPassed, count: list.length };
  }, [subjects]);

  const addSubject = async () => {
    if (saving || !studyStorage.current(owner)) return;
    const trimmed = name.trim();
    const c = Number(credits.replace(',', '.'));
    const g = Number(grade.replace(',', '.'));
    const next: typeof errors = {};
    if (!trimmed) next.name = 'Pon el nombre de la asignatura.';
    if (!Number.isFinite(c) || c <= 0) next.credits = 'Número mayor que 0.';
    if (!grade.trim() || !Number.isFinite(g) || g < 0 || g > 10) next.grade = 'Entre 0 y 10.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    const subject: Subject = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: trimmed, credits: c, grade: g };
    setSaving(true);
    try {
      const next = await addStudyGrade(owner, subject);
      if (!studyStorage.current(owner)) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setSubjects(next); setName(''); setCredits(''); setGrade('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast('Asignatura añadida', `${trimmed}: ${fmt(g)}`);
    } catch { if (studyStorage.current(owner)) toast('No se ha guardado', 'Tus notas anteriores siguen intactas. Inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };

  const removeSubject = async (id: string) => {
    if (saving || !studyStorage.current(owner)) return;
    setSaving(true);
    try {
      const next = await removeStudyGrade(owner, id);
      if (studyStorage.current(owner)) { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSubjects(next); }
    } catch { if (studyStorage.current(owner)) toast('No se ha borrado', 'Inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };

  if (loadError) return <Screen title="Nota media" back><EmptyState icon={Calculator} title="No hemos podido cargar tus notas" subtitle="Tus datos guardados no se han modificado. Vuelve a intentarlo." cta="Reintentar" onCta={() => void load()} /></Screen>;

  if (subjects === null) {
    return (
      <Screen title="Nota media" back>
        <View style={{ paddingTop: S.lg }}>
          <Skeleton height={220} radius={R.xl} />
          <Skeleton height={150} radius={R.lg} />
        </View>
      </Screen>
    );
  }

  const q = qualitative(stats.media);
  const qColor = q.tone === 'red' ? C.error : q.tone === 'green' ? C.success : q.tone === 'blue' ? C.blue : C.muted;
  const input = {
    backgroundColor: C.input, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text,
  } as const;
  const errored = (k: keyof typeof errors) => errors[k] ? { borderWidth: 1, borderColor: C.error } : null;

  return (
    <Screen title="Nota media" back>
      {/* Resumen: anillo con la media, equivalencia y cifras */}
      <FadeIn>
      <Card style={{ marginTop: S.lg, gap: 14 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Tu media ponderada</Text>
        {stats.count === 0 ? (
          <>
            <MediaResult media={0} color={C.border} empty />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Añade asignaturas para calcular tu media.</Text>
          </>
        ) : (
          <>
            <MediaResult media={stats.media} color={qColor} />
            <View style={{ flexDirection: 'row' }}><Pill label={q.label} tone={q.tone} /></View>
            <View style={{ alignSelf: 'stretch', gap: 9, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
              {[
                ['Asignaturas', String(stats.count)],
                ['Créditos totales', String(stats.totalCredits)],
                ['Créditos superados (5 o más)', String(stats.creditsPassed)],
                ['Media sobre superados', stats.creditsPassed > 0 ? fmt(stats.mediaPassed) : '—'],
              ].map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { flex: 1 }]}>{k}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 15, fontFamily: FONT.semibold, color: C.text, fontVariant: ['tabular-nums'] }}>{v}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Card>
      </FadeIn>

      {/* Formulario de alta */}
      <SectionHeader title="Añadir asignatura" />
      <View style={{ marginHorizontal: S.lg, gap: 12 }}>
        <Field label="Asignatura" error={errors.name}>
          <TextInput
            value={name} onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: undefined })); }}
            placeholder="Ej. Álgebra lineal" placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE}
            accessibilityLabel="Nombre de la asignatura" returnKeyType="next"
            style={[input, errored('name')]}
          />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Créditos ECTS" error={errors.credits}>
            <TextInput
              value={credits} onChangeText={(v) => { setCredits(v); if (errors.credits) setErrors((e) => ({ ...e, credits: undefined })); }}
              placeholder="6" keyboardType="decimal-pad"
              placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel="Créditos ECTS"
              style={[input, errored('credits')]}
            />
          </Field>
          <Field label="Nota (0 a 10)" error={errors.grade}>
            <TextInput
              value={grade} onChangeText={(v) => { setGrade(v); if (errors.grade) setErrors((e) => ({ ...e, grade: undefined })); }}
              placeholder="7,5" keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={addSubject}
              placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel="Nota, de 0 a 10"
              style={[input, errored('grade')]}
            />
          </Field>
        </View>
        <Btn label="Añadir asignatura" icon={Plus} busy={saving} onPress={addSubject} full />
      </View>

      {/* Lista de asignaturas añadidas */}
      <SectionHeader title="Asignaturas" subtitle={subjects.length ? `${subjects.length} en la lista` : undefined} />
      {subjects.length === 0 ? (
        <EmptyState compact icon={GraduationCap} title="Sin asignaturas" subtitle="Añade tu primera asignatura para empezar a calcular la media." />
      ) : (
        <Card style={{ padding: 0 }}>
          {subjects.map((s, i) => (
            <FadeIn key={s.id} index={i}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: S.lg, minHeight: 56,
              borderBottomWidth: i < subjects.length - 1 ? 0.5 : 0, borderBottomColor: C.borderLight,
            }}>
              <View style={{ width: 44, alignItems: 'center' }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 18, fontFamily: FONT.display, letterSpacing: -0.4, fontVariant: ['tabular-nums'], color: s.grade < 5 ? C.error : C.text }}>{fmt(s.grade)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{s.name}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{s.credits} créditos</Text>
              </View>
              {s.grade < 5 ? <Pill label="Suspenso" tone="red" /> : null}
              <Tap onPress={() => removeSubject(s.id)} haptic accessibilityLabel={`Borrar ${s.name}`} accessibilityHint="Elimina esta asignatura de la lista"
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} color={C.muted} strokeWidth={1.8} />
              </Tap>
            </View>
            </FadeIn>
          ))}
        </Card>
      )}
      <View style={{ paddingHorizontal: S.lg, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Calculator size={13} color={C.muted} strokeWidth={2} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flex: 1 }]}>La media se pondera por créditos. Se guarda solo en este móvil.</Text>
      </View>
    </Screen>
  );
}

export default withStudyAccount(NotaMedia, 'Nota media');
