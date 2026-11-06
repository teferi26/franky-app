"use client";

import * as React from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  MessageCircle,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { addDays, localDate, money, pct, plural } from "@/lib/pro/format";
import { CONTRACT_LABEL, addMonths, shortDate } from "@/lib/pro/housing";
import {
  EXPENSE_LABEL,
  UTILITY_LABEL,
  expensesCsv,
  housingOpsOf,
  monthKey,
  monthLabel,
  paymentsCsv,
  propertyProfit,
  courseStartYear,
  rentalYear,
  rentalYearCsv,
  splitBill,
  tenantsCsv,
  whatsappHref,
} from "@/lib/pro/housing-ops";
import type { ProExpenseCategory, ProUtilityBill, ProUtilityKind } from "@/lib/pro/housing-types";
import { statementHtml } from "@/lib/pro/housing-docs";
import {
  accountsSummary,
  addExpense,
  addUtilityBill,
  courseLabel,
  expensesByMonth,
  lastClosedMonth,
  statementBalance,
  statementMessage,
  statementMonth,
  ownerStatements,
  recentBills,
  removeExpense,
  removeUtilityBill,
  settleOwner,
} from "@/lib/pro/housing-plan";
import { cn } from "@/lib/utils";
import {
  Bars,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  StepNav,
  Tip,
  inputClass,
} from "../../kit";
import { downloadCsv, openPrintable, slugFile } from "./output";
import { euros, selectClass } from "./shared";

type Tab = "expenses" | "utilities" | "profit" | "year" | "owners";

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Las cuentas de los pisos en un solo sitio: gastos, suministros repartidos,
 * lo que deja cada piso, la renta del año para el asesor y, en una gestora,
 * la liquidación mensual a cada propietario.
 */
export default function HousingCuentas() {
  const { data, now, vertical } = usePro();
  const [tab, setTab] = React.useState<Tab>("expenses");
  const [addingExpense, setAddingExpense] = React.useState(false);
  const [addingBill, setAddingBill] = React.useState(false);

  const s = accountsSummary(data, now);
  const hasOwners = vertical.id === "agency" && housingOpsOf(data).owners.length > 0;
  const monthName = monthLabel(s.month, "long");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Cuentas"
        title={`${money(s.paidCents, { round: true })} cobrados en ${monthName}`}
        description={
          s.expectedCents
            ? `De ${money(s.expectedCents, { round: true })} esperados. ${s.owedCents ? `${money(s.owedCents, { round: true })} por cobrar.` : "Nadie debe nada este mes."}`
            : "Cuando pases a tus inquilinos, aquí verás lo cobrado cada mes."
        }
        actions={
          tab === "utilities" ? (
            <Button variant="dark" onClick={() => setAddingBill(true)}>
              <Plus className="h-4 w-4" /> Añadir factura
            </Button>
          ) : (
            <Button variant="dark" onClick={() => setAddingExpense(true)}>
              <Plus className="h-4 w-4" /> Añadir gasto
            </Button>
          )
        }
      />

      <KpiRow>
        <Kpi
          icon={Wallet}
          label={`Cobrado en ${monthName}`}
          value={`${pct(s.paidCents, s.expectedCents)} %`}
          hint={<Meter value={s.paidCents} max={s.expectedCents} tone="success" />}
        />
        <Kpi icon={Receipt} label={`Gastos de ${s.year}`} value={money(s.yearExpensesCents, { round: true })} onClick={() => setTab("expenses")} />
        <Kpi
          icon={Landmark}
          label={`Neto del curso ${courseLabel(courseStartYear(now))}`}
          value={money(s.courseNetCents, { round: true })}
          hint="Renta menos gastos"
          onClick={() => setTab("profit")}
        />
        <Kpi
          icon={TrendingDown}
          label="Se pierde en huecos"
          value={money(s.courseLostCents, { round: true })}
          hint="Meses sin alquilar"
          emphasis={s.courseLostCents > 0}
          onClick={() => setTab("profit")}
        />
      </KpiRow>

      <Segmented<Tab>
        label="Cuentas"
        value={tab}
        onChange={setTab}
        options={[
          { value: "expenses", label: "Gastos" },
          { value: "utilities", label: "Suministros" },
          { value: "profit", label: "Rentabilidad" },
          { value: "year", label: "Renta del año" },
          ...(hasOwners ? [{ value: "owners" as const, label: "Propietarios" }] : []),
        ]}
      />

      {tab === "expenses" ? <ExpensesPanel onAdd={() => setAddingExpense(true)} /> : null}
      {tab === "utilities" ? <UtilitiesPanel onAdd={() => setAddingBill(true)} /> : null}
      {tab === "profit" ? <ProfitPanel /> : null}
      {tab === "year" ? <YearPanel /> : null}
      {tab === "owners" && hasOwners ? <OwnersPanel /> : null}

      <ExpenseDrawer open={addingExpense} onClose={() => setAddingExpense(false)} />
      <BillDrawer open={addingBill} onClose={() => setAddingBill(false)} />
    </div>
  );
}

function propertyTitle(data: ProData, id: string) {
  return data.properties.find((p) => p.id === id)?.title ?? "Piso";
}

/* ------------------------------------------------------------------ */
/* Gastos                                                              */
/* ------------------------------------------------------------------ */

function ExpensesPanel({ onAdd }: { onAdd: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [year, setYear] = React.useState(() => Number(localDate(now).slice(0, 4)));
  const [propertyId, setPropertyId] = React.useState("");
  const all = housingOpsOf(data).expenses;
  const list = all
    .filter((e) => e.date.startsWith(String(year)) && (!propertyId || e.propertyId === propertyId))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((a, e) => a + e.amountCents, 0);
  const byCategory = (Object.keys(EXPENSE_LABEL) as ProExpenseCategory[])
    .map((c) => ({ c, cents: list.filter((e) => e.category === c).reduce((a, e) => a + e.amountCents, 0) }))
    .filter((x) => x.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const monthly = expensesByMonth(
    propertyId ? { ...data, housingOps: { ...housingOpsOf(data), expenses: all.filter((e) => e.propertyId === propertyId) } } : data,
    year,
  );

  const remove = async (id: string) => {
    if (!(await update("expense.remove", (d) => removeExpense(d, id)))) return;
    toast.success("Gasto borrado");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        flush
        title={`${money(total, { round: true })} en ${year}`}
        description={`${plural(list.length, "gasto", "gastos")}${propertyId ? ` de ${propertyTitle(data, propertyId)}` : " de todos tus pisos"}.`}
        action={
          <IconButton
            label="Descargar gastos en CSV"
            icon={Download}
            onClick={() => downloadCsv(expensesCsv(data, year), slugFile("gastos", data.space.name, String(year)))}
          />
        }
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border-light px-4 py-3 sm:px-5">
          <StepNav label={String(year)} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} />
          <select aria-label="Piso" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={cn(selectClass, "w-auto min-w-40")}>
            <option value="">Todos los pisos</option>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        {list.length ? (
          <RowList>
            {list.slice(0, 60).map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <span className="w-14 shrink-0 text-xs text-text-muted tabular">{shortDate(e.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.concept}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {EXPENSE_LABEL[e.category]} · {propertyTitle(data, e.propertyId)}
                    {e.incidentId ? " · incidencia" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular">{money(e.amountCents)}</span>
                <IconButton label={`Borrar ${e.concept}`} icon={Trash2} onClick={() => remove(e.id)} />
              </div>
            ))}
          </RowList>
        ) : (
          <Empty
            icon={Receipt}
            title={`Sin gastos en ${year}`}
            body="Apunta el IBI, la comunidad, el seguro y cada reparación. Con ellos sabrás lo que deja cada piso y tendrás la renta del año lista."
            action={
              <Button variant="outline" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Añadir gasto
              </Button>
            }
          />
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel title="Mes a mes">
          <Bars values={monthly} labels={MONTH_INITIALS} highlightLast={false} format={(v) => money(v, { round: true })} />
        </Panel>
        {byCategory.length ? (
          <Panel title="Por categoría">
            <ul className="flex flex-col gap-2.5">
              {byCategory.map((x) => (
                <li key={x.c} className="text-sm">
                  <span className="flex items-center justify-between gap-2">
                    <span>{EXPENSE_LABEL[x.c]}</span>
                    <span className="font-semibold tabular">{money(x.cents, { round: true })}</span>
                  </span>
                  <Meter value={x.cents} max={total} className="mt-1" />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

const CATEGORY_OPTIONS = (Object.keys(EXPENSE_LABEL) as ProExpenseCategory[]).map((c) => ({ value: c, label: EXPENSE_LABEL[c] }));

function ExpenseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [propertyId, setPropertyId] = React.useState("");
  const [category, setCategory] = React.useState<ProExpenseCategory>("reparacion");
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setPropertyId(data.properties[0]?.id ?? "");
    setCategory("reparacion");
    setConcept("");
    setAmount("");
    setDate(localDate(now));
    // Solo al abrir: los datos cambian con cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cents = euros(amount);
  const ready = Boolean(propertyId && cents > 0 && date);

  const save = async () => {
    if (!ready) return;
    const expense = { propertyId, category, concept: concept.trim() || EXPENSE_LABEL[category], amountCents: cents, date };
    if (!(await update("expense.create", (d) => addExpense(d, expense, localId("e"))))) return;
    toast.success("Gasto apuntado", `${money(cents)} en ${propertyTitle(data, propertyId)}.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo gasto"
      description="Lo que pagas por el piso: resta de lo que deja y entra en la renta del año."
      footer={
        <Button variant="dark" onClick={save} disabled={!ready}>
          Guardar gasto
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Piso" htmlFor="exp-property">
          <select id="exp-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectClass}>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Tipo de gasto">
          <ChoiceChips value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
        </FormField>
        <FormField label="Concepto" htmlFor="exp-concept">
          <input id="exp-concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Cambio del termo" className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Importe" htmlFor="exp-amount">
            <input id="exp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120,00 €" className={inputClass} />
          </FormField>
          <FormField label="Fecha" htmlFor="exp-date">
            <input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </FormField>
        </div>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Suministros                                                         */
/* ------------------------------------------------------------------ */

function UtilitiesPanel({ onAdd }: { onAdd: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [propertyId, setPropertyId] = React.useState("");
  const bills = recentBills(data, propertyId || undefined);

  const remove = async (bill: ProUtilityBill) => {
    if (!(await update("utility.remove", (d) => removeUtilityBill(d, bill.id)))) return;
    toast.success("Factura borrada");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Piso" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={cn(selectClass, "w-auto min-w-40")}>
          <option value="">Todos los pisos</option>
          {data.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <p className="text-sm text-text-muted">Cada factura se reparte entre quienes vivían en el piso esos días. Su parte entra en el recibo del mes.</p>
      </div>
      {bills.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {bills.map((bill) => {
            const property = data.properties.find((p) => p.id === bill.propertyId);
            const shares = splitBill(data, bill);
            const over = shares.reduce((a, x) => a + x.overCapCents, 0);
            return (
              <article key={bill.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-heading text-base font-bold">
                      <Zap className="h-4 w-4 text-text-muted" strokeWidth={1.8} />
                      {UTILITY_LABEL[bill.kind]} · {money(bill.amountCents)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {property?.title}, del {shortDate(bill.from)} al {shortDate(bill.to)} · {bill.split === "days" ? "por días" : "a partes iguales"}
                    </p>
                  </div>
                  <IconButton label={`Borrar la factura de ${UTILITY_LABEL[bill.kind].toLowerCase()}`} icon={Trash2} onClick={() => remove(bill)} />
                </div>
                {shares.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {shares.map((x) => (
                      <li key={x.tenant.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {x.tenant.name}
                          <span className="ml-1.5 text-xs text-text-muted">{plural(x.days, "día", "días")}</span>
                        </span>
                        <span className="font-semibold tabular">{money(x.cents)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-muted">Nadie vivía en el piso esos días: la paga el dueño.</p>
                )}
                {over ? (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {money(over)} pasan del tope de {money(property?.utilitiesCapCents ?? 0)} al mes por persona: los paga el dueño.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty
            icon={Zap}
            title="Sin facturas de suministros"
            body="Sube la luz, el agua, el gas o internet de cada piso y Franky la reparte por los días que ha vivido cada uno."
            action={
              <Button variant="outline" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Añadir factura
              </Button>
            }
          />
        </Panel>
      )}
    </div>
  );
}

const UTILITY_OPTIONS = (Object.keys(UTILITY_LABEL) as ProUtilityKind[]).map((k) => ({ value: k, label: UTILITY_LABEL[k] }));

function BillDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [propertyId, setPropertyId] = React.useState("");
  const [kind, setKind] = React.useState<ProUtilityKind>("luz");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [split, setSplit] = React.useState<ProUtilityBill["split"]>("days");

  React.useEffect(() => {
    if (!open) return;
    // Por defecto, el mes pasado entero: es la factura que suele llegar ahora.
    const month = lastClosedMonth(now);
    setPropertyId(data.properties[0]?.id ?? "");
    setKind("luz");
    setFrom(`${month}-01`);
    setTo(addDays(addMonths(`${month}-01`, 1), -1));
    setAmount("");
    setSplit("days");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cents = euros(amount);
  const ready = Boolean(propertyId && cents > 0 && from && to && from <= to);
  const preview = ready ? splitBill(data, { id: "preview", propertyId, kind, from, to, amountCents: cents, split }) : [];

  const save = async () => {
    if (!ready) return;
    const bill = { propertyId, kind, from, to, amountCents: cents, split };
    if (!(await update("utility.create", (d) => addUtilityBill(d, bill, localId("u"))))) return;
    toast.success("Factura repartida", `${plural(preview.length, "inquilino la verá", "inquilinos la verán")} en su recibo.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva factura de suministros"
      description="Se reparte sola entre quienes vivían en el piso esos días."
      footer={
        <Button variant="dark" onClick={save} disabled={!ready}>
          Guardar y repartir
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Piso" htmlFor="bill-property">
          <select id="bill-property" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectClass}>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Suministro">
          <ChoiceChips value={kind} onChange={setKind} options={UTILITY_OPTIONS} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde" htmlFor="bill-from">
            <input id="bill-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta" htmlFor="bill-to">
            <input id="bill-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Importe de la factura" htmlFor="bill-amount">
          <input id="bill-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="84,60 €" className={inputClass} />
        </FormField>
        <FormField label="Reparto">
          <ChoiceChips
            value={split}
            onChange={setSplit}
            options={[
              { value: "days", label: "Por días", hint: "Quien vivió más, paga más" },
              { value: "equal", label: "A partes iguales", hint: "Internet y cuotas fijas" },
            ]}
          />
        </FormField>
        {preview.length ? (
          <div className="rounded-2xl bg-bg-secondary p-3.5">
            <p className="text-xs font-semibold text-text-muted">Así queda el reparto</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {preview.map((x) => (
                <li key={x.tenant.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {x.tenant.name} <span className="text-xs text-text-muted">({x.days} días)</span>
                  </span>
                  <span className="font-semibold tabular">{money(x.cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : ready ? (
          <p className="text-sm text-text-muted">Nadie vivía en el piso esas fechas: la factura queda a cargo del dueño.</p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Rentabilidad por piso                                               */
/* ------------------------------------------------------------------ */

function ProfitPanel() {
  const { data, now } = usePro();
  const [startYear, setStartYear] = React.useState(() => courseStartYear(now));
  const rows = propertyProfit(data, startYear).sort((a, b) => b.netCents - a.netCents);
  const max = Math.max(1, ...rows.map((r) => r.rentCents + r.lostCents));

  return (
    <Panel
      flush
      title={`Lo que deja cada piso en el curso ${courseLabel(startYear)}`}
      description="Renta de los meses alquilados menos los gastos. En gris, lo que no entra por los meses vacíos."
      action={<StepNav label={courseLabel(startYear)} onPrev={() => setStartYear((y) => y - 1)} onNext={() => setStartYear((y) => y + 1)} />}
    >
      {rows.length ? (
        <RowList>
          {rows.map((r) => (
            <div key={r.property.id} className="flex flex-col gap-2 px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.property.title}</span>
                  <span className="block text-xs text-text-muted">
                    {plural(r.property.rooms.length, "habitación", "habitaciones")}, {money(r.perRoomCents, { round: true })} netos por habitación
                    {r.emptyMonths ? `, ${plural(r.emptyMonths, "mes vacío", "meses vacíos")}` : ""}
                  </span>
                </span>
                <span className={cn("font-heading text-lg font-extrabold tabular", r.netCents < 0 && "text-rose-700 dark:text-rose-300")}>{money(r.netCents, { round: true })}</span>
              </div>
              {/* Barra: renta cobrada, gastos dentro de ella y lo perdido en huecos. */}
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-bg-tertiary" aria-hidden>
                <span className="h-full bg-emerald-500" style={{ width: `${(Math.max(0, r.rentCents - r.expensesCents) / max) * 100}%` }} />
                <span className="h-full bg-amber-400" style={{ width: `${(Math.min(r.expensesCents, r.rentCents) / max) * 100}%` }} />
                <span className="h-full bg-text-muted/25" style={{ width: `${(r.lostCents / max) * 100}%` }} />
              </div>
              <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted tabular">
                <span>Renta {money(r.rentCents, { round: true })}</span>
                <span>Gastos {money(r.expensesCents, { round: true })}</span>
                {r.lostCents ? <span>En huecos {money(r.lostCents, { round: true })}</span> : null}
              </p>
            </div>
          ))}
        </RowList>
      ) : (
        <Empty icon={Building2} title="Aún no hay pisos" body="Cuando subas tus pisos verás lo que deja cada uno, con sus gastos y sus meses vacíos." />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Renta del año                                                       */
/* ------------------------------------------------------------------ */

function YearPanel() {
  const { data, now } = usePro();
  // En enero se prepara la renta del año que acaba de cerrar.
  const [year, setYear] = React.useState(() => Number(localDate(now).slice(0, 4)) - (localDate(now).slice(5, 7) <= "06" ? 1 : 0));
  const rows = rentalYear(data, year, now);
  const income = rows.reduce((a, r) => a + r.incomeCents, 0);
  const expenses = rows.reduce((a, r) => a + r.expensesCents, 0);
  const file = (what: string) => slugFile(what, data.space.name, String(year));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepNav label={`Año ${year}`} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv(rentalYearCsv(data, year, now), file("renta"))}>
            <Download className="h-3.5 w-3.5" /> Renta por piso
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(paymentsCsv(data, now), file("cobros"))}>
            <Download className="h-3.5 w-3.5" /> Cobros
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(expensesCsv(data, year), file("gastos"))}>
            <Download className="h-3.5 w-3.5" /> Gastos
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(tenantsCsv(data), file("inquilinos"))}>
            <Download className="h-3.5 w-3.5" /> Inquilinos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Kpi label="Ingresos cobrados" value={money(income, { round: true })} />
        <Kpi label="Gastos" value={money(expenses, { round: true })} />
        <Kpi label="Neto" value={money(income - expenses, { round: true })} emphasis />
      </div>

      <Panel flush title={`Tu renta de ${year}, piso a piso`} description="Ingresos, gastos, días alquilados y tipo de contrato. Listo para tu asesor.">
        {rows.length ? (
          <RowList>
            {rows.map((r) => (
              <details key={r.property.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-bg-secondary sm:px-5">
                  <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.property.title}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {r.occupancyPct} % alquilado{r.kinds.length ? `, ${r.kinds.map((k) => CONTRACT_LABEL[k].toLowerCase()).join(" y ")}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-text-muted tabular">
                    <span className="block text-sm font-semibold text-text-primary">{money(r.netCents, { round: true })}</span>
                    neto
                  </span>
                </summary>
                <div className="grid gap-1 px-4 pb-4 text-sm sm:px-5 sm:pl-12">
                  <p className="flex justify-between gap-2">
                    <span className="text-text-muted">Ingresos cobrados</span>
                    <span className="font-semibold tabular">{money(r.incomeCents)}</span>
                  </p>
                  {r.byCategory.map((c) => (
                    <p key={c.category} className="flex justify-between gap-2">
                      <span className="text-text-muted">{EXPENSE_LABEL[c.category]}</span>
                      <span className="tabular">-{money(c.cents)}</span>
                    </p>
                  ))}
                  <p className="flex justify-between gap-2">
                    <span className="text-text-muted">Días alquilados, sumando habitaciones</span>
                    <span className="tabular">{r.roomDays}</span>
                  </p>
                  {r.property.compliance?.cadastralRef ? (
                    <p className="flex justify-between gap-2">
                      <span className="text-text-muted">Referencia catastral</span>
                      <span className="tabular">{r.property.compliance.cadastralRef}</span>
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
          </RowList>
        ) : (
          <Empty icon={FileText} title="Sin pisos este año" body="Cuando tengas pisos con cobros y gastos, aquí tendrás su renta ordenada." />
        )}
      </Panel>
      <Tip title="Para tu asesor">
        Descarga la renta por piso y los gastos y pásaselos a tu asesor: ya van separados por piso y con el tipo de contrato.
      </Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Liquidación a propietarios                                          */
/* ------------------------------------------------------------------ */

function OwnersPanel() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [month, setMonth] = React.useState(() => statementMonth(data, now));
  const statements = ownerStatements(data, month, now);
  const pending = statements.filter((s) => !s.settled);
  const toPay = pending.reduce((a, s) => a + Math.max(0, s.netCents), 0);
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(`${m}-01`, n)));
  const monthText = `${monthLabel(month, "long")} ${month.slice(0, 4)}`;

  const settle = async (ownerId: string, name: string) => {
    if (!(await update("owner.settle", (d) => settleOwner(d, ownerId, month)))) return;
    toast.success(`Liquidación de ${name} hecha`, `Queda marcada como liquidada en ${monthText}.`);
  };
  const print = (s: (typeof statements)[number]) => {
    const how = openPrintable(statementHtml(data, s), slugFile("liquidacion", s.owner.name, month));
    toast.success(how === "opened" ? "Liquidación abierta" : "Liquidación descargada", "Imprímela o guárdala en PDF para mandarla.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepNav label={monthText} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={() => setMonth(statementMonth(data, now))} isToday={month === statementMonth(data, now)} />
        <p className="text-sm text-text-muted">
          {pending.length ? `${plural(pending.length, "propietario", "propietarios")} por liquidar, ${money(toPay)} a transferir.` : "Todos liquidados este mes."}
        </p>
      </div>
      {statements.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {statements.map((s) => {
            const text = statementMessage(s, monthText);
            const balance = statementBalance(s);
            return (
              <article key={s.owner.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-heading text-base font-bold">{s.owner.name}</p>
                    <p className="text-xs text-text-muted">
                      {plural(s.lines.length, "piso", "pisos")}, honorarios del {Math.round(s.owner.feePct * 100)} %
                    </p>
                  </div>
                  {s.settled ? (
                    <Pill tone="success">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={1.9} /> Liquidada
                    </Pill>
                  ) : (
                    <Pill tone="warning">Por liquidar</Pill>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted">Rentas</dt>
                    <dd className="font-semibold tabular">{money(s.rentCents, { round: true })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Honorarios y gastos</dt>
                    <dd className="font-semibold tabular">-{money(s.feeCents + s.expensesCents, { round: true })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">{balance.label}</dt>
                    <dd className={cn("font-heading text-lg font-extrabold tabular", balance.owes && "text-rose-700 dark:text-rose-300")}>
                      {money(balance.cents, { round: true })}
                    </dd>
                  </div>
                </dl>
                <ul className="flex flex-col gap-1 border-t border-border-light pt-2.5 text-xs text-text-muted">
                  {s.lines.map((l) => (
                    <li key={l.property.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {l.property.title}, {plural(l.paidRents, "renta cobrada", "rentas cobradas")}
                      </span>
                      <span className="tabular">{money(l.netCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {!s.settled ? (
                    <Button size="sm" variant="dark" onClick={() => settle(s.owner.id, s.owner.name)}>
                      Marcar liquidada
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => print(s)}>
                    <FileText className="h-3.5 w-3.5" /> Liquidación
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={whatsappHref(text, s.owner.phone)} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Panel>
          <Empty icon={Landmark} title="Sin propietarios este mes" body="Asigna cada piso a su propietario y cada mes tendrás aquí su liquidación: rentas, honorarios, gastos y neto." />
        </Panel>
      )}
    </div>
  );
}
