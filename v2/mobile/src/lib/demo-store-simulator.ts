/** Local exercise only. Never import these states into entitlement checks. */
export type DemoStoreAction = 'completed' | 'rejected' | 'pending' | 'restore' | 'reset';
export type DemoStoreState = {
  productId: 'demo.digital.practice';
  simulatedPurchaseRecorded: boolean;
  status: 'idle' | 'completed' | 'rejected' | 'pending' | 'restored' | 'empty';
};
export function newDemoStoreState(): DemoStoreState {
  return { productId: 'demo.digital.practice', simulatedPurchaseRecorded: false, status: 'idle' };
}
/** No timers, storage, network, provider SDK or real entitlement is involved. */
export function simulateDemoStore(previous: DemoStoreState, action: DemoStoreAction): DemoStoreState {
  if (action === 'reset') return newDemoStoreState();
  if (action === 'restore') return { ...previous, status: previous.simulatedPurchaseRecorded ? 'restored' : 'empty' };
  return { ...previous, status: action, simulatedPurchaseRecorded: previous.simulatedPurchaseRecorded || action === 'completed' };
}
export const DEMO_STORE_MESSAGES: Record<DemoStoreState['status'], string> = {
  idle: 'Elige un resultado para ensayar el recorrido de una compra.',
  completed: 'Simulación: compra completada. No se ha cobrado dinero ni activado una prestación real.',
  rejected: 'Simulación: compra rechazada. No se ha realizado ningún cobro.',
  pending: 'Simulación: compra pendiente de confirmación. Este resultado no activa ninguna prestación.',
  restored: 'Simulación: compra anterior restaurada. Sólo se recupera el ejemplo de esta pantalla.',
  empty: 'Simulación: no hay compras anteriores que restaurar. Prueba primero una compra completada.',
};
