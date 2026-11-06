"use client";
import { SocialInstagramLink } from "@/components/SocialDemoNotice";

import { useCallback, useEffect, useState, useRef } from "react";
import {
  Loader2,
  Instagram,
  Heart,
  HeartCrack,
  MapPin,
  Check,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";

interface IncomingRequest {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  city: string | null;
  verified: boolean;
  requested_at: string;
}

/**
 * "Solicitudes": gente que te ha pedido el Instagram y aún no has correspondido.
 * Aceptar = darle tu IG de vuelta = match → se revela su Instagram al momento.
 * Permite aceptar una a una o todas de golpe.
 */
function LigarRequests({ onChanged }: { onChanged?: () => void }) {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const action = useRef(false);
  const [items, setItems] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  // Progreso de "Aceptar todas": [hechas, total] para mostrar "Aceptando 3 de 20...".
  const [acceptAllProgress, setAcceptAllProgress] = useState<[number, number]>([0, 0]);
  // id → handle revelado tras aceptar (queda visible un momento antes de pasar a Matches).
  const [accepted, setAccepted] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("get_ig_incoming_requests", {
      p_limit: 100,
    });
    if (!isCurrent()) return;
    if (e) setError("No hemos podido cargar tus solicitudes. Inténtalo de nuevo.");
    else setItems((data as IncomingRequest[]) ?? []);
    setLoading(false);
  }, [supabase, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = useCallback(async (r: IncomingRequest): Promise<boolean> => {
    if (!isCurrent()) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!isCurrent() || user?.id !== owner) return false;
    const { data, error: e } = await supabase.rpc("request_ig", { p_target: r.id });
    if (!isCurrent()) return false;
    if (e || !data) { setError("No se pudo aceptar la solicitud. Inténtalo de nuevo."); return false; }
    const res = data as { matched: boolean; instagram_handle: string | null };
    setAccepted(m => ({ ...m, [r.id]: res.matched ? res.instagram_handle ?? null : null }));
    onChanged?.();
    return true;
  }, [supabase, owner, isCurrent, onChanged]);

  const acceptOne = useCallback(async (r: IncomingRequest) => {
    if (action.current || !isCurrent()) return;
    action.current = true;
    setAcceptingId(r.id); setError(null);
    try { await accept(r); }
    catch { if (isCurrent()) setError("No se pudo aceptar. Comprueba tu conexión."); }
    finally { action.current = false; if (isCurrent()) setAcceptingId(null); }
  }, [accept, isCurrent]);

  const acceptAll = useCallback(async () => {
    if (action.current || !isCurrent()) return;
    action.current = true;
    setAcceptingAll(true); setError(null);
    const toAccept = items.filter(r => !(r.id in accepted));
    setAcceptAllProgress([0, toAccept.length]);
    try {
      let done = 0;
      for (const r of toAccept) {
        if (!isCurrent() || !(await accept(r)) || !isCurrent()) break;
        setAcceptAllProgress([++done, toAccept.length]);
      }
    } catch { if (isCurrent()) setError("Se ha interrumpido el envío. Las solicitudes ya aceptadas se conservan."); }
    finally { action.current = false; if (isCurrent()) setAcceptingAll(false); }
  }, [items, accepted, accept, isCurrent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const pendingItems = items.filter((r) => !(r.id in accepted));

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {error && <button type="button" onClick={load} className="link-underline text-sm font-semibold text-text-primary">Volver a cargar</button>}
      {items.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <HeartCrack className="mx-auto h-8 w-8 text-text-muted" aria-hidden="true" />
          <p className="mt-4 font-heading text-base font-bold text-text-primary">
            Nadie te ha pedido el Instagram todavía
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Cuando alguien quiera intercambiar contigo, aparecerá aquí para que lo aceptes.
          </p>
        </div>
      ) : (
        <>
          {pendingItems.length > 1 && (
            <Button
              type="button"
              variant="dark"
              onClick={acceptAll}
              disabled={acceptingAll || acceptingId !== null}
              className="w-full"
            >
              {acceptingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {acceptingAll
                ? `Aceptando ${acceptAllProgress[0]} de ${acceptAllProgress[1]}...`
                : `Aceptar todas (${pendingItems.length})`}
            </Button>
          )}

          {items.map((r) => {
            const isAccepted = r.id in accepted;
            const handle = accepted[r.id];
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-border bg-bg-primary p-3 shadow-card transition-colors hover:border-text-primary/15 sm:p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-bg-secondary ring-1 ring-border">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatar_url}
                        alt={r.full_name ?? "Perfil"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-text-muted">
                        <Heart className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate font-heading text-[15px] font-bold text-text-primary">
                      {r.full_name ?? "Alguien"}
                      {r.age != null && (
                        <span className="font-normal text-text-muted"> · {r.age}</span>
                      )}
                    </p>
                    {isAccepted ? (
                      <p className="text-xs font-medium text-violet">{handle ? "¡Match! Ya podéis veros" : "Solicitud enviada. El Instagram se muestra si ambos seguís participando."}</p>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-text-muted">
                        <Instagram className="h-3 w-3" /> Quiere intercambiar contigo
                        {r.city && (
                          <span className="inline-flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" /> {r.city}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {isAccepted ? (
                    handle ? (
                      <SocialInstagramLink
                        href={`https://instagram.com/${handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-xs font-semibold text-bg-primary transition-transform hover:-translate-y-px"
                      >
                        <Instagram className="h-4 w-4" /> @{handle}
                      </SocialInstagramLink>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                        <Check className="h-4 w-4" /> Aceptada
                      </span>
                    )
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => acceptOne(r)}
                      disabled={acceptingId !== null || acceptingAll}
                      className="rounded-full"
                    >
                      {acceptingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Aceptar
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default withAccountScope(LigarRequests);
