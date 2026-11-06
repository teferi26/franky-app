import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";
import { Flame } from "lucide-react";
import type { Metadata } from "next";
import { createServerSupabase, createPublicSupabase } from "@/lib/supabase-server";
import { Reveal } from "@/components/motion";
import FomoUniversityPicker from "./FomoUniversityPicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FOMO: el muro de tu universidad",
  description:
    "Elige tu universidad y lee lo que se cuece hoy en su campus: fiestas, exámenes, avisos y cotilleos publicados por sus propios estudiantes.",
  alternates: { canonical: "/fomo" },
};

/**
 * Entrada genérica a FOMO (/fomo) para poder enlazarlo desde el navbar sin
 * conocer la universidad del usuario.
 *
 * - Con universidad en el perfil: redirige a su feed (/fomo/[slug]).
 * - Con sesión pero SIN universidad asignada: en lugar de mandarlo al
 *   onboarding (donde la mayoría de usuarios quedaban atrapados, ya que casi
 *   ningún perfil tiene university_id), mostramos un selector de universidad
 *   para que pueda entrar directamente al feed que quiera.
 */
export default async function FomoIndexPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Sin sesión ya NO se rebota a /login: el visitante anónimo ve el mismo
  // selector y desde ahí entra a la landing pública de la universidad que
  // elija (/fomo/[slug]). Rebotarlo al login se cargaba justo la captación
  // que trae el cartel, el QR y la búsqueda orgánica.
  if (user) {
    // Resolvemos perfil y slug de su universidad en una sola consulta (join),
    // en lugar de encadenar profiles y luego universities por separado.
    const { data: profile } = await supabase
      .from("profiles")
      .select("university_id, universities(slug)")
      .eq("id", user.id)
      .maybeSingle();

    // Si el perfil ya tiene universidad, vamos directos a su feed.
    const uniJoin = profile?.universities as { slug: string | null } | { slug: string | null }[] | null;
    const uniSlug = Array.isArray(uniJoin) ? uniJoin[0]?.slug : uniJoin?.slug;
    if (uniSlug) redirect(`/fomo/${uniSlug}`);
  }

  // Sin universidad (o sin sesión): selector. Se lista con el cliente anon
  // para que funcione igual en ambos casos.
  const { data: universities } = await createPublicSupabase()
    .from("universities")
    .select("id, name, slug, city")
    .order("name", { ascending: true });

  const list = universities ?? [];

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial: rótulo, título grande y una frase. Sin icono en
          cuadrado tintado ni degradados: la tipografía lleva el peso. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
              El muro del campus
            </p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              FOMO. Lo que se cuece hoy en tu universidad.
            </h1>
            <p className="mt-3 max-w-xl text-text-muted">
              Elige tu universidad para entrar a su muro anónimo y en directo:
              dudas de examen, fiestas, avisos y cotilleos escritos por gente de tu uni.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        {list.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="Todavía no hay universidades activas"
            description="Estamos abriendo campus poco a poco. Dinos cuál es el tuyo y lo ponemos en cola."
            action={{ href: "/contacto", label: "Proponer mi universidad" }}
          />
        ) : (
          <FomoUniversityPicker universities={list} />
        )}
      </div>
    </main>
  );
}
