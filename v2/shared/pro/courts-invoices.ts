import type { ProData } from "./types";
import type {
  ProCourtFiscal,
  ProCourtInvoice,
  ProInvoiceLine,
} from "./courts-types";
import { localDate } from "./format";
import { proCsvCell } from "./csv";
import { courtsOps, patchCourts } from "./courts-base";

/**
 * Facturas del mostrador: simplificadas (tique) o completas con NIF, con
 * numeración correlativa por serie y año, y exportables en CSV para la
 * gestoría. Los importes se cobran con IVA incluido; la base y la cuota se
 * sacan del total.
 */

/** Por encima de este importe (IVA incluido) hace falta factura completa. */
export const SIMPLIFIED_LIMIT_CENTS = 40_000;

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

export function normalizeNif(value: string): string {
  return value.toUpperCase().replace(/[\s.-]/g, "");
}

/**
 * DNI, NIE o NIF de empresa con su dígito de control. Evita el error más
 * común: una letra mal copiada que la gestoría devuelve un mes después.
 */
export function validNif(value: string): boolean {
  const v = normalizeNif(value);
  if (/^\d{8}[A-Z]$/.test(v))
    return DNI_LETTERS[Number(v.slice(0, 8)) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const n = Number(`${"XYZ".indexOf(v[0])}${v.slice(1, 8)}`);
    return DNI_LETTERS[n % 23] === v[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const digits = v.slice(1, 8).split("").map(Number);
    let sum = 0;
    digits.forEach((d, i) => {
      if (i % 2 === 0) {
        const x = d * 2;
        sum += Math.floor(x / 10) + (x % 10);
      } else sum += d;
    });
    const control = (10 - (sum % 10)) % 10;
    const last = v[8];
    const letter = "JABCDEFGHI"[control];
    // Unas letras de entidad llevan control en letra, otras en número; se
    // aceptan las dos formas porque en la práctica circulan ambas.
    return last === String(control) || last === letter;
  }
  return false;
}

/** Base y cuota de IVA a partir del total cobrado. */
export function splitVat(
  totalCents: number,
  vatPct: number,
): { baseCents: number; vatCents: number } {
  const baseCents = Math.round(totalCents / (1 + vatPct / 100));
  return { baseCents, vatCents: totalCents - baseCents };
}

/** Siguiente número de la serie en ese año: F2026-0001, F2026-0002... */
export function nextInvoiceNumber(
  invoices: ProCourtInvoice[],
  series: ProCourtInvoice["series"],
  year: number,
): { seq: number; number: string } {
  const seq =
    invoices
      .filter((i) => i.series === series && i.year === year)
      .reduce((max, i) => Math.max(max, i.seq), 0) + 1;
  return { seq, number: `${series}${year}-${String(seq).padStart(4, "0")}` };
}

export type InvoiceDraft = {
  full: boolean;
  date: string;
  customer: { name: string; nif?: string; address?: string };
  lines: ProInvoiceLine[];
  paymentId?: string;
};

export type InvoiceCheck =
  | { ok: true; series: ProCourtInvoice["series"]; totalCents: number }
  | {
      ok: false;
      reason: "fiscal" | "lines" | "name" | "nif" | "address" | "limit" | "paid";
    };

export const INVOICE_PROBLEM: Record<
  Exclude<InvoiceCheck, { ok: true }>["reason"],
  string
> = {
  fiscal: "Pon primero los datos de tu negocio: nombre, NIF y dirección.",
  lines: "Añade al menos un concepto con importe.",
  name: "Falta el nombre de quien paga.",
  nif: "Revisa el NIF: la letra no cuadra.",
  address: "La factura completa lleva la dirección de quien paga.",
  limit: "Por encima de 400 € hace falta factura completa con NIF.",
  paid: "Ese cobro ya tiene factura.",
};

export function checkInvoice(data: ProData, draft: InvoiceDraft): InvoiceCheck {
  const ops = courtsOps(data);
  const f = ops.fiscal;
  if (!f || !f.name.trim() || !validNif(f.nif) || !f.address.trim())
    return { ok: false, reason: "fiscal" };
  const lines = draft.lines.filter((l) => l.concept.trim() && l.amountCents > 0);
  if (!lines.length) return { ok: false, reason: "lines" };
  if (draft.paymentId && ops.invoices.some((i) => i.paymentId === draft.paymentId))
    return { ok: false, reason: "paid" };
  const totalCents = lines.reduce((a, l) => a + l.amountCents, 0);
  if (draft.full) {
    if (!draft.customer.name.trim()) return { ok: false, reason: "name" };
    if (!draft.customer.nif || !validNif(draft.customer.nif))
      return { ok: false, reason: "nif" };
    if (!draft.customer.address?.trim()) return { ok: false, reason: "address" };
    return { ok: true, series: "F", totalCents };
  }
  if (totalCents > SIMPLIFIED_LIMIT_CENTS) return { ok: false, reason: "limit" };
  return { ok: true, series: "T", totalCents };
}

/** Emite la factura con el siguiente número de su serie. */
export function issueInvoice(
  data: ProData,
  draft: InvoiceDraft,
  input: { id: string; nowIso: string },
): { data: ProData; invoice: ProCourtInvoice | null } {
  const check = checkInvoice(data, draft);
  if (!check.ok) return { data, invoice: null };
  const ops = courtsOps(data);
  const fiscal = ops.fiscal as ProCourtFiscal;
  const year = Number(draft.date.slice(0, 4));
  const { seq, number } = nextInvoiceNumber(ops.invoices, check.series, year);
  const { baseCents, vatCents } = splitVat(check.totalCents, fiscal.vatPct);
  const invoice: ProCourtInvoice = {
    id: input.id,
    series: check.series,
    year,
    seq,
    number,
    date: draft.date,
    customer: {
      name: draft.customer.name.trim() || "Cliente",
      nif: draft.full ? normalizeNif(draft.customer.nif ?? "") : undefined,
      address: draft.full ? draft.customer.address?.trim() : undefined,
    },
    lines: draft.lines
      .filter((l) => l.concept.trim() && l.amountCents > 0)
      .map((l) => ({ concept: l.concept.trim(), amountCents: l.amountCents })),
    totalCents: check.totalCents,
    baseCents,
    vatCents,
    vatPct: fiscal.vatPct,
    paymentId: draft.paymentId,
    createdAt: input.nowIso,
  };
  return {
    data: patchCourts(data, (o) => ({ invoices: [...o.invoices, invoice] })),
    invoice,
  };
}

export function setFiscal(data: ProData, fiscal: ProCourtFiscal): ProData {
  return patchCourts(data, {
    fiscal: {
      name: fiscal.name.trim(),
      nif: normalizeNif(fiscal.nif),
      address: fiscal.address.trim(),
      vatPct: fiscal.vatPct,
    },
  });
}

/** Cobros de los últimos días que aún no tienen factura, para hacerla en un toque. */
export function unbilledPayments(data: ProData, since: string) {
  const billed = new Set(
    courtsOps(data)
      .invoices.map((i) => i.paymentId)
      .filter(Boolean),
  );
  return data.payments
    .filter((p) => localDate(p.at) >= since && !billed.has(p.id) && p.amountCents > 0)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function invoicesOfMonth(
  invoices: ProCourtInvoice[],
  month: string,
): ProCourtInvoice[] {
  return invoices
    .filter((i) => i.date.slice(0, 7) === month)
    .sort((a, b) => a.series.localeCompare(b.series) || a.seq - b.seq);
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** CSV del libro de facturas emitidas del mes, como lo pide una gestoría. */
export function invoicesCsv(invoices: ProCourtInvoice[]): string {
  const head = [
    "Número",
    "Fecha",
    "Tipo",
    "Cliente",
    "NIF",
    "Concepto",
    "Base",
    "IVA %",
    "Cuota IVA",
    "Total",
  ];
  const rows = invoices.map((i) =>
    [
      i.number,
      i.date.split("-").reverse().join("/"),
      i.series === "F" ? "Completa" : "Simplificada",
      i.customer.name,
      i.customer.nif ?? "",
      i.lines.map((l) => l.concept).join(" + "),
      euros(i.baseCents),
      String(i.vatPct),
      euros(i.vatCents),
      euros(i.totalCents),
    ]
      .map(proCsvCell)
      .join(";"),
  );
  return [head.map(proCsvCell).join(";"), ...rows].join("\n");
}

/** Texto de la factura para enviarla o imprimirla desde el móvil. */
export function invoiceText(
  invoice: ProCourtInvoice,
  fiscal: ProCourtFiscal,
): string {
  const lines = [
    `${invoice.series === "F" ? "Factura" : "Factura simplificada"} ${invoice.number}`,
    `Fecha: ${invoice.date.split("-").reverse().join("/")}`,
    "",
    fiscal.name,
    `NIF ${fiscal.nif}`,
    fiscal.address,
    "",
  ];
  if (invoice.series === "F")
    lines.push(
      `Cliente: ${invoice.customer.name}`,
      `NIF ${invoice.customer.nif ?? ""}`,
      invoice.customer.address ?? "",
      "",
    );
  for (const l of invoice.lines) lines.push(`${l.concept}: ${euros(l.amountCents)} €`);
  lines.push(
    "",
    `Base imponible: ${euros(invoice.baseCents)} €`,
    `IVA ${invoice.vatPct} %: ${euros(invoice.vatCents)} €`,
    `Total: ${euros(invoice.totalCents)} €`,
  );
  return lines.join("\n");
}
