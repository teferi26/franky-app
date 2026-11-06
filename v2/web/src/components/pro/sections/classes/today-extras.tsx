"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { plural } from "@/lib/pro/format";
import {
  inSeasonWindow,
  leadMessage,
  leadStageLabel,
  leadsToCall,
  seasonTasks,
  seasonYear,
  snoozeLead,
  toggleSeasonTask,
} from "@/lib/pro/classes-growth";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Avatar, Meter, Panel } from "../../kit";
import { sectionHref } from "../../shell";

/**
 * Piezas pequeñas para Hoy: la lista de la temporada de septiembre (de
 * mediados de julio a septiembre) y a quién llamar hoy de los interesados.
 */

export function SeasonCard() {
  const { data, now, spaceId, vertical, update } = usePro();
  if (!inSeasonWindow(now)) return null;
  const tasks = seasonTasks(data, now, vertical.id);
  const done = tasks.filter((t) => t.done).length;
  if (done === tasks.length) return null;
  const year = seasonYear(now);
  const href = (section: (typeof tasks)[number]["section"], id: string) => {
    const base = sectionHref(spaceId, section);
    if (id === "next_course") return `${base}?vista=curso`;
    return base;
  };

  return (
    <Panel
      title={`Temporada de septiembre ${year}`}
      description={`${done} de ${tasks.length} listas. Septiembre concentra buena parte de las altas del año: que te pille preparado.`}
      flush
    >
      <div className="px-4 pt-1 sm:px-5">
        <Meter value={done} max={tasks.length} tone="success" />
      </div>
      <ul className="mt-2 divide-y divide-border-light">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            {t.auto ? (
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center"
                aria-hidden
              >
                <Tick done={t.done} />
              </span>
            ) : (
              <button
                type="button"
                role="checkbox"
                aria-checked={t.done}
                aria-label={t.title}
                onClick={() => void update("season.toggle", (d) => toggleSeasonTask(d, year, t.id))}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-bg-secondary"
              >
                <Tick done={t.done} />
              </button>
            )}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  t.done && "text-text-muted line-through",
                )}
              >
                {t.title}
              </span>
              <span className="block text-xs text-text-muted">{t.detail}</span>
            </span>
            {!t.done ? (
              <Link
                href={href(t.section, t.id)}
                className="inline-flex h-10 shrink-0 items-center text-violet"
                aria-label={`Ir a ${t.title}`}
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Círculo de hecho o por hacer. Las tareas automáticas no se tocan. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border",
        done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> : null}
    </span>
  );
}

export function LeadsToday() {
  const { data, now, spaceId, vertical, update } = usePro();
  const list = leadsToCall(data, now);
  if (!list.length) return null;
  const sender = data.space.owner.firstName || data.space.name;
  return (
    <Panel
      title="Interesados para hoy"
      description={`${plural(list.length, "persona espera", "personas esperan")} que le escribas. El mensaje ya va escrito.`}
      action={
        <Link
          href={sectionHref(spaceId, "clientes")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet"
        >
          Todos <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
      flush
    >
      <ul className="divide-y divide-border-light">
        {list.slice(0, 4).map((lead) => {
          const link = customerWhatsApp(
            lead.phone,
            leadMessage(lead, sender, data.space.name, vertical.id),
          );
          return (
            <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <Avatar name={lead.name} size="sm" tone="violet" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{lead.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {leadStageLabel(lead.stage, vertical.id)}
                  {lead.interest ? ` · ${lead.interest}` : ""}
                </span>
              </span>
              {link ? (
                <Button size="sm" variant="secondary" asChild>
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() =>
                      void update("lead.update", (d) =>
                        snoozeLead(d, lead.id, lead.stage === "new" ? 2 : 1, now),
                      )
                    }
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Escribir
                  </a>
                </Button>
              ) : lead.phone ? (
                <Button size="sm" variant="ghost" asChild>
                  <a href={`tel:${lead.phone.replace(/\s/g, "")}`}>
                    <Phone className="h-3.5 w-3.5" /> Llamar
                  </a>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
