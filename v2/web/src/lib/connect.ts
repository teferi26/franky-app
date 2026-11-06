import { assertRealPaymentActors } from './payment-demo-guard';
import { createAdminSupabase } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { ORIGIN_MERCHANT_ACCOUNT } from './origin-partner';
import { ORIGIN_ORGANIZER_ID } from './origin-partner';

export type ConnectAccount = {
  id: string;
  user_id: string;
  stripe_connect_account_id: string;
  // `charges_enabled` is repurposed under the V2 recipient model to mean
  // "ready to receive transfers" (stripe_transfers capability is active). The
  // charge routes gate on this.
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  transfers_status: string | null;
  requirements_status: string | null;
  onboarding_status: "pending" | "restricted" | "active" | "disabled";
  updated_at: string;
};

/**
 * Estado de cobros tal y como lo entiende la UI:
 *  - "none"    → no ha empezado el alta.
 *  - "pending" → cuenta creada, Stripe aún no la ha activado (o falta algún dato).
 *  - "active"  → puede recibir el dinero de las ventas.
 */
export type PayoutStatus = "none" | "pending" | "active";

export type AccountStatus = {
  readyToReceive: boolean;
  onboardingComplete: boolean;
  transfersStatus: string | null;
  requirementsStatus: string | null;
};

const SELECT_COLS =
  "id, user_id, stripe_connect_account_id, charges_enabled, payouts_enabled, details_submitted, transfers_status, requirements_status, onboarding_status, updated_at";

// Cuánto se fía la UI del estado guardado antes de volver a preguntar a Stripe
// cuando la cuenta todavía NO está lista. El webhook de Connect es la vía
// normal de actualización; esto es el plan B para que un webhook perdido no
// deje al vendedor "pendiente" para siempre.
const STATUS_TTL_MS = 5 * 60 * 1000;

/**
 * Read a seller's Connect account via the service role. Buyers cannot read the
 * seller's row under RLS, so charge routes use this to verify the seller can
 * actually receive money before creating a Checkout Session.
 */
export async function getSellerConnectAccount(
  userId: string
): Promise<ConnectAccount | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("connect_accounts")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  // Origin is moving to its own Standard account. Do not sell into the old
  // Express account while its owner is completing the OAuth handoff.
  if(data && userId===ORIGIN_ORGANIZER_ID && data.stripe_connect_account_id!==ORIGIN_MERCHANT_ACCOUNT) {
    return {...data,charges_enabled:false,payouts_enabled:false,onboarding_status:'pending'} as ConnectAccount;
  }
  return (data as ConnectAccount | null) ?? null;
}

/**
 * Get the existing Connect account for a user or create a new V2 account
 * configured as a `recipient` (ES). The platform is the merchant of record and
 * collects fees + bears losses (destination charges with an application fee),
 * so the seller only needs the stripe_transfers capability to receive payouts.
 */
export async function getOrCreateConnectAccount(
  userId: string,
  email: string | undefined,
  displayName?: string
): Promise<ConnectAccount> {
  await assertRealPaymentActors(userId);
  const existing = await getSellerConnectAccount(userId);
  if (existing) return existing;

  const stripe = getStripe();
  const account = await stripe.v2.core.accounts.create({
    display_name: displayName ?? email ?? undefined,
    contact_email: email,
    identity: { country: "es" },
    dashboard: "express",
    defaults: {
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    metadata: { supabase_user_id: userId },
  });

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("connect_accounts")
    .insert({
      user_id: userId,
      stripe_connect_account_id: account.id,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      transfers_status: "pending",
      requirements_status: null,
      onboarding_status: "pending",
    })
    .select(SELECT_COLS)
    .single();

  if (error) throw new Error(`connect_account_insert_failed: ${error.message}`);
  return data as ConnectAccount;
}

/**
 * Live status of a V2 account, fetched directly from Stripe. The seller can
 * receive money once the stripe_transfers capability is `active`; onboarding is
 * complete once no requirement is currently/past due.
 */
export async function getAccountStatus(
  stripeAccountId: string
): Promise<AccountStatus> {
  const stripe = getStripe();
  if(stripeAccountId===ORIGIN_MERCHANT_ACCOUNT) {
    // OAuth Standard accounts must use the v1 Accounts API, not v2 recipient APIs.
    const account=await stripe.accounts.retrieve(stripeAccountId);
    const transfers=account.capabilities?.transfers??null;
    return {
      readyToReceive:account.charges_enabled&&account.payouts_enabled&&transfers==='active',
      onboardingComplete:account.details_submitted,
      transfersStatus:transfers,
      requirementsStatus:account.requirements?.disabled_reason??null,
    };
  }
  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.recipient", "requirements"],
  });

  const transfersStatus =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status ?? null;
  const requirementsStatus =
    account.requirements?.summary?.minimum_deadline?.status ?? null;

  return {
    readyToReceive: transfersStatus === "active",
    onboardingComplete:
      requirementsStatus !== "currently_due" &&
      requirementsStatus !== "past_due",
    transfersStatus,
    requirementsStatus,
  };
}

/**
 * Re-fetch a V2 account's live status from Stripe and persist it onto the
 * `connect_accounts` row (service role). Called by the thin-events webhook on
 * `v2.core.account[...]` notifications, which carry only a reference — the
 * authoritative state always comes from a fresh retrieve. Idempotent.
 *
 * `charges_enabled` keeps its gate meaning under the recipient model: true ==
 * the stripe_transfers capability is active (ready to receive).
 */
export async function refreshConnectAccount(
  stripeAccountId: string
): Promise<void> {
  const status = await getAccountStatus(stripeAccountId);

  const onboardingStatus: ConnectAccount["onboarding_status"] =
    status.transfersStatus === "active"
      ? "active"
      : status.transfersStatus === "pending" || status.transfersStatus === null
        ? "pending"
        : status.transfersStatus === "unsupported"
          ? "disabled"
          : "restricted";

  const admin = createAdminSupabase();
  await admin
    .from("connect_accounts")
    .update({
      charges_enabled: status.readyToReceive,
      payouts_enabled: status.readyToReceive,
      details_submitted: status.onboardingComplete,
      transfers_status: status.transfersStatus,
      requirements_status: status.requirementsStatus,
      onboarding_status: onboardingStatus,
    })
    .eq("stripe_connect_account_id", stripeAccountId);
}

/**
 * Estado de cobros de un vendedor para decidir qué enseñar (CTA de alta, aviso
 * de "pendiente de verificación" o "cobros activos"). Es la única fuente que
 * deberían usar las páginas: así el organizador, el comprador y la app móvil
 * ven exactamente lo mismo.
 *
 * `live: true` fuerza una lectura fresca a Stripe cuando la cuenta aún no está
 * lista (para el propio vendedor, que acaba de volver del alta). Sin `live`, se
 * consulta a Stripe como mucho una vez cada STATUS_TTL_MS: los visitantes de
 * una ficha de evento no pagan un viaje a Stripe por visita, pero un webhook
 * perdido tampoco deja las entradas sin vender para siempre.
 */
export async function getPayoutStatus(
  userId: string,
  opts: { live?: boolean } = {}
): Promise<PayoutStatus> {
  let account = await getSellerConnectAccount(userId);
  if (!account) return "none";

  if (!account.charges_enabled || userId===ORIGIN_ORGANIZER_ID) {
    const age = Date.now() - new Date(account.updated_at).getTime();
    if (opts.live || userId===ORIGIN_ORGANIZER_ID || !Number.isFinite(age) || age > STATUS_TTL_MS) {
      try {
        await refreshConnectAccount(account.stripe_connect_account_id);
        account = (await getSellerConnectAccount(userId)) ?? account;
      } catch (e) {
        if(userId===ORIGIN_ORGANIZER_ID)return 'pending';
        console.error("[connect] refresh payout status failed:", e);
      }
    }
  }

  return account.charges_enabled ? "active" : "pending";
}
