"use client";

import * as React from "react";
import {
  BellRing,
  CalendarPlus,
  LayoutGrid,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProTable } from "@/lib/pro/types";
import { UnplacedTables } from "./adopt-table-drawer";
import { localDate, localMinutes, plural, time } from "@/lib/pro/format";
import {
  CLEANING_MIN,
  currentTurn,
  stayMinutes,
  tableBookingsOn,
  tableLive,
  tableName,
  turnOf,
  waitlistOn,
  zonesOf,
  type TableLive,
  type TableState,
} from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  PageHeader,
  Panel,
  RowList,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import {
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StudentMark,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";

const COLS = 12;
const ROWS = 8;

const STATE: Record<TableState, { label: string; tile: string; dot: string }> =
  {
    free: {
      label: "Libre",
      tile: "border-border bg-bg-primary text-text-primary",
      dot: "bg-bg-primary border border-text-muted/50",
    },
    soon: {
      label: "Reservada pronto",
      tile: "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
      dot: "bg-amber-400",
    },
    seated: {
      label: "Sentada",
      tile: "border-violet/40 bg-violet-50 text-violet-deep",
      dot: "bg-violet",
    },
    dirty: {
      label: "Por limpiar",
      tile: "border-dashed border-slate-400 bg-slate-100 text-slate-700 dark:border-slate-500 dark:bg-slate-800/60 dark:text-slate-200",
      dot: "bg-slate-400",
    },
  };

export default function TablesSala() {
  const { data, now, vertical, demo, pending, can } = usePro();
  const actions = useTableActions();
  const zones = zonesOf(data);
  const [zone, setZone] = React.useState(zones[0] ?? "Sala");
  const [tableId, setTableId] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [adding, setAdding] = React.useState(false);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const stay = stayMinutes(vertical.id, turnOf(nowMin));

  const live = data.tables.map((t) => ({
    table: t,
    live: tableLive(data, t, now),
  }));
  const count = (s: TableState, z?: string) =>
    live.filter((x) => x.live.state === s && (!z || x.table.zone === z)).length;
  const seatedCovers = live
    .filter((x) => x.live.state === "seated")
    .reduce(
      (a, x) => a + (x.live.occupiedPeople ?? x.live.current?.partySize ?? 0),
      0,
    );
  const zoneTables = live.filter((x) => x.table.zone === zone);
  const waitlist = waitlistOn(data, today);
  const longest = live
    .filter((x) => x.live.state === "seated")
    .sort((a, b) => b.live.minutes - a.live.minutes)
    .slice(0, 5);
  const firstFreeFor = (party: number) =>
    live
      .filter(
        (x) =>
          x.live.state === "free" &&
          x.table.seats >= party &&
          x.table.shape !== "bar",
      )
      .sort((a, b) => a.table.seats - b.table.seats)[0]?.table;

  if (!data.tables.length) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader
          eyebrow="Sala"
          title="Tu sala en directo"
          description="Dibuja tus mesas una vez y verás en todo momento cuáles están libres."
        />
        <UnplacedTables defaultZone="Sala" onPlaced={setZone} />
        <Panel>
          <Empty
            icon={LayoutGrid}
            title="Dibuja tu sala"
            body="Añade tus mesas con su capacidad y zona. Tarda cinco minutos y así las reservas se asignan solas."
            action={
              <Button
                variant="dark"
                disabled={pending || !can("table.add")}
                onClick={() => setAdding(true)}
              >
                <Plus className="h-4 w-4" /> Añadir mesa
              </Button>
            }
          />
        </Panel>
        <AddTableDrawer
          open={adding}
          onClose={() => setAdding(false)}
          defaultZone="Sala"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Sala"
        title="Tu sala en directo"
        description={`${plural(count("free"), "mesa libre", "mesas libres")}, ${plural(count("seated"), "sentada", "sentadas")} con ${seatedCovers} personas y ${plural(count("soon"), "reserva", "reservas")} en la próxima hora y media.`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={pending || !can("table.add")}
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" /> Añadir mesa
            </Button>
            <Button
              variant="dark"
              disabled={pending || !can("table.reserve")}
              onClick={() =>
                setPreset({ date: today, turn: currentTurn(nowMin) })
              }
            >
              <CalendarPlus className="h-4 w-4" strokeWidth={1.9} /> Nueva
              reserva
            </Button>
          </>
        }
      />

      <UnplacedTables defaultZone={zone} onPlaced={setZone} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Zona"
              value={zone}
              onChange={setZone}
              options={zones.map((z) => ({
                value: z,
                label: z,
                count: count("free", z),
              }))}
            />
            <ul
              className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted"
              aria-label="Leyenda"
            >
              {(Object.keys(STATE) as TableState[]).map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn("h-2.5 w-2.5 rounded-full", STATE[s].dot)}
                  />{" "}
                  {STATE[s].label}
                </li>
              ))}
            </ul>
          </div>

          <Panel flush>
            <div className="overflow-x-auto p-2 pro-scroll sm:p-4">
              <div
                className="relative mx-auto aspect-[12/8] w-full min-w-[340px] max-w-[900px] rounded-xl bg-bg-secondary/60 bg-dots"
                role="group"
                aria-label={`Plano de ${zone}`}
              >
                {zoneTables.map(({ table, live: l }) => (
                  <TableTile
                    key={table.id}
                    table={table}
                    live={l}
                    stay={stay}
                    onOpen={() => setTableId(table.id)}
                  />
                ))}
              </div>
            </div>
          </Panel>

          <Tip title="En plena sala">
            {demo
              ? `Toca una mesa al entrar el cliente y márcala sentada. Cuando se vaya, Se fue: queda ${CLEANING_MIN} minutos por limpiar y luego vuelve a libre para la lista de espera.`
              : "Marca la llegada del cliente, registra su salida y confirma cuándo queda recogida la mesa."}
          </Tip>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {!demo ? (
            <RealWaitlistPanel
              onAdd={() => setPreset({ date: today, waitlist: true })}
            />
          ) : (
            <Panel
              title="Lista de espera"
              description={
                waitlist.length
                  ? "Te sugerimos la mesa libre más ajustada."
                  : "Nadie esperando ahora."
              }
              flush
            >
              {waitlist.length ? (
                <RowList>
                  {waitlist.map((w) => {
                    const fit = firstFreeFor(w.partySize);
                    return (
                      <div
                        key={w.id}
                        className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5"
                      >
                        <button
                          type="button"
                          onClick={() => setBookingId(w.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-semibold">
                            {w.clientName}{" "}
                            <span className="font-normal text-text-muted">
                              · {w.partySize}p
                            </span>
                          </span>
                          <span className="block text-xs text-text-muted">
                            Desde las {time(w.start)}
                          </span>
                        </button>
                        {fit ? (
                          <Button
                            size="sm"
                            variant="dark"
                            className="h-10"
                            onClick={() => actions.seat(w, fit.id)}
                          >
                            Sentar en {tableName(data, fit.id)}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-10"
                            onClick={() => actions.notify(w)}
                          >
                            <BellRing className="h-3.5 w-3.5" /> Avisar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </RowList>
              ) : (
                <div className="px-4 py-4 sm:px-5">
                  <Button
                    variant="outline"
                    className="h-10 w-full"
                    onClick={() => setPreset({ date: today, waitlist: true })}
                  >
                    Apuntar en espera
                  </Button>
                </div>
              )}
            </Panel>
          )}

          <Panel
            title="Llevan más tiempo"
            description="Las primeras candidatas a quedar libres."
            flush
          >
            {longest.length ? (
              <RowList>
                {longest.map(({ table, live: l }) => (
                  <div
                    key={table.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <button
                      type="button"
                      onClick={() => setTableId(table.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-sm font-semibold">
                        {tableName(data, table.id)}{" "}
                        <span className="font-normal text-text-muted">
                          · {l.current?.clientName}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "block text-xs tabular",
                          l.minutes > stay
                            ? "font-semibold text-rose-600"
                            : "text-text-muted",
                        )}
                      >
                        {l.minutes} min sentados
                        {l.minutes > stay ? ", ya pasan de lo normal" : ""}
                      </span>
                    </button>
                    {l.current ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        disabled={pending || !can("table.leave")}
                        onClick={() => actions.leave(l.current!)}
                      >
                        Se fue
                      </Button>
                    ) : null}
                  </div>
                ))}
              </RowList>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
                No hay mesas sentadas ahora mismo.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <TableDrawer
        tableId={tableId}
        onClose={() => setTableId(null)}
        onWalkIn={(id) => {
          setTableId(null);
          setPreset({ date: today, tableId: id, walkIn: true });
        }}
        onOpenBooking={(id) => {
          setTableId(null);
          setBookingId(id);
        }}
      />
      {bookingId ? (
        <ReservationDrawer
          bookingId={bookingId}
          onClose={() => setBookingId(null)}
        />
      ) : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <AddTableDrawer
        open={adding}
        onClose={() => setAdding(false)}
        defaultZone={zone}
        onAdded={(z) => setZone(z)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mesa en el plano                                                    */
/* ------------------------------------------------------------------ */

function TableTile({
  table,
  live,
  stay,
  onOpen,
}: {
  table: ProTable;
  live: TableLive;
  stay: number;
  onOpen: () => void;
}) {
  const { data } = usePro();
  const s = STATE[live.state];
  const detail =
    live.state === "seated"
      ? `${live.minutes} min`
      : live.state === "soon" && live.next
        ? time(live.next.start)
        : live.state === "dirty"
          ? "Limpiar"
          : `${table.seats}p`;
  const party =
    live.state === "seated" && live.current
      ? `${live.current.partySize}/${table.seats}`
      : null;
  const long = live.state === "seated" && live.minutes > stay;
  const flat = table.h === 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${tableName(data, table.id)}, ${table.seats} personas, ${s.label}${live.state === "soon" && live.next ? ` a las ${time(live.next.start)}` : ""}`}
      className="absolute p-[3px] sm:p-1.5"
      style={{
        left: `${(table.x / COLS) * 100}%`,
        top: `${(table.y / ROWS) * 100}%`,
        width: `${(table.w / COLS) * 100}%`,
        height: `${(table.h / ROWS) * 100}%`,
      }}
    >
      <span
        className={cn(
          "flex h-full w-full items-center justify-center overflow-hidden border-2 text-center leading-tight shadow-card transition-transform hover:-translate-y-px focus-visible:outline-none",
          table.shape === "round"
            ? "rounded-full"
            : table.shape === "bar"
              ? "rounded-md"
              : "rounded-xl",
          flat ? "flex-row gap-2" : "flex-col",
          s.tile,
          long && "ring-2 ring-rose-400/70",
        )}
      >
        <span className="truncate px-0.5 text-[0.7rem] font-extrabold sm:text-sm">
          {table.name}
        </span>
        <span
          className={cn(
            "truncate text-[0.6rem] font-semibold tabular opacity-80 sm:text-xs",
            long && "text-rose-600 opacity-100",
          )}
        >
          {detail}
        </span>
        {party && !flat ? (
          <span className="hidden text-[0.65rem] tabular opacity-70 sm:block">
            {party} pax
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una mesa                                                 */
/* ------------------------------------------------------------------ */

function TableDrawer({
  tableId,
  onClose,
  onOpenBooking,
  onWalkIn,
}: {
  tableId: string | null;
  onClose: () => void;
  onOpenBooking: (id: string) => void;
  onWalkIn: (id: string) => void;
}) {
  const { data, now, update, demo, pending, can } = usePro();
  const toast = useToast();
  const actions = useTableActions();
  const table = data.tables.find((t) => t.id === tableId) ?? null;
  const [party, setParty] = React.useState(2);

  React.useEffect(() => {
    if (table) setParty(Math.min(2, table.seats));
    // Solo al cambiar de mesa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  if (!table)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );

  const today = localDate(now);
  const nowMin = localMinutes(now);
  const live = tableLive(data, table, now);
  const later = tableBookingsOn(data, today).filter(
    (b) =>
      b.resourceId === table.id &&
      (b.status === "confirmed" || b.status === "requested") &&
      b.id !== live.next?.id &&
      localMinutes(b.start) >= nowMin - 20,
  );
  const waiting = waitlistOn(data, today).filter(
    (w) => w.partySize <= table.seats,
  );
  const canSeat = live.state === "free" || live.state === "soon";
  const hasBookingsToday = tableBookingsOn(data, today).some(
    (b) => b.resourceId === table.id,
  );
  const close = (fn: () => Promise<boolean>) => async () => {
    if (!(await fn())) return;
    onClose();
  };

  const remove = async () => {
    if (pending || !can("table.remove")) return;
    if (
      !(await update("table.remove", (d) => ({
        ...d,
        tables: d.tables.filter((t) => t.id !== table.id),
      })))
    )
      return;
    toast.success(
      "Mesa quitada del plano",
      tableName(data, table.id) ?? undefined,
    );
    onClose();
  };

  const footer =
    live.state === "seated" && live.current ? (
      <>
        <Button
          variant="outline"
          onClick={() => onOpenBooking(live.current!.id)}
        >
          Ver reserva
        </Button>
        <Button
          variant="dark"
          disabled={pending || !can("table.leave")}
          onClick={close(() => actions.leave(live.current!))}
        >
          Se fue
        </Button>
      </>
    ) : live.state === "dirty" && live.current ? (
      <Button
        variant="dark"
        disabled={pending || !can("table.clean")}
        onClick={close(() => actions.clean(live.current!))}
      >
        Mesa lista
      </Button>
    ) : canSeat ? (
      <Button
        variant="dark"
        disabled={pending || !can("table.walkin")}
        onClick={
          demo
            ? close(() => actions.walkIn(table.id, party))
            : () => onWalkIn(table.id)
        }
      >
        {demo
          ? `Sentar ${plural(party, "persona", "personas")} sin reserva`
          : "Sentar sin reserva"}
      </Button>
    ) : null;

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`${tableName(data, table.id)} · ${table.seats} personas`}
      description={`${table.zone} · ${STATE[live.state].label}`}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {live.state === "seated" && live.current ? (
          <section className="rounded-2xl bg-violet-50 p-4 text-violet-deep">
            <p className="text-xs font-semibold uppercase tracking-wider">
              Ahora
            </p>
            <p className="mt-1 flex items-center gap-2 font-heading text-lg font-bold">
              {live.current.clientName}
              {live.current.student ? (
                <StudentMark
                  university={
                    data.clients.find((c) => c.id === live.current?.clientId)
                      ?.student?.university
                  }
                />
              ) : null}
            </p>
            <p className="text-sm tabular">
              {live.occupiedPeople ?? live.current.partySize} de {table.seats} ·
              sentados desde las{" "}
              {time(
                live.current.tableOperation?.seatedAt ?? live.current.start,
              )}{" "}
              ({live.minutes} min)
            </p>
            <NoteLine note={live.current.note} className="mt-1" />
          </section>
        ) : null}

        {live.state === "dirty" ? (
          <section className="rounded-2xl border border-dashed border-border p-4">
            <p className="font-semibold">
              Se ha ido {live.current?.clientName}
            </p>
            <p className="text-sm text-text-muted">
              Márcala lista cuando esté recogida. Se libera sola en{" "}
              {live.minutes} min.
            </p>
          </section>
        ) : null}

        {demo && canSeat ? (
          <FormField
            label="Sentar sin reserva"
            hint={
              live.state === "soon" && live.next
                ? `Ojo: tiene reserva a las ${time(live.next.start)}. Siéntalos solo si os da tiempo.`
                : "Para quien llega sin reservar."
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: table.seats }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={party === n}
                  onClick={() => setParty(n)}
                  className={cn(
                    "h-11 w-11 rounded-xl border text-sm font-bold tabular",
                    party === n
                      ? "border-violet bg-violet-50 text-violet-deep"
                      : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </FormField>
        ) : null}

        {live.next ? (
          <div>
            <p className="eyebrow mb-2">Siguiente reserva</p>
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <button
                type="button"
                onClick={() => onOpenBooking(live.next!.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block text-sm font-semibold">
                  <span className="tabular">{time(live.next.start)}</span> ·{" "}
                  {live.next.clientName}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                  {plural(live.next.partySize, "persona", "personas")}{" "}
                  <SourceTag source={live.next.source} />
                </span>
                <NoteLine note={live.next.note} />
              </button>
              {live.state !== "seated" && live.next.status === "confirmed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-10"
                  disabled={pending || !can("table.seat")}
                  onClick={close(() => actions.seat(live.next!))}
                >
                  Sentar ya
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Sin más reservas hoy en esta mesa.
          </p>
        )}

        {later.length ? (
          <div>
            <p className="eyebrow mb-2">Más tarde</p>
            <ul className="flex flex-col gap-1">
              {later.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onOpenBooking(b.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-sm hover:bg-bg-secondary"
                  >
                    <span className="w-12 shrink-0 font-semibold tabular">
                      {time(b.start)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {b.clientName}
                    </span>
                    <span className="text-xs text-text-muted tabular">
                      {b.partySize}p
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canSeat && waiting.length ? (
          <div>
            <p className="eyebrow mb-2">De la lista de espera</p>
            <ul className="flex flex-col gap-2">
              {waiting.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center gap-3 rounded-2xl border border-border p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {w.clientName}{" "}
                      <span className="font-normal text-text-muted">
                        · {w.partySize}p
                      </span>
                    </span>
                    <span className="block text-xs text-text-muted">
                      Esperando desde las {time(w.start)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="dark"
                    className="h-10"
                    onClick={close(() => actions.seat(w, table.id))}
                  >
                    Sentar aquí
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!hasBookingsToday ? (
          <button
            type="button"
            disabled={pending || !can("table.remove")}
            onClick={remove}
            className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold text-text-muted hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.9} /> Quitar esta mesa
            del plano
          </button>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Añadir mesa                                                         */
/* ------------------------------------------------------------------ */

function AddTableDrawer({
  open,
  onClose,
  defaultZone,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  defaultZone: string;
  onAdded?: (zone: string) => void;
}) {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const zones = zonesOf(data);
  const [name, setName] = React.useState("");
  const [seats, setSeats] = React.useState<"2" | "4" | "6" | "8" | "12">("4");
  const [zone, setZone] = React.useState(defaultZone);
  const [newZone, setNewZone] = React.useState("");
  const [shape, setShape] = React.useState<ProTable["shape"]>("square");

  React.useEffect(() => {
    if (!open) return;
    const n = data.tables
      .filter((t) => /^\d+$/.test(t.name))
      .map((t) => Number(t.name));
    setName(String((n.length ? Math.max(...n) : 0) + 1));
    setSeats("4");
    setZone(defaultZone);
    setNewZone("");
    setShape("square");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targetZone = newZone.trim() || zone;

  const save = async () => {
    if (pending || !can("table.add")) return;
    const s = Number(seats);
    const w = shape === "bar" ? 5 : s <= 4 ? 2 : s <= 6 ? 3 : 4;
    const h = shape === "bar" ? 1 : s <= 8 ? 2 : 3;
    const spot = findSpot(
      data.tables.filter((t) => t.zone === targetZone),
      w,
      h,
    );
    if (!spot) {
      toast.error(
        "No cabe en esta zona",
        "Quita alguna mesa o créala en otra zona.",
      );
      return;
    }
    const table: ProTable = {
      id: localId("t"),
      name: name.trim() || "Nueva",
      seats: s,
      zone: targetZone,
      x: spot.x,
      y: spot.y,
      w,
      h,
      shape,
    };
    if (
      !(await update("table.add", (d) => ({
        ...d,
        tables: [...d.tables, table],
      })))
    )
      return;
    toast.success(
      "Mesa añadida",
      `${tableName({ ...data, tables: [...data.tables, table] }, table.id)} en ${targetZone}.`,
    );
    onAdded?.(targetZone);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Añadir mesa"
      description="Se coloca en el primer hueco libre del plano de su zona."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={pending || !can("table.add") || !name.trim()}
          >
            Añadir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre o número" htmlFor="at-name">
          <input
            id="at-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="Personas">
          <ChoiceChips
            value={seats}
            onChange={setSeats}
            options={(["2", "4", "6", "8", "12"] as const).map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </FormField>
        <FormField label="Forma">
          <ChoiceChips
            value={shape}
            onChange={setShape}
            options={[
              { value: "square", label: "Cuadrada" },
              { value: "round", label: "Redonda" },
              {
                value: "bar",
                label: "Barra",
                hint: "Para quien llega sin reservar",
              },
            ]}
          />
        </FormField>
        <FormField label="Zona">
          <ChoiceChips
            value={zone}
            onChange={setZone}
            options={(zones.length ? zones : ["Sala"]).map((z) => ({
              value: z,
              label: z,
            }))}
          />
          <input
            aria-label="Nueva zona"
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
            placeholder="O escribe una zona nueva"
            className={cn(inputClass, "mt-2")}
          />
        </FormField>
        <p className="flex items-start gap-2 text-xs text-text-muted">
          <Sparkles
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet"
            strokeWidth={1.9}
          />
          Las reservas de Franky usan estas mesas para asignar la más ajustada a
          cada grupo.
        </p>
      </div>
    </Drawer>
  );
}

function findSpot(
  tables: ProTable[],
  w: number,
  h: number,
): { x: number; y: number } | null {
  for (let y = 0; y + h <= ROWS; y++) {
    for (let x = 0; x + w <= COLS; x++) {
      const clash = tables.some(
        (t) =>
          x < t.x + t.w + 1 &&
          x + w + 1 > t.x &&
          y < t.y + t.h + 1 &&
          y + h + 1 > t.y,
      );
      if (!clash) return { x, y };
    }
  }
  return null;
}
