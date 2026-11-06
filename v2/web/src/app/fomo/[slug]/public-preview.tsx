import Link from "next/link";
import { Flame, MessageCircle, Heart, Lock, ArrowRight, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion";
import PartyCampusBanner from '@/components/social/PartyCampusBanner';

export type PreviewThread = {
  body: string;
  is_truncated: boolean;
  reply_count: number;
  reaction_count: number;
  created_on: string | null;
};

export type PreviewStats = { threads_30d: number; replies_30d: number };

/**
 * Landing PÚBLICA del muro FOMO de una universidad.
 *
 * Es la pieza de captación orgánica: un visitante que busca "qué se cuece en
 * la UA" aterriza aquí, ve hilos reales (recortados y anonimizados por
 * `get_fomo_public_preview`) y el único camino para seguir leyendo es crear
 * cuenta. Antes esta URL rebotaba a /login y estaba prohibida en robots.txt,
 * así que ese visitante nunca existía.
 *
 * Todo lo sensible se queda fuera por diseño: no hay autor, ni media, ni id de
 * hilo, ni hora exacta. Ver la migración 144 para las garantías completas.
 *
 * Presentación (v3 Editorial): cabecera tipográfica en blanco, cifras en
 * línea, muestra de hilos como tarjetas sobrias y UNA sección oscura para el
 * muro de registro.
 */
export default function FomoPublicPreview({
  universityName,
  universityCity,
  universitySlug,
  universityId,
  threads,
  stats,
}: {
  universityName: string;
  universityCity: string | null;
  universitySlug: string;
  universityId?: string;
  threads: PreviewThread[];
  stats: PreviewStats | null;
}) {
  const hasThreads = threads.length > 0;
  const registerHref = `/registro?next=${encodeURIComponent(`/fomo/${universitySlug}`)}`;
  const loginHref = `/login?next=${encodeURIComponent(`/fomo/${universitySlug}`)}`;
  const hasStats = !!stats && (stats.threads_30d > 0 || stats.replies_30d > 0);

  const related = [
    { href: `/universidades/${universitySlug}`, label: "Ficha y grados" },
    { href: "/notas-corte", label: "Notas de corte" },
    { href: "/becas", label: "Becas" },
    { href: "/alojamiento", label: "Alojamiento" },
  ];

  return (
    <main className="min-h-screen bg-bg-primary">
      {/* Cabecera editorial: rótulo, título grande con el nombre de la
          universidad y una frase. Sin fondo oscuro ni focos difuminados. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-3xl">
            <p className="eyebrow flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-violet" aria-hidden="true" />
              FOMO
              {universityCity ? <span className="text-text-muted">· {universityCity}</span> : null}
            </p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Lo que se cuece hoy en <span className="text-violet">{universityName}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-text-secondary">
              El muro de {universityName}
              {universityCity ? ` (${universityCity})` : ""}: fiestas, exámenes,
              avisos y cotilleos que no salen en ningún tablón oficial. Escrito por
              gente de la propia universidad.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={registerHref} className={buttonVariants({ variant: "dark", size: "lg", className: "group" })}>
                Entrar al muro de {universityName.split(" ").slice(-1)[0]}
                <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
              </Link>
              <Link href={loginHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Ya tengo cuenta
              </Link>
            </div>
          </Reveal>

          {hasStats && stats && (
            <Reveal delay={120} className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-border-light pt-6">
              <div>
                <p className="font-heading text-3xl font-extrabold tabular text-text-primary">
                  {stats.threads_30d.toLocaleString("es-ES")}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">hilos en 30 días</p>
              </div>
              <div>
                <p className="font-heading text-3xl font-extrabold tabular text-text-primary">
                  {stats.replies_30d.toLocaleString("es-ES")}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">respuestas en 30 días</p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* Vista previa */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-3xl">
          <PartyCampusBanner universityId={universityId} />
          <Reveal>
            <p className="eyebrow">{hasThreads ? "Una muestra" : "Muro vacío"}</p>
            <h2 className="mt-2 text-fluid-h2 font-extrabold text-text-primary">
              {hasThreads ? "Últimos hilos" : "Sé el primero en escribir"}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-text-muted">
              {hasThreads
                ? "Una muestra recortada. Los hilos completos, quién los escribe, las respuestas y las encuestas están dentro."
                : `Todavía no hay hilos públicos en ${universityName}. El primero que escriba marca el tono del muro.`}
            </p>
          </Reveal>

          {hasThreads && (
            <div className="relative mt-8">
              <Reveal stagger as="ul" className="space-y-3">
                {threads.map((t, i) => (
                  <RevealItem key={i} index={i} asChild>
                  <li className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
                    <p className="text-[15px] leading-relaxed text-text-primary">
                      {t.body}
                      {t.is_truncated && <span className="text-text-muted">…</span>}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-text-muted tabular">
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.reply_count}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                        {t.reaction_count}
                      </span>
                      {t.created_on && (
                        <time dateTime={t.created_on}>
                          {new Date(t.created_on).toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "long",
                          })}
                        </time>
                      )}
                    </div>
                  </li>
                  </RevealItem>
                ))}
              </Reveal>

              {/* Desvanecido al final de la muestra: lo que sigue está dentro. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg-primary via-bg-primary/80 to-transparent" />
            </div>
          )}

          {/* La única sección oscura de la página: el muro de registro. */}
          <Reveal variant="fade" className="mt-10 rounded-[2rem] bg-bg-dark p-8 text-white sm:p-10">
            <Lock className="h-6 w-6 text-violet-light" aria-hidden="true" />
            <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
              El resto del muro es solo para gente de dentro
            </h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70">
              Crea tu cuenta gratis (menos de un minuto) y verás todos los hilos,
              podrás responder, votar encuestas y publicar de forma anónima si
              quieres.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={registerHref} className={buttonVariants({ variant: "onBrand", size: "lg", className: "group" })}>
                Crear cuenta gratis
                <ArrowRight className="h-4 w-4 arrow-nudge" aria-hidden="true" />
              </Link>
              <p className="inline-flex items-center gap-1.5 text-xs text-white/60">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Puedes publicar en anónimo y borrar tu cuenta cuando quieras
              </p>
            </div>
          </Reveal>

          {/* Enlaces internos: dan salida al visitante y reparten autoridad hacia
              las fichas de catálogo, que son las que ya posicionan. */}
          <nav className="mt-12 border-t border-border-light pt-6" aria-label="Más sobre esta universidad">
            <h2 className="eyebrow">Más de {universityName}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-full border border-border bg-bg-primary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-text-primary/30 hover:text-text-primary"
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </section>
    </main>
  );
}
