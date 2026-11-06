"use client";
import { SocialInstagramLink } from "@/components/SocialDemoNotice";

import { useCallback, useEffect, useState, useRef } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Loader2,
  Instagram,
  Heart,
  HeartCrack,
  Flag,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";

interface Match {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  age: number | null;
  instagram_handle: string | null;
  verified: boolean;
  matched_at: string;
}

function LigarMatches() {
  const supabase = createClient();
  const { owner, isCurrent } = useAccountGuard();
  const action = useRef(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [reportingId, setReportingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isCurrent()) return;
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("get_ig_matches");
    if (!isCurrent()) return;
    if (e) {
      setError(e.message);
    } else {
      setMatches((data as Match[]) ?? []);
    }
    setLoading(false);
  }, [supabase, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  const report = useCallback(async (id: string, reason: string) => {
    if (action.current || !isCurrent()) return;
    action.current = true; setReportingId(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner) return;
      const { error: e } = await supabase.rpc("report_ig", { p_target: id, p_reason: reason });
      if (!isCurrent()) return;
      if (e) throw e;
      setReportOpen(null); setReported(r => ({ ...r, [id]: true }));
    } catch { if (isCurrent()) setError("No se pudo enviar el aviso. Vuelve a intentarlo."); }
    finally { action.current = false; if (isCurrent()) setReportingId(null); }
  }, [supabase, owner, isCurrent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }

  if (matches.length === 0) {
    return (
      /* Vacío del sistema. Se explica la mecánica en la propia descripción:
         es la duda que trae aquí a la gente la primera vez. */
      <EmptyState
        icon={HeartCrack}
        compact
        title="Todavía no tienes matches"
        description="Cuando alguien a quien diste tu Instagram te lo dé también, aparecerá aquí con su perfil. Nadie ve nada hasta que sois los dos."
      />
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <div
          key={m.id}
          className="rounded-2xl border border-border bg-bg-primary p-3 shadow-card transition-colors hover:border-text-primary/15 sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-bg-secondary ring-1 ring-border">
              {m.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.avatar_url}
                  alt={m.full_name ?? "Perfil"}
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
                {m.full_name ?? "Anónimo"}
                {m.age != null && (
                  <span className="font-normal text-text-muted"> · {m.age}</span>
                )}
              </p>
              <p className="flex items-center gap-1 text-xs font-medium text-violet"><Heart className="h-3 w-3 fill-current" aria-hidden="true" /> Match mutuo</p>
            </div>
            {m.instagram_handle ? (
              <SocialInstagramLink
                href={`https://instagram.com/${m.instagram_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-xs font-semibold text-bg-primary transition-transform hover:-translate-y-px"
              >
                <Instagram className="h-4 w-4" /> @{m.instagram_handle}
              </SocialInstagramLink>
            ) : (
              <span className="text-xs text-text-muted">Sin IG</span>
            )}
          </div>

          {/* Reportar Instagram falso / suplantación */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-border-light pt-2">
            {reported[m.id] ? (
              <span className="text-[11px] text-text-muted">
                Gracias, lo revisaremos.
              </span>
            ) : reportOpen === m.id ? (
              <>
                <span className="mr-auto text-[11px] text-text-muted">
                  ¿El Instagram es falso o no es esta persona?
                </span>
                <button
                  type="button"
                  onClick={() => setReportOpen(null)}
                  className="text-[11px] font-semibold text-text-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={reportingId !== null}
                  onClick={() => report(m.id, "falso o no es esta persona")}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-50"
                >
                  {reportingId === m.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Reportar"
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setReportOpen(m.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-error"
              >
                <Flag className="h-3 w-3" /> ¿Falso?
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default withAccountScope(LigarMatches);
