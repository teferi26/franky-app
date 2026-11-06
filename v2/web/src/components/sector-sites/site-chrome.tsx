import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export function SectorHeader({
  name,
  homeHref,
  accessHref,
}: {
  name: string;
  homeHref: string;
  accessHref?: string;
}) {
  return (
    <header className="border-b border-border-light bg-bg-primary">
      <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href={homeHref}
          className="flex min-h-11 items-center gap-2.5"
          aria-label={`Franky ${name}, inicio`}
        >
          <img src="/img/franky-icon.png" width={32} height={32} alt="" />
          <span className="font-heading text-2xl font-extrabold tracking-tight">
            franky<span className="text-violet">.</span>
          </span>
          <span className="ml-2 hidden border-l border-border pl-4 text-sm text-text-muted sm:inline">
            {name}
          </span>
        </Link>
        <nav
          aria-label="Navegación del sector"
          className="flex items-center gap-6"
        >
          <a
            href={`${homeHref}#herramientas`}
            className="hidden min-h-11 items-center text-sm font-medium text-text-secondary lg:flex"
          >
            Qué puedes hacer
          </a>
          <a
            href={`${homeHref}#movil`}
            className="hidden min-h-11 items-center text-sm font-medium text-text-secondary md:flex"
          >
            En tu móvil
          </a>
          {accessHref && (
            <Link
              href={accessHref}
              className={buttonVariants({ variant: "outline" })}
            >
              Acceder <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SectorFooter({ name }: { name: string }) {
  return (
    <footer className="border-t border-border-light bg-bg-primary">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 px-5 py-9 sm:px-8 md:flex-row md:items-center">
        <div>
          <p className="font-heading text-xl font-bold">
            Franky <span className="text-text-muted">/ {name}</span>
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Tu día a día, conectado con la vida universitaria.
          </p>
        </div>
        <nav
          aria-label="Enlaces de Franky"
          className="flex flex-wrap gap-x-5 text-sm text-text-muted"
        >
          <a
            href="https://franky.es/sectores"
            className="flex min-h-11 items-center hover:text-text-primary"
          >
            Otros sectores
          </a>
          <a
            href="https://franky.es/"
            className="flex min-h-11 items-center hover:text-text-primary"
          >
            Soy estudiante
          </a>
          <a
            href="https://franky.es/contacto"
            className="flex min-h-11 items-center hover:text-text-primary"
          >
            Contacto
          </a>
          <a
            href="https://franky.es/privacidad"
            className="flex min-h-11 items-center hover:text-text-primary"
          >
            Privacidad
          </a>
          <a
            href="https://franky.es/terminos"
            className="flex min-h-11 items-center hover:text-text-primary"
          >
            Condiciones
          </a>
        </nav>
      </div>
    </footer>
  );
}
