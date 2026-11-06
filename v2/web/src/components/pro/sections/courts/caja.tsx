"use client";

import * as React from "react";
import { Banknote, CreditCard, Download, FileCheck2, Lock, Receipt, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProPayment } from "@/lib/pro/types";
import { addDays, capitalize, dayLabel, localDate, money, plural, time } from "@/lib/pro/format";
import { cashCategory, cashSummary, closeCash } from "@/lib/pro/courts-desk";
import { cashCheck, cashHistory, cashMonthRows } from "@/lib/pro/courts-admin";
import { proCsvCell } from "@/lib/pro/csv";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  RowList,
  StepNav,
  inputClass,
} from "../../kit";
import { downloadCsv } from "../classes/ui";
import { METHOD_LABEL } from "./booking-ops";
import { CourtsNotReady, parseEuros, shortDate, useCourtsState } from "./state";
import { InvoiceDrawer, InvoicesPanel, type InvoicePreset } from "./facturas";

/**
 * Caja del día: lo cobrado por método y por concepto, el cierre con lo
 * contado en efectivo y los últimos días de un vistazo. Exporta el mes en
 * CSV para la gestoría.
 */

const METHOD_ICON = { card: CreditCard, cash: Banknote, bizum: Smartphone } as const;

export default function CajaSection() {
  const { ready } = useCourtsState();
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Caja" title="Caja del día" />
        <CourtsNotReady
          icon={Wallet}
          title="Cierra la caja en un minuto"
          body="Lo cobrado por tarjeta, efectivo y Bizum, separado por pistas, bonos, clases y mostrador, con el descuadre al contar."
        />
      </div>
    );
  return <Caja />;
}

function Caja() {
  const { data, now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const [date, setDate] = React.useState(today);
  const [closing, setClosing] = React.useState(false);
  const [invoice, setInvoice] = React.useState<InvoicePreset>(null);
  const billed = new Set(ops.invoices.map((i) => i.paymentId).filter(Boolean));
  const summary = cashSummary(data, date);
  const closed = ops.cashClosings.find((c) => c.date === date);
  const history = cashHistory(data, today, 7);
  const maxDay = Math.max(1, ...history.map((h) => h.totalCents));
  const isToday = date === today;

  const methods = (Object.keys(METHOD_LABEL) as ProPayment["method"][])
    .filter((m) => summary.byMethod[m] > 0)
    .map((m) => `${money(summary.byMethod[m], { round: true })} ${m === "card" ? "con tarjeta" : m === "cash" ? "en efectivo" : "por Bizum"}`);
  const description = summary.payments.length
    ? `${isToday ? "Has cobrado" : "Se cobraron"} ${money(summary.total)} en ${plural(summary.payments.length, "cobro", "cobros")}${methods.length ? `: ${methods.join(", ")}` : ""}.`
    : isToday
      ? "Aún no hay cobros hoy. Aparecen aquí según se cobran las reservas, los bonos y el mostrador."
      : "Ese día no hubo cobros.";

  const exportMonth = () => {
    const month = date.slice(0, 7);
    const rows = cashMonthRows(data, month, (p) => cashCategory(data, p));
    downloadCsv(`cobros-${data.space.slug}-${month}.csv`, rows.map((r) => r.map(proCsvCell).join(";")).join("\n"));
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Caja"
        title={isToday ? "Caja de hoy" : capitalize(dayLabel(`${date}T12:00:00Z`))}
        description={description}
        actions={
          <>
            <Button variant="outline" className="min-h-10" onClick={exportMonth}>
              <Download className="h-4 w-4" /> Exportar el mes
            </Button>
            {closed ? (
              <Pill tone="success" className="h-10 px-3 text-sm">
                <Lock className="h-3.5 w-3.5" /> Cerrada por {closed.by.split(" ")[0]} a las {time(closed.at)}
              </Pill>
            ) : (
              <Button variant="dark" onClick={() => setClosing(true)} disabled={date > today}>
                <Lock className="h-4 w-4" /> Cerrar caja
              </Button>
            )}
          </>
        }
      >
        <StepNav
          label={isToday ? "" : shortDate(date)}
          onPrev={() => setDate(addDays(date, -1))}
          onNext={() => setDate(addDays(date, 1) > today ? today : addDays(date, 1))}
          onToday={() => setDate(today)}
          isToday={isToday}
        />
      </PageHeader>

      <KpiRow>
        <Kpi label="Total" value={money(summary.total, { round: true })} emphasis hint={summary.tips ? `más ${money(summary.tips)} de propinas` : plural(summary.payments.length, "cobro", "cobros")} />
        {(Object.keys(METHOD_LABEL) as ProPayment["method"][]).map((m) => (
          <Kpi key={m} label={METHOD_LABEL[m]} value={money(summary.byMethod[m], { round: true })} icon={METHOD_ICON[m]} />
        ))}
      </KpiRow>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel title="Cobros" description={summary.payments.length ? "Del más reciente al primero." : undefined} flush>
          {summary.payments.length ? (
            <RowList>
              {summary.payments.map((p) => {
                const Icon = METHOD_ICON[p.method];
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={p.clientName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.clientName}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {time(p.at)}, {p.concept}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular">
                      <Icon className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.9} aria-label={METHOD_LABEL[p.method]} />
                      {money(p.amountCents + p.tipCents)}
                    </span>
                    {billed.has(p.id) ? (
                      <span className="inline-flex h-10 w-10 items-center justify-center text-emerald-600" title="Con factura">
                        <FileCheck2 className="h-4 w-4" strokeWidth={1.9} aria-label="Con factura" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Hacer factura de ${p.clientName}`}
                        title="Hacer factura"
                        onClick={() => setInvoice({ payment: p })}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                      >
                        <Receipt className="h-4 w-4" strokeWidth={1.9} />
                      </button>
                    )}
                  </div>
                );
              })}
            </RowList>
          ) : (
            <Empty icon={Wallet} title="Sin cobros" body="Cada reserva, bono o venta del mostrador que cobres aparece aquí al momento." />
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title="Por concepto">
            {summary.byCategory.length ? (
              <ul className="flex flex-col gap-3">
                {summary.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">{c.category}</span>
                      <span className="tabular">
                        {money(c.cents)} <span className="text-xs text-text-muted">({c.count})</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
                      <div className="h-full rounded-full bg-violet" style={{ width: `${Math.round((c.cents / Math.max(1, summary.total)) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">Pistas, bonos, clases, torneos y mostrador, por separado.</p>
            )}
          </Panel>

          <Panel title="Últimos 7 días" description="Toca un día para verlo.">
            <div className="flex h-32 items-end gap-1.5">
              {history.map((h) => (
                <button
                  key={h.date}
                  type="button"
                  onClick={() => setDate(h.date)}
                  aria-label={`${shortDate(h.date)}: ${money(h.totalCents)}`}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span
                    className={cn(
                      "w-full rounded-md transition-colors",
                      h.date === date ? "bg-violet" : "bg-bg-tertiary group-hover:bg-violet/40",
                    )}
                    style={{ height: `${Math.max(4, (h.totalCents / maxDay) * 100)}%` }}
                  />
                  <span className="text-[0.65rem] text-text-muted">{shortDate(h.date).split(" ")[0]}</span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      !h.closed ? "bg-transparent" : h.diffCents !== null && Math.abs(h.diffCents) > 100 ? "bg-amber-500" : "bg-emerald-500",
                    )}
                    aria-hidden
                  />
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-text-muted">El punto verde es una caja cerrada y cuadrada; el ámbar, con descuadre.</p>
          </Panel>

          <InvoicesPanel month={date.slice(0, 7)} onNew={() => setInvoice({})} />

          {closed ? (
            <Panel title="Cierre">
              <div className="text-sm">
                <Line label="Efectivo esperado" value={money(closed.expectedCashCents)} />
                <Line label="Efectivo contado" value={money(closed.countedCashCents)} />
                <Line
                  label="Diferencia"
                  value={
                    closed.countedCashCents === closed.expectedCashCents
                      ? "Cuadra"
                      : `${closed.countedCashCents > closed.expectedCashCents ? "Sobran" : "Faltan"} ${money(Math.abs(closed.countedCashCents - closed.expectedCashCents))}`
                  }
                  strong
                />
              </div>
            </Panel>
          ) : null}
        </div>
      </div>

      <CloseDrawer open={closing} date={date} onClose={() => setClosing(false)} />
      <InvoiceDrawer preset={invoice} onClose={() => setInvoice(null)} />
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border-light py-2 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className={cn("tabular", strong ? "font-semibold" : "font-medium")}>{value}</span>
    </div>
  );
}

function CloseDrawer({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const toast = useToast();
  const people = React.useMemo(() => {
    const names = [data.space.owner.name, ...data.staff.map((s) => s.name)];
    return [...new Set(names)].slice(0, 6);
  }, [data.space.owner.name, data.staff]);
  const [counted, setCounted] = React.useState("");
  const [float, setFloat] = React.useState("0");
  const [by, setBy] = React.useState(people[0] ?? "");

  React.useEffect(() => {
    if (!open) return;
    setCounted("");
    setFloat("0");
    setBy(people[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countedCents = parseEuros(counted);
  const floatCents = parseEuros(float) ?? 0;
  const check = countedCents === null ? null : cashCheck(data, date, countedCents, floatCents);

  const save = async () => {
    if (countedCents === null) return;
    const ok = await update("court.cash.close", (d) =>
      closeCash(d, {
        id: localId("cc"),
        date,
        at: now.toISOString(),
        // Se guarda sin el cambio del día, para comparar con lo cobrado.
        countedCashCents: countedCents - floatCents,
        by,
      }),
    );
    if (ok) {
      toast.success(
        "Caja cerrada",
        check && check.status !== "ok"
          ? `${check.diffCents > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(check.diffCents))} en efectivo. Queda apuntado.`
          : "El efectivo cuadra.",
      );
      onClose();
    }
  };

  const expected = cashSummary(data, date).byMethod.cash;
  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Cerrar caja"
      description={`Deberías tener ${money(expected + floatCents)} en efectivo${floatCents ? `, con ${money(floatCents)} de cambio` : ""}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={countedCents === null || !by || pending}>
            Cerrar caja
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Efectivo contado (€)" htmlFor="cc-counted">
            <input id="cc-counted" inputMode="decimal" autoFocus value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0,00" className={inputClass} />
          </FormField>
          <FormField label="Cambio al abrir (€)" htmlFor="cc-float">
            <input id="cc-float" inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        {check ? (
          <p
            className={cn(
              "rounded-2xl p-4 text-sm font-medium",
              check.status === "ok"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {check.status === "ok"
              ? "Cuadra."
              : `${check.diffCents > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(check.diffCents))}. Revisa los cobros en efectivo antes de cerrar.`}
          </p>
        ) : null}
        <FormField label="Quién cierra">
          <ChoiceChips value={by} onChange={setBy} options={people.map((p) => ({ value: p, label: p.split(" ")[0] }))} />
        </FormField>
      </div>
    </Drawer>
  );
}
