import type { Metadata } from "next";
import { housingFirstInterestEnabled, housingDeferredBillingReady } from "@/lib/housing-billing-release";
import PropietarioPlanClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plan Inmobiliarias",
  description:
    "Publica hasta 40 pisos por 80 €/mes en Franky. Consulta las condiciones y la prueba disponible para tu cuenta. 20% de descuento pagando el primer trimestre de golpe.",
  alternates: { canonical: "/negocio/propietario" },
};

export default async function PropietarioPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const params = await searchParams;
  return <PropietarioPlanClient deferredHousingEnabled={housingFirstInterestEnabled()} deferredHousingReady={housingDeferredBillingReady()} canceled={params.canceled === "true"} />;
}
