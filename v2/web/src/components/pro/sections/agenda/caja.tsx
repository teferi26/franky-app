"use client";

import * as React from "react";
import {
  Banknote,
  CreditCard,
  Lock,
  ShoppingBag,
  Smartphone,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProPayment } from "@/lib/pro/types";
import {
  addDays,
  capitalize,
  dayLabel,
  localDate,
  money,
  plural,
  time,
} from "@/lib/pro/format";
import { bookingsOn } from "@/lib/pro/agenda";
import {
  METHOD_LABEL,
  monthSummary,
  paymentSplit,
  sumByMethod,
} from "@/lib/pro/agenda-money";
import {
  Avatar,
  Detail,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Row,
  RowList,
  Segmented,
  StatusPill,
  StepNav,
  inputClass,
} from "../../kit";
import { BookingDrawer } from "./booking-drawers";
import { MonthView } from "./caja-mes";
import { SellDrawer } from "./sell";
import { ChevronLeft, ChevronRight } from "lucide-react";

const METHOD: Record<
  ProPayment["method"],
  { label: string; icon: typeof CreditCard }
> = {
  card: { label: "Tarjeta", icon: CreditCard },
  cash: { label: "Efectivo", icon: Banknote },
  bizum: { label: "Bizum", icon: Smartphone },
};

const KIND_LABEL: Record<string, string> = {
  deposit: "Señal",
  bundle: "Bono",
  gift: "Tarjeta regalo",
  sale: "Venta",
};

function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 15));
  return date.toISOString().slice(0, 7);
}

export default function CajaSection() {
  const { data, now, demo, can, loadDate, pending: saving } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [period, setPeriod] = React.useState<"day" | "month">("day");
  // En la demo, antes de abrir aún no hay cobros: se abre el último día con
  // caja para que se vea cómo queda. "Hoy" sigue a un toque.
  const [date, setDate] = React.useState(() => {
    if (!demo) return today;
    // Solo cobros en el local: las señales online también entran en domingo.
    const days = data.payments
      .filter((p) => p.agenda?.kind !== "deposit")
      .map((p) => localDate(p.at))
      .filter((day) => day <= today)
      .sort();
    return days.includes(today) ? today : (days[days.length - 1] ?? today);
  });
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [charging, setCharging] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState(false);
  const [selling, setSelling] = React.useState(false);
  const [closed, setClosed] = React.useState<Record<string, boolean>>({});
  const [counted, setCounted] = React.useState("");

  React.useEffect(() => {
    if (!demo) void loadDate(period === "day" ? date : `${month}-01`);
  }, [date, month, period, demo, loadDate]);

  const payments = data.payments
    .filter((p) => localDate(p.at) === date)
    .sort((a, b) => b.at.localeCompare(a.at));
  const byMethod = sumByMethod(payments);
  const sum = () => payments.reduce((a, p) => a + p.amountCents, 0);
  const tips = payments.reduce((a, p) => a + p.tipCents, 0);
  const pending = bookingsOn(data, date).filter(
    (b) => b.status === "arrived" || b.status === "in_service",
  );
  // Las propinas en efectivo también están en el cajón.
  const cash =
    byMethod.cash +
    payments
      .filter((p) => p.method === "cash" && !p.agenda?.split)
      .reduce((a, p) => a + p.tipCents, 0);
  const countedCents = Math.round(Number(counted.replace(",", ".")) * 100);
  const diff = counted ? countedCents - cash : 0;
  const staffDay = monthSummary(data, date.slice(0, 7), date).staff.filter(
    (row) => row.payments > 0,
  );
  const showFinance = demo || can("finance.read");
  const canSell = Boolean(data.agendaOps) && !saving;

  if (!showFinance) {
    return (
      <Empty
        icon={Wallet}
        title="Caja no está disponible para tu cuenta"
        body="Pide al responsable del negocio acceso a la información económica."
      />
    );
  }

  const monthLabel = new Date(`${month}-15T12:00:00Z`).toLocaleDateString(
    "es-ES",
    { month: "long", year: "numeric" },
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Caja"
        title={
          period === "day"
            ? capitalize(dayLabel(`${date}T12:00:00Z`))
            : capitalize(monthLabel)
        }
        description={
          period === "day"
            ? `${plural(payments.length, "cobro", "cobros")} por ${money(sum() + tips)}${pending.length ? ` y ${pending.length} por cobrar ahora` : ""}.`
            : "Cobros, comisiones y el resumen para tu gestoría."
        }
        actions={
          <>
            <Segmented
              label="Periodo"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "day", label: "Día" },
                { value: "month", label: "Mes" },
              ]}
            />
            {data.agendaOps ? (
              <Button
                variant="outline"
                disabled={!canSell}
                onClick={() => setSelling(true)}
              >
                <ShoppingBag className="h-4 w-4" /> Vender
              </Button>
            ) : null}
            {period === "day" && demo ? (
              closed[date] ? (
                <Pill tone="success">
                  <Lock className="h-3 w-3" /> Caja cerrada
                </Pill>
              ) : (
                <Button
                  variant="dark"
                  onClick={() => {
                    setCounted("");
                    setClosing(true);
                  }}
                  disabled={!payments.length}
                >
                  <Lock className="h-4 w-4" /> Cerrar caja
                </Button>
              )
            ) : null}
          </>
        }
      >
        {period === "day" ? (
          <StepNav
            label=""
            onPrev={() => setDate(addDays(date, -1))}
            onNext={() => setDate(addDays(date, 1))}
            onToday={() => setDate(today)}
            isToday={date === today}
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <IconButton
              label="Mes anterior"
              icon={ChevronLeft}
              onClick={() => setMonth(addMonths(month, -1))}
            />
            <IconButton
              label="Mes siguiente"
              icon={ChevronRight}
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={month >= today.slice(0, 7)}
            />
          </div>
        )}
      </PageHeader>

      {period === "month" ? (
        <MonthView month={month} />
      ) : (
        <>
          <KpiRow>
            <Kpi
              icon={Wallet}
              label={demo ? "Total cobrado" : "Cobros registrados"}
              value={money(sum(), { round: true })}
              hint={`${money(tips)} de propinas`}
              emphasis
            />
            <Kpi
              icon={CreditCard}
              label="Tarjeta"
              value={money(byMethod.card, { round: true })}
            />
            <Kpi
              icon={Banknote}
              label="Efectivo"
              value={money(byMethod.cash, { round: true })}
            />
            <Kpi
              icon={Smartphone}
              label="Bizum"
              value={money(byMethod.bizum, { round: true })}
            />
          </KpiRow>

          {pending.length ? (
            <Panel
              title="Por cobrar"
              description="Clientes que están ahora en el local."
              flush
            >
              <RowList>
                {pending.map((b) => (
                  <Row
                    key={b.id}
                    onClick={() =>
                      !saving && can("booking.charge") && setCharging(b.id)
                    }
                  >
                    <Avatar name={b.clientName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {b.clientName}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {data.services.find((s) => s.id === b.serviceId)?.name}
                      </span>
                    </span>
                    <StatusPill status={b.status} />
                    <span className="w-16 text-right text-sm font-semibold tabular">
                      {b.paidCents === null
                        ? "Sin datos"
                        : money(Math.max(0, b.priceCents - b.paidCents))}
                    </span>
                  </Row>
                ))}
              </RowList>
            </Panel>
          ) : null}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel title="Cobros del día" flush>
              {payments.length ? (
                <div className="overflow-x-auto pro-scroll">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-border-light text-left text-xs uppercase tracking-wider text-text-muted">
                        <th className="px-5 py-2.5 font-semibold">Hora</th>
                        <th className="px-3 py-2.5 font-semibold">Cliente</th>
                        <th className="px-3 py-2.5 font-semibold">Método</th>
                        <th className="px-5 py-2.5 text-right font-semibold">
                          Importe
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-light">
                      {payments.map((p) => (
                        <PaymentRow key={p.id} payment={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={Wallet}
                  title="Sin cobros este día"
                  body="Al cobrar una cita, o al vender un producto, un bono o una tarjeta regalo, aparece aquí con su método de pago."
                />
              )}
            </Panel>

            <Panel
              title="Por profesional"
              description="Lo cobrado, propinas y comisión según sus reglas."
              flush
            >
              {staffDay.length ? (
                <ul className="divide-y divide-border-light">
                  {staffDay.map((row) => (
                    <li
                      key={row.staff.id}
                      className="flex items-center gap-3 px-4 py-3 sm:px-5"
                    >
                      <Avatar
                        name={row.staff.name}
                        tone={row.staff.tone}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {row.staff.name.split(" ")[0]}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {plural(row.payments, "cobro", "cobros")}
                          {row.tipsCents
                            ? ` · ${money(row.tipsCents)} propinas`
                            : ""}
                        </span>
                      </span>
                      <span className="text-right text-sm">
                        <span className="block font-semibold tabular">
                          {money(row.serviceCents + row.productCents)}
                        </span>
                        {row.chairRentCents ? (
                          <span className="block text-xs text-text-muted">
                            Alquila sillón
                          </span>
                        ) : row.commissionCents ? (
                          <span className="block text-xs text-text-muted tabular">
                            {money(row.commissionCents)} comisión
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-text-muted">
                  Aún no hay cobros por profesional.
                </p>
              )}
            </Panel>
          </div>
        </>
      )}

      <BookingDrawer bookingId={charging} onClose={() => setCharging(null)} />
      <SellDrawer open={selling} onClose={() => setSelling(false)} />
      <Drawer
        open={closing}
        onOpenChange={setClosing}
        title="Cerrar caja"
        description={capitalize(dayLabel(`${date}T12:00:00Z`))}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClosing(false)}>
              Cancelar
            </Button>
            <Button
              variant="dark"
              onClick={() => {
                setClosed((c) => ({ ...c, [date]: true }));
                setClosing(false);
                toast.success(
                  "Caja cerrada",
                  diff === 0
                    ? "Cuadra al céntimo."
                    : `Descuadre de ${money(Math.abs(diff))} ${diff > 0 ? "de más" : "de menos"}.`,
                );
              }}
            >
              Cerrar caja
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
            <Detail label="Tarjeta">{money(byMethod.card)}</Detail>
            <Detail label="Bizum">{money(byMethod.bizum)}</Detail>
            <Detail label="Efectivo esperado (con propinas)">
              {money(cash)}
            </Detail>
            <Detail label="Total">{money(sum() + tips)}</Detail>
          </div>
          <FormField
            label="Efectivo contado (€)"
            htmlFor="cash-count"
            hint="Cuenta el cajón y escríbelo. Te decimos si cuadra."
          >
            <input
              id="cash-count"
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className={inputClass}
              placeholder={(cash / 100).toFixed(2).replace(".", ",")}
            />
          </FormField>
          {counted ? (
            <p
              className={
                diff === 0
                  ? "text-sm font-semibold text-emerald-700 dark:text-emerald-300"
                  : "text-sm font-semibold text-rose-600"
              }
            >
              {diff === 0
                ? "Cuadra."
                : `Diferencia: ${diff > 0 ? "+" : "-"}${money(Math.abs(diff))}`}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}

function PaymentRow({ payment: p }: { payment: ProPayment }) {
  const M = METHOD[p.method];
  const split = paymentSplit(p);
  const extra = p.agenda;
  const kind = extra?.kind ? KIND_LABEL[extra.kind] : null;
  return (
    <tr className="hover:bg-bg-secondary">
      <td className="px-5 py-2.5 align-top text-text-muted tabular">
        {time(p.at)}
      </td>
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2 font-medium">
          {p.clientName}
          {kind ? <Pill>{kind}</Pill> : null}
        </span>
        <span className="block text-xs text-text-muted">{p.concept}</span>
        {extra?.discountCents ? (
          <span className="block text-xs text-text-muted">
            {extra.discountLabel ?? "Descuento"} -{money(extra.discountCents)}
          </span>
        ) : null}
        {extra?.bundleId ? (
          <span className="block text-xs text-violet-deep">
            Sesión del bono
          </span>
        ) : null}
        {extra?.depositAppliedCents ? (
          <span className="block text-xs text-text-muted">
            Señal descontada {money(extra.depositAppliedCents)}
          </span>
        ) : null}
        {extra?.giftCardCents ? (
          <span className="block text-xs text-text-muted">
            Tarjeta regalo {money(extra.giftCardCents)}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top">
        {split.length > 1 ? (
          <span className="flex flex-col text-xs text-text-secondary">
            {split.map((part) => (
              <span key={part.method}>
                {METHOD_LABEL[part.method]} {money(part.cents)}
              </span>
            ))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-text-secondary">
            <M.icon className="h-3.5 w-3.5" /> {M.label}
          </span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right align-top tabular">
        <span className="font-semibold">{money(p.amountCents)}</span>
        {p.tipCents ? (
          <span className="block text-xs text-text-muted">
            +{money(p.tipCents)} propina
          </span>
        ) : null}
      </td>
    </tr>
  );
}
