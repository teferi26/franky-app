import type { ProData } from "./types";
import type {
  CommunityActivity,
  CommunityArchiveDoc,
  CommunityMember,
  CommunitySponsor,
} from "./community-types";
import {
  activityAttendees,
  activityHours,
  checkedInSet,
  communityLedger,
  communityOps,
  courseLabel,
  courseStart,
  isActiveMember,
  memberHistory,
  shiftMinutes,
  type CommunityLedger,
} from "./community";
import {
  boardSessions,
  courseActivities,
  courseRange,
  representationAttendance,
  universityCommunityShare,
} from "./community-registry";
import { ratingSummary } from "./community-feedback";
import { dayLabel, localDate, money, time } from "./format";

/**
 * Documentos imprimibles de una asociación: certificados de asistencia,
 * certificado del curso, memoria de subvención, cuentas para la asamblea,
 * actas y dossier para patrocinadores.
 *
 * Cada función devuelve una página HTML completa y autónoma. La web la abre en
 * una pestaña nueva y lanza la impresión, de donde sale el PDF ("Guardar como
 * PDF"). Todo texto que viene de datos se escapa.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;

/** Texto con párrafos separados por línea en blanco. */
export function paragraphsHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${e(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

const STYLE = `
:root { --ink: #16141d; --muted: #6b6878; --line: #e4e2ea; --soft: #f5f4f8; --paper: #ffffff; }
@page { size: A4; margin: 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); background: var(--paper);
  font: 11pt/1.55 Inter, "Segoe UI", system-ui, -apple-system, sans-serif; }
.page { max-width: 178mm; margin: 0 auto; padding: 6mm 0; break-after: page; }
.page:last-child { break-after: auto; }
.eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
h1 { font-size: 22pt; line-height: 1.15; letter-spacing: -.02em; margin: 3mm 0 2mm; }
h2 { font-size: 13pt; margin: 8mm 0 2mm; }
p { margin: 0 0 3mm; }
.muted { color: var(--muted); }
.lead { font-size: 12.5pt; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 2mm 0 4mm; }
th, td { text-align: left; padding: 1.8mm 1.5mm; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 8.5pt; color: var(--muted); font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr.total td { font-weight: 700; border-bottom: 2px solid var(--ink); }
.kpis { display: flex; flex-wrap: wrap; gap: 3mm; margin: 5mm 0; }
.kpis div { flex: 1 1 35mm; border: 1px solid var(--line); border-radius: 3mm; padding: 3mm; }
.kpis b { display: block; font-size: 16pt; letter-spacing: -.01em; }
.kpis span { font-size: 8.5pt; color: var(--muted); }
.sign { display: flex; gap: 14mm; margin-top: 22mm; }
.sign div { flex: 1; border-top: 1px solid var(--ink); padding-top: 2mm; font-size: 9pt; }
.names { columns: 2; font-size: 9pt; color: var(--muted); margin: 0 0 4mm; }
.cert { display: flex; flex-direction: column; min-height: 240mm; }
.cert .body { margin-top: 18mm; font-size: 12.5pt; }
.cert .who { font-size: 20pt; font-weight: 800; letter-spacing: -.02em; margin: 6mm 0; }
footer { margin-top: auto; padding-top: 8mm; font-size: 8pt; color: var(--muted); }
@media screen {
  body { background: var(--soft); }
  .page { background: var(--paper); padding: 14mm; margin: 8mm auto; border: 1px solid var(--line); }
}
`;

function shell(title: string, pages: string): string {
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(title)}</title>`,
    `<style>${STYLE}</style>`,
    "</head>",
    `<body>${pages}</body>`,
    "</html>",
  ].join("\n");
}

function longDate(iso: string): string {
  return dayLabel(iso, { weekday: false });
}

/** 4.6 como "4,6". */
function decimal(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

function hoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = String(rounded).replace(".", ",");
  return `${text} ${rounded === 1 ? "hora" : "horas"}`;
}

type Signer = { name: string; role: string };

function signatures(secretary?: Signer, president?: Signer): string {
  return `<div class="sign">
  <div>${secretary ? `${e(secretary.name)}<br><span class="muted">${e(secretary.role)}</span>` : "La secretaría"}</div>
  <div>${president ? `Visto bueno: ${e(president.name)}<br><span class="muted">${e(president.role)}</span>` : "Visto bueno de la presidencia"}</div>
</div>`;
}

/* ------------------------------------------------------------------ */
/* Certificados de asistencia                                          */
/* ------------------------------------------------------------------ */

export type CertificatePerson = {
  name: string;
  studies: string;
  university: string;
  verified: boolean;
};

export function certificatesHtml(opts: {
  spaceName: string;
  city: string;
  activity: { title: string; date: string; place: string; hours: number; ects: boolean };
  people: CertificatePerson[];
  secretary?: Signer;
  president?: Signer;
  issuedAt: Date;
}): string {
  const a = opts.activity;
  const issued = longDate(opts.issuedAt.toISOString());
  const pages = opts.people.map((p) => {
    const hours = a.ects
      ? `${hoursLabel(a.hours)} reconocibles como créditos por actividades universitarias`
      : hoursLabel(a.hours);
    const proof = p.verified
      ? "La asistencia quedó registrada con el check-in de su cuenta universitaria verificada."
      : "La asistencia quedó registrada con el check-in de la actividad.";
    return `<section class="page cert">
  <p class="eyebrow">${e(opts.spaceName)}</p>
  <h1>Certificado de asistencia</h1>
  <div class="body">
    <p>${opts.secretary ? `${e(opts.secretary.name)}, ${e(opts.secretary.role.toLowerCase())} de ${e(opts.spaceName)},` : `La secretaría de ${e(opts.spaceName)}`} certifica que</p>
    <p class="who">${e(p.name)}</p>
    <p>estudiante de ${e(p.studies)} en la ${e(p.university)}, asistió a la actividad <b>${e(a.title)}</b>, celebrada el ${e(longDate(a.date))} a las ${e(time(a.date))} en ${e(a.place)}, con una duración de ${e(hours)}.</p>
    <p class="muted">${e(proof)}</p>
    <p>Y para que conste, se firma en ${e(opts.city)}, el ${e(issued)}.</p>
  </div>
  ${signatures(opts.secretary, opts.president)}
  <footer>Emitido con Franky Pro.</footer>
</section>`;
  });
  return shell(`Certificados: ${a.title}`, pages.join("\n"));
}

/* ------------------------------------------------------------------ */
/* Certificado del curso de un socio                                   */
/* ------------------------------------------------------------------ */

export function memberCertificateHtml(opts: {
  spaceName: string;
  city: string;
  course: string;
  member: { name: string; studies: string; university: string; joinedAt: string };
  attended: { title: string; date: string; hours: number; ects: boolean }[];
  shifts: { title: string; date: string; role: string; hours: number }[];
  ectsHours: number;
  volunteerHours: number;
  secretary?: Signer;
  president?: Signer;
  issuedAt: Date;
}): string {
  const m = opts.member;
  const rows = opts.attended
    .map(
      (x) => `<tr><td>${e(longDate(x.date))}</td><td>${e(x.title)}</td>` +
        `<td class="num">${e(hoursLabel(x.hours))}${x.ects ? " (créditos)" : ""}</td></tr>`,
    )
    .join("");
  const shiftRows = opts.shifts
    .map(
      (x) => `<tr><td>${e(longDate(x.date))}</td><td>${e(x.title)}: ${e(x.role)}</td>` +
        `<td class="num">${e(hoursLabel(x.hours))}</td></tr>`,
    )
    .join("");
  const page = `<section class="page">
  <p class="eyebrow">${e(opts.spaceName)} · Curso ${e(opts.course)}</p>
  <h1>Certificado de participación</h1>
  <p class="lead">${opts.secretary ? `${e(opts.secretary.name)}, ${e(opts.secretary.role.toLowerCase())} de ${e(opts.spaceName)},` : `La secretaría de ${e(opts.spaceName)}`} certifica que <b>${e(m.name)}</b>, estudiante de ${e(m.studies)} en la ${e(m.university)}, es socia o socio desde el ${e(longDate(m.joinedAt))} y durante el curso ${e(opts.course)} ha participado en lo siguiente.</p>
  <div class="kpis">
    <div><b>${opts.attended.length}</b><span>actividades con asistencia registrada</span></div>
    <div><b>${e(hoursLabel(opts.ectsHours))}</b><span>en actividades con créditos</span></div>
    <div><b>${e(hoursLabel(opts.volunteerHours))}</b><span>de voluntariado</span></div>
  </div>
  ${rows ? `<h2>Actividades</h2><table><thead><tr><th>Fecha</th><th>Actividad</th><th class="num">Horas</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
  ${shiftRows ? `<h2>Voluntariado</h2><table><thead><tr><th>Fecha</th><th>Turno</th><th class="num">Horas</th></tr></thead><tbody>${shiftRows}</tbody></table>` : ""}
  <p>Y para que conste, se firma en ${e(opts.city)}, el ${e(longDate(opts.issuedAt.toISOString()))}.</p>
  ${signatures(opts.secretary, opts.president)}
</section>`;
  return shell(`Certificado del curso: ${m.name}`, page);
}

/* ------------------------------------------------------------------ */
/* Memoria de subvención                                               */
/* ------------------------------------------------------------------ */

export type MemoryActivity = {
  title: string;
  date: string;
  place: string;
  registered: number;
  checkedIn: number;
  verified: number;
  photos: number;
  councilLogo: boolean;
  attendees: string[];
  /** Nota media de quienes vinieron, si la valoraron. */
  rating?: { avg: number; count: number };
};

export type MemoryOptions = {
  spaceName: string;
  /** Convocatoria o título de la memoria. */
  call: string;
  /** Importe pedido; sin él, la memoria no habla de dinero pedido. */
  requestedCents?: number;
  /** Frase de entrada; si no se da, se escribe una a partir del importe. */
  intro?: string;
  activities: MemoryActivity[];
  /** Gastos del periodo por categoría, para justificar. */
  expenses?: { label: string; cents: number }[];
  board: Signer[];
  issuedAt: Date;
};

/** Páginas de la memoria (resumen y anexo de asistentes), sin envolver. */
function memoryPages(opts: MemoryOptions): string {
  const acts = [...opts.activities].sort((a, b) => a.date.localeCompare(b.date));
  const attendance = acts.reduce((acc, a) => acc + a.checkedIn, 0);
  const verified = acts.reduce((acc, a) => acc + a.verified, 0);
  const photos = acts.reduce((acc, a) => acc + a.photos, 0);
  const withLogo = acts.filter((a) => a.councilLogo).length;
  // La columna de nota solo aparece si alguna actividad se valoró.
  const rated = acts.filter((a) => a.rating?.count);
  const ratingCount = rated.reduce((acc, a) => acc + (a.rating?.count ?? 0), 0);
  const ratingAvg = ratingCount
    ? rated.reduce((acc, a) => acc + (a.rating?.avg ?? 0) * (a.rating?.count ?? 0), 0) / ratingCount
    : 0;
  const ratingCell = (a: MemoryActivity) =>
    rated.length
      ? `<td class="num">${a.rating?.count ? `${e(decimal(a.rating.avg))} (${a.rating.count})` : ""}</td>`
      : "";
  const rows = acts
    .map(
      (a) => `<tr><td>${e(longDate(a.date))}</td><td>${e(a.title)}<br><span class="muted">${e(a.place)}</span></td>` +
        `<td class="num">${a.registered}</td><td class="num">${a.checkedIn}</td><td class="num">${a.verified}</td>` +
        `<td class="num">${a.photos}</td><td>${a.councilLogo ? "Sí" : "No"}</td>${ratingCell(a)}</tr>`,
    )
    .join("");
  const annex = acts
    .filter((a) => a.attendees.length)
    .map(
      (a) => `<h2>${e(a.title)}</h2><p class="muted">${e(longDate(a.date))} · ${a.attendees.length} asistentes con check-in</p>` +
        `<p class="names">${a.attendees.map(e).join("<br>")}</p>`,
    )
    .join("");
  const expenses = opts.expenses?.filter((x) => x.cents) ?? [];
  const expenseTotal = expenses.reduce((acc, x) => acc + x.cents, 0);
  const expenseTable = expenses.length
    ? `<h2>Gastos del periodo</h2><table><tbody>${expenses
        .map((x) => `<tr><td>${e(x.label)}</td><td class="num">${e(money(x.cents))}</td></tr>`)
        .join("")}<tr class="total"><td>Total</td><td class="num">${e(money(expenseTotal))}</td></tr></tbody></table>`
    : "";
  const intro =
    opts.intro ??
    (opts.requestedCents
      ? `Importe solicitado: <b>${e(money(opts.requestedCents))}</b>. Memoria con las actividades realizadas y su asistencia, registrada con check-in en Franky.`
      : "Memoria con las actividades realizadas y su asistencia, registrada con check-in en Franky.");
  const secretary = opts.board.find((b) => /secretar/i.test(b.role));
  const president = opts.board.find((b) => /presiden/i.test(b.role));
  const summary = `<section class="page">
  <p class="eyebrow">${e(opts.spaceName)} · Memoria de actividades</p>
  <h1>${e(opts.call)}</h1>
  <p class="lead">${opts.intro ? e(intro) : intro}</p>
  <div class="kpis">
    <div><b>${acts.length}</b><span>actividades realizadas</span></div>
    <div><b>${attendance}</b><span>asistencias con check-in</span></div>
    <div><b>${verified}</b><span>con cuenta universitaria verificada</span></div>
    <div><b>${photos}</b><span>fotos de las actividades</span></div>
    ${ratingCount ? `<div><b>${e(decimal(ratingAvg))} de 5</b><span>nota media de ${ratingCount} asistentes</span></div>` : ""}
  </div>
  ${acts.length ? `<p>${withLogo} de ${acts.length} actividades llevaron el logo del Consejo de Estudiantes en su publicidad.</p>` : ""}
  ${rows ? `<h2>Actividades</h2><table><thead><tr><th>Fecha</th><th>Actividad</th><th class="num">Inscritos</th><th class="num">Asistentes</th><th class="num">Verificados</th><th class="num">Fotos</th><th>Logo</th>${rated.length ? '<th class="num">Nota</th>' : ""}</tr></thead><tbody>${rows}</tbody></table>` : ""}
  ${expenseTable}
  <p>Documento preparado el ${e(longDate(opts.issuedAt.toISOString()))}.</p>
  ${signatures(secretary, president)}
</section>`;
  const annexPage = annex
    ? `<section class="page"><p class="eyebrow">Anexo</p><h1>Asistentes por actividad</h1>${annex}</section>`
    : "";
  return summary + annexPage;
}

export function subsidyMemoryHtml(opts: MemoryOptions): string {
  return shell(`Memoria: ${opts.call}`, memoryPages(opts));
}

/* ------------------------------------------------------------------ */
/* Cuentas del curso                                                   */
/* ------------------------------------------------------------------ */

export function accountsHtml(opts: {
  spaceName: string;
  course: string;
  ledger: CommunityLedger;
  treasurer?: Signer;
  president?: Signer;
  issuedAt: Date;
}): string {
  const l = opts.ledger;
  const lines = (list: { label: string; cents: number }[]) =>
    list.map((x) => `<tr><td>${e(x.label)}</td><td class="num">${e(money(x.cents))}</td></tr>`).join("");
  const acts = l.byActivity
    .map(
      (a) => `<tr><td>${e(a.title)}<br><span class="muted">${e(longDate(a.date))}</span></td>` +
        `<td class="num">${e(money(a.incomeCents))}</td><td class="num">${e(money(a.expenseCents))}</td>` +
        `<td class="num">${e(money(a.resultCents))}</td></tr>`,
    )
    .join("");
  const page = `<section class="page">
  <p class="eyebrow">${e(opts.spaceName)} · Curso ${e(opts.course)}</p>
  <h1>Estado de ingresos y gastos</h1>
  <p class="lead">Cuentas del curso para su aprobación en la asamblea general.</p>
  <div class="kpis">
    <div><b>${e(money(l.openingCents))}</b><span>saldo al empezar el curso</span></div>
    <div><b>${e(money(l.incomeCents))}</b><span>ingresos</span></div>
    <div><b>${e(money(l.expenseCents))}</b><span>gastos</span></div>
    <div><b>${e(money(l.balanceCents))}</b><span>saldo actual</span></div>
  </div>
  <h2>Ingresos</h2>
  <table><tbody>${lines(l.incomes)}<tr class="total"><td>Total ingresos</td><td class="num">${e(money(l.incomeCents))}</td></tr></tbody></table>
  <h2>Gastos</h2>
  <table><tbody>${lines(l.expenses)}<tr class="total"><td>Total gastos</td><td class="num">${e(money(l.expenseCents))}</td></tr></tbody></table>
  ${acts ? `<h2>Resultado por actividad</h2><table><thead><tr><th>Actividad</th><th class="num">Ingresos</th><th class="num">Gastos</th><th class="num">Resultado</th></tr></thead><tbody>${acts}</tbody></table>` : ""}
  <p>Saldo al empezar el curso ${e(money(l.openingCents))}, más ingresos ${e(money(l.incomeCents))}, menos gastos ${e(money(l.expenseCents))}: saldo de ${e(money(l.balanceCents))} a ${e(longDate(opts.issuedAt.toISOString()))}.</p>
  ${signatures(opts.treasurer, opts.president)}
</section>`;
  return shell(`Cuentas del curso ${opts.course}`, page);
}

/* ------------------------------------------------------------------ */
/* Actas y documentos de texto                                         */
/* ------------------------------------------------------------------ */

export function textDocumentHtml(opts: {
  spaceName: string;
  title: string;
  subtitle?: string;
  body: string;
}): string {
  const page = `<section class="page">
  <p class="eyebrow">${e(opts.spaceName)}</p>
  <h1>${e(opts.title)}</h1>
  ${opts.subtitle ? `<p class="muted">${e(opts.subtitle)}</p>` : ""}
  ${paragraphsHtml(opts.body)}
</section>`;
  return shell(opts.title, page);
}

/* ------------------------------------------------------------------ */
/* Dossier para patrocinadores                                         */
/* ------------------------------------------------------------------ */

export function sponsorDossierHtml(opts: {
  spaceName: string;
  campus: string;
  description: string;
  course: string;
  members: number;
  newMembers: number;
  verifiedPct: number;
  activitiesDone: number;
  avgAttendance: number;
  reach: number;
  topStudies: { label: string; count: number }[];
  upcoming: { title: string; date: string; capacity: number; registered: number }[];
  sponsors: { business: string; packageName: string; reach: number; redemptions: number }[];
  perks: string[];
  contact: { name: string; role: string; phone?: string };
  issuedAt: Date;
}): string {
  const studies = opts.topStudies
    .map((s) => `<tr><td>${e(s.label)}</td><td class="num">${s.count}</td></tr>`)
    .join("");
  const upcoming = opts.upcoming
    .map(
      (a) => `<tr><td>${e(longDate(a.date))}</td><td>${e(a.title)}</td>` +
        `<td class="num">${a.registered} de ${a.capacity}</td></tr>`,
    )
    .join("");
  const past = opts.sponsors
    .map(
      (s) => `<tr><td>${e(s.business)}<br><span class="muted">${e(s.packageName)}</span></td>` +
        `<td class="num">${s.reach.toLocaleString("es-ES")}</td><td class="num">${s.redemptions}</td></tr>`,
    )
    .join("");
  const page = `<section class="page">
  <p class="eyebrow">Dossier de patrocinio · Curso ${e(opts.course)}</p>
  <h1>${e(opts.spaceName)}</h1>
  <p class="lead">${e(opts.description)}</p>
  <div class="kpis">
    <div><b>${opts.members}</b><span>socios en la ${e(opts.campus)}</span></div>
    <div><b>${opts.newMembers}</b><span>socios nuevos este curso</span></div>
    <div><b>${opts.avgAttendance}</b><span>asistentes de media por actividad</span></div>
    <div><b>${opts.reach.toLocaleString("es-ES")}</b><span>estudiantes vieron nuestras actividades en Franky</span></div>
  </div>
  <p>${opts.activitiesDone} actividades hechas este curso. El ${opts.verifiedPct} % de los socios tiene la cuenta universitaria verificada: cada asistencia y cada canje se cuentan de verdad.</p>
  ${studies ? `<h2>Qué estudian nuestros socios</h2><table><tbody>${studies}</tbody></table>` : ""}
  ${upcoming ? `<h2>Próximas actividades</h2><table><thead><tr><th>Fecha</th><th>Actividad</th><th class="num">Inscritos</th></tr></thead><tbody>${upcoming}</tbody></table>` : ""}
  ${past ? `<h2>Quién nos patrocina y qué ha conseguido</h2><table><thead><tr><th>Negocio</th><th class="num">Alcance</th><th class="num">Canjes</th></tr></thead><tbody>${past}</tbody></table>` : ""}
  <h2>Qué recibe tu negocio</h2>
  <p>${opts.perks.map(e).join(". ")}.</p>
  <h2>Hablamos</h2>
  <p>${e(opts.contact.name)}, ${e(opts.contact.role.toLowerCase())}${opts.contact.phone ? `, ${e(opts.contact.phone)}` : ""}.</p>
  <footer>Datos de Franky a ${e(longDate(opts.issuedAt.toISOString()))}.</footer>
</section>`;
  return shell(`Dossier de patrocinio: ${opts.spaceName}`, page);
}

/* ------------------------------------------------------------------ */
/* De los datos del espacio al documento                               */
/* ------------------------------------------------------------------ */

function boardSigners(data: ProData) {
  const find = (re: RegExp) => data.board.find((b) => re.test(b.role));
  const pick = (b?: { name: string; role: string }) =>
    b ? { name: b.name, role: b.role } : undefined;
  return {
    president: pick(find(/presiden/i)),
    secretary: pick(find(/secretar/i)),
    treasurer: pick(find(/tesor/i)),
  };
}

/** Certificados de quien hizo check-in (o solo de `onlyIds`). */
export function activityCertificatesHtml(
  data: ProData,
  activityId: string,
  now: Date,
  onlyIds?: string[],
): string | null {
  const a = (data.activities as CommunityActivity[]).find((x) => x.id === activityId);
  if (!a) return null;
  const members = data.communityMembers as CommunityMember[];
  const roster = activityAttendees(a, members);
  const inside = checkedInSet(a, roster);
  const people = roster.filter((p) => inside.has(p.id) && (!onlyIds || onlyIds.includes(p.id)));
  if (!people.length) return null;
  const { president, secretary } = boardSigners(data);
  return certificatesHtml({
    spaceName: data.space.name,
    city: data.space.city,
    activity: {
      title: a.title,
      date: a.date,
      place: a.place,
      hours: activityHours(a),
      ects: Boolean(a.ectsHours),
    },
    people,
    president,
    secretary,
    issuedAt: now,
  });
}

export function memberCourseCertificateHtml(
  data: ProData,
  memberId: string,
  now: Date,
): string | null {
  const members = data.communityMembers as CommunityMember[];
  const m = members.find((x) => x.id === memberId);
  if (!m) return null;
  const history = memberHistory(
    m.id,
    data.activities as CommunityActivity[],
    members,
    now,
    courseStart(now),
  );
  const { president, secretary } = boardSigners(data);
  return memberCertificateHtml({
    spaceName: data.space.name,
    city: data.space.city,
    course: courseLabel(now),
    member: { name: m.name, studies: m.studies, university: m.university, joinedAt: m.joinedAt },
    attended: history.attended.map((x) => ({
      title: x.activity.title,
      date: x.activity.date,
      hours: x.hours,
      ects: Boolean(x.activity.ectsHours),
    })),
    shifts: history.shifts.map((x) => ({
      title: x.activity.title,
      date: x.activity.date,
      role: x.shift.role,
      hours: shiftMinutes(x.shift) / 60,
    })),
    ectsHours: history.ectsHours,
    volunteerHours: history.volunteerMinutes / 60,
    president,
    secretary,
    issuedAt: now,
  });
}

/** Una actividad hecha, con quién entró y cuántos con cuenta verificada. */
function memoryActivity(a: CommunityActivity, members: CommunityMember[]): MemoryActivity {
  const roster = activityAttendees(a, members);
  const inside = checkedInSet(a, roster);
  const present = roster.filter((p) => inside.has(p.id));
  const rating = ratingSummary(a);
  return {
    title: a.title,
    date: a.date,
    place: a.place,
    registered: a.registered,
    checkedIn: present.length,
    verified: present.filter((p) => p.verified).length,
    photos: a.photos ?? 0,
    councilLogo: Boolean(a.councilLogo),
    attendees: present.map((p) => p.name),
    rating: rating.count ? { avg: rating.avg, count: rating.count } : undefined,
  };
}

/** Gastos del curso por categoría, sin la comisión de Franky (no es un gasto justificable). */
function memoryExpenses(data: ProData, now: Date) {
  return communityLedger(data, now)
    .expenses.filter((l) => l.key !== "franky")
    .map((l) => ({ label: l.label, cents: l.cents }));
}

export function subsidyMemoryFromData(
  data: ProData,
  subsidyId: string | null,
  now: Date,
): string | null {
  const subsidy = data.subsidies.find((s) => s.id === subsidyId);
  const members = data.communityMembers as CommunityMember[];
  const done = (data.activities as CommunityActivity[]).filter((a) => a.status === "done");
  if (!done.length) return null;
  return subsidyMemoryHtml({
    spaceName: data.space.name,
    call: subsidy?.call ?? "Memoria de actividades",
    requestedCents: subsidy?.requestedCents,
    board: data.board.map((b) => ({ name: b.name, role: b.role })),
    issuedAt: now,
    activities: done.map((a) => memoryActivity(a, members)),
    expenses: memoryExpenses(data, now),
  });
}

export function courseAccountsHtml(data: ProData, now: Date): string {
  const { president, treasurer } = boardSigners(data);
  return accountsHtml({
    spaceName: data.space.name,
    course: courseLabel(now),
    ledger: communityLedger(data, now),
    president,
    treasurer,
    issuedAt: now,
  });
}

/** El documento del archivo listo para abrir, o null si es un archivo subido. */
export function archiveDocumentHtml(
  data: ProData,
  doc: CommunityArchiveDoc,
  now: Date,
): string | null {
  if (doc.html) return doc.html;
  if (doc.source?.type === "certificates") {
    return activityCertificatesHtml(data, doc.source.activityId, now);
  }
  if (doc.source?.type === "memory") {
    return subsidyMemoryFromData(data, doc.source.subsidyId, now);
  }
  if (doc.body) {
    return textDocumentHtml({
      spaceName: data.space.name,
      title: doc.title,
      subtitle: `${doc.by} · ${longDate(doc.at)}`,
      body: doc.body,
    });
  }
  return null;
}

export function sponsorDossierFromData(data: ProData, now: Date): string {
  const members = (data.communityMembers as CommunityMember[]).filter(isActiveMember);
  const acts = data.activities as CommunityActivity[];
  const from = courseStart(now);
  const done = acts.filter((a) => a.status === "done");
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.studies, (counts.get(m.studies) ?? 0) + 1);
  const { president } = boardSigners(data);
  const presidentMember = members.find((m) => m.name === president?.name);
  const sponsors = data.sponsors as CommunitySponsor[];
  const verified = members.filter((m) => m.verified !== false).length;
  return sponsorDossierHtml({
    spaceName: data.space.name,
    campus: data.space.campus,
    description: data.space.publicProfile.description,
    course: courseLabel(now),
    members: members.length,
    newMembers: members.filter((m) => localDate(m.joinedAt) >= from).length,
    verifiedPct: members.length ? Math.round((verified / members.length) * 100) : 0,
    activitiesDone: done.filter((a) => localDate(a.date) >= from).length,
    avgAttendance: done.length
      ? Math.round(done.reduce((acc, a) => acc + a.checkedIn, 0) / done.length)
      : 0,
    reach: acts
      .filter((a) => a.status !== "draft")
      .reduce((acc, a) => acc + (a.reachOutside ?? 0), 0),
    topStudies: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count })),
    upcoming: acts
      .filter((a) => a.status === "published" && a.date >= now.toISOString())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5)
      .map((a) => ({
        title: a.title,
        date: a.date,
        capacity: a.capacity,
        registered: a.registered,
      })),
    sponsors: sponsors
      .filter((s) => s.status !== "proposed")
      .map((s) => ({
        business: s.business,
        packageName: s.packageName,
        reach: s.reach,
        redemptions: s.redemptions,
      })),
    perks: [
      "Tu logo en los carteles y en la ficha de la asociación en Franky",
      "Una ventaja para los socios que se ve en su carné y se canjea en tu Franky Pro",
      "Mención en los avisos a toda la universidad",
      "Informe con el alcance y los canjes al final de cada actividad",
    ],
    contact: {
      name: president?.name ?? data.space.owner.name,
      role: president?.role ?? "Junta directiva",
      phone: presidentMember?.phone,
    },
    issuedAt: now,
  });
}

/* ------------------------------------------------------------------ */
/* Papeles del registro universitario                                  */
/* ------------------------------------------------------------------ */

function boardCertificatePage(data: ProData, now: Date): string {
  const { president, secretary } = boardSigners(data);
  const rows = data.board
    .map(
      (b) => `<tr><td>${e(b.role)}</td><td>${e(b.name)}</td>` +
        `<td>${e(longDate(`${b.since}T12:00:00Z`))}</td><td>${e(longDate(`${b.until}T12:00:00Z`))}</td></tr>`,
    )
    .join("");
  return `<section class="page">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(courseLabel(now))}</p>
  <h1>Certificado de la junta directiva</h1>
  <p class="lead">${secretary ? `${e(secretary.name)}, ${e(secretary.role.toLowerCase())} de ${e(data.space.name)},` : `La secretaría de ${e(data.space.name)}`} certifica que la junta directiva de la asociación, a fecha de hoy, está formada por las siguientes personas.</p>
  <table><thead><tr><th>Cargo</th><th>Nombre</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Y para que conste ante el registro de asociaciones de la ${e(data.space.campus)}, se firma en ${e(data.space.city)}, el ${e(longDate(now.toISOString()))}.</p>
  ${signatures(secretary, president)}
</section>`;
}

function registryMembersPage(data: ProData, now: Date): string {
  const members = (data.communityMembers as CommunityMember[])
    .filter(isActiveMember)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const share = universityCommunityShare(members, data.space.campus);
  const { president, secretary } = boardSigners(data);
  const rows = members
    .map(
      (m, i) => `<tr><td class="num">${i + 1}</td><td>${e(m.name)}</td><td>${e(m.studies)}</td>` +
        `<td>${e(m.university)}</td><td>${e(longDate(m.joinedAt))}</td></tr>`,
    )
    .join("");
  return `<section class="page">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(courseLabel(now))}</p>
  <h1>Relación de socios</h1>
  <p class="lead">${share.total} socios activos a ${e(longDate(now.toISOString()))}. ${share.community} son de la ${e(data.space.campus)}: el ${share.pct} % de la asociación.</p>
  <div class="kpis">
    <div><b>${share.total}</b><span>socios activos</span></div>
    <div><b>${share.community}</b><span>de la comunidad universitaria</span></div>
    <div><b>${share.pct} %</b><span>de la comunidad universitaria</span></div>
  </div>
  <table><thead><tr><th class="num">N.º</th><th>Nombre</th><th>Estudios</th><th>Universidad</th><th>Alta</th></tr></thead><tbody>${rows}</tbody></table>
  ${signatures(secretary, president)}
</section>`;
}

/** Memoria de las actividades hechas en un curso (el anterior, por defecto). */
function courseMemoryPages(data: ProData, now: Date, offset: number): string {
  const range = courseRange(now, offset);
  const members = data.communityMembers as CommunityMember[];
  const acts = courseActivities(data.activities as CommunityActivity[], range);
  return memoryPages({
    spaceName: data.space.name,
    call: `Memoria del curso ${range.label}`,
    intro:
      `Actividades de ${data.space.name} entre el ${longDate(`${range.from}T12:00:00Z`)} y el ` +
      `${longDate(`${range.to}T12:00:00Z`)}, con la asistencia registrada con check-in en Franky.`,
    board: data.board.map((b) => ({ name: b.name, role: b.role })),
    issuedAt: now,
    activities: acts.map((a) => memoryActivity(a, members)),
  });
}

export function courseMemoryHtml(data: ProData, now: Date, offset = -1): string {
  const range = courseRange(now, offset);
  return shell(`Memoria del curso ${range.label}`, courseMemoryPages(data, now, offset));
}

/**
 * Los papeles del registro de cada curso en un solo documento: certificado de
 * junta, relación de socios y memoria del curso anterior.
 */
export function registryPackHtml(data: ProData, now: Date): string {
  const pages = [
    boardCertificatePage(data, now),
    registryMembersPage(data, now),
    courseMemoryPages(data, now, -1),
  ];
  return shell(`Papeles del registro, curso ${courseLabel(now)}`, pages.join("\n"));
}

/* ------------------------------------------------------------------ */
/* Certificado de asistencia a las reuniones de junta                  */
/* ------------------------------------------------------------------ */

export function representationCertificateHtml(
  data: ProData,
  seatId: string,
  now: Date,
): string | null {
  const row = representationAttendance(data).find((r) => r.seat.id === seatId);
  if (!row || !row.sessions) return null;
  const { president, secretary } = boardSigners(data);
  const sessions = boardSessions(communityOps(data).assemblies).filter(
    (s) => localDate(s.date) >= row.seat.since,
  );
  const rows = sessions
    .map((s) => {
      const present = row.memberId ? s.presentIds.includes(row.memberId) : false;
      return `<tr><td>${e(longDate(s.date))}</td><td>${e(s.title)}</td><td>${present ? "Asiste" : "No asiste"}</td></tr>`;
    })
    .join("");
  const page = `<section class="page cert">
  <p class="eyebrow">${e(data.space.name)} · Curso ${e(courseLabel(now))}</p>
  <h1>Certificado de asistencia a las reuniones de junta</h1>
  <div class="body">
    <p>${secretary ? `${e(secretary.name)}, ${e(secretary.role.toLowerCase())} de ${e(data.space.name)},` : `La secretaría de ${e(data.space.name)}`} certifica que</p>
    <p class="who">${e(row.seat.name)}</p>
    <p>con el cargo de ${e(row.seat.role.toLowerCase())} desde el ${e(longDate(`${row.seat.since}T12:00:00Z`))}, ha asistido a <b>${row.attended} de ${row.sessions}</b> reuniones de la junta directiva celebradas en su mandato, un ${row.pct} % de las sesiones.</p>
    <table><thead><tr><th>Fecha</th><th>Reunión</th><th>Asistencia</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted">La asistencia quedó registrada con el check-in de cada reunión en Franky.</p>
    <p>Y para que conste, se firma en ${e(data.space.city)}, el ${e(longDate(now.toISOString()))}.</p>
  </div>
  ${signatures(secretary, president)}
</section>`;
  return shell(`Asistencia a la junta: ${row.seat.name}`, page);
}

/* ------------------------------------------------------------------ */
/* Voluntariado                                                        */
/* ------------------------------------------------------------------ */

/**
 * Acuerdo de incorporación con lo que pide la Ley 45/2015 (art. 12):
 * derechos y deberes, funciones y dedicación, gastos, formación, duración y
 * cómo se termina. Los huecos se rellenan a mano antes de firmar.
 */
export function volunteerAgreementHtml(data: ProData, memberId: string, now: Date): string | null {
  const members = data.communityMembers as CommunityMember[];
  const m = members.find((x) => x.id === memberId);
  if (!m) return null;
  const { president } = boardSigners(data);
  const since = m.volunteer?.since ?? localDate(now);
  const roles = [
    ...new Set(
      (data.activities as CommunityActivity[])
        .flatMap((a) => a.shifts ?? [])
        .filter((s) => s.people.includes(m.id))
        .map((s) => s.role.toLowerCase()),
    ),
  ];
  const tasks = roles.length
    ? `Colaborar en las actividades de la asociación, sobre todo en: ${roles.join(", ")}.`
    : "Colaborar en las actividades de la asociación en los turnos que acepte en cada una.";
  const clauses = [
    ["Funciones", tasks],
    [
      "Dedicación",
      "La persona voluntaria elige los turnos en los que participa. No hay un mínimo de horas ni horario fijo.",
    ],
    [
      "Derechos",
      "Recibir información y formación para sus tareas, ser tratada sin discriminación, participar en la organización de las actividades, estar asegurada por los riesgos de su actividad, recibir el reembolso de los gastos que se acuerden y obtener un certificado de su voluntariado.",
    ],
    [
      "Deberes",
      "Cumplir lo acordado, respetar los fines de la asociación y la confidencialidad de los datos que conozca, seguir las indicaciones de la junta en cada actividad y cuidar el material.",
    ],
    [
      "Gastos",
      "La asociación devuelve los gastos que la persona adelante para una actividad cuando estén autorizados por la tesorería y tengan su ticket.",
    ],
    ["Formación", "La junta explica a cada voluntario lo que necesita saber antes de su primer turno."],
    [
      "Duración y fin",
      "Este acuerdo dura mientras la persona siga como voluntaria. Cualquiera de las dos partes puede terminarlo avisando a la otra; al terminar, la asociación entrega un certificado con el voluntariado realizado.",
    ],
  ];
  const page = `<section class="page">
  <p class="eyebrow">${e(data.space.name)}</p>
  <h1>Acuerdo de incorporación de voluntariado</h1>
  <p class="lead">Entre ${e(data.space.name)}${president ? `, representada por ${e(president.name)} (${e(president.role.toLowerCase())}),` : ""} y <b>${e(m.name)}</b>, estudiante de ${e(m.studies)} en la ${e(m.university)}, que se incorpora como persona voluntaria desde el ${e(longDate(`${since}T12:00:00Z`))}, conforme a la Ley 45/2015, de 14 de octubre, de Voluntariado.</p>
  <table><tbody>${clauses.map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`).join("")}</tbody></table>
  <p>Firmado en ${e(data.space.city)}, el ${e(longDate(now.toISOString()))}.</p>
  <div class="sign">
    <div>${president ? `${e(president.name)}<br><span class="muted">Por la asociación</span>` : "Por la asociación"}</div>
    <div>${e(m.name)}<br><span class="muted">Persona voluntaria</span></div>
  </div>
</section>`;
  return shell(`Acuerdo de voluntariado: ${m.name}`, page);
}

/** Certificado del voluntariado hecho, con los turnos y las horas. */
export function volunteerCertificateHtml(data: ProData, memberId: string, now: Date): string | null {
  const members = data.communityMembers as CommunityMember[];
  const m = members.find((x) => x.id === memberId);
  if (!m?.volunteer) return null;
  const since = m.volunteer.since;
  const until = m.volunteer.leftAt;
  const history = memberHistory(m.id, data.activities as CommunityActivity[], members, now, since);
  const shifts = history.shifts
    .filter((s) => !until || localDate(s.activity.date) <= until)
    .sort((a, b) => a.activity.date.localeCompare(b.activity.date));
  const minutes = shifts.reduce((acc, s) => acc + shiftMinutes(s.shift), 0);
  const { president, secretary } = boardSigners(data);
  const rows = shifts
    .map(
      (s) => `<tr><td>${e(longDate(s.activity.date))}</td><td>${e(s.activity.title)}: ${e(s.shift.role)}</td>` +
        `<td class="num">${e(hoursLabel(shiftMinutes(s.shift) / 60))}</td></tr>`,
    )
    .join("");
  const period = until
    ? `entre el ${longDate(`${since}T12:00:00Z`)} y el ${longDate(`${until}T12:00:00Z`)}`
    : `desde el ${longDate(`${since}T12:00:00Z`)}`;
  const page = `<section class="page cert">
  <p class="eyebrow">${e(data.space.name)}</p>
  <h1>Certificado de voluntariado</h1>
  <div class="body">
    <p>${secretary ? `${e(secretary.name)}, ${e(secretary.role.toLowerCase())} de ${e(data.space.name)},` : `La secretaría de ${e(data.space.name)}`} certifica que</p>
    <p class="who">${e(m.name)}</p>
    <p>ha colaborado como persona voluntaria de la asociación ${e(period)}, con ${shifts.length} turnos y un total de <b>${e(hoursLabel(minutes / 60))}</b>.</p>
    ${rows ? `<table><thead><tr><th>Fecha</th><th>Actividad y turno</th><th class="num">Horas</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    <p>Y para que conste, se firma en ${e(data.space.city)}, el ${e(longDate(now.toISOString()))}.</p>
  </div>
  ${signatures(secretary, president)}
</section>`;
  return shell(`Certificado de voluntariado: ${m.name}`, page);
}

/* ------------------------------------------------------------------ */
/* Piezas comunes para otros documentos de la asociación               */
/* ------------------------------------------------------------------ */

export {
  shell as documentShell,
  signatures as signaturesHtml,
  boardSigners,
  longDate as documentDate,
  decimal as decimalLabel,
};
