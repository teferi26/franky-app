"use client";

import * as React from "react";
import { Bus, Check, Download, MessageCircle, Plus, Trash2, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { dayLabel, localDate, money } from "@/lib/pro/format";
import { PAY_METHOD_LABEL, activityAttendees, communityOps, whatsAppShareUrl } from "@/lib/pro/community";
import type {
  Attendee,
  CommunityActivity,
  CommunityInstallment,
  CommunityMember,
  CommunityPayMethod,
} from "@/lib/pro/community-types";
import {
  enableTrip,
  markTripReminded,
  missingTravellerData,
  payEverything,
  payInstallment,
  setInstallments,
  setTraveller,
  sortedInstallments,
  travellerMoney,
  travellersCsv,
  tripGroupMessage,
  tripReminderMessage,
  tripSummary,
  undoInstallment,
  type TravellerState,
} from "@/lib/pro/community-trips";
import { MERCH_PAY_METHODS } from "@/lib/pro/community-merch";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { cn } from "@/lib/utils";
import { Drawer, Empty, FormField, Meter, Pill, Segmented, inputClass } from "../../kit";
import { downloadCsv, fileSlug } from "./files";
import { WhatsAppButton, centsToInput, paidWith, parseEuros, useCommunitySave } from "./ui";

/**
 * Pestaña de pagos de un viaje: plazos con fecha, quién ha pagado cada uno,
 * recordatorios por WhatsApp y la lista de viajeros para el autobús y el seguro.
 */

type Filter = "todos" | TravellerState;

const STATE_PILL: Record<TravellerState, { label: string; tone: "success" | "neutral" | "danger" }> = {
  pagado: { label: "Pagado", tone: "success" },
  al_dia: { label: "Al día", tone: "neutral" },
  atrasado: { label: "Atrasado", tone: "danger" },
};

function fullDate(date: string) {
  return dayLabel(`${date.slice(0, 10)}T12:00:00Z`, { weekday: false });
}

function patchActivity(d: ProData, id: string, fn: (a: CommunityActivity) => CommunityActivity): ProData {
  return {
    ...d,
    activities: d.activities.map((x) => (x.id === id ? fn(x as CommunityActivity) : x)),
  };
}

export function TripTab({ activity: a }: { activity: CommunityActivity }) {
  const { data, now } = usePro();
  const save = useCommunitySave();
  const today = localDate(now);
  const [filter, setFilter] = React.useState<Filter>("todos");
  const [via, setVia] = React.useState<CommunityPayMethod>("bizum");
  const [editing, setEditing] = React.useState(false);
  const [person, setPerson] = React.useState<string | null>(null);

  if (!a.trip) {
    const start = () =>
      void save("activity.trip.enable", (d) => patchActivity(d, a.id, (x) => enableTrip(x, today)), {
        title: "Pago a plazos activado",
        detail: "Revisa la señal y el resto y ajusta las fechas si hace falta.",
      });
    return (
      <Empty
        icon={Bus}
        title="Divide el viaje en plazos"
        body={
          a.priceCents
            ? `Señal al apuntarse y el resto antes de salir. Con ${money(a.priceCents)} por persona, cada uno sabe qué le toca y cuándo.`
            : "Ponle precio a la actividad y podrás dividirlo en señal y resto."
        }
        action={
          a.priceCents ? (
            <Button variant="dark" onClick={start}>
              <WalletCards className="h-4 w-4" /> Pagar a plazos
            </Button>
          ) : null
        }
      />
    );
  }

  const trip = a.trip;
  const members = data.communityMembers as CommunityMember[];
  const people = activityAttendees(a, members);
  const sum = tripSummary(trip, people.map((p) => p.id), today);
  const missing = missingTravellerData(a, people);
  const rows = people
    .map((p) => ({ p, m: travellerMoney(trip, p.id, today) }))
    .filter((r) => filter === "todos" || r.m.state === filter)
    .sort((x, y) => {
      const order: Record<TravellerState, number> = { atrasado: 0, al_dia: 1, pagado: 2 };
      return order[x.m.state] - order[y.m.state] || x.p.name.localeCompare(y.p.name, "es");
    });
  const howToPay = communityOps(data).settings.howToPay;
  const group = whatsAppShareUrl(tripGroupMessage(a, today, howToPay));

  const phoneOf = (p: Attendee) =>
    trip.travellers?.[p.id]?.phone ?? members.find((m) => m.id === p.id)?.phone;

  const collect = (p: Attendee) => {
    const next = travellerMoney(trip, p.id, today).next;
    if (!next) return;
    void save(
      "activity.trip.pay",
      (d) => patchActivity(d, a.id, (x) => payInstallment(x, p.id, next.id, via, new Date().toISOString())),
      { title: `${p.name.split(" ")[0]} ha pagado: ${next.label.toLowerCase()}`, detail: `${money(next.cents)} ${paidWith(via)}.` },
    );
  };

  const reminded = (id: string) =>
    void save("activity.trip.remind", (d) => patchActivity(d, a.id, (x) => markTripReminded(x, [id], new Date().toISOString())));

  const exportList = () =>
    downloadCsv(travellersCsv(a, people, today), `viajeros-${fileSlug(a.title)}.csv`);

  const selected = people.find((p) => p.id === person) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Cobrado</p>
          <p className="font-heading text-lg font-bold tabular">
            {money(sum.collectedCents, { round: true })}
            <span className="text-sm font-medium text-text-muted"> de {money(sum.expectedCents, { round: true })}</span>
          </p>
        </div>
        <Meter value={sum.collectedCents} max={Math.max(1, sum.expectedCents)} className="mt-2" tone={sum.late ? "warning" : "success"} />
        <p className="mt-2 text-xs text-text-muted">
          {sum.paidInFull} de {sum.travellers} lo tienen todo pagado
          {sum.late ? `. ${sum.late} van atrasados con ${money(sum.overdueCents)}.` : "."}
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {sum.byInstallment.map(({ installment: i, paid, due }) => (
          <li key={i.id} className="rounded-2xl border border-border p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {i.label} <span className="font-normal text-text-muted">· {money(i.cents)}</span>
              </p>
              <Pill tone={due && paid < sum.travellers ? "danger" : "neutral"}>
                {due ? "Vencida" : "Vence"} el {fullDate(i.due)}
              </Pill>
            </div>
            <Meter value={paid} max={Math.max(1, sum.travellers)} className="mt-2" tone={paid === sum.travellers ? "success" : "violet"} />
            <p className="mt-1.5 text-xs text-text-muted tabular">
              {paid} de {sum.travellers} han pagado
            </p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={group} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-3.5 w-3.5" /> Aviso al grupo del viaje
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={exportList}>
          <Download className="h-3.5 w-3.5" /> Lista para el autobús y el seguro
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Cambiar plazos
        </Button>
      </div>
      {missing.length ? (
        <p className="text-xs text-text-muted">
          Faltan {missing.length} DNI para el seguro. Toca a cada viajero para completarlo.
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          size="sm"
          label="Filtrar viajeros"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Todos", count: sum.travellers },
            { value: "atrasado", label: "Atrasados", count: sum.late || undefined },
            { value: "al_dia", label: "Al día" },
            { value: "pagado", label: "Pagado", count: sum.paidInFull || undefined },
          ]}
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-text-muted">Cobras</span>
          <Segmented<CommunityPayMethod>
            size="sm"
            label="Cómo cobras"
            value={via}
            onChange={setVia}
            options={MERCH_PAY_METHODS.map((m) => ({ value: m, label: PAY_METHOD_LABEL[m] }))}
          />
        </div>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-border-light rounded-2xl border border-border">
          {rows.map(({ p, m }) => {
            const href =
              m.state !== "pagado"
                ? customerWhatsApp(
                    phoneOf(p),
                    tripReminderMessage({ name: p.name, activity: a, money: m, spaceName: data.space.name, howToPay }),
                  )
                : undefined;
            const sent = trip.remindedAt?.[p.id] ? localDate(trip.remindedAt[p.id]) === today : false;
            return (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setPerson(p.id)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none"
                >
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Pill tone={STATE_PILL[m.state].tone}>{STATE_PILL[m.state].label}</Pill>
                    <span className="truncate tabular">
                      {m.state === "pagado"
                        ? money(m.totalCents)
                        : m.overdue.length
                          ? `Debe ${money(m.overdueCents)}`
                          : m.next
                            ? `${m.next.label} el ${fullDate(m.next.due)}`
                            : ""}
                    </span>
                  </span>
                </button>
                {href ? (
                  <WhatsAppButton
                    href={href}
                    label={`Recordar el pago a ${p.name}`}
                    onOpen={() => reminded(p.id)}
                    done={sent}
                  />
                ) : null}
                {m.next ? (
                  <Button size="sm" variant={m.state === "atrasado" ? "dark" : "outline"} className="h-10" onClick={() => collect(p)}>
                    Cobrar {money(m.next.cents)}
                  </Button>
                ) : (
                  <span className="inline-flex h-10 items-center gap-1 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Todo
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
          Nadie en este grupo.
        </p>
      )}

      <InstallmentsDrawer activity={a} open={editing} onClose={() => setEditing(false)} />
      <TravellerDrawer activity={a} person={selected} via={via} onClose={() => setPerson(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha del viajero: plazos uno a uno y datos para el seguro           */
/* ------------------------------------------------------------------ */

function TravellerDrawer({
  activity: a,
  person,
  via,
  onClose,
}: {
  activity: CommunityActivity;
  person: Attendee | null;
  via: CommunityPayMethod;
  onClose: () => void;
}) {
  const { data, now } = usePro();
  const save = useCommunitySave();
  const today = localDate(now);
  const member = (data.communityMembers as CommunityMember[]).find((m) => m.id === person?.id);
  const saved = person ? a.trip?.travellers?.[person.id] : undefined;
  const [idDoc, setIdDoc] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [emergency, setEmergency] = React.useState("");

  React.useEffect(() => {
    setIdDoc(saved?.idDoc ?? "");
    setPhone(saved?.phone ?? member?.phone ?? "");
    setEmergency(saved?.emergency ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id]);

  if (!person || !a.trip) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Viajero">
        <span />
      </Drawer>
    );
  }
  const trip = a.trip;
  const m = travellerMoney(trip, person.id, today);
  const paidBy = new Map(trip.payments.filter((p) => p.attendeeId === person.id).map((p) => [p.installmentId, p]));

  const toggle = (i: CommunityInstallment) => {
    const paid = paidBy.has(i.id);
    void save(
      paid ? "activity.trip.undo" : "activity.trip.pay",
      (d) =>
        patchActivity(d, a.id, (x) => {
          return paid
            ? undoInstallment(x, person.id, i.id)
            : payInstallment(x, person.id, i.id, via, new Date().toISOString());
        }),
      paid ? { title: `${i.label}: pago quitado` } : { title: `Cobrado: ${i.label.toLowerCase()}`, detail: `${money(i.cents)} ${paidWith(via)}.` },
    );
  };

  const payAll = () =>
    void save(
      "activity.trip.pay_all",
      (d) => patchActivity(d, a.id, (x) => payEverything(x, person.id, via, new Date().toISOString())),
      { title: `${person.name.split(" ")[0]} lo ha pagado todo`, detail: `${money(m.pendingCents)} ${paidWith(via)}.` },
    );

  const saveData = async () => {
    const ok = await save(
      "activity.trip.traveller",
      (d) => patchActivity(d, a.id, (x) => setTraveller(x, person.id, { idDoc, phone, emergency })),
      { title: "Datos del viaje guardados", detail: person.name },
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={Boolean(person)}
      onOpenChange={(o) => !o && onClose()}
      title={person.name}
      description={`${person.studies} · ${money(m.paidCents)} de ${money(m.totalCents)} pagados`}
      footer={
        <>
          {m.pendingCents ? (
            <Button variant="outline" onClick={payAll}>
              Lo paga todo
            </Button>
          ) : null}
          <Button variant="dark" onClick={saveData}>
            Guardar datos
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ul className="flex flex-col gap-2">
          {sortedInstallments(trip).map((i) => {
            const p = paidBy.get(i.id);
            const late = !p && i.due < today;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  aria-pressed={Boolean(p)}
                  onClick={() => toggle(i)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors",
                    p
                      ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30"
                      : late
                        ? "border-rose-500/30 hover:bg-bg-secondary"
                        : "border-border hover:bg-bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                      p ? "border-emerald-600 bg-emerald-600 text-white" : "border-border",
                    )}
                  >
                    {p ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {i.label} · {money(i.cents)}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {p
                        ? `Pagado el ${fullDate(localDate(p.at))} ${paidWith(p.via)}`
                        : `${late ? "Vencía" : "Vence"} el ${fullDate(i.due)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Para el autobús y el seguro</p>
          <FormField label="DNI, NIE o pasaporte" htmlFor="tr-doc">
            <input
              id="tr-doc"
              value={idDoc}
              onChange={(e) => setIdDoc(e.target.value)}
              autoComplete="off"
              className={cn(inputClass, "uppercase")}
            />
          </FormField>
          <FormField label="Teléfono" htmlFor="tr-phone">
            <input id="tr-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Contacto de emergencia" htmlFor="tr-emergency" hint="Nombre y teléfono.">
            <input
              id="tr-emergency"
              value={emergency}
              onChange={(e) => setEmergency(e.target.value)}
              placeholder="Madre, 600 000 000"
              className={inputClass}
            />
          </FormField>
        </section>
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Plazos                                                              */
/* ------------------------------------------------------------------ */

type Draft = { id: string; label: string; amount: string; due: string };

function InstallmentsDrawer({
  activity: a,
  open,
  onClose,
}: {
  activity: CommunityActivity;
  open: boolean;
  onClose: () => void;
}) {
  const { now } = usePro();
  const save = useCommunitySave();
  const [rows, setRows] = React.useState<Draft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setRows(
      sortedInstallments(a.trip ?? { installments: [], payments: [] }).map((i) => ({
        id: i.id,
        label: i.label,
        amount: centsToInput(i.cents),
        due: i.due,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = rows.map((r) => ({ ...r, cents: parseEuros(r.amount) }));
  const total = parsed.reduce((acc, r) => acc + (r.cents ?? 0), 0);
  const valid = parsed.length > 0 && parsed.every((r) => r.cents && r.due && r.label.trim());
  const set = (id: string, patch: Partial<Draft>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const submit = async () => {
    const installments: CommunityInstallment[] = parsed.map((r) => ({
      id: r.id,
      label: r.label,
      cents: r.cents ?? 0,
      due: r.due,
    }));
    const ok = await save(
      "activity.trip.installments",
      (d) => patchActivity(d, a.id, (x) => setInstallments(x, installments)),
      { title: "Plazos guardados", detail: `${money(total)} por persona en ${installments.length} ${installments.length === 1 ? "pago" : "pagos"}.` },
    );
    if (ok) onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Plazos del viaje"
      description={`El precio por persona es la suma: ${money(total)}.`}
      footer={
        <Button variant="dark" onClick={submit} disabled={!valid}>
          Guardar plazos
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2 rounded-2xl border border-border p-3">
            <input
              aria-label={`Nombre del plazo ${i + 1}`}
              value={r.label}
              onChange={(e) => set(r.id, { label: e.target.value })}
              className={inputClass}
            />
            <input
              aria-label={`Importe del plazo ${i + 1}`}
              inputMode="decimal"
              value={r.amount}
              onChange={(e) => set(r.id, { amount: e.target.value })}
              aria-invalid={r.amount !== "" && parseEuros(r.amount) === null}
              className={inputClass}
            />
            <input
              aria-label={`Fecha del plazo ${i + 1}`}
              type="date"
              value={r.due}
              onChange={(e) => set(r.id, { due: e.target.value })}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setRows((list) => list.filter((x) => x.id !== r.id))}
              disabled={rows.length === 1}
              aria-label={`Quitar el plazo ${i + 1}`}
              className="inline-flex h-10 items-center justify-center rounded-xl text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.9} />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            setRows((list) => [
              ...list,
              { id: localId("i"), label: `Plazo ${list.length + 1}`, amount: "", due: localDate(a.date) > localDate(now) ? localDate(a.date) : localDate(now) },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Añadir plazo
        </Button>
        <p className="text-xs text-text-muted">Si quitas un plazo, se borran también los pagos apuntados en él.</p>
      </div>
    </Drawer>
  );
}
