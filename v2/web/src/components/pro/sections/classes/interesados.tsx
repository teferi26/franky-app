"use client";

import * as React from "react";
import { CalendarClock, MessageCircle, Phone, Plus, Sparkles, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProClassLead, ProLeadStage } from "@/lib/pro/classes-types";
import { addDays, dayLabel, localDate, plural } from "@/lib/pro/format";
import { classCopy, shortUni } from "@/lib/pro/classes";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STAGES,
  addLead,
  isOpenLead,
  leadFunnel,
  leadMessage,
  leadStageLabel,
  leadsOf,
  leadsToCall,
  moveLead,
  patchLead,
  snoozeLead,
  type NewLead,
} from "@/lib/pro/classes-growth";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  inputClass,
  textareaClass,
} from "../../kit";
import ClientesSection from "../common/clientes";

/**
 * Interesados del motor de clases: quien ha preguntado y todavía no es socio o
 * alumno, fase a fase, con a quién llamar hoy y el mensaje ya escrito. En ocio
 * se usa la ficha de clientes común (allí se reserva por grupo, sin embudo).
 */
export default function ClassesInteresados() {
  const { vertical } = usePro();
  if (vertical.id === "culture") return <ClientesSection />;
  return <LeadsBoard />;
}

const STAGE_TONE: Record<ProLeadStage, "neutral" | "violet" | "info" | "success" | "danger"> = {
  new: "violet",
  trial_booked: "info",
  came: "neutral",
  joined: "success",
  lost: "danger",
};

const LOST_REASONS = [
  "Precio",
  "Horario",
  "Le pilla lejos",
  "No vino",
  "Lo deja para más adelante",
];

function daysUntil(today: string, date: string): number {
  return Math.round(
    (new Date(`${date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000,
  );
}

function followLabel(today: string, date?: string): string | null {
  if (!date) return null;
  const d = daysUntil(today, date);
  if (d < -1) return `hace ${-d} días`;
  if (d === -1) return "desde ayer";
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  return dayLabel(`${date}T12:00:00Z`, { weekday: true });
}

function LeadsBoard() {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const academy = vertical.id === "academy";
  const today = localDate(now);
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const leads = leadsOf(data);
  const toCall = leadsToCall(data, now);
  const funnel = leadFunnel(data, now);
  const weekAgo = addDays(today, -7);
  const newThisWeek = leads.filter((l) => localDate(l.createdAt) >= weekAgo).length;
  const joinedWord = academy ? "se matriculan" : "se apuntan";

  const description = leads.length
    ? `${toCall.length ? `Hoy toca hablar con ${plural(toCall.length, "persona", "personas")}.` : "Hoy no tienes a nadie pendiente."}${
        funnel.trialToJoin >= 10
          ? ` De cada 10 que vienen a probar, ${Math.round(funnel.trialToJoin / 10)} ${joinedWord}.`
          : ""
      }`
    : `Apunta a quien pregunte por WhatsApp, Instagram o en la puerta. Franky te dice a quién llamar cada día y te deja el mensaje escrito.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Interesados"
        title={academy ? "De la pregunta a la matrícula" : "De la pregunta al alta"}
        description={description}
        actions={
          <Button variant="dark" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo interesado
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          icon={Phone}
          label="Para hoy"
          value={toCall.length}
          hint="llamadas o mensajes"
          emphasis={toCall.length > 0}
        />
        <Kpi
          icon={CalendarClock}
          label="Pruebas reservadas"
          value={funnel.counts.trial_booked}
          hint="en los últimos 90 días"
        />
        <Kpi
          icon={Users}
          label="Vinieron a probar"
          value={funnel.counts.came}
          hint="falta saber si siguen"
        />
        <Kpi
          icon={UserPlus}
          label={academy ? "Matriculados" : "Se apuntaron"}
          value={funnel.counts.joined}
          hint={
            funnel.overall
              ? `${funnel.overall} % de los cerrados`
              : `${newThisWeek} nuevos esta semana`
          }
        />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel
          title="A quién llamar hoy"
          description={toCall.length ? "Primero los que llevan más tiempo esperando." : undefined}
          flush
        >
          {toCall.length ? (
            <ul className="divide-y divide-border-light">
              {toCall.map((lead) => (
                <CallRow key={lead.id} lead={lead} onOpen={() => setOpen(lead.id)} />
              ))}
            </ul>
          ) : (
            <Empty
              icon={Sparkles}
              title="Todo al día"
              body={
                leads.length
                  ? "Nadie espera tu llamada hoy. Los seguimientos de mañana aparecerán aquí."
                  : `Cuando alguien pregunte por tus ${copy.sessionMany}, apúntalo y aparecerá aquí el día que toca escribirle.`
              }
            />
          )}
        </Panel>

        <section aria-label="Fases" className="min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 pb-2 pro-scroll sm:mx-0 sm:px-0">
            <div className="grid auto-cols-[240px] grid-flow-col gap-3 2xl:auto-cols-fr">
              {LEAD_STAGES.map((stage) => (
                <StageColumn key={stage} stage={stage} onOpen={setOpen} />
              ))}
            </div>
          </div>
        </section>
      </div>

      <LeadDrawer leadId={open} onClose={() => setOpen(null)} />
      <NewLeadDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CallRow({ lead, onOpen }: { lead: ProClassLead; onOpen: () => void }) {
  const { data, now, vertical, update } = usePro();
  const today = localDate(now);
  const sender = data.space.owner.firstName || data.space.name;
  const link = customerWhatsApp(
    lead.phone,
    leadMessage(lead, sender, data.space.name, vertical.id),
  );
  const late = lead.followUpOn && lead.followUpOn < today;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar name={lead.name} size="sm" tone={late ? "rose" : "violet"} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{lead.name}</span>
          <span className="block truncate text-xs text-text-muted">
            {leadStageLabel(lead.stage, vertical.id)}
            {lead.interest ? ` · ${lead.interest}` : ""}
            {late ? ` · ${followLabel(today, lead.followUpOn)}` : ""}
          </span>
        </span>
      </button>
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
      ) : (
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Abrir
        </Button>
      )}
    </li>
  );
}

function StageColumn({ stage, onOpen }: { stage: ProLeadStage; onOpen: (id: string) => void }) {
  const { data, now, vertical } = usePro();
  const today = localDate(now);
  const monthAgo = addDays(today, -30);
  const all = leadsOf(data).filter((l) => l.stage === stage);
  // Los cerrados solo del último mes: la columna no crece para siempre.
  const list = (
    stage === "joined" || stage === "lost"
      ? all.filter((l) => localDate(l.updatedAt) >= monthAgo)
      : all
  ).sort(
    (a, b) =>
      (a.followUpOn ?? "9999").localeCompare(b.followUpOn ?? "9999") ||
      b.createdAt.localeCompare(a.createdAt),
  );
  const shown = list.slice(0, 20);
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-bg-secondary/60">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-sm font-semibold">{leadStageLabel(stage, vertical.id)}</span>
        <span className="text-xs font-semibold tabular text-text-muted">{list.length}</span>
      </div>
      <ul className="flex flex-col gap-2 px-2 pb-2">
        {shown.map((lead) => (
          <li key={lead.id}>
            <LeadCard lead={lead} onOpen={() => onOpen(lead.id)} />
          </li>
        ))}
        {!shown.length ? (
          <li className="px-2 pb-2 text-xs text-text-muted">Nadie en esta fase.</li>
        ) : null}
        {list.length > shown.length ? (
          <li className="px-2 pb-1 text-xs text-text-muted">Y {list.length - shown.length} más</li>
        ) : null}
      </ul>
    </div>
  );
}

function LeadCard({ lead, onOpen }: { lead: ProClassLead; onOpen: () => void }) {
  const { now, vertical } = usePro();
  const today = localDate(now);
  const follow = isOpenLead(lead) ? followLabel(today, lead.followUpOn) : null;
  const late = isOpenLead(lead) && lead.followUpOn !== undefined && lead.followUpOn < today;
  const examIn = vertical.id === "academy" && lead.examOn ? daysUntil(today, lead.examOn) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1 rounded-xl border border-border bg-bg-primary px-3 py-2.5 text-left shadow-card transition-colors hover:border-text-primary/20"
    >
      <span className="truncate text-sm font-semibold">{lead.name}</span>
      {lead.interest ? (
        <span className="truncate text-xs text-text-secondary">{lead.interest}</span>
      ) : null}
      <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {examIn !== null && examIn >= 0 ? (
          <Pill tone={examIn <= 21 ? "warning" : "neutral"}>Examen en {examIn} d</Pill>
        ) : null}
        {follow ? (
          <Pill tone={late ? "danger" : "neutral"}>
            {late ? `Llamar, ${follow}` : `Llamar ${follow}`}
          </Pill>
        ) : null}
        {lead.stage === "lost" && lead.lostReason ? <Pill>{lead.lostReason}</Pill> : null}
        {lead.source === "franky" ? (
          <Pill tone="violet">
            <Sparkles className="h-3 w-3" /> Franky
          </Pill>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha del interesado                                                */
/* ------------------------------------------------------------------ */

function LeadDrawer({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
  const { data, now, vertical, update } = usePro();
  const toast = useToast();
  const lead = leadsOf(data).find((l) => l.id === leadId);
  const [note, setNote] = React.useState("");
  const [lost, setLost] = React.useState(false);
  React.useEffect(() => {
    setNote(lead?.note ?? "");
    setLost(false);
  }, [lead?.id, lead?.note]);
  if (!lead)
    return (
      <Drawer open={false} onOpenChange={onClose} title="">
        {null}
      </Drawer>
    );

  const today = localDate(now);
  const sender = data.space.owner.firstName || data.space.name;
  const link = customerWhatsApp(
    lead.phone,
    leadMessage(lead, sender, data.space.name, vertical.id),
  );
  const joined = leadStageLabel("joined", vertical.id);
  const move = (stage: ProLeadStage, extra: { lostReason?: string } = {}) => {
    void update("lead.move", (d) => moveLead(d, lead.id, stage, now, extra));
    toast.success(
      `${lead.name.split(" ")[0]}: ${leadStageLabel(stage, vertical.id).toLowerCase()}`,
    );
    if (stage === "joined")
      toast.info("Dale de alta en Socios", "Así sus cuotas y su asistencia empiezan a contar.");
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={lead.name}
      description={[
        leadStageLabel(lead.stage, vertical.id),
        LEAD_SOURCE_LABEL[lead.source],
        lead.university ? shortUni(lead.university) : "",
        lead.studies ?? "",
      ]
        .filter(Boolean)
        .join(" · ")}
      footer={
        link ? (
          <Button variant="dark" asChild>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              onClick={() => void update("lead.update", (d) => snoozeLead(d, lead.id, 2, now))}
            >
              <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
            </a>
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-bg-secondary p-3 text-sm">
          <span className="text-text-muted">Quiere</span>
          <span className="text-right font-medium">{lead.interest ?? "Sin apuntar"}</span>
          {lead.examOn ? (
            <>
              <span className="text-text-muted">Examen</span>
              <span className="text-right font-medium">
                {dayLabel(`${lead.examOn}T12:00:00Z`, { weekday: false })} (
                {daysUntil(today, lead.examOn)} días)
              </span>
            </>
          ) : null}
          <span className="text-text-muted">Preguntó</span>
          <span className="text-right font-medium">
            {dayLabel(lead.createdAt, { weekday: false })}
          </span>
          {lead.phone ? (
            <>
              <span className="text-text-muted">Teléfono</span>
              <a
                href={`tel:${lead.phone.replace(/\s/g, "")}`}
                className="text-right font-medium text-violet"
              >
                {lead.phone}
              </a>
            </>
          ) : null}
        </div>

        <FormField label="Fase">
          <ChoiceChips
            value={lead.stage}
            onChange={(stage) => (stage === "lost" ? setLost(true) : move(stage))}
            options={LEAD_STAGES.map((stage) => ({
              value: stage,
              label: leadStageLabel(stage, vertical.id),
            }))}
          />
        </FormField>

        {lost || lead.stage === "lost" ? (
          <FormField label="¿Por qué no sigue?" hint="Te sirve para ver qué frena a la gente.">
            <ChoiceChips
              value={lead.lostReason ?? ""}
              onChange={(reason) => {
                move("lost", { lostReason: reason });
                setLost(false);
              }}
              options={LOST_REASONS.map((r) => ({ value: r, label: r }))}
            />
          </FormField>
        ) : null}

        {isOpenLead(lead) ? (
          <FormField
            label="Volver a hablar"
            hint={lead.followUpOn ? `Ahora: ${followLabel(today, lead.followUpOn)}` : undefined}
          >
            <div className="flex flex-wrap gap-2">
              {[
                { d: 0, l: "Hoy" },
                { d: 1, l: "Mañana" },
                { d: 3, l: "En 3 días" },
                { d: 7, l: "En una semana" },
              ].map((o) => (
                <Button
                  key={o.d}
                  size="sm"
                  variant={lead.followUpOn === addDays(today, o.d) ? "dark" : "outline"}
                  onClick={() =>
                    void update("lead.update", (d) => snoozeLead(d, lead.id, o.d, now))
                  }
                >
                  {o.l}
                </Button>
              ))}
            </div>
          </FormField>
        ) : null}

        <FormField label="Notas" htmlFor="lead-note">
          <textarea
            id="lead-note"
            className={textareaClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if (note.trim() !== (lead.note ?? ""))
                void update("lead.update", (d) =>
                  patchLead(d, lead.id, { note: note.trim() || undefined }, now),
                );
            }}
            placeholder={
              vertical.id === "academy"
                ? "Temario, profesor de la uni, horario que le va..."
                : "Objetivo, lesiones, horario que le va..."
            }
          />
        </FormField>

        {lead.stage !== "joined" ? (
          <Button variant="outline" onClick={() => move("joined")}>
            <UserPlus className="h-4 w-4" /> Marcar como {joined.toLowerCase()}
          </Button>
        ) : null}
      </div>
    </Drawer>
  );
}

function NewLeadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, vertical, update } = usePro();
  const toast = useToast();
  const academy = vertical.id === "academy";
  const empty: NewLead = { name: "", phone: "", interest: "", source: "franky" };
  const [form, setForm] = React.useState<NewLead>(empty);
  React.useEffect(() => {
    if (open) setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (changes: Partial<NewLead>) => setForm((f) => ({ ...f, ...changes }));
  const groups = data.classTypes.filter((c) => c.active !== false).map((c) => c.name);

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const type = data.classTypes.find((c) => c.name === form.interest);
    const examOn = academy && type ? data.classExtras?.types[type.id]?.examOn : form.examOn;
    void update("lead.create", (d) =>
      addLead(
        d,
        {
          ...form,
          name,
          phone: form.phone?.trim() || undefined,
          interest: form.interest?.trim() || undefined,
          examOn: examOn || undefined,
          note: form.note?.trim() || undefined,
        },
        now,
        localId("ld"),
      ),
    );
    toast.success("Interesado apuntado", "Aparece en A quién llamar hoy.");
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Nuevo interesado"
      description="Con el nombre y el móvil basta. Lo demás lo puedes completar después."
      footer={
        <Button variant="dark" onClick={save} disabled={!form.name.trim()}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="lead-name">
          <input
            id="lead-name"
            className={inputClass}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Móvil" htmlFor="lead-phone">
          <input
            id="lead-phone"
            className={inputClass}
            value={form.phone ?? ""}
            onChange={(e) => set({ phone: e.target.value })}
            inputMode="tel"
            placeholder="612 345 678"
          />
        </FormField>
        <FormField label={academy ? "Asignatura o curso" : "Qué busca"} htmlFor="lead-interest">
          {academy && groups.length ? (
            <ChoiceChips
              value={form.interest ?? ""}
              onChange={(v) => set({ interest: v })}
              options={groups.map((g) => ({ value: g, label: g }))}
            />
          ) : (
            <input
              id="lead-interest"
              className={inputClass}
              value={form.interest ?? ""}
              onChange={(e) => set({ interest: e.target.value })}
              placeholder="Empezar de cero, ganar fuerza, Hyrox..."
            />
          )}
        </FormField>
        {academy ? (
          <FormField
            label="Día del examen"
            htmlFor="lead-exam"
            hint="Si su grupo ya tiene fecha, se usa esa."
          >
            <input
              id="lead-exam"
              type="date"
              className={inputClass}
              value={form.examOn ?? ""}
              onChange={(e) => set({ examOn: e.target.value })}
            />
          </FormField>
        ) : null}
        <FormField label="Cómo te ha conocido">
          <ChoiceChips
            value={form.source}
            onChange={(source) => set({ source })}
            options={(Object.keys(LEAD_SOURCE_LABEL) as ProClassLead["source"][]).map((s) => ({
              value: s,
              label: LEAD_SOURCE_LABEL[s],
            }))}
          />
        </FormField>
        <FormField label="Notas" htmlFor="lead-new-note">
          <textarea
            id="lead-new-note"
            className={cn(textareaClass, "min-h-[64px]")}
            value={form.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
