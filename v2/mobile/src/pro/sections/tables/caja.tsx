import React from "react";
import { Text, View } from "react-native";
import { Check, Coffee, CreditCard, Recycle, ScanLine, ShoppingBasket, Thermometer, Wallet } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProCashClosing } from "../../../../../shared/pro/tables-types";
import {
  bonoSummary,
  cardDay,
  closingChecklist,
  closingTotals,
  splitTips,
  workedMinutes,
} from "../../../../../shared/pro/tables-ops";
import { closingSummaryMessage } from "../../../../../shared/pro/tables-day";
import { durationLabel, localDate, money, plural, shortDay, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, Tip } from "../../kit";
import { MoneyField, PendingRow, WhatsAppButton, parseEuros, staffFirstName, useTablesOps } from "./ops";
import { WeekReportPanel } from "./week-report";
import { Card } from "./ui";

/**
 * Cierre del día, versión nativa de web/.../tables/caja.tsx: se cuenta la
 * caja de pie tras la barra, se reparten las propinas por horas fichadas y se
 * deja la nota para quien abre mañana.
 */
export default function TablesCaja() {
  const { ops } = useTablesOps();
  return <ProPage>{ops ? <DemoClosing /> : <RealDaySummary />}</ProPage>;
}

/** Sin herramientas de cierre en el espacio: resumen de lo que sí hay. */
function RealDaySummary() {
  const { data, now } = usePro();
  const today = localDate(now);
  const payments = data.payments.filter((p) => localDate(p.at) === today);
  const by = (m: "card" | "cash" | "bizum") =>
    payments.filter((p) => p.method === m).reduce((a, p) => a + p.amountCents, 0);
  const card = cardDay(data.validations, today);
  return (
    <>
      <PageHeader
        eyebrow="Caja"
        title="Caja de hoy"
        description={`${plural(payments.length, "cobro registrado", "cobros registrados")} en Franky hoy.`}
      />
      <KpiRow>
        <Kpi icon={CreditCard} label="Tarjeta" value={money(by("card"))} />
        <Kpi icon={Wallet} label="Efectivo" value={money(by("cash"))} />
        <Kpi label="Bizum" value={money(by("bizum"))} />
        <Kpi icon={ScanLine} label="Franky Card" value={money(card.chargedCents)} hint={plural(card.count, "validación", "validaciones")} />
      </KpiRow>
      {!payments.length ? (
        <Panel>
          <Empty
            icon={Wallet}
            title="Sin cobros en Franky hoy"
            body="Los cobros de tu TPV siguen en tu TPV. Aquí ves los que pasan por Franky."
          />
        </Panel>
      ) : null}
    </>
  );
}

function DemoClosing() {
  const { data, now, vertical } = usePro();
  const { ops, save } = useTablesOps();
  const today = localDate(now);
  const [cash, setCash] = React.useState("");
  const [card, setCard] = React.useState("");
  const [bizum, setBizum] = React.useState("");
  const [float, setFloat] = React.useState("150,00");
  const [expected, setExpected] = React.useState("");
  const [tips, setTips] = React.useState("");
  const [covers, setCovers] = React.useState("");
  const [note, setNote] = React.useState("");
  if (!ops) return null;

  const closed = ops.closings.find((c) => c.date === today);
  const history = [...ops.closings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const cardToday = cardDay(data.validations, today);
  const bonos = bonoSummary(ops, today);
  const pendingList = closingChecklist(ops, today);
  const draft: ProCashClosing = {
    id: "draft",
    date: today,
    closedAt: now.toISOString(),
    cashCents: parseEuros(cash) ?? 0,
    cardCents: parseEuros(card) ?? 0,
    bizumCents: parseEuros(bizum) ?? 0,
    floatCents: parseEuros(float) ?? 0,
    expectedCashCents: parseEuros(expected),
    tipsCents: parseEuros(tips) ?? 0,
  };
  const totals = closingTotals(draft);
  const minutesToday = data.staff.map((s) => ({ staffId: s.id, minutes: workedMinutes(data.shifts, s.id, [today], now) }));
  const tipsCents = closed ? closed.tipsCents : draft.tipsCents;
  const tipsSplit = splitTips(tipsCents, minutesToday).filter((t) => t.minutes > 0);
  const valid = parseEuros(cash) !== null && parseEuros(card) !== null;
  const tableEngine = vertical.id !== "cafe";

  const submit = async () => {
    const closing: ProCashClosing = {
      ...draft,
      id: localId("cl"),
      staffId: data.staff[0]?.id,
      covers: tableEngine && covers ? Number(covers) : undefined,
      nextDayNote: note.trim() || undefined,
    };
    const ok = await save("closing.save", (o) => ({
      ...o,
      closings: [...o.closings.filter((c) => c.date !== today), closing],
    }));
    if (!ok) return;
    toast("Día cerrado", {
      kind: "success",
      body: `${money(closingTotals(closing).totalCents)} en caja${closing.nextDayNote ? ". La nota sale mañana en Hoy." : "."}`,
    });
  };

  const avg = history.slice(0, 7).length
    ? Math.round(history.slice(0, 7).reduce((a, c) => a + closingTotals(c).totalCents, 0) / history.slice(0, 7).length)
    : 0;

  return (
    <>
      <PageHeader
        eyebrow={vertical.id === "restaurant" ? "Caja" : "Cierre"}
        title="Cierre del día"
        description={
          closed
            ? `Cerrado a las ${time(closed.closedAt)} con ${money(closingTotals(closed).totalCents)}.`
            : "Cuenta la caja, reparte las propinas y deja una nota para mañana."
        }
      />

      <KpiRow>
        <Kpi
          icon={ScanLine}
          label="Franky Card hoy"
          value={money(cardToday.chargedCents, { round: true })}
          hint={plural(cardToday.count, "validación", "validaciones")}
        />
        {vertical.id === "cafe" ? (
          <Kpi icon={Coffee} label="Bonos" value={bonos.usedToday} hint={`cafés de bono servidos, ${bonos.soldToday} vendidos`} />
        ) : (
          <Kpi
            label="Ticket medio"
            value={
              history[0]?.covers
                ? money(Math.round(closingTotals(history[0]).totalCents / history[0].covers), { round: true })
                : "Sin datos"
            }
            hint="del último cierre"
          />
        )}
        <Kpi icon={Wallet} label="Media 7 días" value={money(avg, { round: true })} hint="por día" />
        <Kpi
          label="Descuadres"
          value={history.filter((h) => (closingTotals(h).diffCents ?? 0) !== 0).length}
          hint="en los últimos 14 cierres"
        />
      </KpiRow>

      {closed ? (
        <Card>
          <View style={{ alignItems: "center", gap: S.sm, paddingVertical: S.sm }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.success, alignItems: "center", justifyContent: "center" }}>
              <Check size={24} color="#FFFFFF" strokeWidth={2.5} />
            </View>
            <PText v="h2">Hoy ya está cerrado</PText>
            <PText v="small" style={{ textAlign: "center" }}>
              {`${money(closingTotals(closed).totalCents)} en total, propinas ${money(closed.tipsCents)}`}
              {closingTotals(closed).diffCents ? `, descuadre ${money(closingTotals(closed).diffCents ?? 0)}` : ""}
            </PText>
            {closed.nextDayNote ? (
              <View style={{ borderRadius: R.md, backgroundColor: C.input, paddingHorizontal: S.md, paddingVertical: S.sm, marginTop: S.xs }}>
                <PText v="body">{closed.nextDayNote}</PText>
              </View>
            ) : null}
            <View style={{ alignSelf: "stretch", marginTop: S.sm }}>
              <WhatsAppButton
                variant="dark"
                small={false}
                full
                phone={ops.ownerPhone}
                share={!ops.ownerPhone}
                label="Mandar resumen"
                message={closingSummaryMessage({
                  spaceName: data.space.name,
                  closing: closed,
                  closedBy: staffFirstName(data, closed.staffId),
                  card: cardToday,
                  bonosUsed: vertical.id === "cafe" ? bonos.usedToday : undefined,
                  pending: pendingList,
                })}
              />
            </View>
            <PText v="tiny" style={{ textAlign: "center" }}>
              {ops.ownerPhone ? "Se abre WhatsApp con el texto del día para el dueño." : "Elige el chat al que mandar el texto del día."}
            </PText>
          </View>
        </Card>
      ) : (
        <Panel title="Cuenta la caja">
          <View style={{ gap: S.md }}>
            <MoneyField label="Efectivo en el cajón" value={cash} onChange={setCash} hint="Todo, fondo incluido" />
            <MoneyField label="Fondo que dejas para mañana" value={float} onChange={setFloat} />
            <MoneyField label="Tarjeta (datáfono)" value={card} onChange={setCard} />
            <MoneyField label="Bizum" value={bizum} onChange={setBizum} />
            <MoneyField label="Efectivo según el TPV" value={expected} onChange={setExpected} hint="Opcional: para ver el descuadre" />
            <MoneyField label="Bote de propinas" value={tips} onChange={setTips} />
            {tableEngine ? (
              <Field label="Cubiertos del día">
                <Input
                  label="Cubiertos del día"
                  keyboardType="number-pad"
                  value={covers}
                  onChangeText={(t) => setCovers(t.replace(/\D/g, ""))}
                />
              </Field>
            ) : null}
          </View>

          <View style={{ marginTop: S.lg, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
            <Detail label="Ventas en efectivo" value={money(totals.cashSalesCents)} />
            <Detail label="Tarjeta y Bizum" value={money(draft.cardCents + draft.bizumCents)} />
            {totals.diffCents !== null ? (
              <Detail
                label="Descuadre"
                value={
                  <Text
                    style={{ fontFamily: FONT.semibold, fontSize: 15, color: totals.diffCents === 0 ? C.success : C.errorText }}
                    maxFontSizeMultiplier={1.3}
                  >
                    {totals.diffCents === 0 ? "Cuadra" : money(totals.diffCents)}
                  </Text>
                }
              />
            ) : null}
            <Detail
              last
              label="Total del día"
              value={
                <Text style={{ fontFamily: FONT.display, fontSize: 24, letterSpacing: -0.5, color: C.text }} maxFontSizeMultiplier={1.2}>
                  {money(totals.totalCents)}
                </Text>
              }
            />
          </View>

          <View style={{ marginTop: S.lg }}>
            <Field label="Nota para mañana" hint="Sale arriba en Hoy al abrir.">
              <Input
                label="Nota para mañana"
                multiline
                value={note}
                onChangeText={setNote}
                placeholder="Falta leche de avena, el grifo 2 pierde..."
              />
            </Field>
          </View>
          <PButton label="Cerrar el día" full disabled={!valid} onPress={submit} style={{ marginTop: S.lg, minHeight: 52 }} />
        </Panel>
      )}

      <Panel title="Antes de irte" flush>
        <PendingRow
          icon={Thermometer}
          section="appcc"
          done={pendingList.haccpPending === 0}
          label={pendingList.haccpPending ? `APPCC del cierre: faltan ${pendingList.haccpPending}` : "APPCC del cierre hecho"}
        />
        <PendingRow
          icon={Recycle}
          section="appcc"
          done={pendingList.wasteLogged}
          label={pendingList.wasteLogged ? "Sobras apuntadas" : "Apunta las sobras del día"}
        />
        <PendingRow
          icon={ShoppingBasket}
          section="compras"
          last
          done={pendingList.shoppingLines === 0}
          label={
            pendingList.shoppingLines
              ? `${plural(pendingList.shoppingLines, "cosa", "cosas")} en la lista de la compra`
              : "Lista de la compra enviada"
          }
        />
      </Panel>

      <Panel title="Reparto de propinas" description="Según las horas fichadas hoy.">
        {tipsCents > 0 && tipsSplit.length ? (
          <View style={{ gap: S.sm }}>
            {tipsSplit.map((t) => {
              const person = data.staff.find((s) => s.id === t.staffId);
              return (
                <View key={t.staffId} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <PAvatar name={person?.name ?? "?"} toneKey={person?.tone} size={28} />
                  <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
                    {person?.name.split(" ")[0] ?? "Equipo"}
                  </PText>
                  <PText v="tiny">{durationLabel(t.minutes)}</PText>
                  <PText v="h3" style={{ minWidth: 64, textAlign: "right" }}>
                    {money(t.cents)}
                  </PText>
                </View>
              );
            })}
          </View>
        ) : tipsCents > 0 ? (
          <PText v="small">Nadie ha fichado hoy: el reparto sale cuando haya fichajes.</PText>
        ) : (
          <PText v="small">Escribe el bote y verás cuánto le toca a cada uno.</PText>
        )}
      </Panel>

      <WeekReportPanel />

      <Panel title="Últimos cierres" flush>
        {history.length ? (
          history.map((c, i) => {
            const t = closingTotals(c);
            return (
              <ListRow key={c.id} last={i === history.length - 1}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3">{shortDay(`${c.date}T12:00:00Z`)}</PText>
                  <PText v="tiny">
                    {`${staffFirstName(data, c.staffId)}, tarjeta ${money(c.cardCents, { round: true })}, propinas ${money(c.tipsCents)}`}
                  </PText>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <PText v="h3">{money(t.totalCents, { round: true })}</PText>
                  {t.diffCents ? <Pill tone="danger" label={money(t.diffCents)} /> : <PText v="tiny">Cuadra</PText>}
                </View>
              </ListRow>
            );
          })
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Aún no has cerrado ningún día.</PText>
          </View>
        )}
      </Panel>

      <Tip title="Cuadra en un minuto">
        Cuenta el cajón entero y di cuánto fondo dejas. Si apuntas lo que marca tu TPV en efectivo, Franky te dice si falta o sobra.
      </Tip>
      {vertical.id === "cafe" && bonos.activeBonos ? (
        <PText v="tiny">
          {`Tienes ${plural(bonos.pendingUses, "café de bono", "cafés de bono")} ya cobrados por servir (${money(bonos.pendingValueCents, { round: true })}).`}
        </PText>
      ) : null}
    </>
  );
}
