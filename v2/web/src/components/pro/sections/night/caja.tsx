"use client";

import * as React from "react";
import { CheckCircle2, Download, GlassWater, MessageCircle, Plus, Receipt, Scale, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProEvent } from "@/lib/pro/types";
import type { ProNightClose, ProNightCost, ProNightCostKind } from "@/lib/pro/night-types";
import { addDays, money, shortDay, time } from "@/lib/pro/format";
import { eventPhase, nightOf, sortedEvents } from "@/lib/pro/night";
import {
  COST_KIND_LABEL,
  barCompareLabel,
  closableNights,
  closeForNight,
  closeMath,
  doorTotals,
  eventOfNight,
  nightAccount,
  nightsReport,
  nightsReportMessage,
  nightsReportRows,
  nightTitle,
  sameWeekdayCloses,
} from "@/lib/pro/night-ops";
import { cn } from "@/lib/utils";
import {
  ChoiceChips,
  Detail,
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
import {
  SignerChips,
  defaultSigner,
  diffLabel,
  downloadCsv,
  diffTone,
  euros,
  eurosInput,
  useNightOps,
  whatsAppShare,
} from "./ops-ui";
import { closeInvitesDraft, inviteLine, invitesByPerson, invitesOfNight } from "@/lib/pro/night-invites";
import { InviteDrawer, InvitesView } from "./invites";

type Tab = "noches" | "cuenta" | "informe" | "invitaciones";

/** El nombre de una noche ("Jue 24 sept."), el mismo en la web y en la app. */
const nightLabel = nightTitle;

export default function NightCaja() {
  const { data, now } = usePro();
  const { ops } = useNightOps();
  const [tab, setTab] = React.useState<Tab>("noches");
  const [closing, setClosing] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<string | null>(null);
  const [inviting, setInviting] = React.useState(false);

  const pending = closableNights(data, now);
  const today = nightOf(now);
  const monthAgo = addDays(today, -30);
  const weekAgo = addDays(today, -7);
  const recent = ops.closes.filter((c) => c.night >= monthAgo);
  const diffs = recent.map((c) => closeMath(c, doorTotals(ops, c.eventId ?? "")).diffCents);
  const diffTotal = diffs.reduce((a, b) => a + b, 0);
  const off = diffs.filter((d) => Math.abs(d) >= 100).length;
  const barWeek = ops.closes
    .filter((c) => c.night >= weekAgo)
    .reduce((a, c) => a + c.tpvCashCents + c.tpvCardCents, 0);
  const lastPast = sortedEvents(data)
    .filter((e) => eventPhase(e, now) === "past")
    .reverse()[0];
  const lastAccount = lastPast ? nightAccount(data, lastPast) : null;

  // Noches recientes: las cerradas y las que faltan por cerrar, de la más nueva a la más antigua.
  const nights = [...new Set([...pending, ...ops.closes.map((c) => c.night)])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 14);

  const first = pending[0];
  const description = first
    ? `La noche del ${nightLabel(first).toLowerCase()} está sin cerrar. Apunta el ticket Z y lo contado: Franky suma la taquilla y calcula el descuadre.`
    : recent.length
      ? `Todas las noches cerradas. En los últimos 30 días ${off ? `${off} ${off === 1 ? "noche no cuadró" : "noches no cuadraron"}` : "todo ha cuadrado"}.`
      : "Cierra cada noche en un minuto: fondo, ticket Z del TPV, efectivo contado y datáfono.";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Caja de la noche"
        title="Cierre"
        description={description}
        actions={
          tab === "invitaciones" ? (
            <Button variant="dark" onClick={() => setInviting(true)}>
              <GlassWater className="h-4 w-4" /> Apuntar invitación
            </Button>
          ) : (
            <Button variant="dark" onClick={() => setClosing(first ?? today)}>
              <Wallet className="h-4 w-4" /> {first ? "Cerrar la noche" : "Cerrar esta noche"}
            </Button>
          )
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          label="Qué ver"
          options={[
            { value: "noches", label: "Noche a noche", count: nights.length },
            { value: "cuenta", label: "Cuenta de la noche" },
            { value: "informe", label: "Informe del lunes" },
            { value: "invitaciones", label: "Invitaciones", count: invitesOfNight(ops, today).length || undefined },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi
          icon={Wallet}
          label="Por cerrar"
          value={pending.length}
          hint={first ? nightLabel(first) : "Todo al día"}
          emphasis={pending.length > 0}
          onClick={first ? () => setClosing(first) : undefined}
        />
        <Kpi
          icon={Scale}
          label="Descuadre, 30 días"
          value={diffLabel(diffTotal)}
          hint={`${recent.length} ${recent.length === 1 ? "noche cerrada" : "noches cerradas"}`}
        />
        <Kpi label="Barra, 7 días" value={money(barWeek, { round: true })} hint="Según tus tickets Z" />
        <Kpi
          label="Última noche"
          value={lastAccount ? money(lastAccount.resultCents, { round: true }) : "Sin datos"}
          hint={lastPast ? `Resultado de ${lastPast.name}` : "Cierra tu primera noche"}
          onClick={lastPast ? () => setTab("cuenta") : undefined}
        />
      </KpiRow>

      {tab === "noches" ? (
        <NightsList nights={nights} pending={pending} onClose={setClosing} onOpen={setDetail} />
      ) : tab === "cuenta" ? (
        <AccountView />
      ) : tab === "invitaciones" ? (
        <InvitesView onAdd={() => setInviting(true)} />
      ) : (
        <ReportView />
      )}

      <Tip title="Por qué cuadrar cada noche">
        Los descuadres pequeños y repetidos son la fuga de dinero más difícil de ver. Si cada cierre queda firmado con nombre y hora, el lunes sabes qué noche y qué turno se descuadró.
      </Tip>

      <CloseDrawer night={closing} onClose={() => setClosing(null)} />
      <CloseDetailDrawer night={detail} onClose={() => setDetail(null)} />
      <InviteDrawer open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Noche a noche                                                       */
/* ------------------------------------------------------------------ */

function NightsList({
  nights,
  pending,
  onClose,
  onOpen,
}: {
  nights: string[];
  pending: string[];
  onClose: (night: string) => void;
  onOpen: (night: string) => void;
}) {
  const { data } = usePro();
  const { ops } = useNightOps();
  if (!nights.length) {
    return (
      <Panel>
        <Empty
          icon={Receipt}
          title="Aún no has cerrado ninguna noche"
          body="Al terminar, apunta el ticket Z del TPV y lo que hay en el cajón. Aquí verás cada noche con su descuadre, quién la cerró y cuánto se vendió."
        />
      </Panel>
    );
  }
  return (
    <Panel title="Noche a noche" description="Toca una noche para ver su cierre y compararla con las anteriores." flush>
      <RowList>
        {nights.map((night) => {
          const close = closeForNight(ops, night);
          const ev = eventOfNight(data, night);
          const isPending = pending.includes(night);
          const m = close ? closeMath(close, doorTotals(ops, close.eventId ?? "")) : null;
          return (
            <div key={night} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => (close ? onOpen(night) : onClose(night))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
              >
                <span className="w-16 shrink-0">
                  <span className="block font-heading text-sm font-bold">{nightLabel(night).split(",")[0]}</span>
                  <span className="block text-xs text-text-muted">{nightLabel(night).split(",").slice(1).join(",").trim()}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{ev?.name ?? "Noche sin evento"}</span>
                  <span className="block truncate text-xs text-text-muted">
                    {ev ? `${ev.checkedIn} personas` : "Barra"}
                    {close ? ` · barra ${money(close.tpvCashCents + close.tpvCardCents, { round: true })}` : ""}
                    {close ? ` · cerró ${close.closedBy.split(" ")[0]} a las ${time(close.closedAt)}` : ""}
                  </span>
                </span>
              </button>
              {m ? (
                <Pill tone={diffTone(m.diffCents)}>{diffLabel(m.diffCents)}</Pill>
              ) : isPending ? (
                <Button variant="dark" size="sm" onClick={() => onClose(night)} className="shrink-0">
                  Cerrar
                </Button>
              ) : null}
            </div>
          );
        })}
      </RowList>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario de cierre                                                */
/* ------------------------------------------------------------------ */

function CloseDrawer({ night, onClose }: { night: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const toast = useToast();
  const [by, setBy] = React.useState("");
  const [float, setFloat] = React.useState("");
  const [tpvCash, setTpvCash] = React.useState("");
  const [tpvCard, setTpvCard] = React.useState("");
  const [cash, setCash] = React.useState("");
  const [card, setCard] = React.useState("");
  const [invitations, setInvitations] = React.useState("0");
  const [invitationsEuros, setInvitationsEuros] = React.useState("0");
  const [note, setNote] = React.useState("");

  const ev = night ? eventOfNight(data, night) : null;
  const door = doorTotals(ops, ev?.id ?? "");

  React.useEffect(() => {
    if (!night) return;
    const last = [...ops.closes].sort((a, b) => b.night.localeCompare(a.night))[0];
    setBy(defaultSigner(data));
    setFloat(eurosInput(last?.floatCents ?? 15000));
    setTpvCash("");
    setTpvCard("");
    setCash("");
    setCard("");
    // Si el equipo apuntó las invitaciones con nombre, el cierre ya las trae sumadas.
    const logged = closeInvitesDraft(ops, night);
    setInvitations(String(logged.invitations));
    setInvitationsEuros(eurosInput(logged.invitationsCents));
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night]);

  if (!night) return <Drawer open={false} onOpenChange={() => onClose()} title="Cierre">{null}</Drawer>;

  const filled = tpvCash !== "" && tpvCard !== "" && cash !== "" && card !== "";
  const draft = {
    floatCents: euros(float),
    tpvCashCents: euros(tpvCash),
    tpvCardCents: euros(tpvCard),
    cashCountedCents: euros(cash),
    cardCountedCents: euros(card),
  };
  const m = closeMath(draft, door);
  const previous = sameWeekdayCloses(ops, night, 4);
  const already = closeForNight(ops, night);
  const logged = closeInvitesDraft(ops, night);
  const overCap = invitesByPerson(invitesOfNight(ops, night), ops.settings.invitesPerPerson ?? null).filter((r) => r.over);

  const save = () => {
    const close: ProNightClose = {
      id: localId("cl"),
      night,
      eventId: ev?.id,
      closedBy: by.trim(),
      closedAt: new Date().toISOString(),
      ...draft,
      invitations: Math.max(0, Number(invitations) || 0),
      invitationsCents: euros(invitationsEuros),
      note: note.trim() || undefined,
    };
    void setOps("close.create", (o) => ({
      ...o,
      closes: [...o.closes.filter((c) => c.night !== night), close],
    }));
    toast.success(
      m.diffCents === 0 ? "Caja cuadrada y firmada" : `Cierre guardado: ${diffLabel(m.diffCents)}`,
      `Firmado por ${close.closedBy.split(" ")[0]} a las ${time(close.closedAt)}.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={Boolean(night)}
      onOpenChange={(v) => !v && onClose()}
      wide
      title={`Cierre del ${nightLabel(night).toLowerCase()}`}
      description={ev ? `${ev.name} · ${ev.checkedIn} personas` : "Noche sin evento en Franky"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="dark" onClick={save} disabled={!filled || !by.trim()}>
            <CheckCircle2 className="h-4 w-4" /> Cerrar y firmar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {already ? (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Esta noche ya la cerró {already.closedBy.split(" ")[0]} a las {time(already.closedAt)}. Si guardas, se sustituye.
          </p>
        ) : null}
        <FormField label="Quién cierra">
          <SignerChips value={by} onChange={setBy} />
        </FormField>

        <section>
          <p className="eyebrow mb-2">Ticket Z del TPV</p>
          <div className="grid grid-cols-2 gap-3">
            <MoneyField id="cl-tpv-cash" label="Ventas en efectivo" value={tpvCash} onChange={setTpvCash} />
            <MoneyField id="cl-tpv-card" label="Ventas con tarjeta" value={tpvCard} onChange={setTpvCard} />
          </div>
        </section>

        <section>
          <p className="eyebrow mb-2">Lo contado</p>
          <div className="grid grid-cols-3 gap-3">
            <MoneyField id="cl-float" label="Fondo de caja" value={float} onChange={setFloat} />
            <MoneyField id="cl-cash" label="Efectivo en cajón" value={cash} onChange={setCash} />
            <MoneyField id="cl-card" label="Datáfono" value={card} onChange={setCard} />
          </div>
          <p className="mt-2 text-xs text-text-muted">El efectivo del cajón incluye el fondo. El datáfono, el total de su cierre.</p>
        </section>

        {door.count ? (
          <div className="rounded-2xl bg-bg-secondary p-3 text-sm">
            <span className="font-semibold">Taquilla en Franky:</span> {money(door.cashCents)} en efectivo y{" "}
            {money(door.cardCents)} con tarjeta ({door.count} {door.count === 1 ? "entrada" : "entradas"}). Ya se suman a lo esperado.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Copas invitadas" htmlFor="cl-inv">
            <input
              id="cl-inv"
              type="number"
              min={0}
              inputMode="numeric"
              value={invitations}
              onChange={(e) => setInvitations(e.target.value)}
              className={inputClass}
            />
          </FormField>
          <MoneyField id="cl-inv-eur" label="Valor de las invitaciones" value={invitationsEuros} onChange={setInvitationsEuros} />
        </div>
        {logged.count ? (
          <p className="-mt-2 text-xs text-text-muted">
            {logged.count} {logged.count === 1 ? "invitación apuntada" : "invitaciones apuntadas"} con nombre esta noche.
            {overCap.length ? ` ${overCap.map((r) => r.by.split(" ")[0]).join(" y ")} ${overCap.length === 1 ? "pasó" : "pasaron"} su cupo.` : ""}
          </p>
        ) : null}

        {filled ? (
          <section className="rounded-2xl border border-border p-4">
            <p className="eyebrow">Resultado</p>
            <p
              className={cn(
                "mt-1 font-heading text-4xl font-extrabold tracking-[-0.03em] tabular",
                diffTone(m.diffCents) === "success"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : diffTone(m.diffCents) === "warning"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400",
              )}
            >
              {m.diffCents === 0 ? "Cuadra" : diffLabel(m.diffCents)}
            </p>
            <div className="mt-2 divide-y divide-border-light">
              <Detail label="Efectivo esperado">{money(m.expectedCashCents)}</Detail>
              <Detail label="Efectivo contado">
                {money(draft.cashCountedCents)} <span className="text-text-muted">({diffLabel(m.cashDiffCents)})</span>
              </Detail>
              <Detail label="Tarjeta esperada">{money(m.expectedCardCents)}</Detail>
              <Detail label="Datáfono">
                {money(draft.cardCountedCents)} <span className="text-text-muted">({diffLabel(m.cardDiffCents)})</span>
              </Detail>
              <Detail label="Ventas de la noche">{money(m.salesCents)}</Detail>
            </div>
          </section>
        ) : (
          <p className="text-sm text-text-muted">Rellena el ticket Z y lo contado para ver si cuadra.</p>
        )}

        {previous.length ? (
          <section>
            <p className="eyebrow mb-2">Mismo día, semanas anteriores</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {previous.map((c) => {
                const pm = closeMath(c, doorTotals(ops, c.eventId ?? ""));
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-text-muted">{nightLabel(c.night)}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{money(c.tpvCashCents + c.tpvCardCents, { round: true })}</span>
                      <Pill tone={diffTone(pm.diffCents)}>{diffLabel(pm.diffCents)}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
            {filled ? (
              <p className="mt-2 text-xs text-text-muted">
                Esta noche {barCompareLabel(m.salesCents - door.cashCents - door.cardCents, previous)}.
              </p>
            ) : null}
          </section>
        ) : null}

        <FormField label="Nota" htmlFor="cl-note" hint={m.diffCents && filled ? "Si no cuadra, apunta lo que sepas: ayuda a encontrarlo." : undefined}>
          <textarea
            id="cl-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Una invitación cobrada dos veces, un billete de 50 cambiado…"
            className={textareaClass}
          />
        </FormField>
      </div>
    </Drawer>
  );
}

function MoneyField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FormField label={label} htmlFor={id}>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={cn(inputClass, "pr-8 text-right tabular")}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
          €
        </span>
      </div>
    </FormField>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de un cierre                                                */
/* ------------------------------------------------------------------ */

function CloseDetailDrawer({ night, onClose }: { night: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops } = useNightOps();
  const close = night ? closeForNight(ops, night) : null;
  if (!night || !close) return <Drawer open={false} onOpenChange={() => onClose()} title="Cierre">{null}</Drawer>;
  const door = doorTotals(ops, close.eventId ?? "");
  const m = closeMath(close, door);
  const ev = eventOfNight(data, night);
  const previous = sameWeekdayCloses(ops, night, 4);
  const invites = invitesOfNight(ops, night);
  const text = [
    `Cierre de ${data.space.name}, ${nightLabel(night).toLowerCase()}`,
    `Barra: ${money(close.tpvCashCents)} en efectivo y ${money(close.tpvCardCents)} con tarjeta`,
    door.count ? `Taquilla: ${money(door.cashCents)} en efectivo y ${money(door.cardCents)} con tarjeta` : null,
    `Descuadre: ${m.diffCents === 0 ? "cuadra" : diffLabel(m.diffCents)}`,
    close.invitations ? `Invitaciones: ${close.invitations} copas, ${money(close.invitationsCents)}` : null,
    `Cerró ${close.closedBy} a las ${time(close.closedAt)}`,
    close.note ? `Nota: ${close.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Cierre del ${nightLabel(night).toLowerCase()}`}
      description={`${ev?.name ?? "Noche sin evento"} · firmado por ${close.closedBy} a las ${time(close.closedAt)}`}
      footer={
        <Button asChild variant="dark">
          <a href={whatsAppShare(text)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> Enviar resumen
          </a>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Pill tone={diffTone(m.diffCents)}>{m.diffCents === 0 ? "Cuadra" : diffLabel(m.diffCents)}</Pill>
          <span className="text-sm text-text-muted">Ventas de la noche {money(m.salesCents)}</span>
        </div>
        <div className="divide-y divide-border-light">
          <Detail label="Fondo de caja">{money(close.floatCents)}</Detail>
          <Detail label="Barra en efectivo (ticket Z)">{money(close.tpvCashCents)}</Detail>
          <Detail label="Barra con tarjeta (ticket Z)">{money(close.tpvCardCents)}</Detail>
          {door.count ? <Detail label="Taquilla en efectivo">{money(door.cashCents)}</Detail> : null}
          {door.count ? <Detail label="Taquilla con tarjeta">{money(door.cardCents)}</Detail> : null}
          <Detail label="Efectivo contado">
            {money(close.cashCountedCents)} <span className="text-text-muted">({diffLabel(m.cashDiffCents)})</span>
          </Detail>
          <Detail label="Datáfono">
            {money(close.cardCountedCents)} <span className="text-text-muted">({diffLabel(m.cardDiffCents)})</span>
          </Detail>
          <Detail label="Invitaciones">
            {close.invitations} · {money(close.invitationsCents)}
          </Detail>
        </div>
        {close.note ? <p className="rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">{close.note}</p> : null}
        {invites.length ? (
          <section>
            <p className="eyebrow mb-2">Invitaciones con nombre</p>
            <ul className="flex flex-col gap-1.5 text-sm text-text-secondary">
              {invites.map((i) => (
                <li key={i.id}>{inviteLine(i)}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {previous.length ? (
          <section>
            <p className="eyebrow mb-2">Mismo día, semanas anteriores</p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {previous.map((c) => {
                const pm = closeMath(c, doorTotals(ops, c.eventId ?? ""));
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="text-text-muted">
                      {nightLabel(c.night)} · {c.closedBy.split(" ")[0]}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular">{money(c.tpvCashCents + c.tpvCardCents, { round: true })}</span>
                      <Pill tone={diffTone(pm.diffCents)}>{diffLabel(pm.diffCents)}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Cuenta de la noche                                                  */
/* ------------------------------------------------------------------ */

const COST_KINDS: ProNightCostKind[] = ["dj", "security", "staff", "ads", "other"];

function AccountView() {
  const { data, now, update } = usePro();
  const toast = useToast();
  const events = sortedEvents(data)
    .filter((e) => {
      const p = eventPhase(e, now);
      return p === "past" || p === "live" || p === "today";
    })
    .reverse()
    .slice(0, 8);
  const [eventId, setEventId] = React.useState<string>(events.find((e) => eventPhase(e, now) === "past")?.id ?? events[0]?.id ?? "");
  const [kind, setKind] = React.useState<ProNightCostKind>("dj");
  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");

  const ev = events.find((e) => e.id === eventId) ?? events[0];
  if (!ev) {
    return (
      <Panel>
        <Empty
          icon={Scale}
          title="Aún no hay noches que cuadrar"
          body="Cuando pase tu primera noche verás aquí lo que entró por entradas, taquilla, señales y barra, menos tus costes."
        />
      </Panel>
    );
  }
  const a = nightAccount(data, ev);
  const positive = a.resultCents >= 0;

  const setCosts = (next: ProNightCost[]) =>
    update("event.costs", (d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? { ...e, costs: next } : e)) }));

  const addCost = () => {
    const cents = euros(amount);
    if (!cents) return;
    void setCosts([
      ...a.costs,
      { id: localId("cost"), kind, label: label.trim() || COST_KIND_LABEL[kind], cents },
    ]);
    toast.success("Coste añadido", `${label.trim() || COST_KIND_LABEL[kind]}: ${money(cents)}`);
    setLabel("");
    setAmount("");
  };

  const summary = [
    `${ev.name}, ${nightLabel(ev.date).toLowerCase()}`,
    `Entradas online: ${money(a.onlineCents)}`,
    `Taquilla: ${money(a.doorCents)}`,
    `Señales de reservados: ${money(a.depositsCents)}`,
    `Barra: ${a.barCents === null ? "sin cierre" : money(a.barCents)}`,
    `Costes: ${money(a.costsCents)} y comisiones de RRPP: ${money(a.commissionsCents)}`,
    `Resultado: ${money(a.resultCents)}`,
  ].join("\n");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        {events.length > 1 ? (
          <Segmented
            value={ev.id}
            onChange={setEventId}
            label="Noche"
            options={events.map((e) => ({ value: e.id, label: `${e.name.split(" ")[0]} ${shortDay(e.doorsOpen)}` }))}
          />
        ) : null}
        <section className="rounded-2xl border border-border bg-bg-primary p-5 shadow-card">
          <p className="eyebrow">{ev.name}</p>
          <p className="mt-2 text-sm text-text-muted">{positive ? "La noche ha ganado" : "La noche ha perdido"}</p>
          <p
            className={cn(
              "font-heading text-5xl font-extrabold leading-none tracking-[-0.03em] tabular",
              positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
            )}
          >
            {money(Math.abs(a.resultCents), { round: true })}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {a.barCents === null
              ? "Sin la barra: cierra la caja de esa noche para sumarla."
              : "Con la barra del ticket Z, las entradas, la taquilla y las señales."}
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-semibold">Ingresos</p>
              <div className="divide-y divide-border-light">
                <Detail label="Entradas online">{money(a.onlineCents)}</Detail>
                <Detail label="Taquilla">{money(a.doorCents)}</Detail>
                <Detail label="Señales de reservados">{money(a.depositsCents)}</Detail>
                <Detail label="Barra">{a.barCents === null ? <span className="text-text-muted">Sin cierre</span> : money(a.barCents)}</Detail>
                <Detail label="Total">{money(a.incomeCents)}</Detail>
              </div>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">Gastos</p>
              <div className="divide-y divide-border-light">
                {a.costs.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-text-muted">{c.label}</span>
                    <span className="flex items-center gap-1">
                      <span className="font-medium tabular">{money(c.cents)}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${c.label}`}
                        onClick={() => void setCosts(a.costs.filter((x) => x.id !== c.id))}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary hover:text-text-primary"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                      </button>
                    </span>
                  </div>
                ))}
                <Detail label="Comisiones de RRPP">{money(a.commissionsCents)}</Detail>
                <Detail label="Total">{money(a.costsCents + a.commissionsCents)}</Detail>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-text-muted">
            La comisión de Franky por entrada ({money(a.frankyFeeCents)} esa noche) la pagó quien compró: no sale de tu cuenta.
          </p>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Añadir un coste" description="DJ, seguridad, camareros extra o anuncios de esa noche.">
          <div className="flex flex-col gap-3">
            <ChoiceChips value={kind} onChange={setKind} options={COST_KINDS.map((k) => ({ value: k, label: COST_KIND_LABEL[k] }))} />
            <input aria-label="Concepto" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Concepto (opcional)" className={inputClass} />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <MoneyField id="cost-amount" label="Importe" value={amount} onChange={setAmount} />
              <Button variant="dark" onClick={addCost} disabled={!euros(amount)} className="self-end">
                <Plus className="h-4 w-4" /> Añadir
              </Button>
            </div>
          </div>
        </Panel>
        <Button asChild variant="outline">
          <a href={whatsAppShare(summary)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> Enviar la cuenta por WhatsApp
          </a>
        </Button>
        <NextNightsHint event={ev} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Informe del lunes: noche a noche comparada                          */
/* ------------------------------------------------------------------ */

function resultClass(cents: number): string {
  return cents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

function ReportView() {
  const { data, now } = usePro();
  const report = nightsReport(data, now, 8);
  if (!report.length) {
    return (
      <Panel>
        <Empty
          icon={Scale}
          title="El informe sale con tu primera noche"
          body="Cada lunes verás aquí tus últimas noches una al lado de otra: gente, pico de aforo, taquilla, señales, barra, descuadre y resultado."
        />
      </Panel>
    );
  }
  const best = report.reduce((a, b) => (b.resultCents > a.resultCents ? b : a));
  const maxPeople = Math.max(1, ...report.map((r) => r.people));
  const people = report.reduce((a, r) => a + r.people, 0);
  const result = report.reduce((a, r) => a + r.resultCents, 0);
  const unclosed = report.filter((r) => r.closeDiffCents === null).length;
  const description = [
    `${people.toLocaleString("es-ES")} personas y ${money(result, { round: true })} de resultado.`,
    `La mejor, ${best.event.name} del ${shortDay(best.event.doorsOpen)}.`,
    unclosed ? `${unclosed} sin cierre de caja: su barra no cuenta.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-5">
      <Panel title={`Tus últimas ${report.length} noches`} description={description} flush>
        {/* Móvil: una tarjeta por noche con la gente como barra de un vistazo. */}
        <RowList className="md:hidden">
          {report.map((r) => (
            <div key={r.event.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold">
                  {r.event.name} <span className="font-normal text-text-muted">{shortDay(r.event.doorsOpen)}</span>
                </span>
                <span className={cn("shrink-0 font-heading font-bold tabular", resultClass(r.resultCents))}>
                  {money(r.resultCents, { round: true })}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-secondary" aria-hidden>
                <div className="h-full rounded-full bg-violet" style={{ width: `${Math.round((r.people / maxPeople) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">
                {r.people} personas ({r.fillPct} %) · pico {r.peak} · barra{" "}
                {r.barCents === null ? "sin cierre" : money(r.barCents, { round: true })}
                {r.incidents ? ` · ${r.incidents} ${r.incidents === 1 ? "incidencia" : "incidencias"}` : ""}
              </p>
              {r.closeDiffCents !== null && Math.abs(r.closeDiffCents) >= 100 ? (
                <Pill tone={diffTone(r.closeDiffCents)} className="mt-1.5">
                  Descuadre {diffLabel(r.closeDiffCents)}
                </Pill>
              ) : null}
            </div>
          ))}
        </RowList>
        <div className="hidden overflow-x-auto md:block pro-scroll">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border-light text-left text-xs text-text-muted">
                <th className="px-5 py-2.5 font-medium">Noche</th>
                <th className="px-3 py-2.5 text-right font-medium">Gente</th>
                <th className="px-3 py-2.5 text-right font-medium">Pico</th>
                <th className="px-3 py-2.5 text-right font-medium">Entradas</th>
                <th className="px-3 py-2.5 text-right font-medium">Señales</th>
                <th className="px-3 py-2.5 text-right font-medium">Barra</th>
                <th className="px-3 py-2.5 text-right font-medium">Caja</th>
                <th className="px-5 py-2.5 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.event.id} className="border-b border-border-light last:border-0">
                  <td className="px-5 py-3">
                    <span className="block font-semibold">{r.event.name}</span>
                    <span className="text-xs text-text-muted">
                      {shortDay(r.event.doorsOpen)}
                      {r.incidents ? ` · ${r.incidents} ${r.incidents === 1 ? "incidencia" : "incidencias"}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular">
                    {r.people} <span className="text-xs text-text-muted">({r.fillPct} %)</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular">{r.peak}</td>
                  <td className="px-3 py-3 text-right tabular">{money(r.ticketsCents, { round: true })}</td>
                  <td className="px-3 py-3 text-right tabular">{money(r.depositsCents, { round: true })}</td>
                  <td className="px-3 py-3 text-right tabular">
                    {r.barCents === null ? <span className="text-text-muted">Sin cierre</span> : money(r.barCents, { round: true })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.closeDiffCents === null ? (
                      <span className="text-xs text-text-muted">Sin cierre</span>
                    ) : (
                      <Pill tone={diffTone(r.closeDiffCents)}>{diffLabel(r.closeDiffCents)}</Pill>
                    )}
                  </td>
                  <td className={cn("px-5 py-3 text-right font-heading font-bold tabular", resultClass(r.resultCents))}>
                    {money(r.resultCents, { round: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild variant="dark">
          <a href={whatsAppShare(nightsReportMessage(data.space, report))} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> Enviar el informe por WhatsApp
          </a>
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(`noches-${data.space.slug}-${nightOf(now)}.csv`, nightsReportRows(report))}>
          <Download className="h-4 w-4" /> CSV para tu gestoría
        </Button>
      </div>
    </div>
  );
}

/** Si la noche se repite cada semana, recuerda que sus costes se copian a las siguientes. */
function NextNightsHint({ event }: { event: ProEvent }) {
  const { data } = usePro();
  if (!event.seriesId) return null;
  const next = data.events.filter((e) => e.seriesId === event.seriesId && e.date > event.date).length;
  if (!next) return null;
  return (
    <Tip title="Noche que se repite">
      Hay {next} {next === 1 ? "noche más" : "noches más"} de esta serie. Los costes nuevos solo se apuntan en esta.
    </Tip>
  );
}
