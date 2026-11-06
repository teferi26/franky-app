import { withStudyAccount } from '@/components/StudyAccount';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Switch, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Flame, CalendarDays, CalendarClock, CheckSquare, FileText, Calculator, GraduationCap, Coins, Scale,
  ClipboardList, Compass, Search, Plus, Clock, Ticket, ChevronRight, Sun, Bell, Trophy, type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, SectionHeader, OptionsSheet, Btn } from '@/components/ui';
import { FadeIn, AnimatedNumber } from '@/components/motion';
import { DiscoverChecklist } from '@/components/DiscoverChecklist';
import { AgendaRow } from '@/components/AgendaRow';
import {
  loadStudySnapshot, summarizeToday, onStudyChange, getDigestPref, setDigestPref,
  type StudySnapshot, type DigestPref,
} from '@/lib/study';
import { getStreak, onStreakChange, type Streak } from '@/lib/streak';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, F, FONT, SHADOW } from '@/theme';

// ─── Estudio: el hub académico y la razón de abrir Franky cada día ─────────
// Arriba, "hoy" (próxima clase, examen, entregas) y la racha; después la
// agenda del día, las herramientas (horario, calendario, entregas, apuntes,
// nota media...) y los primeros pasos. Los datos son locales (AsyncStorage)
// con copia en la nube; ver src/lib/study.ts.

const DAY_NAMES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

type Tool = { key: string; icon: LucideIcon; title: string; note: string; route: string; badge?: number };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function Estudio({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const [snap, setSnap] = useState<StudySnapshot | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [digest, setDigest] = useState<DigestPref | null>(null);
  const [pickTime, setPickTime] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      const [s, st, d] = await Promise.all([loadStudySnapshot({}, owner), getStreak(owner), getDigestPref(owner)]);
      if (force) {
        // Refresco manual: también los eventos apuntados desde el servidor.
        const fresh = await loadStudySnapshot({}, owner);
        setSnap(fresh);
      } else setSnap(s);
      setStreak(st); setDigest(d);
    } catch {
      setSnap((prev) => prev ?? { classes: [], exams: [], tasks: [], events: [] });
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const a = onStudyChange(() => load());
    const b = onStreakChange(setStreak);
    return () => { a(); b(); };
  }, [load]);

  const today = useMemo(() => (snap ? summarizeToday(snap) : null), [snap]);
  const pendingTasks = snap ? snap.tasks.filter((t) => !t.done).length : 0;
  const upcomingExams = snap ? snap.exams.filter((e) => new Date(e.date) >= new Date()).length : 0;

  const tools: Tool[] = [
    { key: 'horario', icon: CalendarClock, title: 'Horario', note: snap?.classes.length ? `${snap.classes.length} clases a la semana` : 'Tus clases de la semana', route: '/horario' },
    { key: 'calendario', icon: CalendarDays, title: 'Calendario', note: 'Todo tu mes de un vistazo', route: '/calendario' },
    { key: 'tareas', icon: CheckSquare, title: 'Entregas', note: pendingTasks ? `${pendingTasks} pendientes` : 'Trabajos y tareas con aviso', route: '/tareas', badge: pendingTasks },
    { key: 'examenes', icon: GraduationCap, title: 'Exámenes', note: upcomingExams ? `${upcomingExams} por delante` : 'Con cuenta atrás y recordatorio', route: '/horario?tab=examenes' },
    { key: 'apuntes', icon: FileText, title: 'Apuntes', note: 'De tu carrera, por asignatura', route: '/apuntes' },
    { key: 'nota', icon: Calculator, title: 'Nota media', note: 'Calcula tu expediente', route: '/nota-media' },
    { key: 'becas', icon: Coins, title: 'Becas', note: 'Las que te tocan, con alertas', route: '/becas' },
    { key: 'corte', icon: ClipboardList, title: 'Notas de corte', note: 'Oficiales, por uni y grado', route: '/notas-corte' },
    { key: 'unis', icon: Scale, title: 'Comparar unis', note: 'Elige con datos', route: '/comparar-unis' },
    { key: 'test', icon: Compass, title: 'Test vocacional', note: '¿Qué carrera va contigo?', route: '/test-vocacional' },
    { key: 'tramites', icon: ClipboardList, title: 'Trámites', note: 'Matrícula, becas, títulos', route: '/tramites' },
  ];

  const toggleDigest = async (on: boolean) => {
    if (!digest) return;
    if (on) {
      const perm = await Notifications.getPermissionsAsync();
      const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) { toastError('Sin permiso de notificaciones', 'Actívalo en los ajustes del móvil para recibir el resumen.'); return; }
    }
    if (!studyStorage.current(owner)) return;
    const next = { ...digest, enabled: on };
    setDigest(next);
    await setDigestPref(next, owner);
    if (on) toast('Resumen activado', `Cada mañana a las ${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')} con lo que te toca.`);
  };
  const onPickTime = async (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setPickTime(false);
    if (e.type === 'set' && d && digest) {
      const next = { ...digest, hour: d.getHours(), minute: d.getMinutes() };
      setDigest(next);
      await setDigestPref(next, owner);
      if (Platform.OS === 'ios') setPickTime(false);
    } else if (e.type === 'dismissed') setPickTime(false);
  };

  const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const count = streak?.count ?? 0;
  const last7 = useMemo(() => {
    const out: { key: string; label: string; on: boolean; today: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ key, label: DAY_NAMES[d.getDay()], on: !!streak?.days.includes(key), today: i === 0 });
    }
    return out;
  }, [streak]);

  return (
    <Screen
      title="Estudio"
      subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
      scrollTopKey="estudio"
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}
      right={
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <Tap onPress={() => router.push('/(tabs)/explorar')} accessibilityLabel="Buscar" hitSlop={12}>
            <Search size={23} color={C.text} strokeWidth={1.75} />
          </Tap>
          <Tap hitSlop={8} onPress={() => setAddOpen(true)} accessibilityLabel="Añadir clase, examen o entrega" haptic
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={C.onAccent} strokeWidth={2.2} />
          </Tap>
        </View>
      }>

      {/* ── Hoy: portada editorial, sin degradado. El saludo es el rótulo y la
             frase del día es el titular grande. ── */}
      <FadeIn>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <Sun size={14} color={C.blue} strokeWidth={1.8} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { color: C.blue }]}>{greeting()}</Text>
          </View>
          {!today || !today.hasAnyData ? (
            <>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{ color: C.text, fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, marginBottom: 8 }}>
                Mete tu horario en un minuto
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { fontSize: 14.5, lineHeight: 21, marginBottom: 16 }]}>
                Clases, exámenes y entregas. Franky te dice cada mañana lo que toca y te avisa la víspera.
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Tap onPress={() => router.push('/horario?add=clase')} haptic accessibilityLabel="Añadir clase"
                  style={{ backgroundColor: C.blue, borderRadius: R.full, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.onAccent, fontFamily: FONT.semibold, fontSize: 13.5 }}>Añadir clase</Text>
                </Tap>
                <Tap onPress={() => router.push('/tareas?add=1')} haptic accessibilityLabel="Añadir entrega"
                  style={{ borderRadius: R.full, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontFamily: FONT.semibold, fontSize: 13.5 }}>Añadir entrega</Text>
                </Tap>
              </View>
            </>
          ) : (
            <Tap onPress={() => router.push('/calendario')} haptic={false} accessibilityLabel="Abrir el calendario">
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{ color: C.text, fontFamily: FONT.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.9, marginBottom: 12 }}>
                {today.nextClass
                  ? `${today.nextClass.title} a las ${today.nextClass.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                  : today.items.length > 0 ? 'Hoy ya no tienes más clases' : 'Hoy no tienes clases'}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {today.nextExam ? (
                  <Stat icon={GraduationCap} label={today.nextExam.days === 0 ? 'Examen hoy' : today.nextExam.days === 1 ? 'Examen mañana' : `Examen en ${today.nextExam.days} días`} />
                ) : null}
                {today.overdue > 0 ? <Stat icon={CheckSquare} label={`${today.overdue} atrasadas`} /> : null}
                {today.dueToday > 0 ? <Stat icon={CheckSquare} label={`${today.dueToday} para hoy`} /> : null}
                {pendingTasks > 0 && today.dueToday === 0 && today.overdue === 0 ? <Stat icon={CheckSquare} label={`${pendingTasks} entregas`} /> : null}
                {today.items.filter((i) => i.kind === 'event').length > 0 ? <Stat icon={Ticket} label="Plan esta noche" /> : null}
              </View>
            </Tap>
          )}
        </View>
      </FadeIn>

      {/* ── Racha ── */}
      <View style={[{
        marginHorizontal: S.lg, marginBottom: S.md, backgroundColor: C.surface, borderRadius: R.lg, padding: S.lg,
        borderWidth: 0.5, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 16,
      }, SHADOW.card]}>
        {/* Llama suelta: sin cuadrado tintado alrededor. */}
        <Flame size={30} color={count > 0 ? C.accent3 : C.muted} fill={count > 0 ? C.accent3 : 'transparent'} strokeWidth={1.6} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AnimatedNumber value={count} style={[F.display, { fontSize: 28 }]} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.muted }]}>{count === 1 ? 'día seguido' : 'días seguidos'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
            {last7.map((d) => (
              <View key={d.key} style={{ alignItems: 'center', gap: 3 }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: d.on ? C.accent3 : C.input, borderWidth: d.today ? 2 : 0, borderColor: C.blue,
                }}>
                  {d.on ? <Flame size={12} color={C.onWarm} fill={C.onWarm} /> : null}
                </View>
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 9.5, color: C.muted, fontFamily: FONT.medium }}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {streak && streak.best > 1 ? (
          <View style={{ alignItems: 'center' }}>
            <Trophy size={16} color={C.accent3} strokeWidth={2.2} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT.medium, marginTop: 2 }}>Récord {streak.best}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Agenda de hoy ── */}
      {today && today.items.length > 0 ? (
        <>
          <SectionHeader title="Hoy" action="Ver calendario" onAction={() => router.push('/calendario')} />
          <View style={{ marginHorizontal: S.lg, gap: 8 }}>
            {today.items.map((it) => <AgendaRow key={it.key} item={it} onPress={() => router.push(it.route as never)} />)}
          </View>
        </>
      ) : null}

      {/* ── Herramientas ── */}
      <SectionHeader title="Tus herramientas" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: S.lg - 4 }}>
        {tools.map((tl, i) => (
          <View key={tl.key} style={{ width: '50%', padding: 4 }}>
            <FadeIn index={i} distance={10}>
              <Tap onPress={() => router.push(tl.route as never)} accessibilityLabel={tl.title} accessibilityHint={tl.note}
                style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 15, minHeight: 112, borderWidth: 0.5, borderColor: C.border }, SHADOW.card]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  {/* Icono suelto de trazo fino: nada de cuadrados tintados. */}
                  <tl.icon size={22} color={C.blue} strokeWidth={1.7} />
                  {tl.badge ? (
                    <View style={{ minWidth: 21, height: 21, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
                      <Text maxFontSizeMultiplier={1.2} style={{ color: C.onAccent, fontSize: 11.5, fontFamily: FONT.heading }}>{tl.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { marginTop: 14, letterSpacing: -0.2 }]} numberOfLines={1}>{tl.title}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.small, { marginTop: 2 }]} numberOfLines={2}>{tl.note}</Text>
              </Tap>
            </FadeIn>
          </View>
        ))}
      </View>

      {/* ── Resumen de la mañana ── */}
      <SectionHeader title="Resumen de la mañana" subtitle="Una notificación con lo que te toca ese día" />
      <View style={[{ marginHorizontal: S.lg, backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 0.5, borderColor: C.border }, SHADOW.card]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15 }}>
          <Bell size={21} color={C.blue} strokeWidth={1.7} />
          <View style={{ flex: 1 }}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.h3}>Avisarme cada mañana</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.small}>Solo los días con clases, exámenes o entregas</Text>
          </View>
          <Switch value={!!digest?.enabled} onValueChange={toggleDigest} trackColor={{ true: C.blue, false: C.border }} thumbColor={C.white} />
        </View>
        {digest?.enabled ? (
          <Tap onPress={() => setPickTime(true)} accessibilityLabel="Cambiar la hora del resumen">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.borderLight }}>
              <Clock size={18} color={C.muted} strokeWidth={2} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.body, { flex: 1 }]}>Hora del aviso</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, { color: C.blue }]}>
                {String(digest.hour).padStart(2, '0')}:{String(digest.minute).padStart(2, '0')}
              </Text>
              <ChevronRight size={18} color={C.muted} />
            </View>
          </Tap>
        ) : null}
        {pickTime && digest ? (
          <DateTimePicker
            value={(() => { const d = new Date(); d.setHours(digest.hour, digest.minute, 0, 0); return d; })()}
            mode="time" is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickTime} />
        ) : null}
      </View>

      {/* ── Primeros pasos ── */}
      <View style={{ marginTop: S.lg }}>
        <DiscoverChecklist />
      </View>

      <View style={{ paddingHorizontal: S.lg, marginTop: S.md }}>
        <Btn variant="ghost" full label="Ver la guía de la app" icon={Compass} onPress={() => router.push('/tour')} />
      </View>

      <OptionsSheet visible={addOpen} title="Añadir" onClose={() => setAddOpen(false)} options={[
        { label: 'Clase', icon: Clock, onPress: () => router.push('/horario?add=clase') },
        { label: 'Examen', icon: GraduationCap, onPress: () => router.push('/horario?add=examen') },
        { label: 'Entrega o tarea', icon: CheckSquare, onPress: () => router.push('/tareas?add=1') },
      ]} />
    </Screen>
  );
}

function Stat({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: C.border, borderRadius: R.full, paddingHorizontal: 11, paddingVertical: 6 }}>
      <Icon size={13} color={C.blue} strokeWidth={1.9} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontFamily: FONT.medium, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

export default withStudyAccount(Estudio, 'Estudio');
