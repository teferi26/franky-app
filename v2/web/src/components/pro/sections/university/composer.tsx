"use client";

import * as React from "react";
import { BadgeCheck, Eye, HeartHandshake, Info, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import type { ProUniPublication } from "@/lib/pro/types";
import { addDays, atLocal, localDate } from "@/lib/pro/format";
import {
  AUDIENCE_LABEL,
  AUDIENCE_ORDER,
  FACULTY_SCOPED,
  PRIVACY_MIN_GROUP,
  PUBLICATION_TEMPLATES,
  URGENT_DURATION_LABEL,
  URGENT_KIND_LABEL,
  accessibilityHints,
  audienceText,
  estimateReach,
  initialReads,
  templateForDeadline,
  uniExtrasOf,
  urgentUntil,
  type PublicationTemplate,
  type UrgentDuration,
} from "@/lib/pro/university";
import type { ProUniAudience, ProUniUrgentKind, UniPublication } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { ChoiceChips, Drawer, FormField, Segmented, inputClass, textareaClass } from "../../kit";
import { ToggleRow, facultyOptions, useUniAction } from "./ui";

export const CHANNEL: Record<ProUniPublication["channel"], { label: string; hint: string }> = {
  fomo: { label: "FOMO", hint: "En el muro del campus" },
  aviso: { label: "Aviso", hint: "Notificación a cada estudiante" },
  evento: { label: "Evento", hint: "Con inscripción y recordatorio" },
};

/** Lo que llega por la URL para abrir el editor ya preparado. */
export type ComposerPreset = {
  template?: string;
  deadlineId?: string;
  audience?: ProUniAudience;
  faculty?: string;
};

type Lang = "es" | "en";

export function Composer({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: ComposerPreset }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const hasAudiences = extras.audiences.campus > 0;

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [channel, setChannel] = React.useState<ProUniPublication["channel"]>("fomo");
  const [audience, setAudience] = React.useState<ProUniAudience>("campus");
  const [facs, setFacs] = React.useState<string[]>([]);
  const [when, setWhen] = React.useState<"now" | "later">("now");
  const [date, setDate] = React.useState(addDays(localDate(now), 1));
  const [hour, setHour] = React.useState("13:30");
  const [readReceipt, setReadReceipt] = React.useState(false);
  const [urgent, setUrgent] = React.useState(false);
  const [urgentKind, setUrgentKind] = React.useState<ProUniUrgentKind>("closure");
  const [duration, setDuration] = React.useState<UrgentDuration>("3h");
  const [english, setEnglish] = React.useState(false);
  const [titleEn, setTitleEn] = React.useState("");
  const [bodyEn, setBodyEn] = React.useState("");
  const [help, setHelp] = React.useState(false);
  const [templateId, setTemplateId] = React.useState<string | null>(null);
  const [deadlineId, setDeadlineId] = React.useState<string | undefined>();
  const [lang, setLang] = React.useState<Lang>("es");

  const apply = React.useCallback((t: PublicationTemplate) => {
    setTemplateId(t.id);
    setTitle(t.title);
    setBody(t.body);
    setChannel(t.channel);
    setAudience(t.audience);
    setReadReceipt(Boolean(t.readReceipt));
    setUrgent(Boolean(t.urgent));
    if (t.urgent) setUrgentKind(t.urgent);
    setHelp(Boolean(t.help));
    setEnglish(Boolean(t.titleEn) || t.audience === "erasmus");
    setTitleEn(t.titleEn ?? "");
    setBodyEn(t.bodyEn ?? "");
    if (t.urgent) setWhen("now");
  }, []);

  // Al abrir: vacío, o preparado desde un plazo, una plantilla o una alerta.
  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setChannel("fomo");
    setAudience("campus");
    setFacs([]);
    setWhen("now");
    setDate(addDays(localDate(now), 1));
    setHour("13:30");
    setReadReceipt(false);
    setUrgent(false);
    setDuration("3h");
    setEnglish(false);
    setTitleEn("");
    setBodyEn("");
    setHelp(false);
    setTemplateId(null);
    setDeadlineId(undefined);
    setLang("es");
    const deadline = preset?.deadlineId ? extras.deadlines.find((d) => d.id === preset.deadlineId) : undefined;
    if (deadline) {
      apply(templateForDeadline(deadline));
      setDeadlineId(deadline.id);
      // Se programa para la mañana de dos días antes del plazo (o mañana si ya no da tiempo).
      const target = addDays(deadline.date, -2);
      setWhen("later");
      setDate(target > localDate(now) ? target : addDays(localDate(now), 1));
      setHour("09:00");
    } else {
      const t = PUBLICATION_TEMPLATES.find((x) => x.id === preset?.template);
      if (t) apply(t);
    }
    if (preset?.audience) setAudience(preset.audience);
    if (preset?.faculty) setFacs([preset.faculty]);
    // Desde la alerta de primero: un aviso cercano para quien aún no ha venido a nada.
    if (preset?.audience === "welcome_absent" && preset.faculty && !deadline && !preset.template) {
      setChannel("aviso");
      setTitle(`Primero de ${preset.faculty}: aún estás a tiempo`);
      setBody("Esta semana hay actividades de tu facultad y de las asociaciones del campus. Pásate por la siguiente parada del pasaporte: conocerás a gente de tu curso y te llevas las ventajas de los comercios del campus.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Aviso urgente: siempre sale ya y con confirmación de lectura.
  React.useEffect(() => {
    if (!urgent) return;
    setWhen("now");
    setChannel("aviso");
    setReadReceipt(true);
  }, [urgent]);

  const scoped = FACULTY_SCOPED.includes(audience);
  const chosenFaculties = scoped ? facs : [];
  const estimate = estimateReach(extras, channel, audience, chosenFaculties);
  const hints = accessibilityHints(title, body);
  const needsFaculty = audience === "faculties" && facs.length === 0;
  const blocked = hasAudiences && estimate.tooSmall && !needsFaculty;
  const valid = title.trim().length > 4 && body.trim().length > 4 && !needsFaculty && !blocked && (!english || titleEn.trim().length > 4);

  const save = async (status: ProUniPublication["status"]) => {
    const [h, m] = hour.split(":").map(Number);
    const at = status === "scheduled" ? atLocal(date, (h || 0) * 60 + (m || 0)) : now.toISOString();
    const chosen = chosenFaculties;
    const p: UniPublication = {
      id: localId("p"),
      title: title.trim(),
      body: body.trim(),
      channel,
      at,
      reach: 0,
      reactions: 0,
      status,
      audience: audienceText(audience, chosen),
      audienceKey: audience,
      faculties: chosen.length ? chosen : undefined,
      official: true,
      readReceipt: readReceipt || undefined,
      reads: readReceipt ? initialReads(extras, audience, chosen) : undefined,
      urgent: urgent && status === "published" ? { kind: urgentKind, until: urgentUntil(duration, now) } : undefined,
      titleEn: english && titleEn.trim() ? titleEn.trim() : undefined,
      bodyEn: english && bodyEn.trim() ? bodyEn.trim() : undefined,
      help: help || undefined,
      deadlineId,
    };
    const ok = await run(
      "publication.create",
      (d) => ({ ...d, uniPublications: [p, ...d.uniPublications] }),
      status === "published"
        ? urgent
          ? "Aviso urgente publicado"
          : "Publicada con distintivo oficial"
        : status === "scheduled"
          ? "Publicación programada"
          : "Borrador guardado",
      status === "draft" || !hasAudiences ? undefined : `Llegará a unos ${estimate.reach.toLocaleString("es-ES")} estudiantes.`,
    );
    if (ok) onClose();
  };

  const previewTitle = lang === "en" && titleEn ? titleEn : title;
  const previewBody = lang === "en" && bodyEn ? bodyEn : body;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={urgent ? "Aviso urgente" : "Nueva publicación oficial"}
      description="Sale con el distintivo verificado de la universidad."
      footer={
        <>
          {urgent ? null : (
            <Button variant="ghost" onClick={() => save("draft")} disabled={!title.trim()}>
              Guardar borrador
            </Button>
          )}
          <Button variant="dark" onClick={() => save(when === "now" ? "published" : "scheduled")} disabled={!valid}>
            <Send className="h-4 w-4" /> {when === "now" ? "Publicar" : "Programar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Empieza con una plantilla" hint="Rellena el texto; cambia lo que va entre corchetes.">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pro-scroll">
            {PUBLICATION_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={templateId === t.id}
                onClick={() => apply(t)}
                className={cn(
                  "min-h-10 shrink-0 rounded-full border px-3.5 text-[0.82rem] font-semibold transition-colors",
                  templateId === t.id ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Canal">
          <ChoiceChips
            value={channel}
            onChange={setChannel}
            options={(Object.keys(CHANNEL) as ProUniPublication["channel"][]).map((c) => ({ value: c, label: CHANNEL[c].label, hint: CHANNEL[c].hint }))}
          />
        </FormField>

        <FormField label="Título" htmlFor="pub-title">
          <input id="pub-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Horario de las bibliotecas en exámenes" />
        </FormField>
        <FormField label="Texto" htmlFor="pub-body">
          <textarea id="pub-body" className={cn(textareaClass, "min-h-[120px]")} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Lo esencial primero: qué, cuándo y qué tienen que hacer." />
        </FormField>

        {hints.length ? (
          <ul className="flex flex-col gap-1.5 rounded-xl bg-bg-secondary px-3.5 py-3 text-sm text-text-secondary">
            {hints.map((h) => (
              <li key={h} className="flex gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} /> {h}
              </li>
            ))}
          </ul>
        ) : null}

        <FormField label="Para quién">
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCE_ORDER.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => {
                  setAudience(a);
                  if (a === "erasmus") setEnglish(true);
                }}
                className={cn(
                  "min-h-10 rounded-full border px-3.5 text-[0.82rem] font-semibold transition-colors",
                  audience === a ? "border-violet bg-violet-50 text-violet-deep" : "border-border text-text-secondary hover:border-text-primary/25",
                )}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
          {scoped ? (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-bg-secondary p-2">
              {audience === "faculties" ? null : (
                <p className="w-full px-1 text-xs text-text-muted">Todas las facultades, o elige solo algunas.</p>
              )}
              {facultyOptions(data).map((f) => {
                const on = facs.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFacs((list) => (on ? list.filter((x) => x !== f) : [...list, f]))}
                    className={cn(
                      "min-h-10 rounded-full border px-3 text-xs font-semibold transition-colors",
                      on ? "border-violet bg-bg-primary text-violet-deep" : "border-border bg-bg-primary text-text-secondary hover:border-text-primary/25",
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          ) : null}
        </FormField>

        <div className="flex flex-col gap-2">
          <ToggleRow
            id="pub-read"
            label="Pedir que confirmen con “Lo he leído”"
            hint="Verás el porcentaje por facultad y podrás recordarlo solo a quien no lo vio."
            checked={readReceipt}
            onChange={setReadReceipt}
          />
          <ToggleRow
            id="pub-urgent"
            label="Aviso urgente de campus"
            hint="Sale ya y queda fijado arriba del campus hasta que lo retires."
            checked={urgent}
            onChange={setUrgent}
          />
          {urgent ? (
            <div className="grid gap-3 rounded-xl border border-border p-3.5">
              <FormField label="Qué pasa">
                <ChoiceChips
                  value={urgentKind}
                  onChange={setUrgentKind}
                  options={(Object.keys(URGENT_KIND_LABEL) as ProUniUrgentKind[]).map((k) => ({ value: k, label: URGENT_KIND_LABEL[k] }))}
                />
              </FormField>
              <FormField label="Fijado arriba">
                <ChoiceChips
                  value={duration}
                  onChange={setDuration}
                  options={(Object.keys(URGENT_DURATION_LABEL) as UrgentDuration[]).map((k) => ({ value: k, label: URGENT_DURATION_LABEL[k] }))}
                />
              </FormField>
            </div>
          ) : null}
          <ToggleRow
            id="pub-english"
            label="Versión en inglés"
            hint="Erasmus e internacionales la ven en inglés si tienen Franky en ese idioma."
            checked={english}
            onChange={setEnglish}
          />
          {english ? (
            <div className="grid gap-3 rounded-xl border border-border p-3.5">
              <FormField label="Title" htmlFor="pub-title-en">
                <input id="pub-title-en" lang="en" className={inputClass} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="Library opening hours during exams" />
              </FormField>
              <FormField label="Text" htmlFor="pub-body-en">
                <textarea id="pub-body-en" lang="en" className={textareaClass} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
              </FormField>
            </div>
          ) : null}
          <ToggleRow
            id="pub-help"
            label="Botón fijo “Pedir ayuda”"
            hint={extras.help.length ? `Enlaza con ${extras.help.map((h) => h.label).join(", ")}.` : "Para la semana de bienestar y avisos delicados."}
            checked={help}
            onChange={setHelp}
          />
        </div>

        {urgent ? null : (
          <FormField label="Cuándo">
            <ChoiceChips
              value={when}
              onChange={setWhen}
              options={[
                { value: "now", label: "Ahora" },
                { value: "later", label: "Programar" },
              ]}
            />
            {when === "later" ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input aria-label="Fecha" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
                <input aria-label="Hora" type="time" className={inputClass} value={hour} onChange={(e) => setHour(e.target.value)} />
              </div>
            ) : null}
          </FormField>
        )}

        <div className="rounded-2xl border border-border bg-bg-secondary/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">Así lo verán</p>
            {english ? (
              <Segmented<Lang>
                label="Idioma de la vista previa"
                value={lang}
                onChange={setLang}
                options={[
                  { value: "es", label: "ES" },
                  { value: "en", label: "EN" },
                ]}
              />
            ) : null}
          </div>
          <div className={cn("mt-3 rounded-xl border bg-bg-primary p-3.5", urgent ? "border-rose-500/40" : "border-border")}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {data.space.name}
              <BadgeCheck className="h-4 w-4 text-violet" aria-label="Oficial" />
            </p>
            {urgent ? <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-rose-700 dark:text-rose-300">{URGENT_KIND_LABEL[urgentKind]}</p> : null}
            <p className="mt-1.5 font-heading text-base font-bold">{previewTitle || "Tu título"}</p>
            <p className="mt-0.5 line-clamp-4 text-sm text-text-secondary">{previewBody || "El texto de la publicación."}</p>
            {readReceipt || help ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {readReceipt ? (
                  <span className="inline-flex h-9 items-center rounded-xl bg-text-primary px-3 text-xs font-semibold text-bg-primary">
                    {lang === "en" ? "I've read it" : "Lo he leído"}
                  </span>
                ) : null}
                {help ? (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold">
                    <HeartHandshake className="h-3.5 w-3.5" /> {lang === "en" ? "Get help" : "Pedir ayuda"}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {hasAudiences ? (
            <p className="mt-3 flex items-start gap-1.5 text-sm">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
              {needsFaculty ? (
                <span className="text-text-muted">Elige al menos una facultad.</span>
              ) : estimate.tooSmall ? (
                <span>Este público tiene menos de {PRIVACY_MIN_GROUP} personas. Elige uno más amplio.</span>
              ) : (
                <span>
                  {estimate.people.toLocaleString("es-ES")} estudiantes en el público. Lo verán unos{" "}
                  <span className="font-semibold tabular">{estimate.reach.toLocaleString("es-ES")}</span>.
                </span>
              )}
            </p>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
