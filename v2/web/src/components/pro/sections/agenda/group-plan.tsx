"use client";

import * as React from "react";
import { CalendarClock, Copy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import { staffForService } from "@/lib/pro/agenda";
import {
  createGroupBookings,
  groupBookings,
  groupMemberName,
  groupPlan,
  groupScheduleText,
  parseNames,
  type GroupPlan,
} from "@/lib/pro/agenda-groups";
import {
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
} from "@/lib/pro/format";
import type { ProBooking, ProGroupRequest } from "@/lib/pro/types";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Drawer,
  FormField,
  inputClass,
  textareaClass,
} from "../../kit";
import { TONES } from "../../tones";
import {
  Callout,
  OptionButton,
  WhatsAppButton,
  eurosText,
  parseEuros,
  useAgenda,
  useCopy,
} from "./parts";

/** Horas de inicio posibles para el grupo, cada cuarto de hora. */
const START_TIMES = Array.from({ length: 53 }, (_, i) => 7 * 60 + i * 15);

/**
 * Petición de grupo (graduación, orla, club) convertida en horario: una cita
 * por persona repartida entre los profesionales elegidos, en los primeros
 * huecos reales a partir de la hora que pidieron.
 */
export function GroupPlanDrawer({
  requestId,
  onClose,
}: {
  requestId: string | null;
  onClose: () => void;
}) {
  const { data } = useAgenda();
  const request = data.groupRequests.find((g) => g.id === requestId) ?? null;
  if (!request)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );
  const booked = groupBookings(data, request.id);
  return (
    <Drawer
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={request.kind}
      description={`${request.organization} · ${request.people} personas`}
    >
      {booked.length ? (
        <GroupSchedule request={request} bookings={booked} />
      ) : (
        <GroupBuilder request={request} onClose={onClose} />
      )}
    </Drawer>
  );
}

function GroupBuilder({
  request,
  onClose,
}: {
  request: ProGroupRequest;
  onClose: () => void;
}) {
  const { data, run, allowed, pending, can } = useAgenda();
  const toast = useToast();
  const services = data.services.filter((s) => s.priceCents > 0);
  const [serviceId, setServiceId] = React.useState(
    () => guessService(services, request)?.id ?? "",
  );
  const service = data.services.find((s) => s.id === serviceId);
  const [date, setDate] = React.useState(localDate(request.date));
  const [from, setFrom] = React.useState(
    Math.floor(localMinutes(request.date) / 15) * 15,
  );
  const [staffIds, setStaffIds] = React.useState<string[]>(
    staffForService(data, service).map((s) => s.id),
  );
  const [price, setPrice] = React.useState(() =>
    eurosText(
      request.quoteCents ??
        service?.studentPriceCents ??
        service?.priceCents ??
        request.budgetPerPersonCents,
    ),
  );
  const [namesText, setNamesText] = React.useState("");

  const eligible = staffForService(data, service);
  const chosen = staffIds.filter((id) => eligible.some((s) => s.id === id));
  const plan = service
    ? groupPlan(data, {
        date,
        fromMinute: from,
        serviceId: service.id,
        people: request.people,
        staffIds: chosen,
      })
    : null;
  const names = parseNames(namesText);
  const perPerson = parseEuros(price) ?? 0;
  const canCreate =
    allowed("agenda.group") &&
    Boolean(service && plan?.slots.length && perPerson > 0);

  const pickService = (id: string) => {
    const next = data.services.find((s) => s.id === id);
    setServiceId(id);
    setStaffIds(staffForService(data, next).map((s) => s.id));
    if (!request.quoteCents && next)
      setPrice(eurosText(next.studentPriceCents ?? next.priceCents));
  };

  const create = async () => {
    if (!service || !plan) return;
    const ok = await run("agenda.group", (d) =>
      createGroupBookings(d, {
        request,
        plan,
        serviceId: service.id,
        names,
        perPersonCents: perPerson,
        ids: plan.slots.map(() => localId("b")),
      }),
    );
    if (!ok) return;
    toast.success(
      `${plural(plan.slots.length, "cita", "citas")} en tu agenda`,
      `${request.organization}, ${dayLabel(`${date}T12:00:00Z`)} de ${minutesToLabel(plan.slots[0].minute)} a ${minutesToLabel(plan.endMinute ?? from)}.`,
    );
  };

  const decline = async () => {
    if (
      await run("group.declined", (d) => ({
        ...d,
        groupRequests: d.groupRequests.map((g) =>
          g.id === request.id ? { ...g, status: "declined" as const } : g,
        ),
      }))
    ) {
      toast.info("Solicitud descartada");
      onClose();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-bg-secondary p-4 text-sm">
        <p className="font-semibold">{request.organizer}</p>
        <p className="mt-1.5 text-text-secondary">{request.message}</p>
        <p className="mt-2 text-xs text-text-muted">
          Pedían {money(request.budgetPerPersonCents)} por persona para el{" "}
          {dayLabel(request.date)}.
        </p>
      </div>

      <FormField label="Servicio">
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <OptionButton
              key={s.id}
              active={serviceId === s.id}
              onClick={() => pickService(s.id)}
            >
              {s.name}
            </OptionButton>
          ))}
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Día" htmlFor="gp-date">
          <input
            id="gp-date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="Desde" htmlFor="gp-from">
          <select
            id="gp-from"
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
            className={inputClass}
          >
            {START_TIMES.map((m) => (
              <option key={m} value={m}>
                {minutesToLabel(m)}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      <FormField label="Quién atiende">
        <div className="flex flex-wrap gap-2">
          {eligible.map((person) => {
            const on = chosen.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setStaffIds((prev) =>
                    on
                      ? prev.filter((id) => id !== person.id)
                      : [...prev, person.id],
                  )
                }
                className={cn(
                  "flex h-10 items-center gap-2 rounded-xl border pl-1.5 pr-3 text-sm font-semibold",
                  on
                    ? "border-violet bg-violet-50 text-violet-deep"
                    : "border-border text-text-secondary",
                )}
              >
                <Avatar name={person.name} tone={person.tone} size="xs" />
                {person.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </FormField>

      <FormField
        label="Precio por persona (€)"
        htmlFor="gp-price"
        hint={
          perPerson
            ? `Total del grupo: ${money(perPerson * request.people, { round: true })}`
            : undefined
        }
      >
        <input
          id="gp-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClass}
        />
      </FormField>

      <FormField
        label="Nombres"
        htmlFor="gp-names"
        hint="Uno por línea, en el orden en que quieran entrar. Si aún no los tienes, se apuntan numerados y los cambias después."
      >
        <textarea
          id="gp-names"
          value={namesText}
          onChange={(e) => setNamesText(e.target.value)}
          placeholder={"Carla\nMarta\nLucía"}
          className={textareaClass}
        />
      </FormField>

      {plan ? (
        <PlanPreview request={request} plan={plan} names={names} />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border-light pt-4">
        <Button
          variant="ghost"
          disabled={pending || !can("group.declined")}
          onClick={decline}
        >
          No podemos
        </Button>
        <Button
          variant="dark"
          disabled={pending || !canCreate}
          onClick={create}
        >
          <CalendarClock className="h-4 w-4" />
          {plan?.slots.length
            ? `Montar ${plural(plan.slots.length, "cita", "citas")}`
            : "Montar el horario"}
        </Button>
      </div>
    </div>
  );
}

/** Columnas por profesional con la hora y el nombre de cada persona. */
function PlanPreview({
  request,
  plan,
  names,
}: {
  request: ProGroupRequest;
  plan: GroupPlan;
  names: string[];
}) {
  const { data } = useAgenda();
  const columns = data.staff
    .map((person) => ({
      person,
      slots: plan.slots.filter((slot) => slot.staffId === person.id),
    }))
    .filter((column) => column.slots.length);

  return (
    <div className="flex flex-col gap-3">
      {plan.slots.length ? (
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text-primary">
            {plan.slots.length} de {request.people} personas
          </span>{" "}
          de {minutesToLabel(plan.slots[0].minute)} a{" "}
          {minutesToLabel(plan.endMinute ?? 0)}.
        </p>
      ) : null}
      {plan.missing ? (
        <Callout
          tone="warning"
          icon={Users}
          title={`Faltan ${plan.missing} ${plan.missing === 1 ? "hueco" : "huecos"} ese día`}
        >
          Añade a alguien más, empieza antes o reparte el grupo en dos días.
        </Callout>
      ) : null}
      {columns.length ? (
        <div className="overflow-x-auto pro-scroll">
          <div className="flex gap-2">
            {columns.map(({ person, slots }) => (
              <div
                key={person.id}
                className="min-w-[9.5rem] flex-1 rounded-2xl border border-border p-2.5"
              >
                <p className="flex items-center gap-1.5 px-1 pb-2 text-xs font-semibold">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      TONES[person.tone].dot,
                    )}
                  />
                  {person.name.split(" ")[0]}
                  <span className="font-normal text-text-muted">
                    · {slots.length}
                  </span>
                </p>
                <ul className="flex flex-col gap-1">
                  {slots.map((slot) => (
                    <li
                      key={slot.index}
                      className="flex items-baseline gap-2 rounded-lg bg-bg-secondary px-2 py-1.5 text-xs"
                    >
                      <span className="font-semibold tabular">
                        {minutesToLabel(slot.minute)}
                      </span>
                      <span className="truncate text-text-secondary">
                        {groupMemberName(request, names, slot.index)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Grupo ya montado: el horario, listo para mandar al organizador. */
function GroupSchedule({
  request,
  bookings,
}: {
  request: ProGroupRequest;
  bookings: ProBooking[];
}) {
  const { data } = useAgenda();
  const copy = useCopy();
  const text = groupScheduleText(data, request, bookings);
  const total = bookings.reduce((sum, b) => sum + b.priceCents, 0);
  const first = bookings[0];
  const last = bookings[bookings.length - 1];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">
          {bookings.length} citas
        </span>{" "}
        el {dayLabel(first.start)}, de{" "}
        {minutesToLabel(localMinutes(first.start))} a{" "}
        {minutesToLabel(localMinutes(last.end))}.{" "}
        {money(total, { round: true })} en total.
      </p>
      <ul className="divide-y divide-border-light rounded-2xl border border-border">
        {bookings.map((booking) => {
          const person = data.staff.find((s) => s.id === booking.staffId);
          return (
            <li
              key={booking.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span className="w-12 font-semibold tabular">
                {minutesToLabel(localMinutes(booking.start))}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {booking.clientName}
              </span>
              {person ? (
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Avatar name={person.name} tone={person.tone} size="xs" />
                  {person.name.split(" ")[0]}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-10"
          onClick={() => copy(text, "Horario copiado")}
        >
          <Copy className="h-4 w-4" /> Copiar horario
        </Button>
        <WhatsAppButton
          share
          message={text}
          label="Mandar al organizador"
          variant="dark"
          size="default"
        />
      </div>
    </div>
  );
}

/** Minúsculas y sin tildes, para comparar palabras. */
function plain(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * El servicio que más se parece a lo que pide el grupo: "Peinados para la
 * graduación" elige Peinado evento, no el primer corte de la lista. Compara
 * el principio de cada palabra del servicio con la petición.
 */
function guessService<T extends { name: string }>(
  services: T[],
  request: ProGroupRequest,
): T | undefined {
  const wanted = plain(`${request.kind} ${request.message}`);
  let best = services[0];
  let bestScore = 0;
  for (const service of services) {
    const score = plain(service.name)
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 4)
      .filter((word) => wanted.includes(word.slice(0, 5))).length;
    if (score > bestScore) {
      best = service;
      bestScore = score;
    }
  }
  return best;
}
