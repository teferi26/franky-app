"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase-client";
import { Star, Loader2 } from "lucide-react";

interface Summary {
  avg_rating: number | null;
  ratings_count: number;
}

// Valoración 1-5 estrellas por carrera: el agregado es público (RPC SECURITY
// DEFINER), la valoración individual solo la ve su autor. Si la migración 118
// aún no está aplicada, el RPC falla y el bloque se oculta solo.
export default function CareerRating({ careerId }: { careerId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);

  const supabase = createClient();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.rpc("career_rating_summary", {
      p_career_id: careerId,
    });
    if (error) {
      setAvailable(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setSummary({
      avg_rating: row?.avg_rating != null ? Number(row.avg_rating) : null,
      ratings_count: Number(row?.ratings_count ?? 0),
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const { data: mine } = await supabase
        .from("career_ratings")
        .select("rating")
        .eq("career_id", careerId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (mine) setMyRating(mine.rating);
    }
  }, [careerId, supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRate = async (value: number) => {
    if (!userId || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("career_ratings")
      .upsert(
        { career_id: careerId, user_id: userId, rating: value },
        { onConflict: "career_id,user_id" }
      );
    if (!error) {
      setMyRating(value);
      await fetchAll();
    }
    setSaving(false);
  };

  // No renderizar hasta confirmar que el RPC existe (summary llega tras el
  // primer fetch correcto): evita el flash si la migración no está aplicada.
  if (!available || summary === null) return null;

  const avg = summary.avg_rating;
  const count = summary.ratings_count;

  return (
    <section className="rounded-2xl border border-border bg-bg-primary p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-text-primary">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            Valoración de estudiantes
          </h2>
          {count > 0 && avg != null ? (
            <div className="flex items-center gap-2 mt-2">
              <span className="font-heading text-3xl font-extrabold text-text-primary tabular">{avg.toFixed(1)}</span>
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-5 w-5 ${s <= Math.round(avg) ? "text-amber-400 fill-amber-400" : "text-border-light"}`}
                  />
                ))}
              </div>
              <span className="text-sm text-text-muted">
                ({count} valoraci{count === 1 ? "ón" : "ones"})
              </span>
            </div>
          ) : (
            <p className="text-sm text-text-muted mt-2">
              Aún no hay valoraciones. Sé la primera persona en valorar esta carrera.
            </p>
          )}
        </div>

        <div className="sm:text-right">
          {userId ? (
            <>
              <p className="text-sm font-medium mb-1.5">
                {myRating ? "Tu valoración" : "Valora esta carrera"}
              </p>
              <div className="flex items-center gap-1 sm:justify-end">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleRate(s)}
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(null)}
                    disabled={saving}
                    aria-label={`Valorar con ${s} estrella${s === 1 ? "" : "s"}`}
                    className="cursor-pointer rounded-md p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet disabled:opacity-60 motion-reduce:hover:scale-100"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        s <= (hover ?? myRating ?? 0)
                          ? "text-amber-400 fill-amber-400"
                          : "text-border-light"
                      }`}
                    />
                  </button>
                ))}
                {saving && <Loader2 className="h-4 w-4 animate-spin text-violet ml-1" />}
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted">
              <a href="/login" className="link-underline font-medium text-violet">Inicia sesión</a>{" "}
              para valorar con estrellas.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
