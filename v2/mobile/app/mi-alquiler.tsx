import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { workspaceRpc } from '@/lib/workspaces';
import { CONTRACT_STATUS } from '../../shared/housing-operations';
import { C, F } from '@/theme';

type Tenancy = { id: string; accommodation_id: string; title: string; city: string | null; room_label: string | null; status: 'pending_confirmation' | 'active'; is_public: boolean; start_date: string | null; end_date: string | null };
type Contract = { id: string; title: string | null; accommodation_title: string; status: string; rent_cents: number | null; deposit_cents: number | null; my_role: string; my_status: string; updated_at: string };
type Rentals = { tenancies: Tenancy[]; contracts: Contract[] };
const date = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES');
export default function MyRentals() {
  const owner = useSessionOwner(), router = useRouter();
  if (!owner) return <Screen title="Mi alquiler" back pad><Text style={F.body}>Inicia sesión para consultar tus alquileres.</Text><Btn label="Iniciar sesión" onPress={() => router.push('/welcome')} /></Screen>;
  return <RentalsView key={`${owner.userId}:${owner.generation}`} owner={owner} />;
}
function RentalsView({ owner }: { owner: SessionIdentity }) {
  const current = useOwnerGuard(owner), router = useRouter();
  const [data, setData] = useState<Rentals | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = React.useRef(false), sequence = React.useRef(0);
  const load = useCallback(async () => {
    const version = ++sequence.current; setLoading(true); setError('');
    try { const result = await workspaceRpc<Rentals>('get_my_rentals', {}, owner); if (current() && version === sequence.current) setData(result); }
    catch { if (current() && version === sequence.current) setError('No pudimos cargar tus alquileres. Comprueba la conexión y vuelve a intentarlo.'); }
    finally { if (current() && version === sequence.current) setLoading(false); }
  }, [owner, current]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const act = async (name: string, args: Record<string, unknown>, confirmation: string) => {
    if (lock.current || !current()) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await workspaceRpc(name, args, owner); if (current()) { setNotice(confirmation); await load(); } }
    catch (err) { if (current()) { const message = String((err as { message?: string })?.message ?? ''); setError(/uq_tenancy_active_tenant/.test(message) ? 'Ya tienes otro alquiler activo. Revisa su vinculación antes de aceptar uno nuevo.' : 'No se pudo guardar el cambio. Actualiza para comprobar si la invitación sigue disponible.'); } }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <Screen title="Mi alquiler" back pad refreshing={loading} onRefresh={() => void load()}>
    <Text style={[F.small, { marginBottom: 18 }]}>Tus invitaciones, tu vinculación con el piso y los documentos que debes revisar.</Text>
    {!!error && <Card style={{ gap: 12, marginBottom: 18 }}><Text accessibilityRole="alert" style={{ color: C.errorText }}>{error}</Text><Btn label="Reintentar" variant="secondary" onPress={() => void load()} /></Card>}{!!notice && <Text accessibilityRole="alert" style={{ color: C.green, marginBottom: 18 }}>{notice}</Text>}
    {loading && !data ? <ActivityIndicator color={C.blue} /> : data && <>
      <Text style={[F.h2, { marginBottom: 14 }]}>Mi piso</Text>{data.tenancies.map(tenancy => <Card key={tenancy.id} style={{ gap: 13, marginBottom: 18 }}><Pill label={tenancy.status === 'active' ? 'Vinculación activa' : 'Invitación pendiente'} /><Text style={F.h3}>{tenancy.title}</Text><Text style={F.small}>{[tenancy.city, tenancy.room_label].filter(Boolean).join(' · ')}</Text>{tenancy.start_date && <Text style={F.small}>Desde {date(tenancy.start_date)}{tenancy.end_date ? ` hasta ${date(tenancy.end_date)}` : ''}</Text>}
        {tenancy.status === 'pending_confirmation' ? <><Text style={F.small}>Aceptar confirma tu vinculación al piso dentro de Franky. La firma del contrato es un paso independiente. La vinculación comienza oculta al público.</Text><Btn label="Aceptar invitación" busy={busy} onPress={() => Alert.alert('Aceptar invitación', `¿Confirmas que quieres vincular tu cuenta a ${tenancy.title}?`, [{ text: 'Volver', style: 'cancel' }, { text: 'Aceptar', onPress: () => void act('respond_tenancy', { p_tenancy_id: tenancy.id, p_accept: true }, 'Invitación aceptada. Ya puedes consultar los documentos que te envíen.') }])} /><Btn label="No aceptar" variant="secondary" disabled={busy} onPress={() => void act('respond_tenancy', { p_tenancy_id: tenancy.id, p_accept: false }, 'Invitación rechazada.')} /></> : <><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Switch accessibilityLabel="Mostrar públicamente que vivo aquí" value={tenancy.is_public} disabled={busy} onValueChange={value => void act('set_tenancy_visibility', { p_tenancy_id: tenancy.id, p_is_public: value }, value ? 'Visibilidad pública activada.' : 'Tu vinculación vuelve a ser privada.')} /><Text style={[F.body, { flex: 1 }]}>Mostrar que vivo aquí</Text></View><Text style={F.small}>Controla si otras personas pueden ver tu vinculación al alojamiento.</Text><Btn label="Ya no vivo aquí" variant="secondary" disabled={busy} onPress={() => Alert.alert('Terminar la vinculación en Franky', 'Se retirará esta vinculación del perfil. Esto no cancela el contrato ni sustituye los avisos que hayas acordado con el propietario.', [{ text: 'Volver', style: 'cancel' }, { text: 'Terminar vinculación', onPress: () => void act('end_tenancy', { p_tenancy_id: tenancy.id }, 'Vinculación terminada. Tus contratos conservan su historial.') }])} /></>}
      </Card>)}{!data.tenancies.length && <Text style={[F.small, { marginBottom: 22 }]}>No tienes invitaciones ni vinculaciones activas. El propietario puede invitarte desde la gestión de su piso.</Text>}
      <Text style={[F.h2, { marginBottom: 14 }]}>Contratos</Text>{data.contracts.map(contract => <Card key={contract.id} style={{ gap: 12, marginBottom: 16 }}><Text style={F.h3}>{contract.title || contract.accommodation_title || 'Contrato de alquiler'}</Text><Pill label={CONTRACT_STATUS[contract.status] ?? 'Contrato'} /><Text style={F.small}>Tu firma: {contract.my_status === 'signed' ? 'registrada' : 'pendiente'} · {contract.my_role === 'owner' ? 'Arrendador' : 'Inquilino'}</Text>{contract.rent_cents != null && <Text style={F.body}>Renta acordada: {(contract.rent_cents / 100).toFixed(2)} €</Text>}<Btn label="Revisar documento" variant="secondary" onPress={() => router.push({ pathname: '/contrato/[id]', params: { id: contract.id } })} /></Card>)}{!data.contracts.length && <Text style={F.small}>Aquí aparecerán los contratos en los que estés designado como firmante.</Text>}
    </>}
  </Screen>;
}
