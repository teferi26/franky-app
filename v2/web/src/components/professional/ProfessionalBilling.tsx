"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { useFinancialOwner } from "@/lib/use-financial-owner";
import { useProfessionalRpc } from "./useProfessionalRpc";
import { useOrganizationBillingClient } from "./useOrganizationBillingClient";
import { professionalMoney } from "../../../../shared/professional-services";
import {
  invoiceDocumentUrl,
  parsePaymentReply,
  safeStripeUrl,
  type PaymentReply,
} from "../../../../shared/payment-contract";
import type { Workspace } from "../../../../shared/workspaces";
import type {
  OrganizationBillingState,
  OrganizationBillingQuote,
  OrganizationBillingPlan,
  OrganizationBillingInterval,
} from "../../../../shared/organization-billing";

const panel = "rounded-2xl border border-border bg-bg-primary p-5 sm:p-6";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet px-4 py-3 text-sm font-semibold text-white disabled:opacity-40";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:opacity-40";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type BillingState = OrganizationBillingState & { can_checkout_web: boolean };
type CheckoutConsent = {
  quote_id: string;
  request_key: string;
  accepted_terms_version: string;
  accepted_first_base_cents: number;
  accepted_renewal_base_cents: number;
  accepted: true;
};
type RetainedAttempt = { consent: CheckoutConsent; order?: string };
type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  currency: string;
  total: number;
  amount_paid: number;
  created: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
};
export function organizationBillingError(message: string) {
  if (/auth_required|forbidden|permission|access_denied/.test(message))
    return "Tu acceso ha cambiado. Vuelve a abrir el espacio con una cuenta autorizada.";
  if (/mfa|aal2/.test(message))
    return "Verifica tu cuenta en dos pasos antes de cambiar la contratación.";
  if (/quote|price|terms|consent/.test(message))
    return "La oferta o su aceptación necesita revisión. No hemos confirmado una nueva contratación.";
  if (/founder/.test(message))
    return "La oferta fundador no está disponible para esta contratación. Revisa las opciones actuales.";
  if (/unavailable|disabled|readiness|configuration|provider/.test(message))
    return "La contratación todavía no está disponible. Puedes seguir consultando tu espacio.";
  return "No pudimos confirmar el resultado. Si habías iniciado un pago, recupera ese mismo intento antes de volver a contratar.";
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("es-ES")
    : "Pendiente de confirmar";
}
const moduleNames: Record<string, string> = {
  appointments: "Citas",
  resources: "Recursos",
  sessions: "Sesiones y aforo",
  groups: "Reservas de grupos",
  bookings: "Reservas",
  catalog: "Catálogo",
  bundles: "Bonos",
  waitlist: "Lista de espera",
  notices: "Avisos dentro de Franky",
  professional: "Gestión profesional",
};
function readRetained(key: string): RetainedAttempt | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(key) ?? "null",
    ) as RetainedAttempt | null;
    const c = value?.consent;
    return c &&
      uuid.test(c.quote_id) &&
      uuid.test(c.request_key) &&
      c.accepted === true &&
      typeof c.accepted_terms_version === "string" &&
      Number.isSafeInteger(c.accepted_first_base_cents) &&
      c.accepted_first_base_cents > 0 &&
      Number.isSafeInteger(c.accepted_renewal_base_cents) &&
      c.accepted_renewal_base_cents > 0 &&
      (!value.order || uuid.test(value.order))
      ? value
      : null;
  } catch {
    return null;
  }
}
export default function ProfessionalBilling({
  organizationId,
  orderId,
}: {
  organizationId?: string;
  orderId?: string;
}) {
  const owner = useFinancialOwner();
  if (!owner)
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-3xl font-bold">Plan de tu negocio</h1>
        <p className="my-5">
          Inicia sesión para consultar la contratación de tu espacio.
        </p>
        <Link className={button} href="/login?next=%2Fespacios%2Ffacturacion">
          Iniciar sesión
        </Link>
      </main>
    );
  return (
    <BillingSpaces
      key={owner.key}
      owner={owner.userId}
      initial={organizationId}
      orderId={orderId}
    />
  );
}
function BillingSpaces({
  owner,
  initial,
  orderId,
}: {
  owner: string;
  initial?: string;
  orderId?: string;
}) {
  const rpc = useProfessionalRpc(owner);
  const [spaces, setSpaces] = useState<Workspace[]>([]),
    [active, setActive] = useState(initial ?? ""),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void rpc<Workspace[]>("professional_list_workspaces")
      .then((list) => {
        if (!live) return;
        setSpaces(list);
        if (!initial && list[0]) setActive(list[0].id);
      })
      .catch((e) => {
        if (live) setError(organizationBillingError(e.message));
      });
    return () => {
      live = false;
    };
  }, [rpc, initial]);
  const space = spaces.find((s) => s.id === active);
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <Link
          href={
            active ? `/espacios/servicios?organization=${active}` : "/espacios"
          }
          className="text-sm text-text-secondary"
        >
          ← Volver al espacio
        </Link>
        <label className="text-sm">
          Espacio
          <select
            aria-label="Espacio de facturación"
            className="ml-2 max-w-[220px] rounded-xl border border-border bg-bg-primary p-2"
            value={active}
            onChange={(e) => setActive(e.target.value)}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {space ? (
        <OrganizationBillingPanel
          key={owner + ":" + space.id}
          owner={owner}
          organization={space.id}
          name={space.name}
          orderId={space.id === initial ? orderId : undefined}
        />
      ) : (
        <p role="status" className={panel}>
          Aquí aparecerán los espacios a los que tienes acceso.
        </p>
      )}
    </main>
  );
}
export function OrganizationBillingPanel({
  owner,
  organization,
  name,
  orderId,
}: {
  owner: string;
  organization: string;
  name: string;
  orderId?: string;
}) {
  const { api, quote: fetchQuote } = useOrganizationBillingClient(
    owner,
    organization,
  );
  const storageKey = `franky:organization-checkout:v1:${owner}:${organization}`;
  const [state, setState] = useState<BillingState | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>(""),
    [interval, setInterval] = useState<OrganizationBillingInterval>("year"),
    [founder, setFounder] = useState(false);
  const [quote, setQuote] = useState<OrganizationBillingQuote | null>(null),
    [accepted, setAccepted] = useState(false),
    [payment, setPayment] = useState<PaymentReply | null>(null);
  const [retained, setRetained] = useState<RetainedAttempt | null>(null),
    [invoices, setInvoices] = useState<Invoice[] | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [attemptNotFound, setAttemptNotFound] = useState(false),
    [now, setNow] = useState(Date.now());
  const alive = useRef(true),
    pending = useRef(false),
    revision = useRef(0),
    order = useRef(orderId && uuid.test(orderId) ? orderId : undefined),
    retainedRef = useRef<RetainedAttempt | null>(null);
  const persist = useCallback(
    (value: RetainedAttempt | null) => {
      retainedRef.current = value;
      setRetained(value);
      try {
        if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* Server still enforces a single open attempt. */
      }
    },
    [storageKey],
  );
  useEffect(() => {
    alive.current = true;
    const saved = readRetained(storageKey);
    if (saved) {
      retainedRef.current = saved;
      setRetained(saved);
      order.current ??= saved.order;
    }
    return () => {
      alive.current = false;
      revision.current++;
    };
  }, [storageKey]);
  const load = useCallback(async () => {
    const generation = ++revision.current;
    setAttemptNotFound(false);
    try {
      const result = await api<{
        billing: BillingState;
        payment?: PaymentReply;
        attempt_known?: boolean;
      }>(
        "status" +
          (order.current
            ? `?order=${encodeURIComponent(order.current)}`
            : retainedRef.current
              ? `?request_key=${encodeURIComponent(retainedRef.current.consent.request_key)}`
              : ""),
      );
      if (!alive.current || generation !== revision.current) return;
      setState(result.billing);
      setError("");
      setAttemptNotFound(
        result.attempt_known === false &&
          !result.billing.pending_attempt_id &&
          !order.current,
      );
      if (!result.payment && result.billing.pending_attempt_id) {
        order.current = result.billing.pending_attempt_id;
        setPayment({ status: "pending", order_id: order.current });
      }
      setSelected((current) =>
        result.billing.catalog.some(
          (p) => `${p.plan_key}:${p.version}` === current,
        )
          ? current
          : result.billing.catalog[0]
            ? `${result.billing.catalog[0].plan_key}:${result.billing.catalog[0].version}`
            : "",
      );
      if (result.payment) {
        const reply = parsePaymentReply(result.payment);
        setPayment(reply);
        if (reply.order_id) order.current = reply.order_id;
        if (["paid", "cancelled", "failed"].includes(reply.status))
          persist(null);
      }
      if (!result.billing.can_manage_billing) {
        setQuote(null);
        setAccepted(false);
      }
      if (!result.billing.can_read_finance) {
        setInvoices(null);
        setCursor(null);
      }
    } catch (e) {
      if (alive.current && generation === revision.current) {
        setState(null);
        setQuote(null);
        setAccepted(false);
        setInvoices(null);
        setCursor(null);
        setPayment((current) =>
          current?.status === "checkout"
            ? { status: "pending", order_id: current.order_id }
            : current,
        );
        setError(organizationBillingError((e as Error).message));
      }
    }
  }, [api, persist]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  useEffect(() => {
    setQuote(null);
    setAccepted(false);
  }, [selected, interval, founder]);
  const act = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        const failure = e as Error & { status?: number };
        if (
          failure.status === 401 ||
          failure.status === 403 ||
          failure.message === "auth_required"
        ) {
          revision.current++;
          setState(null);
          setQuote(null);
          setAccepted(false);
          setInvoices(null);
          setCursor(null);
          setPayment((current) =>
            current?.status === "checkout"
              ? { status: "pending", order_id: current.order_id }
              : current,
          );
        }
        setError(organizationBillingError((e as Error).message));
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const resetQuote = () => {
    setQuote(null);
    setAccepted(false);
  };
  const plan = state?.catalog.find(
    (p) => `${p.plan_key}:${p.version}` === selected,
  );
  const quoteValid =
    !!quote && quote.available && Date.parse(quote.expires_at) > now;
  const unresolved =
    !!retained ||
    !!state?.pending_attempt_id ||
    payment?.status === "pending" ||
    payment?.status === "checkout";
  async function requestQuote() {
    if (!plan || !state?.can_checkout_web || unresolved) return;
    resetQuote();
    await act(async () => {
      const q = await fetchQuote<OrganizationBillingQuote>({
        p_plan_key: plan.plan_key,
        p_plan_version: plan.version,
        p_interval: interval,
        p_founder: interval === "year" && founder && state.founder.approved,
      });
      if (alive.current) {
        setNow(Date.now());
        setQuote(q);
      }
    });
  }
  async function checkout(retry?: RetainedAttempt) {
    if (
      !retry &&
      (!quote ||
        !quoteValid ||
        !accepted ||
        unresolved ||
        !state?.can_checkout_web)
    )
      return;
    await act(async () => {
      const attempt = retry ?? {
        consent: {
          quote_id: quote!.id,
          request_key: crypto.randomUUID(),
          accepted_terms_version: quote!.terms_version,
          accepted_first_base_cents: quote!.first_base_cents,
          accepted_renewal_base_cents: quote!.renewal_base_cents,
          accepted: true as const,
        },
      };
      persist(attempt);
      setAttemptNotFound(false);
      setPayment({ status: "pending", order_id: attempt.order });
      const reply = parsePaymentReply(
        await api<PaymentReply>("checkout", attempt.consent),
      );
      if (!alive.current) return;
      setPayment(reply);
      if (reply.order_id) {
        order.current = reply.order_id;
        persist({ ...attempt, order: reply.order_id });
      }
      if (["paid", "cancelled", "failed"].includes(reply.status)) {
        persist(null);
        resetQuote();
        await load();
      }
      if (reply.status === "checkout" && reply.url)
        window.location.assign(reply.url);
    });
  }
  async function openPortal() {
    await act(async () => {
      const result = await api<{ url: string }>("portal", {});
      const url = safeStripeUrl(result.url, ["billing.stripe.com"]);
      if (!url) throw Error("organization_provider_mismatch");
      if (alive.current) window.location.assign(url);
    });
  }
  async function loadInvoices(next?: string) {
    await act(async () => {
      const result = await api<{
        invoices: Invoice[];
        next_cursor: string | null;
      }>("invoices" + (next ? `?cursor=${encodeURIComponent(next)}` : ""));
      if (alive.current) {
        setInvoices((previous) =>
          next
            ? [
                ...(previous ?? []),
                ...result.invoices.filter(
                  (row) => !previous?.some((p) => p.id === row.id),
                ),
              ]
            : result.invoices,
        );
        setCursor(result.next_cursor);
      }
    });
  }
  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-gradient-to-br from-violet/15 via-bg-primary to-bg-secondary p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-violet">
          Franky para tu negocio
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Tu plan, con todo claro
        </h1>
        <p className="mt-3 text-text-secondary">
          {name} · Contratación y facturas de este espacio.
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
          <button
            className={secondary + " ml-3"}
            disabled={busy}
            onClick={() => void load()}
          >
            Volver a consultar
          </button>
        </div>
      )}
      {attemptNotFound && retained && !busy && (
        <section className={panel}>
          <h2 className="font-bold">
            No se ha encontrado un pedido para este intento
          </h2>
          <p className="my-3 text-sm text-text-secondary">
            El servidor ha comprobado la solicitud conservada. Puedes volver a
            revisarla o preparar una nueva oferta. Antes de crear un pedido se
            vuelve a comprobar que el espacio no tenga otro pendiente.
          </p>
          <button
            className={secondary}
            onClick={() => {
              persist(null);
              setPayment(null);
              setAttemptNotFound(false);
              resetQuote();
            }}
          >
            Revisar una nueva oferta
          </button>
        </section>
      )}
      {payment && (
        <section className={panel} aria-live="polite">
          <h2 className="font-bold">
            {payment.status === "paid"
              ? "Pago confirmado"
              : payment.status === "cancelled"
                ? "Intento cerrado sin contratación"
                : payment.status === "failed"
                  ? "La contratación no se ha completado"
                  : "Comprobando la contratación"}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {payment.status === "paid"
              ? "El estado de tu plan se obtiene del pago verificado por el servidor."
              : unresolved
                ? "Cerrar la pantalla de pago no confirma ni cancela la operación. Recupera este mismo intento para comprobar el resultado."
                : "Puedes revisar una nueva oferta cuando lo necesites."}
          </p>
          {unresolved && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={secondary}
                disabled={busy}
                onClick={() => void load()}
              >
                Comprobar estado
              </button>
              {retained && state?.can_manage_billing && (
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void checkout(retained)}
                >
                  Recuperar el mismo intento
                </button>
              )}
              {!retained &&
                state?.can_manage_billing &&
                payment.status === "checkout" &&
                payment.url && (
                  <a className={button} href={payment.url}>
                    Continuar pago
                  </a>
                )}
            </div>
          )}
        </section>
      )}
      {!payment && retained && state?.can_manage_billing && (
        <section className={panel}>
          <h2 className="font-bold">Hay un intento pendiente de comprobar</h2>
          <p className="my-3 text-sm text-text-secondary">
            Se conserva tu aceptación para recuperar la operación sin abrir otra
            compra.
          </p>
          <button
            className={button}
            disabled={busy}
            onClick={() => void checkout(retained)}
          >
            Recuperar el mismo intento
          </button>
        </section>
      )}
      {!state ? (
        <p role="status" className={panel}>
          {error ? "Estado contractual sin confirmar." : "Consultando el plan…"}
        </p>
      ) : (
        <>
          <section className={panel}>
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-violet">
                  Tu situación actual
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  {state.access.paused
                    ? "Nuevas operaciones pausadas"
                    : state.access.source === "pilot" && state.access.active
                      ? "Piloto habilitado"
                      : state.access.source === "stripe" && state.access.active
                        ? "Plan activo"
                        : state.subscription
                          ? "Consulta el periodo de tu plan"
                          : "Sin suscripción de pago"}
                </h2>
                <p className="mt-3 text-sm text-text-secondary">
                  La fidelización básica y la adhesión a Franky Card son
                  independientes de este software.
                </p>
              </div>
              <ShieldCheck className="text-violet" size={32} />
            </div>
            {state.subscription && (
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-text-secondary">
                    Periodo confirmado hasta
                  </dt>
                  <dd className="font-semibold">
                    {date(state.subscription.current_period_end)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-secondary">Renovación</dt>
                  <dd className="font-semibold">
                    {state.subscription.cancel_at_period_end
                      ? "Cancelación al terminar el periodo"
                      : state.subscription.interval === "year"
                        ? "Anual, según el contrato aceptado"
                        : "Mensual, según el contrato aceptado"}
                  </dd>
                </div>
              </dl>
            )}
            <p className="mt-5 text-sm text-text-secondary">
              Aunque termine el plan, se conserva el acceso autorizado al
              historial y a la atención de las reservas ya comprometidas.
            </p>
            {state.can_manage_billing && state.subscription && (
              <button
                className={secondary + " mt-5"}
                disabled={busy}
                onClick={() => void openPortal()}
              >
                <CreditCard size={17} /> Medio de pago y cancelación
              </button>
            )}
          </section>
          {(!state.subscription ||
            (!state.access.active &&
              ["canceled", "incomplete_expired"].includes(
                state.subscription.status,
              ))) && (
            <section className={panel}>
              <h2 className="text-2xl font-bold">
                Elige el periodo que encaja contigo
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                Una organización y una sede operativa. Importes base sin
                impuestos; el total fiscal se muestra antes de pagar.
              </p>
              {!state.can_checkout_web && (
                <p className="mt-4 rounded-xl bg-bg-secondary p-4 text-sm">
                  Las nuevas contrataciones todavía están cerradas. Estos
                  importes son una propuesta hasta que se habiliten y puedas
                  aceptar una oferta del servidor.
                </p>
              )}
              {!state.account?.verified && state.can_manage_billing && (
                <p className="mt-3 text-sm text-text-secondary">
                  Franky debe verificar los datos de facturación de la entidad
                  antes de habilitar su contratación.
                </p>
              )}
              {state.catalog.length > 1 && (
                <label className="mt-5 block text-sm">
                  Paquete
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-bg-primary p-3"
                    value={selected}
                    disabled={busy || unresolved}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      resetQuote();
                    }}
                  >
                    {state.catalog.map((p) => (
                      <option
                        key={`${p.plan_key}:${p.version}`}
                        value={`${p.plan_key}:${p.version}`}
                      >
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {plan ? (
                <>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {(["month", "year"] as const).map((period) => (
                      <button
                        type="button"
                        aria-pressed={interval === period}
                        key={period}
                        disabled={busy || unresolved}
                        onClick={() => {
                          setInterval(period);
                          setFounder(false);
                          resetQuote();
                        }}
                        className={`rounded-2xl border p-5 text-left disabled:opacity-50 ${interval === period ? "border-violet bg-violet/5" : "border-border"}`}
                      >
                        <span className="flex justify-between font-semibold">
                          {period === "year" ? "Anual" : "Mensual"}
                          {interval === period && (
                            <Check size={20} className="text-violet" />
                          )}
                        </span>
                        <strong className="mt-3 block text-3xl">
                          {professionalMoney(
                            period === "year"
                              ? plan.annual_cents
                              : plan.monthly_cents,
                          )}
                        </strong>
                        <span className="mt-1 block text-sm text-text-secondary">
                          {period === "year" ? "cada doce meses" : "cada mes"} ·
                          sin impuestos
                        </span>
                        {period === "year" &&
                          plan.annual_cents < plan.monthly_cents * 12 && (
                            <span className="mt-3 block text-sm font-semibold text-violet">
                              {professionalMoney(
                                plan.monthly_cents * 12 - plan.annual_cents,
                              )}{" "}
                              menos que 12 mensualidades
                            </span>
                          )}
                      </button>
                    ))}
                  </div>
                  {interval === "year" && state.founder.approved && (
                    <label className="mt-4 flex items-start gap-3 rounded-xl bg-violet/5 p-4 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={founder}
                        disabled={busy || unresolved}
                        onChange={(e) => {
                          setFounder(e.target.checked);
                          resetQuote();
                        }}
                      />
                      <span>
                        <strong>Aplicar la oferta fundador aprobada</strong>
                        <span className="mt-1 block">
                          Primer año {professionalMoney(plan.founder_cents)};
                          después {professionalMoney(plan.annual_cents)}/año,
                          sin impuestos. Se aplica una sola vez.
                        </span>
                      </span>
                    </label>
                  )}
                  <PlanDetails plan={plan} />
                  {state.can_manage_billing &&
                    state.can_checkout_web &&
                    plan.status === "active" &&
                    !unresolved && (
                      <button
                        className={button + " mt-5"}
                        disabled={busy}
                        onClick={() => void requestQuote()}
                      >
                        Revisar oferta y condiciones <ArrowRight size={17} />
                      </button>
                    )}
                </>
              ) : (
                <p className="mt-5 text-sm text-text-secondary">
                  Todavía no hay una oferta comercial publicada para esta
                  categoría.
                </p>
              )}
              {!state.can_manage_billing && (
                <p className="mt-4 text-sm text-text-secondary">
                  El responsable o administrador del espacio gestiona la
                  contratación.
                </p>
              )}
            </section>
          )}
          {quote && !unresolved && (
            <section className={panel} aria-label="Oferta de contratación">
              <h2 className="text-2xl font-bold">Comprueba lo que aceptas</h2>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-text-secondary">
                    Primer {quote.interval === "year" ? "año" : "mes"}
                  </dt>
                  <dd className="mt-1 text-3xl font-bold">
                    {professionalMoney(quote.first_base_cents)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-text-secondary">
                    Renovaciones{" "}
                    {quote.interval === "year" ? "anuales" : "mensuales"}
                  </dt>
                  <dd className="mt-1 text-2xl font-bold">
                    {professionalMoney(quote.renewal_base_cents)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-text-secondary">
                Importes base sin impuestos. En la pantalla segura de pago se
                calcula el impuesto según tus datos fiscales y se muestra el
                total para tu aceptación. La fecha del periodo se confirma con
                el pago.
              </p>
              <details className="mt-4 rounded-xl border border-border p-4">
                <summary className="cursor-pointer font-semibold">
                  Condiciones · {quote.terms_version}
                </summary>
                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {quote.terms}
                </p>
              </details>
              {!quoteValid && (
                <p role="status" className="mt-4 text-sm">
                  La oferta no está disponible o ha caducado. Solicita una nueva
                  antes de aceptar.
                </p>
              )}
              <label className="mt-5 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={accepted}
                  disabled={busy || !quoteValid}
                  onChange={(e) => setAccepted(e.target.checked)}
                />
                <span>
                  Acepto las condiciones y los importes del primer periodo y de
                  las renovaciones indicadas. Autorizo continuar a la pantalla
                  de pago para revisar el total con impuestos.
                </span>
              </label>
              <button
                className={button + " mt-5"}
                disabled={
                  busy ||
                  !accepted ||
                  !quoteValid ||
                  !state.can_checkout_web ||
                  !state.can_manage_billing
                }
                onClick={() => void checkout()}
              >
                {busy
                  ? "Preparando el mismo intento…"
                  : "Continuar al pago seguro"}
              </button>
            </section>
          )}
          {state.can_read_finance && (
            <section className={panel}>
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <FileText size={20} /> Facturación de la entidad
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                {state.account?.legal_name ??
                  "Sin cuenta de facturación verificada"}
                . Las facturas personales y de otros espacios permanecen
                separadas.
              </p>
              <button
                className={secondary + " mt-4"}
                disabled={busy}
                onClick={() => void loadInvoices()}
              >
                {invoices ? "Actualizar facturas" : "Consultar facturas"}
              </button>
              {invoices && (
                <div className="mt-4 space-y-3">
                  {invoices.length === 0 ? (
                    <p className="text-sm text-text-secondary">
                      No hay facturas de este espacio.
                    </p>
                  ) : (
                    invoices.map((row) => {
                      const url = invoiceDocumentUrl(row, false);
                      return (
                        <div
                          key={row.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bg-secondary p-4"
                        >
                          <div>
                            <strong className="text-sm">
                              {row.number ?? "Factura"}
                            </strong>
                            <p className="text-sm text-text-secondary">
                              {new Date(row.created * 1000).toLocaleDateString(
                                "es-ES",
                              )}{" "}
                              ·{" "}
                              {row.status === "paid"
                                ? "Pagada"
                                : row.status === "open"
                                  ? "Pendiente"
                                  : row.status === "void"
                                    ? "Anulada"
                                    : "Consultar documento"}
                            </p>
                          </div>
                          <span className="font-semibold">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: /^[a-z]{3}$/i.test(row.currency)
                                ? row.currency
                                : "EUR",
                            }).format(row.total / 100)}
                          </span>
                          {url && (
                            <a
                              className="text-sm font-semibold text-violet"
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Abrir factura
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                  {cursor && (
                    <button
                      className={secondary}
                      disabled={busy}
                      onClick={() => void loadInvoices(cursor)}
                    >
                      Ver más facturas
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
function PlanDetails({ plan }: { plan: OrganizationBillingPlan }) {
  return (
    <div className="mt-5 rounded-xl bg-bg-secondary p-4">
      <h3 className="font-semibold">Incluido en {plan.title}</h3>
      <p className="mt-2 text-sm">
        Hasta {plan.limits.staff_limit} agendas profesionales,{" "}
        {plan.limits.resource_limit} recursos y {plan.limits.service_limit}{" "}
        servicios activos.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {plan.modules.map((module) => (
          <li
            className="rounded-lg bg-bg-primary px-3 py-1 text-sm"
            key={module}
          >
            {moduleNames[module] ?? module.replaceAll("_", " ")}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-secondary">
        Consulta las condiciones antes de contratar. Integraciones y servicios
        externos sólo se incluyen cuando lo indica expresamente el contrato.
      </p>
    </div>
  );
}
