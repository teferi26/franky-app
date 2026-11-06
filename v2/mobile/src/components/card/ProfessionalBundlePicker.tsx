import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn } from '@/components/ui';
import { CardChip as Chip, CardNotice } from './CardUi';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { professionalError, type ProfessionalBundle } from '../../../../shared/professional-services';
import { useCardState } from './useCardState';
import { F } from '@/theme';

type Page = { items: ProfessionalBundle[]; next_cursor: string | null };
export type BundleAvailability = 'checking' | 'available' | 'unavailable';
const formatError = (error: unknown) => professionalError(String((error as { message?: string })?.message ?? ''));
export function ProfessionalBundlePicker({ owner, organizationId, customerId, serviceId, value, onChange, onAvailability }: {
  owner: SessionIdentity; organizationId: string; customerId: string | null; serviceId: string; value: string; onChange(id: string): void; onAvailability?(status: BundleAvailability): void;
}) {
  const [pages, setPages] = useState<{ source: Page; extra: ProfessionalBundle[]; cursor: string | null } | null>(null);
  const loader = useCallback((signal: AbortSignal) => workspaceRpc<Page>('professional_list_customer_bundles', { p_organization_id: organizationId, p_customer_id: customerId, p_service_id: serviceId, p_limit: 25 }, owner, signal), [owner, organizationId, customerId, serviceId]);
  const state = useCardState(owner, loader, false, formatError);
  // Extra pages belong to exactly one first-page response; a refresh cannot retain an exhausted selection from an older response.
  const extra = pages?.source === state.data ? pages.extra : [];
  const cursor = pages?.source === state.data ? pages.cursor : state.data?.next_cursor ?? null;
  const all = [...(state.data?.items ?? []), ...extra];
  const items = all.filter(item => item.remaining > 0);
  const selected = all.find(item => item.id === value);
  const availability: BundleAvailability = !value ? 'available' : state.loading || !state.data ? 'checking' : selected ? selected.remaining > 0 ? 'available' : 'unavailable' : cursor ? 'checking' : 'unavailable';
  useEffect(() => { onAvailability?.(availability); }, [availability, value, onAvailability]);
  return <View style={{ gap: 8 }}><CardNotice error text={state.error} onRetry={() => void state.load()} />
    {items.length || value ? <><Text style={F.h3}>Bono de sesiones</Text><Chip label="Sin bono: precio del servicio" active={!value} onPress={() => onChange('')} />{items.map(item => <Chip key={item.id} label={item.label + ' · ' + item.remaining + ' sesiones'} active={value === item.id} onPress={() => onChange(item.id)} />)}<Text style={F.small}>La sesión se consume al registrar la asistencia. No se combina con una ventaja Card.</Text></> : null}
    {value && availability === 'unavailable' ? <CardNotice error text="El bono seleccionado está agotado o ya no está disponible. Elige otro o retíralo para revisar el precio del servicio antes de confirmar." /> : null}
    {value && availability === 'checking' ? <CardNotice text={cursor && !state.loading ? 'Carga los siguientes bonos para comprobar la selección, o retírala para revisar el precio del servicio.' : 'Comprobando el bono seleccionado. No se cambiará al precio ordinario sin tu elección.'} /> : null}
    {cursor ? <Btn label="Más bonos de este cliente" small variant="secondary" busy={state.busy} disabled={state.loading} onPress={() => void state.act(async signal => {
      const source = state.data;
      const page = await workspaceRpc<Page>('professional_list_customer_bundles', { p_organization_id: organizationId, p_customer_id: customerId, p_service_id: serviceId, p_cursor: cursor, p_limit: 25 }, owner, signal);
      if (state.current() && !signal.aborted && source) setPages({ source, extra: [...extra, ...page.items.filter(item => !all.some(old => old.id === item.id))], cursor: page.next_cursor });
    }, undefined, false)} /> : null}
  </View>;
}
