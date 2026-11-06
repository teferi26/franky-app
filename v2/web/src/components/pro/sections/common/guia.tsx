"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, MessageCircle, PlayCircle } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { PRO_CONTACT } from "@/lib/pro/contact";
import type { ProGuideChapter } from "@/lib/pro/verticals";
import { cn } from "@/lib/utils";
import { PageHeader, Panel } from "../../kit";
import { SECTION_META, sectionLabel } from "../../sections";
import { sectionHref } from "../../shell";
import { SetupChecklist } from "./checklist";

const WHEN_ORDER: ProGuideChapter["when"][] = ["Primer día", "Cada día", "Cada semana", "Cada temporada"];

const FAQ: { q: string; a: string }[] = [
  { q: "¿Mis clientes tienen que descargarse Franky?", a: "No. Puedes apuntar a cualquiera en tu agenda o libro con su nombre y teléfono. Si tiene Franky, recibe los avisos en la app; si no, le escribes por WhatsApp." },
  { q: "¿Cuánto me cobra Franky por cada cliente que me trae?", a: "Nada. Pagas tu cuota fija y ya. Ni por reserva, ni por comensal, ni por primera visita. Solo las entradas vendidas online llevan una pequeña comisión que paga el comprador." },
  { q: "¿Qué pasa si ya uso otra agenda o TPV?", a: "Te ayudamos a pasar tus citas y clientes en la visita de alta. Tu TPV sigue emitiendo las facturas: Franky registra cobros y cierres para tu control." },
  { q: "¿Quién ve mis datos?", a: "Tu equipo, cada uno con su rol. Franky no usa a tus clientes para otros negocios y te los llevas en CSV cuando quieras." },
  { q: "¿Puedo usarlo desde el móvil?", a: "Sí, está pensado para el móvil. Ábrelo en el navegador y añádelo a la pantalla de inicio: se abre como una app." },
];

export default function GuiaSection() {
  const { vertical, spaceId, data } = usePro();
  const chapters = [...vertical.guide].sort((a, b) => WHEN_ORDER.indexOf(a.when) - WHEN_ORDER.indexOf(b.when));
  const [open, setOpen] = React.useState<string | null>(chapters[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Guía"
        title={`Cómo sacarle todo el partido en ${vertical.noun}`}
        description="Capítulos cortos para el primer día, para cada día y para cada momento del curso."
      />

      <SetupChecklist always />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          {WHEN_ORDER.map((when) => {
            const list = chapters.filter((c) => c.when === when);
            if (!list.length) return null;
            return (
              <section key={when}>
                <p className="eyebrow mb-2">{when}</p>
                <ul className="flex flex-col gap-2">
                  {list.map((c) => {
                    const isOpen = open === c.id;
                    return (
                      <li key={c.id} className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : c.id)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
                        >
                          <span className="font-heading text-base font-bold">{c.title}</span>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform duration-300", isOpen && "rotate-180")} />
                        </button>
                        <div className={cn("grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-expo)]", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                          <div className="overflow-hidden">
                            <ol className="flex flex-col gap-3 px-4 pb-4 sm:px-5">
                              {c.body.map((p, i) => (
                                <li key={i} className="flex gap-3 text-sm text-text-secondary">
                                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-secondary text-[0.7rem] font-bold text-text-primary tabular">
                                    {i + 1}
                                  </span>
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          <section>
            <p className="eyebrow mb-2">Tu app, pantalla a pantalla</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {vertical.nav
                .filter((n) => n.id !== "guia")
                .map((n) => {
                  const Icon = SECTION_META[n.id].icon;
                  return (
                    <li key={n.id}>
                      <Link
                        href={sectionHref(spaceId, n.id)}
                        className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-bg-primary p-4 transition-colors hover:border-text-primary/20"
                      >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-violet" strokeWidth={1.8} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-semibold">
                            {sectionLabel(vertical.id, n.id)} <ArrowRight className="h-3.5 w-3.5 text-text-muted arrow-nudge" />
                          </span>
                          <span className="mt-0.5 block text-sm text-text-muted">{SECTION_META[n.id].blurb}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </section>

          <section>
            <p className="eyebrow mb-2">Preguntas frecuentes</p>
            <ul className="divide-y divide-border-light rounded-2xl border border-border bg-bg-primary">
              {FAQ.map((f) => (
                <li key={f.q} className="px-4 py-3.5 sm:px-5">
                  <p className="font-semibold">{f.q}</p>
                  <p className="mt-1 text-sm text-text-secondary">{f.a}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-2xl bg-bg-dark p-5 text-white">
            <p className="font-heading text-lg font-bold">Te ayudamos en persona</p>
            <p className="mt-1 text-sm text-white/70">
              Una persona de Franky te lo deja montado en tu local, forma a tu equipo y resuelve dudas por WhatsApp.
            </p>
            <a
              href={PRO_CONTACT.whatsappHref(`Hola, soy de ${data.space.name} y tengo una duda con Franky Pro`)}
              className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[#121019]"
            >
              <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
            </a>
            <p className="mt-2 text-center text-xs text-white/60">{PRO_CONTACT.phoneLabel}</p>
          </section>
          <Panel title="Lo que te promete Franky">
            <ul className="flex flex-col gap-2.5 text-sm text-text-secondary">
              {vertical.promises.map((p) => (
                <li key={p} className="flex gap-2">
                  <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.8} /> {p}
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
