"use client";

import * as React from "react";
import { MessageSquareText, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { relative } from "@/lib/pro/format";
import type { CommunityActivity } from "@/lib/pro/community-types";
import {
  askRatingsNow,
  ratingAskAt,
  ratingLabel,
  ratingState,
  ratingSummary,
} from "@/lib/pro/community-feedback";
import { cn } from "@/lib/utils";
import { Empty } from "../../kit";

/**
 * Valoración tras la actividad: la nota media, cómo se reparte y lo que han
 * escrito quienes vinieron. Franky la pide sola 24 horas después de acabar.
 */

function patchActivity(d: ProData, id: string, fn: (a: CommunityActivity) => CommunityActivity): ProData {
  return {
    ...d,
    activities: d.activities.map((x) => (x.id === id ? fn(x as CommunityActivity) : x)),
  };
}

/** Cinco estrellas con las llenas en violeta. */
export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const full = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${ratingLabel(value)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden
          strokeWidth={1.8}
          className={cn(
            size === "md" ? "h-4 w-4" : "h-3 w-3",
            i <= full ? "fill-violet text-violet" : "text-border",
          )}
        />
      ))}
    </span>
  );
}

/** Nota media compacta para tarjetas y cabeceras ("4,5 · 44 notas"). */
export function RatingInline({ activity }: { activity: CommunityActivity }) {
  const r = ratingSummary(activity);
  if (!r.count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary">
      <Star className="h-3 w-3 fill-violet text-violet" strokeWidth={1.8} aria-hidden />
      <span className="tabular">{ratingLabel(r.avg)}</span>
      <span className="font-normal text-text-muted">· {r.count} notas</span>
    </span>
  );
}

export function FeedbackTab({ activity: a }: { activity: CommunityActivity }) {
  const { now, update } = usePro();
  const toast = useToast();
  const state = ratingState(a, now);
  const r = ratingSummary(a);
  const [showAll, setShowAll] = React.useState(false);

  const askNow = () => {
    update("activity.rating.ask", (d) =>
      patchActivity(d, a.id, (x) => askRatingsNow(x, new Date().toISOString())),
    );
    toast.success(
      "Valoración pedida",
      `Les llega a los ${a.checkedIn} que hicieron check-in. Las notas irán apareciendo aquí.`,
    );
  };

  if (state === "scheduled") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Send className="h-4 w-4 text-violet" strokeWidth={1.9} />
          Franky pide la nota {relative(ratingAskAt(a), now.getTime())}
        </p>
        <p className="text-sm text-text-muted">
          Les llega a los {a.checkedIn} que hicieron check-in, con tiempo para volver a casa y todavía con la
          actividad fresca. La media sale aquí y en la memoria.
        </p>
        <Button size="sm" variant="outline" className="self-start" onClick={askNow}>
          Pedirla ya
        </Button>
      </div>
    );
  }

  if (!r.count) {
    return (
      <Empty
        icon={MessageSquareText}
        title="Aún no ha llegado ninguna nota"
        body={
          state === "asked"
            ? `Se pidió ${relative(ratingAskAt(a), now.getTime())} a quienes hicieron check-in. Suelen contestar el mismo día.`
            : "Cuando haya gente con check-in, Franky les pedirá la nota al día siguiente."
        }
      />
    );
  }

  const max = Math.max(...r.distribution, 1);
  const comments = showAll ? r.comments : r.comments.slice(0, 4);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-2xl bg-bg-secondary p-4 sm:flex-row sm:items-center">
        <div className="shrink-0 sm:w-36">
          <p className="font-heading text-4xl font-extrabold tracking-[-0.03em] tabular">{ratingLabel(r.avg)}</p>
          <Stars value={r.avg} size="md" />
          <p className="mt-1 text-xs text-text-muted">
            {r.count} notas, el {r.responsePct} % de quienes vinieron
          </p>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5" aria-label="Reparto de las notas">
          {[5, 4, 3, 2, 1].map((s) => {
            const n = r.distribution[s - 1];
            return (
              <li key={s} className="flex items-center gap-2 text-xs">
                <span className="w-3 shrink-0 text-right font-semibold tabular text-text-muted">{s}</span>
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                  <span
                    className="block h-full rounded-full bg-violet"
                    style={{ width: `${Math.round((n / max) * 100)}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right tabular text-text-muted">{n}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {r.comments.length ? (
        <section>
          <h3 className="font-heading text-base font-bold">Lo que han escrito</h3>
          <ul className="mt-2 divide-y divide-border-light">
            {comments.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold">{c.name ?? "Asistente"}</span>
                    <Stars value={c.stars} />
                  </span>
                  <span className="shrink-0 text-xs text-text-muted">{relative(c.at, now.getTime())}</span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{c.comment}</p>
              </li>
            ))}
          </ul>
          {r.comments.length > 4 ? (
            <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Ver menos" : `Ver los ${r.comments.length} comentarios`}
            </Button>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-text-muted">Han puesto nota, pero nadie ha dejado comentario.</p>
      )}
    </div>
  );
}
