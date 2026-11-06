"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Check,
  GraduationCap,
  Hourglass,
  LayoutList,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, atLocal, localDate, money, pct, time } from "@/lib/pro/format";
import {
  ACTIVITY_KIND_LABEL,
  FRANKY_FEE,
  communityOps,
  examClash,
  openShiftSlots,
  parseClock,
  prepAlerts,
  prepFor,
} from "@/lib/pro/community";
import type { CommunityActivity, CommunityActivityKind } from "@/lib/pro/community-types";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Pill,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { ActivityDrawer, type ActivityTab } from "./activity-drawer";
import { RatingInline } from "./feedback";
import { CourseCalendar } from "./calendar";

type Tab = "proximas" | "pasadas" | "borradores";
type View = "lista" | "calendario";

export default function CommunityActividades() {
  const { data, now } = usePro();
  const params = useSearchParams();
  const [tab, setTab] = React.useState<Tab>("proximas");
  const [view, setView] = React.useState<View>(params.get("vista") === "calendario" ? "calendario" : "lista");
  const [open, setOpen] = React.useState<string | null>(params.get("a"));
  const [creating, setCreating] = React.useState<string | null>(params.get("nueva") === "1" ? "" : null);

  // Si se llega desde Resumen con la pantalla ya montada, los parámetros cambian sin remontar.
  React.useEffect(() => {
    const a = params.get("a");
    if (a) setOpen(a);
    if (params.get("nueva") === "1") setCreating("");
  }, [params]);

  const activities = data.activities as CommunityActivity[];
  const today = localDate(now);
  const upcoming = activities
    .filter((a) => a.status === "published" && localDate(a.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = activities
    .filter((a) => a.status === "done" || (a.status === "published" && localDate(a.date) < today))
    .sort((a, b) => b.date.localeCompare(a.date));
  const drafts = activities.filter((a) => a.status === "draft");
  const list = tab === "proximas" ? upcoming : tab === "pasadas" ? past : drafts;

  const registeredAhead = upcoming.reduce((acc, a) => acc + a.registered, 0);
  const waiting = upcoming.reduce((acc, a) => acc + (a.waitlist ?? []).length, 0);
  const verifiedAttendance = past.reduce((acc, a) => acc + a.checkedIn, 0);
  const ectsHours = past
    .filter((a) => a.ectsHours)
    .reduce((acc, a) => acc + (a.ectsHours ?? 0) * a.checkedIn, 0);
  const avgShow = past.length
    ? Math.round(past.reduce((acc, a) => acc + pct(a.checkedIn, a.registered), 0) / past.length)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Actividades"
        title="Actividades"
        description={
          upcoming.length
            ? `${upcoming.length} próximas con ${registeredAhead} inscritos${waiting ? ` y ${waiting} en lista de espera` : ""}. Este curso llevas ${verifiedAttendance} asistencias verificadas con check-in.`
            : "Publica tu próxima actividad: gratis o con entrada, y con check-in en la puerta."
        }
        actions={
          <Button variant="dark" onClick={() => setCreating("")}>
            <Plus className="h-4 w-4" /> Nueva actividad
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {view === "lista" ? (
            <Segmented<Tab>
              label="Filtrar actividades"
              value={tab}
              onChange={setTab}
              options={[
                { value: "proximas", label: "Próximas", count: upcoming.length },
                { value: "pasadas", label: "Pasadas", count: past.length },
                { value: "borradores", label: "Borradores", count: drafts.length },
              ]}
            />
          ) : (
            <span />
          )}
          <Segmented<View>
            label="Vista"
            value={view}
            onChange={setView}
            options={[
              {
                value: "lista",
                label: (
                  <>
                    <LayoutList className="h-3.5 w-3.5" /> Lista
                  </>
                ),
              },
              {
                value: "calendario",
                label: (
                  <>
                    <CalendarDays className="h-3.5 w-3.5" /> Calendario
                  </>
                ),
              },
            ]}
          />
        </div>
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={Users}
          label="Inscritos por delante"
          value={registeredAhead}
          hint={waiting ? `${waiting} más en lista de espera` : `${upcoming.length} actividades publicadas`}
        />
        <Kpi icon={BadgeCheck} label="Asistencias verificadas" value={verifiedAttendance} hint="Con QR y cuenta universitaria" />
        <Kpi icon={GraduationCap} label="Horas para créditos" value={ectsHours} hint="Certificables este curso" emphasis />
        <Kpi icon={Check} label="Vienen de verdad" value={`${avgShow} %`} hint="De inscritos que hacen check-in" />
      </KpiRow>

      {view === "calendario" ? (
        <CourseCalendar onOpenActivity={setOpen} onCreate={(date) => setCreating(date)} />
      ) : list.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((a, i) => (
            <li key={a.id} className="animate-list-in min-w-0" style={{ "--i": i } as React.CSSProperties}>
              <ActivityCard activity={a} onOpen={() => setOpen(a.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={CalendarDays}
            title={
              tab === "borradores"
                ? "No tienes borradores"
                : tab === "pasadas"
                  ? "Aún no hay actividades pasadas"
                  : "No hay actividades a la vista"
            }
            body={
              tab === "proximas"
                ? "Crea la próxima. Aparece en Franky para los estudiantes de toda la universidad, no solo para tus seguidores."
                : "Aquí verás las actividades con su asistencia verificada."
            }
            action={
              <Button variant="dark" onClick={() => setCreating("")}>
                Nueva actividad
              </Button>
            }
          />
        </div>
      )}

      <Tip title="Créditos sin hojas de firmas">
        Las universidades reconocen créditos por actividades culturales, deportivas y solidarias. Si tu actividad
        tiene horas para créditos, el check-in con cuenta universitaria deja la asistencia verificada y los
        certificados salen en un toque al cerrarla.
      </Tip>

      <ActivityDrawer
        activityId={open}
        onClose={() => setOpen(null)}
        initialTab={
          params.get("pestana") === "valoracion" || params.get("pestana") === "viaje"
            ? (params.get("pestana") as ActivityTab)
            : undefined
        }
      />
      <NewActivityDrawer date={creating} onClose={() => setCreating(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ActivityCard({ activity: a, onOpen }: { activity: CommunityActivity; onOpen: () => void }) {
  const { data, now } = usePro();
  const sponsor = data.sponsors.find((s) => s.id === a.sponsorId);
  const done = a.status === "done";
  const free = a.capacity - a.registered;
  const waiting = (a.waitlist ?? []).length;
  const alerts = prepAlerts(a, localDate(now)).length;
  const openSlots = done ? 0 : openShiftSlots(a);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col gap-4 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-text-primary/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-border">
          <span className="font-heading text-lg font-bold leading-none tabular">
            {new Date(a.date).toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" })}
          </span>
          <span className="text-[0.62rem] font-semibold uppercase text-text-muted">
            {new Date(a.date)
              .toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" })
              .replace(".", "")}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-bold leading-snug">{a.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
            <MapPin className="h-3 w-3 shrink-0" />{" "}
            <span className="min-w-0 truncate">
              {time(a.date)} · {a.place}
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={a.priceCents ? "neutral" : "success"}>{a.priceCents ? money(a.priceCents) : "Gratis"}</Pill>
        {a.ectsHours ? (
          <Pill tone="info">
            <GraduationCap className="h-3 w-3" /> {a.ectsHours} h créditos
          </Pill>
        ) : null}
        {sponsor ? <Pill tone="violet">Con {sponsor.business}</Pill> : null}
        {a.status === "draft" ? <Pill tone="warning">Borrador</Pill> : null}
        {waiting && !done ? (
          <Pill tone="warning">
            <Hourglass className="h-3 w-3" /> {waiting} en espera
          </Pill>
        ) : null}
        {alerts ? (
          <Pill tone="danger">
            <AlertTriangle className="h-3 w-3" /> {alerts} por preparar
          </Pill>
        ) : null}
        {openSlots ? <Pill>Faltan {openSlots} voluntarios</Pill> : null}
        {done && a.certificates ? <Pill tone="success">Certificados listos</Pill> : null}
        {done ? <RatingInline activity={a} /> : null}
      </div>
      <div className="mt-auto">
        <div className="mb-1 flex justify-between text-xs text-text-muted">
          <span>
            {done ? `${a.checkedIn} vinieron de ${a.registered} inscritos` : `${a.registered} inscritos de ${a.capacity}`}
          </span>
          <span className="tabular">
            {done ? `${pct(a.checkedIn, a.registered)} %` : free > 0 ? `${free} libres` : "Completa"}
          </span>
        </div>
        <Meter
          value={done ? a.checkedIn : a.registered}
          max={done ? a.registered || 1 : a.capacity}
          tone={done ? "success" : free <= 3 ? "warning" : "violet"}
        />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

/** `date` null: cerrado; "" : abierto sin fecha; "YYYY-MM-DD": abierto en ese día. */
function NewActivityDrawer({ date: presetDate, onClose }: { date: string | null; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const open = presetDate !== null;
  const ops = communityOps(data);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<CommunityActivityKind>("proyeccion");
  const [date, setDate] = React.useState(addDays(localDate(now), 7));
  const [hour, setHour] = React.useState("19:00");
  const [duration, setDuration] = React.useState("2");
  const [place, setPlace] = React.useState("");
  const [capacity, setCapacity] = React.useState("50");
  const [paid, setPaid] = React.useState<"gratis" | "entrada">("gratis");
  const [price, setPrice] = React.useState("5");
  const [ects, setEcts] = React.useState("");
  const [sponsorId, setSponsorId] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setKind("proyeccion");
    setDate(presetDate || addDays(localDate(now), 7));
    setHour("19:00");
    setDuration("2");
    setPlace("");
    setCapacity("50");
    setPaid("gratis");
    setPrice("5");
    setEcts("");
    setSponsorId("");
    setDescription("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetDate]);

  const sponsors = data.sponsors.filter((s) => s.status === "active");
  const priceCents = paid === "entrada" ? Math.round(Number(price.replace(",", ".")) * 100) || 0 : 0;
  const cap = Math.max(1, Number(capacity) || 0);
  const minutes = parseClock(hour);
  const valid =
    title.trim().length > 2 &&
    place.trim().length > 2 &&
    Boolean(date) &&
    minutes !== null &&
    (paid === "gratis" || priceCents > 0);
  const clash = date ? examClash(date, ops.periods) : null;

  const save = (status: "published" | "draft") => {
    const id = localId("a");
    const activity: CommunityActivity = {
      id,
      title: title.trim(),
      date: atLocal(date, minutes ?? 19 * 60),
      place: place.trim(),
      capacity: cap,
      registered: 0,
      checkedIn: 0,
      priceCents,
      ectsHours: Number(ects) > 0 ? Number(ects) : undefined,
      status,
      sponsorId: sponsorId || undefined,
      description: description.trim() || undefined,
      councilLogo: true,
      reachOutside: 0,
      kind,
      durationMinutes: Math.max(30, Math.round(Number(duration.replace(",", ".")) * 60) || 120),
      prep: prepFor(kind, id),
    };
    update("activity.create", (d) => ({ ...d, activities: [activity, ...d.activities] }));
    toast.success(
      status === "published" ? "Actividad publicada" : "Borrador guardado",
      status === "published"
        ? "La verán los estudiantes de toda tu universidad en Franky. Te hemos puesto lo que suele hacer falta prepararle."
        : "Publícala cuando la tengas lista.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva actividad"
      description="Con inscripción, entrada si quieres y check-in en la puerta."
      footer={
        <>
          <Button variant="outline" onClick={() => save("draft")} disabled={!title.trim()}>
            Guardar borrador
          </Button>
          <Button variant="dark" onClick={() => save("published")} disabled={!valid}>
            Publicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Título" htmlFor="act-title">
          <input
            id="act-title"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Cinefórum: Robot Dreams"
          />
        </FormField>
        <FormField label="Tipo" hint="Según el tipo te preparamos la lista de lo que hace falta.">
          <select
            aria-label="Tipo de actividad"
            className={inputClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CommunityActivityKind)}
          >
            {(Object.keys(ACTIVITY_KIND_LABEL) as CommunityActivityKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Fecha" htmlFor="act-date" className="col-span-3 sm:col-span-1">
            <input id="act-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Hora" htmlFor="act-hour" className="col-span-3 sm:col-span-1">
            <input id="act-hour" type="time" className={inputClass} value={hour} onChange={(e) => setHour(e.target.value)} />
          </FormField>
          <FormField label="Horas" htmlFor="act-duration" className="col-span-3 sm:col-span-1">
            <input
              id="act-duration"
              inputMode="decimal"
              className={inputClass}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </FormField>
        </div>
        {clash ? (
          <p
            className={cn(
              "rounded-xl border border-amber-500/25 bg-amber-50 px-3 py-2 text-sm text-amber-900",
              "dark:bg-amber-950/30 dark:text-amber-200",
            )}
          >
            Cae en {clash.title.toLowerCase()}. Mucha gente no podrá venir: mejor antes o después.
          </p>
        ) : null}
        <FormField label="Lugar" htmlFor="act-place">
          <input
            id="act-place"
            className={inputClass}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Salón de actos, Filosofía y Letras"
          />
        </FormField>
        <FormField label="Plazas" htmlFor="act-cap" hint="Al llenarse, los siguientes entran en lista de espera.">
          <input
            id="act-cap"
            type="number"
            min={1}
            inputMode="numeric"
            className={inputClass}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </FormField>
        <FormField
          label="Precio"
          hint={
            paid === "entrada"
              ? `Se cobra al inscribirse. Te llegan ${money(Math.round(priceCents * (1 - FRANKY_FEE)))} por entrada.`
              : "Inscripción gratis con plaza asegurada."
          }
        >
          <ChoiceChips
            value={paid}
            onChange={setPaid}
            options={[
              { value: "gratis", label: "Gratis" },
              { value: "entrada", label: "Con entrada" },
            ]}
          />
          {paid === "entrada" ? (
            <div className="relative mt-2">
              <input
                aria-label="Precio de la entrada en euros"
                inputMode="decimal"
                className={cn(inputClass, "pr-8")}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
            </div>
          ) : null}
        </FormField>
        <FormField
          label="Horas para créditos"
          htmlFor="act-ects"
          hint="Déjalo vacío si no da créditos. Con check-in verificado, el certificado sale solo."
        >
          <input
            id="act-ects"
            type="number"
            min={0}
            inputMode="numeric"
            className={inputClass}
            value={ects}
            onChange={(e) => setEcts(e.target.value)}
            placeholder="0"
          />
        </FormField>
        <FormField label="Patrocinador" htmlFor="act-sponsor">
          <select id="act-sponsor" className={inputClass} value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
            <option value="">Sin patrocinador</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.business}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Descripción" htmlFor="act-desc">
          <textarea
            id="act-desc"
            className={textareaClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Qué vais a hacer, qué incluye y a quién va dirigida."
          />
        </FormField>
      </div>
    </Drawer>
  );
}
