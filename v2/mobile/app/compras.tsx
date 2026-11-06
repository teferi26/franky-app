import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Btn, EmptyState } from '@/components/ui';
import { ShoppingBag } from 'lucide-react-native';
import { useSessionOwner, useOwnerGuard } from '@/lib/useSessionOwner';
import type { SessionIdentity } from '@/lib/session';
import { getNativeBilling, getNativeOffers, buyNativeOffer, restoreNativePurchases, type NativeOffer } from '@/lib/native-billing';
import type { NativeBillingConfiguration } from '../../shared/billing';
import { F, S } from '@/theme';
import { useWorkspace } from '@/components/WorkspaceProvider';
import { DemoStorePurchases } from '@/components/DemoStorePurchases';

export default function NativePurchases() {
  const owner = useSessionOwner();
  const { ready, error, refresh, workspaces, demoEpoch } = useWorkspace();
  if (!ready) return <Screen title="Mis compras" back><Text style={F.body}>Comprobando disponibilidad…</Text></Screen>;
  if (error) return <Screen title="Mis compras" back><Text style={F.body}>No pudimos comprobar el tipo de cuenta. Vuelve a intentarlo antes de abrir tus compras.</Text><Btn label="Comprobar mi cuenta" variant="secondary" onPress={() => void refresh()} /></Screen>;
  const demo = workspaces.find(item => item.demo_cohort_id && item.status === 'active');
  if (owner && demo) return demoEpoch === null ? <Screen title="Compras de prueba" back><Text style={F.body}>No pudimos comprobar el estado de la demo. Vuelve a intentarlo desde tu espacio.</Text></Screen>
    : <DemoStorePurchases key={`${owner.userId}:${owner.generation}:${demo.demo_cohort_id}:${demoEpoch}`} owner={owner} cohort={demo.demo_cohort_id!} epoch={demoEpoch} />;
  return owner ? <OwnedPurchases key={owner.userId + ':' + owner.generation} owner={owner} /> : null;
}
function OwnedPurchases({ owner }: { owner: SessionIdentity }) {
  const current = useOwnerGuard(owner);
  const lock = useRef(false);
  const [config, setConfig] = useState<NativeBillingConfiguration | null>(null);
  const [offers, setOffers] = useState<NativeOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    if (!current()) return;
    try {
      const next = await getNativeBilling(owner); if (!current()) return; setConfig(next);
      const rows = next.salesEnabled ? await getNativeOffers(owner) : []; if (current()) setOffers(rows);
    } catch { if (current()) setMessage('No pudimos cargar tus compras. Vuelve a intentarlo.'); }
  }, [owner, current]);
  useEffect(() => { void load(); }, [load]);
  const purchase = async (offer?: NativeOffer) => {
    if (lock.current || !current()) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = offer ? await buyNativeOffer(offer, owner) : await restoreNativePurchases(owner);
      if (!current()) return;
      if (result.configuration) setConfig(result.configuration);
      setMessage(result.status === 'pending' ? 'La tienda recibió tu operación. La confirmación de Franky está pendiente; puedes restaurar de nuevo.'
        : result.status === 'cancelled' ? 'Has cancelado la compra.'
        : result.configuration?.entitlements.length ? 'Tus compras están verificadas.' : 'No hay compras activas para esta cuenta.');
    } catch (error) { if (current()) setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally { lock.current = false; if (current()) setBusy(false); }
  };
  return <Screen title="Mis compras" back><View style={{ padding: S.lg, gap: S.lg }}>
    {!config ? <Text style={F.body}>Comprobando disponibilidad…</Text> : !config.configured ? <EmptyState icon={ShoppingBag} title="Tus compras" subtitle="Las nuevas compras digitales todavía no están disponibles. Tus servicios actuales siguen activos." /> : <>
      {config.entitlements.map(e => <View key={e.entitlement}><Text style={F.h3}>{e.entitlement === 'franky.premium' ? 'Franky Premium' : 'Franky Pro'}</Text><Text style={F.small}>Disponible hasta {new Date(e.expiresAt).toLocaleDateString('es-ES')}</Text></View>)}
      {offers.map(offer => <View key={offer.id} style={{ gap: S.sm }}><Text style={F.h3}>{offer.title}</Text><Text style={F.body}>{offer.description}</Text><Btn label={offer.price} disabled={busy} onPress={() => void purchase(offer)} /></View>)}
      {config.canRestore ? <Btn variant="secondary" label="Restaurar compras" busy={busy} onPress={() => void purchase()} /> : null}
      <Text style={F.small}>Las suscripciones se gestionan desde tu cuenta de App Store o Google Play. Restaurar comprueba las compras asociadas a esta cuenta.</Text>
    </>}
    {message ? <Text accessibilityLiveRegion="polite" style={F.body}>{message}</Text> : null}
    <Btn variant="link" label="Actualizar" disabled={busy} onPress={() => void load()} />
  </View></Screen>;
}
