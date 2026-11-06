"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ImagePlus, X, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { trackFire } from "@/lib/analytics";

/**
 * Alta de un anuncio del mercado (migración 137). La universidad la hereda sola
 * el trigger del autor, así que no se manda. La foto (opcional) sube por
 * /api/marketplace/upload y su URL va en image_url.
 */
const KINDS = [
  { value: "venta", label: "Vendo algo" },
  { value: "busco", label: "Busco algo" },
  { value: "ofrezco", label: "Ofrezco un servicio" },
] as const;

const CATEGORIES = [
  "libros",
  "muebles",
  "transporte",
  "clases",
  "vivienda",
  "otros",
] as const;

export default function CrearAnuncioClient() {
  const router = useRouter();
  const { user, loading } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("venta");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("libros");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }
  if (!user) {
    router.replace("/login?next=%2Fmercado%2Fcrear");
    return null;
  }

  const pickImage = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/marketplace/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "No se pudo subir la imagen.");
      } else {
        setImageUrl(data.url);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = title.trim();
    if (trimmed.length < 3) return setError("El título es demasiado corto.");

    // Precio: se acepta coma decimal; "gratis" es 0; vacío es "a convenir".
    let priceCents: number | null = null;
    if (price.trim() !== "") {
      const n = Number(price.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return setError("El precio no es válido.");
      priceCents = Math.round(n * 100);
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from("student_listings")
      .insert({
        author_id: user.id,
        kind,
        category,
        title: trimmed,
        body: body.trim() || null,
        price_cents: priceCents,
        image_url: imageUrl,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insErr) {
      setError("No se pudo publicar. Inténtalo de nuevo.");
      return;
    }
    trackFire("cta_clicked", { action: "marketplace_listing_created", kind });
    router.push(`/mercado/${data.id}`);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Tipo */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">¿Qué quieres hacer?</label>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                kind === k.value
                  ? "border-text-primary bg-text-primary text-bg-primary"
                  : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/30 hover:text-text-primary"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Categoría */}
      <div>
        <label htmlFor="cat" className="mb-1.5 block text-sm font-medium">
          Categoría
        </label>
        <select
          id="cat"
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
          className="w-full h-11 rounded-xl border border-border bg-bg-primary px-4 text-sm text-text-primary capitalize transition-[border-color,box-shadow] duration-150 focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/30"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Título */}
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
          Título
        </label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          placeholder="Ej: Cálculo I de Ingeniería, poco usado"
        />
      </div>

      {/* Precio */}
      <div>
        <label htmlFor="price" className="mb-1.5 block text-sm font-medium">
          Precio en euros <span className="font-normal text-text-muted">(déjalo vacío si es a convenir)</span>
        </label>
        <Input
          id="price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="15"
          className="w-40"
        />
      </div>

      {/* Descripción */}
      <div>
        <label htmlFor="body" className="mb-1.5 block text-sm font-medium">
          Descripción <span className="font-normal text-text-muted">(opcional)</span>
        </label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Estado, detalles, punto de entrega…"
          
        />
      </div>

      {/* Imagen */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Foto <span className="font-normal text-text-muted">(opcional)</span>
        </label>
        {imageUrl ? (
          <div className="relative inline-block">
            <Image
              src={imageUrl}
              alt="Vista previa"
              width={160}
              height={160}
              className="h-40 w-40 rounded-xl object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              aria-label="Quitar foto"
              className="absolute -right-2 -top-2 rounded-full bg-bg-primary p-1 shadow-md"
            >
              <X className="h-4 w-4 text-text-muted" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={pickImage}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border bg-bg-primary px-5 py-3 text-sm font-medium text-text-muted transition-colors hover:border-violet hover:text-violet disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {uploading ? "Subiendo…" : "Añadir foto"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFile}
          className="hidden"
        />
      </div>

      {/* Botón del sistema: el spinner y el bloqueo del doble envío ya vienen
          en `loading`, no hay que montarlos a mano en cada formulario. */}
      <Button type="submit" size="lg" loading={saving} disabled={uploading}>
        Publicar anuncio
      </Button>
    </form>
  );
}
