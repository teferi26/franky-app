"use client";

// ─── Invita a tu gente (referidos) ───────────────────────────────────────
// Paridad con la app móvil (mobile/app/invitar.tsx). Enlace personal con el
// id del usuario en ?ref=: AttributionTracker ya lo lee al aterrizar y lo
// guarda como campaña en la atribución del registro, así que no hace falta
// ninguna tabla nueva. Sin recompensas ni puntos a propósito: el texto habla
// solo de que el campus tenga más gente y más planes.
// Compartir: Web Share API si el navegador la tiene (móvil, sobre todo) y,
// si no, se copia el enlace al portapapeles.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link as LinkIcon, Share2, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SITE_URL = "https://franky.es";

export default function InviteFriendsCard({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [error, setError] = useState("");

  // navigator solo existe en el cliente: se decide tras montar para que el
  // HTML del servidor y el primer render coincidan (sin aviso de hidratación).
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const inviteUrl = `${SITE_URL}/?ref=${userId}`;
  const shareText = `Me he apuntado a Franky, la app de mi universidad para enterarme de planes, eventos y gente del campus. Únete: ${inviteUrl}`;

  const copyLink = useCallback(async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles (webviews antiguos): el enlace sigue a la
      // vista para seleccionarlo a mano.
      setError("No se pudo copiar automáticamente. Selecciona el enlace y cópialo.");
    }
  }, [inviteUrl]);

  const shareLink = useCallback(async () => {
    setError("");
    if (!canShare) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({ title: "Únete a Franky", text: shareText, url: inviteUrl });
    } catch {
      // Cancelado por el usuario o hoja no disponible: no es un error.
    }
  }, [canShare, copyLink, inviteUrl, shareText]);

  return (
    <section
      aria-labelledby="invite-title"
      className="mt-4 rounded-2xl border border-border bg-bg-primary p-6 shadow-card sm:p-8"
    >
      {/* Diseño v3: icono suelto, título en Outfit y el enlace en un campo con
          el mismo trazo que ui/input. Sin cuadrado tintado ni botón a mano. */}
      <Users className="h-5 w-5 text-violet" aria-hidden="true" />
      <h2 id="invite-title" className="mt-4 font-heading text-xl font-extrabold tracking-tight text-text-primary">
        Invita a tu gente
      </h2>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-text-muted">
        Cuanta más gente de tu universidad esté en Franky, más publicaciones
        en el FOMO, más eventos con gente apuntada y más planes que descubrir.
      </p>

      <label htmlFor="invite-link" className="eyebrow mb-2 mt-6 block">
        Tu enlace de invitación
      </label>
      <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-bg-primary pl-3.5 pr-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-violet focus-within:ring-[3px] focus-within:ring-violet/15 hover:border-text-primary/20">
        <LinkIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <input
          id="invite-link"
          type="text"
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={copyLink}
          aria-label={copied ? "Enlace copiado" : "Copiar enlace"}
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div aria-live="polite" className="mt-1.5 min-h-4">
        {copied && <p className="text-xs text-success animate-fade-in">Enlace copiado</p>}
        {error && <p className="text-xs text-error animate-fade-in">{error}</p>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={shareLink}
          className={cn(buttonVariants({ variant: "dark" }), "btn-shine")}
        >
          <Share2 className="h-4 w-4" />
          {canShare ? "Compartir invitación" : "Copiar invitación"}
        </button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        No hay recompensas ni puntos por invitar: es simplemente que cuanta más
        gente de tu universidad esté en Franky, mejores serán el FOMO, los
        eventos y Crush para todos.
      </p>
    </section>
  );
}
