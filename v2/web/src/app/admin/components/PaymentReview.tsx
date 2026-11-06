'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, CreditCard, ArrowUpRight } from 'lucide-react';
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';
import { Button } from '@/components/ui/button';
import {
  Panel, PanelHead, PanelContent, SectionTitle, Metric, Notice, Quiet,
  tableWrapClass, tableClass, thClass, tdClass, trClass,
} from './panel-ui';
type Review = { generated_at: string; counts: { state: string; orders: number }[]; review: {
  id: string; type: string; amount_cents: number; currency: string; status: string; created_at: string;
  stripe_payment_intent_id: string | null; issue: string | null; checkout_state: string;
}[] };
const reasons: Record<string, string> = { legacy_unknown_checkout: 'Pedido antiguo sin confirmación del cierre', remote_checkout_unconfirmed: 'Stripe no ha confirmado el cierre', paid_ticket_needs_review: 'Pago recibido: revisar la entrada o el evento', paid_visit_needs_review: 'Pago recibido: revisar la visita o su horario' };
function PaymentReview() {
  const { isCurrent } = useAccountGuard();
  const [data, setData] = useState<Review | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController(); setError(''); setData(null);
    fetch('/api/admin/payments/review', { cache: 'no-store', signal: abort.signal }).then(async r => {
      const body = await r.json(); if (!r.ok) throw new Error(body.error || 'Error al cargar pagos');
      if (!abort.signal.aborted && isCurrent()) setData(body);
    }).catch(e => { if (!abort.signal.aborted && isCurrent()) setError(e instanceof Error ? e.message : 'Error al cargar pagos'); });
    return () => abort.abort();
  }, [retry, isCurrent]);
  const unresolved = data?.counts.find(c => c.state === 'review')?.orders ?? 0;
  const inProgress = data ? data.counts.filter(c => ['open','creating','prepared','closing','legacy'].includes(c.state)).reduce((n,c) => n+c.orders,0) : 0;
  return <section className="mb-6" aria-label="Revisión de pagos"><Panel>
    <PanelHead>
      <SectionTitle
        eyebrow="Cobros"
        title={<span className="inline-flex items-center gap-2"><CreditCard className="h-5 w-5 text-violet" strokeWidth={1.75} />Revisión de pagos</span>}
        description="Cobros recibidos con incidencias y reservas cuyo cierre aún necesita confirmación."
        aside={<Button variant="ghost" size="icon-sm" aria-label="Actualizar revisión de pagos" onClick={() => setRetry(n => n+1)}><RefreshCw className="h-4 w-4" strokeWidth={1.75} /></Button>}
      />
    </PanelHead>
    <PanelContent>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {!data && !error && <Quiet role="status">Comprobando pagos…</Quiet>}
      {data && <>
        <div className="grid grid-cols-2 gap-6">
          <Metric label="Pendientes de revisión" value={unresolved} index={0} tone={unresolved ? 'warning' : 'neutral'} caption="Incidencias en la cola" />
          <Metric label="Pagos en curso" value={inProgress} index={1} caption="Cierres aún sin confirmar" />
        </div>
        {!data.review.length ? <Quiet>No hay incidencias pendientes en la cola de revisión.</Quiet> : <div className={`${tableWrapClass} mt-6`}><table className={tableClass}><thead><tr><th className={thClass}>Pedido</th><th className={thClass}>Importe</th><th className={thClass}>Motivo</th><th className={thClass}>Comprobar</th></tr></thead><tbody>{data.review.map(p => <tr key={p.id} className={trClass}><td className={tdClass}><span className="text-sm font-medium text-text-primary">{p.type === 'ticket' ? 'Entrada' : p.type === 'visit' ? 'Visita' : 'Alquiler'}</span><code className="block text-xs text-text-muted select-all">{p.id}</code><span className="tabular text-xs text-text-muted">{new Date(p.created_at).toLocaleString('es-ES')}</span></td><td className={`${tdClass} tabular whitespace-nowrap`}>{(p.amount_cents/100).toLocaleString('es-ES',{style:'currency',currency:p.currency.toUpperCase()})}</td><td className={`${tdClass} min-w-48 text-text-secondary`}>{reasons[p.issue ?? ''] ?? 'Revisar el cierre pendiente'}</td><td className={tdClass}>{p.stripe_payment_intent_id && /^pi_[a-zA-Z0-9]+$/.test(p.stripe_payment_intent_id) ? <Button variant="ghost" size="sm" asChild><a href={`https://dashboard.stripe.com/payments/${p.stripe_payment_intent_id}`} target="_blank" rel="noopener noreferrer">Ver en Stripe <ArrowUpRight className="ml-1 h-4 w-4" strokeWidth={1.75} /></a></Button> : <span className="text-xs text-text-muted">Buscar el ID del pedido en Stripe</span>}</td></tr>)}</tbody></table></div>}
        <p className="mt-4 text-xs text-text-muted">Comprueba el pago y la reserva antes de realizar un reembolso. Esta vista no cobra ni devuelve dinero automáticamente. Se muestran hasta 50 incidencias, empezando por las más antiguas.</p>
      </>}
    </PanelContent>
  </Panel></section>;
}
export default withAccountScope(PaymentReview);
