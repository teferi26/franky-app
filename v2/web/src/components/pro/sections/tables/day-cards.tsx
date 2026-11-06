"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Cake,
  Calculator,
  CalendarRange,
  GraduationCap,
  HeartHandshake,
  NotebookPen,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import {
  comebackMessage,
  dormantRegulars,
  birthdaysSoon,
  septemberRadar,
  valleySuggestion,
} from "@/lib/pro/tables-ops";
import {
  birthdayMessage,
  lastClosingNote,
  marginAlerts,
} from "@/lib/pro/tables-day";
import {
  examStudyHours,
  seasonMoments,
  type SeasonMoment,
} from "@/lib/pro/tables-insights";
import { useToast } from "@/components/ui/toast";
import {
  localDate,
  minutesToLabel,
  money,
  plural,
  shortDay,
  weekdayIndex,
} from "@/lib/pro/format";
import { stampsFor } from "@/lib/pro/tables";
import { cn } from "@/lib/utils";
import { Avatar, Bars, Panel, Pill, RowList, Segmented } from "../../kit";
import { sectionHref } from "../../shell";
import type { OfferPreset } from "../common/offer-composer";
import { StampDots, StudentMark } from "./table-kit";
import { WhatsAppButton, staffFirstName, useTablesOps } from "./ops-kit";

/**
 * Tarjetas de Hoy que comparten cafetería, bar y restaurante. Cada una se
 * esconde sola si no tiene nada útil que decir: Hoy no se llena de avisos
 * vacíos.
 */

/* ------------------------------------------------------------------ */
/* Nota del cierre de ayer                                             */
/* ------------------------------------------------------------------ */

export function ClosingNoteBanner() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const note = lastClosingNote(ops, localDate(now));
  if (!note) return null;
  return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-bg-primary px-4 py-3 shadow-card sm:px-5">
      <NotebookPen
        className="mt-0.5 h-4 w-4 shrink-0 text-violet"
        strokeWidth={1.9}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          Nota del cierre del {shortDay(`${note.date}T12:00:00Z`)}
          <span className="font-normal text-text-muted">
            {" "}
            · {staffFirstName(data, note.staffId)}
          </span>
        </p>
        <p className="mt-0.5 text-text-secondary">{note.note}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Horas flojas                                                        */
/* ------------------------------------------------------------------ */

const VALLEY_WINDOW = {
  cafe: { from: 16 * 60, to: 19 * 60 },
  bar: { from: 17 * 60, to: 20 * 60 },
  restaurant: { from: 15 * 60, to: 17 * 60 },
} as const;

const VALLEY_OFFER = {
  cafe: { title: "Tarde de estudio", what: "Café y dulce a precio de estudiante", priceCents: 250 },
  bar: { title: "Caña y tapa de estudiante", what: "Caña y tapa después de clase", priceCents: 250 },
  restaurant: { title: "Menú estudiante de tarde", what: "Menú del día para comer tarde", priceCents: 1190 },
} as const;

/**
 * Si una franja de la semana está muy por debajo de la hora punta, lo dice
 * con cifras de las dos últimas semanas y deja la oferta preparada.
 */
export function ValleyCard({ onOffer }: { onOffer: (preset: OfferPreset) => void }) {
  const { data, now, vertical } = usePro();
  const kind =
    vertical.id === "cafe" || vertical.id === "bar" ? vertical.id : "restaurant";
  const valley = valleySuggestion(data.validations, now, VALLEY_WINDOW[kind]);
  if (!valley) return null;
  const offer = VALLEY_OFFER[kind];
  const range = `${minutesToLabel(valley.from)} a ${minutesToLabel(valley.to)}`;
  return (
    <Panel
      title="Tus horas flojas"
      description={`De ${range} entran de media ${valley.perHour.toLocaleString("es-ES")} clientes con Card por hora. A las ${valley.peakHour}:00, ${valley.peakPerHour.toLocaleString("es-ES")}.`}
    >
      <Bars
        values={valley.byHour.map((h) => h.value)}
        labels={valley.byHour.map((h) => (h.hour % 2 ? "" : String(h.hour)))}
        highlightLast={false}
        className="h-24"
        format={(v) => `${v.toLocaleString("es-ES")} por hora`}
      />
      <p className="mt-3 text-sm text-text-secondary">
        Una oferta solo para estudiantes cercanos llena esas horas sin bajar
        el precio al resto.
      </p>
      <Button
        variant="dark"
        className="mt-3 h-11 w-full"
        onClick={() =>
          onOffer({
            title: offer.title,
            what: offer.what,
            from: valley.from,
            to: valley.to,
            priceCents: offer.priceCents,
            slots: 20,
          })
        }
      >
        <TrendingDown className="h-4 w-4" strokeWidth={1.9} /> Preparar oferta
        de {range}
      </Button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Habituales que no vienen y cumpleaños                               */
/* ------------------------------------------------------------------ */

type RegularsTab = "away" | "birthdays";

export function RegularsCard() {
  const { data, now, vertical } = usePro();
  const [tab, setTab] = React.useState<RegularsTab>("away");
  const today = localDate(now);
  const away = dormantRegulars(data, now, vertical.id === "cafe" ? 10 : 21, 8).slice(0, 5);
  const birthdays = birthdaysSoon(
    data.clients.filter((c) => c.phone && c.marketingConsent),
    today,
  ).slice(0, 5);
  if (!away.length && !birthdays.length) return null;
  const gift =
    vertical.id === "cafe"
      ? "un café"
      : vertical.id === "bar"
        ? "una caña"
        : "el postre";
  const active: RegularsTab = !away.length ? "birthdays" : !birthdays.length ? "away" : tab;
  const needed = data.loyalty?.stampsNeeded ?? 0;
  return (
    <Panel
      title="Habituales"
      description={
        active === "away"
          ? "Venían mucho y hace días que no aparecen. Un mensaje a tiempo los recupera."
          : "Cumplen años esta semana. Un detalle y vuelven con amigos."
      }
      flush
    >
      {away.length && birthdays.length ? (
        <div className="border-b border-border-light px-4 py-2.5 sm:px-5">
          <Segmented
            size="sm"
            label="Habituales"
            value={active}
            onChange={setTab}
            options={[
              { value: "away", label: "Te echan de menos", count: away.length },
              { value: "birthdays", label: "Cumpleaños", count: birthdays.length },
            ]}
          />
        </div>
      ) : null}
      <RowList>
        {active === "away"
          ? away.map(({ client, daysAway }) => {
              const stamps = needed
                ? stampsFor(data.validations, client.name, needed)
                : 0;
              return (
                <div
                  key={client.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5"
                >
                  <Avatar name={client.name} size="sm" tone="violet" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className="truncate">{client.name}</span>
                      {client.student ? (
                        <StudentMark university={client.student.university} />
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      No viene hace {plural(daysAway, "día", "días")}
                      {needed && stamps ? (
                        <>
                          {" "}
                          · <StampDots value={stamps} max={needed} />
                        </>
                      ) : null}
                    </span>
                  </span>
                  <WhatsAppButton
                    phone={client.phone}
                    message={comebackMessage(client.name, data.space.name)}
                    label="Escribirle"
                    className="w-full sm:w-auto"
                  />
                </div>
              );
            })
          : birthdays.map(({ client, inDays }) => (
              <div
                key={client.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5"
              >
                <Cake className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {client.name}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {inDays === 0
                      ? "Hoy"
                      : inDays === 1
                        ? "Mañana"
                        : `En ${inDays} días`}{" "}
                    · {plural(client.visits, "visita", "visitas")}
                  </span>
                </span>
                <WhatsAppButton
                  phone={client.phone}
                  message={birthdayMessage(client.name, data.space.name, gift)}
                  label={`Invitar a ${gift}`}
                  className="w-full sm:w-auto"
                />
              </div>
            ))}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Radar de septiembre                                                 */
/* ------------------------------------------------------------------ */

export function SeptemberRadarCard({
  onOffer,
}: {
  onOffer: (preset: OfferPreset) => void;
}) {
  const { data, now, vertical } = usePro();
  const radar = septemberRadar(data, now);
  if (!radar) return null;
  const welcome =
    vertical.id === "cafe"
      ? { what: "Primer café gratis al activar tu tarjeta de sellos", priceCents: 0 }
      : vertical.id === "bar"
        ? { what: "Caña y tapa de bienvenida a 2 €", priceCents: 200 }
        : { what: "Postre de la casa en tu primera comida", priceCents: 0 };
  return (
    <Panel
      title="Radar de septiembre"
      description="En estas semanas cada estudiante nuevo elige su sitio para todo el curso."
    >
      {radar.newStudents === 0 ? (
        <p className="text-sm text-text-secondary">
          Todavía no ha venido ningún estudiante nuevo. Una oferta de bienvenida
          te pone delante de los que acaban de llegar.
        </p>
      ) : (
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
          <dt className="text-[0.72rem] text-text-muted">Nuevos</dt>
          <dd className="font-heading text-2xl font-extrabold tabular">
            {radar.newStudents}
          </dd>
        </div>
        <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
          <dt className="text-[0.72rem] text-text-muted">Ya repiten</dt>
          <dd className="font-heading text-2xl font-extrabold tabular">
            {radar.repeat}
          </dd>
        </div>
        <div className="rounded-xl bg-bg-secondary px-2 py-2.5">
          <dt className="text-[0.72rem] text-text-muted">Con tarjeta</dt>
          <dd className="font-heading text-2xl font-extrabold tabular">
            {radar.cardMembers}
          </dd>
        </div>
      </dl>
      )}
      {radar.newStudents ? (
        <p className="mt-3 text-xs text-text-muted">
          Estudiantes que han venido por primera vez en las últimas tres semanas.
        </p>
      ) : null}
      <Button
        variant="outline"
        className="mt-3 h-11 w-full"
        onClick={() =>
          onOffer({
            title: "Bienvenida al curso",
            what: welcome.what,
            priceCents: welcome.priceCents,
            slots: 60,
          })
        }
      >
        <GraduationCap className="h-4 w-4" strokeWidth={1.9} /> Oferta de
        bienvenida
      </Button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Márgenes que avisan solos                                           */
/* ------------------------------------------------------------------ */

export function MarginAlertsCard() {
  const { data, spaceId, vertical } = usePro();
  const { ops } = useTablesOps();
  if (!ops || !vertical.nav.some((n) => n.id === "costes")) return null;
  const alerts = marginAlerts(ops, data.menu).slice(0, 3);
  if (!alerts.length) return null;
  return (
    <Panel
      title="Te está costando más"
      description={`Han subido proveedores y ${plural(alerts.length, "producto se sale", "productos se salen")} de tu objetivo del ${ops.targetFoodCostPct} %.`}
      action={
        <Link
          href={sectionHref(spaceId, "costes")}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-violet"
        >
          Márgenes <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      <RowList>
        {alerts.map((a) => (
          <div key={a.item.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Calculator
              className={cn(
                "h-4 w-4 shrink-0",
                a.foodCostPct > ops.targetFoodCostPct + 5
                  ? "text-rose-600"
                  : "text-amber-600",
              )}
              strokeWidth={1.9}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {a.item.name}
              </span>
              <span className="block truncate text-xs text-text-muted">
                {a.ingredient} +{a.risePct.toLocaleString("es-ES")} % · coste{" "}
                {a.foodCostPct.toLocaleString("es-ES")} %
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-xs text-text-muted line-through tabular">
                {money(a.item.priceCents)}
              </span>
              <span className="block text-sm font-bold tabular">
                {money(a.suggestedPriceCents)}
              </span>
            </span>
          </div>
        ))}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Bonos por servir                                                    */
/* ------------------------------------------------------------------ */

/** Consejo corto con cifra real cuando hay bonos por gastar. */
export function BonosHint() {
  const { spaceId, vertical } = usePro();
  const { ops } = useTablesOps();
  if (!ops || !vertical.nav.some((n) => n.id === "bonos")) return null;
  const live = ops.bonos.filter((b) => b.usedAt.length < b.uses);
  if (!live.length) return null;
  const pending = live.reduce((a, b) => a + b.uses - b.usedAt.length, 0);
  return (
    <Link
      href={sectionHref(spaceId, "bonos")}
      className="flex items-center gap-3 rounded-2xl border border-border bg-bg-primary px-4 py-3 text-sm shadow-card transition-colors hover:border-text-primary/20 sm:px-5"
    >
      <HeartHandshake className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{plural(live.length, "bono vivo", "bonos vivos")}</span>{" "}
        <span className="text-text-muted">
          con {plural(pending, "uso", "usos")} ya cobrados por servir
        </span>
      </span>
      <Pill tone="violet">Bonos</Pill>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Calendario del curso                                                */
/* ------------------------------------------------------------------ */

/** Oferta preparada para cada momento del curso que abre el compositor. */
function seasonOffer(moment: SeasonMoment, vertical: string): OfferPreset {
  if (moment.id === "erasmus")
    return {
      title: "Bienvenida Erasmus",
      what:
        vertical === "cafe"
          ? "Primer café a precio de estudiante"
          : "Primera consumición con tapa de bienvenida",
      slots: 40,
    };
  if (vertical === "bar")
    return {
      title: "Desconexión de exámenes",
      what: "Caña y tapa de media tarde para estudiantes",
      from: 17 * 60,
      to: 20 * 60,
      slots: 30,
    };
  return {
    title: "Menú exprés de exámenes",
    what: "Menú del día para llevar con hora de recogida",
    from: 13 * 60,
    to: 15 * 60 + 30,
    slots: 30,
  };
}

/**
 * Lo que toca preparar según el calendario de la universidad: exámenes,
 * Erasmus, cenas de Navidad de clase y graduaciones. Solo aparece en las
 * semanas en que sirve de algo.
 */
export function SeasonCard({
  onOffer,
}: {
  onOffer: (preset: OfferPreset) => void;
}) {
  const { data, now, spaceId, vertical } = usePro();
  const { ops, save } = useTablesOps();
  const toast = useToast();
  const today = localDate(now);
  const moments = seasonMoments(vertical.id, today).slice(0, 2);
  if (!moments.length) return null;
  const hours = data.space.hours[weekdayIndex(today)];

  return (
    <Panel
      title="Calendario del curso"
      description="Lo que suele pasar estas semanas en las universidades de tu zona."
      flush
    >
      <RowList>
        {moments.map((m) => {
          const study = ops?.study;
          const examCafe =
            vertical.id === "cafe" &&
            (m.id === "exams_winter" || m.id === "exams_summer");
          const extended = study
            ? examStudyHours(study, hours?.close ?? null)
            : null;
          const canExtend = Boolean(
            study?.enabled && extended && extended.toMinute > study.toMinute,
          );
          return (
            <div key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CalendarRange
                  className="h-4 w-4 shrink-0 text-violet"
                  strokeWidth={1.9}
                />
                <span className="min-w-0 flex-1">{m.title}</span>
                <Pill tone={m.phase === "now" ? "violet" : "neutral"}>
                  {m.phase === "now"
                    ? "Ahora"
                    : `En ${plural(m.inDays, "día", "días")}`}
                </Pill>
              </p>
              <p className="text-sm text-text-secondary">{m.body}</p>
              <div className="flex flex-wrap gap-2">
                {examCafe ? (
                  <>
                    {canExtend && extended ? (
                      <Button
                        size="sm"
                        variant="dark"
                        className="h-10"
                        onClick={async () => {
                          const ok = await save("study.exams", (o) =>
                            o.study ? { ...o, study: { ...o.study, ...extended } } : o,
                          );
                          if (ok)
                            toast.success(
                              "Sitio para estudiar ampliado",
                              `De ${minutesToLabel(extended.fromMinute)} a ${minutesToLabel(extended.toMinute)}.`,
                            );
                        }}
                      >
                        Abrir hasta las {minutesToLabel(extended.toMinute)}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="h-10" asChild>
                      <Link href={sectionHref(spaceId, "bonos")}>Bono de estudio</Link>
                    </Button>
                  </>
                ) : m.action.section === "grupos" ? (
                  <Button size="sm" variant="dark" className="h-10" asChild>
                    <Link href={sectionHref(spaceId, "grupos")}>{m.action.label}</Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="dark"
                    className="h-10"
                    onClick={() => onOffer(seasonOffer(m, vertical.id))}
                  >
                    {m.action.label}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}
