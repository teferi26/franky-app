"use client";

import * as React from "react";
import { Check, Music2, Plus, Trash2, Trophy, Tv, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProVenueEvent, ProVenueEventBooking } from "@/lib/pro/tables-types";
import { eventStats, upcomingEvents } from "@/lib/pro/tables-ops";
import {
  VENUE_EVENT_KIND_LABEL,
  eventInviteMessage,
} from "@/lib/pro/tables-insights";
import {
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
  IconButton,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Tip,
  inputClass,
} from "../../kit";
import { OpsMissing, Stepper, WhatsAppButton, eurosText, parseEuros, useTablesOps } from "./ops-kit";

export default function TablesPartidos() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  if (!ops) return <OpsMissing icon={Tv} title="Sin partidos ni eventos" />;
  const list = upcomingEvents(ops, now);
  const stats = list.map((e) => ({ event: e, s: eventStats(e) }));
  const people = stats.reduce((a, x) => a + x.s.people, 0);
  const pendingDeposits = stats.reduce((a, x) => a + x.s.depositsPending, 0);
  const next = list[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Partidos y eventos"
        title="Que la pantalla grande se pague sola"
        description={
          next
            ? `Próximo: ${next.title}, ${localDate(next.start) === localDate(now) ? "hoy" : dayLabel(next.start)} a las ${time(next.start)}. ${plural(eventStats(next).people, "persona reservada", "personas reservadas")} de ${next.capacity}.`
            : "Crea cada partido, previa o noche especial con su aforo, su menú y su consumo mínimo. Los estudiantes reservan desde tu ficha."
        }
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo partido o evento
          </Button>
        }
      />

      <KpiRow>
        <Kpi icon={Tv} label="Próximos" value={list.length} hint={`${list.filter((e) => e.published).length} publicados en Franky`} />
        <Kpi icon={Users} label="Personas reservadas" value={people} emphasis={people > 0} />
        <Kpi label="Señales pendientes" value={pendingDeposits} hint={pendingDeposits ? "pídelas por WhatsApp" : "todas cobradas"} />
        <Kpi label="Consumo mínimo" value={money(stats.reduce((a, x) => a + x.s.minimumCents, 0), { round: true })} hint="comprometido en las reservas" />
      </KpiRow>

      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stats.map(({ event, s }) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setOpen(event.id)}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-colors hover:border-text-primary/20"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted">
                  {event.kind === "partido" ? (
                    <Trophy className="h-3.5 w-3.5" strokeWidth={1.9} />
                  ) : event.kind === "previa" ? (
                    <Music2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                  ) : (
                    <Users className="h-3.5 w-3.5" strokeWidth={1.9} />
                  )}
                  {VENUE_EVENT_KIND_LABEL[event.kind]} · {capitalize(dayLabel(event.start))} · {time(event.start)}
                </span>
                {event.published ? <Pill tone="success">En Franky</Pill> : <Pill>Borrador</Pill>}
              </div>
              <p className="font-heading text-lg font-bold leading-snug">{event.title}</p>
              {event.kind === "previa" && event.party ? (
                <p className="text-xs text-text-muted">Antes de {event.party}</p>
              ) : null}
              {event.menu ? <p className="text-sm text-text-secondary">{event.menu}</p> : null}
              <div>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold tabular">{s.people} de {event.capacity}</span>
                  <span className="text-text-muted">{s.free ? `${s.free} libres` : "Completo"}</span>
                </div>
                <Meter value={s.people} max={event.capacity} tone={s.free <= 5 ? "warning" : "violet"} />
              </div>
              <p className="text-xs text-text-muted">
                {event.minimumSpendCents ? `Consumo mínimo ${money(event.minimumSpendCents)} por persona` : "Sin consumo mínimo"}
                {s.depositsPending ? ` · ${plural(s.depositsPending, "señal pendiente", "señales pendientes")}` : ""}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            icon={Tv}
            title="Ningún partido a la vista"
            body="Champions entre semana, derbis, la previa de una fiesta universitaria o una noche de trivia: cada evento con su aforo y su menú llena el bar en días flojos."
            action={
              <Button variant="dark" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Crear el primero
              </Button>
            }
          />
        </Panel>
      )}

      <Tip title="Consumo mínimo sin discusiones">
        Si lo pones al crear el evento, cada estudiante lo ve antes de reservar. A los grupos grandes, pídeles una señal por Bizum y márcala aquí cuando llegue.
      </Tip>

      <EventDrawer id={open} onClose={() => setOpen(null)} />
      <NewEventDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function EventDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [people, setPeople] = React.useState(4);
  const [deposit, setDeposit] = React.useState("");
  const event = ops?.events.find((e) => e.id === id) ?? null;
  React.useEffect(() => {
    setName("");
    setPhone("");
    setPeople(4);
    setDeposit("");
  }, [id]);
  if (!event || !ops) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const s = eventStats(event);

  const patch = (label: string, fn: (e: ProVenueEvent) => ProVenueEvent) =>
    save(label, (o) => ({ ...o, events: o.events.map((e) => (e.id === event.id ? fn(e) : e)) }));
  const patchBooking = (bookingId: string, fn: (b: ProVenueEventBooking) => ProVenueEventBooking) =>
    patch("event.booking", (e) => ({ ...e, bookings: e.bookings.map((b) => (b.id === bookingId ? fn(b) : b)) }));

  const add = async () => {
    const booking: ProVenueEventBooking = {
      id: localId("eb"),
      name: name.trim(),
      phone: phone.trim() || undefined,
      people,
      depositCents: parseEuros(deposit) ?? 0,
      depositPaid: false,
    };
    if (!(await patch("event.book", (e) => ({ ...e, bookings: [...e.bookings, booking] })))) return;
    toast.success("Reserva apuntada", `${booking.name}, ${plural(people, "persona", "personas")}.`);
    setName("");
    setPhone("");
    setDeposit("");
  };

  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={event.title}
      description={`${capitalize(dayLabel(event.start))}, de ${time(event.start)} a ${time(event.end)}`}
      footer={
        <>
          <IconButton
            label="Borrar evento"
            icon={Trash2}
            className="mr-auto h-10 w-10"
            onClick={async () => {
              if (await save("event.remove", (o) => ({ ...o, events: o.events.filter((e) => e.id !== event.id) }))) onClose();
            }}
          />
          <Button
            variant={event.published ? "outline" : "dark"}
            onClick={async () => {
              if (await patch("event.publish", (e) => ({ ...e, published: !e.published })))
                toast.success(event.published ? "Retirado de Franky" : "Publicado en Franky", event.published ? undefined : "Lo verán los estudiantes cerca de ti en tu ficha.");
            }}
          >
            {event.published ? "Retirar de Franky" : "Publicar en Franky"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-bg-secondary p-3">
            <p className="text-xs text-text-muted">Reservadas</p>
            <p className="font-heading text-xl font-bold tabular">{s.people}/{event.capacity}</p>
          </div>
          <div className="rounded-2xl bg-bg-secondary p-3">
            <p className="text-xs text-text-muted">Señales</p>
            <p className="font-heading text-xl font-bold tabular">{money(s.depositsPaidCents, { round: true })}</p>
          </div>
          <div className="rounded-2xl bg-bg-secondary p-3">
            <p className="text-xs text-text-muted">Han llegado</p>
            <p className="font-heading text-xl font-bold tabular">{s.arrived}</p>
          </div>
        </div>

        <WhatsAppButton
          share
          size="default"
          className="w-full"
          label={event.kind === "previa" ? "Mandar la previa al grupo" : "Mandar al grupo"}
          message={eventInviteMessage(event, data.space.name, `https://franky.es/n/${data.space.slug}`)}
        />

        <Panel title="Reservas" flush>
          {event.bookings.length ? (
            <RowList>
              {event.bookings.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:flex-nowrap">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{b.name}</span>
                    <span className="block text-xs text-text-muted">
                      {plural(b.people, "persona", "personas")}
                      {b.depositCents ? ` · señal ${money(b.depositCents)} ${b.depositPaid ? "pagada" : "pendiente"}` : ""}
                    </span>
                  </span>
                  {b.depositCents && !b.depositPaid ? (
                    <>
                      <WhatsAppButton
                        phone={b.phone}
                        label="Pedir señal"
                        message={`Hola ${b.name.split(" ")[0]}, para guardaros la mesa en ${data.space.name} para ${event.title.toLowerCase()} necesitamos una señal de ${money(b.depositCents)} por Bizum. ¡Gracias!`}
                      />
                      <Button size="sm" variant="outline" className="h-10" onClick={() => patchBooking(b.id, (x) => ({ ...x, depositPaid: true }))}>
                        Cobrada
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant={b.arrived ? "secondary" : "ghost"}
                    className="h-10"
                    onClick={() => patchBooking(b.id, (x) => ({ ...x, arrived: !x.arrived }))}
                  >
                    {b.arrived ? <><Check className="h-4 w-4" /> Llegó</> : "Llegó"}
                  </Button>
                </div>
              ))}
            </RowList>
          ) : (
            <p className="px-4 py-4 text-sm text-text-muted">Todavía nadie. Las reservas desde Franky entran aquí.</p>
          )}
        </Panel>

        <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold">Apuntar una reserva</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre o grupo" className={inputClass} />
            <input aria-label="Teléfono" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className={inputClass} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Stepper label="Personas" value={people} onChange={setPeople} min={1} max={event.capacity} />
            <input aria-label="Señal en euros" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="Señal (€)" className={cn(inputClass, "w-32")} />
            <Button variant="dark" className="h-10 flex-1" disabled={name.trim().length < 2 || people > s.free} onClick={add}>
              Apuntar
            </Button>
          </div>
          {people > s.free ? <p className="text-xs text-rose-600">Solo quedan {s.free} sitios.</p> : null}
        </section>
      </div>
    </Drawer>
  );
}

function NewEventDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { now } = usePro();
  const { save } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const [kind, setKind] = React.useState<ProVenueEvent["kind"]>("partido");
  const [title, setTitle] = React.useState("");
  const [party, setParty] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [from, setFrom] = React.useState("21:00");
  const [to, setTo] = React.useState("23:00");
  const [capacity, setCapacity] = React.useState(50);
  const [minimum, setMinimum] = React.useState("10,00");
  const [menu, setMenu] = React.useState("");
  const [publish, setPublish] = React.useState(true);
  React.useEffect(() => {
    if (!open) return;
    setKind("partido");
    setTitle("");
    setParty("");
    setDate(today);
    setFrom(minutesToLabel(Math.max(21 * 60, Math.ceil(localMinutes(now) / 30) * 30) % 1440));
    setTo("23:00");
    setCapacity(50);
    setMinimum(eurosText(1000));
    setMenu("");
    setPublish(true);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const start = toMin(from);
  const end = toMin(to) <= start ? toMin(to) + 1440 : toMin(to);

  const submit = async () => {
    const event: ProVenueEvent = {
      id: localId("ev"),
      kind,
      party: kind === "previa" ? party.trim() : undefined,
      title: title.trim(),
      start: atLocal(date, start),
      end: atLocal(date, end),
      capacity,
      minimumSpendCents: parseEuros(minimum) ?? 0,
      menu: menu.trim() || undefined,
      published: publish,
      bookings: [],
    };
    if (!(await save("event.create", (o) => ({ ...o, events: [...o.events, event] })))) return;
    toast.success(publish ? "Evento publicado" : "Evento guardado", event.title);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo partido o evento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="dark"
            disabled={title.trim().length < 3 || (kind === "previa" && party.trim().length < 3)}
            onClick={submit}
          >
            {publish ? "Publicar" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChoiceChips
          value={kind}
          onChange={setKind}
          options={[
            { value: "partido", label: "Partido" },
            { value: "previa", label: "Previa de fiesta" },
            { value: "evento", label: "Otro evento" },
          ]}
        />
        {kind === "previa" ? (
          <FormField label="Fiesta" htmlFor="ev-party" hint="La fiesta universitaria a la que se va después.">
            <input
              id="ev-party"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="Fiesta de Bienvenida de Teleco"
              className={inputClass}
            />
          </FormField>
        ) : null}
        <FormField label={kind === "previa" ? "Qué ofreces" : "Título"} htmlFor="ev-title">
          <input
            id="ev-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "partido"
                ? "Champions: semifinal"
                : kind === "previa"
                  ? "Previa en la terraza"
                  : "Noche de trivia"
            }
            className={inputClass}
          />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Día" htmlFor="ev-date" className="col-span-3 sm:col-span-1">
            <input id="ev-date" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Empieza" htmlFor="ev-from">
            <input id="ev-from" type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Acaba" htmlFor="ev-to">
            <input id="ev-to" type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <FormField label="Aforo">
            <Stepper label="Aforo" value={capacity} onChange={setCapacity} min={1} step={5} />
          </FormField>
          <FormField label="Consumo mínimo por persona (€)" htmlFor="ev-min" className="w-48">
            <input id="ev-min" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} className={inputClass} />
          </FormField>
        </div>
        <FormField label="Menú o promoción" htmlFor="ev-menu" hint="Lo ven los estudiantes antes de reservar.">
          <input id="ev-menu" value={menu} onChange={(e) => setMenu(e.target.value)} placeholder="Cubo de cinco tercios y ración: 15 €" className={inputClass} />
        </FormField>
        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-5 w-5 accent-[var(--color-violet)]" />
          Publicarlo en mi ficha de Franky
        </label>
      </div>
    </Drawer>
  );
}
