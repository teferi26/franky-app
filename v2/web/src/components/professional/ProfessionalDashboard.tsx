"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProfessionalNotices } from "./ProfessionalNotices";
import { WaitlistOffer } from "./WaitlistOffer";
import {
  CalendarDays,
  Scissors,
  Users,
  Plus,
  ArrowRight,
  Check,
  ChevronRight,
  Ticket,
  MapPin,
} from "lucide-react";
import { useFinancialOwner } from "@/lib/use-financial-owner";
import { useProfessionalRpc } from "./useProfessionalRpc";
import {
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_SECTORS,
  PROFESSIONAL_BOOKING_LABELS,
  professionalCategory,
  professionalError,
  professionalMoney,
  type ProfessionalCategory,
  type ProfessionalWorkspace,
  type ProfessionalEntity,
  type ProfessionalBooking,
} from "../../../../shared/professional-services";
import type { Workspace } from "../../../../shared/workspaces";
const input =
  "mt-1 w-full rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-violet px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-40";
const panel = "rounded-2xl border border-border bg-bg-primary p-5";
const week = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
type Editor = {
  entity: ProfessionalEntity | "booking" | "bundle";
  record?: Record<string, unknown>;
};
export default function ProfessionalDashboard({
  organizationId,
}: {
  organizationId?: string;
}) {
  const owner = useFinancialOwner();
  return owner ? (
    <SpacePicker
      key={owner.key}
      owner={owner.userId}
      initial={organizationId}
    />
  ) : (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Tu espacio profesional</h1>
      <p className="mt-4">Inicia sesión para gestionar tu negocio.</p>
      <Link
        href="/login?next=%2Fespacios%2Fservicios"
        className={button + " mt-4"}
      >
        Iniciar sesión
      </Link>
    </main>
  );
}
function SpacePicker({ owner, initial }: { owner: string; initial?: string }) {
  const rpc = useProfessionalRpc(owner);
  const [spaces, setSpaces] = useState<Workspace[]>([]),
    [active, setActive] = useState(initial ?? ""),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    void rpc<Workspace[]>("professional_list_workspaces")
      .then((list) => {
        if (!current) return;
        const allowed = list.filter(
          (x) => x.kind === "leisure" || x.kind === "community",
        );
        setSpaces(allowed);
        if (!initial && allowed[0]) setActive(allowed[0].id);
      })
      .catch((e) => {
        if (current) setError(professionalError(e.message));
      });
    return () => {
      current = false;
    };
  }, [rpc, initial]);
  const space = spaces.find((x) => x.id === active);
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link href="/espacios" className="text-sm text-text-secondary">
          ← Mis espacios
        </Link>
        <label className="flex items-center gap-2 text-sm">
          Gestionando
          <select
            aria-label="Elegir negocio"
            value={active}
            onChange={(e) => setActive(e.target.value)}
            className="max-w-[230px] rounded-xl border border-border bg-bg-primary px-3 py-2"
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {space ? (
        <Dashboard key={owner + ":" + active} owner={owner} space={space} />
      ) : (
        <p className="p-8 text-text-secondary">
          {spaces.length
            ? "Selecciona tu espacio."
            : "Aquí aparecerán tus espacios de negocio o comunidad cuando tengas acceso."}
        </p>
      )}
    </main>
  );
}
function Dashboard({ owner, space }: { owner: string; space: Workspace }) {
  const rpc = useProfessionalRpc(owner),
    [data, setData] = useState<ProfessionalWorkspace | null>(null),
    [tab, setTab] = useState<
      "today" | "agenda" | "services" | "customers" | "settings"
    >("today"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [day, setDay] = useState(new Date().toISOString().slice(0, 10)),
    [category, setCategory] = useState<ProfessionalCategory>(
      professionalCategory(space.subtype) ?? "hairdresser",
    );
  const [pages, setPages] = useState<Record<string, string | null | undefined>>(
    {},
  );
  const generation = useRef(0),
    editorVersion = useRef(0),
    pending = useRef(false),
    alive = useRef(true),
    attempt = useRef<{ payload: string; key: string } | null>(null),
    writeAttempts = useRef(new Map<string, string>());
  const closeEditor = useCallback(() => {
    editorVersion.current++;
    setEditor(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const result = await rpc<ProfessionalWorkspace>(
        "professional_get_workspace",
        {
          p_organization_id: space.id,
          p_local_date: day,
          p_from: new Date(day + "T00:00:00").toISOString(),
          p_until: new Date(
            new Date(day + "T00:00:00").getTime() + 31 * 86400000,
          ).toISOString(),
        },
      );
      if (alive.current && version === generation.current) {
        setData(result);
        if (result.settings) setCategory(result.settings.category);
        setError("");
      }
    } catch (e) {
      if (alive.current && version === generation.current) {
        setData(null);
        closeEditor();
        setError(professionalError((e as Error).message));
      }
    }
  }, [rpc, space.id, day, closeEditor]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  async function mutate(name: string, args: Record<string, unknown>) {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(args);
    if (name === "professional_save_record") {
      if (!writeAttempts.current.has(fingerprint))
        writeAttempts.current.set(fingerprint, crypto.randomUUID());
      args = {
        ...args,
        p_data: {
          ...(args.p_data as Record<string, unknown>),
          client_request_id: writeAttempts.current.get(fingerprint),
        },
      };
    }
    try {
      const result = await rpc<Record<string, unknown>>(name, {
        p_organization_id: space.id,
        ...args,
      });
      if (!alive.current) return null;
      writeAttempts.current.delete(fingerprint);
      setNotice(
        result.waitlist_offer_status === "expired"
          ? "El plazo de la plaza ha terminado. Consulta la reserva actualizada."
          : "Guardado. La agenda y las reservas comparten estos cambios.",
      );
      await load();
      return result;
    } catch (e) {
      if (alive.current) setError(professionalError((e as Error).message));
      return null;
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function records(
    entity: "bookings" | "customers" | "bundles",
    more = false,
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const page = await rpc<{ items: unknown[]; next_cursor: string | null }>(
        "professional_list_records",
        {
          p_organization_id: space.id,
          p_entity: entity,
          p_cursor: more ? (pages[entity] ?? null) : null,
          p_local_date: day,
          p_from: new Date(day + "T00:00:00").toISOString(),
          p_until: new Date(
            new Date(day + "T00:00:00").getTime() + 31 * 86400000,
          ).toISOString(),
        },
      );
      if (!alive.current) return;
      setData((old) =>
        old
          ? {
              ...old,
              [entity]: more ? [...old[entity], ...page.items] : page.items,
            }
          : old,
      );
      setPages((old) => ({ ...old, [entity]: page.next_cursor }));
    } catch (e) {
      if (alive.current) setError(professionalError((e as Error).message));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const enabled = !!data?.settings?.enabled,
    hasExisting =
      !!data?.settings &&
      !!(
        data.services.length ||
        data.bookings.length ||
        data.customers.length ||
        data.sessions.length
      );
  const sector = PROFESSIONAL_SECTORS[category],
    canEdit = enabled && data?.permissions.includes("content.manage"),
    canOperate =
      data?.permissions.includes("content.manage") ||
      data?.permissions.includes("attendees.manage"),
    canSettings = data?.permissions.includes("settings.manage"),
    canFinance = enabled && data?.permissions.includes("finance.manage");
  const todays =
    data?.bookings.filter(
      (b) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: data.settings?.timezone ?? "Europe/Madrid",
        }).format(new Date(b.starts_at)) === day,
    ) ?? [];
  const activeBookings = todays.filter(
    (b) => !["cancelled", "no_show", "waitlisted"].includes(b.status),
  );
  function add(entity: Editor["entity"], record?: Record<string, unknown>) {
    editorVersion.current++;
    attempt.current = null;
    setEditor({ entity, record });
  }
  async function action(
    booking: ProfessionalBooking,
    p_action: string,
    p_data: Record<string, unknown> = {},
  ) {
    await mutate("professional_booking_action", {
      p_booking_id: booking.id,
      p_action,
      p_data,
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const submittingEditorVersion = editorVersion.current;
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? "");
    const num = (k: string, fallback = 0) =>
      form.has(k) ? Number(form.get(k)) : fallback;
    const asDate = (k: string) => new Date(text(k)).toISOString();
    let name = "professional_save_record",
      args: Record<string, unknown> = {};
    try {
      let p_data: Record<string, unknown> = {};
      if (editor.entity === "service")
        p_data = {
          name: text("name"),
          description: text("description"),
          mode: text("mode"),
          duration_minutes: num("duration_minutes", 30),
          buffer_minutes: num("buffer_minutes"),
          price_cents: Math.round(num("price") * 100),
          price_basis: text("price_basis"),
          deposit_cents: Math.round(num("deposit") * 100),
          capacity: num("capacity", 1),
          staff_required: form.has("staff_required"),
          required_resource_ids: form.getAll("resource_ids"),
          menu: text("menu"),
        };
      if (editor.entity === "resource")
        p_data = {
          name: text("name"),
          kind: text("kind"),
          capacity: num("capacity", 1),
        };
      if (editor.entity === "availability") {
        const minutes = (value: string) => {
          const [h, m] = value.split(":").map(Number);
          return h * 60 + m;
        };
        p_data = {
          resource_id: text("resource_id") || null,
          weekday: num("weekday"),
          start_minute: minutes(text("start")),
          end_minute: text("end") === "00:00" ? 1440 : minutes(text("end")),
        };
      }
      if (editor.entity === "exception")
        p_data = {
          resource_id: text("resource_id") || null,
          local_date: text("local_date"),
          reason: text("reason"),
        };
      if (editor.entity === "session")
        p_data = {
          service_id: text("service_id"),
          starts_at: asDate("starts_at"),
          capacity: num("capacity", 1),
          repeat_weeks: num("repeat_weeks", 1),
          resource_ids: form.getAll("resource_ids"),
        };
      if (editor.entity === "settings")
        p_data = {
          category,
          timezone: text("timezone"),
          require_approval: form.has("require_approval"),
          public_booking: form.has("public_booking"),
          cancellation_hours: num("cancellation_hours", 24),
          terms: text("terms"),
        };
      if (editor.entity === "booking") {
        name = "professional_book";
        args = {
          p_service_id: text("service_id"),
          p_starts_at: text("starts_at") ? asDate("starts_at") : null,
          p_session_id: text("session_id") || null,
          p_resource_ids: form.getAll("resource_ids"),
          p_party_size: num("party_size", 1),
          p_customer_name: text("customer_id")
            ? null
            : text("customer_name") || null,
          p_customer_contact: text("customer_contact") || null,
          p_customer_id: text("customer_id") || null,
          p_bundle_id: text("bundle_id") || null,
        };
      } else if (editor.entity === "bundle") {
        name = "professional_grant_bundle";
        args = {
          p_customer_id: text("customer_id"),
          p_service_id: text("service_id"),
          p_units: num("units"),
          p_label: text("label"),
          p_reason: text("reason"),
        };
      } else
        args = {
          p_entity: editor.entity,
          p_record_id: editor.record?.id ?? null,
          p_data,
        };
      if (name !== "professional_save_record") {
        const payload = JSON.stringify(args);
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, key: crypto.randomUUID() };
        args.p_request_key = attempt.current.key;
      }
      if (
        (await mutate(name, args)) &&
        submittingEditorVersion === editorVersion.current
      ) {
        closeEditor();
        attempt.current = null;
      }
    } catch {
      setError("Revisa las fechas y los importes antes de guardar.");
    }
  }
  return (
    <>
      <header className="relative overflow-hidden rounded-3xl bg-[#251638] p-6 text-white sm:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-violet/35 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200">
              Franky profesional · {sector.label}
            </p>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
              {sector.headline}
            </h1>
            <p className="mt-3 text-sm text-white/70">
              {space.name}{" "}
              {space.city && (
                <>
                  · <MapPin size={13} className="inline" /> {space.city}
                </>
              )}
            </p>
          </div>
          {enabled && canOperate && (
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#251638]"
              onClick={() =>
                category === "nightclub"
                  ? window.location.assign("/espacios")
                  : add(sector.mode === "session" ? "session" : "booking")
              }
            >
              <Plus size={18} />
              {sector.action === "Validar Franky Card"
                ? "Añadir reserva"
                : sector.action}
            </button>
          )}
        </div>
      </header>
      {data?.demo && (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Demostración privada. Clientes, citas y bonos permanecen separados de
          las operaciones reales.
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-red-50 p-4 text-red-800"
        >
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {notice}
        </p>
      )}
      {data && (enabled || hasExisting) && (
        <ProfessionalNotices
          owner={owner}
          organizationId={space.id}
          onOpen={async (n) => {
            const booking = await rpc<ProfessionalBooking>(
              "professional_get_booking",
              { p_organization_id: space.id, p_booking_id: n.booking_id },
            );
            if (!alive.current) return;
            setTab("agenda");
            setData((old) =>
              old
                ? {
                    ...old,
                    bookings: [
                      booking,
                      ...old.bookings.filter((b) => b.id !== booking.id),
                    ],
                  }
                : old,
            );
            setNotice("Reserva abierta con su estado actual.");
          }}
        />
      )}
      {!data && !error && (
        <p className="py-10" role="status">
          Preparando tu espacio…
        </p>
      )}
      {data && !enabled && !hasExisting && (
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className={panel}>
            <p className="text-sm font-bold text-violet">
              Tu negocio, con herramientas propias
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              Empieza por tu actividad
            </h2>
            <label className="mt-5 block text-sm">
              Qué gestionas
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as ProfessionalCategory)
                }
                className={input}
              >
                {PROFESSIONAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PROFESSIONAL_SECTORS[c].label}
                  </option>
                ))}
              </select>
            </label>
            <ul className="mt-5 space-y-3">
              {sector.benefits.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <Check size={18} className="text-violet" />
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-text-secondary">
              El equipo de Franky habilita el piloto después de preparar contigo
              horarios y servicios. Guardar esta elección no contrata ni cobra
              una suscripción.
            </p>
            {canSettings && (
              <button
                className={button + " mt-5"}
                disabled={busy}
                onClick={() =>
                  void mutate("professional_save_record", {
                    p_entity: "settings",
                    p_record_id: null,
                    p_data: { category },
                  })
                }
              >
                Preparar mi espacio <ArrowRight size={16} />
              </button>
            )}
            <Link
              href={"/espacios/card?organization=" + space.id}
              className="mt-4 block text-sm text-violet"
            >
              Puedo aceptar Franky Card sin contratar el software
            </Link>
          </div>
          <Pricing category={category} organization={space.id} />
        </section>
      )}
      {data && (enabled || hasExisting) && (
        <>
          {!enabled && (
            <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Las nuevas reservas están pausadas. Puedes consultar el historial
              y atender, reprogramar o cancelar las reservas existentes según
              sus condiciones.
            </p>
          )}
          <nav
            className="my-6 flex gap-2 overflow-x-auto rounded-2xl bg-bg-secondary p-2"
            aria-label="Herramientas profesionales"
          >
            {(
              ["today", "agenda", "services", "customers", "settings"] as const
            ).map((key, index) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  closeEditor();
                }}
                aria-current={tab === key ? "page" : undefined}
                className={
                  "shrink-0 rounded-xl px-4 py-3 text-sm font-semibold " +
                  (tab === key
                    ? "bg-bg-primary text-violet shadow-sm"
                    : "text-text-secondary")
                }
              >
                {
                  [
                    { key: "today", label: sector.tabs[0] },
                    {
                      key: "agenda",
                      label: sector.mode === "session" ? "Horarios" : "Agenda",
                    },
                    {
                      key: "services",
                      label:
                        sector.mode === "group"
                          ? "Carta y recursos"
                          : "Servicios",
                    },
                    {
                      key: "customers",
                      label:
                        sector.mode === "session"
                          ? "Alumnos y bonos"
                          : "Clientes",
                    },
                    { key: "settings", label: "Gestión" },
                  ][index].label
                }
              </button>
            ))}
          </nav>
          {(tab === "today" || tab === "agenda") && (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-3 text-sm">
                  <CalendarDays size={18} />
                  Desde
                  <input
                    type="date"
                    className="rounded-xl border border-border bg-bg-primary px-3 py-2"
                    value={day}
                    onChange={(e) => e.target.value && setDay(e.target.value)}
                  />
                </label>
                <span className="text-xs text-text-secondary">
                  Horario del negocio: {data.settings?.timezone}
                </span>
              </div>
              {tab === "today" && (
                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                  <Metric label="Reservas hoy" value={activeBookings.length} />
                  <Metric
                    label="Personas previstas"
                    value={activeBookings.reduce((n, b) => n + b.party_size, 0)}
                  />
                  <Metric
                    label="Pendientes de confirmar"
                    value={
                      data.bookings.filter((b) => b.status === "requested")
                        .length
                    }
                  />
                </div>
              )}
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <section className={panel}>
                  <h2 className="mb-4 text-lg font-bold">
                    {tab === "today"
                      ? "Hoy en tu negocio"
                      : "Reservas · próximos 31 días"}
                  </h2>
                  {!(tab === "today" ? todays : data.bookings).length ? (
                    <Empty
                      icon={<CalendarDays />}
                      text="Tu agenda está lista. Añade una cita o comparte el enlace de reservas."
                    />
                  ) : (
                    <div className="space-y-3">
                      {(tab === "today" ? todays : data.bookings).map((b) => (
                        <article
                          key={b.id}
                          className="rounded-xl border border-border p-4"
                        >
                          <div className="flex flex-wrap justify-between gap-3">
                            <div>
                              <p className="font-semibold">
                                {b.customer_name}{" "}
                                <span className="font-normal text-text-secondary">
                                  · {b.party_size} persona
                                  {b.party_size === 1 ? "" : "s"}
                                </span>
                              </p>
                              <p className="mt-1 text-sm text-text-secondary">
                                {b.service_name} ·{" "}
                                {new Date(b.starts_at).toLocaleString("es-ES", {
                                  timeZone: data.settings?.timezone,
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="rounded-full bg-bg-secondary px-3 py-1 text-xs">
                                {PROFESSIONAL_BOOKING_LABELS[b.status]}
                              </span>
                              <p className="mt-2 text-sm font-semibold">
                                {professionalMoney(b.total_cents)}
                              </p>
                            </div>
                          </div>
                          {b.price_snapshot.menu && (
                            <p className="mt-3 whitespace-pre-line text-sm">
                              Menú acordado: {b.price_snapshot.menu}
                            </p>
                          )}
                          {b.deposit_status === "pending" && (
                            <p className="mt-2 text-xs text-amber-700">
                              Señal pendiente:{" "}
                              {professionalMoney(b.deposit_cents)}. Forma parte
                              del total. No hay un cobro confirmado.
                            </p>
                          )}
                          {b.reschedule && (
                            <p className="mt-2 text-xs text-violet">
                              Cambio propuesto. Se conserva la reserva anterior
                              hasta que el cliente lo acepte.
                            </p>
                          )}
                          <WaitlistOffer
                            booking={b}
                            operator
                            timezone={data.settings?.timezone}
                            busy={busy || !canOperate}
                            onAction={(name, params) =>
                              void action(b, name, params)
                            }
                            onRefresh={() => void load()}
                          />
                          {canOperate && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {b.status === "requested" &&
                                b.waitlist_offer_status !== "offered" && (
                                  <button
                                    disabled={busy}
                                    className={secondary}
                                    onClick={() => void action(b, "confirm")}
                                  >
                                    Confirmar
                                  </button>
                                )}
                              {b.status === "confirmed" && (
                                <>
                                  <button
                                    disabled={busy}
                                    className={secondary}
                                    onClick={() => void action(b, "attend")}
                                  >
                                    Registrar asistencia
                                  </button>
                                  <button
                                    disabled={busy}
                                    className={secondary}
                                    onClick={() => void action(b, "no_show")}
                                  >
                                    No asistió
                                  </button>
                                </>
                              )}
                              {[
                                "requested",
                                "confirmed",
                                "waitlisted",
                              ].includes(b.status) && (
                                <button
                                  disabled={busy}
                                  className={secondary}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        "¿Cancelar esta reserva? Esta acción quedará en el historial.",
                                      )
                                    )
                                      void action(b, "cancel");
                                  }}
                                >
                                  Cancelar
                                </button>
                              )}
                              {b.status === "attended" && (
                                <Link
                                  className={secondary}
                                  href={
                                    "/espacios/card?organization=" +
                                    space.id +
                                    (b.card_quote_id ? "&booking=" + b.id : "")
                                  }
                                >
                                  Validar sello con Card{" "}
                                  <ChevronRight size={14} />
                                </Link>
                              )}
                              {["requested", "confirmed"].includes(b.status) &&
                                !b.session_id && (
                                  <form
                                    className="flex flex-wrap gap-2"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const d = new FormData(e.currentTarget);
                                      void action(b, "propose_reschedule", {
                                        starts_at: new Date(
                                          String(d.get("new_time")),
                                        ).toISOString(),
                                      });
                                    }}
                                  >
                                    <label
                                      className="sr-only"
                                      htmlFor={"move-" + b.id}
                                    >
                                      Nueva hora del dispositivo
                                    </label>
                                    <input
                                      id={"move-" + b.id}
                                      required
                                      type="datetime-local"
                                      name="new_time"
                                      className="rounded-lg border border-border bg-bg-primary px-2 text-xs"
                                    />
                                    <button
                                      className={secondary}
                                      disabled={busy}
                                    >
                                      Proponer cambio
                                    </button>
                                  </form>
                                )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  {data.has_more && (
                    <p className="mt-4 text-sm text-amber-800">
                      La vista inicial está limitada a 300 registros y no
                      representa un total financiero.{" "}
                      <button
                        className="underline"
                        onClick={() => void records("bookings")}
                      >
                        Abrir listado completo
                      </button>
                    </p>
                  )}
                  {pages.bookings && (
                    <button
                      className={secondary + " mt-4"}
                      disabled={busy}
                      onClick={() => void records("bookings", true)}
                    >
                      Cargar más reservas
                    </button>
                  )}
                </section>
                <aside className="space-y-4">
                  <section className={panel}>
                    <Ticket className="text-violet" />
                    <h2 className="mt-3 font-bold">
                      Una tarjeta. Más motivos para volver.
                    </h2>
                    <p className="mt-2 text-sm text-text-secondary">
                      Escanea Card y registra consumos confirmados. Un sello se
                      concede por una operación válida, nunca por abrir el
                      perfil.
                    </p>
                    <Link
                      href={"/espacios/card?organization=" + space.id}
                      className={button + " mt-4"}
                    >
                      Abrir Franky Card
                    </Link>
                  </section>
                  <section className={panel}>
                    <h2 className="font-bold">Tu enlace de reservas</h2>
                    <p className="my-2 break-all text-sm text-text-secondary">
                      franky.es/espacios/servicios/reservar?organization=
                      {space.id}
                    </p>
                    <Link
                      className={secondary}
                      href={
                        "/espacios/servicios/reservar?organization=" + space.id
                      }
                    >
                      Ver como cliente
                    </Link>
                    <p className="mt-3 text-xs text-text-secondary">
                      Disponible si activaste reservas públicas y Franky
                      habilitó el piloto.
                    </p>
                  </section>
                  {["pub", "nightclub", "culture"].includes(category) && (
                    <Link className={panel + " block"} href="/espacios">
                      <strong>Eventos y entradas</strong>
                      <p className="mt-2 text-sm text-text-secondary">
                        Usa las actividades de tu espacio para vender entradas y
                        controlar el acceso.
                      </p>
                    </Link>
                  )}
                </aside>
              </div>
              {sector.mode === "session" && (
                <section className={panel + " mt-6"}>
                  <div className="flex justify-between gap-3">
                    <h2 className="text-lg font-bold">Sesiones programadas</h2>
                    {canEdit && (
                      <button
                        className={secondary}
                        onClick={() => add("session")}
                      >
                        Crear sesión
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.sessions.map((s) => (
                      <article
                        key={s.id}
                        className="rounded-xl bg-bg-secondary p-4"
                      >
                        <p className="font-semibold">
                          {
                            data.services.find((x) => x.id === s.service_id)
                              ?.name
                          }
                        </p>
                        <p className="mt-2 text-sm">
                          {new Date(s.starts_at).toLocaleString("es-ES", {
                            timeZone: data.settings?.timezone,
                          })}
                        </p>
                        <p className="mt-2 text-xs">
                          {s.reserved_seats ?? 0}/{s.capacity} plazas ·{" "}
                          {s.waitlisted_seats ?? 0} en espera
                          {s.series_id ? " · Sesión de una serie" : ""}
                        </p>
                        {canEdit && s.status === "open" && (
                          <button
                            className="mt-3 text-sm text-violet"
                            onClick={() =>
                              void mutate("professional_save_record", {
                                p_entity: "session",
                                p_record_id: s.id,
                                p_data: { status: "cancelled" },
                              })
                            }
                          >
                            Cancelar sesión sin reservas
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {tab === "services" && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <section className={panel}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">
                    {sector.mode === "group"
                      ? "Servicios y menús"
                      : "Tu catálogo"}
                  </h2>
                  {canEdit && (
                    <button
                      className={secondary}
                      onClick={() => add("service")}
                    >
                      <Plus size={16} />
                      Añadir
                    </button>
                  )}
                </div>
                {!data.services.length && (
                  <Empty
                    icon={<Scissors />}
                    text="Crea tu primer servicio con duración, precio y disponibilidad."
                  />
                )}
                {data.services.map((s) => (
                  <article
                    key={s.id}
                    className="mb-3 rounded-xl border border-border p-4"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <h3 className="font-semibold">
                          {s.name}
                          {!s.active && " · Archivado"}
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          {s.duration_minutes} min ·{" "}
                          {professionalMoney(s.price_cents)}
                          {s.price_basis === "person" ? " por persona" : ""}
                        </p>
                      </div>
                      {canEdit && (
                        <button
                          className="text-sm text-violet"
                          onClick={() =>
                            add(
                              "service",
                              s as unknown as Record<string, unknown>,
                            )
                          }
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">
                      {s.description}
                    </p>
                    {canEdit && (
                      <button
                        disabled={busy}
                        className="mt-3 text-xs text-text-secondary underline"
                        onClick={() =>
                          void mutate("professional_save_record", {
                            p_entity: "service",
                            p_record_id: s.id,
                            p_data: { active: !s.active },
                          })
                        }
                      >
                        {s.active ? "Archivar" : "Reactivar"}
                      </button>
                    )}
                  </article>
                ))}
              </section>
              <section className={panel}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Equipo y espacios</h2>
                  {canEdit && (
                    <button
                      className={secondary}
                      onClick={() => add("resource")}
                    >
                      <Plus size={16} />
                      Añadir
                    </button>
                  )}
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Reserva a la vez el profesional, la sala o el equipo que
                  necesita cada servicio.
                </p>
                {data.resources.map((r) => (
                  <div
                    key={r.id}
                    className="mb-3 flex justify-between rounded-xl bg-bg-secondary p-4"
                  >
                    <div>
                      <strong>{r.name}</strong>
                      <p className="text-sm text-text-secondary">
                        {
                          {
                            staff: "Profesional",
                            room: "Sala",
                            equipment: "Equipo",
                            table: "Mesa / zona",
                            court: "Pista",
                            desk: "Puestos",
                          }[r.kind]
                        }{" "}
                        · Capacidad {r.capacity}
                        {!r.active ? " · Archivado" : ""}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        className="text-sm text-violet"
                        onClick={() =>
                          add(
                            "resource",
                            r as unknown as Record<string, unknown>,
                          )
                        }
                      >
                        Editar
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </div>
          )}
          {tab === "customers" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className={panel}>
                <h2 className="mb-4 text-xl font-bold">Clientes del negocio</h2>
                <p className="mb-4 text-sm text-text-secondary">
                  Las citas telefónicas pueden registrarse sin cuenta. Esto no
                  autoriza comunicaciones comerciales.
                </p>
                {canOperate && (
                  <button
                    className={secondary + " mb-4"}
                    disabled={busy}
                    onClick={() =>
                      void records("customers", pages.customers !== undefined)
                    }
                  >
                    {pages.customers === undefined
                      ? "Abrir directorio completo"
                      : pages.customers
                        ? "Cargar más clientes"
                        : "Todo el directorio cargado"}
                  </button>
                )}
                {!data.customers.length && (
                  <Empty
                    icon={<Users />}
                    text="Aparecerán al realizar su primera reserva."
                  />
                )}
                {data.customers.map((c) => (
                  <article
                    key={c.id}
                    className="mb-3 rounded-xl border border-border p-4"
                  >
                    <strong>{c.display_name}</strong>
                    <p className="text-sm text-text-secondary">
                      {c.user_id ? "Cuenta de Franky" : "Registro del negocio"}
                      {c.contact ? " · " + c.contact : ""}
                    </p>
                  </article>
                ))}
              </section>
              <section className={panel}>
                <div className="mb-4 flex justify-between gap-3">
                  <h2 className="text-xl font-bold">Bonos de sesiones</h2>
                  {canFinance && (
                    <button className={secondary} onClick={() => add("bundle")}>
                      Registrar bono
                    </button>
                  )}
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Se consume una sesión al registrar la asistencia. Registrar un
                  bono no confirma un pago.
                </p>
                {canOperate && (
                  <button
                    className={secondary + " mb-4"}
                    disabled={busy || pages.bundles === null}
                    onClick={() =>
                      void records("bundles", pages.bundles !== undefined)
                    }
                  >
                    {pages.bundles === undefined
                      ? "Abrir todos los bonos"
                      : pages.bundles
                        ? "Cargar más bonos"
                        : "Todos los bonos cargados"}
                  </button>
                )}
                {data.bundles.map((b) => (
                  <article
                    key={b.id}
                    className="mb-3 rounded-xl bg-bg-secondary p-4"
                  >
                    <p className="font-semibold">{b.label}</p>
                    <p className="mt-1 text-sm">
                      {
                        data.customers.find((c) => c.id === b.customer_id)
                          ?.display_name
                      }{" "}
                      · {b.remaining} de {b.granted} sesiones sin consumir (las
                      reservas pueden tener sesiones comprometidas)
                    </p>
                  </article>
                ))}
              </section>
            </div>
          )}
          {tab === "settings" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <section className={panel}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xl font-bold">
                      Condiciones y reservas
                    </h2>
                    {canSettings && (
                      <button
                        className={secondary}
                        onClick={() =>
                          add(
                            "settings",
                            data.settings as unknown as Record<string, unknown>,
                          )
                        }
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm">
                    Reservas públicas:{" "}
                    {data.settings?.public_booking
                      ? "Activadas"
                      : "Desactivadas"}{" "}
                    · Confirmación{" "}
                    {data.settings?.require_approval
                      ? "manual"
                      : "automática sin señal"}
                  </p>
                  <p className="mt-3 whitespace-pre-line text-sm text-text-secondary">
                    {data.settings?.terms ||
                      "Añade las condiciones del servicio antes de compartir tu enlace."}
                  </p>
                </section>
                <section className={panel}>
                  <div className="flex justify-between gap-3">
                    <h2 className="text-xl font-bold">Horario semanal</h2>
                    {canEdit && (
                      <button
                        className={secondary}
                        onClick={() => add("availability")}
                      >
                        Añadir franja
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-text-secondary">
                    El horario general es obligatorio. Añade franjas específicas
                    para profesionales si trabajan a otras horas.
                  </p>
                  {data.availability.map((a) => (
                    <div
                      key={a.id}
                      className="mt-3 flex justify-between gap-3 border-b border-border pb-3 text-sm"
                    >
                      <p>
                        {week[a.weekday]} ·{" "}
                        {String(Math.floor(a.start_minute / 60)).padStart(
                          2,
                          "0",
                        )}
                        :{String(a.start_minute % 60).padStart(2, "0")} a{" "}
                        {String(Math.floor(a.end_minute / 60)).padStart(2, "0")}
                        :{String(a.end_minute % 60).padStart(2, "0")}
                        <span className="block text-text-secondary">
                          {data.resources.find((r) => r.id === a.resource_id)
                            ?.name ?? "Todo el negocio"}
                        </span>
                      </p>
                      {canEdit && (
                        <button
                          onClick={() =>
                            void mutate("professional_save_record", {
                              p_entity: "availability",
                              p_record_id: a.id,
                              p_data: { delete: true },
                            })
                          }
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                </section>
                <section className={panel}>
                  <div className="flex justify-between gap-3">
                    <h2 className="text-xl font-bold">Ausencias y cierres</h2>
                    {canEdit && (
                      <button
                        className={secondary}
                        onClick={() => add("exception")}
                      >
                        Bloquear día
                      </button>
                    )}
                  </div>
                  {data.exceptions.map((e) => (
                    <div
                      key={e.id}
                      className="mt-3 flex justify-between gap-3 text-sm"
                    >
                      <p>
                        {e.local_date} ·{" "}
                        {data.resources.find((r) => r.id === e.resource_id)
                          ?.name ?? "Todo el negocio"}
                        <span className="block text-text-secondary">
                          {e.reason}
                        </span>
                      </p>
                      {canEdit && (
                        <button
                          onClick={() =>
                            void mutate("professional_save_record", {
                              p_entity: "exception",
                              p_record_id: e.id,
                              p_data: { delete: true },
                            })
                          }
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  ))}
                </section>
              </div>
              <Pricing category={category} organization={space.id} />
            </div>
          )}
        </>
      )}
      {editor && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="professional-editor-title"
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-bg-primary p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 id="professional-editor-title" className="text-xl font-bold">
                {
                  {
                    service: "Servicio",
                    resource: "Profesional o espacio",
                    availability: "Horario disponible",
                    exception: "Día no disponible",
                    session: "Programar sesión",
                    booking: "Nueva reserva",
                    bundle: "Registrar bono",
                    settings: "Configuración",
                  }[editor.entity]
                }
              </h2>
              <button
                type="button"
                className={secondary}
                onClick={closeEditor}
                aria-label="Cerrar formulario"
              >
                Cerrar
              </button>
            </div>
            <EditorFields editor={editor} data={data} category={category} />
            <div className="mt-6 flex items-center justify-end gap-3">
              <button type="button" onClick={closeEditor} className={secondary}>
                Cancelar
              </button>
              <button disabled={busy} className={button}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className={panel}>
      <p className="text-sm text-text-secondary">{label}</p>
      <strong className="mt-2 block text-3xl">{value}</strong>
    </div>
  );
}
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-secondary px-6 py-10 text-center text-text-secondary">
      {icon}
      <p className="max-w-sm text-sm">{text}</p>
    </div>
  );
}
function Pricing({
  category,
  organization,
}: {
  category: ProfessionalCategory;
  organization: string;
}) {
  const s = PROFESSIONAL_SECTORS[category];
  return (
    <section className="rounded-2xl border border-violet/30 bg-violet/5 p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-violet">
        El software de tu negocio
      </p>
      <h2 className="mt-3 text-2xl font-bold">
        Un año para hacer crecer tu negocio
      </h2>
      <p className="mt-3 text-text-secondary">
        Herramientas para {s.label.toLocaleLowerCase("es-ES")}, con una agenda
        compartida entre tu equipo y quienes reservan desde Franky.
      </p>
      <ul className="mt-5 space-y-3 text-sm">
        {s.benefits.map((benefit) => (
          <li key={benefit} className="flex gap-2">
            <Check size={17} className="shrink-0 text-violet" />
            {benefit}
          </li>
        ))}
      </ul>
      <Link
        className={button + " mt-6"}
        href={`/espacios/facturacion?organization=${organization}`}
      >
        Consultar plan y facturación <ArrowRight size={16} />
      </Link>
      <p className="mt-2 text-sm text-text-secondary">
        Consulta la disponibilidad, la oferta de tu espacio y sus condiciones.
        El primer periodo y las renovaciones se aceptan antes de contratar.
      </p>
      <p className="mt-4 text-xs text-text-secondary">
        Aceptar Card y configurar descuentos no exige contratar este software.
        Mensajería de pago, procesamiento de cobros e integraciones especiales
        se presupuestan aparte.
      </p>
    </section>
  );
}
function EditorFields({
  editor,
  data,
  category,
}: {
  editor: Editor;
  data: ProfessionalWorkspace;
  category: ProfessionalCategory;
}) {
  const r = editor.record ?? {},
    entity = editor.entity;
  const val = (key: string, fallback: string | number = "") =>
    String(r[key] ?? fallback);
  const services = data.services.filter((s) => s.active),
    resources = data.resources.filter((x) => x.active);
  const serviceField = (
    <label className="block text-sm">
      Servicio
      <select name="service_id" required className={input}>
        {services
          .filter((s) => entity !== "session" || s.mode === "session")
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.duration_minutes} min
            </option>
          ))}
      </select>
    </label>
  );
  const customerField = (
    <label className="block text-sm">
      Cliente existente
      <select
        name="customer_id"
        required={entity === "bundle"}
        className={input}
      >
        <option value="">
          {entity === "booking"
            ? "Crear registro con el nombre de abajo"
            : "Selecciona una persona"}
        </option>
        {data.customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.display_name}
          </option>
        ))}
      </select>
    </label>
  );
  const resourceField = (
    <fieldset className="rounded-xl border border-border p-3">
      <legend className="px-1 text-sm">Recursos necesarios</legend>
      {!resources.length && (
        <p className="text-sm text-text-secondary">
          Primero añade profesionales o espacios.
        </p>
      )}
      {resources.map((x) => (
        <label key={x.id} className="mb-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="resource_ids"
            value={x.id}
            defaultChecked={
              Array.isArray(r.required_resource_ids) &&
              r.required_resource_ids.includes(x.id)
            }
          />
          {x.name}
        </label>
      ))}
    </fieldset>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(entity === "service" || entity === "resource") && (
        <label className="block text-sm sm:col-span-2">
          Nombre
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={val("name")}
            className={input}
          />
        </label>
      )}
      {entity === "service" && (
        <>
          <label className="block text-sm">
            Tipo de reserva
            <select
              name="mode"
              defaultValue={val("mode", PROFESSIONAL_SECTORS[category].mode)}
              className={input}
            >
              <option value="appointment">Cita</option>
              <option value="resource">Recurso por horario</option>
              <option value="session">Sesión con aforo</option>
              <option value="group">Grupo / restaurante</option>
            </select>
          </label>
          <label className="block text-sm">
            Duración en minutos
            <input
              type="number"
              name="duration_minutes"
              required
              min={5}
              max={720}
              defaultValue={val("duration_minutes", 30)}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Preparación posterior, minutos
            <input
              type="number"
              name="buffer_minutes"
              required
              min={0}
              max={180}
              defaultValue={val("buffer_minutes", 0)}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Personas máximas por reserva
            <input
              type="number"
              name="capacity"
              required
              min={1}
              max={500}
              defaultValue={val("capacity", 1)}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Precio final al cliente, €
            <input
              type="number"
              step="0.01"
              name="price"
              min={0}
              max={10000}
              required
              defaultValue={Number(r.price_cents ?? 0) / 100}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Aplicar precio
            <select
              name="price_basis"
              defaultValue={val("price_basis", "booking")}
              className={input}
            >
              <option value="booking">Por reserva</option>
              <option value="person">Por persona</option>
            </select>
          </label>
          <div className="text-sm">
            <input type="hidden" name="deposit" value="0" />
            <p>Reserva sin señal</p>
            <p className="mt-1 text-xs text-text-secondary">
              Los pagos anticipados estarán disponibles cuando finalice la
              integración del proveedor. Ahora tus clientes pueden reservar sin
              señal.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="staff_required"
              defaultChecked={Boolean(
                r.staff_required ?? category === "hairdresser",
              )}
            />
            Necesita profesional con agenda
          </label>
          <label className="block text-sm sm:col-span-2">
            Descripción
            <textarea
              name="description"
              maxLength={3000}
              defaultValue={val("description")}
              className={input}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Menú o contenido acordado
            <textarea
              name="menu"
              maxLength={4000}
              defaultValue={val("menu")}
              className={input}
            />
          </label>
          <div className="sm:col-span-2">{resourceField}</div>
        </>
      )}
      {entity === "resource" && (
        <>
          <label className="block text-sm">
            Tipo
            <select
              name="kind"
              defaultValue={val("kind", "staff")}
              className={input}
            >
              <option value="staff">Profesional con agenda</option>
              <option value="room">Sala exclusiva</option>
              <option value="equipment">Equipo</option>
              <option value="table">Mesa / zona compartida</option>
              <option value="court">Pista</option>
              <option value="desk">Puestos compartidos</option>
            </select>
          </label>
          <label className="block text-sm">
            Capacidad simultánea
            <input
              type="number"
              name="capacity"
              min={1}
              max={500}
              defaultValue={val("capacity", 1)}
              className={input}
            />
            <span className="text-xs text-text-secondary">
              Profesionales: 1. En mesas y puestos se cuentan personas.
            </span>
          </label>
        </>
      )}
      {(entity === "availability" || entity === "exception") && (
        <label className="block text-sm sm:col-span-2">
          Aplica a
          <select name="resource_id" className={input}>
            <option value="">Todo el negocio</option>
            {resources.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {entity === "availability" && (
        <>
          <label className="block text-sm">
            Día
            <select name="weekday" className={input}>
              {week.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <div />
          <label className="block text-sm">
            Apertura (hora del negocio)
            <input
              required
              type="time"
              name="start"
              defaultValue="09:00"
              className={input}
            />
          </label>
          <label className="block text-sm">
            Cierre (hora del negocio)
            <input
              required
              type="time"
              name="end"
              defaultValue="20:00"
              className={input}
            />
          </label>
        </>
      )}
      {entity === "exception" && (
        <>
          <label className="block text-sm">
            Fecha
            <input type="date" name="local_date" required className={input} />
          </label>
          <label className="block text-sm">
            Motivo
            <input name="reason" maxLength={500} required className={input} />
          </label>
          <p className="text-xs text-text-secondary sm:col-span-2">
            El cierre impide nuevas reservas. Revisa por separado las citas ya
            confirmadas; no se cancelan sin avisar.
          </p>
        </>
      )}
      {(entity === "session" || entity === "booking" || entity === "bundle") &&
        serviceField}
      {(entity === "session" || entity === "booking") && (
        <label className="block text-sm">
          Inicio (hora de este dispositivo)
          <input
            type="datetime-local"
            name="starts_at"
            required={entity === "session"}
            className={input}
          />
        </label>
      )}
      {entity === "session" && (
        <>
          <label className="block text-sm">
            Plazas
            <input
              type="number"
              name="capacity"
              min={1}
              max={500}
              required
              defaultValue={10}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Semanas (1 = una sesión)
            <input
              type="number"
              name="repeat_weeks"
              min={1}
              max={13}
              required
              defaultValue={1}
              className={input}
            />
          </label>
          <div className="sm:col-span-2">{resourceField}</div>
          <p className="text-xs text-text-secondary sm:col-span-2">
            Se conserva la hora local del negocio al repetir. Si una sesión
            coincide con un cierre o reserva, se rechaza toda la serie para que
            puedas corregirla.
          </p>
        </>
      )}
      {entity === "booking" && (
        <>
          <label className="block text-sm">
            Sesión, si el servicio tiene aforo
            <select name="session_id" className={input}>
              <option value="">Reserva de horario indicada arriba</option>
              {data.sessions
                .filter((x) => x.status === "open")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {services.find((s) => s.id === x.service_id)?.name} ·{" "}
                    {new Date(x.starts_at).toLocaleString("es-ES")}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            Personas
            <input
              type="number"
              name="party_size"
              min={1}
              max={500}
              required
              defaultValue={1}
              className={input}
            />
          </label>
          {customerField}
          <label className="block text-sm">
            Nombre para una cita telefónica
            <input name="customer_name" maxLength={120} className={input} />
          </label>
          <label className="block text-sm">
            Contacto opcional
            <input name="customer_contact" maxLength={254} className={input} />
          </label>
          <label className="block text-sm">
            Bono
            <select name="bundle_id" className={input}>
              <option value="">Sin bono</option>
              {data.bundles
                .filter((x) => x.remaining > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} ·{" "}
                    {
                      data.customers.find((c) => c.id === b.customer_id)
                        ?.display_name
                    }
                  </option>
                ))}
            </select>
          </label>
          <div className="sm:col-span-2">{resourceField}</div>
        </>
      )}
      {entity === "bundle" && (
        <>
          {customerField}
          <label className="block text-sm">
            Nombre del bono
            <input name="label" maxLength={160} required className={input} />
          </label>
          <label className="block text-sm">
            Sesiones
            <input
              type="number"
              name="units"
              min={1}
              max={1000}
              required
              defaultValue={5}
              className={input}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Motivo o referencia de entrega
            <input
              name="reason"
              minLength={3}
              maxLength={500}
              required
              className={input}
            />
          </label>
          <p className="text-xs text-text-secondary sm:col-span-2">
            Sólo registra el derecho a sesiones; no confirma que se haya cobrado
            una venta.
          </p>
        </>
      )}
      {entity === "settings" && (
        <>
          <label className="block text-sm">
            Zona horaria
            <select
              name="timezone"
              defaultValue={val("timezone", "Europe/Madrid")}
              className={input}
            >
              <option value="Europe/Madrid">Península y Baleares</option>
              <option value="Atlantic/Canary">Canarias</option>
            </select>
          </label>
          <label className="block text-sm">
            Cancelación gratuita hasta, horas antes
            <input
              type="number"
              name="cancellation_hours"
              min={0}
              max={168}
              defaultValue={val("cancellation_hours", 24)}
              className={input}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="public_booking"
              defaultChecked={Boolean(r.public_booking)}
            />
            Permitir reservas de clientes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="require_approval"
              defaultChecked={Boolean(r.require_approval)}
            />
            Confirmar solicitudes manualmente
          </label>
          <label className="block text-sm sm:col-span-2">
            Condiciones visibles antes de reservar
            <textarea
              name="terms"
              maxLength={4000}
              defaultValue={val("terms")}
              className={input}
            />
          </label>
        </>
      )}
    </div>
  );
}
