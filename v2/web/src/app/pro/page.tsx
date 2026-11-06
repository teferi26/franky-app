import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PRO_VERTICALS, VERTICAL_ORDER, demoSpaceId } from "@/lib/pro/verticals";
import { buttonVariants } from "@/components/ui/button";
import { Reveal, RevealItem } from "@/components/motion";
import MySpaces from "./my-spaces";

export const metadata = { title: "Franky Pro" };

const GROUP_ORDER = ["Belleza", "Comer y beber", "Noche", "Deporte y aprendizaje", "Vivienda", "Comunidades"] as const;

export default function ProHome() {
  return (
    <div className="min-h-dvh bg-bg-primary">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/pro" className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-[-0.02em]">
          <img src="/img/franky-icon.png" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
          Franky <span className="text-violet">Pro</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="hidden rounded-xl px-3 py-2 font-semibold text-text-muted hover:text-text-primary sm:inline-flex">
            Soy estudiante
          </Link>
          <Link href="/pro/empezar" className={buttonVariants({ variant: "dark", size: "sm" })}>
            Empezar gratis
          </Link>
        </nav>
      </header>

      <MySpaces />

      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:px-6 lg:pb-20 lg:pt-16">
          <Reveal>
            <p className="eyebrow">Para negocios, pisos, asociaciones y universidades</p>
            <h1 className="mt-4 max-w-3xl font-heading text-fluid-display font-extrabold">
              La app de tu negocio que te trae estudiantes.
            </h1>
            <p className="mt-5 max-w-2xl text-fluid-lead text-text-muted">
              Agenda, reservas, clientes y equipo en el móvil. Y 25.000 estudiantes de Alicante a unos minutos de tu puerta, sin pagar comisión por cada uno.
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
              {["Cuota fija, 0 % por cliente", "El cliente es tuyo y lo exportas", "Te lo dejamos montado en tu local"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-violet" strokeWidth={2.4} /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <Reveal>
          <p className="eyebrow">Pruébala por dentro</p>
          <h2 className="mt-2 font-heading text-fluid-h2 font-extrabold">Elige tu tipo de negocio</h2>
          <p className="mt-2 max-w-xl text-text-muted">Cada demo es la app real con un negocio de ejemplo de Alicante. Toca, cita, cobra y lanza ofertas: nada sale de tu dispositivo.</p>
        </Reveal>
        <div className="mt-10 flex flex-col gap-10">
          {GROUP_ORDER.map((group) => {
            const ids = VERTICAL_ORDER.filter((id) => PRO_VERTICALS[id].group === group);
            return (
              <div key={group}>
                <p className="mb-3 text-sm font-semibold text-text-muted">{group}</p>
                <Reveal stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {ids.map((id, i) => {
                    const v = PRO_VERTICALS[id];
                    return (
                      <RevealItem key={id} index={i} asChild>
                        <Link
                          href={`/pro/${demoSpaceId(id)}`}
                          className="group flex h-full flex-col rounded-2xl border border-border bg-bg-primary p-5 shadow-card transition-[border-color,box-shadow,transform] hover-lift hover:border-text-primary/15"
                        >
                          <span className="font-heading text-lg font-bold">{v.label}</span>
                          <span className="mt-1 text-sm text-text-muted">{v.tagline}</span>
                          <span className="mt-4 text-sm text-text-secondary">{v.studentHook}</span>
                          <span className="mt-auto flex items-center justify-between pt-5 text-sm">
                            <span className="font-semibold tabular">
                              {id === "university" ? "Piloto anual" : v.price.monthly ? `${v.price.monthly} €/mes` : "Gratis"}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-violet">
                              Ver la demo <ArrowRight className="h-4 w-4 arrow-nudge" />
                            </span>
                          </span>
                        </Link>
                      </RevealItem>
                    );
                  })}
                </Reveal>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="rounded-[2rem] bg-bg-dark px-6 py-10 text-white sm:px-10">
          <h2 className="max-w-2xl font-heading text-fluid-h2 font-extrabold">Te lo dejamos funcionando en tu local, en una visita.</h2>
          <p className="mt-3 max-w-xl text-white/70">Pasamos tus citas o reservas, formamos a tu equipo y ponemos el QR en tu mostrador. Los 20 primeros negocios de cada ciudad tienen precio de fundador el primer año.</p>
          <Link href="/pro/empezar" className={buttonVariants({ variant: "onBrand", size: "lg", className: "mt-6" })}>
            Quiero Franky Pro
          </Link>
        </div>
      </section>
    </div>
  );
}
