import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Pill } from '@/components/ui';
import { CardSurface as Card } from './CardUi';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { professionalError, type ProfessionalNotice, type ProfessionalNoticePage } from '../../../../shared/professional-services';
import { CardAccount, CardScreen, CardLoading, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { F } from '@/theme';

const formatError = (error: unknown) => professionalError(String((error as { message?: string })?.message ?? ''));
export function ProfessionalNoticesScreen() {
  const workspace = useWorkspace(); const { scope } = useLocalSearchParams<{ scope?: string }>();
  if (!workspace.ready) return <CardLoading />;
  return <CardAccount title="Avisos de reservas">{owner => scope === 'workspace' && !workspace.active ? <CardScreen title="Avisos" back><CardNotice text="Selecciona tu espacio para consultar sus avisos." /></CardScreen> : <Notices owner={owner} organizationId={scope === 'workspace' ? workspace.active!.id : null} />}</CardAccount>;
}
function Notices({ owner, organizationId }: { owner: SessionIdentity; organizationId: string | null }) {
  const router = useRouter(); const workspace = useWorkspace(); const [extra, setExtra] = useState<ProfessionalNotice[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const loader = useCallback((signal: AbortSignal) => workspaceRpc<ProfessionalNoticePage>('professional_list_notices', { p_organization_id: organizationId, p_limit: 30 }, owner, signal), [owner, organizationId]);
  const state = useCardState(owner, loader, false, formatError);
  useEffect(() => { setExtra([]); setCursor(state.data?.next_cursor ?? null); }, [state.data]);
  const open = (notice: ProfessionalNotice) => state.act(async signal => {
    await workspaceRpc('professional_read_notice', { p_notice_id: notice.id }, owner, signal);
    if (!state.current() || signal.aborted) return;
    if (notice.recipient_kind === 'operator') {
      if (!workspace.isCurrent(notice.organization_id)) { router.push('/espacios'); return; }
      router.push({ pathname: '/card-reserva', params: { booking: notice.booking_id, at: notice.payload.starts_at } });
    } else router.push({ pathname: '/card-mis-reservas', params: { booking: notice.booking_id, organization: notice.organization_id, at: notice.payload.starts_at } });
  }, undefined, false);
  return <CardScreen title="Avisos de reservas" back refreshing={state.loading && !!state.data} onRefresh={() => void state.load()}><View style={{ gap: 14 }}>
    <Text style={F.small}>Avisos dentro de Franky. Abrir un aviso consulta el estado actual de la reserva; no confirma plazas ni cambia precios.</Text>
    {state.loading && !state.data ? <CardLoading /> : null}<CardNotice error text={state.error} onRetry={() => void state.load()} />
    {state.data ? <Text style={F.small}>{state.data.unread_count} avisos sin leer</Text> : null}
    {[...(state.data?.items ?? []), ...extra].map(item => <Card key={item.id} style={{ gap: 10 }}><Text style={F.h3}>{item.title}</Text>{!item.read_at ? <Pill label="Sin leer" /> : null}<Text style={F.body}>{item.body}</Text><Btn label="Consultar reserva" small variant="secondary" busy={state.busy} onPress={() => void open(item)} /></Card>)}
    {!state.loading && !state.error && !state.data?.items.length ? <CardNotice text="No tienes avisos pendientes en este ámbito." /> : null}
    {cursor ? <Btn label="Más avisos" variant="secondary" busy={state.busy} onPress={() => void state.act(async signal => { const page = await workspaceRpc<ProfessionalNoticePage>('professional_list_notices', { p_organization_id: organizationId, p_cursor: cursor, p_limit: 30 }, owner, signal); if (state.current() && !signal.aborted) { setExtra(previous => [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))]); setCursor(page.next_cursor); } }, undefined, false)} /> : null}
  </View></CardScreen>;
}
