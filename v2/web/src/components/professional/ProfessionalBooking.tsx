"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CardCampaignConditions } from "../card/card-campaign";
import { ProfessionalNotices } from "./ProfessionalNotices";
import { WaitlistOffer } from "./WaitlistOffer";
import { CalendarDays, Check, Clock, MapPin, ArrowRight } from "lucide-react";
import { useFinancialOwner } from "@/lib/use-financial-owner";
import { useProfessionalRpc } from "./useProfessionalRpc";
import type {
  CardOffer,
  CardBookingQuote,
  CardPage,
} from "../../../../shared/franky-card";
import {
  PROFESSIONAL_BOOKING_LABELS,
  PROFESSIONAL_SECTORS,
  professionalError,
  professionalMoney,
  type ProfessionalCatalog,
  type ProfessionalBooking,
  type ProfessionalCategory,
  type ProfessionalBundle,
} from "../../../../shared/professional-services";
const input =
  "mt-2 w-full rounded-xl border border-border bg-bg-primary px-3 py-3 text-sm";
const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-violet px-5 py-3 text-sm font-semibold text-white disabled:opacity-40";
type Business = {
  id: string;
  name: string;
  city: string | null;
  category: ProfessionalCategory;
};
export default function ProfessionalBookingPage({
  organizationId,
  myBookings = false,
}: {
  organizationId?: string;
  myBookings?: boolean;
}) {
  const owner = useFinancialOwner();
  return owner ? (
    <div key={owner.key}>
      {myBookings ? (
        <MyBookings owner={owner.userId} />
      ) : organizationId ? (
        <BookingForm
          key={organizationId}
          owner={owner.userId}
          organization={organizationId}
        />
      ) : (
        <Discover owner={owner.userId} />
      )}
    </div>
  ) : (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-bold">Tus próximos planes</h1>
      <p className="my-4">
        Entra con tu cuenta para reservar, seguir cambios y consultar tus citas.
      </p>
      <Link
        className={button}
        href={
          "/login?next=" +
          encodeURIComponent(
            myBookings
              ? "/espacios/servicios/mis-reservas"
              : "/espacios/servicios/reservar" +
                  (organizationId ? "?organization=" + organizationId : ""),
          )
        }
      >
        Iniciar sesión
      </Link>
    </main>
  );
}
function Discover({ owner }: { owner: string }) {
  const rpc = useProfessionalRpc(owner),
    [city, setCity] = useState(""),
    [items, setItems] = useState<Business[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load(more = false) {
    const v = ++generation.current;
    setBusy(true);
    try {
      const result = await rpc<{
        items: Business[];
        next_cursor: string | null;
      }>("professional_list_businesses", {
        p_city: city.trim() || null,
        p_cursor: more ? cursor : null,
      });
      if (alive.current && v === generation.current) {
        setItems((old) => (more ? [...old, ...result.items] : result.items));
        setCursor(result.next_cursor);
        setError("");
      }
    } catch (e) {
      if (alive.current && v === generation.current)
        setError(professionalError((e as Error).message));
    } finally {
      if (alive.current && v === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8">
      <Link
        href="/espacios/servicios/mis-reservas"
        className="text-sm text-violet"
      >
        Mis reservas →
      </Link>
      <h1 className="mt-5 text-3xl font-bold">Encuentra tu próximo hueco</h1>
      <p className="mt-3 text-text-secondary">
        Citas, grupos y actividades que puedes reservar directamente con el
        negocio.
      </p>
      <form
        className="my-6 flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="flex-1 text-sm">
          Ciudad
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={input}
            placeholder="Todas las ciudades"
            maxLength={100}
          />
        </label>
        <button disabled={busy} className={button}>
          Buscar
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((b) => (
          <Link
            key={b.id}
            href={"/espacios/servicios/reservar?organization=" + b.id}
            className="rounded-2xl border border-border bg-bg-primary p-6 transition hover:border-violet"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-violet">
              {PROFESSIONAL_SECTORS[b.category].label}
            </p>
            <h2 className="mt-3 text-xl font-bold">{b.name}</h2>
            <p className="mt-2 flex items-center gap-1 text-sm text-text-secondary">
              <MapPin size={14} />
              {b.city ?? "Consultar ubicación"}
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
              Ver disponibilidad <ArrowRight size={15} />
            </span>
          </Link>
        ))}
      </div>
      {!busy && !items.length && (
        <p className="rounded-2xl bg-bg-secondary p-8 text-center text-text-secondary">
          Aún no hay negocios con reservas activas en esta búsqueda. La red se
          amplía cuando cada negocio está preparado para atenderte.
        </p>
      )}
      {cursor && (
        <button
          disabled={busy}
          onClick={() => void load(true)}
          className={button + " mt-5"}
        >
          Ver más
        </button>
      )}
    </main>
  );
}
function BookingForm({
  owner,
  organization,
}: {
  owner: string;
  organization: string;
}) {
  const rpc = useProfessionalRpc(owner),
    [catalog, setCatalog] = useState<ProfessionalCatalog | null>(null),
    [serviceId, setServiceId] = useState(""),
    [day, setDay] = useState(new Date().toISOString().slice(0, 10)),
    [resource, setResource] = useState(""),
    [party, setParty] = useState(1),
    [slots, setSlots] = useState<string[]>([]),
    [time, setTime] = useState(""),
    [sessionId, setSessionId] = useState(""),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false),
    [slotLoading, setSlotLoading] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ProfessionalBooking | null>(null);
  const [bundles, setBundles] = useState<ProfessionalBundle[]>([]),
    [bundleId, setBundleId] = useState(""),
    [bundleCursor, setBundleCursor] = useState<string | null>(null),
    [bundleError, setBundleError] = useState("");
  const bundleGeneration = useRef(0);
  const [offers, setOffers] = useState<CardOffer[]>([]),
    [offerId, setOfferId] = useState(""),
    [quote, setQuote] = useState<
      (CardBookingQuote & { inputKey: string }) | null
    >(null),
    [quoteBusy, setQuoteBusy] = useState(false);
  const quoteGeneration = useRef(0);
  const alive = useRef(true),
    generation = useRef(0),
    pending = useRef(false),
    attempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const load = useCallback(async () => {
    try {
      const data = await rpc<ProfessionalCatalog>("professional_get_catalog", {
        p_organization_id: organization,
      });
      if (alive.current) {
        setCatalog(data);
        setServiceId((old) =>
          data.services.some((s) => s.id === old)
            ? old
            : (data.services[0]?.id ?? ""),
        );
        setError("");
      }
    } catch (e) {
      if (alive.current) {
        setCatalog(null);
        setError(professionalError((e as Error).message));
      }
    }
  }, [rpc, organization]);
  useEffect(() => {
    void load();
  }, [load]);
  const service = catalog?.services.find((s) => s.id === serviceId),
    ordinary = service
      ? service.price_cents * (service.price_basis === "person" ? party : 1)
      : 0;
  const chosenStart =
    service?.mode === "session"
      ? (catalog?.sessions.find((s) => s.id === sessionId)?.starts_at ?? "")
      : time;
  const quoteKey = JSON.stringify([serviceId, party, chosenStart, offerId]);
  const activeQuote = quote?.inputKey === quoteKey ? quote : null;
  const activeBundle = bundles.find(
    (b) =>
      b.id === bundleId &&
      b.service_id === serviceId &&
      b.remaining > 0 &&
      party === 1,
  );
  const total = activeBundle ? 0 : (activeQuote?.final_cents ?? ordinary),
    deposit = Math.min(
      total,
      service
        ? service.deposit_cents * (service.price_basis === "person" ? party : 1)
        : 0,
    );
  useEffect(() => {
    const v = ++bundleGeneration.current;
    setBundleId("");
    setBundles([]);
    setBundleCursor(null);
    setBundleError("");
    setAccepted(false);
    if (!serviceId || party !== 1) return;
    void rpc<{ items: ProfessionalBundle[]; next_cursor: string | null }>(
      "professional_list_customer_bundles",
      { p_organization_id: organization, p_service_id: serviceId, p_limit: 50 },
    )
      .then((result) => {
        if (alive.current && v === bundleGeneration.current) {
          setBundles(result.items);
          setBundleCursor(result.next_cursor);
        }
      })
      .catch(() => {
        if (alive.current && v === bundleGeneration.current)
          setBundleError(
            "No se pudieron consultar tus bonos. Puedes reintentar actualizando la página.",
          );
      });
  }, [serviceId, party, organization, rpc]);
  async function moreBundles() {
    const v = ++bundleGeneration.current;
    try {
      const result = await rpc<{
        items: ProfessionalBundle[];
        next_cursor: string | null;
      }>("professional_list_customer_bundles", {
        p_organization_id: organization,
        p_service_id: serviceId,
        p_limit: 50,
        p_cursor: bundleCursor,
      });
      if (alive.current && v === bundleGeneration.current) {
        setBundles((old) => [
          ...old,
          ...result.items.filter((b) => !old.some((x) => x.id === b.id)),
        ]);
        setBundleCursor(result.next_cursor);
      }
    } catch {
      if (alive.current && v === bundleGeneration.current)
        setBundleError("No se pudieron consultar más bonos. Reintenta.");
    }
  }
  useEffect(() => {
    let current = true;
    void rpc<CardPage<CardOffer>>("list_franky_card_offers", {
      p_organization_id: organization,
      p_limit: 50,
    })
      .then((page) => {
        if (current) setOffers(page.items);
      })
      .catch(() => {
        if (current) setOffers([]);
      });
    return () => {
      current = false;
    };
  }, [organization, rpc]);
  useEffect(() => {
    const version = ++quoteGeneration.current;
    setQuote(null);
    setAccepted(false);
    if (!offerId || !chosenStart || !service) {
      setQuoteBusy(false);
      return;
    }
    setQuoteBusy(true);
    void rpc<CardBookingQuote>("card_quote_professional_booking", {
      p_organization_id: organization,
      p_service_id: service.id,
      p_party_size: party,
      p_starts_at: chosenStart,
      p_offer_id: offerId,
    })
      .then((result) => {
        if (alive.current && version === quoteGeneration.current) {
          setQuote({ ...result, inputKey: quoteKey });
          setQuoteBusy(false);
          setError("");
        }
      })
      .catch(() => {
        if (alive.current && version === quoteGeneration.current) {
          setQuoteBusy(false);
          setError(
            "No se pudo aplicar esa ventaja: comprueba que tu Card esté activa y que el servicio y la fecha cumplan sus condiciones. Puedes reservar sin Card.",
          );
        }
      });
  }, [quoteKey, rpc, organization]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = ++generation.current;
    setTime("");
    setAccepted(false);
    attempt.current = null;
    if (!service || service.mode === "session") {
      setSlots([]);
      setSlotLoading(false);
      return;
    }
    setSlotLoading(true);
    setSlots([]);
    void rpc<string[]>("professional_get_slots", {
      p_organization_id: organization,
      p_service_id: service.id,
      p_date: day,
      p_resource_ids: resource ? [resource] : [],
      p_party_size: party,
    })
      .then((data) => {
        if (alive.current && v === generation.current) {
          setSlots(data);
          setSlotLoading(false);
          setError("");
        }
      })
      .catch((e) => {
        if (alive.current && v === generation.current) {
          setSlots([]);
          setSlotLoading(false);
          setError(professionalError((e as Error).message));
        }
      });
  }, [serviceId, day, resource, party, catalog, rpc, organization]); // eslint-disable-line react-hooks/exhaustive-deps
  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (
      pending.current ||
      !service ||
      !catalog ||
      !accepted ||
      (offerId && !activeQuote)
    )
      return;
    const args = {
      p_organization_id: organization,
      p_service_id: service.id,
      p_starts_at: service.mode === "session" ? null : time,
      p_session_id: service.mode === "session" ? sessionId : null,
      p_resource_ids: resource ? [resource] : [],
      p_party_size: party,
      p_expected_service_version: service.version,
      p_expected_total_cents: total,
      p_expected_terms: catalog.settings.terms,
      p_card_quote_id: activeQuote?.id ?? null,
      p_bundle_id: activeBundle?.id ?? null,
    };
    const payload = JSON.stringify(args);
    if (attempt.current?.payload !== payload)
      attempt.current = { payload, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const b = await rpc<ProfessionalBooking>("professional_book", {
        ...args,
        p_request_key: attempt.current.key,
      });
      if (alive.current) setResult(b);
    } catch (e) {
      if (alive.current) setError(professionalError((e as Error).message));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (result)
    return (
      <main className="mx-auto max-w-xl p-6 sm:py-14">
        <div className="rounded-3xl bg-violet/5 p-8">
          <Check size={32} className="text-violet" />
          <h1 className="mt-4 text-3xl font-bold">
            {result.status === "confirmed"
              ? "Tu reserva está confirmada"
              : result.status === "waitlisted"
                ? "Ya estás en la lista de espera"
                : "Solicitud enviada"}
          </h1>
          <p className="mt-4">
            {result.service_name} · {catalog?.organization.name}
          </p>
          <p className="mt-2 text-text-secondary">
            {new Date(result.starts_at).toLocaleString("es-ES", {
              timeZone: catalog?.settings.timezone,
            })}
          </p>
          <p className="mt-3 font-bold">
            {professionalMoney(result.total_cents)}
          </p>
          {result.status === "waitlisted" && (
            <p className="mt-4 text-sm">
              Aún no tienes una plaza confirmada. Consulta aquí si el negocio te
              ofrece un hueco.
            </p>
          )}
          {result.deposit_status === "pending" && (
            <p className="mt-4 text-sm">
              La señal de {professionalMoney(result.deposit_cents)} está
              pendiente; esta pantalla no te ha cobrado. Contacta con el negocio
              para resolver la solicitud.
            </p>
          )}
          <Link
            className={button + " mt-6"}
            href="/espacios/servicios/mis-reservas"
          >
            Ver mis reservas
          </Link>
        </div>
      </main>
    );
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Link
        href="/espacios/servicios/reservar"
        className="text-sm text-text-secondary"
      >
        ← Explorar negocios
      </Link>
      {error && (
        <p role="alert" className="my-5 rounded-xl bg-red-50 p-4 text-red-800">
          {error}
          <button className="ml-3 underline" onClick={() => void load()}>
            Actualizar
          </button>
        </p>
      )}
      {!catalog && !error && (
        <p className="py-10">Consultando disponibilidad…</p>
      )}
      {catalog && (
        <>
          <p className="mt-6 text-sm font-semibold text-violet">
            Reserva con Franky
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            {catalog.organization.name}
          </h1>
          <p className="mt-2 text-text-secondary">
            {catalog.organization.city} · Horas de {catalog.settings.timezone}
          </p>
          <form
            onSubmit={book}
            className="mt-7 grid items-start gap-6 md:grid-cols-[1fr_300px]"
          >
            <div className="space-y-5 rounded-2xl border border-border p-5">
              <label className="block text-sm font-semibold">
                1. Elige tu servicio
                <select
                  className={input}
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    setResource("");
                    setSessionId("");
                    setParty(1);
                    setAccepted(false);
                  }}
                >
                  {catalog.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {professionalMoney(s.price_cents)}
                      {s.price_basis === "person" ? " / persona" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {service && (
                <>
                  <p className="text-sm text-text-secondary">
                    {service.description}
                  </p>
                  <p className="flex items-center gap-2 text-sm text-text-secondary">
                    <Clock size={15} />
                    {service.duration_minutes} minutos
                  </p>
                  {service.capacity > 1 && (
                    <label className="block text-sm font-semibold">
                      Personas
                      <input
                        type="number"
                        min={1}
                        max={service.capacity}
                        required
                        value={party}
                        onChange={(e) => {
                          setParty(Number(e.target.value));
                          setAccepted(false);
                        }}
                        className={input}
                      />
                    </label>
                  )}
                  {service.mode === "session" ? (
                    <label className="block text-sm font-semibold">
                      2. Elige una sesión
                      <select
                        value={sessionId}
                        onChange={(e) => {
                          setSessionId(e.target.value);
                          setAccepted(false);
                        }}
                        required
                        className={input}
                      >
                        <option value="">Selecciona fecha</option>
                        {catalog.sessions
                          .filter((x) => x.service_id === service.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {new Date(s.starts_at).toLocaleString("es-ES", {
                                timeZone: catalog.settings.timezone,
                              })}{" "}
                              ·{" "}
                              {Math.max(
                                0,
                                s.capacity - (s.reserved_seats ?? 0),
                              )}{" "}
                              plazas
                              {s.capacity - (s.reserved_seats ?? 0) < party
                                ? " · lista de espera"
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-semibold">
                          2. Elige día
                          <input
                            type="date"
                            required
                            value={day}
                            onChange={(e) =>
                              e.target.value && setDay(e.target.value)
                            }
                            className={input}
                          />
                        </label>
                        <label className="block text-sm font-semibold">
                          Profesional o espacio
                          <select
                            value={resource}
                            onChange={(e) => setResource(e.target.value)}
                            className={input}
                          >
                            <option value="">
                              {service.staff_required
                                ? "Cualquier profesional disponible"
                                : "Recurso del servicio"}
                            </option>
                            {catalog.resources
                              .filter(
                                (r) =>
                                  service.staff_required &&
                                  !catalog.resources.some(
                                    (required) =>
                                      required.kind === "staff" &&
                                      service.required_resource_ids.includes(
                                        required.id,
                                      ),
                                  ) &&
                                  r.kind === "staff",
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <fieldset>
                        <legend className="text-sm font-semibold">
                          3. Horarios disponibles
                        </legend>
                        {slotLoading ? (
                          <p className="mt-3 text-sm" role="status">
                            Consultando horarios…
                          </p>
                        ) : !slots.length ? (
                          <p className="mt-3 rounded-xl bg-bg-secondary p-4 text-sm">
                            No hay huecos para esa selección. Prueba otra fecha
                            o recurso.
                          </p>
                        ) : (
                          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {slots.map((t) => (
                              <label
                                key={t}
                                className={
                                  "cursor-pointer rounded-xl border px-3 py-3 text-center text-sm " +
                                  (time === t
                                    ? "border-violet bg-violet/10 text-violet"
                                    : "border-border")
                                }
                              >
                                <input
                                  className="sr-only"
                                  type="radio"
                                  name="time"
                                  value={t}
                                  checked={time === t}
                                  onChange={() => {
                                    setTime(t);
                                    setAccepted(false);
                                  }}
                                />
                                {new Date(t).toLocaleTimeString("es-ES", {
                                  timeZone: catalog.settings.timezone,
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </label>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    </>
                  )}
                  {bundleError && (
                    <p role="status" className="text-sm text-text-secondary">
                      {bundleError}
                    </p>
                  )}
                  {!!bundles.filter((b) => b.remaining > 0).length && (
                    <div className="rounded-xl border border-border p-4">
                      <label className="block text-sm font-semibold">
                        Tu bono para este servicio
                        <select
                          className={input}
                          value={bundleId}
                          onChange={(e) => {
                            setBundleId(e.target.value);
                            setOfferId("");
                            setQuote(null);
                            setAccepted(false);
                          }}
                        >
                          <option value="">Reservar sin bono</option>
                          {bundles
                            .filter((b) => b.remaining > 0)
                            .map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.label} · {b.remaining} sesiones sin consumir
                              </option>
                            ))}
                        </select>
                      </label>
                      <p className="mt-2 text-xs text-text-secondary">
                        Se reserva una sesión del bono. Se descuenta al
                        registrar tu asistencia. No se combina con descuento
                        Card y su disponibilidad se comprueba al reservar.
                      </p>
                    </div>
                  )}
                  {bundleCursor && (
                    <button
                      type="button"
                      className="text-sm text-violet"
                      onClick={() => void moreBundles()}
                    >
                      Ver más bonos
                    </button>
                  )}
                  {!!offers.length && (
                    <div className="rounded-xl border border-violet/30 bg-violet/5 p-4">
                      <label className="block text-sm font-semibold">
                        Ventaja Franky Card
                        <select
                          value={offerId}
                          onChange={(e) => {
                            setOfferId(e.target.value);
                            setBundleId("");
                            setAccepted(false);
                          }}
                          className={input}
                        >
                          <option value="">Reservar sin ventaja Card</option>
                          {offers.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.title} · {o.percent}%
                            </option>
                          ))}
                        </select>
                      </label>
                      {offerId && (
                        <p className="mt-3 whitespace-pre-line text-xs text-text-secondary">
                          {offers.find((o) => o.id === offerId)?.terms}
                        </p>
                      )}
                      {quoteBusy && (
                        <p className="mt-3 text-sm" role="status">
                          Comprobando tu ventaja…
                        </p>
                      )}
                      {offers
                        .filter((o) => o.id === offerId)
                        .map((o) => (
                          <CardCampaignConditions key={o.id} offer={o} />
                        ))}
                      {activeQuote && (
                        <p className="mt-3 text-sm text-violet">
                          Precio protegido:{" "}
                          {professionalMoney(activeQuote.final_cents)}.
                          Descuento:{" "}
                          {professionalMoney(activeQuote.discount_cents)}.
                          Confirma antes de{" "}
                          {new Date(activeQuote.expires_at).toLocaleTimeString(
                            "es-ES",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                          .
                        </p>
                      )}
                      <p className="mt-3 text-xs text-text-secondary">
                        La ventaja se comprueba en el servidor. El ahorro se
                        registra cuando el consumo se confirme; una reserva
                        futura no es ahorro realizado.
                      </p>
                    </div>
                  )}
                  {service.menu && (
                    <div className="rounded-xl bg-bg-secondary p-4">
                      <p className="text-sm font-semibold">Qué incluye</p>
                      <p className="mt-2 whitespace-pre-line text-sm">
                        {service.menu}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            <aside className="rounded-2xl bg-[#251638] p-6 text-white">
              <CalendarDays size={24} />
              <h2 className="mt-4 text-xl font-bold">Tu reserva</h2>
              <p className="mt-3 text-white/75">
                {service?.name ?? "Elige un servicio"}
              </p>
              <p className="mt-3 text-3xl font-bold">
                {professionalMoney(total)}
              </p>
              <p className="mt-2 text-sm text-white/65">
                {activeBundle ? (
                  "Una sesión del bono · sin pago adicional"
                ) : (
                  <>
                    {party} persona{party === 1 ? "" : "s"} · precio total
                  </>
                )}
              </p>
              {deposit > 0 && (
                <p className="mt-4 text-sm text-amber-200">
                  Incluye una señal de {professionalMoney(deposit)}. Su cobro
                  todavía no está disponible aquí; se enviará una solicitud al
                  negocio.
                </p>
              )}
              <p className="mt-5 text-xs text-white/70">
                Puedes cancelar hasta {catalog.settings.cancellation_hours}{" "}
                horas antes. Después, contacta con el negocio. No se carga
                ninguna penalización automática.
              </p>
              {catalog.settings.terms && (
                <details className="mt-3 text-xs text-white/70">
                  <summary className="cursor-pointer">
                    Condiciones del negocio
                  </summary>
                  <p className="mt-2 whitespace-pre-line">
                    {catalog.settings.terms}
                  </p>
                </details>
              )}
              <label className="mt-5 flex items-start gap-2 text-sm">
                <input
                  className="mt-1"
                  type="checkbox"
                  required
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                He revisado precio, fecha y condiciones.
              </label>
              <button
                disabled={
                  busy ||
                  slotLoading ||
                  quoteBusy ||
                  Boolean(offerId && !activeQuote) ||
                  !accepted ||
                  !service ||
                  (service.mode === "session" ? !sessionId : !time)
                }
                className="mt-5 w-full rounded-xl bg-white px-4 py-3 font-bold text-[#251638] disabled:opacity-40"
              >
                {busy
                  ? "Enviando…"
                  : catalog.settings.require_approval || deposit > 0
                    ? "Enviar solicitud"
                    : "Reservar"}
              </button>
              <p className="mt-3 text-xs text-white/60">
                La disponibilidad se vuelve a comprobar al confirmar. No
                necesitas Franky Card para reservar.
              </p>
            </aside>
          </form>
        </>
      )}
    </main>
  );
}
function MyBookings({ owner }: { owner: string }) {
  const rpc = useProfessionalRpc(owner),
    [items, setItems] = useState<
      (ProfessionalBooking & { organization_name: string })[]
    >([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    pending = useRef(false),
    version = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      version.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const v = ++version.current;
    try {
      const data = await rpc<
        (ProfessionalBooking & { organization_name: string })[]
      >("professional_my_bookings");
      if (alive.current && v === version.current) {
        setItems(data);
        setError("");
      }
    } catch (e) {
      if (alive.current && v === version.current) {
        setItems([]);
        setError(professionalError((e as Error).message));
      }
    }
  }, [rpc]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);
  async function action(
    b: ProfessionalBooking,
    name: string,
    data: Record<string, unknown> = {},
  ) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await rpc<ProfessionalBooking>(
        "professional_booking_action",
        {
          p_organization_id: b.organization_id,
          p_booking_id: b.id,
          p_action: name,
          p_data: data,
        },
      );
      if (alive.current)
        setNotice(
          result.waitlist_offer_status === "expired"
            ? "El plazo de la plaza ha terminado. La reserva se ha actualizado."
            : name === "accept_waitlist" && result.status === "confirmed"
              ? "Tu plaza está confirmada."
              : "Reserva actualizada.",
        );
      await load();
    } catch (e) {
      if (alive.current) setError(professionalError((e as Error).message));
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <Link href="/perfil" className="text-sm text-text-secondary">
        ← Mi perfil
      </Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Mis reservas</h1>
        <Link className={button} href="/espacios/servicios/reservar">
          Explorar negocios
        </Link>
      </div>
      <p className="mt-3 text-text-secondary">
        La misma agenda que ve el negocio, con el precio que aceptaste al
        reservar.
      </p>
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
      <ProfessionalNotices
        owner={owner}
        onOpen={async (n) => {
          const booking = await rpc<ProfessionalBooking>(
            "professional_get_booking",
            {
              p_organization_id: n.organization_id,
              p_booking_id: n.booking_id,
            },
          );
          if (!alive.current) return;
          setItems((old) => [
            {
              ...booking,
              organization_name:
                old.find((b) => b.id === booking.id)?.organization_name ??
                "Tu reserva",
            },
            ...old.filter((b) => b.id !== booking.id),
          ]);
          setNotice("Reserva abierta con su estado actual.");
        }}
      />
      {error && (
        <p role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      <div className="mt-6 space-y-4">
        {items.map((b) => (
          <article key={b.id} className="rounded-2xl border border-border p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet">
                  {b.organization_name}
                </p>
                <h2 className="mt-2 text-xl font-bold">{b.service_name}</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {new Date(b.starts_at).toLocaleString("es-ES", {
                    timeZone: b.timezone ?? "Europe/Madrid",
                  })}{" "}
                  ({b.timezone ?? "Europe/Madrid"}) · {b.party_size} persona
                  {b.party_size === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p className="rounded-full bg-bg-secondary px-3 py-1 text-xs">
                  {PROFESSIONAL_BOOKING_LABELS[b.status]}
                </p>
                <p className="mt-3 font-bold">
                  {professionalMoney(b.total_cents)}
                </p>
              </div>
            </div>
            {b.deposit_status === "pending" && (
              <p className="mt-3 text-sm text-amber-800">
                Señal pendiente. Esta reserva no acredita ningún pago.
              </p>
            )}
            {b.price_snapshot.menu && (
              <p className="mt-3 text-sm">{b.price_snapshot.menu}</p>
            )}
            <WaitlistOffer
              booking={b}
              timezone={b.timezone}
              busy={busy}
              onAction={(name, data) => void action(b, name, data)}
              onRefresh={() => void load()}
            />
            {b.reschedule && (
              <div className="mt-4 rounded-xl bg-violet/5 p-4">
                <p className="text-sm">
                  El negocio propone cambiar a{" "}
                  {new Date(b.reschedule.starts_at).toLocaleString("es-ES", {
                    timeZone: b.timezone ?? "Europe/Madrid",
                  })}
                  . Tu hora anterior se conserva hasta que aceptes.
                </p>
                <button
                  disabled={busy}
                  className={button + " mt-3"}
                  onClick={() => void action(b, "accept_reschedule")}
                >
                  Aceptar cambio
                </button>
              </div>
            )}
            {["requested", "confirmed", "waitlisted"].includes(b.status) && (
              <button
                disabled={busy}
                className="mt-4 text-sm text-text-secondary underline"
                onClick={() => {
                  if (window.confirm("¿Cancelar esta reserva?"))
                    void action(b, "cancel");
                }}
              >
                Cancelar reserva
              </button>
            )}
          </article>
        ))}
      </div>
      {!items.length && !error && (
        <div className="mt-6 rounded-2xl bg-bg-secondary p-8 text-center">
          <CalendarDays className="mx-auto text-violet" />
          <p className="mt-4">
            Tus próximas citas y actividades aparecerán aquí.
          </p>
        </div>
      )}
      <button className="mt-5 text-sm text-violet" onClick={() => void load()}>
        Actualizar reservas
      </button>
    </main>
  );
}
