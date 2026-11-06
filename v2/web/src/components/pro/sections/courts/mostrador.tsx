"use client";

import * as React from "react";
import {
  BadgeCheck,
  CircleDot,
  Lightbulb,
  LogIn,
  LogOut,
  Maximize2,
  Plus,
  ShoppingBag,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking, ProPayment } from "@/lib/pro/types";
import { durationLabel, localDate, localMinutes, money, plural, time } from "@/lib/pro/format";
import { hoursFor, isShared, occupancyAt, priceFor, resourceBookings } from "@/lib/pro/courts";
import { blocksOn, clockLabel, courtsOps, patchCourts } from "@/lib/pro/courts-base";
import {
  arrivalsSoon,
  duskMinute,
  freeFor,
  isCovered,
  isFlagged,
  lightsPlan,
  noShowCount,
  playerShares,
  isSplitBooking,
} from "@/lib/pro/courts-ops";
import {
  checkIn,
  checkOut,
  lateArrivals,
  memberOf,
  releaseNoShows,
  renewMember,
  renewals,
  seatStates,
  shiftPresets,
  walkIn,
} from "@/lib/pro/courts-desk";
import { deskWarning, searchDesk } from "@/lib/pro/courts-study";
import { memberPrice } from "@/lib/pro/classes";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FixedPortal,
  FormField,
  LiveDot,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  SearchInput,
  Segmented,
  inputClass,
} from "../../kit";
import { TONES } from "../../tones";
import { CourtBookingDrawer, NewCourtBookingDrawer, type NewCourtPreset } from "./parts";
import { METHOD_LABEL, WhatsAppLink, firstName } from "./booking-ops";

/**
 * Mostrador: la pantalla de recepción. En un club, quién entra, quién ha
 * pagado su parte, qué pista está libre ahora y cuándo encender las luces.
 * En una sala de estudio, entradas y salidas, puestos, ausencias y
 * renovaciones.
 */
export default function MostradorSection() {
  const { vertical } = usePro();
  return vertical.id === "coworking" ? <StudyDesk /> : <ClubDesk />;
}

/* ------------------------------------------------------------------ */
/* Club de pádel                                                       */
/* ------------------------------------------------------------------ */

function ClubDesk() {
  const { data, now } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewCourtPreset>(null);
  const arrivals = arrivalsSoon(data, now, 120);
  const hours = hoursFor(data, today);
  const courts = data.resources.filter((r) => r.kind === "court");
  const freeNow = courts.filter((r) => freeFor(data, r, today, nowMin) >= 60);
  const pending = arrivals.reduce(
    (a, b) => a + Math.max(0, b.priceCents - (b.paidCents ?? 0)),
    0,
  );
  const nextHour = arrivals.filter((b) => Date.parse(b.start) <= now.getTime() + 3600000);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Mostrador"
        title={`Ahora, ${time(now.toISOString())}`}
        description={
          hours
            ? `${plural(nextHour.length, "reserva entra", "reservas entran")} en la próxima hora, ${money(pending)} por cobrar y ${plural(freeNow.length, "pista libre", "pistas libres")} ahora mismo.`
            : "Hoy está cerrado."
        }
        actions={
          <Button variant="dark" onClick={() => setPreset({ date: today })}>
            <Plus className="h-4 w-4" /> Reserva rápida
          </Button>
        }
      />

      <Panel title="Pistas ahora" description="Toca una libre para reservarla desde ya." flush>
        <div className="grid gap-px overflow-hidden bg-border-light sm:grid-cols-2 xl:grid-cols-3">
          {courts.map((r) => {
            const inside = resourceBookings(data, today, r.id).find(
              (b) =>
                b.status !== "cancelled" &&
                b.status !== "no_show" &&
                Date.parse(b.start) <= now.getTime() &&
                Date.parse(b.end) > now.getTime(),
            );
            const block = blocksOn(data, today, r.id).find((b) => b.from <= nowMin && b.to > nowMin);
            const free = inside || block ? 0 : freeFor(data, r, today, nowMin);
            const slot = Math.ceil(nowMin / 30) * 30;
            return (
              <div key={r.id} className="flex flex-col gap-2 bg-bg-primary p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("h-2.5 w-2.5 rounded-full", TONES[r.tone].dot)} />
                    {r.name}
                  </p>
                  <span className="text-xs text-text-muted">{isCovered(data, r.id) ? "Cubierta" : "Exterior"}</span>
                </div>
                {inside ? (
                  <button type="button" onClick={() => setOpenBooking(inside.id)} className="text-left">
                    <p className="font-heading text-lg font-bold">{inside.clientName}</p>
                    <p className="text-xs text-text-muted">Juegan hasta las {time(inside.end)}</p>
                  </button>
                ) : block ? (
                  <div>
                    <p className="font-heading text-lg font-bold">{block.note ?? "Bloqueada"}</p>
                    <p className="text-xs text-text-muted">Hasta las {clockLabel(block.to)}</p>
                  </div>
                ) : free >= 60 ? (
                  <div>
                    <p className="flex items-center gap-2 font-heading text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      <LiveDot /> Libre
                    </p>
                    <p className="text-xs text-text-muted">{durationLabel(free)} seguidas desde las {clockLabel(slot)}</p>
                    <div className="mt-2 flex gap-2">
                      {[60, 90].filter((d) => d <= free).map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant="outline"
                          className="min-h-10"
                          onClick={() => setPreset({ date: today, resourceId: r.id, minute: slot })}
                        >
                          {d} min · {money(priceFor(r, today, slot, d) ?? 0)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="font-heading text-lg font-bold text-text-muted">Ocupada en breve</p>
                    <p className="text-xs text-text-muted">Menos de una hora libre</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Entran en las próximas dos horas"
          description="Quién viene, a qué pista y qué parte falta por pagar."
          flush
        >
          {arrivals.length ? (
            <RowList>
              {arrivals.map((b) => (
                <ArrivalRow key={b.id} booking={b} onOpen={() => setOpenBooking(b.id)} />
              ))}
            </RowList>
          ) : (
            <Empty icon={CircleDot} title="Nadie en las próximas dos horas" body="Buen momento para ofrecer las pistas libres a estudiantes." />
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-5">
          <LightsPanel />
          <QuickSale />
        </div>
      </div>

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <NewCourtBookingDrawer preset={preset} onClose={() => setPreset(null)} />
    </div>
  );
}

function ArrivalRow({ booking: b, onOpen }: { booking: ProBooking; onOpen: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const r = data.resources.find((x) => x.id === b.resourceId);
  const shares = isSplitBooking(data, b) ? playerShares(data, b) : null;
  const paid = shares ? shares.filter((s) => s.dueCents === 0).length : null;
  const due = Math.max(0, b.priceCents - (b.paidCents ?? 0));
  const flagged = isFlagged(data, b.clientId);
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="w-12 shrink-0">
          <span className="block font-heading text-[0.95rem] font-bold tabular">{time(b.start)}</span>
          <span className="block text-xs text-text-muted">{r?.name.replace("Pista ", "P")}</span>
        </span>
        <span className={cn("h-9 w-1 shrink-0 rounded-full", TONES[r?.tone ?? "slate"].bar)} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-sm font-semibold">
            <span className="truncate">{b.clientName}</span>
            {b.student ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {shares ? `${paid} de 4 pagados` : due ? `Debe ${money(due)}` : "Pagada"}
            {due && shares ? ` · faltan ${money(due)}` : ""}
            {flagged ? ` · ${noShowCount(data, b.clientId)} ausencias` : ""}
          </span>
        </span>
      </button>
      {b.status === "arrived" ? (
        <Pill tone="info">Dentro</Pill>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="min-h-10"
          onClick={() => {
            update("court.arrived", (d) => ({
              ...d,
              bookings: d.bookings.map((x) => (x.id === b.id ? { ...x, status: "arrived" } : x)),
            }));
            toast.success("Han llegado", due ? `Quedan ${money(due)} por cobrar.` : "Ya está pagada.");
          }}
        >
          Han llegado
        </Button>
      )}
    </div>
  );
}

function LightsPanel() {
  const { data, now } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const plan = lightsPlan(data, today);
  const dusk = duskMinute(today);
  const lit = plan.filter((p) => p.spans.some((s) => s.on <= nowMin && s.off > nowMin));
  return (
    <Panel
      title="Hoja de luces"
      description={`Anochece hacia las ${clockLabel(dusk)}. Las cubiertas se encienden cuando hay juego.`}
    >
      {plan.every((p) => !p.spans.length) ? (
        <p className="text-sm text-text-muted">Hoy no hace falta encender ninguna pista.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {plan.map((p) => {
            const r = data.resources.find((x) => x.id === p.resourceId);
            const on = lit.includes(p);
            return (
              <li key={p.resourceId} className="flex items-start gap-2.5 text-sm">
                <Lightbulb
                  className={cn("mt-0.5 h-4 w-4 shrink-0", on ? "text-amber-500" : "text-text-muted")}
                  strokeWidth={1.9}
                />
                <span className="w-16 shrink-0 font-semibold">{r?.name}</span>
                <span className="min-w-0 flex-1 text-text-muted tabular">
                  {p.spans.length
                    ? p.spans.map((s) => `${clockLabel(s.on)} a ${clockLabel(s.off)}`).join(", ")
                    : "Apagada todo el día"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Venta sin reserva: bebidas, bolas o alquiler de pala en dos toques. */
function QuickSale() {
  const { data, update } = usePro();
  const toast = useToast();
  const shop = courtsOps(data).shop;
  const [itemId, setItemId] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");
  if (!shop.length) return null;
  const item = shop.find((i) => i.id === itemId);

  const sell = () => {
    if (!item) return;
    update("court.sale", (d) => {
      const next = patchCourts(d, (ops) => ({
        shop: ops.shop.map((s) => (s.id === item.id && s.stock !== null ? { ...s, stock: s.stock - 1 } : s)),
      }));
      return {
        ...next,
        payments: [
          ...next.payments,
          {
            id: localId("p"),
            at: new Date().toISOString(),
            clientName: "Mostrador",
            concept: `Venta: ${item.name}`,
            amountCents: item.priceCents,
            tipCents: 0,
            method,
          },
        ],
      };
    });
    toast.success("Vendido", `${item.name}, ${money(item.priceCents)} con ${METHOD_LABEL[method].toLowerCase()}.`);
    setItemId(null);
  };

  return (
    <Panel title="Venta rápida" description="Sin reserva de por medio. Queda en la caja del día.">
      <div className="flex flex-wrap gap-1.5">
        {shop.map((i) => {
          const out = i.stock !== null && i.stock <= 0;
          return (
            <button
              key={i.id}
              type="button"
              disabled={out}
              aria-pressed={itemId === i.id}
              onClick={() => setItemId(itemId === i.id ? null : i.id)}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:opacity-40",
                itemId === i.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-violet/40",
              )}
            >
              <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.9} />
              {i.name}
              <span className="font-normal text-text-muted">
                {money(i.priceCents)}
                {i.stock !== null ? ` · ${i.stock <= 5 ? `solo ${i.stock}` : i.stock}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      {item ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChoiceChips
            value={method}
            onChange={setMethod}
            options={(["card", "cash", "bizum"] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
          />
          <Button size="sm" variant="dark" className="min-h-10" onClick={sell}>
            Cobrar {money(item.priceCents)}
          </Button>
        </div>
      ) : null}
      {shop.some((i) => i.stock !== null && i.stock <= 5) ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Quedan pocas unidades de {shop.filter((i) => i.stock !== null && i.stock <= 5).map((i) => i.name.toLowerCase()).join(" y ")}.
        </p>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Sala de estudio: recepción                                          */
/* ------------------------------------------------------------------ */

type DeskView = "desk" | "renew";

function StudyDesk() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = React.useState<DeskView>("desk");
  const [query, setQuery] = React.useState("");
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [walk, setWalk] = React.useState<{ name?: string; personId?: string } | null>(null);
  const [kiosk, setKiosk] = React.useState(false);

  React.useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("vista") === "renovar") setView("renew");
    } catch {
      // sin URL no hay nada que leer
    }
  }, []);

  const zones = data.resources.filter(isShared);
  const todays = resourceBookings(data, today).filter((b) => zones.some((z) => z.id === b.resourceId));
  const inside = todays.filter((b) => b.status === "arrived" && Date.parse(b.end) > now.getTime());
  const coming = todays.filter(
    (b) => b.status === "confirmed" && Date.parse(b.end) > now.getTime(),
  );
  const late = lateArrivals(data, now);
  const lateIds = new Set(late.map((b) => b.id));
  const renew = renewals(data, today);
  const people = zones.reduce((a, r) => a + Math.min(r.capacity, occupancyAt(data, r, today, nowMin)), 0);
  const seats = zones.reduce((a, r) => a + r.capacity, 0);

  const q = query.trim().toLowerCase();
  const found = q.length >= 2 ? searchDesk(data.members, todays, q) : null;

  // Avisos de convivencia de quien entra: al tercero, recepción lo ve en rojo.
  const warningOf = (b?: ProBooking) =>
    b
      ? deskWarning(
          data,
          { memberId: data.members.some((m) => m.id === b.clientId) ? b.clientId : undefined, name: b.clientName },
          today,
        )
      : { count: 0, flagged: false };

  const doCheckIn = (bookingId: string) => {
    const result = checkIn(data, bookingId, now);
    update("court.checkin", () => result.data);
    const b = data.bookings.find((x) => x.id === bookingId);
    const warning = warningOf(b);
    toast.success(
      `${firstName(b?.clientName ?? "")} ha entrado`,
      [
        result.seat ? `Puesto ${result.seat.label}` : null,
        result.bonoLeft !== undefined
          ? `le ${result.bonoLeft === 1 ? "queda 1 uso" : `quedan ${result.bonoLeft} usos`} en su bono`
          : null,
        warning.flagged ? `lleva ${warning.count} avisos de convivencia: recuérdale las normas` : null,
      ]
        .filter(Boolean)
        .join(", ") || undefined,
    );
    setQuery("");
  };
  const doCheckOut = (bookingId: string) => {
    const b = data.bookings.find((x) => x.id === bookingId);
    update("court.checkout", (d) => checkOut(d, bookingId, new Date()));
    toast.success(`${firstName(b?.clientName ?? "")} se ha ido`, "Su puesto vuelve a estar libre.");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Recepción"
        title={`${people} de ${seats} puestos ocupados`}
        description={`${plural(inside.length, "persona dentro", "personas dentro")}, ${plural(coming.length, "reserva por llegar", "reservas por llegar")}${late.length ? ` y ${late.length} sin aparecer` : ""}.`}
        actions={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: "desk", label: "Entradas" },
                { value: "renew", label: "Renovaciones", count: renew.length },
              ]}
            />
            <Button variant="outline" onClick={() => setKiosk(true)}>
              <Maximize2 className="h-4 w-4" /> Modo tablet
            </Button>
            <Button variant="dark" onClick={() => setWalk({})}>
              <UserPlus className="h-4 w-4" /> Entrada sin reserva
            </Button>
          </>
        }
      />

      {view === "renew" ? (
        <RenewalsPanel />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {zones.map((r) => {
              const occ = Math.min(r.capacity, occupancyAt(data, r, today, nowMin));
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-bg-primary px-4 py-3">
                  <p className="flex items-center gap-2 text-[0.8rem] font-medium text-text-muted">
                    <LiveDot /> {r.name}
                  </p>
                  <p className="mt-1 font-heading text-xl font-extrabold tabular">
                    {r.capacity - occ}
                    <span className="text-sm font-semibold text-text-muted"> libres de {r.capacity}</span>
                  </p>
                  <Meter
                    value={occ}
                    max={r.capacity}
                    className="mt-2"
                    tone={occ >= r.capacity ? "danger" : occ / r.capacity > 0.75 ? "warning" : "success"}
                  />
                </div>
              );
            })}
          </div>

          <Panel title="Buscar a alguien" description="Nombre o móvil. Entrada y salida en un toque.">
            <SearchInput value={query} onChange={setQuery} placeholder="Nombre o móvil" />
            {found ? (
              found.length ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {found.map((f) => (
                    <li key={f.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
                      <Avatar name={f.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{f.name}</span>
                        <span className="block truncate text-xs text-text-muted">{f.detail}</span>
                      </span>
                      <WarnPill warning={deskWarning(data, { memberId: f.personId, name: f.name }, today)} />
                      {f.booking && f.booking.status === "arrived" ? (
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => doCheckOut(f.booking!.id)}>
                          <LogOut className="h-3.5 w-3.5" /> Se va
                        </Button>
                      ) : f.booking ? (
                        <Button size="sm" variant="dark" className="min-h-10" onClick={() => doCheckIn(f.booking!.id)}>
                          <LogIn className="h-3.5 w-3.5" /> Ha llegado
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => setWalk({ name: f.name, personId: f.personId })}>
                          Darle entrada
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
                  No hay nadie con ese nombre hoy.
                  <Button size="sm" variant="outline" onClick={() => setWalk({ name: query.trim() })}>
                    Entrada sin reserva
                  </Button>
                </div>
              )
            ) : null}
          </Panel>

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Por llegar" description={late.length ? `${late.length} llevan más de ${courtsOps(data).policy.releaseAfterMinutes} minutos de retraso.` : "Reservas de hoy que aún no han entrado."} flush
              action={
                late.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      update("court.release.noshows", (d) => releaseNoShows(d, late.map((b) => b.id)));
                      toast.success("Puestos liberados", `${plural(late.length, "puesto vuelve", "puestos vuelven")} al aforo.`);
                    }}
                  >
                    Liberar {late.length}
                  </Button>
                ) : null
              }
            >
              {coming.length ? (
                <RowList>
                  {coming.slice(0, 12).map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <button type="button" onClick={() => setOpenBooking(b.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="w-12 shrink-0 font-heading text-[0.95rem] font-bold tabular">{time(b.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{b.clientName}</span>
                          <span className="block truncate text-xs text-text-muted">
                            {data.resources.find((r) => r.id === b.resourceId)?.name}
                            {b.note === "Con bono" ? " · con bono" : b.priceCents ? ` · ${money(b.priceCents)}` : ""}
                            {isFlagged(data, b.clientId) ? ` · ${noShowCount(data, b.clientId)} ausencias` : ""}
                          </span>
                        </span>
                      </button>
                      <WarnPill warning={warningOf(b)} />
                      {lateIds.has(b.id) ? <Pill tone="warning">Tarde</Pill> : null}
                      <Button size="sm" variant="outline" className="min-h-10" onClick={() => doCheckIn(b.id)}>
                        Ha llegado
                      </Button>
                    </div>
                  ))}
                </RowList>
              ) : (
                <Empty icon={LogIn} title="Todos han llegado" body="Las reservas de más tarde aparecerán aquí." />
              )}
            </Panel>

            <Panel title="Dentro ahora" description="Con su puesto y desde qué hora." flush>
              {inside.length ? (
                <RowList>
                  {inside.slice(0, 14).map((b) => {
                    const ops = courtsOps(data);
                    const seat = ops.seats.find((s) => s.id === ops.seatByBooking[b.id]);
                    const stay = ops.checkins[b.id];
                    return (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <span className="w-12 shrink-0 text-center font-heading text-sm font-bold tabular">{seat?.label ?? ""}</span>
                        <button type="button" onClick={() => setOpenBooking(b.id)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold">{b.clientName}</span>
                          <span className="block truncate text-xs text-text-muted">
                            Desde las {time(stay?.inAt ?? b.start)} · hasta las {time(b.end)}
                          </span>
                        </button>
                        <WarnPill warning={warningOf(b)} />
                        <Button size="sm" variant="outline" className="min-h-10" onClick={() => doCheckOut(b.id)}>
                          Se va
                        </Button>
                      </div>
                    );
                  })}
                </RowList>
              ) : (
                <Empty icon={CircleDot} title="La sala está vacía" body="Cuando alguien entre lo verás aquí con su puesto." />
              )}
            </Panel>
          </div>
        </>
      )}

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <WalkInDrawer target={walk} onClose={() => setWalk(null)} />
      {kiosk ? <Kiosk onClose={() => setKiosk(false)} onCheckIn={doCheckIn} /> : null}
    </div>
  );
}

/** Avisos de convivencia de los últimos 90 días; en rojo a partir del tercero. */
function WarnPill({ warning }: { warning: { count: number; flagged: boolean } }) {
  if (!warning.count) return null;
  return (
    <Pill tone={warning.flagged ? "danger" : "warning"}>
      {warning.count} {warning.count === 1 ? "aviso" : "avisos"}
    </Pill>
  );
}

/* ---------- Entrada sin reserva ---------- */

function WalkInDrawer({
  target,
  onClose,
}: {
  target: { name?: string; personId?: string } | null;
  onClose: () => void;
}) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const zones = data.resources.filter(isShared);
  const [name, setName] = React.useState("");
  const [personId, setPersonId] = React.useState<string | undefined>();
  const [zoneId, setZoneId] = React.useState("");
  const [shift, setShift] = React.useState("");

  const presets = shiftPresets(data, today, localMinutes(now));
  React.useEffect(() => {
    if (!target) return;
    setName(target.name ?? "");
    setPersonId(target.personId);
    setZoneId(zones[0]?.id ?? "");
    setShift(presets[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const zone = zones.find((z) => z.id === zoneId);
  const preset = presets.find((p) => p.id === shift);
  const found = memberOf(data, personId);
  const withBono = Boolean(found && (found.member.sessionsLeft ?? 0) > 0) || found?.plan?.period === "month";
  const minutes = preset ? preset.to - localMinutes(now) : 0;
  const price = zone && preset && !withBono ? (priceFor(zone, today, preset.from, Math.max(30, preset.to - preset.from)) ?? 0) : 0;
  const full = zone ? occupancyAt(data, zone, today, localMinutes(now)) >= zone.capacity : true;

  const save = () => {
    if (!zone || !preset || name.trim().length < 2 || full) return;
    const result = walkIn(data, {
      id: localId("b"),
      resourceId: zone.id,
      name: name.trim(),
      personId,
      student: Boolean(found?.member.student?.verified),
      now,
      minutes: Math.max(30, minutes),
      priceCents: price,
    });
    update("court.walkin", () => result.data);
    toast.success(
      `${firstName(name)} ha entrado`,
      [result.seat ? `Puesto ${result.seat.label}` : null, price ? `${money(price)} por cobrar` : "Con su bono"]
        .filter(Boolean)
        .join(", "),
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(target)}
      onOpenChange={(v) => !v && onClose()}
      title="Entrada sin reserva"
      description="Le das puesto ahora y se queda hasta el final del turno."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!zone || !preset || name.trim().length < 2 || full}>
            Dar entrada{price ? ` · ${money(price)}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre" htmlFor="wi-name">
          <input
            id="wi-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPersonId(undefined);
            }}
            className={inputClass}
            placeholder="Nombre y apellido"
          />
          {!personId && name.trim().length >= 2 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.members
                .filter((m) => m.status !== "cancelled" && m.name.toLowerCase().includes(name.trim().toLowerCase()))
                .slice(0, 4)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setName(m.name);
                      setPersonId(m.id);
                    }}
                    className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                  >
                    {m.name}
                  </button>
                ))}
            </div>
          ) : null}
        </FormField>
        <FormField label="Zona">
          <ChoiceChips
            value={zoneId}
            onChange={setZoneId}
            options={zones.map((z) => ({
              value: z.id,
              label: z.name,
              hint: `${z.capacity - Math.min(z.capacity, occupancyAt(data, z, today, localMinutes(now)))} libres`,
            }))}
          />
        </FormField>
        {presets.length ? (
          <FormField label="Hasta">
            <ChoiceChips
              value={shift}
              onChange={setShift}
              options={presets.map((p) => ({ value: p.id, label: p.label, hint: `hasta las ${clockLabel(p.to)}` }))}
            />
          </FormField>
        ) : (
          <p className="text-sm text-text-muted">Ya no queda turno abierto hoy.</p>
        )}
        {found ? (
          <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {withBono
              ? found.plan?.period === "month"
                ? "Es socio mensual: entra sin pagar."
                : `Entra con su bono: le quedarán ${Math.max(0, (found.member.sessionsLeft ?? 0) - 1)} usos.`
              : "Su bono está agotado: se cobra el pase o renuévalo en Renovaciones."}
          </p>
        ) : null}
        {full ? <p className="text-sm text-rose-600">Esa zona está llena ahora mismo.</p> : null}
      </div>
    </Drawer>
  );
}

/* ---------- Renovaciones ---------- */

function RenewalsPanel() {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const list = renewals(data, today);
  const [open, setOpen] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<ProPayment["method"]>("card");

  if (!list.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty icon={BadgeCheck} title="Nadie tiene que renovar esta semana" body="Aquí aparecen los bonos que se agotan y las cuotas que se cobran en los próximos 7 días." />
      </div>
    );

  return (
    <Panel
      title="Por renovar esta semana"
      description="La venta más fácil del mes: recuérdaselo con un toque y cobra aquí mismo."
      flush
    >
      <RowList>
        {list.map((r) => {
          const price = memberPrice(r.member, r.plan);
          return (
            <div key={r.member.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={r.member.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.member.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {r.plan.name} · {r.detail}
                  </span>
                </span>
                <Pill tone={r.reason === "overdue" ? "danger" : r.reason === "running_out" ? "warning" : "neutral"}>
                  {r.reason === "overdue" ? "Vencida" : r.reason === "running_out" ? "Se agota" : "Esta semana"}
                </Pill>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                <WhatsAppLink
                  phone={r.member.phone}
                  label="Recordar"
                  message={`Hola ${firstName(r.member.name)}, te escribimos de ${data.space.name}. ${
                    r.reason === "running_out"
                      ? `Tu ${r.plan.name.toLowerCase()} está a punto de acabarse.`
                      : `Tu cuota de ${r.plan.name.toLowerCase()} se renueva estos días.`
                  } Son ${money(price)} y te lo dejamos listo en recepción o por Bizum. ¡Ánimo con el estudio!`}
                />
                <Button size="sm" variant={open === r.member.id ? "secondary" : "dark"} className="min-h-10" onClick={() => setOpen(open === r.member.id ? null : r.member.id)}>
                  {open === r.member.id ? <X className="h-3.5 w-3.5" /> : null}
                  Renovar · {money(price)}
                </Button>
              </div>
              {open === r.member.id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-11">
                  <ChoiceChips
                    value={method}
                    onChange={setMethod}
                    options={(["card", "bizum", "cash"] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
                  />
                  <Button
                    size="sm"
                    variant="dark"
                    className="min-h-10"
                    onClick={() => {
                      update("member.renew", (d) =>
                        renewMember(d, { memberId: r.member.id, method, paymentId: localId("p"), now, priceCents: price }),
                      );
                      toast.success("Renovado", `${r.member.name}, ${r.plan.name.toLowerCase()} por ${money(price)}.`);
                      setOpen(null);
                    }}
                  >
                    Cobrar {money(price)}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ---------- Modo tablet ---------- */

/**
 * Pantalla completa para una tablet en la entrada: plazas libres en grande y
 * el propio estudiante busca su nombre para entrar.
 */
function Kiosk({ onClose, onCheckIn }: { onClose: () => void; onCheckIn: (bookingId: string) => void }) {
  const { data, now } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [query, setQuery] = React.useState("");
  const zones = data.resources.filter(isShared);
  const q = query.trim().toLowerCase();
  const matches =
    q.length >= 3
      ? resourceBookings(data, today).filter(
          (b) =>
            zones.some((z) => z.id === b.resourceId) &&
            b.status === "confirmed" &&
            Date.parse(b.end) > now.getTime() &&
            b.clientName.toLowerCase().includes(q),
        )
      : [];

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FixedPortal>
      <div role="dialog" aria-modal="true" aria-label="Modo tablet" className="fixed inset-0 z-[70] overflow-y-auto bg-bg-primary">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">{data.space.name}</p>
              <h2 className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em]">Bienvenido</h2>
              <p className="mt-2 text-text-muted">Escribe tu nombre para entrar a tu puesto.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Salir del modo tablet"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {zones.map((z) => {
              const free = z.capacity - Math.min(z.capacity, occupancyAt(data, z, today, nowMin));
              const seats = seatStates(data, z.id, today, nowMin);
              return (
                <div key={z.id} className="rounded-3xl border border-border p-5">
                  <p className="text-sm font-semibold text-text-muted">{z.name}</p>
                  <p className="mt-1 font-heading text-5xl font-extrabold tabular">{free}</p>
                  <p className="text-sm text-text-muted">{free === 1 ? "puesto libre" : "puestos libres"}</p>
                  {seats.length ? (
                    <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
                      {seats.map((s) => (
                        <span
                          key={s.seat.id}
                          className={cn(
                            "h-3 w-3 rounded-[3px]",
                            s.state === "free" ? "bg-emerald-400" : s.state === "fixed" ? "bg-bg-tertiary" : "bg-violet",
                          )}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tu nombre"
              aria-label="Tu nombre"
              className="h-16 w-full rounded-2xl border border-border bg-bg-primary px-5 text-xl focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/20"
            />
            <ul className="mt-3 flex flex-col gap-2">
              {matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onCheckIn(b.id);
                      setQuery("");
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-border px-5 text-left hover:border-violet"
                  >
                    <span>
                      <span className="block text-lg font-semibold">{b.clientName}</span>
                      <span className="block text-sm text-text-muted">
                        {data.resources.find((r) => r.id === b.resourceId)?.name} · hasta las {time(b.end)}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-violet">
                      <LogIn className="h-5 w-5" /> Entrar
                    </span>
                  </button>
                </li>
              ))}
              {q.length >= 3 && !matches.length ? (
                <li className="text-sm text-text-muted">No encontramos tu reserva. Pregunta en recepción.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </FixedPortal>
  );
}

