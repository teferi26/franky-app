"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CreditCard, Trash2, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Acciones para una entrada en 'pending_payment' (reserva sin pagar):
 *  - Completar pago → reabre el checkout de Stripe reutilizando /pay/ticket.
 *  - Cancelar → borra la reserva (libera el aforo) vía /api/tickets/cancel.
 *
 * Con la reserva CADUCADA (165) no se ofrece pagar: la plaza ya volvió al
 * aforo y hay que pasar otra vez por la ficha del evento, que es lo único que
 * comprueba si queda sitio. Ofrecer "Completar pago" ahí sería venderle una
 * entrada por encima del aforo.
 */
export default function PendingTicketActions({
  ticketId,
  eventId,
  expired = false,
}: {
  ticketId: string;
  eventId?: string | null;
  expired?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"pay" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading("pay");
    setError(null);
    try {
      const res = await fetch("/api/stripe/pay/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "No se pudo iniciar el pago");
        setLoading(null);
        return;
      }
      window.location.href = json.url as string;
    } catch {
      setError("Error de red");
      setLoading(null);
    }
  }

  async function cancel() {
    setLoading("cancel");
    setError(null);
    try {
      const res = await fetch("/api/tickets/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "No se pudo cancelar");
        setLoading(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Error de red");
      setLoading(null);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {expired ? (
        eventId ? (
          <Link href={`/eventos/${eventId}`} className={buttonVariants({ variant: "dark", size: "sm" })}>
            <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Volver a intentarlo
          </Link>
        ) : null
      ) : (
        <Button variant="dark" size="sm" onClick={pay} disabled={loading !== null} loading={loading === "pay"}>
          {loading !== "pay" && <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          Completar pago
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={cancel}
        disabled={loading !== null}
        loading={loading === "cancel"}
        className="text-text-muted hover:border-error/40 hover:text-error"
      >
        {loading !== "cancel" && <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
        Cancelar
      </Button>
      {error && <p className="text-center text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}
