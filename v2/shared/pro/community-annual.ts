import type { ProData } from "./types";
import type { CommunityActivity, CommunityMember, CommunitySponsor } from "./community-types";
import {
  communityLedger,
  communityOps,
  isActiveMember,
  isPastActivity,
  openTasks,
  shiftMinutes,
} from "./community";
import { courseActivities, courseMemoryNumbers, courseRange, type CourseRange } from "./community-registry";
import { averageRating, ratingSummary } from "./community-feedback";
import { cohortComparison, type CohortComparison } from "./community-cohort";
import { handoverProgress } from "./community-handover";
import {
  boardSigners,
  decimalLabel,
  documentDate,
  documentShell,
  escapeHtml,
  signaturesHtml,
} from "./community-docs";
import { localDate, money } from "./format";

/**
 * Memoria anual del curso (motor "community").
 *
 * El resumen del año que se presenta en la asamblea y que se queda para la
 * junta que entra: socios, actividades con su asistencia y su nota, horas
 * certificables, voluntariado, dinero, patrocinadores, acuerdos, lo que queda
 * abierto y cómo va el relevo. Se prepara con los datos del curso en marcha
 * hasta hoy.
 */

export type CourseYearNumbers = {
  course: CourseRange;
  /** Último día contado (hoy). */
  until: string;
  members: number;
  newMembers: number;
  newViaFranky: number;
  leftMembers: number;
  activities: CommunityActivity[];
  attendance: number;
  verified: number;
  /** Media de asistentes por actividad. */
  avgAttendance: number;
  /** Horas para créditos certificadas: horas de cada actividad por asistente. */
  ectsHours: number;
  volunteerHours: number;
  volunteers: number;
  reach: number;
  rating: { avg: number; count: number };
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  sponsors: CommunitySponsor[];
  sponsorCents: number;
  redemptions: number;
  agreements: { date: string; meeting: string; text: string }[];
  openTasks: { title: string; owner: string; due: string }[];
  retention: CohortComparison;
  handover: { done: number; total: number; pending: string[] };
};

export function courseYearNumbers(data: ProData, now: Date): CourseYearNumbers {
  const course = courseRange(now);
  const until = localDate(now);
  const members = data.communityMembers as CommunityMember[];
  const acts = courseActivities(data.activities as CommunityActivity[], course);
  const memo = courseMemoryNumbers(acts, members);
  const inCourse = (iso: string) => {
    const d = localDate(iso);
    return d >= course.from && d <= until;
  };

  // Voluntariado: turnos cubiertos en actividades ya hechas del curso.
  const past = (data.activities as CommunityActivity[]).filter(
    (a) => isPastActivity(a, now) && inCourse(a.date),
  );
  let volunteerMinutes = 0;
  const volunteerIds = new Set<string>();
  for (const a of past) {
    for (const s of a.shifts ?? []) {
      volunteerMinutes += shiftMinutes(s) * s.people.length;
      s.people.forEach((p) => volunteerIds.add(p));
    }
  }

  const ops = communityOps(data);
  const ledger = communityLedger(data, now);
  const sponsors = (data.sponsors as CommunitySponsor[]).filter((s) => s.status === "active");
  const joined = members.filter((m) => inCourse(m.joinedAt));
  const handover = handoverProgress(ops.handover);

  return {
    course,
    until,
    members: members.filter(isActiveMember).length,
    newMembers: joined.length,
    newViaFranky: joined.filter((m) => m.viaFranky).length,
    leftMembers: members.filter((m) => m.leftAt && inCourse(m.leftAt)).length,
    activities: acts,
    attendance: memo.attendance,
    verified: memo.verified,
    avgAttendance: acts.length ? Math.round(memo.attendance / acts.length) : 0,
    ectsHours: acts.reduce((acc, a) => acc + (a.ectsHours ?? 0) * a.checkedIn, 0),
    volunteerHours: Math.round(volunteerMinutes / 6) / 10,
    volunteers: volunteerIds.size,
    reach: acts.reduce((acc, a) => acc + (a.reachOutside ?? 0), 0),
    rating: averageRating(acts),
    incomeCents: ledger.incomeCents,
    expenseCents: ledger.expenseCents,
    balanceCents: ledger.balanceCents,
    sponsors,
    sponsorCents: sponsors.reduce((acc, s) => acc + s.amountCents, 0),
    redemptions: sponsors.reduce((acc, s) => acc + s.redemptions, 0),
    agreements: ops.assemblies
      .filter((a) => a.status === "cerrada" && inCourse(a.date))
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((a) =>
        a.agenda
          .filter((i) => i.agreement && i.result !== "rejected")
          .map((i) => ({ date: a.date, meeting: a.title, text: i.agreement ?? "" })),
      ),
    openTasks: openTasks(ops.tasks).map((t) => ({ title: t.title, owner: t.owner, due: t.due })),
    retention: cohortComparison(data, now),
    handover: {
      done: handover.done,
      total: handover.total,
      pending: handover.pending.map((i) => i.label),
    },
  };
}

/** Frases del año calculadas con los datos, sin adornos. */
export function courseHighlights(n: CourseYearNumbers): string[] {
  const out: string[] = [];
  const top = [...n.activities].sort((a, b) => b.checkedIn - a.checkedIn)[0];
  if (top) out.push(`La actividad con más gente fue ${top.title}, con ${top.checkedIn} asistentes con check-in.`);
  const best = [...n.activities]
    .map((a) => ({ a, r: ratingSummary(a) }))
    .filter((x) => x.r.count >= 5)
    .sort((x, y) => y.r.avg - x.r.avg || y.r.count - x.r.count)[0];
  if (best) {
    out.push(`La mejor valorada fue ${best.a.title}: ${decimalLabel(best.r.avg)} de 5 con ${best.r.count} notas.`);
  }
  if (n.newMembers) {
    out.push(
      `Entraron ${n.newMembers} socios nuevos` +
        (n.newViaFranky ? `, ${n.newViaFranky} de ellos llegaron por Franky.` : "."),
    );
  }
  const r = n.retention;
  if (r.current.joined) {
    const prev = r.previous ? ` El curso anterior, a estas alturas, era el ${r.previous.pct[1]} %.` : "";
    out.push(
      `De los socios nuevos, el ${r.current.pct[1]} % ha vuelto a una segunda actividad.${prev}`,
    );
  }
  if (n.ectsHours) out.push(`Las actividades con créditos suman ${n.ectsHours} horas certificables.`);
  return out;
}

export function annualReportHtml(data: ProData, now: Date): string {
  const e = escapeHtml;
  const n = courseYearNumbers(data, now);
  const { president, secretary } = boardSigners(data);
  const highlights = courseHighlights(n);

  const actRows = n.activities
    .map((a) => {
      const r = ratingSummary(a);
      return `<tr><td>${e(documentDate(a.date))}</td><td>${e(a.title)}</td>` +
        `<td class="num">${a.checkedIn}</td><td class="num">${a.ectsHours ? `${a.ectsHours} h` : ""}</td>` +
        `<td class="num">${r.count ? `${e(decimalLabel(r.avg))} (${r.count})` : ""}</td></tr>`;
    })
    .join("");
  const sponsorRows = n.sponsors
    .map(
      (s) => `<tr><td>${e(s.business)}</td><td>${e(s.packageName)}</td>` +
        `<td class="num">${e(money(s.amountCents))}</td><td class="num">${s.redemptions}</td></tr>`,
    )
    .join("");
  const agreementRows = n.agreements
    .map((a) => `<tr><td>${e(documentDate(a.date))}</td><td>${e(a.text)}<br><span class="muted">${e(a.meeting)}</span></td></tr>`)
    .join("");
  const taskRows = n.openTasks
    .map((t) => `<tr><td>${e(t.title)}</td><td>${e(t.owner)}</td><td>${e(documentDate(`${t.due}T12:00:00Z`))}</td></tr>`)
    .join("");
  const retention = n.retention.current;
  const prev = n.retention.previous;

  const summary = `<section class="page">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(n.course.label)}</p>
  <h1>Memoria del curso ${e(n.course.label)}</h1>
  <p class="lead">Lo que ha hecho la asociación entre el ${e(documentDate(`${n.course.from}T12:00:00Z`))} y el ${e(documentDate(`${n.until}T12:00:00Z`))}, con la asistencia registrada con check-in en Franky.</p>
  <div class="kpis">
    <div><b>${n.members}</b><span>socios activos</span></div>
    <div><b>${n.newMembers}</b><span>socios nuevos</span></div>
    <div><b>${n.activities.length}</b><span>actividades hechas</span></div>
    <div><b>${n.attendance}</b><span>asistencias con check-in</span></div>
  </div>
  <div class="kpis">
    <div><b>${n.avgAttendance}</b><span>asistentes de media</span></div>
    <div><b>${n.rating.count ? `${e(decimalLabel(n.rating.avg))} de 5` : "Sin notas"}</b><span>${n.rating.count ? `nota media de ${n.rating.count} asistentes` : "valoración de los asistentes"}</span></div>
    <div><b>${e(decimalLabel(n.volunteerHours))} h</b><span>de voluntariado de ${n.volunteers} personas</span></div>
    <div><b>${n.reach.toLocaleString("es-ES")}</b><span>estudiantes de fuera vieron las actividades</span></div>
  </div>
  ${highlights.length ? `<h2>Lo más destacado</h2>${highlights.map((h) => `<p>${e(h)}</p>`).join("")}` : ""}
  ${retention.joined ? `<h2>Socios nuevos que vuelven</h2>
  <table><thead><tr><th>Socios nuevos</th><th class="num">Al menos 1 actividad</th><th class="num">Al menos 2</th><th class="num">Al menos 3</th></tr></thead><tbody>
  <tr><td>Curso ${e(retention.course.label)} (${retention.joined})</td><td class="num">${retention.pct[0]} %</td><td class="num">${retention.pct[1]} %</td><td class="num">${retention.pct[2]} %</td></tr>
  ${prev ? `<tr><td>Curso ${e(prev.course.label)}, mismas fechas (${prev.joined})</td><td class="num">${prev.pct[0]} %</td><td class="num">${prev.pct[1]} %</td><td class="num">${prev.pct[2]} %</td></tr>` : ""}
  </tbody></table>` : ""}
</section>`;

  const detail = `<section class="page">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(n.course.label)}</p>
  <h1>Actividades y dinero</h1>
  ${actRows ? `<table><thead><tr><th>Fecha</th><th>Actividad</th><th class="num">Asistentes</th><th class="num">Créditos</th><th class="num">Nota</th></tr></thead><tbody>${actRows}</tbody></table>` : "<p class=\"muted\">Aún no hay actividades cerradas este curso.</p>"}
  <h2>Caja del curso</h2>
  <table><tbody>
    <tr><td>Ingresos</td><td class="num">${e(money(n.incomeCents))}</td></tr>
    <tr><td>Gastos</td><td class="num">${e(money(n.expenseCents))}</td></tr>
    <tr class="total"><td>Saldo a ${e(documentDate(`${n.until}T12:00:00Z`))}</td><td class="num">${e(money(n.balanceCents))}</td></tr>
  </tbody></table>
  ${sponsorRows ? `<h2>Patrocinadores</h2><table><thead><tr><th>Negocio</th><th>Acuerdo</th><th class="num">Aportación</th><th class="num">Canjes</th></tr></thead><tbody>${sponsorRows}</tbody></table>` : ""}
</section>`;

  const next = `<section class="page">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(n.course.label)}</p>
  <h1>Para la junta que entra</h1>
  ${agreementRows ? `<h2>Acuerdos del curso</h2><table><tbody>${agreementRows}</tbody></table>` : ""}
  ${taskRows ? `<h2>Tareas abiertas</h2><table><thead><tr><th>Tarea</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>${taskRows}</tbody></table>` : "<p>No quedan tareas abiertas.</p>"}
  ${n.handover.total ? `<h2>Relevo</h2><p>${n.handover.done} de ${n.handover.total} pasos del último relevo hechos.${n.handover.pending.length ? ` Pendientes: ${e(n.handover.pending.join(", "))}.` : ""}</p>` : ""}
  <p>Documento preparado el ${e(documentDate(now.toISOString()))}.</p>
  ${signaturesHtml(secretary, president)}
</section>`;

  return documentShell(`Memoria del curso ${n.course.label}`, [summary, detail, next].join("\n"));
}

/** Marca del archivo para la memoria de un curso ("memoria-curso:26/27"). */
export function annualReportTag(course: CourseRange): string {
  return `memoria-curso:${course.label}`;
}
