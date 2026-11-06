"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveRestore,
  Camera,
  Download,
  HandCoins,
  Landmark,
  Minus,
  Plus,
  Printer,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { atLocal, localDate, money, shortDay } from "@/lib/pro/format";
import {
  EXPENSE_LABEL,
  INCOME_LABEL,
  PAY_METHOD_LABEL,
  communityLedger,
  communityOps,
  courseLabel,
  ledgerCsv,
  withCommunityOps,
} from "@/lib/pro/community";
import type {
  CommunityActivity,
  CommunityExpenseCategory,
  CommunityIncomeCategory,
  CommunityMovement,
  CommunityPayMethod,
} from "@/lib/pro/community-types";
import { courseAccountsHtml } from "@/lib/pro/community-docs";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { downloadCsv, openPrintable, receiptThumbnail } from "./files";
import { MerchView } from "./merch";

type View = "movimientos" | "cuentas" | "pedidos";
type Filter = "todos" | "gastos" | "ingresos" | "sin_ticket" | "reembolsar";
type Editing = { mode: "new"; kind: CommunityMovement["kind"] } | { mode: "edit"; id: string } | null;

export default function CommunityCaja() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ops = communityOps(data);
  const ledger = communityLedger(data, now);
  const activities = data.activities as CommunityActivity[];
  const titles = new Map(activities.map((a) => [a.id, a.title]));
  const activityFilter = params.get("actividad");

  const initialView = params.get("vista");
  const [view, setView] = React.useState<View>(
    initialView === "pedidos" || initialView === "cuentas" ? initialView : "movimientos",
  );
  const [filter, setFilter] = React.useState<Filter>("todos");
  const [editing, setEditing] = React.useState<Editing>(null);
  const [opening, setOpening] = React.useState(false);

  const course = ops.movements.filter((m) => localDate(m.date) >= ledger.from);
  const list = course
    .filter((m) => {
      if (activityFilter && m.activityId !== activityFilter) return false;
      if (filter === "gastos") return m.kind === "expense";
      if (filter === "ingresos") return m.kind === "income";
      if (filter === "sin_ticket") return m.kind === "expense" && !m.receipt;
      if (filter === "reembolsar") return m.kind === "expense" && m.paidBy && !m.reimbursed;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Pedidos de merchandising que aún piden algo: tallas abiertas o cobros pendientes.
  const openOrders = (ops.merch ?? []).filter(
    (o) => o.status === "abierto" || o.lines.some((l) => !l.paidAt),
  ).length;
  const auto = ledger.incomes.filter((l) => ["entradas", "cuotas", "patrocinios"].includes(l.key));
  const reimburseNames = [...new Set(ledger.pendingReimburse.map((m) => m.paidBy?.split(" ")[0]))].filter(Boolean);

  const printAccounts = () => {
    const opened = openPrintable(courseAccountsHtml(data, now), `cuentas-${courseLabel(now)}`);
    toast.success(
      "Cuentas del curso listas",
      opened ? "Imprímelas o guárdalas en PDF desde la pestaña nueva." : "Se han descargado para abrirlas.",
    );
  };

  const archiveAccounts = () => {
    const html = courseAccountsHtml(data, now);
    const title = `Cuentas del curso ${courseLabel(now)} a ${shortDay(now.toISOString())}`;
    update("community.accounts.archive", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        documents: [
          { id: localId("d"), title, kind: "cuentas", at: new Date().toISOString(), by: "Tesorería", html },
          ...o.documents,
        ],
      })),
    );
    toast.success("Guardadas en el archivo", "Las encuentras en Junta, listas para la asamblea.");
  };

  const exportCsv = () => {
    downloadCsv(
      ledgerCsv(ledger, ops.movements, activities),
      `caja-${data.space.slug}-${localDate(now)}.csv`,
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Caja"
        title="Caja del curso"
        description={
          `Tienes ${money(ledger.balanceCents)}. Este curso han entrado ${money(ledger.incomeCents, { round: true })} ` +
          `y han salido ${money(ledger.expenseCents, { round: true })}.` +
          (ledger.pendingReimburse.length
            ? ` Hay ${money(ledger.pendingReimburseCents)} por devolver a ${reimburseNames.join(" y ")}.`
            : "")
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing({ mode: "new", kind: "income" })}>
              <Plus className="h-4 w-4" /> Ingreso
            </Button>
            <Button variant="dark" onClick={() => setEditing({ mode: "new", kind: "expense" })}>
              <Camera className="h-4 w-4" /> Apuntar gasto
            </Button>
          </>
        }
      >
        <Segmented<View>
          label="Vista de la caja"
          value={view}
          onChange={setView}
          options={[
            { value: "movimientos", label: "Movimientos", count: course.length },
            { value: "cuentas", label: "Cuentas del curso" },
            { value: "pedidos", label: "Pedidos", count: openOrders || undefined },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Wallet} label="Saldo" value={money(ledger.balanceCents, { round: true })} hint={`Empezó el curso con ${money(ledger.openingCents, { round: true })}`} emphasis />
        <Kpi icon={TrendingUp} label="Ingresos" value={money(ledger.incomeCents, { round: true })} hint="Entradas, cuotas, patrocinios y más" />
        <Kpi icon={TrendingDown} label="Gastos" value={money(ledger.expenseCents, { round: true })} hint={ledger.missingReceipts ? `${ledger.missingReceipts} sin ticket` : "Todos con ticket"} onClick={() => { setView("movimientos"); setFilter("sin_ticket"); }} />
        <Kpi icon={HandCoins} label="Por devolver" value={money(ledger.pendingReimburseCents, { round: true })} hint={ledger.pendingReimburse.length ? `A ${reimburseNames.join(" y ")}` : "Nadie ha puesto dinero"} onClick={() => { setView("movimientos"); setFilter("reembolsar"); }} />
      </KpiRow>

      {view === "movimientos" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-3">
            <Segmented<Filter>
              label="Filtrar movimientos"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "todos", label: "Todo" },
                { value: "gastos", label: "Gastos" },
                { value: "ingresos", label: "Ingresos" },
                { value: "sin_ticket", label: "Sin ticket", count: ledger.missingReceipts || undefined },
                { value: "reembolsar", label: "Por devolver", count: ledger.pendingReimburse.length || undefined },
              ]}
            />
            {activityFilter ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">Solo de</span>
                <span className="inline-flex h-8 items-center gap-1 rounded-full border border-border pl-3 pr-1 font-semibold">
                  <span className="max-w-[14rem] truncate">{titles.get(activityFilter) ?? "la actividad"}</span>
                  <button
                    type="button"
                    aria-label="Ver todos los movimientos"
                    onClick={() => router.replace(pathname)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-bg-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ) : null}
            <Panel flush>
              {list.length ? (
                <ul className="divide-y divide-border-light">
                  {list.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setEditing({ mode: "edit", id: m.id })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5"
                      >
                        {m.receipt?.dataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.receipt.dataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" />
                        ) : (
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-text-muted">
                            {m.kind === "income" ? <Plus className="h-4 w-4" strokeWidth={1.9} /> : <Receipt className="h-4 w-4" strokeWidth={1.9} />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.concept}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {shortDay(m.date)} ·{" "}
                            {m.kind === "income"
                              ? INCOME_LABEL[m.category as CommunityIncomeCategory]
                              : EXPENSE_LABEL[m.category as CommunityExpenseCategory]}
                            {m.activityId && titles.get(m.activityId) ? ` · ${titles.get(m.activityId)}` : ""}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
                            {m.kind === "expense" && m.paidBy && !m.reimbursed ? (
                              <Pill tone="warning">Devolver a {m.paidBy.split(" ")[0]}</Pill>
                            ) : null}
                            {m.kind === "expense" && !m.receipt ? <Pill tone="danger">Sin ticket</Pill> : null}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular",
                            m.kind === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-text-primary",
                          )}
                        >
                          {m.kind === "income" ? "+" : "−"}
                          {money(m.amountCents)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty
                  icon={Receipt}
                  title={course.length ? "Nada con este filtro" : "Aún no has apuntado nada"}
                  body={
                    course.length
                      ? "Prueba con otro filtro."
                      : "Apunta cada gasto al momento con la foto del ticket. Las entradas, las cuotas y los patrocinios de Franky ya se suman solos."
                  }
                  action={
                    course.length ? null : (
                      <Button variant="dark" onClick={() => setEditing({ mode: "new", kind: "expense" })}>
                        Apuntar gasto
                      </Button>
                    )
                  }
                />
              )}
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Cobrado con Franky" description="Se suma solo, sin apuntar nada.">
              <ul className="flex flex-col gap-2.5 text-sm">
                {auto.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <span className="text-text-secondary">{l.label}</span>
                    <span className="font-medium tabular">{money(l.cents, { round: true })}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-border-light pt-2.5">
                  <span className="text-text-secondary">Comisión de Franky</span>
                  <span className="font-medium tabular">−{money(ledger.frankyFeeCents, { round: true })}</span>
                </li>
              </ul>
            </Panel>
            <Tip title="Ticket al momento">
              Haz la foto del ticket al pagar y apúntalo aquí. Si lo pagas de tu bolsillo, marca quién lo adelantó y
              nadie se queda sin cobrar.
            </Tip>
          </div>
        </div>
      ) : view === "pedidos" ? (
        <MerchView />
      ) : (
        <AccountsView
          onPrint={printAccounts}
          onArchive={archiveAccounts}
          onCsv={exportCsv}
          onOpening={() => setOpening(true)}
        />
      )}

      <MovementDrawer editing={editing} onClose={() => setEditing(null)} />
      <OpeningDrawer open={opening} onClose={() => setOpening(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AccountsView({
  onPrint,
  onArchive,
  onCsv,
  onOpening,
}: {
  onPrint: () => void;
  onArchive: () => void;
  onCsv: () => void;
  onOpening: () => void;
}) {
  const { data, now } = usePro();
  const l = communityLedger(data, now);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Ingresos" flush>
          <LedgerTable lines={l.incomes} total={l.incomeCents} totalLabel="Total ingresos" />
        </Panel>
        <Panel title="Gastos" flush>
          {l.expenses.length ? (
            <LedgerTable lines={l.expenses} total={l.expenseCents} totalLabel="Total gastos" />
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Sin gastos apuntados este curso.</p>
          )}
        </Panel>
        {l.byActivity.length ? (
          <Panel title="Resultado por actividad" description="Entradas, ya sin comisión, menos lo gastado en cada una." flush>
            <div className="overflow-x-auto pro-scroll">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium sm:px-5">Actividad</th>
                    <th className="px-2 py-2 text-right font-medium">Ingresos</th>
                    <th className="px-2 py-2 text-right font-medium">Gastos</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {l.byActivity.map((a) => (
                    <tr key={a.id}>
                      <td className="max-w-[16rem] truncate px-4 py-2.5 font-medium sm:px-5">{a.title}</td>
                      <td className="px-2 py-2.5 text-right tabular">{money(a.incomeCents, { round: true })}</td>
                      <td className="px-2 py-2.5 text-right tabular">{money(a.expenseCents, { round: true })}</td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-semibold tabular sm:px-5",
                          a.resultCents < 0 ? "text-rose-700 dark:text-rose-300" : "text-text-primary",
                        )}
                      >
                        {money(a.resultCents, { round: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <section className="rounded-2xl bg-bg-dark p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Curso {courseLabel(now)}</p>
          <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{money(l.balanceCents)}</p>
          <p className="text-sm text-white/70">de saldo hoy</p>
          <ul className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4 text-sm">
            <li className="flex justify-between gap-3">
              <span className="text-white/70">Al empezar el curso</span>
              <span className="tabular">{money(l.openingCents)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-white/70">Ingresos</span>
              <span className="tabular">+{money(l.incomeCents)}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-white/70">Gastos</span>
              <span className="tabular">−{money(l.expenseCents)}</span>
            </li>
          </ul>
        </section>
        <div className="flex flex-col gap-2">
          <Button variant="dark" onClick={onPrint}>
            <Printer className="h-4 w-4" /> Imprimir para la asamblea
          </Button>
          <Button variant="outline" onClick={onArchive}>
            <ArchiveRestore className="h-4 w-4" /> Guardar en el archivo
          </Button>
          <Button variant="outline" onClick={onCsv}>
            <Download className="h-4 w-4" /> Descargar en Excel (CSV)
          </Button>
          <Button variant="ghost" onClick={onOpening}>
            <Landmark className="h-4 w-4" /> Cambiar el saldo inicial
          </Button>
        </div>
        <Tip title="Cuentas en cinco minutos">
          Con cada gasto y su ticket apuntado, las cuentas del curso salen solas. La asamblea las aprueba y la
          junta siguiente sabe de dónde sale cada euro.
        </Tip>
      </div>
    </div>
  );
}

function LedgerTable({
  lines,
  total,
  totalLabel,
}: {
  lines: { key: string; label: string; cents: number }[];
  total: number;
  totalLabel: string;
}) {
  return (
    <ul className="divide-y divide-border-light text-sm">
      {lines.map((x) => (
        <li key={x.key} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
          <span className="min-w-0 text-text-secondary">{x.label}</span>
          <span className="shrink-0 font-medium tabular">{money(x.cents)}</span>
        </li>
      ))}
      <li className="flex items-center justify-between gap-3 px-4 py-2.5 font-semibold sm:px-5">
        <span>{totalLabel}</span>
        <span className="tabular">{money(total)}</span>
      </li>
    </ul>
  );
}

/* ------------------------------------------------------------------ */

const EXPENSE_QUICK: CommunityExpenseCategory[] = [
  "comida",
  "material",
  "transporte",
  "imprenta",
  "derechos",
  "premios",
  "local",
  "entradas",
  "seguros",
  "banco",
  "otros_gastos",
];
const INCOME_QUICK: CommunityIncomeCategory[] = ["venta", "subvencion", "donacion", "patrocinio", "otros_ingresos"];

function MovementDrawer({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const ops = communityOps(data);
  const existing = editing?.mode === "edit" ? ops.movements.find((m) => m.id === editing.id) : undefined;
  const kind = editing?.mode === "new" ? editing.kind : existing?.kind ?? "expense";
  const activities = (data.activities as CommunityActivity[])
    .filter((a) => a.status !== "draft")
    .sort((a, b) => b.date.localeCompare(a.date));
  const people = data.board.map((b) => b.name);

  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [category, setCategory] = React.useState<string>("comida");
  const [activityId, setActivityId] = React.useState("");
  const [method, setMethod] = React.useState<CommunityPayMethod>("tarjeta");
  const [paidBy, setPaidBy] = React.useState("");
  const [receipt, setReceipt] = React.useState<CommunityMovement["receipt"]>();
  const [reading, setReading] = React.useState(false);

  React.useEffect(() => {
    if (!editing) return;
    if (existing) {
      setConcept(existing.concept);
      setAmount(String(existing.amountCents / 100).replace(".", ","));
      setDate(localDate(existing.date));
      setCategory(existing.category);
      setActivityId(existing.activityId ?? "");
      setMethod(existing.method ?? "tarjeta");
      setPaidBy(existing.paidBy ?? "");
      setReceipt(existing.receipt);
    } else {
      setConcept("");
      setAmount("");
      setDate(localDate(now));
      setCategory(kind === "income" ? "venta" : "comida");
      setActivityId("");
      setMethod(kind === "income" ? "efectivo" : "tarjeta");
      setPaidBy("");
      setReceipt(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const valid = concept.trim().length > 1 && cents > 0 && Boolean(date);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    const dataUrl = await receiptThumbnail(file);
    setReading(false);
    setReceipt({ name: file.name, dataUrl: dataUrl ?? undefined });
    if (!concept) setConcept(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const save = () => {
    const movement: CommunityMovement = {
      id: existing?.id ?? localId("mv"),
      kind,
      date: atLocal(date, 12 * 60),
      concept: concept.trim(),
      amountCents: cents,
      category: category as CommunityMovement["category"],
      activityId: activityId || undefined,
      method,
      receipt,
      paidBy: kind === "expense" && paidBy ? paidBy : undefined,
      reimbursed: kind === "expense" && paidBy ? existing?.reimbursed ?? false : undefined,
    };
    update(existing ? "community.movement.update" : "community.movement.add", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        movements: existing
          ? o.movements.map((m) => (m.id === movement.id ? movement : m))
          : [movement, ...o.movements],
      })),
    );
    toast.success(
      existing ? "Apunte actualizado" : kind === "income" ? "Ingreso apuntado" : "Gasto apuntado",
      movement.paidBy && !movement.reimbursed
        ? `Queda pendiente devolver ${money(cents)} a ${movement.paidBy.split(" ")[0]}.`
        : `${money(cents)}${movement.receipt ? " con su ticket" : ""}.`,
    );
    onClose();
  };

  const reimburse = () => {
    if (!existing) return;
    update("community.movement.reimburse", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        movements: o.movements.map((m) => (m.id === existing.id ? { ...m, reimbursed: true } : m)),
      })),
    );
    toast.success(`Devuelto a ${existing.paidBy?.split(" ")[0] ?? "quien lo pagó"}`, money(existing.amountCents));
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    update("community.movement.remove", (d) =>
      withCommunityOps(d, (o) => ({ ...o, movements: o.movements.filter((m) => m.id !== existing.id) })),
    );
    toast.success("Apunte borrado", existing.concept);
    onClose();
  };

  const categories = kind === "income"
    ? INCOME_QUICK.map((k) => ({ value: k as string, label: INCOME_LABEL[k] }))
    : EXPENSE_QUICK.map((k) => ({ value: k as string, label: EXPENSE_LABEL[k] }));

  return (
    <Drawer
      open={Boolean(editing)}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? existing.concept : kind === "income" ? "Apuntar ingreso" : "Apuntar gasto"}
      description={
        existing
          ? `${existing.kind === "income" ? "Ingreso" : "Gasto"} del ${shortDay(existing.date)}`
          : kind === "income"
            ? "Lo que entra fuera de Franky: ventas, subvenciones, donaciones."
            : "Con la foto del ticket, en diez segundos."
      }
      footer={
        <>
          {existing ? (
            <Button variant="ghost" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Borrar
            </Button>
          ) : null}
          {existing?.paidBy && !existing.reimbursed ? (
            <Button variant="outline" onClick={reimburse}>
              <HandCoins className="h-4 w-4" /> Ya se lo hemos devuelto
            </Button>
          ) : null}
          <Button variant="dark" onClick={save} disabled={!valid || reading}>
            {existing ? "Guardar" : "Apuntar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {kind === "expense" ? (
          <label className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-border p-4 hover:border-text-primary/25">
            {receipt?.dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receipt.dataUrl} alt="Ticket" className="h-20 w-16 shrink-0 rounded-lg border border-border object-cover" />
            ) : (
              <Camera className="h-6 w-6 shrink-0 text-text-muted" strokeWidth={1.75} />
            )}
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-semibold">
                {reading ? "Leyendo la foto..." : receipt ? "Ticket adjunto" : "Foto del ticket"}
              </span>
              <span className="block truncate text-xs text-text-muted">
                {receipt ? receipt.name : "Haz la foto con el móvil o elige un archivo."}
              </span>
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        ) : null}
        <FormField label="Concepto" htmlFor="mv-concept">
          <input
            id="mv-concept"
            className={inputClass}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder={kind === "income" ? "Venta de camisetas" : "Palomitas para el cinefórum"}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Importe" htmlFor="mv-amount">
            <div className="relative">
              <input
                id="mv-amount"
                inputMode="decimal"
                className={cn(inputClass, "pr-8")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
            </div>
          </FormField>
          <FormField label="Fecha" htmlFor="mv-date">
            <input id="mv-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Categoría" htmlFor="mv-cat">
          <select id="mv-cat" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Actividad" htmlFor="mv-activity" hint="Así sabes cuánto costó de verdad cada una.">
          <select id="mv-activity" className={inputClass} value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">De la asociación en general</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={kind === "income" ? "Cómo entró" : "Cómo se pagó"}>
          <ChoiceChips
            value={method}
            onChange={setMethod}
            options={(["tarjeta", "efectivo", "bizum", "transferencia"] as CommunityPayMethod[]).map((k) => ({
              value: k,
              label: PAY_METHOD_LABEL[k],
            }))}
          />
        </FormField>
        {kind === "expense" ? (
          <FormField label="¿Lo adelantó alguien de su bolsillo?" htmlFor="mv-paidby">
            <select id="mv-paidby" className={inputClass} value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              <option value="">No, salió de la cuenta de la asociación</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  Sí, {p}
                </option>
              ))}
              {paidBy && !people.includes(paidBy) ? <option value={paidBy}>Sí, {paidBy}</option> : null}
            </select>
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

function OpeningDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [value, setValue] = React.useState("");
  React.useEffect(() => {
    if (open) setValue(String(communityOps(data).openingBalanceCents / 100).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const cents = Math.round(Number(value.replace(",", ".")) * 100);
  const valid = Number.isFinite(cents);
  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Saldo al empezar el curso"
      description="Lo que dejó la junta anterior en la cuenta y en la caja."
      footer={
        <Button
          variant="dark"
          disabled={!valid}
          onClick={() => {
            update("community.opening", (d) => withCommunityOps(d, (o) => ({ ...o, openingBalanceCents: cents })));
            toast.success("Saldo inicial guardado", money(cents));
            onClose();
          }}
        >
          Guardar
        </Button>
      }
    >
      <FormField label="Saldo inicial" htmlFor="opening">
        <div className="relative">
          <input id="opening" inputMode="decimal" className={cn(inputClass, "pr-8")} value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
        </div>
      </FormField>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
        <Minus className="h-3 w-3" /> Si empezasteis en números rojos, pon el signo menos delante.
      </p>
    </Drawer>
  );
}
