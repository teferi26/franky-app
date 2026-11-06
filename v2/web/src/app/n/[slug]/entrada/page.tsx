import type { Metadata } from "next";
import DoorCheckin from "./door-client";

export const metadata: Metadata = {
  title: "Registrar tu llegada",
  description: "Escanea el QR de la puerta y registra tu llegada a clase.",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sala?: string }>;
}) {
  const { slug } = await params;
  const { sala } = await searchParams;
  return (
    <DoorCheckin slug={slug} room={typeof sala === "string" ? sala.slice(0, 80) : undefined} />
  );
}
