import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Btn } from '@/components/ui';
import { CardChip as Chip } from './CardUi';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { professionalError, type ProfessionalCustomer } from '../../../../shared/professional-services';
import { CardField, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { F } from '@/theme';

type Page = { items: ProfessionalCustomer[]; next_cursor: string | null };
const formatError = (error: unknown) => professionalError(String((error as { message?: string })?.message ?? ''));
export function ProfessionalCustomerPicker({ owner, organizationId, value, onChange, allowGuest = false }: {
  owner: SessionIdentity; organizationId: string; value: string; onChange(id: string): void; allowGuest?: boolean;
}) {
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('');
  const [extra, setExtra] = useState<ProfessionalCustomer[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProfessionalCustomer | null>(null);
  const loader = useCallback((signal: AbortSignal) => workspaceRpc<Page>('professional_list_records', {
    p_organization_id: organizationId, p_entity: 'customers', p_search: filter || null, p_limit: 25,
  }, owner, signal), [organizationId, owner, filter]);
  const state = useCardState(owner, loader, false, formatError);
  useEffect(() => { setExtra([]); setCursor(state.data?.next_cursor ?? null); }, [state.data]);
  const items = [...(state.data?.items ?? []), ...extra];
  return <View style={{ gap: 9 }}><CardField label="Buscar cliente" value={search} onChangeText={setSearch} maxLength={100} />
    <Btn label="Buscar en todos los clientes" small variant="secondary" disabled={state.busy} onPress={() => setFilter(search.trim())} />
    <CardNotice error text={state.error} onRetry={() => void state.load()} />{value ? <Text style={F.small}>Seleccionado: {selected?.id === value ? selected.display_name : items.find(item => item.id === value)?.display_name ?? 'Cliente de la reserva'}</Text> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{allowGuest ? <Chip label="Persona de mostrador / teléfono" active={!value} onPress={() => { setSelected(null); onChange(''); }} /> : null}
      {items.map(item => <Chip key={item.id} label={item.display_name} active={value === item.id} onPress={() => { setSelected(item); onChange(item.id); }} />)}</View>
    {!state.loading && !state.error && !items.length ? <Text style={F.small}>No hay clientes que coincidan. Aparecen después de registrar su primera reserva.</Text> : null}
    {cursor ? <Btn label="Más clientes" small variant="secondary" busy={state.busy} onPress={() => void state.act(async signal => {
      const page = await workspaceRpc<Page>('professional_list_records', { p_organization_id: organizationId, p_entity: 'customers', p_search: filter || null, p_cursor: cursor, p_limit: 25 }, owner, signal);
      if (state.current() && !signal.aborted) { setExtra(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]); setCursor(page.next_cursor); }
    }, undefined, false)} /> : null}
  </View>;
}
