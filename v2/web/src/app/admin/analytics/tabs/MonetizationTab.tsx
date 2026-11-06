"use client";

import { Euro, TrendingUp, PartyPopper } from "lucide-react";
import KpiCard from "../components/KpiCard";
import DistributionPieChart from "../components/DistributionPieChart";
import EmptyDataState from "../components/EmptyDataState";
import { useAnalyticsQuery } from "../hooks/useAnalyticsQuery";
import { useAnalyticsFilters } from "../hooks/useAnalyticsFilters";
import { formatEur } from "@/lib/pricing";
import { Notice, tableWrapClass, tableClass, thClass, thRightClass, tdClass, trClass } from "../../components/panel-ui";

type MonResponse = {
  active_subscriptions: {
    pro_monthly: number;
    pro_yearly: number;
    premium_monthly: number;
    premium_yearly: number;
    business_leisure: number;
    business_housing: number;
    /** Plan Inmobiliarias pagando (80 €/mes). Lo añade la ruta, no la RPC. */
    owner_plan_monthly?: number;
    /** Plan Inmobiliarias en modalidad trimestral de entrada. */
    owner_plan_quarterly?: number;
    total_paying: number;
  };
  /** Inmobiliarias en prueba gratis: aún no pagan, no van al MRR. */
  owner_plan_trialing?: number;
  mrr_normalized: number;
  arr_estimate: number;
  churn_30d: number;
  new_subscriptions_30d: number;
  avg_revenue_per_paying_user: number;
};

type CreatorsResponse = {
  period_days: number;
  creators: {
    organizer_id: string | null;
    name: string;
    email: string | null;
    tickets_sold: number;
    events_count: number;
    gross_cents: number;
    franky_fee_cents: number;
    organizer_net_cents: number;
  }[];
  totals: { tickets: number; gross_cents: number; franky_fee_cents: number };
};

const eur = (cents: number) => formatEur((cents ?? 0) / 100);

/* Card: qué creadores de eventos nos generan más dinero (comisión de entradas) */
function EventCreatorsCard({ queryString }: { queryString: string }) {
  const { data, loading, error, refetch } = useAnalyticsQuery<CreatorsResponse>(
    `/api/admin/analytics/event-creators?${queryString}`
  );

  if (loading) return <div className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />;
  if (error) return <EmptyDataState title="Error al cargar creadores de eventos" hint={error} onRetry={refetch} />;

  const creators = data?.creators ?? [];
  const totals = data?.totals;
  const maxFee = creators[0]?.franky_fee_cents || 1;

  return (
    <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
      <h3 className="font-heading text-sm font-bold text-text-primary mb-1 flex items-center gap-2">
        <PartyPopper className="w-4 h-4 text-violet" strokeWidth={1.75} />
        Top creadores de eventos: dinero que generan a Franky
      </h3>
      <p className="text-xs text-text-muted mb-4">
        Entradas cobradas por la app (Stripe Connect). La comisión Franky es el
        application_fee real registrado en cada pago. Desde el 16-ago-2026 esa
        fee incluye también los gastos de Stripe (1,5 % + 0,25 € por cobro), que
        Stripe se descuenta de ahí: lo que queda limpio para Franky es la fee
        menos esos gastos (en payments.metadata: franky_fee_cents / stripe_fee_cents).
      </p>

      {creators.length === 0 ? (
        <EmptyDataState
          title="Aún sin entradas cobradas por la app"
          hint="Aparecerán aquí los organizadores en cuanto vendan entradas con cobro vía Franky."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <KpiCard
              label="Comisión Franky"
              value={(totals?.franky_fee_cents ?? 0) / 100}
              formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
              caption="Comisión registrada, antes de gastos"
            />
            <KpiCard
              label="Facturación bruta"
              value={(totals?.gross_cents ?? 0) / 100}
              formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
              caption="Total pagado por asistentes"
            />
            <KpiCard label="Entradas vendidas" value={totals?.tickets ?? 0} accent="fuchsia" />
          </div>

          <div className={tableWrapClass}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>#</th>
                  <th className={thClass}>Creador</th>
                  <th className={thRightClass}>Eventos</th>
                  <th className={thRightClass}>Entradas</th>
                  <th className={thRightClass}>Bruto</th>
                  <th className={thRightClass}>Comisión Franky</th>
                  <th className={thRightClass}>Neto organizador</th>
                </tr>
              </thead>
              <tbody>
                {creators.map((c, i) => (
                  <tr key={c.organizer_id ?? i} className={trClass}>
                    <td className={`${tdClass} tabular text-xs text-text-muted`}>{i + 1}</td>
                    <td className={tdClass}>
                      <p className="max-w-[180px] truncate font-medium text-text-primary">{c.name}</p>
                      {c.email && <p className="max-w-[180px] truncate text-xs text-text-muted">{c.email}</p>}
                    </td>
                    <td className={`${tdClass} tabular text-right`}>{c.events_count}</td>
                    <td className={`${tdClass} tabular text-right`}>{c.tickets_sold}</td>
                    <td className={`${tdClass} tabular text-right`}>{eur(c.gross_cents)}</td>
                    <td className={`${tdClass} text-right`}>
                      <div className="inline-flex items-center gap-2">
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-bg-secondary sm:block">
                          <div
                            className="h-full bg-violet"
                            style={{ width: `${Math.max(4, Math.round((c.franky_fee_cents / maxFee) * 100))}%` }}
                          />
                        </div>
                        <span className="tabular font-semibold text-text-primary">{eur(c.franky_fee_cents)}</span>
                      </div>
                    </td>
                    <td className={`${tdClass} tabular text-right text-text-secondary`}>{eur(c.organizer_net_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const PLAN_LABEL: Record<string, string> = {
  pro_monthly: "Pro mensual",
  pro_yearly: "Pro anual",
  premium_monthly: "Premium mensual",
  premium_yearly: "Premium anual",
  business_leisure: "Business Leisure",
  business_housing: "Business Housing",
  owner_plan_monthly: "Plan Inmobiliarias (mensual)",
  owner_plan_quarterly: "Plan Inmobiliarias (trimestral)",
};

export default function MonetizationTab() {
  const { queryString } = useAnalyticsFilters();
  const { data, loading, error, refetch } = useAnalyticsQuery<MonResponse>(
    `/api/admin/analytics/monetization`
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
          ))}
        </div>
        <div className="h-72 skeleton-shimmer rounded-2xl bg-bg-secondary/50" />
      </div>
    );
  }
  if (error) return <EmptyDataState title="Error al cargar" hint={error} onRetry={refetch} />;
  if (!data) return <EmptyDataState />;

  const subsDistribution = Object.entries(data.active_subscriptions)
    .filter(([k]) => k !== "total_paying")
    .map(([k, v]) => ({ label: PLAN_LABEL[k] ?? k, count: v as number }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="MRR estimado"
          value={data.mrr_normalized}
          formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
          caption="Ingresos mensuales recurrentes"
        />
        <KpiCard
          label="ARR estimado"
          value={data.arr_estimate}
          formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
          caption="MRR × 12"
        />
        <KpiCard
          label="Suscripciones activas"
          value={data.active_subscriptions.total_paying}
        />
        <KpiCard
          label="Media mensual por suscripción"
          value={data.avg_revenue_per_paying_user}
          formatter={(v) => formatEur(typeof v === "number" ? v : Number(v))}
          caption="Estimación por suscripción activa"
        />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
        <KpiCard
          label="Altas de suscripción 30d"
          value={data.new_subscriptions_30d}
          caption="Incluye pruebas gratuitas"
        />
        <KpiCard
          label="Canceladas actualizadas en 30d"
          value={data.churn_30d}
          caption="Suscripciones canceladas"
        />
        <KpiCard
          label="Pro (mes+año)"
          value={data.active_subscriptions.pro_monthly + data.active_subscriptions.pro_yearly}
        />
        <KpiCard
          label="Business"
          value={data.active_subscriptions.business_leisure + data.active_subscriptions.business_housing}
          caption={`L: ${data.active_subscriptions.business_leisure} · H: ${data.active_subscriptions.business_housing}`}
        />
        <KpiCard
          label="Plan Inmobiliarias"
          value={(data.active_subscriptions.owner_plan_monthly ?? 0) + (data.active_subscriptions.owner_plan_quarterly ?? 0)}
          caption={`Pagando (80 €/mes) · en prueba: ${data.owner_plan_trialing ?? 0}`}
        />
      </div>

      <EventCreatorsCard queryString={queryString} />

      <div className="rounded-2xl border border-border bg-bg-primary shadow-card p-5">
        <h3 className="font-heading text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <Euro className="w-4 h-4 text-success" strokeWidth={1.75} />
          Distribución de suscripciones por plan
        </h3>
        <DistributionPieChart data={subsDistribution.filter((s) => s.count > 0)} />
      </div>

      <Notice tone="warning" icon={TrendingUp} className="text-xs">
        <strong className="font-semibold text-text-primary">Nota sobre MRR/ARR:</strong> los valores son una estimación
        calculada multiplicando suscripciones activas × precio de
        <code className="mx-0.5 rounded bg-bg-secondary px-1 font-mono">lib/pricing.ts</code>.
        Para cifras financieras 100% precisas (proración, descuentos,
        cancelaciones a mitad de período), cruza contra el dashboard de
        Stripe.
      </Notice>
    </div>
  );
}
