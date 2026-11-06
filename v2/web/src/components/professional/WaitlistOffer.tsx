"use client";
import { useEffect, useState } from "react";
import {
  professionalMoney,
  type ProfessionalBooking,
} from "../../../../shared/professional-services";
export function WaitlistOffer({
  booking,
  operator = false,
  timezone = "Europe/Madrid",
  busy,
  onAction,
  onRefresh,
}: {
  booking: ProfessionalBooking;
  operator?: boolean;
  timezone?: string;
  busy: boolean;
  onAction: (name: string, data: Record<string, unknown>) => void;
  onRefresh: () => void;
}) {
  const [accepted, setAccepted] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (booking.waitlist_offer_status !== "offered") return;
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [booking.waitlist_offer_status]);
  useEffect(
    () => setAccepted(false),
    [
      booking.id,
      booking.waitlist_offer_version,
      booking.total_cents,
      booking.price_snapshot.terms,
    ],
  );
  if (booking.waitlist_offer_status !== "offered") return null;
  const deadline = booking.waitlist_offer_expires_at
      ? new Date(booking.waitlist_offer_expires_at)
      : null,
    expired = !deadline || deadline.getTime() <= now,
    canAccept = !operator || booking.customer_user_id === null;
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-violet/30 bg-violet/5 p-4">
      <h3 className="font-semibold">Hay una plaza disponible</h3>
      <p className="text-sm">
        {expired
          ? "El plazo de esta oferta ha terminado. Actualiza la reserva para consultar su estado."
          : `Se guarda hasta ${deadline.toLocaleString("es-ES", { timeZone: timezone })} (${timezone}). Aún no está confirmada.`}
      </p>
      <p className="text-sm">
        Precio acordado:{" "}
        <strong>{professionalMoney(booking.total_cents)}</strong>
      </p>
      {booking.price_snapshot.terms && (
        <p className="whitespace-pre-line text-sm text-text-secondary">
          {booking.price_snapshot.terms}
        </p>
      )}
      {expired ? (
        <button
          type="button"
          className="text-sm font-semibold text-violet"
          onClick={onRefresh}
        >
          Actualizar reserva
        </button>
      ) : canAccept ? (
        <>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={busy}
            />
            {operator
              ? "El invitado acepta el precio y las condiciones indicados."
              : "Acepto el precio y las condiciones indicados."}
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-violet px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              disabled={busy || !accepted}
              onClick={() =>
                onAction("accept_waitlist", {
                  offer_version: booking.waitlist_offer_version ?? 0,
                  expected_total_cents: booking.total_cents,
                  expected_terms: booking.price_snapshot.terms,
                })
              }
            >
              Aceptar plaza
            </button>
            <button
              type="button"
              className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-40"
              disabled={busy}
              onClick={() =>
                onAction("decline_waitlist", {
                  offer_version: booking.waitlist_offer_version ?? 0,
                })
              }
            >
              Liberar plaza
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm">
          La persona titular debe aceptar desde su cuenta. Su precio no cambia
          con las nuevas tarifas del catálogo.
        </p>
      )}
    </section>
  );
}
