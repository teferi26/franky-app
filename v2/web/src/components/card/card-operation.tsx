"use client";
import { useEffect, useState } from "react";
import {
  CARD_REQUEST_LABELS,
  cardCents,
  type CardRequest,
} from "../../../../shared/franky-card";
import { cardButton, cardInput, cardPanel } from "./card-client";
import { CardCampaignConditions } from "./card-campaign";
type Api = <T>(route: string, body?: unknown) => Promise<T>;
export default function CardOperation({
  request,
  busy,
  onRespond,
  api,
}: {
  request: CardRequest;
  busy: boolean;
  onRespond: (action: "confirm" | "reject", reference?: string) => void;
  api: Api;
}) {
  const [reference, setReference] = useState(""),
    [photo, setPhoto] = useState<string | null>(null);
  const merchant = request.actor === "merchant";
  useEffect(() => {
    let live = true;
    setPhoto(null);
    if (
      merchant &&
      request.status === "customer_confirmed" &&
      request.identity?.photo_path
    )
      void api<{ url: string }>("media?operation=" + request.id)
        .then((r) => {
          if (live) setPhoto(r.url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, merchant, request.id, request.status, request.identity?.photo_path]);
  return (
    <article className={cardPanel + " space-y-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{request.venue_name}</h3>
          <p className="text-sm text-text-secondary">
            {CARD_REQUEST_LABELS[request.status]}
          </p>
        </div>
        <strong className="rounded-full bg-violet/10 px-3 py-1 text-violet">
          {request.kind === "reward"
            ? "Canje de premio"
            : request.kind === "protected"
              ? "Descuento reservado"
              : request.kind === "discount"
                ? "Descuento Card"
                : "Sumar sello"}
        </strong>
      </div>
      {request.identity && merchant && (
        <div className="flex items-center gap-3">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Fotografía de la persona que confirma"
              width={54}
              height={64}
              className="rounded-lg object-cover"
            />
          )}
          <strong>{request.identity.full_name}</strong>
        </div>
      )}
      <ul className="space-y-2 text-sm">
        {request.lines.map((l) => (
          <li key={l.id} className="flex justify-between gap-3">
            <span>{l.label}</span>
            <span>{cardCents(l.final_cents)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
        <dt>Precio de referencia</dt>
        <dd className="text-right">
          {cardCents(request.money.public_price_cents)}
        </dd>
        <dt>Descuento aplicado</dt>
        <dd className="text-right">
          {cardCents(request.money.discount_cents)}
        </dd>
        <dt className="font-bold">Total a pagar al comercio</dt>
        <dd className="text-right text-lg font-bold">
          {cardCents(request.money.final_cents)}
        </dd>
      </dl>
      {request.offer && (
        <p className="text-xs text-text-secondary">
          {request.offer.title} · {request.offer.percent}% ·{" "}
          {request.offer.terms}
        </p>
      )}
      {request.offer && <CardCampaignConditions offer={request.offer} />}
      {request.program && (
        <p className="rounded-xl bg-bg-secondary p-3 text-sm">
          {request.program.title}: {request.program.required_stamps} servicios
          pagados → {request.program.reward_label}. {request.program.terms}
        </p>
      )}
      {request.status === "pending" && !merchant && (
        <>
          <p className="text-sm">
            Al confirmar autorizas esta operación y el registro de fidelización
            indicado. El comercio verá tu nombre y tu foto para comprobar la
            tarjeta.
          </p>
          <div className="flex gap-3">
            <button
              disabled={busy}
              className={cardButton}
              onClick={() => onRespond("confirm")}
            >
              Confirmar importe y condiciones
            </button>
            <button disabled={busy} onClick={() => onRespond("reject")}>
              Rechazar
            </button>
          </div>
        </>
      )}
      {request.status === "pending" && merchant && (
        <p role="status" className="text-sm">
          Espera a que la persona confirme en su aplicación.
        </p>
      )}
      {request.status === "customer_confirmed" && merchant && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRespond(
              "confirm",
              request.expected_external_reference ?? reference.trim(),
            );
          }}
        >
          {request.expected_external_reference ? (
            <p className="text-sm">
              Esta visita está vinculada a su reserva. Se conservarán el importe
              y la referencia ya confirmados.
            </p>
          ) : (
            <label className="block text-sm">
              Referencia del ticket o servicio
              <input
                className={cardInput}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                minLength={1}
                maxLength={100}
                required
                autoComplete="off"
              />
            </label>
          )}
          <p className="text-xs text-text-secondary">
            Confirma después de cobrar y realizar el servicio. Un mismo ticket
            no puede registrar dos visitas. Esta acción registra el consumo; no
            cobra a la persona.
          </p>
          <div className="flex gap-3">
            <button disabled={busy} className={cardButton}>
              Servicio realizado: registrar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRespond("reject")}
            >
              Cancelar operación
            </button>
          </div>
        </form>
      )}
      {request.status === "customer_confirmed" && !merchant && (
        <p className="text-sm" role="status">
          Tu confirmación está guardada. El comercio completará el registro al
          terminar.
        </p>
      )}
      {request.demo && (
        <p className="text-xs text-amber-700">
          Demostración aislada · no hay cobros reales
        </p>
      )}
    </article>
  );
}
