"use client";

import * as React from "react";
import { Camera, Check, ClipboardList, FileCheck2, MessageCircle, Phone, Plus, Trash2, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProIncident, ProTenant } from "@/lib/pro/types";
import type { ProHousingProvider, ProProviderTrade, ProTenantDocs } from "@/lib/pro/housing-types";
import { money, relative } from "@/lib/pro/format";
import { TRADE_LABEL, whatsappHref } from "@/lib/pro/housing-ops";
import { depositSurcharge, removeProvider, saveProvider } from "@/lib/pro/housing-tools";
import {
  INCIDENT_PHOTO_LIMIT,
  addIncidentPhotos,
  docsRequestText,
  markDocsRequested,
  markReminded,
  missingDocs,
  proofLine,
  providersByTrade,
  removeIncidentPhoto,
  rentReminderQueue,
  suggestedProvider,
  temporalityProof,
} from "@/lib/pro/housing-desk";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Panel, Pill, inputClass, textareaClass } from "../../kit";

/**
 * Piezas del día a día que se reutilizan en Inquilinos, en las fichas y en el
 * Resumen: recordar la renta por WhatsApp, pedir los papeles que faltan, la
 * prueba de la temporada, el recargo de una fianza tardía, los técnicos por
 * oficio y las fotos de una incidencia.
 */

/* ------------------------------------------------------------------ */
/* Recordar la renta, uno a uno                                         */
/* ------------------------------------------------------------------ */

/**
 * Cola de recordatorios: WhatsApp no deja mandar varios a la vez, así que se
 * abren uno a uno y cada uno queda marcado al tocarlo.
 */
export function RentReminderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const queue = rentReminderQueue(data, now);
  const [done, setDone] = React.useState<Set<string>>(new Set());
  const total = queue.reduce((a, r) => a + r.owedCents, 0);
  const pending = queue.filter((r) => !done.has(r.tenant.id));

  const sent = (tenant: ProTenant) => {
    update("tenant.remind", (d) => markReminded(d, [tenant.id], new Date().toISOString()));
    setDone((s) => new Set(s).add(tenant.id));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={queue.length ? `Recordar a ${queue.length} ${queue.length === 1 ? "inquilino" : "inquilinos"}` : "Todos al día"}
      description={queue.length ? `Faltan ${money(total, { round: true })}. Cada mensaje sale con su nombre y lo que debe.` : undefined}
      footer={
        <Button
          variant="dark"
          onClick={() => {
            if (done.size) toast.success("Recordatorios apuntados", `${done.size} ${done.size === 1 ? "mensaje" : "mensajes"} hoy.`);
            onClose();
          }}
        >
          {pending.length ? "Terminar luego" : "Hecho"}
        </Button>
      }
    >
      {queue.length ? (
        <ul className="flex flex-col gap-2">
          {queue.map((row) => {
            const isDone = done.has(row.tenant.id);
            return (
              <li key={row.tenant.id} className={cn("flex items-center gap-3 rounded-2xl border p-3", isDone ? "border-border-light opacity-60" : "border-border")}>
                <Avatar name={row.tenant.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.tenant.name}</span>
                  <span className="block truncate text-xs text-text-muted">
                    <span className="tabular">{money(row.owedCents)}</span>
                    {row.months > 1 ? ` de ${row.months} meses` : ""}
                    {row.tenant.remindedAt ? ` · recordado ${relative(row.tenant.remindedAt, now.getTime())}` : ""}
                  </span>
                </span>
                {row.late ? <Pill tone="danger">Con retraso</Pill> : null}
                {isDone ? (
                  <Pill tone="success">
                    <Check className="h-3 w-3" /> Enviado
                  </Pill>
                ) : (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={whatsappHref(row.text)} target="_blank" rel="noreferrer" onClick={() => sent(row.tenant)}>
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={Check} title="Nadie debe nada" body="Cuando alguien se retrase, aparecerá aquí con su mensaje listo." />
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Fianza fuera de plazo                                                */
/* ------------------------------------------------------------------ */

/** Días de retraso y la horquilla del recargo de la Generalitat. Nada si va en plazo. */
export function DepositLateNote({ tenant, today, className }: { tenant: ProTenant; today: string; className?: string }) {
  const s = depositSurcharge(tenant, today);
  if (!s) return null;
  return (
    <p className={cn("rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200", className)}>
      Lleva {s.lateDays} {s.lateDays === 1 ? "día" : "días"} fuera de plazo. El recargo va del 5 al 20 % según el retraso:{" "}
      <span className="font-semibold tabular">
        entre {money(s.minCents)} y {money(s.maxCents)}
      </span>
      . Cuanto antes la deposites, menos pagas.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Papeles                                                              */
/* ------------------------------------------------------------------ */

/**
 * Pide por WhatsApp solo lo que falta y lo deja marcado como pedido. Si ya
 * está todo, no se enseña.
 */
export function RequestDocsButton({
  personName,
  docs,
  phone,
  onRequested,
  className,
}: {
  personName: string;
  docs?: ProTenantDocs;
  phone?: string;
  onRequested: (next: ProTenantDocs) => void;
  className?: string;
}) {
  const { data } = usePro();
  const missing = missingDocs(docs);
  const text = docsRequestText(data, personName, docs);
  if (!missing.length || !text) return null;
  return (
    <Button size="sm" variant="secondary" className={className} asChild>
      <a href={whatsappHref(text, phone)} target="_blank" rel="noreferrer" onClick={() => onRequested(markDocsRequested(docs, new Date().toISOString()))}>
        <ClipboardList className="h-3.5 w-3.5" /> Pedir lo que falta ({missing.length})
      </a>
    </Button>
  );
}

/** La matrícula guardada con el contrato de temporada: prueba del motivo. */
export function TemporalityProofLine({
  kind,
  docs,
  personName,
  onRequested,
}: {
  kind: ProTenant["contractKind"];
  docs?: ProTenantDocs;
  personName: string;
  onRequested: (next: ProTenantDocs) => void;
}) {
  const { data } = usePro();
  const proof = temporalityProof(kind, docs);
  if (!proof.needed) return null;
  const ask = `Hola ${personName.split(" ")[0]}, soy ${data.space.owner.firstName}. Para el contrato de temporada necesito una foto de tu matrícula o de la carta de admisión de este curso. Me la puedes mandar por aquí. Gracias.`;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border p-3.5",
        proof.ok ? "border-border" : "border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      <FileCheck2 className={cn("h-4 w-4 shrink-0", proof.ok ? "text-emerald-600" : "text-amber-700 dark:text-amber-300")} strokeWidth={1.9} />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">Prueba de la temporada</span>
        <span className="text-xs text-text-muted">{proofLine(proof)}</span>
      </span>
      {!proof.ok ? (
        <Button size="sm" variant="outline" asChild>
          <a
            href={whatsappHref(ask)}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              const at = new Date().toISOString();
              onRequested({ ...(docs ?? { items: {} }), items: { ...(docs?.items ?? {}), enrolment: { status: "requested", at } } });
            }}
          >
            <MessageCircle className="h-3.5 w-3.5" /> Pedir matrícula
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Técnicos de confianza                                                */
/* ------------------------------------------------------------------ */

const TRADES = Object.keys(TRADE_LABEL) as ProProviderTrade[];

/** Agenda de técnicos agrupada por oficio, con trabajo abierto y lo pagado en el año. */
export function ProvidersPanel() {
  const { data, now } = usePro();
  const [editing, setEditing] = React.useState<ProHousingProvider | "new" | null>(null);
  const groups = providersByTrade(data, now);
  const count = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <Panel
      title="Tus técnicos"
      description={count ? `${count} de confianza, por oficio. Tócalos para llamar o escribir.` : "Guarda aquí a tu fontanero, tu electricista y tu cerrajero."}
      action={
        <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> Técnico
        </Button>
      }
      flush
    >
      {groups.length ? (
        <div className="divide-y divide-border-light">
          {groups.map((g) => (
            <div key={g.trade} className="px-4 py-3 sm:px-5">
              <p className="eyebrow">{g.label}</p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {g.rows.map((row) => (
                  <li key={row.provider.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <button type="button" onClick={() => setEditing(row.provider)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-semibold hover:underline">{row.provider.name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {row.jobs ? `${row.jobs} ${row.jobs === 1 ? "trabajo" : "trabajos"}` : "Sin trabajos aún"}
                        {row.paidYearCents ? ` · ${money(row.paidYearCents, { round: true })} este año` : ""}
                        {row.provider.note ? ` · ${row.provider.note}` : ""}
                      </span>
                    </button>
                    {row.open ? <Pill tone="info">{row.open} en curso</Pill> : null}
                    <span className="flex gap-1.5">
                      <Button size="icon" variant="ghost" asChild>
                        <a href={`tel:${row.provider.phone.replace(/\s/g, "")}`} aria-label={`Llamar a ${row.provider.name}`}>
                          <Phone className="h-4 w-4" strokeWidth={1.9} />
                        </a>
                      </Button>
                      <Button size="icon" variant="ghost" asChild>
                        <a
                          href={whatsappHref(`Hola, soy ${data.space.owner.firstName} de ${data.space.name}.`, row.provider.phone)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Escribir a ${row.provider.name}`}
                        >
                          <MessageCircle className="h-4 w-4" strokeWidth={1.9} />
                        </a>
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={Wrench}
          title="Aún no tienes técnicos guardados"
          body="Con ellos aquí, cada incidencia se avisa en un toque con la dirección y el problema ya escritos."
          action={<Button variant="dark" onClick={() => setEditing("new")}>Añadir técnico</Button>}
        />
      )}
      <ProviderDrawer provider={editing} onClose={() => setEditing(null)} />
    </Panel>
  );
}

/** Alta y edición de un técnico. */
export function ProviderDrawer({
  provider,
  onClose,
  onSaved,
  defaultTrade,
}: {
  provider: ProHousingProvider | "new" | null;
  onClose: () => void;
  onSaved?: (p: ProHousingProvider) => void;
  defaultTrade?: ProProviderTrade;
}) {
  if (!provider) return null;
  return (
    <ProviderForm
      key={provider === "new" ? "new" : provider.id}
      provider={provider === "new" ? undefined : provider}
      onClose={onClose}
      onSaved={onSaved}
      defaultTrade={defaultTrade}
    />
  );
}

function ProviderForm({
  provider,
  onClose,
  onSaved,
  defaultTrade,
}: {
  provider?: ProHousingProvider;
  onClose: () => void;
  onSaved?: (p: ProHousingProvider) => void;
  defaultTrade?: ProProviderTrade;
}) {
  const { update } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState(provider?.name ?? "");
  const [phone, setPhone] = React.useState(provider?.phone ?? "");
  const [trade, setTrade] = React.useState<ProProviderTrade>(provider?.trade ?? defaultTrade ?? "fontaneria");
  const [note, setNote] = React.useState(provider?.note ?? "");
  const valid = name.trim().length > 1 && phone.replace(/\D/g, "").length >= 9;

  const save = async () => {
    const next: ProHousingProvider = { id: provider?.id ?? localId("pv"), name, phone, trade, note };
    if (!(await update(provider ? "provider.update" : "provider.create", (d) => saveProvider(d, next)))) return;
    toast.success(provider ? "Técnico guardado" : "Técnico añadido", `${name.trim()}, ${TRADE_LABEL[trade].toLowerCase()}.`);
    onSaved?.(next);
    onClose();
  };
  const remove = async () => {
    if (!provider) return;
    if (!(await update("provider.remove", (d) => removeProvider(d, provider.id)))) return;
    toast.success("Técnico quitado", "Sus trabajos anteriores conservan su nombre.");
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={provider ? provider.name : "Nuevo técnico"}
      description="Aparece al asignar una incidencia de su oficio."
      footer={
        <>
          {provider ? (
            <Button variant="ghost" className="mr-auto text-rose-700 dark:text-rose-300" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          )}
          <Button variant="dark" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre o empresa" htmlFor="pv-name">
          <input id="pv-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Fontanería Esteve" />
        </FormField>
        <FormField label="Teléfono" htmlFor="pv-phone">
          <input id="pv-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="600 000 000" />
        </FormField>
        <FormField label="Oficio">
          <ChoiceChips value={trade} onChange={setTrade} options={TRADES.map((t) => ({ value: t, label: TRADE_LABEL[t] }))} />
        </FormField>
        <FormField label="Nota" htmlFor="pv-note" hint="Horario, si hace urgencias, lo que cobra la salida...">
          <textarea id="pv-note" value={note} onChange={(e) => setNote(e.target.value)} className={cn(textareaClass, "min-h-[72px]")} />
        </FormField>
      </div>
    </Drawer>
  );
}

/** Propuesta de técnico según lo que dice la incidencia, para asignarlo en un toque. */
export function SuggestedProvider({ incident, currentId, onPick }: { incident: Pick<ProIncident, "title">; currentId?: string; onPick: (id: string) => void }) {
  const { data, now } = usePro();
  const pick = suggestedProvider(data, incident, now);
  if (!pick || pick.provider.id === currentId) return null;
  return (
    <button
      type="button"
      onClick={() => onPick(pick.provider.id)}
      className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-dashed border-violet/40 px-3 py-2 text-left text-sm transition-colors hover:bg-violet-50/60"
    >
      <Wrench className="h-4 w-4 shrink-0 text-violet" strokeWidth={1.9} />
      <span className="min-w-0 flex-1">
        Parece de {TRADE_LABEL[pick.provider.trade].toLowerCase()}: <span className="font-semibold">{pick.provider.name}</span>
        {pick.open ? <span className="text-text-muted"> ({pick.open} en curso)</span> : null}
      </span>
      <span className="text-xs font-semibold text-violet-deep">Asignar</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Fotos de la incidencia                                               */
/* ------------------------------------------------------------------ */

/**
 * Reduce una foto del móvil a 960 px de lado en JPEG. Así caben varias en la
 * ficha sin pesar lo que pesa el original, y las fotos HEIC del iPhone que el
 * navegador sabe abrir salen convertidas.
 */
async function shrinkPhoto(file: File, max = 960, quality = 0.72): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("foto"));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("foto");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fotos reales de una incidencia: verlas en grande, añadir desde el móvil y quitar. */
export function IncidentPhotos({ incident }: { incident: ProIncident }) {
  const { update } = usePro();
  const toast = useToast();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [zoom, setZoom] = React.useState<number | null>(null);
  const urls = incident.photoUrls ?? [];
  // Las incidencias que abrió el inquilino desde su Franky traen fotos que se ven en su app.
  const fromTenant = Math.max(0, (incident.photos ?? 0) - urls.length);
  const room = INCIDENT_PHOTO_LIMIT - urls.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const picked = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, room);
    const done: string[] = [];
    for (const f of picked) {
      try {
        done.push(await shrinkPhoto(f));
      } catch {
        // Una foto que el navegador no sabe abrir se salta; se avisa abajo.
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!done.length) {
      toast.error("No hemos podido abrir la foto", "Prueba con una captura o una foto en JPG.");
      return;
    }
    if (!(await update("incident.photos", (d) => addIncidentPhotos(d, incident.id, done)))) return;
    toast.success(done.length === 1 ? "Foto guardada" : `${done.length} fotos guardadas`, "Se ven en la incidencia y puedes mandarlas al técnico.");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="eyebrow">Fotos</p>
        {room > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => input.current?.click()} loading={busy}>
            <Camera className="h-3.5 w-3.5" /> Añadir
          </Button>
        ) : null}
        <input ref={input} type="file" accept="image/*" multiple capture="environment" className="sr-only" onChange={(e) => add(e.target.files)} />
      </div>
      {urls.length || fromTenant ? (
        <div className="flex flex-wrap gap-2">
          {urls.map((src, i) => (
            <span key={i} className="group relative">
              <button type="button" onClick={() => setZoom(i)} className="block h-20 w-20 overflow-hidden rounded-xl border border-border" aria-label={`Ver foto ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => update("incident.photo.remove", (d) => removeIncidentPhoto(d, incident.id, i))}
                className="absolute -right-1.5 -top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-bg-primary text-text-muted shadow-card hover:text-text-primary"
                aria-label={`Quitar foto ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {Array.from({ length: fromTenant }, (_, i) => (
            <span key={`t${i}`} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-bg-secondary px-1 text-center text-[0.65rem] text-text-muted">
              <Camera className="h-4 w-4" strokeWidth={1.75} /> En su Franky
            </span>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex min-h-[80px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-sm text-text-muted transition-colors hover:border-violet/40 hover:text-text-primary"
        >
          <Camera className="h-5 w-5" strokeWidth={1.6} />
          Haz o sube una foto del problema
        </button>
      )}
      {zoom !== null && urls[zoom] ? (
        <Drawer open onOpenChange={(v) => !v && setZoom(null)} title={incident.title} description={`Foto ${zoom + 1} de ${urls.length}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[zoom]} alt={`Foto ${zoom + 1} de la incidencia`} className="w-full rounded-2xl border border-border" />
        </Drawer>
      ) : null}
    </div>
  );
}
