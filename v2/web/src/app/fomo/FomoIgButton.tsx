"use client";
import { SocialInstagramLink } from "@/components/SocialDemoNotice";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Instagram, Loader2, PartyPopper, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-client";
import { withAccountScope, useAccountGuard } from "@/components/AccountScope";

interface RequestResult {
  matched: boolean;
  instagram_handle: string | null;
}

/**
 * Botón "Pedir IG" para un autor concreto del feed FOMO. Reutiliza la mecánica
 * de intercambio mutuo (request_ig): das tu Instagram para pedir el suyo; si la
 * otra persona también te lo pidió, hay match y se revelan los handles.
 *
 * Va dentro de una tarjeta que es un <Link>, así que el click detiene la
 * propagación para no navegar al detalle. El modal de match se renderiza por
 * portal en document.body para no quedar anidado dentro del enlace.
 */
function FomoIgButton({
  authorId,
  authorName,
  postId,
}: {
  authorId?: string;
  authorName?: string | null;
  /** En el muro de Crush, los posts anónimos piden por post_id (el servidor
   *  resuelve al autor sin revelar su identidad). Si se pasa, tiene prioridad. */
  postId?: string;
}) {
  const { owner, isCurrent } = useAccountGuard();
  const action = useRef(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<{ handle: string | null } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const matchHandleRef = useRef<HTMLAnchorElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Accesibilidad del modal de match: foco al elemento principal al abrir,
  // cierre con Escape y devolución del foco al elemento que lo abrió al cerrar.
  useEffect(() => {
    if (!match) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // El handle es el elemento clave (revela el Instagram); si no hay, el botón Cerrar.
    (matchHandleRef.current ?? closeButtonRef.current)?.focus();
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        setMatch(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [match]);

  async function request(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (action.current || sent || !isCurrent() || (!postId && !authorId)) return;
    action.current = true; setSending(true); setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!isCurrent() || user?.id !== owner) return;
      const { data, error: e2 } = postId
        ? await supabase.rpc("request_ig_for_post", { p_post_id: postId })
        : await supabase.rpc("request_ig", { p_target: authorId as string });
      if (!isCurrent()) return;
      if (e2 || !data) throw e2 ?? new Error("missing-response");
      const res = data as RequestResult;
      setSent(true);
      if (res.matched) setMatch({ handle: res.instagram_handle });
    } catch { if (isCurrent()) setError("No se pudo enviar. Revisa tu participación en Crush e inténtalo de nuevo."); }
    finally { action.current = false; if (isCurrent()) setSending(false); }
  }

  return (
    <>
      <button
        type="button"
        onClick={request}
        disabled={sending || sent}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
          sent
            ? "border-transparent bg-violet-50 text-violet-deep"
            : "border-border bg-bg-primary text-text-primary hover:border-text-primary/30 hover:bg-bg-secondary"
        } disabled:opacity-60`}
        title="Pedir Instagram (intercambio mutuo)"
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : sent ? (
          <>
            <Check className="h-3.5 w-3.5" /> Enviado
          </>
        ) : (
          <>
            <Instagram className="h-3.5 w-3.5" /> Pedir IG
          </>
        )}
      </button>

      {error && (
        <span className="text-xs font-medium text-error">{error}</span>
      )}

      {/* Modal de match (portal para no anidar dentro del <Link> de la card) */}
      {match &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-bg-dark/60 p-6 animate-fade-in"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMatch(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="fomo-match-title"
              className="w-full max-w-sm rounded-3xl border border-border bg-bg-primary p-7 text-center shadow-float animate-scale-in"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <PartyPopper className="mx-auto h-10 w-10 text-violet" />
              <h3
                id="fomo-match-title"
                className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-text-primary"
              >
                ¡Es un match!
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                {authorName ?? "Esta persona"} también quería tu Instagram.
              </p>
              {match.handle && (
                <SocialInstagramLink
                  ref={matchHandleRef}
                  href={`https://instagram.com/${match.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-sm font-semibold text-bg-primary transition-transform hover:-translate-y-px"
                >
                  <Instagram className="h-4 w-4" /> @{match.handle}
                </SocialInstagramLink>
              )}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMatch(null);
                }}
                className="mt-3 block w-full rounded-full border border-border py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary"
              >
                Cerrar
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default withAccountScope(FomoIgButton, { silent: true });
