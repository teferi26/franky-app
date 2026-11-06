import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createRequestSupabase } from "@/lib/supabase-server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { assertSafeImageUpload } from "@/lib/upload-validate";

/**
 * Subida de la foto de un anuncio del mercado.
 *
 * Reutiliza el bucket público `stories-media` (ya creado por la Storage API),
 * pero NO toca la tabla `stories`: solo sube el objeto y devuelve su URL, para
 * que el cliente la guarde en `student_listings.image_url`. La subida directa
 * desde el cliente al bucket no está autorizada por RLS, así que se hace con la
 * service role tras validar al usuario, igual que /api/stories/upload.
 *
 * Solo imágenes (un anuncio no lleva vídeo), máximo 5 MB.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MAX = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createRequestSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(req, { key: "marketplace-upload", limit: 20, windowMs: 60 * 60_000 });
  if (!rl.ok) return rl.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "no_file", message: "Falta la imagen." }, { status: 400 });
  }
  // Validación por magic bytes: el Content-Type y la extensión los pone el
  // cliente y pueden mentir (p. ej. un HTML con <script> declarado image/jpeg
  // acabaría servido desde el bucket público). La extensión y el contentType
  // del objeto salen del tipo DETECTADO, nunca de file.type.
  let detected: { type: string; mime: string };
  try {
    detected = await assertSafeImageUpload(file, {
      maxBytes: IMAGE_MAX,
      allowed: ["jpg", "png", "webp"],
    });
  } catch (code) {
    if (code === "file_too_large") {
      return NextResponse.json({ error: "too_big", message: "Máximo 5 MB." }, { status: 413 });
    }
    return NextResponse.json(
      { error: "bad_type", message: "Solo JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabase();
  const path = `${user.id}/market-${crypto.randomUUID()}.${detected.type}`;
  const bytes = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from("stories-media")
    .upload(path, bytes, { contentType: detected.mime, upsert: false });
  if (upErr) {
    console.error("[marketplace/upload]", upErr.message);
    return NextResponse.json({ error: "upload_failed", message: "No se pudo subir la imagen." }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("stories-media").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: publicUrl });
}
