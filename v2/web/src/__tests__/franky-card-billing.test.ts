// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
  receipt: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
  dispute: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  createAdminSupabase: () => ({
    rpc: state.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ single: state.single, maybeSingle: state.receipt }),
      }),
    }),
  }),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: state.create } } }),
}));
vi.mock("@/lib/franky-card-api", () => ({ CARD_SITE: "https://franky.es" }));
import {
  beginCardCheckout,
  cardCheckoutReply,
  cardProviderReady,
  cardStripeEnvironment,
  handleFrankyCardWebhook,
} from "@/lib/franky-card-billing";
import type { CardCheckout } from "../../../shared/franky-card";
const order = {
  id: "order",
  order_id: "order",
  user_id: "owner",
  status: "created",
  amount_cents: 1490,
  currency: "eur",
  environment: "test",
  price_version: "v1",
  checkout_url: null,
  payment_id: null,
  checkout_id: "cs_ok",
};
const settings = {
  enabled: true,
  purchases_enabled: true,
  provider_ready: true,
  environment: "test" as const,
  annual_cents: 1990,
  introductory_cents: 1490,
  currency: "eur" as const,
};
const intent = {
  id: "pi_ok",
  status: "succeeded",
  livemode: false,
  amount: 1490,
  amount_received: 1490,
  currency: "eur",
  metadata: {
    mode: "franky_card",
    card_order_id: "order",
    supabase_user_id: "owner",
  },
};
const session = {
  id: "cs_ok",
  client_reference_id: "order",
  metadata: { mode: "franky_card", card_order_id: "order" },
  payment_status: "paid",
  payment_intent: "pi_ok",
  amount_total: 1490,
  currency: "eur",
};
const event = (type: string, object: unknown, extra = {}) =>
  ({
    id: "evt_1",
    type,
    livemode: false,
    data: { object },
    ...extra,
  }) as Stripe.Event;
const stripe = () =>
  ({
    paymentIntents: { retrieve: state.retrieve },
    disputes: { retrieve: state.dispute },
  }) as unknown as Stripe;
beforeEach(() => {
  vi.resetAllMocks();
  state.receipt.mockResolvedValue({ data: null, error: null });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture");
  vi.stubEnv("FRANKY_CARD_CHECKOUT_ENABLED", "true");
  state.dispute.mockResolvedValue({
    id: "dp_ok",
    payment_intent: "pi_ok",
    livemode: false,
    status: "won",
  });
  state.single.mockResolvedValue({ data: order, error: null });
  state.retrieve.mockResolvedValue(intent);
  state.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "get_franky_card_readiness"
        ? settings
        : name === "service_begin_franky_card_checkout"
          ? order
          : name === "service_attach_franky_card_checkout"
            ? {
                ...order,
                status: "checkout",
                checkout_url: "https://checkout.stripe.com/c/pay/fixture",
              }
            : { ok: true },
    error: null,
  }));
  state.create.mockResolvedValue({
    id: "cs_ok",
    url: "https://checkout.stripe.com/c/pay/fixture",
    livemode: false,
  });
});
describe("Franky Card provider gates and checkout", () => {
  for (const status of [
    "expired",
    "cancelled",
    "failed",
    "refunded",
    "review",
    "disputed",
    "paid",
  ] as const)
    it(`never reopens a terminal or processing ${status} checkout URL`, () => {
      const response = cardCheckoutReply({
        ...order,
        status,
        checkout_url: "https://checkout.stripe.com/stale",
        refunded_cents: 0,
      } as CardCheckout);
      expect(response.status).not.toBe("checkout");
      expect(response.url).toBeUndefined();
    });
  it("never creates an intent if the accepted amount differs from the server quote", async () => {
    await expect(
      beginCardCheckout("owner", "request", {
        acceptedAmountCents: 1,
        priceVersion: "v1",
        termsVersion: "2026-adhesion-v1",
      }),
    ).rejects.toThrow("card_price_changed");
    expect(state.create).not.toHaveBeenCalled();
  });
  it("requires both deployment and database gates with the matching provider environment", () => {
    expect(cardProviderReady(settings)).toBe(true);
    expect(cardProviderReady({ ...settings, environment: "live" })).toBe(false);
    expect(cardProviderReady({ ...settings, purchases_enabled: false })).toBe(
      false,
    );
    vi.stubEnv("FRANKY_CARD_CHECKOUT_ENABLED", "false");
    expect(cardProviderReady(settings)).toBe(false);
  });
  it("fails closed for an unknown Stripe environment", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "unknown");
    expect(cardStripeEnvironment()).toBeNull();
    expect(cardProviderReady(settings)).toBe(false);
  });
  it("does not create a checkout while sales are closed", async () => {
    vi.stubEnv("FRANKY_CARD_CHECKOUT_ENABLED", "false");
    await expect(
      beginCardCheckout("owner", "request", {
        acceptedAmountCents: 1490,
        priceVersion: "v1",
        termsVersion: "2026-adhesion-v1",
      }),
    ).rejects.toThrow();
    expect(state.create).not.toHaveBeenCalled();
  });
  it("uses the durable server amount and one Stripe idempotency key", async () => {
    await beginCardCheckout("owner", "request", {
      acceptedAmountCents: 1490,
      priceVersion: "v1",
      termsVersion: "2026-adhesion-v1",
    });
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 1490,
              currency: "eur",
            }),
          }),
        ],
      }),
      { idempotencyKey: "franky-card:order" },
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "service_attach_franky_card_checkout",
      expect.objectContaining({ p_order_id: "order", p_checkout_id: "cs_ok" }),
    );
  });
  it("reuses an existing payment instead of duplicating it", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: settings })
      .mockResolvedValueOnce({
        data: {
          ...order,
          status: "checkout",
          checkout_url: "https://checkout.stripe.com/existing",
        },
      });
    expect(
      (
        await beginCardCheckout("owner", "request", {
          acceptedAmountCents: 1490,
          priceVersion: "v1",
          termsVersion: "2026-adhesion-v1",
        })
      ).checkout_url,
    ).toContain("existing");
    expect(state.create).not.toHaveBeenCalled();
  });
  it("does not mark a checkout failed after an uncertain database attachment", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: settings })
      .mockResolvedValueOnce({ data: order })
      .mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(
      beginCardCheckout("owner", "request", {
        acceptedAmountCents: 1490,
        priceVersion: "v1",
        termsVersion: "2026-adhesion-v1",
      }),
    ).rejects.toThrow("card_checkout_pending");
    expect(state.rpc).not.toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.anything(),
    );
  });
});
describe("Franky Card trusted provider events", () => {
  const recorded = {
    order_id: "order",
    payment_id: "pi_ok",
    amount_cents: 1490,
    environment: "test",
    provider: "stripe",
    action: "disputed",
  };
  it("acknowledges an already applied dispute event without reinterpreting its newer status", async () => {
    state.receipt.mockResolvedValue({ data: recorded, error: null });
    expect(
      await handleFrankyCardWebhook(
        stripe(),
        event("charge.dispute.created", {
          id: "dp_ok",
          payment_intent: "pi_ok",
        }),
      ),
    ).toBe(true);
    expect(state.dispute).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("acknowledges a concurrent identical receipt after a reconciliation race", async () => {
    state.receipt
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: recorded, error: null });
    state.rpc.mockResolvedValue({
      error: { message: "card_payment_mismatch" },
    });
    expect(
      await handleFrankyCardWebhook(
        stripe(),
        event("charge.dispute.closed", {
          id: "dp_ok",
          payment_intent: "pi_ok",
        }),
      ),
    ).toBe(true);
  });
  it("rejects an event receipt belonging to another order", async () => {
    state.receipt.mockResolvedValue({
      data: { ...recorded, order_id: "other" },
      error: null,
    });
    await expect(
      handleFrankyCardWebhook(
        stripe(),
        event("charge.dispute.closed", {
          id: "dp_ok",
          payment_intent: "pi_ok",
        }),
      ),
    ).rejects.toThrow("card_payment_event_mismatch");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("retries an unavailable receipt ledger rather than ignoring it", async () => {
    state.receipt.mockResolvedValue({
      data: null,
      error: { message: "offline" },
    });
    await expect(
      handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", session),
      ),
    ).rejects.toThrow("card_payment_reconciliation_failed");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects a connected account attempting to reuse platform metadata", async () => {
    expect(
      await handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", session, { account: "acct_other" }),
      ),
    ).toBe(false);
    expect(state.retrieve).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not activate an unpaid checkout", async () => {
    expect(
      await handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", {
          ...session,
          payment_status: "unpaid",
        }),
      ),
    ).toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("activates only the matched paid order via the idempotent service RPC", async () => {
    expect(
      await handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", session),
      ),
    ).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.objectContaining({
        p_event_id: "evt_1",
        p_order_id: "order",
        p_payment_id: "pi_ok",
        p_action: "paid",
        p_amount_cents: 1490,
        p_environment: "test",
      }),
    );
  });
  for (const [name, override] of [
    [
      "wrong owner",
      { metadata: { ...intent.metadata, supabase_user_id: "other" } },
    ],
    ["wrong amount", { amount: 1990 }],
    ["wrong currency", { currency: "usd" }],
    ["unsettled amount", { amount_received: 0 }],
    ["different environment", { livemode: true }],
  ] as const) {
    it("refuses " + name, async () => {
      state.retrieve.mockResolvedValue({ ...intent, ...override });
      await expect(
        handleFrankyCardWebhook(
          stripe(),
          event("checkout.session.completed", session),
        ),
      ).rejects.toThrow();
      expect(state.rpc).not.toHaveBeenCalled();
    });
  }
  it("refuses a checkout ID copied from another order", async () => {
    await expect(
      handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", { ...session, id: "cs_other" }),
      ),
    ).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("throws on reconciliation failure so Stripe will retry", async () => {
    state.rpc.mockResolvedValue({ error: { message: "offline" } });
    await expect(
      handleFrankyCardWebhook(
        stripe(),
        event("checkout.session.completed", session),
      ),
    ).rejects.toThrow("card_payment_reconciliation_failed");
  });
  it("only expires the exact attached provider session", async () => {
    await handleFrankyCardWebhook(
      stripe(),
      event("checkout.session.expired", session),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "service_expire_franky_card_checkout",
      { p_order_id: "order", p_checkout_id: "cs_ok" },
    );
  });
  it("revokes a fully refunded payment using provider evidence", async () => {
    await handleFrankyCardWebhook(
      stripe(),
      event("charge.refunded", {
        payment_intent: "pi_ok",
        refunded: true,
        amount_refunded: 1490,
      }),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.objectContaining({ p_action: "refunded" }),
    );
  });
  it("records a partial refund without treating it as a full membership cancellation", async () => {
    await handleFrankyCardWebhook(
      stripe(),
      event("charge.refunded", {
        payment_intent: "pi_ok",
        refunded: false,
        amount_refunded: 500,
      }),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.objectContaining({
        p_action: "partial_refund",
        p_amount_cents: 500,
      }),
    );
  });
  it("keeps a won dispute restored when an older created event arrives afterwards", async () => {
    await handleFrankyCardWebhook(
      stripe(),
      event("charge.dispute.created", {
        id: "dp_ok",
        payment_intent: "pi_ok",
        status: "needs_response",
      }),
    );
    expect(state.dispute).toHaveBeenCalledWith("dp_ok");
    expect(state.rpc).toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.objectContaining({ p_action: "dispute_won" }),
    );
  });
  it("restores a won dispute through the original grant rather than another purchase", async () => {
    await handleFrankyCardWebhook(
      stripe(),
      event("charge.dispute.closed", {
        id: "dp_ok",
        payment_intent: "pi_ok",
        status: "won",
      }),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "service_apply_franky_card_payment",
      expect.objectContaining({ p_action: "dispute_won" }),
    );
  });
});
