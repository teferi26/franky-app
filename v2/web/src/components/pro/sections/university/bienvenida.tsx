"use client";

import * as React from "react";
import { Check, Download, GraduationCap, MapPin, MonitorUp, Plus, Printer, Stamp, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import { addDays, atLocal, dayLabel, localDate, pct, relative, time } from "@/lib/pro/format";
import { newSurvey, surveyResults, uniExtrasOf, withUniExtras } from "@/lib/pro/university";
import type { UniWelcomeStop } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, Drawer, Empty, FormField, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Segmented, Tip, inputClass } from "../../kit";
import { ProjectorScreen, printPoster, renderPoster } from "./stop-tools";
import { HiddenGroup, ToggleRow, useUniAction } from "./ui";

type Kind = "bienvenida" | "erasmus";

export default function UniversityBienvenida() {
  const { data, now } = usePro();
  const [kind, setKind] = React.useState<Kind>("bienvenida");
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [projecting, setProjecting] = React.useState<UniWelcomeStop | null>(null);

  const extras = uniExtrasOf(data);
  const stops = (data.uniWelcome as UniWelcomeStop[]).slice().sort((a, b) => a.date.localeCompare(b.date));
  const shown = stops.filter((s) => (s.kind ?? "bienvenida") === kind);
  const welcome = data.uniMetrics.find((m) => m.key === "welcome");
  const checkins = stops.reduce((a, s) => a + s.checkins, 0);
  const nowIso = now.toISOString();
  const next = stops.find((s) => s.date >= nowIso);
  const done = stops.filter((s) => s.date < nowIso);
  const avgFill = done.length ? Math.round(done.reduce((a, s) => a + pct(s.checkins, s.capacity), 0) / done.length) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Bienvenida"
        title="Pasaporte de bienvenida"
        description={`${welcome ? `El ${welcome.value} % de primero ya ha ido a alguna actividad. ` : ""}${checkins.toLocaleString("es-ES")} check-ins en ${stops.length} paradas.${next ? ` La siguiente, ${relative(next.date, now.getTime())}.` : ""}`}
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nueva parada
          </Button>
        }
      >
        <Segmented<Kind>
          label="Pasaporte"
          value={kind}
          onChange={setKind}
          options={[
            { value: "bienvenida", label: "Primer curso", count: stops.filter((s) => (s.kind ?? "bienvenida") === "bienvenida").length },
            { value: "erasmus", label: "Erasmus", count: stops.filter((s) => s.kind === "erasmus").length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={GraduationCap} label="Primero que ha participado" value={welcome ? `${welcome.value} %` : "0 %"} hint="Al menos una parada" emphasis />
        <Kpi icon={Stamp} label="Check-ins" value={checkins.toLocaleString("es-ES")} hint="Uno por persona y parada" />
        <Kpi
          icon={Users}
          label="Pasaportes completos"
          value={extras.passport.completed.toLocaleString("es-ES")}
          hint={`Con ${extras.passport.goal} paradas o más`}
        />
        <Kpi icon={MapPin} label="Próxima parada" value={next ? relative(next.date, now.getTime()) : "Ninguna"} hint={next?.title ?? `Ocupación media ${avgFill} %`} />
      </KpiRow>

      {welcome ? (
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-text-muted">Primero que ha pasado por alguna parada</p>
              <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{welcome.value} %</p>
            </div>
            <p className="text-sm text-text-muted">
              Objetivo del curso: <span className="font-semibold text-text-primary">70 %</span>
            </p>
          </div>
          <div className="relative mt-3">
            <Meter value={welcome.value} max={100} className="h-2.5" />
            <span className="absolute top-[-3px] h-4 w-0.5 rounded bg-text-primary" style={{ left: "70%" }} aria-hidden />
          </div>
        </Panel>
      ) : null}

      {shown.length ? (
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s, i) => {
            const past = s.date < nowIso;
            const today = localDate(s.date) === localDate(now);
            const survey = s.survey ? surveyResults(s.survey) : null;
            return (
              <li key={s.id} className="animate-list-in" style={{ "--i": i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  className="flex h-full w-full flex-col gap-4 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-text-primary/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed font-heading text-sm font-bold tabular",
                        past ? "border-violet text-violet" : "border-border text-text-muted",
                      )}
                      aria-hidden
                    >
                      {past ? <Check className="h-5 w-5" strokeWidth={2.4} /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {today ? <Pill tone="success">Hoy</Pill> : past ? <Pill>Hecha</Pill> : <Pill tone="info">{relative(s.date, now.getTime())}</Pill>}
                        {s.titleEn ? <Pill>ES · EN</Pill> : null}
                      </div>
                      <h3 className="mt-1.5 font-heading text-base font-bold leading-snug">{s.title}</h3>
                      {s.titleEn ? <p className="truncate text-xs text-text-muted" lang="en">{s.titleEn}</p> : null}
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {dayLabel(s.date, { weekday: true })}, {time(s.date)} · {s.place}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <div className="mb-1 flex justify-between text-xs text-text-muted">
                      <span>{past || today ? `${s.checkins.toLocaleString("es-ES")} check-ins` : `${s.capacity.toLocaleString("es-ES")} plazas`}</span>
                      <span className="tabular">{past || today ? `${pct(s.checkins, s.capacity)} %` : "Abierta"}</span>
                    </div>
                    <Meter value={s.checkins} max={s.capacity} tone={past ? "success" : "violet"} />
                    {survey && !survey.hidden ? (
                      <p className="mt-2 text-xs text-text-muted">
                        Al <span className="font-semibold text-text-primary tabular">{survey.rows[0].pct} %</span> le ha servido mucho
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
          <Empty
            icon={Stamp}
            title={kind === "erasmus" ? "Aún no hay paradas para Erasmus" : "Aún no hay paradas"}
            body="Crea la primera parada del pasaporte. Cada una tiene su QR: el estudiante lo escanea y suma el sello. Proyéctalo en la entrada o imprime el cartel."
            action={
              <Button variant="dark" onClick={() => setCreating(true)}>
                Nueva parada
              </Button>
            }
          />
        </div>
      )}

      <PerksPanel />

      <Tip title="Por qué funciona el pasaporte">
        Quien completa {extras.passport.goal} paradas ha conocido su facultad, la biblioteca y alguna asociación antes de octubre, y se lleva las ventajas de los comercios del campus. Es lo que más ayuda a que no abandonen en primero.
      </Tip>

      <StopDrawer id={open} onClose={() => setOpen(null)} onProject={(s) => setProjecting(s)} />
      <NewStopDrawer open={creating} onClose={() => setCreating(false)} defaultKind={kind} />
      {projecting ? <ProjectorScreen stop={projecting} onClose={() => setProjecting(null)} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comercios del campus en el pasaporte                                */
/* ------------------------------------------------------------------ */

function PerksPanel() {
  const { data } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const perks = [...extras.perks].sort((a, b) => a.walkMinutes - b.walkMinutes);
  const enabled = perks.filter((p) => p.enabled);
  const redeemed = enabled.reduce((a, p) => a + p.redeemed, 0);

  const toggle = (id: string, on: boolean) =>
    run(
      "welcome.perk",
      (d) => withUniExtras(d, (x) => ({ ...x, perks: x.perks.map((p) => (p.id === id ? { ...p, enabled: on } : p)) })),
      on ? "Añadido al pasaporte" : "Quitado del pasaporte",
      on ? "Quien complete el pasaporte verá esta ventaja." : undefined,
    );

  return (
    <Panel
      title="Comercios del campus en el pasaporte"
      description={
        perks.length
          ? `Negocios de Franky cerca del campus premian a quien completa el pasaporte. Tú eliges cuáles. ${enabled.length ? `Llevan ${redeemed.toLocaleString("es-ES")} ventajas canjeadas.` : ""}`
          : undefined
      }
      flush
    >
      {perks.length ? (
        <ul className="divide-y divide-border-light">
          {perks.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Store className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {p.slug ? (
                    <a href={`/n/${p.slug}`} target="_blank" rel="noreferrer" className="hover:underline">
                      {p.business}
                    </a>
                  ) : (
                    p.business
                  )}
                  <span className="font-normal text-text-muted"> · {p.perk}</span>
                </p>
                <p className="truncate text-xs text-text-muted">
                  {p.sector}, a {p.walkMinutes} min andando{p.enabled && p.redeemed ? ` · ${p.redeemed.toLocaleString("es-ES")} canjeadas` : ""}
                </p>
              </div>
              <Switch checked={p.enabled} onCheckedChange={(on) => toggle(p.id, on)} aria-label={`Incluir ${p.business} en el pasaporte`} />
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={Store}
          title="Aún no hay comercios cerca del campus"
          body="Cuando cafeterías, bares o gimnasios de Franky cerca de tu campus ofrezcan una ventaja para el pasaporte, aparecerán aquí para que elijas cuáles incluir."
        />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de la parada                                                  */
/* ------------------------------------------------------------------ */

function StopDrawer({ id, onClose, onProject }: { id: string | null; onClose: () => void; onProject: (s: UniWelcomeStop) => void }) {
  const { data, now } = usePro();
  const toast = useToast();
  const [poster, setPoster] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const s = (data.uniWelcome as UniWelcomeStop[]).find((x) => x.id === id);

  React.useEffect(() => setPoster(null), [id]);

  if (!s) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Parada">
        <span />
      </Drawer>
    );
  }

  const past = s.date < now.toISOString();
  const survey = s.survey ? surveyResults(s.survey) : null;
  const filename = `cartel-${(s.code ?? s.id).toLowerCase()}.png`;

  const makePoster = async () => {
    setBusy(true);
    try {
      setPoster(await renderPoster(s, data.space.name, data.space.slug));
    } catch {
      toast.error("No se ha podido crear el cartel", "Prueba otra vez o desde otro navegador.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={s.title}
      description={`${dayLabel(s.date)} a las ${time(s.date)} · ${s.place}`}
      footer={
        <>
          <Button variant="outline" onClick={makePoster} disabled={busy}>
            <Printer className="h-4 w-4" /> {poster ? "Rehacer cartel" : "Cartel A4"}
          </Button>
          <Button
            variant="dark"
            onClick={() => {
              onProject(s);
              onClose();
            }}
          >
            <MonitorUp className="h-4 w-4" /> Proyectar check-in
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {poster ? (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-border p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={poster} alt={`Cartel A4 de ${s.title}`} className="w-full max-w-[280px] rounded-lg border border-border shadow-card" />
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="dark">
                <a href={poster} download={filename}>
                  <Download className="h-4 w-4" /> Descargar PNG
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!printPoster(poster, s.title)) toast.error("El navegador ha bloqueado la ventana", "Permite ventanas emergentes o descarga el PNG.");
                }}
              >
                <Printer className="h-4 w-4" /> Imprimir o guardar PDF
              </Button>
            </div>
          </section>
        ) : (
          <p className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm text-text-secondary">
            En la entrada, proyecta el check-in: el QR cambia cada 30 segundos y el contador sube solo. Para las paredes, imprime el cartel A4.
          </p>
        )}

        <div className="divide-y divide-border-light">
          <Detail label="Código">{s.code ?? s.id.toUpperCase()}</Detail>
          <Detail label="Check-ins">{s.checkins.toLocaleString("es-ES")}</Detail>
          <Detail label="Plazas">{s.capacity.toLocaleString("es-ES")}</Detail>
          <Detail label="Ocupación">{pct(s.checkins, s.capacity)} %</Detail>
          <Detail label="Estado">{past ? "Hecha" : "Por delante"}</Detail>
          {s.titleEn ? <Detail label="En inglés">{s.titleEn}</Detail> : null}
        </div>
        <Meter value={s.checkins} max={s.capacity} tone={past ? "success" : "violet"} />

        {survey && s.survey ? (
          <section className="rounded-2xl border border-border p-4">
            <p className="font-heading text-sm font-bold">{s.survey.question}</p>
            <p className="text-xs text-text-muted">Una pregunta al hacer check-in. {survey.total.toLocaleString("es-ES")} respuestas.</p>
            {survey.hidden ? (
              <p className="mt-3 text-sm text-text-muted">
                {past ? <HiddenGroup /> : "Las respuestas aparecen aquí cuando empiece la parada."}
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {survey.rows.map((r, i) => (
                  <li key={r.label} className="text-sm">
                    <div className="mb-1 flex justify-between gap-3">
                      <span>{r.label}</span>
                      <span className="font-semibold tabular">{r.pct} %</span>
                    </div>
                    <Meter value={r.count} max={survey.total} tone={i === 2 ? "warning" : i === 0 ? "success" : "violet"} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva parada                                                        */
/* ------------------------------------------------------------------ */

function NewStopDrawer({ open, onClose, defaultKind }: { open: boolean; onClose: () => void; defaultKind: Kind }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const [title, setTitle] = React.useState("");
  const [titleEn, setTitleEn] = React.useState("");
  const [date, setDate] = React.useState(addDays(localDate(now), 3));
  const [hour, setHour] = React.useState("12:00");
  const [place, setPlace] = React.useState("");
  const [capacity, setCapacity] = React.useState("300");
  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [survey, setSurvey] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setTitleEn("");
    setDate(addDays(localDate(now), 3));
    setHour("12:00");
    setPlace("");
    setCapacity("300");
    setKind(defaultKind);
    setSurvey(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = title.trim().length > 3 && place.trim().length > 2 && Number(capacity) > 0;

  const save = async () => {
    const [h, m] = hour.split(":").map(Number);
    const count = (data.uniWelcome as UniWelcomeStop[]).filter((s) => (s.kind ?? "bienvenida") === kind).length + 1;
    const stop: UniWelcomeStop = {
      id: localId("w"),
      title: title.trim(),
      titleEn: titleEn.trim() || undefined,
      date: atLocal(date, (h || 0) * 60 + (m || 0)),
      place: place.trim(),
      checkins: 0,
      capacity: Number(capacity),
      kind,
      code: `${kind === "erasmus" ? "ERAS" : "BIEN"}-${String(count).padStart(2, "0")}`,
      survey: survey ? newSurvey() : undefined,
    };
    const ok = await run(
      "welcome.create",
      (d) => ({ ...d, uniWelcome: [...d.uniWelcome, stop] }),
      "Parada creada",
      "Ya tiene su QR de check-in y aparece en el pasaporte de los estudiantes.",
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva parada"
      description="Cada parada tiene su QR de check-in."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          Crear parada
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Pasaporte">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={[
              { value: "bienvenida", label: "Primer curso" },
              { value: "erasmus", label: "Erasmus" },
            ]}
          />
        </FormField>
        <FormField label="Actividad" htmlFor="st-title">
          <input id="st-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Visita a la biblioteca general" />
        </FormField>
        <FormField label={kind === "erasmus" ? "Nombre en inglés" : "Nombre en inglés (opcional)"} htmlFor="st-title-en" hint="Lo ven los internacionales que usan Franky en inglés.">
          <input id="st-title-en" lang="en" className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Main library tour" />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha" htmlFor="st-date">
            <input id="st-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Hora" htmlFor="st-hour">
            <input id="st-hour" type="time" className={inputClass} value={hour} onChange={(e) => setHour(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Lugar" htmlFor="st-place">
          <input id="st-place" className={inputClass} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Plaza central del campus" />
        </FormField>
        <FormField label="Plazas" htmlFor="st-cap">
          <input id="st-cap" type="number" min={1} inputMode="numeric" className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FormField>
        <ToggleRow
          id="st-survey"
          label="Encuesta de una pregunta"
          hint="“¿Qué te ha parecido?” con tres respuestas al hacer check-in."
          checked={survey}
          onChange={setSurvey}
        />
      </div>
    </Drawer>
  );
}
