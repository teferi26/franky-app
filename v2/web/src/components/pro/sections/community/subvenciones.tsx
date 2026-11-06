"use client";

import * as React from "react";
import { BadgeCheck, Check, FileText, Image as ImageIcon, Landmark, Megaphone, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProSubsidy } from "@/lib/pro/types";
import { localDate, money, shortDay } from "@/lib/pro/format";
import { communityLedger, withCommunityOps } from "@/lib/pro/community";
import type { CommunityArchiveDoc } from "@/lib/pro/community-types";
import { subsidyMemoryFromData } from "@/lib/pro/community-docs";
import {
  COUNCIL_MAX_CENTS,
  COUNCIL_TOTAL_CENTS,
  councilWindows,
  daysBetween,
  windowLabel,
  type CommunityActivity,
} from "@/lib/pro/demo/community";
import { cn } from "@/lib/utils";
import { Detail, Drawer, Empty, FormField, Kpi, KpiRow, Meter, PageHeader, Panel, Pill, Tip, inputClass, textareaClass } from "../../kit";
import { openPrintable } from "./files";

const STEPS: { id: ProSubsidy["status"]; label: string }[] = [
  { id: "preparing", label: "Preparando" },
  { id: "submitted", label: "Presentada" },
  { id: "granted", label: "Concedida" },
  { id: "justified", label: "Justificada" },
];

const DEFAULT_CHECKLIST = [
  "Inscrita en el Registro de Asociaciones Universitarias",
  "Proyecto y presupuesto de las actividades",
  "Certificado de estar al corriente con Hacienda",
  "Certificado de estar al corriente con la Seguridad Social",
  "Memoria de actividades con asistentes verificados",
  "Publicidad con el logo del Consejo de Estudiantes",
];

export default function CommunitySubvenciones() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const windows = councilWindows(now, 5);
  const [memoryFor, setMemoryFor] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const preparing = data.subsidies.find((s) => s.status === "preparing");
  const missing = preparing ? preparing.checklist.filter((c) => !c.done).length : 0;
  const nextWindow = windows[0];
  const daysLeft = nextWindow ? daysBetween(today, nextWindow) : 0;
  const granted = data.subsidies.filter((s) => s.status === "granted" || s.status === "justified").reduce((a, s) => a + s.requestedCents, 0);
  const pendingHalf = data.subsidies.filter((s) => s.status === "granted").reduce((a, s) => a + Math.round(s.requestedCents / 2), 0);
  const acts = (data.activities as CommunityActivity[]).filter((a) => a.status === "done");
  const verified = acts.reduce((a, x) => a + x.checkedIn, 0);

  const toggleItem = (s: ProSubsidy, idx: number) => {
    update("subsidy.check", (d) => ({
      ...d,
      subsidies: d.subsidies.map((x) =>
        x.id === s.id ? { ...x, checklist: x.checklist.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)) } : x,
      ),
    }));
  };

  const advance = (s: ProSubsidy, status: ProSubsidy["status"], title: string, detail: string) => {
    update("subsidy.status", (d) => ({ ...d, subsidies: d.subsidies.map((x) => (x.id === s.id ? { ...x, status } : x)) }));
    toast.success(title, detail);
  };

  const sorted = [...data.subsidies].sort((a, b) => STEPS.findIndex((x) => x.id === a.status) - STEPS.findIndex((x) => x.id === b.status));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Subvenciones"
        title="Subvenciones"
        description={
          preparing
            ? `La próxima ventana del Consejo de Estudiantes es el ${windowLabel(preparing.window)}, dentro de ${daysBetween(today, preparing.window)} días. ${missing ? `Te faltan ${missing} requisitos.` : "Lo tienes todo listo para presentarla."}`
            : `La próxima ventana del Consejo de Estudiantes es el ${windowLabel(nextWindow)}. Prepara la solicitud con tiempo.`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nueva solicitud
            </Button>
            <Button variant="dark" onClick={() => setMemoryFor(preparing?.id ?? data.subsidies[0]?.id ?? "none")}>
              <FileText className="h-4 w-4" /> Generar memoria
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Landmark} label="Concedido este curso" value={money(granted, { round: true })} hint={pendingHalf ? `${money(pendingHalf, { round: true })} llegan al justificar` : "Todo cobrado"} emphasis />
        <Kpi icon={FileText} label="Próxima ventana" value={`${daysLeft} días`} hint={`Hasta el ${windowLabel(nextWindow)}`} />
        <Kpi icon={Users} label="Asistentes verificados" value={verified} hint="Listos para la memoria" />
        <Kpi icon={ImageIcon} label="Fotos de actividades" value={acts.reduce((a, x) => a + (x.photos ?? 0), 0)} hint={`De ${acts.length} actividades hechas`} />
      </KpiRow>

      <section aria-label="Ventanas de solicitud" className="overflow-x-auto pro-scroll">
        <ol className="flex min-w-max gap-2">
          {windows.map((w, i) => (
            <li
              key={w}
              className={cn(
                "flex w-36 flex-col rounded-2xl border px-3.5 py-3",
                i === 0 ? "border-violet/30 bg-violet-50" : "border-border bg-bg-primary",
              )}
            >
              <span className={cn("text-[0.7rem] font-semibold uppercase tracking-wider", i === 0 ? "text-violet-deep" : "text-text-muted")}>
                {i === 0 ? "Siguiente" : `Ventana ${i + 1}`}
              </span>
              <span className="mt-1 font-heading text-base font-bold capitalize">{windowLabel(w)}</span>
              <span className="text-xs text-text-muted tabular">en {daysBetween(today, w)} días</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {sorted.length ? (
            sorted.map((s) => {
              const done = s.checklist.filter((c) => c.done).length;
              const stepIdx = STEPS.findIndex((x) => x.id === s.status);
              const ready = done === s.checklist.length;
              return (
                <article key={s.id} className="rounded-2xl border border-border bg-bg-primary shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-light px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <h2 className="font-heading text-base font-bold">{s.call}</h2>
                      <p className="mt-0.5 text-sm text-text-muted">
                        {s.status === "preparing" ? `Ventana del ${windowLabel(s.window)}` : `Presentada en la ventana del ${shortDay(`${s.window}T12:00:00Z`)}`} · pides{" "}
                        <span className="font-semibold text-text-primary tabular">{money(s.requestedCents, { round: true })}</span>
                      </p>
                    </div>
                    <Pill tone={s.status === "granted" || s.status === "justified" ? "success" : s.status === "submitted" ? "info" : "warning"}>
                      {STEPS[stepIdx]?.label}
                    </Pill>
                  </div>

                  <ol className="grid grid-cols-4 gap-1 px-4 pt-4 sm:px-5" aria-label="Estado">
                    {STEPS.map((st, i) => (
                      <li key={st.id} className="flex flex-col gap-1.5">
                        <span className={cn("h-1.5 rounded-full", i <= stepIdx ? "bg-violet" : "bg-bg-tertiary")} />
                        <span className={cn("truncate text-[0.7rem] font-semibold", i <= stepIdx ? "text-text-primary" : "text-text-muted")}>{st.label}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="px-4 py-4 sm:px-5">
                    <div className="mb-1.5 flex justify-between text-xs text-text-muted">
                      <span>{s.status === "granted" ? "Para justificar" : "Requisitos"}</span>
                      <span className="tabular">
                        {done} de {s.checklist.length}
                      </span>
                    </div>
                    <Meter value={done} max={s.checklist.length} tone={ready ? "success" : "violet"} />
                    <ul className="mt-3 flex flex-col gap-1">
                      {s.checklist.map((c, i) => (
                        <li key={c.label}>
                          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-bg-secondary">
                            <input type="checkbox" className="sr-only" checked={c.done} onChange={() => toggleItem(s, i)} />
                            <span
                              aria-hidden
                              className={cn(
                                "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                                c.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                              )}
                            >
                              {c.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                            </span>
                            <span className={cn(c.done && "text-text-muted line-through decoration-text-muted/40")}>{c.label}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-border-light px-4 py-3 sm:px-5">
                    {s.status === "preparing" || s.status === "granted" ? (
                      <Button size="sm" variant="outline" onClick={() => setMemoryFor(s.id)}>
                        <FileText className="h-3.5 w-3.5" /> {s.status === "granted" ? "Memoria de justificación" : "Generar memoria"}
                      </Button>
                    ) : null}
                    {s.status === "preparing" ? (
                      <Button
                        size="sm"
                        variant="dark"
                        disabled={!ready}
                        onClick={() => advance(s, "submitted", "Solicitud presentada", `Pides ${money(s.requestedCents, { round: true })}. Te avisamos cuando haya resolución.`)}
                      >
                        {ready ? "Marcar como presentada" : `Faltan ${s.checklist.length - done}`}
                      </Button>
                    ) : null}
                    {s.status === "submitted" ? (
                      <Button size="sm" variant="dark" onClick={() => advance(s, "granted", "Subvención concedida", `Llega el 50 % por adelantado: ${money(Math.round(s.requestedCents / 2), { round: true })}.`)}>
                        Marcar como concedida
                      </Button>
                    ) : null}
                    {s.status === "granted" ? (
                      <Button
                        size="sm"
                        variant="dark"
                        disabled={!ready}
                        onClick={() => advance(s, "justified", "Subvención justificada", `Llega el otro 50 %: ${money(Math.round(s.requestedCents / 2), { round: true })}.`)}
                      >
                        {ready ? "Marcar como justificada" : `Faltan ${s.checklist.length - done} para justificar`}
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={Landmark}
                title="Aún no has pedido ninguna subvención"
                body="Empieza una solicitud y Franky te dice qué falta. La memoria se prepara sola con tus actividades y asistentes."
                action={
                  <Button variant="dark" onClick={() => setCreating(true)}>
                    Nueva solicitud
                  </Button>
                }
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Ayudas del Consejo de Estudiantes" description="Lo que conviene tener presente.">
            <div className="divide-y divide-border-light">
              <Detail label="Fondo total">{money(COUNCIL_TOTAL_CENTS, { round: true })}</Detail>
              <Detail label="Máximo por asociación y año">{money(COUNCIL_MAX_CENTS, { round: true })}</Detail>
              <Detail label="Cobro">50 % al conceder, 50 % al justificar</Detail>
              <Detail label="Ventanas al año">{windows.length}</Detail>
            </div>
          </Panel>
          <Tip title="Para no perder el segundo pago">
            Pide las facturas a nombre del CIF de la asociación, pon el logo del Consejo en la publicidad y ten los certificados de Hacienda y Seguridad Social dentro de los 30 días. Franky te avisa antes de cada plazo.
          </Tip>
        </div>
      </div>

      <MemoryDrawer subsidyId={memoryFor} onClose={() => setMemoryFor(null)} />
      <NewSubsidyDrawer open={creating} onClose={() => setCreating(false)} windows={windows} />
    </div>
  );
}

function MemoryDrawer({ subsidyId, onClose }: { subsidyId: string | null; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const subsidy = data.subsidies.find((s) => s.id === subsidyId);
  const acts = (data.activities as CommunityActivity[])
    .filter((a) => a.status === "done")
    .sort((a, b) => b.date.localeCompare(a.date));
  const verified = acts.reduce((a, x) => a + x.checkedIn, 0);
  const photos = acts.reduce((a, x) => a + (x.photos ?? 0), 0);
  const withLogo = acts.filter((a) => a.councilLogo).length;
  const ledger = communityLedger(data, now);
  const expenses = ledger.expenses.filter((l) => l.key !== "franky").reduce((a, l) => a + l.cents, 0);

  const generate = () => {
    const html = subsidyMemoryFromData(data, subsidy?.id ?? null, now);
    if (!html) return;
    const title = subsidy ? `Memoria: ${subsidy.call}` : "Memoria de actividades";
    const doc: CommunityArchiveDoc = {
      id: localId("d"),
      title,
      kind: "memoria",
      at: new Date().toISOString(),
      by: "Secretaría",
      // Se vuelve a generar al abrirla: siempre con la asistencia al día.
      source: { type: "memory", subsidyId: subsidy?.id ?? "" },
    };
    update("subsidy.memory", (d) => {
      const next = subsidy
        ? {
            ...d,
            subsidies: d.subsidies.map((x) =>
              x.id === subsidy.id
                ? { ...x, checklist: x.checklist.map((c) => (/memoria/i.test(c.label) ? { ...c, done: true } : c)) }
                : x,
            ),
          }
        : d;
      return withCommunityOps(next, (o) => ({
        ...o,
        documents: [
          doc,
          ...o.documents.filter(
            (x) => !(x.source?.type === "memory" && x.source.subsidyId === (subsidy?.id ?? "")),
          ),
        ],
      }));
    });
    const opened = openPrintable(html, title);
    toast.success(
      "Memoria lista",
      `${acts.length} actividades, ${verified} asistentes y ${photos} fotos. ` +
        (opened ? "Guárdala en PDF desde la ventana de impresión." : "Se ha descargado y queda en el archivo."),
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(subsidyId)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title="Memoria de actividades"
      description={subsidy ? subsidy.call : "Con tus actividades, asistentes verificados y fotos."}
      footer={
        <Button variant="dark" onClick={generate} disabled={!acts.length}>
          <FileText className="h-4 w-4" /> Generar memoria en PDF
        </Button>
      }
    >
      {acts.length ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MemoryStat icon={FileText} label="Actividades" value={acts.length} />
            <MemoryStat icon={BadgeCheck} label="Asistentes verificados" value={verified} />
            <MemoryStat icon={ImageIcon} label="Fotos" value={photos} />
            <MemoryStat icon={Megaphone} label="Con logo del Consejo" value={`${withLogo}/${acts.length}`} />
          </div>
          {expenses ? (
            <p className="text-sm text-text-secondary">
              Incluye los gastos del curso por categoría:{" "}
              <span className="font-semibold text-text-primary tabular">{money(expenses)}</span>, sacados de la caja.
            </p>
          ) : null}
          <ul className="divide-y divide-border-light rounded-2xl border border-border">
            {acts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.title}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {shortDay(a.date)} · {a.checkedIn} asistentes con check-in · {a.photos ?? 0} fotos
                  </span>
                </span>
                {a.councilLogo ? <Pill tone="success">Logo</Pill> : <Pill tone="warning">Sin logo</Pill>}
              </li>
            ))}
          </ul>
          {withLogo < acts.length ? (
            <p className="text-sm text-text-muted">
              {acts.length - withLogo} actividad no llevó el logo del Consejo en la publicidad. Puedes incluirla, pero quizá no cuente para la justificación.
            </p>
          ) : null}
          <Tip title="Sin hojas de firmas">La lista de asistentes sale del check-in con cuenta universitaria. Nadie tiene que escanear papeles.</Tip>
        </div>
      ) : (
        <Empty icon={FileText} title="Aún no hay actividades hechas" body="Cuando cierres tu primera actividad con check-in, aparecerá aquí con sus asistentes y fotos." />
      )}
    </Drawer>
  );
}

function MemoryStat({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-bg-secondary px-3 py-2.5">
      <Icon className="h-4 w-4 text-violet" strokeWidth={1.9} />
      <p className="mt-1.5 font-heading text-lg font-bold tabular">{value}</p>
      <p className="text-[0.7rem] leading-tight text-text-muted">{label}</p>
    </div>
  );
}

function NewSubsidyDrawer({ open, onClose, windows }: { open: boolean; onClose: () => void; windows: string[] }) {
  const { update } = usePro();
  const toast = useToast();
  const [call, setCall] = React.useState("");
  const [win, setWin] = React.useState(windows[0] ?? "");
  const [amount, setAmount] = React.useState("1500");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setCall("Ayudas del Consejo de Estudiantes a asociaciones");
    setWin(windows[0] ?? "");
    setAmount("1500");
    setNotes("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cents = Math.round(Number(amount.replace(",", ".")) * 100) || 0;
  const tooMuch = cents > COUNCIL_MAX_CENTS;

  const save = () => {
    const s: ProSubsidy = {
      id: localId("sb"),
      call: call.trim(),
      window: win,
      requestedCents: cents,
      status: "preparing",
      checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: /Registro/.test(label) })),
    };
    update("subsidy.create", (d) => ({ ...d, subsidies: [s, ...d.subsidies] }));
    toast.success("Solicitud empezada", `Tienes hasta el ${windowLabel(win)}. Te avisamos de lo que falte.`);
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva solicitud"
      description="Franky te dice qué falta y prepara la memoria."
      footer={
        <Button variant="dark" onClick={save} disabled={!call.trim() || !cents || tooMuch}>
          Empezar solicitud
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Convocatoria" htmlFor="sb-call">
          <input id="sb-call" className={inputClass} value={call} onChange={(e) => setCall(e.target.value)} />
        </FormField>
        <FormField label="Ventana" htmlFor="sb-window">
          <select id="sb-window" className={inputClass} value={win} onChange={(e) => setWin(e.target.value)}>
            {windows.map((w) => (
              <option key={w} value={w}>
                {windowLabel(w)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Importe que pides" htmlFor="sb-amount" hint={tooMuch ? `El máximo es ${money(COUNCIL_MAX_CENTS, { round: true })} por asociación y año.` : "Lo que necesitas para las actividades del proyecto."}>
          <div className="relative">
            <input id="sb-amount" inputMode="decimal" aria-invalid={tooMuch} className={cn(inputClass, "pr-8", tooMuch && "border-error")} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">€</span>
          </div>
        </FormField>
        <FormField label="Para qué es" htmlFor="sb-notes">
          <textarea id="sb-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Festival de cortos, cinefórum semanal y taller de guion." />
        </FormField>
      </div>
    </Drawer>
  );
}
