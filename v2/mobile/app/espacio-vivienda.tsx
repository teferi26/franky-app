import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Chip, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { useWorkspaceMfa } from '@/components/WorkspaceMfa';
import { WorkspaceHousingLead, type WorkspaceLead } from '@/components/WorkspaceHousingLead';
import { errorForWorkspace, hasWorkspacePermission } from '@/lib/workspaces';
import { C, F } from '@/theme';

type Lead = WorkspaceLead;
type ScheduleRow = { weekday: number; start_time: string; end_time: string; slot_minutes: number; capacity: number; price_cents: number; inherited?: boolean };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export default function HousingOperations() {
  const { active, ready, revision } = useWorkspace(); const { id } = useLocalSearchParams<{ id?: string }>();
  if (!ready) return <ActivityIndicator color={C.blue} />;
  if (!active) return <Redirect href="/espacios" />;
  if (!id || !hasWorkspacePermission(active, 'content.manage')) return <Screen title="Gestión de vivienda" back><Text style={F.small}>No tienes acceso a esta función.</Text></Screen>;
  return <Housing key={`${active.id}:${revision}:${id}`} id={id} />;
}
function Housing({ id }: { id: string }) {
  const { active, run, isCurrent } = useWorkspace(); const mfa = useWorkspaceMfa();
  const [tab, setTab] = useState<'leads' | 'schedule'>('leads'); const [leads, setLeads] = useState<Lead[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!active) return; setLoading(true); setError(null);
    try {
      const [leadPage, schedule] = await Promise.all([
        run<{ items: Lead[]; next_cursor: string | null }>('get_workspace_housing_interests', { p_resource_id: id, p_limit: 30 }),
        run<{ rows: ScheduleRow[] }>('get_workspace_housing_schedule', { p_resource_id: id }),
      ]);
      if (isCurrent(active.id)) { setLeads(leadPage.items); setCursor(leadPage.next_cursor); setRows(schedule.rows); }
    } catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { if (isCurrent(active.id)) setLoading(false); }
  }, [active?.id, run, isCurrent, id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!active) return null;
  const loadMore = async () => {
    if (!cursor || lock.current) return; lock.current = true; setBusy(true);
    try { const page = await run<{ items: Lead[]; next_cursor: string | null }>('get_workspace_housing_interests', { p_resource_id: id, p_cursor: cursor, p_limit: 30 }); if (isCurrent(active.id)) { setLeads(previous => [...previous, ...page.items]); setCursor(page.next_cursor); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  const update = (index: number, key: keyof ScheduleRow, value: string | number) => setRows(previous => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const save = async () => {
    if (lock.current) return;
    if (rows.some(row => !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(row.start_time) || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(row.end_time) || row.end_time <= row.start_time || row.slot_minutes < 10 || row.slot_minutes > 240 || row.capacity < 1 || !Number.isInteger(row.capacity) || !Number.isInteger(row.slot_minutes))) { setError('Revisa las horas (HH:MM), la duración y el aforo de cada franja.'); return; }
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try { const result = await run<{ rows: ScheduleRow[] }>('save_workspace_housing_schedule', { p_resource_id: id, p_rows: rows }); if (isCurrent(active.id)) { setRows(result.rows); setNotice('Horario guardado. Las visitas ya reservadas conservan su hora y sus condiciones.'); } }
    catch (err) { if (isCurrent(active.id)) setError(errorForWorkspace(err)); }
    finally { lock.current = false; if (isCurrent(active.id)) setBusy(false); }
  };
  return <Screen title="Gestión del piso" subtitle={active.name} back><View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}><Chip label="Interesados" active={tab === 'leads'} onPress={() => setTab('leads')} /><Chip label="Horario de visitas" active={tab === 'schedule'} onPress={() => setTab('schedule')} /></View>
    {error ? <Card style={{ gap: 12, marginBottom: 16 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Actualizar" variant="secondary" onPress={() => void load()} /></Card> : null}
    {notice ? <Text accessibilityRole="alert" style={{ color: C.green, marginBottom: 16 }}>{notice}</Text> : null}
    {loading ? <ActivityIndicator color={C.blue} /> : tab === 'leads' ? <><Text style={[F.small, { marginBottom: 16 }]}>Personas que han solicitado información de este piso. Las conversaciones están en la pestaña Mensajes.</Text>{leads.map(lead => <WorkspaceHousingLead key={`${lead.id}:${lead.stage_updated_at ?? "new"}`} lead={lead} resourceId={id} onChanged={load} />)}{!leads.length ? <Text style={F.small}>Todavía no hay solicitudes en este piso.</Text> : null}{cursor ? <Btn label="Cargar más" variant="secondary" busy={busy} onPress={() => void loadMore()} /> : null}</> : <>
      <Text style={[F.small, { marginBottom: 18 }]}>Horario semanal en la zona de Madrid. Cada reserva usa una plaza y el sistema evita ocupar dos veces el mismo hueco.</Text>
      {active.demo_cohort_id ? <Text style={[F.small, { marginBottom: 18 }]}>Los horarios de una demostración no se publican para personas reales.</Text> : null}
      {rows.map((row, index) => <Card key={index} style={{ gap: 12, marginBottom: 14 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{DAYS.map((day, weekday) => <Chip key={day} label={day} active={row.weekday === weekday} onPress={() => update(index, 'weekday', weekday)} />)}</View>{row.inherited ? <Pill label="Heredado del horario general" /> : null}<View style={{ flexDirection: 'row', gap: 12 }}>{[['start_time', 'Desde'], ['end_time', 'Hasta']].map(([key, label]) => <View key={key} style={{ flex: 1 }}><Text style={[F.small, { marginBottom: 6 }]}>{label}</Text><TextInput accessibilityLabel={`${label}, franja ${index + 1}`} value={String(row[key as keyof ScheduleRow]).slice(0, 5)} maxLength={5} onChangeText={value => update(index, key as keyof ScheduleRow, value)} placeholder="10:00" placeholderTextColor={C.muted} style={{ padding: 12, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12 }} /></View>)}</View><View style={{ flexDirection: 'row', gap: 12 }}>{[['slot_minutes', 'Duración (min)'], ['capacity', 'Plazas por visita']].map(([key, label]) => <View key={key} style={{ flex: 1 }}><Text style={[F.small, { marginBottom: 6 }]}>{label}</Text><TextInput accessibilityLabel={`${label}, franja ${index + 1}`} value={String(row[key as keyof ScheduleRow])} keyboardType="number-pad" maxLength={3} onChangeText={value => update(index, key as keyof ScheduleRow, Number(value.replace(/\D/g, '')))} style={{ padding: 12, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12 }} /></View>)}</View><Text style={F.small}>{row.price_cents ? `Esta franja tiene un precio existente de ${(row.price_cents / 100).toFixed(2)} €. Modificarla requiere permisos financieros y verificación.` : 'Visitas gratuitas.'}</Text><Btn label="Quitar franja" variant="danger" small disabled={busy} onPress={() => setRows(previous => previous.filter((_, i) => i !== index))} /></Card>)}
      <View style={{ gap: 12 }}><Btn label="Añadir franja" variant="secondary" disabled={rows.length >= 21 || busy} onPress={() => setRows(previous => [...previous, { weekday: 1, start_time: '10:00', end_time: '12:00', slot_minutes: 30, capacity: 1, price_cents: 0 }])} /><Btn label={active.demo_cohort_id ? 'Guardar horario simulado' : 'Guardar horario'} disabled={!rows.length} busy={busy} onPress={() => rows.some(row => row.price_cents > 0) ? void mfa.protect(save) : void save()} /></View>
      {mfa.node}
    </>}
  </Screen>;
}
