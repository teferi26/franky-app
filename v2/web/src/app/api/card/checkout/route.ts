import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import {
  cardRequest,
  cardFailure,
  CARD_PRIVATE_HEADERS,
} from "@/lib/franky-card-api";
import {
  beginCardCheckout,
  cardCheckoutReply,
} from "@/lib/franky-card-billing";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const auth = await cardRequest(req, "checkout", 5);
  if (auth.response) return auth.response;
  const body = await validateBody(
    req,
    z
      .object({
        requestId: z.uuid(),
        acceptedAmountCents: z.number().int().positive().max(100000),
        priceVersion: z.string().min(1).max(80),
        termsVersion: z.string().min(1).max(80),
      })
      .strict(),
    { maxBytes: 1024 },
  );
  if (body instanceof NextResponse) return body;
  try {
    const order = await beginCardCheckout(auth.user.id, body.requestId, body);
    return NextResponse.json(cardCheckoutReply(order), {
      headers: CARD_PRIVATE_HEADERS,
    });
  } catch (error) {
    if (
      (error as Error).message === "card_price_changed" ||
      (error as Error).message === "card_quote_changed"
    )
      return cardFailure("card_price_changed", 409);
    return cardFailure(
      "No se ha podido abrir el pago. Tu tarjeta no se activará hasta confirmar el cobro; puedes reintentar sin crear otra compra.",
      503,
    );
  }
}
export async function GET(req: NextRequest) {
  const auth = await cardRequest(req, "order", 30);
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get("order");
  if (!z.uuid().safeParse(id).success) return cardFailure("Pedido no válido.");
  const { data, error } = await auth.client.rpc("get_franky_card_checkout", {
    p_order_id: id,
  });
  if (error || !data)
    return cardFailure(
      "No se ha podido recuperar este pedido. Vuelve a consultar su estado.",
      503,
    );
  return NextResponse.json(data, { headers: CARD_PRIVATE_HEADERS });
}
