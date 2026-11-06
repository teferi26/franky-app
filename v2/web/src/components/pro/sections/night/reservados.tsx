"use client";

import * as React from "react";
import { BadgeCheck, Cake, Check, History, Inbox, Minus, Plus, Receipt, Sofa, Timer, UserX, Users, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProGroupRequest, ProMenuItem, ProZone } from "@/lib/pro/types";
import { dayLabel, money, relative, shortDay, time } from "@/lib/pro/format";
import { ZONE_STATUS, countdown, eventPhase, focusEvent, nightOf, zoneTotals } from "@/lib/pro/night";
import { bookerHistory, recordNoShow } from "@/lib/pro/night-guests";
import { nightTitle } from "@/lib/pro/night-ops";
import { addToTab, closeZoneBill, freeZone, holdChoices, removeFromTab, zoneBillFor, zoneTab } from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, Drawer, Empty, FormField, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, RowList, Tip, inputClass, textareaClass } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { BirthdaysPanel, defaultSigner, useNightOps, useReleaseExpiredHolds } from "./ops-ui";

type Preset = { zoneId?: string; name?: string; people?: number; birthday?: boolean; note?: string; requestId?: string } | null;

export default function NightReservados() {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const [openZone, setOpenZone] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<Preset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  useReleaseExpiredHolds();

  const ev = focusEvent(data, now);
  const zones = data.zones.filter((z) => !ev || !z.eventId || z.eventId === ev.id);
  const zt = zoneTotals(zones);
  const requests = data.groupRequests.filter((g) => g.status === "new" || g.status === "quoted").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const freeZones = zones.filter((z) => z.status === "free");
  const club = vertical.id === "nightclub";
  const half = Math.ceil(zones.length / 2);

  const decline = (g: ProGroupRequest) => {
    update("group.decline", (d) => ({ ...d, groupRequests: d.groupRequests.map((x) => (x.id === g.id ? { ...x, status: "declined" } : x)) }));
    toast.success("Petición rechazada", `Avisamos a ${g.organizer.split(" ")[0]} con un mensaje amable.`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={ev ? `${ev.name} · ${shortDay(ev.doorsOpen)}` : "Reservados"}
        title="Reservados"
        description={`${zt.taken} de ${zones.length} zonas ocupadas, ${money(zt.minimumCents, { round: true })} de consumo mínimo asegurado${requests.length ? ` y ${requests.length} ${requests.length === 1 ? "petición" : "peticiones"} de estudiantes por responder` : ""}.`}
        actions={
          <Button variant="dark" onClick={() => setPreset({ zoneId: freeZones[0]?.id })} disabled={!zones.length}>
            <Plus className="h-4 w-4" /> Nuevo reservado
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Sofa} label="Ocupados" value={`${zt.taken}/${zones.length}`} hint={zt.held ? `${zt.held} pendiente de señal` : "Todo confirmado"} />
        <Kpi label="Consumo mínimo" value={money(zt.minimumCents, { round: true })} hint="Asegurado esta noche" emphasis />
        <Kpi label="Señales cobradas" value={money(zt.depositCents, { round: true })} hint="Se descuentan de la cuenta" />
        <Kpi icon={Users} label="Personas" value={zt.people} hint={`${zt.arrived} reservados ya dentro`} />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel
          title="Plano de la sala"
          description="Toca una zona para reservarla o ver quién viene."
          action={
            freeZones.length ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setOffer({
                    what: club ? "Reservado con botella" : "Zona reservada para tu grupo",
                    date: ev?.date,
                    from: 23 * 60,
                    to: 23 * 60 + 59,
                    priceCents: freeZones[0].minimumSpendCents,
                    slots: freeZones.length,
                  })
                }
              >
                <Zap className="h-3.5 w-3.5" /> Ofrecer libres
              </Button>
            ) : null
          }
        >
          {zones.length ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {(Object.keys(ZONE_STATUS) as ProZone["status"][]).map((s) => (
                  <Pill key={s} tone={ZONE_STATUS[s].tone}>
                    {ZONE_STATUS[s].label} · {zones.filter((z) => z.status === s).length}
                  </Pill>
                ))}
              </div>
              {/* Móvil: rejilla simple */}
              <div className="grid grid-cols-2 gap-2.5 md:hidden">
                {zones.map((z) => (
                  <ZoneCard key={z.id} zone={z} onClick={() => setOpenZone(z.id)} />
                ))}
              </div>
              {/* Escritorio: zonas a los lados de la pista */}
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3 md:grid">
                <div className="flex flex-col gap-3">
                  {zones.slice(0, half).map((z) => (
                    <ZoneCard key={z.id} zone={z} onClick={() => setOpenZone(z.id)} />
                  ))}
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex h-12 items-center justify-center rounded-2xl bg-text-primary text-xs font-bold uppercase tracking-[0.14em] text-bg-primary">
                    {club ? "Cabina DJ" : "Barra"}
                  </div>
                  <div className="bg-dots flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border text-sm font-semibold text-text-muted">
                    {club ? "Pista" : "Sala"}
                  </div>
                  <div className="flex h-10 items-center justify-center rounded-2xl bg-bg-secondary text-xs font-semibold text-text-muted">Entrada</div>
                </div>
                <div className="flex flex-col gap-3">
                  {zones.slice(half).map((z) => (
                    <ZoneCard key={z.id} zone={z} onClick={() => setOpenZone(z.id)} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <Empty
              icon={Sofa}
              title="Aún no has definido zonas"
              body="Crea tus reservados con capacidad, consumo mínimo y señal. Los estudiantes podrán pedirlos para cumpleaños y fiestas de clase."
            />
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Peticiones de estudiantes" description="Cumpleaños, despedidas y fiestas de clase que piden reservado en Franky." flush>
            {requests.length ? (
              <RowList>
                {requests.map((g) => (
                  <div key={g.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          {/cumple/i.test(g.kind) ? <Cake className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} /> : null}
                          <span className="truncate">{g.kind}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" />
                          <span className="truncate">
                            {g.organizer} · {g.people} personas · {shortDay(g.date)}
                          </span>
                        </p>
                      </div>
                      {g.status === "quoted" ? <Pill tone="info">Presupuestada</Pill> : <Pill tone="violet">{relative(g.createdAt, now.getTime())}</Pill>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-text-secondary">{g.message}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      Presupuesto {money(g.budgetPerPersonCents)} por persona, unos {money(g.budgetPerPersonCents * g.people, { round: true })}
                      {g.quoteCents ? ` · les ofreciste ${money(g.quoteCents, { round: true })}` : ""}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="dark"
                        size="sm"
                        onClick={() =>
                          setPreset({
                            requestId: g.id,
                            name: g.organizer,
                            people: g.people,
                            birthday: /cumple/i.test(g.kind),
                            note: `${g.kind}. ${g.message}`,
                            zoneId: freeZones.find((z) => z.capacity >= g.people)?.id ?? freeZones[0]?.id,
                          })
                        }
                        disabled={!freeZones.length}
                      >
                        <Check className="h-3.5 w-3.5" /> Aceptar y asignar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => decline(g)}>
                        <X className="h-3.5 w-3.5" /> Rechazar
                      </Button>
                    </div>
                  </div>
                ))}
              </RowList>
            ) : (
              <Empty icon={Inbox} title="Sin peticiones ahora" body="Cuando un estudiante pida reservado para su cumpleaños o su clase, aparecerá aquí para aceptarlo con un toque." className="py-8" />
            )}
          </Panel>
          <BirthdaysPanel limit={4} />
          <Tip title="Siempre con señal">
            Un reservado apartado sin señal es una mesa que puede quedarse vacía. Pide una señal por Bizum y descuéntala de la cuenta: si no vienen, la noche no te sale gratis.
          </Tip>
        </div>
      </div>

      <ZoneDrawer zoneId={openZone} onClose={() => setOpenZone(null)} onBook={(zoneId) => setPreset({ zoneId })} />
      <BookDrawer preset={preset} zones={zones} eventId={ev?.id} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </div>
  );
}

const ZONE_STYLE: Record<ProZone["status"], string> = {
  free: "border-dashed border-border bg-bg-primary hover:border-text-primary/30",
  held: "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/30",
  booked: "border-violet/30 bg-violet-50",
  arrived: "border-emerald-300 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/30",
};

function ZoneCard({ zone, onClick }: { zone: ProZone; onClick: () => void }) {
  const { now } = usePro();
  const { ops } = useNightOps();
  const z = zone;
  const t = zoneTab(zone);
  const bill = zoneBillFor(ops, zone);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[104px] flex-col rounded-2xl border p-3 text-left transition-[transform,border-color] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40",
        ZONE_STYLE[zone.status],
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-heading text-[0.95rem] font-bold">{zone.name}</span>
        {z.birthday && zone.status !== "free" ? <Cake className="h-4 w-4 shrink-0 text-violet" aria-label="Cumpleaños" strokeWidth={1.9} /> : null}
      </span>
      {zone.status === "free" ? (
        <span className="mt-1 text-xs text-text-muted">Hasta {zone.capacity} personas</span>
      ) : (
        <span className="mt-1 truncate text-sm font-medium">{zone.bookedBy}</span>
      )}
      {zone.status === "held" && zone.holdUntil ? (
        <span className="mt-0.5 text-[0.72rem] font-medium text-amber-800 dark:text-amber-300">
          Se libera{" "}
          {new Date(zone.holdUntil).getTime() - now.getTime() < 12 * 3600000 ? `a las ${time(zone.holdUntil)}` : shortDay(zone.holdUntil)}
        </span>
      ) : null}
      {zone.status === "arrived" && !bill ? (
        <span className="mt-1.5">
          <Meter value={t.consumedCents} max={Math.max(1, t.minimumCents)} tone={t.reached ? "success" : "violet"} />
          <span className="mt-1 block text-[0.72rem] text-text-secondary tabular">
            {money(t.consumedCents, { round: true })} de {money(t.minimumCents, { round: true })}
          </span>
        </span>
      ) : null}
      {bill ? <span className="mt-1 text-[0.72rem] font-medium text-emerald-700 dark:text-emerald-300">Cuenta cerrada</span> : null}
      <span className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs">
        <span className="font-semibold tabular">Mín. {money(zone.minimumSpendCents, { round: true })}</span>
        {zone.status === "free" ? (
          <span className="text-text-muted">Libre</span>
        ) : (
          <span className="text-text-secondary tabular">
            {zone.people ?? 0}/{zone.capacity}
          </span>
        )}
      </span>
    </button>
  );
}

/** Productos para apuntar en un reservado: primero lo que se pide para compartir. */
function tabProducts(menu: ProMenuItem[]): ProMenuItem[] {
  const share = (m: ProMenuItem) => /botella|compartir|reservado|cubo|ronda/i.test(`${m.section} ${m.name}`);
  return menu.filter((m) => m.available).sort((a, b) => Number(share(b)) - Number(share(a)));
}

function ZoneDrawer({ zoneId, onClose, onBook }: { zoneId: string | null; onClose: () => void; onBook: (zoneId: string) => void }) {
  const { data, now, update } = usePro();
  const { ops } = useNightOps();
  const toast = useToast();
  const [more, setMore] = React.useState(false);
  const zone = zoneId ? data.zones.find((z) => z.id === zoneId) : undefined;
  React.useEffect(() => setMore(false), [zoneId]);
  if (!zone) return <Drawer open={false} onOpenChange={() => onClose()} title="Zona">{null}</Drawer>;
  const z = zone;
  const t = zoneTab(zone);
  const bill = zoneBillFor(ops, zone);
  const products = tabProducts(data.menu);
  const shown = more ? products : products.slice(0, 6);

  const setStatus = (status: ProZone["status"], message: string, clear = false) => {
    update("zone.status", (d) => ({
      ...d,
      zones: d.zones.map((x) => {
        if (x.id !== zone.id) return x;
        if (!clear) return { ...x, status, holdUntil: status === "held" ? x.holdUntil : undefined };
        return freeZone(x);
      }),
    }));
    toast.success(message);
    if (clear) onClose();
  };

  const add = (item: ProMenuItem) => {
    const at = new Date().toISOString();
    update("zone.tab_add", (d) => ({
      ...d,
      zones: d.zones.map((x) =>
        x.id === zone.id
          ? addToTab(x, { id: localId("tl"), itemId: item.id, name: item.name, priceCents: item.priceCents, qty: 1, at, by: defaultSigner(d) })
          : x,
      ),
    }));
    const after = t.consumedCents + item.priceCents;
    toast.success(
      `${item.name} en ${zone.name}`,
      after >= t.minimumCents
        ? `Llevan ${money(after)}: mínimo alcanzado.`
        : `Llevan ${money(after)}, faltan ${money(t.minimumCents - after)} para el mínimo.`,
    );
  };

  const minus = (lineId: string) =>
    update("zone.tab_remove", (d) => ({ ...d, zones: d.zones.map((x) => (x.id === zone.id ? removeFromTab(x, lineId) : x)) }));

  // Solo se puede marcar un plantón cuando la noche ya ha empezado.
  const zoneEvent = zone.eventId ? data.events.find((e) => e.id === zone.eventId) : undefined;
  const started = zoneEvent ? ["live", "past"].includes(eventPhase(zoneEvent, now)) : false;
  const noShow = () => {
    const kept = zone.depositCents;
    update("zone.no_show", (d) => recordNoShow(d, zone.id, new Date().toISOString(), localId("ns")));
    toast.success(
      `${zone.name} vuelve a estar libre`,
      kept ? `${zone.bookedBy} no se presentó. La señal de ${money(kept)} se queda y la próxima vez te lo recordamos.` : `${zone.bookedBy} no se presentó. La próxima vez te recordamos pedir señal.`,
    );
    onClose();
  };

  const closeBill = () => {
    update("zone.bill", (d) => closeZoneBill(d, zone.id, defaultSigner(d), new Date().toISOString(), localId("bill")));
    toast.success(
      `Cuenta de ${zone.name} cerrada`,
      t.depositCents
        ? `Cobra ${money(t.dueCents)} en tu TPV: ya se ha descontado la señal de ${money(t.depositCents)}.`
        : `Cobra ${money(t.dueCents)} en tu TPV.`,
    );
  };

  const footer =
    zone.status === "free" ? (
      <Button
        variant="dark"
        onClick={() => {
          onClose();
          onBook(zone.id);
        }}
      >
        Reservar esta zona
      </Button>
    ) : (
      <>
        <Button variant="ghost" onClick={() => setStatus("free", `${zone.name} liberado`, true)}>
          Liberar
        </Button>
        {zone.status === "held" ? (
          <Button variant="dark" onClick={() => setStatus("booked", "Señal cobrada", false)}>
            Señal cobrada
          </Button>
        ) : null}
        {zone.status === "booked" && started ? (
          <Button variant="outline" onClick={noShow}>
            <UserX className="h-4 w-4" /> No han venido
          </Button>
        ) : null}
        {zone.status === "booked" ? (
          <Button variant="dark" onClick={() => setStatus("arrived", `${zone.bookedBy?.split(" ")[0] ?? "El grupo"} ha llegado`)}>
            Han llegado
          </Button>
        ) : null}
        {zone.status === "arrived" && !bill ? (
          <Button variant="dark" onClick={closeBill}>
            <Receipt className="h-4 w-4" /> Cerrar cuenta · {money(t.dueCents)}
          </Button>
        ) : null}
      </>
    );

  return (
    <Drawer
      open={Boolean(zone)}
      onOpenChange={(v) => !v && onClose()}
      wide={zone.status === "arrived"}
      title={zone.name}
      description={`Hasta ${zone.capacity} personas · mínimo ${money(zone.minimumSpendCents)}`}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={ZONE_STATUS[zone.status].tone}>{ZONE_STATUS[zone.status].label}</Pill>
          {z.birthday ? (
            <Pill tone="violet">
              <Cake className="h-3 w-3" /> Cumpleaños
            </Pill>
          ) : null}
          {zone.status === "held" && zone.holdUntil ? (
            <Pill tone="warning">
              <Timer className="h-3 w-3" /> Se libera en {countdown(now.getTime(), zone.holdUntil)}
            </Pill>
          ) : null}
        </div>

        {zone.status === "arrived" ? (
          bill ? (
            <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700/60 dark:bg-emerald-950/30">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Cuenta cerrada a las {time(bill.closedAt)}</p>
              <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-100/80">
                Consumieron {money(bill.consumedCents)} con un mínimo de {money(bill.minimumCents)}. Señal descontada{" "}
                {money(bill.depositCents)}, cobrados en el TPV {money(bill.dueCents)}.
              </p>
            </section>
          ) : (
            <section>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-text-muted">Llevan consumido</p>
                  <p className="font-heading text-4xl font-extrabold leading-none tracking-[-0.03em] tabular">{money(t.consumedCents)}</p>
                </div>
                <p className={cn("text-right text-sm font-semibold", t.reached ? "text-emerald-700 dark:text-emerald-300" : "text-text-secondary")}>
                  {t.reached ? "Mínimo alcanzado" : `Faltan ${money(t.missingCents)}`}
                  <span className="block text-xs font-normal text-text-muted">de un mínimo de {money(t.minimumCents)}</span>
                </p>
              </div>
              <Meter value={t.consumedCents} max={Math.max(1, t.minimumCents)} className="mt-3 h-2.5" tone={t.reached ? "success" : "violet"} />
              {t.lines.length ? (
                <ul className="mt-4 divide-y divide-border-light rounded-2xl border border-border">
                  {t.lines.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-8 shrink-0 font-semibold tabular">{l.qty}x</span>
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      <span className="shrink-0 text-xs text-text-muted">{time(l.at)}</span>
                      <span className="w-16 shrink-0 text-right tabular">{money(l.priceCents * l.qty)}</span>
                      <button
                        type="button"
                        aria-label={`Quitar una de ${l.name}`}
                        onClick={() => minus(l.id)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-text-muted">Aún no han pedido nada. Toca lo que sirvas y se suma al momento.</p>
              )}
              {products.length ? (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold">Apuntar</p>
                  <div className="grid grid-cols-2 gap-2">
                    {shown.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => add(m)}
                        className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:border-violet hover:bg-violet-50"
                      >
                        <span className="min-w-0 truncate font-medium">{m.name}</span>
                        <span className="shrink-0 font-heading font-bold tabular">{money(m.priceCents)}</span>
                      </button>
                    ))}
                  </div>
                  {products.length > 6 ? (
                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setMore((v) => !v)}>
                      {more ? "Ver menos" : `Ver toda la carta (${products.length})`}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-text-muted">Sube tu carta para apuntar el consumo con un toque.</p>
              )}
              {t.depositCents ? (
                <p className="mt-4 rounded-xl bg-bg-secondary px-3 py-2.5 text-sm">
                  Al cerrar se cobra el mayor entre lo consumido y el mínimo, menos la señal de {money(t.depositCents)}: ahora serían{" "}
                  <span className="font-semibold">{money(t.dueCents)}</span>.
                </p>
              ) : null}
            </section>
          )
        ) : null}

        {zone.status === "free" ? (
          <p className="text-sm text-text-secondary">
            Libre para esta noche. Resérvala a mano o déjala en la oferta para estudiantes: la verán quienes celebran algo esta semana.
          </p>
        ) : (
          <div className="divide-y divide-border-light">
            <Detail label="A nombre de">{zone.bookedBy}</Detail>
            <Detail label="Personas">{zone.people ?? "Sin indicar"}</Detail>
            <Detail label="Consumo mínimo">{money(zone.minimumSpendCents)}</Detail>
            <Detail label="Señal">
              {money(zone.depositCents)}{" "}
              {zone.status === "held" ? (
                <span className="text-amber-700 dark:text-amber-400">(pendiente)</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">(cobrada)</span>
              )}
            </Detail>
            {zone.status === "held" && zone.holdUntil ? (
              <Detail label="Si no paga">
                Se libera a las {time(zone.holdUntil)}, {shortDay(zone.holdUntil)}
              </Detail>
            ) : null}
            {z.phone ? <Detail label="Teléfono">{z.phone}</Detail> : null}
          </div>
        )}
        {zone.bookedBy ? <BookerHistoryNote name={zone.bookedBy} phone={z.phone} /> : null}
        {z.note ? <p className="rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">{z.note}</p> : null}
      </div>
    </Drawer>
  );
}

function BookDrawer({ preset, zones, eventId, onClose }: { preset: Preset; zones: ProZone[]; eventId?: string; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [zoneId, setZoneId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [people, setPeople] = React.useState("6");
  const [minimum, setMinimum] = React.useState("");
  const [deposit, setDeposit] = React.useState("");
  const [paid, setPaid] = React.useState(false);
  const [birthday, setBirthday] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [holdUntil, setHoldUntil] = React.useState("");
  const { now } = usePro();

  const zone = zones.find((z) => z.id === zoneId);
  const available = zones.filter((z) => z.status === "free" || z.id === preset?.zoneId);
  const holdOptions = holdChoices(now, eventId ? data.events.find((e) => e.id === eventId) : null);

  React.useEffect(() => {
    if (!preset) return;
    const z = zones.find((x) => x.id === preset.zoneId) ?? zones.find((x) => x.status === "free");
    setZoneId(z?.id ?? "");
    setName(preset.name ?? "");
    setPhone("");
    setPeople(String(preset.people ?? Math.min(6, z?.capacity ?? 6)));
    setMinimum(z ? String(z.minimumSpendCents / 100) : "");
    setDeposit(z ? String(z.depositCents / 100) : "");
    setPaid(false);
    setBirthday(Boolean(preset.birthday));
    setNote(preset.note ?? "");
    setHoldUntil(holdOptions[holdOptions.length - 1]?.value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const pickZone = (id: string) => {
    setZoneId(id);
    const z = zones.find((x) => x.id === id);
    if (z) {
      setMinimum(String(z.minimumSpendCents / 100));
      setDeposit(String(z.depositCents / 100));
    }
  };

  const n = Number(people) || 0;
  const tooMany = zone ? n > zone.capacity : false;
  const valid = Boolean(zone) && name.trim().length > 1 && n > 0 && !tooMany;
  const euros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;

  const save = () => {
    if (!zone) return;
    const status: ProZone["status"] = paid || euros(deposit) === 0 ? "booked" : "held";
    update("zone.book", (d) => ({
      ...d,
      zones: d.zones.map((x) => {
        if (x.id !== zone.id) return x;
        const booked: ProZone = {
          ...x,
          status,
          bookedBy: name.trim(),
          people: n,
          minimumSpendCents: euros(minimum),
          depositCents: euros(deposit),
          birthday,
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
          eventId: x.eventId ?? eventId,
          // Sin señal, el apartado caduca solo a la hora elegida.
          holdUntil: status === "held" ? holdUntil || undefined : undefined,
          tab: undefined,
        };
        return booked;
      }),
      groupRequests: preset?.requestId ? d.groupRequests.map((g) => (g.id === preset.requestId ? { ...g, status: "accepted" } : g)) : d.groupRequests,
    }));
    toast.success(
      status === "booked" ? `${zone.name} reservado` : `${zone.name} apartado`,
      status === "booked"
        ? `${name.trim()}, ${n} personas.`
        : `Pídele la señal de ${money(euros(deposit))}.${holdUntil ? ` Si no llega, se libera sola a las ${time(holdUntil)}.` : ""}`,
    );
    onClose();
  };

  const ev = eventId ? data.events.find((e) => e.id === eventId) : undefined;

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={preset?.requestId ? "Aceptar petición" : "Nuevo reservado"}
      description={ev ? `${ev.name}, ${dayLabel(ev.doorsOpen)} a las ${time(ev.doorsOpen)}` : "Zona, personas, mínimo y señal."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            {paid || euros(deposit) === 0 ? "Reservar" : "Apartar y pedir señal"}
          </Button>
        </>
      }
    >
      {available.length ? (
        <div className="flex flex-col gap-5">
          <FormField label="Zona">
            <ChoiceChips
              value={zoneId}
              onChange={pickZone}
              options={available.map((z) => ({ value: z.id, label: z.name, hint: `${z.capacity} pers. · ${money(z.minimumSpendCents, { round: true })}` }))}
            />
          </FormField>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <FormField label="A nombre de" htmlFor="bk-name">
              <input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" className={inputClass} />
            </FormField>
            <FormField label="Personas" htmlFor="bk-people" hint={tooMany ? `Máximo ${zone?.capacity}` : undefined}>
              <input id="bk-people" type="number" min={1} inputMode="numeric" value={people} aria-invalid={tooMany || undefined} onChange={(e) => setPeople(e.target.value)} className={inputClass} />
            </FormField>
          </div>
          <FormField label="Teléfono" htmlFor="bk-phone">
            <input id="bk-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" className={inputClass} />
          </FormField>
          {name.trim().length > 3 ? <BookerHistoryNote name={name} phone={phone} compact /> : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Consumo mínimo (€)" htmlFor="bk-min">
              <input id="bk-min" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} className={inputClass} />
            </FormField>
            <FormField label="Señal (€)" htmlFor="bk-dep">
              <input id="bk-dep" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className={inputClass} />
            </FormField>
          </div>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-semibold">Señal ya cobrada</span>
              <span className="block text-xs text-text-muted">Si no, queda apartado hasta que la pague.</span>
            </span>
            <Switch checked={paid} onCheckedChange={setPaid} aria-label="Señal ya cobrada" />
          </label>
          {!paid && euros(deposit) > 0 && holdOptions.length ? (
            <FormField label="Si no paga la señal, se libera" hint="La zona vuelve a estar libre sola y te avisamos.">
              <ChoiceChips value={holdUntil} onChange={setHoldUntil} options={holdOptions} />
            </FormField>
          ) : null}
          <label className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <Cake className="h-4 w-4 text-violet" strokeWidth={1.9} /> Es un cumpleaños
            </span>
            <Switch checked={birthday} onCheckedChange={setBirthday} aria-label="Es un cumpleaños" />
          </label>
          <FormField label="Nota para el equipo" htmlFor="bk-note">
            <textarea id="bk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bengala con la botella, llegan a la 1:00…" className={textareaClass} />
          </FormField>
        </div>
      ) : (
        <Empty icon={Sofa} title="No quedan zonas libres" body="Libera una zona para poder reservarla esta noche." />
      )}
    </Drawer>
  );
}

/**
 * Lo que se sabe de quien reserva: si ya vino, cuánto gasta de media y si
 * alguna vez no se presentó. Si falló, sugiere pedir señal. Sin historial no
 * pinta nada en el formulario.
 */
function BookerHistoryNote({ name, phone, compact }: { name: string; phone?: string; compact?: boolean }) {
  const { data, now } = usePro();
  const h = bookerHistory(data, { name, phone }, nightOf(now));
  if (!h.visits && !h.noShows) {
    return compact ? null : <p className="text-xs text-text-muted">Primera vez que reserva con vosotros.</p>;
  }
  const parts = [
    h.visits ? `${h.visits} ${h.visits === 1 ? "reservado" : "reservados"} con cuenta cerrada, ${money(h.avgCents, { round: true })} de media` : null,
    h.noShows ? `${h.noShows} ${h.noShows === 1 ? "vez" : "veces"} no se presentó` : null,
  ].filter(Boolean);
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm",
        h.askDeposit ? "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "bg-bg-secondary text-text-secondary",
      )}
    >
      <History className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
      <p className="min-w-0">
        <span className="font-semibold">{parts.join(" y ")}.</span>
        {h.lastNight ? ` Última vez el ${nightTitle(h.lastNight).toLowerCase()}.` : ""}
        {h.askDeposit ? " Pídele la señal antes de confirmar." : ""}
      </p>
    </div>
  );
}
