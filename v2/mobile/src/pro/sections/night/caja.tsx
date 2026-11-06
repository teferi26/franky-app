import React from "react";
import { Alert, View } from "react-native";
import { CheckCircle2, Download, GlassWater, MessageCircle, Plus, Receipt, Scale, Trash2, Wallet } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProNightClose, ProNightCost, ProNightCostKind } from "../../../../../shared/pro/night-types";
import { addDays, money, shortDay, time } from "../../../../../shared/pro/format";
import { eventPhase, nightOf, sortedEvents } from "../../../../../shared/pro/night";
import {
  COST_KIND_LABEL,
  barCompareLabel,
  closableNights,
  closeForNight,
  closeMath,
  diffLabel,
  diffTone,
  doorTotals,
  eventOfNight,
  nightAccount,
  nightTitle,
  nightsReport,
  nightsReportMessage,
  nightsReportRows,
  sameWeekdayCloses,
} from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Chips, ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, Meter, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Stepper, Tip } from "../../kit";
import { BigFigure, Note, SignerChips, defaultSigner, euros, eurosInput, openWhatsApp, shareCsv, toneColor, useNightOps } from "./ops-ui";
import { closeInvitesDraft, inviteLine, invitesByPerson, invitesOfNight } from "../../../../../shared/pro/night-invites";
import { InviteSheet, InvitesView } from "./invites";

/**
 * Cierre de caja de la noche, cuenta de la noche e informe del lunes:
 * versión nativa de web/.../night/caja.tsx, para cerrar a las 4:30 desde el móvil.
 */

type Tab = "noches" | "cuenta" | "informe" | "invitaciones";

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
  const barWeek = ops.closes.filter((c) => c.night >= weekAgo).reduce((a, c) => a + c.tpvCashCents + c.tpvCardCents, 0);
  const lastPast = sortedEvents(data)
    .filter((e) => eventPhase(e, now) === "past")
    .reverse()[0];
  const lastAccount = lastPast ? nightAccount(data, lastPast) : null;

  // Noches recientes: las cerradas y las que faltan por cerrar, de la más nueva a la más antigua.
  const nights = [...new Set([...pending, ...ops.closes.map((c) => c.night)])].sort((a, b) => b.localeCompare(a)).slice(0, 14);
  const first = pending[0];
  const description = first
    ? `La noche del ${nightTitle(first).toLowerCase()} está sin cerrar. Apunta el ticket Z y lo contado: Franky suma la taquilla y calcula el descuadre.`
    : recent.length
      ? `Todas las noches cerradas. En los últimos 30 días ${off ? `${off} ${off === 1 ? "noche no cuadró" : "noches no cuadraron"}` : "todo ha cuadrado"}.`
      : "Cierra cada noche en un minuto: fondo, ticket Z del TPV, efectivo contado y datáfono.";

  return (
    <ProPage>
      <PageHeader
        eyebrow="Caja de la noche"
        title="Cierre"
        description={description}
        actions={
          tab === "invitaciones" ? (
            <PButton label="Apuntar invitación" icon={GlassWater} onPress={() => setInviting(true)} />
          ) : (
            <PButton label={first ? "Cerrar la noche" : "Cerrar esta noche"} icon={Wallet} onPress={() => setClosing(first ?? today)} />
          )
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "noches", label: "Noche a noche", count: nights.length },
            { value: "cuenta", label: "Cuenta" },
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
          hint={first ? nightTitle(first) : "Todo al día"}
          emphasis={pending.length > 0}
          onPress={first ? () => setClosing(first) : undefined}
        />
        <Kpi icon={Scale} label="Descuadre, 30 días" value={diffLabel(diffTotal)} hint={`${recent.length} ${recent.length === 1 ? "noche cerrada" : "noches cerradas"}`} />
        <Kpi label="Barra, 7 días" value={money(barWeek, { round: true })} hint="Según tus tickets Z" />
        <Kpi
          label="Última noche"
          value={lastAccount ? money(lastAccount.resultCents, { round: true }) : "Sin datos"}
          hint={lastPast ? `Resultado de ${lastPast.name}` : "Cierra tu primera noche"}
          onPress={lastPast ? () => setTab("cuenta") : undefined}
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

      <CloseSheet night={closing} onClose={() => setClosing(null)} />
      <CloseDetailSheet night={detail} onClose={() => setDetail(null)} />
      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Noche a noche                                                       */
/* ------------------------------------------------------------------ */

function NightsList({ nights, pending, onClose, onOpen }: { nights: string[]; pending: string[]; onClose: (night: string) => void; onOpen: (night: string) => void }) {
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
      {nights.map((night, i) => {
        const close = closeForNight(ops, night);
        const ev = eventOfNight(data, night);
        const isPending = pending.includes(night);
        const m = close ? closeMath(close, doorTotals(ops, close.eventId ?? "")) : null;
        const sub = [
          ev ? `${ev.checkedIn} personas` : "Barra",
          close ? `barra ${money(close.tpvCashCents + close.tpvCardCents, { round: true })}` : null,
          close ? `cerró ${close.closedBy.split(" ")[0]} a las ${time(close.closedAt)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <ListRow
            key={night}
            last={i === nights.length - 1}
            onPress={() => (close ? onOpen(night) : onClose(night))}
            accessibilityLabel={`${nightTitle(night)}, ${close ? "cerrada" : "sin cerrar"}`}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{`${nightTitle(night)} · ${ev?.name ?? "Noche sin evento"}`}</PText>
              <PText v="tiny" numberOfLines={1}>{sub}</PText>
            </View>
            {m ? <Pill label={diffLabel(m.diffCents)} tone={diffTone(m.diffCents)} /> : isPending ? <Pill label="Cerrar" tone="dark" /> : null}
          </ListRow>
        );
      })}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Formulario de cierre                                                */
/* ------------------------------------------------------------------ */

function MoneyInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <PText v="small" color={C.text}>{label}</PText>
      <Input value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="0 €" label={`${label} en euros`} style={{ textAlign: "right" }} />
    </View>
  );
}

function CloseSheet({ night, onClose }: { night: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops, setOps } = useNightOps();
  const [by, setBy] = React.useState("");
  const [float, setFloat] = React.useState("");
  const [tpvCash, setTpvCash] = React.useState("");
  const [tpvCard, setTpvCard] = React.useState("");
  const [cash, setCash] = React.useState("");
  const [card, setCard] = React.useState("");
  const [invitations, setInvitations] = React.useState(0);
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
    setInvitations(logged.invitations);
    setInvitationsEuros(eurosInput(logged.invitationsCents));
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night]);

  if (!night) return null;

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

  const save = async () => {
    const close: ProNightClose = {
      id: localId("cl"),
      night,
      eventId: ev?.id,
      closedBy: by.trim(),
      closedAt: new Date().toISOString(),
      ...draft,
      invitations,
      invitationsCents: euros(invitationsEuros),
      note: note.trim() || undefined,
    };
    const ok = await setOps("close.create", (o) => ({ ...o, closes: [...o.closes.filter((c) => c.night !== night), close] }));
    if (!ok) return;
    toast(m.diffCents === 0 ? "Caja cuadrada y firmada" : `Cierre guardado: ${diffLabel(m.diffCents)}`, {
      kind: "success",
      body: `Firmado por ${close.closedBy.split(" ")[0]} a las ${time(close.closedAt)}.`,
    });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Cierre del ${nightTitle(night).toLowerCase()}`}
      description={ev ? `${ev.name} · ${ev.checkedIn} personas` : "Noche sin evento en Franky"}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Cerrar y firmar" icon={CheckCircle2} onPress={() => void save()} disabled={!filled || !by.trim()} />
        </>
      }
    >
      {already ? <Note tone="warning">{`Esta noche ya la cerró ${already.closedBy.split(" ")[0]} a las ${time(already.closedAt)}. Si guardas, se sustituye.`}</Note> : null}
      <Field label="Quién cierra">
        <SignerChips value={by} onChange={setBy} />
      </Field>

      <PText v="label">Ticket Z del TPV</PText>
      <View style={{ flexDirection: "row", gap: S.md }}>
        <MoneyInput label="Ventas en efectivo" value={tpvCash} onChange={setTpvCash} />
        <MoneyInput label="Ventas con tarjeta" value={tpvCard} onChange={setTpvCard} />
      </View>

      <PText v="label">Lo contado</PText>
      <View style={{ flexDirection: "row", gap: S.md }}>
        <MoneyInput label="Efectivo en cajón" value={cash} onChange={setCash} />
        <MoneyInput label="Datáfono" value={card} onChange={setCard} />
      </View>
      <MoneyInput label="Fondo de caja" value={float} onChange={setFloat} />
      <PText v="tiny">El efectivo del cajón incluye el fondo. El datáfono, el total de su cierre.</PText>

      {door.count ? (
        <Note>
          {`Taquilla en Franky: ${money(door.cashCents)} en efectivo y ${money(door.cardCents)} con tarjeta (${door.count} ${door.count === 1 ? "entrada" : "entradas"}). Ya se suman a lo esperado.`}
        </Note>
      ) : null}

      <Field label="Copas invitadas">
        <Stepper value={invitations} onChange={setInvitations} min={0} max={500} label="copas invitadas" />
      </Field>
      <MoneyInput label="Valor de las invitaciones" value={invitationsEuros} onChange={setInvitationsEuros} />
      {logged.count ? (
        <PText v="tiny">
          {`${logged.count} ${logged.count === 1 ? "invitación apuntada" : "invitaciones apuntadas"} con nombre esta noche.${
            overCap.length ? ` ${overCap.map((r) => r.by.split(" ")[0]).join(" y ")} ${overCap.length === 1 ? "pasó" : "pasaron"} su cupo.` : ""
          }`}
        </PText>
      ) : null}

      {filled ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.xs }}>
          <PText v="label">Resultado</PText>
          <BigFigure color={toneColor(diffTone(m.diffCents))}>{m.diffCents === 0 ? "Cuadra" : diffLabel(m.diffCents)}</BigFigure>
          <Detail label="Efectivo esperado" value={money(m.expectedCashCents)} />
          <Detail label="Efectivo contado" value={`${money(draft.cashCountedCents)} (${diffLabel(m.cashDiffCents)})`} />
          <Detail label="Tarjeta esperada" value={money(m.expectedCardCents)} />
          <Detail label="Datáfono" value={`${money(draft.cardCountedCents)} (${diffLabel(m.cardDiffCents)})`} />
          <Detail label="Ventas de la noche" value={money(m.salesCents)} last />
        </View>
      ) : (
        <PText v="small">Rellena el ticket Z y lo contado para ver si cuadra.</PText>
      )}

      {previous.length ? (
        <View style={{ gap: S.xs }}>
          <PText v="label">Mismo día, semanas anteriores</PText>
          {previous.map((c) => {
            const pm = closeMath(c, doorTotals(ops, c.eventId ?? ""));
            return (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingVertical: 4 }}>
                <PText v="small">{nightTitle(c.night)}</PText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PText v="small" color={C.text}>{money(c.tpvCashCents + c.tpvCardCents, { round: true })}</PText>
                  <Pill label={diffLabel(pm.diffCents)} tone={diffTone(pm.diffCents)} />
                </View>
              </View>
            );
          })}
          {filled ? <PText v="tiny">{`Esta noche ${barCompareLabel(m.salesCents - door.cashCents - door.cardCents, previous)}.`}</PText> : null}
        </View>
      ) : null}

      <Field label="Nota" hint={m.diffCents && filled ? "Si no cuadra, apunta lo que sepas: ayuda a encontrarlo." : undefined}>
        <Input value={note} onChangeText={setNote} multiline placeholder="Una invitación cobrada dos veces, un billete de 50 cambiado..." label="Nota del cierre" />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de un cierre                                                */
/* ------------------------------------------------------------------ */

function CloseDetailSheet({ night, onClose }: { night: string | null; onClose: () => void }) {
  const { data } = usePro();
  const { ops } = useNightOps();
  const close = night ? closeForNight(ops, night) : null;
  if (!night || !close) return null;
  const door = doorTotals(ops, close.eventId ?? "");
  const m = closeMath(close, door);
  const ev = eventOfNight(data, night);
  const previous = sameWeekdayCloses(ops, night, 4);
  const invites = invitesOfNight(ops, night);
  const text = [
    `Cierre de ${data.space.name}, ${nightTitle(night).toLowerCase()}`,
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
    <Sheet
      open
      onClose={onClose}
      title={`Cierre del ${nightTitle(night).toLowerCase()}`}
      description={`${ev?.name ?? "Noche sin evento"} · firmado por ${close.closedBy} a las ${time(close.closedAt)}`}
      footer={<PButton label="Enviar resumen" icon={MessageCircle} onPress={() => openWhatsApp(text)} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
        <Pill label={m.diffCents === 0 ? "Cuadra" : diffLabel(m.diffCents)} tone={diffTone(m.diffCents)} />
        <PText v="small">{`Ventas de la noche ${money(m.salesCents)}`}</PText>
      </View>
      <View>
        <Detail label="Fondo de caja" value={money(close.floatCents)} />
        <Detail label="Barra en efectivo (ticket Z)" value={money(close.tpvCashCents)} />
        <Detail label="Barra con tarjeta (ticket Z)" value={money(close.tpvCardCents)} />
        {door.count ? <Detail label="Taquilla en efectivo" value={money(door.cashCents)} /> : null}
        {door.count ? <Detail label="Taquilla con tarjeta" value={money(door.cardCents)} /> : null}
        <Detail label="Efectivo contado" value={`${money(close.cashCountedCents)} (${diffLabel(m.cashDiffCents)})`} />
        <Detail label="Datáfono" value={`${money(close.cardCountedCents)} (${diffLabel(m.cardDiffCents)})`} />
        <Detail label="Invitaciones" value={`${close.invitations} · ${money(close.invitationsCents)}`} last />
      </View>
      {close.note ? <Note>{close.note}</Note> : null}
      {invites.length ? (
        <View style={{ gap: S.xs }}>
          <PText v="label">Invitaciones con nombre</PText>
          {invites.map((i) => (
            <PText key={i.id} v="small">{inviteLine(i)}</PText>
          ))}
        </View>
      ) : null}
      {previous.length ? (
        <View style={{ gap: S.xs }}>
          <PText v="label">Mismo día, semanas anteriores</PText>
          {previous.map((c) => {
            const pm = closeMath(c, doorTotals(ops, c.eventId ?? ""));
            return (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md, paddingVertical: 4 }}>
                <PText v="small">{`${nightTitle(c.night)} · ${c.closedBy.split(" ")[0]}`}</PText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PText v="small" color={C.text}>{money(c.tpvCashCents + c.tpvCardCents, { round: true })}</PText>
                  <Pill label={diffLabel(pm.diffCents)} tone={diffTone(pm.diffCents)} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Cuenta de la noche                                                  */
/* ------------------------------------------------------------------ */

const COST_KINDS: ProNightCostKind[] = ["dj", "security", "staff", "ads", "other"];

function AccountView() {
  const { data, now, update } = usePro();
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

  const addCost = async () => {
    const cents = euros(amount);
    if (!cents) return;
    const name = label.trim() || COST_KIND_LABEL[kind];
    if (!(await setCosts([...a.costs, { id: localId("cost"), kind, label: name, cents }]))) return;
    toast("Coste añadido", { kind: "success", body: `${name}: ${money(cents)}` });
    setLabel("");
    setAmount("");
  };

  const removeCost = (id: string, name: string) =>
    Alert.alert(`¿Quitar ${name}?`, undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => void setCosts(a.costs.filter((x) => x.id !== id)) },
    ]);

  const summary = [
    `${ev.name}, ${nightTitle(ev.date).toLowerCase()}`,
    `Entradas online: ${money(a.onlineCents)}`,
    `Taquilla: ${money(a.doorCents)}`,
    `Señales de reservados: ${money(a.depositsCents)}`,
    `Barra: ${a.barCents === null ? "sin cierre" : money(a.barCents)}`,
    `Costes: ${money(a.costsCents)} y comisiones de RRPP: ${money(a.commissionsCents)}`,
    `Resultado: ${money(a.resultCents)}`,
  ].join("\n");

  return (
    <>
      {events.length > 1 ? (
        <Chips value={ev.id} onChange={setEventId} options={events.map((e) => ({ value: e.id, label: `${e.name.split(" ")[0]} ${shortDay(e.doorsOpen)}` }))} />
      ) : null}
      <Panel>
        <PText v="label">{ev.name}</PText>
        <PText v="small" style={{ marginTop: S.sm }}>{positive ? "La noche ha ganado" : "La noche ha perdido"}</PText>
        <BigFigure color={positive ? C.success : C.errorText}>{money(Math.abs(a.resultCents), { round: true })}</BigFigure>
        <PText v="tiny">
          {a.barCents === null ? "Sin la barra: cierra la caja de esa noche para sumarla." : "Con la barra del ticket Z, las entradas, la taquilla y las señales."}
        </PText>

        <PText v="h3" style={{ marginTop: S.lg }}>Ingresos</PText>
        <Detail label="Entradas online" value={money(a.onlineCents)} />
        <Detail label="Taquilla" value={money(a.doorCents)} />
        <Detail label="Señales de reservados" value={money(a.depositsCents)} />
        <Detail label="Barra" value={a.barCents === null ? "Sin cierre" : money(a.barCents)} />
        <Detail label="Total" value={money(a.incomeCents)} last />

        <PText v="h3" style={{ marginTop: S.lg }}>Gastos</PText>
        {a.costs.map((c) => (
          <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
            <PText v="small" numberOfLines={1} style={{ flex: 1 }}>{c.label}</PText>
            <PText v="h3">{money(c.cents)}</PText>
            <Tap
              onPress={() => removeCost(c.id, c.label)}
              accessibilityRole="button"
              accessibilityLabel={`Quitar ${c.label}`}
              style={{ width: 40, height: 40, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}
            >
              <Trash2 size={15} color={C.muted} strokeWidth={1.9} />
            </Tap>
          </View>
        ))}
        <Detail label="Comisiones de RRPP" value={money(a.commissionsCents)} />
        <Detail label="Total" value={money(a.costsCents + a.commissionsCents)} last />
        <PText v="tiny" style={{ marginTop: S.sm }}>
          {`La comisión de Franky por entrada (${money(a.frankyFeeCents)} esa noche) la pagó quien compró: no sale de tu cuenta.`}
        </PText>
      </Panel>

      <Panel title="Añadir un coste" description="DJ, seguridad, camareros extra o anuncios de esa noche.">
        <View style={{ gap: S.md }}>
          <ChoiceGrid value={kind} onChange={setKind} options={COST_KINDS.map((k) => ({ value: k, label: COST_KIND_LABEL[k] }))} />
          <Input value={label} onChangeText={setLabel} placeholder="Concepto (opcional)" label="Concepto" />
          <View style={{ flexDirection: "row", gap: S.sm, alignItems: "flex-end" }}>
            <MoneyInput label="Importe" value={amount} onChange={setAmount} />
            <PButton label="Añadir" icon={Plus} onPress={() => void addCost()} disabled={!euros(amount)} />
          </View>
        </View>
      </Panel>
      <PButton label="Enviar la cuenta por WhatsApp" icon={MessageCircle} variant="outline" full onPress={() => openWhatsApp(summary)} style={{ marginBottom: S.lg }} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Informe del lunes                                                   */
/* ------------------------------------------------------------------ */

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
    <>
      <Panel title={`Tus últimas ${report.length} noches`} description={description} flush>
        {report.map((r, i) => (
          <View key={r.event.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 6, borderBottomWidth: i === report.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.md }}>
              <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>{`${r.event.name} · ${shortDay(r.event.doorsOpen)}`}</PText>
              <PText v="h3" color={r.resultCents >= 0 ? C.success : C.errorText} style={{ fontFamily: FONT.heading }}>
                {money(r.resultCents, { round: true })}
              </PText>
            </View>
            <Meter value={r.people} max={maxPeople} />
            <PText v="tiny">
              {`${r.people} personas (${r.fillPct} %) · pico ${r.peak} · barra ${r.barCents === null ? "sin cierre" : money(r.barCents, { round: true })}${
                r.incidents ? ` · ${r.incidents} ${r.incidents === 1 ? "incidencia" : "incidencias"}` : ""
              }`}
            </PText>
            {r.closeDiffCents !== null && Math.abs(r.closeDiffCents) >= 100 ? (
              <Pill label={`Descuadre ${diffLabel(r.closeDiffCents)}`} tone={diffTone(r.closeDiffCents)} />
            ) : null}
          </View>
        ))}
      </Panel>
      <View style={{ gap: S.sm, marginBottom: S.lg }}>
        <PButton label="Enviar el informe por WhatsApp" icon={MessageCircle} full onPress={() => openWhatsApp(nightsReportMessage(data.space, report))} />
        <PButton
          label="CSV para tu gestoría"
          icon={Download}
          variant="outline"
          full
          onPress={() => shareCsv(`Noches de ${data.space.name}`, nightsReportRows(report))}
        />
      </View>
    </>
  );
}
