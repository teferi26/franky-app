"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  DoorOpen,
  HeartPulse,
  Languages,
  MessageCircle,
  Repeat,
  Repeat2,
  Sparkles,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBooking, ProClassSession, ProClassType, ToneKey } from "@/lib/pro/types";
import { addDays, atLocal, dayLabel, durationLabel, localDate, localMinutes, minutesToLabel, money, plural, time } from "@/lib/pro/format";
import {
  FALLBACK_PER_PLAYER_CENTS,
  classCopy,
  freeSpots,
  isRoomMode,
  isTrial,
  memberPrice,
  monthlyEquivalent,
  priceForPlayers,
  sessionRoster,
  sessionState,
  shortUni,
  withRoster,
} from "@/lib/pro/classes";
import { careOf, extrasOf, noShowCount, pendingRecoveries, spendRecovery } from "@/lib/pro/classes-care";
import { addRecoveryWithRules, recoveryRulesOf } from "@/lib/pro/classes-study";
import {
  acceptWaitOffer,
  bookLinkedRooms,
  cancelVerdict,
  expireWaitOffers,
  hasExpiredOffers,
  linkedSessions,
  patchRoomBooking,
  patchSessionExtra,
  pendingOfferFor,
  removeAndOffer,
  roomConflicts,
  sessionExtra,
  siblingRooms,
  staffFor,
  substituteCoach,
  typeExtra,
  waitTrace,
} from "@/lib/pro/classes-ops";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Meter, Pill, SearchInput, Segmented, inputClass } from "../../kit";
import { TONES, TONE_ORDER } from "../../tones";
import { sectionHref } from "../../shell";
import type { OfferPreset } from "../common/offer-composer";
import { RealNewSessionDrawer, RealSessionDrawer } from "./real-parts";
import { BoardEditor } from "./board";
import { GroupMessageDrawer } from "./group-message";
import { GroupStudy } from "./study";
import { RoomBookingCard } from "./room";
import { Stepper } from "./ui";

const FRANKY = new Set(["franky", "hueco", "card", "grupo"]);

export function isFromFranky(source: ProBooking["source"] | undefined) {
  return Boolean(source && FRANKY.has(source));
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.82rem] font-semibold transition-colors",
        active ? "border-text-primary bg-text-primary text-bg-primary" : "border-border bg-bg-primary text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}

/** Ocupación de una sesión en tono de semáforo: llena, casi llena, con sitio. */
export function fillTone(s: ProClassSession): "danger" | "warning" | "violet" | "success" {
  if (s.booked >= s.capacity) return "danger";
  if (s.booked / s.capacity >= 0.75) return "warning";
  return "violet";
}

/* ------------------------------------------------------------------ */
/* Detalle de sesión: inscritos, lista de espera y pasar lista          */
/* ------------------------------------------------------------------ */

type Tab = "list" | "wait" | "add" | "board" | "group";

export function SessionDrawer(props: React.ComponentProps<typeof DemoSessionDrawer>) {
  const { demo } = usePro();
  return demo ? <DemoSessionDrawer {...props} /> : <RealSessionDrawer {...props} />;
}

function DemoSessionDrawer({
  sessionId,
  onClose,
  onOffer,
}: {
  sessionId: string | null;
  onClose: () => void;
  onOffer?: (preset: OfferPreset) => void;
}) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const [tab, setTab] = React.useState<Tab>("list");
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [trial, setTrial] = React.useState(true);
  const [groupSize, setGroupSize] = React.useState(4);
  const [groupStudents, setGroupStudents] = React.useState(true);
  const [changingCoach, setChangingCoach] = React.useState(false);
  const [messaging, setMessaging] = React.useState(false);

  React.useEffect(() => {
    setTab("list");
    setConfirmCancel(false);
    setQuery("");
    setNewName("");
    setTrial(true);
    setGroupSize(4);
    setGroupStudents(true);
    setChangingCoach(false);
  }, [sessionId]);

  // Las plazas ofrecidas que nadie confirmó a tiempo pasan solas a la siguiente persona.
  const expired = sessionId ? hasExpiredOffers(data, now) : false;
  React.useEffect(() => {
    if (!expired) return;
    void update("class.waitlist.expire", (d) => expireWaitOffers(d, now, () => localId("wo")));
  }, [expired, now, update]);

  const session = data.sessions.find((s) => s.id === sessionId) ?? null;
  if (!session) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const coach = data.staff.find((s) => s.id === session.coachId);
  const state = sessionState(session, now);
  const { booked, waitlist } = sessionRoster(data, session, now);
  const today = localDate(now);
  const isToday = localDate(session.start) === today;
  const canCheck = isToday || localDate(session.start) < today;
  const spots = freeSpots(session);
  const arrived = booked.filter((b) => b.status === "arrived").reduce((a, b) => a + b.partySize, 0);
  const perGroup = isRoomMode(data, ct);
  const extra = sessionExtra(data, session.id);
  const original = extra.originalCoachId ? data.staff.find((s) => s.id === extra.originalCoachId) : undefined;
  const linked = linkedSessions(data, session.id);
  const trace = waitTrace(data, session.id);
  const policy = extrasOf(data).policy;
  const roomLimits = typeExtra(data, session.classTypeId).roomMode;
  const siblings = perGroup ? siblingRooms(data, session) : [];
  const showBoard = vertical.id === "sports";

  const toggle = (b: ProBooking) => {
    const next: ProBooking["status"] = b.status === "arrived" ? (state === "past" ? "no_show" : "confirmed") : "arrived";
    const isMember = Boolean(b.clientId && data.members.some((m) => m.id === b.clientId));
    const recovers = vertical.id === "academy" && next === "no_show" && isMember;
    // Con el tope de la academia alcanzado, la falta no deja otra recuperación.
    if (recovers && pendingRecoveries(data, b.clientId!, now).length >= recoveryRulesOf(data).maxPending) {
      toast.info(
        "Sin más recuperaciones",
        `${b.clientName.split(" ")[0]} ya tiene ${recoveryRulesOf(data).maxPending} clases por recuperar, el máximo de tu norma.`,
      );
    }
    void update("class.checkin", (d) => {
      const marked = withRoster(d, session.id, now, (list) => list.map((x) => (x.id === b.id ? { ...x, status: next } : x)));
      // En academias, una falta de un alumno deja una clase por recuperar.
      if (!recovers) return marked;
      return addRecoveryWithRules(marked, b.clientId!, session.id, localDate(session.start), localId("rc"), now).data;
    });
  };

  const allIn = () => {
    void update("class.checkin.all", (d) =>
      withRoster(d, session.id, now, (list) => list.map((x) => (x.status === "confirmed" || x.status === "no_show" ? { ...x, status: "arrived" } : x))),
    );
    toast.success("Lista pasada", `${session.booked} ${perGroup ? "personas" : copy.members} marcados como presentes.`);
  };

  const remove = (b: ProBooking) => {
    const first = waitlist[0];
    const hold = extrasOf(data).waitHoldHours;
    void update("class.remove", (d) => removeAndOffer(d, session.id, b.id, now, localId("wo")));
    const who = b.clientName.split(" ")[0];
    if (perGroup) {
      const verdict = cancelVerdict(policy, session.start, now);
      toast.success(`${who} cancela`, `${verdict.title}. ${verdict.detail}`);
      return;
    }
    toast.success(
      `${who} ya no viene`,
      first
        ? `La plaza se ofrece a ${first.clientName}, primera en espera. Tiene ${hold} h para confirmarla; si no, pasa a la siguiente.`
        : "Queda una plaza libre.",
    );
  };

  const promote = (b: ProBooking) => {
    void update("class.promote", (d) =>
      withRoster(d, session.id, now, (list) =>
        list.map((x) =>
          x.id === b.id
            ? {
                ...x,
                status: "confirmed",
                waitlisted: false,
                note: x.note === "Lista de espera" ? undefined : x.note,
              }
            : x,
        ),
      ),
    );
    toast.success("Plaza dada", `${b.clientName} entra en la ${copy.sessionOne}. Le avisamos en Franky.`);
  };

  const accept = (offerId: string, name: string) => {
    void update("class.waitlist.accept", (d) => acceptWaitOffer(d, offerId, now));
    toast.success("Plaza confirmada", `${name} viene.`);
  };

  const add = (person: { id?: string; name: string; student?: boolean; source?: ProBooking["source"] }) => {
    const size = perGroup ? groupSize : 1;
    const toWait = !perGroup && spots < 1;
    const price = perGroup ? priceForPlayers(typeExtra(data, session.classTypeId).playerPrices, size, Boolean(person.student)) : 0;
    const booking: ProBooking = {
      id: localId("cb"),
      kind: "class",
      clientId: person.id,
      clientName: person.name,
      sessionId: session.id,
      staffId: session.coachId,
      start: session.start,
      end: session.end,
      partySize: size,
      status: toWait ? "requested" : "confirmed",
      priceCents: price,
      paidCents: 0,
      source: person.source ?? "walkin",
      student: person.student,
      waitlisted: toWait,
      trial: !toWait && !person.id && trial && vertical.id !== "culture",
      note: !toWait && !person.id && trial && vertical.id === "culture" ? "Primera visita" : undefined,
    };
    const recovering = vertical.id === "academy" && !toWait && person.id ? pendingRecoveries(data, person.id, now).length > 0 : false;
    void update("class.add", (d) => {
      const withBooking = withRoster(d, session.id, now, (list) => [...list, booking]);
      const withInfo = perGroup ? patchRoomBooking(withBooking, booking.id, { players: size, language: extra.language }) : withBooking;
      return recovering && person.id ? spendRecovery(withInfo, person.id, session.id, now) : withInfo;
    });
    toast.success(
      toWait ? "Apuntado en lista de espera" : recovering ? "Recuperación apuntada" : "Apuntado",
      toWait
        ? `${person.name} es el número ${waitlist.length + 1}.`
        : recovering
          ? `${person.name} recupera en ${ct?.name} a las ${time(session.start)}. Se descuenta de sus recuperaciones.`
          : `${person.name} en ${ct?.name} a las ${time(session.start)}${perGroup ? `, ${money(price)}` : ""}.`,
    );
    setNewName("");
    setQuery("");
    setTab(toWait ? "wait" : "list");
  };

  // Grupo más grande que la sala: se reparte con otra sala libre a la misma hora.
  const bookBig = (people: number) => {
    const rooms = [session, ...siblings.slice(0, Math.max(1, Math.ceil(people / (roomLimits?.maxPlayers ?? 6)) - 1))];
    void update("class.rooms.link", (d) =>
      bookLinkedRooms(d, { sessions: rooms, clientName: newName.trim(), people, student: groupStudents, linkId: localId("lk"), bookingId: () => localId("cb") }, now),
    );
    toast.success("Grupo repartido", `${newName.trim()}: ${people} personas en ${rooms.map((r) => r.room).join(" y ")} a las ${time(session.start)}.`);
    setNewName("");
    setTab("list");
  };

  const changeCoach = (id: string) => {
    const who = data.staff.find((s) => s.id === id);
    void update("class.substitute", (d) => substituteCoach(d, session.id, id));
    setChangingCoach(false);
    toast.success("Cambio hecho", `${who?.name.split(" ")[0]} da esta ${copy.sessionOne}. Las horas cuentan para ${who?.name.split(" ")[0]}.`);
  };

  const toggleLanguage = () => {
    const next = extra.language === "en" ? "es" : "en";
    void update("class.language", (d) => patchSessionExtra(d, session.id, { language: next }));
  };

  const cancelSession = () => {
    void update("class.cancel", (d) => ({
      ...d,
      sessions: d.sessions.filter((s) => s.id !== session.id),
      bookings: d.bookings.filter((b) => b.sessionId !== session.id),
    }));
    toast.success(`${capitalize(copy.sessionOne)} cancelada`, `Avisamos a ${session.booked} ${perGroup ? "personas" : "inscritos"}${session.waitlist ? ` y ${session.waitlist} en espera` : ""}.`);
    onClose();
  };

  const members = data.members.filter((m) => m.status !== "cancelled" && !booked.some((b) => b.clientId === m.id) && !waitlist.some((b) => b.clientId === m.id));
  const matches = query.trim()
    ? [
        ...members
          .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
          .map((m) => {
            const rec = vertical.id === "academy" ? pendingRecoveries(data, m.id, now).length : 0;
            const plan = data.plans.find((p) => p.id === m.planId)?.name ?? "";
            return { id: m.id, name: m.name, sub: rec ? `${plan} · ${plural(rec, "clase por recuperar", "clases por recuperar")}` : plan, student: Boolean(m.student?.verified), source: m.source };
          }),
        ...data.clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).map((c) => ({ id: c.id, name: c.name, sub: c.tags[0] ?? "Cliente", student: Boolean(c.student?.verified), source: c.source })),
      ].slice(0, 6)
    : [];

  const coachOptions =
    vertical.id === "culture"
      ? staffFor(data, { room: session.room, language: extra.language ?? "es", start: session.start, end: session.end, excludeId: session.id })
      : data.staff.filter((s) => s.role !== "reception").map((s) => ({ staffId: s.id, name: s.name, ok: true, why: undefined as string | undefined }));

  const footer = confirmCancel ? (
    <>
      <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Volver</Button>
      <Button variant="destructive" onClick={cancelSession}>Sí, cancelar y avisar</Button>
    </>
  ) : (
    <>
      {state !== "past" ? (
        <Button variant="ghost" onClick={() => setConfirmCancel(true)} className="mr-auto text-rose-600">
          Cancelar {copy.sessionOne}
        </Button>
      ) : null}
      {state === "next" && spots > 0 && onOffer && !perGroup ? (
        <Button
          variant="outline"
          onClick={() => {
            onOffer({
              what: `${ct?.name ?? "Clase"} de las ${time(session.start)}`,
              date: localDate(session.start),
              from: localMinutes(session.start),
              to: localMinutes(session.end),
              priceCents: vertical.id === "academy" ? 1800 : 1200,
              slots: spots,
            });
            onClose();
          }}
        >
          <Zap className="h-4 w-4" /> Ofrecer {spots} {spots === 1 ? "plaza" : "plazas"}
        </Button>
      ) : null}
      {state === "next" && perGroup && !session.booked && onOffer ? (
        <Button
          variant="outline"
          onClick={() => {
            onOffer({
              what: `${ct?.name ?? "Sala"} de las ${time(session.start)}`,
              date: localDate(session.start),
              from: localMinutes(session.start),
              to: localMinutes(session.end),
              priceCents: FALLBACK_PER_PLAYER_CENTS,
              slots: 1,
            });
            onClose();
          }}
        >
          <Zap className="h-4 w-4" /> Llenar con estudiantes
        </Button>
      ) : null}
      {canCheck && booked.length && !perGroup ? (
        <Button variant="dark" onClick={allIn} disabled={arrived >= session.booked}>
          <Check className="h-4 w-4" /> {arrived >= session.booked ? "Todos presentes" : "Marcar a todos"}
        </Button>
      ) : !booked.length || !perGroup ? (
        <Button variant="dark" onClick={() => setTab("add")}>
          <UserPlus className="h-4 w-4" /> {perGroup ? "Reservar la sala" : "Apuntar a alguien"}
        </Button>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={ct?.name ?? capitalize(copy.sessionOne)}
      description={`${capitalize(dayLabel(session.start))} · ${time(session.start)} a ${time(session.end)} · ${session.room}`}
      footer={footer}
      wide
    >
      {confirmCancel ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="font-semibold">¿Cancelar esta {copy.sessionOne}?</p>
          <p className="mt-1">
            Mandamos un aviso a {session.booked} {perGroup ? "personas" : "inscritos"}
            {session.waitlist ? ` y a ${session.waitlist} en lista de espera` : ""}. A quien tenga bono se le devuelve la sesión.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3">
              {coach ? <Avatar name={coach.name} tone={coach.tone} size="sm" /> : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {coach?.name ?? "Sin asignar"}
                  {original ? <span className="font-normal text-text-muted"> · sustituye a {original.name.split(" ")[0]}</span> : null}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {ct?.category}
                  {ct?.level ? ` · ${ct.level}` : ""} · {durationLabel(ct?.durationMin ?? 60)}
                </p>
              </div>
              {state === "live" ? <Pill tone="success">En curso</Pill> : state === "past" ? <Pill>Terminada</Pill> : null}
            </div>
            {!perGroup ? (
              <>
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <p className="font-heading text-2xl font-extrabold tabular">
                    {session.booked}
                    <span className="text-base font-bold text-text-muted">/{session.capacity}</span>
                  </p>
                  <p className="text-sm text-text-muted">
                    {canCheck ? `${arrived} ${state === "next" ? "confirmados" : "han llegado"}` : spots ? `${spots} libres` : "Completa"}
                    {session.waitlist ? ` · ${session.waitlist} en espera` : ""}
                  </p>
                </div>
                <Meter value={session.booked} max={session.capacity} className="mt-2" tone={fillTone(session) === "danger" ? "danger" : fillTone(session) === "warning" ? "warning" : "violet"} />
              </>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {state !== "past" ? (
                <Button size="sm" variant="ghost" onClick={() => setChangingCoach((v) => !v)}>
                  <Repeat2 className="h-3.5 w-3.5" /> Cambiar {copy.coach}
                </Button>
              ) : null}
              {!perGroup && booked.length ? (
                <Button size="sm" variant="ghost" onClick={() => setMessaging(true)}>
                  <MessageCircle className="h-3.5 w-3.5" /> Mensaje al grupo
                </Button>
              ) : null}
              {vertical.id === "culture" ? (
                <Button size="sm" variant="ghost" aria-pressed={extra.language === "en"} onClick={toggleLanguage}>
                  <Languages className="h-3.5 w-3.5" /> {extra.language === "en" ? "En inglés" : "En español"}
                </Button>
              ) : null}
              {linked.length ? <Pill tone="violet">Grupo enlazado con {linked.map((s) => s.room).join(", ")}</Pill> : null}
            </div>
            {changingCoach ? (
              <div className="mt-3 flex flex-col gap-1.5">
                {coachOptions.map((o) => (
                  <button
                    key={o.staffId}
                    type="button"
                    disabled={o.staffId === session.coachId}
                    onClick={() => changeCoach(o.staffId)}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-xl border px-3 text-left text-sm transition-colors disabled:opacity-50",
                      o.ok ? "border-border hover:border-text-primary/30" : "border-dashed border-border text-text-muted",
                    )}
                  >
                    <span className="font-semibold">{o.name}</span>
                    <span className="ml-auto text-xs">{o.staffId === session.coachId ? "La da ahora" : o.why ?? "Disponible"}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Segmented
            label="Lista"
            value={tab}
            onChange={setTab}
            options={[
              { value: "list", label: perGroup ? "Reserva" : canCheck ? "Pasar lista" : "Inscritos", count: perGroup ? undefined : booked.length },
              ...(perGroup ? [] : [{ value: "wait" as Tab, label: "En espera", count: waitlist.length }]),
              ...(showBoard ? [{ value: "board" as Tab, label: "Pizarra" }] : []),
              ...(vertical.id === "academy" ? [{ value: "group" as Tab, label: "Grupo" }] : []),
              { value: "add", label: perGroup ? "Reservar" : "Apuntar" },
            ]}
          />

          {tab === "list" && perGroup ? (
            booked.length ? (
              <div className="flex flex-col gap-3">
                {booked.map((b) => (
                  <RoomBookingCard key={b.id} session={session} booking={b} />
                ))}
                {state !== "past" ? (
                  <button type="button" onClick={() => remove(booked[0])} className="self-start text-sm font-semibold text-rose-600">
                    Cancelar la reserva ({cancelVerdict(policy, session.start, now).title.toLowerCase()})
                  </button>
                ) : null}
              </div>
            ) : (
              <Empty
                icon={DoorOpen}
                title="Sala libre"
                body={state === "past" ? "Esta partida no tuvo reserva." : "Resérvala a mano o llénala con estudiantes que buscan plan a esta hora."}
                action={state !== "past" ? <Button variant="outline" onClick={() => setTab("add")}>Reservar la sala</Button> : undefined}
              />
            )
          ) : null}

          {tab === "list" && !perGroup ? (
            booked.length ? (
              <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
                {booked.map((b) => {
                  const care = b.clientId ? careOf(data, b.clientId) : {};
                  const faults = b.clientId ? noShowCount(data, b.clientId) : 0;
                  const recoveries = vertical.id === "academy" && b.clientId ? pendingRecoveries(data, b.clientId, now).length : 0;
                  const offer = pendingOfferFor(data, b.id);
                  return (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                      <Avatar name={b.clientName} size="sm" tone={b.status === "arrived" ? "emerald" : "slate"} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("flex items-center gap-1 truncate text-sm font-semibold", b.status === "no_show" && "text-text-muted line-through")}>
                          <span className="truncate">{b.clientName}</span>
                          {b.student ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                        </p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                          {isTrial(b) ? <Pill tone="violet">{vertical.id === "culture" ? "Primera visita" : "Clase de prueba"}</Pill> : null}
                          {offer ? <Pill tone="warning">Plaza ofrecida hasta las {time(offer.expiresAt)}</Pill> : null}
                          {faults >= 3 ? <Pill tone="danger">{faults} faltas sin avisar</Pill> : null}
                          {recoveries ? <Pill tone="info">{plural(recoveries, "recuperación", "recuperaciones")}</Pill> : null}
                          {isFromFranky(b.source) ? (
                            <span className="inline-flex items-center gap-1 text-violet-deep">
                              <Sparkles className="h-3 w-3" /> Vino por Franky
                            </span>
                          ) : null}
                          {b.status === "no_show" ? <span>No vino</span> : null}
                        </p>
                        {care.health ? (
                          <p className="mt-0.5 flex items-start gap-1 text-xs text-amber-800 dark:text-amber-300">
                            <HeartPulse className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-label="Aviso de salud" />
                            <span>{care.health}</span>
                          </p>
                        ) : null}
                      </div>
                      {offer ? (
                        <Button size="sm" variant="secondary" onClick={() => accept(offer.id, b.clientName)}>
                          Ha confirmado
                        </Button>
                      ) : canCheck ? (
                        <button
                          type="button"
                          onClick={() => toggle(b)}
                          aria-pressed={b.status === "arrived"}
                          aria-label={b.status === "arrived" ? `Quitar asistencia de ${b.clientName}` : `Marcar a ${b.clientName} como presente`}
                          className={cn(
                            "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
                            b.status === "arrived"
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-border text-text-secondary hover:border-text-primary/30 hover:text-text-primary",
                          )}
                        >
                          <Check className="h-4 w-4" strokeWidth={2.4} />
                          <span className="hidden sm:inline">{b.status === "arrived" ? "Está" : "Llegó"}</span>
                        </button>
                      ) : null}
                      {state !== "past" ? (
                        <button
                          type="button"
                          onClick={() => remove(b)}
                          aria-label={`Quitar a ${b.clientName} de la ${copy.sessionOne}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-bg-secondary hover:text-rose-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                icon={UserPlus}
                title="Nadie apuntado todavía"
                body={`Apunta a alguien a mano o comparte la ${copy.sessionOne} con estudiantes cerca.`}
                action={<Button variant="outline" onClick={() => setTab("add")}>Apuntar a alguien</Button>}
              />
            )
          ) : null}

          {tab === "wait" ? (
            <div className="flex flex-col gap-3">
              {waitlist.length ? (
                <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
                  {waitlist.map((b, i) => (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-6 text-center font-heading text-sm font-bold text-text-muted tabular">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-semibold">
                          <span className="truncate">{b.clientName}</span>
                          {b.student ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
                        </p>
                        <p className="text-xs text-text-muted">{i === 0 ? "Recibe la próxima plaza que se libere" : `Número ${i + 1} de la lista`}</p>
                      </div>
                      <Button size="sm" variant={spots > 0 ? "secondary" : "ghost"} disabled={spots < 1} onClick={() => promote(b)}>
                        Dar plaza
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon={Repeat} title="Nadie en espera" body={`Cuando la ${copy.sessionOne} se llene, los siguientes entrarán aquí por orden.`} />
              )}
              <p className="text-xs text-text-muted">
                Cuando alguien se borra, la plaza se ofrece sola a la primera persona de la lista. Tiene {extrasOf(data).waitHoldHours} h para confirmarla desde Franky; si no, pasa a la siguiente.
              </p>
              {trace.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Movimientos de la lista</p>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {trace.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          Plaza ofrecida a <span className="font-semibold">{o.clientName}</span> a las {time(o.offeredAt)}
                        </span>
                        <Pill tone={o.status === "accepted" ? "success" : o.status === "expired" ? "neutral" : "warning"}>
                          {o.status === "accepted" ? "Confirmó" : o.status === "expired" ? "No contestó" : `Hasta las ${time(o.expiresAt)}`}
                        </Pill>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "board" && showBoard ? <BoardEditor session={session} /> : null}

          {tab === "group" && vertical.id === "academy" ? <GroupStudy session={session} /> : null}

          {tab === "add" ? (
            <div className="flex flex-col gap-4">
              {!perGroup ? (
                <FormField label={`Buscar ${copy.member} o interesado`}>
                  <SearchInput value={query} onChange={setQuery} placeholder="Nombre" />
                </FormField>
              ) : null}
              {matches.length ? (
                <ul className="flex flex-col divide-y divide-border-light rounded-2xl border border-border">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => add(m)}
                        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-secondary"
                      >
                        <Avatar name={m.name} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{m.name}</span>
                          <span className="block truncate text-xs text-text-muted">{m.sub}</span>
                        </span>
                        <UserPlus className="h-4 w-4 text-violet" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="rounded-2xl bg-bg-secondary p-4">
                <p className="text-sm font-semibold">{perGroup ? "Nueva reserva de grupo" : "Alguien que aún no está en tu lista"}</p>
                <div className="mt-3 flex flex-col gap-3">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={perGroup ? "Nombre de quien reserva" : "Nombre y apellido"}
                    aria-label="Nombre"
                    className={inputClass}
                  />
                  {perGroup ? (
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-text-muted">Personas</p>
                        <Stepper value={groupSize} onChange={setGroupSize} min={roomLimits?.minPlayers ?? 1} max={(roomLimits?.maxPlayers ?? 6) * (siblings.length + 1)} label="Personas" />
                      </div>
                      <p className="text-right text-sm text-text-muted">
                        {groupSize > (roomLimits?.maxPlayers ?? 6)
                          ? `Grupo grande: se reparte en ${Math.min(siblings.length + 1, Math.ceil(groupSize / (roomLimits?.maxPlayers ?? 6)))} salas`
                          : `${money(priceForPlayers(typeExtra(data, session.classTypeId).playerPrices, groupSize, groupStudents))}${groupStudents ? " con precio estudiante" : ""}`}
                      </p>
                    </div>
                  ) : null}
                  {perGroup ? (
                    <label className="flex items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={groupStudents} onChange={(e) => setGroupStudents(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
                      Son estudiantes (precio estudiante)
                    </label>
                  ) : (
                    <label className="flex items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
                      Viene a {vertical.id === "culture" ? "su primera visita" : "una clase de prueba"}
                    </label>
                  )}
                  {perGroup && groupSize > (roomLimits?.maxPlayers ?? 6) ? (
                    <Button variant="dark" disabled={!newName.trim() || session.booked > 0} onClick={() => bookBig(groupSize)}>
                      <UserPlus className="h-4 w-4" /> Reservar {session.room} y {siblings[0]?.room ?? "otra sala"}
                    </Button>
                  ) : (
                    <Button variant="dark" disabled={!newName.trim() || (perGroup && session.booked > 0)} onClick={() => add({ name: newName.trim(), student: perGroup ? groupStudents : undefined })}>
                      <UserPlus className="h-4 w-4" /> {perGroup && session.booked > 0 ? "La sala ya está reservada" : !perGroup && spots < 1 ? "Apuntar en lista de espera" : "Apuntar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {messaging ? <GroupMessageDrawer session={session} onClose={() => setMessaging(false)} /> : null}
    </Drawer>
  );
}

export function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/* ------------------------------------------------------------------ */
/* Nueva sesión o nueva clase                                          */
/* ------------------------------------------------------------------ */

export type NewSessionPreset = { date: string; minute?: number; typeId?: string; createType?: boolean } | null;

export function NewSessionDrawer(props: { preset: NewSessionPreset; onClose: () => void }) {
  const { demo } = usePro();
  return demo ? <DemoNewSessionDrawer {...props} /> : <RealNewSessionDrawer {...props} />;
}

function DemoNewSessionDrawer({ preset, onClose }: { preset: NewSessionPreset; onClose: () => void }) {
  const { data, update, vertical, now } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const coaches = data.staff.filter((s) => s.role !== "reception");
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [typeId, setTypeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [duration, setDuration] = React.useState("60");
  const [tone, setTone] = React.useState<ToneKey>("sky");
  const [coachId, setCoachId] = React.useState("");
  const [date, setDate] = React.useState(localDate(now));
  const [minute, setMinute] = React.useState(18 * 60);
  const [capacity, setCapacity] = React.useState(12);
  const [room, setRoom] = React.useState("");
  const [repeat, setRepeat] = React.useState<"1" | "4" | "8">("4");
  const [language, setLanguage] = React.useState<"es" | "en">("es");

  React.useEffect(() => {
    if (!preset) return;
    const first = data.classTypes.find((c) => c.id === preset.typeId) ?? data.classTypes[0];
    setMode(preset.createType || !data.classTypes.length ? "new" : "existing");
    setTypeId(first?.id ?? "");
    setName("");
    setCategory("");
    setLevel("");
    setDuration("60");
    setTone(TONE_ORDER.find((t) => !data.classTypes.some((c) => c.tone === t)) ?? "sky");
    setCoachId(first?.coachId ?? coaches[0]?.id ?? "");
    setDate(preset.date);
    setMinute(preset.minute ?? 18 * 60);
    setCapacity(first?.capacity ?? 12);
    setRoom(data.sessions.find((s) => s.classTypeId === first?.id)?.room ?? "");
    setRepeat("4");
    setLanguage("es");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const pickType = (id: string) => {
    const ct = data.classTypes.find((c) => c.id === id);
    setTypeId(id);
    if (ct) {
      setCoachId(ct.coachId);
      setCapacity(ct.capacity);
      setRoom(data.sessions.find((s) => s.classTypeId === id)?.room ?? room);
    }
  };

  const ct = data.classTypes.find((c) => c.id === typeId);
  const minutes = mode === "new" ? Number(duration) : ct?.durationMin ?? 60;
  const valid = (mode === "existing" ? Boolean(ct) : name.trim().length > 1) && capacity > 0 && Boolean(coachId);
  const weeks = Number(repeat);
  const defaultRoom = vertical.id === "academy" ? "Aula 1" : "Sala principal";
  const roomName = room.trim() || defaultRoom;
  // Choques de sala contando el montaje entre partidas, en todas las semanas que se crean.
  const conflicts = Array.from({ length: weeks }, (_, w) => addDays(date, w * 7)).flatMap((day) =>
    roomConflicts(data, {
      room: roomName,
      start: atLocal(day, minute),
      end: atLocal(day, minute + minutes),
      classTypeId: mode === "existing" ? typeId : undefined,
    }),
  );
  const clash = conflicts[0];
  const clashType = clash ? data.classTypes.find((c) => c.id === clash.classTypeId) : undefined;
  // En ocio una sala no puede tener dos partidas a la vez; en clases se avisa y se deja decidir.
  const blocked = Boolean(clash) && vertical.id === "culture";
  const staffHints =
    vertical.id === "culture"
      ? new Map(
          staffFor(data, { room: roomName, language, start: atLocal(date, minute), end: atLocal(date, minute + minutes) }).map((o) => [o.staffId, o]),
        )
      : null;

  const save = () => {
    const newType: ProClassType | null =
      mode === "new"
        ? {
            id: localId("ct"),
            name: name.trim(),
            category: category.trim() || (vertical.id === "academy" ? "Todas las carreras" : "General"),
            durationMin: Number(duration),
            capacity,
            coachId,
            tone,
            level: level.trim() || undefined,
          }
        : null;
    const type = newType ?? ct!;
    const created: ProClassSession[] = Array.from({ length: weeks }, (_, w) => {
      const day = addDays(date, w * 7);
      return {
        id: localId("ss"),
        classTypeId: type.id,
        start: atLocal(day, minute),
        end: atLocal(day, minute + type.durationMin),
        capacity,
        booked: 0,
        waitlist: 0,
        checkedIn: 0,
        room: roomName,
        coachId,
      };
    });
    update("class.session.create", (d) => {
      const next = {
        ...d,
        classTypes: newType ? [...d.classTypes, newType] : d.classTypes,
        sessions: [...d.sessions, ...created],
      };
      return language === "en" ? created.reduce((acc, s) => patchSessionExtra(acc, s.id, { language: "en" }), next) : next;
    });
    toast.success(
      weeks > 1 ? `${weeks} ${copy.sessionMany} creadas` : `${capitalize(copy.sessionOne)} creada`,
      `${type.name}, ${dayLabel(atLocal(date, minute))} a las ${minutesToLabel(minute)}${weeks > 1 ? " y las semanas siguientes" : ""}. Ya se puede reservar en Franky.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title={mode === "new" ? copy.newType : copy.newSession}
      description={vertical.id === "academy" ? "Asignatura, carrera y horario. Tus alumnos la reservan desde Franky." : "Aparece en tu horario y en tu ficha de Franky al momento."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={!valid || blocked}>
            Crear {weeks > 1 ? `${weeks} ${copy.sessionMany}` : copy.sessionOne}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Segmented
          label="Tipo"
          value={mode}
          onChange={setMode}
          options={[
            { value: "existing", label: `De ${copy.typeOne === "actividad" ? "una actividad" : `un ${copy.typeOne}`} que ya tienes` },
            { value: "new", label: capitalize(copy.newType) },
          ]}
        />

        {mode === "existing" ? (
          <FormField label={capitalize(copy.typeOne)}>
            <div className="flex flex-wrap gap-2">
              {data.classTypes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={typeId === c.id}
                  onClick={() => pickType(c.id)}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-sm transition-colors",
                    typeId === c.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TONES[c.tone].dot)} />
                  <span>
                    <span className="block font-semibold">{c.name}</span>
                    {vertical.id === "academy" ? <span className="block text-xs text-text-muted">{c.category}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          </FormField>
        ) : (
          <>
            <FormField label={vertical.id === "academy" ? "Asignatura" : "Nombre"} htmlFor="ns-name">
              <input
                id="ns-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={vertical.id === "academy" ? "Física I" : vertical.id === "culture" ? "Taller de encuadernación" : "Movilidad"}
                className={inputClass}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={vertical.id === "academy" ? "Carrera" : "Categoría"} htmlFor="ns-cat">
                <input id="ns-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={vertical.id === "academy" ? "Ingenierías (EPS)" : "Fuerza"} className={inputClass} />
              </FormField>
              <FormField label={vertical.id === "academy" ? "Curso" : "Nivel"} htmlFor="ns-level">
                <input id="ns-level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder={vertical.id === "academy" ? "1.º curso" : "Todos los niveles"} className={inputClass} />
              </FormField>
            </div>
            <FormField label="Duración">
              <ChoiceChips
                value={duration}
                onChange={setDuration}
                options={["45", "60", "90", "120"].map((v) => ({ value: v, label: durationLabel(Number(v)) }))}
              />
            </FormField>
            <FormField label="Color en el horario">
              <div className="flex gap-2">
                {TONE_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-label={`Color ${t}`}
                    aria-pressed={tone === t}
                    onClick={() => setTone(t)}
                    className={cn("h-9 w-9 rounded-full border-2", TONES[t].bar, tone === t ? "border-text-primary" : "border-transparent")}
                  />
                ))}
              </div>
            </FormField>
          </>
        )}

        <FormField label={capitalize(copy.coach)}>
          <div className="flex flex-wrap gap-2">
            {coaches.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={coachId === s.id}
                onClick={() => setCoachId(s.id)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
                  coachId === s.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                )}
              >
                <Avatar name={s.name} tone={s.tone} size="xs" /> {s.name.split(" ")[0]}
                {staffHints && !staffHints.get(s.id)?.ok ? <span className="text-xs font-normal text-text-muted">· {staffHints.get(s.id)?.why}</span> : null}
              </button>
            ))}
          </div>
        </FormField>

        {vertical.id === "culture" ? (
          <FormField label="Idioma" hint={language === "en" ? "Se enseña en Franky a Erasmus e internacionales. Solo te sugerimos a quien la lleva en inglés." : undefined}>
            <ChoiceChips
              value={language}
              onChange={setLanguage}
              options={[
                { value: "es" as const, label: "Español" },
                { value: "en" as const, label: "Inglés" },
              ]}
            />
          </FormField>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Día" htmlFor="ns-date">
            <input id="ns-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hora" htmlFor="ns-time" hint={`Termina a las ${minutesToLabel(minute + minutes)}`}>
            <input
              id="ns-time"
              type="time"
              step={900}
              value={minutesToLabel(minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setMinute((h || 0) * 60 + (m || 0));
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label={copy.groups ? "Plazas" : "Aforo"} htmlFor="ns-cap">
            <input id="ns-cap" type="number" min={1} max={60} value={capacity} onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))} className={inputClass} />
          </FormField>
          <FormField label={capitalize(copy.place)} htmlFor="ns-room">
            <input id="ns-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder={vertical.id === "academy" ? "Aula 1" : "Sala principal"} className={inputClass} />
          </FormField>
        </div>

        {clash ? (
          <p
            role="alert"
            className={cn(
              "rounded-2xl p-3 text-sm",
              blocked ? "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
            )}
          >
            {roomName} está ocupada {dayLabel(clash.start, { weekday: true }).split(",")[0]} con {clashType?.name ?? "otra sesión"} de {time(clash.start)} a {time(clash.end)}
            {typeExtra(data, clash.classTypeId).setupMin ? ` más ${typeExtra(data, clash.classTypeId).setupMin} min de montaje` : ""}.
            {blocked ? " Elige otra hora u otra sala." : " Puedes crearla igualmente si usáis espacios distintos."}
          </p>
        ) : null}

        <FormField label="Repetir cada semana" hint={weeks > 1 ? `Se crean ${weeks} ${copy.sessionMany}, una cada ${dayLabel(atLocal(date, 600)).split(",")[0]}.` : "Solo este día."}>
          <ChoiceChips
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: "1", label: "No" },
              { value: "4", label: "4 semanas" },
              { value: "8", label: "8 semanas" },
            ]}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que Franky te ha traído (motor de clases)                        */
/* ------------------------------------------------------------------ */

export function ClassesFrankyCard() {
  const { data, now, spaceId, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const since = addDays(localDate(now), -60);
  const fromFranky = data.members.filter((m) => m.status !== "cancelled" && isFromFranky(m.source));
  const recent = fromFranky.filter((m) => localDate(m.since) >= since).length;
  const monthly = fromFranky.reduce((acc, m) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    return plan ? acc + (monthlyEquivalent(plan, memberPrice(m, plan)) || memberPrice(m, plan)) : acc;
  }, 0);
  const trials = data.offers.filter((o) => o.kind === "first_visit").reduce((a, o) => a + o.claimed, 0);
  const last4 = data.history.slice(-4);
  const people = data.members.length ? fromFranky.length : last4.reduce((a, w) => a + w.franky, 0);
  const revenue = data.members.length
    ? monthly
    : last4.reduce((a, w) => a + (w.total ? Math.round((w.revenueCents * w.franky) / w.total) : 0), 0);
  const today = data.bookings.filter((b) => b.sessionId && localDate(b.start) === localDate(now) && isFromFranky(b.source)).length;

  return (
    <section className="rounded-2xl bg-bg-dark p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Lo que te ha traído Franky</p>
      <p className="mt-2 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{people}</p>
      <p className="text-sm text-white/70">
        {data.members.length ? `${copy.members} activos llegaron por Franky` : "personas en el último mes llegaron por Franky"}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="font-heading text-xl font-bold tabular">{money(revenue, { round: true })}</p>
          <p className="text-xs text-white/60">{data.members.length ? "al mes en cuotas, sin comisión" : "facturado con ellos, sin comisión"}</p>
        </div>
        <div>
          <p className="font-heading text-xl font-bold tabular">{data.members.length ? recent : trials}</p>
          <p className="text-xs text-white/60">{data.members.length ? "altas en los últimos 60 días" : "primeras visitas este curso"}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/60">
        {trials ? `${trials} ${vertical.id === "culture" ? "grupos han venido por primera vez" : "clases de prueba pedidas este curso"}. ` : ""}
        {today ? `${today} de las reservas de hoy vienen de Franky.` : ""}
      </p>
      <Link href={sectionHref(spaceId, "estudiantes")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-white">
        Ver resultados y ofertas <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

export { shortUni };
