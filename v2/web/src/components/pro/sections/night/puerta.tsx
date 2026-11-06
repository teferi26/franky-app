"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  Maximize2,
  Minimize2,
  Minus,
  NotebookPen,
  Plus,
  ScanLine,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData, ProEvent, ProGuest } from "@/lib/pro/types";
import type { ProBan, ProPayMethod } from "@/lib/pro/night-types";
import { localMinutes, minutesToLabel, money, pct, shortDay, time } from "@/lib/pro/format";
import { entryCurve, entryRate, eventPhase, focusEvent, guestsOf, listClosed, shortUni, upcomingEvents } from "@/lib/pro/night";
import { afterCutoffPrice, banFor, capacityState, doorTotals, nightOpsOf, occupancyLog, withNightOps } from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import { FixedPortal, PageHeader, Tip } from "../../kit";
import { guestLabel, promoterName } from "./night-ui";
import { IncidentDrawer, downloadCsv } from "./ops-ui";

type ScanResult =
  | { kind: "ok"; guest: ProGuest; at: number }
  | { kind: "used"; guest: ProGuest; at: number }
  | { kind: "other"; guest: ProGuest; event: ProEvent; at: number }
  | { kind: "age"; guest: ProGuest; at: number }
  | { kind: "list_closed"; guest: ProGuest; at: number }
  | { kind: "banned"; guest: ProGuest; ban: ProBan; at: number }
  | { kind: "full"; guest: ProGuest; at: number }
  | { kind: "invalid"; at: number };

const darkInput =
  "h-12 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-4 text-base text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20";

export default function NightPuerta() {
  const { data, now } = usePro();
  const [full, setFull] = React.useState(false);
  const focus = focusEvent(data, now);
  const events = upcomingEvents(data, now);
  const [eventId, setEventId] = React.useState<string | null>(null);
  const ev = (eventId ? data.events.find((e) => e.id === eventId) : null) ?? focus;

  React.useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const door = ev ? (
    <DoorMode event={ev} events={events} onPickEvent={setEventId} fullscreen={full} onToggleFull={() => setFull((v) => !v)} />
  ) : (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <ScanLine className="h-8 w-8 text-white/60" strokeWidth={1.6} />
      <p className="mt-3 font-heading text-lg font-bold">No hay ninguna noche abierta</p>
      <p className="mt-1 max-w-sm text-sm text-white/60">Crea un evento en Eventos y la puerta se prepara sola: entradas, lista y aforo.</p>
    </div>
  );

  if (full) {
    return (
      <FixedPortal>
        <div role="dialog" aria-modal="true" aria-label="Modo puerta" className="fixed inset-0 z-[55] overflow-y-auto bg-bg-dark text-white pro-scroll">
          {door}
        </div>
      </FixedPortal>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Modo puerta"
        title="Puerta"
        description={
          ev
            ? `${ev.name}: ${ev.checkedIn} dentro de ${ev.capacity}. Cada portero escanea desde su móvil y el aforo se actualiza en todos.`
            : "Escanea entradas, busca a los de lista y controla el aforo en directo."
        }
        actions={
          ev ? (
            <Button variant="dark" onClick={() => setFull(true)}>
              <Maximize2 className="h-4 w-4" /> Pantalla completa
            </Button>
          ) : null
        }
      />
      <section className="overflow-hidden rounded-[2rem] bg-bg-dark text-white">{door}</section>
      <Tip title="Menos cola en la puerta">
        Pon un portero escaneando entradas y otro con el buscador para la lista. Verde entra, rojo no, ámbar pide el DNI. Si la entrada es de otro día o ya se usó, Franky lo dice al momento.
      </Tip>
    </div>
  );
}

function DoorMode({
  event,
  events,
  onPickEvent,
  fullscreen,
  onToggleFull,
}: {
  event: ProEvent;
  events: ProEvent[];
  onPickEvent: (id: string) => void;
  fullscreen: boolean;
  onToggleFull: () => void;
}) {
  const { data, update } = usePro();
  const toast = useToast();
  const [tick, setTick] = React.useState(() => Date.now());
  const [result, setResult] = React.useState<ScanResult | null>(null);
  const [q, setQ] = React.useState("");
  const [reporting, setReporting] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const nowDate = new Date(tick);
  const phase = eventPhase(event, nowDate);
  const guests = guestsOf(data, event.id);
  const fill = pct(event.checkedIn, event.capacity);
  const rate = entryRate(data, event, nowDate);
  const curve = entryCurve(data, event, nowDate, 32);
  const last = curve.reduce((acc, v, i) => (v > 0 ? i : acc), -1);
  const visibleCurve = curve.slice(Math.max(0, last - 11), last + 1);
  const closed = listClosed(event, nowDate);
  const doorTier = event.tiers.find((t) => t.until === null && t.sold < t.quantity);
  const ops = nightOpsOf(data);
  const cap = capacityState(event);
  const full = cap.level === "full";
  // Quien viene en lista y llega pasada la hora paga esto (su precio propio o la taquilla).
  const latePrice = listClosed(event, nowDate) ? afterCutoffPrice(event) : null;
  const door = doorTotals(ops, event.id);
  const recent = guests
    .filter((g) => g.checkedInAt)
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? ""))
    .slice(0, 8);
  const matches = q.trim().length >= 2 ? guests.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  const checkIn = (guest: ProGuest) => {
    const at = new Date().toISOString();
    update("door.checkin", (d) => ({
      ...d,
      // Si no tenía la edad verificada, la puerta ha visto su documento: solo se apunta la hora.
      guests: d.guests.map((g) =>
        g.id === guest.id ? { ...g, checkedInAt: at, age18: true, ageCheckedAt: g.age18 ? g.ageCheckedAt : at } : g,
      ),
      events: d.events.map((e) => (e.id === guest.eventId ? { ...e, checkedIn: e.checkedIn + 1 } : e)),
      promoters: guest.promoterId ? d.promoters.map((p) => (p.id === guest.promoterId ? { ...p, checkedIn: p.checkedIn + 1 } : p)) : d.promoters,
    }));
    setTick(Date.now());
  };

  const sellDoor = (method: ProPayMethod, name?: string, replacing?: ProGuest) => {
    if (!doorTier) return;
    if (full) {
      toast.error("Aforo completo", "Espera a que salga alguien para vender más taquilla.");
      return;
    }
    const at = new Date().toISOString();
    const guest: ProGuest = {
      id: localId("g"),
      name: name ?? "Taquilla",
      eventId: event.id,
      kind: "ticket",
      tierName: doorTier.name,
      promoterId: replacing?.promoterId,
      checkedInAt: at,
      age18: true,
      university: replacing?.university,
    };
    update("door.sell", (d) => ({
      ...withNightOps(d, (o) => ({
        ...o,
        doorSales: [
          ...o.doorSales,
          { id: localId("ds"), eventId: event.id, at, cents: doorTier.priceCents, method, tierName: doorTier.name, guestName: name },
        ],
      })),
      guests: [...d.guests.filter((g) => g.id !== replacing?.id), guest],
      events: d.events.map((e) =>
        e.id === event.id
          ? { ...e, checkedIn: e.checkedIn + 1, tiers: e.tiers.map((t) => (t.id === doorTier.id ? { ...t, sold: t.sold + 1 } : t)) }
          : e,
      ),
    }));
    setTick(Date.now());
    toast.success(
      `Taquilla cobrada: ${money(doorTier.priceCents)}`,
      `${method === "cash" ? "En efectivo" : "Con tarjeta"}${name ? `. ${name} entra` : ""}.`,
    );
  };

  /** Lista pasada la hora de corte: paga en puerta, entra y cuenta para la caja. */
  const admitLate = (guest: ProGuest, method: ProPayMethod) => {
    if (latePrice === null) return;
    if (full) {
      toast.error("Aforo completo", "Espera a que salga alguien.");
      return;
    }
    const at = new Date().toISOString();
    update("door.late", (d) => ({
      ...withNightOps(d, (o) => ({
        ...o,
        doorSales: [
          ...o.doorSales,
          { id: localId("ds"), eventId: event.id, at, cents: latePrice, method, tierName: "Lista pasada la hora", guestName: guest.name, afterCutoff: true },
        ],
      })),
      guests: d.guests.map((g) => (g.id === guest.id ? { ...g, checkedInAt: at, age18: true } : g)),
      events: d.events.map((e) => (e.id === event.id ? { ...e, checkedIn: e.checkedIn + 1 } : e)),
      promoters: guest.promoterId ? d.promoters.map((p) => (p.id === guest.promoterId ? { ...p, checkedIn: p.checkedIn + 1 } : p)) : d.promoters,
    }));
    setTick(Date.now());
    toast.success(`${guest.name} paga ${money(latePrice)} y entra`, method === "cash" ? "En efectivo" : "Con tarjeta");
  };

  const count = (delta: 1 | -1) => {
    if (delta > 0 && full) {
      toast.error("Aforo completo", "Solo entra alguien cuando sale otra persona.");
      return;
    }
    const at = new Date().toISOString();
    update("door.count", (d) => ({
      // Cada pulsación queda en el registro de aforo cada 15 minutos.
      ...withNightOps(d, (o) => ({ ...o, doorMoves: [...o.doorMoves, { id: localId("dm"), eventId: event.id, at, delta }] })),
      events: d.events.map((e) => {
        if (e.id !== event.id) return e;
        const walk = e.walkIns ?? 0;
        return { ...e, checkedIn: Math.max(0, e.checkedIn + delta), walkIns: Math.max(0, walk + delta) };
      }),
    }));
  };

  /** Lectura de QR: en la app real viene de la cámara; aquí se simula una lectura. */
  const scan = () => {
    const at = Date.now();
    const pending = guests.filter((g) => !g.checkedInAt && g.kind !== "reserved");
    const used = guests.filter((g) => g.checkedInAt);
    const others = data.guests.filter((g) => g.eventId !== event.id);
    const bannedPending = pending.filter((g) => banFor(ops, g.name, nowDate));
    const roll = Math.random();
    let next: ScanResult = { kind: "invalid", at };
    if (roll < 0.1 && used.length) next = { kind: "used", guest: pick(used), at };
    else if (roll < 0.17 && others.length) {
      const g = pick(others);
      const other = data.events.find((e) => e.id === g.eventId);
      if (other) next = { kind: "other", guest: g, event: other, at };
    } else if (roll < 0.21) next = { kind: "invalid", at };
    else if (roll < 0.27 && bannedPending.length) {
      const g = pick(bannedPending);
      next = { kind: "banned", guest: g, ban: banFor(ops, g.name, nowDate) as ProBan, at };
    } else if (pending.length) {
      const g = pick(pending);
      const ban = banFor(ops, g.name, nowDate);
      if (ban) next = { kind: "banned", guest: g, ban, at };
      else if (!g.age18) next = { kind: "age", guest: g, at };
      else if (g.kind === "list" && closed) next = { kind: "list_closed", guest: g, at };
      else if (full) next = { kind: "full", guest: g, at };
      else {
        checkIn(g);
        next = { kind: "ok", guest: g, at };
      }
    }
    setResult(next);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(next.kind === "ok" ? 40 : [80, 60, 80]);
      } catch {
        // sin vibración
      }
    }
  };

  const resolve = (fn: () => void, message: string) => {
    fn();
    setResult(null);
    toast.success(message);
  };

  return (
    <div className={cn("flex flex-col gap-5 p-4 sm:p-6", fullscreen && "mx-auto max-w-6xl pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/60">
            {phase === "live" ? <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400 pro-live" /> : null}
            {phase === "live" ? "Puertas abiertas" : phase === "today" ? `Abres a las ${time(event.doorsOpen)}` : shortDay(event.doorsOpen)}
            <span className="tabular text-white/40">· {time(nowDate.toISOString())}</span>
          </p>
          <p className="mt-1 truncate font-heading text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">{event.name}</p>
        </div>
        <Button variant="glass" size="icon" onClick={onToggleFull} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>
          {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </Button>
      </div>

      {events.length > 1 ? (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pro-scroll" role="tablist" aria-label="Evento">
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={e.id === event.id}
              onClick={() => {
                onPickEvent(e.id);
                setResult(null);
              }}
              className={cn(
                "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors",
                e.id === event.id ? "border-white bg-white text-bg-dark" : "border-white/15 text-white/70 hover:border-white/40 hover:text-white",
              )}
            >
              {e.name.split(" ")[0]} · {shortDay(e.doorsOpen)}
            </button>
          ))}
        </div>
      ) : null}

      {cap.level !== "ok" ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold",
            full ? "bg-rose-600 text-white" : "bg-amber-400 text-amber-950",
          )}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.2} />
          <span>
            {full
              ? `Aforo completo (${event.capacity}). Solo entra alguien cuando sale otra persona.`
              : `Aforo al ${cap.pct} %: quedan ${cap.left} plazas. Avisa a la barra y controla la entrada.`}
          </span>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Aforo */}
        <section className="rounded-3xl border border-white/10 p-5">
          <p className="text-sm font-medium text-white/60">Dentro ahora</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="font-heading text-7xl font-extrabold leading-none tracking-[-0.04em] tabular sm:text-8xl">{event.checkedIn}</span>
            <span className="text-2xl font-semibold text-white/50 tabular">/ {event.capacity}</span>
          </p>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={event.checkedIn} aria-valuemin={0} aria-valuemax={event.capacity} aria-label="Aforo">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", fill >= 95 ? "bg-rose-500" : fill >= 80 ? "bg-amber-400" : "bg-emerald-400")}
              style={{ width: `${Math.min(100, fill)}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-white/70">
            {fill >= 100 ? "Aforo completo: solo entra quien sale." : `${fill} % · quedan ${Math.max(0, event.capacity - event.checkedIn)} plazas`}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="font-heading text-2xl font-bold tabular">{rate.toLocaleString("es-ES")}</p>
              <p className="text-xs text-white/60">entradas por minuto</p>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="font-heading text-2xl font-bold tabular">{event.listCutoff ? (closed ? "Cerrada" : time(event.listCutoff)) : "Sin lista"}</p>
              <p className="text-xs text-white/60">{event.listCutoff ? (closed ? "la lista ya no entra gratis" : "corte de lista") : "entrada libre"}</p>
            </div>
          </div>

          {visibleCurve.length > 1 ? (
            <div className="mt-5">
              <div className="flex h-14 items-end gap-1" aria-hidden>
                {visibleCurve.map((v, i) => {
                  const max = Math.max(1, ...visibleCurve);
                  return <div key={i} className={cn("flex-1 rounded-sm", i === visibleCurve.length - 1 ? "bg-emerald-400" : "bg-white/20")} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />;
                })}
              </div>
              <p className="mt-1 text-[0.7rem] text-white/50">Entradas cada 15 minutos</p>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button variant="glass" size="lg" className="h-14 text-base" onClick={() => count(-1)} aria-label="Sale una persona">
              <Minus className="h-5 w-5" /> Sale
            </Button>
            <Button variant="glass" size="lg" className="h-14 text-base" onClick={() => count(1)} disabled={full} aria-label="Entra una persona sin entrada">
              <Plus className="h-5 w-5" /> Entra
            </Button>
          </div>
          {doorTier ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-white/60">
                Vender {doorTier.name.toLowerCase()} · {money(doorTier.priceCents)}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button variant="glass" size="lg" className="h-14 text-base" onClick={() => sellDoor("cash")} disabled={full}>
                  <Banknote className="h-5 w-5" /> Efectivo
                </Button>
                <Button variant="glass" size="lg" className="h-14 text-base" onClick={() => sellDoor("card")} disabled={full}>
                  <CreditCard className="h-5 w-5" /> Tarjeta
                </Button>
              </div>
            </div>
          ) : null}
          {door.count ? (
            <p className="mt-3 text-xs text-white/60">
              Taquilla esta noche: {money(door.cashCents)} en efectivo y {money(door.cardCents)} con tarjeta. Se suma solo al cierre de caja.
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <Button variant="glass" className="h-12" onClick={() => setReporting(true)}>
              <NotebookPen className="h-4 w-4" /> Incidencia
            </Button>
            <Button
              variant="glass"
              className="h-12"
              onClick={() =>
                downloadCsv(`aforo-${data.space.slug}-${event.date}.csv`, [
                  ["Franja", "Entradas", "Salidas", "Dentro"],
                  ...occupancyLog(data, event, nowDate).map((r) => [minutesToLabel(localMinutes(r.from)), String(r.entries), String(r.exits), String(r.inside)]),
                ])
              }
            >
              <Download className="h-4 w-4" /> Registro de aforo
            </Button>
          </div>
        </section>

        {/* Escáner y lista */}
        <section className="flex flex-col gap-4">
          {guests.length || event.tiers.length ? (
            <Button size="xl" className="h-20 w-full rounded-3xl text-lg" onClick={scan}>
              <ScanLine className="h-6 w-6" /> Escanear
            </Button>
          ) : (
            <div className="rounded-3xl border border-white/10 p-5">
              <p className="font-heading text-lg font-bold">Entrada libre esta noche</p>
              <p className="mt-1 text-sm text-white/60">No hay entradas que escanear. Cuenta el aforo con Entra y Sale: lo ve todo el equipo.</p>
            </div>
          )}

          <div aria-live="assertive" className="min-h-[1px]">
            {result ? (
              <ResultCard
                key={result.at}
                result={result}
                data={data}
                onClose={() => setResult(null)}
                onAdmit={(g) => {
                  if (full) {
                    toast.error("Aforo completo", "Espera a que salga alguien.");
                    return;
                  }
                  resolve(() => checkIn(g), `${g.name} entra`);
                }}
                onPayLate={latePrice !== null ? (g, method) => {
                  admitLate(g, method);
                  setResult(null);
                } : undefined}
                latePrice={latePrice ?? undefined}
              />
            ) : null}
          </div>

          <div className="rounded-3xl border border-white/10 p-4">
            <label className="relative flex items-center">
              <span className="sr-only">Buscar en la lista por nombre</span>
              <Search className="pointer-events-none absolute left-4 h-5 w-5 text-white/50" strokeWidth={1.9} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en lista por nombre" className={darkInput} />
            </label>
            {q.trim().length >= 2 ? (
              matches.length ? (
                <ul className="mt-3 flex flex-col divide-y divide-white/10">
                  {matches.map((g) => {
                    const listBlocked = g.kind === "list" && closed && !g.checkedInAt;
                    const ban = g.checkedInAt ? null : banFor(ops, g.name, nowDate);
                    return (
                      <li key={g.id} className="flex items-center gap-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{g.name}</span>
                          <span className="block truncate text-xs text-white/60">
                            {guestLabel(g)}
                            {promoterName(data, g.promoterId) ? ` · de ${promoterName(data, g.promoterId)?.split(" ")[0]}` : ""}
                            {g.university ? ` · ${shortUni(g.university)}` : ""}
                            {!g.age18 && !g.checkedInAt ? " · pedir DNI" : ""}
                          </span>
                          {ban ? <span className="mt-0.5 block text-xs font-semibold text-rose-300">{ban.reason}</span> : null}
                        </span>
                        {g.checkedInAt ? (
                          <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/70">Dentro {time(g.checkedInAt)}</span>
                        ) : ban ? (
                          <span className="shrink-0 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-bold text-white">
                            <Ban className="mr-1 inline h-3.5 w-3.5" strokeWidth={2.2} />
                            Vetado
                          </span>
                        ) : listBlocked ? (
                          latePrice !== null ? (
                            <span className="flex shrink-0 gap-2">
                              <Button variant="glass" className="h-11 px-3" onClick={() => admitLate(g, "cash")} aria-label={`${g.name} paga ${money(latePrice)} en efectivo`}>
                                <Banknote className="h-4 w-4" /> {money(latePrice)}
                              </Button>
                              <Button variant="glass" className="h-11 px-3" onClick={() => admitLate(g, "card")} aria-label={`${g.name} paga ${money(latePrice)} con tarjeta`}>
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs text-white/60">Lista cerrada</span>
                          )
                        ) : (
                          <Button
                            className="h-11 shrink-0 px-5"
                            disabled={full}
                            onClick={() => {
                              checkIn(g);
                              toast.success(`${g.name} entra`, g.age18 ? guestLabel(g) : "Documento visto, apuntada la hora.");
                            }}
                          >
                            {g.age18 ? "Entra" : "DNI visto, entra"}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-white/60">No hay nadie con ese nombre en esta noche.</p>
              )
            ) : (
              <p className="mt-3 text-xs text-white/50">
                {guests.filter((g) => g.kind === "list").length} en lista · {guests.filter((g) => g.kind === "list" && g.checkedInAt).length} ya dentro
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 p-4">
            <p className="text-sm font-semibold">Últimas entradas</p>
            {recent.length ? (
              <ul className="mt-2 flex flex-col divide-y divide-white/10">
                {recent.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-12 shrink-0 text-xs font-semibold text-white/50 tabular">{time(g.checkedInAt as string)}</span>
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="shrink-0 truncate text-xs text-white/60">
                      {g.ageCheckedAt ? `DNI visto ${time(g.ageCheckedAt)} · ` : ""}
                      {guestLabel(g)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/60">Todavía no ha entrado nadie. Pulsa Escanear cuando llegue el primero.</p>
            )}
          </div>
        </section>
      </div>
      <IncidentDrawer open={reporting} onClose={() => setReporting(false)} event={event} />
    </div>
  );
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function ResultCard({
  result,
  data,
  onClose,
  onAdmit,
  onPayLate,
  latePrice,
}: {
  result: ScanResult;
  data: ProData;
  onClose: () => void;
  onAdmit: (g: ProGuest) => void;
  onPayLate?: (g: ProGuest, method: ProPayMethod) => void;
  latePrice?: number;
}) {
  if (result.kind === "banned") {
    return (
      <div className="animate-page-in rounded-3xl bg-rose-600 p-5 text-white">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
          <Ban className="h-5 w-5" strokeWidth={2.2} /> Acceso denegado
        </p>
        <p className="mt-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.02em]">{result.guest.name}</p>
        <p className="mt-1 text-base font-semibold">{result.ban.reason}</p>
        <p className="mt-1 text-sm text-white/80">
          Vetado desde el {shortDay(result.ban.since)} por {result.ban.by.split(" ")[0]}
          {result.ban.until ? `, hasta el ${shortDay(result.ban.until)}` : ", sin fecha de fin"}.
        </p>
      </div>
    );
  }
  if (result.kind === "full") {
    return (
      <div className="animate-page-in rounded-3xl bg-amber-400 p-5 text-amber-950">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
          <AlertTriangle className="h-5 w-5" strokeWidth={2.2} /> Aforo completo
        </p>
        <p className="mt-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.02em]">{result.guest.name}</p>
        <p className="mt-1 text-base font-semibold">Su entrada es válida. Que espere a que salga alguien y vuelve a escanear.</p>
      </div>
    );
  }
  if (result.kind === "ok") {
    const rp = promoterName(data, result.guest.promoterId);
    return (
      <div className="animate-page-in rounded-3xl bg-emerald-500 p-5 text-emerald-950">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
          <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} /> Entra
        </p>
        <p className="mt-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.02em]">{result.guest.name}</p>
        <p className="mt-1 text-base font-semibold">
          {guestLabel(result.guest)}
          {rp ? ` · RRPP ${rp.split(" ")[0]}` : ""}
          {result.guest.university ? ` · ${shortUni(result.guest.university)}` : ""}
        </p>
      </div>
    );
  }
  if (result.kind === "age" || result.kind === "list_closed") {
    const age = result.kind === "age";
    return (
      <div className="animate-page-in rounded-3xl bg-amber-400 p-5 text-amber-950">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
          <AlertTriangle className="h-5 w-5" strokeWidth={2.2} /> {age ? "+18: comprueba el DNI" : "Lista cerrada"}
        </p>
        <p className="mt-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.02em]">{result.guest.name}</p>
        <p className="mt-1 text-base font-semibold">
          {age
            ? `${guestLabel(result.guest)}. Mira su DNI: no hace falta foto ni número, Franky solo apunta la hora.`
            : `Llega después de la hora de corte${latePrice !== undefined ? `: paga ${money(latePrice)}` : ""}.`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 border-black/20 bg-white/40 text-base text-amber-950 hover:bg-white/60" onClick={onClose}>
            No entra
          </Button>
          {age ? (
            <Button variant="dark" className="h-12 bg-amber-950 text-base text-white" onClick={() => onAdmit(result.guest)}>
              Tiene 18, entra
            </Button>
          ) : onPayLate ? (
            <span className="grid grid-cols-2 gap-2">
              <Button variant="dark" className="h-12 bg-amber-950 px-2 text-base text-white" onClick={() => onPayLate(result.guest, "cash")}>
                <Banknote className="h-4 w-4" /> Efectivo
              </Button>
              <Button variant="dark" className="h-12 bg-amber-950 px-2 text-base text-white" onClick={() => onPayLate(result.guest, "card")}>
                <CreditCard className="h-4 w-4" /> Tarjeta
              </Button>
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  const title = result.kind === "used" ? "Ya usada" : result.kind === "other" ? "Es de otro evento" : "QR no válido";
  const detail =
    result.kind === "used"
      ? `${result.guest.name} entró a las ${time(result.guest.checkedInAt as string)}. No dejes pasar a otra persona con esta entrada.`
      : result.kind === "other"
        ? `${result.guest.name} tiene entrada para ${result.event.name}, ${shortDay(result.event.doorsOpen)}.`
        : "Este código no es una entrada de Franky. Pide que abra la entrada en la app.";
  return (
    <div className="animate-page-in rounded-3xl bg-rose-600 p-5 text-white">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em]">
        <XCircle className="h-5 w-5" strokeWidth={2.2} /> No entra
      </p>
      <p className="mt-2 font-heading text-3xl font-extrabold leading-tight tracking-[-0.02em]">{title}</p>
      <p className="mt-1 text-base">{detail}</p>
    </div>
  );
}
