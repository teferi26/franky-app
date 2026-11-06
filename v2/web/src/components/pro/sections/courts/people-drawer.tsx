"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Avatar, Drawer, Empty } from "../../kit";
import { WhatsAppLink } from "./booking-ops";
import type { LucideIcon } from "lucide-react";

/**
 * Lista corta de personas a las que escribir hoy, cada una con su mensaje ya
 * escrito: jugadores que han dejado de venir, socios que no aparecen o el
 * resumen de horas del mes. Marca en pantalla a quién ya has escrito para no
 * repetir mientras recorres la lista.
 */

export type PersonToWrite = {
  id: string;
  name: string;
  detail: string;
  phone?: string;
  message: string;
  /** Acción extra junto al WhatsApp (por ejemplo, ir a pausar su cuota). */
  extra?: React.ReactNode;
};

export function PeopleDrawer({
  open,
  onClose,
  title,
  description,
  people,
  emptyIcon,
  emptyTitle,
  emptyBody,
  cta = "Escribir",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  people: PersonToWrite[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyBody: string;
  cta?: string;
}) {
  const [written, setWritten] = React.useState<Set<string>>(new Set());
  const [limit, setLimit] = React.useState(40);

  React.useEffect(() => {
    if (open) {
      setWritten(new Set());
      setLimit(40);
    }
  }, [open]);

  const done = people.filter((p) => written.has(p.id)).length;

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={title}
      description={
        done ? `${description ? `${description} ` : ""}Llevas ${done} de ${people.length}.` : description
      }
    >
      {people.length ? (
        <ul className="flex flex-col divide-y divide-border-light">
          {people.slice(0, limit).map((p) => {
            const sent = written.has(p.id);
            return (
              <li key={p.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} size="sm" tone={sent ? "emerald" : "slate"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{p.name}</span>
                      {sent ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Escrito" /> : null}
                    </span>
                    <span className="block truncate text-xs text-text-muted">{p.detail}</span>
                  </span>
                </div>
                <p className="rounded-xl bg-bg-secondary px-3 py-2 text-[0.82rem] text-text-secondary">{p.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {p.phone ? (
                    <WhatsAppLink
                      phone={p.phone}
                      message={p.message}
                      label={sent ? "Escribir otra vez" : cta}
                      onClick={() => setWritten((s) => new Set(s).add(p.id))}
                    />
                  ) : (
                    <span className="text-xs text-text-muted">Sin móvil en su ficha</span>
                  )}
                  {p.extra}
                </div>
              </li>
            );
          })}
          {people.length > limit ? (
            <li className="py-3">
              <button
                type="button"
                onClick={() => setLimit(limit + 40)}
                className="min-h-10 text-sm font-semibold text-violet"
              >
                Ver {Math.min(40, people.length - limit)} más
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <Empty icon={emptyIcon} title={emptyTitle} body={emptyBody} />
      )}
    </Drawer>
  );
}
