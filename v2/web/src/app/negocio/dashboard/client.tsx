"use client";
import { HousingOfferConsent, HousingOfferStatus } from "../components/housing-offer";
import { HOUSING_OFFER_VERSION } from "@/lib/housing-offer";
import LeisureBillingSelector from "../components/leisure-billing-selector";
import { businessBillingLabel, type BusinessInterval } from "@/lib/business-billing";
import { safeStripeUrl } from '../../../../../shared/payment-contract';

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  Plus, ExternalLink, CreditCard, CheckCircle2, AlertCircle,
  Beer, Home, Settings, Building2, FileText, Download,
  ArrowRight, Users, CalendarDays, Clock, LayoutDashboard, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, CountUp } from "@/components/motion";
import { cn } from "@/lib/utils";

interface InvoiceSummary {
  id: string;
  number: string | null;
  created: number; // epoch seconds
  total_cents: number;
  currency: string;
  status: string | null;
  description: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

interface LeisureRow {
  id: string;
  name: string;
  city: string;
  category: string;
  image_url: string | null;
  is_paid: boolean;
}

interface HousingRow {
  id: string;
  title: string;
  city: string;
  type: string;
  price: number;
  images: string[] | null;
  is_paid: boolean;
  status: string;
}

interface SubRow {
  billing_interval?: "month" | "year";
  amount_cents?: number | null;
  cancel_at_period_end?: boolean;
  id: string;
  type: "leisure" | "housing";
  listing_id: string | null;
  status: string;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
}

interface OwnerSubRow {
  id: string;
  status: string;
  billing: string;
  max_listings: number;
  current_period_end: string | null;
}

interface Props {
  deferredHousingEnabled?: boolean;
  deferredHousingReady?: boolean;
  leisure: LeisureRow[];
  housing: HousingRow[];
  subscriptions: SubRow[];
  ownerSub: OwnerSubRow | null;
  success: boolean;
  published: boolean;
  ownerSuccess: boolean;
  /** El rol permite entrar en /propietario/** (propietario o admin). */
  canOwnerPanel: boolean;
}

// Cabecera de columna de las tablas del panel.
const thClass = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-muted";

export default function DashboardClient({
  leisure, housing, subscriptions, ownerSub, success, published, ownerSuccess,
  canOwnerPanel, deferredHousingEnabled = false, deferredHousingReady = false,
}: Props) {
  const [opening, setOpening] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);

  // Mis facturas: misma API que usa la app móvil. Best-effort, el panel no se
  // rompe si Stripe tarda o falla.
  useEffect(() => {
    fetch("/api/stripe/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setInvoices((d.invoices ?? []) as InvoiceSummary[]))
      .catch(() => setInvoices([]));
  }, []);

  const subByListing = new Map([...subscriptions].sort((a, b) => Number(["active", "trialing"].includes(a.status)) - Number(["active", "trialing"].includes(b.status))).map(s => [s.listing_id, s]));

  const openPortal = async () => {
    setOpening(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const { url } = await res.json();
      const portalUrl = safeStripeUrl(url, ['billing.stripe.com']);
      if (res.ok && portalUrl) window.location.href = portalUrl;
    } finally {
      setOpening(false);
    }
  };

  const totalActive = subscriptions.filter((s) => s.status === "active" || s.status === "trialing").length;
  const ownerActive = !!ownerSub && (ownerSub.status === "active" || ownerSub.status === "trialing");
  const ownerListings = housing.filter((h) => h.status === "active").length;
  const monthly = (subscriptions.filter(s => s.status === "active").reduce((sum, s) => sum + (s.amount_cents ?? (s.billing_interval === "year" ? 10000 : 999)) / 100 / (s.billing_interval === "year" ? 12 : 1), 0) + (ownerSub?.status === "active" ? 80 : 0)).toFixed(2);

  // Fichas de alojamiento que hoy pagan su 9,99 por anuncio: son las que el
  // Plan Inmobiliarias absorbería. Sirve para calcular el ahorro del upsell.
  const housingPerListing = subscriptions.filter(
    (s) => s.type === "housing" && s.status === "active",
  ).length;
  const housingPerListingCost = housingPerListing * 9.99;

  const metrics = [
    { label: "Fichas activas", value: totalActive, decimals: 0, suffix: "" },
    { label: "Cuota mensual", value: Number(monthly), decimals: 2, suffix: " €" },
    { label: "Locales", value: leisure.length, decimals: 0, suffix: "" },
    { label: "Pisos publicados", value: ownerListings, decimals: 0, suffix: ownerSub ? ` / ${ownerSub.max_listings}` : "" },
  ];

  return (
    <div className="bg-bg-primary">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Cabecera */}
        <Reveal variant="fade" className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Panel de negocio</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">Mi negocio</h1>
            <p className="mt-2 text-text-muted">
              Tus fichas, tu suscripción y tus facturas, en un solo sitio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="dark" className="group">
              <Link href="/negocio/registro">
                <Plus className="h-4 w-4" />
                Añadir ficha
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
            </Button>
            <Button variant="outline" onClick={openPortal} loading={opening}>
              {!opening && <Settings className="h-4 w-4" />}
              {opening ? "Abriendo…" : "Facturación"}
            </Button>
          </div>
        </Reveal>

        {/* Métricas */}
        <Reveal delay={60} className="mt-8 border-y border-border-light py-6">
          <dl className="grid grid-cols-2 gap-y-6 md:grid-cols-4">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="md:border-l md:border-border-light md:pl-6 md:first:border-l-0 md:first:pl-0"
              >
                <dt className="text-xs uppercase tracking-wider text-text-muted">{m.label}</dt>
                <dd className="mt-1.5 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">
                  <CountUp value={m.value} decimals={m.decimals} suffix={m.suffix} />
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        {deferredHousingReady && <div className="mt-8"><HousingOfferStatus /></div>}
        {/* Primeros pasos tras activar el plan. Va lo primero, antes que
            cualquier otro aviso: el propietario recién convertido llegaba aquí
            con un "¡plan activado!" y ninguna instrucción, y tenía que adivinar
            que publicar se hace en /negocio/registro y que el horario de
            visitas y los cobros viven en otro panel distinto. */}
        {ownerSuccess && (
          <Reveal delay={100} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-lg font-bold text-text-primary">¡Plan Inmobiliarias activado!</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Ya puedes publicar hasta {ownerSub?.max_listings ?? 40} pisos sin pasar
                  por la pasarela de pago. Estos son tus tres primeros pasos:
                </p>

                <ol className="mt-4 divide-y divide-border-light rounded-xl border border-border">
                  {[
                    {
                      href: "/negocio/registro?type=housing",
                      title: "Publica tu primer piso",
                      desc: "Fotos, precio y zona: es lo que ven los estudiantes.",
                    },
                    {
                      href: "/propietario/dashboard/horario",
                      title: "Define tu horario de visitas",
                      desc: "Los estudiantes reservan solos en tus huecos, sin llamadas.",
                    },
                    {
                      href: "/propietario/dashboard/pagos",
                      title: "Activa los cobros",
                      desc: "Conecta tu cuenta para cobrar la renta desde Franky.",
                    },
                  ].map((step, i) => (
                    <li key={step.href} className="animate-list-in" style={{ "--i": i } as CSSProperties}>
                      <Link
                        href={step.href}
                        className="group flex items-center gap-3 p-3 transition-colors hover:bg-bg-secondary"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border font-heading text-xs font-bold text-text-primary tabular">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-text-primary">{step.title}</span>
                          <span className="block text-xs text-text-muted">{step.desc}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-text-muted arrow-nudge" />
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Reveal>
        )}

        {success && (
          <Notice title="¡Pago confirmado!">
            Tu ficha ya está activa. Puede tardar unos segundos en aparecer públicamente.
          </Notice>
        )}

        {published && (
          <Notice title="¡Piso publicado!">
            Incluido en tu Plan Inmobiliarias, sin pago adicional. Ya está visible para los estudiantes.
          </Notice>
        )}

        {/* Plan Usuario Propietario */}
        {ownerSub ? (
          <Reveal delay={120} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" strokeWidth={1.75} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-heading text-lg font-bold text-text-primary">Plan Inmobiliarias</p>
                    <Badge variant={ownerActive ? "success" : ownerSub.status === "past_due" ? "warning" : "outline"}>
                      {ownerActive ? "Activo" : ownerSub.status === "past_due" ? "Pago pendiente" : ownerSub.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    <span className="tabular">{ownerListings}/{ownerSub.max_listings}</span> pisos publicados · 80 €/mes
                    {ownerSub.billing === "quarterly_intro" && " (trimestre inicial con -20%)"}
                    {ownerSub.status === "trialing" && ownerSub.current_period_end
                      ? ` · prueba gratis hasta el ${new Date(ownerSub.current_period_end).toLocaleDateString("es-ES")} (después se cobra ${ownerSub.billing === "quarterly_intro" ? "el trimestre" : "el primer mes"} automáticamente)`
                      : ownerSub.current_period_end
                      ? ` · renueva el ${new Date(ownerSub.current_period_end).toLocaleDateString("es-ES")}`
                      : ""}
                  </p>
                </div>
              </div>
              {ownerSub.status === "past_due" ? (
                <Button variant="dark" size="sm" onClick={openPortal} loading={opening}>
                  {!opening && <CreditCard className="h-4 w-4" />}
                  {opening ? "Abriendo…" : "Actualizar tarjeta"}
                </Button>
              ) : (
                <Button asChild variant="dark" size="sm">
                  <Link href="/negocio/registro?type=housing">
                    <Plus className="h-4 w-4" />
                    Subir piso
                  </Link>
                </Button>
              )}
            </div>
          </Reveal>
        ) : (
          <Reveal delay={120} className="mt-8 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" strokeWidth={1.75} />
                <p className="text-sm text-text-secondary">
                  {housingPerListing >= 9 ? (
                    <>
                      <strong className="text-text-primary">Ahorras con el Plan Inmobiliarias.</strong>{" "}
                      Hoy pagas <span className="tabular">{housingPerListingCost.toFixed(2)} €/mes</span> por tus {housingPerListing} pisos;
                      con el plan pagarías 80 €/mes por hasta 40 pisos.
                    </>
                  ) : (
                    <>
                      <strong className="text-text-primary">¿Eres inmobiliaria?</strong> Con el Plan
                      Inmobiliarias publicas hasta 40 pisos por 80 €/mes, sin pagar por anuncio y
                      {deferredHousingEnabled ? "gratis hasta el primer mensaje o solicitud de visita." : "con la prueba de 7 días disponible una vez por cuenta."}
                    </>
                  )}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="group">
                <Link href="/negocio/propietario">
                  Probar gratis
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </Button>
            </div>
          </Reveal>
        )}

        {/* Puente al panel operativo. Este panel es el comercial (fichas,
            suscripciones, facturas); el día a día del alquiler (quién mira tus
            pisos, quién pide visita, contratos, cobros) vive en
            /propietario/dashboard, que hasta ahora solo se enlazaba desde el
            onboarding y por eso no lo encontraba nadie. */}
        {canOwnerPanel && housing.length > 0 && (
          <Reveal delay={140} className="mt-6 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <LayoutDashboard className="mt-0.5 h-5 w-5 shrink-0 text-text-primary" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="font-heading text-lg font-bold text-text-primary">Tu panel de propietario</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Aquí gestionas el cobro de las fichas. El día a día del alquiler
                    está en el otro panel: quién está viendo tus pisos, quién ha
                    pedido información, las visitas reservadas, los contratos y los
                    cobros de la renta.
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-muted">
                    <li className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> Interesados
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" /> Visitas
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> Horario
                    </li>
                    <li className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> Contratos
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5" /> Cobros
                    </li>
                  </ul>
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="group">
                <Link href="/propietario/dashboard">
                  Ir al panel
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </Button>
            </div>
          </Reveal>
        )}

        {/* Zonas de ocio */}
        <section className="mt-12">
          <Reveal className="flex items-center gap-2.5">
            <Beer className="h-5 w-5 text-text-primary" strokeWidth={1.75} />
            <h2 className="font-heading text-xl font-bold text-text-primary">Zonas de ocio</h2>
            <Badge variant="outline" className="tabular">{leisure.length}</Badge>
          </Reveal>

          {leisure.length === 0 ? (
            <Reveal className="mt-4 rounded-2xl border border-dashed border-border">
              <EmptyState
                compact
                icon={Beer}
                title="Aún no has registrado ningún local"
                description="Bares, restaurantes, cafeterías o coworkings: aparecen en la sección de ocio de su ciudad."
                action={{ href: "/negocio/registro?type=leisure", label: "Registrar mi primer local" }}
              />
            </Reveal>
          ) : (
            <Reveal className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-primary">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thClass}>Local</th>
                    <th className={thClass}>Ciudad</th>
                    <th className={thClass}>Estado</th>
                    <th className={cn(thClass, "text-right")}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {leisure.map((spot, i) => (
                    <ListingRow
                      deferredHousingEnabled={deferredHousingEnabled}
                      key={spot.id}
                      index={i}
                      listingId={spot.id}
                      businessType="leisure"
                      href={`/ocio/${spot.id}`}
                      title={spot.name}
                      meta={spot.category}
                      city={spot.city}
                      image={spot.image_url}
                      isPaid={spot.is_paid}
                      sub={subByListing.get(spot.id)}
                    />
                  ))}
                </tbody>
              </table>
            </Reveal>
          )}
        </section>

        {/* Pisos */}
        <section className="mt-12">
          <Reveal className="flex items-center gap-2.5">
            <Home className="h-5 w-5 text-text-primary" strokeWidth={1.75} />
            <h2 className="font-heading text-xl font-bold text-text-primary">Alojamientos</h2>
            <Badge variant="outline" className="tabular">{housing.length}</Badge>
          </Reveal>

          {housing.length === 0 ? (
            <Reveal className="mt-4 rounded-2xl border border-dashed border-border">
              <EmptyState
                compact
                icon={Home}
                title="Aún no has registrado ningún piso"
                description="Pisos, habitaciones, estudios o residencias: con galería, precio y ubicación."
                action={{ href: "/negocio/registro?type=housing", label: "Registrar mi primer piso" }}
              />
            </Reveal>
          ) : (
            <Reveal className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-primary">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thClass}>Piso</th>
                    <th className={thClass}>Ciudad</th>
                    <th className={cn(thClass, "text-right")}>Precio</th>
                    <th className={thClass}>Estado</th>
                    <th className={cn(thClass, "text-right")}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {housing.map((h, i) => (
                    <ListingRow
                      deferredHousingEnabled={deferredHousingEnabled}
                      key={h.id}
                      index={i}
                      listingId={h.id}
                      businessType="housing"
                      href={`/alojamiento/${h.id}`}
                      title={h.title}
                      meta={h.type}
                      city={h.city}
                      price={Number(h.price)}
                      image={h.images?.[0] ?? null}
                      isPaid={h.is_paid}
                      sub={subByListing.get(h.id)}
                      coveredByPlan={ownerActive}
                    />
                  ))}
                </tbody>
              </table>
            </Reveal>
          )}
        </section>

        {/* Mis facturas */}
        <section className="mt-12">
          <Reveal className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-text-primary" strokeWidth={1.75} />
            <h2 className="font-heading text-xl font-bold text-text-primary">Mis facturas</h2>
          </Reveal>
          {invoices === null ? (
            <div className="mt-4 space-y-2" role="status" aria-live="polite" aria-busy="true">
              <span className="sr-only">Cargando facturas</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <Reveal className="mt-4 rounded-2xl border border-dashed border-border">
              <EmptyState
                compact
                icon={FileText}
                title="Todavía no hay facturas"
                description="Aparecerán aquí con cada cobro de tu suscripción."
              />
            </Reveal>
          ) : (
            <Reveal className="mt-4 overflow-x-auto rounded-2xl border border-border bg-bg-primary">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thClass}>Factura</th>
                    <th className={thClass}>Fecha</th>
                    <th className={cn(thClass, "text-right")}>Importe</th>
                    <th className={thClass}>Estado</th>
                    <th className={cn(thClass, "text-right")}>Descargar</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice(0, 12).map((inv, i) => (
                    <tr
                      key={inv.id}
                      className="animate-list-in border-b border-border-light transition-colors last:border-b-0 hover:bg-bg-secondary"
                      style={{ "--i": i } as CSSProperties}
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        <span className="block max-w-[220px] truncate">{inv.number || inv.description || "Factura"}</span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary tabular">
                        {new Date(inv.created * 1000).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-text-primary tabular">
                        {(inv.total_cents / 100).toLocaleString("es-ES", {
                          style: "currency",
                          currency: (inv.currency || "eur").toUpperCase(),
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {inv.status === "open" ? (
                          <Badge variant="warning">Pendiente</Badge>
                        ) : inv.status === "paid" ? (
                          <Badge variant="success">Pagada</Badge>
                        ) : inv.status ? (
                          <Badge variant="outline">{inv.status}</Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-4">
                          {inv.hosted_invoice_url && (
                            <a
                              href={inv.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link-underline inline-flex items-center gap-1 text-xs font-semibold text-text-primary"
                            >
                              Ver
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {inv.invoice_pdf && (
                            <a
                              href={inv.invoice_pdf}
                              className="link-underline inline-flex items-center gap-1 text-xs font-semibold text-text-primary"
                            >
                              PDF
                              <Download className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          )}
          <p className="mt-3 text-xs text-text-muted">
            ¿Necesitas cambiar la tarjeta o los datos de facturación? Usa el botón
            «Facturación» de arriba (portal seguro de Stripe).
          </p>
        </section>
      </div>
    </div>
  );
}

/** Aviso de confirmación: borde hairline, icono suelto, sin fondo de color. */
function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Reveal variant="fade" className="mt-6 flex items-start gap-3 rounded-2xl border border-border bg-bg-primary px-5 py-4">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
      <div className="text-sm">
        <p className="font-semibold text-text-primary">{title}</p>
        <p className="mt-0.5 text-text-secondary">{children}</p>
      </div>
    </Reveal>
  );
}

interface ListingRowProps {
  deferredHousingEnabled?: boolean;
  index: number;
  listingId: string;
  businessType: "leisure" | "housing";
  href: string;
  title: string;
  meta: string;
  city: string;
  price?: number;
  image: string | null;
  isPaid: boolean;
  sub?: SubRow;
  coveredByPlan?: boolean;
}

function ListingRow({
  index, listingId, businessType, href, title, meta, city, price, image, isPaid, sub, coveredByPlan, deferredHousingEnabled = false,
}: ListingRowProps) {
  const status = sub?.status;
  const [paying, setPaying] = useState(false);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BusinessInterval>("month");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const completePayment = async () => {
    if (deferredHousingEnabled && businessType === "housing" && !offerAccepted) return;
    setPaying(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "business", businessType, listingId, interval: businessType === "leisure" ? billingInterval : "month", ...(deferredHousingEnabled && businessType === "housing" ? { offerVersion: HOUSING_OFFER_VERSION } : {}) }),
      });
      const { url, error } = await res.json();
      const checkoutUrl = safeStripeUrl(url);
      if (res.ok && checkoutUrl) window.location.href = checkoutUrl;
      else { setPaymentError(error || "No se pudo abrir el pago."); setPaying(false); }
    } catch {
      setPaying(false);
    }
  };

  // El botón de pago por anuncio solo aplica a fichas sin cubrir: si el piso
  // va incluido en el Plan Inmobiliarias, no se cobra 9,99 aparte.
  const showCompletePayment = !isPaid && !coveredByPlan;

  return (
    <tr
      className="animate-list-in border-b border-border-light transition-colors last:border-b-0 hover:bg-bg-secondary"
      style={{ "--i": index } as CSSProperties}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border-light bg-bg-secondary">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MapPin className="h-4 w-4 text-text-muted/60" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-heading font-bold text-text-primary">{title}</p>
            <p className="truncate text-xs capitalize text-text-muted">{meta.replace(/_/g, " ")}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-text-secondary">{city}</td>
      {price !== undefined && (
        <td className="px-4 py-3 text-right font-semibold text-text-primary tabular">
          {price.toLocaleString("es-ES")} €<span className="text-xs font-normal text-text-muted">/mes</span>
        </td>
      )}
      <td className="px-4 py-3">
        {isPaid ? (
          status === "trialing" ? (
            <Badge variant="outline">En prueba</Badge>
          ) : (
            <Badge variant="success">Activa</Badge>
          )
        ) : coveredByPlan ? (
          <Badge variant="success">Incluida en el plan</Badge>
        ) : (
          <Badge variant="warning">
            <AlertCircle className="h-3 w-3" />
            Pago pendiente
          </Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          <Link
            href={href}
            className="link-underline inline-flex items-center gap-1 text-xs font-semibold text-text-primary"
          >
            Ver ficha
            <ExternalLink className="h-3 w-3" />
          </Link>
          {sub && (
            <p className="text-xs text-text-muted">
              Tarifa base: {businessBillingLabel(sub)}
              {/* Cuando caduca o cuando se renueva: es lo primero que mira quien
                  entra al panel, asi que va junto a la tarifa, no escondido. */}
              {sub.current_period_end && (
                <> · {sub.cancel_at_period_end ? "Activa hasta" : "Renueva el"}{" "}
                  {new Date(sub.current_period_end).toLocaleDateString("es-ES")}
                </>
              )}
            </p>
          )}
          {showCompletePayment && businessType === "leisure" && <LeisureBillingSelector value={billingInterval} onChange={setBillingInterval} disabled={paying} />}
          {paymentError && <p role="alert">{paymentError}</p>}
          {showCompletePayment && deferredHousingEnabled && businessType === "housing" && <HousingOfferConsent billing="listing" accepted={offerAccepted} onChange={setOfferAccepted} />}
          {showCompletePayment && (
            <Button variant="dark" size="sm" onClick={completePayment} loading={paying} disabled={deferredHousingEnabled && businessType === "housing" && !offerAccepted}>
              {!paying && <CreditCard className="h-4 w-4" />}
              {paying ? "Abriendo…" : deferredHousingEnabled && businessType === "housing" ? "Guardar tarjeta y publicar gratis" : "Completar pago"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
