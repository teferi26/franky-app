"use client";

import { useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, CheckCircle2, Clock, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import { LEGAL_DISCLAIMER, SIGNATURE_CONSENT } from "@/lib/contracts/questions";
import { safeStripeUrl } from '../../../../../shared/payment-contract';

export interface SignerView {
  id: string;
  role: "owner" | "tenant";
  status: "pending" | "signed";
  signed_at: string | null;
  full_name: string | null;
  is_me: boolean;
}

export interface ContractView {
  id: string;
  title: string | null;
  status: string;
  rent_cents: number | null;
  deposit_cents: number | null;
  content_sha256: string | null;
  accommodation_title: string;
  accommodation_city: string | null;
  is_owner: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Pendiente de firma",
  partially_signed: "Firma parcial",
  fully_signed: "Firmado",
  cancelled: "Cancelado",
};

function euros(cents: number | null): string {
  if (!cents || cents <= 0) return "Sin importe";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Aviso neutro de una línea con el color solo en el icono (v3). */
function Notice({
  tone,
  children,
}: {
  tone: "success" | "warning";
  children: ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : Clock;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-xl border border-border bg-bg-secondary/60 px-4 py-3 text-sm text-text-secondary"
    >
      <Icon
        className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "success" ? "text-success" : "text-warning")}
        strokeWidth={1.75}
      />
      <span>{children}</span>
    </div>
  );
}

export default function SignClient({
  contract,
  signers,
}: {
  contract: ContractView;
  signers: SignerView[];
}) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [paying, setPaying] = useState<null | "rent" | "deposit" | "both">(null);

  const pdfUrl = `/api/contracts/${contract.id}/pdf`;
  const mySigner = signers.find((s) => s.is_me) ?? null;
  const canSign =
    mySigner !== null &&
    mySigner.status === "pending" &&
    (contract.status === "sent" || contract.status === "partially_signed");
  const isTenant = mySigner?.role === "tenant";
  const isFullySigned = contract.status === "fully_signed";
  const payStatus = searchParams.get("pay");

  async function sign() {
    if (!accepted) {
      toast.error("Debes aceptar los avisos antes de firmar");
      return;
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/contracts/${contract.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error("No se pudo firmar", json.error);
        return;
      }
      toast.success("Contrato firmado");
      router.refresh();
    } catch {
      toast.error("Error de red al firmar");
    } finally {
      setSigning(false);
    }
  }

  async function pay(kind: "rent" | "deposit" | "both") {
    setPaying(kind);
    try {
      const res = await fetch("/api/stripe/pay/rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: contract.id, kind }),
      });
      const json = await res.json();
      const checkoutUrl = safeStripeUrl(json.url);
      if (!res.ok || !checkoutUrl) {
        toast.error("No se pudo iniciar el pago", json.error);
        setPaying(null);
        return;
      }
      window.location.href = checkoutUrl;
    } catch {
      toast.error("Error de red al iniciar el pago");
      setPaying(null);
    }
  }

  const rent = contract.rent_cents ?? 0;
  const deposit = contract.deposit_cents ?? 0;
  const signedCount = signers.filter((s) => s.status === "signed").length;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Cabecera tipográfica: rótulo, título grande y estado en línea. */}
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Reveal className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="eyebrow">Contrato de alquiler</p>
              <h1 className="mt-3 text-fluid-h2 font-extrabold text-text-primary">
                {contract.title || contract.accommodation_title || "Contrato"}
              </h1>
              {contract.accommodation_title && (
                <p className="mt-3 text-text-muted">
                  {contract.accommodation_title}
                  {contract.accommodation_city ? ` · ${contract.accommodation_city}` : ""}
                </p>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-secondary sm:self-auto">
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isFullySigned
                    ? "bg-success"
                    : contract.status === "cancelled"
                      ? "bg-error"
                      : "bg-warning"
                )}
              />
              {STATUS_LABEL[contract.status] ?? contract.status}
            </span>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          {/* Documento */}
          <Reveal className="min-w-0 space-y-6">
            {payStatus === "ok" && <Notice tone="success">Pago recibido. Gracias.</Notice>}
            {payStatus === "cancel" && (
              <Notice tone="warning">
                El pago se canceló. Puedes intentarlo de nuevo cuando quieras.
              </Notice>
            )}

            <div className="overflow-hidden rounded-3xl border border-border bg-bg-secondary shadow-card">
              <iframe
                src={pdfUrl}
                title="Vista previa del contrato"
                className="block h-[70vh] min-h-[480px] w-full"
              />
            </div>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary link-underline"
            >
              Abrir el PDF en una pestaña nueva
              <ExternalLink className="h-4 w-4 text-text-muted transition-colors group-hover:text-text-primary" strokeWidth={1.75} />
            </a>
          </Reveal>

          {/* Lateral pegajoso: firmantes, firma y pago. */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Reveal delay={80} className="space-y-6">
              <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-heading text-lg font-bold text-text-primary">Firmantes</h2>
                  <span className="text-xs font-semibold text-text-muted tabular">
                    {signedCount}/{signers.length}
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-border-light">
                  {signers.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                      {s.status === "signed" ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={1.75} />
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text-primary">
                          {s.full_name || "Firmante"}
                          {s.is_me && <span className="text-text-muted"> (tú)</span>}
                        </p>
                        <p className="text-xs text-text-muted">
                          {s.role === "owner" ? "Arrendador" : "Inquilino"}
                          {" · "}
                          {s.status === "signed" ? "Firmado" : "Pendiente"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {canSign && (
                <section className="rounded-2xl border border-text-primary/15 bg-bg-primary p-5 shadow-card">
                  <h2 className="font-heading text-lg font-bold text-text-primary">Tu firma</h2>
                  <p className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-bg-secondary/70 p-3 text-xs leading-relaxed text-text-muted">
                    {LEGAL_DISCLAIMER}
                  </p>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-violet"
                    />
                    <span>{SIGNATURE_CONSENT}</span>
                  </label>
                  <Button
                    onClick={sign}
                    disabled={!accepted}
                    loading={signing}
                    variant="dark"
                    size="lg"
                    className="mt-5 w-full"
                  >
                    {!signing && <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />}
                    Firmar electrónicamente
                  </Button>
                </section>
              )}

              {mySigner?.status === "signed" && !isFullySigned && (
                <Notice tone="success">
                  Has firmado. Faltan otras firmas para completar el contrato.
                </Notice>
              )}

              {/* Cobro de renta/fianza: solo inquilino, contrato firmado */}
              {isFullySigned && isTenant && (rent > 0 || deposit > 0) && (
                <section className="rounded-2xl border border-text-primary/15 bg-bg-primary p-5 shadow-card">
                  <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
                    <CreditCard className="h-4 w-4 text-violet" strokeWidth={1.75} />
                    Pagar a través de Franky
                  </h2>
                  <dl className="mt-3 divide-y divide-border-light text-sm">
                    {rent > 0 && (
                      <div className="flex items-baseline justify-between py-2">
                        <dt className="text-text-muted">Renta mensual</dt>
                        <dd className="font-semibold text-text-primary tabular">{euros(rent)}</dd>
                      </div>
                    )}
                    {deposit > 0 && (
                      <div className="flex items-baseline justify-between py-2">
                        <dt className="text-text-muted">Fianza</dt>
                        <dd className="font-semibold text-text-primary tabular">{euros(deposit)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-4 flex flex-col gap-2">
                    {rent > 0 && deposit > 0 && (
                      <Button
                        onClick={() => pay("both")}
                        disabled={paying !== null && paying !== "both"}
                        loading={paying === "both"}
                        variant="dark"
                        className="w-full"
                      >
                        Pagar renta + fianza ({euros(rent + deposit)})
                      </Button>
                    )}
                    {rent > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => pay("rent")}
                        disabled={paying !== null && paying !== "rent"}
                        loading={paying === "rent"}
                        className="w-full"
                      >
                        Pagar renta ({euros(rent)})
                      </Button>
                    )}
                    {deposit > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => pay("deposit")}
                        disabled={paying !== null && paying !== "deposit"}
                        loading={paying === "deposit"}
                        className="w-full"
                      >
                        Pagar fianza ({euros(deposit)})
                      </Button>
                    )}
                  </div>
                </section>
              )}
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
