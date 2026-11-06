import React from "react";
import { Text, View } from "react-native";
import { BellRing, Cake, Check, Clock, Gauge, Plus, ShoppingBag } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { Allergen } from "../../../../../shared/pro/types";
import type { ProOrderLine, ProPickupOrder } from "../../../../../shared/pro/tables-types";
import {
  ORDER_STATUS_LABEL,
  orderReadyMessage,
  orderReminderMessage,
  orderTotal,
  ordersBySlot,
  ordersOn,
  ordersToRemind,
} from "../../../../../shared/pro/tables-ops";
import { nextPickupSlot, pickupPeak, pickupSlots } from "../../../../../shared/pro/tables-insights";
import { ALLERGENS } from "../../../../../shared/pro/tables";
import {
  addDays,
  atLocal,
  capitalize,
  dayLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  plural,
  time,
} from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  DayChips,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  MultiChips,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  Segmented,
  Sheet,
  Stepper,
  Tip,
  TimeStepper,
} from "../../kit";
import { AllergenCodes, StudentMark } from "./table-kit";
import { MoneyField, OpsMissing, SoftNote, WhatsAppButton, parseEuros, useTablesOps } from "./ops";
import { Card } from "./ui";

/**
 * Pedidos para recoger y encargos, versión nativa de web/.../tables/pedidos.tsx.
 * Por hora de recogida, con el aviso de "listo" por WhatsApp y el límite de
 * pedidos que la barra saca cada 10 minutos.
 */

type Tab = "hoy" | "encargos";

export default function TablesPedidos() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  const [tab, setTab] = React.useState<Tab>("hoy");
  const [creating, setCreating] = React.useState<ProPickupOrder["kind"] | null>(null);
  if (!ops) {
    return (
      <ProPage>
        <PageHeader eyebrow="Pedidos" title="Para recoger" />
        <OpsMissing icon={ShoppingBag} title="Sin pedidos todavía" />
      </ProPage>
    );
  }
  const today = localDate(now);
  const todays = ordersOn(ops, today, "pickup");
  const open = todays.filter((o) => o.status !== "collected" && o.status !== "cancelled");
  const next = open.find((o) => Date.parse(o.pickupAt) >= now.getTime() - 10 * 60_000);
  const encargos = ops.orders
    .filter((o) => o.kind === "encargo" && o.status !== "collected" && o.status !== "cancelled")
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const remind = ordersToRemind(ops, today);
  const collected = todays.filter((o) => o.status === "collected");
  const collectedCents = collected.reduce((a, o) => a + orderTotal(o), 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Pedidos"
        title={tab === "hoy" ? "Para recoger hoy" : "Encargos"}
        description={
          tab === "hoy"
            ? open.length
              ? `${plural(open.length, "pedido pendiente", "pedidos pendientes")}.${next ? ` El siguiente, ${next.clientName.split(" ")[0]} a las ${time(next.pickupAt)}.` : ""}`
              : "No hay pedidos pendientes. Los que te hagan desde Franky aparecen aquí por hora de recogida."
            : `${plural(encargos.length, "encargo", "encargos")} por entregar.${remind.length ? ` Recuerda ${plural(remind.length, "el de mañana", "los de mañana")}.` : ""}`
        }
        actions={
          <PButton
            label={tab === "hoy" ? "Nuevo pedido" : "Nuevo encargo"}
            icon={Plus}
            onPress={() => setCreating(tab === "hoy" ? "pickup" : "encargo")}
          />
        }
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "hoy", label: "Hoy", count: open.length },
            { value: "encargos", label: "Encargos", count: encargos.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={ShoppingBag} label="Pendientes hoy" value={open.length} emphasis={open.length > 0} />
        <Kpi icon={Check} label="Recogidos hoy" value={collected.length} hint={money(collectedCents)} />
        <Kpi
          icon={Cake}
          label="Encargos"
          value={encargos.length}
          hint={encargos[0] ? `el próximo ${dayLabel(encargos[0].pickupAt, { weekday: false })}` : "ninguno"}
          onPress={tab === "hoy" ? () => setTab("encargos") : undefined}
        />
        <Kpi icon={BellRing} label="Por recordar" value={remind.length} hint="recogen mañana" />
      </KpiRow>

      {tab === "hoy" ? <TodayOrders /> : <Encargos />}

      <OrderSheet kind={creating} onClose={() => setCreating(null)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Hoy                                                                  */
/* ------------------------------------------------------------------ */

function TodayOrders() {
  const { now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const todays = ordersOn(ops, today, "pickup");
  const open = todays.filter((o) => o.status !== "collected" && o.status !== "cancelled");
  const done = todays.filter((o) => o.status === "collected");
  const slots = ordersBySlot(open);
  const nowMin = localMinutes(now);

  return (
    <>
      <BarLoadPanel />
      {slots.length ? (
        slots.map(({ minute, orders }) => (
          <View key={minute} style={{ flexDirection: "row", gap: S.md, marginBottom: S.md }}>
            <View style={{ width: 52, alignItems: "flex-end", paddingTop: S.md }}>
              <Text
                style={{ fontFamily: FONT.heading, fontSize: 15, color: minute <= nowMin ? C.blue : C.text }}
                maxFontSizeMultiplier={1.2}
              >
                {minutesToLabel(minute)}
              </Text>
              {minute <= nowMin ? (
                <Text style={{ fontFamily: FONT.semibold, fontSize: 11, color: C.blue }} maxFontSizeMultiplier={1.2}>
                  Ahora
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: S.sm, borderLeftWidth: 1, borderLeftColor: C.borderLight, paddingLeft: S.md }}>
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </View>
          </View>
        ))
      ) : (
        <Panel>
          <Empty
            icon={ShoppingBag}
            title="Nada por preparar"
            body="Cuando un estudiante pida desde Franky antes de clase, el pedido llega aquí con su hora de recogida."
          />
        </Panel>
      )}

      <Panel title="Ya recogidos" flush>
        {done.length ? (
          done.map((o, i) => (
            <ListRow key={o.id} last={i === done.length - 1}>
              <PText v="small" style={{ width: 46 }}>
                {time(o.pickupAt)}
              </PText>
              <PText v="h3" numberOfLines={1} style={{ flex: 1 }}>
                {o.clientName}
              </PText>
              <PText v="body">{money(orderTotal(o))}</PText>
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">Aún no ha recogido nadie.</PText>
          </View>
        )}
      </Panel>
      <Tip title="Se paga al recoger">
        El pedido se cobra en barra, en tu TPV, cuando vienen a por él. Al tocar Listo se abre WhatsApp con el aviso ya escrito.
      </Tip>
    </>
  );
}

/**
 * Cuántos pedidos lleva cada franja de 10 minutos de la próxima hora y el
 * límite que aguanta la barra en la punta.
 */
function BarLoadPanel() {
  const { now } = usePro();
  const { ops, save } = useTablesOps();
  const [editing, setEditing] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const slots = pickupSlots(ops, today, nowMin, nowMin + 60);
  const peak = pickupPeak(ops, today);
  const capacity = ops.pickupCapacity ?? 0;
  const max = Math.max(capacity, ...slots.map((s) => s.count), 1);

  return (
    <Panel
      title="Barra, próxima hora"
      description={
        capacity
          ? `Hasta ${plural(capacity, "pedido", "pedidos")} cada 10 minutos.${peak ? ` Punta de hoy: ${minutesToLabel(peak.minute)} con ${peak.count}.` : ""}`
          : "Sin límite por franja: cualquiera puede elegir cualquier hora."
      }
      action={<PButton label={editing ? "Hecho" : "Límite"} icon={Gauge} variant="outline" small onPress={() => setEditing((v) => !v)} />}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 76 }}>
        {slots.map((s) => (
          <View key={s.minute} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
            <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: s.full ? C.errorText : C.muted }} maxFontSizeMultiplier={1.2}>
              {s.count}
            </Text>
            <View
              style={{
                width: "100%",
                height: `${Math.max(6, (s.count / max) * 70)}%`,
                borderRadius: 5,
                backgroundColor: s.full ? C.error : s.count ? C.blue : C.input,
              }}
            />
            <Text style={{ fontSize: 10, color: C.muted }} maxFontSizeMultiplier={1.2} numberOfLines={1}>
              {minutesToLabel(s.minute)}
            </Text>
          </View>
        ))}
      </View>
      {editing ? (
        <View style={{ marginTop: S.lg, gap: S.sm }}>
          <PText v="h3">Pedidos cada 10 minutos</PText>
          <Stepper
            label="Pedidos cada 10 minutos"
            value={capacity}
            min={0}
            max={20}
            format={(v) => (v ? String(v) : "Sin límite")}
            onChange={(v) => void save("pickup.capacity", (o) => ({ ...o, pickupCapacity: v || undefined }))}
          />
          <PText v="tiny">
            Con la franja llena, a quien pide desde Franky se le ofrece la siguiente con sitio.
          </PText>
        </View>
      ) : null}
    </Panel>
  );
}

function OrderCard({ order }: { order: ProPickupOrder }) {
  const { data } = usePro();
  const { save } = useTablesOps();
  const set = async (status: ProPickupOrder["status"], extra: Partial<ProPickupOrder> = {}) =>
    save(`order.${status}`, (o) => ({
      ...o,
      orders: o.orders.map((x) => (x.id === order.id ? { ...x, status, ...extra } : x)),
    }));

  return (
    <Card style={{ marginBottom: 0, padding: S.md }} highlight={order.status === "ready" ? C.success : undefined}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {order.clientName}
            </PText>
            {order.student ? <StudentMark /> : null}
          </View>
          <PText v="tiny">{`Recoge a las ${time(order.pickupAt)}, ${money(orderTotal(order))}`}</PText>
        </View>
        <Pill
          label={ORDER_STATUS_LABEL[order.status]}
          tone={order.status === "ready" ? "success" : order.status === "preparing" ? "info" : "violet"}
        />
      </View>
      <View style={{ marginTop: S.sm, gap: 2 }}>
        {order.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row", gap: S.sm }}>
            <Text style={{ width: 22, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
              {l.qty}
            </Text>
            <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
              {l.name}
            </PText>
          </View>
        ))}
      </View>
      {order.note ? (
        <View style={{ marginTop: S.sm }}>
          <SoftNote>{order.note}</SoftNote>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.md }}>
        {order.status === "new" ? (
          <PButton label="Preparando" variant="outline" small onPress={() => void set("preparing")} />
        ) : null}
        {order.status !== "ready" ? (
          order.phone ? (
            <WhatsAppButton
              variant="dark"
              phone={order.phone}
              label="Listo, avisar"
              message={orderReadyMessage(order, data.space.name)}
              onOpen={() => void set("ready", { readyAt: new Date().toISOString() })}
            />
          ) : (
            <PButton
              label="Marcar listo"
              variant="dark"
              small
              onPress={() => void set("ready", { readyAt: new Date().toISOString() })}
            />
          )
        ) : (
          <PButton
            label="Recogido"
            icon={Check}
            variant="dark"
            small
            onPress={async () => {
              if (await set("collected")) toast("Recogido", { kind: "success", body: order.clientName });
            }}
          />
        )}
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Encargos                                                             */
/* ------------------------------------------------------------------ */

function Encargos() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const tomorrow = addDays(today, 1);
  const upcoming = ops.orders
    .filter((o) => o.kind === "encargo" && o.status !== "cancelled" && o.status !== "collected")
    .sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
  const byDay = [...new Set(upcoming.map((o) => localDate(o.pickupAt)))];
  const mark = (id: string, patch: Partial<ProPickupOrder>, label: string) =>
    save(label, (x) => ({ ...x, orders: x.orders.map((y) => (y.id === id ? { ...y, ...patch } : y)) }));

  if (!byDay.length) {
    return (
      <>
        <Panel>
          <Empty
            icon={Cake}
            title="Sin encargos"
            body="Tartas, bandejas o termos de café para una clase. Apúntalos con su fecha y te recordamos avisar al cliente el día antes."
          />
        </Panel>
        <Tip title="Adiós a la libreta">
          Con la fecha, los alérgenos y la señal apuntados, cualquiera del equipo sabe qué hay que preparar y para cuándo.
        </Tip>
      </>
    );
  }

  return (
    <>
      {byDay.map((date) => {
        const list = upcoming.filter((o) => localDate(o.pickupAt) === date);
        return (
          <Panel
            key={date}
            title={date === today ? "Hoy" : date === tomorrow ? "Mañana" : capitalize(dayLabel(`${date}T12:00:00Z`))}
            flush
          >
            {list.map((o, i) => (
              <View
                key={o.id}
                style={{
                  paddingHorizontal: S.lg,
                  paddingVertical: S.md,
                  gap: S.sm,
                  borderBottomWidth: i === list.length - 1 ? 0 : 1,
                  borderBottomColor: C.borderLight,
                }}
              >
                <View style={{ flexDirection: "row", gap: S.md }}>
                  <Text style={{ width: 44, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>
                    {time(o.pickupAt)}
                  </Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <PText v="h3" numberOfLines={1}>
                      {o.clientName}
                    </PText>
                    <PText v="body" color={C.muted}>
                      {o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}
                    </PText>
                    {o.note ? <PText v="tiny">{o.note}</PText> : null}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
                      {o.allergens?.length ? <AllergenCodes list={o.allergens} /> : null}
                      <PText v="tiny">
                        {`${money(orderTotal(o))}${o.depositCents ? `, señal ${money(o.depositCents)} cobrada` : ", sin señal"}`}
                      </PText>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, paddingLeft: 44 + S.md }}>
                  {date === tomorrow ? (
                    o.remindedAt ? (
                      <Pill tone="success" label="Recordado" />
                    ) : (
                      <WhatsAppButton
                        phone={o.phone}
                        label="Recordar"
                        message={orderReminderMessage(o, data.space.name)}
                        onOpen={() => void mark(o.id, { remindedAt: new Date().toISOString() }, "order.remind")}
                      />
                    )
                  ) : null}
                  {o.status !== "ready" ? (
                    <PButton label="Listo" variant="outline" small onPress={() => void mark(o.id, { status: "ready" }, "order.ready")} />
                  ) : null}
                  <PButton
                    label="Entregado"
                    variant="ghost"
                    small
                    onPress={async () => {
                      if (await mark(o.id, { status: "collected" }, "order.collected"))
                        toast("Entregado", { kind: "success", body: o.clientName });
                    }}
                  />
                </View>
              </View>
            ))}
          </Panel>
        );
      })}
      <Tip title="Adiós a la libreta">
        Con la fecha, los alérgenos y la señal apuntados, cualquiera del equipo sabe qué hay que preparar y para cuándo.
      </Tip>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo pedido o encargo                                               */
/* ------------------------------------------------------------------ */

function OrderSheet({ kind, onClose }: { kind: ProPickupOrder["kind"] | null; onClose: () => void }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const today = localDate(now);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [minute, setMinute] = React.useState(10 * 60);
  const [qty, setQty] = React.useState<Record<string, number>>({});
  const [custom, setCustom] = React.useState("");
  const [customPrice, setCustomPrice] = React.useState("");
  const [allergens, setAllergens] = React.useState<Allergen[]>([]);
  const [deposit, setDeposit] = React.useState("");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    if (!kind) return;
    const next = Math.ceil((localMinutes(now) + 20) / 5) * 5;
    setName("");
    setPhone("");
    setDate(kind === "encargo" ? addDays(today, 2) : today);
    setMinute(kind === "encargo" ? 11 * 60 : Math.min(next, 23 * 60));
    setQty({});
    setCustom("");
    setCustomPrice("");
    setAllergens([]);
    setDeposit("");
    setNote("");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const products = data.menu.filter((m) => m.available);
  const lines: ProOrderLine[] = [
    ...products.filter((m) => qty[m.id]).map((m) => ({ name: m.name, qty: qty[m.id], priceCents: m.priceCents })),
    ...(custom.trim() ? [{ name: custom.trim(), qty: 1, priceCents: parseEuros(customPrice) ?? 0 }] : []),
  ];
  // Los alérgenos del pedido salen solos de los productos de la carta.
  const inherited = [...new Set(products.filter((m) => qty[m.id]).flatMap((m) => m.allergens))];
  const valid = name.trim().length > 1 && lines.length > 0;
  const total = lines.reduce((a, l) => a + l.qty * l.priceCents, 0);

  // Franja llena: se propone la siguiente con sitio (solo pedidos de hoy).
  const slotFull =
    kind === "pickup" && ops ? pickupSlots(ops, date, minute, minute + 1)[0]?.full ?? false : false;
  const nextFree = slotFull && ops ? nextPickupSlot(ops, date, minute) : null;

  const submit = async () => {
    if (!kind) return;
    const order: ProPickupOrder = {
      id: localId(kind === "encargo" ? "en" : "or"),
      kind,
      clientName: name.trim(),
      phone: phone.trim() || undefined,
      lines,
      pickupAt: atLocal(date, minute),
      status: "new",
      note: note.trim() || undefined,
      allergens: [...new Set([...inherited, ...allergens])],
      depositCents: kind === "encargo" ? parseEuros(deposit) ?? 0 : undefined,
      createdAt: now.toISOString(),
      source: "walkin",
    };
    if (!(await save("order.create", (o) => ({ ...o, orders: [...o.orders, order] })))) return;
    toast(kind === "encargo" ? "Encargo apuntado" : "Pedido apuntado", {
      kind: "success",
      body: `${order.clientName}, ${date === today ? "hoy" : dayLabel(order.pickupAt)} a las ${minutesToLabel(minute)}.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={kind !== null}
      onClose={onClose}
      title={kind === "encargo" ? "Nuevo encargo" : "Nuevo pedido para recoger"}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Guardar${lines.length ? `, ${money(total)}` : ""}`} disabled={!valid} onPress={submit} />
        </>
      }
    >
      <Field label="Nombre">
        <Input label="Nombre" value={name} onChangeText={setName} autoCapitalize="words" />
      </Field>
      <Field label="WhatsApp" hint="Para avisar cuando esté listo.">
        <Input label="WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" />
      </Field>
      {kind === "encargo" ? (
        <Field label="Día">
          <DayChips value={date} onChange={setDate} today={today} days={21} />
        </Field>
      ) : null}
      <Field label="Hora de recogida">
        <TimeStepper label="Hora de recogida" value={minute} onChange={setMinute} step={5} min={6 * 60} max={23 * 60 + 55} />
      </Field>
      {slotFull ? (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: `${C.warning}66`, backgroundColor: `${C.warning}14`, padding: S.md, gap: S.sm }}>
          <PText v="body">
            {`La franja de las ${minutesToLabel(Math.floor(minute / 10) * 10)} ya está llena.`}
            {nextFree !== null ? ` La siguiente con sitio es a las ${minutesToLabel(nextFree)}.` : ""}
          </PText>
          {nextFree !== null ? (
            <PButton label={`Usar las ${minutesToLabel(nextFree)}`} icon={Clock} variant="outline" small onPress={() => setMinute(nextFree)} />
          ) : null}
        </View>
      ) : null}
      <Field label="De la carta">
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
          {products.map((p, i) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: S.sm,
                paddingHorizontal: S.md,
                paddingVertical: 6,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: C.borderLight,
              }}
            >
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {p.name}
                </PText>
                <PText v="tiny">{money(p.priceCents)}</PText>
              </View>
              <Stepper
                label={`Cantidad de ${p.name}`}
                value={qty[p.id] ?? 0}
                max={99}
                onChange={(n) => setQty((q) => ({ ...q, [p.id]: n }))}
              />
            </View>
          ))}
        </View>
      </Field>
      {kind === "encargo" ? (
        <>
          <Field label="Algo fuera de carta">
            <Input label="Algo fuera de carta" value={custom} onChangeText={setCustom} placeholder="Tarta entera, bandeja de 20..." />
          </Field>
          <MoneyField label="Precio de lo de fuera de carta" value={customPrice} onChange={setCustomPrice} />
          <Field label="Alérgenos" hint={inherited.length ? "Los de los productos de la carta ya se suman solos." : undefined}>
            <MultiChips
              options={ALLERGENS.map((a) => ({ value: a.id, label: a.label }))}
              value={[...new Set([...inherited, ...allergens])]}
              onChange={(v) => setAllergens(v.filter((x) => !inherited.includes(x as Allergen)) as Allergen[])}
            />
          </Field>
          <MoneyField label="Señal cobrada en el TPV" value={deposit} onChange={setDeposit} />
        </>
      ) : null}
      <Field label="Nota">
        <Input label="Nota" value={note} onChangeText={setNote} placeholder="Leche sin lactosa, texto de la tarta..." />
      </Field>
    </Sheet>
  );
}
