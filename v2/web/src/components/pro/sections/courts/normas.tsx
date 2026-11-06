"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  CloudRain,
  Megaphone,
  Plus,
  ScrollText,
  Share2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type {
  ProConductWarning,
  ProCourtPolicy,
  ProSpecialHours,
} from "@/lib/pro/courts-types";
import { addDays, localDate, money, plural, relative } from "@/lib/pro/format";
import { MATCH_MINUTES, priceFor } from "@/lib/pro/courts";
import { clockLabel, patchCourts } from "@/lib/pro/courts-base";
import {
  COURTS_AMENITIES,
  WARNING_LABEL,
  addWarning,
  checkSpecialHours,
  penaltyFor,
  policyShareText,
  removeSpecialHours,
  removeWarning,
  saveSpecialHours,
  setPolicy,
  warningsByPerson,
} from "@/lib/pro/courts-admin";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Drawer,
  Empty,
  FixedPortal,
  FormField,
  PageHeader,
  Panel,
  Pill,
  RowList,
  inputClass,
  textareaClass,
} from "../../kit";
import { shareHref } from "./americana";
import { CourtsNotReady, shortDate, useCourtsState } from "./state";

/**
 * Normas del club o de la sala: cuánto preaviso hace falta para cancelar,
 * cuánto se cobra al que no viene, cuándo se libera un partido o un puesto,
 * qué pasa si llueve, horarios especiales y convivencia. Se aplican solas en
 * las reservas y se comparten en un mensaje.
 */

export default function NormasSection() {
  const { vertical } = usePro();
  const { ready } = useCourtsState();
  const coworking = vertical.id === "coworking";
  if (!ready)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader eyebrow="Normas" title={coworking ? "Normas de la sala" : "Normas del club"} />
        <CourtsNotReady
          icon={ScrollText}
          title="Tus normas, en un solo sitio"
          body="Aquí pondrás el preaviso para cancelar, lo que paga quien no viene y los horarios especiales. Se aplican solas en cada reserva."
        />
      </div>
    );
  return <Normas />;
}

function Normas() {
  const { data, update, vertical, now, pending } = usePro();
  const { ops } = useCourtsState();
  const toast = useToast();
  const coworking = vertical.id === "coworking";
  const today = localDate(now);
  const [draft, setDraft] = React.useState<ProCourtPolicy>(ops.policy);
  const [covered, setCovered] = React.useState<string[]>(ops.coveredIds);
  const [hoursDrawer, setHoursDrawer] = React.useState<ProSpecialHours | "new" | null>(null);
  const [warningDrawer, setWarningDrawer] = React.useState(false);

  // Si otra persona guarda, el borrador vuelve a lo guardado.
  const savedKey = JSON.stringify([ops.policy, ops.coveredIds]);
  React.useEffect(() => {
    setDraft(ops.policy);
    setCovered(ops.coveredIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const dirty = JSON.stringify([draft, covered]) !== savedKey;
  const courts = data.resources.filter((r) => r.kind === "court");
  const sample = courts[0] ?? data.resources[0];
  const samplePrice = sample ? (priceFor(sample, addDays(today, 1), 19 * 60, coworking ? 60 : MATCH_MINUTES) ?? 0) : 0;
  const set = <K extends keyof ProCourtPolicy>(key: K, value: ProCourtPolicy[K]) =>
    setDraft((p) => ({ ...p, [key]: value }));

  const save = async () => {
    const ok = await update("court.policy.save", (d) =>
      patchCourts(setPolicy(d, draft), { coveredIds: covered }),
    );
    if (ok) toast.success("Normas guardadas", "Se aplican desde ahora en las nuevas cancelaciones.");
  };

  const share = policyShareText(draft, data.space.name, coworking, coworking ? ops.rules : []);
  const summary =
    draft.penaltyPct === 0
      ? `Se cancela sin coste con ${draft.noticeHours} h de preaviso y sin penalización.`
      : `Cancelar es gratis hasta ${draft.noticeHours} h antes. Después, o si no viene, se cobra el ${draft.penaltyPct} %.`;
  const penalties = ops.penalties.filter((p) => localDate(p.at) >= addDays(today, -30));
  const charged = penalties.filter((p) => p.status === "charged").reduce((a, p) => a + p.amountCents, 0);

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageHeader
        eyebrow="Normas"
        title={coworking ? "Normas de la sala" : "Normas del club"}
        description={summary}
        actions={
          <>
            <a
              href={shareHref(share)}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "min-h-10")}
            >
              <Share2 className="h-4 w-4" /> Compartir
            </a>
            <Button variant="dark" onClick={save} disabled={!dirty || pending} className="hidden md:inline-flex">
              <Check className="h-4 w-4" /> Guardar cambios
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex flex-col gap-5">
          <Panel
            title="Cancelaciones y ausencias"
            description={
              samplePrice && draft.penaltyPct
                ? `Con una reserva de ${money(samplePrice)}, quien cancela tarde paga ${money(penaltyFor(draft, samplePrice))}.`
                : "Lo que se aplica cuando alguien cancela tarde o no aparece."
            }
          >
            <div className="flex flex-col gap-5">
              <FormField label="Cancelar gratis hasta">
                <ChoiceChips
                  value={String(draft.noticeHours)}
                  onChange={(v) => set("noticeHours", Number(v))}
                  options={[0, 6, 12, 24, 48].map((h) => ({
                    value: String(h),
                    label: h === 0 ? "La hora" : `${h} h antes`,
                  }))}
                />
              </FormField>
              <FormField label="Si cancela tarde o no viene, paga">
                <ChoiceChips
                  value={String(draft.penaltyPct)}
                  onChange={(v) => set("penaltyPct", Number(v))}
                  options={[0, 25, 50, 100].map((p) => ({
                    value: String(p),
                    label: p === 0 ? "Nada" : `El ${p} %`,
                  }))}
                />
              </FormField>
              <FormField
                label="Marcar en rojo a partir de"
                hint="La ficha avisa y, al reservar, lo ves antes de confirmar."
              >
                <ChoiceChips
                  value={String(draft.noShowWarnAt)}
                  onChange={(v) => set("noShowWarnAt", Number(v))}
                  options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ausencias` }))}
                />
              </FormField>
            </div>
          </Panel>

          {coworking ? (
            <Panel title="Puestos reservados" description="Si alguien no llega, su puesto vuelve a estar libre.">
              <FormField label="Liberar el puesto tras">
                <ChoiceChips
                  value={String(draft.releaseAfterMinutes)}
                  onChange={(v) => set("releaseAfterMinutes", Number(v))}
                  options={[15, 30, 45, 60].map((m) => ({ value: String(m), label: `${m} min` }))}
                />
              </FormField>
            </Panel>
          ) : (
            <>
              <Panel
                title="Partidos abiertos"
                description="Un partido que no se completa no te bloquea la pista: se libera a tiempo."
              >
                <FormField label="Liberar la pista si no está completo">
                  <ChoiceChips
                    value={String(draft.matchReleaseHours)}
                    onChange={(v) => set("matchReleaseHours", Number(v))}
                    options={[2, 3, 6, 12].map((h) => ({ value: String(h), label: `${h} h antes` }))}
                  />
                </FormField>
              </Panel>
              <Panel title="Si llueve" description="El botón Llueve mueve las reservas exteriores a estas pistas.">
                <div className="flex flex-col gap-4">
                  <FormField label="Pistas cubiertas">
                    <div className="flex flex-wrap gap-2">
                      {courts.map((r) => {
                        const on = covered.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setCovered((list) => (on ? list.filter((id) => id !== r.id) : [...list, r.id]))
                            }
                            className={cn(
                              "inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors",
                              on
                                ? "border-violet bg-violet-50 text-violet-deep"
                                : "border-border text-text-secondary hover:border-text-primary/25",
                            )}
                          >
                            {on ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : null}
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                  <label className="flex min-h-10 items-center justify-between gap-4 text-sm">
                    <span className="flex items-center gap-2">
                      <CloudRain className="h-4 w-4 text-text-muted" strokeWidth={1.9} />
                      Cancelar por lluvia no cuesta nada
                    </span>
                    <Switch
                      checked={draft.rainFree}
                      onCheckedChange={(v) => set("rainFree", v)}
                      aria-label="Cancelar por lluvia no cuesta nada"
                    />
                  </label>
                </div>
              </Panel>
            </>
          )}

          <Panel title="Puntualidad y uso" description="Va al final del mensaje de confirmación.">
            <textarea
              value={draft.punctualityNote}
              onChange={(e) => set("punctualityNote", e.target.value)}
              maxLength={400}
              aria-label="Puntualidad y uso"
              placeholder={
                coworking
                  ? "Silencio en la zona de silencio. Las llamadas, fuera."
                  : "Llega 10 minutos antes. La pista se entrega a la hora en punto."
              }
              className={textareaClass}
            />
          </Panel>

          <SpecialHoursPanel onEdit={setHoursDrawer} />
          {coworking ? <AmenitiesPanel /> : null}
          {coworking ? <RulesPanel /> : null}
        </div>

        <div className="flex flex-col gap-5">
          <Panel title="Así lo recibe tu cliente" description="Tal cual sale en WhatsApp.">
            <p className="whitespace-pre-line rounded-2xl bg-bg-secondary p-4 text-sm leading-relaxed text-text-secondary">
              {share}
            </p>
          </Panel>

          {coworking ? (
            <WarningsPanel onAdd={() => setWarningDrawer(true)} warnAt={ops.policy.noShowWarnAt} />
          ) : (
            <Panel
              title="Penalizaciones del último mes"
              description={
                penalties.length
                  ? `${money(charged)} cobrados, ${penalties.filter((p) => p.status === "forgiven").length} perdonadas.`
                  : undefined
              }
              flush
            >
              {penalties.length ? (
                <RowList>
                  {penalties
                    .slice()
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                        <Avatar name={p.clientName} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.clientName}</span>
                          <span className="block text-xs text-text-muted">
                            {p.kind === "no_show" ? "No vino" : "Canceló tarde"}, {relative(p.at, now.getTime())}
                          </span>
                        </span>
                        <Pill tone={p.status === "charged" ? "neutral" : "success"}>
                          {p.status === "charged" ? money(p.amountCents) : "Perdonada"}
                        </Pill>
                      </div>
                    ))}
                </RowList>
              ) : (
                <Empty
                  icon={ShieldAlert}
                  title="Nadie ha faltado este mes"
                  body="Cuando alguien cancele tarde, al anularla eliges si cobrar o perdonar."
                />
              )}
            </Panel>
          )}
        </div>
      </div>

      {dirty ? (
        <FixedPortal>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-primary px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
            <Button variant="dark" className="h-11 w-full" onClick={save} disabled={pending}>
              <Check className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </FixedPortal>
      ) : null}

      <SpecialHoursDrawer value={hoursDrawer} onClose={() => setHoursDrawer(null)} />
      <WarningDrawer open={warningDrawer} onClose={() => setWarningDrawer(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horarios especiales                                                 */
/* ------------------------------------------------------------------ */

function SpecialHoursPanel({ onEdit }: { onEdit: (v: ProSpecialHours | "new") => void }) {
  const { data, update, now, vertical } = usePro();
  const { ops } = useCourtsState();
  const toast = useToast();
  const today = localDate(now);
  const list = ops.specialHours.filter((s) => s.to >= today);
  const coworking = vertical.id === "coworking";

  const announce = (s: ProSpecialHours) => {
    void update("court.hours.announce", (d) =>
      saveSpecialHours(d, { ...s, announced: true }),
    );
    toast.success("Horario anunciado", "Compártelo también en tus redes con el mensaje preparado.");
  };

  return (
    <Panel
      title="Horarios especiales"
      description={
        coworking
          ? "Exámenes, festivos o verano. El calendario y el aforo lo respetan."
          : "Verano, festivos o un torneo. El calendario lo respeta."
      }
      action={
        <Button size="sm" variant="outline" className="min-h-10" onClick={() => onEdit("new")}>
          <Plus className="h-3.5 w-3.5" /> Añadir
        </Button>
      }
      flush
    >
      {list.length ? (
        <RowList>
          {list.map((s) => {
            const text = `${s.label} en ${data.space.name}: del ${shortDate(s.from)} al ${shortDate(s.to)}, de ${clockLabel(s.open)} a ${clockLabel(s.close)}.`;
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <CalendarClock className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.9} />
                <button type="button" onClick={() => onEdit(s)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">{s.label}</span>
                  <span className="block text-xs text-text-muted">
                    Del {shortDate(s.from)} al {shortDate(s.to)}, de {clockLabel(s.open)} a {clockLabel(s.close)}
                  </span>
                </button>
                {s.announced ? (
                  <Pill tone="success">Anunciado</Pill>
                ) : (
                  <a
                    href={shareHref(text)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => announce(s)}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-10")}
                  >
                    <Megaphone className="h-3.5 w-3.5" /> Anunciar
                  </a>
                )}
              </div>
            );
          })}
        </RowList>
      ) : (
        <Empty
          icon={CalendarClock}
          title="Sin horarios especiales"
          body={
            coworking
              ? "¿Abres hasta las 2:00 en enero? Ponlo aquí y los estudiantes con exámenes lo sabrán a tiempo."
              : "Horario de verano, Navidad o un festivo local: ponlo aquí y nadie reserva cuando está cerrado."
          }
        />
      )}
    </Panel>
  );
}

function SpecialHoursDrawer({
  value,
  onClose,
}: {
  value: ProSpecialHours | "new" | null;
  onClose: () => void;
}) {
  const { data, update, now } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const editing = value && value !== "new" ? value : null;
  const [label, setLabel] = React.useState("");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [open, setOpen] = React.useState(8 * 60);
  const [close, setClose] = React.useState(24 * 60);

  React.useEffect(() => {
    if (!value) return;
    if (value === "new") {
      setLabel("");
      setFrom(addDays(today, 7));
      setTo(addDays(today, 14));
      setOpen(8 * 60);
      setClose(24 * 60);
    } else {
      setLabel(value.label);
      setFrom(value.from);
      setTo(value.to);
      setOpen(value.open);
      setClose(value.close);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const draft: ProSpecialHours = {
    id: editing?.id ?? "nuevo",
    label: label.trim(),
    from,
    to,
    open,
    close,
    announced: editing?.announced ?? false,
  };
  const check = checkSpecialHours(data, draft);
  const valid = draft.label.length >= 3 && check.ok;
  const opens = Array.from({ length: 13 }, (_, i) => 6 * 60 + i * 60);
  const closes = Array.from({ length: 15 }, (_, i) => 14 * 60 + i * 60);

  const save = async () => {
    if (!valid) return;
    const saved = { ...draft, id: editing?.id ?? localId("hs") };
    const ok = await update("court.hours.save", (d) => saveSpecialHours(d, saved));
    if (ok) {
      toast.success("Horario guardado", `${saved.label}: el calendario ya lo respeta.`);
      onClose();
    }
  };

  const remove = async () => {
    if (!editing) return;
    const ok = await update("court.hours.remove", (d) => removeSpecialHours(d, editing.id));
    if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(value)}
      onOpenChange={(v) => !v && onClose()}
      title={editing ? editing.label : "Nuevo horario especial"}
      description="Del primer al último día, ambos incluidos."
      footer={
        <>
          {editing ? (
            <Button variant="ghost" onClick={remove} className="mr-auto text-rose-600">
              <Trash2 className="h-4 w-4" /> Quitar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Nombre" htmlFor="hs-label">
          <input
            id="hs-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Exámenes de enero"
            className={inputClass}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Desde" htmlFor="hs-from">
            <input id="hs-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Hasta" htmlFor="hs-to">
            <input id="hs-to" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Abre" htmlFor="hs-open">
            <select id="hs-open" value={open} onChange={(e) => setOpen(Number(e.target.value))} className={inputClass}>
              {opens.map((m) => (
                <option key={m} value={m}>
                  {clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Cierra" htmlFor="hs-close">
            <select id="hs-close" value={close} onChange={(e) => setClose(Number(e.target.value))} className={inputClass}>
              {closes.map((m) => (
                <option key={m} value={m}>
                  {m >= 24 * 60 ? `${clockLabel(m)} (noche)` : clockLabel(m)}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {!check.ok ? (
          <p className="text-sm text-rose-600">
            {check.reason === "dates"
              ? "La fecha final va después de la inicial."
              : check.reason === "hours"
                ? "La hora de cierre va después de la de apertura."
                : `Coincide con «${check.with}». Cambia las fechas o edita ese.`}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Sala de estudio: servicios, normas y convivencia                     */
/* ------------------------------------------------------------------ */

function AmenitiesPanel() {
  const { update } = usePro();
  const { ops } = useCourtsState();
  const toggle = (id: string, on: boolean) =>
    void update("court.amenities", (d) =>
      patchCourts(d, (o) => ({
        amenities: on ? [...o.amenities.filter((a) => a !== id), id] : o.amenities.filter((a) => a !== id),
      })),
    );
  return (
    <Panel title="Servicios de tu sala" description="Es lo que el estudiante mira antes de elegir dónde estudiar.">
      <div className="grid gap-x-6 sm:grid-cols-2">
        {COURTS_AMENITIES.map((a) => {
          const on = ops.amenities.includes(a.id);
          return (
            <label key={a.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-border-light text-sm last:border-0 sm:[&:nth-last-child(2)]:border-0">
              {a.label}
              <Switch checked={on} onCheckedChange={(v) => toggle(a.id, v)} aria-label={a.label} />
            </label>
          );
        })}
      </div>
    </Panel>
  );
}

function RulesPanel() {
  const { update } = usePro();
  const { ops } = useCourtsState();
  const [text, setText] = React.useState("");
  const add = async () => {
    const rule = text.trim();
    if (rule.length < 5) return;
    const ok = await update("court.rules", (d) => patchCourts(d, (o) => ({ rules: [...o.rules, rule] })));
    if (ok) setText("");
  };
  return (
    <Panel title="Normas de convivencia" description="Se envían al socio cuando se da de alta.">
      <ol className="flex flex-col gap-2">
        {ops.rules.map((rule, i) => (
          <li key={`${i}-${rule}`} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span className="mt-0.5 w-4 shrink-0 font-heading font-bold text-text-muted tabular">{i + 1}</span>
            <span className="min-w-0 flex-1">{rule}</span>
            <button
              type="button"
              aria-label="Quitar norma"
              onClick={() =>
                void update("court.rules", (d) =>
                  patchCourts(d, (o) => ({ rules: o.rules.filter((_, k) => k !== i) })),
                )
              }
              className="-my-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:text-rose-600"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.9} />
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Una norma más"
          aria-label="Nueva norma"
          maxLength={160}
          className={inputClass}
        />
        <Button variant="outline" className="min-h-10 shrink-0" onClick={add} disabled={text.trim().length < 5}>
          <Plus className="h-4 w-4" /> Añadir
        </Button>
      </div>
    </Panel>
  );
}

function WarningsPanel({ onAdd, warnAt }: { onAdd: () => void; warnAt: number }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const people = warningsByPerson(data, today);
  const limit = Math.max(3, warnAt);
  return (
    <Panel
      title="Avisos de convivencia"
      description={`Últimos 90 días. Al ${limit === 3 ? "tercero" : `${limit}.º`}, la ficha se marca.`}
      action={
        <Button size="sm" variant="outline" className="min-h-10" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Aviso
        </Button>
      }
      flush
    >
      {people.length ? (
        <RowList>
          {people.map((p) => (
            <div key={p.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={p.name} size="sm" tone={p.count >= limit ? "rose" : "slate"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {WARNING_LABEL[p.last.kind]}
                  {p.last.note ? `: ${p.last.note}` : ""}, {relative(p.last.at, now.getTime())}
                </span>
              </span>
              <Pill tone={p.count >= limit ? "danger" : "neutral"}>{plural(p.count, "aviso", "avisos")}</Pill>
              <button
                type="button"
                aria-label={`Quitar el último aviso de ${p.name}`}
                onClick={() => void update("court.warning.remove", (d) => removeWarning(d, p.last.id))}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-muted hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.9} />
              </button>
            </div>
          ))}
        </RowList>
      ) : (
        <Empty
          icon={ShieldAlert}
          title="Todo tranquilo"
          body="Si alguien habla en la zona de silencio o guarda el puesto, apúntalo aquí. Así sabes si es la primera vez."
        />
      )}
    </Panel>
  );
}

function WarningDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update } = usePro();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [memberId, setMemberId] = React.useState<string | undefined>();
  const [kind, setKind] = React.useState<ProConductWarning["kind"]>("noise");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setMemberId(undefined);
    setKind("noise");
    setNote("");
  }, [open]);

  const q = name.trim().toLowerCase();
  const matches =
    q.length >= 2 && !memberId
      ? data.members.filter((m) => m.status !== "cancelled" && m.name.toLowerCase().includes(q)).slice(0, 4)
      : [];

  const save = async () => {
    if (name.trim().length < 2) return;
    const warning: ProConductWarning = {
      id: localId("av"),
      name: name.trim(),
      memberId,
      kind,
      note: note.trim() || undefined,
      at: new Date().toISOString(),
    };
    const ok = await update("court.warning.add", (d) => addWarning(d, warning));
    if (ok) {
      toast.success("Aviso apuntado", `${warning.name}: ${WARNING_LABEL[kind].toLowerCase()}.`);
      onClose();
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Apuntar un aviso"
      description="Solo lo ve tu equipo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={name.trim().length < 2}>
            Apuntar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Quién" htmlFor="av-name">
          <input
            id="av-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMemberId(undefined);
            }}
            autoComplete="off"
            placeholder="Nombre del socio o cliente"
            className={inputClass}
          />
          {matches.length ? (
            <div className="flex flex-wrap gap-1.5">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setName(m.name);
                    setMemberId(m.id);
                  }}
                  className="inline-flex min-h-10 items-center rounded-full border border-border px-3 text-xs font-semibold text-text-secondary hover:border-violet/40 hover:text-violet"
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
        </FormField>
        <FormField label="Qué ha pasado">
          <ChoiceChips
            value={kind}
            onChange={setKind}
            options={(Object.keys(WARNING_LABEL) as ProConductWarning["kind"][]).map((k) => ({
              value: k,
              label: WARNING_LABEL[k],
            }))}
          />
        </FormField>
        <FormField label="Nota" htmlFor="av-note">
          <input
            id="av-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            placeholder="Opcional"
            className={inputClass}
          />
        </FormField>
      </div>
    </Drawer>
  );
}
