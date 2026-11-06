import { withStudyAccount } from '@/components/StudyAccount';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';
// ─── Mi horario: clases semanales (rejilla y lista) + exámenes ─────────────
// Todo vive en el dispositivo (AsyncStorage vía src/lib/horario.ts) con copia
// en la nube (src/lib/study.ts). Tres vistas:
//   - Rejilla: la semana como en la pared de la facultad (horas x días).
//   - Lista: por día, con aula y profesor.
//   - Exámenes: ordenados por fecha, con cuenta atrás y recordatorio la víspera.
// Parámetros: ?tab=examenes abre esa pestaña; ?add=clase|examen abre el alta.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Alert, Modal, Platform, ScrollView, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarClock, Clock, MapPin, User, Trash2, Plus, X, BookOpen, GraduationCap, BellRing, LayoutGrid, List, Pencil } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Tap, EmptyState, OptionsSheet, Pill, SkeletonList } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import {
  getClasses, addClass, updateClass, removeClass, groupClassesByDay, DAY_LABELS_SHORT,
  getExams, addExam, updateExam, removeExam, examCountdown,
  type ClassItem, type ExamItem,
} from '@/lib/horario';
import { scheduleCloudSync, rescheduleDigest } from '@/lib/study';
import { completeStep } from '@/lib/tour';
import { toast } from '@/lib/toast';
import { C, S, F, R, FONT } from '@/theme';

type Tab = 'semana' | 'examenes';
type View2 = 'grid' | 'list';

const input = {
  backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
  borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12,
  fontSize: 15, color: C.text,
} as const;

// Colores por asignatura: se asigna uno estable a partir del nombre para que
// la misma asignatura salga siempre igual en la rejilla.
const SUBJECT_HUES = ['#7C3AED', '#C026D3', '#DE8927', '#2563EB', '#0D9488', '#DB2777', '#16A34A', '#D97706'];
function subjectColor(name: string): string {
  let h = 0; for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_HUES[h % SUBJECT_HUES.length];
}

function toHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function hmToDate(hm: string): Date {
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(hm) ? hm : '09:00').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}
const hmToMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

function Horario({ owner }: { owner: SessionIdentity }) {
  const params = useLocalSearchParams<{ tab?: string; add?: string; date?: string }>();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>(params.tab === 'examenes' ? 'examenes' : 'semana');
  const [view, setView] = useState<View2>('grid');
  const [classes, setClasses] = useState<ClassItem[] | null>(null);
  const [exams, setExams] = useState<ExamItem[] | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([getClasses(owner), getExams(owner)]);
      setClasses(c); setExams(e);
    } catch {
      setClasses((p) => p ?? []); setExams((p) => p ?? []);
    }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const afterChange = () => { if (!studyStorage.current(owner)) return; scheduleCloudSync(owner); rescheduleDigest({ force: true }, owner).catch(() => {}); completeStep('horario'); };

  // ── Alta / edición de clase ──
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [csubject, setCsubject] = useState('');
  const [cday, setCday] = useState(1);
  const [cstart, setCstart] = useState(() => hmToDate('09:00'));
  const [cend, setCend] = useState(() => hmToDate('10:00'));
  const [cshowStart, setCshowStart] = useState(false);
  const [cshowEnd, setCshowEnd] = useState(false);
  const [croom, setCroom] = useState('');
  const [cteacher, setCteacher] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  const openClassModal = useCallback((c?: ClassItem) => {
    setEditingClass(c ?? null);
    setCsubject(c?.subject ?? ''); setCday(c?.dayOfWeek ?? 1);
    setCstart(hmToDate(c?.startTime ?? '09:00')); setCend(hmToDate(c?.endTime ?? '10:00'));
    setCroom(c?.room ?? ''); setCteacher(c?.teacher ?? '');
    setClassModalOpen(true);
  }, []);

  const submitClass = async () => {
    const subject = csubject.trim();
    if (subject.length < 2) { Alert.alert('Falta la asignatura', 'Ponle un nombre a la asignatura.'); return; }
    if (toHM(cend) <= toHM(cstart)) { Alert.alert('Hora no válida', 'La hora de fin debe ser posterior a la de inicio.'); return; }
    setSavingClass(true);
    try {
      if (!studyStorage.current(owner)) return;
      const payload = { subject, dayOfWeek: cday, startTime: toHM(cstart), endTime: toHM(cend), room: croom.trim() || null, teacher: cteacher.trim() || null };
      const next = editingClass ? await updateClass(editingClass.id, payload, owner) : await addClass(payload, owner);
      setClasses(next);
      setClassModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(editingClass ? 'Clase actualizada' : 'Clase añadida');
      afterChange();
    } finally {
      setSavingClass(false);
    }
  };

  const confirmRemoveClass = (c: ClassItem) => {
    Alert.alert('¿Borrar clase?', `${c.subject} (${DAY_LABELS_SHORT[c.dayOfWeek]} ${c.startTime}).`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => removeClass(c.id, owner).then((n) => { setClasses(n); afterChange(); }) },
    ]);
  };

  // ── Alta / edición de examen ──
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamItem | null>(null);
  const [esubject, setEsubject] = useState('');
  const [edate, setEdate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; });
  const [eshowDate, setEshowDate] = useState(false);
  const [eshowTime, setEshowTime] = useState(false);
  const [eroom, setEroom] = useState('');
  const [savingExam, setSavingExam] = useState(false);

  const openExamModal = useCallback((e?: ExamItem, presetDate?: Date) => {
    setEditingExam(e ?? null);
    setEsubject(e?.subject ?? '');
    const d = e ? new Date(e.date) : presetDate ? new Date(presetDate) : new Date();
    if (!e && !presetDate) d.setDate(d.getDate() + 7);
    if (!e) d.setHours(9, 0, 0, 0);
    setEdate(d); setEroom(e?.room ?? '');
    setExamModalOpen(true);
  }, []);

  // ?add=clase|examen desde Estudio o Calendario.
  useEffect(() => {
    if (params.add === 'clase') openClassModal();
    else if (params.add === 'examen') { setTab('examenes'); openExamModal(undefined, params.date ? new Date(params.date) : undefined); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setEshowDate(false);
    if (e.type === 'set' && d) setEdate((prev) => { const next = new Date(prev); next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return next; });
    if (Platform.OS === 'ios' && e.type === 'dismissed') setEshowDate(false);
  };
  const onPickTime = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setEshowTime(false);
    if (e.type === 'set' && d) setEdate((prev) => { const next = new Date(prev); next.setHours(d.getHours(), d.getMinutes(), 0, 0); return next; });
    if (Platform.OS === 'ios' && e.type === 'dismissed') setEshowTime(false);
  };

  const submitExam = async () => {
    const subject = esubject.trim();
    if (subject.length < 2) { Alert.alert('Falta la asignatura', 'Ponle un nombre a la asignatura del examen.'); return; }
    if (edate.getTime() < Date.now() - 60_000) { Alert.alert('Fecha no válida', 'Elige una fecha que no haya pasado ya.'); return; }
    setSavingExam(true);
    try {
      if (!studyStorage.current(owner)) return;
      const payload = { subject, date: edate.toISOString(), room: eroom.trim() || null };
      const next = editingExam ? await updateExam(editingExam.id, payload, owner) : await addExam(payload, owner);
      setExams(next);
      setExamModalOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const conMargen = edate.getTime() - Date.now() > 24 * 60 * 60 * 1000;
      toast(editingExam ? 'Examen actualizado' : 'Examen añadido', conMargen ? 'Te avisamos un día antes.' : 'Está muy cerca para avisarte la víspera, pero ya lo tienes en tu horario.');
      afterChange();
    } finally {
      setSavingExam(false);
    }
  };

  const confirmRemoveExam = (e: ExamItem) => {
    Alert.alert('¿Borrar examen?', `${e.subject}, se cancelará también el recordatorio.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => removeExam(e.id, owner).then((n) => { setExams(n); afterChange(); }) },
    ]);
  };

  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [classMenu, setClassMenu] = useState<ClassItem | null>(null);
  const [examMenu, setExamMenu] = useState<ExamItem | null>(null);

  const days = useMemo(() => groupClassesByDay(classes ?? []), [classes]);
  const loading = classes === null || exams === null;

  // ── Rejilla semanal ──
  const gridDays = useMemo(() => {
    const base = [1, 2, 3, 4, 5];
    const hasSat = (classes ?? []).some((c) => c.dayOfWeek === 6);
    const hasSun = (classes ?? []).some((c) => c.dayOfWeek === 0);
    return [...base, ...(hasSat ? [6] : []), ...(hasSun ? [0] : [])];
  }, [classes]);
  const [gridStart, gridEnd] = useMemo(() => {
    const list = classes ?? [];
    if (list.length === 0) return [8 * 60, 20 * 60];
    const s = Math.min(...list.map((c) => hmToMin(c.startTime)));
    const e = Math.max(...list.map((c) => hmToMin(c.endTime)));
    return [Math.floor(Math.min(s, 8 * 60) / 60) * 60, Math.ceil(Math.max(e, 15 * 60) / 60) * 60];
  }, [classes]);
  const HOUR_H = 52;
  const GUTTER = 38;
  const colW = (width - S.lg * 2 - GUTTER) / gridDays.length;
  const todayDow = new Date().getDay();

  return (
    <Screen title="Mi horario" back
      right={
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {tab === 'semana' ? (
            <Tap onPress={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))} accessibilityLabel={view === 'grid' ? 'Ver como lista' : 'Ver como rejilla'} hitSlop={12}
              style={{ width: 32, height: 36, alignItems: 'center', justifyContent: 'center' }}>
              {view === 'grid' ? <List size={21} color={C.text} strokeWidth={1.9} /> : <LayoutGrid size={21} color={C.text} strokeWidth={1.9} />}
            </Tap>
          ) : null}
          <Tap onPress={() => setAddSheetOpen(true)} accessibilityLabel="Añadir clase o examen" haptic
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={C.onAccent} strokeWidth={2.6} />
          </Tap>
        </View>
      }>

      <View style={{ flexDirection: 'row', paddingHorizontal: S.lg, marginTop: S.md, marginBottom: S.sm }}>
        <Chip label="Semana" active={tab === 'semana'} accessibilityRole="tab" onPress={() => setTab('semana')} icon={CalendarClock} />
        <Chip label={`Exámenes${(exams?.length ?? 0) > 0 ? ` (${exams!.length})` : ''}`} active={tab === 'examenes'} accessibilityRole="tab" onPress={() => setTab('examenes')} icon={GraduationCap} />
      </View>

      {loading ? <SkeletonList count={4} height={72} radius={R.md} /> : tab === 'semana' ? (
        (classes ?? []).length === 0 ? (
          <EmptyState icon={BookOpen} title="Sin clases todavía"
            subtitle="Añade tu primera clase: asignatura, día y hora. Después la verás en la rejilla y en tu día." cta="Añadir clase" onCta={() => openClassModal()} />
        ) : view === 'grid' ? (
          <FadeIn style={{ marginHorizontal: S.lg, marginTop: S.md }}>
            {/* Cabecera de días */}
            <View style={{ flexDirection: 'row', paddingLeft: GUTTER, borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              {gridDays.map((d) => (
                <View key={d} style={{ width: colW, alignItems: 'center', paddingVertical: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: FONT.semibold, color: d === todayDow ? C.blue : C.muted }}>{DAY_LABELS_SHORT[d]}</Text>
                </View>
              ))}
            </View>
            <ScrollView style={{ maxHeight: 520 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <View style={{ height: ((gridEnd - gridStart) / 60) * HOUR_H + 8, flexDirection: 'row' }}>
                {/* Horas */}
                <View style={{ width: GUTTER }}>
                  {Array.from({ length: (gridEnd - gridStart) / 60 + 1 }).map((_, i) => (
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} key={i} style={{ position: 'absolute', top: i * HOUR_H - 7, right: 6, fontSize: 10.5, color: C.muted, fontFamily: FONT.medium }}>
                      {String((gridStart / 60) + i).padStart(2, '0')}
                    </Text>
                  ))}
                </View>
                {/* Columnas */}
                <View style={{ flex: 1 }}>
                  {Array.from({ length: (gridEnd - gridStart) / 60 }).map((_, i) => (
                    <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_H, height: 1, backgroundColor: C.borderLight }} />
                  ))}
                  {gridDays.map((d, di) => (
                    <View key={d} style={{ position: 'absolute', left: di * colW, top: 0, bottom: 0, width: colW, backgroundColor: d === todayDow ? `${C.blue}0A` : 'transparent', borderLeftWidth: di > 0 ? 1 : 0, borderLeftColor: C.borderLight }} />
                  ))}
                  {(classes ?? []).map((c) => {
                    const di = gridDays.indexOf(c.dayOfWeek);
                    if (di < 0) return null;
                    const top = ((hmToMin(c.startTime) - gridStart) / 60) * HOUR_H;
                    const h = Math.max(30, ((hmToMin(c.endTime) - hmToMin(c.startTime)) / 60) * HOUR_H);
                    const color = subjectColor(c.subject);
                    return (
                      <Tap key={c.id} onPress={() => setClassMenu(c)} accessibilityLabel={`${c.subject}, ${DAY_LABELS_SHORT[c.dayOfWeek]} de ${c.startTime} a ${c.endTime}`}
                        style={{ position: 'absolute', left: di * colW + 2, top: top + 1, width: colW - 4, height: h - 2, borderRadius: 8, backgroundColor: `${color}22`, borderLeftWidth: 3, borderLeftColor: color, padding: 4, overflow: 'hidden' }}>
                        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={h > 44 ? 2 : 1} style={{ fontSize: 10.5, fontFamily: FONT.semibold, color: C.text, lineHeight: 12 }}>{c.subject}</Text>
                        {h > 44 && c.room ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontSize: 9.5, color: C.muted }}>{c.room}</Text> : null}
                      </Tap>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          </FadeIn>
        ) : (
          <View style={{ marginTop: S.md }}>
            {days.map((d, dayIndex) => (
              <FadeIn key={d.dayOfWeek} index={dayIndex} style={{ marginHorizontal: S.lg, marginBottom: S.xl }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8, color: d.dayOfWeek === todayDow ? C.blue : C.muted }]}>{d.label}{d.dayOfWeek === todayDow ? ' · hoy' : ''}</Text>
                {d.items.length === 0 ? (
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Sin clases</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {d.items.map((c) => (
                      <Tap key={c.id} onPress={() => setClassMenu(c)} accessibilityLabel={`${c.subject}, opciones`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, paddingVertical: 13, paddingRight: 13 }}>
                        <View style={{ width: 3, alignSelf: 'stretch', borderTopLeftRadius: R.lg, borderBottomLeftRadius: R.lg, backgroundColor: subjectColor(c.subject) }} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{c.subject}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Clock size={12} color={C.muted} strokeWidth={2} />
                            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>{c.startTime} a {c.endTime}</Text>
                          </View>
                          {c.room ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <MapPin size={12} color={C.muted} strokeWidth={2} />
                              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{c.room}</Text>
                            </View>
                          ) : null}
                          {c.teacher ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <User size={12} color={C.muted} strokeWidth={2} />
                              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small} numberOfLines={1}>{c.teacher}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Pencil size={16} color={C.muted} strokeWidth={2} />
                      </Tap>
                    ))}
                  </View>
                )}
              </FadeIn>
            ))}
          </View>
        )
      ) : (
        (exams ?? []).length === 0 ? (
          <EmptyState icon={GraduationCap} title="Sin exámenes todavía"
            subtitle="Añade tu próximo examen y te avisamos un día antes." cta="Añadir examen" onCta={() => openExamModal()} />
        ) : (
          <View style={{ marginHorizontal: S.lg, marginTop: S.md, gap: 10 }}>
            {(exams ?? []).map((e, examIndex) => {
              const countdown = examCountdown(e.date);
              const soon = countdown === 'es hoy' || countdown === 'es mañana';
              const past = countdown === 'ya pasó';
              const dt = new Date(e.date);
              return (
                <FadeIn key={e.id} index={examIndex}>
                <Tap onPress={() => setExamMenu(e)} accessibilityLabel={`Examen de ${e.subject}, ${countdown}. Opciones`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 0.5, borderColor: C.border, borderRadius: R.lg, backgroundColor: C.surface, padding: 14, opacity: past ? 0.55 : 1 }}>
                  {/* Fecha en cifra grande, sin recuadro de color. */}
                  <View style={{ width: 46, alignItems: 'center' }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 25, fontFamily: FONT.display, color: soon ? C.error : C.text, lineHeight: 28, letterSpacing: -0.8 }}>{dt.getDate()}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, letterSpacing: 0.6, fontFamily: FONT.semibold, color: soon ? C.error : C.muted, textTransform: 'uppercase' }}>{dt.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3} numberOfLines={1}>{e.subject}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>
                      {dt.toLocaleDateString('es-ES', { weekday: 'long' })} · {dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}{e.room ? ` · ${e.room}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <Pill label={countdown.charAt(0).toUpperCase() + countdown.slice(1)} tone={soon ? 'red' : past ? 'gray' : 'blue'} />
                      {e.notificationId ? <Pill label="Aviso la víspera" tone="gray" icon={BellRing} /> : null}
                    </View>
                  </View>
                  <Pencil size={16} color={C.muted} strokeWidth={1.9} />
                </Tap>
                </FadeIn>
              );
            })}
          </View>
        )
      )}

      <OptionsSheet visible={addSheetOpen} title="Añadir a mi horario" onClose={() => setAddSheetOpen(false)} options={[
        { label: 'Añadir clase', icon: Clock, onPress: () => openClassModal() },
        { label: 'Añadir examen', icon: GraduationCap, onPress: () => openExamModal() },
      ]} />
      <OptionsSheet visible={!!classMenu} title={classMenu?.subject} onClose={() => setClassMenu(null)} options={[
        { label: 'Editar', icon: Pencil, onPress: () => { if (classMenu) openClassModal(classMenu); } },
        { label: 'Borrar', icon: Trash2, destructive: true, onPress: () => { if (classMenu) confirmRemoveClass(classMenu); } },
      ]} />
      <OptionsSheet visible={!!examMenu} title={examMenu?.subject} onClose={() => setExamMenu(null)} options={[
        { label: 'Editar', icon: Pencil, onPress: () => { if (examMenu) openExamModal(examMenu); } },
        { label: 'Borrar', icon: Trash2, destructive: true, onPress: () => { if (examMenu) confirmRemoveExam(examMenu); } },
      ]} />

      {/* ── Modal: clase ── */}
      <Modal visible={classModalOpen} transparent animationType="slide" onRequestClose={() => setClassModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '90%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{editingClass ? 'Editar clase' : 'Nueva clase'}</Text>
              <Tap onPress={() => setClassModalOpen(false)} accessibilityLabel="Cerrar" hitSlop={8}><X size={22} color={C.text} /></Tap>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 28, gap: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput value={csubject} onChangeText={setCsubject} placeholder="Asignatura" autoFocus={!editingClass}
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Asignatura" maxLength={80} style={input} />
              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Día</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => <Chip key={d} label={DAY_LABELS_SHORT[d]} active={cday === d} onPress={() => setCday(d)} accessibilityRole="tab" />)}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Empieza</Text>
                  <Tap onPress={() => setCshowStart(true)} accessibilityLabel="Elegir hora de inicio">
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Clock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{toHM(cstart)}</Text>
                    </View>
                  </Tap>
                </View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Termina</Text>
                  <Tap onPress={() => setCshowEnd(true)} accessibilityLabel="Elegir hora de fin">
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Clock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{toHM(cend)}</Text>
                    </View>
                  </Tap>
                </View>
              </View>
              {cshowStart && (
                <DateTimePicker value={cstart} mode="time" is24Hour minuteInterval={5} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => { if (Platform.OS === 'android') setCshowStart(false); if (e.type === 'set' && d) { setCstart(d); if (Platform.OS === 'ios') setCshowStart(false); } if (e.type === 'dismissed') setCshowStart(false); }} />
              )}
              {cshowEnd && (
                <DateTimePicker value={cend} mode="time" is24Hour minuteInterval={5} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, d) => { if (Platform.OS === 'android') setCshowEnd(false); if (e.type === 'set' && d) { setCend(d); if (Platform.OS === 'ios') setCshowEnd(false); } if (e.type === 'dismissed') setCshowEnd(false); }} />
              )}
              <TextInput value={croom} onChangeText={setCroom} placeholder="Aula (opcional)"
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Aula" maxLength={60} style={input} />
              <TextInput value={cteacher} onChangeText={setCteacher} placeholder="Profesor o profesora (opcional)"
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Profesor o profesora" maxLength={80} style={input} />
              <Btn full label={editingClass ? 'Guardar cambios' : 'Añadir clase'} busy={savingClass} onPress={submitClass} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal: examen ── */}
      <Modal visible={examModalOpen} transparent animationType="slide" onRequestClose={() => setExamModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '90%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{editingExam ? 'Editar examen' : 'Nuevo examen'}</Text>
              <Tap onPress={() => setExamModalOpen(false)} accessibilityLabel="Cerrar" hitSlop={8}><X size={22} color={C.text} /></Tap>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 28, gap: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput value={esubject} onChangeText={setEsubject} placeholder="Asignatura" autoFocus={!editingExam}
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Asignatura" maxLength={80} style={input} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Fecha</Text>
                  <Tap onPress={() => setEshowDate(true)} accessibilityLabel="Elegir fecha del examen">
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <CalendarClock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{edate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    </View>
                  </Tap>
                </View>
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Hora</Text>
                  <Tap onPress={() => setEshowTime(true)} accessibilityLabel="Elegir hora del examen">
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Clock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{toHM(edate)}</Text>
                    </View>
                  </Tap>
                </View>
              </View>
              {eshowDate && <DateTimePicker value={edate} mode="date" minimumDate={new Date()} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickDate} />}
              {eshowTime && <DateTimePicker value={edate} mode="time" is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickTime} />}
              <TextInput value={eroom} onChangeText={setEroom} placeholder="Aula (opcional)"
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Aula" maxLength={60} style={input} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny}>Si falta más de un día, te mandamos un recordatorio la víspera (necesita permiso de notificaciones).</Text>
              <Btn full label={editingExam ? 'Guardar cambios' : 'Añadir examen'} busy={savingExam} onPress={submitExam} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

export default withStudyAccount(Horario, 'Mi horario');
