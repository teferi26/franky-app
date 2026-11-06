"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, CheckCheck, Eye, Heart, Languages, Megaphone, MessageCircle, Send, Siren, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProUniPublication } from "@/lib/pro/types";
import { addDays, dayLabel, localDate, pct, relative, time } from "@/lib/pro/format";
import {
  AUDIENCE_ORDER,
  URGENT_KIND_LABEL,
  endUrgent,
  isUrgentActive,
  readSummary,
  readsByFaculty,
  remindUnread,
  whatsappShareUrl,
} from "@/lib/pro/university";
import type { ProUniAudience, UniPublication } from "@/lib/pro/university-types";
import { Detail, Drawer, Empty, Kpi, KpiRow, Meter, PageHeader, Pill, Segmented, Tip } from "../../kit";
import { CHANNEL, Composer, type ComposerPreset } from "./composer";
import { HiddenGroup, OfficialBadge, UrgentBanner, useUniAction } from "./ui";

type Tab = ProUniPublication["status"];

function presetFrom(params: URLSearchParams): ComposerPreset {
  const audience = params.get("publico");
  return {
    template: params.get("plantilla") ?? undefined,
    deadlineId: params.get("plazo") ?? undefined,
    audience: AUDIENCE_ORDER.includes(audience as ProUniAudience) ? (audience as ProUniAudience) : undefined,
    faculty: params.get("facultad") ?? undefined,
  };
}

export default function UniversityPublicaciones() {
  const { data, now } = usePro();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("published");
  const [creating, setCreating] = React.useState(params.get("nueva") === "1");
  const [preset, setPreset] = React.useState<ComposerPreset>(() => presetFrom(new URLSearchParams(params.toString())));
  const [open, setOpen] = React.useState<string | null>(params.get("ver"));

  const pubs = data.uniPublications as UniPublication[];
  const active = data.uniMetrics.find((m) => m.key === "active")?.value ?? 0;
  const published = pubs.filter((p) => p.status === "published");
  const monthAgo = addDays(localDate(now), -30);
  const month = published.filter((p) => localDate(p.at) >= monthAgo);
  const monthReach = month.reduce((a, p) => a + p.reach, 0);
  const avgReach = month.length ? Math.round(monthReach / month.length) : 0;
  const reactions = month.reduce((a, p) => a + p.reactions, 0);
  const withReads = month.filter((p) => p.readReceipt && p.reads?.length);
  const readTotals = withReads.reduce(
    (acc, p) => {
      const s = readSummary(p);
      return { audience: acc.audience + s.audience, read: acc.read + s.read };
    },
    { audience: 0, read: 0 },
  );
  const list = pubs
    .filter((p) => p.status === tab)
    .sort((a, b) => (tab === "published" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at)));

  const startNew = (next: ComposerPreset = {}) => {
    setPreset(next);
    setCreating(true);
  };
  const closeComposer = () => {
    setCreating(false);
    // Quita ?nueva=1 y compañía para que al volver atrás no se abra otra vez.
    if (params.get("nueva")) router.replace(window.location.pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-5">
      <UrgentBanner />

      <PageHeader
        eyebrow="Publicaciones"
        title="Publicaciones oficiales"
        description={
          month.length
            ? `Tus ${month.length} publicaciones de los últimos 30 días las vieron ${monthReach.toLocaleString("es-ES")} veces. De media, cada una llega a ${avgReach.toLocaleString("es-ES")} estudiantes.`
            : "Publica con distintivo oficial en el campus de Franky y mide quién lo ve de verdad."
        }
        actions={
          <>
            <Button variant="outline" onClick={() => startNew({ template: "urgente" })}>
              <Siren className="h-4 w-4" /> Aviso urgente
            </Button>
            <Button variant="dark" onClick={() => startNew()}>
              <Megaphone className="h-4 w-4" /> Nueva publicación
            </Button>
          </>
        }
      >
        <Segmented<Tab>
          label="Estado"
          value={tab}
          onChange={setTab}
          options={[
            { value: "published", label: "Publicadas", count: published.length },
            { value: "scheduled", label: "Programadas", count: pubs.filter((p) => p.status === "scheduled").length },
            { value: "draft", label: "Borradores", count: pubs.filter((p) => p.status === "draft").length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Eye} label="Alcance, 30 días" value={monthReach.toLocaleString("es-ES")} hint="Visualizaciones reales" emphasis />
        <Kpi icon={Sparkles} label="Alcance medio" value={avgReach.toLocaleString("es-ES")} hint={active ? `${pct(avgReach, active)} % del campus activo` : undefined} />
        <Kpi
          icon={CheckCheck}
          label="Confirmaron lectura"
          value={readTotals.audience ? `${pct(readTotals.read, readTotals.audience)} %` : "Sin datos"}
          hint={withReads.length ? `En ${withReads.length} avisos con “Lo he leído”` : "Actívalo en tus avisos"}
        />
        <Kpi icon={Heart} label="Reacciones" value={reactions.toLocaleString("es-ES")} hint="Me gusta, guardados y compartidos" />
      </KpiRow>

      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((p, i) => {
            const reads = p.readReceipt && p.reads?.length ? readSummary(p) : null;
            const urgent = isUrgentActive(p, now);
            return (
              <li key={p.id} className="animate-list-in" style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => setOpen(p.id)}
                  className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-text-primary/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:flex-row sm:items-center sm:gap-5 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <OfficialBadge />
                      {urgent ? <Pill tone="danger">Urgente, fijado arriba</Pill> : null}
                      <Pill>{CHANNEL[p.channel].label}</Pill>
                      {p.titleEn ? <Pill>ES · EN</Pill> : null}
                      <span className="text-xs text-text-muted">
                        {p.audience} · {p.status === "published" ? relative(p.at, now.getTime()) : `${dayLabel(p.at)} a las ${time(p.at)}`}
                      </span>
                    </div>
                    <h3 className="mt-2 font-heading text-base font-bold leading-snug">{p.title}</h3>
                  </div>
                  {p.status === "published" ? (
                    <div className="flex shrink-0 items-center gap-5 sm:w-72">
                      <div className="min-w-0 flex-1">
                        {reads ? (
                          <>
                            <p className="flex items-center gap-1 text-sm font-semibold tabular">
                              <CheckCheck className="h-3.5 w-3.5 text-text-muted" /> {reads.pct} % lo ha leído
                            </p>
                            <Meter value={reads.read} max={reads.audience} tone={reads.pct < 50 ? "warning" : "violet"} className="mt-1.5" />
                          </>
                        ) : (
                          <>
                            <p className="flex items-center gap-1 text-sm font-semibold tabular">
                              <Eye className="h-3.5 w-3.5 text-text-muted" /> {p.reach.toLocaleString("es-ES")}
                            </p>
                            <Meter value={p.reach} max={Math.max(active, p.reach)} className="mt-1.5" />
                          </>
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-sm font-semibold tabular">
                        <Heart className="h-3.5 w-3.5 text-text-muted" /> {p.reactions.toLocaleString("es-ES")}
                      </p>
                    </div>
                  ) : (
                    <Pill tone={p.status === "scheduled" ? "info" : "warning"}>{p.status === "scheduled" ? "Programada" : "Borrador"}</Pill>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={Megaphone}
            title={tab === "published" ? "Aún no has publicado nada" : tab === "scheduled" ? "Nada programado" : "Sin borradores"}
            body="Escribe un aviso oficial: llega al móvil de tus estudiantes con el distintivo de la universidad. Empieza con una plantilla de becas, matrícula o exámenes."
            action={
              <Button variant="dark" onClick={() => startNew()}>
                Nueva publicación
              </Button>
            }
          />
        </div>
      )}

      <Tip title="Cuándo funciona mejor">
        Para plazos (becas, matrícula, exámenes), usa Aviso con “Lo he leído”: a los dos días ves qué facultades no lo han abierto y se lo recuerdas solo a ellas. Las publicaciones de FOMO llegan a más gente entre semana a primera hora de la tarde.
      </Tip>

      <Composer open={creating} onClose={closeComposer} preset={preset} />
      <PublicationDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function PublicationDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const [lang, setLang] = React.useState<"es" | "en">("es");
  const p = (data.uniPublications as UniPublication[]).find((x) => x.id === id);

  React.useEffect(() => setLang("es"), [id]);

  if (!p) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Publicación">
        <span />
      </Drawer>
    );
  }

  const active = data.uniMetrics.find((m) => m.key === "active")?.value ?? 0;
  const reads = p.readReceipt && p.reads?.length ? readSummary(p) : null;
  const urgent = isUrgentActive(p, now);
  const patch = (label: string, next: UniPublication, title: string, detail?: string, close = true) =>
    run(
      label,
      (d) => ({ ...d, uniPublications: d.uniPublications.map((x) => (x.id === p.id ? next : x)) }),
      title,
      detail,
    ).then((ok) => {
      if (ok && close) onClose();
    });

  const setStatus = (status: ProUniPublication["status"], title: string, detail?: string) =>
    patch("publication.status", { ...p, status, at: status === "published" ? now.toISOString() : p.at }, title, detail);

  const lastReminder = p.reminders?.[p.reminders.length - 1];

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={lang === "en" && p.titleEn ? p.titleEn : p.title}
      description={`${CHANNEL[p.channel].label} · ${p.audience}`}
      footer={
        p.status === "published" ? (
          <>
            <Button asChild variant="outline">
              <a href={whatsappShareUrl(p, data.space.slug)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> Compartir por WhatsApp
              </a>
            </Button>
            {urgent ? (
              <Button variant="dark" onClick={() => patch("publication.urgent.end", endUrgent(p, now), "Aviso retirado de arriba", "Sigue en el muro como publicación normal.")}>
                Ya no aplica
              </Button>
            ) : reads && reads.unread ? (
              <Button
                variant="dark"
                onClick={() =>
                  patch(
                    "publication.remind",
                    remindUnread(p, now),
                    "Recordatorio enviado",
                    `Solo a los ${reads.unread.toLocaleString("es-ES")} estudiantes que aún no lo han leído.`,
                    false,
                  )
                }
              >
                <BellRing className="h-4 w-4" /> Recordar a quien no lo ha leído
              </Button>
            ) : null}
          </>
        ) : (
          <>
            {p.status === "scheduled" ? (
              <Button variant="outline" onClick={() => setStatus("draft", "Programación cancelada", "Queda como borrador.")}>
                Cancelar programación
              </Button>
            ) : null}
            <Button variant="dark" onClick={() => setStatus("published", "Publicada", "Ya está en el campus con el distintivo oficial.")}>
              <Send className="h-4 w-4" /> Publicar ahora
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <OfficialBadge />
          {urgent && p.urgent ? <Pill tone="danger">{URGENT_KIND_LABEL[p.urgent.kind]} hasta las {time(p.urgent.until)}</Pill> : null}
          <Pill>{CHANNEL[p.channel].label}</Pill>
          {p.titleEn ? (
            <button
              type="button"
              onClick={() => setLang(lang === "es" ? "en" : "es")}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-semibold text-text-secondary hover:border-text-primary/25"
            >
              <Languages className="h-3.5 w-3.5" /> {lang === "es" ? "Ver en inglés" : "Ver en español"}
            </button>
          ) : null}
        </div>

        {p.body ? <p className="whitespace-pre-line text-sm text-text-secondary">{lang === "en" && p.bodyEn ? p.bodyEn : p.body}</p> : null}

        {reads ? (
          <section className="rounded-2xl border border-border p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm text-text-muted">Han confirmado “Lo he leído”</p>
                <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{reads.pct} %</p>
              </div>
              <p className="text-right text-xs text-text-muted">
                {reads.read.toLocaleString("es-ES")} de {reads.audience.toLocaleString("es-ES")}
                <br />
                {reads.unread.toLocaleString("es-ES")} sin leer
              </p>
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {readsByFaculty(p).map((r) => (
                <li key={r.faculty} className="text-sm">
                  <div className="mb-1 flex justify-between gap-3">
                    <span className="truncate">{r.faculty}</span>
                    {r.hidden ? <HiddenGroup /> : <span className="font-semibold tabular">{r.pct} %</span>}
                  </div>
                  {r.hidden ? null : <Meter value={r.read} max={r.audience} tone={r.pct < 50 ? "warning" : "violet"} />}
                </li>
              ))}
            </ul>
            {lastReminder ? (
              <p className="mt-4 text-xs text-text-muted">
                Último recordatorio: {relative(lastReminder.at, now.getTime())}, a {lastReminder.sentTo.toLocaleString("es-ES")} estudiantes.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="divide-y divide-border-light">
          <Detail label={p.status === "published" ? "Publicada" : "Sale"}>
            {dayLabel(p.at)} a las {time(p.at)}
          </Detail>
          <Detail label="Público">{p.audience}</Detail>
          {p.status === "published" ? (
            <>
              <Detail label="Estudiantes que la vieron">{p.reach.toLocaleString("es-ES")}</Detail>
              <Detail label="Del campus activo">{active ? `${pct(p.reach, active)} %` : "Sin datos"}</Detail>
              <Detail label="Reacciones">{p.reactions.toLocaleString("es-ES")}</Detail>
            </>
          ) : null}
          {p.help ? <Detail label="Botón fijo">Pedir ayuda</Detail> : null}
        </div>
        {p.status === "published" && !reads ? <Meter value={p.reach} max={Math.max(active, p.reach)} /> : null}
      </div>
    </Drawer>
  );
}
