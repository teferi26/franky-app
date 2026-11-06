"use client";

import * as React from "react";
import { BadgeCheck, Check, Copy, Download, Eye, Megaphone, MessageCircle, Plus, UserPlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCommissionRule, ProPromoter } from "@/lib/pro/types";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { addDays, localDate, money, pct, relative, shortDay, time } from "@/lib/pro/format";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { promoterCapState, promoterCutoffAt, promoterMonthRows, promoterReceipt } from "@/lib/pro/night-ops";
import {
  commissionFor,
  pendingSettlement,
  promoterCode,
  promoterLink,
  promoterNights,
  promoterTotals,
  ruleLabel,
  shortUni,
  sortedEvents,
  upcomingEvents,
} from "@/lib/pro/night";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Detail, Drawer, Empty, FormField, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, RowList, Segmented, Tip, inputClass } from "../../kit";
import { downloadCsv, whatsAppShare } from "./ops-ui";
import { PromoterPanelDrawer, TargetsPanel } from "./rrpp-panel";
import { TARGET_CHOICES } from "@/lib/pro/night-promoters";

export default function NightRrpp() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [eventId, setEventId] = React.useState<string>("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [viewing, setViewing] = React.useState<string | null>(null);

  const events = sortedEvents(data)
    .filter((e) => e.status !== "draft" && data.guests.some((g) => g.eventId === e.id && g.promoterId))
    .reverse();
  const filterId = eventId === "all" ? undefined : eventId;
  const rows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, filterId), pending: pendingSettlement(data, p, now) }))
    .sort((a, b) => b.t.scanned - a.t.scanned || b.t.sold - a.t.sold);
  const active = data.promoters.filter((p) => p.active).length;
  const totals = rows.reduce(
    (acc, r) => ({
      sold: acc.sold + r.t.sold,
      list: acc.list + r.t.list,
      scanned: acc.scanned + r.t.scanned,
      commission: acc.commission + r.t.commissionCents,
      byList: acc.byList + r.t.byListCents,
    }),
    { sold: 0, list: 0, scanned: 0, commission: 0, byList: 0 },
  );
  const settlement = rows.filter((r) => r.pending.cents > 0);
  const pendingTotal = settlement.reduce((a, r) => a + r.pending.cents, 0);
  // CSV para el gestor: este mes y el anterior (la liquidación suele cruzar el cambio de mes).
  const thisMonth = localDate(now).slice(0, 7);
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);
  const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
  const exportMonth = (m: string) => {
    const rows = promoterMonthRows(data, m);
    if (rows.length <= 1) {
      toast.info(`Sin noches de RRPP en ${monthName(m)}`, "Cuando entre alguien con su enlace aparecerá en el CSV.");
      return;
    }
    downloadCsv(`rrpp-${data.space.slug}-${m}.csv`, rows);
  };

  const pay = (ids: string[]) => {
    const at = new Date().toISOString();
    update("rrpp.settle", (d) => ({
      ...d,
      promoters: d.promoters.map((p) => {
        if (!ids.includes(p.id)) return p;
        const s = pendingSettlement(d, p, now);
        if (!s.cents) return p;
        const np = p;
        const next: ProPromoter = {
          ...np,
          settledEventIds: [...(np.settledEventIds ?? []), ...s.nights.map((n) => n.eventId)],
          payouts: [{ at, amountCents: s.cents, scanned: s.scanned }, ...(np.payouts ?? [])],
        };
        return next;
      }),
    }));
    const total = ids.reduce((a, id) => a + (rows.find((r) => r.p.id === id)?.pending.cents ?? 0), 0);
    toast.success(ids.length > 1 ? "Liquidación pagada" : "Marcado como pagado", `${money(total)} por entradas escaneadas en puerta.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Equipo de calle"
        title="RRPP"
        description={`${active} RRPP activos. ${totals.scanned.toLocaleString("es-ES")} personas han entrado de verdad con sus enlaces${filterId ? " esa noche" : ""} y ${money(pendingTotal, { round: true })} están pendientes de pagar.`}
        actions={
          <Button variant="dark" onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" /> Alta de RRPP
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Megaphone} label="Vendidas y en lista" value={(totals.sold + totals.list).toLocaleString("es-ES")} hint={`${totals.sold} entradas · ${totals.list} en lista`} />
        <Kpi label="Entraron de verdad" value={totals.scanned.toLocaleString("es-ES")} hint={`${pct(totals.scanned, totals.sold + totals.list)} % de conversión`} emphasis />
        <Kpi label="Comisión generada" value={money(totals.commission, { round: true })} hint="Por entrada escaneada" />
        <Kpi icon={Wallet} label="Por pagar" value={money(pendingTotal, { round: true })} hint={`${settlement.length} RRPP en la liquidación`} />
      </KpiRow>

      <Tip title="Paga por quien entra, no por quien apuntan">
        Con listas de WhatsApp pagarías por cada nombre apuntado: {money(totals.byList, { round: true })}. Pagando por entrada escaneada en puerta son{" "}
        {money(totals.commission, { round: true })}. {totals.byList > totals.commission ? `Te ahorras ${money(totals.byList - totals.commission, { round: true })} y nadie discute.` : ""}
      </Tip>

      <TargetsPanel onOpen={setOpen} />

      <Segmented
        value={eventId}
        onChange={setEventId}
        label="Filtrar por evento"
        options={[{ value: "all", label: "Todas las noches" }, ...events.map((e) => ({ value: e.id, label: `${e.name.split(" ")[0]} ${shortDay(e.doorsOpen)}` }))]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="Ranking" description="Ordenado por entradas reales en puerta." flush>
          {rows.length ? (
            <>
              <div className="hidden overflow-x-auto md:block pro-scroll">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border-light text-left text-xs text-text-muted">
                      <th className="px-5 py-2.5 font-medium">RRPP</th>
                      <th className="px-3 py-2.5 text-right font-medium">Vendidas</th>
                      <th className="px-3 py-2.5 text-right font-medium">Lista</th>
                      <th className="px-3 py-2.5 text-right font-medium">En puerta</th>
                      <th className="px-3 py-2.5 text-right font-medium">Conversión</th>
                      <th className="px-5 py-2.5 text-right font-medium">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, t }, i) => (
                      <tr key={p.id} className={cn("border-b border-border-light transition-colors last:border-0 hover:bg-bg-secondary", !p.active && "opacity-60")}>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3">
                            <span className="w-4 text-center text-xs font-bold text-text-muted tabular">{i + 1}</span>
                            <Avatar name={p.name} size="sm" tone={i === 0 ? "violet" : "slate"} />
                            <span className="min-w-0">
                              <button type="button" onClick={() => setOpen(p.id)} className="flex items-center gap-1 font-semibold hover:underline focus-visible:underline focus-visible:outline-none">
                                {p.name}
                                {p.university ? <BadgeCheck className="h-3.5 w-3.5 text-violet" aria-label="Estudiante verificado" /> : null}
                              </button>
                              <span className="block text-xs text-text-muted">
                                {shortUni(p.university)} · {p.code}
                                {!p.active ? " · de baja" : ""}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular">{t.sold}</td>
                        <td className="px-3 py-3 text-right tabular">{t.list}</td>
                        <td className="px-3 py-3 text-right font-semibold tabular">{t.scanned}</td>
                        <td className="px-3 py-3 text-right tabular">
                          <span className={cn(t.conversion >= 60 ? "text-emerald-600 dark:text-emerald-400" : t.conversion < 40 ? "text-amber-700 dark:text-amber-400" : "")}>{t.conversion} %</span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular">{money(t.commissionCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <RowList className="md:hidden">
                {rows.map(({ p, t }, i) => (
                  <button key={p.id} type="button" onClick={() => setOpen(p.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary", !p.active && "opacity-60")}>
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-text-muted tabular">{i + 1}</span>
                    <Avatar name={p.name} size="sm" tone={i === 0 ? "violet" : "slate"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {t.scanned} dentro de {t.sold + t.list} · {t.conversion} %
                      </span>
                    </span>
                    <span className="shrink-0 font-heading font-bold tabular">{money(t.commissionCents, { round: true })}</span>
                  </button>
                ))}
              </RowList>
            </>
          ) : (
            <Empty
              icon={Megaphone}
              title="Aún no tienes RRPP"
              body="Da de alta a tus relaciones públicas: cada uno tendrá su enlace y su código, y su comisión se calcula sola en la puerta."
              action={
                <Button variant="dark" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> Alta de RRPP
                </Button>
              }
            />
          )}
        </Panel>

        <Panel
          title="Liquidación del lunes"
          description="Lo que debes a cada RRPP por las noches ya cerradas."
          action={
            settlement.length ? (
              <Button variant="dark" size="sm" onClick={() => pay(settlement.map((r) => r.p.id))}>
                Pagar todo
              </Button>
            ) : null
          }
          flush
        >
          {settlement.length ? (
            <>
              <RowList>
                {settlement.map(({ p, pending }) => {
                  // El recibo va al RRPP si tiene teléfono; si no, se elige el chat al abrir WhatsApp.
                  const receipt = promoterReceipt(data, p, pending.nights);
                  const receiptHref = customerWhatsApp(p.phone, receipt) ?? whatsAppShare(receipt);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {pending.scanned} escaneadas en {pending.nights.length} {pending.nights.length === 1 ? "noche" : "noches"} · {ruleLabel(p.spec, p.rule)}
                        </span>
                      </span>
                      <span className="shrink-0 font-heading font-bold tabular">{money(pending.cents)}</span>
                      <span className="flex shrink-0 gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <a href={receiptHref} target="_blank" rel="noopener noreferrer" aria-label={`Enviar el recibo a ${p.name} por WhatsApp`}>
                            <MessageCircle className="h-3.5 w-3.5" /> Recibo
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => pay([p.id])} aria-label={`Marcar pagado a ${p.name}`}>
                          <Check className="h-3.5 w-3.5" /> Pagado
                        </Button>
                      </span>
                    </div>
                  );
                })}
              </RowList>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm sm:px-5">
                <span className="font-semibold">Total a pagar</span>
                <span className="font-heading text-lg font-extrabold tabular">{money(pendingTotal)}</span>
              </div>
            </>
          ) : (
            <Empty icon={Wallet} title="Todo pagado" body="Cuando cierre la próxima noche tendrás aquí lo que debes a cada RRPP, calculado con lo escaneado en puerta." className="py-8" />
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-border-light px-4 py-3 sm:px-5">
            <span className="mr-auto text-xs text-text-muted">Para tu gestoría, una fila por RRPP y noche</span>
            <Button variant="ghost" size="sm" onClick={() => exportMonth(thisMonth)}>
              <Download className="h-3.5 w-3.5" /> CSV de {monthName(thisMonth)}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => exportMonth(lastMonth)}>
              <Download className="h-3.5 w-3.5" /> {monthName(lastMonth)}
            </Button>
          </div>
        </Panel>
      </div>

      <PromoterDrawer
        promoterId={open}
        onClose={() => setOpen(null)}
        onView={(id) => {
          setOpen(null);
          setViewing(id);
        }}
      />
      <PromoterPanelDrawer promoterId={viewing} onClose={() => setViewing(null)} />
      <NewPromoterDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PromoterDrawer({
  promoterId,
  onClose,
  onView,
}: {
  promoterId: string | null;
  onClose: () => void;
  onView: (promoterId: string) => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const p = promoterId ? data.promoters.find((x) => x.id === promoterId) : undefined;
  if (!p) return <Drawer open={false} onOpenChange={() => onClose()} title="RRPP">{null}</Drawer>;
  const np = p;
  const link = promoterLink(p.code, data.space.slug);
  const nights = promoterNights(data, p);
  const totals = promoterTotals(data, p);
  const settled = new Set(np.settledEventIds ?? []);
  const shareText = `Entradas y lista para ${data.space.name} con mi enlace: https://${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      toast.success("Enlace copiado", link);
    } catch {
      toast.info("Copia el enlace", link);
    }
  };

  return (
    <Drawer
      open={Boolean(p)}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={p.name}
      description={`${p.university ?? "Sin universidad"} · RRPP desde ${np.since ? relative(np.since, now.getTime()) : "hace poco"}`}
    >
      <div className="flex flex-col gap-6">
        <section className="rounded-2xl border border-border p-4">
          <p className="eyebrow">Su enlace</p>
          <p className="mt-2 break-all font-heading text-lg font-bold">{link}</p>
          <p className="text-sm text-text-muted">
            Código <span className="font-semibold text-text-primary">{p.code.toUpperCase()}</span>. Todo lo que se venda o apunte con él queda a su nombre.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copy}>
              <Copy className="h-3.5 w-3.5" /> Copiar enlace
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Enviar por WhatsApp
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onView(p.id)}>
              <Eye className="h-3.5 w-3.5" /> Ver su panel
            </Button>
          </div>
        </section>

        <PromoterCap promoter={p} />

        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Box label="Vendidas" value={totals.sold} />
          <Box label="En lista" value={totals.list} />
          <Box label="Entraron" value={totals.scanned} />
          <Box label="Conversión" value={`${totals.conversion} %`} />
        </section>

        <section>
          <Detail label="Comisión">{ruleLabel(np.spec, p.rule)}</Detail>
          <Detail label="Teléfono">{np.phone ?? "Sin teléfono"}</Detail>
          <div className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-text-muted">Activo</span>
            <Switch
              checked={p.active}
              aria-label="RRPP activo"
              onCheckedChange={(v) => {
                update("rrpp.active", (d) => ({ ...d, promoters: d.promoters.map((x) => (x.id === p.id ? { ...x, active: v } : x)) }));
                toast.success(v ? "RRPP activado" : "RRPP dado de baja", v ? "Su enlace vuelve a vender." : "Su enlace deja de vender entradas.");
              }}
            />
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">Noche a noche</p>
          {nights.length ? (
            <div className="overflow-x-auto rounded-2xl border border-border pro-scroll">
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b border-border-light text-left text-xs text-text-muted">
                    <th className="px-3 py-2 font-medium">Noche</th>
                    <th className="px-3 py-2 text-right font-medium">Vendidas</th>
                    <th className="px-3 py-2 text-right font-medium">Lista</th>
                    <th className="px-3 py-2 text-right font-medium">Entraron</th>
                    <th className="px-3 py-2 text-right font-medium">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {nights.map((n) => {
                    const ev = data.events.find((e) => e.id === n.eventId);
                    return (
                      <tr key={n.eventId} className="border-b border-border-light last:border-0">
                        <td className="px-3 py-2">
                          <span className="block font-medium">{ev?.name}</span>
                          <span className="text-xs text-text-muted">
                            {ev ? shortDay(ev.doorsOpen) : ""}
                            {settled.has(n.eventId) ? " · pagada" : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular">{n.sold}</td>
                        <td className="px-3 py-2 text-right tabular">{n.list}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular">{n.scanned}</td>
                        <td className="px-3 py-2 text-right tabular">{money(n.commissionCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={Megaphone} title="Sin ventas todavía" body="Pásale su enlace: en cuanto venda la primera entrada aparecerá aquí." className="py-6" />
          )}
        </section>

        {np.payouts?.length ? (
          <section>
            <p className="eyebrow mb-2">Pagos</p>
            <RowList className="rounded-2xl border border-border">
              {np.payouts.map((pay, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span>
                    {shortDay(pay.at)} · {pay.scanned} entradas
                  </span>
                  <Pill tone="success">{money(pay.amountCents)}</Pill>
                </div>
              ))}
            </RowList>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Cupo por noche y hora de corte propia                               */
/* ------------------------------------------------------------------ */

const CAP_OPTIONS = ["none", "20", "40", "60", "100"] as const;
const CUTOFF_OPTIONS = [
  { value: "event", label: "La del evento" },
  { value: "30", label: "00:30" },
  { value: "60", label: "01:00" },
  { value: "90", label: "01:30" },
  { value: "120", label: "02:00" },
];

/**
 * Límite de apuntados por noche, objetivo y hora de corte del RRPP. El dueño
 * ve al momento quién llega al cupo; la página pública del enlace aún no lo aplica.
 */
function PromoterCap({ promoter }: { promoter: ProPromoter }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const next = upcomingEvents(data, now)[0];
  const state = next ? promoterCapState(data, promoter, next.id) : null;
  const cutoffAt = next ? promoterCutoffAt(promoter, next) : null;
  const max = promoter.cap?.maxPerNight ?? null;
  const cutoff = promoter.cap?.cutoffMinute;
  // Un cupo que no está entre las opciones (80, 50...) se enseña como una opción más.
  const capValue: string = max === null ? "none" : String(max);
  const cutoffValue = typeof cutoff === "number" ? String(cutoff) : "event";

  const target = promoter.cap?.targetPerNight ?? null;
  const targetValue = target === null ? "none" : String(target);

  const save = (
    patch: { maxPerNight?: number | null; cutoffMinute?: number | null; targetPerNight?: number | null },
    message: string,
  ) => {
    void update("rrpp.cap", (d) => ({
      ...d,
      promoters: d.promoters.map((x) =>
        x.id === promoter.id ? { ...x, cap: { maxPerNight: x.cap?.maxPerNight ?? null, ...x.cap, ...patch } } : x,
      ),
    }));
    toast.success(message);
  };

  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="eyebrow">Cupo por noche</p>
      {next && state ? (
        <div className="mt-2">
          <p className="text-sm">
            <span className="font-semibold">{next.name}</span>
            <span className="text-text-muted"> · {shortDay(next.doorsOpen)}: </span>
            {state.max === null
              ? `${state.signedUp} apuntados, sin límite.`
              : state.full
                ? `cupo lleno, ${state.signedUp} de ${state.max}.`
                : `${state.signedUp} de ${state.max} apuntados, le quedan ${state.left}.`}
          </p>
          {state.max !== null ? <Meter value={state.signedUp} max={state.max} tone={state.full ? "warning" : "violet"} className="mt-2" /> : null}
          {cutoffAt ? <p className="mt-1.5 text-xs text-text-muted">Su lista entra gratis hasta las {time(cutoffAt)}.</p> : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-text-muted">Cuando tengas una noche a la venta verás aquí cuántos lleva apuntados.</p>
      )}
      <div className="mt-4 flex flex-col gap-3">
        <FormField label="Máximo de apuntados por noche" hint="Así nadie infla la lista para cobrar más.">
          <ChoiceChips
            value={capValue}
            onChange={(v) =>
              save({ maxPerNight: v === "none" ? null : Number(v) }, v === "none" ? "Sin cupo para este RRPP" : `Cupo de ${v} por noche`)
            }
            options={[
              ...CAP_OPTIONS.map((o) => ({ value: o as string, label: o === "none" ? "Sin cupo" : o })),
              ...(max !== null && !CAP_OPTIONS.some((o) => o === String(max)) ? [{ value: String(max), label: String(max) }] : []),
            ]}
          />
        </FormField>
        <FormField label="Objetivo por noche" hint="Personas que esperas que traiga. Si va flojo, lo verás arriba con un mensaje para animarle.">
          <ChoiceChips
            value={targetValue}
            onChange={(v) =>
              save(
                { targetPerNight: v === "none" ? null : Number(v) },
                v === "none" ? "Sin objetivo para este RRPP" : `Objetivo de ${v} personas por noche`,
              )
            }
            options={[
              ...TARGET_CHOICES.map((o) => ({ value: o === null ? "none" : String(o), label: o === null ? "Sin objetivo" : String(o) })),
              ...(target !== null && !TARGET_CHOICES.some((o) => o === target) ? [{ value: String(target), label: String(target) }] : []),
            ]}
          />
        </FormField>
        <FormField label="Su lista entra gratis hasta">
          <ChoiceChips
            value={cutoffValue}
            onChange={(v) =>
              save(
                { cutoffMinute: v === "event" ? null : Number(v) },
                v === "event" ? "Usa la hora de corte del evento" : "Hora de corte propia guardada",
              )
            }
            options={CUTOFF_OPTIONS}
          />
        </FormField>
      </div>
    </section>
  );
}

function Box({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border px-3 py-2.5">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-0.5 font-heading text-xl font-extrabold tabular">{value}</p>
    </div>
  );
}

type RuleKind = "per_scan" | "tiers";
type UniChoice = "ua" | "umh" | "ceu" | "other";

function NewPromoterDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [uni, setUni] = React.useState<UniChoice>("ua");
  const [code, setCode] = React.useState("");
  const [codeTouched, setCodeTouched] = React.useState(false);
  const [phone, setPhone] = React.useState("");
  const [kind, setKind] = React.useState<RuleKind>("per_scan");
  const [perScan, setPerScan] = React.useState("1");
  const [upTo, setUpTo] = React.useState("25");
  const [low, setLow] = React.useState("0,50");
  const [high, setHigh] = React.useState("1,50");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setUni("ua");
    setCode("");
    setCodeTouched(false);
    setPhone("");
    setKind("per_scan");
  }, [open]);

  React.useEffect(() => {
    if (!codeTouched) setCode(name.trim() ? promoterCode(name) : "");
  }, [name, codeTouched]);

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const spec: ProCommissionRule =
    kind === "per_scan" ? { kind: "per_scan", cents: cents(perScan) } : { kind: "tiers", upTo: Math.max(1, Number(upTo) || 25), lowCents: cents(low), highCents: cents(high) };
  const taken = data.promoters.some((p) => p.code.toLowerCase() === code.trim().toLowerCase());
  const valid = name.trim().length > 2 && code.trim().length >= 3 && !taken;
  const university = uni === "ua" ? UNIVERSITIES[0] : uni === "umh" ? UNIVERSITIES[1] : uni === "ceu" ? UNIVERSITIES[2] : undefined;

  const save = () => {
    const promoter: ProPromoter = {
      id: localId("rp"),
      name: name.trim(),
      university,
      code: code.trim().toLowerCase(),
      listSize: 0,
      sold: 0,
      checkedIn: 0,
      commissionCents: 0,
      rule: ruleLabel(spec),
      active: true,
      spec,
      phone: phone.trim() || undefined,
      since: new Date().toISOString(),
      settledEventIds: [],
      payouts: [],
    };
    update("rrpp.create", (d) => ({ ...d, promoters: [...d.promoters, promoter] }));
    toast.success("RRPP dado de alta", `Su enlace: ${promoterLink(promoter.code, data.space.slug)}`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Alta de RRPP"
      description="Con su enlace propio y la comisión calculada en puerta."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Dar de alta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="rp-name">
          <input id="rp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" className={inputClass} />
        </FormField>
        <FormField label="Universidad">
          <ChoiceChips
            value={uni}
            onChange={setUni}
            options={[
              { value: "ua", label: "UA" },
              { value: "umh", label: "UMH" },
              { value: "ceu", label: "CEU" },
              { value: "other", label: "Otra" },
            ]}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Código" htmlFor="rp-code" hint={taken ? "Ya lo usa otro RRPP" : code ? promoterLink(code, data.space.slug) : undefined}>
            <input
              id="rp-code"
              value={code}
              aria-invalid={taken || undefined}
              onChange={(e) => {
                setCodeTouched(true);
                setCode(e.target.value.replace(/\s+/g, "").toLowerCase());
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label="Teléfono" htmlFor="rp-phone">
            <input id="rp-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" className={inputClass} />
          </FormField>
        </div>
        <FormField label="Regla de comisión" hint="Siempre por entrada escaneada en puerta, nunca por nombre apuntado.">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={[
              { value: "per_scan", label: "Fija por entrada", hint: "Lo mismo por cada persona" },
              { value: "tiers", label: "Por tramos", hint: "Premia a quien más mueve" },
            ]}
          />
        </FormField>
        {kind === "per_scan" ? (
          <FormField label="Euros por entrada escaneada" htmlFor="rp-per">
            <input id="rp-per" inputMode="decimal" value={perScan} onChange={(e) => setPerScan(e.target.value)} className={inputClass} />
          </FormField>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Hasta" htmlFor="rp-upto">
              <input id="rp-upto" inputMode="numeric" value={upTo} onChange={(e) => setUpTo(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="€ primeras" htmlFor="rp-low">
              <input id="rp-low" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="€ a partir" htmlFor="rp-high">
              <input id="rp-high" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} className={inputClass} />
            </FormField>
          </div>
        )}
        <p className="rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">{ruleLabel(spec)}.</span> Si trae 40 personas que entran, cobra {money(commissionFor(spec, 40))}.
        </p>
      </div>
    </Drawer>
  );
}
