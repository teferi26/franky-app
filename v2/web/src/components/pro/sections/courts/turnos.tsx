"use client";

import * as React from "react";
import { AlertTriangle, Plus, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProCourtSeries, ProSeriesClash } from "@/lib/pro/courts-types";
import { dayLabel, localDate, money, plural } from "@/lib/pro/format";
import { clockLabel, courtsOps } from "@/lib/pro/courts-base";
import {
  clashAlternatives,
  createSeries,
  endOfCourse,
  endSeries,
  planSeries,
  resolveClash,
} from "@/lib/pro/courts-ops";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, Empty, FormField, Pill, Tip, inputClass } from "../../kit";
import { TONES } from "../../tones";
import { WhatsAppLink, firstName } from "./booking-ops";

/**
 * Turnos fijos: el mismo grupo, la misma pista, el mismo día y hora cada
 * semana hasta fin de curso. Es lo que llena las tardes todo el año. Las
 * semanas que chocan se listan para resolverlas una a una.
 */

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DAYS_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

const CLASH_LABEL: Record<ProSeriesClash["reason"], string> = {
  booked: "Ocupada",
  blocked: "Bloqueada",
  closed: "Cerrado",
};

function dateLabel(date: string) {
  return dayLabel(`${date}T12:00:00Z`);
}

export function SeriesView({ onNew }: { onNew: () => void }) {
  const { data, now } = usePro();
  const today = localDate(now);
  const series = courtsOps(data).series.filter((s) => s.active);
  const ended = courtsOps(data).series.filter((s) => !s.active);
  const openClashes = series.reduce(
    (a, s) => a + s.clashes.filter((c) => c.status === "open" && c.date >= today).length,
    0,
  );
  const upcoming = series.reduce(
    (a, s) =>
      a +
      data.bookings.filter(
        (b) => s.bookingIds.includes(b.id) && b.status !== "cancelled" && localDate(b.start) >= today,
      ).length,
    0,
  );

  if (!series.length) {
    return (
      <div className="rounded-2xl border border-border bg-bg-primary">
        <Empty
          icon={Repeat}
          title="Ningún turno fijo todavía"
          body="El grupo que juega cada martes a las 19:30 no tiene que llamarte cada semana. Créale su turno hasta fin de curso y la pista queda reservada."
          action={
            <Button variant="dark" onClick={onNew}>
              <Plus className="h-4 w-4" /> Nuevo turno fijo
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Stat label="Turnos fijos" value={series.length} hint="grupos que vuelven cada semana" />
        <Stat label="Reservas ya hechas" value={upcoming} hint="de aquí a fin de curso" />
        <Stat
          label="Semanas por resolver"
          value={openClashes}
          hint={openClashes ? "chocan con otra reserva o un bloqueo" : "todo encaja"}
          warn={openClashes > 0}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {series.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>

      {ended.length ? (
        <p className="text-sm text-text-muted">
          {plural(ended.length, "turno dado de baja", "turnos dados de baja")}: {ended.map((s) => s.clientName).join(", ")}.
        </p>
      ) : null}

      <Tip title="Por qué conviene">
        Un turno fijo es una pista vendida cada semana sin llamadas ni mensajes. Si una semana choca con un
        torneo o un festivo, lo ves aquí y le propones otra pista u hora con un toque.
      </Tip>
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: number; hint: string; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5",
        warn ? "border-amber-300/70 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-border bg-bg-primary",
      )}
    >
      <p className="text-[0.8rem] font-medium text-text-muted">{label}</p>
      <p className="mt-1 font-heading text-[1.6rem] font-extrabold leading-none tabular">{value}</p>
      <p className="mt-1.5 truncate text-xs text-text-muted">{hint}</p>
    </div>
  );
}

function SeriesCard({ series: s }: { series: ProCourtSeries }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const [open, setOpen] = React.useState(false);
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const resource = data.resources.find((r) => r.id === s.resourceId);
  const bookings = data.bookings
    .filter((b) => s.bookingIds.includes(b.id) && b.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = bookings.find((b) => localDate(b.start) >= today);
  const left = bookings.filter((b) => localDate(b.start) >= today).length;
  const clashes = s.clashes.filter((c) => c.status === "open" && c.date >= today);

  const end = () => {
    update("court.series.end", (d) => endSeries(d, s.id, today));
    toast.success("Turno dado de baja", `Se liberan ${plural(left, "semana", "semanas")} de la ${resource?.name.toLowerCase()}.`);
    setConfirmEnd(false);
  };

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-heading text-lg font-bold">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONES[resource?.tone ?? "slate"].dot)} />
            <span className="truncate">{s.clientName}</span>
          </p>
          <p className="mt-0.5 text-sm text-text-muted">
            {resource?.name}, los {DAYS_PLURAL[s.weekday]} de {clockLabel(s.from)} a {clockLabel(s.from + s.duration)}
          </p>
        </div>
        {clashes.length ? (
          <Pill tone="warning">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.9} /> {clashes.length} por resolver
          </Pill>
        ) : (
          <Pill tone="success">Todo reservado</Pill>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-text-muted">Próxima</p>
          <p className="font-semibold">{next ? dateLabel(localDate(next.start)).split(",")[1]?.trim() ?? "" : "Ninguna"}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Quedan</p>
          <p className="font-semibold tabular">{plural(left, "semana", "semanas")}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Cada semana</p>
          <p className="font-semibold tabular">{money(s.priceCents)}</p>
        </div>
      </div>

      {clashes.length ? (
        <div className="mt-3">
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen(!open)}>
            {open ? "Ocultar" : "Resolver semanas que chocan"}
          </Button>
          {open ? (
            <ul className="mt-3 flex flex-col gap-2.5">
              {clashes.map((c) => (
                <ClashRow key={c.date} series={s} clash={c} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-light pt-3">
        <span className="text-xs text-text-muted">Hasta el {dateLabel(s.until).split(",")[1]?.trim()}</span>
        {confirmEnd ? (
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmEnd(false)}>No</Button>
            <Button size="sm" variant="outline" className="text-rose-600" onClick={end}>
              Sí, liberar {plural(left, "semana", "semanas")}
            </Button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmEnd(true)} className="min-h-10 text-sm font-semibold text-rose-600">
            Dar de baja
          </button>
        )}
      </div>
    </section>
  );
}

function ClashRow({ series: s, clash }: { series: ProCourtSeries; clash: ProSeriesClash }) {
  const { data, update } = usePro();
  const toast = useToast();
  const options = clashAlternatives(data, s, clash.date);
  const name = (id: string) => data.resources.find((r) => r.id === id)?.name ?? "";

  const move = (o: { resourceId: string; from: number }) => {
    update("court.series.move", (d) =>
      resolveClash(d, { seriesId: s.id, date: clash.date, action: { move: o }, bookingId: localId("b") }),
    );
    toast.success("Semana resuelta", `${name(o.resourceId)} a las ${clockLabel(o.from)} el ${dateLabel(clash.date)}.`);
  };
  const skip = () => {
    update("court.series.skip", (d) =>
      resolveClash(d, { seriesId: s.id, date: clash.date, action: "skip", bookingId: localId("b") }),
    );
    toast.success("Semana sin reserva", `El ${dateLabel(clash.date)} no juegan. Avísales si no lo saben.`);
  };

  return (
    <li className="rounded-xl bg-bg-secondary p-3">
      <p className="text-sm font-semibold">{dateLabel(clash.date)}</p>
      <p className="text-xs text-text-muted">
        {CLASH_LABEL[clash.reason]}
        {clash.withName ? `: ${clash.withName}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={`${o.resourceId}-${o.from}`}
            type="button"
            onClick={() => move(o)}
            className="inline-flex min-h-10 items-center rounded-full border border-border bg-bg-primary px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
          >
            {name(o.resourceId)} · {clockLabel(o.from)}
          </button>
        ))}
        <button
          type="button"
          onClick={skip}
          className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-semibold text-text-muted hover:text-text-primary"
        >
          Esa semana no juegan
        </button>
      </div>
      {!options.length ? <p className="mt-1 text-xs text-text-muted">No hay otra pista libre cerca de esa hora.</p> : null}
      <div className="mt-2">
        <WhatsAppLink
          phone={s.phone}
          label={`Preguntar a ${firstName(s.clientName)}`}
          message={`Hola ${firstName(s.clientName)}, el ${dateLabel(clash.date)} tu pista de siempre no está disponible en ${data.space.name}.${options[0] ? ` Te podemos dar la ${name(options[0].resourceId).toLowerCase()} a las ${clockLabel(options[0].from)}.` : ""} ¿Os viene bien?`}
        />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo turno fijo                                                    */
/* ------------------------------------------------------------------ */

export function NewSeriesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const courts = data.resources.filter((r) => r.kind === "court" || r.kind === "room");
  const [name, setName] = React.useState("");
  const [clientId, setClientId] = React.useState<string | undefined>();
  const [phone, setPhone] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [weekday, setWeekday] = React.useState(1);
  const [from, setFrom] = React.useState(19 * 60 + 30);
  const [duration, setDuration] = React.useState(90);
  const [startDate, setStartDate] = React.useState(today);
  const [until, setUntil] = React.useState(endOfCourse(today));

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setClientId(undefined);
    setPhone("");
    setResourceId(courts[0]?.id ?? "");
    setWeekday(1);
    setFrom(19 * 60 + 30);
    setDuration(90);
    setStartDate(today);
    setUntil(endOfCourse(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hours = data.space.hours[weekday];
  const times: number[] = [];
  if (hours) for (let m = hours.open; m + duration <= hours.close; m += 30) times.push(m);
  const spec = {
    resourceId,
    weekday,
    from,
    duration,
    startDate,
    until,
    clientId,
    clientName: name.trim(),
    phone: phone.trim() || undefined,
  };
  const plan = open && resourceId && until >= startDate ? planSeries(data, spec) : { free: [], clashes: [] };
  const q = name.trim().toLowerCase();
  const suggestions =
    q.length >= 2 && !clientId ? data.clients.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 4) : [];
  const valid = name.trim().length >= 2 && Boolean(resourceId) && plan.free.length > 0 && times.includes(from);

  const save = () => {
    if (!valid) return;
    update("court.series.create", (d) =>
      createSeries(d, spec, { id: localId("tf"), now: new Date().toISOString(), newId: localId }).data,
    );
    toast.success(
      "Turno fijo creado",
      `${plural(plan.free.length, "semana reservada", "semanas reservadas")}${plan.clashes.length ? `; ${plural(plan.clashes.length, "choca", "chocan")} y las tienes para resolver` : ""}.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo turno fijo"
      description="La misma pista cada semana hasta la fecha que elijas."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Reservar {plural(plan.free.length, "semana", "semanas")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Quién juega" htmlFor="tf-name" hint="El que organiza el grupo.">
          <input
            id="tf-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setClientId(undefined);
            }}
            placeholder="Nombre y apellido"
            autoComplete="off"
            className={inputClass}
          />
          {suggestions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setName(c.name);
                    setClientId(c.id);
                    setPhone(c.phone ?? "");
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </FormField>
        <FormField label="Móvil" htmlFor="tf-phone" hint="Para avisarle si una semana cambia.">
          <input id="tf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} />
        </FormField>

        <FormField label="Pista">
          <ChoiceChips value={resourceId} onChange={setResourceId} options={courts.map((r) => ({ value: r.id, label: r.name }))} />
        </FormField>

        <FormField label="Día de la semana">
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={weekday === i}
                aria-label={d}
                disabled={!data.space.hours[i]}
                onClick={() => setWeekday(i)}
                className={cn(
                  "h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-30",
                  weekday === i ? "border-violet bg-violet text-white" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {d.slice(0, 1)}
              </button>
            ))}
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Hora" htmlFor="tf-from">
            <select id="tf-from" value={from} onChange={(e) => setFrom(Number(e.target.value))} className={inputClass}>
              {times.map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Duración">
            <ChoiceChips
              value={String(duration)}
              onChange={(v) => setDuration(Number(v))}
              options={[60, 90, 120].map((d) => ({ value: String(d), label: `${d} min` }))}
            />
          </FormField>
          <FormField label="Desde" htmlFor="tf-start">
            <input id="tf-start" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta" htmlFor="tf-until" hint="Por defecto, fin de curso.">
            <input id="tf-until" type="date" min={startDate} value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
          </FormField>
        </div>

        {resourceId && times.includes(from) ? (
          <div className="rounded-2xl bg-bg-secondary p-4">
            <p className="font-heading text-2xl font-extrabold tabular">{plural(plan.free.length, "semana", "semanas")}</p>
            <p className="mt-1 text-sm text-text-muted">
              libres los {DAYS_PLURAL[weekday]} a las {clockLabel(from)}
              {plan.clashes.length ? `. ${plural(plan.clashes.length, "semana choca", "semanas chocan")}:` : ", sin ningún choque."}
            </p>
            {plan.clashes.length ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {plan.clashes.slice(0, 5).map((c) => (
                  <li key={c.date}>
                    {dateLabel(c.date)}: {CLASH_LABEL[c.reason].toLowerCase()}
                    {c.withName ? ` (${c.withName})` : ""}
                  </li>
                ))}
                {plan.clashes.length > 5 ? <li className="text-text-muted">y {plan.clashes.length - 5} más</li> : null}
              </ul>
            ) : null}
            {plan.clashes.length ? (
              <p className="mt-2 text-xs text-text-muted">Se reservan las libres y las demás quedan en Turnos fijos para resolverlas una a una.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
