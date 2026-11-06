"use client";

import * as React from "react";
import { CalendarPlus, Check, CircleSlash, ClipboardList, FileText, MessageCircle, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePro } from "@/lib/pro/store";
import type { ProLead } from "@/lib/pro/types";
import type { ProTenantDocKind, ProTenantDocState, ProTenantDocs } from "@/lib/pro/housing-types";
import { relative } from "@/lib/pro/format";
import {
  DOC_KINDS,
  assignBest,
  docsProgress,
  flatCompatibility,
  leadFit,
  recordReply,
  replyTemplates,
  whatsappHref,
  type LeadFit,
  type ReplyId,
} from "@/lib/pro/housing-ops";
import { cn } from "@/lib/utils";
import { FormField, Pill, inputClass } from "../../kit";
import { RequestDocsButton } from "./desk-tools";

const REPLY_ICON: Record<ReplyId, typeof MessageCircle> = {
  visit: CalendarPlus,
  terms: FileText,
  docs: ClipboardList,
  full: CircleSlash,
};

/**
 * Respuestas en un toque: cada botón abre WhatsApp con el mensaje ya escrito
 * (nombre, piso, precio y franjas libres) y deja apuntado que se ha contestado.
 */
export function QuickReplies({ lead, compact }: { lead: ProLead; compact?: boolean }) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const templates = replyTemplates(data, lead, now, vertical.id === "landlord");
  const sent = (id: ReplyId) => lead.replies?.filter((r) => r.id === id).at(-1);

  return (
    <div>
      {!compact ? <p className="eyebrow mb-1.5">Contestar por WhatsApp</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {templates.map((t) => {
          const Icon = REPLY_ICON[t.id];
          const last = sent(t.id);
          return (
            <a
              key={t.id}
              href={whatsappHref(t.text)}
              target="_blank"
              rel="noreferrer"
              title={t.text}
              onClick={() => {
                update(`lead.reply.${t.id}`, (d) => recordReply(d, lead.id, t, new Date().toISOString()));
                toast.success("Mensaje listo en WhatsApp", lead.stage === "new" && t.nextStage ? `${lead.name.split(" ")[0]} pasa a contactado.` : "Solo tienes que enviarlo.");
              }}
              className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:border-text-primary/25 hover:bg-bg-secondary"
            >
              <Icon className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{t.label}</span>
                {last ? <span className="block truncate text-[0.7rem] text-text-muted">Enviado {relative(last.at, now.getTime())}</span> : null}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** Por qué encaja un interesado y la mejor habitación para él, con asignación en un toque. */
export function FitBox({ lead, fit }: { lead: ProLead; fit?: LeadFit }) {
  const { data, update } = usePro();
  const toast = useToast();
  const f = fit ?? leadFit(data, lead);
  const target = f.best ? `${f.best.room.name} de ${f.best.property.title}` : f.wholeFlat ? `${f.wholeFlat.property.title} entero` : null;
  const already = f.best
    ? lead.roomId === f.best.room.id && lead.propertyId === f.best.property.id
    : f.wholeFlat
      ? lead.propertyId === f.wholeFlat.property.id
      : false;

  return (
    <div className={cn("rounded-2xl border p-3.5", f.fits ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border")}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className={cn("h-4 w-4", f.fits ? "text-emerald-700 dark:text-emerald-300" : "text-text-muted")} strokeWidth={1.9} />
        {f.fits ? "Encaja con tu cartera" : "Ahora no encaja"}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1 text-sm text-text-secondary">
        {f.reasons.map((r) => (
          <li key={r} className="flex gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" strokeWidth={2} />
            <span>{r}</span>
          </li>
        ))}
        {f.issues.map((r) => (
          <li key={r} className="flex gap-1.5 text-amber-900 dark:text-amber-200">
            <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {target && f.fits && !already ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2.5"
          onClick={() => {
            update("lead.assign.best", (d) => assignBest(d, lead.id));
            toast.success("Habitación asignada", target);
          }}
        >
          {lead.roomieGroup ? <Users className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />} Asignar {target.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}

/** Compatibilidad de Roomie con los que ya viven en el piso. */
export function FlatCompat({ personId, propertyId, exceptTenantId }: { personId: string; propertyId?: string; exceptTenantId?: string }) {
  const { data, now } = usePro();
  if (!propertyId) return null;
  const c = flatCompatibility(data, personId, propertyId, now, exceptTenantId);
  if (!c) return <span className="text-xs text-text-muted">Aún no vive nadie en el piso.</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-deep">
      <Users className="h-3.5 w-3.5 text-violet" strokeWidth={1.9} />
      {c.score} % compatible con {c.with === 1 ? "quien vive allí" : `los ${c.with} que viven allí`}
    </span>
  );
}

const DOC_STATUS: { value: ProTenantDocState["status"]; label: string }[] = [
  { value: "missing", label: "Falta" },
  { value: "requested", label: "Pedido" },
  { value: "received", label: "Recibido" },
];

/**
 * Papeles del interesado o del inquilino: pedido o recibido, y los datos del
 * avalista. Solo lo ve el equipo.
 */
export function DocsChecklist({
  docs,
  onChange,
  personName,
}: {
  docs?: ProTenantDocs;
  onChange: (next: ProTenantDocs) => void;
  /** Con nombre, sale el botón que pide por WhatsApp lo que falta. */
  personName?: string;
}) {
  const current: ProTenantDocs = docs ?? { items: {} };
  const progress = docsProgress(current);
  const [name, setName] = React.useState(current.guarantor?.name ?? "");
  const [phone, setPhone] = React.useState(current.guarantor?.phone ?? "");
  const setItem = (kind: ProTenantDocKind, status: ProTenantDocState["status"]) =>
    onChange({ ...current, items: { ...current.items, [kind]: { status, at: new Date().toISOString() } } });
  const guarantorDirty = name.trim() !== (current.guarantor?.name ?? "") || phone.trim() !== (current.guarantor?.phone ?? "");

  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Documentación</p>
        <Pill tone={progress.complete ? "success" : "warning"}>
          {progress.received} de {progress.total}
        </Pill>
      </div>
      <ul className="mt-2 flex flex-col divide-y divide-border-light">
        {DOC_KINDS.map((k) => {
          const status = current.items[k.id]?.status ?? "missing";
          return (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm">{k.label}</span>
              <div role="group" aria-label={k.label} className="inline-flex rounded-lg bg-bg-secondary p-0.5">
                {DOC_STATUS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={status === s.value}
                    onClick={() => setItem(k.id, s.value)}
                    className={cn(
                      "h-8 rounded-md px-2.5 text-xs font-semibold transition-colors",
                      status === s.value
                        ? s.value === "received"
                          ? "bg-bg-primary text-emerald-700 shadow-card dark:text-emerald-300"
                          : "bg-bg-primary text-text-primary shadow-card"
                        : "text-text-muted hover:text-text-primary",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {personName ? <RequestDocsButton personName={personName} docs={current} onRequested={onChange} className="mt-1" /> : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <FormField label="Avalista" htmlFor="doc-g-name">
          <input id="doc-g-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Nombre" />
        </FormField>
        <FormField label="Teléfono" htmlFor="doc-g-phone">
          <input id="doc-g-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="600 000 000" />
        </FormField>
      </div>
      {guarantorDirty ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => onChange({ ...current, guarantor: name.trim() ? { ...current.guarantor, name: name.trim(), phone: phone.trim() || undefined } : undefined })}
        >
          Guardar avalista
        </Button>
      ) : null}
    </div>
  );
}
