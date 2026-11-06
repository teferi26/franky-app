import React from "react";
import { View } from "react-native";
import { Building2, CheckCircle2, Download, FileText, Landmark, MessageCircle, Plus, Receipt, Trash2, TrendingDown, Wallet, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProData } from "../../../../../shared/pro/types";
import type { ProExpenseCategory, ProUtilityBill, ProUtilityKind } from "../../../../../shared/pro/housing-types";
import { addDays, localDate, money, pct, plural } from "../../../../../shared/pro/format";
import { CONTRACT_LABEL, addMonths, shortDate } from "../../../../../shared/pro/housing";
import {
  EXPENSE_LABEL,
  UTILITY_LABEL,
  courseStartYear,
  expensesCsv,
  housingOpsOf,
  monthKey,
  monthLabel,
  paymentsCsv,
  propertyProfit,
  rentalYear,
  rentalYearCsv,
  splitBill,
  tenantsCsv,
  whatsappHref,
} from "../../../../../shared/pro/housing-ops";
import { statementHtml } from "../../../../../shared/pro/housing-docs";
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
} from "../../../../../shared/pro/housing-plan";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Bars, ChoiceGrid, Empty, Field, Input, Kpi, KpiRow, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, StepNav, Tip } from "../../kit";
import { openExternal } from "./drawer-common";
import { euros } from "./shared";
import { Box, DateField, MeterKpi, MiniStat, SelectField, SoftBox } from "./ui";
import { shareDocument, slugFile } from "./output";

type Tab = "expenses" | "utilities" | "profit" | "year" | "owners";

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const PAGE = 40;

/** Las cuentas de los pisos: gastos, suministros, rentabilidad, renta del año y propietarios. */
export default function HousingCuentas() {
  const { data, now, vertical } = usePro();
  const [tab, setTab] = React.useState<Tab>("expenses");
  const [addingExpense, setAddingExpense] = React.useState(false);
  const [addingBill, setAddingBill] = React.useState(false);

  const s = accountsSummary(data, now);
  const hasOwners = vertical.id === "agency" && housingOpsOf(data).owners.length > 0;
  const monthName = monthLabel(s.month, "long");

  return (
    <>
      <ProPage>
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
              <PButton label="Añadir factura" icon={Plus} onPress={() => setAddingBill(true)} />
            ) : (
              <PButton label="Añadir gasto" icon={Plus} onPress={() => setAddingExpense(true)} />
            )
          }
        />

        <KpiRow>
          <MeterKpi
            icon={Wallet}
            label={`Cobrado en ${monthName}`}
            value={`${pct(s.paidCents, s.expectedCents)} %`}
            hint={`${money(s.owedCents, { round: true })} por cobrar`}
            meter={{ value: s.paidCents, max: s.expectedCents, tone: "success" }}
          />
          <Kpi icon={Receipt} label={`Gastos de ${s.year}`} value={money(s.yearExpensesCents, { round: true })} onPress={() => setTab("expenses")} />
          <Kpi
            icon={Landmark}
            label={`Neto ${courseLabel(courseStartYear(now))}`}
            value={money(s.courseNetCents, { round: true })}
            hint="Renta menos gastos"
            onPress={() => setTab("profit")}
          />
          <Kpi
            icon={TrendingDown}
            label="Se pierde en huecos"
            value={money(s.courseLostCents, { round: true })}
            hint="Meses sin alquilar"
            emphasis={s.courseLostCents > 0}
            onPress={() => setTab("profit")}
          />
        </KpiRow>

        <Segmented<Tab>
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

        {tab === "expenses" ? <ExpensesTab onAdd={() => setAddingExpense(true)} /> : null}
        {tab === "utilities" ? <UtilitiesTab onAdd={() => setAddingBill(true)} /> : null}
        {tab === "profit" ? <ProfitTab /> : null}
        {tab === "year" ? <YearTab /> : null}
        {tab === "owners" && hasOwners ? <OwnersTab /> : null}
      </ProPage>

      <ExpenseSheet open={addingExpense} onClose={() => setAddingExpense(false)} />
      <BillSheet open={addingBill} onClose={() => setAddingBill(false)} />
    </>
  );
}

function propertyTitle(data: ProData, id: string) {
  return data.properties.find((p) => p.id === id)?.title ?? "Piso";
}

function propertyOptions(data: ProData, all?: string) {
  return [...(all ? [{ value: "", label: all }] : []), ...data.properties.map((p) => ({ value: p.id, label: p.title }))];
}

/** Icono pequeño tocable para borrar una fila. */
function DeleteButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={{ width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}>
      <Trash2 size={17} color={C.muted} strokeWidth={1.8} />
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Gastos                                                              */
/* ------------------------------------------------------------------ */

function ExpensesTab({ onAdd }: { onAdd: () => void }) {
  const { data, now, update, pending } = usePro();
  const [year, setYear] = React.useState(() => Number(localDate(now).slice(0, 4)));
  const [propertyId, setPropertyId] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);
  const all = housingOpsOf(data).expenses;
  const mine = propertyId ? all.filter((e) => e.propertyId === propertyId) : all;
  const list = mine.filter((e) => e.date.startsWith(String(year))).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((a, e) => a + e.amountCents, 0);
  const monthly = expensesByMonth({ ...data, housingOps: { ...housingOpsOf(data), expenses: mine } }, year);

  const remove = async (id: string) => {
    if (!(await update("expense.remove", (d) => removeExpense(d, id)))) return;
    toast("Gasto borrado", { kind: "success" });
  };

  return (
    <>
      <StepNav label={String(year)} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} />
      <View style={{ marginBottom: S.md }}>
        <SelectField label="Piso" hideLabel value={propertyId} onChange={setPropertyId} options={propertyOptions(data, "Todos los pisos")} />
      </View>

      <Panel title="Mes a mes" description={`${money(total, { round: true })} en ${year}`}>
        <Bars values={monthly} labels={MONTH_INITIALS} format={(v) => (v ? `${Math.round(v / 100)}` : "")} />
      </Panel>

      <Panel
        flush
        title={`${plural(list.length, "gasto", "gastos")}`}
        action={
          <PButton
            small
            variant="ghost"
            label="CSV"
            icon={Download}
            accessibilityLabel="Compartir los gastos en CSV"
            onPress={() => void shareDocument(expensesCsv(data, year), slugFile("gastos", data.space.name, String(year)), "csv", "Gastos")}
          />
        }
      >
        {list.length ? (
          <>
            {list.slice(0, shown).map((e, i) => (
              <View
                key={e.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: S.sm,
                  paddingLeft: S.lg,
                  paddingRight: S.sm,
                  paddingVertical: 10,
                  borderBottomWidth: i === Math.min(shown, list.length) - 1 ? 0 : 1,
                  borderBottomColor: C.borderLight,
                }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{e.concept}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${shortDate(e.date)} · ${EXPENSE_LABEL[e.category]} · ${propertyTitle(data, e.propertyId)}`}</PText>
                </View>
                <PText v="h3">{money(e.amountCents)}</PText>
                <DeleteButton label={`Borrar ${e.concept}`} onPress={() => void (pending ? undefined : remove(e.id))} />
              </View>
            ))}
            {list.length > shown ? (
              <View style={{ padding: S.md }}>
                <PButton full small variant="outline" label={`Ver ${Math.min(PAGE, list.length - shown)} más`} onPress={() => setShown((n) => n + PAGE)} />
              </View>
            ) : null}
          </>
        ) : (
          <Empty
            icon={Receipt}
            title={`Sin gastos en ${year}`}
            body="Apunta el IBI, la comunidad, el seguro y cada reparación. Con ellos sabrás lo que deja cada piso y tendrás la renta del año lista."
            action={<PButton small variant="outline" label="Añadir gasto" icon={Plus} onPress={onAdd} />}
          />
        )}
      </Panel>
    </>
  );
}

const CATEGORY_OPTIONS = (Object.keys(EXPENSE_LABEL) as ProExpenseCategory[]).map((c) => ({ value: c, label: EXPENSE_LABEL[c] }));

function ExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update, pending } = usePro();
  const today = localDate(now);
  const [propertyId, setPropertyId] = React.useState("");
  const [category, setCategory] = React.useState<ProExpenseCategory>("reparacion");
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(today);

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
    toast("Gasto apuntado", { kind: "success", body: `${money(cents)} en ${propertyTitle(data, propertyId)}.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo gasto"
      description="Lo que pagas por el piso: resta de lo que deja y entra en la renta del año."
      footer={<PButton label="Guardar gasto" onPress={() => void save()} disabled={pending || !ready} />}
    >
      <SelectField label="Piso" value={propertyId} onChange={setPropertyId} options={propertyOptions(data)} />
      <Field label="Tipo de gasto">
        <ChoiceGrid value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
      </Field>
      <Field label="Concepto">
        <Input value={concept} onChangeText={setConcept} placeholder="Cambio del termo" />
      </Field>
      <Field label="Importe">
        <Input value={amount} onChangeText={setAmount} placeholder="120,00 €" keyboardType="decimal-pad" />
      </Field>
      <DateField label="Fecha" value={date} onChange={setDate} today={today} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Suministros                                                         */
/* ------------------------------------------------------------------ */

function UtilitiesTab({ onAdd }: { onAdd: () => void }) {
  const { data, update, pending } = usePro();
  const [propertyId, setPropertyId] = React.useState("");
  const bills = recentBills(data, propertyId || undefined);

  const remove = async (bill: ProUtilityBill) => {
    if (!(await update("utility.remove", (d) => removeUtilityBill(d, bill.id)))) return;
    toast("Factura borrada", { kind: "success" });
  };

  return (
    <>
      <View style={{ marginBottom: S.md, gap: S.sm }}>
        <SelectField label="Piso" hideLabel value={propertyId} onChange={setPropertyId} options={propertyOptions(data, "Todos los pisos")} />
        <PText v="small">Cada factura se reparte entre quienes vivían en el piso esos días. Su parte entra en el recibo del mes.</PText>
      </View>
      {bills.length ? (
        bills.map((bill) => {
          const property = data.properties.find((p) => p.id === bill.propertyId);
          const shares = splitBill(data, bill);
          const over = shares.reduce((a, x) => a + x.overCapCents, 0);
          return (
            <Panel
              key={bill.id}
              title={`${UTILITY_LABEL[bill.kind]} · ${money(bill.amountCents)}`}
              description={`${property?.title ?? ""}, del ${shortDate(bill.from)} al ${shortDate(bill.to)} · ${bill.split === "days" ? "por días" : "a partes iguales"}`}
              action={<DeleteButton label={`Borrar la factura de ${UTILITY_LABEL[bill.kind].toLowerCase()}`} onPress={() => void (pending ? undefined : remove(bill))} />}
            >
              <View style={{ gap: 6 }}>
                {shares.length ? (
                  shares.map((x) => (
                    <View key={x.tenant.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
                      <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{`${x.tenant.name} (${plural(x.days, "día", "días")})`}</PText>
                      <PText v="h3">{money(x.cents)}</PText>
                    </View>
                  ))
                ) : (
                  <PText v="small">Nadie vivía en el piso esos días: la paga el dueño.</PText>
                )}
                {over ? (
                  <PText v="tiny" color={C.warning}>{`${money(over)} pasan del tope de ${money(property?.utilitiesCapCents ?? 0)} al mes por persona: los paga el dueño.`}</PText>
                ) : null}
              </View>
            </Panel>
          );
        })
      ) : (
        <Panel>
          <Empty
            icon={Zap}
            title="Sin facturas de suministros"
            body="Sube la luz, el agua, el gas o internet de cada piso y Franky la reparte por los días que ha vivido cada uno."
            action={<PButton small variant="outline" label="Añadir factura" icon={Plus} onPress={onAdd} />}
          />
        </Panel>
      )}
    </>
  );
}

const UTILITY_OPTIONS = (Object.keys(UTILITY_LABEL) as ProUtilityKind[]).map((k) => ({ value: k, label: UTILITY_LABEL[k] }));

function BillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update, pending } = usePro();
  const [propertyId, setPropertyId] = React.useState("");
  const [kind, setKind] = React.useState<ProUtilityKind>("luz");
  const [from, setFrom] = React.useState(localDate(now));
  const [to, setTo] = React.useState(localDate(now));
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
  const ready = Boolean(propertyId && cents > 0 && from <= to);
  const preview = ready ? splitBill(data, { id: "preview", propertyId, kind, from, to, amountCents: cents, split }) : [];

  const save = async () => {
    if (!ready) return;
    const bill = { propertyId, kind, from, to, amountCents: cents, split };
    if (!(await update("utility.create", (d) => addUtilityBill(d, bill, localId("u"))))) return;
    toast("Factura repartida", { kind: "success", body: `${plural(preview.length, "inquilino la verá", "inquilinos la verán")} en su recibo.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nueva factura de suministros"
      description="Se reparte sola entre quienes vivían en el piso esos días."
      footer={<PButton label="Guardar y repartir" onPress={() => void save()} disabled={pending || !ready} />}
    >
      <SelectField label="Piso" value={propertyId} onChange={setPropertyId} options={propertyOptions(data)} />
      <Field label="Suministro">
        <ChoiceGrid value={kind} onChange={setKind} options={UTILITY_OPTIONS} />
      </Field>
      <DateField label="Desde" value={from} onChange={setFrom} />
      <DateField label="Hasta" value={to} onChange={setTo} min={from} />
      <Field label="Importe de la factura">
        <Input value={amount} onChangeText={setAmount} placeholder="84,60 €" keyboardType="decimal-pad" />
      </Field>
      <Field label="Reparto">
        <ChoiceGrid
          value={split}
          onChange={setSplit}
          options={[
            { value: "days", label: "Por días", hint: "Quien vivió más, paga más" },
            { value: "equal", label: "A partes iguales", hint: "Internet y cuotas fijas" },
          ]}
        />
      </Field>
      {preview.length ? (
        <SoftBox>
          <PText v="tiny">Así queda el reparto</PText>
          {preview.map((x) => (
            <View key={x.tenant.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
              <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{`${x.tenant.name} (${x.days} días)`}</PText>
              <PText v="h3">{money(x.cents)}</PText>
            </View>
          ))}
        </SoftBox>
      ) : ready ? (
        <PText v="small">Nadie vivía en el piso esas fechas: la factura queda a cargo del dueño.</PText>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Rentabilidad                                                        */
/* ------------------------------------------------------------------ */

function ProfitTab() {
  const { data, now } = usePro();
  const [startYear, setStartYear] = React.useState(() => courseStartYear(now));
  const rows = propertyProfit(data, startYear).sort((a, b) => b.netCents - a.netCents);
  const max = Math.max(1, ...rows.map((r) => r.rentCents + r.lostCents));

  return (
    <>
      <StepNav label={`Curso ${courseLabel(startYear)}`} onPrev={() => setStartYear((y) => y - 1)} onNext={() => setStartYear((y) => y + 1)} />
      <Panel flush title="Lo que deja cada piso" description="Renta de los meses alquilados menos los gastos. En gris, lo que no entra por los meses vacíos.">
        {rows.length ? (
          rows.map((r, i) => (
            <View key={r.property.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 8, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{r.property.title}</PText>
                  <PText v="tiny">
                    {`${money(r.perRoomCents, { round: true })} netos por habitación${r.emptyMonths ? `, ${plural(r.emptyMonths, "mes vacío", "meses vacíos")}` : ""}`}
                  </PText>
                </View>
                <PText v="h2" color={r.netCents < 0 ? C.errorText : C.text}>{money(r.netCents, { round: true })}</PText>
              </View>
              {/* Barra: renta que queda, gastos y lo perdido en huecos. */}
              <View style={{ flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: C.input }}>
                <View style={{ width: `${(Math.max(0, r.rentCents - r.expensesCents) / max) * 100}%`, backgroundColor: C.success }} />
                <View style={{ width: `${(Math.min(r.expensesCents, r.rentCents) / max) * 100}%`, backgroundColor: C.warning }} />
                <View style={{ width: `${(r.lostCents / max) * 100}%`, backgroundColor: C.border }} />
              </View>
              <PText v="tiny">
                {`Renta ${money(r.rentCents, { round: true })} · Gastos ${money(r.expensesCents, { round: true })}${r.lostCents ? ` · En huecos ${money(r.lostCents, { round: true })}` : ""}`}
              </PText>
            </View>
          ))
        ) : (
          <Empty icon={Building2} title="Aún no hay pisos" body="Cuando subas tus pisos verás lo que deja cada uno, con sus gastos y sus meses vacíos." />
        )}
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Renta del año                                                       */
/* ------------------------------------------------------------------ */

function YearTab() {
  const { data, now } = usePro();
  const today = localDate(now);
  // En la primera mitad del año se prepara la renta del año que acaba de cerrar.
  const [year, setYear] = React.useState(() => Number(today.slice(0, 4)) - (today.slice(5, 7) <= "06" ? 1 : 0));
  const [open, setOpen] = React.useState<string | null>(null);
  const rows = rentalYear(data, year, now);
  const income = rows.reduce((a, r) => a + r.incomeCents, 0);
  const expenses = rows.reduce((a, r) => a + r.expensesCents, 0);
  const file = (what: string) => slugFile(what, data.space.name, String(year));
  const share = (csv: string, what: string, title: string) => void shareDocument(csv, file(what), "csv", title);

  return (
    <>
      <StepNav label={`Año ${year}`} onPrev={() => setYear((y) => y - 1)} onNext={() => setYear((y) => y + 1)} />
      <Box style={{ flexDirection: "row", marginBottom: S.lg }}>
        <MiniStat value={money(income, { round: true })} label="Ingresos" />
        <MiniStat value={money(expenses, { round: true })} label="Gastos" />
        <MiniStat value={money(income - expenses, { round: true })} label="Neto" />
      </Box>

      <Panel flush title={`Tu renta de ${year}, piso a piso`} description="Ingresos, gastos, días alquilados y tipo de contrato. Listo para tu asesor.">
        {rows.length ? (
          rows.map((r, i) => {
            const expanded = open === r.property.id;
            return (
              <View key={r.property.id} style={{ borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <Tap
                  onPress={() => setOpen(expanded ? null : r.property.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${r.property.title}, neto ${money(r.netCents, { round: true })}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, minHeight: 56 }}
                >
                  <FileText size={16} color={C.muted} strokeWidth={1.75} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{r.property.title}</PText>
                    <PText v="tiny" numberOfLines={1}>
                      {`${r.occupancyPct} % alquilado${r.kinds.length ? `, ${r.kinds.map((k) => CONTRACT_LABEL[k].toLowerCase()).join(" y ")}` : ""}`}
                    </PText>
                  </View>
                  <PText v="h3">{money(r.netCents, { round: true })}</PText>
                </Tap>
                {expanded ? (
                  <View style={{ paddingHorizontal: S.lg, paddingBottom: S.md, gap: 4 }}>
                    <Line label="Ingresos cobrados" value={money(r.incomeCents)} />
                    {r.byCategory.map((c) => (
                      <Line key={c.category} label={EXPENSE_LABEL[c.category]} value={`-${money(c.cents)}`} />
                    ))}
                    <Line label="Días alquilados, sumando habitaciones" value={String(r.roomDays)} />
                    {r.property.compliance?.cadastralRef ? <Line label="Referencia catastral" value={r.property.compliance.cadastralRef} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <Empty icon={FileText} title="Sin pisos este año" body="Cuando tengas pisos con cobros y gastos, aquí tendrás su renta ordenada." />
        )}
      </Panel>

      <Panel title="Para tu asesor" description="Cada fichero se abre con Excel o Numbers.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          <PButton small variant="outline" icon={Download} label="Renta por piso" onPress={() => share(rentalYearCsv(data, year, now), "renta", "Renta por piso")} />
          <PButton small variant="outline" icon={Download} label="Cobros" onPress={() => share(paymentsCsv(data, now), "cobros", "Cobros")} />
          <PButton small variant="outline" icon={Download} label="Gastos" onPress={() => share(expensesCsv(data, year), "gastos", "Gastos")} />
          <PButton small variant="outline" icon={Download} label="Inquilinos" onPress={() => share(tenantsCsv(data), "inquilinos", "Inquilinos")} />
        </View>
      </Panel>
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
      <PText v="small" style={{ flex: 1 }}>{label}</PText>
      <PText v="small" color={C.text}>{value}</PText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Propietarios                                                        */
/* ------------------------------------------------------------------ */

function OwnersTab() {
  const { data, now, update, pending } = usePro();
  const [month, setMonth] = React.useState(() => statementMonth(data, now));
  const statements = ownerStatements(data, month, now);
  const pendingList = statements.filter((s) => !s.settled);
  const toPay = pendingList.reduce((a, s) => a + Math.max(0, s.netCents), 0);
  const monthText = `${monthLabel(month, "long")} ${month.slice(0, 4)}`;
  const shift = (n: number) => setMonth((m) => monthKey(addMonths(`${m}-01`, n)));

  const settle = async (ownerId: string, name: string) => {
    if (!(await update("owner.settle", (d) => settleOwner(d, ownerId, month)))) return;
    toast(`Liquidación de ${name} hecha`, { kind: "success", body: `Queda marcada como liquidada en ${monthText}.` });
  };

  return (
    <>
      <StepNav label={monthText} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={() => setMonth(statementMonth(data, now))} isToday={month === statementMonth(data, now)} />
      <PText v="small" style={{ marginBottom: S.md }}>
        {pendingList.length ? `${plural(pendingList.length, "propietario", "propietarios")} por liquidar, ${money(toPay)} a transferir.` : "Todos liquidados este mes."}
      </PText>
      {statements.length ? (
        statements.map((s) => {
          const text = statementMessage(s, monthText);
            const balance = statementBalance(s);
          return (
            <Panel
              key={s.owner.id}
              title={s.owner.name}
              description={`${plural(s.lines.length, "piso", "pisos")}, honorarios del ${Math.round(s.owner.feePct * 100)} %`}
              action={s.settled ? <Pill tone="success" icon={CheckCircle2} label="Liquidada" /> : <Pill tone="warning" label="Por liquidar" />}
            >
              <View style={{ gap: S.md }}>
                <View style={{ flexDirection: "row", gap: S.sm }}>
                  <MiniStat value={money(s.rentCents, { round: true })} label="Rentas" />
                  <MiniStat value={`-${money(s.feeCents + s.expensesCents, { round: true })}`} label="Honorarios y gastos" />
                  <MiniStat value={money(balance.cents, { round: true })} label={balance.label} danger={balance.owes} />
                </View>
                <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.sm }}>
                  {s.lines.map((l) => (
                    <Line key={l.property.id} label={`${l.property.title}, ${plural(l.paidRents, "renta", "rentas")}`} value={money(l.netCents)} />
                  ))}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                  {!s.settled ? <PButton small label="Marcar liquidada" onPress={() => void settle(s.owner.id, s.owner.name)} disabled={pending} /> : null}
                  <PButton
                    small
                    variant="outline"
                    icon={FileText}
                    label="Liquidación"
                    onPress={() => void shareDocument(statementHtml(data, s), slugFile("liquidacion", s.owner.name, month), "html", `Liquidación de ${s.owner.name}`)}
                  />
                  <PButton small variant="ghost" icon={MessageCircle} label="WhatsApp" onPress={() => openExternal(whatsappHref(text, s.owner.phone))} />
                </View>
              </View>
            </Panel>
          );
        })
      ) : (
        <Panel>
          <Empty icon={Landmark} title="Sin propietarios este mes" body="Asigna cada piso a su propietario y cada mes tendrás aquí su liquidación: rentas, honorarios, gastos y neto." />
        </Panel>
      )}
      <Tip title="A mes vencido">Liquida cuando hayas cobrado todas las rentas del mes y apunta antes en Gastos lo que hayas pagado por cada piso.</Tip>
    </>
  );
}

