"use client";

import * as React from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CalendarPlus,
  CameraOff,
  Check,
  Eye,
  Hourglass,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  QrCode,
  Sparkles,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, minutesToLabel, money, relative, shortDay, time } from "@/lib/pro/format";
import {
  ACTIVITY_KIND_LABEL,
  FRANKY_FEE,
  SHIFT_ROLES,
  activityAttendees,
  activityIcs,
  activityNumbers,
  cancelRegistration,
  checkedInSet,
  communityOps,
  extendCapacity,
  freeSeats,
  openShiftSlots,
  parseClock,
  prepAlerts,
  prepFor,
  volunteerCallMessage,
  whatsAppShareUrl,
  withCommunityOps,
} from "@/lib/pro/community";
import type {
  CommunityActivity,
  CommunityActivityKind,
  CommunityMember,
  CommunityShift,
} from "@/lib/pro/community-types";
import { activityCertificatesHtml } from "@/lib/pro/community-docs";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Meter,
  Pill,
  SearchInput,
  Segmented,
  inputClass,
} from "../../kit";
import { sectionHref } from "../../shell";
import { downloadFile, fileSlug, openPrintable } from "./files";
import { ratingState } from "@/lib/pro/community-feedback";
import { FeedbackTab, RatingInline } from "./feedback";
import { PosterDrawer } from "./poster";
import { TripTab } from "./trip";
import { travellerMoney } from "@/lib/pro/community-trips";

export type ActivityTab = "inscritos" | "voluntarios" | "numeros" | "preparacion" | "valoracion" | "viaje";
type Tab = ActivityTab;

/** Cambia una actividad dentro de los datos. */
function patchActivity(d: ProData, id: string, fn: (a: CommunityActivity) => CommunityActivity): ProData {
  return {
    ...d,
    activities: d.activities.map((x) => (x.id === id ? fn(x as CommunityActivity) : x)),
  };
}

export function ActivityDrawer({
  activityId,
  onClose,
  initialTab = "inscritos",
}: {
  activityId: string | null;
  onClose: () => void;
  /** Pestaña con la que se abre (desde el Resumen, por ejemplo). */
  initialTab?: ActivityTab;
}) {
  const { data, now, update, spaceId } = usePro();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>("inscritos");
  const [poster, setPoster] = React.useState(false);
  const activity = (data.activities as CommunityActivity[]).find((a) => a.id === activityId);

  React.useEffect(() => {
    setTab(initialTab);
    setPoster(false);
  }, [activityId, initialTab]);

  if (!activity) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Actividad">
        <span />
      </Drawer>
    );
  }
  const a = activity;
  const members = data.communityMembers as CommunityMember[];
  const attendees = activityAttendees(a, members);
  const inside = checkedInSet(a, attendees);
  const isDraft = a.status === "draft";
  const done = a.status === "done";
  const happened = done || a.date < now.toISOString();
  const today = localDate(now);
  const alerts = prepAlerts(a, today);
  const openSlots = openShiftSlots(a);
  const url = `https://franky.es/n/${data.space.slug}`;
  // La pestaña de valoración aparece cuando la actividad ya ha acabado.
  const rating = ratingState(a, now);
  const rated = rating === "scheduled" || rating === "asked";
  // Los viajes tienen su pestaña de pagos a plazos.
  const isTrip = a.kind === "viaje" || Boolean(a.trip);
  const current: Tab = (tab === "valoracion" && !rated) || (tab === "viaje" && !isTrip) ? "inscritos" : tab;
  const lateTravellers = a.trip
    ? attendees.filter((p) => travellerMoney(a.trip!, p.id, today).state === "atrasado").length
    : 0;

  const certificates = () => {
    const html = activityCertificatesHtml(data, a.id, now);
    if (!html) return;
    const opened = openPrintable(html, `certificados-${a.title}`);
    update("activity.certificates", (d) =>
      withCommunityOps(
        patchActivity(d, a.id, (x) => ({ ...x, certificates: true, certificatesAt: new Date().toISOString() })),
        (o) =>
          o.documents.some((doc) => doc.source?.type === "certificates" && doc.source.activityId === a.id)
            ? o
            : {
                ...o,
                documents: [
                  {
                    id: localId("d"),
                    title: `Certificados: ${a.title}`,
                    kind: "certificado",
                    at: new Date().toISOString(),
                    by: "Secretaría",
                    source: { type: "certificates", activityId: a.id },
                  },
                  ...o.documents,
                ],
              },
      ),
    );
    toast.success(
      `${inside.size} certificados listos`,
      `${opened ? "Imprímelos o guárdalos en PDF desde la pestaña nueva." : "Se han descargado para abrirlos."} Quedan en el archivo de la junta.`,
    );
  };

  const publish = () => {
    update("activity.publish", (d) => patchActivity(d, a.id, (x) => ({ ...x, status: "published" })));
    toast.success("Actividad publicada", "Ya la ven los estudiantes de tu universidad en Franky.");
    onClose();
  };

  const close = () => {
    update("activity.close", (d) => patchActivity(d, a.id, (x) => ({ ...x, status: "done" })));
    toast.success("Actividad cerrada", `${inside.size} asistencias verificadas quedan guardadas para la memoria.`);
  };

  const ics = () => {
    downloadFile(
      activityIcs(a, { spaceName: data.space.name, url, now }),
      `${fileSlug(a.title)}.ics`,
      "text/calendar;charset=utf-8",
    );
  };

  const share = whatsAppShareUrl(
    `*${a.title}*\n${dayLabel(a.date)} a las ${time(a.date)}, ${a.place}.\n` +
      `${a.priceCents ? `Entrada: ${money(a.priceCents)}.` : "Gratis con inscripción."}` +
      `${a.ectsHours ? ` Cuenta ${a.ectsHours} h para créditos.` : ""}\nApúntate en Franky: ${url}`,
  );

  return (
    <Drawer
      open={Boolean(activityId)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={a.title}
      description={`${dayLabel(a.date)} a las ${time(a.date)} · ${a.place}`}
      footer={
        isDraft ? (
          <Button variant="dark" onClick={publish}>
            Publicar actividad
          </Button>
        ) : done ? (
          <Button variant="dark" onClick={certificates} disabled={!inside.size}>
            <Award className="h-4 w-4" /> {a.certificates ? "Volver a sacar certificados" : "Generar certificados"}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>
              Cerrar actividad
            </Button>
            <Button variant="dark" onClick={certificates} disabled={!inside.size}>
              <Award className="h-4 w-4" /> Generar certificados
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone={a.priceCents ? "neutral" : "success"}>
            {a.priceCents
              ? a.trip && a.trip.installments.length > 1
                ? `${money(a.priceCents)} en ${a.trip.installments.length} plazos`
                : `${money(a.priceCents)} la entrada`
              : "Gratis"}
          </Pill>
          {a.kind ? <Pill>{ACTIVITY_KIND_LABEL[a.kind]}</Pill> : null}
          {a.ectsHours ? <Pill tone="info">{a.ectsHours} h para créditos</Pill> : null}
          {(a.waitlist ?? []).length ? (
            <Pill tone="warning">
              <Hourglass className="h-3 w-3" /> {(a.waitlist ?? []).length} en espera
            </Pill>
          ) : null}
          {alerts.length ? <Pill tone="danger">{alerts.length} cosas por preparar</Pill> : null}
          <RatingInline activity={a} />
        </div>
        {a.description ? <p className="text-sm text-text-secondary">{a.description}</p> : null}

        {!isDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={share} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Compartir por WhatsApp
              </a>
            </Button>
            {!happened ? (
              <Button size="sm" variant="outline" onClick={ics}>
                <CalendarPlus className="h-3.5 w-3.5" /> Añadir al calendario
              </Button>
            ) : null}
            {!happened ? (
              <Button size="sm" variant="outline" onClick={() => setPoster(true)}>
                <ImageIcon className="h-3.5 w-3.5" /> Cartel y story
              </Button>
            ) : null}
          </div>
        ) : null}

        <Segmented<Tab>
          label="Partes de la actividad"
          value={current}
          onChange={setTab}
          options={[
            { value: "inscritos", label: "Inscritos", count: a.registered },
            ...(rated
              ? [{ value: "valoracion" as const, label: "Valoración", count: (a.ratings ?? []).length || undefined }]
              : []),
            ...(isTrip ? [{ value: "viaje" as const, label: "Pagos", count: lateTravellers || undefined }] : []),
            { value: "voluntarios", label: "Voluntarios", count: openSlots || undefined },
            { value: "numeros", label: "Números" },
            { value: "preparacion", label: "Preparación", count: alerts.length || undefined },
          ]}
        />

        {current === "inscritos" ? <RosterTab activity={a} /> : null}
        {current === "valoracion" ? <FeedbackTab activity={a} /> : null}
        {current === "viaje" ? <TripTab activity={a} /> : null}
        {current === "voluntarios" ? <ShiftsTab activity={a} /> : null}
        {current === "numeros" ? <NumbersTab activity={a} spaceId={spaceId} /> : null}
        {current === "preparacion" ? <PrepTab activity={a} /> : null}

        {a.reachOutside ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Eye className="h-4 w-4 shrink-0" /> La vieron {a.reachOutside.toLocaleString("es-ES")} estudiantes que
            no seguían a la asociación.
          </p>
        ) : null}
      </div>
      {!isDraft ? <PosterDrawer activity={a} open={poster} onClose={() => setPoster(false)} /> : null}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Inscritos, check-in y lista de espera                               */
/* ------------------------------------------------------------------ */

function RosterTab({ activity: a }: { activity: CommunityActivity }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<"todos" | "pendientes" | "dentro">("todos");

  const members = data.communityMembers as CommunityMember[];
  const byId = new Map(members.map((m) => [m.id, m]));
  const attendees = activityAttendees(a, members);
  const inside = checkedInSet(a, attendees);
  const isDraft = a.status === "draft";
  const done = a.status === "done";
  const happened = done || a.date < now.toISOString();
  const waitlist = a.waitlist ?? [];
  const free = freeSeats(a);
  const noPhotos = attendees.filter((p) => byId.get(p.id)?.imageConsent === false).length;
  const viaFranky = attendees.filter((p) => !p.member).length;

  const shown = attendees.filter((p) => {
    if (only === "pendientes" && inside.has(p.id)) return false;
    if (only === "dentro" && !inside.has(p.id)) return false;
    const q = query.toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.studies.toLowerCase().includes(q);
  });

  const toggle = (id: string, name: string) => {
    const next = new Set(inside);
    const adding = !next.has(id);
    if (adding) next.add(id);
    else next.delete(id);
    const at = new Date().toISOString();
    update("activity.checkin", (d) => ({
      ...patchActivity(d, a.id, (x) => ({ ...x, checkedIn: next.size, checkedInIds: [...next] })),
      // El socio que entra deja de estar dormido y suma una actividad.
      communityMembers: d.communityMembers.map((m) =>
        m.id !== id
          ? m
          : ({
              ...m,
              activities: Math.max(0, m.activities + (adding ? 1 : -1)),
              lastSeenAt: adding ? at : (m as CommunityMember).lastSeenAt,
            } as CommunityMember),
      ),
    }));
    if (adding) toast.success(`${name.split(" ")[0]} está dentro`, `${next.size} de ${a.registered} con check-in.`);
  };

  const cancel = (id: string, name: string) => {
    const result = cancelRegistration(a, id, members);
    update("activity.cancel", (d) => patchActivity(d, a.id, () => result.activity));
    const promoted = result.promoted[0];
    toast.success(
      `${name.split(" ")[0]} deja su plaza`,
      promoted
        ? `${promoted.name} sube de la lista de espera y le llega el aviso.`
        : "La plaza queda libre para quien se apunte.",
    );
  };

  const extend = (extra: number) => {
    const result = extendCapacity(a, extra);
    update("activity.extend", (d) => patchActivity(d, a.id, () => result.activity));
    toast.success(
      `Aforo ampliado a ${result.activity.capacity}`,
      result.promoted.length
        ? `${result.promoted.length} ${result.promoted.length === 1 ? "persona entra" : "personas entran"} desde la lista de espera y les llega el aviso.`
        : undefined,
    );
  };

  const oneCertificate = (id: string, name: string) => {
    const html = activityCertificatesHtml(data, a.id, now, [id]);
    if (html) openPrintable(html, `certificado-${name}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Inscritos" value={`${a.registered}/${a.capacity}`} />
        <Stat label="Check-in" value={inside.size} />
        <Stat
          label={a.priceCents ? "Cobrado" : "Plazas libres"}
          value={a.priceCents ? money(a.priceCents * a.registered, { round: true }) : free}
        />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-text-muted">
          <span>{happened ? "Asistencia" : "Ocupación"}</span>
          <span className="tabular">
            {happened ? `${inside.size} de ${a.registered}` : `${a.registered} de ${a.capacity}`}
          </span>
        </div>
        <Meter
          value={happened ? inside.size : a.registered}
          max={happened ? a.registered || 1 : a.capacity}
          tone={happened ? "success" : free <= 3 ? "warning" : "violet"}
        />
      </div>

      {!happened && !isDraft && (waitlist.length || free === 0) ? (
        <section className="rounded-2xl border border-border p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Hourglass className="h-4 w-4 text-violet" strokeWidth={1.9} />
              {waitlist.length ? `Lista de espera: ${waitlist.length}` : "Completa, sin lista de espera todavía"}
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => extend(1)}>
                +1 plaza
              </Button>
              <Button size="sm" variant="outline" onClick={() => extend(5)}>
                +5 plazas
              </Button>
            </div>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Si alguien deja su plaza o amplías aforo, entra el primero de la lista y le llega el aviso. Nadie
            tiene que estar pendiente.
          </p>
          {waitlist.length ? (
            <ol className="mt-3 divide-y divide-border-light">
              {waitlist.map((w, i) => (
                <li key={w.id} className="flex items-center gap-3 py-2">
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-text-muted tabular">{i + 1}</span>
                  <Avatar name={w.name} size="xs" tone="sky" />
                  <span className="min-w-0 flex-1 truncate text-sm">{w.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">{relative(w.joinedAt, now.getTime())}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {!isDraft ? (
        <div className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
          <QrCode className="h-9 w-9 shrink-0 text-text-primary" strokeWidth={1.5} />
          <p className="min-w-0 flex-1 text-sm text-text-secondary">
            En la puerta, escanea la entrada de cada persona desde la app. También puedes marcarla a mano aquí.
          </p>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-text-muted">
          Aún es un borrador. Cuando la publiques, los estudiantes podrán inscribirse y aquí verás la lista.
        </p>
      )}

      {!isDraft && attendees.length ? (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-base font-bold">Inscritos</h3>
            <span className="flex items-center gap-1 text-xs text-text-muted">
              <Sparkles className="h-3.5 w-3.5 text-violet" /> {viaFranky} no son socios y llegaron por Franky
            </span>
          </div>
          {noPhotos ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
              <CameraOff className="h-3.5 w-3.5" /> {noPhotos} prefieren no salir en fotos: llevan esta marca.
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o estudios" className="flex-1" />
            <Segmented
              size="sm"
              label="Filtrar inscritos"
              value={only}
              onChange={setOnly}
              options={[
                { value: "todos", label: "Todos" },
                { value: "pendientes", label: "Faltan", count: attendees.length - inside.size },
                { value: "dentro", label: "Dentro", count: inside.size },
              ]}
            />
          </div>
          <ul className="mt-2 divide-y divide-border-light">
            {shown.slice(0, 60).map((p) => {
              const isIn = inside.has(p.id);
              const member = byId.get(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                  <Avatar name={p.name} size="sm" tone={p.member ? "violet" : "sky"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold">
                      <span className="truncate">{p.name}</span>
                      {p.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Verificado" /> : null}
                      {member?.imageConsent === false ? (
                        <CameraOff className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-label="No quiere salir en fotos" />
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {p.studies} · {p.member ? "Socio" : "Vino por Franky"}
                    </span>
                  </span>
                  {isIn && happened ? (
                    <IconButton
                      label={`Certificado de ${p.name}`}
                      icon={Award}
                      onClick={() => oneCertificate(p.id, p.name)}
                      className="h-10 w-10"
                    />
                  ) : null}
                  {!isIn && !happened ? (
                    <IconButton
                      label={`${p.name} deja su plaza`}
                      icon={UserMinus}
                      onClick={() => cancel(p.id, p.name)}
                      className="h-10 w-10"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggle(p.id, p.name)}
                    aria-pressed={isIn}
                    aria-label={isIn ? `Deshacer el check-in de ${p.name}` : `Marcar la asistencia de ${p.name}`}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet",
                      isIn
                        ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
                    )}
                  >
                    {isIn ? <Check className="h-3.5 w-3.5" /> : null}
                    {isIn ? "Dentro" : "Marcar"}
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length > 60 ? (
            <p className="pt-2 text-xs text-text-muted">Y {shown.length - 60} más. Busca por nombre para encontrarles.</p>
          ) : null}
          {!shown.length ? <p className="py-4 text-sm text-text-muted">Nadie coincide con la búsqueda.</p> : null}
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Turnos de voluntarios                                               */
/* ------------------------------------------------------------------ */

function ShiftsTab({ activity: a }: { activity: CommunityActivity }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [adding, setAdding] = React.useState(false);
  const [role, setRole] = React.useState(SHIFT_ROLES[0]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [slots, setSlots] = React.useState("2");

  const members = (data.communityMembers as CommunityMember[]).filter((m) => !m.leftAt);
  const byId = new Map(members.map((m) => [m.id, m]));
  const helpers = members.filter((m) => m.role !== "socio");
  const others = members.filter((m) => m.role === "socio");
  const shifts = a.shifts ?? [];
  const covered = shifts.reduce((acc, s) => acc + Math.min(s.slots, s.people.length), 0);
  const total = shifts.reduce((acc, s) => acc + s.slots, 0);
  const open = openShiftSlots(a);
  const startClock = time(a.date);

  React.useEffect(() => {
    setFrom(startClock);
    const start = parseClock(startClock) ?? 0;
    setTo(minutesToLabel(Math.min(23 * 60 + 59, start + 60)));
  }, [startClock, adding]);

  const setShifts = (label: string, fn: (list: CommunityShift[]) => CommunityShift[]) =>
    update(label, (d) => patchActivity(d, a.id, (x) => ({ ...x, shifts: fn(x.shifts ?? []) })));

  const assign = (shift: CommunityShift, memberId: string) => {
    if (!memberId || shift.people.includes(memberId)) return;
    setShifts("activity.shift.assign", (list) =>
      list.map((s) => (s.id === shift.id ? { ...s, people: [...s.people, memberId] } : s)),
    );
    const name = byId.get(memberId)?.name.split(" ")[0] ?? "Apuntado";
    toast.success(`${name} en ${shift.role.toLowerCase()}`, `De ${minutesToLabel(shift.from)} a ${minutesToLabel(shift.to)}.`);
  };

  const unassign = (shift: CommunityShift, memberId: string) =>
    setShifts("activity.shift.unassign", (list) =>
      list.map((s) => (s.id === shift.id ? { ...s, people: s.people.filter((p) => p !== memberId) } : s)),
    );

  const fromMin = parseClock(from);
  const toMin = parseClock(to);
  const valid = role.trim().length > 1 && fromMin !== null && toMin !== null && toMin > fromMin && Number(slots) >= 1;

  const addShift = () => {
    if (fromMin === null || toMin === null) return;
    const shift: CommunityShift = {
      id: localId("sh"),
      role: role.trim(),
      from: fromMin,
      to: toMin,
      slots: Math.round(Number(slots)),
      people: [],
    };
    setShifts("activity.shift.add", (list) => [...list, shift].sort((x, y) => x.from - y.from));
    toast.success("Turno añadido", `${shift.role}, de ${from} a ${to}.`);
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {shifts.length
            ? `${covered} de ${total} huecos cubiertos.${open ? ` Faltan ${open}.` : " Está todo cubierto."}`
            : "Reparte la puerta, el montaje y las redes. Las horas salen en el certificado del curso de cada voluntario."}
        </p>
        {open ? (
          <Button asChild size="sm" variant="outline">
            <a href={whatsAppShareUrl(volunteerCallMessage(a, data.space.name))} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-3.5 w-3.5" /> Pedir voluntarios
            </a>
          </Button>
        ) : null}
      </div>
      {total ? <Meter value={covered} max={total} tone={open ? "violet" : "success"} /> : null}

      {shifts.length ? (
        <ul className="flex flex-col gap-2.5">
          {shifts.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.role}</p>
                  <p className="text-xs text-text-muted tabular">
                    {minutesToLabel(s.from)} a {minutesToLabel(s.to)} · {s.people.length} de {s.slots}
                  </p>
                </div>
                <IconButton
                  label={`Quitar el turno de ${s.role}`}
                  icon={Trash2}
                  onClick={() => setShifts("activity.shift.remove", (list) => list.filter((x) => x.id !== s.id))}
                  className="h-10 w-10"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.people.map((id) => (
                  <span
                    key={id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border pl-1 pr-1.5 text-xs font-semibold"
                  >
                    <Avatar name={byId.get(id)?.name ?? "?"} size="xs" tone="emerald" />
                    <span className="max-w-[9rem] truncate">{byId.get(id)?.name ?? "Voluntario"}</span>
                    <button
                      type="button"
                      aria-label={`Quitar a ${byId.get(id)?.name ?? "esta persona"}`}
                      onClick={() => unassign(s, id)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {s.people.length < s.slots ? (
                  <select
                    aria-label={`Apuntar a alguien en ${s.role}`}
                    className={cn(inputClass, "h-8 w-auto max-w-full rounded-full px-3 text-xs")}
                    value=""
                    onChange={(e) => assign(s, e.target.value)}
                  >
                    <option value="">Apuntar a alguien</option>
                    <optgroup label="Voluntarios y junta">
                      {helpers.map((m) => (
                        <option key={m.id} value={m.id} disabled={s.people.includes(m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Socios">
                      {others.map((m) => (
                        <option key={m.id} value={m.id} disabled={s.people.includes(m.id)}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border p-3.5">
          <FormField label="Puesto">
            <ChoiceChips
              value={SHIFT_ROLES.includes(role) ? role : ""}
              onChange={setRole}
              options={SHIFT_ROLES.map((r) => ({ value: r, label: r }))}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="Desde" htmlFor="sh-from">
              <input id="sh-from" type="time" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
            </FormField>
            <FormField label="Hasta" htmlFor="sh-to">
              <input id="sh-to" type="time" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
            </FormField>
            <FormField label="Personas" htmlFor="sh-slots">
              <input
                id="sh-slots"
                type="number"
                min={1}
                inputMode="numeric"
                className={inputClass}
                value={slots}
                onChange={(e) => setSlots(e.target.value)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="dark" onClick={addShift} disabled={!valid}>
              Añadir turno
            </Button>
          </div>
        </section>
      ) : (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Añadir turno
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presupuesto y punto de equilibrio                                   */
/* ------------------------------------------------------------------ */

function NumbersTab({ activity: a, spaceId }: { activity: CommunityActivity; spaceId: string }) {
  const { data, update } = usePro();
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [sponsor, setSponsor] = React.useState(String((a.budgetSponsorCents ?? 0) / 100));
  const ops = communityOps(data);
  const n = activityNumbers(a, ops.movements);
  const toCover = Math.max(0, n.plannedCents - n.sponsorCents);
  // Precio que cubriría los gastos llenando el aforo, ya con la comisión descontada.
  const fairPrice = a.capacity ? Math.ceil(toCover / a.capacity / (1 - FRANKY_FEE) / 50) * 50 : 0;

  React.useEffect(() => setSponsor(String((a.budgetSponsorCents ?? 0) / 100)), [a.id, a.budgetSponsorCents]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100);
  const addLine = () => {
    if (!concept.trim() || !(cents > 0)) return;
    update("activity.budget.add", (d) =>
      patchActivity(d, a.id, (x) => ({
        ...x,
        budget: [...(x.budget ?? []), { id: localId("bl"), concept: concept.trim(), cents }],
      })),
    );
    setConcept("");
    setAmount("");
  };
  const saveSponsor = () => {
    const value = Math.max(0, Math.round(Number(sponsor.replace(",", ".")) * 100) || 0);
    if (value === (a.budgetSponsorCents ?? 0)) return;
    update("activity.budget.sponsor", (d) => patchActivity(d, a.id, (x) => ({ ...x, budgetSponsorCents: value })));
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-bg-secondary p-4">
        {a.priceCents ? (
          n.seatsNeeded === 0 ? (
            <>
              <p className="font-heading text-2xl font-extrabold tracking-[-0.02em] tabular">
                {money(n.resultCents, { round: true })}
              </p>
              <p className="text-sm text-text-muted">de resultado con los {a.registered} inscritos de ahora</p>
            </>
          ) : (
            <>
              <p className="font-heading text-2xl font-extrabold tracking-[-0.02em] tabular">
                {a.registered} de {n.seatsNeeded} plazas
              </p>
              <p className="text-sm text-text-muted">
                {n.covered
                  ? `Gastos cubiertos. Resultado previsto: ${money(n.resultCents, { round: true })}.`
                  : `Te faltan ${Math.max(0, (n.seatsNeeded ?? 0) - a.registered)} inscritos para no perder dinero.`}
              </p>
              <Meter
                value={Math.min(a.registered, n.seatsNeeded ?? 0)}
                max={Math.max(1, n.seatsNeeded ?? 1)}
                className="mt-3"
                tone={n.covered ? "success" : "violet"}
              />
            </>
          )
        ) : (
          <>
            <p className="font-heading text-2xl font-extrabold tracking-[-0.02em] tabular">
              {money(n.costPerPersonCents)}
            </p>
            <p className="text-sm text-text-muted">
              de coste por asistente ({money(Math.max(n.plannedCents, n.spentCents), { round: true })} en total)
            </p>
          </>
        )}
        {a.priceCents ? (
          <p className="mt-3 text-xs text-text-muted">
            Te llegan {money(n.netTicketCents)} por entrada: Franky se queda el {Math.round(FRANKY_FEE * 100)} %.
          </p>
        ) : null}
      </section>

      {a.priceCents && !n.reachable ? (
        <p className="rounded-2xl border border-amber-500/25 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Con {a.capacity} plazas no llegas a cubrir los gastos. Necesitas {money(fairPrice)} por entrada o{" "}
          {money(toCover - n.netTicketCents * a.capacity, { round: true })} más de patrocinio.
        </p>
      ) : null}

      <section>
        <h3 className="font-heading text-base font-bold">Gastos previstos</h3>
        {(a.budget ?? []).length ? (
          <ul className="mt-2 divide-y divide-border-light rounded-xl border border-border">
            {(a.budget ?? []).map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-1.5 pl-3 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{l.concept}</span>
                <span className="shrink-0 text-sm font-semibold tabular">{money(l.cents)}</span>
                <IconButton
                  label={`Quitar ${l.concept}`}
                  icon={Trash2}
                  className="h-10 w-10"
                  onClick={() =>
                    update("activity.budget.remove", (d) =>
                      patchActivity(d, a.id, (x) => ({ ...x, budget: (x.budget ?? []).filter((b) => b.id !== l.id) })),
                    )
                  }
                />
              </li>
            ))}
            <li className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular">{money(n.plannedCents)}</span>
            </li>
          </ul>
        ) : (
          <p className="mt-1 text-sm text-text-muted">
            Apunta autobús, entradas, comida o material y Franky te dice cuántas plazas necesitas vender.
          </p>
        )}
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-2">
          <input
            aria-label="Concepto del gasto previsto"
            className={inputClass}
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Autobús, entradas..."
          />
          <input
            aria-label="Importe en euros"
            inputMode="decimal"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="€"
          />
          <Button variant="outline" onClick={addLine} disabled={!concept.trim() || !(cents > 0)}>
            Añadir
          </Button>
        </div>
      </section>

      <FormField label="Lo que pone el patrocinador para esta actividad" htmlFor="act-sponsor-amount">
        <div className="relative">
          <input
            id="act-sponsor-amount"
            inputMode="decimal"
            className={cn(inputClass, "pr-8")}
            value={sponsor}
            onChange={(e) => setSponsor(e.target.value)}
            onBlur={saveSponsor}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
        </div>
      </FormField>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-4 py-3 text-sm">
        <span>
          Gastado de verdad: <b className="tabular">{money(n.spentCents)}</b>
          {n.plannedCents ? <span className="text-text-muted"> de {money(n.plannedCents)} previstos</span> : null}
        </span>
        <Link href={`${sectionHref(spaceId, "caja")}?actividad=${a.id}`} className="font-semibold text-violet">
          Ver en la caja
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preparación según el tipo de actividad                              */
/* ------------------------------------------------------------------ */

function PrepTab({ activity: a }: { activity: CommunityActivity }) {
  const { now, update } = usePro();
  const [label, setLabel] = React.useState("");
  const today = localDate(now);
  const day = localDate(a.date);
  const prep = a.prep ?? [];
  const alerts = new Set(prepAlerts(a, today).map((p) => p.id));
  const doneCount = prep.filter((p) => p.done).length;

  const setKind = (kind: CommunityActivityKind) => {
    update("activity.kind", (d) =>
      patchActivity(d, a.id, (x) => {
        // Se conserva lo ya hecho y se añade lo que falte de la plantilla nueva.
        const current = x.prep ?? [];
        const extra = prepFor(kind, `${x.id}-${kind}`).filter((p) => !current.some((c) => c.label === p.label));
        return { ...x, kind, prep: [...current, ...extra] };
      }),
    );
  };

  const toggle = (id: string) =>
    update("activity.prep", (d) =>
      patchActivity(d, a.id, (x) => ({
        ...x,
        prep: (x.prep ?? []).map((p) => (p.id === id ? { ...p, done: !p.done } : p)),
      })),
    );

  const add = () => {
    if (label.trim().length < 3) return;
    update("activity.prep.add", (d) =>
      patchActivity(d, a.id, (x) => ({
        ...x,
        prep: [...(x.prep ?? []), { id: localId("p"), label: label.trim(), daysBefore: 3, done: false }],
      })),
    );
    setLabel("");
  };

  return (
    <div className="flex flex-col gap-4">
      <FormField label="Tipo de actividad" hint="Cada tipo trae lo que suele hacer falta y con cuántos días.">
        <ChoiceChips
          value={a.kind ?? "otra"}
          onChange={setKind}
          options={(Object.keys(ACTIVITY_KIND_LABEL) as CommunityActivityKind[]).map((k) => ({
            value: k,
            label: ACTIVITY_KIND_LABEL[k],
          }))}
        />
      </FormField>

      {prep.length ? (
        <section>
          <div className="mb-1.5 flex justify-between text-xs text-text-muted">
            <span>Preparación</span>
            <span className="tabular">
              {doneCount} de {prep.length}
            </span>
          </div>
          <Meter value={doneCount} max={prep.length} tone={doneCount === prep.length ? "success" : "violet"} />
          <ul className="mt-3 flex flex-col gap-1">
            {prep.map((p) => {
              const due = addDays(day, -p.daysBefore);
              return (
                <li key={p.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-bg-secondary">
                    <input type="checkbox" className="sr-only" checked={p.done} onChange={() => toggle(p.id)} />
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                        p.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                      )}
                    >
                      {p.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className={cn("min-w-0 flex-1", p.done && "text-text-muted line-through decoration-text-muted/40")}>
                      {p.label}
                    </span>
                    {!p.done ? (
                      <Pill tone={alerts.has(p.id) ? "danger" : "neutral"}>
                        {alerts.has(p.id) ? "Ya tocaba" : `Hasta el ${shortDay(`${due}T12:00:00Z`)}`}
                      </Pill>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <Empty
          icon={Check}
          title="Sin lista de preparación"
          body="Elige el tipo de actividad y te ponemos lo que suele hacer falta, con plazos."
        />
      )}

      <div className="flex gap-2">
        <input
          aria-label="Añadir algo que preparar"
          className={inputClass}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Algo más que preparar"
        />
        <Button variant="outline" onClick={add} disabled={label.trim().length < 3}>
          Añadir
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
      <p className="font-heading text-lg font-bold tabular">{value}</p>
      <p className="text-[0.7rem] text-text-muted">{label}</p>
    </div>
  );
}
