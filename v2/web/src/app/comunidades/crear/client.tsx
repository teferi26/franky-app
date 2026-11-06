"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useSession } from "@/components/SessionProvider";
import { trackFire } from "@/lib/analytics";
import { ensureCommunityTerms } from '@/lib/community-terms-client';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAccountGuard, withAccountScope } from '@/components/AccountScope';

// Los CUATRO valores que admite la base de datos. El CHECK de la migración 138
// (`communities_kind_check`) solo acepta carrera/residencia/estudio/aficion, así
// que las opciones "Deporte" y "Otras" que había aquí hacían fallar el insert
// con una violación de restricción y el formulario solo decía "No se pudo
// crear". Es la misma lista que usa la app (mobile/src/lib/communities.ts).
const KINDS = [
  { value: "carrera", label: "Carrera" },
  { value: "residencia", label: "Residencia" },
  { value: "estudio", label: "Estudio" },
  { value: "aficion", label: "Afición" },
] as const;

/**
 * Alta de comunidad (migración 138). La universidad la hereda el trigger del
 * creador y este entra como admin. Igual que en móvil.
 */
function CrearComunidadClient() {
  const { isCurrent } = useAccountGuard();
  const confirm = useConfirm();
  const router = useRouter();
  const { user, loading } = useSession();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("estudio");
  const [isPrivate, setIsPrivate] = useState(false);
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
    router.replace("/login?next=%2Fcomunidades%2Fcrear");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < 3) return setError("El nombre debe tener al menos 3 letras.");
    try { if (!await ensureCommunityTerms(user.id, isCurrent, confirm)) return; }
    catch { setError('No se pudieron comprobar las normas. Inténtalo de nuevo.'); return; }

    setSaving(true);
    const supabase = createClient();
    const { data, error: insErr } = await supabase
      .from("communities")
      .insert({
        created_by: user.id,
        name: trimmed,
        description: description.trim() || null,
        kind,
        is_private: isPrivate,
      })
      .select("id")
      .single();

    setSaving(false);
    if (insErr) {
      // El motivo se enseña: un "No se pudo crear" a secas ocultó durante
      // semanas que el CHECK de `kind` rechazaba dos de las opciones.
      console.error("[comunidades/crear] insert", insErr);
      setError(`No se pudo crear. Inténtalo de nuevo. (${insErr.message})`);
      return;
    }
    trackFire("cta_clicked", { action: "community_created", kind });
    router.push(`/comunidades/${data.id}`);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <div>
        <label htmlFor="c-name" className="mb-1.5 block text-sm font-medium">
          Nombre
        </label>
        <Input
          id="c-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          placeholder="Ej: Fotografía UA"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Tipo</label>
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

      <div>
        <label htmlFor="c-desc" className="mb-1.5 block text-sm font-medium">
          Descripción <span className="font-normal text-text-muted">(opcional)</span>
        </label>
        <Textarea
          id="c-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="¿De qué va esta comunidad?"
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border border-border bg-bg-primary p-4 transition-colors hover:border-text-primary/15">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="h-4 w-4 accent-violet"
        />
        <span className="text-sm">
          <span className="font-medium">Privada</span>
          <span className="block text-xs text-text-muted">
            Solo los miembros ven las publicaciones.
          </span>
        </span>
      </label>

      <Button type="submit" size="lg" loading={saving}>
        Crear comunidad
      </Button>
    </form>
  );
}
export default withAccountScope(CrearComunidadClient);
