import React from "react";
import { View } from "react-native";
import { Banknote, CreditCard, Lock, Smartphone, Wallet, type LucideIcon } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProPayment } from "../../../../../shared/pro/types";
import { addDays, capitalize, dayLabel, localDate, money, time } from "../../../../../shared/pro/format";
import { bookingsOn } from "../../../../../shared/pro/agenda";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, PAvatar, PButton, PText, PageHeader, Panel, Pill, Sheet, StatusPill, StepNav, Tip } from "../../kit";
import { BookingDrawer } from "./booking-drawers";

const METHOD: Record<ProPayment["method"], { label: string; icon: LucideIcon }> = {
  card: { label: "Tarjeta", icon: CreditCard },
  cash: { label: "Efectivo", icon: Banknote },
  bizum: { label: "Bizum", icon: Smartphone },
};

/** Los cobros de un día largo se enseñan por tandas. */
const PAGE = 40;

export default function CajaSection() {
  const { data, now, demo, can, loadDate, pending: saving } = usePro();
  const today = localDate(now);
  const [date, setDate] = React.useState(today);
  const [charging, setCharging] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState(false);
  const [closed, setClosed] = React.useState<Record<string, boolean>>({});
  const [counted, setCounted] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);

  React.useEffect(() => {
    if (!demo) void loadDate(date);
    setLimit(PAGE);
  }, [date, demo, loadDate]);

  const payments = data.payments.filter((p) => localDate(p.at) === date).sort((a, b) => b.at.localeCompare(a.at));
  const sum = (m?: ProPayment["method"]) => payments.filter((p) => !m || p.method === m).reduce((a, p) => a + p.amountCents, 0);
  const tips = payments.reduce((a, p) => a + p.tipCents, 0);
  const pending = bookingsOn(data, date).filter((b) => b.status === "arrived" || b.status === "in_service");
  const cash = sum("cash") + payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.tipCents, 0);
  const countedCents = Math.round(Number(counted.replace(",", ".")) * 100);
  const diff = counted ? countedCents - cash : 0;

  const byStaff = data.staff
    .map((s) => {
      const own = payments.filter((p) => p.staffId === s.id);
      const billed = own.reduce((a, p) => a + p.amountCents, 0);
      return { s, billed, tips: own.reduce((a, p) => a + p.tipCents, 0), commission: Math.round((billed * s.commissionPct) / 100), count: own.length };
    })
    .filter((x) => x.count > 0);

  if (!demo && !can("finance.read")) {
    return (
      <ProPage>
        <Empty icon={Wallet} title="Caja no está disponible para tu cuenta" body="Pide al responsable del negocio acceso a la información económica." />
      </ProPage>
    );
  }

  const title = capitalize(dayLabel(`${date}T12:00:00Z`));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Caja"
        title={title}
        description={`${payments.length} cobros por ${money(sum() + tips)}${pending.length ? ` y ${pending.length} por cobrar ahora` : ""}.`}
        actions={
          demo ? (
            closed[date] ? (
              <Pill tone="success" icon={Lock} label="Caja cerrada" />
            ) : (
              <PButton
                label="Cerrar caja"
                icon={Lock}
                disabled={!payments.length}
                onPress={() => {
                  setCounted("");
                  setClosing(true);
                }}
              />
            )
          ) : undefined
        }
      >
        <StepNav onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} onToday={() => setDate(today)} isToday={date === today} />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Wallet} label={demo ? "Total cobrado" : "Cobros registrados"} value={money(sum(), { round: true })} hint={`${money(tips)} de propinas`} emphasis />
        <Kpi icon={CreditCard} label="Tarjeta" value={money(sum("card"), { round: true })} />
        <Kpi icon={Banknote} label="Efectivo" value={money(sum("cash"), { round: true })} />
        <Kpi icon={Smartphone} label="Bizum" value={money(sum("bizum"), { round: true })} />
      </KpiRow>

      {pending.length ? (
        <Panel title="Por cobrar" description="Clientes que están ahora en el local." flush>
          {pending.map((b, i) => {
            const canCharge = !saving && can("booking.charge");
            return (
              <ListRow
                key={b.id}
                onPress={canCharge ? () => setCharging(b.id) : undefined}
                accessibilityLabel={`Cobrar a ${b.clientName}`}
                last={i === pending.length - 1}
              >
                <PAvatar name={b.clientName} size={34} />
                <View style={{ flex: 1 }}>
                  <PText v="h3" numberOfLines={1}>{b.clientName}</PText>
                  <PText v="tiny" numberOfLines={1}>{data.services.find((s) => s.id === b.serviceId)?.name ?? ""}</PText>
                </View>
                <StatusPill status={b.status} />
                <PText v="h3" style={{ minWidth: 60, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                  {b.paidCents === null ? "Sin datos" : money(Math.max(0, b.priceCents - b.paidCents))}
                </PText>
              </ListRow>
            );
          })}
        </Panel>
      ) : null}

      <Panel title="Cobros del día" flush>
        {payments.length ? (
          <>
            {payments.slice(0, limit).map((p, i, list) => {
              const M = METHOD[p.method];
              return (
                <ListRow key={p.id} last={i === list.length - 1 && payments.length <= limit}>
                  <PText v="small" style={{ width: 44, fontVariant: ["tabular-nums"] }}>{time(p.at)}</PText>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{p.clientName}</PText>
                    <PText v="tiny" numberOfLines={1}>{p.concept}</PText>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <M.icon size={12} color={C.muted} />
                      <PText v="tiny">{M.label}</PText>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{money(p.amountCents)}</PText>
                    {p.tipCents ? <PText v="tiny" style={{ fontVariant: ["tabular-nums"] }}>{`+${money(p.tipCents)} propina`}</PText> : null}
                  </View>
                </ListRow>
              );
            })}
            {payments.length > limit ? (
              <View style={{ padding: S.md, alignItems: "center" }}>
                <PButton label={`Ver más (${payments.length - limit})`} variant="outline" small onPress={() => setLimit((l) => l + PAGE)} />
              </View>
            ) : null}
          </>
        ) : (
          <Empty icon={Wallet} title="Sin cobros este día" body="Al marcar una cita como cobrada aparece aquí con su método de pago." />
        )}
      </Panel>

      <Panel title="Por profesional" description={demo ? "Facturado, propinas y comisión del día." : "Cobros y propinas registrados en el día."} flush>
        {byStaff.length ? (
          byStaff.map(({ s, billed, tips: t, commission, count }, i) => (
            <ListRow key={s.id} last={i === byStaff.length - 1}>
              <PAvatar name={s.name} toneKey={s.tone} size={34} />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{s.name.split(" ")[0]}</PText>
                <PText v="tiny">{`${count} cobros${t ? ` · ${money(t)} propinas` : ""}`}</PText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <PText v="h3" style={{ fontVariant: ["tabular-nums"] }}>{money(billed)}</PText>
                {demo && s.commissionPct ? <PText v="tiny" style={{ fontVariant: ["tabular-nums"] }}>{`${money(commission)} comisión`}</PText> : null}
              </View>
            </ListRow>
          ))
        ) : (
          <PText v="small" style={{ paddingHorizontal: S.lg, paddingVertical: S.xl }}>Aún no hay cobros por profesional.</PText>
        )}
      </Panel>

      <Tip title="Cobros registrados en tu local">Anota lo que ya has cobrado con tarjeta, efectivo o Bizum para llevar el control de tu día.</Tip>

      <BookingDrawer bookingId={charging} onClose={() => setCharging(null)} />
      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title="Cerrar caja"
        description={title}
        footer={
          <>
            <PButton label="Cancelar" variant="ghost" onPress={() => setClosing(false)} />
            <PButton
              label="Cerrar caja"
              onPress={() => {
                setClosed((c) => ({ ...c, [date]: true }));
                setClosing(false);
                toast("Caja cerrada", {
                  kind: "success",
                  body: diff === 0 ? "Cuadra al céntimo." : `Descuadre de ${money(Math.abs(diff))} ${diff > 0 ? "de más" : "de menos"}.`,
                });
              }}
            />
          </>
        }
      >
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
          <Detail label="Tarjeta" value={money(sum("card"))} />
          <Detail label="Bizum" value={money(sum("bizum"))} />
          <Detail label="Efectivo esperado (con propinas)" value={money(cash)} />
          <Detail label="Total" value={money(sum() + tips)} last />
        </View>
        <Field label="Efectivo contado (€)" hint="Cuenta el cajón y escríbelo. Te decimos si cuadra.">
          <Input
            value={counted}
            onChangeText={setCounted}
            keyboardType="decimal-pad"
            label="Efectivo contado en euros"
            placeholder={(cash / 100).toFixed(2).replace(".", ",")}
          />
        </Field>
        {counted ? (
          <PText v="h3" color={diff === 0 ? C.success : C.errorText}>
            {diff === 0 ? "Cuadra." : `Diferencia: ${diff > 0 ? "+" : "-"}${money(Math.abs(diff))}`}
          </PText>
        ) : null}
      </Sheet>
    </ProPage>
  );
}
