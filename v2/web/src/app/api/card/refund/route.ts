import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  cardRequest,
  cardFailure,
  CARD_PRIVATE_HEADERS,
} from "@/lib/franky-card-api";
import { validateBody } from "@/lib/api-helpers";
import { getStripe } from "@/lib/stripe";
import { cardStripeEnvironment } from "@/lib/franky-card-billing";
export async function POST(req: NextRequest) {
  const auth = await cardRequest(req, "admin-refund", 5);
  if (auth.response) return auth.response;
  const body = await validateBody(
    req,
    z
      .object({
        orderId: z.uuid(),
        reason: z.enum(["customer_request", "duplicate", "service_issue"]),
      })
      .strict(),
    { maxBytes: 1024 },
  );
  if (body instanceof NextResponse) return body;
  // Authorize using the actual admin session + AAL2, never the service role.
  const { data: order, error } = await auth.client.rpc("admin_franky_card", {
    p_action: "prepare_refund",
    p_target_id: body.orderId,
    p_data: { reason_code: body.reason },
  });
  if (error || !order)
    return cardFailure(
      "Se requiere administración con verificación en dos pasos y un pedido reembolsable.",
      403,
    );
  if (order.environment !== cardStripeEnvironment() || !order.payment_id)
    return cardFailure("El proveedor de este pedido no está disponible.", 503);
  if (order.remaining_cents === 0)
    return NextResponse.json(
      { status: "refunded", order_id: order.order_id },
      { headers: CARD_PRIVATE_HEADERS },
    );
  if (
    !Number.isSafeInteger(order.remaining_cents) ||
    order.remaining_cents < 1 ||
    order.remaining_cents > order.amount_cents
  )
    return cardFailure(
      "No se pudo verificar el importe restante de este pedido.",
      409,
    );
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: order.payment_id,
        amount: order.remaining_cents,
        reason:
          body.reason === "duplicate" ? "duplicate" : "requested_by_customer",
        metadata: { mode: "franky_card", card_order_id: order.order_id },
      },
      {
        idempotencyKey: `franky-card:refund:${order.order_id}:${order.remaining_cents}`,
      },
    );
    return NextResponse.json(
      {
        status:
          refund.status === "succeeded" ? "pending_confirmation" : "pending",
        order_id: order.order_id,
      },
      { headers: CARD_PRIVATE_HEADERS },
    );
  } catch {
    return cardFailure(
      "No se ha podido confirmar la devolución. Revisa el pedido antes de reintentar; el mismo intento no duplica el reembolso.",
      503,
    );
  }
}
