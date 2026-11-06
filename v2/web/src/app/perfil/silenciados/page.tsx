"use client";

// ─── Cuentas silenciadas ─────────────────────────────────────────────────
// Lista de quién has silenciado (tabla muted_users, migración 134). A
// diferencia de bloquear, silenciar es privado y ASIMETRICO: la otra persona
// nunca se entera de que la has silenciado ni de que dejas de hacerlo; solo
// tú ves esta lista (RLS: muter_id = auth.uid()). No hay RPC dedicada: SELECT
// directo a muted_users y los perfiles se resuelven con public_profiles.
// Fail-soft: si la tabla aún no existe en producción, estado vacío.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, VolumeX } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export const dynamic = "force-dynamic";

type Muted = { id: string; full_name: string | null; avatar_url: string | null };

function initialOf(name: string | null) {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}

export default function SilenciadosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<Muted[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/login?next=/perfil/silenciados");
      return;
    }
    try {
      // 1. Filas propias (la RLS ya filtra por muter_id = auth.uid()).
      const { data: mutes, error: e } = await supabase
        .from("muted_users")
        .select("muted_id, created_at")
        .eq("muter_id", user.id)
        .order("created_at", { ascending: false });
      if (e) throw e;
      const ids = (mutes ?? []).map((m) => m.muted_id as string);
      if (ids.length === 0) {
        setPeople([]);
        setLoading(false);
        return;
      }
      // 2. Nombre y foto desde la vista pública (legible por autenticados).
      const { data: profs } = await supabase
        .from("public_profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      const byId = new Map((profs ?? []).map((p) => [p.id as string, p as Muted]));
      // Conservamos el orden (más reciente primero) aunque un perfil no resuelva.
      setPeople(ids.map((id) => byId.get(id) ?? { id, full_name: null, avatar_url: null }));
    } catch {
      // Migración 134 sin aplicar todavía: como si no hubiera nadie.
      setPeople([]);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const unmute = async (person: Muted) => {
    if (busyId) return;
    setError("");
    setBusyId(person.id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusyId(null);
      return;
    }
    const { error: e } = await supabase
      .from("muted_users")
      .delete()
      .eq("muter_id", user.id)
      .eq("muted_id", person.id);
    setBusyId(null);
    if (e) {
      setError("No se pudo completar. Inténtalo de nuevo en unos segundos.");
      return;
    }
    // Optimista: fuera de la lista al instante.
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <section className="border-b border-border-light">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <Link
            href="/perfil"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Mi perfil
          </Link>
          <p className="eyebrow mt-6">Mi cuenta</p>
          <h1 className="mt-3 text-fluid-h1 font-extrabold text-text-primary">
            Cuentas silenciadas
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
            Silenciar es privado: estas personas no saben que las has silenciado,
            ni se enteran si dejas de hacerlo. A diferencia de bloquear, seguís
            pudiendo veros y escribiros con normalidad.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
          {error && (
            <p className="px-5 pt-4 text-sm text-error">{error}</p>
          )}
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet mx-auto" />
            </div>
          ) : people.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <VolumeX className="h-8 w-8 text-text-muted mx-auto mb-2" />
              <p className="font-heading text-lg font-extrabold text-text-primary">No has silenciado a nadie</p>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
                Cuando silencies a alguien desde su perfil, aparecerá aquí para
                que puedas dejar de silenciarle.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-light">
              {people.map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-bg-secondary">
                  <Link
                    href={`/perfil/${person.id}`}
                    className="flex items-center gap-3 flex-1 min-w-0 group"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-bg-secondary">
                      {person.avatar_url ? (
                        <Image
                          src={person.avatar_url}
                          alt=""
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="font-heading text-sm font-extrabold text-text-primary">
                          {initialOf(person.full_name)}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-violet">
                      {person.full_name ?? "Estudiante"}
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={busyId === person.id}
                    onClick={() => unmute(person)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary disabled:opacity-50"
                  >
                    {busyId === person.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Dejar de silenciar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
