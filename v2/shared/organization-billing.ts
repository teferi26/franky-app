/** Provider references are server-owned. These contracts never activate sales. */
export type OrganizationBillingEnvironment = "test" | "live";
export type OrganizationBillingInterval = "month" | "year";
export type OrganizationBillingPlan = {
  plan_key: string;
  version: number;
  title: string;
  categories: string[];
  monthly_cents: number;
  annual_cents: number;
  founder_cents: number;
  currency: "eur";
  tax_behavior: "exclusive";
  terms_version: string;
  terms: string;
  modules: string[];
  limits: {
    staff_limit: number;
    resource_limit: number;
    service_limit: number;
  };
  status: "draft" | "active" | "retired";
};
export type OrganizationBillingQuote = {
  id: string;
  organization_id: string;
  environment: OrganizationBillingEnvironment;
  plan_key: string;
  plan_version: number;
  interval: OrganizationBillingInterval;
  first_base_cents: number;
  renewal_base_cents: number;
  currency: "eur";
  tax_behavior: "exclusive";
  founder: boolean;
  expires_at: string;
  terms_version: string;
  terms: string;
  modules: string[];
  limits: OrganizationBillingPlan["limits"];
  available: boolean;
  reason: string | null;
};
export type OrganizationBillingState = {
  organization_id: string;
  environment: OrganizationBillingEnvironment;
  sales_enabled: boolean;
  provider_ready: boolean;
  can_manage_billing: boolean;
  can_read_finance: boolean;
  account: {
    id: string;
    legal_name: string;
    country: string;
    verified: boolean;
  } | null;
  founder: { approved: boolean; reason: string };
  catalog: OrganizationBillingPlan[];
  pending_attempt_id: string | null;
  subscription: {
    id: string;
    status: string;
    interval: OrganizationBillingInterval;
    plan_key: string;
    plan_version: number;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  access: {
    source: "free" | "pilot" | "stripe";
    active: boolean;
    paused: boolean;
    until: string | null;
    existing_obligations_access: true;
  };
  reason: string | null;
};
export type OrganizationCheckoutAttempt = {
  attempt_id: string;
  organization_id: string;
  status: "creating" | "open" | "pending" | "paid" | "cancelled" | "failed";
  checkout_url: string | null;
  first_base_cents: number;
  renewal_base_cents: number;
  currency: "eur";
  environment: OrganizationBillingEnvironment;
};
export type OrganizationCheckoutContext = OrganizationCheckoutAttempt & {
  actor_id: string;
  checkout_scope?: "organization" | "pro";
  trial_days?: 0 | 7;
  account_id: string;
  contract_id: string;
  created_at: string;
  session_id: string | null;
  subscription_id: string | null;
  invoice_cursor: string | null;
  customer_id: string | null;
  plan_key: string;
  plan_version: number;
  interval: OrganizationBillingInterval;
  terms_version: string;
  terms: string;
  founder: boolean;
  price_id: string;
  product_id: string;
  coupon_id: string | null;
  portal_config_id: string | null;
  tax_behavior: "exclusive";
  sales_enabled: boolean;
  provider_ready: boolean;
  account: { legal_name: string; country: string };
  limits: OrganizationBillingPlan["limits"];
  modules: string[];
};
type OrganizationProviderIdentity = {
  attempt_id: string;
  organization_id: string;
  account_id: string;
  customer_id: string;
  subscription_id: string;
  provider_snapshot_ms: number;
};
export type OrganizationBillingEventPayload =
  | (OrganizationProviderIdentity & {
      kind: "invoice_snapshot";
      invoice_id: string;
      price_id: string;
      product_id: string;
      currency: "eur";
      quantity: 1;
      billing_reason: "subscription_create" | "subscription_cycle";
      period_start: string;
      period_end: string;
      subtotal_cents: number;
      discount_cents: number;
      tax_cents: number;
      total_cents: number;
      paid_cents: number;
      refunded_cents: number;
      paid: boolean;
      dispute_status: "none" | "open" | "won" | "lost";
      coupon_id: string | null;
    })
  | (OrganizationProviderIdentity & {
      kind: "subscription_state";
      status:
        | "incomplete"
        | "incomplete_expired"
        | "trialing"
        | "active"
        | "past_due"
        | "unpaid"
        | "paused"
        | "canceled";
      cancel_at_period_end: boolean;
      current_period_end: string | null;
      price_id: string;
      product_id: string;
      currency: "eur";
      quantity: 1;
    })
  | {
      kind: "checkout_expired";
      attempt_id: string;
      organization_id: string;
      account_id: string;
      customer_id: string;
      session_id: string;
      payment_status: "unpaid";
      provider_snapshot_ms: number;
    };
export const ORGANIZATION_BILLING_RPC = {
  state: "get_organization_billing",
  quote: "quote_organization_plan",
  prepare: "prepare_organization_checkout",
  access: "get_organization_billing_access",
  context: "service_get_organization_checkout",
  bindCustomer: "service_bind_organization_customer",
  attachCheckout: "service_attach_organization_checkout",
  reconcile: "service_reconcile_organization_billing",
  admin: "service_organization_billing_admin",
} as const;
