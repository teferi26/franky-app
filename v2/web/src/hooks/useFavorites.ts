"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { useAuth } from "./useAuth";

export type FavoriteType =
  | "career"
  | "university"
  | "accommodation"
  | "event"
  | "leisure_spot";

export interface Favorite {
  id: string;
  user_id: string;
  target_id: string;
  target_type: FavoriteType;
  created_at: string;
}

export function useFavorites(itemType?: FavoriteType) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from("favorites")
      .select("id, user_id, target_id, target_type, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (itemType) query = query.eq("target_type", itemType);

    const { data } = await query;
    setFavorites((data as Favorite[]) || []);
    setLoading(false);
  }, [user?.id, itemType]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const toggleFavorite = useCallback(
    async (itemId: string, type: FavoriteType) => {
      if (!user) return false;
      const supabase = createClient();
      const existing = favorites.find(
        (f) => f.target_id === itemId && f.target_type === type
      );

      if (existing) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("id", existing.id);
        // Si el delete falla (RLS, red), no tocamos el estado: el corazon
        // sigue marcado y devolvemos su valor real (true = sigue en favoritos).
        if (error) return true;
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
        return false;
      }
      const { data, error } = await supabase
        .from("favorites")
        .insert({ user_id: user.id, target_id: itemId, target_type: type })
        .select()
        .single();
      // Si el insert falla (RLS, red, CHECK constraint), no marcamos el
      // corazon: devolvemos false para reflejar que no se guardo nada.
      if (error || !data) return false;
      setFavorites((prev) => [data as Favorite, ...prev]);
      return true;
    },
    [user?.id, favorites]
  );

  const isFavorite = useCallback(
    (itemId: string, type: FavoriteType) =>
      favorites.some((f) => f.target_id === itemId && f.target_type === type),
    [favorites]
  );

  return { favorites, loading, toggleFavorite, isFavorite, refetch: fetchFavorites };
}
