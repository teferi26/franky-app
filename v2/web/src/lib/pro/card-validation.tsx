"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, ScanLine, Wallet } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { useCardClient } from "@/components/card/card-client";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  FormField,
  PageHeader,
  Panel,
  inputClass,
} from "@/components/pro/kit";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { createClient } from "@/lib/supabase-client";
import {
  parseCardCredential,
  type CardMerchant,
  type CardRequest,
} from "../../../../shared/franky-card";
import type { ProService } from "./types";
import { money } from "./format";
import {
  ProCardError,
  ProCardSession,
  cardRequestState,
  publicCardError,
} from "./card-remote";
import { useProCardScanner } from "./card-scanner";

type Props = { organizationId: string; services: ProService[] };

export function RealCardValidation(props: Props) {
  const { user, loading } = useSession();
  if (loading)
    return (
      <div
        className="h-80 rounded-3xl skeleton-shimmer"
        role="status"
        aria-label="Abriendo Franky Card"
      />
    );
  if (!user)
    return (
      <Empty
        icon={ScanLine}
        title="Entra para validar tarjetas"
        body="Usa la cuenta con la que trabajas en este negocio."
      />
    );
  return (
    <CardValidation
      key={`${user.id}:${props.organizationId}`}
      {...props}
      userId={user.id}
    />
  );
}

function CardValidation({
  organizationId,
  services,
  userId,
}: Props & { userId: string }) {
  const { rpc, api } = useCardClient(userId);
  const current = useSessionGuard(userId);
  const controllerRef = React.useRef<ProCardSession | null>(null);
  const [merchant, setMerchant] = React.useState<CardMerchant | null>(null);
  const [venueId, setVenueId] = React.useState("");
  const [offerId, setOfferId] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [token, setToken] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [publicPrice, setPublicPrice] = React.useState("");
  const [otherPromotion, setOtherPromotion] = React.useState(false);
  const [unitConfirmed, setUnitConfirmed] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [request, setRequest] = React.useState<CardRequest | null>(null);
  const [reference, setReference] = React.useState("");
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [photoRetry, setPhotoRetry] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [revoked, setRevoked] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  const alive = React.useRef(true);
  const legacyHref = `/espacios/card?organization=${encodeURIComponent(organizationId)}`;
  const venue = merchant?.venues.find((item) => item.id === venueId);
  const offers =
    venue?.offers.filter((offer) => offer.status === "active") ?? [];
  const offer = offers.find((item) => item.id === offerId);
  const eligibleServices = services.filter((service) =>
    offer?.service_keys.some((key) => key === "*" || key === service.id),
  );
  const service = eligibleServices.find((item) => item.id === serviceId);
  const state = request ? cardRequestState(request, now) : null;

  const clearPrivate = React.useCallback(() => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setRevoked(true);
    setMerchant(null);
    setRequest(null);
    setToken("");
    setReference("");
    setAmount("");
    setPublicPrice("");
    setPhoto(null);
    setPhotoError(null);
    setScanning(false);
  }, []);

  const failed = React.useCallback(
    (reason: unknown) => {
      if (!alive.current) return;
      if (
        !current() ||
        (reason instanceof ProCardError &&
          ["auth_required", "card_forbidden"].includes(reason.code))
      )
        clearPrivate();
      setError(publicCardError(reason));
    },
    [clearPrivate, current],
  );

  const load = React.useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    setBusy(true);
    try {
      const next = await controller.loadMerchant();
      if (
        !alive.current ||
        controllerRef.current !== controller ||
        !current() ||
        !next
      )
        return;
      setMerchant(next);
      setVenueId((previous) =>
        next.venues.some((item) => item.id === previous)
          ? previous
          : (next.venues.find((item) => item.status === "active")?.id ?? ""),
      );
      setError(null);
    } catch (reason) {
      if (controllerRef.current === controller) failed(reason);
    } finally {
      if (alive.current && controllerRef.current === controller) setBusy(false);
    }
  }, [current, failed]);

  React.useEffect(() => {
    alive.current = true;
    const controller = new ProCardSession(
      (name, args) => rpc<unknown>(name, args),
      organizationId,
      current,
    );
    controllerRef.current = controller;
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (
        alive.current &&
        (event === "SIGNED_OUT" || session?.user.id !== userId)
      )
        clearPrivate();
    });
    void load();
    return () => {
      alive.current = false;
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
      data.subscription.unsubscribe();
    };
  }, [clearPrivate, current, load, organizationId, rpc, userId]);

  React.useEffect(() => {
    setOfferId(
      venue?.offers.find((item) => item.status === "active")?.id ?? "",
    );
    setServiceId("");
  }, [venueId, venue?.offers]);

  const readRequest = React.useCallback(
    async (id: string) => {
      const controller = controllerRef.current;
      if (!controller) return;
      try {
        const next = await controller.read(id);
        if (
          alive.current &&
          controllerRef.current === controller &&
          current() &&
          next
        ) {
          setRequest(next);
          setError(null);
        }
      } catch (reason) {
        if (controllerRef.current === controller) failed(reason);
      }
    },
    [current, failed],
  );

  React.useEffect(() => {
    if (!request || !["pending", "customer_confirmed"].includes(request.status))
      return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void readRequest(request.id);
    }, 2_000);
    const focus = () => void readRequest(request.id);
    window.addEventListener("focus", focus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [readRequest, request?.id, request?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    let live = true;
    setPhoto(null);
    setPhotoLoading(false);
    setPhotoError(null);
    if (!request?.identity?.photo_path || state !== "customer_confirmed")
      return;
    setPhotoLoading(true);
    void api<{ url: string }>(
      `media?operation=${encodeURIComponent(request.id)}`,
    )
      .then((result) => {
        if (!live || !current()) return;
        if (
          typeof result.url !== "string" ||
          !result.url.startsWith("https://")
        )
          throw new Error("card_photo_unavailable");
        setPhoto(result.url);
      })
      .catch(() => {
        if (live && current()) {
          setPhotoLoading(false);
          setPhotoError(
            "No podemos mostrar la foto de la tarjeta. Actualiza antes de confirmar.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [
    api,
    current,
    request?.id,
    request?.identity?.photo_path,
    state,
    photoRetry,
  ]);

  const scanner = useProCardScanner(scanning && !revoked, (credential) => {
    setToken(credential);
    setScanning(false);
  });

  const start = async () => {
    const controller = controllerRef.current;
    if (!controller || !service || !unitConfirmed) return;
    setBusy(true);
    setError(null);
    try {
      const gross = amountCents(amount);
      const next = await controller.create({
        venueId,
        offerId,
        serviceId: service.id,
        serviceName: service.name,
        credential: token,
        grossCents: gross,
        publicPriceCents: otherPromotion ? amountCents(publicPrice) : gross,
      });
      if (
        alive.current &&
        controllerRef.current === controller &&
        current() &&
        next
      ) {
        setRequest(next);
        setToken("");
        setReference("");
      }
    } catch (reason) {
      if (controllerRef.current === controller) failed(reason);
    } finally {
      if (alive.current && controllerRef.current === controller) setBusy(false);
    }
  };

  const respond = async (action: "confirm" | "reject") => {
    const controller = controllerRef.current;
    if (!controller) return;
    setBusy(true);
    setError(null);
    try {
      const next = await controller.respond(action, reference);
      if (
        alive.current &&
        controllerRef.current === controller &&
        current() &&
        next
      )
        setRequest(next);
    } catch (reason) {
      if (controllerRef.current === controller) failed(reason);
    } finally {
      if (alive.current && controllerRef.current === controller) setBusy(false);
    }
  };

  const reset = () => {
    const controller = controllerRef.current;
    if (!controller) return;
    try {
      controller.reset();
      setRequest(null);
      setToken("");
      setReference("");
      setAmount("");
      setServiceId("");
      setUnitConfirmed(false);
      setOtherPromotion(false);
      setError(null);
      void load();
    } catch (reason) {
      failed(reason);
    }
  };

  if (revoked)
    return (
      <Empty
        icon={ScanLine}
        title="Vuelve a abrir tu negocio"
        body={error ?? "La sesión ha cambiado y hemos cerrado esta operación."}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Franky Card"
        title="Validar Franky Card"
        description="Escanea la tarjeta, revisa el importe y espera la confirmación del estudiante."
      />
      {error || photoError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-bg-primary p-4 text-sm"
        >
          <p className="flex-1">{error ?? photoError}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (photoError) setPhotoRetry((value) => value + 1);
              return request ? readRequest(request.id) : load();
            }}
          >
            Actualizar
          </Button>
        </div>
      ) : null}
      {!merchant ? (
        <Panel>
          <p role="status">
            {busy
              ? "Abriendo Franky Card"
              : "Actualiza para abrir Franky Card."}
          </p>
        </Panel>
      ) : !merchant.enabled || !merchant.permissions.redeem ? (
        <Empty
          icon={ScanLine}
          title="La validación aún no está disponible"
          body="Abre el panel de Card para revisar la activación y el acceso de tu equipo."
          action={
            <Link
              href={legacyHref}
              className={buttonVariants({ variant: "outline" })}
            >
              Abrir panel de Card
            </Link>
          }
        />
      ) : request ? (
        <Panel
          title={
            state === "completed"
              ? "Operación registrada"
              : state === "rejected"
                ? "Solicitud rechazada"
                : state === "expired"
                  ? "Solicitud caducada"
                  : state === "customer_confirmed"
                    ? "El estudiante ha confirmado"
                    : "Esperando al estudiante"
          }
        >
          <div className="flex max-w-xl flex-col gap-4">
            {state === "completed" ? (
              <Check className="h-8 w-8 text-success" aria-hidden />
            ) : null}
            {state === "pending" ? (
              <p role="status" className="text-sm text-text-muted">
                Pídele que confirme el importe en su móvil. Todavía no hay
                ningún descuento registrado.
              </p>
            ) : null}
            {state === "customer_confirmed" && request.identity ? (
              <div className="flex items-center gap-3">
                {photo ? (
                  <Image
                    src={photo}
                    unoptimized
                    alt="Foto de la tarjeta confirmada"
                    width={56}
                    height={64}
                    className="rounded-xl object-cover"
                    onLoad={() => {
                      if (current()) setPhotoLoading(false);
                    }}
                    onError={() => {
                      if (!current()) return;
                      setPhoto(null);
                      setPhotoLoading(false);
                      setPhotoError(
                        "No podemos mostrar la foto de la tarjeta. Actualiza antes de confirmar.",
                      );
                    }}
                  />
                ) : null}
                <p className="font-semibold">{request.identity.full_name}</p>
              </div>
            ) : null}
            <ul className="divide-y divide-border-light text-sm">
              {request.lines.map((line) => (
                <li key={line.id} className="flex justify-between gap-3 py-2">
                  <span>{line.label}</span>
                  <span className="tabular">{money(line.gross_cents)}</span>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl bg-bg-secondary p-4">
              <p className="text-sm text-text-muted">
                {state === "completed"
                  ? "Importe registrado"
                  : "Importe propuesto al estudiante"}
              </p>
              <p className="mt-1 font-heading text-3xl font-bold tabular">
                {money(request.money.final_cents)}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {state === "completed"
                  ? "Descuento registrado"
                  : "Descuento propuesto"}
                : {money(request.money.discount_cents)}
              </p>
            </div>
            {state === "customer_confirmed" ? (
              <>
                {!request.expected_external_reference ? (
                  <FormField
                    label="Referencia del ticket"
                    htmlFor="pro-card-receipt"
                  >
                    <input
                      id="pro-card-receipt"
                      disabled={busy}
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      className={inputClass}
                      autoComplete="off"
                      maxLength={120}
                      placeholder="Ejemplo: ticket 1482"
                    />
                  </FormField>
                ) : null}
                <p className="text-sm text-text-muted">
                  Comprueba la tarjeta y registra la operación cuando hayas
                  cobrado y realizado el servicio.
                </p>
                <Button
                  variant="dark"
                  disabled={
                    busy ||
                    photoLoading ||
                    Boolean(request.identity?.photo_path && !photo) ||
                    !request.identity ||
                    (!request.expected_external_reference &&
                      reference.trim().length < 3)
                  }
                  onClick={() => respond("confirm")}
                >
                  <Wallet className="h-4 w-4" /> Servicio realizado, registrar
                </Button>
              </>
            ) : null}
            {state === "pending" || state === "customer_confirmed" ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => respond("reject")}
              >
                Cancelar solicitud
              </Button>
            ) : (
              <Button variant="dark" onClick={reset}>
                Siguiente tarjeta
              </Button>
            )}
            {state === "completed" ? (
              <p className="text-xs text-text-muted">
                Ticket {request.external_reference} · Comprobante{" "}
                {request.consumption_id}
              </p>
            ) : null}
          </div>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <Panel title="Una unidad o servicio">
            <div className="flex flex-col gap-4">
              <FormField label="Local" htmlFor="pro-card-venue">
                <select
                  id="pro-card-venue"
                  className={inputClass}
                  value={venueId}
                  onChange={(event) => setVenueId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Elige el local</option>
                  {merchant.venues
                    .filter((item) => item.status === "active")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Ventaja" htmlFor="pro-card-offer">
                <select
                  id="pro-card-offer"
                  className={inputClass}
                  value={offerId}
                  onChange={(event) => {
                    setOfferId(event.target.value);
                    setServiceId("");
                  }}
                  disabled={busy}
                >
                  <option value="">Elige la ventaja</option>
                  {offers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </FormField>
              {scanning ? (
                <div>
                  <video
                    ref={scanner.video}
                    playsInline
                    muted
                    className="aspect-square w-full rounded-2xl bg-bg-secondary object-cover"
                    aria-label="Cámara para leer la tarjeta"
                  />
                  <Button variant="ghost" onClick={() => setScanning(false)}>
                    Cerrar cámara
                  </Button>
                </div>
              ) : (
                <Button
                  variant="dark"
                  className="h-24 gap-3 rounded-2xl"
                  disabled={busy}
                  onClick={() => setScanning(true)}
                >
                  <ScanLine className="h-7 w-7" /> Escanear código
                </Button>
              )}
              {scanner.error ? (
                <p role="status" className="text-sm text-text-muted">
                  {scanner.error}
                </p>
              ) : null}
              <FormField
                label="Código compartido por el estudiante"
                htmlFor="pro-card-token"
                hint="También puedes pegar el código de su tarjeta."
              >
                <input
                  id="pro-card-token"
                  className={inputClass}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  type="password"
                  disabled={busy}
                />
              </FormField>
              <FormField label="Servicio" htmlFor="pro-card-service">
                <select
                  id="pro-card-service"
                  className={inputClass}
                  value={serviceId}
                  disabled={busy}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    const selected = eligibleServices.find(
                      (item) => item.id === event.target.value,
                    );
                    setAmount(
                      selected
                        ? (selected.priceCents / 100)
                            .toFixed(2)
                            .replace(".", ",")
                        : "",
                    );
                    setUnitConfirmed(false);
                  }}
                >
                  <option value="">Elige una unidad del catálogo</option>
                  {eligibleServices.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Importe de esa unidad (€)"
                htmlFor="pro-card-amount"
              >
                <input
                  id="pro-card-amount"
                  className={inputClass}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  disabled={busy}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={otherPromotion}
                  onChange={(event) => setOtherPromotion(event.target.checked)}
                  disabled={busy}
                />{" "}
                Esta unidad tiene otra promoción pública
              </label>
              {otherPromotion ? (
                <FormField
                  label="Precio con esa promoción (€)"
                  htmlFor="pro-card-public"
                >
                  <input
                    id="pro-card-public"
                    className={inputClass}
                    value={publicPrice}
                    onChange={(event) => setPublicPrice(event.target.value)}
                    inputMode="decimal"
                    disabled={busy}
                  />
                </FormField>
              ) : null}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={unitConfirmed}
                  onChange={(event) => setUnitConfirmed(event.target.checked)}
                  disabled={busy}
                />{" "}
                El importe corresponde a una sola unidad del servicio elegido
              </label>
              <Button
                variant="dark"
                disabled={
                  busy ||
                  !service ||
                  !parseCardCredential(token) ||
                  !unitConfirmed
                }
                onClick={start}
              >
                Pedir confirmación al estudiante
              </Button>
            </div>
          </Panel>
          <div className="flex flex-col gap-5">
            <Panel title="Tickets con varias promociones">
              <p className="text-sm text-text-muted">
                Si este ticket incluye varias promociones o servicios, revísalo
                en el panel de Card.
              </p>
              <Link
                href={legacyHref}
                className={buttonVariants({
                  variant: "outline",
                  className: "mt-4",
                })}
              >
                Abrir panel de Card
              </Link>
            </Panel>
            {merchant.pending_requests.length ? (
              <Panel title="Solicitudes pendientes">
                <ul className="flex flex-col gap-2">
                  {merchant.pending_requests.map((item) => (
                    <li key={item.id}>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                        disabled={busy}
                        onClick={() => readRequest(item.id)}
                      >
                        <span>{item.venue_name}</span>
                        <span>{money(item.money.final_cents)}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function amountCents(value: string): number {
  if (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new ProCardError("card_invalid_input");
  return Math.round(Number(value.trim().replace(",", ".")) * 100);
}
