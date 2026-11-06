import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Flame, Clock, GraduationCap, CheckSquare, ChevronRight, CalendarPlus, type LucideIcon } from 'lucide-react-native';
import { Tap } from '@/components/ui';
import { loadStudySnapshot, summarizeToday, onStudyChange } from '@/lib/study';
import { getStreak, onStreakChange, type Streak } from '@/lib/streak';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, S, R, FONT, F } from '@/theme';

// ─── Tira "Hoy" del feed ────────────────────────────────────────────────────
// Una línea con la racha y lo más inmediato del día (próxima clase, examen
// cercano o entregas). Tocar lleva a Estudio. Si la persona no ha metido
// nada todavía, invita a hacerlo una sola vez de forma discreta.
//
// Va en memo y sin props: el feed la monta como cabecera de la lista y sus
// repintados (cada like, cada guardado) no tienen por qué recalcular esto.
export const TodayStrip = React.memo(function TodayStrip() {
  const router = useRouter();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof summarizeToday> | null>(null);

  const load = useCallback(() => {
    getStreak().then(setStreak).catch(() => {});
    loadStudySnapshot({ events: false }).then((s) => setSummary(summarizeToday(s))).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const a = onStreakChange(setStreak);
    const b = onStudyChange(load);
    return () => { a(); b(); };
  }, [load]);

  if (!summary) return null;

  // Qué se enseña, por prioridad: examen inminente > entregas atrasadas >
  // próxima clase > entregas de hoy > próximo examen > día libre.
  let Icon: LucideIcon = CalendarPlus;
  let text = 'Mete tu horario y verás aquí tu día';
  let tone = C.muted;
  if (summary.hasAnyData) {
    if (summary.nextExam && summary.nextExam.days <= 3) {
      Icon = GraduationCap; tone = C.error;
      text = summary.nextExam.days === 0 ? `Hoy: examen de ${summary.nextExam.item.subject}`
        : summary.nextExam.days === 1 ? `Mañana: examen de ${summary.nextExam.item.subject}`
        : `Examen de ${summary.nextExam.item.subject} en ${summary.nextExam.days} días`;
    } else if (summary.overdue > 0) {
      Icon = CheckSquare; tone = C.error;
      text = summary.overdue === 1 ? '1 entrega atrasada' : `${summary.overdue} entregas atrasadas`;
    } else if (summary.nextClass) {
      Icon = Clock; tone = C.blue;
      text = `${summary.nextClass.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${summary.nextClass.title}`;
    } else if (summary.dueToday > 0) {
      Icon = CheckSquare; tone = C.warning;
      text = summary.dueToday === 1 ? '1 entrega para hoy' : `${summary.dueToday} entregas para hoy`;
    } else if (summary.nextExam) {
      Icon = GraduationCap; tone = C.blue;
      text = `Próximo examen en ${summary.nextExam.days} días`;
    } else {
      Icon = Clock; tone = C.success;
      text = 'Hoy no tienes nada más. Disfruta.';
    }
  }

  const count = streak?.count ?? 0;
  return (
    <Tap onPress={() => router.push('/(tabs)/estudio')} haptic
      accessibilityLabel={`Estudio. Racha de ${count} ${count === 1 ? 'día' : 'días'}. ${text}`}
      accessibilityHint="Abre tu agenda de estudio">
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: S.lg, marginTop: S.sm, marginBottom: 2,
        backgroundColor: C.surface, borderRadius: R.md, borderWidth: 0.5, borderColor: C.border,
        paddingHorizontal: 12, paddingVertical: 11, minHeight: 46,
      }}>
        {/* Racha: la llama y la cifra sueltas, sin píldora tintada. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Flame size={15} color={count > 0 ? C.accent3 : C.muted} fill={count > 0 ? C.accent3 : 'transparent'} strokeWidth={1.9} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 13.5, color: count > 0 ? C.text : C.muted }}>{count}</Text>
        </View>
        <View style={{ width: 0.5, height: 18, backgroundColor: C.border }} />
        <Icon size={16} color={tone} strokeWidth={1.9} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[F.body, { flex: 1, fontSize: 14, fontFamily: FONT.medium }]}>{text}</Text>
        <ChevronRight size={16} color={C.muted} strokeWidth={1.9} />
      </View>
    </Tap>
  );
});
