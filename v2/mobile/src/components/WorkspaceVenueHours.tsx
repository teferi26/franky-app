import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { Btn, Card, Chip } from '@/components/ui';
import { VENUE_WEEKDAYS, venueHoursSummary, type VenueHours } from '../../../shared/venue-hours';
import { C, F } from '@/theme';
export function WorkspaceVenueHours({ value, onChange, disabled, preview, error }: { value?: VenueHours[]; onChange: (value: VenueHours[]) => void; disabled?: boolean; preview?: boolean; error?: string }) {
  const update = (index: number, patch: Partial<VenueHours>) => { if (!disabled) onChange((value ?? []).map((row, i) => i === index ? { ...row, ...patch } : row)); };
  return <Card style={{ gap: 12, marginBottom: 20 }}><Text style={F.h3}>Horario semanal</Text><Text style={F.small}>Indica las horas del local. Puedes añadir turnos partidos y cierres después de medianoche. Los días sin franjas aparecerán como cerrados.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text> : null}
    {preview ? value?.length ? venueHoursSummary(value).map(line => <Text key={line} style={F.body}>{line}</Text>) : <Text style={F.small}>{value ? 'Horario sin informar.' : 'Se conserva el horario de la ficha actual.'}</Text> : <>
      {!value?.length ? <Text style={F.small}>{value ? 'Horario sin informar.' : 'Al añadir franjas sustituirás el horario de la ficha actual.'}</Text> : null}
      {(value ?? []).map((row, index) => <View key={index} style={{ gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{VENUE_WEEKDAYS.map((label, weekday) => <Chip key={label} label={label.slice(0, 3)} active={row.weekday === weekday} onPress={() => update(index, { weekday })} />)}</View><View style={{ flexDirection: 'row', gap: 10 }}>{(['opens', 'closes'] as const).map(key => <View key={key} style={{ flex: 1, gap: 5 }}><Text style={F.small}>{key === 'opens' ? 'Apertura' : 'Cierre'}</Text><TextInput accessibilityLabel={`${key === 'opens' ? 'Apertura' : 'Cierre'} franja ${index + 1}`} value={row[key]} editable={!disabled} onChangeText={text => update(index, { [key]: text })} placeholder="HH:mm" placeholderTextColor={C.muted} maxLength={5} style={{ padding: 12, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.text }} /></View>)}</View><Chip label="Cierra al día siguiente" active={row.closes_next_day} onPress={() => update(index, { closes_next_day: !row.closes_next_day })} /><Btn label={`Quitar franja ${index + 1}`} small variant="ghost" disabled={disabled} onPress={() => onChange((value ?? []).filter((_, i) => i !== index))} /></View>)}
      <Btn label="Añadir franja horaria" variant="secondary" disabled={disabled || (value?.length ?? 0) >= 14} onPress={() => onChange([...(value ?? []), { weekday: value?.length ? Math.min(value[value.length - 1].weekday + 1, 6) : 0, opens: '09:00', closes: '18:00', closes_next_day: false }])} />
    </>}
  </Card>;
}
