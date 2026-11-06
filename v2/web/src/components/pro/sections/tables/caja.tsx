"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Coffee,
  CreditCard,
  Recycle,
  ScanLine,
  ShoppingBasket,
  Thermometer,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCashClosing } from "@/lib/pro/tables-types";
import {
  bonoSummary,
  cardDay,
  closingChecklist,
  closingTotals,
  splitTips,
  workedMinutes,
} from "@/lib/pro/tables-ops";
import {
  durationLabel,
  localDate,
  money,
  plural,
  shortDay,
  time,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { sectionHref } from "../../shell";
import {
  WhatsAppButton,
  eurosText,
  parseEuros,
  staffFirstName,
  useTablesOps,
} from "./ops-kit";
import { WeekReportPanel } from "./week-report";
import { closingSummaryMessage } from "@/lib/pro/tables-day";

export default function TablesCaja() {
  const { ops } = useTablesOps();
  if (!ops) return <RealDaySummary />;
  return <DemoClosing />;
}

/** Sin herramientas de cierre en el espacio: resumen de lo que sí hay. */
function RealDaySummary() {
  const { data, now } = usePro();
  const today = localDate(now);
  const payments = data.payments.filter((p) => localDate(p.at) === today);
  const by = (m: "card" | "cash" | "bizum") => payments.filter((p) => p.method === m).reduce((a, p) => a + p.amountCents, 0);
  const card = cardDay(data.validations, today);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Caja" title="Caja de hoy" description={`${plural(payments.length, "cobro registrado", "cobros registrados")} en Franky hoy.`} />
      <KpiRow>
        <Kpi icon={CreditCard} label="Tarjeta" value={money(by("card"))} />
        <Kpi icon={Wallet} label="Efectivo" value={money(by("cash"))} />
        <Kpi label="Bizum" value={money(by("bizum"))} />
        <Kpi icon={ScanLine} label="Franky Card" value={money(card.chargedCents)} hint={plural(card.count, "validación", "validaciones")} />
      </KpiRow>
      {!payments.length ? (
        <Panel>
          <Empty icon={Wallet} title="Sin cobros en Franky hoy" body="Los cobros de tu TPV siguen en tu TPV. Aquí ves los que pasan por Franky." />
        </Panel>
      ) : null}
    </div>
  );
}

function DemoClosing() {
  const { data, now, vertical, spaceId } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const [cash, setCash] = React.useState("");
  const [card, setCard] = React.useState("");
  const [bizum, setBizum] = React.useState("");
  const [float, setFloat] = React.useState("150,00");
  const [expected, setExpected] = React.useState("");
  const [tips, setTips] = React.useState("");
  const [covers, setCovers] = React.useState("");
  const [note, setNote] = React.useState("");
  if (!ops) return null;

  const closed = ops.closings.find((c) => c.date === today);
  const history = [...ops.closings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const cardToday = cardDay(data.validations, today);
  const bonos = bonoSummary(ops, today);
  const pendingList = closingChecklist(ops, today);
  const draft: ProCashClosing = {
    id: "draft",
    date: today,
    closedAt: now.toISOString(),
    cashCents: parseEuros(cash) ?? 0,
    cardCents: parseEuros(card) ?? 0,
    bizumCents: parseEuros(bizum) ?? 0,
    floatCents: parseEuros(float) ?? 0,
    expectedCashCents: parseEuros(expected),
    tipsCents: parseEuros(tips) ?? 0,
  };
  const totals = closingTotals(draft);
  const tipsSplit = splitTips(
    draft.tipsCents,
    data.staff.map((s) => ({ staffId: s.id, minutes: workedMinutes(data.shifts, s.id, [today], now) })),
  );
  const valid = parseEuros(cash) !== null && parseEuros(card) !== null;
  const tableEngine = vertical.id !== "cafe";

  const submit = async () => {
    const closing: ProCashClosing = {
      ...draft,
      id: localId("cl"),
      staffId: data.staff[0]?.id,
      covers: tableEngine && covers ? Number(covers) : undefined,
      nextDayNote: note.trim() || undefined,
    };
    if (!(await save("closing.save", (o) => ({ ...o, closings: [...o.closings.filter((c) => c.date !== today), closing] })))) return;
    toast.success("Día cerrado", `${money(closingTotals(closing).totalCents)} en caja${closing.nextDayNote ? ". La nota sale mañana en Hoy." : "."}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={vertical.id === "restaurant" ? "Caja" : "Cierre"}
        title="Cierre del día"
        description={
          closed
            ? `Cerrado a las ${time(closed.closedAt)} con ${money(closingTotals(closed).totalCents)}.`
            : "Cuenta la caja, reparte las propinas y deja una nota para mañana."
        }
      />

      <KpiRow>
        <Kpi icon={ScanLine} label="Franky Card hoy" value={money(cardToday.chargedCents, { round: true })} hint={plural(cardToday.count, "validación", "validaciones")} />
        {vertical.id === "cafe" ? (
          <Kpi icon={Coffee} label="Bonos" value={bonos.usedToday} hint={`cafés de bono servidos, ${bonos.soldToday} vendidos`} />
        ) : (
          <Kpi label="Ticket medio" value={history[0]?.covers ? money(Math.round(closingTotals(history[0]).totalCents / history[0].covers), { round: true }) : "Sin datos"} hint="del último cierre" />
        )}
        <Kpi icon={Wallet} label="Media 7 días" value={money(avg(history.slice(0, 7)), { round: true })} hint="por día" />
        <Kpi label="Descuadres" value={history.filter((h) => (closingTotals(h).diffCents ?? 0) !== 0).length} hint="en los últimos 14 cierres" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          {closed ? (
            <Panel>
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-6 w-6" strokeWidth={2.5} />
                </span>
                <p className="font-heading text-xl font-bold">Hoy ya está cerrado</p>
                <p className="text-sm text-text-muted">
                  {money(closingTotals(closed).totalCents)} en total · propinas {money(closed.tipsCents)}
                  {closingTotals(closed).diffCents ? ` · descuadre ${money(closingTotals(closed).diffCents ?? 0)}` : ""}
                </p>
                {closed.nextDayNote ? <p className="mt-2 max-w-md rounded-2xl bg-bg-secondary px-4 py-2 text-sm">{closed.nextDayNote}</p> : null}
                <WhatsAppButton
                  variant="dark"
                  size="default"
                  className="mt-3"
                  phone={ops.ownerPhone}
                  share={!ops.ownerPhone}
                  label="Mandar resumen"
                  message={closingSummaryMessage({
                    spaceName: data.space.name,
                    closing: closed,
                    closedBy: staffFirstName(data, closed.staffId),
                    card: cardToday,
                    bonosUsed: vertical.id === "cafe" ? bonos.usedToday : undefined,
                    pending: pendingList,
                  })}
                />
                <p className="text-xs text-text-muted">
                  {ops.ownerPhone ? "Se abre WhatsApp con el texto del día para el dueño." : "Elige el chat al que mandar el texto del día."}
                </p>
              </div>
            </Panel>
          ) : (
            <Panel title="Cuenta la caja">
              <div className="grid gap-4 sm:grid-cols-2">
                <Money id="cj-cash" label="Efectivo en el cajón" value={cash} onChange={setCash} hint="Todo, fondo incluido" />
                <Money id="cj-float" label="Fondo que dejas para mañana" value={float} onChange={setFloat} />
                <Money id="cj-card" label="Tarjeta (datáfono)" value={card} onChange={setCard} />
                <Money id="cj-bizum" label="Bizum" value={bizum} onChange={setBizum} />
                <Money id="cj-exp" label="Efectivo según el TPV" value={expected} onChange={setExpected} hint="Opcional: para ver el descuadre" />
                <Money id="cj-tips" label="Bote de propinas" value={tips} onChange={setTips} />
                {tableEngine ? (
                  <FormField label="Cubiertos del día" htmlFor="cj-covers">
                    <input id="cj-covers" inputMode="numeric" value={covers} onChange={(e) => setCovers(e.target.value.replace(/\D/g, ""))} className={inputClass} />
                  </FormField>
                ) : null}
              </div>

              <div className="mt-5 divide-y divide-border-light rounded-2xl border border-border px-4 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Ventas en efectivo</span>
                  <span className="tabular">{money(totals.cashSalesCents)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-text-muted">Tarjeta y Bizum</span>
                  <span className="tabular">{money(draft.cardCents + draft.bizumCents)}</span>
                </div>
                {totals.diffCents !== null ? (
                  <div className="flex justify-between py-2">
                    <span className="text-text-muted">Descuadre</span>
                    <span className={cn("font-semibold tabular", totals.diffCents === 0 ? "text-emerald-600" : "text-rose-600")}>
                      {totals.diffCents === 0 ? "Cuadra" : money(totals.diffCents)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between py-2">
                  <span className="font-semibold">Total del día</span>
                  <span className="font-heading text-2xl font-extrabold tabular">{money(totals.totalCents)}</span>
                </div>
              </div>

              <FormField label="Nota para mañana" htmlFor="cj-note" className="mt-5" hint="Sale arriba en Hoy al abrir.">
                <textarea id="cj-note" value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Falta leche de avena, el grifo 2 pierde..." />
              </FormField>
              <Button variant="dark" className="mt-5 h-12 w-full text-base" disabled={!valid} onClick={submit}>
                Cerrar el día
              </Button>
            </Panel>
          )}

          <Panel title="Últimos cierres" flush>
            {history.length ? (
              <div className="overflow-x-auto pro-scroll">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-border-light text-left text-xs text-text-muted">
                      <th className="px-4 py-2 font-semibold sm:px-5">Día</th>
                      <th className="px-2 py-2 text-right font-semibold">Total</th>
                      <th className="px-2 py-2 text-right font-semibold">Tarjeta</th>
                      <th className="px-2 py-2 text-right font-semibold">Propinas</th>
                      <th className="px-4 py-2 text-right font-semibold sm:px-5">Descuadre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {history.map((c) => {
                      const t = closingTotals(c);
                      return (
                        <tr key={c.id}>
                          <td className="px-4 py-2.5 sm:px-5">
                            <span className="block font-semibold">{shortDay(`${c.date}T12:00:00Z`)}</span>
                            <span className="text-xs text-text-muted">{staffFirstName(data, c.staffId)}</span>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular">{money(t.totalCents, { round: true })}</td>
                          <td className="px-2 py-2.5 text-right tabular text-text-muted">{money(c.cardCents, { round: true })}</td>
                          <td className="px-2 py-2.5 text-right tabular text-text-muted">{money(c.tipsCents)}</td>
                          <td className="px-4 py-2.5 text-right sm:px-5">
                            {t.diffCents ? <Pill tone="danger">{money(t.diffCents)}</Pill> : <span className="text-xs text-text-muted">Cuadra</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Aún no has cerrado ningún día.</p>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Antes de irte" flush>
            <RowList>
              <PendingRow icon={Thermometer} done={pendingList.haccpPending === 0} label={pendingList.haccpPending ? `APPCC del cierre: faltan ${pendingList.haccpPending}` : "APPCC del cierre hecho"} href={sectionHref(spaceId, "appcc")} />
              <PendingRow icon={Recycle} done={pendingList.wasteLogged} label={pendingList.wasteLogged ? "Sobras apuntadas" : "Apunta las sobras del día"} href={sectionHref(spaceId, "appcc")} />
              <PendingRow icon={ShoppingBasket} done={pendingList.shoppingLines === 0} label={pendingList.shoppingLines ? `${plural(pendingList.shoppingLines, "cosa", "cosas")} en la lista de la compra` : "Lista de la compra enviada"} href={sectionHref(spaceId, "compras")} />
            </RowList>
          </Panel>

          <WeekReportPanel />

          <Panel title="Reparto de propinas" description="Según las horas fichadas hoy.">
            {draft.tipsCents > 0 || closed ? (
              <ul className="space-y-2 text-sm">
                {splitTips(
                  closed ? closed.tipsCents : draft.tipsCents,
                  data.staff.map((s) => ({ staffId: s.id, minutes: workedMinutes(data.shifts, s.id, [today], now) })),
                )
                  .filter((t) => t.minutes > 0)
                  .map((t) => {
                    const person = data.staff.find((s) => s.id === t.staffId);
                    return (
                      <li key={t.staffId} className="flex items-center gap-2">
                        <Avatar name={person?.name ?? "?"} tone={person?.tone} size="xs" />
                        <span className="min-w-0 flex-1 truncate">{person?.name.split(" ")[0]}</span>
                        <span className="text-xs text-text-muted tabular">{durationLabel(t.minutes)}</span>
                        <span className="w-16 text-right font-semibold tabular">{money(t.cents)}</span>
                      </li>
                    );
                  })}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">Escribe el bote y verás cuánto le toca a cada uno.</p>
            )}
            {tipsSplit.every((t) => t.minutes === 0) && draft.tipsCents > 0 ? (
              <p className="mt-2 text-xs text-text-muted">Nadie ha fichado hoy: el reparto sale cuando haya fichajes.</p>
            ) : null}
          </Panel>

          <Tip title="Cuadra en un minuto">
            Cuenta el cajón entero y di cuánto fondo dejas. Si apuntas lo que marca tu TPV en efectivo, Franky te dice si falta o sobra.
          </Tip>
          {vertical.id === "cafe" && bonos.activeBonos ? (
            <p className="text-xs text-text-muted">
              Tienes {plural(bonos.pendingUses, "café de bono", "cafés de bono")} ya cobrados por servir ({money(bonos.pendingValueCents, { round: true })}).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Money({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))}
          onBlur={() => {
            const cents = parseEuros(value);
            if (cents !== null) onChange(eurosText(cents));
          }}
          placeholder="0,00"
          className={cn(inputClass, "pr-8 text-right tabular")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
      </div>
    </FormField>
  );
}

function PendingRow({ icon: Icon, label, done, href }: { icon: typeof Check; label: string; done: boolean; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-bg-secondary sm:px-5">
      {done ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.2} /> : <Icon className="h-4 w-4 text-amber-600" strokeWidth={1.9} />}
      <span className={cn("min-w-0 flex-1", done && "text-text-muted")}>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-text-muted" />
    </Link>
  );
}

function avg(list: ProCashClosing[]): number {
  if (!list.length) return 0;
  return Math.round(list.reduce((a, c) => a + closingTotals(c).totalCents, 0) / list.length);
}
