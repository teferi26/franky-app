import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPrivateSocialMedia } from '@/lib/social-media-client';
import { assertSafeImageUpload } from "@/lib/upload-validate";
import { prepareImageForUpload, detectMime } from "@/lib/image-upload";

export const FOMO_BUCKET = "fomo-media";
export const FOMO_IMAGE_MAX = 5 * 1024 * 1024; // 5MB
export const FOMO_AUDIO_MAX = 10 * 1024 * 1024; // 10MB (límite del bucket)
export const FOMO_AUDIO_MIME = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/aac",
];

export type FomoMediaKind = "image" | "audio";

export interface UploadedMedia {
  url: string;
  type: FomoMediaKind;
}

/**
 * Sube una imagen o audio al bucket fomo-media bajo {userId}/{random}.{ext}
 * (la RLS exige que la primera carpeta sea el uid del usuario). Valida
 * tamaño + tipo: imágenes por magic-bytes, audio por MIME declarado.
 * Devuelve la URL pública y el tipo.
 *
 * Las imágenes se convierten a JPEG antes de nada: las fotos del iPhone
 * llegan en HEIC y el bucket las rechaza con un 415 (ver
 * src/lib/image-upload.ts). El audio va tal cual.
 */
export async function uploadFomoMedia(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<UploadedMedia> {
  // detectMime en vez de file.type en crudo: iOS manda el tipo vacío al
  // compartir desde Ficheros, y así un audio no acaba tratado como imagen.
  const mime = detectMime(file);

  let ext: string;
  let kind: FomoMediaKind;
  let body: Blob = file;
  let contentType = mime;

  if (mime.startsWith("audio/")) {
    if (!FOMO_AUDIO_MIME.includes(mime)) {
      throw new Error("Formato de audio no admitido");
    }
    if (file.size > FOMO_AUDIO_MAX) {
      throw new Error("El audio supera los 10MB");
    }
    kind = "audio";
    ext = mime === "audio/mpeg" ? "mp3" : mime.split("/")[1] || "webm";
  } else {
    const prep = await prepareImageForUpload(file);
    if (!prep.ok) throw new Error(prep.message);
    // La comprobación de magic-bytes se mantiene, pero sobre lo que se va a
    // subir de verdad (y con el peso ya optimizado).
    const prepared = new File([prep.blob], `imagen.${prep.ext}`, { type: prep.contentType });
    await assertSafeImageUpload(prepared, { maxBytes: FOMO_IMAGE_MAX });
    kind = "image";
    ext = prep.ext;
    body = prep.blob;
    contentType = prep.contentType;
  }

  const uploaded = await uploadPrivateSocialMedia(supabase, userId, body, contentType);
  return { url: uploaded.url, type: kind };
}
