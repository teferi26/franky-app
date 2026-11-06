import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/api-helpers";
import {
  cardRequest,
  cardFailure,
  CARD_PRIVATE_HEADERS,
} from "@/lib/franky-card-api";
import {
  buildAppleCard,
  buildGoogleCard,
  cardWalletAvailability,
} from "@/lib/franky-card-wallet";
import { createAdminSupabase } from "@/lib/supabase-admin";
import type {
  CardPersonal,
  CardCredential,
} from "../../../../../../shared/franky-card";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const auth = await cardRequest(req, "wallet", 3);
  if (auth.response) return auth.response;
  const body = await validateBody(
    req,
    z.object({ platform: z.enum(["apple", "google"]) }).strict(),
    { maxBytes: 1024 },
  );
  if (body instanceof NextResponse) return body;
  const ready = cardWalletAvailability();
  if (body.platform === "apple" ? !ready.appleWallet : !ready.googleWallet)
    return cardFailure(
      "La incorporación a Wallet todavía no está disponible.",
      503,
    );
  const { data, error } = await auth.client.rpc("get_franky_card");
  const card = data as CardPersonal | null;
  if (error || !card?.enabled || !card.profile)
    return cardFailure("Completa primero tu tarjeta en Franky.", 409);
  // Demo credentials must never be exported to external providers.
  if (card.demo)
    return cardFailure(
      "Wallet se prueba con cuentas de prueba del proveedor. La demo utiliza su tarjeta dentro de Franky.",
      409,
    );
  const { data: issued, error: issueError } = await auth.client.rpc(
    "issue_franky_card_credential",
    { p_kind: "wallet" },
  );
  if (issueError?.message?.includes("card_wallet_limit"))
    return cardFailure(
      "Has alcanzado el límite de pases. Revoca los códigos anteriores desde tu tarjeta antes de emitir uno nuevo.",
      409,
    );
  if (issueError || !issued)
    return cardFailure("No se pudo crear la tarjeta. Inténtalo de nuevo.", 503);
  const credential = issued as CardCredential;
  try {
    if (body.platform === "google")
      return NextResponse.json(
        { url: await buildGoogleCard(auth.user.id, card, credential) },
        { headers: CARD_PRIVATE_HEADERS },
      );
    let photo: Buffer | undefined;
    if (card.profile.photo_path) {
      const { data: picture, error: photoError } = await auth.client.storage
        .from("card-media")
        .download(card.profile.photo_path);
      if (photoError || !picture) throw Error("wallet_photo_unavailable");
      photo = Buffer.from(await picture.arrayBuffer());
    }
    const pass = await buildAppleCard(auth.user.id, card, credential, photo);
    const bucket = createAdminSupabase().storage.from("card-wallet");
    const path = `${auth.user.id}/${randomUUID()}.pkpass`;
    const { error: uploadError } = await bucket.upload(path, pass, {
      contentType: "application/vnd.apple.pkpass",
      upsert: false,
      cacheControl: "0",
    });
    if (uploadError) throw Error("wallet_upload_failed");
    const { data: signed, error: signError } = await bucket.createSignedUrl(
      path,
      120,
      { download: "Franky.pkpass" },
    );
    if (signError || !signed) throw Error("wallet_sign_failed");
    return NextResponse.json(
      { url: signed.signedUrl },
      { headers: CARD_PRIVATE_HEADERS },
    );
  } catch {
    // Failure to create a NEW pass must not invalidate a previously working Apple/Google pass.
    // Only this request's opaque reference is retired. Old references require explicit revocation.
    try {
      await createAdminSupabase()
        .from("franky_card_credentials")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .eq("kind", "wallet")
        .eq(
          "token_hash",
          createHash("sha256").update(credential.token).digest("hex"),
        );
    } catch {
      /* A leftover locator alone cannot approve any consumption; normal expiry/revocation applies. */
    }
    return cardFailure(
      "No se pudo añadir la tarjeta a Wallet. Tus tarjetas anteriores siguen disponibles; inténtalo de nuevo.",
      503,
    );
  }
}
