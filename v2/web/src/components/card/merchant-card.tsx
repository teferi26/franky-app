"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CardSession,
  CardField,
  cardButton,
  cardInput,
  cardPanel,
  cardError,
  useCardClient,
} from "./card-client";
import CardOperation from "./card-operation";
import {
  CardCampaignFields,
  CardCampaignConditions,
  CardCampaignUsage,
  campaignFormData,
} from "./card-campaign";
import {
  CARD_AGREEMENT_VERSION,
  parseCardCredential,
  cardCents,
  type CardMerchant,
  type CardRequest,
  type CardConsumption,
  type CardPage,
  type CardLineInput,
} from "../../../../shared/franky-card";
import type { Workspace } from "../../../../shared/workspaces";
import {
  PROFESSIONAL_SECTORS,
  PROFESSIONAL_CATEGORIES,
  type ProfessionalService,
} from "../../../../shared/professional-services";
export default function MerchantCard() {
  return (
    <CardSession>{(userId) => <SelectMerchant userId={userId} />}</CardSession>
  );
}
function SelectMerchant({ userId }: { userId: string }) {
  const { rpc } = useCardClient(userId);
  const [spaces, setSpaces] = useState<Workspace[]>([]),
    [active, setActive] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void rpc<Workspace[]>("list_my_workspaces")
      .then((data) => {
        if (!live) return;
        const allowed = data.filter(
          (s) => s.kind === "leisure" || s.kind === "community",
        );
        setSpaces(allowed);
        const id = new URLSearchParams(window.location.search).get(
          "organization",
        );
        setActive(allowed.find((s) => s.id === id)?.id ?? allowed[0]?.id ?? "");
      })
      .catch(() => setError("No se pudieron recuperar tus espacios."));
    return () => {
      live = false;
    };
  }, [rpc]);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8">
      <Link href="/espacios" className="text-sm text-text-secondary">
        ← Mis espacios
      </Link>
      <h1 className="mt-3 text-3xl font-bold">Franky Card en tu negocio</h1>
      <p className="mt-2 text-text-secondary">
        Valida descuentos, registra visitas y premia a quienes vuelven.
      </p>
      {error && <p role="alert">{error}</p>}
      <label className="my-6 block max-w-md text-sm">
        Establecimiento
        <select
          value={active}
          onChange={(e) => setActive(e.target.value)}
          className={cardInput}
        >
          <option value="" disabled>
            Selecciona un espacio
          </option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.demo_cohort_id ? " · Demo" : ""}
            </option>
          ))}
        </select>
      </label>
      {active ? (
        <Merchant key={active} userId={userId} organizationId={active} />
      ) : (
        <p className={cardPanel}>
          Necesitas un espacio de ocio o comunidad con permiso para gestionar
          establecimientos.{" "}
          <Link className="text-violet" href="/espacios">
            Abrir mis espacios
          </Link>
        </p>
      )}
    </main>
  );
}
function Merchant({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const { rpc, api } = useCardClient(userId);
  const [offerKind, setOfferKind] = useState<"base" | "campaign">("base");
  const [data, setData] = useState<CardMerchant | null>(null),
    [venueId, setVenueId] = useState(""),
    [tab, setTab] = useState<
      "validate" | "venues" | "offers" | "programs" | "history"
    >("validate"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [operation, setOperation] = useState<CardRequest | null>(null),
    [history, setHistory] = useState<CardPage<CardConsumption>>({
      items: [],
      next_cursor: null,
    });
  const [token, setToken] = useState(""),
    [kind, setKind] = useState<"discount" | "loyalty" | "reward">("discount"),
    [offerId, setOfferId] = useState(""),
    [programId, setProgramId] = useState(""),
    [lines, setLines] = useState<
      {
        id: string;
        label: string;
        service_key: string;
        gross: string;
        public: string;
      }[]
    >([
      {
        id: crypto.randomUUID(),
        label: "",
        service_key: "",
        gross: "",
        public: "",
      },
    ]),
    [scanning, setScanning] = useState(false),
    [services, setServices] = useState<ProfessionalService[]>([]),
    [bookingId, setBookingId] = useState<string | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    attempt = useRef<{ payload: string; id: string } | null>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const writeAttempts = useRef(new Map<string, string>());
  async function saveCard<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const fingerprint = JSON.stringify([name, args]);
    let key = writeAttempts.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      writeAttempts.current.set(fingerprint, key);
    }
    const result = await rpc<T>(name, { ...args, p_request_key: key });
    writeAttempts.current.delete(fingerprint);
    return result;
  }
  const venue = data?.venues.find((v) => v.id === venueId);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search),
      b = q.get("booking");
    if (
      q.get("organization") === organizationId &&
      b &&
      /^[a-f0-9-]{36}$/i.test(b)
    )
      setBookingId(b);
  }, [organizationId]);
  const serviceKey = (name: string) =>
    services.find(
      (s) =>
        s.id === name.trim() ||
        s.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    )?.id ??
    name
      .trim()
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_.-]+/g, "-")
      .replace(/^-|-$/g, "");
  useEffect(() => {
    let live = true;
    void rpc<{ services: ProfessionalService[] }>(
      "professional_get_workspace",
      { p_organization_id: organizationId },
    )
      .then((value) => {
        if (live) setServices(value.services ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [rpc, organizationId]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const value = await rpc<CardMerchant>("get_franky_card_merchant", {
        p_organization_id: organizationId,
      });
      if (!alive.current || g !== generation.current) return;
      setData(value);
      setTab((old) => {
        const allowed: (typeof old)[] = [];
        if (value.permissions.redeem) allowed.push("validate");
        if (value.permissions.manage)
          allowed.push("venues", "offers", "programs");
        if (value.permissions.finance) allowed.push("history");
        return allowed.includes(old) ? old : (allowed[0] ?? "validate");
      });
      if (!value.permissions.redeem) setScanning(false);
      setVenueId((prev) =>
        value.venues.some((v) => v.id === prev)
          ? prev
          : (value.venues[0]?.id ?? ""),
      );
    } catch (e) {
      if (alive.current && g === generation.current) {
        setData(null);
        setOperation(null);
        setToken("");
        setScanning(false);
        setError(cardError((e as Error).message));
      }
    }
  }, [rpc, organizationId]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (
      !operation ||
      ["completed", "rejected", "expired"].includes(operation.status)
    )
      return;
    let live = true;
    const timer = setInterval(() => {
      void rpc<CardRequest>("get_franky_card_request", {
        p_request_id: operation.id,
      })
        .then((value) => {
          if (live) setOperation(value);
        })
        .catch(() => {
          if (live)
            setError(
              "No se pudo comprobar la operación. Reintenta antes de registrar el servicio.",
            );
        });
    }, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [operation?.id, operation?.status, rpc]);
  useEffect(() => {
    setOfferId("");
    setProgramId("");
    setOperation(null);
    setToken("");
    attempt.current = null;
  }, [venueId]);
  useEffect(() => {
    setScanning(false);
  }, [venueId, offerId, programId, kind, tab]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== "visible") {
        setScanning(false);
        stream.current?.getTracks().forEach((t) => t.stop());
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  async function mutate(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      if (alive.current) await load();
    } catch (e) {
      if (alive.current) setError(cardError((e as Error).message));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!scanning) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    async function start() {
      try {
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (options: { formats: string[] }) => {
              detect: (
                source: HTMLVideoElement,
              ) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
        if (!Detector) throw Error("unsupported");
        const detector = new Detector({ formats: ["qr_code"] });
        const camera = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) {
          camera.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = camera;
        if (video.current) {
          video.current.srcObject = camera;
          await video.current.play();
        }
        const scan = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (stopped) return;
            if (found[0]) {
              setToken(found[0].rawValue);
              setScanning(false);
              return;
            }
          } catch {}
          timer = setTimeout(() => void scan(), 350);
        };
        void scan();
      } catch {
        if (stopped) return;
        setNotice(
          "Este navegador no permite escanear. Utiliza la cámara de la app Franky o pega el código proporcionado por el cliente.",
        );
        setScanning(false);
      }
    }
    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [scanning, venueId, offerId, programId, kind, tab]);
  async function historyLoad(append = false) {
    try {
      const value = await rpc<CardPage<CardConsumption>>(
        "get_franky_card_history",
        {
          p_organization_id: organizationId,
          p_cursor: append ? history.next_cursor : null,
          p_limit: 40,
        },
      );
      setHistory((previous) => ({
        items: append ? [...previous.items, ...value.items] : value.items,
        next_cursor: value.next_cursor,
      }));
    } catch (e) {
      setError(cardError((e as Error).message));
    }
  }
  useEffect(() => {
    if (tab === "history" && data?.permissions.finance) void historyLoad();
  }, [tab, data?.permissions.finance, organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  function asCents(input: string) {
    if (!/^\d{1,6}(?:[.,]\d{1,2})?$/.test(input.trim()))
      throw Error("card_invalid_input");
    return Math.round(Number(input.replace(",", ".")) * 100);
  }
  async function request() {
    await mutate(async () => {
      const credential = parseCardCredential(token);
      if (!credential) throw Error("card_credential_invalid");
      if (bookingId) {
        const args = {
          p_booking_id: bookingId,
          p_token: credential,
          p_program_id: programId || null,
        };
        const serialized = JSON.stringify(args);
        if (attempt.current?.payload !== serialized)
          attempt.current = { payload: serialized, id: crypto.randomUUID() };
        const op = await rpc<CardRequest>(
          "create_franky_card_booking_request",
          { ...args, p_request_key: attempt.current.id },
        );
        setOperation(op);
        setToken("");
        return;
      }
      const inputs: CardLineInput[] = lines.map((l) => ({
        id: l.id,
        label: l.label.trim(),
        service_key: serviceKey(l.service_key),
        gross_cents: asCents(l.gross),
        public_price_cents: asCents(l.public || l.gross),
      }));
      const args = {
        p_venue_id: venueId,
        p_token: credential,
        p_kind: kind,
        p_offer_id: kind === "discount" ? offerId || null : null,
        p_program_id: programId || null,
        p_lines: inputs,
      };
      const serialized = JSON.stringify(args);
      if (attempt.current?.payload !== serialized)
        attempt.current = { payload: serialized, id: crypto.randomUUID() };
      const op = await rpc<CardRequest>("create_franky_card_request", {
        ...args,
        p_request_key: attempt.current.id,
      });
      setOperation(op);
      setToken("");
    });
  }
  return (
    <>
      <datalist id="card-service-names">
        {services.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      {error && (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-800">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Actualizar
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mb-5 rounded-xl bg-violet/10 p-4">
          {notice}
        </p>
      )}
      {data?.demo && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Demo aislada. Los registros no se incorporan a estadísticas
          comerciales ni generan cobros.
        </p>
      )}
      {data && !data.enabled && (
        <p className={cardPanel}>
          La tarjeta está en preparación. Conservas el acceso a las herramientas
          actuales de tu negocio.
        </p>
      )}
      {data?.enabled && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block min-w-60 text-sm">
              Local
              <select
                className={cardInput}
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona un local
                </option>
                {data.venues.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name} · {v.city}
                    {v.status === "active" ? "" : " · Pendiente"}
                  </option>
                ))}
              </select>
            </label>
            <Link
              href={"/espacios/servicios?organization=" + organizationId}
              className="pb-3 font-semibold text-violet"
            >
              Agenda y servicios →
            </Link>
          </div>
          <nav
            className="my-6 flex gap-2 overflow-x-auto pb-2"
            aria-label="Gestión de Card"
          >
            {(
              [
                ["validate", "Validar tarjeta"],
                ["venues", "Locales"],
                ["offers", "Descuentos"],
                ["programs", "Fidelización"],
                ["history", "Historial"],
              ] as const
            )
              .filter(([id]) =>
                id === "validate"
                  ? data.permissions.redeem
                  : id === "history"
                    ? data.permissions.finance
                    : data.permissions.manage,
              )
              .map(([id, label]) => (
                <button
                  key={id}
                  className={
                    tab === id
                      ? cardButton
                      : "shrink-0 rounded-xl px-4 py-3 text-sm"
                  }
                  onClick={() => {
                    setTab(id);
                  }}
                >
                  {label}
                </button>
              ))}
          </nav>
          {data.totals && (tab === "validate" || tab === "history") && (
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {[
                ["Consumos confirmados", data.totals.confirmed_consumptions],
                [
                  "Descuentos concedidos",
                  cardCents(data.totals.discount_cents),
                ],
                [
                  "Ajustes y devoluciones",
                  cardCents(data.totals.reversed_savings_cents),
                ],
              ].map(([label, value]) => (
                <div key={label} className={cardPanel}>
                  <p className="text-sm text-text-secondary">{label}</p>
                  <strong className="mt-2 block text-2xl">{value}</strong>
                </div>
              ))}
            </div>
          )}
          {tab === "validate" && data.permissions.redeem && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                {venue?.status === "active" ? (
                  <form
                    className={cardPanel + " space-y-4"}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void request();
                    }}
                  >
                    <h2 className="text-xl font-bold">
                      Una visita, un registro
                    </h2>
                    <p className="text-sm text-text-secondary">
                      Escanea la tarjeta, prepara el importe y espera la
                      confirmación del cliente. Registrar no realiza ningún
                      cobro.
                    </p>
                    <button
                      type="button"
                      onClick={() => setScanning((v) => !v)}
                      className={cardButton}
                    >
                      {scanning ? "Cerrar cámara" : "Escanear Franky Card"}
                    </button>
                    {scanning && (
                      <video
                        ref={video}
                        playsInline
                        muted
                        className="aspect-square w-full rounded-xl bg-black"
                      />
                    )}
                    <CardField label="Código de la tarjeta">
                      <textarea
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className={cardInput}
                        rows={2}
                        maxLength={500}
                        required
                        autoComplete="off"
                      />
                    </CardField>
                    {bookingId ? (
                      <p className="rounded-xl bg-violet/10 p-4 text-sm">
                        Usaremos el servicio y el importe protegido de la
                        reserva. No es necesario renovar la Card si estaba
                        activa al reservar.
                      </p>
                    ) : (
                      <CardField label="Qué quieres registrar">
                        <select
                          className={cardInput}
                          value={kind}
                          onChange={(e) =>
                            setKind(e.target.value as typeof kind)
                          }
                        >
                          <option value="discount">
                            Descuento Card y sello opcional
                          </option>
                          <option value="loyalty">
                            Servicio pagado: sumar sello
                          </option>
                          <option value="reward">
                            Canjear un premio disponible
                          </option>
                        </select>
                      </CardField>
                    )}
                    {!bookingId && kind === "discount" && (
                      <CardField label="Descuento">
                        <select
                          className={cardInput}
                          required
                          value={offerId}
                          onChange={(e) => setOfferId(e.target.value)}
                        >
                          <option value="">Selecciona una ventaja</option>
                          {venue.offers
                            .filter((o) => o.status === "active")
                            .map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.title} · {o.percent}%
                              </option>
                            ))}
                        </select>
                      </CardField>
                    )}
                    <CardField
                      label={
                        kind === "reward"
                          ? "Premio del programa"
                          : "Programa de fidelización"
                      }
                    >
                      <select
                        className={cardInput}
                        required={!bookingId && kind !== "discount"}
                        value={programId}
                        onChange={(e) => setProgramId(e.target.value)}
                      >
                        <option value="">
                          {kind === "discount"
                            ? "Sin sello"
                            : "Selecciona un programa"}
                        </option>
                        {venue.programs
                          .filter(
                            (p) => p.status === "active" || kind === "reward",
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} · {p.required_stamps} sellos
                            </option>
                          ))}
                      </select>
                    </CardField>
                    {!bookingId && (
                      <div className="space-y-4">
                        {lines.map((l, index) => (
                          <fieldset
                            key={l.id}
                            className="space-y-3 rounded-xl border border-border p-4"
                          >
                            <legend className="text-sm">
                              Servicio {index + 1}
                            </legend>
                            <CardField label="Descripción">
                              <input
                                className={cardInput}
                                value={l.label}
                                onChange={(e) =>
                                  setLines((a) =>
                                    a.map((x) =>
                                      x.id === l.id
                                        ? { ...x, label: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                                required
                                maxLength={120}
                              />
                            </CardField>
                            <CardField label="Servicio incluido en la ventaja">
                              <input
                                className={cardInput}
                                list="card-service-names"
                                value={l.service_key}
                                onChange={(e) =>
                                  setLines((a) =>
                                    a.map((x) =>
                                      x.id === l.id
                                        ? { ...x, service_key: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                                required
                                maxLength={80}
                                placeholder="Por ejemplo: corte"
                              />
                            </CardField>
                            <div className="grid grid-cols-2 gap-3">
                              <CardField label="Precio habitual (€)">
                                <input
                                  inputMode="decimal"
                                  className={cardInput}
                                  value={l.gross}
                                  onChange={(e) =>
                                    setLines((a) =>
                                      a.map((x) =>
                                        x.id === l.id
                                          ? { ...x, gross: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                  required
                                />
                              </CardField>
                              <CardField label="Oferta pública actual (€)">
                                <input
                                  inputMode="decimal"
                                  className={cardInput}
                                  value={l.public}
                                  placeholder={l.gross}
                                  onChange={(e) =>
                                    setLines((a) =>
                                      a.map((x) =>
                                        x.id === l.id
                                          ? { ...x, public: e.target.value }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                              </CardField>
                            </div>
                            {lines.length > 1 && (
                              <button
                                type="button"
                                className="text-sm text-red-700"
                                onClick={() =>
                                  setLines((a) =>
                                    a.filter((x) => x.id !== l.id),
                                  )
                                }
                              >
                                Quitar servicio
                              </button>
                            )}
                          </fieldset>
                        ))}
                      </div>
                    )}
                    {!bookingId && (
                      <button
                        type="button"
                        disabled={lines.length >= 15}
                        className="text-sm text-violet"
                        onClick={() =>
                          setLines((a) => [
                            ...a,
                            {
                              id: crypto.randomUUID(),
                              label: "",
                              service_key: "",
                              gross: "",
                              public: "",
                            },
                          ])
                        }
                      >
                        + Añadir otro servicio
                      </button>
                    )}
                    <p className="text-xs text-text-secondary">
                      Una línea por unidad. El servidor calcula el descuento y
                      conserva las condiciones. Sólo puede sumarse un sello por
                      operación elegible; un premio gratuito no suma otro sello.
                    </p>
                    <button disabled={busy} className={cardButton}>
                      Solicitar confirmación
                    </button>
                  </form>
                ) : (
                  <p className={cardPanel}>
                    Elige un local aprobado para empezar a validar tarjetas.
                  </p>
                )}
              </section>
              <section className="space-y-4">
                {operation && (
                  <CardOperation
                    request={operation}
                    api={api}
                    busy={busy}
                    onRespond={(action, reference) =>
                      void mutate(async () => {
                        const result = await rpc<CardRequest>(
                          "respond_franky_card_request",
                          {
                            p_request_id: operation.id,
                            p_action: action,
                            p_external_reference: reference ?? null,
                          },
                        );
                        setOperation(result);
                        if (result.status === "completed") {
                          attempt.current = null;
                          setNotice(
                            "Visita registrada. El cliente puede ver su ahorro y sus sellos.",
                          );
                        }
                      })
                    }
                  />
                )}
                <h2 className="text-lg font-bold">Operaciones pendientes</h2>
                {data.pending_requests
                  .filter(
                    (r) => r.venue_id === venueId && r.id !== operation?.id,
                  )
                  .map((r) => (
                    <button
                      key={r.id}
                      className={cardPanel + " block w-full text-left"}
                      onClick={() => setOperation(r)}
                    >
                      {r.venue_name} · {cardCents(r.money.final_cents)}
                      <span className="mt-1 block text-xs text-text-secondary">
                        {r.customer_confirmed
                          ? "Cliente confirmado · registrar servicio"
                          : "Esperando al cliente"}
                      </span>
                    </button>
                  ))}
                {!data.pending_requests.length && (
                  <p className="text-sm text-text-secondary">
                    Las solicitudes aparecerán aquí al escanear una tarjeta.
                  </p>
                )}
              </section>
            </div>
          )}
          {tab === "venues" && data.permissions.manage && (
            <form
              className={cardPanel + " max-w-xl space-y-4"}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void mutate(async () => {
                  await saveCard("save_franky_card_venue", {
                    p_organization_id: organizationId,
                    p_venue_id: null,
                    p_data: {
                      name: f.get("name"),
                      city: f.get("city"),
                      address: f.get("address"),
                      category: f.get("category"),
                      timezone: f.get("timezone"),
                      agreement_version: CARD_AGREEMENT_VERSION,
                      agreement_accepted: f.get("agreement") === "on",
                    },
                  });
                  form.reset();
                  setNotice(
                    "Local enviado a revisión. Podrás definir su ventaja base y la fidelización.",
                  );
                });
              }}
            >
              <h2 className="text-xl font-bold">Adherir un local</h2>
              <p className="text-sm text-text-secondary">
                Validar la tarjeta y gestionar su fidelización es gratuito. El
                software de gestión de tu categoría tiene su propio plan.
              </p>
              <CardField label="Nombre comercial">
                <input
                  className={cardInput}
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </CardField>
              <CardField label="Ciudad">
                <input
                  className={cardInput}
                  name="city"
                  required
                  maxLength={100}
                />
              </CardField>
              <CardField label="Dirección">
                <input
                  className={cardInput}
                  name="address"
                  required
                  maxLength={250}
                />
              </CardField>
              <CardField label="Categoría">
                <select className={cardInput} name="category">
                  {PROFESSIONAL_CATEGORIES.map((c) => (
                    <option value={c} key={c}>
                      {PROFESSIONAL_SECTORS[c].label}
                    </option>
                  ))}
                </select>
              </CardField>
              <CardField label="Horario del local">
                <select name="timezone" className={cardInput}>
                  <option value="Europe/Madrid">Península y Baleares</option>
                  <option value="Atlantic/Canary">Canarias</option>
                </select>
              </CardField>
              <label className="flex gap-3 text-sm">
                <input type="checkbox" required name="agreement" />
                Acepto las{" "}
                <Link
                  className="underline"
                  href="/franky-card/condiciones"
                  target="_blank"
                >
                  condiciones de adhesión
                </Link>
                : ventaja base de al menos el 5% sobre un servicio habitual,
                condiciones publicadas y operaciones reales confirmadas por el
                cliente.
              </label>
              <button disabled={busy} className={cardButton}>
                Enviar local a revisión
              </button>
            </form>
          )}
          {tab === "offers" && data.permissions.manage && (
            <div className="grid gap-6 md:grid-cols-2">
              <form
                className={cardPanel + " space-y-4"}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void mutate(async () => {
                    await saveCard("save_franky_card_offer", {
                      p_venue_id: venueId,
                      p_data: {
                        title: f.get("title"),
                        kind: f.get("kind"),
                        percent: Number(f.get("percent")),
                        service_keys: String(f.get("keys"))
                          .split(",")
                          .map(serviceKey)
                          .filter(Boolean),
                        minimum_cents: asCents(String(f.get("minimum") || "0")),
                        starts_at: new Date(
                          String(f.get("start")),
                        ).toISOString(),
                        ends_at: f.get("end")
                          ? new Date(String(f.get("end"))).toISOString()
                          : null,
                        student_only: f.get("student") === "on",
                        minimum_age: f.get("age") ? Number(f.get("age")) : null,
                        terms: f.get("terms"),
                        ...campaignFormData(f),
                      },
                    });
                    form.reset();
                    setOfferKind("base");
                    setNotice(
                      "Ventaja enviada a revisión. Los cambios crean una nueva versión.",
                    );
                  });
                }}
              >
                <h2 className="text-xl font-bold">Crear ventaja</h2>
                <CardField label="Título">
                  <input
                    className={cardInput}
                    name="title"
                    required
                    maxLength={120}
                  />
                </CardField>
                <CardField label="Tipo">
                  <select
                    name="kind"
                    className={cardInput}
                    value={offerKind}
                    onChange={(e) =>
                      setOfferKind(e.target.value as "base" | "campaign")
                    }
                  >
                    <option value="base">Ventaja base continua</option>
                    <option value="campaign">Campaña adicional</option>
                  </select>
                </CardField>
                <CardField label="Descuento (%)">
                  <input
                    name="percent"
                    className={cardInput}
                    type="number"
                    min={5}
                    max={100}
                    step={1}
                    defaultValue={5}
                    required
                  />
                </CardField>
                <CardField label="Servicios incluidos (nombres separados por comas)">
                  <input
                    name="keys"
                    className={cardInput}
                    required
                    maxLength={800}
                    placeholder="corte, peinado"
                  />
                </CardField>
                <CardField label="Compra mínima (€)">
                  <input
                    name="minimum"
                    className={cardInput}
                    inputMode="decimal"
                    defaultValue="0"
                  />
                </CardField>
                <CardField label="Desde">
                  <input
                    name="start"
                    type="datetime-local"
                    className={cardInput}
                    required
                  />
                </CardField>
                <CardField label="Hasta (opcional para la base)">
                  <input
                    name="end"
                    type="datetime-local"
                    className={cardInput}
                    required={offerKind === "campaign"}
                  />
                </CardField>
                <p className="text-xs text-text-secondary">
                  Las fechas de inicio y fin se introducen en la hora de este
                  dispositivo (
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}).
                </p>
                {offerKind === "campaign" && (
                  <CardCampaignFields
                    key={venueId}
                    timezone={venue?.timezone ?? "Europe/Madrid"}
                  />
                )}
                <CardField label="Edad mínima acreditada (opcional)">
                  <input
                    name="age"
                    type="number"
                    min={16}
                    max={99}
                    className={cardInput}
                  />
                </CardField>
                <label className="flex gap-3 text-sm">
                  <input name="student" type="checkbox" />
                  Sólo afiliación universitaria verificada
                </label>
                <CardField label="Condiciones, horarios y exclusiones">
                  <textarea
                    name="terms"
                    required
                    minLength={20}
                    maxLength={2000}
                    className={cardInput}
                    rows={4}
                  />
                </CardField>
                <button className={cardButton} disabled={busy || !venueId}>
                  Enviar ventaja a revisión
                </button>
              </form>
              <section className="space-y-3">
                {venue?.offers.map((o) => (
                  <article key={o.id} className={cardPanel}>
                    <strong>
                      {o.title} · {o.percent}%
                    </strong>
                    <p className="mt-2 text-sm">
                      Versión {o.version} ·{" "}
                      {o.status === "active"
                        ? "Publicada"
                        : o.status === "retired"
                          ? "Retirada"
                          : "En revisión"}
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {o.terms}
                    </p>
                    <CardCampaignConditions offer={o} />
                    <CardCampaignUsage offer={o} userId={userId} />
                  </article>
                ))}
              </section>
            </div>
          )}
          {tab === "programs" && data.permissions.manage && (
            <div className="grid gap-6 md:grid-cols-2">
              <form
                className={cardPanel + " space-y-4"}
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void mutate(async () => {
                    await saveCard("save_franky_card_program", {
                      p_venue_id: venueId,
                      p_data: {
                        title: f.get("title"),
                        service_keys: String(f.get("keys"))
                          .split(",")
                          .map(serviceKey)
                          .filter(Boolean),
                        required_stamps: Number(f.get("stamps")),
                        reward_service_key: serviceKey(
                          String(f.get("reward_key")),
                        ),
                        reward_label: f.get("reward"),
                        reward_max_cents: asCents(String(f.get("maximum"))),
                        terms: f.get("terms"),
                      },
                    });
                    form.reset();
                    setNotice(
                      "Programa guardado. Los sellos anteriores conservan las condiciones de su versión.",
                    );
                  });
                }}
              >
                <h2 className="text-xl font-bold">
                  Que vuelvan por algo bueno
                </h2>
                <p className="text-sm text-text-secondary">
                  Ejemplo: cinco cortes pagados y el sexto corte gratis. El
                  premio se gana por servicios realizados, nunca por escanear.
                </p>
                <CardField label="Nombre del programa">
                  <input
                    name="title"
                    className={cardInput}
                    required
                    maxLength={120}
                    placeholder="Tu sexto corte, de regalo"
                  />
                </CardField>
                <CardField label="Servicios pagados que suman sello">
                  <input
                    name="keys"
                    className={cardInput}
                    required
                    placeholder="corte"
                    maxLength={800}
                  />
                </CardField>
                <CardField label="Servicios pagados para ganar el premio">
                  <input
                    name="stamps"
                    type="number"
                    min={2}
                    max={100}
                    defaultValue={5}
                    required
                    className={cardInput}
                  />
                </CardField>
                <CardField label="Servicio que se ofrece gratis">
                  <input
                    list="card-service-names"
                    name="reward_key"
                    required
                    maxLength={80}
                    className={cardInput}
                    placeholder="corte"
                  />
                </CardField>
                <CardField label="Qué recibirá el cliente">
                  <input
                    name="reward"
                    className={cardInput}
                    required
                    maxLength={180}
                    placeholder="Un corte clásico gratis"
                  />
                </CardField>
                <CardField label="Valor máximo del premio (€)">
                  <input
                    name="maximum"
                    required
                    inputMode="decimal"
                    className={cardInput}
                  />
                </CardField>
                <CardField label="Condiciones del premio">
                  <textarea
                    name="terms"
                    className={cardInput}
                    required
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    placeholder="Un sello por servicio pagado y realizado. El premio incluye..."
                  />
                </CardField>
                <button className={cardButton} disabled={busy || !venueId}>
                  Crear programa de fidelización
                </button>
              </form>
              <section className="space-y-3">
                {venue?.programs.map((p) => (
                  <article key={p.id} className={cardPanel}>
                    <h3 className="font-bold">{p.title}</h3>
                    <p className="mt-3 text-2xl font-bold text-violet">
                      {p.required_stamps} visitas → 1 premio
                    </p>
                    <p className="mt-2 text-sm">
                      {p.reward_label} · Hasta {cardCents(p.reward_max_cents)}
                    </p>
                    <p className="mt-2 text-xs text-text-secondary">
                      Versión {p.version} · {p.terms}
                    </p>
                  </article>
                ))}
              </section>
            </div>
          )}
          {tab === "history" && data.permissions.finance && (
            <section className="space-y-3">
              <p className="text-sm text-text-secondary">
                Importes registrados por el comercio, no conciliados con su TPV.
                Una rectificación ajusta el ahorro y los sellos; la devolución
                del dinero se realiza por el medio de pago original.
              </p>
              {history.items.map((c) => (
                <Consumption
                  key={c.id}
                  consumption={c}
                  busy={busy || !data.permissions.reverse}
                  onReverse={(ids, reason, requestKey) =>
                    void mutate(async () => {
                      await rpc("reverse_franky_card_consumption", {
                        p_consumption_id: c.id,
                        p_line_ids: ids,
                        p_reason: reason,
                        p_request_key: requestKey,
                      });
                      setNotice(
                        "Ajuste registrado. Comprueba la devolución del dinero por su medio de pago original.",
                      );
                      await historyLoad();
                    })
                  }
                />
              ))}
              {!history.items.length && (
                <p className={cardPanel}>
                  Todavía no hay consumos confirmados.
                </p>
              )}
              {history.next_cursor && (
                <button
                  className={cardButton}
                  onClick={() => void historyLoad(true)}
                >
                  Cargar más
                </button>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
function Consumption({
  consumption: c,
  busy,
  onReverse,
}: {
  consumption: CardConsumption;
  busy: boolean;
  onReverse: (ids: string[], reason: string, requestKey: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [ids, setIds] = useState<string[]>([]),
    [reason, setReason] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  return (
    <article className={cardPanel}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <strong>
            {c.venue_name} · {c.external_reference}
          </strong>
          <p className="mt-1 text-sm text-text-secondary">
            {new Date(c.created_at).toLocaleString("es-ES")}
          </p>
        </div>
        <strong>{cardCents(c.money.final_cents)}</strong>
      </div>
      <ul className="my-3 text-sm">
        {c.lines.map((l) => (
          <li key={l.id}>
            {l.label} · {cardCents(l.final_cents)}
            {l.reversed ? " · Rectificado" : ""}
          </li>
        ))}
      </ul>
      <button
        className="text-sm text-violet"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        Rectificar servicios
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fingerprint = JSON.stringify({
              id: c.id,
              ids: [...ids].sort(),
              reason,
            });
            if (retry.current?.fingerprint !== fingerprint)
              retry.current = { fingerprint, key: crypto.randomUUID() };
            onReverse(ids, reason, retry.current.key);
          }}
          className="mt-3 space-y-3"
        >
          {c.lines
            .filter((l) => !l.reversed)
            .map((l) => (
              <label className="flex gap-3 text-sm" key={l.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(l.id)}
                  onChange={(e) =>
                    setIds((v) =>
                      e.target.checked
                        ? [...v, l.id]
                        : v.filter((id) => id !== l.id),
                    )
                  }
                />
                {l.label} · Importe pagado {cardCents(l.final_cents)}
              </label>
            ))}
          <CardField label="Motivo del ajuste">
            <input
              className={cardInput}
              required
              minLength={5}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </CardField>
          <button disabled={busy || !ids.length} className={cardButton}>
            Registrar rectificación
          </button>
        </form>
      )}
    </article>
  );
}
