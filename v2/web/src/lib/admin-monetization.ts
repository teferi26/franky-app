import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabase } from './supabase-admin';
import { PRICING, OWNER_PLAN, frankyCommissionCents, stripeProcessingCents, type CommissionType } from './pricing';
import { mergeOwnerPlanCounts, type MonetizationSummary } from './owner-plan-monetization';
import { housingDeferredBillingReady } from './housing-billing-release';

/**
 * Panel de ingresos (auditoría 23-sep-2026).
 *
 * La RPC admin_monetization_summary (044) solo conoce `subscriptions` y
 * `business_subscriptions`; el Plan Propietario se sumó aquí el 23-ago. Con el
 * mismo criterio (arreglo en la capa API, sin esperar a una migración) se
 * suman ahora el resto de fuentes reales de dinero:
 *
 *   Recurrentes (MRR):
 *     - suscripciones Pro/Premium compradas en la app (native_entitlements),
 *     - contratos de vivienda diferidos (housing_billing_enrollments, solo si
 *       el servicio está activo: con él apagado la tabla puede no existir),
 *     - suscripciones de organizaciones (RPC admin_organization_revenue: sus
 *       tablas no son legibles por service_role).
 *   Puntuales (últimos 30 días, ya descontadas las devoluciones):
 *     - comisiones del marketplace (visitas 10%, alquiler 5%, entradas),
 *     - pedidos Origin (comisión en routing 2; venta propia en routing 1),
 *     - Franky Card.
 *
 * IVA: los precios de Franky al público se anuncian con IVA incluido, así que
 * el MRR se da NETO dividiendo por 1,21. Las tarifas de organizaciones son sin
 * IVA (tax_behavior exclusive) y ya llegan netas. `mrr_gross` conserva el bruto.
 * Las compras en la app se valoran a precio de tarifa neto de IVA; la comisión
 * de Apple/Google no se descuenta (no la conocemos por suscripción).
 *
 * Las fuentes nuevas no bloquean el panel: si una falla se lista en
 * `sources_unavailable` y el resto se muestra. Las dos fuentes de siempre
 * (RPC + Plan Propietario) siguen siendo obligatorias.
 */
export const VAT_RATE = 0.21;
const net = (grossEur: number) => grossEur / (1 + VAT_RATE);
const round2 = (value: number) => Math.round(value * 100) / 100;
const DAY_MS = 86_400_000;

type Admin = ReturnType<typeof createAdminSupabase>;
type Row = Record<string, unknown>;

/** Lee todas las filas (PostgREST corta en 1.000) hasta un tope razonable. */
async function readAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>, cap = 20_000): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error('monetization_source_unavailable');
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export type RevenueBreakdown = {
  recurring_monthly_net: Record<string, number>;
  one_off_30d_net: Record<string, number>;
  one_off_30d_refunded_eur: number;
};

async function nativeMrrGross(admin: Admin): Promise<{ eur: number; count: number }> {
  const rows = await readAll((from, to) => admin.from('native_entitlements')
    .select('entitlement, product_id').eq('environment', 'PRODUCTION').gt('expires_at', new Date().toISOString()).range(from, to));
  let eur = 0;
  for (const row of rows) {
    const plan = row.entitlement === 'franky.premium' ? PRICING.premium : PRICING.pro;
    const yearly = /year|annual|anual/i.test(String(row.product_id ?? ''));
    eur += yearly ? plan.yearly / 12 : plan.monthly;
  }
  return { eur, count: rows.length };
}

async function housingMrrGross(admin: Admin): Promise<{ eur: number; count: number }> {
  if (!housingDeferredBillingReady()) return { eur: 0, count: 0 };
  const rows = await readAll((from, to) => admin.from('housing_billing_enrollments')
    .select('billing, amount_cents, state').eq('state', 'active').range(from, to));
  let eur = 0;
  for (const row of rows) {
    const cents = Number(row.amount_cents) || 0;
    eur += row.billing === 'quarterly' ? cents / 100 / OWNER_PLAN.introMonths : cents / 100;
  }
  return { eur, count: rows.length };
}

async function organizationMrrNet(admin: Admin): Promise<{ eur: number; count: number }> {
  const { data, error } = await admin.rpc('admin_organization_revenue');
  const result = data as { available?: boolean; active?: number; mrr_net_cents?: number } | null;
  if (error || !result?.available) throw new Error('organization_revenue_unavailable');
  return { eur: (Number(result.mrr_net_cents) || 0) / 100, count: Number(result.active) || 0 };
}

/** Comisión de Franky de un pago del marketplace, sin la tasa de Stripe y sin lo devuelto. */
export function marketplaceCommissionCents(row: { type?: unknown; amount_cents?: unknown; application_fee_cents?: unknown; refunded_cents?: unknown; metadata?: unknown }): number {
  const amount = Number(row.amount_cents) || 0;
  if (amount <= 0) return 0;
  const metadata = (row.metadata ?? {}) as { franky_fee_cents?: unknown };
  const recorded = Number(metadata.franky_fee_cents);
  const type = String(row.type) as CommissionType;
  const fee = Number(row.application_fee_cents) || 0;
  const franky = Number.isSafeInteger(recorded) && recorded >= 0 ? recorded
    : Math.max(0, Math.min(fee - stripeProcessingCents(amount), ['visit', 'rent', 'ticket'].includes(type) ? frankyCommissionCents(amount, type) : fee));
  const kept = 1 - Math.min(1, (Number(row.refunded_cents) || 0) / amount);
  return Math.round(franky * kept);
}

async function oneOffRevenue(admin: Admin) {
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const breakdown: Record<string, number> = {};
  let refundedCents = 0;
  const add = (key: string, cents: number) => { breakdown[key] = (breakdown[key] ?? 0) + cents; };

  const payments = await readAll((from, to) => admin.from('payments')
    .select('type, amount_cents, application_fee_cents, refunded_cents, metadata, status')
    .in('status', ['succeeded', 'partially_refunded', 'refunded']).gte('created_at', since).range(from, to));
  for (const row of payments) {
    add(`marketplace_${row.type}`, marketplaceCommissionCents(row));
    refundedCents += Number(row.refunded_cents) || 0;
  }

  const origin = await readAll((from, to) => admin.from('origin_event_orders')
    .select('amount_cents, refunded_cents, routing_version, livemode, status')
    .in('status', ['paid', 'refunded']).eq('livemode', true).gte('created_at', since).range(from, to));
  for (const row of origin) {
    const amount = Number(row.amount_cents) || 0;
    const refunded = Math.min(amount, Number(row.refunded_cents) || 0);
    refundedCents += refunded;
    // routing 1: venta histórica cobrada por Franky; routing 2: Franky solo
    // se queda su comisión; routing 3: la vende ORIGIN directamente (0 €).
    if (row.routing_version === 1) add('origin_direct_sales', amount - refunded);
    else if (row.routing_version === 2) add('origin_commission', Math.round(frankyCommissionCents(amount, 'ticket') * (amount > 0 ? 1 - refunded / amount : 0)));
  }

  const cards = await readAll((from, to) => admin.from('franky_card_orders')
    .select('amount_cents, refunded_cents, status, environment')
    .in('status', ['paid', 'refunded', 'review', 'disputed']).eq('environment', 'live').gte('created_at', since).range(from, to));
  for (const row of cards) {
    const amount = Number(row.amount_cents) || 0;
    const refunded = row.status === 'refunded' ? amount : Math.min(amount, Number(row.refunded_cents) || 0);
    refundedCents += refunded;
    add('franky_card', amount - refunded);
  }

  // Todo lo anterior es bruto con IVA: se da neto.
  const netBreakdown = Object.fromEntries(Object.entries(breakdown).map(([key, cents]) => [key, round2(net(cents / 100))]));
  return { breakdown: netBreakdown, refundedEur: round2(refundedCents / 100) };
}

/** Called only after requireStaff has checked the same session's role and MFA. */
export async function loadAdminMonetization(supabase: SupabaseClient): Promise<(MonetizationSummary & Record<string, unknown>) | null> {
  const admin = createAdminSupabase();
  const baseCount = () => admin.from('owner_subscriptions').select('*', { count: 'exact', head: true });
  const [summary, active, quarterly, trialing] = await Promise.all([
    supabase.rpc('admin_monetization_summary', { p_pricing: PRICING }),
    baseCount().eq('status', 'active'),
    baseCount().eq('status', 'active').eq('billing', 'quarterly_intro'),
    baseCount().eq('status', 'trialing'),
  ]);
  if (summary.error || !summary.data?.active_subscriptions || [active, quarterly, trialing].some(result => result.error || result.count === null)) return null;
  if (quarterly.count! > active.count!) return null;
  const merged = mergeOwnerPlanCounts(summary.data as MonetizationSummary, {
    monthly: active.count! - quarterly.count!, quarterly: quarterly.count!, trialing: trialing.count!,
  });

  const unavailable: string[] = [];
  const optional = async <T,>(name: string, load: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await load(); } catch { unavailable.push(name); return fallback; }
  };
  const empty = { eur: 0, count: 0 };
  const [nativeSubs, housing, organizations, oneOff] = await Promise.all([
    optional('native_entitlements', () => nativeMrrGross(admin), empty),
    optional('housing_billing_enrollments', () => housingMrrGross(admin), empty),
    optional('organization_subscriptions', () => organizationMrrNet(admin), empty),
    optional('one_off_revenue', () => oneOffRevenue(admin), { breakdown: {} as Record<string, number>, refundedEur: 0 }),
  ]);

  // Bruto (IVA incluido) de las fuentes con precio al público.
  const legacyGross = Number(merged.mrr_normalized ?? 0);
  const grossVatIncluded = legacyGross + nativeSubs.eur + housing.eur;
  const mrrNet = round2(net(grossVatIncluded) + organizations.eur);
  const totalPaying = merged.active_subscriptions.total_paying + nativeSubs.count + housing.count + organizations.count;

  const breakdown: RevenueBreakdown = {
    recurring_monthly_net: {
      subscriptions_and_owner_plan: round2(net(legacyGross)),
      native_app_subscriptions: round2(net(nativeSubs.eur)),
      housing_deferred_contracts: round2(net(housing.eur)),
      organization_subscriptions: round2(organizations.eur),
    },
    one_off_30d_net: oneOff.breakdown,
    one_off_30d_refunded_eur: oneOff.refundedEur,
  };

  return {
    ...merged,
    active_subscriptions: {
      ...merged.active_subscriptions,
      native_app: nativeSubs.count,
      housing_deferred: housing.count,
      organizations: organizations.count,
      total_paying: totalPaying,
    },
    mrr_gross: round2(grossVatIncluded + organizations.eur),
    mrr_normalized: mrrNet,
    arr_estimate: round2(mrrNet * 12),
    avg_revenue_per_paying_user: totalPaying > 0 ? round2(mrrNet / totalPaying) : 0,
    vat_rate: VAT_RATE,
    mrr_is_net_of_vat: true,
    revenue_breakdown: breakdown,
    one_off_revenue_30d_net: round2(Object.values(oneOff.breakdown).reduce((sum, value) => sum + value, 0)),
    sources_unavailable: unavailable,
  };
}
