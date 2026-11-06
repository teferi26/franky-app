"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";

// Lista de espera (migración 136, mejora 71): cuando el evento está agotado,
// el usuario puede pedir que se le avise si queda sitio. Mismo comportamiento
// que la app móvil (insert/delete en event_waitlist, RLS por usuario).
export default function EventWaitlist({
  eventId,
  isLoggedIn,
  initialJoined,
}: {
  eventId: string;
  isLoggedIn: boolean;
  // Calculado en servidor: si el usuario ya está apuntado a la lista.
  initialJoined: boolean;
}) {
  const [joined, setJoined] = useState(initialJoined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Inicia sesión para apuntarte a la lista de espera.");
        return;
      }
      const { error: insErr } = await supabase
        .from("event_waitlist")
        .insert({ event_id: eventId, user_id: user.id });
      // Si ya estaba apuntado (clave duplicada), lo tratamos como éxito.
      if (insErr && insErr.code !== "23505") {
        setError("No se pudo apuntar. Inténtalo de nuevo en unos segundos.");
        return;
      }
      setJoined(true);
    } catch {
      setError("No se pudo apuntar. Inténtalo de nuevo en unos segundos.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error: delErr } = await supabase
        .from("event_waitlist")
        .delete()
        .match({ event_id: eventId, user_id: user.id });
      if (delErr) {
        setError("No se pudo salir. Inténtalo de nuevo en unos segundos.");
        return;
      }
      setJoined(false);
    } catch {
      setError("No se pudo salir. Inténtalo de nuevo en unos segundos.");
    } finally {
      setBusy(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-bg-secondary/60 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BellRing className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
          Aforo completo por ahora
        </p>
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link href={`/login?next=/eventos/${eventId}`}>
            <LogIn className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Inicia sesión para la lista de espera
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-bg-secondary/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <BellRing className="h-4 w-4 text-violet" strokeWidth={1.75} aria-hidden="true" />
        {joined ? "Estás en la lista de espera" : "Aforo completo por ahora"}
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        {joined
          ? "Te avisaremos si se libera una plaza."
          : "Apúntate y te avisamos si queda sitio."}
      </p>
      {error && <p role="alert" className="mt-2 text-xs font-medium text-error">{error}</p>}
      <Button
        size="sm"
        variant={joined ? "outline" : "default"}
        onClick={joined ? leave : join}
        loading={busy}
        className="mt-3 w-full"
      >
        {busy ? (
          "Un momento"
        ) : joined ? (
          "Salir de la lista"
        ) : (
          "Avísame si queda sitio"
        )}
      </Button>
    </div>
  );
}
