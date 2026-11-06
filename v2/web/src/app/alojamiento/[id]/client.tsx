"use client";

import { useEffect, useState } from "react";
import { Heart, MessageCircle, Loader2, CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSaveAccommodation } from "./components/use-save-accommodation";

export default function AlojamientoDetailClient({
  accommodationId,
  ownerId,
}: {
  accommodationId: string;
  ownerId: string | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  // El mismo hook que usan el corazón de la galería y la barra de móvil: los
  // tres botones se mantienen sincronizados.
  const { saved, busy: savingBusy, toggle } = useSaveAccommodation(accommodationId);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");

  // Métrica de la ficha (migración 161): una vista por usuario y día. Fire and
  // forget: la ficha no debe romperse si la RPC aún no está en prod.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .rpc("register_accommodation_view", { p_accommodation_id: accommodationId })
      .then(() => {}, () => {});
  }, [user, accommodationId]);

  const openChat = async () => {
    if (!ownerId) return;
    setChatBusy(true);
    setChatError("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_or_create_housing_chat", {
      p_accommodation_id: accommodationId,
    });
    setChatBusy(false);
    if (!error && data) {
      router.push(`/chats?chat=${data}&housing=${accommodationId}`);
      return;
    }
    if (error?.message?.includes("not_allowed")) {
      setChatError("El anunciante limita quién puede escribirle.");
    } else {
      setChatError("No se pudo abrir el chat. Inténtalo de nuevo.");
    }
  };

  const isOwner = user != null && ownerId != null && user.id === ownerId;

  // Acciones de la ficha (v3): un CTA oscuro, el resto en outline. El guardado
  // marcado se pinta con borde y texto oscuros, sin fondo tintado.
  return (
    <div className="mt-5 space-y-2">
      {user ? (
        <>
          <Button asChild className="w-full" variant="dark" size="lg">
            <a href="#reservar-visita">
              <CalendarDays className="h-4 w-4" />
              Reservar visita
            </a>
          </Button>
          {ownerId && !isOwner && (
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={openChat}
              disabled={chatBusy}
            >
              {chatBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              Chatear con el anunciante
            </Button>
          )}
          {chatError && <p className="text-xs text-error">{chatError}</p>}
        </>
      ) : (
        <Button asChild className="w-full" variant="dark" size="lg">
          <Link href={`/login?next=${encodeURIComponent(`/alojamiento/${accommodationId}`)}`}>
            Inicia sesión para reservar
          </Link>
        </Button>
      )}

      {/* El guardado se ofrece siempre: sin sesión, el hook avisa y lleva al
          login en vez de no hacer nada. */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={toggle}
        disabled={savingBusy}
        aria-pressed={saved}
        className={cn("w-full", saved && "border-text-primary text-text-primary")}
      >
        {savingBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart className={cn("h-4 w-4", saved && "fill-violet text-violet animate-heart-pop")} />
        )}
        {saved ? "Guardado" : "Guardar"}
      </Button>
    </div>
  );
}
