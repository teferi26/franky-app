"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useToast } from "@/components/ui/toast";

/**
 * Guardar/quitar de favoritos un piso desde VARIOS sitios de la misma ficha
 * (el corazón de la galería, el botón de la barra lateral y el de la barra
 * inferior de móvil) manteniéndolos sincronizados.
 *
 * useFavorites mantiene su propio estado por instancia: si cada botón usara el
 * hook por su cuenta, marcar el corazón dejaría el botón de la barra lateral
 * diciendo "Guardar". Se emite un evento de ventana en cada cambio para que
 * todas las instancias de la misma ficha se enteren, sin montar un provider ni
 * volver a consultar la base de datos.
 */
const SYNC_EVENT = "franky:accommodation-favorite";

export function useSaveAccommodation(accommodationId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { user } = useAuth();
  const { isFavorite, toggleFavorite, loading } = useFavorites("accommodation");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSaved(isFavorite(accommodationId, "accommodation"));
  }, [isFavorite, accommodationId]);

  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; saved: boolean }>).detail;
      if (detail?.id === accommodationId) setSaved(detail.saved);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [accommodationId]);

  const toggle = useCallback(async () => {
    // Sin sesión no se falla en silencio: se avisa y se lleva al login de vuelta
    // a esta misma ficha.
    if (!user) {
      toast.info("Inicia sesión para guardar este piso");
      router.push(`/login?next=${encodeURIComponent(pathname || "/alojamiento")}`);
      return;
    }
    setBusy(true);
    const next = await toggleFavorite(accommodationId, "accommodation");
    setBusy(false);
    setSaved(next);
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { id: accommodationId, saved: next } })
    );
    if (next) toast.success("Guardado en tus favoritos");
  }, [user, toast, router, pathname, toggleFavorite, accommodationId]);

  return { saved, busy, loading, toggle, isLoggedIn: !!user };
}
