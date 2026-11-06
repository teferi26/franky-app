"use client";

// ─── Botón de Seguir de la columna de descubrimiento ──────────────────────
// La única pieza interactiva de HomeSidebarRight, y por eso vive en su propio
// fichero de cliente: así el resto de la columna sigue siendo Server Component
// y no arrastra JavaScript a la home.
//
// Modelo de follow: unidireccional, como Instagram (migración 123). Seguir es
// un INSERT en `follows` y dejar de seguir un DELETE; la RLS ya obliga a que
// follower_id sea auth.uid(), así que el peor caso de un cliente manipulado es
// un error, nunca seguir en nombre de otro.
//
// Optimista con reversión: la píldora cambia al instante y solo se deshace si
// el servidor falla. Sin scripts en línea (la CSP es estricta): es un
// componente de React normal, el bundler lo empaqueta con su nonce.

import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Quien sigue: el usuario de la sesión. */
  followerId: string;
  /** A quién se sigue. */
  profileId: string;
  /** Solo para la etiqueta accesible del botón. */
  name: string;
};

export default function HomeFollowButton({ followerId, profileId, name }: Props) {
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next); // optimista
    const supabase = createClient();
    try {
      if (next) {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: followerId, followee_id: profileId });
        // 23505 = ya le seguías (doble clic o pestaña duplicada): es el estado
        // que queríamos, así que se da por bueno.
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", followerId)
          .eq("followee_id", profileId);
        if (error) throw error;
      }
    } catch (err) {
      // Reversión: la tabla puede no existir todavía, o la sesión haber
      // caducado. La píldora vuelve a su estado real y no se avisa con un
      // error rojo: es una sugerencia, no una acción crítica. Pero SÍ queda
      // rastro en consola, que es justo lo que faltó para detectar que la
      // política RLS de follows (123) rechazaba todos los inserts.
      console.error("[HomeFollowButton] follow", err);
      setFollowing(!next);
    }
    setBusy(false);
  };

  // Píldora del sistema: primario violeta para "Seguir", contorno para
  // "Siguiendo" (la acción ya está hecha, no hace falta que grite).
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? `Dejar de seguir a ${name}` : `Seguir a ${name}`}
      className={cn(
        buttonVariants({ variant: following ? "outline" : "default", size: "sm" }),
        "shrink-0 rounded-full px-3"
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : following ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Plus className="h-3 w-3" aria-hidden />
      )}
      {following ? "Siguiendo" : "Seguir"}
    </button>
  );
}
