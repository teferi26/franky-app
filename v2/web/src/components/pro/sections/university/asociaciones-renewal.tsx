"use client";

import * as React from "react";
import { ArrowRightLeft, BadgeCheck, Check, Crown, RefreshCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import { capitalize, relative } from "@/lib/pro/format";
import { uniExtrasOf } from "@/lib/pro/university";
import {
  BOARD_ROLES,
  BOARD_ROLE_LABEL,
  RENEWAL_LABEL,
  boardProblem,
  confirmRenewal,
  courseLabel,
  courseOf,
  handoverBoard,
  inheritanceOf,
  presidentOf,
  renewalState,
  renewalSummary,
  requestRenewals,
  type RenewalState,
} from "@/lib/pro/university-renewal";
import type { ProUniBoardMember, ProUniBoardRole, UniAssociation } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { Avatar, Empty, FormField, Meter, Panel, Pill, Row, RowList, Tip, inputClass } from "../../kit";
import { useUniAction } from "./ui";

const STATE_TONE: Record<RenewalState, "success" | "info" | "warning" | "neutral"> = {
  done: "success",
  partial: "info",
  requested: "warning",
  pending: "neutral",
};

/** Orden de la lista: lo que necesita un empujón, arriba. */
const STATE_ORDER: Record<RenewalState, number> = { pending: 0, requested: 1, partial: 2, done: 3 };

/** Botón principal de la vista: pedir la renovación a todas las que faltan. */
export function useRequestAllRenewals() {
  const { data, now } = usePro();
  const run = useUniAction();
  const summary = renewalSummary(data.uniAssociations as UniAssociation[], now);
  const request = () =>
    run(
      "association.renewal.request",
      (d) => ({ ...d, uniAssociations: requestRenewals(d.uniAssociations as UniAssociation[], now) }),
      summary.missing.length === 1 ? "Renovación pedida a 1 asociación" : `Renovación pedida a ${summary.missing.length} asociaciones`,
      "Les llega un aviso para confirmar junta y socios desde su espacio de Franky.",
    );
  return { summary, request };
}

export function RenewalView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now } = usePro();
  const all = data.uniAssociations as UniAssociation[];
  const course = courseOf(now);
  const summary = renewalSummary(all, now);
  const registered = all
    .filter((a) => a.registered)
    .map((a) => ({ a, state: renewalState(a, course) }))
    .sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || x.a.name.localeCompare(y.a.name));

  if (!summary.total) {
    return (
      <Panel>
        <Empty
          icon={RefreshCcw}
          title="Aún no hay asociaciones registradas"
          body="Cuando registres la primera, cada septiembre le pedirás aquí que confirme su junta y sus socios."
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel
        title={`Renovación del ${courseLabel(course)}`}
        description={`${summary.done} de ${summary.total} han confirmado junta y socios.`}
        flush
      >
        <div className="px-4 pb-1 pt-4 sm:px-5">
          <Meter value={summary.done} max={summary.total} tone={summary.done === summary.total ? "success" : "violet"} />
        </div>
        <RowList className="mt-3">
          {registered.map(({ a, state }) => {
            const president = presidentOf(a);
            return (
              <Row key={a.id} onClick={() => onOpen(a.id)}>
                <Avatar name={a.name} size="sm" tone={state === "done" ? "violet" : "slate"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {president ? `Presidencia: ${president}` : "Sin junta registrada"}
                    {state === "requested" && a.renewal?.requestedAt ? ` · pedida ${relative(a.renewal.requestedAt, now.getTime())}` : ""}
                    {state === "partial" ? ` · falta ${a.renewal?.boardConfirmed ? "confirmar socios" : "confirmar junta"}` : ""}
                  </span>
                </span>
                <Pill tone={STATE_TONE[state]}>{RENEWAL_LABEL[state]}</Pill>
              </Row>
            );
          })}
        </RowList>
      </Panel>

      <div className="flex min-w-0 flex-col gap-4">
        <Tip title="Cada septiembre">
          Pide la renovación a todas de una vez. Cada asociación confirma su junta y sus socios desde su espacio; tú solo miras quién falta.
        </Tip>
        <Tip title="Si cambia la junta">
          Abre la asociación y registra el traspaso. La junta nueva hereda documentos, actividades y créditos: nada depende de quien se va.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Junta, renovación y traspaso dentro de la ficha de la asociación    */
/* ------------------------------------------------------------------ */

const FORM_ROLES: ProUniBoardRole[] = ["presidencia", "secretaria", "tesoreria"];

export function GovernanceSection({ a }: { a: UniAssociation }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const course = courseOf(now);
  const state = renewalState(a, course);
  const [handing, setHanding] = React.useState(false);
  const [board, setBoard] = React.useState<Record<ProUniBoardRole, string>>({ presidencia: "", secretaria: "", tesoreria: "", vocal: "" });

  React.useEffect(() => {
    setHanding(false);
    setBoard({ presidencia: "", secretaria: "", tesoreria: "", vocal: "" });
  }, [a.id]);

  const patch = (next: UniAssociation, title: string, detail?: string) =>
    run(
      "association.update",
      (d) => ({ ...d, uniAssociations: d.uniAssociations.map((x) => (x.id === a.id ? next : x)) }),
      title,
      detail,
    );

  const newBoard: ProUniBoardMember[] = FORM_ROLES.map((role) => ({ role, name: board[role] }));
  const problem = boardProblem(newBoard);
  const inherits = inheritanceOf(a, extras.assocActivities, extras.credits);
  const confirmedBoard = a.renewal?.course === course && a.renewal.boardConfirmed;
  const confirmedMembers = a.renewal?.course === course && a.renewal.membersConfirmed;

  const handover = async () => {
    if (problem) return;
    const ok = await patch(
      handoverBoard(a, newBoard, now),
      "Traspaso registrado",
      `${board.presidencia.trim()} ya gestiona ${a.name} con todo lo que había.`,
    );
    if (ok) setHanding(false);
  };

  if (!a.registered) return null;

  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-heading text-sm font-bold">
          <Crown className="h-4 w-4 text-text-muted" strokeWidth={1.9} /> Junta y renovación
        </p>
        <Pill tone={STATE_TONE[state]}>
          {RENEWAL_LABEL[state]} {courseLabel(course)}
        </Pill>
      </div>

      {a.board?.length ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {[...a.board]
            .sort((x, y) => BOARD_ROLES.indexOf(x.role) - BOARD_ROLES.indexOf(y.role))
            .map((m) => (
              <li key={`${m.role}-${m.name}`} className="flex justify-between gap-3">
                <span className="text-text-muted">{BOARD_ROLE_LABEL[m.role]}</span>
                <span className="font-medium">{m.name}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">Aún no ha registrado su junta.</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => patch(confirmRenewal(a, now, { board: !confirmedBoard }), confirmedBoard ? "Junta sin confirmar" : "Junta confirmada")}
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm transition-colors",
            confirmedBoard ? "border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-border hover:border-text-primary/25",
          )}
          aria-pressed={Boolean(confirmedBoard)}
        >
          {confirmedBoard ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-border" />}
          Junta confirmada
        </button>
        <button
          type="button"
          onClick={() =>
            patch(confirmRenewal(a, now, { members: !confirmedMembers }), confirmedMembers ? "Socios sin confirmar" : "Socios confirmados", confirmedMembers ? undefined : `${a.members} socios este curso.`)
          }
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm transition-colors",
            confirmedMembers ? "border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-border hover:border-text-primary/25",
          )}
          aria-pressed={Boolean(confirmedMembers)}
        >
          {confirmedMembers ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border border-border" />}
          {a.members} socios confirmados
        </button>
      </div>

      {state !== "done" ? (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() =>
            patch(
              requestRenewals([a], now)[0],
              "Renovación pedida",
              `${a.name} recibe el aviso para confirmar junta y socios.`,
            )
          }
        >
          <Send className="h-4 w-4" /> {a.renewal?.course === course && a.renewal.requestedAt ? `Volver a pedirla (pedida ${relative(a.renewal.requestedAt, now.getTime())})` : "Pedir la renovación"}
        </Button>
      ) : null}

      {handing ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border-light pt-4">
          <p className="text-sm text-text-secondary">
            La junta nueva hereda {inherits.docs} documentos, {inherits.activities} actividades, {inherits.creditsValidated} créditos validados
            {inherits.creditsPending ? ` y ${inherits.creditsPending} por validar` : ""}.
          </p>
          {FORM_ROLES.map((role) => (
            <FormField key={role} label={`${BOARD_ROLE_LABEL[role]}${role === "tesoreria" ? " (opcional)" : ""}`} htmlFor={`board-${role}`}>
              <input
                id={`board-${role}`}
                className={inputClass}
                value={board[role]}
                onChange={(e) => setBoard((b) => ({ ...b, [role]: e.target.value }))}
                placeholder="Nombre y apellido"
              />
            </FormField>
          ))}
          {problem && (board.presidencia || board.secretaria) ? <p className="text-xs text-amber-800 dark:text-amber-300">{problem}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setHanding(false)}>
              Volver
            </Button>
            <Button variant="dark" onClick={handover} disabled={Boolean(problem)}>
              <BadgeCheck className="h-4 w-4" /> Registrar traspaso
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="mt-2 w-full" onClick={() => setHanding(true)}>
          <ArrowRightLeft className="h-4 w-4" /> Traspasar a una junta nueva
        </Button>
      )}

      {a.handovers?.length ? (
        <ol className="mt-4 flex flex-col gap-1.5 border-t border-border-light pt-3 text-xs text-text-muted">
          {[...a.handovers].reverse().map((h) => (
            <li key={h.at}>
              {capitalize(courseLabel(h.course))}: de {h.from} a {h.to}, {relative(h.at, now.getTime())}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
