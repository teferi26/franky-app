"use client";

import * as React from "react";
import { Copy, Download, FileText, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProPayment } from "@/lib/pro/types";
import type { ProCourtInvoice } from "@/lib/pro/courts-types";
import { localDate, money, plural } from "@/lib/pro/format";
import {
  INVOICE_PROBLEM,
  SIMPLIFIED_LIMIT_CENTS,
  checkInvoice,
  invoiceText,
  invoicesCsv,
  invoicesOfMonth,
  issueInvoice,
  nextInvoiceNumber,
  setFiscal,
  splitVat,
  validNif,
} from "@/lib/pro/courts-invoices";
import { monthName } from "@/lib/pro/courts-growth";
import { ChoiceChips, Drawer, FormField, Panel, RowList, inputClass } from "../../kit";
import { downloadCsv } from "../classes/ui";
import { parseEuros, shortDate, useCourtsState } from "./state";

/**
 * Facturas desde la caja: la simplificada sale de un cobro en dos toques y
 * la completa pide NIF y dirección de quien paga. La numeración es
 * correlativa por serie y año, y el libro del mes se exporta para la gestoría.
 */

export type InvoicePreset = { payment?: ProPayment } | null;

/** Resumen de las facturas del mes en la columna de Caja. */
export function InvoicesPanel({ month, onNew }: { month: string; onNew: () => void }) {
  const { data } = usePro();
  const { ops } = useCourtsState();
  const [open, setOpen] = React.useState<ProCourtInvoice | null>(null);
  const list = invoicesOfMonth(ops.invoices, month);
  const total = list.reduce((a, i) => a + i.totalCents, 0);
  const year = Number(month.slice(0, 4));

  const exportMonth = () =>
    downloadCsv(`facturas-${data.space.slug}-${month}.csv`, invoicesCsv(list));

  return (
    <>
      <Panel
        title={`Facturas de ${monthName(month)}`}
        description={
          list.length
            ? `${plural(list.length, "factura", "facturas")} por ${money(total)}. La siguiente: ${nextInvoiceNumber(ops.invoices, "T", year).number}.`
            : "Haz la factura desde cualquier cobro, o una suelta."
        }
        action={
          <Button size="sm" variant="outline" className="min-h-10" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" /> Factura
          </Button>
        }
        flush
      >
        {list.length ? (
          <>
            <RowList>
              {list
                .slice()
                .reverse()
                .slice(0, 8)
                .map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setOpen(i)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-secondary sm:px-5"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.customer.name}</span>
                      <span className="block truncate text-xs text-text-muted tabular">
                        {i.number} · {shortDate(i.date)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular">{money(i.totalCents)}</span>
                  </button>
                ))}
            </RowList>
            <div className="border-t border-border-light px-4 py-2.5 sm:px-5">
              <button type="button" onClick={exportMonth} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-violet">
                <Download className="h-3.5 w-3.5" strokeWidth={1.9} /> Libro de facturas del mes (CSV)
              </button>
            </div>
          </>
        ) : null}
      </Panel>
      <InvoiceView invoice={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Una factura ya emitida, lista para copiar y enviar. */
function InvoiceView({ invoice, onClose }: { invoice: ProCourtInvoice | null; onClose: () => void }) {
  const toast = useToast();
  const { ops } = useCourtsState();
  if (!invoice || !ops.fiscal) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;
  const text = invoiceText(invoice, ops.fiscal);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Factura copiada", "Pégala en un correo o en WhatsApp.");
    } catch {
      toast.error("No se ha podido copiar", "Selecciona el texto y cópialo a mano.");
    }
  };
  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={invoice.number}
      description={`${invoice.series === "F" ? "Factura completa" : "Factura simplificada"} para ${invoice.customer.name}.`}
      footer={
        <Button variant="dark" onClick={copy}>
          <Copy className="h-4 w-4" /> Copiar
        </Button>
      }
    >
      <pre className="whitespace-pre-wrap rounded-2xl bg-bg-secondary p-4 font-sans text-sm text-text-secondary">{text}</pre>
    </Drawer>
  );
}

/** Crear una factura, con los datos del negocio si aún no están puestos. */
export function InvoiceDrawer({ preset, onClose }: { preset: InvoicePreset; onClose: () => void }) {
  const { data, now, update, pending } = usePro();
  const toast = useToast();
  const { ops } = useCourtsState();
  const today = localDate(now);
  const [full, setFull] = React.useState(false);
  const [name, setName] = React.useState("");
  const [nif, setNif] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [concept, setConcept] = React.useState("");
  const [amount, setAmount] = React.useState("");
  // Datos del negocio, solo la primera vez.
  const [bizName, setBizName] = React.useState("");
  const [bizNif, setBizNif] = React.useState("");
  const [bizAddress, setBizAddress] = React.useState("");
  const [vat, setVat] = React.useState("21");

  React.useEffect(() => {
    if (!preset) return;
    const p = preset.payment;
    setFull(Boolean(p && p.amountCents > SIMPLIFIED_LIMIT_CENTS));
    setName(p?.clientName ?? "");
    setNif("");
    setAddress("");
    setConcept(p?.concept ?? "");
    setAmount(p ? String(p.amountCents / 100).replace(".", ",") : "");
    setBizName(ops.fiscal?.name ?? data.space.name);
    setBizNif(ops.fiscal?.nif ?? "");
    setBizAddress(ops.fiscal?.address ?? data.space.address);
    setVat(String(ops.fiscal?.vatPct ?? 21));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const needsFiscal = !ops.fiscal || !validNif(ops.fiscal.nif);
  const cents = parseEuros(amount) ?? 0;
  const draft = {
    full,
    date: today,
    customer: { name, nif: full ? nif : undefined, address: full ? address : undefined },
    lines: [{ concept, amountCents: cents }],
    paymentId: preset?.payment?.id,
  };
  const fiscalOk = bizName.trim().length > 1 && validNif(bizNif) && bizAddress.trim().length > 4;
  // Con los datos del negocio aún sin guardar, se comprueba como si ya estuvieran.
  const check = checkInvoice(
    needsFiscal && fiscalOk
      ? setFiscal(data, { name: bizName, nif: bizNif, address: bizAddress, vatPct: Number(vat) })
      : data,
    draft,
  );
  const { baseCents, vatCents } = splitVat(cents, Number(vat));
  const number = nextInvoiceNumber(ops.invoices, full ? "F" : "T", Number(today.slice(0, 4))).number;

  const save = async () => {
    if (!check.ok) return;
    const ok = await update("court.invoice.issue", (d) => {
      const withFiscal = needsFiscal
        ? setFiscal(d, { name: bizName, nif: bizNif, address: bizAddress, vatPct: Number(vat) })
        : d;
      return issueInvoice(withFiscal, draft, { id: localId("fc"), nowIso: new Date().toISOString() }).data;
    });
    if (!ok) return;
    toast.success("Factura hecha", `${number} por ${money(cents)}.`);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(preset)}
      onOpenChange={(v) => !v && onClose()}
      title="Nueva factura"
      description={`Saldrá con el número ${number}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!check.ok || pending}>
            <Receipt className="h-4 w-4" /> Hacer factura
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {needsFiscal ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold">Tus datos, solo esta vez</p>
            <FormField label="Nombre o razón social" htmlFor="fc-biz">
              <input id="fc-biz" value={bizName} onChange={(e) => setBizName(e.target.value)} className={inputClass} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="NIF" htmlFor="fc-biz-nif" hint={bizNif && !validNif(bizNif) ? "Revisa la letra" : undefined}>
                <input id="fc-biz-nif" value={bizNif} onChange={(e) => setBizNif(e.target.value)} className={inputClass} aria-invalid={Boolean(bizNif) && !validNif(bizNif)} />
              </FormField>
              <FormField label="IVA">
                <ChoiceChips value={vat} onChange={setVat} options={["21", "10"].map((v) => ({ value: v, label: `${v} %` }))} />
              </FormField>
            </div>
            <FormField label="Dirección" htmlFor="fc-biz-address">
              <input id="fc-biz-address" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} className={inputClass} />
            </FormField>
          </div>
        ) : null}

        <FormField label="Tipo">
          <ChoiceChips
            value={full ? "full" : "simple"}
            onChange={(v) => setFull(v === "full")}
            options={[
              { value: "simple", label: "Simplificada", hint: "Hasta 400 €, sin datos" },
              { value: "full", label: "Completa", hint: "Con NIF de quien paga" },
            ]}
          />
        </FormField>

        <FormField label="A nombre de" htmlFor="fc-name">
          <input id="fc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre o empresa" className={inputClass} />
        </FormField>
        {full ? (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <FormField label="NIF" htmlFor="fc-nif" hint={nif && !validNif(nif) ? "Revisa la letra" : undefined}>
              <input id="fc-nif" value={nif} onChange={(e) => setNif(e.target.value)} className={inputClass} aria-invalid={Boolean(nif) && !validNif(nif)} />
            </FormField>
            <FormField label="Dirección" htmlFor="fc-address">
              <input id="fc-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            </FormField>
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <FormField label="Concepto" htmlFor="fc-concept">
            <input id="fc-concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Bono 10 días" className={inputClass} />
          </FormField>
          <FormField label="Total (€)" htmlFor="fc-amount">
            <input id="fc-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={inputClass} />
          </FormField>
        </div>

        <div className="rounded-2xl bg-bg-secondary p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Base imponible</span>
            <span className="tabular">{money(baseCents)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-text-muted">IVA {vat} %</span>
            <span className="tabular">{money(vatCents)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-border-light pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular">{money(cents)}</span>
          </div>
        </div>

        {!check.ok && check.reason !== "lines" && (check.reason !== "fiscal" || bizNif) ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {INVOICE_PROBLEM[check.reason]}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
