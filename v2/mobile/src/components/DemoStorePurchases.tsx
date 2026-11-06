import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Btn, Card, Pill } from '@/components/ui';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { DEMO_STORE_MESSAGES, newDemoStoreState, simulateDemoStore, type DemoStoreAction } from '@/lib/demo-store-simulator';
import { F, S } from '@/theme';

/** Remounted on identity/cohort/server epoch changes; never persisted to disk. */
export function DemoStorePurchases({ owner, cohort, epoch }: { owner: SessionIdentity; cohort: string; epoch: number }) {
  const { ready, enabled, workspaces, demoEpoch } = useWorkspace();
  const current = useOwnerGuard(owner);
  const [state, setState] = useState(newDemoStoreState);
  const allowed = () => current() && ready && enabled && demoEpoch === epoch && workspaces.some(item => item.demo_cohort_id === cohort && item.status === 'active');
  const run = (action: DemoStoreAction) => { if (allowed()) setState(previous => simulateDemoStore(previous, action)); };
  if (!allowed()) return null;
  return <Screen title="Compras de prueba" back><View style={{ padding: S.lg, gap: S.lg }}>
    <Pill label="SIMULACIÓN · sin dinero real" tone="orange" />
    <Text style={F.h2}>Practica una compra digital</Text>
    <Text style={F.body}>Este ejemplo no conecta con App Store, Google Play ni RevenueCat. No cambia tu plan ni concede prestaciones reales.</Text>
    <Card style={{ gap: S.md }}>
      <Text style={F.h3}>Producto digital de demostración</Text>
      <Text style={F.small}>Importe ficticio: 0 €. No representa una tarifa de Franky.</Text>
      <Btn label="Simular compra completada" onPress={() => run('completed')} />
      <Btn variant="secondary" label="Simular compra rechazada" onPress={() => run('rejected')} />
      <Btn variant="secondary" label="Simular compra pendiente" onPress={() => run('pending')} />
      <Btn variant="secondary" label="Simular restauración" onPress={() => run('restore')} />
    </Card>
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={F.body}>{DEMO_STORE_MESSAGES[state.status]}</Text>
    <Text style={F.small}>El ejemplo se borra al salir de esta pantalla, cambiar de cuenta o cuando se detecta el reinicio de la demo. Probar aquí no valida una compra real de las tiendas.</Text>
    <Btn variant="link" label="Reiniciar simulación" onPress={() => run('reset')} />
  </View></Screen>;
}
