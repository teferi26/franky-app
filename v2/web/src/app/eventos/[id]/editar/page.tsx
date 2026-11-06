"use client";
import { parseEventPrice, eventPriceMeetsPaymentMinimum } from "@/lib/event-shirt-pricing";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, ArrowLeft, Check, Loader2, AlertCircle, LogIn, PartyPopper, Trash2, CreditCard, Info, Shirt, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { madridWallClockToUTC, utcToMadridWallClock } from "@/lib/event-time";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion";
import { EVENT_CATEGORIES, EVENT_CATEGORY_ORDER } from "../../components/event-category";
import { useConfirm } from "@/components/ui/confirm-dialog";
import EventPhotoUploader from "../../components/event-photo-uploader";
import ConnectPayoutsNotice from "../../components/connect-payouts-notice";
import {
  COMMISSION,
  feeBreakdown,
  grossFromNetCents,
  netFromGrossCents,
  toCents,
  formatEur,
  formatPct,
  stripeProcessingLabel,
} from "@/lib/pricing";

/** Mismo desglose que en crear evento: neto deseado -> precio al asistente. */
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

// Categorías del catálogo compartido: mismo nombre y mismo icono que en el
// listado y en la ficha, sin emojis.
const CATEGORIES = EVENT_CATEGORY_ORDER.map((key) => ({
  key,
  label: EVENT_CATEGORIES[key].label,
  Icon: EVENT_CATEGORIES[key].icon,
}));

export default function EditarEventoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const confirmDialog = useConfirm();

  const [loadingEvent, setLoadingEvent] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

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
  const [paymentMode, setPaymentMode] = useState<"app" | "info">("info");
  const [maxCapacity, setMaxCapacity] = useState<number | "">("");
  const [showParticipantCount, setShowParticipantCount] = useState(true);
  const [shirtsEnabled, setShirtsEnabled] = useState(false);
  const [dualPrices, setDualPrices] = useState(false);
  const [withoutShirt, setWithoutShirt] = useState("");
  const [withShirt, setWithShirt] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const [crushLiveEnabled, setCrushLiveEnabled] = useState(false);
  // Cómo estaba el reparto de camisetas al cargar: solo se manda la columna si
  // está activada ahora o lo estaba antes (para poder desactivarla). Si el
  // evento nunca la tuvo, no viaja, y guardar sigue funcionando aunque la
  // migración 164 no esté aplicada todavía.
  const [shirtsWereEnabled, setShirtsWereEnabled] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  // Entradas ya pagadas (valid) o usadas en la puerta (used). Borrar el evento
  // dispara el ON DELETE CASCADE de event_tickets: se llevaría por delante
  // entradas por las que alguien pagó de verdad, sin reembolso posible. Con
  // una sola de estas, el borrado se bloquea.
  const [paidTickets, setPaidTickets] = useState(0);

  // Load event + verify ownership
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=/eventos/${eventId}/editar`);
      return;
    }

    (async () => {
      setLoadingEvent(true);
      const supabase = createClient();
      const { data: ev, error: e } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();

      if (e || !ev) {
        setNotFound(true);
        setLoadingEvent(false);
        return;
      }
      if (ev.organizer_id !== user.id) {
        setUnauthorized(true);
        setLoadingEvent(false);
        return;
      }

      setTitle(ev.title ?? "");
      setDescription(ev.description ?? "");
      setCategory(ev.category ?? "fiesta");
      setCity(ev.city ?? "");
      setVenue(ev.venue ?? "");
      setAddress(ev.address ?? "");
      if (ev.start_date) {
        const sd = utcToMadridWallClock(ev.start_date);
        setStartDate(sd.date);
        setStartTime(sd.time);
      }
      if (ev.end_date) {
        const ed = utcToMadridWallClock(ev.end_date);
        setEndDate(ed.date);
        setEndTime(ed.time);
      }
      // events.price guarda el BRUTO (lo que paga el asistente). Con cobro por
      // la app, el campo del formulario muestra el NETO del organizador para
      // que edite sobre lo que quiere ganar (simétrico a crear evento).
      const storedGross = Number(ev.price) || 0;
      const isApp = ev.payment_mode === "app";
      setPrice(String(
        isApp && storedGross > 0
          ? netFromGrossCents(toCents(storedGross), "ticket") / 100
          : storedGross
      ));
      // Conserva el modo de cobro existente (097); si no lo tuviera, "info".
      setPaymentMode(isApp ? "app" : "info");
      setMaxCapacity(ev.max_capacity ?? "");
      setShowParticipantCount(ev.show_participant_count !== false);
      setShirtsEnabled(ev.shirts_enabled === true);
      setDualPrices(ev.price_without_shirt != null && ev.price_with_shirt != null);
      setWithoutShirt(String(ev.price_without_shirt ?? ev.price ?? ""));
      setWithShirt(String(ev.price_with_shirt ?? ""));
      setShirtsWereEnabled(ev.shirts_enabled === true);
      setIsOfficial(ev.is_official === true);
      setCrushLiveEnabled(ev.crush_live_enabled === true);
      // Use the photos[] column when present; fall back to legacy image_url so
      // events created before the migration still show their existing image.
      const initialPhotos: string[] = Array.isArray(ev.photos) && ev.photos.length > 0
        ? ev.photos
        : ev.image_url ? [ev.image_url] : [];
      setPhotos(initialPhotos);

      // ¿Hay entradas pagadas? RLS deja al organizador ver las de su evento
      // (política event_tickets_select_organizer, migración 095).
      const { count } = await supabase
        .from("event_tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .in("status", ["valid", "used"]);
      setPaidTickets(count ?? 0);

      setLoadingEvent(false);
    })();
  }, [authLoading, user, eventId, router]);

  const canSubmit =
    title.trim().length >= 3 &&
    city.trim().length >= 2 &&
    startDate &&
    startTime &&
    category;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit) return;
    const useDual = shirtsEnabled && paymentMode === "info" && dualPrices;
    const without = parseEventPrice(withoutShirt), withValue = parseEventPrice(withShirt);
    if (useDual && (without === null || withValue === null || withValue < without)) { setError("Indica ambos precios, mayores que cero. Con camiseta no puede costar menos que sin camiseta."); return; }
    const typedPrice = useDual ? without! : parsedPrice;
    if (typedPrice === null) { setError("Indica un precio entre 0 y 9999 €, con un máximo de 2 decimales. Puedes usar coma o punto."); return; }
    setSaving(true);
    setError("");

    const startIso = madridWallClockToUTC(startDate, startTime);
    const endIso =
      endDate && endTime
        ? madridWallClockToUTC(endDate, endTime)
        : endDate
        ? madridWallClockToUTC(endDate, "23:59")
        : null;

    // Con cobro por la app, lo tecleado es el neto deseado: se guarda el bruto.
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
    const { error: upErr } = await supabase
      .from("events")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        city: city.trim(),
        venue: venue.trim() || null,
        address: address.trim() || null,
        start_date: startIso,
        end_date: endIso,
        category,
        price: publishedPrice,
        price_without_shirt: useDual ? without : null,
        price_with_shirt: useDual ? withValue : null,
        payment_mode: typedPrice > 0 ? paymentMode : "free",
        max_capacity: maxCapacity === "" ? null : Number(maxCapacity),
        show_participant_count: showParticipantCount,
        ...(shirtsEnabled || shirtsWereEnabled ? { shirts_enabled: shirtsEnabled } : {}),
        ...(isOfficial ? { crush_live_enabled: crushLiveEnabled } : {}),
        image_url: photos[0] ?? null,
        photos,
      })
      .eq("id", eventId);

    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }

    router.replace(`/eventos/${eventId}`);
  }

  // Mensaje único para el bloqueo, en el aviso y en el error.
  function bloqueoBorrado(n: number) {
    return n === 1
      ? "No puedes eliminar este evento: hay 1 entrada pagada. Si lo borras, esa entrada desaparece y su comprador se queda sin nada y sin reembolso. Cancela el evento y devuelve el dinero desde tu panel de Stripe antes de eliminarlo."
      : `No puedes eliminar este evento: hay ${n} entradas pagadas. Si lo borras, esas entradas desaparecen y sus compradores se quedan sin nada y sin reembolso. Cancela el evento y devuelve el dinero desde tu panel de Stripe antes de eliminarlo.`;
  }

  async function handleDelete() {
    setError("");
    const supabaseCheck = createClient();
    // Recuento fresco: entre la carga y este clic alguien ha podido comprar.
    const { count, error: countErr } = await supabaseCheck
      .from("event_tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["valid", "used"]);
    if (countErr) {
      setError("No se pudo comprobar si hay entradas vendidas. Inténtalo de nuevo.");
      return;
    }
    const vendidas = count ?? 0;
    setPaidTickets(vendidas);
    if (vendidas > 0) {
      setError(bloqueoBorrado(vendidas));
      return;
    }

    const ok = await confirmDialog({
      title: "¿Eliminar este evento?",
      description: "Esta acción no se puede deshacer. Los asistentes perderán acceso.",
      confirmText: "Eliminar evento",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    setError("");
    const supabase = createClient();
    const { error: delErr } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId);
    if (delErr) {
      setError(delErr.message);
      setDeleting(false);
      return;
    }
    router.replace("/eventos");
  }

  if (authLoading || loadingEvent) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <PartyPopper className="mx-auto h-7 w-7 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <h1 className="mt-4 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">
            Inicia sesión para editar eventos
          </h1>
          <Button asChild className="mt-6">
            <Link href={`/login?next=/eventos/${eventId}/editar`}><LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Iniciar sesión</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 text-center">
        <div>
          <AlertCircle className="mx-auto h-6 w-6 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-3 font-heading font-semibold text-text-primary">Evento no encontrado</p>
          <Link href="/eventos" className="link-underline mt-4 inline-flex items-center gap-1.5 font-semibold text-text-primary">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Volver
          </Link>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 text-center">
        <div>
          <AlertCircle className="mx-auto h-6 w-6 text-text-muted" strokeWidth={1.5} aria-hidden="true" />
          <p className="mt-3 font-heading font-semibold text-text-primary">Solo el organizador puede editar este evento.</p>
          <Link href={`/eventos/${eventId}`} className="link-underline mt-4 inline-flex items-center gap-1.5 font-semibold text-text-primary">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Volver al evento
          </Link>
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
            href={`/eventos/${eventId}`}
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Volver al evento
          </Link>
          <Reveal className="mt-6">
            <p className="eyebrow text-violet">Tu evento</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold tracking-tight text-text-primary">
              Editar evento
            </h1>
            <p className="mt-3 text-text-muted">Actualiza la información de tu evento.</p>
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

          {/* Title */}
          <Field id="event-title" label="Título del evento" required>
            <Input
              id="event-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
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
          <Field id="event-description" label="Descripción" optional hint={`${description.length}/1500`}>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1500}
              rows={5}
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
              />
            </Field>
            <Field id="event-venue" label="Lugar" optional>
              <Input
                id="event-venue"
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                maxLength={150}
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
                    Franky cobra las entradas y te transfiere el dinero. Necesitas una
                    cuenta de cobros (Stripe); puedes activarla aquí mismo.
                  </span>
                </button>
              </div>
              {paymentMode === "app" && <TicketPriceBreakdown netEur={numericPrice} />}
              {paymentMode === "app" && (
                <ConnectPayoutsNotice
                  returnTo={`/eventos/${eventId}/editar`}
                  leaveHint="Guarda los cambios antes de ir a Stripe: al volver, el formulario se recarga con lo último guardado."
                />
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
                A quien se apunte le preguntaremos su talla. El recuento por talla
                lo ves en la lista de asistentes. Si lo desactivas, se dejan de
                pedir tallas (las ya respondidas se conservan).
              </p>
            </div>
          </label>

          {shirtsEnabled && paymentMode === "info" && (
            <fieldset className="space-y-4 rounded-2xl border border-border bg-bg-secondary/60 p-4">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-text-primary">
                <input
                  type="checkbox"
                  checked={dualPrices}
                  onChange={(e) => setDualPrices(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-border accent-violet"
                />
                Dos precios: con y sin camiseta
              </label>
              <p className="text-xs leading-relaxed text-text-muted">
                Pago al organizador. Son los precios finales que verá cada asistente.
              </p>
              {dualPrices && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="shirt-price-without" label="Sin camiseta (€)">
                    <Input
                      id="shirt-price-without"
                      inputMode="decimal"
                      value={withoutShirt}
                      onChange={(e) => setWithoutShirt(e.target.value)}
                      className="tabular"
                    />
                  </Field>
                  <Field id="shirt-price-with" label="Con camiseta (€)">
                    <Input
                      id="shirt-price-with"
                      inputMode="decimal"
                      value={withShirt}
                      onChange={(e) => setWithShirt(e.target.value)}
                      className="tabular"
                    />
                  </Field>
                </div>
              )}
            </fieldset>
          )}

          {isOfficial && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors duration-200 hover:border-text-primary/25">
              <input
                type="checkbox"
                checked={crushLiveEnabled}
                onChange={(e) => setCrushLiveEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-fuchsia"
              />
              <div className="flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Heart className="h-4 w-4 text-fuchsia" strokeWidth={1.75} aria-hidden="true" />
                  Activar Crush Live
                </p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">
                  Las personas apuntadas podrán descubrir candidatos afines y dar
                  likes privados durante este evento. Solo sabrán quién les gusta
                  cuando el like sea mutuo.
                </p>
              </div>
            </label>
          )}

          {/* Photos */}
          <EventPhotoUploader userId={user.id} photos={photos} onChange={setPhotos} />

          {paidTickets > 0 && (
            <p className="flex items-start gap-2 text-xs leading-relaxed text-text-secondary">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden="true" />
              <span>{bloqueoBorrado(paidTickets)}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-light pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              loading={deleting}
              disabled={saving || paidTickets > 0}
              title={paidTickets > 0 ? bloqueoBorrado(paidTickets) : undefined}
              className="text-text-muted hover:text-error"
            >
              {!deleting && <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              {deleting ? "Eliminando" : "Eliminar evento"}
            </Button>

            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" type="button">
                <Link href={`/eventos/${eventId}`}>Cancelar</Link>
              </Button>
              <Button type="submit" size="lg" loading={saving} disabled={!canSubmit || deleting}>
                {!saving && <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                {saving ? "Guardando" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
