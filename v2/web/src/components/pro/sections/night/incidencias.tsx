"use client";

import * as React from "react";
import { Ban, Download, MessageCircle, NotebookPen, Plus, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProBan, ProIncidentKind } from "@/lib/pro/night-types";
import { addDays, atLocal, localMinutes, minutesToLabel, shortDay } from "@/lib/pro/format";
import { focusEvent, nightOf } from "@/lib/pro/night";
import { INCIDENT_KINDS, activeBans, banActive, eventOfNight, incidentReport, incidentsOfNight } from "@/lib/pro/night-ops";
import { accessConditionsOf, addBan, bansByCondition, setAccessConditions } from "@/lib/pro/night-guests";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  PageHeader,
  Panel,
  Pill,
  RowList,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { IncidentDrawer, SignerChips, defaultSigner, downloadCsv, useNightOps, whatsAppShare } from "./ops-ui";

type Tab = "libro" | "vetados";
type KindFilter = "all" | ProIncidentKind;

function nightTitle(night: string): string {
  const label = shortDay(atLocal(night, 12 * 60));
  return label[0].toUpperCase() + label.slice(1);
}

export default function NightIncidencias() {
  const { data, now } = usePro();
  const { ops } = useNightOps();
  const [tab, setTab] = React.useState<Tab>("libro");
  const [adding, setAdding] = React.useState(false);
  const [banning, setBanning] = React.useState(false);

  const today = nightOf(now);
  const monthAgo = addDays(today, -30);
  const month = ops.incidents.filter((i) => i.night >= monthAgo);
  const serious = month.filter((i) => i.kind === "pelea" || i.kind === "expulsion" || i.kind === "sanitaria").length;
  const bans = activeBans(ops, now);
  const last = [...ops.incidents].sort((a, b) => b.at.localeCompare(a.at))[0];
  const ev = focusEvent(data, now);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Libro de incidencias"
        title="Incidencias"
        description={
          last
            ? `${month.length} en los últimos 30 días. La última, ${INCIDENT_KINDS[last.kind].label.toLowerCase()} el ${nightTitle(last.night).toLowerCase()}. Todo con hora y quién lo apuntó.`
            : "Apunta en el momento lo que pase cada noche. Con hora y autor, sirve para aprender y para enseñarlo si hay una inspección."
        }
        actions={
          tab === "libro" ? (
            <Button variant="dark" onClick={() => setAdding(true)}>
              <NotebookPen className="h-4 w-4" /> Apuntar incidencia
            </Button>
          ) : (
            <Button variant="dark" onClick={() => setBanning(true)}>
              <Ban className="h-4 w-4" /> Añadir vetado
            </Button>
          )
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label="Qué ver"
          options={[
            { value: "libro", label: "Libro", count: ops.incidents.length },
            { value: "vetados", label: "Vetados", count: bans.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={NotebookPen} label="Últimos 30 días" value={month.length} hint={`${serious} de seguridad o salud`} />
        <Kpi label="Esta noche" value={incidentsOfNight(ops, today).length} hint={ev ? ev.name : "Sin evento"} />
        <Kpi icon={Ban} label="Vetados" value={bans.length} hint="Salen en rojo en puerta" onClick={() => setTab("vetados")} />
        <Kpi
          label="Quejas de vecinos"
          value={month.filter((i) => i.kind === "vecinos").length}
          hint="En 30 días"
          emphasis={month.some((i) => i.kind === "vecinos")}
        />
      </KpiRow>

      {tab === "libro" ? <BookView onAdd={() => setAdding(true)} /> : <BansView onAdd={() => setBanning(true)} />}

      <IncidentDrawer open={adding} onClose={() => setAdding(false)} event={ev && ev.date === today ? ev : null} />
      <BanDrawer open={banning} onClose={() => setBanning(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Libro                                                               */
/* ------------------------------------------------------------------ */

function BookView({ onAdd }: { onAdd: () => void }) {
  const { data } = usePro();
  const { ops } = useNightOps();
  const [kind, setKind] = React.useState<KindFilter>("all");
  const list = ops.incidents.filter((i) => kind === "all" || i.kind === kind);
  const nights = [...new Set(list.map((i) => i.night))].sort((a, b) => b.localeCompare(a));
  const kinds = (Object.keys(INCIDENT_KINDS) as ProIncidentKind[]).filter((k) => ops.incidents.some((i) => i.kind === k));

  const exportCsv = () => {
    const rows = [
      ["Noche", "Hora", "Tipo", "Detalle", "Apuntó"],
      ...[...ops.incidents]
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((i) => [i.night, minutesToLabel(localMinutes(i.at)), INCIDENT_KINDS[i.kind].label, i.description, i.by]),
    ];
    downloadCsv(`incidencias-${data.space.slug}.csv`, rows);
  };

  if (!ops.incidents.length) {
    return (
      <Panel>
        <Empty
          icon={ShieldCheck}
          title="Ninguna incidencia apuntada"
          body="Cuando pase algo (una pelea, un aviso de los vecinos, un objeto perdido) apúntalo en el momento desde aquí, desde Puerta o desde Esta noche."
          action={
            <Button variant="dark" onClick={onAdd}>
              <Plus className="h-4 w-4" /> Apuntar incidencia
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<KindFilter>
            size="sm"
            value={kind}
            onChange={setKind}
            label="Tipo"
            options={[{ value: "all", label: "Todas" }, ...kinds.map((k) => ({ value: k, label: INCIDENT_KINDS[k].label }))]}
          />
          <Button variant="ghost" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
        {nights.map((night) => {
          const items = incidentsOfNight(ops, night).filter((i) => kind === "all" || i.kind === kind);
          const ev = eventOfNight(data, night);
          const report = incidentReport(data.space, night, incidentsOfNight(ops, night));
          return (
            <Panel
              key={night}
              title={nightTitle(night)}
              description={ev ? ev.name : undefined}
              action={
                <Button asChild variant="ghost" size="sm">
                  <a href={whatsAppShare(report)} target="_blank" rel="noopener noreferrer" aria-label={`Enviar el informe del ${nightTitle(night)}`}>
                    <MessageCircle className="h-3.5 w-3.5" /> Informe
                  </a>
                </Button>
              }
              flush
            >
              <RowList>
                {items.map((i) => (
                  <div key={i.id} className="flex gap-3 px-4 py-3 sm:px-5">
                    <span className="w-12 shrink-0 pt-0.5 text-xs font-semibold text-text-muted tabular">{minutesToLabel(localMinutes(i.at))}</span>
                    <span className="min-w-0 flex-1">
                      <Pill tone={INCIDENT_KINDS[i.kind].tone}>{INCIDENT_KINDS[i.kind].label}</Pill>
                      <span className="mt-1 block text-sm text-text-secondary">{i.description}</span>
                      <span className="mt-0.5 block text-xs text-text-muted">Apuntó {i.by}</span>
                    </span>
                  </div>
                ))}
              </RowList>
            </Panel>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Tip title="Apunta en el momento">
          Hora, qué pasó y qué hicisteis, sin opiniones. Si llega una inspección o una queja, el libro de cada noche se envía en un toque.
        </Tip>
        <Tip title="Quejas de vecinos">
          Si se repiten a la misma hora, revisa esa franja: puerta abierta, terraza o volumen. Es lo que suele acabar en una inspección.
        </Tip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vetados                                                             */
/* ------------------------------------------------------------------ */

function BansView({ onAdd }: { onAdd: () => void }) {
  const { now } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const active = activeBans(ops, now).sort((a, b) => b.since.localeCompare(a.since));
  const expired = ops.bans.filter((b) => !banActive(b, now));

  const lift = (ban: ProBan) => {
    void setOps("ban.lift", (o) => ({
      ...o,
      bans: o.bans.map((b) => (b.id === ban.id ? { ...b, until: addDays(nightOf(new Date()), -1) } : b)),
    }));
    toast.success(`${ban.name} puede volver a entrar`);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Con el acceso denegado" description="Al buscarlos o escanearlos en Puerta salen en rojo con el motivo." flush>
        {active.length ? (
          <RowList>
            {active.map((b) => (
              <div key={b.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" strokeWidth={1.9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{b.name}</span>
                  {b.condition ? <span className="block text-xs font-semibold text-rose-700 dark:text-rose-300">{b.condition}</span> : null}
                  <span className="block text-sm text-text-secondary">{b.reason}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    Desde {shortDay(atLocal(b.since, 12 * 60))} · {b.until ? `hasta ${shortDay(atLocal(b.until, 12 * 60))}` : "sin fecha de fin"} · lo añadió {b.by.split(" ")[0]}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => lift(b)} className="shrink-0">
                  Quitar
                </Button>
              </div>
            ))}
          </RowList>
        ) : (
          <Empty
            icon={ShieldCheck}
            title="Nadie vetado"
            body="Si alguien no puede volver a entrar, añádelo con el motivo. La puerta lo verá al momento, aunque venga con otro RRPP."
            action={
              <Button variant="dark" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Añadir vetado
              </Button>
            }
          />
        )}
        {expired.length ? (
          <p className="border-t border-border-light px-4 py-2.5 text-xs text-text-muted sm:px-5">
            {expired.length} {expired.length === 1 ? "veto terminado" : "vetos terminados"}: {expired.map((b) => b.name).join(", ")}.
          </p>
        ) : null}
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        <ConditionsPanel />
        <Tip title="Motivos concretos">
          Escribe lo que pasó, no una opinión: &ldquo;agredió a un portero&rdquo;, &ldquo;intentó entrar con otro DNI&rdquo;. Así el portero sabe por qué y nadie discute en la puerta.
        </Tip>
        <Tip title="Lista privada">
          Solo la ve tu equipo dentro de Franky Pro. No se comparte con otros locales.
        </Tip>
      </div>
    </div>
  );
}

type Duration = "1m" | "6m" | "1y" | "none";

function BanDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [condition, setCondition] = React.useState("");
  const [log, setLog] = React.useState(true);
  const [duration, setDuration] = React.useState<Duration>("6m");
  const [by, setBy] = React.useState("");
  const conditions = accessConditionsOf(ops);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setReason("");
    setCondition("");
    setLog(true);
    setDuration("6m");
    setBy(defaultSigner(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const today = nightOf(now);
  const until = duration === "none" ? null : addDays(today, duration === "1m" ? 30 : duration === "6m" ? 182 : 365);
  const exists = ops.bans.some((b) => banActive(b, now) && b.name.trim().toLowerCase() === name.trim().toLowerCase());
  const valid = name.trim().split(/\s+/).length >= 2 && reason.trim().length > 5 && !exists && Boolean(by.trim());

  const save = () => {
    const ban: ProBan = {
      id: localId("ban"),
      name: name.trim(),
      condition: condition || undefined,
      reason: reason.trim(),
      since: today,
      until,
      by: by.trim(),
    };
    const at = new Date().toISOString();
    const ev = eventOfNight(data, nightOf(new Date(at)));
    void setOps("ban.create", (o) => addBan(o, ban, log ? { incidentId: localId("in"), at, eventId: ev?.id } : null));
    toast.success(
      `${ban.name} vetado`,
      log ? "Queda en el libro de esta noche y la puerta lo verá en rojo." : "Si aparece en una lista o con una entrada, la puerta lo verá en rojo.",
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Añadir vetado"
      description="Nombre y apellido tal y como aparecería en una lista o una entrada."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!valid}>
            <Ban className="h-4 w-4" /> Vetar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre y apellido" htmlFor="ban-name" hint={exists ? "Ya está vetado" : undefined}>
          <input
            id="ban-name"
            value={name}
            aria-invalid={exists || undefined}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellido"
            className={inputClass}
          />
        </FormField>
        <FormField label="Condición de acceso que no cumple" hint="Las de tu local. Así el veto se apoya en algo que está a la vista en la puerta.">
          <ChoiceChips
            value={condition}
            onChange={(v) => setCondition(v === condition ? "" : v)}
            options={conditions.map((c) => ({ value: c, label: c }))}
          />
        </FormField>
        <FormField label="Qué pasó" htmlFor="ban-reason" hint="Lo que hizo, en una frase. Lo verá el portero.">
          <textarea
            id="ban-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Pelea en la barra el jueves 17."
            className={textareaClass}
          />
        </FormField>
        <FormField label="Durante">
          <ChoiceChips
            value={duration}
            onChange={setDuration}
            options={[
              { value: "1m", label: "1 mes" },
              { value: "6m", label: "6 meses" },
              { value: "1y", label: "1 año" },
              { value: "none", label: "Sin fin" },
            ]}
          />
        </FormField>
        <FormField label="Lo decide">
          <SignerChips value={by} onChange={setBy} />
        </FormField>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="font-semibold">Apuntarlo en el libro de esta noche</span>
            <span className="block text-xs text-text-muted">Con la hora, la condición y quién lo decide.</span>
          </span>
          <Switch checked={log} onCheckedChange={setLog} aria-label="Apuntarlo en el libro de esta noche" />
        </label>
        <p className={cn("text-sm text-text-muted")}>
          {until ? `Podrá volver a entrar a partir del ${shortDay(atLocal(addDays(until, 1), 12 * 60))}.` : "No tiene fecha de fin: tendrás que quitarlo tú."}
        </p>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Condiciones de acceso del local                                     */
/* ------------------------------------------------------------------ */

/** Las condiciones que el local tiene a la vista en la puerta. Se eligen al vetar. */
function ConditionsPanel() {
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const [draft, setDraft] = React.useState("");
  const list = accessConditionsOf(ops);
  const used = bansByCondition(ops);

  const save = async (next: string[], message: string) => {
    if (await setOps("access.conditions", (o) => setAccessConditions(o, next))) toast.success(message);
  };

  const add = () => {
    const value = draft.trim();
    if (value.length < 4) return;
    void save([...list, value], "Condición añadida");
    setDraft("");
  };

  return (
    <Panel title="Condiciones de acceso" description="Las que tienes a la vista en la puerta. El portero elige una al vetar.">
      <ul className="flex flex-col gap-1.5">
        {list.map((c) => {
          const count = used.find((u) => u.condition === c)?.count ?? 0;
          return (
            <li key={c} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">{c}</span>
              {count ? <Pill>{count}</Pill> : null}
              <button
                type="button"
                aria-label={`Quitar la condición ${c}`}
                disabled={list.length <= 1}
                onClick={() => void save(list.filter((x) => x !== c), "Condición quitada")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.9} />
              </button>
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          aria-label="Nueva condición de acceso"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Otra condición de tu local"
          className={inputClass}
        />
        <Button type="submit" variant="outline" disabled={draft.trim().length < 4}>
          Añadir
        </Button>
      </form>
    </Panel>
  );
}
