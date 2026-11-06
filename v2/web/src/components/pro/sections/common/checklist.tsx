"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { usePro } from "@/lib/pro/store";
import { checklistState } from "@/lib/pro/checklist";
import { cn } from "@/lib/utils";
import { Meter } from "../../kit";
import { sectionHref } from "../../shell";

const REAL_STEP_COMMANDS: Record<string, string> = {
  services: "service.create",
  tables: "table.add",
  classes: "class.session.create",
  courts: "resource.create",
};

/**
 * Lista de arranque. En Hoy solo aparece mientras falta algo; en la Guía se
 * ve siempre, para repasar qué hace cada paso.
 */
export function SetupChecklist({
  always = false,
  className,
}: {
  always?: boolean;
  className?: string;
}) {
  const { vertical, data, spaceId, demo, canView, can } = usePro();
  const configured = checklistState(vertical, data);
  const steps = demo
    ? configured.steps
    : configured.steps
        .filter(
          (step) =>
            canView(step.section) &&
            REAL_STEP_COMMANDS[step.id] &&
            can(REAL_STEP_COMMANDS[step.id]),
        )
        .map((step) => {
          if (step.id === "classes")
            return {
              ...step,
              title: "Programa una clase",
              detail: "Elige fecha, plazas y quién la da.",
              done: data.sessions.some(
                (session) => session.status !== "cancelled",
              ),
            };
          if (step.id === "services")
            return { ...step, done: data.services.length > 0 };
          if (step.id === "tables")
            return {
              ...step,
              done: data.tables.some((table) => table.active !== false),
            };
          if (step.id === "courts")
            return { ...step, done: data.resources.length > 0 };
          return step;
        });
  const done = steps.filter((step) => step.done).length;
  const total = steps.length;
  if (!total) return null;
  if (!always && done === total) return null;
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-bg-primary p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Puesta en marcha</p>
          <h2 className="mt-1 font-heading text-lg font-bold">
            {done === total
              ? "Todo listo para recibir estudiantes"
              : `Te quedan ${total - done} pasos para estar al 100 %`}
          </h2>
        </div>
        <span className="text-sm font-semibold text-text-muted tabular">
          {done} de {total}
        </span>
      </div>
      <Meter
        value={done}
        max={total}
        className="mt-3"
        tone={done === total ? "success" : "violet"}
      />
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link
              href={sectionHref(spaceId, s.section)}
              className={cn(
                "group flex h-full flex-col gap-1 rounded-xl border px-3 py-2.5 transition-colors",
                s.done
                  ? "border-border-light bg-bg-secondary/60"
                  : "border-border hover:border-violet/40",
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    s.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border",
                  )}
                >
                  {s.done ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    s.done && "text-text-muted",
                  )}
                >
                  {s.title}
                </span>
              </span>
              <span className="pl-7 text-xs leading-snug text-text-muted">
                {s.detail}
              </span>
              {!s.done ? (
                <span className="mt-auto flex items-center gap-1 pl-7 pt-1 text-xs font-semibold text-violet">
                  Hacerlo ahora <ArrowRight className="h-3 w-3 arrow-nudge" />
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
