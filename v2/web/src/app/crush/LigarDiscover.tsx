"use client";
import { SocialInstagramLink } from "@/components/SocialDemoNotice";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Instagram,
  Heart,
  MapPin,
  HeartCrack,
  PartyPopper,
  BadgeCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";

interface Candidate {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  verified: boolean;
}

interface RequestResult {
  matched: boolean;
  instagram_handle: string | null;
}

export default function LigarDiscover({
  onMatched,
}: {
  onMatched?: () => void;
}) {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [match, setMatch] = useState<{
    candidate: Candidate;
    handle: string | null;
  } | null>(null);
  const [modalReported, setModalReported] = useState(false);
  const [modalReporting, setModalReporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("get_ig_candidates", {
      p_limit: 20,
    });
    if (e) {
      setError(e.message);
    } else {
      setCandidates((data as Candidate[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const request = useCallback(
    async (c: Candidate) => {
      setSending(c.id);
      setError(null);
      const { data, error: e } = await supabase.rpc("request_ig", {
        p_target: c.id,
      });
      setSending(null);
      if (e) {
        setError(e.message);
        return;
      }
      const res = data as RequestResult;
      // Quítalo de la lista en cualquier caso (ya le he solicitado).
      setCandidates((prev) => prev.filter((x) => x.id !== c.id));
      if (res.matched) {
        setModalReported(false);
        setMatch({ candidate: c, handle: res.instagram_handle });
        onMatched?.();
      }
    },
    [supabase, onMatched]
  );

  const reportMatch = useCallback(async () => {
    if (!match) return;
    setModalReporting(true);
    const { error: e } = await supabase.rpc("report_ig", {
      p_target: match.candidate.id,
      p_reason: "falso o no es esta persona",
    });
    setModalReporting(false);
    if (!e) setModalReported(true);
  }, [supabase, match]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {candidates.length === 0 ? (
        /* Vacío del sistema. El botón de recargar se mantiene como acción
           principal: aquí la lista se llena sola con el tiempo y volver a
           mirar es lo único que se puede hacer. */
        <EmptyState
          icon={HeartCrack}
          compact
          title="No hay nadie nuevo por ahora"
          description="Cada día se apunta gente nueva de tu universidad. Vuelve en un rato o actualiza para comprobarlo."
          action={{ onClick: load, label: "Actualizar" }}
        />
      ) : (
        /* Tarjetas grandes (v3): foto a 4:5 con el nombre encima y una sola
           acción redonda en contorno. Entran en cascada. */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {candidates.map((c, i) => (
            <article
              key={c.id}
              className="group hover-lift animate-list-in flex flex-col overflow-hidden rounded-3xl border border-border bg-bg-primary shadow-card hover:border-text-primary/15"
              style={{ ["--i" as string]: i } as CSSProperties}
            >
              <div className="img-zoom relative aspect-[4/5] w-full bg-bg-secondary">
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.avatar_url}
                    alt={c.full_name ?? "Perfil"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-text-muted">
                    <Heart className="h-10 w-10" aria-hidden="true" />
                  </div>
                )}
                {/* Nombre sobre la foto, con un velo oscuro solo abajo para leerlo. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-4 pb-4 pt-12 text-white">
                  <p className="flex items-center gap-1.5 font-heading text-lg font-bold leading-tight">
                    <span className="truncate">{c.full_name ?? "Anónimo"}</span>
                    {c.age != null && (
                      <span className="font-normal text-white/80">· {c.age}</span>
                    )}
                    {c.verified && (
                      <BadgeCheck className="h-4 w-4 shrink-0 text-white" aria-label="Instagram verificado" />
                    )}
                  </p>
                  {c.city && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-white/80">
                      <MapPin className="h-3 w-3" aria-hidden="true" /> {c.city}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <span className="text-xs text-text-muted">Intercambio mutuo</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => request(c)}
                  disabled={sending === c.id}
                  className="rounded-full"
                >
                  {sending === c.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Instagram className="h-4 w-4" /> Darle mi IG
                    </>
                  )}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modal de match */}
      {match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-dark/60 p-6 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-bg-primary p-7 text-center shadow-float animate-scale-in">
            <PartyPopper className="mx-auto h-10 w-10 text-violet" />
            <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-text-primary">
              ¡Es un match!
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {match.candidate.full_name ?? "Esta persona"} también quería tu
              Instagram.
            </p>
            {match.handle && (
              <SocialInstagramLink
                href={`https://instagram.com/${match.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-sm font-semibold text-bg-primary transition-transform hover:-translate-y-px"
              >
                <Instagram className="h-4 w-4" /> @{match.handle}
              </SocialInstagramLink>
            )}
            <button
              type="button"
              onClick={() => setMatch(null)}
              className="mt-3 block w-full rounded-full border border-border py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary"
            >
              Seguir mirando
            </button>
            <div className="mt-3 text-center">
              {modalReported ? (
                <span className="text-[11px] text-text-muted">
                  Gracias, lo revisaremos.
                </span>
              ) : (
                <button
                  type="button"
                  disabled={modalReporting}
                  onClick={reportMatch}
                  className="text-[11px] font-semibold text-text-muted transition-colors hover:text-error disabled:opacity-50"
                >
                  {modalReporting ? "Enviando…" : "¿El Instagram parece falso? Reportar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
