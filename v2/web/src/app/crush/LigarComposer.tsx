"use client";

import { useRef, useState } from "react";
import {
  ImagePlus,
  Loader2,
  X,
  Eye,
  EyeOff,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ensureCommunityTerms } from '@/lib/community-terms-client';
import { requestPublicationReview } from '@/lib/publication-review-client';
import { useToast } from '@/components/ui/toast';
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";
import { isImageFile, detectMime } from "@/lib/image-upload";
import {
  uploadLigarMedia,
  LIGAR_AUDIO_MAX,
  LIGAR_VIDEO_MAX,
  LIGAR_AUDIO_MIME,
  LIGAR_VIDEO_MIME,
  type LigarMediaKind,
} from "./uploadLigarMedia";
import type { LigarAudience } from "./types";

const AUDIENCE_OPTIONS: { value: LigarAudience; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "mujer", label: "Chicas" },
  { value: "hombre", label: "Chicos" },
];

function LigarComposer({
  onCreated,
  onCancel,
  initialBody = "",
}: {
  onCreated: () => void;
  onCancel: () => void;
  initialBody?: string;
}) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [body, setBody] = useState(initialBody);
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState<LigarAudience>("todos");
  const [anon, setAnon] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<LigarMediaKind | null>(null);
  const posting = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!f) {
      setFile(null);
      setPreview(null);
      setMediaKind(null);
      return;
    }
    // detectMime en vez de f.type en crudo: iOS manda el tipo vacío al
    // compartir desde Ficheros y todo caía en "imagen".
    const mime = detectMime(f);
    const kind: LigarMediaKind = mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("video/")
        ? "video"
        : "image";

    // Validar tipo y tamaño aquí para no fallar al final del flujo
    if (kind === "audio") {
      if (!LIGAR_AUDIO_MIME.includes(mime)) {
        setError("Formato de audio no admitido");
        return;
      }
      if (f.size > LIGAR_AUDIO_MAX) {
        setError("El audio supera los 10MB");
        return;
      }
    } else if (kind === "video") {
      if (!LIGAR_VIDEO_MIME.includes(mime)) {
        setError("Formato de vídeo no admitido");
        return;
      }
      if (f.size > LIGAR_VIDEO_MAX) {
        setError("El vídeo supera los 50MB");
        return;
      }
    } else {
      if (!isImageFile(f)) {
        setError("Formato de archivo no admitido");
        return;
      }
      // El peso NO se mira aquí: la imagen se convierte a JPEG al subirla (una
      // foto del móvil baja muchísimo) y el tope de 5MB se aplica ya sobre el
      // resultado, dentro de uploadLigarMedia.
    }

    setFile(f);
    setMediaKind(kind);
    setPreview(URL.createObjectURL(f));
  }

  // Auto-crecimiento del textarea hasta un máximo (evita scroll interno en móvil)
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }

  const canSubmit =
    !submitting && (body.trim().length > 0 || offer.trim().length > 0 || !!file);

  async function submit() {
    if (!canSubmit || posting.current || !isCurrent()) return;
    posting.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent()) return;
      if (!user || user.id !== owner) throw new Error("Sesión expirada");
      if (!await ensureCommunityTerms(user.id, isCurrent, confirm)) return;
      let mediaUrl: string | null = null;
      let mediaType: LigarMediaKind | null = null;
      if (file) {
        const uploaded = await uploadLigarMedia(supabase, user.id, file);
        mediaUrl = uploaded.url;
        mediaType = uploaded.type;
      }

      if (!isCurrent()) return;
      const {data:{session}}=await supabase.auth.getSession();
      if(!isCurrent()||session?.user.id!==user.id)return;
      const { data, error: e } = await supabase.rpc("create_ligar_post", {
        p_body: body.trim() || null,
        p_offer: offer.trim() || null,
        p_media_url: mediaUrl,
        p_media_type: mediaType,
        p_audience: audience,
        p_is_anonymous: anon,
      }).setHeader('Authorization',`Bearer ${session.access_token}`);
      if (!isCurrent()) return;
      if (e) throw new Error(e.message);
      const review=await requestPublicationReview(user.id,isCurrent,typeof data==='string'?data:String(data?.id));
      if(!isCurrent())return;
      if(review==='rejected'){setError('El contenido no cumple las normas de la comunidad. Revisa el mensaje antes de volver a enviarlo.');return;}
      toast.success(review==='approved'?'Publicado':'Enviado a revisión',review==='approved'?'Ya se ve en el campus.':'Se mostrará cuando supere la revisión.');

      if (preview) URL.revokeObjectURL(preview);
      onCreated();
    } catch (err) {
      if (!isCurrent()) return;
      // El validador de imágenes lanza códigos (strings); el conversor y el
      // resto lanzan Error con el mensaje ya en español y listo para enseñar.
      const msg =
        typeof err === "string"
          ? err === "file_too_large"
            ? "La imagen supera los 5MB"
            : "Formato de imagen no admitido (JPG, PNG, WebP o GIF)"
          : err instanceof Error
            ? err.message
            : "No se pudo publicar";
      setError(msg);
    } finally {
      posting.current = false;
      if (isCurrent()) setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-base font-bold text-text-primary">Publicar en el muro</h3>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
          aria-label="Cancelar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <label htmlFor="ligar-body" className="text-xs font-semibold text-text-muted">
        ¿Quién te gusta? Descríbelo/a
      </label>
      <textarea disabled={submitting}
        id="ligar-body"
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        onInput={(e) => autoGrow(e.currentTarget)}
        rows={3}
        maxLength={1000}
        placeholder="La chica de la 3ª fila de la biblioteca con sudadera roja…"
        className="mt-1 w-full resize-none rounded-xl border border-border bg-bg-primary p-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-violet focus:ring-2 focus:ring-violet/20"
      />
      <p className="mt-1 text-right text-[11px] text-text-muted">{body.length}/1000</p>

      <label htmlFor="ligar-offer" className="mt-3 block text-xs font-semibold text-text-muted">
        ¿Qué aportas tú?
      </label>
      <textarea disabled={submitting}
        id="ligar-offer"
        value={offer}
        onChange={(e) => setOffer(e.target.value.slice(0, 1000))}
        onInput={(e) => autoGrow(e.currentTarget)}
        rows={2}
        maxLength={1000}
        placeholder="Buenas conversaciones, café de verdad y memes a las 3am…"
        className="mt-1 w-full resize-none rounded-xl border border-border bg-bg-primary p-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-violet focus:ring-2 focus:ring-violet/20"
      />
      <p className="mt-1 text-right text-[11px] text-text-muted">{offer.length}/1000</p>

      {/* Preview de media */}
      {preview && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-border">
          <button disabled={submitting}
            type="button"
            onClick={() => pickFile(null)}
            className="absolute right-2 top-2 z-10 rounded-full bg-black/60 p-1 text-white"
            aria-label="Quitar archivo"
          >
            <X className="h-4 w-4" />
          </button>
          {mediaKind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="max-h-72 w-full object-cover" />
          )}
          {mediaKind === "video" && (
            <video src={preview} controls className="max-h-72 w-full" />
          )}
          {mediaKind === "audio" && (
            <audio src={preview} controls className="w-full p-3" />
          )}
        </div>
      )}

      <input disabled={submitting}
        ref={fileRef}
        type="file"
        // Lista explícita de imagen en vez de image/*: con image/* iOS entrega
        // la foto en HEIC tal cual (y el Storage la rechaza), mientras que
        // enumerando los formatos el propio iPhone la convierte al elegirla.
        accept="image/jpeg,image/png,image/webp,image/gif,audio/*,video/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* Audiencia */}
      <div className="mt-4">
        <p className="text-xs font-semibold text-text-muted">¿A quién quieres que le aparezca?</p>
        <div className="mt-1.5 flex gap-1 rounded-xl bg-bg-secondary p-1">
          {AUDIENCE_OPTIONS.map((o) => (
            <button disabled={submitting}
              key={o.value}
              type="button"
              aria-pressed={audience === o.value}
              onClick={() => setAudience(o.value)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-[color,background-color,box-shadow] duration-200 ${
                audience === o.value
                  ? "bg-bg-primary font-semibold text-text-primary shadow-[0_1px_2px_rgba(18,16,25,0.08),0_0_0_1px_rgba(18,16,25,0.04)]"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          Si eliges Chicas o Chicos, tu post solo le aparece a ese género. Con Todos lo ve cualquier persona (incluidas las que no se identifican como chica ni chico).
        </p>
      </div>

      {error && (
        <p role="alert" aria-live="assertive" className="mt-3 text-sm text-error">
          {error}
        </p>
      )}

      {/* Acciones */}
      <div className="mt-4 flex items-center gap-2">
        <button disabled={submitting}
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4 text-violet" aria-hidden="true" /> Archivo
        </button>
        <button disabled={submitting}
          type="button"
          onClick={() => setAnon((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
            anon
              ? "border-violet bg-violet-50 text-violet-deep"
              : "border-border text-text-muted hover:border-text-primary/30 hover:text-text-primary"
          }`}
        >
          {anon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {anon ? "Anónimo" : "Público"}
        </button>

        <Button
          type="button"
          variant="dark"
          size="sm"
          onClick={submit}
          disabled={submitting || (!canSubmit)}
          className="ml-auto"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4" /> Publicar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default withAccountScope(LigarComposer);
