import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase-server";
import { Reveal } from "@/components/motion";
import CodigosClient, { type DiscountCode } from "./codigos-client";

// ─── Códigos de descuento del evento ──────────────────────────────────────
// Solo el organizador (o un admin) gestiona los códigos de su evento: crear,
// listar y desactivar. La validación al comprar la hace la RPC
// check_discount_code (migración 136); aquí solo se administran las filas de
// event_discount_codes, cuya RLS ya limita todo al organizador. Espejo de
// mobile/app/codigos/[id].tsx.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Códigos de descuento",
  robots: { index: false, follow: false },
};

export default async function CodigosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/eventos/${id}/codigos`);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, organizer_id, price, payment_mode")
    .eq("id", id)
    .maybeSingle();
  if (!event) notFound();

  // Mismo criterio que /entradas: el organizador o un admin.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";
  if (event.organizer_id !== user.id && !isAdmin) redirect(`/eventos/${id}`);

  // Fail-soft: si la tabla no existe todavía (136 sin aplicar) la página lo
  // dice sin romperse, igual que hace la app.
  let codes: DiscountCode[] = [];
  let available = true;
  try {
    const { data, error } = await supabase
      .from("event_discount_codes")
      .select("id, event_id, code, kind, value, max_uses, used_count, expires_at, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    if (error) available = false;
    else codes = (data ?? []) as DiscountCode[];
  } catch {
    available = false;
  }

  const paymentMode: string =
    (event.payment_mode as string | null) ?? (Number(event.price) > 0 ? "app" : "free");
  const paidViaApp = Number(event.price) > 0 && paymentMode === "app";

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-3xl px-4 pt-8 pb-10 sm:px-6 lg:px-8">
          <Link
            href={`/eventos/${id}`}
            className="group inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={1.75} aria-hidden="true" />
            Volver al evento
          </Link>
          <Reveal className="mt-6">
            <p className="eyebrow text-violet">Promociones</p>
            <h1 className="mt-3 font-heading text-fluid-h2 font-extrabold tracking-tight text-text-primary">
              Códigos de descuento
            </h1>
            <p className="mt-2 truncate text-text-muted">{event.title}</p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-4 pt-8 pb-20 sm:px-6 lg:px-8">
        <CodigosClient
          eventId={id}
          initialCodes={codes}
          available={available}
          paidViaApp={paidViaApp}
        />
      </div>
    </div>
  );
}
