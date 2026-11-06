"use client";

import { useRef, useState } from "react";
import { Pencil, Save, X, ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface LeisureSpotData {
  id: string;
  name: string;
  description: string | null;
  category: string;
  city: string;
  comunidad_autonoma: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  price_range: number | null;
  rating: number | null;
  image_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  google_maps_url: string | null;
  tags: string[] | null;
  is_verified: boolean | null;
}

// Etiquetas sin emojis: el sistema v3 no usa emoji como icono.
const CATEGORIES = [
  { value: "bar", label: "Bares y tapas" },
  { value: "restaurante", label: "Restaurantes" },
  { value: "cafeteria", label: "Cafeterías" },
  { value: "discoteca", label: "Discotecas" },
  { value: "parque", label: "Parques y aire libre" },
  { value: "cultural", label: "Cultura y museos" },
  { value: "deportivo", label: "Deportes" },
  { value: "coworking", label: "Coworking y estudio" },
  { value: "pub", label: "Pubs" },
];

const PRICE_OPTIONS = [
  { value: "0", label: "Gratis" },
  { value: "1", label: "€" },
  { value: "2", label: "€€" },
  { value: "3", label: "€€€" },
  { value: "4", label: "€€€€" },
];

// Un select nativo con el mismo acabado que Input: alto, borde hairline y foco
// violeta. Se estiliza aquí porque el sistema no tiene componente de select.
const SELECT_CLASS = cn(
  "flex h-11 w-full appearance-none rounded-xl border border-border bg-bg-primary px-3.5 py-2 text-[15px] text-text-primary",
  "transition-[border-color,box-shadow] duration-200 hover:border-text-primary/20",
  "focus:border-violet focus:outline-none focus:ring-[3px] focus:ring-violet/15"
);

export default function AdminEditLeisureButton({ spot }: { spot: LeisureSpotData }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: spot.name || "",
    description: spot.description || "",
    category: spot.category || "bar",
    city: spot.city || "",
    comunidad_autonoma: spot.comunidad_autonoma || "",
    address: spot.address || "",
    latitude: spot.latitude?.toString() || "",
    longitude: spot.longitude?.toString() || "",
    price_range: (spot.price_range ?? 0).toString(),
    rating: spot.rating?.toString() || "",
    image_url: spot.image_url || "",
    website: spot.website || "",
    phone: spot.phone || "",
    email: spot.email || "",
    instagram: spot.instagram || "",
    google_maps_url: spot.google_maps_url || "",
    tags: (spot.tags || []).join(", "),
    is_verified: spot.is_verified ?? false,
  });
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Sube la foto al bucket público de contenido (vía la ruta admin, que valida
  // rol + magic-bytes) y guarda la URL resultante en image_url. Así el admin no
  // está obligado a pegar un enlace externo.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "leisure");
      const res = await fetch("/api/admin/upload-image", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error || "No se pudo subir la imagen");
      } else {
        setForm((f) => ({ ...f, image_url: json.url as string }));
      }
    } catch {
      setError("Error de red al subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const { error: updateError } = await supabase
      .from("leisure_spots")
      .update({
        name: form.name,
        description: form.description || null,
        category: form.category,
        city: form.city,
        comunidad_autonoma: form.comunidad_autonoma || null,
        address: form.address || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        price_range: form.price_range ? parseInt(form.price_range) : null,
        rating: form.rating ? parseFloat(form.rating) : null,
        image_url: form.image_url || null,
        website: form.website || null,
        phone: form.phone || null,
        email: form.email || null,
        instagram: form.instagram || null,
        google_maps_url: form.google_maps_url || null,
        tags,
        is_verified: form.is_verified,
      })
      .eq("id", spot.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  };

  if (!editing) {
    return (
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Editar zona de ocio
      </Button>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-bg-primary p-6 shadow-card">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-violet">Solo administración</p>
          <h3 className="mt-1 font-heading text-lg font-bold text-text-primary">Editar zona de ocio</h3>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(false)} aria-label="Cerrar edición">
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="ocio-nombre" label="Nombre" className="sm:col-span-2">
          <Input id="ocio-nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field id="ocio-desc" label="Descripción" className="sm:col-span-2">
          <Textarea
            id="ocio-desc"
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <Field id="ocio-categoria" label="Categoría">
          <select
            id="ocio-categoria"
            className={SELECT_CLASS}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ocio-precio" label="Nivel de precio">
          <select
            id="ocio-precio"
            className={SELECT_CLASS}
            value={form.price_range}
            onChange={(e) => setForm({ ...form, price_range: e.target.value })}
          >
            {PRICE_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ocio-ciudad" label="Ciudad">
          <Input id="ocio-ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field id="ocio-ccaa" label="Comunidad autónoma">
          <Input
            id="ocio-ccaa"
            value={form.comunidad_autonoma}
            onChange={(e) => setForm({ ...form, comunidad_autonoma: e.target.value })}
          />
        </Field>
        <Field id="ocio-direccion" label="Dirección" className="sm:col-span-2">
          <Input id="ocio-direccion" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field id="ocio-lat" label="Latitud">
          <Input
            id="ocio-lat"
            type="number"
            step="any"
            className="tabular"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: e.target.value })}
          />
        </Field>
        <Field id="ocio-lng" label="Longitud">
          <Input
            id="ocio-lng"
            type="number"
            step="any"
            className="tabular"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: e.target.value })}
          />
        </Field>
        <Field id="ocio-rating" label="Valoración" hint="De 0 a 5">
          <Input
            id="ocio-rating"
            type="number"
            step="0.1"
            min="0"
            max="5"
            className="tabular"
            value={form.rating}
            onChange={(e) => setForm({ ...form, rating: e.target.value })}
          />
        </Field>
        <Field id="ocio-tel" label="Teléfono">
          <Input id="ocio-tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>

        <div className="space-y-3 sm:col-span-2">
          <p className="block text-[13px] font-semibold tracking-tight text-text-primary">Imagen</p>
          {form.image_url && (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt="Vista previa"
                className="h-20 w-28 rounded-xl border border-border bg-bg-secondary object-cover"
              />
              <Button variant="ghost" size="sm" type="button" onClick={() => setForm({ ...form, image_url: "" })}>
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                Quitar imagen
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              type="button"
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {!uploading && <ImagePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              {form.image_url ? "Cambiar foto" : "Subir foto"}
            </Button>
            <span className="text-xs text-text-muted">JPG, PNG, WebP o GIF · máx. 8 MB</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Input
            aria-label="Enlace de imagen"
            placeholder="…o pega un enlace de imagen (opcional)"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
          />
        </div>

        <Field id="ocio-web" label="Web">
          <Input id="ocio-web" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </Field>
        <Field id="ocio-email" label="Email">
          <Input id="ocio-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field id="ocio-ig" label="Instagram">
          <Input id="ocio-ig" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
        </Field>
        <Field id="ocio-maps" label="URL de Google Maps">
          <Input
            id="ocio-maps"
            value={form.google_maps_url}
            onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })}
          />
        </Field>
        <Field id="ocio-tags" label="Etiquetas" hint="Separadas por comas" className="sm:col-span-2">
          <Input id="ocio-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        </Field>

        <div className="flex items-center gap-2.5 sm:col-span-2">
          <input
            id="is_verified"
            type="checkbox"
            checked={form.is_verified}
            onChange={(e) => setForm({ ...form, is_verified: e.target.checked })}
            className="h-4 w-4 rounded border-border text-violet focus:ring-violet/30"
          />
          <label htmlFor="is_verified" className="text-sm text-text-secondary">
            Verificado (visible en listados)
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 text-sm font-medium text-error">
          No se pudo guardar: {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3 border-t border-border-light pt-5">
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <Button onClick={handleSave} loading={saving}>
          {!saving && <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
