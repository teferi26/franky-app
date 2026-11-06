"use client";

import { useState, useRef, useEffect } from "react";
import { Share2, Check, Copy, MessageCircle, Send, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function EventShareButton({
  eventId,
  title,
  city,
}: {
  eventId: string;
  title: string;
  city: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Build a friendly URL once we're on the client; on the server we'd fall
  // back to franky.es as canonical.
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/eventos/${eventId}`
      : `https://franky.es/eventos/${eventId}`;
  const shareText = city
    ? `Te apunto a este plan en ${city}: ${title}`
    : `Mira este evento: ${title}`;

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Franky · ${title}`,
          text: shareText,
          url,
        });
        return;
      } catch {
        // User cancelled or blocked — fall through to in-app sheet.
      }
    }
    setOpen(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No-op; the user can long-press the input below.
    }
  };

  // Close sheet on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const wa = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;
  const mail = `mailto:?subject=${encodeURIComponent(`Franky · ${title}`)}&body=${encodeURIComponent(`${shareText}\n\n${url}`)}`;

  return (
    <>
      <Button variant="outline" onClick={handleNativeShare} aria-label="Compartir evento">
        <Share2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Compartir
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-text-primary/40 p-0 sm:items-center sm:p-4">
          <div
            ref={sheetRef}
            className="animate-sheet-in max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-bg-primary p-6 shadow-float sm:max-w-md sm:rounded-2xl"
            role="dialog"
            aria-label="Compartir evento"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-violet">Pasa el plan</p>
                <h3 className="mt-1 font-heading text-lg font-bold text-text-primary">Compartir evento</h3>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Cerrar">
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>

            {/* Destinos como filas limpias: iconos sueltos, sin circulos de color. */}
            <ul className="divide-y divide-border-light border-y border-border-light">
              {[
                { href: wa, label: "WhatsApp", Icon: MessageCircle, external: true },
                { href: tg, label: "Telegram", Icon: Send, external: true },
                { href: mail, label: "Correo", Icon: Mail, external: false },
              ].map(({ href, label, Icon, external }) => (
                <li key={label}>
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-secondary"
                  >
                    <Icon className="h-4 w-4 text-text-primary" strokeWidth={1.75} aria-hidden="true" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-center gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Enlace del evento"
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 flex-1 bg-bg-secondary/60 font-mono text-xs"
              />
              <Button
                variant={copied ? "outline" : "dark"}
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
