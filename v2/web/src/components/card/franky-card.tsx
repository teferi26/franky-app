"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type {
  CardPersonal,
  CardCredential,
  CardOffer,
  CardPage,
  CardConsumption,
  CardCheckout,
} from "../../../../shared/franky-card";
import {
  CARD_AGREEMENT_VERSION,
  CARD_MEMBERSHIP_LABELS,
  cardCents,
} from "../../../../shared/franky-card";
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
import { CardCampaignConditions } from "./card-campaign";
type Config = {
  checkoutEnabled: boolean;
  annualPriceCents: number;
  introPriceCents: number;
  appleWallet: boolean;
  googleWallet: boolean;
  reason: string | null;
};
export default function FrankyCard() {
  return <CardSession>{(id) => <PersonalCard userId={id} />}</CardSession>;
}
function PersonalCard({ userId }: { userId: string }) {
  const { rpc, api } = useCardClient(userId);
  const [card, setCard] = useState<CardPersonal | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [offers, setOffers] = useState<CardPage<CardOffer>>({
      items: [],
      next_cursor: null,
    }),
    [history, setHistory] = useState<CardPage<CardConsumption>>({
      items: [],
      next_cursor: null,
    });
  const [tab, setTab] = useState<
      "card" | "offers" | "loyalty" | "history" | "profile"
    >("card"),
    [city, setCity] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [photo, setPhoto] = useState<string | null>(null),
    [photoPath, setPhotoPath] = useState<string | null>(null),
    [qr, setQr] = useState<string | null>(null),
    [credential, setCredential] = useState<CardCredential | null>(null),
    [order, setOrder] = useState<CardCheckout | null>(null),
    [acceptedTerms, setAcceptedTerms] = useState(false);
  const writeLock = useRef(false),
    attempt = useRef<string | null>(null),
    alive = useRef(true),
    generation = useRef(0),
    offerVersion = useRef(0),
    unsavedPhoto = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const data = await rpc<CardPersonal>("get_franky_card");
      if (!alive.current || g !== generation.current) return;
      setCard(data);
      if (!unsavedPhoto.current) setPhotoPath(data.profile?.photo_path ?? null);
      setError("");
    } catch (e) {
      if (alive.current && g === generation.current)
        setError(cardError((e as Error).message));
    }
  }, [rpc]);
  useEffect(() => {
    void load();
    void api<Config>("config")
      .then(setConfig)
      .catch(() => {});
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load, api]);
  useEffect(() => {
    let live = true;
    setPhoto(null);
    if (photoPath)
      void api<{ url: string }>("media?path=" + encodeURIComponent(photoPath))
        .then((d) => {
          if (live) setPhoto(d.url);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [photoPath, api]);
  const loadOffers = useCallback(
    async (append = false) => {
      const v = ++offerVersion.current;
      try {
        const result = await rpc<CardPage<CardOffer>>(
          "list_franky_card_offers",
          {
            p_city: city.trim() || null,
            p_cursor: append ? offers.next_cursor : null,
            p_limit: 30,
          },
        );
        if (v !== offerVersion.current) return;
        setOffers((previous) => ({
          items: append ? [...previous.items, ...result.items] : result.items,
          next_cursor: result.next_cursor,
        }));
      } catch (e) {
        setError(cardError((e as Error).message));
      }
    },
    [rpc, city, offers.next_cursor],
  );
  const loadHistory = useCallback(
    async (append = false) => {
      try {
        const result = await rpc<CardPage<CardConsumption>>(
          "get_franky_card_history",
          { p_cursor: append ? history.next_cursor : null, p_limit: 30 },
        );
        setHistory((previous) => ({
          items: append ? [...previous.items, ...result.items] : result.items,
          next_cursor: result.next_cursor,
        }));
      } catch (e) {
        setError(cardError((e as Error).message));
      }
    },
    [rpc, history.next_cursor],
  );
  async function mutate(action: () => Promise<void>, refresh = true) {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      if (alive.current && refresh) await load();
    } catch (e) {
      if (alive.current) setError(cardError((e as Error).message));
      if ((e as Error).message === "card_price_changed") {
        setAcceptedTerms(false);
        attempt.current = null;
        await load();
      }
    } finally {
      writeLock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (!id) return;
    let live = true;
    const poll = () =>
      void api<CardCheckout>("checkout?order=" + encodeURIComponent(id))
        .then((value) => {
          if (live) {
            setOrder(value);
            if (value.status === "paid") void load();
          }
        })
        .catch(() => {
          if (live)
            setNotice(
              "Estamos comprobando tu pedido. Un fallo de conexión no significa que el pago se haya cancelado.",
            );
        });
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [api, load]);
  async function issue() {
    await mutate(async () => {
      const c = await rpc<CardCredential>("issue_franky_card_credential", {
        p_kind: "temporary",
      });
      const image = await QRCode.toDataURL(c.token, {
        width: 288,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      setCredential(c);
      setQr(image);
    });
  }
  useEffect(() => {
    if (!credential?.expires_at) return;
    const timer = setTimeout(
      () => {
        setQr(null);
        setCredential(null);
      },
      Math.max(0, Date.parse(credential.expires_at) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [credential]);
  async function purchase() {
    await mutate(async () => {
      if (!acceptedTerms || !card?.pricing.checkout_quote)
        throw Error("card_invalid_input");
      attempt.current ??= crypto.randomUUID();
      const p = await api<{ status: string; url?: string; order_id?: string }>(
        "checkout",
        {
          requestId: attempt.current,
          acceptedAmountCents: card?.pricing.checkout_quote?.amount_cents,
          priceVersion: card?.pricing.checkout_quote?.price_version,
          termsVersion: CARD_AGREEMENT_VERSION,
        },
      );
      if (p.url) {
        const url = new URL(p.url);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
          throw Error("card_invalid_input");
        window.location.assign(url.href);
      } else if (p.order_id)
        window.location.assign(
          "/franky-card?order=" + encodeURIComponent(p.order_id),
        );
      else
        setNotice(
          p.status === "paid"
            ? "Tu tarjeta está activa."
            : "El pedido está pendiente de confirmación.",
        );
    });
  }
  async function wallet(platform: "apple" | "google") {
    await mutate(async () => {
      const { url } = await api<{ url: string }>("wallet", { platform });
      const target = new URL(url);
      if (
        target.protocol !== "https:" ||
        !(
          target.hostname === "pay.google.com" ||
          target.pathname.startsWith("/storage/v1/object/sign/card-wallet/")
        )
      )
        throw Error("card_invalid_input");
      window.location.assign(target.href);
    });
  }
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/perfil" className="text-sm text-text-secondary">
            ← Mi perfil
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Tu ciudad. Tu Franky Card.
          </h1>
          <p className="mt-2 text-text-secondary">
            Descuentos, sellos y premios, en un solo sitio.
          </p>
        </div>
        <Link
          href="/espacios/card"
          className="text-sm font-semibold text-violet"
        >
          Soy un establecimiento →
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Reintentar
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mt-5 rounded-xl bg-violet/10 p-4">
          {notice}
        </p>
      )}
      {order && (
        <p role="status" className="mt-4 rounded-xl bg-bg-secondary p-4">
          Pedido:{" "}
          {order.status === "paid"
            ? "pago confirmado"
            : order.status === "refunded"
              ? "reembolsado"
              : order.status === "disputed" || order.status === "review"
                ? "cobro en revisión; no vuelvas a pagar"
                : order.status === "expired"
                  ? "sesión de pago caducada"
                  : order.status === "cancelled"
                    ? "cancelado por el proveedor"
                    : order.status === "failed"
                      ? "pago no completado"
                      : "pendiente de confirmación"}
          .{" "}
          <button
            className="underline"
            onClick={() =>
              window.location.assign(
                "franky://franky-card?order=" + order.order_id,
              )
            }
          >
            Volver a la app
          </button>
        </p>
      )}
      {card?.demo && (
        <p className="mt-4 text-sm text-amber-700">
          Demostración: los consumos y saldos son ficticios y están aislados.
        </p>
      )}
      <nav
        className="my-6 flex gap-2 overflow-x-auto pb-2"
        aria-label="Franky Card"
      >
        {(
          [
            ["card", "Mi tarjeta"],
            ["offers", "Descuentos"],
            ["loyalty", "Mis sellos"],
            ["history", "Historial"],
            ["profile", "Mis datos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            className={
              tab === id ? cardButton : "shrink-0 rounded-xl px-4 py-3 text-sm"
            }
            onClick={() => {
              setTab(id);
              if (id === "offers") void loadOffers();
              if (id === "history") void loadHistory();
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {!card && !error && <p role="status">Cargando tu tarjeta…</p>}
      {card && !card.enabled && (
        <div className={cardPanel}>
          <h2 className="text-xl font-bold">
            Estamos preparando la red de tu ciudad
          </h2>
          <p className="mt-3 text-text-secondary">
            La venta estará disponible cuando haya suficientes establecimientos
            y ventajas que puedas utilizar.
          </p>
        </div>
      )}
      {card?.enabled && tab === "card" && (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <section className="relative overflow-hidden rounded-3xl bg-[#21143e] p-7 text-white shadow-xl">
              <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet/50 blur-3xl" />
              <div className="relative">
                <div className="flex justify-between gap-3">
                  <strong className="text-2xl tracking-tight">
                    franky <span className="font-normal opacity-70">card</span>
                  </strong>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs">
                    {CARD_MEMBERSHIP_LABELS[card.membership.status]}
                  </span>
                </div>
                <div className="mt-9 flex items-center gap-4">
                  {photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt="Tu foto privada"
                      width={64}
                      height={80}
                      className="h-20 rounded-xl object-cover"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold">
                      {card.profile?.full_name ?? "Tu nombre, tu tarjeta"}
                    </h2>
                    {card.profile?.academic_visibility && (
                      <>
                        <p className="mt-1 text-sm opacity-70">
                          {card.profile.university}
                        </p>
                        <p className="text-xs opacity-70">
                          {card.profile.studies}
                          {card.profile.cohort_year
                            ? " · Promoción " + card.profile.cohort_year
                            : ""}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <p className="mt-8 text-sm opacity-70">
                  {card.membership.ends_at
                    ? "Descuentos hasta " +
                      new Date(card.membership.ends_at).toLocaleDateString(
                        "es-ES",
                      )
                    : "Tus sellos y recompensas en Franky"}
                </p>
              </div>
            </section>
            <section className={cardPanel}>
              <p className="text-sm text-text-secondary">
                Ahorro registrado en comercios
              </p>
              <strong className="mt-2 block text-4xl">
                {cardCents(card.savings.recorded_cents)}
              </strong>
              <p className="mt-3 text-sm">
                Coste de tu tarjeta:{" "}
                {cardCents(card.savings.membership_cost_cents)} · Balance:{" "}
                {cardCents(card.savings.balance_cents)}
              </p>
              <p className="mt-3 text-xs text-text-secondary">
                Consumos confirmados por ti y registrados por el comercio. Se
                descuentan los ajustes y devoluciones; no es una estimación de
                ahorro futuro.
              </p>
              <button
                disabled={busy || !card.profile}
                className={cardButton + " mt-5"}
                onClick={() => void issue()}
              >
                Mostrar mi QR
              </button>
              {!card.profile && (
                <button
                  onClick={() => setTab("profile")}
                  className="mt-5 text-violet"
                >
                  Completar mi tarjeta
                </button>
              )}
            </section>
          </div>
          {qr && (
            <section
              className={cardPanel + " mx-auto mt-5 max-w-sm text-center"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="Código temporal para iniciar la validación"
                width={288}
                height={288}
                className="mx-auto"
              />
              <p className="mt-3 text-sm">
                Enseña el QR al comercio y confirma la operación aquí. Caduca
                automáticamente.
              </p>
              <button
                onClick={() => {
                  setQr(null);
                  setCredential(null);
                }}
                className="mt-3 text-violet"
              >
                Ocultar QR
              </button>
            </section>
          )}
          {card.pending_requests.length > 0 && (
            <section className="mt-8 space-y-4">
              <h2 className="text-xl font-bold">Confirma tu visita</h2>
              {card.pending_requests.map((request) => (
                <CardOperation
                  key={request.id}
                  request={request}
                  busy={busy}
                  api={api}
                  onRespond={(action) =>
                    void mutate(async () => {
                      await rpc("respond_franky_card_request", {
                        p_request_id: request.id,
                        p_action: action,
                      });
                    })
                  }
                />
              ))}
            </section>
          )}
          {(card.membership.status !== "active" ||
            card.pricing.checkout_quote) && (
            <section className={cardPanel + " mt-6"}>
              <h2 className="text-xl font-bold">
                Activa un año de ventajas locales
              </h2>
              <p className="mt-3 text-3xl font-bold">
                {cardCents(
                  card.pricing.checkout_quote?.amount_cents ??
                    config?.annualPriceCents ??
                    1990,
                )}{" "}
                <span className="text-sm font-normal text-text-secondary">
                  12 meses, IVA incluido
                </span>
              </p>
              <p className="mt-2 text-sm">
                Renovación manual por{" "}
                {cardCents(config?.annualPriceCents ?? 1990)} al año. Consulta
                antes los comercios, servicios incluidos y condiciones. Tu
                cuenta y tus sellos siguen siendo gratuitos.
              </p>
              <label className="mt-4 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                Acepto las{" "}
                <Link
                  href="/franky-card/condiciones"
                  className="underline"
                  target="_blank"
                >
                  condiciones de la Card
                </Link>{" "}
                y el precio indicado para doce meses con renovación manual.
              </label>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  disabled={
                    busy ||
                    !acceptedTerms ||
                    !card.pricing.checkout_quote ||
                    !config?.checkoutEnabled ||
                    !card.pricing.purchases_available
                  }
                  className={cardButton}
                  onClick={() => void purchase()}
                >
                  Activar mi Franky Card
                </button>
                <button
                  className="text-violet"
                  onClick={() => {
                    setTab("offers");
                    void loadOffers();
                  }}
                >
                  Ver descuentos disponibles
                </button>
              </div>
              {!config?.checkoutEnabled && (
                <p className="mt-3 text-sm text-text-secondary">
                  {config?.reason ??
                    "Estamos preparando la apertura de la tarjeta."}
                </p>
              )}
            </section>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            {config?.appleWallet && !card.demo && (
              <button
                className="rounded-xl bg-black px-5 py-3 text-white"
                disabled={busy}
                onClick={() => void wallet("apple")}
              >
                Añadir a Apple Wallet
              </button>
            )}
            {config?.googleWallet && !card.demo && (
              <button
                className="rounded-xl border border-border px-5 py-3"
                disabled={busy}
                onClick={() => void wallet("google")}
              >
                Añadir a Google Wallet
              </button>
            )}
            <button
              disabled={busy}
              className="text-sm text-text-secondary"
              onClick={() =>
                void mutate(async () => {
                  await rpc("revoke_franky_card_credentials");
                  setQr(null);
                  setNotice(
                    "Los códigos anteriores ya no pueden iniciar operaciones. Vuelve a añadir la tarjeta a Wallet si la utilizas allí.",
                  );
                })
              }
            >
              Revocar mis códigos
            </button>
          </div>
        </>
      )}
      {card?.enabled && tab === "offers" && (
        <section>
          <form
            className="mb-5 flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void loadOffers();
            }}
          >
            <CardField label="Ciudad">
              <input
                className={cardInput}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={100}
                placeholder="Tu ciudad"
              />
            </CardField>
            <button className={cardButton}>Buscar</button>
          </form>
          <div className="grid gap-4 sm:grid-cols-2">
            {offers.items.map((o) => (
              <article key={o.id} className={cardPanel}>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-lg font-bold">{o.venue_name}</h2>
                  <strong className="text-3xl text-violet">{o.percent}%</strong>
                </div>
                <p className="mt-3 font-medium">{o.title}</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {o.city}
                  {o.student_only
                    ? " · Afiliación universitaria verificada"
                    : ""}
                  {o.minimum_age ? " · Mayores de " + o.minimum_age : ""}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm">{o.terms}</p>
                <CardCampaignConditions offer={o} />
                {o.minimum_cents > 0 && (
                  <p className="mt-2 text-xs">
                    Compra mínima: {cardCents(o.minimum_cents)}
                  </p>
                )}
                <p className="mt-2 text-xs">
                  {o.ends_at
                    ? "Hasta " + new Date(o.ends_at).toLocaleDateString("es-ES")
                    : "Ventaja continua mientras esté adherido"}
                </p>
              </article>
            ))}
          </div>
          {!offers.items.length && (
            <p className={cardPanel}>
              No hay descuentos disponibles con estos filtros. No mostraremos
              cifras de comercios o ahorros inventadas.
            </p>
          )}
          {offers.next_cursor && (
            <button
              className={cardButton + " mt-5"}
              onClick={() => void loadOffers(true)}
            >
              Ver más descuentos
            </button>
          )}
        </section>
      )}
      {card?.enabled && tab === "loyalty" && (
        <section className="grid gap-4 sm:grid-cols-2">
          {card.loyalty.map((l) => (
            <article key={l.program.id} className={cardPanel}>
              <h2 className="text-lg font-bold">{l.program.title}</h2>
              <p className="mt-2 text-sm">{l.program.reward_label}</p>
              <div
                className="my-4 flex flex-wrap gap-2"
                aria-label={`${l.progress} de ${l.program.required_stamps} sellos`}
              >
                {Array.from({ length: l.program.required_stamps }, (_, i) => (
                  <span
                    key={i}
                    className={
                      "flex h-9 w-9 items-center justify-center rounded-full " +
                      (i < l.progress
                        ? "bg-violet text-white"
                        : "bg-bg-secondary text-text-muted")
                    }
                  >
                    {i < l.progress ? "✓" : i + 1}
                  </span>
                ))}
              </div>
              <strong>
                {l.available_rewards > 0
                  ? `${l.available_rewards} premios disponibles`
                  : `${l.program.required_stamps - l.progress} servicios para tu próximo premio`}
              </strong>
              <p className="mt-3 text-xs text-text-secondary">
                {l.program.terms}
              </p>
              <p className="mt-2 text-xs">
                Tus premios se conservan aunque caduque la Card. Para
                canjearlos, muestra tu QR en este establecimiento.
              </p>
            </article>
          ))}
          {!card.loyalty.length && (
            <p className={cardPanel}>
              Tus tarjetas de sellos aparecerán después de tu primera visita
              confirmada a un comercio con fidelización.
            </p>
          )}
        </section>
      )}
      {card?.enabled && tab === "history" && (
        <section className="space-y-3">
          {history.items.map((item) => (
            <article key={item.id} className={cardPanel}>
              <div className="flex justify-between gap-3">
                <h2 className="font-bold">{item.venue_name}</h2>
                <strong>
                  {cardCents(
                    item.money.incremental_savings_cents -
                      item.reversed_savings_cents,
                  )}{" "}
                  ahorrados
                </strong>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
                {new Date(item.created_at).toLocaleString("es-ES")} ·{" "}
                {item.external_reference}
              </p>
              <p className="mt-2 text-sm">
                {item.lines
                  .map((l) => l.label + (l.reversed ? " (devuelto)" : ""))
                  .join(", ")}
              </p>
            </article>
          ))}
          {!history.items.length && (
            <p className={cardPanel}>
              Aquí verás cada consumo confirmado, los descuentos y sus ajustes.
            </p>
          )}
          {history.next_cursor && (
            <button
              className={cardButton}
              onClick={() => void loadHistory(true)}
            >
              Cargar más
            </button>
          )}
        </section>
      )}
      {card?.enabled && tab === "profile" && (
        <form
          className={cardPanel + " max-w-xl space-y-4"}
          key={card.profile?.full_name ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate(async () => {
              await rpc("save_franky_card_profile", {
                p_profile: {
                  full_name: f.get("name"),
                  photo_path: photoPath,
                  university: f.get("university") || null,
                  studies: f.get("studies") || null,
                  cohort_year: f.get("year") ? Number(f.get("year")) : null,
                  academic_visibility: f.get("academic") === "on",
                },
              });
              unsavedPhoto.current = false;
              setNotice("Datos de la tarjeta guardados.");
              setTab("card");
            });
          }}
        >
          <h2 className="text-xl font-bold">Los datos de tu tarjeta</h2>
          <p className="text-sm text-text-secondary">
            Esta foto es privada. El comercio sólo verá tu nombre y foto al
            confirmar una operación. Los datos académicos declarados no
            acreditan matrícula.
          </p>
          <CardField label="Nombre completo">
            <input
              name="name"
              className={cardInput}
              required
              minLength={2}
              maxLength={100}
              defaultValue={card.profile?.full_name}
            />
          </CardField>
          <CardField label="Foto de la tarjeta">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={cardInput}
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void mutate(async () => {
                    const f = new FormData();
                    f.set("file", file);
                    const d = await api<{ path: string; url: string }>(
                      "media",
                      f,
                    );
                    unsavedPhoto.current = true;
                    setPhotoPath(d.path);
                    setPhoto(d.url);
                  }, false);
              }}
            />
          </CardField>
          <CardField label="Universidad (opcional)">
            <input
              name="university"
              className={cardInput}
              maxLength={180}
              defaultValue={card.profile?.university ?? ""}
            />
          </CardField>
          <CardField label="Estudios (opcional)">
            <input
              name="studies"
              className={cardInput}
              maxLength={180}
              defaultValue={card.profile?.studies ?? ""}
            />
          </CardField>
          <CardField label="Año de promoción (opcional)">
            <input
              name="year"
              type="number"
              min={1950}
              max={2100}
              className={cardInput}
              defaultValue={card.profile?.cohort_year ?? ""}
            />
          </CardField>
          <label className="flex gap-3 text-sm">
            <input
              name="academic"
              type="checkbox"
              defaultChecked={card.profile?.academic_visibility}
            />
            Mostrar mis datos académicos en mi tarjeta y Apple Wallet
          </label>
          <button className={cardButton} disabled={busy}>
            Guardar mi tarjeta
          </button>
        </form>
      )}
    </main>
  );
}
