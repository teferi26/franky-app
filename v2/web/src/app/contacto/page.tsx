import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Clock } from "lucide-react";
import { Reveal } from "@/components/motion";

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: "Contacto",
  description: "Contacta con el equipo de Franky. Estamos aquí para ayudarte.",
};

import ContactForm from "./contact-form";

// Canales de contacto: lista tipográfica, icono suelto, sin tarjetas tintadas.
const CANALES = [
  {
    icon: Mail,
    label: "Email",
    value: "contacto@franky.es",
    href: "mailto:contacto@franky.es",
  },
  {
    icon: MessageCircle,
    label: "Soporte",
    value: "soporte@franky.es",
    href: "mailto:soporte@franky.es",
  },
  { icon: Clock, label: "Horario", value: "Lunes a Viernes, 9:00 - 18:00" },
  { icon: MapPin, label: "Ubicación", value: "España" },
];

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <Reveal>
            <p className="eyebrow">Hablamos</p>
            <h1 className="mt-3 font-heading text-fluid-h1 font-extrabold text-text-primary">Contacto</h1>
            <p className="mt-4 max-w-xl text-fluid-lead text-text-muted">
              ¿Tienes alguna pregunta, sugerencia o problema? Estamos aquí para ayudarte.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <Reveal as="aside" variant="left">
            <p className="eyebrow">Canales</p>
            <dl className="mt-5 divide-y divide-border border-y border-border">
              {CANALES.map((c, i) => (
                <div
                  key={c.label}
                  className="flex items-start gap-4 py-5 animate-list-in"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-violet" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">{c.label}</dt>
                    <dd className="mt-1 font-heading text-lg font-semibold tracking-tight text-text-primary">
                      {c.href ? (
                        <a href={c.href} className="link-underline">
                          {c.value}
                        </a>
                      ) : (
                        c.value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm leading-relaxed text-text-muted">
              Responde una persona del equipo, normalmente en menos de 24 horas.
            </p>
          </Reveal>

          {/* Formulario de contacto */}
          <Reveal delay={90} className="rounded-3xl border border-border bg-bg-primary p-6 shadow-card sm:p-8 lg:p-10">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary">Envíanos un mensaje</h2>
            <p className="mt-1.5 text-sm text-text-muted">Cuanto más detalle, antes te podemos ayudar.</p>
            <div className="mt-8">
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
