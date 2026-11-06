"use client";

import { useId, useRef, useState } from "react";
import {
  ImagePlus,
  Mic,
  BarChart3,
  X,
  Loader2,
  Send,
  VenetianMask,
  UserRound,
  Video as VideoIcon,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";
import { prepareImageForUpload, detectMime } from "@/lib/image-upload";
import { Button } from "@/components/ui/button";
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ensureCommunityTerms } from '@/lib/community-terms-client';
import { uploadPrivateSocialMedia } from '@/lib/social-media-client';
import { requestPublicationReview } from '@/lib/publication-review-client';
import { useToast } from '@/components/ui/toast';
import { uploadFomoMedia, FOMO_BUCKET } from "./uploadMedia";

type Mode = "thread" | "reply";

const MAX_BODY = 2000;

// Vídeo: mp4/quicktime/webm, mismos límites que el móvil y que el bucket
// fomo-media. 1 GB, el mismo tope que la app (mobile/src/lib/media.ts) y que los buckets
// tras la migración 160. En el navegador sí se puede pasar el File directo al
// SDK sin cargarlo en memoria, así que aquí no hace falta un camino aparte.
// Ojo: manda el tope MÁS PEQUEÑO de los tres (app, bucket y proyecto), y el del
// proyecto se configura en Supabase → Storage → Settings.
const FOMO_VIDEO_MAX = 1024 * 1024 * 1024;
const FOMO_VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];

/**
 * Sube un vídeo al bucket fomo-media bajo {userId}/{random}.{ext}, igual que
 * uploadFomoMedia con imagen/audio (la RLS exige que la primera carpeta sea
 * el uid). Valida MIME declarado y tamaño antes de tocar la red.
 */
async function uploadFomoVideo(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<{ url: string; type: "video" }> {
  // detectMime en vez de file.type en crudo: iOS a veces manda el tipo vacío
  // al compartir desde Ficheros y entonces el vídeo se rechazaba sin motivo.
  const mime = detectMime(file);
  if (!FOMO_VIDEO_MIME.includes(mime)) {
    throw new Error("Formato de vídeo no admitido (MP4, MOV o WebM)");
  }
  if (file.size > FOMO_VIDEO_MAX) {
    throw new Error("El vídeo supera 1 GB");
  }
  // El vídeo pasa tal cual; lo que aporta aquí prepareImageForUpload es dejar
  // el contentType normalizado y nunca en crudo (ver src/lib/image-upload.ts).
  const prep = await prepareImageForUpload(file);
  if (!prep.ok) throw new Error(prep.message);
  const uploaded = await uploadPrivateSocialMedia(supabase, userId, prep.blob, prep.contentType);
  return { url: uploaded.url, type: 'video' };
}

// Errores de la fase de SUBIDA: el validador de imágenes lanza códigos
// (strings) y los de audio/vídeo lanzan Error con mensaje ya en español.
// Se traducen los códigos y se respetan los mensajes propios; el resto cae
// en un genérico. Nunca se publica sin el media elegido: quien llama corta.
function friendlyUploadError(err: unknown): string {
  const code = typeof err === "string" ? err : "";
  if (code === "file_too_large") return "La imagen supera los 5MB.";
  if (code === "empty_file") return "El archivo está vacío.";
  if (
    code === "not_a_file" ||
    code === "unsupported_image_format" ||
    code === "format_not_allowed"
  ) {
    return "Formato de imagen no admitido (JPG, PNG, WebP o GIF).";
  }
  // Los mensajes propios (conversor de imagen incluido) ya vienen en español y
  // explican qué hacer; se muestran tal cual. Lo demás cae en el genérico.
  if (err instanceof Error && /supera|admitido|formato|imagen/i.test(err.message)) {
    return err.message;
  }
  return "No se pudo subir el archivo. Inténtalo de nuevo.";
}

// Convierte mensajes de error técnicos (a menudo del RPC de Postgres, en inglés)
// en copys en español para los casos previsibles.
function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  const m = raw.toLowerCase();
  if (m.includes("sesión expirada") || m.includes("jwt") || m.includes("not authenticated")) {
    return "Tu sesión ha caducado. Vuelve a entrar para publicar.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("demasiad")) {
    return "Estás publicando muy rápido. Espera un momento e inténtalo de nuevo.";
  }
  if (m.includes("empty") || m.includes("vac")) {
    return "La publicación no puede estar vacía.";
  }
  return "No se pudo publicar. Inténtalo de nuevo.";
}

function FomoComposer({
  mode,
  universityId,
  threadId,
  onCreated,
  onCancel,
  autoFocus,
  initialBody = "",
}: {
  mode: Mode;
  universityId?: string;
  threadId?: string;
  onCreated: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  initialBody?: string;
}) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const confirm = useConfirm();
  const toast = useToast();
  const [body, setBody] = useState(initialBody);
  const [anon, setAnon] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "audio" | "video" | null>(null);

  // Poll (solo en threads)
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);

  const posting = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Nombre único del grupo de radios de audiencia (puede haber varios
  // composers montados a la vez: feed + modal de publicar).
  const audienceName = useId();

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  // Foto, vídeo y audio son excluyentes: un post lleva un solo media (igual
  // que en el móvil). Elegir uno sustituye al anterior.
  function pickFile(f: File | null, kind: "image" | "audio" | "video") {
    if (preview) URL.revokeObjectURL(preview);
    if (!f) {
      setFile(null);
      setPreview(null);
      setFileKind(null);
      return;
    }
    setFile(f);
    setFileKind(kind);
    setPreview(URL.createObjectURL(f));
    if ((kind === "image" || kind === "video") && pollOpen) setPollOpen(false);
  }

  function setOpt(i: number, v: string) {
    setPollOpts((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  }
  function addOpt() {
    setPollOpts((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
  }
  function removeOpt(i: number) {
    setPollOpts((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  const hasPoll = mode === "thread" && pollOpen && pollQ.trim().length > 0;
  const cleanOpts = pollOpts.map((o) => o.trim()).filter(Boolean);
  const canSubmit =
    !submitting &&
    (body.trim().length > 0 ||
      file !== null ||
      (hasPoll && cleanOpts.length >= 2));

  async function submit() {
    if (!canSubmit || posting.current || !isCurrent()) return;
    posting.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (!user || user.id !== owner) throw new Error("Sesión expirada");
      if (!await ensureCommunityTerms(user.id, isCurrent, confirm)) return;

      let mediaUrl: string | null = null;
      let mediaType: "image" | "audio" | "video" | null = null;
      if (file) {
        // Fail-soft: si la subida falla, se corta aquí con un mensaje claro.
        // Jamás se publica el post sin el media que el usuario eligió.
        try {
          const up =
            fileKind === "video"
              ? await uploadFomoVideo(supabase, user.id, file)
              : await uploadFomoMedia(supabase, user.id, file);
          mediaUrl = up.url;
          mediaType = up.type;
        } catch (upErr) {
          if (isCurrent()) setError(friendlyUploadError(upErr));
          return;
        }
      }

      if (!isCurrent()) return;
      const {data:{session}}=await supabase.auth.getSession();
      if(!isCurrent()||session?.user.id!==user.id)return;
      let publicationId:string;
      if (mode === "thread") {
        const { data, error: e } = await supabase.rpc("create_fomo_thread", {
          p_university_id: universityId,
          p_body: body.trim() || null,
          p_media_url: mediaUrl,
          p_media_type: mediaType,
          p_is_anonymous: anon,
          p_poll_question: hasPoll ? pollQ.trim() : null,
          p_poll_options: hasPoll ? cleanOpts : null,
        }).setHeader('Authorization',`Bearer ${session.access_token}`);
        if (e) throw new Error(e.message);
        publicationId=String(data);
      } else {
        const { data, error: e } = await supabase.rpc("create_fomo_reply", {
          p_thread_id: threadId,
          p_body: body.trim() || null,
          p_media_url: mediaUrl,
          p_media_type: mediaType,
          p_is_anonymous: anon,
        }).setHeader('Authorization',`Bearer ${session.access_token}`);
        if (e) throw new Error(e.message);
        publicationId=String(data);
      }

      if (!isCurrent()) return;
      const review=await requestPublicationReview(user.id,isCurrent,publicationId);
      if(!isCurrent())return;
      if(review==='rejected'){setError('El contenido no cumple las normas de la comunidad. Revisa el mensaje antes de volver a enviarlo.');return;}
      toast.success(review==='approved'?'Publicado':'Enviado a revisión',review==='approved'?'Ya se ve en el campus.':'Se mostrará cuando supere la revisión.');
      // reset
      if (preview) URL.revokeObjectURL(preview);
      setBody("");
      if (bodyRef.current) {
        bodyRef.current.style.height = "auto";
      }
      setFile(null);
      setPreview(null);
      setFileKind(null);
      setAnon(false);
      setPollOpen(false);
      setPollQ("");
      setPollOpts(["", ""]);
      onCreated();
    } catch (err) {
      if (isCurrent()) setError(friendlyError(err));
    } finally {
      posting.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      <textarea disabled={submitting}
        ref={bodyRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value.slice(0, MAX_BODY));
          autoGrow(e.currentTarget);
        }}
        autoFocus={autoFocus}
        rows={mode === "thread" ? 3 : 2}
        aria-label={mode === "thread" ? "Escribe una publicación" : "Escribe una respuesta"}
        placeholder={
          mode === "thread"
            ? "¿Qué se cuece en tu uni?"
            : "Escribe una respuesta…"
        }
        className="w-full resize-none rounded-lg bg-transparent px-1 py-1 text-[15px] leading-relaxed text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-violet/40 placeholder:text-text-muted disabled:opacity-60"
      />
      {body.length >= MAX_BODY * 0.8 && (
        <p className="mt-1 text-right text-xs text-text-muted">
          {body.length}/{MAX_BODY}
        </p>
      )}

      {/* Media preview */}
      {preview && fileKind === "image" && (
        <div className="relative mt-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Vista previa de la imagen adjunta" className="max-h-48 rounded-xl border border-border" />
          <button disabled={submitting}
            type="button"
            onClick={() => pickFile(null, "image")}
            className="absolute -right-2 -top-2 rounded-full bg-black/70 p-1 text-white"
            aria-label="Quitar imagen"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {preview && fileKind === "audio" && (
        <div className="mt-2 flex items-center gap-2">
          <audio controls src={preview} className="h-9" />
          <button disabled={submitting}
            type="button"
            onClick={() => pickFile(null, "audio")}
            className="rounded-full bg-bg-secondary p-1.5 text-text-muted"
            aria-label="Quitar audio"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {preview && fileKind === "video" && (
        <div className="relative mt-2 inline-block">
          {/* Previsualización local del vídeo elegido, con controles nativos */}
          <video
            controls
            src={preview}
            aria-label="Vista previa del vídeo adjunto"
            className="max-h-64 max-w-full rounded-xl bg-bg-dark"
          />
          <button disabled={submitting}
            type="button"
            onClick={() => pickFile(null, "video")}
            className="absolute -right-2 -top-2 rounded-full bg-black/70 p-1 text-white"
            aria-label="Quitar vídeo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Poll builder */}
      {mode === "thread" && pollOpen && (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3 animate-scale-in">
          <input disabled={submitting}
            value={pollQ}
            onChange={(e) => setPollQ(e.target.value.slice(0, 200))}
            placeholder="Pregunta de la encuesta"
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-violet"
          />
          {pollOpts.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input disabled={submitting}
                value={o}
                onChange={(e) => setOpt(i, e.target.value.slice(0, 100))}
                placeholder={`Opción ${i + 1}`}
                className="w-full rounded-lg border border-border bg-bg-primary px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-violet"
              />
              {pollOpts.length > 2 && (
                <button disabled={submitting}
                  type="button"
                  onClick={() => removeOpt(i)}
                  aria-label={"Quitar opción " + (i + 1)}
                  className="p-2 text-text-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {pollOpts.length < 4 && (
            <button disabled={submitting}
              type="button"
              onClick={addOpt}
              className="link-underline text-xs font-semibold text-violet"
            >
              Añadir opción
            </button>
          )}
        </div>
      )}

      {/* Selector de audiencia (solo hilos): la publicación SIEMPRE sale en
          el muro FOMO del campus; lo que se elige es si va firmada. Con tu
          nombre aparece además en tu perfil y avisa a tus seguidores; en
          anónimo solo existe en el muro. Por debajo es el is_anonymous de
          siempre, contado como elección de destino, que es como lo piensa
          la gente. Radios nativos: teclado y lector de pantalla gratis. */}
      {mode === "thread" && (
        <fieldset className="mt-4 border-t border-border-light pt-3">
          <legend className="eyebrow">
            ¿Dónde se publica?
          </legend>
          <p className="mb-3 mt-1 text-xs text-text-muted">
            Todo sale en el muro FOMO de tu campus. Tú eliges cómo firmarlo.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="cursor-pointer">
              <input disabled={submitting}
                type="radio"
                name={audienceName}
                className="peer sr-only"
                checked={!anon}
                onChange={() => setAnon(false)}
              />
              <span className="flex h-full items-start gap-2.5 rounded-xl border border-border p-3 transition-colors peer-checked:border-violet peer-checked:bg-violet-50 peer-focus-visible:ring-2 peer-focus-visible:ring-violet/40">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    Con tu nombre
                  </span>
                  <span className="block text-xs leading-snug text-text-muted">
                    Aparece en tu perfil y tus seguidores la ven (les llega aviso)
                  </span>
                </span>
              </span>
            </label>
            <label className="cursor-pointer">
              <input disabled={submitting}
                type="radio"
                name={audienceName}
                className="peer sr-only"
                checked={anon}
                onChange={() => setAnon(true)}
              />
              <span className="flex h-full items-start gap-2.5 rounded-xl border border-border p-3 transition-colors peer-checked:border-violet peer-checked:bg-violet-50 peer-focus-visible:ring-2 peer-focus-visible:ring-violet/40">
                <VenetianMask className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text-primary">
                    Anónimo
                  </span>
                  <span className="block text-xs leading-snug text-text-muted">
                    Solo en el muro del campus, nunca en tu perfil
                  </span>
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {/* Toolbar */}
      <div className="mt-3 flex items-center justify-between border-t border-border-light pt-3">
        <div className="flex items-center gap-0.5">
          <button disabled={submitting}
            type="button"
            onClick={() => imgInput.current?.click()}
            className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary disabled:opacity-50"
            aria-label="Foto (hasta 5MB)"
            title="Foto (hasta 5MB)"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <button disabled={submitting}
            type="button"
            onClick={() => videoInput.current?.click()}
            className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary disabled:opacity-50"
            aria-label="Vídeo (hasta 50MB)"
            title="Vídeo (hasta 50MB)"
          >
            <VideoIcon className="h-5 w-5" />
          </button>
          <button disabled={submitting}
            type="button"
            onClick={() => audioInput.current?.click()}
            className="rounded-full p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary disabled:opacity-50"
            aria-label="Audio"
            title="Audio"
          >
            <Mic className="h-5 w-5" />
          </button>
          {mode === "thread" && (
            <button disabled={submitting}
              type="button"
              onClick={() => {
                // Al abrir la encuesta hay que quitar la foto o el vídeo
                // adjuntos (no se pueden combinar con encuesta).
                if (!pollOpen && (fileKind === "image" || fileKind === "video")) {
                  const ok = window.confirm(
                    fileKind === "image"
                      ? "Activar la encuesta quitará la imagen adjunta. ¿Continuar?"
                      : "Activar la encuesta quitará el vídeo adjunto. ¿Continuar?"
                  );
                  if (!ok) return;
                  pickFile(null, fileKind);
                }
                setPollOpen((v) => !v);
              }}
              className={`rounded-full p-2 transition-colors hover:bg-bg-secondary disabled:opacity-50 ${
                pollOpen ? "bg-violet-50 text-violet" : "text-text-muted hover:text-text-primary"
              }`}
              aria-label="Encuesta"
              title="Encuesta"
            >
              <BarChart3 className="h-5 w-5" />
            </button>
          )}
          {/* En respuestas se mantiene el toggle compacto de siempre; en
              hilos la elección vive en el selector grande de arriba. */}
          {mode === "reply" && (
            <button disabled={submitting}
              type="button"
              onClick={() => setAnon((v) => !v)}
              aria-pressed={anon}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${
                anon
                  ? "bg-violet-50 text-violet-deep"
                  : "text-text-muted hover:bg-bg-secondary hover:text-text-primary"
              }`}
              title="Publicar de forma anónima"
            >
              <VenetianMask className="h-4 w-4" />
              {anon ? "Anónimo" : "Con mi nombre"}
            </button>
          )}
          <input disabled={submitting}
            ref={imgInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) pickFile(f, "image");
              e.target.value = "";
            }}
          />
          <input disabled={submitting}
            ref={audioInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) pickFile(f, "audio");
              e.target.value = "";
            }}
          />
          <input disabled={submitting}
            ref={videoInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) pickFile(f, "video");
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            variant="dark"
            size="sm"
            onClick={submit}
            disabled={submitting || (!canSubmit)}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {mode === "thread" ? "Publicar" : "Responder"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default withAccountScope(FomoComposer);
