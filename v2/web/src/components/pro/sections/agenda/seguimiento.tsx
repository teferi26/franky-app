"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Cake,
  CalendarPlus,
  HeartCrack,
  ListPlus,
  Repeat,
  Undo2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProClient } from "@/lib/pro/types";
import {
  addWaitlist,
  noShowsThisMonth,
  recoveredThisMonth,
  setWaitlistStatus,
  waitingCount,
} from "@/lib/pro/agenda-ops";
import {
  atRisk,
  birthdayMessage,
  birthdaysSoon,
  canPromote,
  comebackMessage,
  dueThisWeek,
  markBirthdaySent,
  markComebackSent,
  suggestSlot,
  type ReturnRow,
} from "@/lib/pro/agenda-clients";
import {
  dayLabel,
  localDate,
  minutesToLabel,
  money,
  plural,
  relative,
} from "@/lib/pro/format";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Tip,
  inputClass,
} from "../../kit";
import { NewBookingDrawer, type NewBookingPreset } from "./booking-drawers";
import {
  NotYet,
  WhatsAppButton,
  serviceStaff,
  staffFirst,
  useAgenda,
} from "./parts";

type Tab = "volver" | "riesgo" | "espera" | "cumple";
const nowIso = () => new Date().toISOString();
const DAY = 86400000;

/**
 * Seguimiento: a quién le toca volver, quién se está yendo, quién espera un
 * hueco y quién cumple años. Cada fila acaba en un WhatsApp ya escrito.
 */
export default function SeguimientoSection() {
  const { data, now, ops, vertical } = useAgenda();
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = React.useState<Tab>(
    initial === "riesgo" || initial === "espera" || initial === "cumple"
      ? initial
      : "volver",
  );
  const [preset, setPreset] = React.useState<NewBookingPreset>(null);
  const [adding, setAdding] = React.useState(false);

  if (!ops)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Seguimiento" title="Clientes que vuelven" />
        <NotYet
          icon={Repeat}
          title="Aún no hay historial suficiente"
          body="Con las visitas de tus clientes, aquí verás a quién le toca volver, quién espera hueco y quién cumple años."
        />
      </div>
    );

  const due = dueThisWeek(data, now);
  const risk = atRisk(data, now);
  const waiting = waitingCount(data);
  const birthdays = birthdaysSoon(data, now, 14);
  const recovered = recoveredThisMonth(data, now);
  const riskValue = risk.reduce((total, row) => total + row.yearlyCents, 0);
  const clients = vertical.clientsLabel.toLowerCase();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Seguimiento"
        title={
          due.length
            ? `A ${due.length} ${due.length === 1 ? "persona le toca" : "personas les toca"} volver`
            : "Tus clientes vuelven a su ritmo"
        }
        description={`Calculado con las visitas reales de cada ficha. ${risk.length ? `${risk.length} ${clients} fieles han roto su costumbre.` : ""}`}
        actions={
          <Button variant="dark" onClick={() => setAdding(true)}>
            <ListPlus className="h-4 w-4" /> Lista de espera
          </Button>
        }
      >
        <Segmented<Tab>
          label="Listas"
          value={tab}
          onChange={setTab}
          options={[
            { value: "volver", label: "Toca volver", count: due.length },
            { value: "riesgo", label: "En riesgo", count: risk.length },
            { value: "espera", label: "En espera", count: waiting },
            { value: "cumple", label: "Cumpleaños", count: birthdays.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={Repeat}
          label="Toca volver"
          value={due.length}
          hint="esta semana"
          emphasis={due.length > 0}
        />
        <Kpi
          icon={HeartCrack}
          label="En riesgo"
          value={risk.length}
          hint={
            riskValue
              ? `${money(riskValue, { round: true })} al año`
              : "nadie se está yendo"
          }
        />
        <Kpi
          icon={Users}
          label="En espera"
          value={waiting}
          hint="quieren un hueco"
        />
        <Kpi
          icon={Undo2}
          label="Huecos recuperados"
          value={recovered}
          hint={`${plural(noShowsThisMonth(data, now), "no presentado", "no presentados")} este mes`}
        />
      </KpiRow>

      {tab === "volver" ? (
        <ReturnList rows={due} onBook={setPreset} kind="due" />
      ) : null}
      {tab === "riesgo" ? <RiskList onBook={setPreset} /> : null}
      {tab === "espera" ? <WaitingList onAdd={() => setAdding(true)} /> : null}
      {tab === "cumple" ? <Birthdays rows={birthdays} /> : null}

      <Tip title="Cómo se calcula">
        Si alguien ha venido tres veces o más, usamos su propio ritmo. Si no, el
        &quot;vuelve cada&quot; del último servicio que se hizo, que cambias en
        Servicios.
      </Tip>

      <NewBookingDrawer preset={preset} onClose={() => setPreset(null)} />
      <WaitlistDrawer open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toca volver y en riesgo                                             */
/* ------------------------------------------------------------------ */

function ReturnList({
  rows,
  onBook,
  kind,
}: {
  rows: ReturnRow[];
  onBook: (preset: NewBookingPreset) => void;
  kind: "due" | "risk";
}) {
  if (!rows.length)
    return (
      <Panel>
        <Empty
          icon={Repeat}
          title={
            kind === "due"
              ? "Esta semana no le toca a nadie"
              : "Nadie ha roto su costumbre"
          }
          body={
            kind === "due"
              ? "Cuando alguien se acerque a su fecha de siempre, aparecerá aquí con el mensaje escrito."
              : "Aquí salen los fieles que llevan bastante más de lo normal sin venir."
          }
        />
      </Panel>
    );
  return (
    <Panel flush>
      <ul className="divide-y divide-border-light">
        {rows.map((row) => (
          <ReturnItem
            key={row.client.id}
            row={row}
            onBook={onBook}
            kind={kind}
          />
        ))}
      </ul>
    </Panel>
  );
}

function ReturnItem({
  row,
  onBook,
  kind,
}: {
  row: ReturnRow & { yearlyCents?: number; visits?: number };
  onBook: (preset: NewBookingPreset) => void;
  kind: "due" | "risk";
}) {
  const { data, now, run, allowed } = useAgenda();
  const slot = suggestSlot(data, row, now);
  const sent = row.client.agenda?.comebackSentAt;
  const recentlySent = sent && now.getTime() - Date.parse(sent) < 14 * DAY;
  const weeks = Math.round(row.cadence.days / 7);
  const when =
    row.lateDays > 0
      ? `le tocaba hace ${row.lateDays} ${row.lateDays === 1 ? "día" : "días"}`
      : row.lateDays === 0
        ? "le toca hoy"
        : row.lateDays === -1
          ? "le toca mañana"
          : `le toca en ${-row.lateDays} días`;

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={row.client.name} size="sm" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className="truncate">{row.client.name}</span>
            {recentlySent ? (
              <Pill>Avisado {relative(sent!, now.getTime())}</Pill>
            ) : null}
            {kind === "risk" && row.yearlyCents ? (
              <Pill tone="warning">
                {money(row.yearlyCents, { round: true })} al año
              </Pill>
            ) : null}
          </p>
          <p className="truncate text-xs text-text-muted">
            {row.service?.name ?? "Última visita"} hace {row.daysSince} días ·{" "}
            {row.cadence.source === "client"
              ? `suele venir ${everyWeeks(weeks)}`
              : `vuelve ${everyWeeks(weeks)}`}{" "}
            · {when}
          </p>
          {slot ? (
            <p className="mt-0.5 text-xs text-text-secondary">
              Hueco: {dayLabel(`${slot.date}T12:00:00Z`)} a las{" "}
              {minutesToLabel(slot.minute)} con {staffFirst(data, slot.staffId)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 pl-11 sm:pl-0">
        <WhatsAppButton
          phone={row.client.phone}
          message={comebackMessage(data, row, slot)}
          label="Escribir"
          onOpen={() => {
            if (allowed("agenda.comeback"))
              void run("agenda.comeback", (d) =>
                markComebackSent(d, row.client.id, nowIso()),
              );
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          className="h-10"
          onClick={() =>
            onBook({
              date: slot?.date ?? localDate(now),
              minute: slot?.minute,
              staffId: slot?.staffId,
              serviceId: row.service?.id,
              clientId: row.client.id,
            })
          }
        >
          <CalendarPlus className="h-4 w-4" /> Citar
        </Button>
      </div>
    </li>
  );
}

function RiskList({ onBook }: { onBook: (preset: NewBookingPreset) => void }) {
  const { data, now } = useAgenda();
  const [staffId, setStaffId] = React.useState("all");
  const all = atRisk(data, now);
  const rows =
    staffId === "all" ? all : all.filter((row) => row.last.staffId === staffId);
  const staff = serviceStaff(data);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-full gap-1.5 overflow-x-auto pro-scroll">
        {[{ id: "all", name: "Todos" }, ...staff].map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={staffId === s.id}
            onClick={() => setStaffId(s.id)}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-[0.82rem] font-semibold",
              staffId === s.id
                ? "border-text-primary bg-text-primary text-bg-primary"
                : "border-border bg-bg-primary text-text-secondary",
            )}
          >
            {s.id === "all" ? "Todos" : `De ${s.name.split(" ")[0]}`}
          </button>
        ))}
      </div>
      <ReturnList rows={rows} onBook={onBook} kind="risk" />
      {staffId !== "all" ? (
        <p className="text-xs text-text-muted">
          Clientela de {staffFirst(data, staffId)} que ha dejado de venir. Útil
          si esa persona cambia de turno o se va del equipo.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

function spanLabel(from: number, to: number) {
  if (from === 0 && to === 1440) return "cualquier hora";
  return `de ${minutesToLabel(from)} a ${minutesToLabel(to)}`;
}

function WaitingList({ onAdd }: { onAdd: () => void }) {
  const { data, now, ops, run, allowed } = useAgenda();
  const rows = (ops?.waitlist ?? [])
    .filter((entry) => entry.status === "waiting" || entry.status === "offered")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!rows.length)
    return (
      <Panel>
        <Empty
          icon={Users}
          title="Nadie espera hueco"
          body="Cuando alguien quiera una hora que no tienes, apúntalo. Si se cancela una cita que le encaja, te lo decimos."
          action={
            <Button variant="dark" onClick={onAdd}>
              Apuntar a alguien
            </Button>
          }
        />
      </Panel>
    );
  return (
    <Panel flush>
      <ul className="divide-y divide-border-light">
        {rows.map((entry) => {
          const service = data.services.find((s) => s.id === entry.serviceId);
          return (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5"
            >
              <Avatar name={entry.name} size="sm" />
              <span className="min-w-[11rem] flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{entry.name}</span>
                  {entry.status === "offered" ? (
                    <Pill tone="info">Avisada</Pill>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {service?.name} ·{" "}
                  {entry.date
                    ? dayLabel(`${entry.date}T12:00:00Z`)
                    : "cualquier día"}{" "}
                  · {spanLabel(entry.from, entry.to)}
                  {entry.staffId
                    ? ` · con ${staffFirst(data, entry.staffId)}`
                    : ""}{" "}
                  · apuntada {relative(entry.createdAt, now.getTime())}
                </span>
              </span>
              <WhatsAppButton
                phone={entry.phone}
                message={`Hola ${entry.name.split(" ")[0]}, te escribimos de ${data.space.name} por el hueco que buscabas para ${service?.name.toLowerCase() ?? "tu cita"}.`}
                label="Escribir"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-10"
                disabled={!allowed("agenda.waitlist")}
                onClick={() =>
                  void run("agenda.waitlist", (d) =>
                    setWaitlistStatus(d, entry.id, "removed"),
                  )
                }
              >
                Quitar
              </Button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function WaitlistDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, now, run, allowed } = useAgenda();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [client, setClient] = React.useState<ProClient | null>(null);
  const [phone, setPhone] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [span, setSpan] = React.useState<"morning" | "afternoon" | "any">(
    "any",
  );
  const [date, setDate] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setClient(null);
    setPhone("");
    setServiceId(data.services[0]?.id ?? "");
    setSpan("any");
    setDate("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matches =
    query.trim().length >= 2 && !client
      ? data.clients
          .filter((c) =>
            c.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .slice(0, 5)
      : [];
  const name = client?.name ?? query.trim();

  const save = async () => {
    const range =
      span === "morning"
        ? { from: 9 * 60, to: 14 * 60 }
        : span === "afternoon"
          ? { from: 15 * 60, to: 21 * 60 }
          : { from: 0, to: 1440 };
    if (
      await run("agenda.waitlist", (d) =>
        addWaitlist(d, {
          id: localId("w"),
          clientId: client?.id,
          name,
          phone: client?.phone ?? (phone || undefined),
          serviceId,
          date: date || undefined,
          ...range,
          createdAt: nowIso(),
          status: "waiting",
        }),
      )
    ) {
      toast.success("Apuntado en la lista de espera", name);
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Lista de espera"
      description="Si se libera un hueco que le encaje, te lo enseñamos con el mensaje escrito."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="dark"
            onClick={save}
            disabled={!name || !serviceId || !allowed("agenda.waitlist")}
          >
            Apuntar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Quién" htmlFor="wl-name">
          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
              <span className="truncate text-sm font-semibold">
                {client.name}
              </span>
              <button
                type="button"
                onClick={() => setClient(null)}
                className="inline-flex h-10 items-center text-xs font-semibold text-violet"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="wl-name"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre"
                className={inputClass}
              />
              {matches.length ? (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-bg-primary shadow-float">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setClient(c)}
                        className="flex min-h-10 w-full items-center px-3 py-2 text-left text-sm hover:bg-bg-secondary"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </FormField>
        {!client && query.trim().length >= 2 ? (
          <FormField
            label="Teléfono"
            htmlFor="wl-phone"
            hint="Para avisarle por WhatsApp."
          >
            <input
              id="wl-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </FormField>
        ) : null}
        <FormField label="Servicio">
          <ChoiceChips
            value={serviceId}
            onChange={setServiceId}
            options={data.services
              .filter((s) => s.priceCents > 0)
              .map((s) => ({ value: s.id, label: s.name }))}
          />
        </FormField>
        <FormField label="Franja">
          <ChoiceChips
            value={span}
            onChange={setSpan}
            options={[
              { value: "morning", label: "Mañana" },
              { value: "afternoon", label: "Tarde" },
              { value: "any", label: "Cualquier hora" },
            ]}
          />
        </FormField>
        <FormField
          label="Día"
          htmlFor="wl-date"
          hint="Déjalo vacío si le vale cualquier día."
        >
          <input
            id="wl-date"
            type="date"
            min={localDate(now)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Cumpleaños                                                          */
/* ------------------------------------------------------------------ */

function Birthdays({ rows }: { rows: ReturnType<typeof birthdaysSoon> }) {
  const { data, now, run, allowed } = useAgenda();
  if (!rows.length)
    return (
      <Panel>
        <Empty
          icon={Cake}
          title="Nadie cumple años en las dos próximas semanas"
          body="Apunta la fecha de cumpleaños en la ficha y te lo recordamos con la felicitación escrita."
        />
      </Panel>
    );
  return (
    <Panel flush>
      <ul className="divide-y divide-border-light">
        {rows.map(({ client, date, today }) => {
          // Felicitado en el último mes: este cumpleaños ya está hecho.
          const sentAt = client.agenda?.birthdaySentAt;
          const sent = sentAt && now.getTime() - Date.parse(sentAt) < 30 * DAY;
          const allowedMsg = canPromote(client);
          return (
            <li
              key={client.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5"
            >
              <Avatar name={client.name} size="sm" />
              <span className="min-w-[11rem] flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{client.name}</span>
                  {today ? <Pill tone="violet">Hoy</Pill> : null}
                  {sent ? <Pill tone="success">Felicitado</Pill> : null}
                </span>
                <span className="block text-xs text-text-muted">
                  {dayLabel(`${date}T12:00:00Z`)}
                </span>
              </span>
              {allowedMsg ? (
                <WhatsAppButton
                  phone={client.phone}
                  message={birthdayMessage(data, client)}
                  label="Felicitar"
                  onOpen={() => {
                    if (allowed("agenda.birthday"))
                      void run("agenda.birthday", (d) =>
                        markBirthdaySent(d, client.id, nowIso()),
                      );
                  }}
                />
              ) : (
                <Pill>No acepta mensajes</Pill>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** "cada semana", "cada 3 semanas". */
function everyWeeks(weeks: number): string {
  return weeks <= 1 ? "cada semana" : `cada ${weeks} semanas`;
}
