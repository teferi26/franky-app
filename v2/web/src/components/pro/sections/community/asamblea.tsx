"use client";

import * as React from "react";
import {
  Archive,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  ListChecks,
  MapPin,
  MessageCircle,
  Plus,
  Printer,
  Trash2,
  Users,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { addDays, atLocal, dayLabel, localDate, relative, shortDay, time } from "@/lib/pro/format";
import {
  ASSEMBLY_KIND_LABEL,
  assemblyCallText,
  assemblyMinutesText,
  assemblyVoters,
  communityOps,
  openTasks,
  parseClock,
  quorumState,
  voteCheck,
  whatsAppShareUrl,
  withCommunityOps,
} from "@/lib/pro/community";
import type {
  CommunityAgendaItem,
  CommunityAssembly,
  CommunityAssemblyKind,
  CommunityMember,
  CommunityTask,
} from "@/lib/pro/community-types";
import { representationCertificateHtml, textDocumentHtml } from "@/lib/pro/community-docs";
import { REPRESENTATION_MIN_PCT, representationAttendance } from "@/lib/pro/community-registry";
import { daysBetween } from "@/lib/pro/demo/community";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  IconButton,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { openPrintable } from "./files";

type Tab = "orden" | "asistencia" | "votaciones" | "acta";

function patchAssembly(d: ProData, id: string, fn: (a: CommunityAssembly) => CommunityAssembly): ProData {
  return withCommunityOps(d, (o) => ({
    ...o,
    assemblies: o.assemblies.map((x) => (x.id === id ? fn(x) : x)),
  }));
}

const STATUS: Record<CommunityAssembly["status"], { label: string; tone: "violet" | "success" | "neutral" }> = {
  convocada: { label: "Convocada", tone: "violet" },
  en_curso: { label: "En marcha", tone: "success" },
  cerrada: { label: "Cerrada", tone: "neutral" },
};

export default function CommunityAsamblea() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const ops = communityOps(data);
  const members = data.communityMembers as CommunityMember[];
  const today = localDate(now);
  const [open, setOpen] = React.useState<string | null>(null);
  const [convoking, setConvoking] = React.useState(false);
  const [taskFor, setTaskFor] = React.useState<{ title: string; assemblyId?: string } | null>(null);

  const assemblies = [...ops.assemblies].sort((a, b) => b.date.localeCompare(a.date));
  const live = assemblies.filter((a) => a.status !== "cerrada").sort((a, b) => a.date.localeCompare(b.date));
  const next = live[0];
  const past = assemblies.filter((a) => a.status === "cerrada");
  const general = next ?? ({ kind: "ordinaria" } as CommunityAssembly);
  const voters = assemblyVoters(general, members, data.board).length;
  const tasks = openTasks(ops.tasks);
  const overdue = tasks.filter((t) => t.due < today).length;
  const minutesDocs = ops.documents.filter((d) => d.kind === "acta").length;

  const toggleTask = (t: CommunityTask) => {
    update("community.task.toggle", (d) =>
      withCommunityOps(d, (o) => ({
        ...o,
        tasks: o.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
      })),
    );
    if (!t.done) toast.success("Tarea hecha", t.title);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Asamblea"
        title="Asambleas y reuniones"
        description={
          next
            ? `${next.kind === "junta" ? next.title : ASSEMBLY_KIND_LABEL[next.kind]} ${relative(next.date, now.getTime())}. ${voters} ${next.kind === "junta" ? "personas de la junta" : "socios al corriente"} pueden votar.`
            : "Convoca la asamblea desde aquí: llega a todos los socios, cuenta el quórum en la sala y el acta se escribe sola."
        }
        actions={
          <Button variant="dark" onClick={() => setConvoking(true)}>
            <Vote className="h-4 w-4" /> Convocar
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          icon={CalendarClock}
          label="Próxima"
          value={next ? `${Math.max(0, daysBetween(today, localDate(next.date)))} días` : "Sin fecha"}
          hint={next ? shortDay(next.date) : "Convoca la siguiente"}
          emphasis={Boolean(next)}
          onClick={next ? () => setOpen(next.id) : undefined}
        />
        <Kpi icon={Users} label="Socios con voto" value={assemblyVoters({ kind: "ordinaria" } as CommunityAssembly, members, data.board).length} hint="Activos y al corriente de la cuota" />
        <Kpi icon={ListChecks} label="Tareas abiertas" value={tasks.length} hint={overdue ? `${overdue} fuera de plazo` : "Todas en plazo"} />
        <Kpi icon={FileText} label="Actas en el archivo" value={minutesDocs} hint="Se guardan en Junta" />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          {next ? (
            <NextAssembly assembly={next} onOpen={() => setOpen(next.id)} />
          ) : (
            <Panel>
              <Empty
                icon={Vote}
                title="No hay ninguna asamblea convocada"
                body="La ordinaria aprueba las cuentas y el presupuesto al menos una vez al año. Convócala y el orden del día llega al Franky de cada socio."
                action={
                  <Button variant="dark" onClick={() => setConvoking(true)}>
                    Convocar asamblea
                  </Button>
                }
              />
            </Panel>
          )}

          <Panel title="Celebradas" description="Con su asistencia, votaciones y acta." flush>
            {past.length ? (
              <ul className="divide-y divide-border-light">
                {past.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(a.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.title}</span>
                        <span className="block truncate text-xs text-text-muted">
                          {shortDay(a.date)} · {a.presentIds.length} presentes ·{" "}
                          {a.agenda.filter((x) => x.result === "approved").length} acuerdos aprobados
                        </span>
                      </span>
                      {a.archivedDocId ? <Pill tone="success">Acta archivada</Pill> : <Pill tone="warning">Acta sin archivar</Pill>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">Aquí quedarán las asambleas y reuniones cerradas.</p>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Tareas de la junta"
            description="Lo que salió de las reuniones, con responsable y fecha."
            action={
              <Button size="sm" variant="ghost" onClick={() => setTaskFor({ title: "" })}>
                <Plus className="h-3.5 w-3.5" /> Tarea
              </Button>
            }
            flush
          >
            {ops.tasks.length ? (
              <ul className="divide-y divide-border-light">
                {[...tasks, ...ops.tasks.filter((t) => t.done)].slice(0, 12).map((t) => (
                  <li key={t.id}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-bg-secondary sm:px-5">
                      <input type="checkbox" className="sr-only" checked={t.done} onChange={() => toggleTask(t)} />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                        )}
                      >
                        {t.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-semibold", t.done && "text-text-muted line-through decoration-text-muted/40")}>
                          {t.title}
                        </span>
                        <span className={cn("block text-xs", !t.done && t.due < today ? "text-rose-700 dark:text-rose-300" : "text-text-muted")}>
                          {t.owner} · {!t.done && t.due < today ? "tocaba el " : "hasta el "}
                          {shortDay(`${t.due}T12:00:00Z`)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-text-muted sm:px-5">
                Cada acuerdo puede convertirse en una tarea con responsable. Salen en el resumen hasta que se hagan.
              </p>
            )}
          </Panel>
          <BoardAttendance />
          <Tip title="Sin papel y sin actas a medias">
            En la sala, cada socio enseña su carné de Franky y cuenta para el quórum. Apuntas los votos de cada
            punto y, al cerrar, el acta sale escrita con asistentes, votaciones y acuerdos.
          </Tip>
        </div>
      </div>

      <AssemblyDrawer id={open} onClose={() => setOpen(null)} onTask={(title, assemblyId) => setTaskFor({ title, assemblyId })} />
      <ConvokeDrawer
        open={convoking}
        onClose={() => setConvoking(false)}
        onCreated={(id) => {
          setConvoking(false);
          setOpen(id);
        }}
      />
      <TaskDrawer seed={taskFor} onClose={() => setTaskFor(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NextAssembly({ assembly: a, onOpen }: { assembly: CommunityAssembly; onOpen: () => void }) {
  const { data, now } = usePro();
  const members = data.communityMembers as CommunityMember[];
  const q = quorumState(a, members, data.board, now);
  const call = whatsAppShareUrl(assemblyCallText(a, data.space.name));
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg-primary shadow-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <div className="flex shrink-0 flex-row items-center gap-3 sm:w-28 sm:flex-col sm:items-start sm:border-r sm:border-border-light sm:pr-5">
          <div>
            <p className="eyebrow">{a.status === "en_curso" ? "Ahora" : "Próxima"}</p>
            <p className="mt-1 font-heading text-4xl font-extrabold leading-none tracking-[-0.03em] tabular">
              {new Date(a.date).toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" })}
            </p>
            <p className="text-sm font-semibold text-text-muted">
              {new Date(a.date).toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" })}
            </p>
          </div>
          <p className="ml-auto text-sm font-semibold tabular sm:ml-0">{time(a.date)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
            <Pill>{ASSEMBLY_KIND_LABEL[a.kind]}</Pill>
          </div>
          <h2 className="mt-2 font-heading text-xl font-bold tracking-[-0.01em] sm:text-2xl">{a.title}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{a.place}</span>
          </p>
          <ol className="mt-4 flex flex-col gap-1 text-sm text-text-secondary">
            {a.agenda.map((item, i) => (
              <li key={item.id} className="flex gap-2">
                <span className="w-4 shrink-0 text-text-muted tabular">{i + 1}.</span>
                <span className="min-w-0">
                  {item.title}
                  {item.vote ? <span className="text-text-muted"> · se vota</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-text-muted">
              <span>Quórum en primera convocatoria</span>
              <span className="tabular">
                {q.presentVoters} de {q.needed}
              </span>
            </div>
            <Meter value={q.presentVoters} max={q.needed} tone={q.firstCall ? "success" : "violet"} />
            <p className="mt-1.5 text-xs text-text-muted">
              Segunda convocatoria a las {time(q.secondCallAt)}: vale con los presentes.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="dark" size="sm" onClick={onOpen}>
              <ClipboardCheck className="h-3.5 w-3.5" /> {a.status === "en_curso" ? "Seguir en la sala" : "Abrir asamblea"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={call} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> Convocatoria por WhatsApp
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AssemblyDrawer({
  id,
  onClose,
  onTask,
}: {
  id: string | null;
  onClose: () => void;
  onTask: (title: string, assemblyId: string) => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>("orden");
  const ops = communityOps(data);
  const assembly = ops.assemblies.find((a) => a.id === id);

  React.useEffect(() => {
    if (!assembly) return;
    setTab(assembly.status === "cerrada" ? "acta" : assembly.status === "en_curso" ? "asistencia" : "orden");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!assembly) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Asamblea">
        <span />
      </Drawer>
    );
  }
  const a = assembly;
  const members = data.communityMembers as CommunityMember[];
  const q = quorumState(a, members, data.board, now);

  const start = () => {
    update("community.assembly.start", (d) =>
      patchAssembly(d, a.id, (x) => ({ ...x, status: "en_curso", startedAt: new Date().toISOString() })),
    );
    setTab("asistencia");
    toast.success("Asamblea en marcha", "Marca a quien entra en la sala: el quórum se cuenta solo.");
  };

  const close = () => {
    const closedAt = new Date().toISOString();
    update("community.assembly.close", (d) =>
      patchAssembly(d, a.id, (x) => {
        const closed = { ...x, status: "cerrada" as const, closedAt };
        return { ...closed, minutes: x.minutes || assemblyMinutesText(closed, d, new Date(closedAt)) };
      }),
    );
    setTab("acta");
    toast.success("Asamblea cerrada", "El acta ya está escrita. Repásala y guárdala en el archivo.");
  };

  const print = () => {
    const body = a.minutes || assemblyMinutesText(a, data, now);
    openPrintable(
      textDocumentHtml({ spaceName: data.space.name, title: `Acta: ${a.title}`, subtitle: dayLabel(a.date), body }),
      `acta-${a.title}`,
    );
  };

  const archive = () => {
    const body = a.minutes || assemblyMinutesText(a, data, now);
    const docId = localId("d");
    update("community.assembly.archive", (d) =>
      withCommunityOps(patchAssembly(d, a.id, (x) => ({ ...x, minutes: body, archivedDocId: docId })), (o) => ({
        ...o,
        documents: [
          { id: docId, title: `Acta: ${a.title}`, kind: "acta", at: new Date().toISOString(), by: "Secretaría", body },
          ...o.documents,
        ],
      })),
    );
    toast.success("Acta guardada en el archivo", "La encuentras en Junta, con los estatutos y las cuentas.");
  };

  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={a.title}
      description={`${dayLabel(a.date)} a las ${time(a.date)} · ${a.place}`}
      footer={
        a.status === "convocada" ? (
          <Button variant="dark" onClick={start}>
            <ClipboardCheck className="h-4 w-4" /> Empezar asamblea
          </Button>
        ) : a.status === "en_curso" ? (
          <Button variant="dark" onClick={close}>
            Cerrar y escribir el acta
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={print}>
              <Printer className="h-4 w-4" /> Imprimir acta
            </Button>
            {a.archivedDocId ? null : (
              <Button variant="dark" onClick={archive}>
                <Archive className="h-4 w-4" /> Guardar en el archivo
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Pill>
          <Pill>{ASSEMBLY_KIND_LABEL[a.kind]}</Pill>
          <Pill tone={q.valid ? "success" : "neutral"}>
            {q.firstCall ? "Quórum en primera" : q.secondCallOpen ? "Segunda convocatoria" : `Quórum: ${q.presentVoters} de ${q.needed}`}
          </Pill>
        </div>
        <Segmented<Tab>
          label="Partes de la asamblea"
          value={tab}
          onChange={setTab}
          options={[
            { value: "orden", label: "Orden del día", count: a.agenda.length },
            { value: "asistencia", label: "Asistencia", count: a.presentIds.length },
            { value: "votaciones", label: "Votaciones", count: a.agenda.filter((x) => x.vote).length },
            { value: "acta", label: "Acta" },
          ]}
        />
        {tab === "orden" ? <AgendaTab assembly={a} /> : null}
        {tab === "asistencia" ? <AttendanceTab assembly={a} /> : null}
        {tab === "votaciones" ? <VotesTab assembly={a} onTask={(title) => onTask(title, a.id)} /> : null}
        {tab === "acta" ? <MinutesTab assembly={a} /> : null}
      </div>
    </Drawer>
  );
}

function AgendaTab({ assembly: a }: { assembly: CommunityAssembly }) {
  const { data, update } = usePro();
  const [title, setTitle] = React.useState("");
  const [vote, setVote] = React.useState(true);
  const editable = a.status === "convocada";
  const setAgenda = (fn: (list: CommunityAgendaItem[]) => CommunityAgendaItem[]) =>
    update("community.assembly.agenda", (d) => patchAssembly(d, a.id, (x) => ({ ...x, agenda: fn(x.agenda) })));
  return (
    <div className="flex flex-col gap-4">
      <ol className="divide-y divide-border-light rounded-2xl border border-border">
        {a.agenda.map((item, i) => (
          <li key={item.id} className="flex items-center gap-3 py-2 pl-4 pr-2">
            <span className="w-5 shrink-0 text-sm font-semibold text-text-muted tabular">{i + 1}.</span>
            <span className="min-w-0 flex-1 text-sm">{item.title}</span>
            {item.vote ? <Pill tone="info">Se vota</Pill> : null}
            {editable ? (
              <IconButton
                label={`Quitar ${item.title}`}
                icon={Trash2}
                className="h-10 w-10"
                onClick={() => setAgenda((list) => list.filter((x) => x.id !== item.id))}
              />
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Nuevo punto del orden del día"
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nuevo punto"
          />
          <label className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-sm">
            <input type="checkbox" checked={vote} onChange={(e) => setVote(e.target.checked)} className="h-4 w-4 accent-violet" />
            Se vota
          </label>
          <Button
            variant="outline"
            disabled={title.trim().length < 3}
            onClick={() => {
              setAgenda((list) => [...list, { id: localId("ag"), title: title.trim(), vote }]);
              setTitle("");
            }}
          >
            Añadir
          </Button>
        </div>
      ) : null}
      <section className="rounded-2xl bg-bg-secondary p-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">Convocatoria</p>
        <p className="mt-2 whitespace-pre-line text-sm text-text-secondary">{assemblyCallText(a, data.space.name)}</p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <a href={whatsAppShareUrl(assemblyCallText(a, data.space.name))} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Mandar al grupo de WhatsApp
          </a>
        </Button>
      </section>
    </div>
  );
}

function AttendanceTab({ assembly: a }: { assembly: CommunityAssembly }) {
  const { data, now, update } = usePro();
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<"todos" | "dentro">("todos");
  const members = (data.communityMembers as CommunityMember[]).filter((m) => !m.leftAt);
  const voters = new Set(assemblyVoters(a, members, data.board).map((m) => m.id));
  const present = new Set(a.presentIds);
  const q = quorumState(a, members, data.board, now);
  const closed = a.status === "cerrada";
  // En las reuniones de junta se lista solo la junta; en asamblea, todos los socios.
  const pool = a.kind === "junta" ? members.filter((m) => voters.has(m.id)) : members;
  const shown = pool
    .filter((m) => (only === "dentro" ? present.has(m.id) : true))
    .filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()))
    .sort((x, y) => Number(present.has(y.id)) - Number(present.has(x.id)) || x.name.localeCompare(y.name));

  const toggle = (id: string) =>
    update("community.assembly.present", (d) =>
      patchAssembly(d, a.id, (x) => ({
        ...x,
        presentIds: x.presentIds.includes(id) ? x.presentIds.filter((p) => p !== id) : [...x.presentIds, id],
      })),
    );

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-bg-secondary p-4">
        <p className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">
          {q.presentVoters} <span className="text-lg font-bold text-text-muted">de {q.voters} con voto</span>
        </p>
        <Meter value={q.presentVoters} max={Math.max(1, q.needed)} className="mt-3" tone={q.firstCall ? "success" : "violet"} />
        <p className="mt-2 text-sm text-text-secondary">
          {q.firstCall
            ? "Hay quórum en primera convocatoria."
            : `Faltan ${q.needed - q.presentVoters} para la primera convocatoria (${a.quorumPct} % de los socios con voto). ` +
              (q.secondCallOpen
                ? "Ya estáis en segunda convocatoria: vale con los presentes."
                : `A las ${time(q.secondCallAt)} empieza la segunda, que vale con los presentes.`)}
        </p>
        {q.presentOthers ? (
          <p className="mt-1 text-xs text-text-muted">
            {q.presentOthers} presentes sin voto (cuota pendiente). Pueden hablar, pero no votan.
          </p>
        ) : null}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar socio" className="flex-1" />
        <Segmented
          size="sm"
          label="Filtrar asistentes"
          value={only}
          onChange={setOnly}
          options={[
            { value: "todos", label: "Todos" },
            { value: "dentro", label: "En la sala", count: a.presentIds.length },
          ]}
        />
      </div>
      <ul className="divide-y divide-border-light">
        {shown.slice(0, 50).map((m) => {
          const isIn = present.has(m.id);
          const canVote = voters.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.name} size="sm" tone={m.role === "junta" ? "violet" : "slate"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-text-muted">{canVote ? "Con voto" : "Sin voto: cuota pendiente"}</span>
              </span>
              <button
                type="button"
                disabled={closed}
                onClick={() => toggle(m.id)}
                aria-pressed={isIn}
                aria-label={isIn ? `${m.name} sale de la sala` : `${m.name} está en la sala`}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-60",
                  isIn
                    ? "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border text-text-secondary hover:border-text-primary/25 hover:text-text-primary",
                )}
              >
                {isIn ? <Check className="h-3.5 w-3.5" /> : null}
                {isIn ? "En la sala" : "Marcar"}
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length > 50 ? <p className="text-xs text-text-muted">Y {shown.length - 50} más. Busca por nombre.</p> : null}
    </div>
  );
}

function VotesTab({ assembly: a, onTask }: { assembly: CommunityAssembly; onTask: (title: string) => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const members = data.communityMembers as CommunityMember[];
  const q = quorumState(a, members, data.board, now);
  const items = a.agenda.filter((x) => x.vote || x.agreement !== undefined || a.status !== "convocada");
  const setItem = (id: string, patch: Partial<CommunityAgendaItem>) =>
    update("community.assembly.vote", (d) =>
      patchAssembly(d, a.id, (x) => ({ ...x, agenda: x.agenda.map((it) => (it.id === id ? { ...it, ...patch } : it)) })),
    );

  if (a.status === "convocada") {
    return (
      <Empty
        icon={Vote}
        title="Las votaciones se abren al empezar"
        body="Cuando empieces la asamblea y haya quórum, aquí apuntas los votos de cada punto."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!q.valid && a.status === "en_curso" ? (
        <p className="rounded-2xl border border-amber-500/25 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Aún no hay quórum. Espera a la segunda convocatoria, a las {time(q.secondCallAt)}.
        </p>
      ) : null}
      {items.map((item, i) => {
        const v = voteCheck(item, q.presentVoters);
        const locked = a.status === "cerrada" || Boolean(item.result) || !q.valid;
        return (
          <section key={item.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">
                {i + 1}. {item.title}
              </p>
              {item.result ? (
                <Pill tone={item.result === "approved" ? "success" : "danger"}>
                  {item.result === "approved" ? "Aprobado" : "No aprobado"}
                </Pill>
              ) : null}
            </div>
            {item.vote ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["yes", "A favor"],
                      ["no", "En contra"],
                      ["abstain", "Abstención"],
                    ] as const
                  ).map(([key, label]) => (
                    <FormField key={key} label={label} htmlFor={`${item.id}-${key}`}>
                      <input
                        id={`${item.id}-${key}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        disabled={locked}
                        className={cn(inputClass, v.tooMany && "border-error")}
                        value={item[key] ?? ""}
                        onChange={(e) => setItem(item.id, { [key]: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </FormField>
                  ))}
                </div>
                <p className={cn("mt-2 text-xs", v.tooMany ? "text-error" : "text-text-muted")}>
                  {v.tooMany
                    ? `Hay ${v.cast} votos y solo ${q.presentVoters} socios con voto en la sala.`
                    : `${v.cast} de ${q.presentVoters} con voto. Se aprueba con más votos a favor que en contra.`}
                </p>
                {!item.result && a.status === "en_curso" ? (
                  <Button
                    size="sm"
                    variant="dark"
                    className="mt-3"
                    disabled={locked || v.tooMany || !v.cast}
                    onClick={() => {
                      setItem(item.id, { result: v.approved ? "approved" : "rejected" });
                      toast.success(v.approved ? "Punto aprobado" : "Punto no aprobado", `${v.yes} a favor, ${v.no} en contra, ${v.abstain} abstenciones.`);
                    }}
                  >
                    Cerrar votación
                  </Button>
                ) : null}
              </>
            ) : null}
            <FormField label="Acuerdo" htmlFor={`${item.id}-agreement`} className="mt-3">
              <textarea
                id={`${item.id}-agreement`}
                className={cn(textareaClass, "min-h-[64px]")}
                disabled={a.status === "cerrada" && Boolean(a.archivedDocId)}
                defaultValue={item.agreement ?? ""}
                onBlur={(e) => e.target.value !== (item.agreement ?? "") && setItem(item.id, { agreement: e.target.value.trim() || undefined })}
                placeholder="Lo que se acuerda, tal y como irá en el acta."
              />
            </FormField>
            {item.agreement ? (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => onTask(item.agreement ?? item.title)}>
                <ListChecks className="h-3.5 w-3.5" /> Convertir en tarea
              </Button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function MinutesTab({ assembly: a }: { assembly: CommunityAssembly }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const draft = a.minutes || assemblyMinutesText(a, data, now);
  const [text, setText] = React.useState(draft);
  React.useEffect(() => setText(a.minutes || assemblyMinutesText(a, data, now)), [a.id, a.minutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    update("community.assembly.minutes", (d) => patchAssembly(d, a.id, (x) => ({ ...x, minutes: text })));
    toast.success("Acta guardada");
  };
  const regenerate = () => setText(assemblyMinutesText(a, data, now));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        {a.status === "cerrada"
          ? "Escrita con la asistencia, los votos y los acuerdos. Retócala si hace falta y guárdala."
          : "Se va escribiendo con lo que pasa en la sala. Al cerrar queda fijada."}
      </p>
      <textarea
        aria-label="Texto del acta"
        className={cn(textareaClass, "min-h-[360px] font-mono text-xs leading-relaxed")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={save} disabled={text === (a.minutes ?? "")}>
          Guardar cambios
        </Button>
        <Button size="sm" variant="ghost" onClick={regenerate}>
          Volver a escribirla con los datos
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const DEFAULT_AGENDA: Record<CommunityAssemblyKind, [string, boolean][]> = {
  ordinaria: [
    ["Lectura y aprobación del acta anterior", true],
    ["Aprobación de las cuentas del curso", true],
    ["Presupuesto y actividades del curso", true],
    ["Ruegos y preguntas", false],
  ],
  extraordinaria: [
    ["Elección de la junta directiva", true],
    ["Ruegos y preguntas", false],
  ],
  junta: [
    ["Repaso de tareas pendientes", false],
    ["Próximas actividades", true],
  ],
};

function ConvokeDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [kind, setKind] = React.useState<CommunityAssemblyKind>("ordinaria");
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(addDays(localDate(now), 15));
  const [hour, setHour] = React.useState("19:00");
  const [place, setPlace] = React.useState("");
  const [agenda, setAgenda] = React.useState<CommunityAgendaItem[]>([]);
  const [quorum, setQuorum] = React.useState("50");
  const [second, setSecond] = React.useState("30");
  const [notify, setNotify] = React.useState(true);

  const reset = React.useCallback(
    (k: CommunityAssemblyKind) => {
      setKind(k);
      setTitle(k === "junta" ? "Reunión de junta" : ASSEMBLY_KIND_LABEL[k]);
      setAgenda(DEFAULT_AGENDA[k].map(([t, vote]) => ({ id: localId("ag"), title: t, vote })));
      setSecond(k === "junta" ? "15" : "30");
    },
    [],
  );

  React.useEffect(() => {
    if (!open) return;
    reset("ordinaria");
    setDate(addDays(localDate(now), 15));
    setHour("19:00");
    setPlace(data.space.address);
    setQuorum("50");
    setNotify(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minutes = parseClock(hour);
  const valid = title.trim().length > 2 && place.trim().length > 2 && minutes !== null && agenda.length > 0;

  const save = () => {
    const id = localId("as");
    const assembly: CommunityAssembly = {
      id,
      kind,
      title: title.trim(),
      date: atLocal(date, minutes ?? 19 * 60),
      place: place.trim(),
      status: "convocada",
      agenda: agenda.filter((x) => x.title.trim()),
      presentIds: [],
      quorumPct: Math.min(100, Math.max(1, Number(quorum) || 50)),
      secondCallMinutes: Math.max(0, Number(second) || 30),
      convokedAt: new Date().toISOString(),
    };
    update("community.assembly.convoke", (d) => {
      const withAssembly = withCommunityOps(d, (o) => ({ ...o, assemblies: [assembly, ...o.assemblies] }));
      if (!notify) return withAssembly;
      return {
        ...withAssembly,
        announcements: [
          {
            id: localId("an"),
            title: `Convocatoria: ${assembly.title}`,
            body: assemblyCallText(assembly, d.space.name),
            at: new Date().toISOString(),
            audience: kind === "junta" ? "junta" : "socios",
            reads: 0,
          },
          ...withAssembly.announcements,
        ],
      };
    });
    toast.success(
      "Convocada",
      notify
        ? `Le llega a ${kind === "junta" ? "la junta" : "cada socio"} en su Franky con el orden del día.`
        : "Compártela cuando quieras desde la asamblea.",
    );
    onCreated(id);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      wide
      title="Convocar"
      description="Fecha, lugar y orden del día. El resto lo hace Franky."
      footer={
        <Button variant="dark" onClick={save} disabled={!valid}>
          <Vote className="h-4 w-4" /> Convocar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Qué es">
          <ChoiceChips
            value={kind}
            onChange={reset}
            options={[
              { value: "ordinaria", label: "Asamblea ordinaria", hint: "Cuentas y presupuesto" },
              { value: "extraordinaria", label: "Extraordinaria", hint: "Elecciones, estatutos" },
              { value: "junta", label: "Reunión de junta" },
            ]}
          />
        </FormField>
        <FormField label="Título" htmlFor="as-title">
          <input id="as-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Fecha" htmlFor="as-date">
            <input id="as-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Hora" htmlFor="as-hour">
            <input id="as-hour" type="time" className={inputClass} value={hour} onChange={(e) => setHour(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Lugar" htmlFor="as-place">
          <input id="as-place" className={inputClass} value={place} onChange={(e) => setPlace(e.target.value)} />
        </FormField>
        <FormField label="Orden del día">
          <ol className="flex flex-col gap-2">
            {agenda.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-sm text-text-muted tabular">{i + 1}.</span>
                <input
                  aria-label={`Punto ${i + 1}`}
                  className={inputClass}
                  value={item.title}
                  onChange={(e) => setAgenda((list) => list.map((x) => (x.id === item.id ? { ...x, title: e.target.value } : x)))}
                />
                <label className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={item.vote}
                    onChange={(e) => setAgenda((list) => list.map((x) => (x.id === item.id ? { ...x, vote: e.target.checked } : x)))}
                    className="h-4 w-4 accent-violet"
                  />
                  Voto
                </label>
                <IconButton
                  label={`Quitar el punto ${i + 1}`}
                  icon={Trash2}
                  className="h-10 w-10 shrink-0"
                  onClick={() => setAgenda((list) => list.filter((x) => x.id !== item.id))}
                />
              </li>
            ))}
          </ol>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1 self-start"
            onClick={() => setAgenda((list) => [...list, { id: localId("ag"), title: "", vote: true }])}
          >
            <Plus className="h-3.5 w-3.5" /> Añadir punto
          </Button>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quórum en primera (%)" htmlFor="as-quorum" hint="El que digan tus estatutos.">
            <input id="as-quorum" type="number" min={1} max={100} inputMode="numeric" className={inputClass} value={quorum} onChange={(e) => setQuorum(e.target.value)} />
          </FormField>
          <FormField label="Segunda convocatoria" htmlFor="as-second" hint="Minutos después.">
            <input id="as-second" type="number" min={0} inputMode="numeric" className={inputClass} value={second} onChange={(e) => setSecond(e.target.value)} />
          </FormField>
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-violet" />
          <span>
            <span className="font-semibold">Enviar la convocatoria por Franky</span>
            <span className="block text-xs text-text-muted">
              {kind === "junta" ? "A la junta" : `A los ${(data.communityMembers as CommunityMember[]).filter((m) => !m.leftAt).length} socios`}, con el orden del día.
            </span>
          </span>
        </label>
      </div>
    </Drawer>
  );
}

function TaskDrawer({ seed, onClose }: { seed: { title: string; assemblyId?: string } | null; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [due, setDue] = React.useState(addDays(localDate(now), 7));
  const people = data.board.map((b) => b.name);

  React.useEffect(() => {
    if (!seed) return;
    setTitle(seed.title);
    setOwner(people[0] ?? "");
    setDue(addDays(localDate(now), 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const save = () => {
    const task: CommunityTask = {
      id: localId("t"),
      title: title.trim(),
      owner: owner.trim() || "Junta",
      due,
      done: false,
      assemblyId: seed?.assemblyId,
      createdAt: new Date().toISOString(),
    };
    update("community.task.add", (d) => withCommunityOps(d, (o) => ({ ...o, tasks: [task, ...o.tasks] })));
    toast.success("Tarea creada", `${task.owner.split(" ")[0]} la ve en su resumen hasta que la haga.`);
    onClose();
  };

  return (
    <Drawer
      open={Boolean(seed)}
      onOpenChange={(o) => !o && onClose()}
      title="Nueva tarea"
      description="Con responsable y fecha, para que no se quede en el acta."
      footer={
        <Button variant="dark" onClick={save} disabled={title.trim().length < 3 || !due}>
          Crear tarea
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Qué hay que hacer" htmlFor="task-title">
          <textarea id="task-title" className={cn(textareaClass, "min-h-[72px]")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Quién" htmlFor="task-owner">
          <input id="task-owner" list="task-people" className={inputClass} value={owner} onChange={(e) => setOwner(e.target.value)} />
          <datalist id="task-people">
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Para cuándo" htmlFor="task-due">
          <input id="task-due" type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
        </FormField>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Asistencia de la junta a sus reuniones                              */
/* ------------------------------------------------------------------ */

/**
 * Cuántas reuniones de junta ha ido cada cargo. Para los créditos por
 * representación se pide el 80 % de las sesiones: aquí se ve quién llega.
 */
function BoardAttendance() {
  const { data, now } = usePro();
  const toast = useToast();
  const rows = representationAttendance(data);
  if (!rows.length) return null;
  const sessions = Math.max(...rows.map((r) => r.sessions));

  const certificate = (seatId: string, name: string) => {
    const html = representationCertificateHtml(data, seatId, now);
    if (!html) return;
    const opened = openPrintable(html, `Asistencia a la junta ${name}`);
    toast.success(
      "Certificado listo",
      opened ? "Guárdalo en PDF desde la ventana de impresión." : "Se ha descargado para abrirlo a mano.",
    );
  };

  return (
    <Panel
      title="Asistencia a las reuniones de junta"
      description={
        sessions
          ? `${sessions} reuniones este mandato. Para los créditos se pide el ${REPRESENTATION_MIN_PCT} %.`
          : "Cuando cierres la primera reunión de junta, aquí verás quién ha ido."
      }
      flush
    >
      <ul className="divide-y divide-border-light">
        {rows.map((r) => (
          <li key={r.seat.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{r.seat.name}</span>
              <span className="block truncate text-xs text-text-muted">
                {r.seat.role} · {r.sessions ? `${r.attended} de ${r.sessions}` : "Sin reuniones aún"}
              </span>
              {r.sessions ? (
                <Meter value={r.attended} max={r.sessions} className="mt-1.5 max-w-40" tone={r.meets ? "success" : "warning"} />
              ) : null}
            </span>
            {r.sessions ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => certificate(r.seat.id, r.seat.name)}
                aria-label={`Certificado de asistencia de ${r.seat.name}`}
              >
                <FileText className="h-3.5 w-3.5" /> {r.pct} %
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
