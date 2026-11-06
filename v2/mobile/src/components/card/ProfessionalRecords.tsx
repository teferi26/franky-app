import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CardScreen as Screen } from './CardUi';
import { Btn, Pill } from '@/components/ui';
import { CardSurface as Card, CardChip as Chip } from './CardUi';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { CardAccount, CardField, CardLoading, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { PROFESSIONAL_BOOKING_LABELS, professionalMoney } from '../../../../shared/professional-services';
import { professionalDate } from './ProfessionalWorkspace';
import { F } from '@/theme';
import { professionalError } from '../../../../shared/professional-services';
const formatError = (error: unknown) => professionalError(String((error as {message?:string})?.message ?? ''));
type RecordPage = { items: Record<string, any>[]; next_cursor: string | null };
export function ProfessionalRecordsScreen() {
  const workspace = useWorkspace(); const { entity } = useLocalSearchParams<{ entity?: string }>();
  if (!workspace.ready) return <CardLoading />; if (!workspace.active) return <Redirect href="/espacios" />;
  return <CardAccount title="Registros del negocio">{owner => <Records owner={owner} organizationId={workspace.active!.id} initialEntity={entity} />}</CardAccount>;
}
function Records({ owner, organizationId, initialEntity }: { owner: SessionIdentity; organizationId: string; initialEntity?: string }) {
  const router = useRouter(); const [entity, setEntity] = useState(['bookings', 'customers', 'bundles', 'history'].includes(initialEntity ?? '') ? initialEntity! : 'bookings');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState(''); const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); const [period, setPeriod] = useState(month);
  const [more, setMore] = useState<Record<string, any>[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const args = useCallback((next: string | null = null) => { const [year, monthNumber] = period.split('-').map(Number); const start = new Date(year, monthNumber - 1, 1); const end = new Date(year, monthNumber, 1); return { p_organization_id: organizationId, p_entity: entity, p_cursor: next, p_limit: 40, p_from: start.toISOString(), p_until: end.toISOString(), p_search: filter || null }; }, [organizationId, entity, period, filter]);
  const loader = useCallback((signal: AbortSignal) => workspaceRpc<RecordPage>('professional_list_records', args(), owner, signal), [owner, args]); const state = useCardState(owner, loader, false, formatError);
  useEffect(() => { setMore([]); setCursor(state.data?.next_cursor ?? null); }, [state.data]);
  const items = [...(state.data?.items ?? []), ...more];
  const renderRecord = useCallback(({ item }: { item: Record<string, any> }) => (<Card style={{ gap: 9, marginBottom: 14 }}><Text style={F.h3}>{String(item.service_name ?? item.display_name ?? item.label ?? 'Movimiento del negocio')}</Text>{item.starts_at ? <Text style={F.small}>{professionalDate(String(item.starts_at))}</Text> : null}{typeof item.total_cents === 'number' ? <Text style={F.body}>{professionalMoney(item.total_cents)}</Text> : null}{item.status ? <Pill label={PROFESSIONAL_BOOKING_LABELS[item.status as keyof typeof PROFESSIONAL_BOOKING_LABELS] ?? 'Registrado'} /> : null}{item.contact ? <Text style={F.small}>{String(item.contact)}</Text> : null}{typeof item.remaining === 'number' ? <Text style={F.body}>{item.remaining} sesiones de {item.granted}</Text> : null}{item.action ? <Text style={F.small}>Operación registrada: {historyLabel(String(item.action))}</Text> : null}{item.details?.reason ? <Text style={F.small}>{String(item.details.reason)}</Text> : null}{item.created_at ? <Text style={F.small}>{professionalDate(String(item.created_at))}</Text> : null}{entity === 'bookings' ? <Btn label="Abrir reserva" small variant="secondary" onPress={() => router.push({ pathname: '/card-reserva', params: { booking: String(item.id), at: String(item.starts_at) } })} /> : null}</Card>), [entity, router]);
  return <Screen title="Registros del negocio" back data={items} keyExtractor={item => String(item.id)} renderItem={renderRecord}
    refreshing={state.loading && !!state.data} onRefresh={() => void state.load()}
    ListHeaderComponent={<View style={{ gap: 15, marginBottom: 16 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['bookings', 'Reservas'], ['customers', 'Clientes'], ['bundles', 'Bonos'], ['history', 'Historial']].map(([key, label]) => <Chip key={key} label={label} active={entity === key} onPress={() => setEntity(key)} />)}</View>{entity === 'customers' ? <CardField label="Buscar cliente por nombre" value={search} onChangeText={setSearch} maxLength={100} /> : <CardField label="Mes, según la hora de tu dispositivo (AAAA-MM)" value={month} onChangeText={setMonth} maxLength={7} />}<Btn label="Consultar registros" variant="secondary" disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)} onPress={() => { setPeriod(month); setFilter(search.trim()); }} />
    {state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} /></View>}
    ListFooterComponent={<View style={{ gap: 15 }}>
    {cursor ? <Btn label="Cargar más registros" busy={state.busy} variant="secondary" onPress={() => void state.act(async signal => { const page = await workspaceRpc<RecordPage>('professional_list_records', args(cursor), owner, signal); if (state.current()) { setMore(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]); setCursor(page.next_cursor); } }, undefined, false)} /> : !state.loading && !state.error ? <Text style={F.small}>Has llegado al final de los registros de esta consulta.</Text> : null}
  </View>} />;
}
function historyLabel(value: string) { return ({ confirm: 'Reserva confirmada', cancel: 'Reserva cancelada', attend: 'Asistencia', no_show: 'No presentación', propose_reschedule: 'Propuesta de horario', accept_reschedule: 'Cambio aceptado', reverse_attendance: 'Asistencia corregida', created: 'Reserva creada' } as Record<string, string>)[value] ?? 'Actualización'; }
