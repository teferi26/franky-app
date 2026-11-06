"use client";

import * as React from "react";
import { CalendarClock, GraduationCap, MessageCircle, Printer, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProExamResult } from "@/lib/pro/classes-types";
import type { ProMember } from "@/lib/pro/types";
import { dayLabel, localDate, plural, time } from "@/lib/pro/format";
import { extrasOf, patchCare } from "@/lib/pro/classes-care";
import {
  bookRecovery,
  nextCourseLabel,
  nextCourseMessage,
  nextCourseSummary,
  recoveriesPending,
  recoveryMessage,
  recoverySlots,
  type RecoveryItem,
} from "@/lib/pro/classes-growth";
import {
  EXAM_RESULT_LABEL,
  overallPassRate,
  passRates,
  passedMessage,
  resultOf,
  setExamResult,
} from "@/lib/pro/classes-play";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import {
  Avatar,
  ChoiceChips,
  Empty,
  Meter,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
} from "../../kit";
import { Figure, escapeHtml, printSheet } from "./ui";
import { RecoveryRulesCard } from "./study";

/**
 * Lo propio de una academia dentro de Alumnos: las clases por recuperar con
 * un hueco propuesto, las plazas del curso que viene (se pregunta en julio) y
 * la tasa de aprobados medida por la propia academia.
 */

function when(startIso: string): string {
  return `el ${dayLabel(startIso, { weekday: true }).split(",")[0].toLowerCase()} a las ${time(startIso)}`;
}

/* ------------------------------------------------------------------ */
/* Recuperaciones                                                      */
/* ------------------------------------------------------------------ */

export function RecoveriesView() {
  const { data, now } = usePro();
  const items = recoveriesPending(data, now);
  const soon = items.filter((i) => i.daysLeft <= 7).length;
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Clases por recuperar"
        description={
          items.length
            ? `${plural(items.length, "clase pendiente", "clases pendientes")}${soon ? `, ${plural(soon, "caduca", "caducan")} esta semana` : ""}. Te proponemos el hueco más parecido.`
            : undefined
        }
        flush
      >
        {items.length ? (
          <ul className="divide-y divide-border-light">
            {items.map((item) => (
              <RecoveryRow key={item.recovery.id} item={item} />
            ))}
          </ul>
        ) : (
          <Empty
            icon={CalendarClock}
            title="Nadie tiene clases por recuperar"
            body={`Al marcar "no vino" en una lista, la clase queda aquí para recuperar durante ${extrasOf(data).recoveryDays} días. Se acabó la libreta.`}
          />
        )}
      </Panel>
      <RecoveryRulesCard />
    </div>
  );
}

function RecoveryRow({ item }: { item: RecoveryItem }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const slots = recoverySlots(data, item, now, 3);
  const [picked, setPicked] = React.useState(slots[0]?.id ?? "");
  const slot = slots.find((s) => s.id === picked) ?? slots[0];
  const sender = data.space.owner.firstName || data.space.name;
  const typeName = (id: string) => data.classTypes.find((c) => c.id === id)?.name ?? "Clase";
  const link = customerWhatsApp(
    item.member.phone,
    recoveryMessage(item, slot, sender, data.space.name, slot ? when(slot.start) : ""),
  );

  const book = () => {
    if (!slot) return;
    void update("recovery.book", (d) =>
      bookRecovery(d, item.member.id, item.recovery.id, slot.id, now, localId("bk")),
    );
    toast.success(
      "Recuperación apuntada",
      `${item.member.name.split(" ")[0]} va a ${typeName(slot.classTypeId)} ${when(slot.start)}.`,
    );
  };

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <Avatar name={item.member.name} size="sm" tone={item.daysLeft <= 7 ? "amber" : "sky"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.member.name}</span>
          <span className="block truncate text-xs text-text-muted">
            {item.fromType?.name ?? "Clase"} del{" "}
            {dayLabel(`${item.recovery.missedOn}T12:00:00Z`, { weekday: false })}
          </span>
        </span>
        <Pill tone={item.daysLeft <= 7 ? "warning" : "neutral"}>
          {item.daysLeft === 0 ? "Caduca hoy" : `Quedan ${plural(item.daysLeft, "día", "días")}`}
        </Pill>
      </div>
      {slots.length ? (
        <div className="flex flex-col gap-2 pl-11 sm:flex-row sm:items-center sm:justify-between">
          <ChoiceChips
            value={slot?.id ?? ""}
            onChange={setPicked}
            options={slots.map((s) => ({
              value: s.id,
              label: `${typeName(s.classTypeId)} ${time(s.start)}`,
              hint: `${dayLabel(s.start, { weekday: true }).split(",")[0]}, ${s.capacity - s.booked} libres`,
            }))}
          />
          <div className="flex shrink-0 gap-2">
            {link ? (
              <Button size="sm" variant="ghost" asChild>
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Avisar a ${item.member.name}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onClick={book}>
              Apuntar
            </Button>
          </div>
        </div>
      ) : (
        <p className="pl-11 text-xs text-text-muted">
          No hay grupos con hueco antes de que caduque. Escríbele para buscar otro día.
        </p>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Plazas del curso que viene                                          */
/* ------------------------------------------------------------------ */

type CourseFilter = "pending" | "unasked" | "confirmed" | "declined";

export function NextCourseView() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const course = nextCourseLabel(now);
  const summary = nextCourseSummary(data);
  const [filter, setFilter] = React.useState<CourseFilter>(
    summary.pending.length ? "pending" : "unasked",
  );
  const sender = data.space.owner.firstName || data.space.name;
  const total =
    summary.confirmed.length +
    summary.pending.length +
    summary.declined.length +
    summary.unasked.length;
  const list = summary[filter];

  const setAnswer = (m: ProMember, v: "confirmed" | "pending" | "declined") => {
    void update("member.next_course", (d) => patchCare(d, m.id, { nextCourse: v }));
    if (v === "confirmed")
      toast.success("Plaza confirmada", `${m.name.split(" ")[0]} sigue el curso ${course}.`);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
        <p className="eyebrow">Curso {course}</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure
            label="Confirmadas"
            value={summary.confirmed.length}
            tone="success"
            hint={
              total
                ? `${Math.round((summary.confirmed.length / total) * 100)} % de tus alumnos`
                : undefined
            }
          />
          <Figure
            label="Sin contestar"
            value={summary.pending.length}
            tone={summary.pending.length ? "warning" : undefined}
          />
          <Figure label="Sin preguntar" value={summary.unasked.length} />
          <Figure label="No siguen" value={summary.declined.length} />
        </div>
        <Meter
          value={summary.confirmed.length}
          max={Math.max(1, total)}
          className="mt-4"
          tone="success"
        />
      </section>

      <Segmented
        label="Filtro"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "pending", label: "Sin contestar", count: summary.pending.length },
          { value: "unasked", label: "Sin preguntar", count: summary.unasked.length },
          { value: "confirmed", label: "Confirmadas", count: summary.confirmed.length },
          { value: "declined", label: "No siguen", count: summary.declined.length },
        ]}
      />

      <Panel flush>
        {list.length ? (
          <ul className="divide-y divide-border-light">
            {list.map((m) => {
              const link = customerWhatsApp(
                m.phone,
                nextCourseMessage(m, sender, data.space.name, course),
              );
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar
                    name={m.name}
                    size="sm"
                    tone={filter === "confirmed" ? "emerald" : "slate"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{m.name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {m.studies ?? "Sin carrera en la ficha"}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {filter === "pending" || filter === "unasked" ? (
                      <>
                        {link ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => filter === "unasked" && setAnswer(m, "pending")}
                              aria-label={`Preguntar a ${m.name}`}
                            >
                              <MessageCircle className="h-3.5 w-3.5" /> Preguntar
                            </a>
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setAnswer(m, "confirmed")}
                        >
                          Sigue
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAnswer(m, "declined")}>
                          No sigue
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setAnswer(m, "pending")}>
                        Deshacer
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={GraduationCap}
            title={
              filter === "pending"
                ? "Nadie sin contestar"
                : filter === "unasked"
                  ? "Ya has preguntado a todos"
                  : "Nadie en esta lista"
            }
            body="En julio pregunta a cada alumno si sigue en septiembre: así sabes cuántos grupos abrir antes del verano."
          />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados de examen                                                */
/* ------------------------------------------------------------------ */

export function ResultsView() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const rates = passRates(data);
  const overall = overallPassRate(data);
  const groups = data.classTypes.filter((c) => c.active !== false);
  const [group, setGroup] = React.useState(groups[0]?.id ?? "");
  const [query, setQuery] = React.useState("");
  const ct = groups.find((g) => g.id === group);
  const sender = data.space.owner.firstName || data.space.name;
  const reviewUrl = extrasOf(data).policy.reviewUrl;
  const q = query.trim().toLowerCase();
  const students = data.members
    .filter((m) => m.status !== "cancelled")
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .slice(0, q ? 30 : 12);

  const mark = (memberId: string, result: ProExamResult["result"]) => {
    if (!ct) return;
    void update("exam.result", (d) =>
      setExamResult(d, { memberId, classTypeId: ct.id, result, on: localDate(now) }),
    );
  };

  const printBoard = () => {
    const e = escapeHtml;
    const rows = rates
      .map(
        (r) =>
          `<tr><td>${e(r.classType.name)}</td><td>${r.passed} de ${r.passed + r.failed}</td><td><strong>${r.rate ?? 0} %</strong></td></tr>`,
      )
      .join("");
    const ok = printSheet(
      "Resultados",
      "h1{font-size:30px;margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:24px;font-size:16px}" +
        "td{padding:12px 0;border-bottom:1px solid #e7e5ee}td:last-child{text-align:right}.muted{color:#6b6878;font-size:13px;margin-top:18px}",
      `<h1>${e(data.space.name)}</h1><p>Aprobados de nuestros alumnos presentados en la última convocatoria.</p>` +
        `<table>${rows}</table><p class="muted">Datos apuntados por la academia, alumno a alumno.</p>`,
    );
    if (!ok)
      toast.info("No se pudo abrir la ventana", "Permite las ventanas emergentes para imprimir.");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel
        title="Apuntar resultados"
        description={
          ct
            ? `${ct.name}: aprobó, suspendió o no se presentó. Con esto sale tu tasa de aprobados.`
            : undefined
        }
        flush
      >
        <div className="flex flex-col gap-3 border-b border-border-light px-4 py-3 sm:px-5">
          <ChoiceChips
            value={group}
            onChange={setGroup}
            options={groups.map((g) => ({ value: g.id, label: g.name }))}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar alumno" />
        </div>
        {students.length && ct ? (
          <ul className="divide-y divide-border-light">
            {students.map((m) => {
              const res = resultOf(data, m.id, ct.id);
              const link =
                res?.result === "passed"
                  ? customerWhatsApp(
                      m.phone,
                      passedMessage(m, ct.name, sender, data.space.name, reviewUrl),
                    )
                  : undefined;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                  <div className="flex items-center gap-1.5">
                    {(["passed", "failed", "absent"] as const).map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={res?.result === r ? "dark" : "outline"}
                        onClick={() => mark(m.id, r)}
                      >
                        {EXAM_RESULT_LABEL[r]}
                      </Button>
                    ))}
                    {link ? (
                      <Button size="sm" variant="secondary" asChild>
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Felicitar a ${m.name}`}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty
            icon={GraduationCap}
            title="Sin alumnos"
            body="Da de alta a tus alumnos y aquí podrás apuntar cómo les fue."
          />
        )}
      </Panel>

      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
          <p className="eyebrow">Tu tasa de aprobados</p>
          <p className="mt-2 font-heading text-4xl font-extrabold tabular">
            {overall.rate === null ? "Sin datos" : `${overall.rate} %`}
          </p>
          <p className="text-sm text-text-muted">
            {overall.presented
              ? `${overall.passed} de ${overall.presented} presentados`
              : "Apunta los resultados de tu última convocatoria."}
          </p>
          {rates.length ? (
            <ul className="mt-4 flex flex-col gap-3">
              {rates.map((r) => (
                <li key={r.classType.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{r.classType.name}</span>
                    <span className="shrink-0 font-semibold tabular">
                      {r.rate === null ? "Sin presentados" : `${r.rate} %`}
                      {r.averageGrade !== null ? (
                        <span className="font-normal text-text-muted">
                          {" "}
                          · nota {String(r.averageGrade).replace(".", ",")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Meter
                    value={r.rate ?? 0}
                    max={100}
                    className="mt-1.5"
                    tone={(r.rate ?? 0) >= 70 ? "success" : "warning"}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {rates.length ? (
            <Button className="mt-4 w-full" variant="outline" onClick={printBoard}>
              <Printer className="h-4 w-4" /> Imprimir para el tablón
            </Button>
          ) : null}
        </section>
        <Tip title="Tu mejor anuncio">
          Una tasa de aprobados medida alumno a alumno convence más que cualquier folleto. Felicita
          a cada aprobado y pídele que lo cuente en tu ficha.
        </Tip>
      </div>
    </div>
  );
}
