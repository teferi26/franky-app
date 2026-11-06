"use client";

import * as React from "react";
import { BellRing, Cake, Check, Clock, Gauge, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { Allergen } from "@/lib/pro/types";
import type { ProOrderLine, ProPickupOrder } from "@/lib/pro/tables-types";
import {
  ORDER_STATUS_LABEL,
  orderReadyMessage,
  orderReminderMessage,
  orderTotal,
  ordersBySlot,
  ordersOn,
  ordersToRemind,
} from "@/lib/pro/tables-ops";
import { ALLERGENS } from "@/lib/pro/tables";
import {
  nextPickupSlot,
  pickupPeak,
  pickupSlotOf,
  pickupSlots,
} from "@/lib/pro/tables-insights";
import {
  addDays,
  atLocal,
  capitalize,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  time,
} from "@/lib/pro/format";
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
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { AllergenCodes, StudentMark } from "./table-kit";
import { OpsMissing, Stepper, WhatsAppButton, parseEuros, useTablesOps } from "./ops-kit";

type Tab = "hoy" | "encargos";

export default function TablesPedidos() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("hoy");
  const [creating, setCreating] = React.useState<ProPickupOrder["kind"] | null>(null);
  if (!ops) return <OpsMissing icon={ShoppingBag} title="Sin pedidos todavía" />;
  const today = localDate(now);
  const todays = ordersOn(ops, today, "pickup");
  const open = todays.filter((o) => o.status !== "collected" && o.status !== "cancelled");
  const next = open.find((o) => Date.parse(o.pickupAt) >= now.getTime() - 10 * 60_000);
  const encargos = ops.orders
    .filter((o) => o.kind === "encargo" && o.status !== "collected" && o.status !== "cancelled")
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const remind = ordersToRemind(ops, today);
  const collectedCents = todays.filter((o) => o.status === "collected").reduce((a, o) => a + orderTotal(o), 0);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Pedidos"
        title={tab === "hoy" ? "Para recoger hoy" : "Encargos"}
        description={
          tab === "hoy"
            ? open.length
              ? `${plural(open.length, "pedido pendiente", "pedidos pendientes")}.${next ? ` El siguiente, ${next.clientName.split(" ")[0]} a las ${time(next.pickupAt)}.` : ""}`
              : "No hay pedidos pendientes. Los que te hagan desde Franky aparecen aquí por hora de recogida."
            : `${plural(encargos.length, "encargo", "encargos")} por entregar.${remind.length ? ` Recuerda ${plural(remind.length, "el de mañana", "los de mañana")}.` : ""}`
        }
        actions={
          <Button variant="dark" onClick={() => setCreating(tab === "hoy" ? "pickup" : "encargo")}>
            <Plus className="h-4 w-4" /> {tab === "hoy" ? "Nuevo pedido" : "Nuevo encargo"}
          </Button>
        }
      >
        <Segmented
          label="Tipo de pedido"
          value={tab}
          onChange={setTab}
          options={[
            { value: "hoy", label: "Hoy", count: open.length },
            { value: "encargos", label: "Encargos", count: encargos.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={ShoppingBag} label="Pendientes hoy" value={open.length} emphasis={open.length > 0} />
        <Kpi icon={Check} label="Recogidos hoy" value={todays.filter((o) => o.status === "collected").length} hint={money(collectedCents)} />
        <Kpi icon={Cake} label="Encargos" value={encargos.length} hint={encargos[0] ? `el próximo ${dayLabel(encargos[0].pickupAt, { weekday: false })}` : "ninguno"} />
        <Kpi icon={BellRing} label="Por recordar" value={remind.length} hint="recogen mañana" />
      </KpiRow>

      {tab === "hoy" ? <TodayOrders /> : <Encargos />}

      <OrderDrawer kind={creating} onClose={() => setCreating(null)} />
    </div>
  );
}

function TodayOrders() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const todays = ordersOn(ops, today, "pickup");
  const open = todays.filter((o) => o.status !== "collected" && o.status !== "cancelled");
  const done = todays.filter((o) => o.status === "collected");
  const slots = ordersBySlot(open);
  const nowMin = localMinutes(now);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        {slots.length ? (
          slots.map(({ minute, orders }) => (
            <section key={minute} className="flex gap-3">
              <div className="w-14 shrink-0 pt-3 text-right">
                <p className={cn("font-heading text-base font-bold tabular", minute <= nowMin ? "text-violet" : "text-text-primary")}>{minutesToLabel(minute)}</p>
                {minute <= nowMin ? <p className="text-[0.68rem] font-semibold text-violet">Ahora</p> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 border-l border-border-light pl-3">
                {orders.map((o) => (
                  <OrderCard key={o.id} order={o} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <Panel>
            <Empty icon={ShoppingBag} title="Nada por preparar" body="Cuando un estudiante pida desde Franky antes de clase, el pedido llega aquí con su hora de recogida." />
          </Panel>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <BarLoadPanel />
        <Panel title="Ya recogidos" flush>
          {done.length ? (
            <RowList>
              {done.map((o) => (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <span className="w-12 shrink-0 text-text-muted tabular">{time(o.pickupAt)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{o.clientName}</span>
                  <span className="tabular">{money(orderTotal(o))}</span>
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Aún no ha recogido nadie.</p>
          )}
        </Panel>
        <Tip title="Se paga al recoger">
          El pedido se cobra en barra, en tu TPV, cuando vienen a por él. Al tocar Listo se abre WhatsApp con el aviso ya escrito.
        </Tip>
      </div>
    </div>
  );
}

/**
 * Cuántos pedidos lleva cada franja de 10 minutos de la próxima hora y el
 * límite que aguanta la barra en la punta. Con la franja llena, a quien pide
 * desde Franky se le ofrece la siguiente con sitio.
 */
function BarLoadPanel() {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const slots = pickupSlots(ops, today, nowMin, nowMin + 60);
  const peak = pickupPeak(ops, today);
  const capacity = ops.pickupCapacity ?? 0;
  const max = Math.max(capacity, ...slots.map((x) => x.count), 1);

  return (
    <Panel
      title="Barra, próxima hora"
      description={
        capacity
          ? `Hasta ${plural(capacity, "pedido", "pedidos")} cada 10 minutos.${peak ? ` Punta de hoy: ${minutesToLabel(peak.minute)} con ${peak.count}.` : ""}`
          : "Sin límite por franja: cualquiera puede elegir cualquier hora."
      }
    >
      <div className="flex h-24 items-end gap-1.5" aria-hidden>
        {slots.map((x) => (
          <div key={x.minute} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={cn("text-[0.7rem] font-semibold tabular", x.full ? "text-rose-600" : "text-text-muted")}>
              {x.count}
            </span>
            <span
              className={cn(
                "w-full rounded-md",
                x.full ? "bg-rose-500" : x.count ? "bg-violet" : "bg-bg-tertiary",
              )}
              style={{ height: `${Math.max(6, (x.count / max) * 70)}%` }}
            />
            <span className="text-[0.65rem] text-text-muted tabular">{minutesToLabel(x.minute)}</span>
          </div>
        ))}
      </div>
      <p className="sr-only">
        {slots.map((x) => `${minutesToLabel(x.minute)}: ${x.count}`).join(", ")}
      </p>
      <FormField label="Pedidos cada 10 minutos" className="mt-4">
        <ChoiceChips
          value={String(capacity)}
          onChange={(v) =>
            void save("pickup.capacity", (o) => ({ ...o, pickupCapacity: Number(v) || undefined }))
          }
          options={[
            { value: "0", label: "Sin límite" },
            ...[2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: String(n) })),
          ]}
        />
      </FormField>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
        <Gauge className="h-3.5 w-3.5" strokeWidth={1.9} /> Pon lo que tu cafetera saca en la hora punta.
      </p>
    </Panel>
  );
}

function OrderCard({ order }: { order: ProPickupOrder }) {
  const { data } = usePro();
  const { save } = useTablesOps();
  const toast = useToast();
  const set = async (status: ProPickupOrder["status"], extra: Partial<ProPickupOrder> = {}) =>
    save(`order.${status}`, (o) => ({ ...o, orders: o.orders.map((x) => (x.id === order.id ? { ...x, status, ...extra } : x)) }));

  return (
    <article className={cn("rounded-2xl border bg-bg-primary p-3 shadow-card", order.status === "ready" ? "border-emerald-300" : "border-border")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{order.clientName}</span>
            {order.student ? <StudentMark /> : null}
          </p>
          <p className="text-xs text-text-muted">Recoge a las {time(order.pickupAt)} · {money(orderTotal(order))}</p>
        </div>
        <Pill tone={order.status === "ready" ? "success" : order.status === "preparing" ? "info" : "violet"}>{ORDER_STATUS_LABEL[order.status]}</Pill>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {order.lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-6 shrink-0 font-bold tabular">{l.qty}</span>
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
          </li>
        ))}
      </ul>
      {order.note ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{order.note}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "new" ? (
          <Button size="sm" variant="outline" className="h-10 flex-1" onClick={() => set("preparing")}>
            Preparando
          </Button>
        ) : null}
        {order.status !== "ready" ? (
          <WhatsAppButton
            variant="dark"
            className="flex-1"
            phone={order.phone}
            label="Listo, avisar"
            message={orderReadyMessage(order, data.space.name)}
            onOpen={() => {
              void set("ready", { readyAt: new Date().toISOString() });
            }}
          />
        ) : (
          <Button
            size="sm"
            variant="dark"
            className="h-10 flex-1"
            onClick={async () => {
              if (await set("collected")) toast.success("Recogido", order.clientName);
            }}
          >
            <Check className="h-4 w-4" /> Recogido
          </Button>
        )}
        {order.status !== "ready" && !order.phone ? (
          <Button size="sm" variant="outline" className="h-10" onClick={() => set("ready", { readyAt: new Date().toISOString() })}>
            Marcar listo
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function Encargos() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  if (!ops) return null;
  const today = localDate(now);
  const list = ops.orders
    .filter((o) => o.kind === "encargo" && o.status !== "cancelled")
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const upcoming = list.filter((o) => o.status !== "collected");
  const byDay = [...new Set(upcoming.map((o) => localDate(o.pickupAt)))];
  const tomorrow = addDays(today, 1);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {byDay.length ? (
          byDay.map((date) => (
            <Panel
              key={date}
              title={date === today ? "Hoy" : date === tomorrow ? "Mañana" : capitalize(dayLabel(`${date}T12:00:00Z`))}
              flush
            >
              <RowList>
                {upcoming
                  .filter((o) => localDate(o.pickupAt) === date)
                  .map((o) => (
                    <div key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                      <div className="flex items-start gap-3">
                        <span className="w-12 shrink-0 font-heading text-sm font-bold tabular">{time(o.pickupAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{o.clientName}</span>
                          <span className="block text-sm text-text-secondary">{o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</span>
                          {o.note ? <span className="block text-xs text-text-muted">{o.note}</span> : null}
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            {o.allergens?.length ? <AllergenCodes list={o.allergens} /> : null}
                            <span className="text-xs text-text-muted">
                              {money(orderTotal(o))}
                              {o.depositCents ? ` · señal ${money(o.depositCents)} cobrada` : " · sin señal"}
                            </span>
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 pl-[3.75rem]">
                        {date === tomorrow ? (
                          o.remindedAt ? (
                            <Pill tone="success">Recordado</Pill>
                          ) : (
                            <WhatsAppButton
                              phone={o.phone}
                              label="Recordar"
                              message={orderReminderMessage(o, data.space.name)}
                              onOpen={() => {
                                void save("order.remind", (x) => ({ ...x, orders: x.orders.map((y) => (y.id === o.id ? { ...y, remindedAt: new Date().toISOString() } : y)) }));
                              }}
                            />
                          )
                        ) : null}
                        {o.status !== "ready" ? (
                          <Button size="sm" variant="outline" className="h-10" onClick={() => save("order.ready", (x) => ({ ...x, orders: x.orders.map((y) => (y.id === o.id ? { ...y, status: "ready" } : y)) }))}>
                            Listo
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-10"
                          onClick={async () => {
                            if (await save("order.collected", (x) => ({ ...x, orders: x.orders.map((y) => (y.id === o.id ? { ...y, status: "collected" } : y)) })))
                              toast.success("Entregado", o.clientName);
                          }}
                        >
                          Entregado
                        </Button>
                      </div>
                    </div>
                  ))}
              </RowList>
            </Panel>
          ))
        ) : (
          <Panel>
            <Empty icon={Cake} title="Sin encargos" body="Tartas, bandejas o termos de café para una clase. Apúntalos con su fecha y te recordamos avisar al cliente el día antes." />
          </Panel>
        )}
      </div>
      <Tip title="Adiós a la libreta">
        Con la fecha, los alérgenos y la señal apuntados, cualquiera del equipo sabe qué hay que preparar y para cuándo.
      </Tip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo pedido o encargo                                              */
/* ------------------------------------------------------------------ */

function OrderDrawer({ kind, onClose }: { kind: ProPickupOrder["kind"] | null; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [hour, setHour] = React.useState("10:00");
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [custom, setCustom] = React.useState("");
  const [customPrice, setCustomPrice] = React.useState("");
  const [allergens, setAllergens] = React.useState<Allergen[]>([]);
  const [deposit, setDeposit] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!kind) return;
    const next = Math.ceil((localMinutes(now) + 20) / 15) * 15;
    setName("");
    setPhone("");
    setDate(kind === "encargo" ? addDays(today, 2) : today);
    setHour(minutesToLabel(kind === "encargo" ? 11 * 60 : Math.min(next, 23 * 60)));
    setQty({});
    setCustom("");
    setCustomPrice("");
    setAllergens([]);
    setDeposit("");
    setNote("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  if (!kind) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const products = data.menu.filter((m) => m.available);
  const lines: ProOrderLine[] = [
    ...products.filter((m) => qty[m.id]).map((m) => ({ name: m.name, qty: qty[m.id], priceCents: m.priceCents })),
    ...(custom.trim() ? [{ name: custom.trim(), qty: 1, priceCents: parseEuros(customPrice) ?? 0 }] : []),
  ];
  // Los alérgenos del pedido salen solos de los productos de la carta.
  const inherited = [...new Set(products.filter((m) => qty[m.id]).flatMap((m) => m.allergens))];
  const [h, m] = hour.split(":").map(Number);
  const minute = h * 60 + (m || 0);
  const valid = name.trim().length > 1 && lines.length > 0 && Number.isFinite(minute);
  // Franja llena: se propone la siguiente con sitio.
  const slotFull =
    kind === "pickup" && ops && Number.isFinite(minute)
      ? (pickupSlots(ops, date, minute, minute + 1)[0]?.full ?? false)
      : false;
  const nextFree = slotFull && ops ? nextPickupSlot(ops, date, minute) : null;

  const submit = async () => {
    const order: ProPickupOrder = {
      id: localId(kind === "encargo" ? "en" : "or"),
      kind,
      clientName: name.trim(),
      phone: phone.trim() || undefined,
      lines,
      pickupAt: atLocal(date, minute),
      status: "new",
      note: note.trim() || undefined,
      allergens: [...new Set([...inherited, ...allergens])],
      depositCents: kind === "encargo" ? parseEuros(deposit) ?? 0 : undefined,
      createdAt: now.toISOString(),
      source: "walkin",
    };
    if (!(await save("order.create", (o) => ({ ...o, orders: [...o.orders, order] })))) return;
    toast.success(kind === "encargo" ? "Encargo apuntado" : "Pedido apuntado", `${order.clientName}, ${date === today ? "hoy" : dayLabel(order.pickupAt)} a las ${hour}.`);
    onClose();
  };

  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={kind === "encargo" ? "Nuevo encargo" : "Nuevo pedido para recoger"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" disabled={!valid} onClick={submit}>
            Guardar{lines.length ? ` · ${money(lines.reduce((a, l) => a + l.qty * l.priceCents, 0))}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nombre" htmlFor="od-name">
            <input id="od-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="WhatsApp" htmlFor="od-phone" hint="Para avisar cuando esté listo.">
            <input id="od-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="600 000 000" className={inputClass} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {kind === "encargo" ? (
            <FormField label="Día" htmlFor="od-date">
              <input id="od-date" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
            </FormField>
          ) : null}
          <FormField label="Hora de recogida" htmlFor="od-hour">
            <input id="od-hour" type="time" step={300} value={hour} onChange={(e) => setHour(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="De la carta">
          <div className="flex max-h-72 flex-col divide-y divide-border-light overflow-y-auto rounded-2xl border border-border pro-scroll">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="text-xs text-text-muted">{money(p.priceCents)}</span>
                </span>
                <Stepper label={`Cantidad de ${p.name}`} value={qty[p.id] ?? 0} onChange={(n) => setQty((q) => ({ ...q, [p.id]: n }))} max={99} />
              </div>
            ))}
          </div>
        </FormField>
        {kind === "encargo" ? (
          <>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <FormField label="Algo fuera de carta" htmlFor="od-custom">
                <input id="od-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Tarta entera, bandeja de 20..." className={inputClass} />
              </FormField>
              <FormField label="Precio (€)" htmlFor="od-cprice">
                <input id="od-cprice" inputMode="decimal" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className={inputClass} />
              </FormField>
            </div>
            <FormField label="Alérgenos" hint={inherited.length ? "Los de los productos de la carta ya se suman solos." : undefined}>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGENS.map((a) => {
                  const on = allergens.includes(a.id) || inherited.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      disabled={inherited.includes(a.id)}
                      onClick={() => setAllergens((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))}
                      className={cn("h-9 rounded-full border px-3 text-xs font-semibold", on ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary")}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </FormField>
            <FormField label="Señal cobrada en el TPV (€)" htmlFor="od-deposit">
              <input id="od-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0,00" className={inputClass} />
            </FormField>
          </>
        ) : null}
        <FormField label="Nota" htmlFor="od-note">
          <input id="od-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leche sin lactosa, texto de la tarta..." className={inputClass} />
        </FormField>
        {slotFull ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="min-w-0 flex-1">
              La franja de las {minutesToLabel(pickupSlotOf(minute))} ya está llena.
              {nextFree !== null ? ` La siguiente con sitio es a las ${minutesToLabel(nextFree)}.` : ""}
            </span>
            {nextFree !== null ? (
              <Button size="sm" variant="outline" className="h-10" onClick={() => setHour(minutesToLabel(nextFree))}>
                Usar las {minutesToLabel(nextFree)}
              </Button>
            ) : null}
          </div>
        ) : null}
        {kind === "pickup" ? (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.9} /> Sale en la columna de su hora, en orden de recogida.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
