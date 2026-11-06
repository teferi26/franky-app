import { formatAcademicDuration } from '@/lib/academic-duration';
import Link from "next/link";
import { BadgeCheck, PlayCircle, CalendarDays, Star, ExternalLink, Quote } from "lucide-react";
import { PARTNER_TIER_LABEL, isHttpUrl, type PartnerTier } from "@/lib/partner";
import { courseAdmission } from '@/lib/university-catalogue';
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShowcaseCareer {
  id: string;
  name: string;
  slug?: string | null;
  cut_off_score: number | null;
  cut_off_year?: number | null;
  admission_without_cutoff?: boolean | null;
  duration_years: number | null;
}

interface ShowcaseUni {
  name: string;
  partner_tier: PartnerTier | null;
  partner_since: string | null;
  partner_blurb: string | null;
  intro_video_url: string | null;
  gallery_urls: string[] | null;
  jpa_url: string | null;
  jpa_label: string | null;
  featured_career_ids: string[] | null;
}

/**
 * Bloque de "ficha premium" que solo se muestra para universidades colaboradoras.
 * El vídeo se abre en pestaña nueva (no se incrusta en iframe) para no depender
 * del `frame-src` de la CSP estricta del proyecto.
 */
export default function PartnerShowcase({
  uni,
  careers,
}: {
  uni: ShowcaseUni;
  careers: ShowcaseCareer[];
}) {
  const tier = uni.partner_tier ?? "colaboradora";
  const tierLabel = PARTNER_TIER_LABEL[tier];

  const featuredIds = uni.featured_career_ids ?? [];
  // Solo se destacan las ofertas elegidas; el orden alfabético no es una recomendación.
  const featured = [...new Set(featuredIds)].flatMap(id => careers.find(c => c.id === id) ?? []).slice(0, 6);
  const since = uni.partner_since
    ? new Date(uni.partner_since).getFullYear()
    : null;

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card sm:p-8">
      {/* Cabecera del sello: icono suelto, sin cuadrado tintado. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BadgeCheck className="h-6 w-6 shrink-0 text-violet" />
          <div>
            <h2 className="font-heading text-lg font-bold leading-tight text-text-primary">{tierLabel}</h2>
            <p className="text-xs text-text-muted">
              Colabora oficialmente con Franky
              {since ? ` · desde ${since}` : ""}
            </p>
          </div>
        </div>
        {isHttpUrl(uni.jpa_url) && (
          <a
            href={uni.jpa_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "dark", size: "sm" }), "h-10")}
          >
            <CalendarDays className="h-4 w-4" />
            {uni.jpa_label || "Jornada de Puertas Abiertas"}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        )}
      </div>

      {/* Mensaje de la universidad */}
      {uni.partner_blurb && (
        <p className="mb-6 flex gap-2.5 text-[15px] leading-relaxed text-text-secondary">
          <Quote className="mt-1 h-4 w-4 shrink-0 text-violet" />
          <span className="italic">{uni.partner_blurb}</span>
        </p>
      )}

      {/* Vídeo institucional (abre en pestaña nueva, seguro con la CSP) */}
      {isHttpUrl(uni.intro_video_url) && (
        <a
          href={uni.intro_video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-6 flex items-center gap-4 rounded-xl border border-border p-4 transition-colors hover:border-text-primary/20 hover:bg-bg-secondary"
        >
          <PlayCircle className="h-7 w-7 shrink-0 text-violet" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-text-primary transition-colors group-hover:text-violet">
              Ver vídeo institucional
            </span>
            <span className="block truncate text-xs text-text-muted">
              Conoce {uni.name} en vídeo
            </span>
          </span>
          <ExternalLink className="ml-auto h-4 w-4 shrink-0 text-text-muted" />
        </a>
      )}

      {/* Grados destacados */}
      {featured.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold text-text-primary">
            <Star className="h-4 w-4 text-violet" />
            Grados destacados
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {featured.map((c) => { const admission = courseAdmission(c); return (
              <Link
                key={c.id}
                href={`/carreras/${c.slug || c.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-text-primary/20 hover:bg-bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight text-text-primary transition-colors group-hover:text-violet">
                    {c.name}
                  </p>
                  {c.duration_years && (
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {formatAcademicDuration(c.duration_years)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-heading text-sm font-bold leading-none text-text-primary tabular">
                    {admission.label}
                  </div>
                  <div className="mt-0.5 text-[10px] text-text-muted">
                    {admission.period}
                  </div>
                </div>
              </Link>
            )})}
          </div>
        </div>
      )}
    </section>
  );
}
