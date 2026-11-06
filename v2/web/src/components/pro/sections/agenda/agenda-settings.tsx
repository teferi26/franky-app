"use client";

import * as React from "react";
import { Download, Images, MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId } from "@/lib/pro/store";
import type { ProSpace } from "@/lib/pro/types";
import type {
  ProConsentTemplate,
  ProTemplateKind,
} from "@/lib/pro/agenda-types";
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_META,
  TEMPLATE_VARS,
  fillTemplate,
  publicLink,
  saveConsentTemplate,
  saveSettings,
  saveTemplate,
} from "@/lib/pro/agenda-ops";
import { setShowcase, showcasePhotos } from "@/lib/pro/agenda-clients";
import { dayLabel, money } from "@/lib/pro/format";
import { Empty, FormField, Panel, inputClass, textareaClass } from "../../kit";
import { NotYet, OptionButton, useAgenda } from "./parts";
import { ChecklistSettings } from "./day-checklist";
import { ImportClients } from "./import-clients";

/**
 * Ajustes propios de la agenda: la regla de señal, la política de
 * cancelación que ve el cliente, los mensajes de WhatsApp, las tareas de
 * apertura y cierre, los consentimientos que se firman y el escaparate.
 */
export function AgendaSettings() {
  const { ops, vertical } = useAgenda();
  if (!ops)
    return (
      <NotYet
        icon={MessageSquareText}
        title="Tus mensajes y reglas llegarán aquí"
      />
    );
  return (
    <div className="flex flex-col gap-5">
      <Rules />
      <Templates />
      <ChecklistSettings />
      <ImportClients />
      {vertical.id === "beauty" || ops.consentTemplates.length ? (
        <Consents />
      ) : null}
      <Showcase />
    </div>
  );
}

/**
 * Fotos de antes y después que cada cliente ha dejado enseñar. Se marcan
 * desde su ficha; si retira el permiso, desaparecen de aquí.
 */
function Showcase() {
  const { data, run, allowed } = useAgenda();
  const photos = showcasePhotos(data);
  return (
    <Panel
      title="Tu escaparate"
      description="Los antes y después que tus clientes te dejan enseñar. Descárgalos para tus redes o tu ficha."
    >
      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map(({ client, photo }) => (
            <li key={photo.id} className="flex flex-col gap-1.5">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-bg-secondary">
                {/* Foto reducida guardada en la ficha, sin next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={`${photo.kind === "before" ? "Antes" : "Después"}, ${client.name.split(" ")[0]}`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-md bg-bg-primary/90 px-1.5 py-0.5 text-[0.68rem] font-semibold">
                  {photo.kind === "before" ? "Antes" : "Después"}
                </span>
              </div>
              <p className="truncate text-xs text-text-muted">
                {client.name.split(" ")[0]} ·{" "}
                {dayLabel(photo.at, { weekday: false })}
              </p>
              <div className="flex gap-1">
                <a
                  href={photo.src}
                  download={`${data.space.slug}-${photo.kind === "before" ? "antes" : "despues"}-${photo.id}.jpg`}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:border-text-primary/25"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.9} />
                  Descargar
                </a>
                <button
                  type="button"
                  aria-label="Quitar del escaparate"
                  disabled={!allowed("agenda.photo")}
                  onClick={() =>
                    void run("agenda.photo", (d) =>
                      setShowcase(d, client.id, photo.id, false),
                    )
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary disabled:opacity-40"
                >
                  <X className="h-4 w-4" strokeWidth={1.9} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={Images}
          title="Aún no hay fotos en tu escaparate"
          body="En la ficha de cada cliente, con su permiso de fotos, guarda el antes y el después y marca Puede salir en tu escaparate."
        />
      )}
    </Panel>
  );
}

function Rules() {
  const { data, ops, run, allowed } = useAgenda();
  const toast = useToast();
  const settings = ops!.settings;
  const [policy, setPolicy] = React.useState(settings.cancellationPolicy);
  const [review, setReview] = React.useState(settings.reviewUrl);
  const save = (patch: Parameters<typeof saveSettings>[1], message?: string) =>
    run("agenda.settings", (d) => saveSettings(d, patch)).then((ok) => {
      if (ok && message) toast.success(message);
    });
  const hasTests = data.services.some((s) => s.agenda?.patchTest);

  return (
    <>
      <Panel
        title="Señal contra los no presentados"
        description="Quien falla varias veces te deja señal la próxima vez. La pides por Bizum y se descuenta al cobrar."
      >
        <div className="flex flex-col gap-5">
          <FormField label="Pedir señal a partir de">
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((n) => (
                <OptionButton
                  key={n}
                  active={settings.depositAfterNoShows === n}
                  disabled={!allowed("agenda.settings")}
                  onClick={() => void save({ depositAfterNoShows: n })}
                >
                  {n === 0 ? "Nunca" : n === 1 ? "1 falta" : `${n} faltas`}
                </OptionButton>
              ))}
            </div>
          </FormField>
          {settings.depositAfterNoShows ? (
            <FormField label="Importe de la señal">
              <div className="flex flex-wrap gap-2">
                {[500, 1000, 1500, 2000].map((cents) => (
                  <OptionButton
                    key={cents}
                    active={settings.depositCents === cents}
                    disabled={!allowed("agenda.settings")}
                    onClick={() => void save({ depositCents: cents })}
                  >
                    {money(cents, { round: true })}
                  </OptionButton>
                ))}
              </div>
            </FormField>
          ) : null}
          {hasTests ? (
            <FormField
              label="La prueba de sensibilidad vale"
              hint="Pasado ese tiempo, al citar un color o un tinte te avisamos de repetirla."
            >
              <div className="flex flex-wrap gap-2">
                {[90, 180, 365].map((days) => (
                  <OptionButton
                    key={days}
                    active={settings.patchTestValidDays === days}
                    disabled={!allowed("agenda.settings")}
                    onClick={() => void save({ patchTestValidDays: days })}
                  >
                    {days === 365 ? "1 año" : `${days / 30} meses`}
                  </OptionButton>
                ))}
              </div>
            </FormField>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Cancelaciones y reseñas"
        description="La política la ve el cliente al reservar en tu ficha."
      >
        <div className="flex flex-col gap-4">
          <FormField label="Política de cancelación" htmlFor="ag-policy">
            <textarea
              id="ag-policy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              className={textareaClass}
            />
          </FormField>
          <FormField
            label="Enlace para dejar reseña"
            htmlFor="ag-review"
            hint="Tu ficha de Google o la de Franky. Va en el mensaje de gracias."
          >
            <input
              id="ag-review"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <Button
            variant="dark"
            className="self-start"
            disabled={
              !allowed("agenda.settings") ||
              (policy === settings.cancellationPolicy &&
                review === settings.reviewUrl)
            }
            onClick={() =>
              void save(
                {
                  cancellationPolicy: policy.trim(),
                  reviewUrl: review.trim() || settings.reviewUrl,
                },
                "Guardado",
              )
            }
          >
            Guardar
          </Button>
        </div>
      </Panel>
    </>
  );
}

/** Ejemplo con el que se enseña cómo queda cada mensaje. */
function sampleVars(space: ProSpace, reviewUrl?: string): Record<string, string> {
  const link = publicLink(space).replace("https://", "");
  return {
    nombre: "Lucía",
    negocio: space.name,
    dia: "jueves 2 de octubre",
    hora: "17:30",
    servicio: "degradado",
    profesional: "Marcos",
    enlace: link,
    resena: reviewUrl?.replace("https://", "") || link,
    semanas: "4",
    senal: "5 €",
    cuidados: "no mojes la zona en 24 horas.",
  };
}

function Templates() {
  const { data, ops } = useAgenda();
  const [open, setOpen] = React.useState<ProTemplateKind | null>(null);
  const kinds = Object.keys(TEMPLATE_META) as ProTemplateKind[];
  return (
    <Panel
      title="Tus mensajes de WhatsApp"
      description="Cada botón de WhatsApp sale con tu texto. Cambia las palabras a tu manera; lo que va entre llaves se rellena solo."
      flush
    >
      <ul className="divide-y divide-border-light">
        {kinds.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              aria-expanded={open === kind}
              onClick={() => setOpen(open === kind ? null : kind)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {TEMPLATE_META[kind].label}
                </span>
                <span className="block truncate text-xs text-text-muted">
                  {TEMPLATE_META[kind].when} ·{" "}
                  {fillTemplate(
                    ops!.templates[kind],
                    sampleVars(data.space, data.agendaOps?.settings.reviewUrl),
                  )}
                </span>
              </span>
            </button>
            {open === kind ? (
              <TemplateEditor kind={kind} onDone={() => setOpen(null)} />
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TemplateEditor({
  kind,
  onDone,
}: {
  kind: ProTemplateKind;
  onDone: () => void;
}) {
  const { data, ops, run, allowed } = useAgenda();
  const toast = useToast();
  const [text, setText] = React.useState(ops!.templates[kind]);
  const area = React.useRef<HTMLTextAreaElement>(null);

  const insert = (key: string) => {
    const el = area.current;
    const token = `{${key}}`;
    if (!el) return setText((t) => `${t}${token}`);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText(text.slice(0, start) + token + text.slice(end));
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border-light bg-bg-secondary/40 px-4 py-4 sm:px-5">
      <textarea
        ref={area}
        aria-label={`Mensaje de ${TEMPLATE_META[kind].label}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${textareaClass} min-h-28`}
      />
      <div className="flex flex-wrap gap-1.5">
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => insert(v.key)}
            className="inline-flex h-8 items-center rounded-lg border border-border bg-bg-primary px-2.5 text-xs font-semibold text-text-secondary"
          >
            + {v.label}
          </button>
        ))}
      </div>
      <p className="rounded-xl bg-bg-primary p-3 text-sm text-text-secondary">
        {fillTemplate(text, sampleVars(data.space, data.agendaOps?.settings.reviewUrl))}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="dark"
          disabled={!allowed("agenda.template")}
          onClick={async () => {
            if (
              await run("agenda.template", (d) => saveTemplate(d, kind, text))
            ) {
              toast.success("Mensaje guardado", TEMPLATE_META[kind].label);
              onDone();
            }
          }}
        >
          Guardar mensaje
        </Button>
        <Button
          variant="ghost"
          onClick={() => setText(DEFAULT_TEMPLATES[kind])}
        >
          Volver al de Franky
        </Button>
      </div>
    </div>
  );
}

function Consents() {
  const { ops, run, allowed } = useAgenda();
  const toast = useToast();
  const [editing, setEditing] = React.useState<ProConsentTemplate | null>(null);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");

  const edit = (template: ProConsentTemplate | null) => {
    const next = template ?? { id: localId("cs"), title: "", body: "" };
    setEditing(next);
    setTitle(next.title);
    setBody(next.body);
  };

  return (
    <Panel
      title="Consentimientos"
      description="Se firman con el dedo en la cita y quedan en la ficha con fecha. Asígnalos en cada tratamiento."
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-10"
          disabled={!allowed("agenda.consent")}
          onClick={() => edit(null)}
        >
          Añadir
        </Button>
      }
      flush
    >
      <ul className="divide-y divide-border-light">
        {ops!.consentTemplates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => edit(template)}
              className="flex min-h-14 w-full flex-col justify-center px-4 py-3 text-left transition-colors hover:bg-bg-secondary sm:px-5"
            >
              <span className="text-sm font-semibold">{template.title}</span>
              <span className="line-clamp-1 text-xs text-text-muted">
                {template.body}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="flex flex-col gap-3 border-t border-border-light p-4 sm:px-5">
          <FormField label="Título" htmlFor="cs-title">
            <input
              id="cs-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <FormField label="Texto" htmlFor="cs-body">
            <textarea
              id="cs-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={`${textareaClass} min-h-40`}
            />
          </FormField>
          <div className="flex gap-2">
            <Button
              variant="dark"
              disabled={
                title.trim().length < 3 ||
                body.trim().length < 20 ||
                !allowed("agenda.consent")
              }
              onClick={async () => {
                const template = {
                  id: editing.id,
                  title: title.trim(),
                  body: body.trim(),
                };
                if (
                  await run("agenda.consent", (d) =>
                    saveConsentTemplate(d, template),
                  )
                ) {
                  toast.success("Consentimiento guardado", template.title);
                  setEditing(null);
                }
              }}
            >
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
