import { createPublicSupabase } from "@/lib/supabase-server";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { ACADEMIC_CATALOGUE_VERSION } from "@/lib/academic-catalogue-version";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { NotasCorteListing } from "./NotasCorteListing";
import { HeroCalculatorCTA } from "./HeroCalculatorCTA";
import { CalculatorSection } from "./CalculatorSection";
import { listingMetadata } from "@/lib/listing-seo";
import JsonLd from "@/components/JsonLd";
import { Reveal, RevealItem, CountUp } from "@/components/motion";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { packAdmissionCatalogue, unpackAdmissionCatalogue, type AdmissionCareer as Career } from "@/lib/admission-catalogue";
import { cutOffForView, cutOffViewLabel } from "@/lib/academic-year";

// Catálogo público cacheable. El layout raíz lee headers() (nonce de la CSP),
// así que el HTML se renderiza por petición y este `revalidate` no lo evita;
// los DATOS sí se cachean una hora con `unstable_cache` (ver getCareersCatalog).
export const revalidate = 3600;

// Fila tal y como llega de PostgREST: la nota puede venir como texto (numeric)
// y el embed de universidad como objeto o como array de un elemento.
type RawCareer = Omit<Career, "cut_off_score" | "cut_off_score_prev" | "universities"> & {
  cut_off_score: number | string | null;
  cut_off_score_prev: number | string | null;
  universities: Career["universities"] | NonNullable<Career["universities"]>[];
};

// Rendimiento (sep-2026): cada visita a /notas-corte recorría el catálogo
// entero de carreras (miles de filas, en páginas de 1000, en serie) más la
// consulta del nombre de universidad. Es la página con más tráfico orgánico y
// sus datos cambian unas pocas veces al año. Ahora el recorrido se hace como
// mucho una vez por hora para todo el catálogo. Los filtros se aplican en el
// cliente y no generan entradas de caché por parámetros de la URL.
// El formato compacto comparte universidades y ramas para reducir la respuesta
// y guardar una sola entrada de caché sin repetir miles de objetos idénticos.
const getCareersCatalog = unstable_cache(
  async () => {
    const supabase = createPublicSupabase();

    // Supabase limits to 1000 rows per request: paginate to fetch all
    const PAGE = 1000;
    const allRaw: RawCareer[] = [];
    let from = 0;
    let done = false;

    while (!done) {
      const q = supabase
        .from("careers")
        .select(
          "id, slug, name, branch, cut_off_score, cut_off_year, cut_off_score_prev, cut_off_year_prev, admission_without_cutoff, campus, modality, duration_years, universities(name, short_name, city, comunidad_autonoma, slug)"
        )
        .order("cut_off_score", { ascending: false, nullsFirst: false })
        // Desempate estable: sin él, el bloque de filas sin nota (todas
        // empatadas) puede reordenarse entre páginas y duplicar o perder filas.
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);

      // Keep the complete dataset: all initial URL filters can be cleared in the client.

      const { data, error } = await q;
      // Un fallo de BD se relanza a propósito: si devolviéramos lo que hay,
      // la caché guardaría un catálogo vacío o a medias durante una hora.
      if (error) throw new Error(`No se pudieron cargar las notas de corte: ${error.message}`);
      const rows = (data ?? []) as unknown as RawCareer[];
      allRaw.push(...rows);
      if (rows.length < PAGE) done = true;
      else from += PAGE;
    }

    return packAdmissionCatalogue(allRaw.map(c => ({
      ...c,
      cut_off_score: c.cut_off_score === null ? null : Number(c.cut_off_score),
      cut_off_score_prev: c.cut_off_score_prev == null ? null : Number(c.cut_off_score_prev),
      universities: Array.isArray(c.universities) ? (c.universities[0] ?? null) : c.universities,
    })));
  },
  ["notas-corte-catalogo-v7-curso-anterior", ACADEMIC_CATALOGUE_VERSION],
  { revalidate: 3600 }
);

// Metadatos por variante: al absorber el listado /carreras, esta página heredó
// sus URLs con filtros (rama, universidad, buscar, nota_min/max, orden). Sin
// esto, cada combinación sería un casi-duplicado indexable con el mismo title.
// listing-seo manda a noindex,follow cualquier variante filtrada.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const base = listingMetadata({
    path: "/notas-corte",
    title: "Notas de corte y carreras universitarias de España",
    description:
      "Consulta las notas de corte disponibles, con el curso indicado en cada titulación. Filtra por rama, universidad y nota. Calcula tu nota de admisión EvAU/EBAU.",
    params: await searchParams,
  });
  return {
    ...base,
    keywords: [
      "notas de corte", "selectividad", "EvAU", "EBAU",
      "universidad", "carreras", "España", "2026", "admisión",
    ],
  };
}

export default async function NotasCortePage({
  searchParams,
}: {
  searchParams: Promise<{
    buscar?: string;
    rama?: string;
    orden?: string;
    nota_min?: string;
    nota_max?: string;
    // universidad (UUID) viene de los enlaces de la ficha de universidad, que
    // antes apuntaban a /carreras?universidad=<id>.
    universidad?: string;
    acceso?: string;
  }>;
}) {
  const params = await searchParams;

  // ?universidad=<uuid> viene de la ficha de universidad. Se resuelve a NOMBRE
  // y se le pasa al listado como filtro inicial en vez de recortar la consulta:
  // así el desplegable aparece marcado, el contador de filtros lo cuenta y
  // "Limpiar filtros" devuelve de verdad el catálogo completo.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const universidadId = params.universidad && UUID_RE.test(params.universidad)
    ? params.universidad
    : null;

  // One shared catalogue cache, independent of arbitrary URL filter combinations.
  const catalogue = await getCareersCatalog();
  let universidadNombre = "";
  if (universidadId) {
    const { data, error } = await createPublicSupabase().from("universities")
      .select("name").eq("id", universidadId).maybeSingle();
    if (error) throw new Error("No se pudo comprobar el filtro de universidad.");
    universidadNombre = data?.name ?? "";
  }

  const careers = unpackAdmissionCatalogue(catalogue);

  const totalCareers = careers.length;
  // Solo cuenta como "con nota" la del curso vigente; la del anterior se
  // consulta con el conmutador del listado y nunca pasa por actual.
  const currentLabel = cutOffViewLabel("current");
  const previousLabel = cutOffViewLabel("previous");
  const scored = careers.filter((c) => !c.admission_without_cutoff && cutOffForView(c, "current") !== null);
  const currentCount = scored.length;
  const historicalCount = careers.filter((c) => !c.admission_without_cutoff && cutOffForView(c, "previous") !== null).length;
  const withoutCutoffCount = careers.filter((c) => c.admission_without_cutoff === true).length;
  const unknownCount = careers.length - currentCount - withoutCutoffCount;

  const branchCounts: Record<string, number> = {};
  careers.forEach((c) => {
    branchCounts[c.branch] = (branchCounts[c.branch] || 0) + 1;
  });

  // ItemList con las carreras de nota de corte más alta (datos estructurados).
  const topCareers = scored
    .map((c) => ({ ...c, current: cutOffForView(c, "current")!.score }))
    .sort((a, b) => b.current - a.current)
    .slice(0, 20);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Notas de corte de las carreras universitarias de España",
    itemListElement: topCareers.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${c.name}${c.universities?.name ? ` · ${c.universities.name}` : ""}`,
      ...(c.universities?.slug
        ? { url: `https://franky.es/universidades/${c.universities.slug}` }
        : {}),
    })),
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <JsonLd data={jsonLd} />

      {/* ============ CABECERA ============ */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-16">
            <Reveal className="lg:col-span-7">
              <p className="eyebrow">Notas de corte y carreras</p>
              <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
                Encuentra tu carrera.
                <br />
                Comprueba su nota de corte.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-text-muted">
                Explora {totalCareers.toLocaleString("es-ES")} titulaciones por universidad, ciudad y rama.
                Ves las notas del curso {currentLabel}; las del {previousLabel} están a un botón. Úsalas como referencia y revisa la adjudicación oficial.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <HeroCalculatorCTA />
                <Link
                  href="/simulador"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}
                >
                  Ya tengo mi nota: ver mis opciones
                  <ArrowRight className="h-4 w-4 arrow-nudge" />
                </Link>
              </div>
            </Reveal>

            {/* Estado del catálogo: cifras tipográficas, sin tarjetas de color. */}
            <Reveal delay={120} className="lg:col-span-5">
              <dl
                aria-label="Estado del catálogo"
                className="grid grid-cols-2 gap-x-6 gap-y-7 border-t border-border-light pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
              >
                {[
                  { value: currentCount, label: `Notas ${currentLabel}`, detail: "Curso vigente, con la lista y el cupo en cada ficha" },
                  { value: historicalCount, label: `Notas ${previousLabel}`, detail: "Curso anterior, a un botón en el listado" },
                  { value: withoutCutoffCount, label: "Acceso sin nota de corte", detail: "Requisitos de acceso verificados" },
                  { value: unknownCount, label: `Sin nota ${currentLabel}`, detail: "Consulta la admisión de la universidad" },
                ].map((item) => (
                  <div key={item.label} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{item.label}</dt>
                    <dd className="mt-1.5 font-heading text-3xl font-extrabold tracking-tight text-text-primary tabular">
                      <CountUp value={item.value} locale="es-ES" />
                    </dd>
                    <dd className="mt-1 text-xs leading-relaxed text-text-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ LISTADO ============ */}
      <section id="ranking" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="eyebrow">Explora tus opciones</p>
              <h2 className="mt-2 text-fluid-h2 font-extrabold text-text-primary">
                Carreras y notas de corte
              </h2>
            </div>
            <p className="text-sm text-text-muted tabular">
              {totalCareers.toLocaleString("es-ES")} carreras · {scored.length.toLocaleString("es-ES")} con nota {currentLabel}
            </p>
          </Reveal>

          <div className="mb-10">
            <CalculatorSection />
          </div>

          <NotasCorteListing
            catalogue={catalogue}
            branchCounts={branchCounts}
            initialBuscar={params.buscar || ""}
            initialRama={params.rama || ""}
            initialOrden={params.orden || "desc"}
            initialNotaMin={params.nota_min || ""}
            initialNotaMax={params.nota_max || ""}
            initialUniversidad={universidadNombre}
            initialWithoutCutoff={params.acceso === "sin-corte"}
          />
        </div>
      </section>

      {/* ============ CÓMO FUNCIONA ============ */}
      <section className="border-t border-border-light">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Reveal className="max-w-2xl">
            <p className="eyebrow">Cómo se calcula</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
              ¿Cómo funcionan las notas de corte?
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-text-muted">
              Todo lo que necesitas saber para entender el sistema de acceso a la
              universidad en España.
            </p>
          </Reveal>

          {/* Tres pasos numerados, separados por hairlines: sin iconos en cajas. */}
          <Reveal stagger className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
            {([
              {
                title: "Nota de acceso",
                formula: "Media Bach. × 0,6 + Media EvAU × 0,4",
                description:
                  "Tu expediente de Bachillerato (60%) combinado con la nota media de la fase obligatoria de la EvAU (40%). Máximo: 10 puntos.",
              },
              {
                title: "Fase específica",
                formula: "Mejores 2 materias (≥5) × ponderación",
                description:
                  "Las 2 mejores notas de la fase voluntaria (que superen el 5) multiplicadas por su ponderación (0,1 o 0,2). Suma hasta +4 puntos extra.",
              },
              {
                title: "Nota de admisión",
                formula: "Nota acceso + Fase específica",
                description:
                  "Tu nota final se compara con la de cada titulación, cupo y adjudicación. Superar una nota anterior orienta sobre tus opciones, pero no garantiza plaza. Máximo: 14 puntos.",
              },
            ] as const).map((item, i) => (
              <RevealItem key={item.title} index={i} className="bg-bg-primary p-8">
                <p className="font-heading text-sm font-bold text-violet tabular">0{i + 1}</p>
                <h3 className="mt-4 font-heading text-xl font-bold text-text-primary">{item.title}</h3>
                <p className="mt-3 inline-block rounded-lg bg-bg-secondary px-3 py-1.5 font-mono text-xs font-semibold text-text-primary">
                  {item.formula}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">{item.description}</p>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ============ CTA (única sección oscura) ============ */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal variant="scale" className="rounded-[2rem] bg-bg-dark px-6 py-14 text-white sm:px-12 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow text-violet-light">No te quedes con la duda</p>
            <h2 className="mt-3 text-fluid-h2 font-extrabold text-white">
              ¿Aún no sabes qué estudiar?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
              Nuestro test vocacional analiza tu perfil RIASEC y te recomienda las
              carreras que mejor encajan contigo. Solo te llevará 5 minutos.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/test-vocacional"
                className={cn(buttonVariants({ variant: "onBrand", size: "lg" }), "group")}
              >
                Hacer el test vocacional
                <ArrowRight className="h-4 w-4 arrow-nudge" />
              </Link>
              <Link href="/simulador" className={buttonVariants({ variant: "glass", size: "lg" })}>
                ¿A qué carreras llego con mi nota?
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
