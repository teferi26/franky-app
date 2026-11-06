import React, { useCallback } from 'react';
import { Text, View } from 'react-native';
import { Btn } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { workspaceRpc } from '@/lib/workspaces';
import type { SessionIdentity } from '@/lib/session';
import { ORGANIZATION_BILLING_RPC, type OrganizationBillingState } from '../../../../shared/organization-billing';
import { CardScreen as Screen, CardSurface as Card, CardLoading, CardNotice } from './CardUi';
import { useCardState } from './useCardState';
import { F } from '@/theme';

const billingError = (error: unknown) => String((error as { message?: string })?.message ?? '').includes('forbidden')
  ? 'Tu acceso al estado de este espacio no está disponible. Actualiza tus espacios para comprobar tus permisos.'
  : 'No se ha podido comprobar el estado del plan. Vuelve a intentarlo.';
const periodDate = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/** Native companion view: authoritative access only, with no digital SaaS sales or external purchase prompts. */
export function ProfessionalPlanState({ owner, organizationId }: { owner: SessionIdentity; organizationId: string }) {
  const workspace = useWorkspace();
  const loader = useCallback(async (signal: AbortSignal) => {
    if (!workspace.isCurrent(organizationId)) throw Error('organization_billing_forbidden');
    const result = await workspaceRpc<OrganizationBillingState>(ORGANIZATION_BILLING_RPC.state, { p_organization_id: organizationId }, owner, signal);
    if (signal.aborted || !workspace.isCurrent(organizationId) || result.organization_id !== organizationId) throw Error('organization_billing_forbidden');
    return result;
  }, [owner, organizationId, workspace.isCurrent]);
  const state = useCardState(owner, loader, false, billingError); const data = state.data;
  const status = data?.access.paused ? 'Acceso profesional pausado' : data?.access.active ? data.access.source === 'pilot' ? 'Piloto activo' : 'Plan activo' : 'Sin plan profesional activo';
  const until = periodDate(data?.access.until ?? null);
  return <Screen title="Estado del plan" subtitle={workspace.active?.name} back><View style={{ gap: 16 }}>
    {state.loading && !data ? <CardLoading /> : null}
    <CardNotice error text={state.error} onRetry={() => void state.load()} />
    {data ? <><Card style={{ gap: 12 }}><Text style={F.h2}>{status}</Text>
      {data.access.source === 'pilot' ? <Text style={F.body}>Este espacio participa en un piloto de herramientas profesionales.</Text> : null}
      {until ? <Text style={F.body}>Periodo consolidado hasta el {until}.</Text> : <Text style={F.body}>{data.access.source === 'pilot' && data.access.active ? 'No se ha comunicado una fecha de finalización del piloto.' : 'No hay un periodo de acceso consolidado vigente.'}</Text>}
      {data.access.paused ? <Text style={F.body}>Las nuevas operaciones profesionales están pausadas.</Text> : null}
      {data.access.active && data.access.source === 'stripe' && data.can_read_finance && data.subscription?.cancel_at_period_end ? <Text style={F.small}>El plan finalizará al terminar su periodo vigente.</Text> : null}
      {data.access.existing_obligations_access ? <Text style={F.small}>Las reservas, asistencias y obligaciones ya registradas siguen disponibles según los permisos de tu equipo.</Text> : null}
      <Btn label="Actualizar estado" variant="secondary" busy={state.loading} onPress={() => void state.load()} />
    </Card><Card style={{ gap: 10 }}><Text style={F.h3}>Card básica independiente</Text><Text style={F.body}>La ficha de Card y su validación básica son gratuitas e independientes del plan profesional.</Text></Card></> : null}
  </View></Screen>;
}
