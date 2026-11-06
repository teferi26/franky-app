import type { CommunityActivity } from "./community-types";
import { escapeHtml } from "./community-docs";
import { capitalize, dayLabel, money, time } from "./format";

/**
 * Cartel y story de una actividad (motor "community").
 *
 * El cartel es una página A4 lista para imprimir o guardar en PDF; la story es
 * una imagen vertical que la web dibuja en un canvas con los mismos textos.
 * Los dos llevan el QR que abre la asociación en Franky para inscribirse.
 */

export type PosterFacts = {
  title: string;
  /** "Martes, 30 de septiembre". */
  day: string;
  /** "19:00". */
  hour: string;
  place: string;
  /** "Gratis con inscripción" o "3,00 € la entrada". */
  price: string;
  /** "Cuenta 10 h para créditos", si la actividad los da. */
  credits?: string;
  /** Una línea de descripción, recortada para que quepa. */
  blurb?: string;
  /** Texto de apoyo del Consejo si la actividad lo lleva en la publicidad. */
  council?: string;
};

/** Recorta en la última palabra entera antes de `max` caracteres. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:]+$/, "")}...`;
}

export function posterFacts(
  a: CommunityActivity,
  opts: { campus?: string } = {},
): PosterFacts {
  return {
    title: a.title,
    day: capitalize(dayLabel(a.date)),
    hour: time(a.date),
    place: a.place,
    price: a.priceCents ? `${money(a.priceCents)} la entrada` : "Gratis con inscripción",
    credits: a.ectsHours ? `Cuenta ${a.ectsHours} h para créditos` : undefined,
    blurb: a.description ? clip(a.description, 150) : undefined,
    council: a.councilLogo
      ? `Con el apoyo del Consejo de Estudiantes${opts.campus ? ` de la ${opts.campus}` : ""}`
      : undefined,
  };
}

/** Colores de papel del cartel y de la story (los de los documentos imprimibles). */
export const POSTER_COLORS = {
  ink: "#16141d",
  muted: "#6b6878",
  line: "#e4e2ea",
  accent: "#6d3df0",
  paper: "#ffffff",
} as const;

const C = POSTER_COLORS;

const POSTER_STYLE = `
:root { --ink: ${C.ink}; --muted: ${C.muted}; --line: ${C.line}; --accent: ${C.accent}; --paper: ${C.paper}; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--paper); color: var(--ink); }
body { font: 12pt/1.45 Outfit, Inter, "Segoe UI", system-ui, -apple-system, sans-serif; }
.poster { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 16mm 16mm;
  display: flex; flex-direction: column; }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm;
  font-size: 10pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
.rule { height: 2.2mm; width: 34mm; background: var(--accent); margin: 16mm 0 8mm; }
h1 { font-size: 46pt; line-height: 1.02; letter-spacing: -.035em; margin: 0; font-weight: 800; }
.blurb { font-size: 14pt; color: var(--muted); margin: 8mm 0 0; max-width: 150mm; }
.facts { margin: 12mm 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; }
.facts div { border-top: 1px solid var(--line); padding-top: 3mm; }
.facts span { display: block; font-size: 8.5pt; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase; color: var(--muted); }
.facts b { display: block; font-size: 17pt; line-height: 1.2; letter-spacing: -.01em; margin-top: 1mm; }
.bottom { margin-top: auto; display: flex; align-items: flex-end; gap: 10mm; padding-top: 12mm; }
.qr { width: 62mm; height: 62mm; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.cta b { display: block; font-size: 22pt; letter-spacing: -.02em; line-height: 1.1; }
.cta p { margin: 3mm 0 0; color: var(--muted); font-size: 11pt; }
.cta .url { color: var(--ink); font-weight: 700; word-break: break-all; }
.council { margin-top: 8mm; font-size: 9.5pt; color: var(--muted); border-top: 1px solid var(--line); padding-top: 3mm; }
@media screen { body { background: #f5f4f8; } .poster { background: var(--paper); margin: 8mm auto; border: 1px solid var(--line); } }
`;

/** Solo se incrusta un SVG de verdad (lo genera la librería de QR de la web). */
function safeSvg(svg: string | undefined): string {
  if (!svg) return "";
  const trimmed = svg.trim().replace(/^<\?xml[^>]*>\s*/, "");
  if (!trimmed.startsWith("<svg") || /<script|on\w+\s*=/i.test(trimmed)) return "";
  return trimmed;
}

/** Cartel A4 con el QR de inscripción. */
export function activityPosterHtml(opts: {
  spaceName: string;
  activity: CommunityActivity;
  url: string;
  campus?: string;
  qrSvg?: string;
}): string {
  const e = escapeHtml;
  const f = posterFacts(opts.activity, { campus: opts.campus });
  const qr = safeSvg(opts.qrSvg);
  const facts = [
    ["Cuándo", `${f.day}, ${f.hour}`],
    ["Dónde", f.place],
    ["Entrada", f.price],
    ...(f.credits ? [["Créditos", f.credits]] : []),
  ]
    .map(([k, v]) => `<div><span>${e(k)}</span><b>${e(v)}</b></div>`)
    .join("");
  const body = `<main class="poster">
  <div class="top"><span>${e(opts.spaceName)}</span><span>${e(opts.campus ?? "")}</span></div>
  <div class="rule"></div>
  <h1>${e(f.title)}</h1>
  ${f.blurb ? `<p class="blurb">${e(f.blurb)}</p>` : ""}
  <section class="facts">${facts}</section>
  <section class="bottom">
    ${qr ? `<div class="qr">${qr}</div>` : ""}
    <div class="cta">
      <b>Apúntate en Franky</b>
      <p>Escanea el código con la cámara del móvil o entra en <span class="url">${e(opts.url.replace(/^https?:\/\//, ""))}</span></p>
    </div>
  </section>
  ${f.council ? `<p class="council">${e(f.council)}</p>` : ""}
</main>`;
  return [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${e(`Cartel: ${f.title}`)}</title>`,
    `<style>${POSTER_STYLE}</style>`,
    "</head>",
    `<body>${body}</body>`,
    "</html>",
  ].join("\n");
}
