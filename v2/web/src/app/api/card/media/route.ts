import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  cardRequest,
  cardFailure,
  CARD_PRIVATE_HEADERS,
} from "@/lib/franky-card-api";
import { createAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
const MAX_FILE = 3 * 1024 * 1024;
const MAX_FORM = MAX_FILE + 64 * 1024;
const validPath = (path: string, user: string) =>
  path.startsWith(`${user}/`) &&
  /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/i.test(path);

async function boundedBody(req: NextRequest): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > MAX_FORM || !req.body)
    throw new Error("size");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_FORM) {
        await reader.cancel();
        throw new Error("size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(req: NextRequest) {
  const auth = await cardRequest(req, "photo-upload", 6);
  if (auth.response) return auth.response;
  try {
    const body = await boundedBody(req);
    const form = await new Response(body.buffer as ArrayBuffer, {
      headers: { "Content-Type": req.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > MAX_FILE ||
      !file.size
    ) {
      return cardFailure("Elige una foto JPG, PNG o WebP de hasta 3 MB.");
    }
    const source = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 16_777_216,
      failOn: "error",
      animated: false,
    });
    const metadata = await source.metadata();
    if (
      (metadata.pages ?? 1) > 1 ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    )
      return cardFailure("Utiliza una fotografía fija.");
    // Re-encode pixels; EXIF, location and other metadata are not copied.
    const photo = await source
      .rotate()
      .resize(512, 640, {
        fit: "cover",
        position: "attention",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    const path = `${auth.user.id}/${randomUUID()}.jpg`;
    const bucket = auth.client.storage.from("card-media");
    const { error } = await bucket.upload(path, photo, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "0",
    });
    if (error)
      return cardFailure(
        "No se pudo guardar la foto privada. Inténtalo de nuevo.",
        503,
      );
    const { data: signed, error: signError } = await bucket.createSignedUrl(
      path,
      120,
    );
    if (signError || !signed) {
      await bucket.remove([path]);
      return cardFailure(
        "No se pudo preparar la fotografía. Inténtalo de nuevo.",
        503,
      );
    }
    return NextResponse.json(
      { path, url: signed.signedUrl, expiresIn: 120 },
      { headers: CARD_PRIVATE_HEADERS },
    );
  } catch {
    return cardFailure(
      "No se pudo leer la imagen. Usa una fotografía de hasta 3 MB.",
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = await cardRequest(req, "photo-preview", 30);
  if (auth.response) return auth.response;
  const operation = req.nextUrl.searchParams.get("operation");
  if (operation) {
    if (!/^[a-f0-9-]{36}$/i.test(operation))
      return cardFailure("Operación no válida.");
    const { data: request, error: requestError } = await auth.client.rpc(
      "get_franky_card_request",
      { p_request_id: operation },
    );
    // The RPC rechecks CURRENT venue membership and holder consent. Do not sign an arbitrary path with service credentials.
    if (
      requestError ||
      request?.actor !== "merchant" ||
      request.status !== "customer_confirmed" ||
      !request.identity?.photo_path ||
      Date.parse(request.expires_at) <= Date.now()
    )
      return cardFailure(
        "La fotografía sólo está disponible al validar una operación autorizada.",
        403,
      );
    const { data, error } = await createAdminSupabase()
      .storage.from("card-media")
      .createSignedUrl(request.identity.photo_path, 30);
    if (error || !data)
      return cardFailure("La fotografía no está disponible.", 404);
    return NextResponse.json(
      { url: data.signedUrl, expiresIn: 30 },
      { headers: CARD_PRIVATE_HEADERS },
    );
  }
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!validPath(path, auth.user.id))
    return cardFailure("No tienes acceso a esta fotografía.", 403);
  const { data, error } = await auth.client.storage
    .from("card-media")
    .createSignedUrl(path, 120);
  if (error || !data)
    return cardFailure("La fotografía no está disponible.", 404);
  return NextResponse.json(
    { url: data.signedUrl, expiresIn: 120 },
    { headers: CARD_PRIVATE_HEADERS },
  );
}
