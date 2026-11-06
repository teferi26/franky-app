"use client";

import Link from "next/link";
import {
  AlertCircle, CheckCircle2, CreditCard, Home, Info, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OWNER_PLAN, PRICING, formatEur } from "@/lib/pricing";
import { Panel, Notice } from "./panel-ui";

/**
 * Bloque de "cómo publico un piso" del panel de propietario.
 *
 * Aquí NO se crea ninguna propiedad. El alta de pisos vive en un único sitio,
 * /negocio/registro?type=housing, que es el formulario completo (fotos y
 * vídeos, universidad cercana, m², características, preferencias de inquilino,
 * comisión de inmobiliaria) y el que además gestiona el cobro. Este bloque solo
 * decide qué se le ofrece al propietario según su plan:
 *   - plan activo o en prueba -> botón para publicar, con el cupo usado.
 *   - sin plan                -> las dos opciones reales de pago, sin atajos.
 * Mientras no se sabe el estado no se enseña ninguna de las dos cosas: enseñar
 * un botón de publicar a quien no puede publicar es exactamente el problema que
 * este bloque viene a arreglar.
 */

export interface OwnerStatus {
  authenticated: boolean;
  active: boolean;
  status: string | null;
  billing: string | null;
  listingsUsed: number;
  maxListings: number;
  periodEnd: string | null;
  /** false si este propietario ya gastó su prueba gratis (es una por cuenta). */
  trialAvailable?: boolean;
}

export const REGISTRO_HREF = "/negocio/registro?type=housing";
const PLAN_HREF = "/negocio/propietario";
const FACTURACION_HREF = "/negocio/dashboard";

const PRECIO_FICHA = PRICING.business_housing.monthly;

/**
 * A partir de cuántos pisos compensa el plan frente a pagar ficha a ficha.
 * Con los precios actuales: 9 fichas sueltas son 89,91 €/mes contra los 80 €/mes
 * del plan, así que el umbral es 9. Se calcula para que no se quede desfasado
 * si mañana cambian los precios de lib/pricing.
 */
export const PLAN_BREAK_EVEN = Math.floor(OWNER_PLAN.monthly / PRECIO_FICHA) + 1;

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES");
}

/**
 * Botón que lleva al sitio correcto según el plan. Se usa también en el estado
 * vacío de la lista para no duplicar la lógica de a dónde mandar a la gente.
 * Devuelve null mientras se carga el estado y cuando el cupo está lleno (en ese
 * caso lo explica el bloque grande, un botón suelto solo despistaría).
 */
export function PublicarCta({ status }: { status: OwnerStatus | null }) {
  if (!status) return null;

  if (status.active) {
    if (status.listingsUsed >= status.maxListings) return null;
    return (
      <Button asChild variant="dark" className="btn-shine group">
        <Link href={REGISTRO_HREF}>
          <Home className="h-4 w-4" strokeWidth={1.75} />
          Publicar un piso
          <ArrowRight className="h-4 w-4 arrow-nudge" />
        </Link>
      </Button>
    );
  }

  return (
    <Button asChild variant="dark" className="btn-shine group">
      <Link href={PLAN_HREF}>
        <CreditCard className="h-4 w-4" strokeWidth={1.75} />
        Ver los planes
        <ArrowRight className="h-4 w-4 arrow-nudge" />
      </Link>
    </Button>
  );
}

/** Nota al pie del bloque, con el icono suelto. */
function Pie({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex items-start gap-1.5 border-t border-border-light pt-4 text-xs leading-relaxed text-text-muted">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}

export default function PublicarSection({
  status,
  loadError,
}: {
  status: OwnerStatus | null;
  loadError: boolean;
}) {
  // El estado del plan no se ha podido leer: no se promete nada, se manda a
  // facturación, que es donde está la verdad.
  if (loadError) {
    return (
      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
          <div className="flex-1">
            <h3 className="font-heading text-base font-bold text-text-primary">
              No hemos podido comprobar tu plan
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Vuelve a cargar la página. Si sigue igual, consulta tu plan y tus
              facturas en el panel de facturación.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={FACTURACION_HREF}>
                <CreditCard className="h-4 w-4" strokeWidth={1.75} />
                Ir a facturación
              </Link>
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  // Cargando: un hueco neutro, sin botones que prometan lo que quizá no hay.
  if (!status) {
    return (
      <Panel className="p-5 sm:p-6" aria-busy="true">
        <div className="space-y-3">
          <Skeleton className="h-4 w-52 rounded-md" />
          <Skeleton className="h-3 w-72 max-w-full rounded-md" />
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <span className="sr-only">Comprobando tu plan…</span>
      </Panel>
    );
  }

  const enPrueba = status.status === "trialing";
  const pagoPendiente = status.status === "past_due" || status.status === "unpaid";
  const cupoLleno = status.active && status.listingsUsed >= status.maxListings;
  // La modalidad trimestral cobra los 3 primeros meses de golpe con descuento,
  // así que la primera cuota tras la prueba no son 80 € sino 192 €.
  const primeraCuota =
    status.billing === "quarterly_intro"
      ? `${formatEur(OWNER_PLAN.introQuarterTotal, { decimals: 0 })} (primer trimestre)`
      : `${formatEur(OWNER_PLAN.monthly, { decimals: 0 })}`;

  // ── Plan activo o en prueba ────────────────────────────────────────────────
  if (status.active) {
    return (
      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-base font-bold text-text-primary">
              {enPrueba
                ? (status.periodEnd ? `Estás en tu prueba gratis de ${OWNER_PLAN.trialDays} días` : "Tu plan en prueba está activo")
                : "Tu Plan Inmobiliarias está activo"}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Llevas{" "}
              <strong className="tabular text-text-primary">
                {status.listingsUsed} de {status.maxListings}
              </strong>{" "}
              pisos publicados con el plan
              {status.periodEnd && (
                <>
                  {" · "}
                  {enPrueba ? "la prueba acaba el " : "próxima renovación: "}
                  <span className="tabular">{fecha(status.periodEnd)}</span>
                  {enPrueba && ` y entonces se cobra la primera cuota de ${primeraCuota}`}
                </>
              )}
              .
            </p>

            {cupoLleno ? (
              <Notice tone="warning" className="mt-3">
                Has llenado el cupo del plan ({status.maxListings} pisos).
                Desactiva algún piso que ya no alquiles o publica una ficha
                suelta por {formatEur(PRECIO_FICHA)}/mes.
              </Notice>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {cupoLleno ? (
                <Button asChild variant="outline">
                  <Link href={REGISTRO_HREF}>
                    <Home className="h-4 w-4" strokeWidth={1.75} />
                    Publicar ficha suelta ({formatEur(PRECIO_FICHA)}/mes)
                  </Link>
                </Button>
              ) : (
                <PublicarCta status={status} />
              )}
              <Button asChild variant="outline">
                <Link href={FACTURACION_HREF}>
                  <CreditCard className="h-4 w-4" strokeWidth={1.75} />
                  Facturación
                </Link>
              </Button>
            </div>

            <Pie>
              Se abre el formulario completo de alta: fotos y vídeos,
              universidad cercana, m², fianza, estancia mínima, características
              (wifi, ascensor, lavadora...) y preferencias de inquilino. Es lo
              que luego usan los estudiantes para filtrar y comparar.
            </Pie>
          </div>
        </div>
      </Panel>
    );
  }

  // ── Suscripción con pago pendiente ─────────────────────────────────────────
  if (pagoPendiente) {
    return (
      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.75} />
          <div className="flex-1">
            <h3 className="font-heading text-base font-bold text-text-primary">
              Tu Plan Inmobiliarias tiene un pago pendiente
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Mientras el cobro no se regularice, el plan no cubre pisos nuevos.
              Actualiza el método de pago desde facturación y vuelve a intentarlo.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="dark">
                <Link href={FACTURACION_HREF}>
                  <CreditCard className="h-4 w-4" strokeWidth={1.75} />
                  Ir a facturación
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={REGISTRO_HREF}>
                  Publicar ficha suelta ({formatEur(PRECIO_FICHA)}/mes)
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  // ── Sin plan: no se ofrece crear, se ofrecen las dos opciones de pago ──────
  const costeFichasEnUmbral = PLAN_BREAK_EVEN * PRECIO_FICHA;

  return (
    <Panel className="p-5 sm:p-6">
      <Badge variant="outline">Publicar pisos requiere plan</Badge>
      <h3 className="mt-3 font-heading text-lg font-bold text-text-primary sm:text-xl">
        Para añadir propiedades tienes que coger uno de los planes
      </h3>
      <p className="mt-1.5 max-w-xl text-sm text-text-secondary">
        En Franky los pisos se dan de alta desde el formulario de publicación,
        con fotos, universidad cercana y todas las características. Ese
        formulario solo se abre con un plan activo o con la ficha pagada.
      </p>

      {/* Las dos opciones, separadas por una línea, sin tarjetas de colores. */}
      <div className="mt-5 grid gap-6 border-t border-border pt-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-border">
        {/* Opción A: plan de cuenta */}
        <div className="flex flex-col sm:pr-6">
          <div className="flex items-center gap-2">
            <p className="eyebrow">Plan Inmobiliarias</p>
            <Badge variant="default">0 € hoy</Badge>
          </div>
          <p className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">
            {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}
            <span className="ml-1 text-sm font-normal tracking-normal text-text-muted">/mes</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Hasta {OWNER_PLAN.maxListings} pisos, sin pagar por anuncio
            . Consulta las condiciones y la prueba disponible para tu cuenta.
          </p>
          <Button asChild variant="dark" size="sm" className="group mt-4 self-start">
            <Link href={PLAN_HREF}>
              Empezar gratis
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </Link>
          </Button>
        </div>

        {/* Opción B: ficha suelta */}
        <div className="flex flex-col border-t border-border pt-6 sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="eyebrow">Una ficha suelta</p>
          <p className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">
            {formatEur(PRECIO_FICHA)}
            <span className="ml-1 text-sm font-normal tracking-normal text-text-muted">/mes por piso</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            La tarifa por anuncio se renueva mensualmente. Revisa el importe final antes de contratar.
          </p>
          <Button asChild variant="outline" size="sm" className="group mt-4 self-start">
            <Link href={REGISTRO_HREF}>
              Publicar un piso
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </Link>
          </Button>
        </div>
      </div>

      <Pie>
        A partir de {PLAN_BREAK_EVEN} pisos compensa el plan:{" "}
        {PLAN_BREAK_EVEN} fichas sueltas son {formatEur(costeFichasEnUmbral)}/mes
        frente a los {formatEur(OWNER_PLAN.monthly, { decimals: 0 })}/mes del
        plan. Con menos pisos sale mejor la ficha suelta.
      </Pie>
    </Panel>
  );
}
