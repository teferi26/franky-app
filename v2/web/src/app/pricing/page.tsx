import type { Metadata } from "next";
import PricingClient from "./client";

export const metadata: Metadata = {
  title: "Planes y Precios",
  description: "Elige tu plan de Franky. Accede a funciones premium: roomie match, alertas de becas, asesoramiento personalizado y más.",
};

export default function PricingPage() {
  return <PricingClient />;
}
