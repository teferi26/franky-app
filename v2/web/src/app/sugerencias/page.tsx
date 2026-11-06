import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { createServerSupabase } from "@/lib/supabase-server";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import SugerenciasClient from "./client";

// ─── Sugerir una mejora ──────────────────────────────────────────────────
// Paridad con la app móvil (mobile/app/sugerencias.tsx). Las sugerencias
// van al buzón de la plataforma (platform_messages, migración 167), cuyo
// trigger avisa por correo al equipo en cuanto entra una. No se redirige al
// login a quien no tiene sesión: se le explica por qué hace falta y se le
// da el enlace, que es menos brusco que un salto sin aviso.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sugerir una mejora",
  description:
    "Cuéntanos qué mejorarías de Franky o qué has visto que no funciona. Lo lee el equipo al momento.",
  alternates: { canonical: "/sugerencias" },
};

export default async function SugerenciasPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial (v3): migas, rótulo, título grande y una frase. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
          <Breadcrumbs
            className="mb-6"
            items={[{ name: "Inicio", href: "/" }, { name: "Ayuda", href: "/ayuda" }, { name: "Sugerencias" }]}
          />
          <Reveal>
            <p className="eyebrow">Ayuda a mejorar Franky</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Sugerir una mejora
            </h1>
            <p className="mt-3 text-text-muted">
              ¿Se te ocurre algo que mejoraría Franky? ¿Has visto algo que no
              funciona bien? Cuéntanoslo: nos ayuda muchísimo a decidir qué
              construir después.
            </p>
          </Reveal>
        </div>
      </section>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-14 pb-16">
        {user ? (
          <SugerenciasClient userId={user.id} />
        ) : (
          <Reveal className="rounded-2xl border border-border bg-bg-primary p-8 text-center shadow-card">
            <Lightbulb className="mx-auto h-7 w-7 text-violet" aria-hidden="true" />
            <h2 className="mt-4 font-heading text-xl font-extrabold text-text-primary">Inicia sesión para enviar tu sugerencia</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
              Las sugerencias se guardan con tu cuenta para poder contestarte
              si hace falta. Si no tienes cuenta, también puedes escribirnos
              desde el formulario de contacto.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login?next=/sugerencias" className={buttonVariants({ variant: "dark", size: "lg", className: "group" })}>
                Iniciar sesión <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
              </Link>
              <Link href="/contacto" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Contactar sin cuenta
              </Link>
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
