"use client";

import * as React from "react";
import { Armchair, KeyRound, Lamp, Plug, Plus, Timer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProLocker, ProSeat } from "@/lib/pro/courts-types";
import { durationLabel, localDate, localMinutes, plural } from "@/lib/pro/format";
import { isShared } from "@/lib/pro/courts";
import { patchCourts } from "@/lib/pro/courts-base";
import {
  assignFixedSeat,
  lockerState,
  seatStates,
  setLocker,
  setSeatGroup,
  studyRanking,
  type SeatState,
} from "@/lib/pro/courts-desk";
import { addLocker, lockerStats, rentLocker } from "@/lib/pro/courts-admin";
import { cn } from "@/lib/utils";
import {
  Avatar,
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
  StepNav,
  inputClass,
} from "../../kit";
import { WhatsAppLink, firstName } from "./booking-ops";
import { PeopleDrawer } from "./people-drawer";
import { monthlyStudySummaries, studyHoursLabel, summaryMonth } from "@/lib/pro/courts-study";
import { monthName } from "@/lib/pro/courts-growth";
import { CourtsNotReady, shortDate, useCourtsState, useInitialView } from "./state";

/**
 * Puestos de la sala de estudio: el plano de cada zona en directo, puestos
 * fijos de los socios de cuota mensual, bloques por carrera u oposición,
 * taquillas ligadas a la cuota y las horas que lleva estudiadas cada uno.
 */

const VIEWS = ["plano", "taquillas", "horas"] as const;
type View = (typeof VIEWS)[number];

const SEAT_STYLE: Record<SeatState["state"], string> = {
  free: "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  occupied: "border-violet bg-violet text-white",
  reserved: "border-violet/40 bg-violet-50 text-violet-deep",
  fixed: "border-border bg-bg-secondary text-text-secondary",
};

const SEAT_LABEL: Record<SeatState["state"], string> = {
  free: "Libre",
  occupied: "Ocupado",
  reserved: "Reservado, sin llegar",
  fixed: "Puesto fijo",
};

export default function PuestosSection() {
  const { ready } = useCourtsState();
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Puestos" title="Puestos y taquillas" />
        <CourtsNotReady
          icon={Armchair}
          title="El plano de tu sala"
          body="Numera tus puestos, asigna puestos fijos a los socios de cuota mensual y controla las taquillas."
        />
      </div>
    );
  return <Puestos />;
}

function Puestos() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [view, setView] = useInitialView<View>(VIEWS, "plano");
  const [seatId, setSeatId] = React.useState<string | null>(null);
  const [lockerId, setLockerId] = React.useState<string | null>(null);
  const zones = data.resources.filter((r) => isShared(r) && ops.seats.some((s) => s.resourceId === r.id));
  const states = zones.flatMap((z) => seatStates(data, z.id, today, nowMin));
  const busy = states.filter((s) => s.state === "occupied" || s.state === "reserved").length;
  const fixed = ops.seats.filter((s) => s.fixedMemberId).length;
  const lockers = lockerStats(ops.lockers, today);
  const month = today.slice(0, 7);
  const ranking = studyRanking(data, month, now);

  const description =
    view === "plano"
      ? ops.seats.length
        ? `Ahora ${busy} de ${ops.seats.length} puestos ocupados o reservados. ${plural(fixed, "puesto fijo", "puestos fijos")} de socios.`
        : "Numera tus puestos para saber quién se sienta dónde."
      : view === "taquillas"
        ? `${lockers.active} alquiladas, ${plural(lockers.free, "libre", "libres")}${lockers.expired ? ` y ${plural(lockers.expired, "vencida", "vencidas")} para vaciar o cobrar` : ""}.`
        : ranking.length
          ? `${plural(ranking.length, "persona ha", "personas han")} estudiado aquí este mes, ${durationLabel(ranking.reduce((a, r) => a + r.minutes, 0))} en total.`
          : "Las horas salen solas de las entradas y salidas en recepción.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Puestos"
        title={view === "plano" ? "Plano de la sala" : view === "taquillas" ? "Taquillas" : "Horas de estudio"}
        description={description}
        actions={
          view === "taquillas" ? (
            <Button
              variant="dark"
              onClick={async () => {
                const ok = await update("court.locker.add", (d) => addLocker(d, localId("tq")));
                if (ok) toast.success("Taquilla añadida", "Ya puedes alquilarla.");
              }}
            >
              <Plus className="h-4 w-4" /> Añadir taquilla
            </Button>
          ) : null
        }
      >
        <Segmented
          label="Puestos"
          value={view}
          onChange={setView}
          options={[
            { value: "plano", label: "Plano" },
            { value: "taquillas", label: "Taquillas", count: lockers.expired || undefined },
            { value: "horas", label: "Horas" },
          ]}
        />
      </PageHeader>

      {view === "plano" ? (
        zones.length ? (
          <div className="flex flex-col gap-5">
            {zones.map((z) => (
              <ZoneMap key={z.id} resourceId={z.id} onOpen={setSeatId} />
            ))}
            <div className="flex flex-wrap gap-3 text-xs text-text-muted">
              {(Object.keys(SEAT_LABEL) as SeatState["state"][]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span className={cn("h-3 w-3 rounded-[4px] border", SEAT_STYLE[k])} /> {SEAT_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-bg-primary">
            <Empty
              icon={Armchair}
              title="Aún no hay puestos numerados"
              body="Crea tus zonas compartidas en Espacios y numera sus puestos aquí: así cada socio sabe cuál es el suyo."
            />
          </div>
        )
      ) : view === "taquillas" ? (
        <LockersView onOpen={setLockerId} />
      ) : (
        <HoursView />
      )}

      <SeatDrawer id={seatId} onClose={() => setSeatId(null)} />
      <LockerDrawer id={lockerId} onClose={() => setLockerId(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Plano                                                               */
/* ------------------------------------------------------------------ */

function ZoneMap({ resourceId, onOpen }: { resourceId: string; onOpen: (id: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const zone = data.resources.find((r) => r.id === resourceId);
  const states = seatStates(data, resourceId, today, localMinutes(now));
  const taken = states.filter((s) => s.state === "occupied" || s.state === "reserved").length;
  const groups = [...new Set(states.map((s) => s.seat.group).filter(Boolean))] as string[];

  const addSeat = async () => {
    const prefix = states[0]?.seat.label.split("-")[0] ?? zone?.name.slice(0, 1).toUpperCase() ?? "P";
    const label = `${prefix}-${String(states.length + 1).padStart(2, "0")}`;
    const seat: ProSeat = { id: localId("st"), resourceId, label, plug: true, lamp: false };
    const ok = await update("court.seat.add", (d) => patchCourts(d, (o) => ({ seats: [...o.seats, seat] })));
    if (ok) toast.success("Puesto añadido", `${label} en ${zone?.name ?? "la zona"}.`);
  };

  return (
    <Panel
      title={`${zone?.name ?? "Zona"}: ${taken} de ${states.length} ocupados`}
      description={groups.length ? `Bloques: ${groups.join(", ")}` : undefined}
      action={
        <Button size="sm" variant="outline" className="min-h-10" onClick={addSeat}>
          <Plus className="h-3.5 w-3.5" /> Puesto
        </Button>
      }
    >
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {states.map((s) => {
          const who = s.booking?.clientName ?? s.seat.fixedName;
          return (
            <button
              key={s.seat.id}
              type="button"
              onClick={() => onOpen(s.seat.id)}
              aria-label={`${s.seat.label}: ${SEAT_LABEL[s.state]}${who ? `, ${who}` : ""}`}
              className={cn(
                "flex min-h-[64px] flex-col justify-between rounded-xl border p-2 text-left transition-transform active:scale-[0.97]",
                SEAT_STYLE[s.state],
              )}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="font-heading text-sm font-bold tabular">{s.seat.label}</span>
                <span className="flex gap-0.5 opacity-70">
                  {s.seat.plug ? <Plug className="h-3 w-3" strokeWidth={1.9} /> : null}
                  {s.seat.lamp ? <Lamp className="h-3 w-3" strokeWidth={1.9} /> : null}
                </span>
              </span>
              <span className="truncate text-[0.7rem] font-medium">{who ? firstName(who) : s.seat.group ?? ""}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function SeatDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const { ops } = useCourtsState();
  const toast = useToast();
  const seat = ops.seats.find((s) => s.id === id) ?? null;
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState("");

  React.useEffect(() => {
    setQuery("");
    setGroup(seat?.group ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!seat) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const state = seatStates(data, seat.resourceId, localDate(now), localMinutes(now)).find((s) => s.seat.id === seat.id);
  const zone = data.resources.find((r) => r.id === seat.resourceId);
  const q = query.trim().toLowerCase();
  // Los puestos fijos son para socios de cuota mensual que están al día o en pausa.
  const candidates =
    q.length >= 2
      ? data.members.filter((m) => m.status !== "cancelled" && m.name.toLowerCase().includes(q)).slice(0, 5)
      : [];
  const knownGroups = [...new Set(ops.seats.map((s) => s.group).filter(Boolean))] as string[];

  const assign = async (member: { id: string; name: string } | null) => {
    const ok = await update("court.seat.fixed", (d) => assignFixedSeat(d, seat.id, member));
    if (ok) {
      toast.success(member ? "Puesto fijo asignado" : "Puesto liberado", member ? `${seat.label} es de ${firstName(member.name)}.` : `${seat.label} vuelve a estar para cualquiera.`);
      setQuery("");
    }
  };

  const toggle = (key: "plug" | "lamp") =>
    void update("court.seat.edit", (d) =>
      patchCourts(d, (o) => ({ seats: o.seats.map((s) => (s.id === seat.id ? { ...s, [key]: !s[key] } : s)) })),
    );

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Puesto ${seat.label}`}
      description={`${zone?.name ?? ""}${state ? `. ${SEAT_LABEL[state.state]}` : ""}${state?.booking ? `: ${state.booking.clientName}` : ""}`}
    >
      <div className="flex flex-col gap-6">
        <section>
          <p className="eyebrow mb-2">Puesto fijo</p>
          {seat.fixedMemberId ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <Avatar name={seat.fixedName ?? ""} size="sm" tone="violet" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{seat.fixedName}</span>
              <Button size="sm" variant="outline" className="min-h-10" onClick={() => assign(null)}>
                Quitar
              </Button>
            </div>
          ) : (
            <FormField label="Asignar a un socio" htmlFor="seat-member" hint="Nadie más lo reserva; si no viene, sigue siendo suyo.">
              <input
                id="seat-member"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                placeholder="Busca por nombre"
                className={inputClass}
              />
              {candidates.length ? (
                <ul className="flex flex-col divide-y divide-border-light rounded-xl border border-border">
                  {candidates.map((m) => {
                    const other = ops.seats.find((s) => s.fixedMemberId === m.id);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => assign({ id: m.id, name: m.name })}
                          className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-bg-secondary"
                        >
                          <span className="font-medium">{m.name}</span>
                          <span className="text-xs text-text-muted">{other ? `Ahora en ${other.label}` : ""}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </FormField>
          )}
        </section>

        <section>
          <p className="eyebrow mb-2">Bloque por carrera u oposición</p>
          <div className="flex gap-2">
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Mesa de Medicina"
              aria-label="Bloque"
              maxLength={40}
              className={inputClass}
            />
            <Button
              variant="outline"
              className="min-h-10 shrink-0"
              disabled={(group.trim() || undefined) === seat.group}
              onClick={() => void update("court.seat.group", (d) => setSeatGroup(d, [seat.id], group.trim() || undefined))}
            >
              Guardar
            </Button>
          </div>
          {knownGroups.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {knownGroups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                >
                  {g}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <p className="eyebrow mb-2">Qué tiene</p>
          <div className="flex gap-2">
            {(["plug", "lamp"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={seat[key]}
                onClick={() => toggle(key)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold",
                  seat[key] ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                )}
              >
                {key === "plug" ? <Plug className="h-4 w-4" strokeWidth={1.9} /> : <Lamp className="h-4 w-4" strokeWidth={1.9} />}
                {key === "plug" ? "Enchufe" : "Lámpara"}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Taquillas                                                           */
/* ------------------------------------------------------------------ */

const LOCKER_STYLE = {
  free: "border-emerald-500/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
  active: "border-border bg-bg-primary text-text-primary",
  expired: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
} as const;

function LockersView({ onOpen }: { onOpen: (id: string) => void }) {
  const { now } = usePro();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const stats = lockerStats(ops.lockers, today);
  if (!ops.lockers.length)
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={KeyRound}
          title="Sin taquillas"
          body="Añade tus taquillas y alquílalas junto a la cuota: si la cuota vence, lo verás aquí para cobrar o vaciar."
        />
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi label="Alquiladas" value={stats.active} icon={KeyRound} />
        <Kpi label="Libres" value={stats.free} emphasis={stats.free > 0} hint="para ofrecer al alta" />
        <Kpi label="Vencidas" value={stats.expired} hint={stats.expired ? "cobra o vacía" : "todo al día"} />
        <Kpi label="Total" value={ops.lockers.length} />
      </KpiRow>
      <Panel flush>
        <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5 sm:p-5 lg:grid-cols-8">
          {ops.lockers.map((l) => {
            const state = lockerState(l, today);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onOpen(l.id)}
                className={cn("flex min-h-[72px] flex-col justify-between rounded-xl border p-2.5 text-left", LOCKER_STYLE[state])}
              >
                <span className="font-heading text-sm font-bold tabular">{l.label}</span>
                <span className="truncate text-[0.7rem] font-medium">
                  {state === "free" ? "Libre" : state === "expired" ? "Para vaciar" : firstName(l.name ?? "")}
                </span>
                {l.until && state !== "free" ? (
                  <span className="text-[0.65rem] opacity-70">hasta {shortDate(l.until).split(" ").slice(1).join(" ")}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function LockerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const { ops } = useCourtsState();
  const toast = useToast();
  const today = localDate(now);
  const locker: ProLocker | null = ops.lockers.find((l) => l.id === id) ?? null;
  const [query, setQuery] = React.useState("");
  React.useEffect(() => setQuery(""), [id]);
  if (!locker) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const state = lockerState(locker, today);
  const q = query.trim().toLowerCase();
  const candidates = q.length >= 2 ? data.members.filter((m) => m.status !== "cancelled" && m.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const member = data.members.find((m) => m.id === locker.memberId);

  const rent = async (who: { memberId?: string; name: string }, label: string) => {
    const ok = await update("court.locker.rent", (d) => rentLocker(d, locker.id, who, today));
    if (ok) {
      toast.success(label, `${locker.label} para ${firstName(who.name)} un mes más.`);
      onClose();
    }
  };

  const release = async () => {
    const ok = await update("court.locker.release", (d) => setLocker(d, locker.id, null));
    if (ok) {
      toast.success("Taquilla libre", `${locker.label} ya se puede alquilar a otra persona.`);
      onClose();
    }
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Taquilla ${locker.label}`}
      description={
        state === "free"
          ? "Libre"
          : `${locker.name}${locker.until ? `, ${state === "expired" ? "venció" : "pagada hasta"} el ${shortDate(locker.until)}` : ""}`
      }
      footer={
        state === "free" ? undefined : (
          <>
            <Button variant="ghost" className="mr-auto text-rose-600" onClick={release}>
              <Trash2 className="h-4 w-4" /> Vaciar
            </Button>
            {state === "expired" ? (
              <WhatsAppLink
                phone={member?.phone}
                label="Recordar"
                message={`Hola ${firstName(locker.name ?? "")}, tu taquilla ${locker.label} de ${data.space.name} venció el ${shortDate(locker.until ?? today)}. ¿La renovamos otro mes? Si no, pásate a recoger tus cosas.`}
              />
            ) : null}
            <Button variant="dark" onClick={() => rent({ memberId: locker.memberId, name: locker.name ?? "" }, "Taquilla renovada")}>
              Renovar un mes
            </Button>
          </>
        )
      }
    >
      {state === "free" ? (
        <FormField label="Alquilar a" htmlFor="tq-member" hint="Un mes desde hoy. Se renueva desde aquí.">
          <input id="tq-member" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" placeholder="Busca un socio" className={inputClass} />
          {candidates.length ? (
            <ul className="flex flex-col divide-y divide-border-light rounded-xl border border-border">
              {candidates.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => rent({ memberId: m.id, name: m.name }, "Taquilla alquilada")}
                    className="flex min-h-11 w-full items-center px-3 text-left text-sm font-medium hover:bg-bg-secondary"
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </FormField>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <Avatar name={locker.name ?? ""} size="sm" tone={state === "expired" ? "amber" : "violet"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{locker.name}</span>
            <span className="block text-xs text-text-muted">{member ? `Socio desde ${shortDate(localDate(member.since))}` : "Sin ficha de socio"}</span>
          </span>
          <Pill tone={state === "expired" ? "warning" : "success"}>{state === "expired" ? "Vencida" : "Al día"}</Pill>
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Horas estudiadas                                                    */
/* ------------------------------------------------------------------ */

function HoursView() {
  const { data, now } = usePro();
  const today = localDate(now);
  // A primeros de mes, lo que toca mandar es el resumen del mes que acaba de cerrar.
  const [month, setMonth] = React.useState(summaryMonth(today) ?? today.slice(0, 7));
  const [sending, setSending] = React.useState(false);
  const summaries = monthlyStudySummaries(data, month, now);
  const max = Math.max(1, ...summaries.map((r) => r.minutes));
  const closed = month < today.slice(0, 7) || summaryMonth(today) === month;
  const shift = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <>
      <Panel
        title={`Quién más estudia en ${monthName(month)}`}
        description={
          closed
            ? "Manda a cada uno sus horas del mes: fideliza más que un descuento."
            : "Las horas salen de las entradas y salidas en recepción. A fin de mes, manda el resumen."
        }
        action={
          summaries.length && closed ? (
            <Button size="sm" variant="dark" className="min-h-10" onClick={() => setSending(true)}>
              Enviar a todos
            </Button>
          ) : null
        }
        flush
      >
        <div className="border-b border-border-light px-4 py-2.5 sm:px-5">
          <StepNav
            label={`${monthName(month)} de ${month.slice(0, 4)}`}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            onToday={() => setMonth(today.slice(0, 7))}
            isToday={month === today.slice(0, 7)}
          />
        </div>
        {summaries.length ? (
          <RowList>
            {summaries.slice(0, 30).map((r) => (
              <div key={r.personId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <span className="w-5 text-right font-heading font-bold tabular text-text-muted">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="mt-1 block h-1.5 max-w-[240px] overflow-hidden rounded-full bg-bg-tertiary">
                    <span className="block h-full rounded-full bg-violet" style={{ width: `${Math.round((r.minutes / max) * 100)}%` }} />
                  </span>
                </span>
                <span className="font-heading text-base font-extrabold tabular">{studyHoursLabel(r.minutes)}</span>
                <WhatsAppLink phone={r.phone} label="Enviar resumen" message={r.message} />
              </div>
            ))}
          </RowList>
        ) : (
          <Empty icon={Timer} title="Sin horas ese mes" body="Marca las entradas y salidas en Recepción y aquí verás quién más estudia." />
        )}
      </Panel>
      <PeopleDrawer
        open={sending}
        onClose={() => setSending(false)}
        title={`Resumen de ${monthName(month)}`}
        description="Un mensaje por persona con sus horas de estudio."
        people={summaries.map((s) => ({
          id: s.personId,
          name: s.name,
          phone: s.phone,
          detail: `${studyHoursLabel(s.minutes)} · puesto ${s.rank}`,
          message: s.message,
        }))}
        emptyIcon={Timer}
        emptyTitle="Nadie ha estudiado ese mes"
        emptyBody="Cuando marques entradas en Recepción, aquí saldrá su resumen."
        cta="Enviar"
      />
    </>
  );
}
