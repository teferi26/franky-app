"use client";

// ─── Cuentas bloqueadas (cliente) ────────────────────────────────────────
// Lista de quién has bloqueado (tabla user_blocks, migración 017). Es la
// misma tabla que usan el chat, Crush Live y los feeds sociales para ocultar
// a esa persona, así que desbloquear aquí la devuelve a todos esos sitios de
// golpe. No hay RPC dedicada: SELECT directo (RLS "Users manage own blocks":
// blocker_id = auth.uid()) y los perfiles se resuelven con public_profiles.
// Desbloquear = DELETE de la fila; la misma política lo permite.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { listBlockedProfiles, unblockUser, type BlockedProfile } from "@/lib/user-blocks";

function initialOf(name: string | null) {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}

export default function BloqueadosClient({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<BlockedProfile[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      setPeople(await listBlockedProfiles(supabase, userId));
    } catch {
      // Sin acceso a la tabla (RLS o entorno sin migración): como si no
      // hubiera nadie, en vez de una pantalla rota.
      setPeople([]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const unblock = async (person: BlockedProfile) => {
    if (busyId) return;
    setError("");
    setBusyId(person.id);
    const supabase = createClient();
    const ok = await unblockUser(supabase, userId, person.id);
    setBusyId(null);
    setConfirmId(null);
    if (!ok) {
      setError("No se pudo desbloquear. Inténtalo de nuevo en unos segundos.");
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
            Cuentas bloqueadas
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
            Las personas bloqueadas no pueden verte ni escribirte, y vuestros
            chats desaparecen para las dos. Puedes desbloquear a quien quieras
            cuando quieras.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-4 pb-20 pt-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
          {error && (
            <p role="alert" className="px-5 pt-4 text-sm text-error">{error}</p>
          )}
          {loading ? (
            <div className="py-12 text-center" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-violet mx-auto" />
              <span className="sr-only">Cargando</span>
            </div>
          ) : people.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <ShieldOff className="h-8 w-8 text-text-muted mx-auto mb-2" />
              <p className="font-heading text-lg font-extrabold text-text-primary">No has bloqueado a nadie</p>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-text-muted">
                Cuando bloquees a alguien desde su perfil o desde un chat,
                aparecerá aquí para que puedas desbloquearle.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-light">
              {people.map((person) => {
                const confirming = confirmId === person.id;
                const busy = busyId === person.id;
                return (
                  <li key={person.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-bg-secondary">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
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
                      {/* Sin enlace al perfil a propósito: un perfil bloqueado
                          no debería invitar a volver a él. */}
                      <span className="truncate text-sm font-semibold text-text-primary">
                        {person.full_name ?? "Estudiante"}
                      </span>
                    </div>
                    {confirming ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmId(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => unblock(person)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-deep disabled:opacity-50"
                        >
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Sí, desbloquear
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={() => setConfirmId(person.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-text-primary/30 hover:bg-bg-secondary disabled:opacity-50"
                      >
                        Desbloquear
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
