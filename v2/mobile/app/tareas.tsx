import { withStudyAccount } from '@/components/StudyAccount';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Modal, Platform, Alert, KeyboardAvoidingView, ScrollView, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Plus, X, CalendarClock, Clock, Check, CheckSquare, Trash2, Pencil, Flag, ChevronDown, ChevronUp } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Btn, Chip, Tap, EmptyState, OptionsSheet, Pill, SkeletonList } from '@/components/ui';
import { getTasks, addTask, updateTask, toggleTask, removeTask, onStudyChange, type TaskItem, type TaskPriority } from '@/lib/study';
import { completeStep } from '@/lib/tour';
import { dayKey } from '@/lib/streak';
import { toast } from '@/lib/toast';
import { FadeIn } from '@/components/motion';
import { MAX_FONT_SCALE, useReduceMotion } from '@/lib/a11y';
import { C, S, R, F, FONT } from '@/theme';

// ─── Entregas y tareas ──────────────────────────────────────────────────────
// Lista agrupada por urgencia (atrasadas, hoy, esta semana, más adelante, sin
// fecha) y las hechas plegadas abajo. Alta/edición en una hoja con fecha,
// hora, asignatura y prioridad. Recordatorio local la víspera (src/lib/study.ts).
type Group = { key: string; title: string; items: TaskItem[]; tone?: string };

const PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: 'alta', label: 'Alta' }, { key: 'normal', label: 'Normal' }, { key: 'baja', label: 'Baja' },
];

function groupTasks(list: TaskItem[]): Group[] {
  const now = new Date();
  const today = dayKey(now);
  const week = new Date(now); week.setDate(week.getDate() + 7);
  const g: Record<string, TaskItem[]> = { late: [], today: [], week: [], later: [], nodate: [] };
  for (const t of list) {
    if (t.done) continue;
    if (!t.due) { g.nodate.push(t); continue; }
    const d = new Date(t.due);
    const k = dayKey(d);
    if (k === today) g.today.push(t);
    else if (d < now) g.late.push(t);
    else if (d <= week) g.week.push(t);
    else g.later.push(t);
  }
  return [
    { key: 'late', title: 'Atrasadas', items: g.late, tone: C.error },
    { key: 'today', title: 'Hoy', items: g.today, tone: C.accent3 },
    { key: 'week', title: 'Esta semana', items: g.week },
    { key: 'later', title: 'Más adelante', items: g.later },
    { key: 'nodate', title: 'Sin fecha', items: g.nodate },
  ].filter((x) => x.items.length > 0);
}

function dueLabel(t: TaskItem): string | null {
  if (!t.due) return null;
  const d = new Date(t.due);
  const today = dayKey();
  const k = dayKey(d);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (k === today) return `Hoy · ${time}`;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (k === dayKey(tomorrow)) return `Mañana · ${time}`;
  return `${d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function Tareas({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string; date?: string }>();
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [menuFor, setMenuFor] = useState<TaskItem | null>(null);

  // Hoja de alta/edición
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [hasDue, setHasDue] = useState(true);
  const [due, setDue] = useState<Date>(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(23, 59, 0, 0); return d; });
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setTasks(await getTasks(owner)); } catch { setTasks((p) => p ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onStudyChange(load), [load]);

  const openNew = useCallback((date?: Date) => {
    setEditing(null); setTitle(''); setSubject(''); setPriority('normal'); setHasDue(true);
    const d = date ? new Date(date) : new Date();
    if (!date) d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 0, 0);
    setDue(d);
    setOpen(true);
  }, []);
  const openEdit = (t: TaskItem) => {
    setEditing(t); setTitle(t.title); setSubject(t.subject ?? ''); setPriority(t.priority);
    setHasDue(!!t.due); setDue(t.due ? new Date(t.due) : new Date());
    setOpen(true);
  };

  // ?add=1 (desde Estudio o Calendario) abre la hoja directamente.
  useEffect(() => {
    if (params.add === '1') openNew(params.date ? new Date(params.date) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add]);

  const submit = async () => {
    const tt = title.trim();
    if (tt.length < 2) { Alert.alert('Falta el título', 'Escribe qué tienes que entregar.'); return; }
    setSaving(true);
    try {
      if (hasDue) {
        // Pedimos permiso aquí (no en la capa de datos) para poder explicarlo.
        const perm = await Notifications.getPermissionsAsync();
        if (!perm.granted) await Notifications.requestPermissionsAsync().catch(() => {});
      }
      if (!studyStorage.current(owner)) return;
      const payload = { title: tt, subject: subject.trim() || null, due: hasDue ? due.toISOString() : null, priority };
      const next = editing ? await updateTask(editing.id, payload, owner) : await addTask(payload, owner);
      setTasks(next);
      setOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(editing ? 'Entrega actualizada' : 'Entrega añadida', hasDue ? 'Te avisamos la víspera.' : undefined);
      completeStep('horario');
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (t: TaskItem) => {
    Haptics.impactAsync(t.done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setTasks(await toggleTask(t.id, owner));
  };
  const confirmRemove = (t: TaskItem) => {
    Alert.alert('¿Borrar la entrega?', t.title, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => setTasks(await removeTask(t.id, owner)) },
    ]);
  };

  const groups = useMemo(() => groupTasks(tasks ?? []), [tasks]);
  const done = useMemo(() => (tasks ?? []).filter((t) => t.done), [tasks]);
  const pendingCount = (tasks ?? []).filter((t) => !t.done).length;

  const onPickDate = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (e.type === 'set' && d) setDue((prev) => { const n = new Date(prev); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n; });
    if (Platform.OS === 'ios' && e.type === 'dismissed') setShowDate(false);
  };
  const onPickTime = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShowTime(false);
    if (e.type === 'set' && d) setDue((prev) => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes(), 0, 0); return n; });
    if (Platform.OS === 'ios' && e.type === 'dismissed') setShowTime(false);
  };

  const input = {
    backgroundColor: C.surface, borderWidth: 0.5, borderColor: C.border,
    borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text,
  } as const;

  return (
    <Screen title="Entregas" subtitle={pendingCount ? `${pendingCount} pendientes` : 'Nada pendiente'} back
      right={
        <Tap onPress={() => openNew()} accessibilityLabel="Añadir entrega" haptic
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={20} color={C.onAccent} strokeWidth={2.6} />
        </Tap>
      }>
      {tasks === null ? <SkeletonList count={4} height={64} radius={R.md} /> : groups.length === 0 && done.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Sin entregas todavía"
          subtitle="Trabajos, prácticas, exámenes online. Te avisamos la víspera para que no se te pase ninguna."
          cta="Añadir la primera" onCta={() => openNew()} />
      ) : (
        <View style={{ paddingTop: S.md }}>
          {groups.length === 0 ? (
            <EmptyState compact icon={Check} title="Todo al día" subtitle="No tienes entregas pendientes." />
          ) : null}
          {groups.map((g, gi) => (
            <FadeIn key={g.key} index={gi} style={{ marginBottom: S.xl }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: S.lg, marginBottom: S.sm }}>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, g.tone ? { color: g.tone } : null]}>{g.title}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { fontFamily: FONT.semibold, color: g.tone ?? C.muted }]}>{g.items.length}</Text>
              </View>
              <View style={{ borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
                {g.items.map((t) => <TaskRow key={t.id} t={t} onToggle={() => onToggle(t)} onMore={() => setMenuFor(t)} />)}
              </View>
            </FadeIn>
          ))}
          {done.length > 0 ? (
            <View style={{ marginBottom: S.lg }}>
              <Tap onPress={() => setShowDone((v) => !v)} accessibilityLabel={showDone ? 'Ocultar hechas' : 'Ver hechas'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.lg, marginBottom: 8 }}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Hechas ({done.length})</Text>
                  {showDone ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
                </View>
              </Tap>
              {showDone ? (
                <View style={{ borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
                  {done.map((t) => <TaskRow key={t.id} t={t} onToggle={() => onToggle(t)} onMore={() => setMenuFor(t)} />)}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      <OptionsSheet visible={!!menuFor} title={menuFor?.title} onClose={() => setMenuFor(null)} options={[
        { label: 'Editar', icon: Pencil, onPress: () => { if (menuFor) openEdit(menuFor); } },
        { label: menuFor?.done ? 'Marcar como pendiente' : 'Marcar como hecha', icon: Check, onPress: () => { if (menuFor) onToggle(menuFor); } },
        { label: 'Borrar', icon: Trash2, destructive: true, onPress: () => { if (menuFor) confirmRemove(menuFor); } },
      ]} />

      {/* Hoja de alta / edición */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, maxHeight: '90%' }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h2, { flex: 1 }]}>{editing ? 'Editar entrega' : 'Nueva entrega'}</Text>
              <Tap onPress={() => setOpen(false)} accessibilityLabel="Cerrar" hitSlop={8}><X size={22} color={C.text} /></Tap>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 28, gap: 12 }} keyboardShouldPersistTaps="handled">
              <TextInput value={title} onChangeText={setTitle} placeholder="Qué entregas (ej.: Práctica 2 de Álgebra)" autoFocus
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Título" maxLength={120} style={input} />
              <TextInput value={subject} onChangeText={setSubject} placeholder="Asignatura (opcional)"
                placeholderTextColor={C.muted} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel="Asignatura" maxLength={80} style={input} />

              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Chip label="Con fecha límite" active={hasDue} onPress={() => setHasDue(true)} accessibilityRole="tab" icon={CalendarClock} />
                <Chip label="Sin fecha" active={!hasDue} onPress={() => setHasDue(false)} accessibilityRole="tab" />
              </View>
              {hasDue ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Tap onPress={() => setShowDate(true)} accessibilityLabel="Elegir fecha" style={{ flex: 1 }}>
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <CalendarClock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  </Tap>
                  <Tap onPress={() => setShowTime(true)} accessibilityLabel="Elegir hora" style={{ flex: 1 }}>
                    <View style={[input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                      <Clock size={16} color={C.blue} strokeWidth={2.2} />
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ color: C.text, fontSize: 15, fontFamily: FONT.medium }}>{due.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                  </Tap>
                </View>
              ) : null}
              {showDate ? <DateTimePicker value={due} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickDate} /> : null}
              {showTime ? <DateTimePicker value={due} mode="time" is24Hour display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickTime} /> : null}

              <View>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.label, { marginBottom: 8 }]}>Prioridad</Text>
                <View style={{ flexDirection: 'row' }}>
                  {PRIORITIES.map((p) => <Chip key={p.key} label={p.label} active={priority === p.key} onPress={() => setPriority(p.key)} accessibilityRole="tab" icon={p.key === 'alta' ? Flag : undefined} />)}
                </View>
              </View>

              <Btn full label={editing ? 'Guardar cambios' : 'Añadir entrega'} busy={saving} onPress={submit} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

// Casilla con el check entrando con muelle al marcar (y saliendo al
// desmarcar). Respeta "reducir movimiento": ahi salta al estado final.
function CheckBox({ done, high }: { done: boolean; high: boolean }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(done ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(done ? 1 : 0); return; }
    const anim = Animated.spring(v, { toValue: done ? 1 : 0, useNativeDriver: true, speed: 16, bounciness: 9 });
    anim.start();
    return () => anim.stop();
  }, [done, reduce, v]);
  return (
    <View style={{
      width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      borderWidth: done ? 0 : 1.5, borderColor: high ? C.error : C.border,
    }}>
      <Animated.View style={{
        position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: C.blue,
        alignItems: 'center', justifyContent: 'center',
        opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
      }}>
        <Check size={15} color={C.onAccent} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

function TaskRow({ t, onToggle, onMore }: { t: TaskItem; onToggle: () => void; onMore: () => void }) {
  const label = dueLabel(t);
  const late = !t.done && t.due && new Date(t.due) < new Date() && dayKey(new Date(t.due)) !== dayKey();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: S.lg, paddingVertical: 13, minHeight: 60,
      borderBottomWidth: 0.5, borderBottomColor: C.borderLight, opacity: t.done ? 0.55 : 1,
    }}>
      <Tap onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: t.done }} accessibilityLabel={t.done ? 'Marcar como pendiente' : 'Marcar como hecha'} hitSlop={10}>
        <CheckBox done={!!t.done} high={t.priority === 'alta'} />
      </Tap>
      <Tap onPress={onMore} onLongPress={onMore} style={{ flex: 1 }} accessibilityLabel={`${t.title}. Opciones`}>
        <View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, t.done && { textDecorationLine: 'line-through', color: C.muted }]} numberOfLines={2}>{t.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {label ? <Pill label={label} tone={late ? 'red' : t.done ? 'gray' : 'blue'} icon={CalendarClock} /> : null}
            {t.subject ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.tiny} numberOfLines={1}>{t.subject}</Text> : null}
            {t.priority === 'alta' && !t.done ? <Pill label="Alta" tone="red" icon={Flag} /> : null}
          </View>
        </View>
      </Tap>
    </View>
  );
}

export default withStudyAccount(Tareas, 'Mis entregas');
