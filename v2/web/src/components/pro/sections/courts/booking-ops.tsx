"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  MessageCircle,
  Pencil,
  Plus,
  Repeat,
  UserPlus,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking, ProPayment } from "@/lib/pro/types";
import {
  atLocal,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  time,
} from "@/lib/pro/format";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { courtsOps } from "@/lib/pro/courts-base";
import {
  LEVEL_STEPS,
  addExtra,
  addWaiter,
  extrasOf,
  isFlagged,
  levelLabel,
  levelOf,
  noShowCount,
  payShare,
  playerShares,
  renameShare,
  seriesOf,
  setLevel,
  setWaiterStatus,
  waitersFor,
} from "@/lib/pro/courts-ops";
import { bookingMinutes, isFree, priceFor } from "@/lib/pro/courts";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, FormField, Meter, Pill, inputClass } from "../../kit";

/**
 * Piezas de la ficha de una reserva de pista: quién ha pagado su parte,
 * extras de mostrador, nivel del jugador, turno fijo, ausencias y lista de
 * espera. Solo en los espacios con estos datos (la demo y, cuando exista,
 * el espacio real con su backend).
 */

const WEEKDAYS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábados",
  "domingos",
];

export const METHOD_LABEL: Record<ProPayment["method"], string> = {
  card: "Tarjeta",
  cash: "Efectivo",
  bizum: "Bizum",
};

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** Enlace de WhatsApp con el mensaje ya escrito; no se pinta sin teléfono válido. */
export function WhatsAppLink({
  phone,
  message,
  label = "WhatsApp",
  onClick,
  className,
}: {
  phone?: string;
  message: string;
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  const href = customerWhatsApp(phone, message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "min-h-10",
        className,
      )}
    >
      <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.9} /> {label}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Pago por jugador                                                    */
/* ------------------------------------------------------------------ */

export function SharesPanel({ booking }: { booking: ProBooking }) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const shares = playerShares(data, booking);
  const [charging, setCharging] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<ProPayment["method"]>("bizum");
  const [editing, setEditing] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const paid = shares.filter((s) => s.dueCents === 0).length;
  const resource = data.resources.find((r) => r.id === booking.resourceId);
  const when = `${dayLabel(booking.start)} a las ${time(booking.start)}`;

  const charge = (index: number) => {
    const share = shares[index];
    update("court.share.pay", (d) =>
      payShare(d, {
        bookingId: booking.id,
        index,
        method,
        at: new Date().toISOString(),
        paymentId: localId("p"),
      }),
    );
    toast.success(
      "Parte cobrada",
      `${firstName(share.name)} ha pagado ${money(share.dueCents)} con ${METHOD_LABEL[method].toLowerCase()}.`,
    );
    setCharging(null);
  };

  const saveName = (index: number) => {
    if (name.trim().length < 2) return;
    update("court.share.rename", (d) =>
      renameShare(d, booking.id, index, {
        name: name.trim(),
        phone: phone.trim() || undefined,
      }),
    );
    setEditing(null);
  };

  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">
          {paid === shares.length
            ? "Han pagado los cuatro"
            : `${paid} de ${shares.length} han pagado`}
        </p>
        <p className="text-sm text-text-muted tabular">
          {money(booking.paidCents ?? 0)} de {money(booking.priceCents)}
        </p>
      </div>
      <Meter
        value={paid}
        max={shares.length}
        className="mt-2"
        tone={paid === shares.length ? "success" : "warning"}
      />
      <ul className="mt-3 divide-y divide-border-light">
        {shares.map((s, i) => (
          <li key={i} className="py-2.5">
            <div className="flex items-center gap-2.5">
              <Avatar name={s.name} size="sm" tone={s.dueCents ? "slate" : "emerald"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="block text-xs text-text-muted tabular">
                  {s.dueCents === 0
                    ? `${money(s.amountCents)} pagados${s.method ? ` con ${METHOD_LABEL[s.method].toLowerCase()}` : ""}`
                    : `Debe ${money(s.dueCents)}`}
                </span>
              </span>
              {s.dueCents === 0 ? (
                <Check className="h-4 w-4 text-emerald-600" aria-label="Pagado" />
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={`Editar a ${s.name}`}
                    onClick={() => {
                      setEditing(editing === i ? null : i);
                      setName(s.name.startsWith("Jugador ") ? "" : s.name);
                      setPhone(s.phone ?? "");
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.9} />
                  </button>
                  <Button
                    size="sm"
                    variant={charging === i ? "dark" : "outline"}
                    className="min-h-10"
                    onClick={() => setCharging(charging === i ? null : i)}
                  >
                    Cobrar
                  </Button>
                </>
              )}
            </div>
            {charging === i ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-10">
                <ChoiceChips
                  value={method}
                  onChange={setMethod}
                  options={(["bizum", "card", "cash"] as const).map((m) => ({
                    value: m,
                    label: METHOD_LABEL[m],
                  }))}
                />
                <Button size="sm" variant="dark" className="min-h-10" onClick={() => charge(i)}>
                  Cobrar {money(s.dueCents)}
                </Button>
              </div>
            ) : null}
            {editing === i ? (
              <div className="mt-2.5 grid gap-2 pl-10 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre"
                  aria-label="Nombre del jugador"
                  className={inputClass}
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Móvil"
                  inputMode="tel"
                  aria-label="Móvil del jugador"
                  className={inputClass}
                />
                <Button size="sm" variant="outline" className="min-h-10" onClick={() => saveName(i)}>
                  Guardar
                </Button>
              </div>
            ) : null}
            {s.dueCents > 0 && s.phone && charging !== i && editing !== i ? (
              <div className="mt-2 pl-10">
                <WhatsAppLink
                  phone={s.phone}
                  label={`Recordar a ${firstName(s.name)}`}
                  message={`Hola ${firstName(s.name)}, te escribimos de ${data.space.name}. Te falta tu parte de la ${resource?.name.toLowerCase() ?? "pista"} del ${when}: ${money(s.dueCents)}. Puedes pagarla por Bizum o en el mostrador. Gracias.`}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">
        Hoy quedan por cobrar {money(shares.reduce((a, s) => a + s.dueCents, 0))} de esta reserva.
        {` `}
        Guarda el móvil de cada jugador y le recuerdas su parte con un toque.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Extras de mostrador                                                 */
/* ------------------------------------------------------------------ */

export function ExtrasPanel({ booking }: { booking: ProBooking }) {
  const { data, update } = usePro();
  const toast = useToast();
  const shop = courtsOps(data).shop;
  const extras = extrasOf(data, booking.id);
  if (!shop.length) return null;
  return (
    <div>
      <p className="text-[0.82rem] font-semibold">Palas, bolas y bebidas</p>
      {extras.length ? (
        <p className="mt-1 text-sm text-text-muted">
          {extras.map((e) => `${e.qty} × ${e.name}`).join(", ")} ·{" "}
          {money(extras.reduce((a, e) => a + e.priceCents * e.qty, 0))}, repartido entre los jugadores
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shop.map((item) => {
          const out = item.stock !== null && item.stock <= 0;
          return (
            <button
              key={item.id}
              type="button"
              disabled={out}
              onClick={() => {
                update("court.extra.add", (d) => addExtra(d, booking.id, item, 1));
                toast.success("Añadido", `${item.name}, ${money(item.priceCents)}.`);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-violet/40 hover:text-violet disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.9} />
              {item.name}
              <span className="font-normal text-text-muted">
                {money(item.priceCents)}
                {item.stock !== null ? ` · quedan ${item.stock}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nivel del jugador                                                   */
/* ------------------------------------------------------------------ */

const HAND = { right: "Diestro", left: "Zurdo" } as const;
const SIDE = { drive: "Drive", reves: "Revés", both: "Los dos lados" } as const;

export function LevelLine({ clientId }: { clientId: string }) {
  const { data, update } = usePro();
  const toast = useToast();
  const current = levelOf(data, clientId);
  const [open, setOpen] = React.useState(false);
  const [level, setLevelValue] = React.useState(String(current?.level ?? 3));
  const [hand, setHand] = React.useState<"right" | "left">(current?.hand ?? "right");
  const [side, setSide] = React.useState<"drive" | "reves" | "both">(current?.side ?? "both");

  React.useEffect(() => {
    setLevelValue(String(current?.level ?? 3));
    setHand(current?.hand ?? "right");
    setSide(current?.side ?? "both");
  }, [clientId, current?.level, current?.hand, current?.side]);

  const save = () => {
    update("court.level", (d) =>
      setLevel(d, clientId, { level: Number(level), hand, side }, new Date().toISOString()),
    );
    toast.success("Nivel guardado", `Nivel ${levelLabel(Number(level))}. Lo usamos para partidos y americanas.`);
    setOpen(false);
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="violet">
          {current ? `Nivel ${levelLabel(current.level)}` : "Sin nivel"}
        </Pill>
        {current ? <Pill>{HAND[current.hand]}</Pill> : null}
        {current ? <Pill>{SIDE[current.side]}</Pill> : null}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 items-center gap-1 px-1 text-xs font-semibold text-violet"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.9} /> {current ? "Cambiar" : "Poner nivel"}
        </button>
      </div>
      {current && current.history.length > 1 ? (
        <p className="mt-1 text-xs text-text-muted">
          Ha subido de {levelLabel(current.history[0].level)} a {levelLabel(current.level)} desde que juega aquí.
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border p-3">
          <FormField label="Nivel (1 a 7)" htmlFor={`lv-${clientId}`}>
            <select
              id={`lv-${clientId}`}
              value={level}
              onChange={(e) => setLevelValue(e.target.value)}
              className={inputClass}
            >
              {LEVEL_STEPS.map((l) => (
                <option key={l} value={String(l)}>
                  {levelLabel(l)}
                </option>
              ))}
            </select>
          </FormField>
          <ChoiceChips
            value={hand}
            onChange={setHand}
            options={(["right", "left"] as const).map((h) => ({ value: h, label: HAND[h] }))}
          />
          <ChoiceChips
            value={side}
            onChange={setSide}
            options={(["drive", "reves", "both"] as const).map((s) => ({ value: s, label: SIDE[s] }))}
          />
          <Button size="sm" variant="dark" className="self-start" onClick={save}>
            Guardar nivel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pastillas de la ficha                                               */
/* ------------------------------------------------------------------ */

export function BookingFlags({ booking }: { booking: ProBooking }) {
  const { data } = usePro();
  const series = seriesOf(data, booking.id);
  const absences = noShowCount(data, booking.clientId);
  return (
    <>
      {series ? (
        <Pill tone="info">
          <Repeat className="h-3 w-3" strokeWidth={1.9} /> Turno fijo, {WEEKDAYS[series.weekday]}
        </Pill>
      ) : null}
      {isFlagged(data, booking.clientId) ? (
        <Pill tone="danger">
          <AlertTriangle className="h-3 w-3" strokeWidth={1.9} /> {absences} ausencias
        </Pill>
      ) : absences ? (
        <Pill tone="warning">
          {absences} {absences === 1 ? "ausencia" : "ausencias"}
        </Pill>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

/** Apuntar a alguien que quiere esa misma franja si se libera. */
export function AddWaiterForm({ booking }: { booking: ProBooking }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const slot = {
    resourceId: booking.resourceId,
    date: localDate(booking.start),
    from: localMinutes(booking.start),
    duration: bookingMinutes(booking),
  };
  const waiting = waitersFor(data, slot);

  const save = () => {
    if (name.trim().length < 2) return;
    update("court.waitlist.add", (d) =>
      addWaiter(d, {
        id: localId("le"),
        ...slot,
        name: name.trim(),
        phone: phone.trim() || undefined,
        createdAt: new Date().toISOString(),
        status: "waiting",
      }),
    );
    toast.success(
      "En lista de espera",
      `Si esta franja se libera, ${firstName(name.trim())} será ${waiting.length ? `el número ${waiting.length + 1}` : "el primero"} en saberlo.`,
    );
    setName("");
    setPhone("");
    setOpen(false);
  };

  return (
    <div className="rounded-2xl bg-bg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">Lista de espera</span>
          <span className="text-text-muted">
            {waiting.length
              ? ` · ${waiting.length} ${waiting.length === 1 ? "persona espera" : "personas esperan"} esta franja`
              : " · nadie espera esta franja"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          <UserPlus className="h-4 w-4" strokeWidth={1.9} /> Apuntar
        </button>
      </div>
      {waiting.length ? (
        <p className="mt-1 text-xs text-text-muted">
          {waiting.map((w) => w.name).join(", ")}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            aria-label="Nombre de quien espera"
            className={inputClass}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Móvil"
            inputMode="tel"
            aria-label="Móvil de quien espera"
            className={inputClass}
          />
          <Button size="sm" variant="dark" className="min-h-10" onClick={save} disabled={name.trim().length < 2}>
            Apuntar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Tras cancelar: quién esperaba esa franja, con el aviso ya escrito y la
 * opción de reservársela directamente.
 */
export function FreedSlotPanel({
  slot,
  onDone,
}: {
  slot: { resourceId?: string; date: string; from: number; duration: number };
  onDone: () => void;
}) {
  const { data, update } = usePro();
  const toast = useToast();
  const waiters = waitersFor(data, slot);
  const resource = data.resources.find((r) => r.id === slot.resourceId);
  const price =
    resource ? priceFor(resource, slot.date, slot.from, slot.duration) : null;
  const when = `${dayLabel(atLocal(slot.date, slot.from))} a las ${minutesToLabel(slot.from)}`;

  const book = (id: string) => {
    const w = waiters.find((x) => x.id === id);
    if (!w || !resource) return;
    if (!isFree(data, resource, slot.date, slot.from, slot.duration)) {
      toast.success("Ya no está libre", "Alguien la ha reservado mientras tanto.");
      return;
    }
    update("court.waitlist.book", (d) => {
      const booking: ProBooking = {
        id: localId("b"),
        kind: "court",
        clientId: w.clientId,
        clientName: w.name,
        resourceId: resource.id,
        start: atLocal(slot.date, slot.from),
        end: atLocal(slot.date, slot.from + slot.duration),
        partySize: resource.kind === "court" ? 4 : 1,
        status: "confirmed",
        priceCents: price ?? 0,
        paidCents: 0,
        source: "phone",
        note: "Desde la lista de espera",
      };
      return setWaiterStatus(
        { ...d, bookings: [...d.bookings, booking] },
        w.id,
        "booked",
        new Date().toISOString(),
      );
    });
    toast.success("Reservada", `${resource.name} para ${w.name}, ${when}.`);
    onDone();
  };

  if (!waiters.length) return null;
  return (
    <div className="rounded-2xl border border-violet/25 bg-violet-50 p-4">
      <p className="text-sm font-semibold text-violet-deep">
        {waiters.length === 1 ? "1 persona esperaba" : `${waiters.length} personas esperaban`} esta franja
      </p>
      <p className="mt-0.5 text-xs text-violet-deep/80">
        Avisa al primero con la hora y el precio. Si la quiere, resérvasela aquí mismo.
      </p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {waiters.map((w, i) => (
          <li key={w.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-bg-primary p-2.5">
            <span className="w-5 text-center text-xs font-bold text-text-muted tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {w.name}
              {w.status === "notified" ? (
                <span className="ml-1.5 text-xs font-normal text-text-muted">avisado</span>
              ) : null}
            </span>
            <WhatsAppLink
              phone={w.phone}
              label="Avisar"
              onClick={() =>
                update("court.waitlist.notify", (d) =>
                  setWaiterStatus(d, w.id, "notified", new Date().toISOString()),
                )
              }
              message={`Hola ${firstName(w.name)}, se ha liberado la ${resource?.name.toLowerCase() ?? "pista"} el ${when}${price ? ` (${money(price)})` : ""} en ${data.space.name}. ¿Te la reservamos?`}
            />
            <Button size="sm" variant="dark" className="min-h-10" onClick={() => book(w.id)}>
              Reservar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
