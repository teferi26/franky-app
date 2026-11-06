import { ArrowUpRight, Check, Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { iosStoreUrl, androidStoreUrl } from "@/lib/device";
import type { SectorMobileApp } from "@/lib/sector-sites/types";

export default function MobileAccess({
  accessHref,
  app,
}: {
  accessHref: string;
  /** Contenido propio del sector. Sin él se pinta el texto genérico. */
  app?: SectorMobileApp;
}) {
  const ios = iosStoreUrl();
  const android = androidStoreUrl();
  return (
    <section
      id="movil"
      className="scroll-mt-8 border-y border-border-light bg-bg-secondary/60"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:gap-20 lg:py-24">
        <div>
          <Smartphone className="mb-5 h-7 w-7 text-violet" strokeWidth={1.75} />
          <p className="eyebrow">Contigo, estés donde estés</p>
          <h2 className="mt-3 font-heading text-fluid-h2 font-bold tracking-tight">
            {app ? (
              app.title
            ) : (
              <>
                Tu espacio no se queda
                <br className="hidden sm:block" /> en el ordenador.
              </>
            )}
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-text-muted">
            {app
              ? app.body
              : "Abre tu espacio desde el móvil con tu cuenta de Franky. Consulta y gestiona los mismos datos que utiliza tu equipo desde la web."}
          </p>
          {app?.actions.length ? (
            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {app.actions.map((action) => (
                <li key={action} className="flex items-start gap-2.5 text-sm">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-violet"
                    strokeWidth={1.9}
                  />
                  {action}
                </li>
              ))}
            </ul>
          ) : null}
          <a
            href={accessHref}
            className={buttonVariants({
              variant: "dark",
              size: "lg",
              className: "mt-7",
            })}
          >
            Abrir mi espacio <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
        <div className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
          <h3 className="font-heading text-2xl font-bold tracking-tight">
            Franky en tu pantalla de inicio
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            Entra primero en tu espacio y guarda ese acceso en tu móvil para
            volver a él cuando lo necesites.
          </p>
          <ol className="mt-6 space-y-5 text-sm">
            <li className="flex gap-4">
              <span className="font-heading text-xl text-violet">01</span>
              <div>
                <p className="font-semibold">iPhone o iPad</p>
                <p className="mt-1 leading-relaxed text-text-muted">
                  Abre tu espacio en Safari, toca Compartir y elige Añadir a
                  pantalla de inicio.
                </p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="font-heading text-xl text-violet">02</span>
              <div>
                <p className="font-semibold">Android</p>
                <p className="mt-1 leading-relaxed text-text-muted">
                  Abre tu espacio en Chrome, abre el menú y elige Añadir a
                  pantalla de inicio.
                </p>
              </div>
            </li>
          </ol>
          {ios || android ? (
            <div className="mt-6 flex flex-wrap gap-3 border-t border-border-light pt-5">
              {ios && (
                <a
                  href={ios}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Descargar en App Store
                </a>
              )}
              {android && (
                <a
                  href={android}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Descargar en Google Play
                </a>
              )}
            </div>
          ) : (
            <p className="mt-6 border-t border-border-light pt-5 text-xs leading-relaxed text-text-muted">
              Puedes usar la web móvil desde hoy. Los enlaces de descarga de la
              app aparecerán aquí cuando esté disponible en las tiendas.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
