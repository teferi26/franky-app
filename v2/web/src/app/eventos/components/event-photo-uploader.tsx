"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { prepareImageForUpload, isImageFile, detectMime } from "@/lib/image-upload";
import { cn } from "@/lib/utils";

const BUCKET = "avatars";
const MAX_PHOTOS = 5;
const MAX_BYTES = 3 * 1024 * 1024; // 3MB matches the bucket limit
const MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Prepara la foto para el bucket de avatares: la convierte a JPEG (las fotos
 * del iPhone llegan en HEIC y el Storage las rechaza con un 415, ver
 * src/lib/image-upload.ts) y tampoco deja pasar el GIF tal cual, porque este
 * bucket no lo acepta: se le declara como JPEG para forzar la reconversión.
 */
async function prepareEventPhoto(file: File) {
  const source =
    detectMime(file) === "image/gif"
      ? new File([file], file.name.replace(/\.gif$/i, ".jpg"), { type: "image/jpeg" })
      : file;
  return prepareImageForUpload(source);
}

export default function EventPhotoUploader({
  userId,
  photos,
  onChange,
}: {
  userId: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const slotsLeft = MAX_PHOTOS - photos.length;

  const handlePick = () => fileRef.current?.click();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (slotsLeft <= 0) {
      setErr(`Ya tienes el máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    setErr("");
    setBusy(true);
    const supabase = createClient();
    const newUrls: string[] = [];

    for (const file of files.slice(0, slotsLeft)) {
      if (!isImageFile(file)) {
        setErr("Formato no admitido. Usa JPG, PNG, WebP o GIF.");
        continue;
      }
      const prep = await prepareEventPhoto(file);
      if (!prep.ok) {
        setErr(prep.message);
        continue;
      }
      // El peso se mide tras convertir: una foto del móvil pesa varios MB en
      // origen y se queda muy por debajo del tope al pasar a JPEG.
      if (prep.blob.size > MAX_BYTES) {
        setErr("Cada imagen debe ocupar menos de 3MB.");
        continue;
      }
      const rand =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Path must start with the user's id (storage RLS policy on the avatars bucket).
      const path = `${userId}/events/${rand}.${prep.ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, prep.blob, { contentType: prep.contentType, upsert: false });
      if (upErr) {
        setErr("No se pudo subir alguna imagen. Inténtalo de nuevo.");
        continue;
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (pub?.publicUrl) newUrls.push(pub.publicUrl);
    }

    if (newUrls.length > 0) {
      onChange([...photos, ...newUrls].slice(0, MAX_PHOTOS));
    }
    setBusy(false);
  };

  const handleRemove = async (url: string) => {
    setErr("");
    setBusy(true);
    const supabase = createClient();
    onChange(photos.filter((p) => p !== url));
    // Best-effort delete from storage.
    if (url.includes(`/${BUCKET}/`)) {
      const marker = `/${BUCKET}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        const oldPath = url.substring(idx + marker.length);
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }
    }
    setBusy(false);
  };

  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold tracking-tight text-text-primary">
        Fotos del evento <span className="text-text-muted font-normal">({photos.length}/{MAX_PHOTOS})</span>
      </label>
      <p className="mb-3 text-xs leading-relaxed text-text-muted">
        La primera foto se usará como portada. Máx. 3MB por foto.
      </p>

      {err && (
        <p role="alert" className="mb-3 flex items-center gap-2 text-sm font-medium text-error">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>{err}</span>
        </p>
      )}

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const url = photos[i];
          if (url) {
            return (
              <div
                key={url}
                className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-bg-secondary"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemove(url)}
                  disabled={busy}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  aria-label="Eliminar foto"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-text-primary px-1.5 py-0.5 text-[10px] font-semibold text-bg-primary">
                    Portada
                  </span>
                )}
              </div>
            );
          }
          const isFirstEmpty = i === photos.length;
          return (
            <button
              key={i}
              type="button"
              onClick={isFirstEmpty ? handlePick : undefined}
              disabled={!isFirstEmpty || busy}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed text-text-muted transition-colors duration-200",
                isFirstEmpty
                  ? "cursor-pointer border-border hover:border-text-primary/30 hover:text-text-primary"
                  : "cursor-default border-border-light opacity-60"
              )}
            >
              {busy && isFirstEmpty ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Camera className="mb-0.5 h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  <span className="text-[10px] font-medium">{isFirstEmpty ? "Subir" : ""}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={MIMES.join(",")}
        multiple
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
