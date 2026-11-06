import type { Metadata } from "next";
import { housingFirstInterestEnabled } from "@/lib/housing-billing-release";
import RegistroClient from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registrar negocio",
  description: "Registra tu zona de ocio o piso de alquiler en Franky por 9,99 €/mes.",
};

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; canceled?: string }>;
}) {
  const params = await searchParams;
  const initialType = params.type === "housing" ? "housing" : params.type === "leisure" ? "leisure" : null;
  return <RegistroClient deferredHousingEnabled={housingFirstInterestEnabled()} initialType={initialType} canceled={params.canceled === "true"} />;
}
