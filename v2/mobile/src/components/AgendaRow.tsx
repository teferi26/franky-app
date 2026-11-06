import React from 'react';
import { View, Text } from 'react-native';
import { Clock, GraduationCap, CheckSquare, Ticket, MapPin, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Tap } from '@/components/ui';
import type { AgendaItem } from '@/lib/study';
import { MAX_FONT_SCALE } from '@/lib/a11y';
import { C, R, F, FONT } from '@/theme';

const KIND_ICON: Record<AgendaItem['kind'], LucideIcon> = { class: Clock, exam: GraduationCap, task: CheckSquare, event: Ticket };
const KIND_LABEL: Record<AgendaItem['kind'], string> = { class: 'Clase', exam: 'Examen', task: 'Entrega', event: 'Plan' };

/** Color por tipo de elemento de agenda (compartido por Estudio y Calendario). */
export function agendaTone(kind: AgendaItem['kind']): string {
  return kind === 'exam' ? C.error : kind === 'task' ? C.accent3 : kind === 'event' ? C.accent2 : C.blue;
}

/** Fila de agenda: hora, barra de color por tipo, título y lugar. */
export function AgendaRow({ item, onPress }: { item: AgendaItem; onPress?: () => void }) {
  const Icon = KIND_ICON[item.kind];
  const tone = agendaTone(item.kind);
  const time = item.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const endTime = item.end ? item.end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
  const past = (item.end ?? item.start).getTime() < Date.now();
  return (
    <Tap onPress={onPress} accessibilityLabel={`${KIND_LABEL[item.kind]}: ${item.title}, ${time}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R.lg, padding: 12, borderWidth: 0.5, borderColor: C.border, opacity: past || item.done ? 0.55 : 1 }}>
      <View style={{ width: 46, alignItems: 'center' }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: FONT.heading, fontSize: 14.5, color: C.text, fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>{time}</Text>
        {endTime ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontSize: 10.5, color: C.muted, fontVariant: ['tabular-nums'] }}>{endTime}</Text> : null}
      </View>
      <View style={{ width: 3, height: 34, borderRadius: 2, backgroundColor: tone }} />
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.h3, item.done && { textDecorationLine: 'line-through' }]} numberOfLines={1}>{item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
          <Icon size={12} color={tone} strokeWidth={1.9} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { color: tone, fontFamily: FONT.semibold }]}>{KIND_LABEL[item.kind]}</Text>
          {item.subtitle ? (
            <>
              <MapPin size={11} color={C.muted} strokeWidth={1.75} style={{ marginLeft: 4 }} />
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[F.tiny, { flexShrink: 1 }]} numberOfLines={1}>{item.subtitle}</Text>
            </>
          ) : null}
        </View>
      </View>
      <ChevronRight size={16} color={C.muted} strokeWidth={1.75} />
    </Tap>
  );
}
