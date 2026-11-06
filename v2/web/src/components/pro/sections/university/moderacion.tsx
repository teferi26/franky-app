"use client";

import * as React from "react";
import { AlertOctagon, CheckCircle2, Download, EyeOff, Flag, History, Scale, ShieldCheck, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePro } from "@/lib/pro/store";
import type { ProUniModeration } from "@/lib/pro/types";
import { dayLabel, durationLabel, localDate, relative, time } from "@/lib/pro/format";
import { filterHistory, fraudSignals, harmScore, medianResponseMinutes, moderationCsv, sortModerationQueue } from "@/lib/pro/university";
import type { UniModeration } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { Detail, Drawer, Empty, FormField, Kpi, KpiRow, PageHeader, Panel, Pill, Segmented, Tip, inputClass, textareaClass } from "../../kit";
import { downloadCsv, useUniAction } from "./ui";

type Tab = "pending" | "history";

const STATUS: Record<ProUniModeration["status"], { label: string; tone: "warning" | "danger" | "success" }> = {
  pending: { label: "Pendiente", tone: "warning" },
  hidden: { label: "Ocultado", tone: "danger" },
  kept: { label: "Se mantiene", tone: "success" },
};

export default function UniversityModeracion() {
  const { data, now } = usePro();
  const run = useUniAction();
  const [tab, setTab] = React.useState<Tab>("pending");
  const [open, setOpen] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const all = data.uniModeration as UniModeration[];
  const pending = sortModerationQueue(all.filter((m) => m.status === "pending"));
  const history = filterHistory(all, { reason: reason || undefined, from: from || undefined, to: to || undefined }).sort((a, b) =>
    (b.decidedAt ?? b.at).localeCompare(a.decidedAt ?? a.at),
  );
  const reasons = [...new Set(all.filter((m) => m.status !== "pending").map((m) => m.reason))].sort();
  const response = medianResponseMinutes(all, now);
  const severe = pending.filter((m) => harmScore(m) >= 3).length;
  const list = tab === "pending" ? pending : history;

  const decide = (m: UniModeration, status: "hidden" | "kept", note?: string) =>
    run(
      "moderation.decide",
      (d) => ({
        ...d,
        uniModeration: (d.uniModeration as UniModeration[]).map((x) =>
          x.id === m.id ? { ...x, status, note: note?.trim() || x.note, decidedAt: now.toISOString(), decidedBy: d.space.owner.firstName } : x,
        ),
      }),
      status === "hidden" ? "Contenido ocultado" : "Contenido mantenido",
      status === "hidden" ? "Deja de verse en tu campus. Quien lo publicó puede apelar a Franky." : "Se archivan los reportes y no vuelve a la cola por el mismo motivo.",
    );

  const exportLog = () => downloadCsv(`convivencia-${localDate(now)}.csv`, moderationCsv(history));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Moderación"
        title="Moderación del campus"
        description={
          pending.length
            ? `${pending.length} contenidos reportados esperan revisión${severe ? `, ${severe} de ellos graves (fraude, acoso o suplantación)` : ""}. Lo más dañino va arriba.`
            : "No hay nada pendiente. Todo lo reportado en tu campus está revisado."
        }
        actions={
          tab === "history" ? (
            <Button variant="dark" onClick={exportLog} disabled={!history.length}>
              <Download className="h-4 w-4" /> Registro para la Comisión
            </Button>
          ) : pending.length ? (
            <Button variant="dark" onClick={() => setOpen(pending[0].id)}>
              <Flag className="h-4 w-4" /> Revisar el siguiente
            </Button>
          ) : null
        }
      >
        <Segmented<Tab>
          label="Cola"
          value={tab}
          onChange={setTab}
          options={[
            { value: "pending", label: "Pendientes", count: pending.length },
            { value: "history", label: "Decisiones", count: all.length - pending.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Flag} label="Pendientes" value={pending.length} hint={severe ? `${severe} graves arriba del todo` : "Nada grave en cola"} emphasis={pending.length > 0} onClick={() => setTab("pending")} />
        <Kpi icon={EyeOff} label="Ocultados" value={all.filter((m) => m.status === "hidden").length} hint="En el historial" onClick={() => setTab("history")} />
        <Kpi icon={CheckCircle2} label="Mantenidos" value={all.filter((m) => m.status === "kept").length} hint="Reportes sin fundamento" />
        <Kpi icon={Timer} label="Tiempo de respuesta" value={response === null ? "Sin datos" : durationLabel(response)} hint="Mediana de los últimos 30 días" />
      </KpiRow>

      {tab === "history" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px] sm:gap-3">
          <select aria-label="Motivo" className={cn(inputClass, "col-span-2 sm:col-span-1")} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Todos los motivos</option>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <input aria-label="Desde" type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input aria-label="Hasta" type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {list.length ? (
            <ul className="flex flex-col gap-3">
              {list.map((m, i) => {
                const signals = fraudSignals(m.content);
                const grave = harmScore(m) >= 3;
                return (
                  <li key={m.id} className="animate-list-in" style={{ "--i": i } as React.CSSProperties}>
                    <article className={cn("rounded-2xl border bg-bg-primary shadow-card", grave && m.status === "pending" ? "border-rose-500/30" : "border-border")}>
                      <button
                        type="button"
                        onClick={() => setOpen(m.id)}
                        className="block w-full rounded-t-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:p-5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          {grave && m.status === "pending" ? (
                            <Pill tone="danger">
                              <AlertOctagon className="h-3 w-3" /> Grave
                            </Pill>
                          ) : null}
                          <Pill tone={m.reports >= 5 ? "danger" : "neutral"}>
                            <Flag className="h-3 w-3" /> {m.reports} reportes
                          </Pill>
                          {m.where ? <Pill>{m.where}</Pill> : null}
                          {m.status !== "pending" ? <Pill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Pill> : null}
                          <span className="text-xs text-text-muted">{relative(m.decidedAt ?? m.at, now.getTime())}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">{m.reason}</p>
                        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-text-secondary">{m.content}</blockquote>
                        {signals.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {signals.map((s) => (
                              <Pill key={s.key} tone="warning">
                                {s.label}
                              </Pill>
                            ))}
                          </div>
                        ) : null}
                        {m.note && m.status !== "pending" ? <p className="mt-2 text-xs text-text-muted">Nota: {m.note}</p> : null}
                      </button>
                      {m.status === "pending" ? (
                        <div className="flex justify-end gap-2 border-t border-border-light px-4 py-3 sm:px-5">
                          <Button variant="outline" onClick={() => decide(m, "kept")}>
                            Mantener
                          </Button>
                          <Button variant="dark" onClick={() => decide(m, "hidden")}>
                            <EyeOff className="h-4 w-4" /> Ocultar
                          </Button>
                        </div>
                      ) : null}
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={tab === "pending" ? ShieldCheck : History}
                title={tab === "pending" ? "Cola vacía" : reason || from || to ? "Nada con estos filtros" : "Sin decisiones todavía"}
                body={
                  tab === "pending"
                    ? "Cuando alguien reporte algo publicado en tu campus, aparecerá aquí para que decidas. Los timos de pisos y trabajo se marcan solos."
                    : "Aquí queda cada decisión con su fecha, quién la tomó y la nota. Lo descargas para la Comisión de Convivencia."
                }
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Hasta dónde llega tu moderación">
            <ul className="flex flex-col gap-3 text-sm text-text-secondary">
              <li className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                Solo ves y decides sobre lo publicado en tu campus.
              </li>
              <li className="flex gap-2.5">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                Quien publicó puede apelar a Franky, que revisa tu decisión.
              </li>
              <li className="flex gap-2.5">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
                Ocultar no borra: el contenido deja de verse en tu campus mientras se resuelve.
              </li>
            </ul>
          </Panel>
          <Tip title="Primero lo que más daña">
            Fraude, acoso y suplantación van arriba aunque tengan menos reportes. Franky marca solo las señales de timo más comunes: fianza en efectivo, sin contrato, pago antes de ver el piso o que pidan el DNI.
          </Tip>
        </div>
      </div>

      <ModerationDrawer id={open} onClose={() => setOpen(null)} onDecide={decide} />
    </div>
  );
}

function ModerationDrawer({
  id,
  onClose,
  onDecide,
}: {
  id: string | null;
  onClose: () => void;
  onDecide: (m: UniModeration, status: "hidden" | "kept", note?: string) => Promise<boolean>;
}) {
  const { data } = usePro();
  const [note, setNote] = React.useState("");
  const m = (data.uniModeration as UniModeration[]).find((x) => x.id === id);

  React.useEffect(() => {
    setNote("");
  }, [id]);

  if (!m) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Reporte">
        <span />
      </Drawer>
    );
  }
  const act = async (status: "hidden" | "kept") => {
    if (await onDecide(m, status, note)) onClose();
  };
  const signals = fraudSignals(m.content);
  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      title={m.reason}
      description={`${m.where ?? "Contenido"} · ${dayLabel(m.at)} a las ${time(m.at)}`}
      footer={
        m.status === "pending" ? (
          <>
            <Button variant="outline" onClick={() => act("kept")}>
              Mantener
            </Button>
            <Button variant="dark" onClick={() => act("hidden")}>
              <EyeOff className="h-4 w-4" /> Ocultar
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => act(m.status === "hidden" ? "kept" : "hidden")}>
            {m.status === "hidden" ? "Volver a mostrar" : "Ocultar ahora"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <blockquote className={cn("rounded-2xl border border-border bg-bg-secondary/60 p-4 text-sm", m.status === "hidden" && "text-text-muted")}>{m.content}</blockquote>
        {signals.length ? (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Señales de timo</p>
            <ul className="mt-1 list-inside list-disc">
              {signals.map((s) => (
                <li key={s.key}>{s.label}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="divide-y divide-border-light">
          <Detail label="Reportes">{m.reports}</Detail>
          <Detail label="Dónde">{m.where ?? "Campus"}</Detail>
          <Detail label="Estado">
            <Pill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Pill>
          </Detail>
          {m.decidedAt ? (
            <Detail label="Decidido">
              {dayLabel(m.decidedAt, { weekday: false })}
              {m.decidedBy ? `, por ${m.decidedBy}` : ""}
            </Detail>
          ) : null}
          {m.note ? <Detail label="Nota interna">{m.note}</Detail> : null}
        </div>
        <FormField label={m.status === "pending" ? "Nota interna (opcional)" : "Cambiar la nota (opcional)"} htmlFor="mod-note" hint="Queda en el registro. La ve tu equipo y Franky si hay apelación.">
          <textarea id="mod-note" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por qué lo ocultas o lo mantienes." />
        </FormField>
      </div>
    </Drawer>
  );
}
