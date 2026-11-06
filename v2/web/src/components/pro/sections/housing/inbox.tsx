"use client";

import * as React from "react";
import { CalendarPlus, Check, ChevronDown, CircleSlash, Clock3, Inbox, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProLead } from "@/lib/pro/types";
import { money, pct } from "@/lib/pro/format";
import { shortDate, waitingLabel, waitingMinutes, waitingTone } from "@/lib/pro/housing";
import {
  agentStats,
  assignBest,
  inboxBuckets,
  recordReply,
  replyTemplates,
  whatsappHref,
  type InboxEntry,
} from "@/lib/pro/housing-ops";
import { cn } from "@/lib/utils";
import { Avatar, Empty, Panel, Pill } from "../../kit";
import { TONES } from "../../tones";
import { ErasmusBadge, RoomieBadge, UniBadge } from "./shared";

/**
 * Bandeja de interesados: los que encajan con algún piso arriba, con el porqué
 * y la mejor habitación; los que no, abajo y plegados. Resuelve la avalancha
 * de mensajes sin leerlos uno a uno.
 */
export function LeadInbox({ visible, onOpen }: { visible: Set<string>; onOpen: (id: string) => void }) {
  const { data } = usePro();
  const [showOut, setShowOut] = React.useState(false);
  const buckets = inboxBuckets(data);
  const fit = buckets.fit.filter((e) => visible.has(e.lead.id));
  const out = buckets.out.filter((e) => visible.has(e.lead.id));

  if (!fit.length && !out.length)
    return (
      <Empty
        icon={Inbox}
        title="Bandeja al día"
        body="Aquí llegan los estudiantes que escriben por Franky, ya separados entre los que encajan con tus pisos y los que no."
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <section aria-label={`Encajan con algún piso, ${fit.length}`}>
        <header className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Encajan con algún piso</h2>
          <span className="text-sm text-text-muted tabular">{fit.length}</span>
        </header>
        {fit.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {fit.map((e) => (
              <InboxCard key={e.lead.id} entry={e} onOpen={() => onOpen(e.lead.id)} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            Ninguno encaja ahora mismo con lo que tienes libre. Revisa los de abajo: quizá con otra fecha sí.
          </p>
        )}
      </section>

      {out.length ? (
        <section aria-label={`Fuera de presupuesto o de fechas, ${out.length}`}>
          <button
            type="button"
            aria-expanded={showOut}
            onClick={() => setShowOut((v) => !v)}
            className="mb-2 flex min-h-10 w-full items-center justify-between gap-2 text-left"
          >
            <span className="font-heading text-lg font-bold">Fuera de presupuesto o de fechas</span>
            <span className="inline-flex items-center gap-1.5 text-sm text-text-muted tabular">
              {out.length}
              <ChevronDown className={cn("h-4 w-4 transition-transform", showOut && "rotate-180")} />
            </span>
          </button>
          {showOut ? (
            <Panel flush>
              <div className="divide-y divide-border-light">
                {out.map((e) => (
                  <OutRow key={e.lead.id} entry={e} onOpen={() => onOpen(e.lead.id)} />
                ))}
              </div>
            </Panel>
          ) : (
            <p className="text-sm text-text-muted">Contéstales con un toque que ahora no hay hueco y quedan apuntados para cuando se libere algo.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}

function WaitTag({ lead }: { lead: ProLead }) {
  const { now } = usePro();
  if (lead.stage !== "new") return <Pill>Contactado</Pill>;
  const wait = waitingMinutes(lead, now);
  const tone = waitingTone(wait);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold tabular",
        tone === "danger" ? "text-rose-700 dark:text-rose-300" : tone === "warning" ? "text-amber-800 dark:text-amber-300" : "text-text-muted",
      )}
    >
      <Clock3 className="h-3.5 w-3.5" strokeWidth={1.9} /> {waitingLabel(wait)}
    </span>
  );
}

function InboxCard({ entry, onOpen }: { entry: InboxEntry; onOpen: () => void }) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const { lead, fit } = entry;
  const visit = replyTemplates(data, lead, now, vertical.id === "landlord").find((t) => t.id === "visit")!;
  const target = fit.best ? `${fit.best.room.name.replace("Habitación ", "H")} de ${fit.best.property.title}` : fit.wholeFlat ? `${fit.wholeFlat.property.title} entero` : "";
  const assigned = fit.best
    ? lead.roomId === fit.best.room.id && lead.propertyId === fit.best.property.id
    : Boolean(fit.wholeFlat && lead.propertyId === fit.wholeFlat.property.id);

  return (
    <article className="flex flex-col rounded-2xl border border-border bg-bg-primary shadow-card">
      <button type="button" onClick={onOpen} className="flex flex-col gap-2 rounded-t-2xl p-4 text-left hover:bg-bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40">
        <span className="flex items-start gap-3">
          <Avatar name={lead.name} size="sm" tone={lead.roomieGroup ? "violet" : lead.erasmus ? "sky" : "slate"} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-sm font-semibold">{lead.name}</span>
              <UniBadge university={lead.university} verified={lead.verified} />
            </span>
            <span className="block truncate text-xs text-text-muted">
              Entrada {shortDate(lead.moveIn)} · {lead.months} meses · hasta {money(lead.budgetCents)}
            </span>
          </span>
          <WaitTag lead={lead} />
        </span>
        {lead.roomieGroup || lead.erasmus ? (
          <span className="flex flex-wrap gap-1">
            {lead.roomieGroup ? <RoomieBadge group={lead.roomieGroup} /> : null}
            {lead.erasmus ? <ErasmusBadge /> : null}
          </span>
        ) : null}
        <ul className="flex flex-col gap-1 text-[0.82rem] text-text-secondary">
          {fit.reasons.slice(lead.verified ? 1 : 0, lead.verified ? 3 : 2).map((r) => (
            <li key={r} className="flex gap-1.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" strokeWidth={2} />
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
      </button>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border-light px-3 py-2.5">
        {assigned ? (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} /> {target}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              update("lead.assign.best", (d) => assignBest(d, lead.id));
              toast.success("Habitación asignada", `${target} para ${lead.name.split(" ")[0]}.`);
            }}
          >
            Asignar {target}
          </Button>
        )}
        <Button size="sm" variant="secondary" className="ml-auto" asChild>
          <a
            href={whatsappHref(visit.text)}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              update("lead.reply.visit", (d) => recordReply(assigned ? d : assignBest(d, lead.id), lead.id, visit, new Date().toISOString()));
              toast.success("Mensaje listo en WhatsApp", "Con el piso, el precio y tus franjas libres.");
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Proponer visita
          </a>
        </Button>
      </div>
    </article>
  );
}

function OutRow({ entry, onOpen }: { entry: InboxEntry; onOpen: () => void }) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const { lead, fit } = entry;
  const full = replyTemplates(data, lead, now, vertical.id === "landlord").find((t) => t.id === "full")!;
  const answered = lead.replies?.some((r) => r.id === "full");
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={lead.name} size="sm" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="truncate text-sm font-semibold">{lead.name}</span>
            <UniBadge university={lead.university} verified={lead.verified} />
          </span>
          <span className="flex items-start gap-1 text-xs text-amber-900 dark:text-amber-200">
            <CircleSlash className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.9} />
            <span className="min-w-0">{fit.issues[0]}</span>
          </span>
        </span>
      </button>
      {answered ? (
        <Pill>Contestado</Pill>
      ) : (
        <Button size="sm" variant="ghost" asChild>
          <a
            href={whatsappHref(full.text)}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              update("lead.reply.full", (d) => recordReply(d, lead.id, { ...full, nextStage: "contacted" }, new Date().toISOString()));
              toast.success("Mensaje listo en WhatsApp", `${lead.name.split(" ")[0]} queda apuntado por si se libera algo.`);
            }}
          >
            {full.label}
          </a>
        </Button>
      )}
    </div>
  );
}

/** Rendimiento de cada agente: solo lo ve quien dirige la inmobiliaria. */
export function AgentBoard() {
  const { data, now } = usePro();
  const stats = agentStats(data, now, 30);
  if (!stats.length) return <Empty title="Sin agentes todavía" body="Invita a tu equipo desde Equipo y reparte los interesados." />;
  return (
    <Panel title="Tu equipo, últimos 30 días" description="Interesados que lleva cada uno, lo que tarda en contestar, visitas y contratos." flush>
      <div className="-mx-px overflow-x-auto pro-scroll">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border-light text-left text-xs text-text-muted">
              <th className="px-4 py-2 font-medium sm:px-5">Agente</th>
              <th className="px-2 py-2 text-right font-medium">Activos</th>
              <th className="px-2 py-2 text-right font-medium">Sin contestar</th>
              <th className="px-2 py-2 text-right font-medium">Responde en</th>
              <th className="px-2 py-2 text-right font-medium">Visitas</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">Contratos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {stats.map((s) => (
              <tr key={s.staff.id}>
                <td className="px-4 py-2.5 sm:px-5">
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", TONES[s.staff.tone].bar)} />
                    <span className="font-semibold">{s.staff.name}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right tabular">{s.active}</td>
                <td className={cn("px-2 py-2.5 text-right tabular", s.waiting && "font-semibold text-amber-800 dark:text-amber-300")}>{s.waiting}</td>
                <td className="px-2 py-2.5 text-right tabular">{s.responseMin === null ? "Sin datos" : waitingLabel(s.responseMin)}</td>
                <td className="px-2 py-2.5 text-right tabular">
                  {s.visits}
                  {s.visits ? <span className="text-xs text-text-muted"> ({pct(s.visitsDone, s.visits)} % hechas)</span> : null}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular sm:px-5">{s.signed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
