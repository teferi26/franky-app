"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Download, FileText, MessageCircle, Send, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProChargeMethod, ProMemberCharge } from "@/lib/pro/classes-types";
import { capitalize, dayLabel, localDate, money, plural } from "@/lib/pro/format";
import {
  CHARGE_METHOD_LABEL,
  chargeMessage,
  chargeSummary,
  chargesCsv,
  chargesFor,
  extrasOf,
  forecastNextMonth,
  isLate,
  markChargePaid,
  markChargeReminded,
  monthLabel,
  monthOf,
  shiftMonth,
} from "@/lib/pro/classes-care";
import { proCsvCell } from "@/lib/pro/csv";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Detail, Drawer, Empty, FormField, IconButton, Panel, Pill, Segmented } from "../../kit";
import { downloadCsv, Figure } from "./ui";
import { CourseForecastPanel } from "./study";

/**
 * Cobros del mes en una pantalla: lo cobrado por forma de pago, lo pendiente y
 * lo devuelto; recordatorios amables uno tras otro; recibo al instante con su
 * número y exportación para la gestoría. Franky no cobra ni factura por ti:
 * aquí apuntas cómo te han pagado y sale el recibo.
 */

type Filter = "owed" | "paid" | "all";

const MANUAL_METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer", "sepa"];

export function ChargesView() {
  const { data, now, vertical } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [period, setPeriod] = React.useState(monthOf(today));
  const [filter, setFilter] = React.useState<Filter>("owed");
  const [paying, setPaying] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<string | null>(null);
  const [chasing, setChasing] = React.useState(false);

  const summary = chargeSummary(data, period, now);
  const all = chargesFor(data, period);
  const owed = all.filter((c) => c.status !== "paid");
  const list = (filter === "owed" ? owed : filter === "paid" ? all.filter((c) => c.status === "paid") : all).sort(
    (a, b) => statusRank(a, today) - statusRank(b, today) || a.dueOn.localeCompare(b.dueOn),
  );
  const toChase = owed.filter((c) => c.status === "returned" || isLate(c, today));
  const forecast = forecastNextMonth(data, now);
  const isCurrent = period === monthOf(today);
  const hasAny = extrasOf(data).charges.length > 0;

  const exportMonth = () => {
    downloadCsv(`cuotas-${data.space.slug}-${period}.csv`, chargesCsv(all, proCsvCell));
    toast.success("Cuotas exportadas", "Con separador español, listas para tu gestoría.");
  };

  if (!hasAny) {
    return (
      <Panel>
        <Empty
          icon={Wallet}
          title="Aún no hay cuotas este mes"
          body={`Cuando des de alta a tus ${vertical.id === "academy" ? "alumnos" : "socios"} con su plan, aquí verás cada mes lo cobrado, lo pendiente y lo devuelto.`}
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <IconButton label="Mes anterior" icon={ChevronLeft} onClick={() => setPeriod(shiftMonth(period, -1))} />
          <IconButton label="Mes siguiente" icon={ChevronRight} onClick={() => setPeriod(shiftMonth(period, 1))} disabled={isCurrent} />
          <span className="ml-1.5 font-heading text-[1.05rem] font-bold">{capitalize(monthLabel(period))}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportMonth} disabled={!all.length}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
          {toChase.length ? (
            <Button variant="dark" size="sm" onClick={() => setChasing(true)}>
              <Send className="h-3.5 w-3.5" /> Avisar a {plural(toChase.length, "pendiente", "pendientes")}
            </Button>
          ) : null}
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Figure label="Cobrado" value={money(summary.paidCents, { round: true })} hint={plural(summary.counts.paid, "cuota", "cuotas")} tone="success" />
          <Figure
            label="Por cobrar"
            value={money(summary.pendingCents - summary.lateCents, { round: true })}
            hint={isCurrent ? "vencen este mes" : "sin vencer"}
          />
          <Figure
            label="Vencido sin pagar"
            value={money(summary.lateCents, { round: true })}
            hint={plural(summary.counts.late, "persona", "personas")}
            tone={summary.lateCents ? "warning" : undefined}
          />
          <Figure
            label="Devuelto por el banco"
            value={money(summary.returnedCents, { round: true })}
            hint={plural(summary.counts.returned, "recibo", "recibos")}
            tone={summary.returnedCents ? "danger" : undefined}
          />
        </div>
        {summary.byMethod.length ? (
          <div className="mt-5 border-t border-border-light pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Cobrado por forma de pago</p>
            <MethodBar items={summary.byMethod} total={summary.paidCents} />
          </div>
        ) : null}
      </section>

      <Segmented
        label="Filtro"
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "owed", label: "Por cobrar", count: owed.length },
          { value: "paid", label: "Cobradas", count: summary.counts.paid },
          { value: "all", label: "Todas", count: all.length },
        ]}
      />

      <Panel flush>
        {list.length ? (
          <ul className="divide-y divide-border-light">
            {list.map((c) => (
              <ChargeRow key={c.id} charge={c} onPay={() => setPaying(c.id)} onReceipt={() => setReceipt(c.id)} />
            ))}
          </ul>
        ) : (
          <Empty
            icon={Wallet}
            title={filter === "owed" ? "Todo cobrado" : "Nada por aquí"}
            body={filter === "owed" ? "Nadie te debe nada este mes." : "Cambia de filtro o de mes."}
          />
        )}
      </Panel>

      {isCurrent ? (
        <Panel title={`Previsión de ${monthLabel(forecast.period)}`} description="Estimación con lo que ya sabes hoy. Cada línea dice de dónde sale.">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{money(forecast.totalCents, { round: true })}</p>
            <Pill>Estimación</Pill>
          </div>
          <ul className="mt-3 divide-y divide-border-light">
            {forecast.lines.map((l) => (
              <li key={l.label} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{l.label}</span>
                  <span className="block truncate text-xs text-text-muted">{l.hint}</span>
                </span>
                <span className="shrink-0 font-semibold tabular">{money(l.cents, { round: true })}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {isCurrent && vertical.id === "academy" ? <CourseForecastPanel /> : null}

      <PayDrawer chargeId={paying} onClose={() => setPaying(null)} onReceipt={(id) => setReceipt(id)} />
      <ReceiptDrawer chargeId={receipt} onClose={() => setReceipt(null)} />
      <ChaseDrawer open={chasing} charges={toChase} onClose={() => setChasing(false)} />
    </div>
  );
}

function statusRank(c: ProMemberCharge, today: string) {
  if (c.status === "returned") return 0;
  if (isLate(c, today)) return 1;
  if (c.status === "pending") return 2;
  return 3;
}

function MethodBar({ items, total }: { items: { method: ProChargeMethod; label: string; cents: number; count: number }[]; total: number }) {
  const colors: Record<ProChargeMethod, string> = {
    sepa: "bg-violet",
    card: "bg-sky-500",
    bizum: "bg-teal-500",
    cash: "bg-amber-500",
    transfer: "bg-slate-500",
  };
  return (
    <div className="mt-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        {items.map((i) => (
          <div key={i.method} className={colors[i.method]} style={{ width: `${total ? (i.cents / total) * 100 : 0}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => (
          <li key={i.method} className="flex min-w-0 items-center gap-2 text-sm">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colors[i.method])} />
            <span className="min-w-0">
              <span className="block truncate text-text-secondary">{i.label}</span>
              <span className="block text-xs font-semibold tabular">{money(i.cents, { round: true })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChargeRow({ charge: c, onPay, onReceipt }: { charge: ProMemberCharge; onPay: () => void; onReceipt: () => void }) {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const member = data.members.find((m) => m.id === c.memberId);
  const late = isLate(c, today);
  const sender = data.space.owner.firstName || data.space.name;
  const link = customerWhatsApp(member?.phone, chargeMessage(c, sender, data.space.name, today, money(c.amountCents)));
  const status =
    c.status === "paid" ? (
      <Pill tone="success">{c.method ? CHARGE_METHOD_LABEL[c.method] : "Cobrada"}</Pill>
    ) : c.status === "returned" ? (
      <Pill tone="danger">Devuelto</Pill>
    ) : late ? (
      <Pill tone="warning">Vencida</Pill>
    ) : (
      <Pill>Vence el {Number(c.dueOn.slice(8))}</Pill>
    );

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
      <Avatar name={c.memberName} size="sm" tone={c.status === "returned" ? "rose" : late ? "amber" : "slate"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{c.memberName}</span>
        <span className="block truncate text-xs text-text-muted">
          {c.concept}
          {c.remindedAt ? ` · avisado ${dayLabel(c.remindedAt, { weekday: false })}` : ""}
          {c.receiptNo ? ` · ${c.receiptNo}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular">{money(c.amountCents)}</span>
        {status}
      </span>
      <span className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
        {c.status === "paid" ? (
          <Button size="sm" variant="ghost" onClick={onReceipt}>
            <FileText className="h-3.5 w-3.5" /> Recibo
          </Button>
        ) : (
          <>
            {link ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={link} target="_blank" rel="noreferrer" onClick={() => void update("charge.remind", (d) => markChargeReminded(d, c.id, now))}>
                  <MessageCircle className="h-3.5 w-3.5" /> Recordar
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={onPay}>
              Cobrar
            </Button>
          </>
        )}
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Cobrar una cuota                                                    */
/* ------------------------------------------------------------------ */

function PayDrawer({ chargeId, onClose, onReceipt }: { chargeId: string | null; onClose: () => void; onReceipt: (id: string) => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const [method, setMethod] = React.useState<ProChargeMethod>("bizum");
  const charge = extrasOf(data).charges.find((c) => c.id === chargeId);

  React.useEffect(() => {
    // Un recibo devuelto casi nunca se vuelve a pagar domiciliado.
    setMethod(charge?.status === "returned" ? "bizum" : "card");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeId]);

  if (!charge) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const pay = () => {
    void update("charge.pay", (d) => markChargePaid(d, charge.id, method, now));
    toast.success("Cobrada", `${money(charge.amountCents)} de ${charge.memberName.split(" ")[0]} por ${CHARGE_METHOD_LABEL[method].toLowerCase()}. El recibo ya está listo.`);
    onClose();
    onReceipt(charge.id);
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Cobrar a ${charge.memberName}`}
      description={`${charge.concept}, vence el ${dayLabel(`${charge.dueOn}T12:00:00Z`, { weekday: false })}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={pay}>
            Cobrar {money(charge.amountCents)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="font-heading text-4xl font-extrabold tracking-[-0.02em] tabular">{money(charge.amountCents)}</p>
        <FormField label="¿Cómo te ha pagado?">
          <ChoiceChips value={method} onChange={setMethod} options={MANUAL_METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
        </FormField>
        {charge.status === "returned" ? (
          <p className="rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">
            El banco devolvió este recibo. Si te paga por Bizum o en mano, apúntalo aquí y queda al día.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Recibo al instante                                                  */
/* ------------------------------------------------------------------ */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

export function ReceiptDrawer({ chargeId, onClose }: { chargeId: string | null; onClose: () => void }) {
  const { data, vertical } = usePro();
  const toast = useToast();
  const [exempt, setExempt] = React.useState(vertical.id === "academy");
  const charge = extrasOf(data).charges.find((c) => c.id === chargeId);
  if (!charge || charge.status !== "paid") return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const member = data.members.find((m) => m.id === charge.memberId);
  const paidOn = charge.paidAt ? dayLabel(charge.paidAt, { weekday: false }) : "";
  const period = capitalize(monthLabel(charge.period));
  const method = charge.method ? CHARGE_METHOD_LABEL[charge.method] : "";
  const exemptLine = "Operación exenta de IVA (art. 20.Uno.9.º de la Ley 37/1992).";

  const print = () => {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) {
      toast.info("No se pudo abrir la ventana", "Permite las ventanas emergentes para imprimir el recibo.");
      return;
    }
    const e = escapeHtml;
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibo ${e(charge.receiptNo ?? "")}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#141318;margin:48px;max-width:560px}h1{font-size:22px;margin:0 0 4px}p{margin:2px 0;font-size:14px}
table{width:100%;border-collapse:collapse;margin-top:28px;font-size:14px}td{padding:10px 0;border-bottom:1px solid #e7e5ee}td:last-child{text-align:right}
.total{font-size:22px;font-weight:800}.muted{color:#6b6878;font-size:12px;margin-top:24px}</style></head><body>
<h1>${e(data.space.name)}</h1><p>${e(data.space.address)}, ${e(data.space.city)}</p>
<p style="margin-top:24px"><strong>Recibo ${e(charge.receiptNo ?? "")}</strong></p><p>Fecha: ${e(paidOn)}</p><p>Recibí de: ${e(charge.memberName)}</p>
<table><tr><td>${e(charge.concept)}<br><span style="color:#6b6878">Periodo: ${e(period)}</span></td><td>${e(money(charge.amountCents))}</td></tr>
<tr><td>Forma de pago</td><td>${e(method)}</td></tr><tr><td class="total">Total</td><td class="total">${e(money(charge.amountCents))}</td></tr></table>
${exempt ? `<p class="muted">${e(exemptLine)}</p>` : ""}
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  const text = `Recibo ${charge.receiptNo} de ${data.space.name}\n${charge.concept} (${period})\nImporte: ${money(charge.amountCents)}\nPagado el ${paidOn} por ${method.toLowerCase()}.`;
  const link = customerWhatsApp(member?.phone, text);

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Recibo ${charge.receiptNo ?? ""}`}
      description="Numeración correlativa del año. Imprímelo, guárdalo en PDF o mándalo por WhatsApp."
      footer={
        <>
          {link ? (
            <Button variant="outline" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          ) : null}
          <Button variant="dark" onClick={print}>
            <FileText className="h-4 w-4" /> Imprimir o PDF
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-border p-4">
          <p className="font-heading text-lg font-bold">{data.space.name}</p>
          <p className="text-xs text-text-muted">
            {data.space.address}, {data.space.city}
          </p>
          <div className="mt-3 divide-y divide-border-light">
            <Detail label="Recibí de">{charge.memberName}</Detail>
            <Detail label="Concepto">{charge.concept}</Detail>
            <Detail label="Periodo">{period}</Detail>
            <Detail label="Forma de pago">{method}</Detail>
            <Detail label="Fecha">{paidOn}</Detail>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-semibold">Total</span>
            <span className="font-heading text-2xl font-extrabold tabular">{money(charge.amountCents)}</span>
          </div>
        </div>
        {vertical.id === "academy" ? (
          <label className="flex min-h-10 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={exempt} onChange={(e) => setExempt(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
            Añadir la mención de enseñanza exenta de IVA al imprimir
          </label>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Avisar a todos los pendientes, uno tras otro                        */
/* ------------------------------------------------------------------ */

function ChaseDrawer({ open, charges, onClose }: { open: boolean; charges: ProMemberCharge[]; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [index, setIndex] = React.useState(0);
  const [queue, setQueue] = React.useState<ProMemberCharge[]>([]);

  React.useEffect(() => {
    if (!open) return;
    // La cola se fija al abrir: avisar no la reordena mientras se recorre.
    setQueue(charges);
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = queue[index];
  const member = current ? data.members.find((m) => m.id === current.memberId) : undefined;
  const sender = data.space.owner.firstName || data.space.name;
  const link = current ? customerWhatsApp(member?.phone, chargeMessage(current, sender, data.space.name, today, money(current.amountCents))) : undefined;
  const done = index >= queue.length;

  const next = () => {
    if (current) void update("charge.remind", (d) => markChargeReminded(d, current.id, now));
    if (index + 1 >= queue.length) toast.success("Avisos preparados", `${plural(queue.length, "persona", "personas")} con su recordatorio.`);
    setIndex((i) => i + 1);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Avisar a los pendientes"
      description={done ? "Ya has pasado por todos." : `${index + 1} de ${queue.length}. Abre WhatsApp, envía y pasa al siguiente.`}
      footer={
        done ? (
          <Button variant="dark" onClick={onClose}>Terminar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setIndex((i) => i + 1)}>Saltar</Button>
            {link ? (
              <Button variant="dark" asChild>
                <a href={link} target="_blank" rel="noreferrer" onClick={next}>
                  <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                </a>
              </Button>
            ) : (
              <Button variant="dark" onClick={next}>Hecho, siguiente</Button>
            )}
          </>
        )
      }
    >
      {current && !done ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={current.memberName} tone={current.status === "returned" ? "rose" : "amber"} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{current.memberName}</p>
              <p className="text-sm text-text-muted">
                {money(current.amountCents)} · {current.status === "returned" ? "recibo devuelto" : "cuota vencida"}
              </p>
            </div>
          </div>
          <p className="whitespace-pre-line rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary">
            {chargeMessage(current, sender, data.space.name, today, money(current.amountCents))}
          </p>
          {!member?.phone ? <p className="text-xs text-text-muted">No tiene móvil guardado: díselo en persona y márcalo como hecho.</p> : null}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
            <div className="h-full rounded-full bg-violet transition-[width] duration-500" style={{ width: `${(index / Math.max(1, queue.length)) * 100}%` }} />
          </div>
        </div>
      ) : (
        <Empty icon={Send} title="Todos avisados" body="Cuando te paguen, márcalo en Cobrar y sale su recibo." />
      )}
    </Drawer>
  );
}
