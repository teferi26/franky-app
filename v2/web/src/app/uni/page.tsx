import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase-server";
import UniDashboard from "./dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de universidad",
  description: "Gestiona tu ficha y consulta las métricas de tu universidad en Franky.",
  robots: { index: false, follow: false },
};

/**
 * Callejón sin salida que había aquí: la navegación enseña "Mi universidad" a
 * todo el que tenga rol university_admin, pero el acceso real depende del
 * vínculo en university_admins. Si faltaba, la página hacía redirect("/") y el
 * gestor volvía a la home sin una sola palabra de explicación, pulsaba otra vez
 * y volvía a rebotar. Ahora se le dice qué falta y a quién escribir.
 */
function SinUniversidad({ nombre }: { nombre: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-primary p-8 shadow-card sm:p-10">
        <p className="eyebrow">Panel de universidad</p>
        <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
          Hola, {nombre}: todavía no tienes universidad asignada
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Tu cuenta es de gestor de universidad, pero aún no está vinculada a
          ningún campus, así que no hay panel que enseñarte. El equipo de Franky
          hace ese vínculo a mano tras confirmar que gestionas la ficha: escríbenos
          y lo dejamos listo.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="mailto:contacto@franky.es?subject=Vincular%20mi%20cuenta%20de%20gestor%20de%20universidad"
            className={buttonVariants({ variant: "dark" })}
          >
            <Mail className="h-4 w-4" />
            Escribir a contacto@franky.es
          </a>
          <Link href="/colaboradores" className={cn(buttonVariants({ variant: "outline" }), "group")}>
            Ver el programa de colaboración
            <ArrowRight className="h-4 w-4 arrow-nudge" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function UniPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const nombre = profile?.full_name || "Gestor/a";

  // Un estudiante que teclee /uni no debe leer "tu cuenta es de gestor de
  // universidad, pero aún no tienes universidad asignada": para él es
  // sencillamente otra sección.
  if (profile?.role !== "university_admin" && profile?.role !== "admin") {
    redirect("/");
  }

  // Verdadero control de acceso: ¿gestiona alguna universidad? Deriva del
  // vínculo university_admins, no del rol (que es solo para la navegación).
  const { data: uniId } = await supabase.rpc("my_university_id");
  if (!uniId) return <SinUniversidad nombre={nombre} />;

  const { data: university } = await supabase
    .from("universities")
    .select(
      "id, name, slug, description, logo_url, image_url, website, phone, email, address, motto, rector, partner_blurb, intro_video_url, gallery_urls, jpa_url, jpa_label, is_partner, partner_tier",
    )
    .eq("id", uniId)
    .single();

  // El vínculo existe pero la ficha no se puede leer (borrada, o la RLS no la
  // deja): mismo criterio, explicarlo en vez de rebotar en silencio.
  if (!university) return <SinUniversidad nombre={nombre} />;

  const [summary, topCareers, origin, monthly] = await Promise.all([
    supabase.rpc("uni_admin_summary"),
    supabase.rpc("uni_admin_top_careers", { p_limit: 10 }),
    supabase.rpc("uni_admin_origin"),
    supabase.rpc("uni_admin_signups_monthly", { p_months: 12 }),
  ]);

  return (
    <UniDashboard
      userName={nombre}
      university={university}
      summary={summary.data ?? null}
      topCareers={topCareers.data ?? []}
      origin={origin.data ?? []}
      monthly={monthly.data ?? []}
    />
  );
}
