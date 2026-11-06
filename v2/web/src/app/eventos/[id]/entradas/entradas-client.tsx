"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Ticket, Shirt } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { shirtSizeLabel, tallyShirtSizes, type ShirtSize } from "@/lib/event-shirts";

export interface TicketRow {
  id: string;
  qr_token: string;
  status: "valid" | "used";
  used_at: string | null;
  holder_name: string | null;
  /** Talla elegida por el titular si el evento reparte camisetas (164). */
  shirt: ShirtSize | null;
}

export default function EntradasClient({
  tickets,
  shirtsEnabled = false,
}: {
  tickets: TicketRow[];
  shirtsEnabled?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const validCount = tickets.filter((t) => t.status === "valid").length;
  const usedCount = tickets.filter((t) => t.status === "used").length;
  // Recuento de camisetas sobre los titulares REALES de entrada.
  const shirtTally = shirtsEnabled ? tallyShirtSizes(tickets.map((t) => t.shirt)) : null;

  async function markUsed(token: string, id: string) {
    setBusy(id);
    try {
      const supabase = createClient();
      // Check-in unificado con la app móvil: check_in_ticket (migración 136)
      // comprueba en servidor que quien valida es el organizador y devuelve un
      // estado rico (ok / already_used / not_organizer...) con nombre y hora.
      const { data, error } = await supabase.rpc("check_in_ticket", {
        p_qr_token: token,
      });
      if (error) {
        toast.error("No se pudo validar", error.message);
        return;
      }
      // La RPC devuelve una tabla: normalmente un array con una fila.
      const res = (Array.isArray(data) ? data[0] : data) as
        | {
            ok: boolean;
            status: string;
            event_title: string | null;
            holder_name: string | null;
            used_at: string | null;
          }
        | null
        | undefined;
      if (res?.ok) {
        toast.success(
          "Entrada validada",
          res.holder_name ? `Asistente: ${res.holder_name}` : undefined
        );
      } else if (res?.status === "already_used") {
        const when = res.used_at
          ? new Date(res.used_at).toLocaleString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        toast.error(
          "Esta entrada ya estaba usada",
          [res.holder_name, when ? `a las ${when}` : null]
            .filter(Boolean)
            .join(" · ") || undefined
        );
      } else if (res?.status === "not_paid") {
        // Estados de la migración 162. Antes la RPC dejaba pasar entradas sin
        // pagar; ahora las rechaza y hay que decir por qué.
        toast.error(
          "Entrada sin pagar",
          "Reservó pero no completó el pago. No le dejes pasar hasta que pague."
        );
      } else if (res?.status === "refunded") {
        toast.error("Entrada reembolsada", "Se le devolvió el dinero, así que ya no vale.");
      } else if (res?.status === "not_valid") {
        toast.error("Entrada no válida", "Está cancelada o transferida.");
      } else if (res?.status === "not_organizer") {
        toast.error("Solo el organizador puede validar entradas");
      } else if (res?.status === "not_found") {
        toast.error("Entrada no encontrada", "El QR no corresponde a ninguna entrada.");
      } else if (res?.status === "no_auth") {
        toast.error("Inicia sesión para validar entradas");
      } else {
        toast.error("No se pudo validar la entrada");
      }
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="Todavía no hay entradas vendidas"
        description="Cuando alguien compre su entrada aparecerá aquí, lista para validar en la puerta."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Cifras del panel: tipografía tabular, sin tarjetas de colores */}
      <dl className="flex flex-wrap gap-x-10 gap-y-4 border-y border-border-light py-5">
        <div>
          <dt className="eyebrow text-text-muted">Sin usar</dt>
          <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary">{validCount}</dd>
        </div>
        <div>
          <dt className="eyebrow text-text-muted">Validadas</dt>
          <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary">{usedCount}</dd>
        </div>
        <div>
          <dt className="eyebrow text-text-muted">Total</dt>
          <dd className="mt-1 font-heading text-2xl font-bold tabular text-text-primary">{tickets.length}</dd>
        </div>
      </dl>

      {/* Camisetas que hay que llevar, por talla (164) */}
      {shirtTally && (
        <section>
          <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
            <Shirt className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Camisetas para este evento
          </p>
          {shirtTally.answered === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              Todavía nadie ha elegido talla. Se les pregunta al comprar la entrada.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-text-secondary">
                Hay que llevar{" "}
                <strong className="font-semibold tabular text-text-primary">{shirtTally.shirtsNeeded}</strong>{" "}
                {shirtTally.shirtsNeeded === 1 ? "camiseta" : "camisetas"}.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {shirtTally.bySize.map(({ size, count }) => (
                  <li
                    key={size}
                    className={`rounded-lg border px-2.5 py-1 text-sm font-semibold tabular ${
                      size === "ninguna"
                        ? "border-border text-text-muted"
                        : "border-border text-text-primary"
                    }`}
                  >
                    {shirtSizeLabel(size)}: {count}
                  </li>
                ))}
              </ul>
            </>
          )}
          {shirtTally.missing > 0 && (
            <p className="mt-3 text-xs text-text-muted">
              {shirtTally.missing}{" "}
              {shirtTally.missing === 1
                ? "asistente no ha elegido talla todavía"
                : "asistentes no han elegido talla todavía"}
              .
            </p>
          )}
        </section>
      )}

      {/* Lista tipo tabla: filas hairline que se iluminan al pasar el ratón */}
      <section>
        <p className="eyebrow text-text-muted">Titulares</p>
        <ul className="mt-3 divide-y divide-border-light border-y border-border-light">
          {tickets.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 px-2 py-3.5 transition-colors hover:bg-bg-secondary"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-semibold text-text-primary">
                  <span className="truncate">{t.holder_name || "Asistente"}</span>
                  {shirtsEnabled && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      {t.shirt === null ? "Sin talla" : shirtSizeLabel(t.shirt)}
                    </span>
                  )}
                </p>
                {t.status === "used" && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} aria-hidden="true" />
                    Validada
                    {t.used_at &&
                      ` · ${new Date(t.used_at).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                  </p>
                )}
              </div>
              {t.status === "valid" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markUsed(t.qr_token, t.id)}
                  loading={busy === t.id}
                  className="shrink-0"
                >
                  {busy === t.id ? "Validando" : "Marcar usada"}
                </Button>
              ) : (
                <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Usada
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
