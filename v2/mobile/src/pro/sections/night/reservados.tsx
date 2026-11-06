import React from "react";
import { Text, View } from "react-native";
import { BadgeCheck, Cake, Check, History, Inbox, Minus, Plus, Receipt, Sofa, Timer, UserX, Users, X, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProGroupRequest, ProMenuItem, ProZone } from "../../../../../shared/pro/types";
import { dayLabel, money, relative, shortDay, time } from "../../../../../shared/pro/format";
import { ZONE_STATUS, countdown, eventPhase, focusEvent, nightOf, zoneTotals } from "../../../../../shared/pro/night";
import { bookerHistory, recordNoShow } from "../../../../../shared/pro/night-guests";
import { nightTitle } from "../../../../../shared/pro/night-ops";
import { addToTab, closeZoneBill, freeZone, holdChoices, removeFromTab, zoneBillFor, zoneTab } from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Panel, Pill, Sheet, Stepper, TONE_HEX, Tip, Toggle } from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { afterSheet } from "./night-ui";
import { BigFigure, BirthdaysPanel, Note, defaultSigner, euros, useNightOps, useReleaseExpiredHolds } from "./ops-ui";

type Preset = { zoneId?: string; name?: string; people?: number; birthday?: boolean; note?: string; requestId?: string } | null;

export default function NightReservados() {
  const { data, now, update, vertical } = usePro();
  const [openZone, setOpenZone] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<Preset>(null);
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  // Los apartados sin señal se liberan solos a su hora, también en el móvil.
  useReleaseExpiredHolds();

  const ev = focusEvent(data, now);
  const zones = data.zones.filter((z) => !ev || !z.eventId || z.eventId === ev.id);
  const zt = zoneTotals(zones);
  const requests = data.groupRequests.filter((g) => g.status === "new" || g.status === "quoted").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const freeZones = zones.filter((z) => z.status === "free");
  const club = vertical.id === "nightclub";

  const decline = async (g: ProGroupRequest) => {
    if (!(await update("group.decline", (d) => ({ ...d, groupRequests: d.groupRequests.map((x) => (x.id === g.id ? { ...x, status: "declined" } : x)) })))) return;
    toast("Petición rechazada", { kind: "success", body: `Avisamos a ${g.organizer.split(" ")[0]} con un mensaje amable.` });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow={ev ? `${ev.name} · ${shortDay(ev.doorsOpen)}` : "Reservados"}
        title="Reservados"
        description={`${zt.taken} de ${zones.length} zonas ocupadas, ${money(zt.minimumCents, { round: true })} de consumo mínimo asegurado${
          requests.length ? ` y ${requests.length} ${requests.length === 1 ? "petición" : "peticiones"} de estudiantes por responder` : ""
        }.`}
        actions={<PButton label="Nuevo reservado" icon={Plus} onPress={() => setPreset({ zoneId: freeZones[0]?.id })} disabled={!zones.length} />}
      />

      <KpiRow>
        <Kpi icon={Sofa} label="Ocupados" value={`${zt.taken}/${zones.length}`} hint={zt.held ? `${zt.held} pendiente de señal` : "Todo confirmado"} />
        <Kpi label="Consumo mínimo" value={money(zt.minimumCents, { round: true })} hint="Asegurado esta noche" emphasis />
        <Kpi label="Señales cobradas" value={money(zt.depositCents, { round: true })} hint="Se descuentan de la cuenta" />
        <Kpi icon={Users} label="Personas" value={zt.people} hint={`${zt.arrived} reservados ya dentro`} />
      </KpiRow>

      <Panel
        title="Plano de la sala"
        description="Toca una zona para reservarla o ver quién viene."
        action={
          freeZones.length ? (
            <PButton
              label="Ofrecer libres"
              icon={Zap}
              variant="secondary"
              small
              onPress={() =>
                setOffer({
                  what: club ? "Reservado con botella" : "Zona reservada para tu grupo",
                  date: ev?.date,
                  from: 23 * 60,
                  to: 23 * 60 + 59,
                  priceCents: freeZones[0].minimumSpendCents,
                  slots: freeZones.length,
                })
              }
            />
          ) : null
        }
      >
        {zones.length ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginBottom: S.lg }}>
              {(Object.keys(ZONE_STATUS) as ProZone["status"][]).map((s) => (
                <Pill key={s} label={`${ZONE_STATUS[s].label} · ${zones.filter((z) => z.status === s).length}`} tone={ZONE_STATUS[s].tone} />
              ))}
            </View>
            {/* En el móvil, rejilla simple de dos columnas (como la web en pantallas pequeñas) */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {zones.map((z) => (
                <ZoneCard key={z.id} zone={z} onPress={() => setOpenZone(z.id)} />
              ))}
            </View>
          </>
        ) : (
          <Empty
            icon={Sofa}
            title="Aún no has definido zonas"
            body="Crea tus reservados con capacidad, consumo mínimo y señal. Los estudiantes podrán pedirlos para cumpleaños y fiestas de clase."
          />
        )}
      </Panel>

      <Panel title="Peticiones de estudiantes" description="Cumpleaños, despedidas y fiestas de clase que piden reservado en Franky." flush>
        {requests.length ? (
          requests.map((g, i) => {
            const birthday = /cumple/i.test(g.kind);
            return (
              <View key={g.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: 6, borderBottomWidth: i === requests.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.md }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {birthday ? <Cake size={16} color={C.blue} strokeWidth={1.9} /> : null}
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{g.kind}</PText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <BadgeCheck size={13} color={C.blue} accessibilityLabel="Estudiante verificado" />
                      <PText v="tiny" numberOfLines={1} style={{ flexShrink: 1 }}>{`${g.organizer} · ${g.people} personas · ${shortDay(g.date)}`}</PText>
                    </View>
                  </View>
                  {g.status === "quoted" ? <Pill label="Presupuestada" tone="info" /> : <Pill label={relative(g.createdAt, now.getTime())} tone="violet" />}
                </View>
                <PText v="small" color={C.text} numberOfLines={2}>{g.message}</PText>
                <PText v="tiny">
                  {`Presupuesto ${money(g.budgetPerPersonCents)} por persona, unos ${money(g.budgetPerPersonCents * g.people, { round: true })}${
                    g.quoteCents ? ` · les ofreciste ${money(g.quoteCents, { round: true })}` : ""
                  }`}
                </PText>
                <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.xs }}>
                  <PButton
                    label="Aceptar y asignar"
                    icon={Check}
                    small
                    disabled={!freeZones.length}
                    onPress={() =>
                      setPreset({
                        requestId: g.id,
                        name: g.organizer,
                        people: g.people,
                        birthday,
                        note: `${g.kind}. ${g.message}`,
                        zoneId: freeZones.find((z) => z.capacity >= g.people)?.id ?? freeZones[0]?.id,
                      })
                    }
                  />
                  <PButton label="Rechazar" icon={X} variant="ghost" small onPress={() => void decline(g)} />
                </View>
              </View>
            );
          })
        ) : (
          <Empty icon={Inbox} title="Sin peticiones ahora" body="Cuando un estudiante pida reservado para su cumpleaños o su clase, aparecerá aquí para aceptarlo con un toque." />
        )}
      </Panel>

      <BirthdaysPanel limit={4} />

      <Tip title="Siempre con señal">
        Un reservado apartado sin señal es una mesa que puede quedarse vacía. Pide una señal por Bizum y descuéntala de la cuenta: si no vienen, la noche no te sale gratis.
      </Tip>

      <ZoneDrawer
        zoneId={openZone}
        onClose={() => setOpenZone(null)}
        onBook={(zoneId) => {
          setOpenZone(null);
          afterSheet(() => setPreset({ zoneId }));
        }}
      />
      <BookDrawer preset={preset} zones={zones} eventId={ev?.id} onClose={() => setPreset(null)} />
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </ProPage>
  );
}

function zoneStyle(status: ProZone["status"]) {
  switch (status) {
    case "held":
      return { borderColor: `${TONE_HEX.amber}80`, backgroundColor: `${TONE_HEX.amber}1A`, borderStyle: "solid" as const };
    case "booked":
      return { borderColor: `${C.blue}4D`, backgroundColor: C.accentSoft, borderStyle: "solid" as const };
    case "arrived":
      return { borderColor: `${TONE_HEX.emerald}80`, backgroundColor: `${TONE_HEX.emerald}1A`, borderStyle: "solid" as const };
    default:
      return { borderColor: C.border, backgroundColor: C.surface, borderStyle: "dashed" as const };
  }
}

function ZoneCard({ zone, onPress }: { zone: ProZone; onPress: () => void }) {
  const { now } = usePro();
  const { ops } = useNightOps();
  const free = zone.status === "free";
  const t = zoneTab(zone);
  const bill = zoneBillFor(ops, zone);
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${zone.name}, ${ZONE_STATUS[zone.status].label}${free ? "" : `, ${zone.bookedBy ?? ""}`}`}
      style={{ width: "48.5%", minHeight: 104, borderRadius: R.lg, borderWidth: 1, padding: S.md, ...zoneStyle(zone.status) }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <Text style={{ flex: 1, fontFamily: FONT.heading, fontSize: 15, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {zone.name}
        </Text>
        {zone.birthday && !free ? <Cake size={16} color={C.blue} strokeWidth={1.9} accessibilityLabel="Cumpleaños" /> : null}
      </View>
      {free ? (
        <PText v="tiny" style={{ marginTop: 4 }}>{`Hasta ${zone.capacity} personas`}</PText>
      ) : (
        <PText v="small" color={C.text} numberOfLines={1} style={{ marginTop: 4, fontFamily: FONT.semibold }}>
          {zone.bookedBy ?? ""}
        </PText>
      )}
      {zone.status === "held" && zone.holdUntil ? (
        <PText v="tiny" color={C.warning} style={{ marginTop: 2 }}>
          {`Se libera ${new Date(zone.holdUntil).getTime() - now.getTime() < 12 * 3600000 ? `a las ${time(zone.holdUntil)}` : shortDay(zone.holdUntil)}`}
        </PText>
      ) : null}
      {zone.status === "arrived" && !bill ? (
        <View style={{ marginTop: 6, gap: 3 }}>
          <Meter value={t.consumedCents} max={Math.max(1, t.minimumCents)} tone={t.reached ? "success" : "violet"} />
          <PText v="tiny">{`${money(t.consumedCents, { round: true })} de ${money(t.minimumCents, { round: true })}`}</PText>
        </View>
      ) : null}
      {bill ? (
        <PText v="tiny" color={C.success} style={{ marginTop: 2 }}>
          Cuenta cerrada
        </PText>
      ) : null}
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm, paddingTop: S.sm }}>
        <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: C.text }} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {`Mín. ${money(zone.minimumSpendCents, { round: true })}`}
        </Text>
        <PText v="tiny">{free ? "Libre" : `${zone.people ?? 0}/${zone.capacity}`}</PText>
      </View>
    </Tap>
  );
}

/** Productos para apuntar en un reservado: primero lo que se pide para compartir. */
function tabProducts(menu: ProMenuItem[]): ProMenuItem[] {
  const share = (m: ProMenuItem) => /botella|compartir|reservado|cubo|ronda/i.test(`${m.section} ${m.name}`);
  return menu.filter((m) => m.available).sort((a, b) => Number(share(b)) - Number(share(a)));
}

function ZoneDrawer({ zoneId, onClose, onBook }: { zoneId: string | null; onClose: () => void; onBook: (zoneId: string) => void }) {
  const { data, now, update } = usePro();
  const { ops } = useNightOps();
  const [more, setMore] = React.useState(false);
  React.useEffect(() => setMore(false), [zoneId]);
  const zone = zoneId ? data.zones.find((z) => z.id === zoneId) : undefined;
  if (!zone) return null;
  const t = zoneTab(zone);
  const bill = zoneBillFor(ops, zone);
  const products = tabProducts(data.menu);
  const shown = more ? products : products.slice(0, 6);

  const setStatus = async (status: ProZone["status"], message: string, clear = false) => {
    const ok = await update("zone.status", (d) => ({
      ...d,
      zones: d.zones.map((x) => {
        if (x.id !== zone.id) return x;
        if (!clear) return { ...x, status, holdUntil: status === "held" ? x.holdUntil : undefined };
        return freeZone(x);
      }),
    }));
    if (!ok) return;
    toast(message, { kind: "success" });
    if (clear) onClose();
  };

  const add = async (item: ProMenuItem) => {
    const at = new Date().toISOString();
    const ok = await update("zone.tab_add", (d) => ({
      ...d,
      zones: d.zones.map((x) =>
        x.id === zone.id ? addToTab(x, { id: localId("tl"), itemId: item.id, name: item.name, priceCents: item.priceCents, qty: 1, at, by: defaultSigner(d) }) : x,
      ),
    }));
    if (!ok) return;
    const after = t.consumedCents + item.priceCents;
    toast(`${item.name} en ${zone.name}`, {
      kind: "success",
      body: after >= t.minimumCents ? `Llevan ${money(after)}: mínimo alcanzado.` : `Llevan ${money(after)}, faltan ${money(t.minimumCents - after)} para el mínimo.`,
    });
  };

  const minus = (lineId: string) => void update("zone.tab_remove", (d) => ({ ...d, zones: d.zones.map((x) => (x.id === zone.id ? removeFromTab(x, lineId) : x)) }));

  const closeBill = async () => {
    const ok = await update("zone.bill", (d) => closeZoneBill(d, zone.id, defaultSigner(d), new Date().toISOString(), localId("bill")));
    if (!ok) return;
    toast(`Cuenta de ${zone.name} cerrada`, {
      kind: "success",
      body: t.depositCents ? `Cobra ${money(t.dueCents)} en tu TPV: ya se ha descontado la señal de ${money(t.depositCents)}.` : `Cobra ${money(t.dueCents)} en tu TPV.`,
    });
  };

  // Solo se puede marcar un plantón cuando la noche ya ha empezado.
  const zoneEvent = zone.eventId ? data.events.find((e) => e.id === zone.eventId) : undefined;
  const started = zoneEvent ? ["live", "past"].includes(eventPhase(zoneEvent, now)) : false;
  const noShow = async () => {
    const kept = zone.depositCents;
    const who = zone.bookedBy;
    if (!(await update("zone.no_show", (d) => recordNoShow(d, zone.id, new Date().toISOString(), localId("ns"))))) return;
    toast(`${zone.name} vuelve a estar libre`, {
      kind: "success",
      body: kept ? `${who} no se presentó. La señal de ${money(kept)} se queda y la próxima vez te lo recordamos.` : `${who} no se presentó. La próxima vez te recordamos pedir señal.`,
    });
    onClose();
  };

  const footer =
    zone.status === "free" ? (
      <PButton label="Reservar esta zona" onPress={() => onBook(zone.id)} />
    ) : (
      <>
        <PButton label="Liberar" variant="ghost" onPress={() => void setStatus("free", `${zone.name} liberado`, true)} />
        {zone.status === "held" ? <PButton label="Señal cobrada" onPress={() => void setStatus("booked", "Señal cobrada", false)} /> : null}
        {zone.status === "booked" && started ? <PButton label="No han venido" icon={UserX} variant="outline" onPress={() => void noShow()} /> : null}
        {zone.status === "booked" ? <PButton label="Han llegado" onPress={() => void setStatus("arrived", `${zone.bookedBy?.split(" ")[0] ?? "El grupo"} ha llegado`)} /> : null}
        {zone.status === "arrived" && !bill ? <PButton label={`Cerrar cuenta · ${money(t.dueCents)}`} icon={Receipt} onPress={() => void closeBill()} /> : null}
      </>
    );

  return (
    <Sheet open onClose={onClose} title={zone.name} description={`Hasta ${zone.capacity} personas · mínimo ${money(zone.minimumSpendCents)}`} footer={footer}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <Pill label={ZONE_STATUS[zone.status].label} tone={ZONE_STATUS[zone.status].tone} />
        {zone.birthday ? <Pill label="Cumpleaños" tone="violet" icon={Cake} /> : null}
        {zone.status === "held" && zone.holdUntil ? <Pill label={`Se libera en ${countdown(now.getTime(), zone.holdUntil)}`} tone="warning" icon={Timer} /> : null}
      </View>
      {zone.status === "arrived" ? (
        bill ? (
          <Note tone="success">
            {`Cuenta cerrada a las ${time(bill.closedAt)}. Consumieron ${money(bill.consumedCents)} con un mínimo de ${money(bill.minimumCents)}. Señal descontada ${money(
              bill.depositCents,
            )}, cobrados en el TPV ${money(bill.dueCents)}.`}
          </Note>
        ) : (
          <View style={{ gap: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: S.md }}>
              <View style={{ flex: 1 }}>
                <PText v="small">Llevan consumido</PText>
                <BigFigure>{money(t.consumedCents)}</BigFigure>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <PText v="h3" color={t.reached ? C.success : C.text}>{t.reached ? "Mínimo alcanzado" : `Faltan ${money(t.missingCents)}`}</PText>
                <PText v="tiny">{`de un mínimo de ${money(t.minimumCents)}`}</PText>
              </View>
            </View>
            <Meter value={t.consumedCents} max={Math.max(1, t.minimumCents)} tone={t.reached ? "success" : "violet"} />
            {t.lines.length ? (
              <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
                {t.lines.map((l, i) => (
                  <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingLeft: S.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.borderLight }}>
                    <PText v="h3" style={{ width: 30 }}>{`${l.qty}x`}</PText>
                    <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{l.name}</PText>
                    <PText v="tiny">{time(l.at)}</PText>
                    <PText v="small" color={C.text} style={{ minWidth: 58, textAlign: "right" }}>{money(l.priceCents * l.qty)}</PText>
                    <Tap
                      onPress={() => minus(l.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar una de ${l.name}`}
                      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                    >
                      <Minus size={15} color={C.muted} strokeWidth={1.9} />
                    </Tap>
                  </View>
                ))}
              </View>
            ) : (
              <PText v="small">Aún no han pedido nada. Toca lo que sirvas y se suma al momento.</PText>
            )}
            {products.length ? (
              <View style={{ gap: S.sm }}>
                <PText v="h3">Apuntar</PText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
                  {shown.map((m) => (
                    <Tap
                      key={m.id}
                      onPress={() => void add(m)}
                      haptic
                      accessibilityRole="button"
                      accessibilityLabel={`Apuntar ${m.name}, ${money(m.priceCents)}`}
                      style={{ width: "48.5%", minHeight: 52, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 8, justifyContent: "center", gap: 2 }}
                    >
                      <PText v="small" color={C.text} numberOfLines={1}>{m.name}</PText>
                      <PText v="h3">{money(m.priceCents)}</PText>
                    </Tap>
                  ))}
                </View>
                {products.length > 6 ? (
                  <PButton label={more ? "Ver menos" : `Ver toda la carta (${products.length})`} variant="ghost" small onPress={() => setMore((v) => !v)} />
                ) : null}
              </View>
            ) : (
              <PText v="tiny">Sube tu carta para apuntar el consumo con un toque.</PText>
            )}
            {t.depositCents ? (
              <Note>{`Al cerrar se cobra el mayor entre lo consumido y el mínimo, menos la señal de ${money(t.depositCents)}: ahora serían ${money(t.dueCents)}.`}</Note>
            ) : null}
          </View>
        )
      ) : null}
      {zone.status === "free" ? (
        <PText v="small" color={C.text}>
          Libre para esta noche. Resérvala a mano o déjala en la oferta para estudiantes: la verán quienes celebran algo esta semana.
        </PText>
      ) : (
        <View>
          <Detail label="A nombre de" value={zone.bookedBy ?? ""} />
          <Detail label="Personas" value={zone.people ?? "Sin indicar"} />
          <Detail label="Consumo mínimo" value={money(zone.minimumSpendCents)} />
          <Detail
            label="Señal"
            last={!zone.phone}
            value={
              <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.3}>
                {`${money(zone.depositCents)} `}
                <Text style={{ fontFamily: FONT.semibold, color: zone.status === "held" ? C.warning : C.success }}>{zone.status === "held" ? "(pendiente)" : "(cobrada)"}</Text>
              </Text>
            }
          />
          {zone.status === "held" && zone.holdUntil ? <Detail label="Si no paga" value={`Se libera a las ${time(zone.holdUntil)}, ${shortDay(zone.holdUntil)}`} last={!zone.phone} /> : null}
          {zone.phone ? <Detail label="Teléfono" value={zone.phone} last /> : null}
        </View>
      )}
      {zone.bookedBy ? <BookerHistoryNote name={zone.bookedBy} phone={zone.phone} /> : null}
      {zone.note ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
          <PText v="small" color={C.text}>{zone.note}</PText>
        </View>
      ) : null}
    </Sheet>
  );
}

function BookDrawer({ preset, zones, eventId, onClose }: { preset: Preset; zones: ProZone[]; eventId?: string; onClose: () => void }) {
  const { data, now, update } = usePro();
  const [holdUntil, setHoldUntil] = React.useState("");
  const holdOptions = holdChoices(now, eventId ? data.events.find((e) => e.id === eventId) : null);
  const [zoneId, setZoneId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [people, setPeople] = React.useState(6);
  const [minimum, setMinimum] = React.useState("");
  const [deposit, setDeposit] = React.useState("");
  const [paid, setPaid] = React.useState(false);
  const [birthday, setBirthday] = React.useState(false);
  const [note, setNote] = React.useState("");

  const zone = zones.find((z) => z.id === zoneId);
  const available = zones.filter((z) => z.status === "free" || z.id === preset?.zoneId);

  React.useEffect(() => {
    if (!preset) return;
    const z = zones.find((x) => x.id === preset.zoneId) ?? zones.find((x) => x.status === "free");
    setZoneId(z?.id ?? "");
    setName(preset.name ?? "");
    setPhone("");
    setPeople(preset.people ?? Math.min(6, z?.capacity ?? 6));
    setMinimum(z ? String(z.minimumSpendCents / 100) : "");
    setDeposit(z ? String(z.depositCents / 100) : "");
    setPaid(false);
    setBirthday(Boolean(preset.birthday));
    setNote(preset.note ?? "");
    // Por defecto, la opción más tardía: da margen al grupo para pagar.
    const options = holdChoices(new Date(), eventId ? data.events.find((e) => e.id === eventId) : null);
    setHoldUntil(options[options.length - 1]?.value ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const pickZone = (id: string) => {
    setZoneId(id);
    const z = zones.find((x) => x.id === id);
    if (z) {
      setMinimum(String(z.minimumSpendCents / 100));
      setDeposit(String(z.depositCents / 100));
    }
  };

  const n = people;
  const tooMany = zone ? n > zone.capacity : false;
  const valid = Boolean(zone) && name.trim().length > 1 && n > 0 && !tooMany;

  const save = async () => {
    if (!zone) return;
    const status: ProZone["status"] = paid || euros(deposit) === 0 ? "booked" : "held";
    const ok = await update("zone.book", (d) => ({
      ...d,
      zones: d.zones.map((x) => {
        if (x.id !== zone.id) return x;
        const booked: ProZone = {
          ...x,
          status,
          bookedBy: name.trim(),
          people: n,
          minimumSpendCents: euros(minimum),
          depositCents: euros(deposit),
          birthday,
          phone: phone.trim() || undefined,
          note: note.trim() || undefined,
          eventId: x.eventId ?? eventId,
          holdUntil: status === "held" ? holdUntil || undefined : undefined,
          tab: undefined,
        };
        return booked;
      }),
      groupRequests: preset?.requestId ? d.groupRequests.map((g) => (g.id === preset.requestId ? { ...g, status: "accepted" } : g)) : d.groupRequests,
    }));
    if (!ok) return;
    toast(status === "booked" ? `${zone.name} reservado` : `${zone.name} apartado`, {
      kind: "success",
      body:
        status === "booked"
          ? `${name.trim()}, ${n} personas.`
          : `Pídele la señal de ${money(euros(deposit))}.${holdUntil ? ` Si no llega, se libera sola a las ${time(holdUntil)}.` : ""}`,
    });
    onClose();
  };

  const ev = eventId ? data.events.find((e) => e.id === eventId) : undefined;

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={preset?.requestId ? "Aceptar petición" : "Nuevo reservado"}
      description={ev ? `${ev.name}, ${dayLabel(ev.doorsOpen)} a las ${time(ev.doorsOpen)}` : "Zona, personas, mínimo y señal."}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={paid || euros(deposit) === 0 ? "Reservar" : "Apartar y pedir señal"} onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      {available.length ? (
        <>
          <Field label="Zona">
            <ChoiceGrid
              value={zoneId}
              onChange={pickZone}
              options={available.map((z) => ({ value: z.id, label: z.name, hint: `${z.capacity} pers. · ${money(z.minimumSpendCents, { round: true })}` }))}
            />
          </Field>
          <Field label="A nombre de">
            <Input value={name} onChangeText={setName} placeholder="Nombre y apellido" label="A nombre de" autoCapitalize="words" />
          </Field>
          <Field label="Personas" hint={tooMany ? `Máximo ${zone?.capacity}` : undefined}>
            <Stepper value={people} onChange={setPeople} min={1} max={Math.max(zone?.capacity ?? 30, people)} label="personas" />
          </Field>
          <Field label="Teléfono">
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="600 000 000" label="Teléfono" />
          </Field>
          {name.trim().length > 3 ? <BookerHistoryNote name={name} phone={phone} compact /> : null}
          <View style={{ flexDirection: "row", gap: S.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Consumo mínimo (€)">
                <Input value={minimum} onChangeText={setMinimum} keyboardType="decimal-pad" label="Consumo mínimo en euros" />
              </Field>
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Señal (€)">
                <Input value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" label="Señal en euros" />
              </Field>
            </View>
          </View>
          <Toggle label="Señal ya cobrada" detail="Si no, queda apartado hasta la hora que elijas." value={paid} onChange={setPaid} />
          {!paid && euros(deposit) > 0 && holdOptions.length ? (
            <Field label="Si no paga la señal, se libera" hint="Así la zona vuelve a estar libre para otro grupo.">
              <ChoiceGrid value={holdUntil} onChange={setHoldUntil} options={holdOptions} />
            </Field>
          ) : null}
          <Toggle label="Es un cumpleaños" value={birthday} onChange={setBirthday} />
          <Field label="Nota para el equipo">
            <Input value={note} onChangeText={setNote} multiline placeholder="Bengala con la botella, llegan a la 1:00…" label="Nota para el equipo" />
          </Field>
        </>
      ) : (
        <Empty icon={Sofa} title="No quedan zonas libres" body="Libera una zona para poder reservarla esta noche." />
      )}
    </Sheet>
  );
}

/**
 * Lo que se sabe de quien reserva: si ya vino, cuánto gasta de media y si
 * alguna vez no se presentó. Si falló, sugiere pedir señal.
 */
function BookerHistoryNote({ name, phone, compact }: { name: string; phone?: string; compact?: boolean }) {
  const { data, now } = usePro();
  const h = bookerHistory(data, { name, phone }, nightOf(now));
  if (!h.visits && !h.noShows) {
    return compact ? null : <PText v="tiny">Primera vez que reserva con vosotros.</PText>;
  }
  const parts = [
    h.visits ? `${h.visits} ${h.visits === 1 ? "reservado" : "reservados"} con cuenta cerrada, ${money(h.avgCents, { round: true })} de media` : null,
    h.noShows ? `${h.noShows} ${h.noShows === 1 ? "vez" : "veces"} no se presentó` : null,
  ].filter(Boolean);
  return (
    <Note tone={h.askDeposit ? "warning" : "neutral"}>
      <View style={{ flexDirection: "row", gap: S.sm }}>
        <History size={15} color={h.askDeposit ? C.warning : C.muted} strokeWidth={1.9} style={{ marginTop: 2 }} />
        <PText v="small" color={C.text} style={{ flex: 1 }}>
          {`${parts.join(" y ")}.${h.lastNight ? ` Última vez el ${nightTitle(h.lastNight).toLowerCase()}.` : ""}${h.askDeposit ? " Pídele la señal antes de confirmar." : ""}`}
        </PText>
      </View>
    </Note>
  );
}
