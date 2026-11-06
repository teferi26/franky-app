import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadPrivateSocialMedia } from '@/lib/social-media-client';
import { assertSafeImageUpload } from "@/lib/upload-validate";
import { prepareImageForUpload, detectMime } from "@/lib/image-upload";

export const LIGAR_BUCKET = "ligar-media";
export const LIGAR_IMAGE_MAX = 5 * 1024 * 1024; // 5MB
export const LIGAR_AUDIO_MAX = 10 * 1024 * 1024; // 10MB
export const LIGAR_VIDEO_MAX = 50 * 1024 * 1024; // 50MB (límite del bucket)

export const LIGAR_AUDIO_MIME = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/aac",
];
export const LIGAR_VIDEO_MIME = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

export type LigarMediaKind = "image" | "audio" | "video";

export interface UploadedLigarMedia {
  url: string;
  type: LigarMediaKind;
}

/**
 * Sube una imagen, audio o vídeo al bucket ligar-media bajo {uid}/{random}.{ext}
 * (la RLS exige que la primera carpeta sea el uid). Valida tamaño + tipo:
 * imágenes por magic-bytes, audio/vídeo por MIME declarado.
 *
 * Las imágenes se convierten a JPEG antes de subirlas: las fotos del iPhone
 * llegan en HEIC y el bucket las rechaza con un 415 (ver
 * src/lib/image-upload.ts). El audio y el vídeo van tal cual.
 */
export async function uploadLigarMedia(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<UploadedLigarMedia> {
  let ext: string;
  let kind: LigarMediaKind;
  let body: Blob = file;
  // detectMime en vez de file.type en crudo: iOS manda el tipo vacío al
  // compartir desde Ficheros, y entonces un audio o un vídeo acababa tratado
  // como imagen. Nunca se manda al Storage el tipo declarado sin pasar por aquí.
  const mime = detectMime(file);
  let contentType = mime;

  if (mime.startsWith("audio/")) {
    if (!LIGAR_AUDIO_MIME.includes(mime)) {
      throw new Error("Formato de audio no admitido");
    }
    if (file.size > LIGAR_AUDIO_MAX) {
      throw new Error("El audio supera los 10MB");
    }
    kind = "audio";
    ext = mime === "audio/mpeg" ? "mp3" : mime.split("/")[1] || "webm";
  } else if (mime.startsWith("video/")) {
    if (!LIGAR_VIDEO_MIME.includes(mime)) {
      throw new Error("Formato de vídeo no admitido");
    }
    if (file.size > LIGAR_VIDEO_MAX) {
      throw new Error("El vídeo supera los 50MB");
    }
    kind = "video";
    ext = mime === "video/quicktime" ? "mov" : mime.split("/")[1] || "mp4";
  } else {
    const prep = await prepareImageForUpload(file);
    if (!prep.ok) throw new Error(prep.message);
    // La comprobación de magic-bytes se mantiene, pero sobre lo que se sube de
    // verdad (y con el peso ya optimizado).
    const prepared = new File([prep.blob], `imagen.${prep.ext}`, { type: prep.contentType });
    await assertSafeImageUpload(prepared, { maxBytes: LIGAR_IMAGE_MAX });
    kind = "image";
    ext = prep.ext;
    body = prep.blob;
    contentType = prep.contentType;
  }

  const uploaded = await uploadPrivateSocialMedia(supabase, userId, body, contentType);
  return { url: uploaded.url, type: kind };
}
