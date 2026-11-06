import Link from "next/link";
import { ChevronRight } from "lucide-react";
import JsonLd from "@/components/JsonLd";

export type Crumb = { name: string; href?: string };

/**
 * Migas de pan visibles + JSON-LD `BreadcrumbList`.
 *
 * No habia ninguna en las fichas de catalogo. Aportan dos cosas distintas:
 *   * Al visitante: una salida hacia arriba. Quien aterriza de Google en
 *     /carreras/<id> no tenia forma evidente de subir al listado ni a la uni.
 *   * A Google: el rastro de migas sustituye a la URL cruda en el resultado de
 *     busqueda ("franky.es > Carreras > Medicina" en vez de la URL con el id),
 *     lo que sube el CTR.
 *
 * El JSON-LD va sin nonce a proposito (ver components/JsonLd.tsx).
 */
export default function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: `https://franky.es${c.href}` } : {}),
    })),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <nav aria-label="Ruta de navegación" className={className}>
        {/* v3: texto pequeño y sereno, separadores hairline, subrayado que
            crece en los enlaces y la página actual en negrita discreta. */}
        <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-text-muted">
          {items.map((c, i) => (
            <li key={`${c.name}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted/50" aria-hidden="true" />
              )}
              {c.href && i < items.length - 1 ? (
                <Link
                  href={c.href}
                  className="link-underline truncate transition-colors duration-200 hover:text-text-primary"
                >
                  {c.name}
                </Link>
              ) : (
                <span className="truncate font-medium text-text-primary" aria-current="page">
                  {c.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
