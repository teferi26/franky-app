import { withStudyAccount } from '@/components/StudyAccount';
import { studyStorage, type SessionIdentity } from '@/lib/study-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, ChevronRight, CalendarPlus, Plus, Clock, GraduationCap, CheckSquare, CalendarX2 } from 'lucide-react-native';
import { Screen } from '@/components/Screen';
import { Tap, OptionsSheet, EmptyState, Btn, SkeletonList } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { AgendaRow, agendaTone } from '@/components/AgendaRow';
import { loadStudySnapshot, buildAgenda, onStudyChange, exportToDeviceCalendar, type StudySnapshot, type AgendaItem } from '@/lib/study';
import { dayKey } from '@/lib/streak';
import { toast, toastError } from '@/lib/toast';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, F, R, FONT } from '@/theme';

// ─── Calendario: el mes con puntos por tipo y la agenda del día elegido ────
// Junta clases (semanales), exámenes, entregas y los eventos a los que estás
// apuntado. Se puede volcar todo al calendario del móvil (expo-calendar).
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function Calendario({ owner }: { owner: SessionIdentity }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [snap, setSnap] = useState<StudySnapshot | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(() => new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setSnap(await loadStudySnapshot({}, owner)); }
    catch { setSnap((p) => p ?? { classes: [], exams: [], tasks: [], events: [] }); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onStudyChange(load), [load]);

  const monthStart = cursor;
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);
  const monthItems = useMemo(() => (snap ? buildAgenda(monthStart, monthEnd, snap) : []), [snap, monthStart, monthEnd]);
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const it of monthItems) {
      const k = dayKey(it.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [monthItems]);

  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const selectedKey = dayKey(selected);
  const todayKey = dayKey();
  const dayItems = useMemo(() => {
    if (!snap) return [];
    return buildAgenda(selected, selected, snap);
  }, [snap, selected]);

  const cell = Math.floor((width - S.lg * 2 - 6 * 4) / 7);

  const shiftMonth = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
  };
  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(now);
  };

  const doExport = async (what: { classes?: boolean; exams?: boolean; tasks?: boolean }) => {
    const r = await exportToDeviceCalendar(what, owner);
    if (r.ok) toast(r.count === 0 ? 'Nada que exportar todavía' : `${r.count} ${r.count === 1 ? 'elemento añadido' : 'elementos añadidos'} a tu calendario`);
    else if (r.reason === 'permission') toastError('Sin permiso de calendario', 'Actívalo en los ajustes del móvil.');
    else toastError('No se pudo exportar', 'Inténtalo de nuevo.');
  };

  const selectedLabel = selected.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen title="Calendario" back
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      right={
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Tap onPress={() => setExportOpen(true)} accessibilityLabel="Exportar al calendario del móvil" hitSlop={6}>
            <CalendarPlus size={23} color={C.text} strokeWidth={2} />
          </Tap>
          <Tap onPress={() => setAddOpen(true)} accessibilityLabel="Añadir" haptic
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={C.onAccent} strokeWidth={2.6} />
          </Tap>
        </View>
      }>

      {/* Cabecera del mes */}
      {/* Cabecera del mes: flechas sueltas, sin circulos rellenos. */}
      <FadeIn>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingTop: S.lg, paddingBottom: S.md }}>
        <Tap onPress={() => shiftMonth(-1)} accessibilityLabel="Mes anterior" hitSlop={14}
          style={{ width: 32, height: 34, alignItems: 'flex-start', justifyContent: 'center' }}>
          <ChevronLeft size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.display, { flex: 1, textAlign: 'center', fontSize: 21, letterSpacing: -0.6 }]}>
          {MONTHS[cursor.getMonth()].charAt(0).toUpperCase() + MONTHS[cursor.getMonth()].slice(1)} {cursor.getFullYear()}
        </Text>
        <Tap onPress={() => shiftMonth(1)} accessibilityLabel="Mes siguiente" hitSlop={14}
          style={{ width: 32, height: 34, alignItems: 'flex-end', justifyContent: 'center' }}>
          <ChevronRight size={22} color={C.text} strokeWidth={1.9} />
        </Tap>
      </View>

      {/* Rejilla limpia: sin tarjeta ni sombra, solo aire y el dia elegido en violeta solido */}
      <View style={{ marginHorizontal: S.lg }}>
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map((w, i) => (
            <View key={w} style={{ width: cell, alignItems: 'center' }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 11, fontFamily: FONT.semibold, color: i >= 5 ? C.accent2 : C.muted }}>{w}</Text>
            </View>
          ))}
        </View>
        {grid.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
            {row.map((d, ci) => {
              if (!d) return <View key={ci} style={{ width: cell, height: cell }} />;
              const k = dayKey(d);
              const items = byDay.get(k) ?? [];
              const isSel = k === selectedKey;
              const isToday = k === todayKey;
              const kinds = [...new Set(items.map((i) => i.kind))].slice(0, 3);
              return (
                <Tap key={ci} onPress={() => { setSelected(d); Haptics.selectionAsync().catch(() => {}); }}
                  accessibilityLabel={`${d.getDate()} de ${MONTHS[d.getMonth()]}${items.length ? `, ${items.length} elementos` : ''}`}
                  accessibilityState={{ selected: isSel }}
                  style={{
                    width: cell, height: cell, borderRadius: cell * 0.34, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSel ? C.blue : 'transparent',
                    borderWidth: !isSel && isToday ? 1 : 0, borderColor: C.blue,
                  }}>
                  <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 14, fontFamily: isToday || isSel ? FONT.heading : FONT.medium, color: isSel ? C.onAccent : C.text }}>{d.getDate()}</Text>
                  <View style={{ flexDirection: 'row', gap: 2, height: 5, marginTop: 2 }}>
                    {kinds.map((kd) => (
                      <View key={kd} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: isSel ? 'rgba(255,255,255,0.9)' : agendaTone(kd) }} />
                    ))}
                  </View>
                </Tap>
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: C.borderLight }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([['class', 'Clase'], ['exam', 'Examen'], ['task', 'Entrega'], ['event', 'Plan']] as const).map(([k, l]) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: agendaTone(k) }} />
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT.medium }}>{l}</Text>
              </View>
            ))}
          </View>
          {selectedKey !== todayKey || cursor.getMonth() !== new Date().getMonth() ? (
            <Btn variant="link" small label="Hoy" onPress={goToday} />
          ) : null}
        </View>
      </View>
      </FadeIn>

      {/* Día elegido: rotulo pequeno y la fecha en Outfit grande. */}
      <FadeIn index={1}>
        <View style={{ paddingHorizontal: S.lg, marginTop: S.xxl, marginBottom: S.md }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={F.label}>Ese día</Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[F.display, { fontSize: 24, letterSpacing: -0.8, marginTop: 4 }]}>
            {selectedLabel.charAt(0).toUpperCase() + selectedLabel.slice(1)}
          </Text>
        </View>
      </FadeIn>
      {snap === null ? <SkeletonList count={3} height={62} radius={R.md} /> : dayItems.length === 0 ? (
        <EmptyState compact icon={CalendarX2} title="Nada ese día"
          subtitle="Añade una clase, un examen o una entrega y aparecerá aquí."
          cta="Añadir" onCta={() => setAddOpen(true)} />
      ) : (
        <View style={{ marginHorizontal: S.lg, gap: 8 }}>
          {dayItems.map((it, i) => (
            <FadeIn key={it.key} index={i}>
              <AgendaRow item={it} onPress={() => router.push(it.route as never)} />
            </FadeIn>
          ))}
        </View>
      )}

      <OptionsSheet visible={addOpen} title="Añadir" onClose={() => setAddOpen(false)} options={[
        { label: 'Clase', icon: Clock, onPress: () => router.push('/horario?add=clase') },
        { label: 'Examen', icon: GraduationCap, onPress: () => router.push(`/horario?add=examen&date=${selected.toISOString()}`) },
        { label: 'Entrega o tarea', icon: CheckSquare, onPress: () => router.push(`/tareas?add=1&date=${selected.toISOString()}`) },
      ]} />
      <OptionsSheet visible={exportOpen} title="Añadir al calendario del móvil" onClose={() => setExportOpen(false)} options={[
        { label: 'Todo (clases, exámenes y entregas)', icon: CalendarPlus, onPress: () => doExport({ classes: true, exams: true, tasks: true }) },
        { label: 'Solo las clases de la semana', icon: Clock, onPress: () => doExport({ classes: true }) },
        { label: 'Solo exámenes y entregas', icon: GraduationCap, onPress: () => doExport({ exams: true, tasks: true }) },
      ]} />
    </Screen>
  );
}

export default withStudyAccount(Calendario, 'Calendario');
