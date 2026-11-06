import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { MapPin, ArrowRight, Mail, BadgeCheck, Building2 } from "lucide-react";
import { Reveal, RevealItem, SpotlightCard } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unstable_cache } from "next/cache";
import { createPublicSupabase } from "@/lib/supabase-server";
import {
  PARTNER_TIER_RANK, universityInitials, type PartnerTier,
} from "@/lib/partner";

// ISR: la lista de colaboradoras cambia al firmar un convenio (semanas o meses).
// Datos de catálogo público (sin cookies) para que la página pueda cachearse y vuele.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Universidades colaboradoras",
  description:
    "Las universidades que colaboran con Franky para acompañar a sus futuros y actuales estudiantes. Descubre el programa de colaboración.",
};

interface PartnerUni {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  image_url: string | null;
  city: string;
  comunidad_autonoma: string;
  type: string;
  partner_tier: PartnerTier | null;
  partner_since: string | null;
}

const CONTACT_EMAIL = "contacto@franky.es";

// Rendimiento (sep-2026): el layout raíz lee headers(), así que el `revalidate`
// de arriba no evita el render por petición. La lista de colaboradoras sí se
// cachea aquí una hora: cambia al firmar un convenio, no por visita.
const getPartners = unstable_cache(
  async () => {
    const supabase = createPublicSupabase();
    const { data, error } = await supabase
      .from("universities")
      .select(
        "id, name, slug, logo_url, image_url, city, comunidad_autonoma, type, partner_tier, partner_since",
      )
      .eq("is_partner", true);
    // Un fallo de BD se relanza: no se cachea una lista vacía durante una hora.
    if (error) throw new Error(`No se pudieron cargar las colaboradoras: ${error.message}`);
    return (data as PartnerUni[] | null) ?? [];
  },
  ["colaboradores-listado-v1"],
  { revalidate: 3600 }
);

export default async function ColaboradoresPage() {
  const partnersRaw = await getPartners();

  const partners = [...partnersRaw].sort((a, b) => {
    const ra = PARTNER_TIER_RANK[a.partner_tier ?? "colaboradora"] ?? 1;
    const rb = PARTNER_TIER_RANK[b.partner_tier ?? "colaboradora"] ?? 1;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "es");
  });

  const benefits = [
    {
      title: "Ficha oficial verificada",
      desc: "Vuestra página ampliada con vídeo, galería, jornadas de puertas abiertas y enlaces oficiales.",
    },
    {
      title: "Sello de colaboradora",
      desc: "Logo y distintivo permanente aquí y en vuestra ficha, ante miles de futuros estudiantes.",
    },
    {
      title: "Vuestra comunidad",
      desc: "El muro de vuestra universidad, sus eventos y los grupos de búsqueda de piso, en un solo sitio.",
    },
    {
      title: "Datos de demanda",
      desc: "Informe con datos agregados y anónimos: qué grados busca vuestro público objetivo.",
    },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="max-w-3xl">
            <p className="eyebrow">Programa de colaboración</p>
            <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
              Universidades que colaboran con Franky
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-text-muted">
              Construimos la mayor comunidad de universitarios de España. Estas
              universidades acompañan a sus futuros y actuales estudiantes dentro
              de Franky: información oficial, su comunidad y su vivienda, en un
              solo sitio.
            </p>
            {partners.length > 0 && (
              <p className="mt-6 text-sm text-text-muted tabular">
                <span className="font-heading text-2xl font-extrabold text-text-primary">{partners.length}</span>{" "}
                {partners.length === 1 ? "universidad colaboradora" : "universidades colaboradoras"}
              </p>
            )}
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* ============ MURO DE LOGOS ============ */}
        {partners.length > 0 ? (
          <Reveal stagger className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {partners.map((uni, i) => {
              const tier = uni.partner_tier ?? "colaboradora";
              const logo = uni.logo_url || uni.image_url;
              return (
                <RevealItem key={uni.id} index={i} asChild>
                  <SpotlightCard asChild>
                    <Link
                      href={`/universidades/${uni.slug}`}
                      className="group hover-lift flex flex-col items-center rounded-2xl border border-border bg-bg-primary p-5 text-center shadow-card hover:border-text-primary/15 sm:p-6"
                    >
                      <div className="img-zoom relative mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border-light bg-bg-secondary sm:h-24 sm:w-24">
                        {logo ? (
                          <Image src={logo} alt={uni.name} fill className="object-cover" sizes="96px" />
                        ) : (
                          <span className="font-heading text-xl font-extrabold text-text-primary sm:text-2xl">
                            {universityInitials(uni.name)}
                          </span>
                        )}
                      </div>
                      <Badge variant={tier === "fundadora" ? "default" : "outline"} className="mb-2">
                        <BadgeCheck className="h-3 w-3" />
                        {tier === "fundadora" ? "Fundadora" : "Colaboradora"}
                      </Badge>
                      <h3 className="line-clamp-2 font-heading text-sm font-bold leading-tight text-text-primary transition-colors group-hover:text-violet">
                        {uni.name}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-text-muted">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{uni.city}</span>
                      </div>
                    </Link>
                  </SpotlightCard>
                </RevealItem>
              );
            })}
          </Reveal>
        ) : (
          /* Estado vacío: la página funciona aunque aún no haya colaboradoras. */
          <Reveal className="rounded-2xl border border-border bg-bg-primary p-10 text-center sm:p-14">
            <Building2 className="mx-auto h-8 w-8 text-text-muted/50" />
            <h2 className="mt-4 font-heading text-xl font-bold text-text-primary">
              Estamos cerrando la primera tanda de universidades fundadoras
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
              Las primeras universidades en sumarse tendrán el distintivo de{" "}
              <span className="font-semibold text-violet">fundadoras</span> y
              condiciones preferentes permanentes.
            </p>
          </Reveal>
        )}

        {/* ============ QUÉ OFRECEMOS ============ */}
        <section className="mt-20 border-t border-border-light pt-16">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Para las universidades</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              Qué ofrecemos a las universidades
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-text-muted">
              Sin coste y sin exclusividad. Vuestros estudiantes ganan, y vosotros
              llegáis con más impacto a vuestro público objetivo.
            </p>
          </Reveal>
          <Reveal stagger className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b, i) => (
              <RevealItem key={b.title} index={i} className="bg-bg-primary p-6 sm:p-7">
                <p className="font-heading text-sm font-bold text-violet tabular">0{i + 1}</p>
                <h3 className="mt-4 font-heading text-lg font-bold text-text-primary">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">{b.desc}</p>
              </RevealItem>
            ))}
          </Reveal>
        </section>

        {/* ============ CTA (única sección oscura) ============ */}
        <Reveal variant="scale" as="section" className="mt-16 rounded-[2rem] bg-bg-dark px-6 py-14 text-center text-white sm:px-12 lg:py-20">
          <div className="mx-auto max-w-2xl">
            <p className="eyebrow text-violet-light">Colabora</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-white">¿Eres una universidad?</h2>
            <p className="mt-4 text-lg leading-relaxed text-white/70">
              Os abrimos un espacio en la sección de colaboradoras. A cambio solo
              pedimos una mención o un enlace desde vuestra web de orientación. Sin
              dinero, sin exclusividad y rescindible en 30 días.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                "Quiero que mi universidad colabore con Franky",
              )}`}
              className={cn(buttonVariants({ variant: "onBrand", size: "lg" }), "group mt-8")}
            >
              <Mail className="h-4 w-4" />
              Quiero colaborar
              <ArrowRight className="h-4 w-4 arrow-nudge" />
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
