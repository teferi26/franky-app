"use client";
import { parseEventPrice, eventPriceMeetsPaymentMinimum } from "@/lib/event-shirt-pricing";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar, ArrowLeft, Check, Loader2, AlertCircle, LogIn, PartyPopper, CreditCard, Info, Shirt, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { madridWallClockToUTC } from "@/lib/event-time";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion";
import { EVENT_CATEGORIES, EVENT_CATEGORY_ORDER } from "../components/event-category";
import EventPhotoUploader from "../components/event-photo-uploader";
import ConnectPayoutsNotice from "../components/connect-payouts-notice";
import {
  COMMISSION,
  feeBreakdown,
  grossFromNetCents,
  toCents,
  formatEur,
  formatPct,
  stripeProcessingLabel,
} from "@/lib/pricing";

/**
 * Con "Cobro por la app" el organizador escribe lo que QUIERE GANAR por
 * entrada (neto) y nosotros calculamos lo que pagará el asistente (bruto =
 * neto + comisión Franky). En events.price se guarda SIEMPRE el bruto, que es
 * lo que ve y paga el público.
 */
function TicketPriceBreakdown({ netEur }: { netEur: number }) {
  const netCents = toCents(netEur);
  const grossCents = grossFromNetCents(netCents, "ticket");
  const { frankyCents, stripeCents, sellerCents } = feeBreakdown(grossCents, "ticket");
  const pct = formatPct(COMMISSION.ticket);

  return (
    <div className="mt-3 space-y-1.5 rounded-2xl border border-border bg-bg-secondary/60 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-text-muted">El asistente pagará</span>
        <span className="font-heading font-extrabold tabular text-text-primary">{formatEur(grossCents / 100)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Comisión Franky ({pct})</span>
        <span className="tabular text-text-secondary">-{formatEur(frankyCents / 100)}</span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Gastos de pago con tarjeta, Stripe ({stripeProcessingLabel()})</span>
        <span className="tabular text-text-secondary">-{formatEur(stripeCents / 100)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border-light pt-2">
        <span className="text-text-muted">Tú recibes por entrada</span>
        <span className="font-semibold tabular text-emerald-700">{formatEur(sellerCents / 100)}</span>
      </div>
      <p className="pt-1 text-[11px] leading-relaxed text-text-muted">
        El evento se publicará con el precio de {formatEur(grossCents / 100)} por
        entrada: es lo que verá la gente al apuntarse.
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";

// Borrador del formulario. Activar los cobros de Stripe es una redirección
// completa fuera de Franky, así que sin esto el organizador que se va a
// activarlos perdía todo lo escrito. Se guarda SOLO al salir hacia Stripe y se
// consume al volver.
const DRAFT_KEY = "franky:evento-borrador";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type EventDraft = {
  savedAt: number;
  title: string;
  description: string;
  category: string;
  city: string;
  venue: string;
  address: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  price: string;
  paymentMode: "app" | "info";
  maxCapacity: number | "";
  showParticipantCount: boolean;
  shirtsEnabled: boolean;
  photos: string[];
};

function readDraft(): EventDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<EventDraft>;
    if (typeof draft?.savedAt !== "number" || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      return null;
    }
    return {
      savedAt: draft.savedAt,
      title: String(draft.title ?? ""),
      description: String(draft.description ?? ""),
      category: String(draft.category ?? "fiesta"),
      city: String(draft.city ?? ""),
      venue: String(draft.venue ?? ""),
      address: String(draft.address ?? ""),
      startDate: String(draft.startDate ?? ""),
      startTime: String(draft.startTime ?? "20:00"),
      endDate: String(draft.endDate ?? ""),
      endTime: String(draft.endTime ?? ""),
      price: String(draft.price ?? "0"),
      paymentMode: draft.paymentMode === "app" ? "app" : "info",
      maxCapacity:
        typeof draft.maxCapacity === "number" && Number.isFinite(draft.maxCapacity)
          ? draft.maxCapacity
          : "",
      showParticipantCount: draft.showParticipantCount !== false,
      shirtsEnabled: draft.shirtsEnabled === true,
      photos: Array.isArray(draft.photos) ? draft.photos.filter((p) => typeof p === "string") : [],
    };
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nada que limpiar si el almacenamiento no está disponible */
  }
}

// Categorías del catálogo compartido: mismo nombre y mismo icono que en el
// listado y en la ficha, sin emojis.
const CATEGORIES = EVENT_CATEGORY_ORDER.map((key) => ({
  key,
  label: EVENT_CATEGORIES[key].label,
  Icon: EVENT_CATEGORIES[key].icon,
}));

export default function CrearEventoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("fiesta");
  const [city, setCity] = useState("");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("20:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [price, setPrice] = useState("0");
  const parsedPrice = parseEventPrice(price, { allowFree: true, max: 9999 });
  const numericPrice = parsedPrice ?? 0;
  // Modo de cobro cuando hay precio (097): "info" (orientativo, pago aparte) o
  // "app" (Franky cobra vía Stripe). Por defecto "info" para no obligar a nadie
  // a activar cobros si solo quiere poner un precio de referencia.
  const [paymentMode, setPaymentMode] = useState<"app" | "info">("info");
  const [maxCapacity, setMaxCapacity] = useState<number | "">("");
  const [showParticipantCount, setShowParticipantCount] = useState(true);
  // Reparto de camisetas (164): si se activa, a cada persona que se apunte se le
  // pregunta su talla y el organizador ve el recuento en la lista de asistentes.
  const [shirtsEnabled, setShirtsEnabled] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // ¿Esta cuenta es del equipo de Franky? Su evento se publica con el sello
  // "Evento Franky" (lo decide la BD por el rol, migración 164). Se avisa aquí
  // para que quien publica sepa lo que va a salir.
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // RLS: cada uno puede leer su propio perfil.
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const role = (data as { role?: string } | null)?.role;
      setIsStaff(role === "analyst" || role === "admin");
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/eventos/crear");
    }
  }, [authLoading, user, router]);

  // Al aterrizar: si volvemos del alta de cobros de Stripe hay un borrador
  // guardado y manda él (el organizador ya había escrito el evento). Si no, se
  // rellena desde el mapa de zonas de ocio (app móvil y web): al tocar una zona
  // y elegir "Crear evento aquí" se llega con ?venue=&city=&address=.
  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      clearDraft();
      setTitle(draft.title);
      setDescription(draft.description);
      setCategory(draft.category);
      setCity(draft.city);
      setVenue(draft.venue);
      setAddress(draft.address);
      setStartDate(draft.startDate);
      setStartTime(draft.startTime);
      setEndDate(draft.endDate);
      setEndTime(draft.endTime);
      setPrice(draft.price);
      setPaymentMode(draft.paymentMode);
      setMaxCapacity(draft.maxCapacity);
      setShowParticipantCount(draft.showParticipantCount);
      setShirtsEnabled(draft.shirtsEnabled);
      setPhotos(draft.photos);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const qVenue = params.get("venue");
    const qCity = params.get("city");
    const qAddress = params.get("address");
    if (qVenue) setVenue(qVenue.slice(0, 120));
    if (qCity) setCity(qCity.slice(0, 80));
    if (qAddress) setAddress(qAddress.slice(0, 200));
  }, []);

  // Guarda lo escrito antes de salir a Stripe. Al volver (return_url a esta
  // misma página) el efecto de arriba lo restaura y lo borra.
  function saveDraft() {
    const draft: EventDraft = {
      savedAt: Date.now(),
      title, description, category, city, venue, address,
      startDate, startTime, endDate, endTime,
      price,
      paymentMode,
      maxCapacity,
      showParticipantCount,
      shirtsEnabled,
      photos,
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Modo incógnito o cuota llena: no es motivo para bloquear el alta de
      // cobros, solo se pierde el autoguardado.
    }
  }

  const canSubmit =
    title.trim().length >= 3 &&
    city.trim().length >= 2 &&
    startDate &&
    startTime &&
    category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit) return;
    if (parsedPrice === null) { setError("Indica un precio entre 0 y 9999 €, con un máximo de 2 decimales. Puedes usar coma o punto."); return; }
    setSaving(true);
    setError("");

    const startIso = madridWallClockToUTC(startDate, startTime);
    const endIso =
      endDate && endTime
        ? madridWallClockToUTC(endDate, endTime)
        : endDate
        ? madridWallClockToUTC(endDate, "23:59")
        : null;

    // Con cobro por la app, lo tecleado es el neto deseado: se publica el
    // bruto (neto + comisión) para que el organizador reciba lo que pidió.
    const typedPrice = parsedPrice;
    const publishedPrice =
      typedPrice > 0 && paymentMode === "app"
        ? grossFromNetCents(toCents(typedPrice), "ticket") / 100
        : typedPrice;
    if (!eventPriceMeetsPaymentMinimum(publishedPrice, paymentMode, user.id)) {
      setError("El precio final para pagos con tarjeta debe ser de al menos 0,50 €. También puedes crear un evento gratuito.");
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from("events")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        organizer_id: user.id,
        city: city.trim(),
        venue: venue.trim() || null,
        address: address.trim() || null,
        start_date: startIso,
        end_date: endIso,
        category,
        price: publishedPrice,
        payment_mode: typedPrice > 0 ? paymentMode : "free",
        max_capacity: maxCapacity === "" ? null : Number(maxCapacity),
        show_participant_count: showParticipantCount,
        // Solo se manda si el organizador lo activa: así publicar un evento
        // sigue funcionando igual aunque la migración 164 no esté aplicada
        // todavía en la base de datos (el valor por defecto ya es false).
        ...(shirtsEnabled ? { shirts_enabled: true } : {}),
        image_url: photos[0] ?? null,
        photos,
        status: "upcoming",
      })
      .select("id")
      .single();

    if (insErr) {
      setError(insErr.message);
      setSaving(false);
      return;
    }

    // Publicado: el borrador ya no hace falta (si quedaba alguno).
    clearDraft();

    // Auto-inscripción del organizador
    if (data?.id) {
      await supabase.from("event_participants").insert({
        event_id: data.id,
        user_id: user.id,
        status: "registered",
      });
      router.replace(`/eventos/${data.id}`);
    } else {
      router.replace("/eventos");
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <PartyPopper className="mx-auto h-7 w-7 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <h1 className="mt-4 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">
            Inicia sesión para crear eventos
          </h1>
          <p className="mt-3 text-text-muted">
            Necesitamos saber quién organiza el plan para que la gente pueda escribirte.
          </p>
          <Button asChild className="mt-6">
            <Link href="/login?next=/eventos/crear"><LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Iniciar sesión</Link>
          </Button>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 pt-8 pb-10 sm:px-6 lg:pt-10">
          <Link
            href="/eventos"
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Volver a eventos
          </Link>
          <Reveal className="mt-6">
            <p className="eyebrow text-violet">Organiza</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
              Crear evento
            </h1>
            <p className="mt-3 text-text-muted">
              Publica una fiesta, charla, torneo o cualquier plan universitario.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pt-10 pb-20 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-7">
          {error && (
            <p role="alert" className="flex items-center gap-2 text-sm font-medium text-error">
              <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}

          {isStaff && (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.75} aria-hidden="true" />
              <span>
                Se publicará como <strong>Evento Franky</strong>: llevará el sello
                del equipo en el listado y en su ficha.
              </span>
            </p>
          )}

          {/* Title */}
          <Field id="event-title" label="Título del evento" required>
            <Input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="Ej. Fiesta de bienvenida Erasmus"
            />
          </Field>

          {/* Category */}
          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              Categoría <span className="text-error" aria-hidden="true">*</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  onClick={() => setCategory(c.key)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                    category === c.key
                      ? "border-violet bg-violet-50/70 text-violet-deep"
                      : "border-border text-text-secondary hover:border-text-primary/25"
                  }`}
                >
                  <c.Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Description */}
          <Field
            id="event-description"
            label="Descripción"
            optional
            hint={`${description.length}/1500`}
          >
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1500}
              rows={5}
              placeholder="¿De qué va el evento? ¿A quién va dirigido?"
            />
          </Field>

          {/* Location */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="event-city" label="Ciudad" required>
              <Input
                id="event-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={100}
                required
                placeholder="Madrid, Valencia..."
              />
            </Field>
            <Field id="event-venue" label="Lugar" optional>
              <Input
                id="event-venue"
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                maxLength={150}
                placeholder="Sala Moby, Campus..."
              />
            </Field>
          </div>

          <Field id="event-address" label="Dirección" optional>
            <Input
              id="event-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
              placeholder="Calle, número, referencia..."
            />
          </Field>

          {/* Dates */}
          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              <Calendar className="mr-1.5 inline h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
              Inicio <span className="text-error" aria-hidden="true">*</span>
            </legend>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Input
                type="date"
                aria-label="Fecha de inicio"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
                required
              />
              <Input
                type="time"
                aria-label="Hora de inicio"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
              Fin <span className="ml-1 text-xs font-normal text-text-muted">(opcional)</span>
            </legend>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Input
                type="date"
                aria-label="Fecha de fin"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
              />
              <Input
                type="time"
                aria-label="Hora de fin"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </fieldset>

          {/* Price + capacity */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="event-price"
              label={
                numericPrice > 0 && paymentMode === "app"
                  ? "Lo que quieres ganar por entrada (€)"
                  : "Precio (€)"
              }
              hint={
                (numericPrice > 0 && paymentMode === "app"
                  ? "Neto para ti; abajo ves lo que pagará el asistente"
                  : "Deja 0 si es gratis") + " · Admite coma o punto y hasta 2 decimales."
              }
            >
              <Input
                id="event-price"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                maxLength={8}
                className="tabular"
              />
            </Field>
            <Field id="event-capacity" label="Aforo máximo" optional>
              <Input
                id="event-capacity"
                type="number"
                value={maxCapacity}
                onChange={(e) =>
                  setMaxCapacity(e.target.value === "" ? "" : Math.max(1, Number(e.target.value) || 1))
                }
                min={1}
                placeholder="Sin límite"
                className="tabular"
              />
            </Field>
          </div>

          {/* Modo de cobro: solo aparece cuando hay precio (097) */}
          {numericPrice > 0 && (
            <fieldset>
              <legend className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">¿Cómo se cobra la entrada?</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode("info")}
                  aria-pressed={paymentMode === "info"}
                  className={`rounded-xl border p-4 text-left transition-colors duration-200 ${
                    paymentMode === "info"
                      ? "border-violet bg-violet-50/70"
                      : "border-border hover:border-text-primary/25"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Info className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" /> Solo informativo
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    El precio es orientativo. La gente se apunta gratis y paga aparte
                    (en persona, Bizum…). No necesitas activar cobros.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("app")}
                  aria-pressed={paymentMode === "app"}
                  className={`rounded-xl border p-4 text-left transition-colors duration-200 ${
                    paymentMode === "app"
                      ? "border-violet bg-violet-50/70"
                      : "border-border hover:border-text-primary/25"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <CreditCard className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" /> Cobro por la app
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    Franky cobra las entradas y te transfiere el dinero (comisión del{" "}
                    {formatPct(COMMISSION.ticket)} más los gastos de pago con tarjeta de
                    Stripe, {stripeProcessingLabel()}, que se suman al precio: tú recibes
                    justo lo que pidas). Necesitas una cuenta de cobros (Stripe); puedes
                    activarla aquí mismo.
                  </span>
                </button>
              </div>
              {paymentMode === "app" && (
                <>
                  <TicketPriceBreakdown netEur={numericPrice} />
                  <ConnectPayoutsNotice
                    returnTo="/eventos/crear"
                    onBeforeLeave={saveDraft}
                  />
                </>
              )}
            </fieldset>
          )}

          {/* Privacy: show participant count */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors duration-200 hover:border-text-primary/25">
            <input
              type="checkbox"
              checked={showParticipantCount}
              onChange={(e) => setShowParticipantCount(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-violet"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">Mostrar el número de personas apuntadas</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Si lo desactivas, solo tú verás cuántas personas se han registrado.
              </p>
            </div>
          </label>

          {/* Camisetas (164): activa la encuesta de talla al apuntarse */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors duration-200 hover:border-text-primary/25">
            <input
              type="checkbox"
              checked={shirtsEnabled}
              onChange={(e) => setShirtsEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-violet"
            />
            <div className="flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Shirt className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" /> Se reparten camisetas
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                A quien se apunte le preguntaremos su talla (XS a XXL, o si no
                quiere). Tú ves el recuento por talla en la lista de asistentes,
                para saber cuántas llevar.
              </p>
            </div>
          </label>

          {/* Photos */}
          <EventPhotoUploader userId={user.id} photos={photos} onChange={setPhotos} />

          <div className="flex items-center justify-end gap-3 border-t border-border-light pt-6">
            <Button asChild variant="ghost" type="button">
              <Link href="/eventos">Cancelar</Link>
            </Button>
            <Button type="submit" size="lg" loading={saving} disabled={!canSubmit}>
              {!saving && <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              {saving ? "Publicando" : "Publicar evento"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
