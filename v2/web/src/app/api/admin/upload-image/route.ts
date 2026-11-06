import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest, adminJson } from '@/lib/admin-request';
import { createAdminSupabase } from "@/lib/supabase-admin";
import { assertSafeImageUpload } from "@/lib/upload-validate";

export const runtime = "nodejs";

const BUCKET = "content-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

async function ensureBucket() {
  const admin = createAdminSupabase();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.id === BUCKET);
  if (!exists) {
    await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Array.from(ALLOWED),
    });
  }
}

export async function POST(req: NextRequest) {
  const identity = await requireAdminRequest(req);
  if (identity instanceof NextResponse) return identity;

  const form = await req.formData();
  const file = form.get("file");
  const folder = (form.get("folder") as string) || "misc";
  if (!(file instanceof File)) {
    return adminJson({ error: "no file" }, { status: 400 });
  }

  // Magic-byte check (not just MIME header). Catches attackers renaming
  // executables/HTML/SVG payloads to .jpg.
  let detected: { type: string; mime: string };
  try {
    detected = await assertSafeImageUpload(file, {
      maxBytes: MAX_BYTES,
      allowed: ["jpg", "png", "webp", "gif"],
    });
  } catch (code) {
    return adminJson({ error: String(code) }, { status: 400 });
  }
  // Also keep the legacy MIME allowlist as a redundant check.
  if (!ALLOWED.has(file.type) && !ALLOWED.has(detected.mime)) {
    return adminJson({ error: "formato no admitido" }, { status: 400 });
  }

  try {
    await ensureBucket();
  } catch (e) {
    // bucket may already exist or creation failed; continue and let upload report error
    // eslint-disable-next-line no-console
    console.error("[upload-image] ensureBucket:", e);
  }

  const admin = createAdminSupabase();
  // Extensión y contentType salen del tipo detectado por magic bytes, no del
  // nombre ni del Content-Type que declara el cliente (ambos manipulables).
  const ext = detected.type;
  const rand = crypto.randomUUID();
  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "misc";
  const path = `${safeFolder}/${rand}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(arrayBuffer), {
      contentType: detected.mime,
      upsert: false,
    });

  if (upErr) {
    return adminJson({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return adminJson({ url: pub.publicUrl, path });
}
