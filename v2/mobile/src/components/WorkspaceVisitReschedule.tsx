import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Btn, Card, Chip } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { errorForWorkspace } from '@/lib/workspaces';
import { C, F } from '@/theme';

type VisitOption = { slot_date: string; start_time: string; end_time: string; available: number };
export function WorkspaceVisitReschedule({ bookingId, onChanged }: { bookingId: string; onChanged: () => Promise<void> }) {
  const { active, run, isCurrent } = useWorkspace();
  const [options, setOptions] = useState<VisitOption[] | null>(null); const [selected, setSelected] = useState<VisitOption | null>(null);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const lock = useRef(false);
  if (!active) return null;
  const load = async () => {
    if (lock.current || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null);
    try { const result = await run<VisitOption[]>('get_workspace_visit_options', { p_booking_id: bookingId, p_days: 14 }); if (isCurrent(active.id)) { setOptions(result); setSelected(null); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !selected || !isCurrent(active.id)) return; lock.current = true; setBusy(true); setError(null);
    try { await run('reschedule_workspace_visit', { p_booking_id: bookingId, p_slot_date: selected.slot_date, p_start_time: selected.start_time }); if (isCurrent(active.id)) { setOptions(null); setSelected(null); await onChanged(); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  return <Card style={{ gap: 12, marginVertical: 18 }}><Text style={F.h3}>Reprogramar visita</Text><Text style={F.small}>Elige un horario acordado con la persona interesada. Se conservará la reserva y se le avisará del cambio. Las visitas con un pago asociado requieren revisión antes de cambiarlas.</Text><Btn label="Consultar horarios disponibles" variant="secondary" busy={busy} onPress={() => void load()} />
    {error ? <Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text> : null}
    {options?.length === 0 ? <Text style={F.small}>No quedan horarios gratuitos disponibles en los próximos 14 días. Puedes ampliar la disponibilidad desde el piso.</Text> : null}
    {options?.length ? <View style={{ gap: 8 }}>{options.map(option => <Chip key={`${option.slot_date}:${option.start_time}`} label={`${new Date(`${option.slot_date}T12:00:00`).toLocaleDateString('es-ES')} · ${option.start_time.slice(0, 5)}–${option.end_time.slice(0, 5)}`} active={selected === option} onPress={() => { if (!busy) setSelected(option); }} />)}</View> : null}
    {selected ? <Btn label="Confirmar nueva fecha" busy={busy} onPress={() => Alert.alert('Cambiar la fecha de la visita', 'Confirma que has acordado este horario con la persona interesada.', [{ text: 'Volver', style: 'cancel' }, { text: 'Confirmar cambio', onPress: () => void save() }])} /> : null}
  </Card>;
}
