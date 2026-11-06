import React from "react";
import { Text, View } from "react-native";
import { CalendarClock, CircleDot, LogIn, LogOut, UserPlus } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import type { ProBooking } from "../../../../../shared/pro/types";
import { localDate, localMinutes, money, plural, time } from "../../../../../shared/pro/format";
import { isShared, occupancyAt, priceFor, resourceBookings } from "../../../../../shared/pro/courts";
import { clockLabel, courtsOps } from "../../../../../shared/pro/courts-base";
import { isFlagged, noShowCount } from "../../../../../shared/pro/courts-ops";
import { checkIn, checkOut, lateArrivals, memberOf, releaseNoShows, renewals, shiftPresets, walkIn } from "../../../../../shared/pro/courts-desk";
import { deskWarning, searchDesk } from "../../../../../shared/pro/courts-study";
import { ChoiceGrid, Empty, Field, Input, LiveDot, ListRow, Meter, PButton, PText, PageHeader, Panel, Pill, SearchInput, Sheet } from "../../kit";
import { firstName } from "./booking-ops";
import { CourtBookingDrawer } from "./parts";
import { Mostrador as ClubDeskOnWeb } from "./en-web";

/**
 * Recepción de la sala de estudio (versión nativa del StudyDesk de web
 * courts/mostrador.tsx): plazas libres en directo, buscar por nombre o
 * móvil, Ha llegado y Se va en un toque, entradas sin reserva y los que no
 * aparecen. El mostrador del club de pádel sigue abriendo la web.
 */
export default function MostradorSection() {
  const { vertical, demo } = usePro();
  if (vertical.id !== "coworking" || !demo) return <ClubDeskOnWeb />;
  return <StudyDesk />;
}

function WarnPill({ count, flagged }: { count: number; flagged: boolean }) {
  if (!count) return null;
  return <Pill tone={flagged ? "danger" : "warning"} label={`${count} ${count === 1 ? "aviso" : "avisos"}`} />;
}

function StudyDesk() {
  const { data, now, update } = usePro();
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const [query, setQuery] = React.useState("");
  const [openBooking, setOpenBooking] = React.useState<string | null>(null);
  const [walk, setWalk] = React.useState<{ name?: string; personId?: string } | null>(null);

  const zones = data.resources.filter(isShared);
  const todays = resourceBookings(data, today).filter((b) => zones.some((z) => z.id === b.resourceId));
  const inside = todays.filter((b) => b.status === "arrived" && Date.parse(b.end) > now.getTime());
  const coming = todays.filter((b) => b.status === "confirmed" && Date.parse(b.end) > now.getTime());
  const late = lateArrivals(data, now);
  const lateIds = new Set(late.map((b) => b.id));
  const renew = renewals(data, today);
  const people = zones.reduce((a, r) => a + Math.min(r.capacity, occupancyAt(data, r, today, nowMin)), 0);
  const seats = zones.reduce((a, r) => a + r.capacity, 0);
  const found = query.trim().length >= 2 ? searchDesk(data.members, todays, query) : null;

  // Avisos de convivencia de quien entra: al tercero, recepción lo ve en rojo.
  const warningOf = (b: Pick<ProBooking, "clientId" | "clientName">) =>
    deskWarning(data, { memberId: data.members.some((m) => m.id === b.clientId) ? b.clientId : undefined, name: b.clientName }, today);

  const doCheckIn = (bookingId: string) => {
    const result = checkIn(data, bookingId, now);
    void update("court.checkin", () => result.data);
    const b = data.bookings.find((x) => x.id === bookingId);
    const w = b ? warningOf(b) : { count: 0, flagged: false };
    toast(`${firstName(b?.clientName ?? "")} ha entrado`, {
      kind: "success",
      body:
        [
          result.seat ? `Puesto ${result.seat.label}` : null,
          result.bonoLeft !== undefined ? `le ${result.bonoLeft === 1 ? "queda 1 uso" : `quedan ${result.bonoLeft} usos`} en su bono` : null,
          w.flagged ? `lleva ${w.count} avisos de convivencia: recuérdale las normas` : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
    });
    setQuery("");
  };

  const doCheckOut = (bookingId: string) => {
    const b = data.bookings.find((x) => x.id === bookingId);
    void update("court.checkout", (d) => checkOut(d, bookingId, new Date()));
    toast(`${firstName(b?.clientName ?? "")} se ha ido`, { kind: "success", body: "Su puesto vuelve a estar libre." });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Recepción"
        title={`${people} de ${seats} puestos ocupados`}
        description={`${plural(inside.length, "persona dentro", "personas dentro")}, ${plural(coming.length, "reserva por llegar", "reservas por llegar")}${late.length ? ` y ${late.length} sin aparecer` : ""}.`}
        actions={<PButton label="Entrada sin reserva" icon={UserPlus} onPress={() => setWalk({})} />}
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginBottom: S.lg }}>
        {zones.map((r) => {
          const occ = Math.min(r.capacity, occupancyAt(data, r, today, nowMin));
          return (
            <View key={r.id} style={{ width: "48.5%", borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.md, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <LiveDot />
                <PText v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</PText>
              </View>
              <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text, fontVariant: ["tabular-nums"] }} maxFontSizeMultiplier={1.2}>
                {r.capacity - occ}
                <Text style={{ fontSize: 13, color: C.muted }}>{` libres de ${r.capacity}`}</Text>
              </Text>
              <Meter value={occ} max={r.capacity} tone={occ >= r.capacity ? "danger" : occ / r.capacity > 0.75 ? "warning" : "success"} />
            </View>
          );
        })}
      </View>

      <SearchInput value={query} onChange={setQuery} placeholder="Nombre o móvil" />
      {found ? (
        <Panel flush>
          {found.length ? (
            found.map((f, i) => {
              const w = deskWarning(data, { memberId: f.personId, name: f.name }, today);
              return (
                <ListRow key={f.key} last={i === found.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{f.name}</PText>
                    <PText v="tiny" numberOfLines={1}>{f.detail}</PText>
                    <WarnPill count={w.count} flagged={w.flagged} />
                  </View>
                  {f.booking && f.booking.status === "arrived" ? (
                    <PButton label="Se va" icon={LogOut} small variant="outline" onPress={() => doCheckOut(f.booking!.id)} />
                  ) : f.booking ? (
                    <PButton label="Ha llegado" icon={LogIn} small onPress={() => doCheckIn(f.booking!.id)} />
                  ) : (
                    <PButton label="Darle entrada" small variant="outline" onPress={() => setWalk({ name: f.name, personId: f.personId })} />
                  )}
                </ListRow>
              );
            })
          ) : (
            <View style={{ padding: S.lg, gap: S.sm }}>
              <PText v="small">No hay nadie con ese nombre hoy.</PText>
              <PButton label="Entrada sin reserva" small variant="outline" onPress={() => setWalk({ name: query.trim() })} />
            </View>
          )}
        </Panel>
      ) : null}

      {renew.length ? (
        <Panel title={`${plural(renew.length, "socio renueva", "socios renuevan")} esta semana`} description="Recuérdaselo y cobra la renovación desde Hoy.">
          <PText v="small">{renew.slice(0, 4).map((r) => `${firstName(r.member.name)} (${r.detail.toLowerCase()})`).join(", ")}</PText>
        </Panel>
      ) : null}

      <Panel
        title="Por llegar"
        description={late.length ? `${late.length} llevan más de ${courtsOps(data).policy.releaseAfterMinutes} minutos de retraso.` : "Reservas de hoy que aún no han entrado."}
        action={
          late.length ? (
            <PButton
              label={`Liberar ${late.length}`}
              small
              variant="outline"
              onPress={() => {
                void update("court.release.noshows", (d) => releaseNoShows(d, late.map((b) => b.id)));
                toast("Puestos liberados", { kind: "success", body: `${plural(late.length, "puesto vuelve", "puestos vuelven")} al aforo.` });
              }}
            />
          ) : undefined
        }
        flush
      >
        {coming.length ? (
          coming.slice(0, 12).map((b, i) => {
            const w = warningOf(b);
            return (
              <ListRow key={b.id} onPress={() => setOpenBooking(b.id)} accessibilityLabel={`${b.clientName}, ${time(b.start)}`} last={i === Math.min(coming.length, 12) - 1}>
                <PText v="h3" style={{ width: 48, fontVariant: ["tabular-nums"] }}>{time(b.start)}</PText>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{b.clientName}</PText>
                  <PText v="tiny" numberOfLines={1}>
                    {`${data.resources.find((r) => r.id === b.resourceId)?.name ?? ""}${b.note === "Con bono" ? " · con bono" : b.priceCents ? ` · ${money(b.priceCents)}` : ""}${isFlagged(data, b.clientId) ? ` · ${noShowCount(data, b.clientId)} ausencias` : ""}`}
                  </PText>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {lateIds.has(b.id) ? <Pill tone="warning" label="Tarde" /> : null}
                    <WarnPill count={w.count} flagged={w.flagged} />
                  </View>
                </View>
                <PButton label="Ha llegado" small variant="outline" onPress={() => doCheckIn(b.id)} />
              </ListRow>
            );
          })
        ) : (
          <Empty icon={LogIn} title="Todos han llegado" body="Las reservas de más tarde aparecerán aquí." />
        )}
      </Panel>

      <Panel title="Dentro ahora" description="Con su puesto y desde qué hora." flush>
        {inside.length ? (
          inside.slice(0, 14).map((b, i) => {
            const ops = courtsOps(data);
            const seat = ops.seats.find((s) => s.id === ops.seatByBooking[b.id]);
            const stay = ops.checkins[b.id];
            const w = warningOf(b);
            return (
              <ListRow key={b.id} onPress={() => setOpenBooking(b.id)} accessibilityLabel={`${b.clientName}, dentro`} last={i === Math.min(inside.length, 14) - 1}>
                <PText v="h3" style={{ width: 44, textAlign: "center" }}>{seat?.label ?? ""}</PText>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{b.clientName}</PText>
                  <PText v="tiny" numberOfLines={1}>{`Desde las ${time(stay?.inAt ?? b.start)} · hasta las ${time(b.end)}`}</PText>
                  <WarnPill count={w.count} flagged={w.flagged} />
                </View>
                <PButton label="Se va" small variant="outline" onPress={() => doCheckOut(b.id)} />
              </ListRow>
            );
          })
        ) : (
          <Empty icon={CircleDot} title="La sala está vacía" body="Cuando alguien entre lo verás aquí con su puesto." />
        )}
      </Panel>

      <CourtBookingDrawer bookingId={openBooking} onClose={() => setOpenBooking(null)} />
      <WalkInSheet target={walk} onClose={() => setWalk(null)} />
    </ProPage>
  );
}

/** Entrada sin reserva: puesto ahora hasta el final del turno. */
function WalkInSheet({ target, onClose }: { target: { name?: string; personId?: string } | null; onClose: () => void }) {
  const { data, update, now } = usePro();
  const today = localDate(now);
  const zones = data.resources.filter(isShared);
  const [name, setName] = React.useState("");
  const [personId, setPersonId] = React.useState<string | undefined>();
  const [zoneId, setZoneId] = React.useState("");
  const [shift, setShift] = React.useState("");
  const presets = shiftPresets(data, today, localMinutes(now));

  React.useEffect(() => {
    if (!target) return;
    setName(target.name ?? "");
    setPersonId(target.personId);
    setZoneId(zones[0]?.id ?? "");
    setShift(presets[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const zone = zones.find((z) => z.id === zoneId);
  const preset = presets.find((p) => p.id === shift);
  const found = memberOf(data, personId);
  const withBono = Boolean(found && (found.member.sessionsLeft ?? 0) > 0) || found?.plan?.period === "month";
  const minutes = preset ? preset.to - localMinutes(now) : 0;
  const price = zone && preset && !withBono ? (priceFor(zone, today, preset.from, Math.max(30, preset.to - preset.from)) ?? 0) : 0;
  const full = zone ? occupancyAt(data, zone, today, localMinutes(now)) >= zone.capacity : true;
  const suggestions = !personId && name.trim().length >= 2 ? data.members.filter((m) => m.status !== "cancelled" && m.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 4) : [];

  const save = () => {
    if (!zone || !preset || name.trim().length < 2 || full) return;
    const result = walkIn(data, {
      id: localId("b"),
      resourceId: zone.id,
      name: name.trim(),
      personId,
      student: Boolean(found?.member.student?.verified),
      now,
      minutes: Math.max(30, minutes),
      priceCents: price,
    });
    void update("court.walkin", () => result.data);
    toast(`${firstName(name)} ha entrado`, {
      kind: "success",
      body: [result.seat ? `Puesto ${result.seat.label}` : null, price ? `${money(price)} por cobrar` : "Con su bono"].filter(Boolean).join(", "),
    });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(target)}
      onClose={onClose}
      title="Entrada sin reserva"
      description="Le das puesto ahora y se queda hasta el final del turno."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Dar entrada${price ? ` · ${money(price)}` : ""}`} onPress={save} disabled={!zone || !preset || name.trim().length < 2 || full} />
        </>
      }
    >
      <Field label="Nombre">
        <Input
          value={name}
          onChangeText={(v) => {
            setName(v);
            setPersonId(undefined);
          }}
          placeholder="Nombre y apellido"
          label="Nombre"
        />
        {suggestions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {suggestions.map((m) => (
              <PButton
                key={m.id}
                label={m.name}
                small
                variant="outline"
                onPress={() => {
                  setName(m.name);
                  setPersonId(m.id);
                }}
              />
            ))}
          </View>
        ) : null}
      </Field>
      <Field label="Zona">
        <ChoiceGrid
          value={zoneId}
          onChange={setZoneId}
          options={zones.map((z) => ({ value: z.id, label: z.name, hint: `${z.capacity - Math.min(z.capacity, occupancyAt(data, z, today, localMinutes(now)))} libres` }))}
        />
      </Field>
      {presets.length ? (
        <Field label="Hasta">
          <ChoiceGrid value={shift} onChange={setShift} options={presets.map((p) => ({ value: p.id, label: p.label, hint: `hasta las ${clockLabel(p.to)}` }))} />
        </Field>
      ) : (
        <PText v="small">Ya no queda turno abierto hoy.</PText>
      )}
      {found ? (
        <View style={{ borderRadius: R.lg, backgroundColor: `${C.success}1A`, padding: S.md }}>
          <PText v="small" color={C.success}>
            {withBono
              ? found.plan?.period === "month"
                ? "Es socio mensual: entra sin pagar."
                : `Entra con su bono: le quedarán ${Math.max(0, (found.member.sessionsLeft ?? 0) - 1)} usos.`
              : "Su bono está agotado: se cobra el pase o renuévalo desde Hoy."}
          </PText>
        </View>
      ) : null}
      {full ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <CalendarClock size={14} color={C.errorText} />
          <PText v="small" color={C.errorText}>Esa zona está llena ahora mismo.</PText>
        </View>
      ) : null}
    </Sheet>
  );
}
