"use client";
import { useState } from "react";
import {
  cardCampaignConditions,
  cardCents,
  type CardOffer,
  type CardOfferUsage,
} from "../../../../shared/franky-card";
import { CardField, cardInput, cardError, useCardClient } from "./card-client";

/** Fields use the venue's wall clock, never a guessed browser-to-venue conversion. */
export function CardCampaignFields({ timezone }: { timezone: string }) {
  const [scheduled, setScheduled] = useState(false);
  return (
    <fieldset className="space-y-3 rounded-xl bg-bg-secondary p-4">
      <legend className="px-1 font-semibold">
        Límites de la campaña (opcionales)
      </legend>
      <p className="text-sm text-text-secondary">
        La ventaja base sigue disponible. Estos límites sólo afectan a esta
        campaña adicional.
      </p>
      <CardField label="Usos totales">
        <input
          className={cardInput}
          name="max_redemptions"
          type="number"
          min={1}
          max={1000000}
          step={1}
          placeholder="Sin límite"
        />
      </CardField>
      <CardField label="Usos por persona">
        <input
          className={cardInput}
          name="max_per_user"
          type="number"
          min={1}
          max={10000}
          step={1}
          placeholder="Sin límite"
        />
      </CardField>
      <CardField label="Presupuesto máximo en descuentos adicionales (€)">
        <input
          className={cardInput}
          name="budget"
          type="number"
          min="0.01"
          max="1000000"
          step="0.01"
          placeholder="Sin límite"
        />
      </CardField>
      <p className="text-xs text-text-secondary">
        Se reserva con cada solicitud pendiente o reserva aceptada. Se libera al
        caducar o cancelarse antes del uso; las devoluciones de consumos
        realizados no lo reponen.
      </p>
      <label className="flex gap-2 text-sm">
        <input
          name="scheduled"
          type="checkbox"
          checked={scheduled}
          onChange={(e) => setScheduled(e.target.checked)}
        />
        Limitar a días y horas
      </label>
      {scheduled && (
        <>
          <fieldset>
            <legend className="mb-2 text-sm">
              Días de inicio · hora de {timezone}
            </legend>
            <div className="flex flex-wrap gap-3">
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
                (day, index) => (
                  <label key={day} className="flex gap-1 text-sm">
                    <input type="checkbox" name="campaign_days" value={index} />
                    {day}
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <CardField label="Desde">
              <input
                className={cardInput}
                name="window_start"
                type="time"
                required
              />
            </CardField>
            <CardField label="Hasta">
              <input
                className={cardInput}
                name="window_end"
                type="time"
                required
              />
            </CardField>
          </div>
          <p className="text-xs text-text-secondary">
            Si la hora final es anterior a la inicial, termina al día siguiente.
            El límite final queda excluido.
          </p>
        </>
      )}
    </fieldset>
  );
}

export function campaignFormData(form: FormData) {
  if (form.get("kind") !== "campaign") return {};
  const positive = (name: string, max: number) => {
    const raw = String(form.get(name) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw Error("card_invalid_input");
    return value;
  };
  const money = String(form.get("budget") ?? "")
    .trim()
    .replace(",", ".");
  if (money && !/^\d{1,7}(?:\.\d{1,2})?$/.test(money))
    throw Error("card_invalid_input");
  const budget = money ? Math.round(Number(money) * 100) : null;
  if (budget !== null && (budget < 1 || budget > 100000000))
    throw Error("card_invalid_input");
  const windows: {
    weekday: number;
    start_minute: number;
    end_minute: number;
  }[] = [];
  if (form.get("scheduled") === "on") {
    const minute = (name: string) => {
      const match = /^(\d{2}):(\d{2})$/.exec(String(form.get(name)));
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
        throw Error("card_invalid_input");
      return Number(match[1]) * 60 + Number(match[2]);
    };
    const a = minute("window_start"),
      b = minute("window_end");
    if (a === b) throw Error("card_invalid_input");
    const days = [...new Set(form.getAll("campaign_days").map(Number))];
    if (
      !days.length ||
      days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
      throw Error("card_invalid_input");
    // Midnight is the end of the selected day, representable by the SQL contract.
    for (const weekday of days)
      windows.push({
        weekday,
        start_minute: a,
        end_minute: b === 0 ? 1440 : b,
      });
  }
  return {
    max_redemptions: positive("max_redemptions", 1000000),
    max_per_user: positive("max_per_user", 10000),
    budget_cents: budget,
    validity_windows: windows,
  };
}

export function CardCampaignConditions({ offer }: { offer: CardOffer }) {
  const conditions = cardCampaignConditions(offer);
  if (!conditions.length && offer.kind !== "campaign") return null;
  return (
    <div className="mt-3 space-y-1 text-xs text-text-secondary">
      {conditions.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      {offer.ends_at && (
        <p>
          Hasta{" "}
          {new Date(offer.ends_at).toLocaleString("es-ES", {
            timeZone: offer.timezone ?? "Europe/Madrid",
          })}{" "}
          ({offer.timezone ?? "Europe/Madrid"}).
        </p>
      )}
      <p>La disponibilidad se comprueba al solicitar la ventaja.</p>
    </div>
  );
}

export function CardCampaignUsage({
  offer,
  userId,
}: {
  offer: CardOffer;
  userId: string;
}) {
  const { rpc } = useCardClient(userId);
  const [usage, setUsage] = useState<CardOfferUsage | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    if (busy) return;
    setBusy(true);
    try {
      setUsage(
        await rpc<CardOfferUsage>("get_franky_card_offer_usage", {
          p_offer_id: offer.id,
        }),
      );
      setError("");
    } catch (e) {
      setUsage(null);
      setError(cardError((e as Error).message));
    } finally {
      setBusy(false);
    }
  }
  if (offer.kind !== "campaign") return null;
  return (
    <div className="mt-3 border-t border-border pt-3 text-sm">
      <button
        type="button"
        className="font-semibold text-violet disabled:opacity-40"
        disabled={busy}
        onClick={() => void load()}
      >
        {busy
          ? "Consultando…"
          : usage
            ? "Actualizar uso de la campaña"
            : "Consultar uso de la campaña"}
      </button>
      {error && (
        <p role="alert" className="mt-2">
          {error}
        </p>
      )}
      {usage && (
        <div className="mt-2 space-y-1">
          <p>
            {usage.completed_uses} consumos realizados · {usage.committed_uses}{" "}
            usos comprometidos
          </p>
          <p>
            Descuentos comprometidos: {cardCents(usage.committed_cents)}
            {usage.budget_cents !== null
              ? ` de ${cardCents(usage.budget_cents)}`
              : ""}
          </p>
          {usage.remaining_uses !== null && (
            <p>Quedan {usage.remaining_uses} usos.</p>
          )}
          <p className="text-xs text-text-secondary">
            Incluye solicitudes pendientes y reservas. Lectura puntual, puede
            cambiar con nuevas operaciones.
          </p>
        </div>
      )}
    </div>
  );
}
