"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  X,
  UserPlus,
  Check,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { useAccountGuard } from "@/components/AccountScope";

interface Contact {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function LigarInvite({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const action = useRef(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);

  // Cierre con Escape, foco inicial al diálogo y restauración del foco al cerrar.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    setLoading(true);
    const { data, error: e } = await supabase.rpc("get_ligar_nominatable");
    if (!isCurrent()) return;
    if (e) setError(e.message);
    else setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }, [supabase, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = useCallback(async (c: Contact) => {
    if (action.current || !isCurrent()) return;
    action.current = true; setSending(c.id); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner) return;
      const { error: e } = await supabase.rpc("nominate_friend", { p_nominee: c.id });
      if (!isCurrent()) return;
      if (e) throw e;
      setSent(prev => new Set(prev).add(c.id));
    } catch { if (isCurrent()) setError("No se pudo enviar la invitación. Vuelve a intentarlo."); }
    finally { action.current = false; if (isCurrent()) setSending(null); }
  }, [supabase, owner, isCurrent]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg-dark/60 animate-fade-in sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ligar-invite-title"
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-bg-primary shadow-float outline-none animate-sheet-in sm:animate-scale-in sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-border-light p-4">
          <h3
            id="ligar-invite-title"
            className="flex items-center gap-2 font-heading text-base font-bold text-text-primary"
          >
            <UserPlus className="h-5 w-5 text-violet" aria-hidden="true" /> Invitar a un amigo
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border-light bg-bg-secondary/60 px-4 py-3">
          <p className="flex items-start gap-2 text-xs text-text-secondary">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
            Le llegará una invitación anónima. Tú no le activas nada: solo entra
            si quiere. Cero presión.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-text-muted">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-10 text-center">
              <Heart className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
              <p className="mt-4 font-heading text-base font-bold text-text-primary">
                No hay nadie a quien invitar
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Solo puedes invitar a contactos con los que ya chateas, que sean
                mayores de 18 y que aún no estén en Crush.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {contacts.map((c) => {
                const done = sent.has(c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:border-text-primary/15"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-secondary">
                      {c.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.avatar_url}
                          alt={c.full_name ?? "Contacto"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-text-muted">
                          <Heart className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                      {c.full_name ?? "Contacto"}
                    </span>
                    <button
                      type="button"
                      onClick={() => invite(c)}
                      disabled={done || sending === c.id}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        done
                          ? "border-transparent bg-emerald-50 text-emerald-700"
                          : "border-border bg-bg-primary text-text-primary hover:border-text-primary/30 hover:bg-bg-secondary"
                      } disabled:opacity-70`}
                    >
                      {sending === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : done ? (
                        <>
                          <Check className="h-4 w-4" /> Invitado
                        </>
                      ) : (
                        "Invitar"
                      )}
                    </button>
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
