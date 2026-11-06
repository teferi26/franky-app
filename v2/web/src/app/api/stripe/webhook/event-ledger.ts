import type Stripe from "stripe";

type LedgerDb = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};
export type WebhookClaim =
  | { state: "process"; token: string }
  | { state: "duplicate" | "retry" };

/** A database failure must remain retryable: never acknowledge an unprocessed payment. */
export async function claimWebhookEvent(db: LedgerDb, event: Pick<Stripe.Event, "id" | "type">): Promise<WebhookClaim> {
  try {
    const { data, error } = await db.rpc("claim_webhook_event_v2", { p_event_id: event.id, p_type: event.type });
    if (error) throw new Error(error.code ?? "ledger_unavailable");
    const claim = data as { duplicate?: boolean; busy?: boolean; token?: string } | null;
    if (claim?.duplicate === true) return { state: "duplicate" };
    if (claim?.busy !== true && typeof claim?.token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claim.token)) {
      return { state: "process", token: claim.token };
    }
  } catch (err) {
    console.error("[stripe-webhook] event claim unavailable event.id=%s:", event.id, err);
  }
  return { state: "retry" };
}

/** Fencing prevents an expired worker from completing a newer attempt. */
export async function finishWebhookEvent(
  db: LedgerDb,
  event: Pick<Stripe.Event, "id">,
  token: string,
  status: "succeeded" | "failed",
  error?: string,
): Promise<boolean> {
  try {
    const result = await db.rpc("finish_webhook_event_v2", {
      p_event_id: event.id, p_token: token, p_status: status, p_error: error ? error.slice(0, 500) : null,
    });
    if (result.error) throw new Error(result.error.code ?? "ledger_unavailable");
    return (result.data as { finished?: boolean } | null)?.finished === true;
  } catch (err) {
    console.error("[stripe-webhook] event completion unavailable event.id=%s:", event.id, err);
    return false;
  }
}
