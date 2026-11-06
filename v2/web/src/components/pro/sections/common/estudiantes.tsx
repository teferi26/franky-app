"use client";

import * as React from "react";
import { BadgeCheck, CalendarRange, Eye, MapPin, MessageSquareReply, Pause, Play, Sparkles, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProCampaign, ProEngine, ProOffer } from "@/lib/pro/types";
import { money, pct, relative } from "@/lib/pro/format";
import { frankyMonth, weeklyFranky } from "@/lib/pro/results";
import { hasSection } from "@/lib/pro/verticals";
import { cn } from "@/lib/utils";
import { Bars, Drawer, Empty, Kpi, KpiRow, LiveDot, Meter, PageHeader, Panel, Pill, Segmented, Tip, textareaClass } from "../../kit";
import { OfferComposer, type OfferPreset } from "./offer-composer";
import { GroupRequests } from "./grupos";

type Tab = "resultados" | "ofertas" | "calendario" | "grupos" | "resenas" | "ficha";

/** Con qué comparar lo que trae Franky, según el sector. Cifras públicas de cada competidor. */
const COMPETITOR: Record<ProEngine, { name: string; rule: string; rate: number }> = {
  agenda: { name: "Booksy", rule: "cobra el 30 % de la primera visita de cada cliente nuevo", rate: 0.3 },
  tables: { name: "TheFork", rule: "cobra de 1,5 a 4 € por cada comensal que reserva", rate: 0.08 },
  night: { name: "Fever", rule: "se queda entre el 15 y el 30 % de cada entrada", rate: 0.15 },
  classes: { name: "las apps de reservas", rule: "cobran hasta un 4 % por reserva y se quedan con tu cliente", rate: 0.04 },
  courts: { name: "Playtomic", rule: "cobra un 4 % por reserva y el jugador paga 0,99 € por partido", rate: 0.04 },
  housing: { name: "HousingAnywhere", rule: "cobra al propietario el 8 % del contrato", rate: 0.08 },
  community: { name: "Eventbrite", rule: "cobra un 6 % por entrada vendida", rate: 0.06 },
  university: { name: "otras plataformas", rule: "cobran por estudiante y año", rate: 0 },
};

export default function EstudiantesSection() {
  const { data, vertical } = usePro();
  const showGroups = !hasSection(vertical.id, "grupos") && data.groupRequests.length > 0;
  const [tab, setTab] = React.useState<Tab>("resultados");
  const liveCount = data.offers.filter((o) => o.status === "live").length;

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "resultados", label: "Resultados" },
    { value: "ofertas", label: "Ofertas", count: liveCount },
    { value: "calendario", label: "Calendario académico" },
    ...(showGroups ? [{ value: "grupos" as const, label: "Grupos", count: data.groupRequests.filter((g) => g.status === "new").length }] : []),
    { value: "resenas", label: "Reseñas" },
    { value: "ficha", label: "Cómo te ven" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Estudiantes"
        title="Lo que Franky hace por ti"
        description={`Tu ficha, tus ofertas y tus resultados con los estudiantes de ${data.space.campus}. Sin comisión por cliente.`}
      >
        <Segmented<Tab> label="Apartados" value={tab} onChange={setTab} options={tabs} />
      </PageHeader>
      {tab === "resultados" ? <Results /> : null}
      {tab === "ofertas" ? <Offers /> : null}
      {tab === "calendario" ? <Calendar /> : null}
      {tab === "grupos" ? <GroupRequests compact /> : null}
      {tab === "resenas" ? <Reviews /> : null}
      {tab === "ficha" ? <Profile /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Results() {
  const { data, now, vertical } = usePro();
  const month = frankyMonth(data, now);
  const results = month.results;
  const weeks = weeklyFranky(data, now, 8);
  const comp = COMPETITOR[vertical.engine];
  const lastWeek = weeks[weeks.length - 1];
  const frankyShare = lastWeek && lastWeek.total ? Math.round((lastWeek.value / lastWeek.total) * 100) : 0;
  const people = month.people;
  const revenue = month.revenueCents;
  const saved = vertical.engine === "agenda" ? month.agendaSavedCents : Math.round(revenue * comp.rate);
  const sources = Object.entries(results.bySource).sort((a, b) => b[1] - a[1]);
  const totalSources = sources.reduce((a, [, n]) => a + n, 0);
  const SOURCE_LABEL: Record<string, string> = { franky: "Tu ficha en Franky", hueco: "Huecos relámpago", card: "Franky Card", grupo: "Grupos" };

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-5 rounded-3xl bg-bg-dark p-6 text-white md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">Últimos 30 días</p>
          <p className="mt-3 font-heading text-5xl font-extrabold tracking-[-0.03em] tabular md:text-6xl">{people}</p>
          <p className="mt-1 text-white/70">personas han llegado a {data.space.name} por Franky</p>
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
            <div>
              <p className="font-heading text-2xl font-bold tabular">{money(revenue, { round: true })}</p>
              <p className="text-sm text-white/60">facturado con ellas</p>
            </div>
            <div>
              <p className="font-heading text-2xl font-bold tabular">{money(saved, { round: true })}</p>
              <p className="text-sm text-white/60">que te ahorras en comisiones (aprox.)</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-white/60">
            Con {comp.name}, que {comp.rule}, esos clientes te habrían costado dinero. Con Franky pagas tu cuota fija y ya.
          </p>
        </div>
        <div className="flex flex-col">
          <p className="text-sm text-white/70">Por Franky cada semana</p>
          <div className="mt-3 flex h-40 items-end gap-2">
            {weeks.map((w, i) => {
              const max = Math.max(1, ...weeks.map((x) => x.value));
              return (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[0.7rem] font-semibold text-white/70 tabular">{w.value}</span>
                  <div className={cn("w-full rounded-md", i === weeks.length - 1 ? "bg-violet-light" : "bg-white/20")} style={{ height: `${Math.max(4, (w.value / max) * 100)}%` }} />
                  <span className="text-[0.62rem] text-white/50">{w.label}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-white/70">
            La última semana, {frankyShare} de cada 100 {vertical.engine === "housing" ? "interesados" : "clientes"} llegaron por Franky.
          </p>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="De dónde vienen" description="Reparto de tus reservas con origen Franky.">
          {sources.length ? (
            <ul className="flex flex-col gap-3">
              {sources.map(([k, n]) => (
                <li key={k}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{SOURCE_LABEL[k] ?? k}</span>
                    {/* En porcentaje: el total del mes ya está arriba y aquí solo cuenta el reparto. */}
                    <span className="font-semibold tabular">{pct(n, totalSources)} %</span>
                  </div>
                  <Meter value={n} max={totalSources} />
                </li>
              ))}
            </ul>
          ) : (
            <Bars values={weeks.map((w) => w.value)} labels={weeks.map((w) => w.label)} />
          )}
        </Panel>
        <Panel title="Tus ofertas en marcha" description="Lo que están viendo los estudiantes ahora.">
          <LiveOffersList />
        </Panel>
      </div>
      <Tip title="Cómo lo medimos">
        Solo contamos reservas, validaciones de Franky Card y entradas que se hicieron desde Franky. Si alguien te encontró por otro sitio, no te lo atribuimos.
      </Tip>
    </div>
  );
}

function LiveOffersList() {
  const { data } = usePro();
  const live = data.offers.filter((o) => o.status === "live");
  if (!live.length) return <p className="text-sm text-text-muted">No tienes ofertas activas. Crea una en Ofertas.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border-light">
      {live.map((o) => (
        <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <LiveDot />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{o.title}</span>
            <span className="block truncate text-xs text-text-muted">{o.detail}</span>
          </span>
          <span className="shrink-0 text-right text-xs text-text-muted">
            <span className="block font-semibold text-text-primary tabular">{o.bookings}</span>
            {o.bookings === 1 ? "reserva" : "reservas"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<ProOffer["kind"], string> = {
  flash: "Relámpago",
  valley: "Hora valle",
  card: "Franky Card",
  first_visit: "Primera visita",
  group: "Grupos",
  exam: "Exámenes",
};

function Offers() {
  const { data, update } = usePro();
  const toast = useToast();
  const [composer, setComposer] = React.useState<OfferPreset>(null);
  const live = data.offers.filter((o) => o.status === "live" || o.status === "scheduled");
  const ended = data.offers.filter((o) => o.status === "ended" || o.status === "draft");
  const totals = data.offers.reduce((a, o) => ({ reach: a.reach + o.reach, bookings: a.bookings + o.bookings, revenue: a.revenue + o.revenueCents }), { reach: 0, bookings: 0, revenue: 0 });

  const toggle = async (o: ProOffer) => {
    if (!(await update("offer.toggle", (d) => ({
      ...d,
      offers: d.offers.map((x) => (x.id === o.id ? { ...x, status: x.status === "live" ? "ended" : "live" } : x)),
    })))) return;
    toast.success(o.status === "live" ? "Oferta pausada" : "Oferta activa de nuevo");
  };

  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi label="Activas" value={live.length} />
        <Kpi label="Estudiantes alcanzados" value={totals.reach.toLocaleString("es-ES")} />
        <Kpi label="Reservas conseguidas" value={totals.bookings} />
        <Kpi label="Facturado con ofertas" value={money(totals.revenue, { round: true })} emphasis />
      </KpiRow>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">Las ofertas solo las ven estudiantes verificados cerca de ti. Tú decides cuándo y cuánto.</p>
        <Button variant="dark" onClick={() => setComposer({})}>
          <Zap className="h-4 w-4" /> Nueva oferta relámpago
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {live.map((o) => (
          <OfferCard key={o.id} offer={o} onToggle={() => toggle(o)} />
        ))}
      </div>
      {ended.length ? (
        <Panel title="Terminadas" flush>
          <ul className="divide-y divide-border-light">
            {ended.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{o.detail}</span>
                  <span className="text-xs text-text-muted">{KIND_LABEL[o.kind]} · {o.reach.toLocaleString("es-ES")} alcanzados</span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular">{o.claimed}/{o.slots || o.claimed}</span>
                  <span className="text-xs text-text-muted">plazas</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <OfferComposer preset={composer} onClose={() => setComposer(null)} />
    </div>
  );
}

function OfferCard({ offer: o, onToggle }: { offer: ProOffer; onToggle: () => Promise<void> }) {
  const { pending, can } = usePro();
  const conversion = o.views ? Math.round((o.bookings / o.views) * 100) : 0;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {o.status === "live" ? <LiveDot /> : null}
            <Pill tone={o.kind === "flash" ? "violet" : "neutral"}>{KIND_LABEL[o.kind]}</Pill>
          </div>
          <h3 className="mt-2 font-heading text-base font-bold">{o.title}</h3>
          <p className="text-sm text-text-muted">{o.detail}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={pending || !can("offer.toggle")}
          aria-label={o.status === "live" ? "Pausar oferta" : "Reactivar oferta"}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary hover:text-text-primary"
        >
          {o.status === "live" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Lo vieron" value={o.views.toLocaleString("es-ES")} />
        <Stat label="Reservas" value={String(o.bookings)} />
        <Stat label="Facturado" value={money(o.revenueCents, { round: true })} />
      </div>
      {o.slots ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-text-muted">
            <span>Plazas ocupadas</span>
            <span className="tabular">{o.claimed} de {o.slots}</span>
          </div>
          <Meter value={o.claimed} max={o.slots} />
        </div>
      ) : (
        <p className="text-xs text-text-muted">Convierte el {conversion} % de quien la ve.</p>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-2 py-2">
      <p className="font-heading text-base font-bold tabular">{value}</p>
      <p className="text-[0.7rem] text-text-muted">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CAMPAIGN_STATUS: Record<ProCampaign["status"], { label: string; tone: "violet" | "success" | "warning" | "neutral" }> = {
  suggested: { label: "Sugerida", tone: "violet" },
  scheduled: { label: "Programada", tone: "warning" },
  live: { label: "En marcha", tone: "success" },
  done: { label: "Hecha", tone: "neutral" },
};

function Calendar() {
  const { data, update, pending, can } = usePro();
  const toast = useToast();
  const campaigns = data.campaigns;
  if (!campaigns.length) {
    return <Empty icon={CalendarRange} title="Sin campañas todavía" body="Te propondremos campañas para cada momento del curso." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <Tip title="Por qué funciona">
        Franky conoce el calendario de cada universidad: cuándo empiezan las clases, los exámenes, las fiestas de facultad y la llegada de Erasmus. Las campañas salen justo cuando los estudiantes lo necesitan.
      </Tip>
      <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
        {campaigns.map((c) => (
          <li key={c.id} className="relative">
            <span className={cn("absolute -left-[1.6rem] top-5 h-2.5 w-2.5 rounded-full ring-4 ring-bg-primary", c.status === "done" ? "bg-border" : c.status === "suggested" ? "bg-violet" : "bg-emerald-500")} />
            <article className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {c.moment} · {c.when}
                </p>
                <Pill tone={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</Pill>
              </div>
              <h3 className="mt-1.5 font-heading text-base font-bold">{c.title}</h3>
              <p className="mt-1 text-sm text-text-secondary">{c.idea}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-text-muted">Para: {c.audience}</span>
                {c.status === "suggested" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || !can("campaign.schedule")}
                    onClick={async () => {
                      if (!(await update("campaign.schedule", (d) => ({ ...d, campaigns: d.campaigns.map((x) => (x.id === c.id ? { ...x, status: "scheduled" } : x)) })))) return;
                      toast.success("Programación guardada");
                    }}
                  >
                    Programar
                  </Button>
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Reviews() {
  const { data, update, now, pending, can } = usePro();
  const toast = useToast();
  const [replying, setReplying] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const avg = data.reviews.length ? data.reviews.reduce((a, r) => a + r.rating, 0) / data.reviews.length : data.space.rating;
  const reviewing = data.reviews.find((r) => r.id === replying);

  return (
    <div className="flex flex-col gap-5">
      <KpiRow>
        <Kpi icon={Star} label="Nota media" value={avg === null ? "Sin reseñas" : avg.toFixed(1)} hint={`${data.space.reviewsCount} reseñas en total`} />
        <Kpi label="De estudiantes" value={`${Math.round((data.reviews.filter((r) => r.university).length / Math.max(1, data.reviews.length)) * 100)} %`} />
        <Kpi label="Sin responder" value={data.reviews.filter((r) => !r.reply).length} />
        <Kpi label="Visitas verificadas" value="100 %" hint="solo opina quien ha venido" />
      </KpiRow>
      <Panel flush>
        <ul className="divide-y divide-border-light">
          {data.reviews.map((r) => (
            <li key={r.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {r.clientName}
                  {r.university ? (
                    <Pill tone="violet">
                      <BadgeCheck className="h-3 w-3" /> {r.university.replace("Universidad de ", "").replace("Universidad ", "")}
                    </Pill>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="flex" aria-label={`${r.rating} de 5`}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={cn("h-3.5 w-3.5", i < r.rating ? "fill-amber-400 text-amber-400" : "text-border")} />
                    ))}
                  </span>
                  {relative(r.at, now.getTime())}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-text-secondary">{r.text}</p>
              {r.reply ? (
                <p className="mt-2 border-l-2 border-border pl-3 text-sm text-text-muted">Tu respuesta: {r.reply}</p>
              ) : (
                <button type="button" onClick={() => { setReplying(r.id); setText(""); }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-violet">
                  <MessageSquareReply className="h-4 w-4" /> Responder
                </button>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Drawer
        open={Boolean(reviewing)}
        onOpenChange={(v) => !v && setReplying(null)}
        title="Responder reseña"
        description={reviewing ? `A ${reviewing.clientName}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReplying(null)}>Cancelar</Button>
            <Button
              variant="dark"
              disabled={pending || !can("review.reply") || text.trim().length < 3}
              onClick={async () => {
                if (!(await update("review.reply", (d) => ({ ...d, reviews: d.reviews.map((x) => (x.id === replying ? { ...x, reply: text.trim() } : x)) })))) return;
                toast.success("Respuesta publicada");
                setReplying(null);
              }}
            >
              Publicar respuesta
            </Button>
          </>
        }
      >
        <p className="mb-3 rounded-xl bg-bg-secondary p-3 text-sm text-text-secondary">{reviewing?.text}</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className={textareaClass} placeholder="Gracias por venir..." aria-label="Tu respuesta" />
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Profile() {
  const { data, update, vertical, pending, can } = usePro();
  const toast = useToast();
  const p = data.space.publicProfile;
  const highlights = data.services.filter((s) => s.online).slice(0, 4);
  const set = async (patch: Partial<typeof p>, message: string) => {
    if (!(await update("profile.update", (d) => ({ ...d, space: { ...d.space, publicProfile: { ...d.space.publicProfile, ...patch } } })))) return;
    toast.success(message);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <Panel title="Tu ficha en Franky" description="Aparece en Ocio, en el mapa y en las búsquedas de los estudiantes de tu zona.">
          <ul className="flex flex-col divide-y divide-border-light">
            <ToggleRow
              title="Reservas desde Franky"
              detail="Los estudiantes reservan desde tu ficha y entra directo en tu agenda."
              on={p.bookingEnabled}
              disabled={pending || !can("profile.update")}
              onChange={(v) => set({ bookingEnabled: v }, v ? "Reservas activadas" : "Reservas desactivadas")}
            />
            <ToggleRow
              title="Franky Card"
              detail={`Descuento del ${p.cardDiscountPct} % a titulares de Franky Card. Apareces en el mapa de ventajas.`}
              on={p.cardEnabled}
              disabled={pending || !can("profile.update")}
              onChange={(v) => set({ cardEnabled: v }, v ? "Ya eres parte de Franky Card" : "Franky Card desactivada")}
            />
          </ul>
          {p.cardEnabled ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">Descuento Franky Card</p>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={pending || !can("profile.update")}
                    onClick={() => set({ cardDiscountPct: pct }, `Descuento del ${pct} %`)}
                    className={cn(
                      "h-10 min-w-16 rounded-xl border px-3 text-sm font-semibold tabular",
                      p.cardDiscountPct === pct ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary",
                    )}
                  >
                    {pct} %
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-muted">Desde el 5 %. Lo asume tu negocio; Franky no cobra comisión por cada uso.</p>
            </div>
          ) : null}
        </Panel>
        <Tip title="Lo que más reservas trae">
          Cinco fotos o más, precios visibles y un precio estudiante en horas valle. Una ficha completa inspira confianza a quien no te conoce todavía.
        </Tip>
      </div>

      <div>
        <p className="eyebrow mb-2 flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Así te ve un estudiante</p>
        <div className="rounded-[2rem] border border-border bg-bg-secondary p-3">
          <div className="overflow-hidden rounded-[1.5rem] bg-bg-primary shadow-card">
            <div className="flex h-36 items-end bg-[linear-gradient(135deg,var(--color-bg-tertiary),var(--color-bg-secondary))] p-4">
              <span className="rounded-full bg-bg-primary/90 px-2.5 py-1 text-xs font-semibold">{p.photos} fotos</span>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-bold leading-tight">{data.space.name}</p>
                  <p className="text-xs text-text-muted">{vertical.label}</p>
                </div>
                {data.space.rating !== null ? (
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {data.space.rating.toFixed(1).replace(".", ",")}
                  </span>
                ) : null}
              </div>
              {data.space.walkMinutesToCampus !== null ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-text-secondary">
                  <MapPin className="h-3.5 w-3.5" /> A {data.space.walkMinutesToCampus} min andando de tu facultad
                </p>
              ) : null}
              {p.cardEnabled ? (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-text-primary px-2 py-0.5 text-[0.7rem] font-semibold text-bg-primary">
                  <Sparkles className="h-3 w-3" /> Franky Card -{p.cardDiscountPct} %
                </p>
              ) : null}
              <p className="mt-3 line-clamp-2 text-sm text-text-secondary">{p.description}</p>
              {highlights.length ? (
                <ul className="mt-3 divide-y divide-border-light text-sm">
                  {highlights.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-1.5">
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 tabular">
                        {s.studentPriceCents ? (
                          <>
                            <span className="mr-1 text-xs text-text-muted line-through">{money(s.priceCents)}</span>
                            <span className="font-semibold text-violet-deep">{money(s.studentPriceCents)}</span>
                          </>
                        ) : (
                          money(s.priceCents)
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {p.bookingEnabled ? (
                <span className="mt-4 flex h-10 items-center justify-center rounded-xl bg-text-primary text-sm font-semibold text-bg-primary">Reservar</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ title, detail, on, onChange, disabled }: { title: string; detail: string; on: boolean; onChange: (v: boolean) => Promise<void>; disabled: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-sm text-text-muted">{detail}</span>
      </span>
      <button
        type="button"
        role="switch"
        disabled={disabled}
        aria-checked={on}
        aria-label={title}
        onClick={() => onChange(!on)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-violet" : "bg-bg-tertiary")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[1.35rem]" : "translate-x-0.5")} />
      </button>
    </li>
  );
}
