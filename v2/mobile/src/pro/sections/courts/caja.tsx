import React from "react";
import { View } from "react-native";
import { Banknote, CreditCard, Lock, Smartphone, Wallet } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, S } from "@/theme";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProPayment } from "../../../../../shared/pro/types";
import { addDays, localDate, money, plural, shortDay, time } from "../../../../../shared/pro/format";
import { courtsOps } from "../../../../../shared/pro/courts-base";
import { cashSummary, closeCash } from "../../../../../shared/pro/courts-desk";
import { cashCheck } from "../../../../../shared/pro/courts-admin";
import {
  ChoiceGrid,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  Meter,
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Sheet,
  StepNav,
} from "../../kit";

/**
 * Caja del día (versión nativa de web courts/caja.tsx): lo cobrado por
 * método y por concepto y el cierre con lo contado en efectivo.
 */

const METHOD_LABEL: Record<ProPayment["method"], string> = { card: "Tarjeta", cash: "Efectivo", bizum: "Bizum" };
const METHOD_ICON = { card: CreditCard, cash: Banknote, bizum: Smartphone } as const;

/** Euros escritos a mano ("12,50") a céntimos. */
function parseEuros(text: string): number | null {
  const clean = text.replace(/\s|€/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export default function Caja() {
  const { data, demo, now } = usePro();
  const today = localDate(now);
  const [date, setDate] = React.useState(today);
  const [closing, setClosing] = React.useState(false);

  if (!demo && !data.courts)
    return (
      <ProPage>
        <PageHeader eyebrow="Caja" title="Caja del día" />
        <Panel>
          <Empty icon={Wallet} title="Cierra la caja en un minuto" body="Lo cobrado por tarjeta, efectivo y Bizum, separado por pistas, bonos, clases y mostrador, con el descuadre al contar." />
        </Panel>
      </ProPage>
    );

  const summary = cashSummary(data, date);
  const closed = courtsOps(data).cashClosings.find((c) => c.date === date);
  const isToday = date === today;

  return (
    <ProPage>
      <PageHeader
        eyebrow="Caja"
        title={isToday ? "Caja de hoy" : shortDay(`${date}T12:00:00Z`).replace(/\./g, "")}
        description={
          summary.payments.length
            ? `${isToday ? "Has cobrado" : "Se cobraron"} ${money(summary.total)} en ${plural(summary.payments.length, "cobro", "cobros")}.`
            : isToday
              ? "Aún no hay cobros hoy."
              : "Ese día no hubo cobros."
        }
        actions={
          closed ? (
            <Pill label={`Cerrada a las ${time(closed.at)}`} tone="success" icon={Lock} />
          ) : (
            <PButton label="Cerrar caja" icon={Lock} onPress={() => setClosing(true)} />
          )
        }
      />
      <StepNav
        onPrev={() => setDate(addDays(date, -1))}
        onNext={() => setDate(addDays(date, 1) > today ? today : addDays(date, 1))}
        onToday={() => setDate(today)}
        isToday={isToday}
      />
      <KpiRow>
        <Kpi label="Total" value={money(summary.total, { round: true })} emphasis />
        {(Object.keys(METHOD_LABEL) as ProPayment["method"][]).map((m) => (
          <Kpi key={m} label={METHOD_LABEL[m]} value={money(summary.byMethod[m], { round: true })} icon={METHOD_ICON[m]} />
        ))}
      </KpiRow>

      {summary.byCategory.length ? (
        <Panel title="Por concepto">
          <View style={{ gap: S.md }}>
            {summary.byCategory.map((c) => (
              <View key={c.category} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <PText v="h3">{c.category}</PText>
                  <PText v="small">
                    {money(c.cents)} ({c.count})
                  </PText>
                </View>
                <Meter value={c.cents} max={Math.max(1, summary.total)} />
              </View>
            ))}
          </View>
        </Panel>
      ) : null}

      <Panel title="Cobros" flush>
        {summary.payments.length ? (
          summary.payments.slice(0, 40).map((p, i, list) => (
            <ListRow key={p.id} last={i === list.length - 1}>
              <PAvatar name={p.clientName} size={32} />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{p.clientName}</PText>
                <PText v="tiny" numberOfLines={1}>
                  {time(p.at)}, {p.concept}
                </PText>
              </View>
              <PText v="h3">{money(p.amountCents + p.tipCents)}</PText>
            </ListRow>
          ))
        ) : (
          <Empty icon={Wallet} title="Sin cobros" body="Cada reserva, bono o venta del mostrador que cobres aparece aquí al momento." />
        )}
      </Panel>

      {closed ? (
        <Panel title="Cierre">
          <PText v="small">
            Efectivo esperado {money(closed.expectedCashCents)}, contado {money(closed.countedCashCents)}.{" "}
            {closed.countedCashCents === closed.expectedCashCents
              ? "Cuadra."
              : `${closed.countedCashCents > closed.expectedCashCents ? "Sobran" : "Faltan"} ${money(Math.abs(closed.countedCashCents - closed.expectedCashCents))}.`}
          </PText>
        </Panel>
      ) : null}

      <CloseSheet open={closing} date={date} onClose={() => setClosing(false)} />
    </ProPage>
  );
}

function CloseSheet({ open, date, onClose }: { open: boolean; date: string; onClose: () => void }) {
  const { data, update, now, pending } = usePro();
  const people = [...new Set([data.space.owner.name, ...data.staff.map((s) => s.name)])].slice(0, 6);
  const [counted, setCounted] = React.useState("");
  const [float, setFloat] = React.useState("0");
  const [by, setBy] = React.useState(people[0] ?? "");

  React.useEffect(() => {
    if (!open) return;
    setCounted("");
    setFloat("0");
    setBy(people[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countedCents = parseEuros(counted);
  const floatCents = parseEuros(float) ?? 0;
  const check = countedCents === null ? null : cashCheck(data, date, countedCents, floatCents);

  const save = async () => {
    if (countedCents === null) return;
    const ok = await update("court.cash.close", (d) =>
      closeCash(d, { id: localId("cc"), date, at: now.toISOString(), countedCashCents: countedCents - floatCents, by }),
    );
    if (ok) {
      toast(
        "Caja cerrada",
        check && check.status !== "ok" ? `${check.diffCents > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(check.diffCents))} en efectivo.` : "El efectivo cuadra.",
      );
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cerrar caja"
      description={`Deberías tener ${money(cashSummary(data, date).byMethod.cash + floatCents)} en efectivo.`}
      footer={<PButton label="Cerrar caja" full onPress={() => void save()} disabled={countedCents === null || !by || pending} />}
    >
      <View style={{ gap: S.lg }}>
        <Field label="Efectivo contado (€)">
          <Input value={counted} onChangeText={setCounted} keyboardType="decimal-pad" placeholder="0,00" />
        </Field>
        <Field label="Cambio al abrir (€)">
          <Input value={float} onChangeText={setFloat} keyboardType="decimal-pad" />
        </Field>
        {check ? (
          <PText v="h3" color={check.status === "ok" ? C.success : C.warning}>
            {check.status === "ok" ? "Cuadra." : `${check.diffCents > 0 ? "Sobran" : "Faltan"} ${money(Math.abs(check.diffCents))}.`}
          </PText>
        ) : null}
        <Field label="Quién cierra">
          <ChoiceGrid value={by} onChange={setBy} options={people.map((p) => ({ value: p, label: p.split(" ")[0] }))} />
        </Field>
      </View>
    </Sheet>
  );
}
