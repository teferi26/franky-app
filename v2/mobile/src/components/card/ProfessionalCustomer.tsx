import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CardScreen as Screen } from './CardUi';
import { Btn, Pill } from '@/components/ui';
import { CardSurface as Card } from './CardUi';
import { CardAccount, CardField, CardLoading, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { ProfessionalWaitlist } from './ProfessionalWaitlist';
import { BookingForm } from './ProfessionalBooking';
import { professionalDate } from './ProfessionalWorkspace';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { PROFESSIONAL_SECTORS, PROFESSIONAL_BOOKING_LABELS, professionalMoney, type ProfessionalCategory, type ProfessionalCatalog, type ProfessionalBooking } from '../../../../shared/professional-services';
import { F } from '@/theme';
import { professionalError } from '../../../../shared/professional-services';
const formatError = (error: unknown) => professionalError(String((error as {message?:string})?.message ?? ''));

type Business = { id: string; name: string; city: string | null; category: ProfessionalCategory };
type Page = { items: Business[]; next_cursor: string | null };
export function BusinessDirectoryScreen() { return <CardAccount title="Reservar cerca">{owner => <Businesses owner={owner} />}</CardAccount>; }
function Businesses({ owner }: { owner: SessionIdentity }) {
  const router = useRouter(); const [city, setCity] = useState(''); const [filter, setFilter] = useState(''); const [more, setMore] = useState<Business[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => workspaceRpc<Page>('professional_list_businesses', { p_city: filter || null, p_limit: 25 }, owner, signal), [owner, filter]); const state = useCardState(owner, loader, false, formatError);
  useEffect(() => { setMore([]); setCursor(state.data?.next_cursor ?? null); }, [state.data]);
  return <Screen title="Reservar servicios" back><View style={{ gap: 16 }}><CardField label="Ciudad" value={city} onChangeText={setCity} maxLength={100} /><Btn label="Buscar establecimientos" variant="secondary" onPress={() => setFilter(city.trim())} /><Text style={F.small}>Una cuenta para tus citas, clases y reservas. No necesitas comprar Franky Card para reservar.</Text>{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />
    {[...(state.data?.items ?? []), ...more].map(item => <Card key={item.id} style={{ gap: 10 }}><Text style={F.h3}>{item.name}</Text><Text style={F.small}>{PROFESSIONAL_SECTORS[item.category]?.label ?? 'Servicios'}{item.city ? ` · ${item.city}` : ''}</Text><Btn label="Ver servicios y reservar" variant="secondary" onPress={() => router.push({ pathname: '/card-reservar', params: { organization: item.id } })} /></Card>)}
    {!state.loading && !state.error && !state.data?.items.length ? <CardNotice text="Todavía no hay establecimientos con reservas activadas en esta ciudad. No mostramos agendas que aún no se puedan utilizar." /> : null}
    {cursor ? <Btn label="Cargar más" variant="secondary" busy={state.busy} onPress={() => void state.act(async signal => { const page = await workspaceRpc<Page>('professional_list_businesses', { p_city: filter || null, p_cursor: cursor, p_limit: 25 }, owner, signal); if (state.current()) { setMore(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]); setCursor(page.next_cursor); } }, undefined, false)} /> : null}
    <Btn label="Mis reservas" variant="ghost" onPress={() => router.push('/card-mis-reservas')} />
  </View></Screen>;
}
export function CustomerBookingScreen() {
  const { organization } = useLocalSearchParams<{ organization?: string }>();
  return <CardAccount title="Reservar">{owner => organization && /^[0-9a-f-]{36}$/i.test(organization) ? <CustomerBooking key={organization} owner={owner} organizationId={organization} /> : <Screen title="Reserva" back><CardNotice text="Elige un establecimiento desde Reservar servicios para ver su disponibilidad." /></Screen>}</CardAccount>;
}
function CustomerBooking({ owner, organizationId }: { owner: SessionIdentity; organizationId: string }) {
  const router = useRouter(); const loader = useCallback((signal: AbortSignal) => workspaceRpc<ProfessionalCatalog>('professional_get_catalog', { p_organization_id: organizationId }, owner, signal), [owner, organizationId]); const state = useCardState(owner, loader, false, formatError);
  return <Screen title={state.data?.organization.name ?? 'Reservar servicio'} back><View style={{ gap: 17 }}>{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />{state.data ? <><Text style={F.small}>Zona horaria de la sede: {state.data.settings.timezone}. La disponibilidad se comprueba de nuevo al confirmar.</Text><BookingForm owner={owner} organizationId={organizationId} data={state.data} customer after={() => state.load()} /><Btn label="Consultar mis reservas" variant="ghost" onPress={() => router.push('/card-mis-reservas')} /></> : null}</View></Screen>;
}
export function CustomerBookingsScreen() { return <CardAccount title="Mis reservas">{owner => <MyBookings owner={owner} />}</CardAccount>; }
function MyBookings({ owner }: { owner: SessionIdentity }) {
  const router = useRouter(); const detail = useLocalSearchParams<{ booking?: string; organization?: string; at?: string }>(); const [month, setMonth] = useState(() => detail.at && Number.isFinite(Date.parse(detail.at)) ? detail.at.slice(0, 7) : new Date().toISOString().slice(0, 7)); const [period, setPeriod] = useState(month);
  const loader = useCallback(async (signal: AbortSignal) => {
    const [year, monthNumber] = period.split('-').map(Number); const from = new Date(year, monthNumber - 1, 1); const until = new Date(year, monthNumber, 1);
    const list = await workspaceRpc<(ProfessionalBooking & { organization_name?: string })[]>('professional_my_bookings', { p_from: from.toISOString(), p_until: until.toISOString() }, owner, signal);
    if (detail.booking && detail.organization && /^[0-9a-f-]{36}$/i.test(detail.booking) && /^[0-9a-f-]{36}$/i.test(detail.organization) && !list.some(item => item.id === detail.booking)) { const selected = await workspaceRpc<ProfessionalBooking>('professional_get_booking', { p_organization_id: detail.organization, p_booking_id: detail.booking }, owner, signal); return [selected as ProfessionalBooking & { organization_name?: string }, ...list]; } return list;
  }, [owner, period, detail.booking, detail.organization]); const state = useCardState(owner, loader, false, formatError);
  const waitlistAction = (booking: ProfessionalBooking, action: string, payload: Record<string, unknown>) => state.act(async signal => { const result = await workspaceRpc<ProfessionalBooking>('professional_booking_action', { p_organization_id: booking.organization_id, p_booking_id: booking.id, p_action: action, p_data: payload }, owner, signal); if (state.current() && !signal.aborted) state.setNotice(result.waitlist_offer_status === 'expired' ? 'La oferta caducó antes de tu confirmación. No se ha confirmado la plaza.' : result.waitlist_offer_status === 'accepted' ? 'Plaza aceptada. Consulta su estado definitivo en la reserva.' : 'Oferta de plaza rechazada.'); });
  return <Screen title="Mis citas y reservas" back><View style={{ gap: 15 }}><Btn label="Avisos de mis reservas" variant="secondary" onPress={() => router.push('/card-avisos')} /><CardField label="Mes (AAAA-MM)" value={month} onChangeText={setMonth} maxLength={7} /><Btn label="Consultar mes" disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)} variant="secondary" onPress={() => setPeriod(month)} />{state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} /><CardNotice text={state.notice} />
    {state.data?.map(booking => <Card key={booking.id} style={{ gap: 10 }}><Text style={F.h3}>{booking.organization_name ?? 'Establecimiento de la reserva'}</Text><Text style={F.body}>{booking.service_name ?? booking.price_snapshot.service_name}</Text><Text style={F.small}>{professionalDate(booking.starts_at)} · Hora de tu dispositivo</Text><Pill label={PROFESSIONAL_BOOKING_LABELS[booking.status]} /><Text style={F.body}>Total aceptado: {professionalMoney(booking.total_cents)}</Text><Text style={F.small}>{booking.price_snapshot.terms}</Text><ProfessionalWaitlist booking={booking} busy={state.busy} onAction={(action, args) => void waitlistAction(booking, action, args)} />{booking.reschedule ? <><CardNotice text={`El negocio propone ${professionalDate(booking.reschedule.starts_at)}. Tu cita original se mantiene hasta que aceptes.`} /><Btn label="Aceptar cambio de hora" busy={state.busy} onPress={() => void state.act(signal => workspaceRpc('professional_booking_action', { p_organization_id: booking.organization_id, p_booking_id: booking.id, p_action: 'accept_reschedule' }, owner, signal), 'Cambio de horario confirmado.')} /></> : null}{['requested', 'confirmed', 'waitlisted'].includes(booking.status) ? <Btn label="Cancelar reserva" variant="ghost" busy={state.busy} onPress={() => void state.act(signal => workspaceRpc('professional_booking_action', { p_organization_id: booking.organization_id, p_booking_id: booking.id, p_action: 'cancel' }, owner, signal), 'Reserva cancelada.')} /> : null}{booking.deposit_status === 'pending' ? <CardNotice text="La señal todavía no está confirmada. No consideres esta reserva pagada." /> : null}</Card>)}
    {!state.loading && !state.error && !state.data?.length ? <CardNotice text="No tienes reservas en el mes seleccionado." /> : null}
    {state.data && state.data.length >= 300 ? <CardNotice text="El mes alcanza el límite de 300 reservas mostrado. Consulta el detalle con el establecimiento para las operaciones adicionales." /> : null}
    <Btn label="Encontrar un servicio" variant="secondary" onPress={() => router.push('/card-negocios')} />
  </View></Screen>;
}
