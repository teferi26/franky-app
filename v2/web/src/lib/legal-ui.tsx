import Link from "next/link";
import { Reveal } from "@/components/motion";

/**
 * Piezas compartidas de las páginas legales (privacidad, cookies, términos y
 * aviso legal). Mismo patrón editorial v3 que ya usaban: cabecera con
 * eyebrow, índice lateral pegajoso en escritorio y secciones con Reveal.
 */

export const LEGAL_H2 = "font-heading text-xl font-extrabold tracking-tight text-text-primary sm:text-2xl";
export const LEGAL_H3 = "mt-6 font-heading text-base font-bold tracking-tight text-text-primary";
export const LEGAL_P = "mt-3 text-[15px] leading-relaxed text-text-secondary";
export const LEGAL_A = "link-underline font-medium text-text-primary";
export const LEGAL_LIST =
  "mt-4 divide-y divide-border border-y border-border text-[15px] leading-relaxed text-text-secondary";
export const LEGAL_STRONG = "font-semibold text-text-primary";

export function LegalHeader({ title, updatedAt, intro }: { title: string; updatedAt: string; intro?: string }) {
  return (
    <section className="border-b border-border-light">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Reveal>
          <p className="eyebrow">Legal</p>
          <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold text-text-primary">{title}</h1>
          {intro && <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-text-muted">{intro}</p>}
          <p className="mt-4 text-sm text-text-muted">Última actualización: {updatedAt}</p>
        </Reveal>
      </div>
    </section>
  );
}

export function LegalLayout({
  index,
  children,
  links,
}: {
  index: readonly (readonly [string, string])[];
  children: React.ReactNode;
  links: { href: string; label: string }[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="Índice" className="sticky top-24">
            <p className="eyebrow">Índice</p>
            <ol className="mt-4 space-y-1 border-l border-border">
              {index.map(([id, label], i) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-text-muted transition-colors hover:border-text-primary hover:text-text-primary"
                  >
                    <span className="tabular mr-2 text-xs text-text-muted/70">{i + 1}.</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="prose-comfy min-w-0 space-y-12">
          {children}
          <div className="flex flex-wrap gap-6 border-t border-border pt-8 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={LEGAL_A}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal as="section" id={id} className="scroll-mt-28">
      <h2 className={LEGAL_H2}>
        {n}. {title}
      </h2>
      {children}
    </Reveal>
  );
}

/** Tabla legible en móvil: scroll horizontal dentro de su marco, nunca de la página. */
export function LegalTable({
  head,
  rows,
  caption,
}: {
  head: string[];
  rows: React.ReactNode[][];
  caption?: string;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-bg-secondary text-xs uppercase tracking-wider text-text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-text-secondary">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-4 py-3 font-medium text-text-primary" : "px-4 py-3"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
