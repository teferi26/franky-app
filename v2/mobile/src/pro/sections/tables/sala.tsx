import React from "react";
import { Alert, Text, View, useWindowDimensions } from "react-native";
import { BellRing, CalendarPlus, LayoutGrid, Plus, Sparkles, Trash2 } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProTable } from "../../../../../shared/pro/types";
import { localDate, localMinutes, plural, time } from "../../../../../shared/pro/format";
import {
  CLEANING_MIN,
  currentTurn,
  stayMinutes,
  tableBookingsOn,
  tableLive,
  tableName,
  turnOf,
  waitlistOn,
  zonesOf,
  type TableLive,
  type TableState,
} from "../../../../../shared/pro/tables";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Empty, Field, Input, ListRow, PButton, PText, PageHeader, Panel, Segmented, Sheet, Tip } from "../../kit";
import { FLOOR_COLS as COLS, FLOOR_ROWS as ROWS, UnplacedTables } from "./adopt-table-drawer";
import {
  NewReservationDrawer,
  NoteLine,
  RealWaitlistPanel,
  ReservationDrawer,
  SourceTag,
  StudentMark,
  useTableActions,
  type NewReservationPreset,
} from "./table-kit";
import { PickButton, statusTone } from "./ui";

const STATE_LABEL: Record<TableState, string> = {
  free: "Libre",
  soon: "Reservada pronto",
  seated: "Sentada",
  dirty: "Por limpiar",
};

/** Colores de cada estado. Se leen en cada pintado para seguir al tema. */
function stateStyle(state: TableState) {
  switch (state) {
    case "soon": {
      const t = statusTone("amber");
      return { bg: t.bg, border: t.border, fg: t.fg, dot: "#FBBF24", dashed: false };
    }
    case "seated":
      return { bg: C.accentSoft, border: `${C.blue}66`, fg: C.blueDeep, dot: C.blue, dashed: false };
    case "dirty": {
      const t = statusTone("slate");
      return { bg: t.bg, border: t.border, fg: t.fg, dot: "#94A3B8", dashed: true };
    }
    default:
      return { bg: C.surface, border: C.border, fg: C.text, dot: C.surface, dashed: false };
  }
}

export default function TablesSala() {
  const { data, now, vertical, demo, pending, can } = usePro();
  const actions = useTableActions();
  const { width } = useWindowDimensions();
  const zones = zonesOf(data);
  const [zone, setZone] = React.useState(zones[0] ?? "Sala");
  const [tableId, setTableId] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<NewReservationPreset>(null);
  const [adding, setAdding] = React.useState(false);
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const stay = stayMinutes(vertical.id, turnOf(nowMin));

  const live = data.tables.map((t) => ({ table: t, live: tableLive(data, t, now) }));
  const count = (s: TableState, z?: string) => live.filter((x) => x.live.state === s && (!z || x.table.zone === z)).length;
  const seatedCovers = live.filter((x) => x.live.state === "seated").reduce((a, x) => a + (x.live.occupiedPeople ?? x.live.current?.partySize ?? 0), 0);
  const zoneTables = live.filter((x) => x.table.zone === zone);
  const waitlist = waitlistOn(data, today);
  const longest = live
    .filter((x) => x.live.state === "seated")
    .sort((a, b) => b.live.minutes - a.live.minutes)
    .slice(0, 5);
  const firstFreeFor = (party: number) =>
    live.filter((x) => x.live.state === "free" && x.table.seats >= party && x.table.shape !== "bar").sort((a, b) => a.table.seats - b.table.seats)[0]?.table;

  // El plano ocupa el ancho de la pantalla menos los márgenes de la página y del panel.
  const floorW = Math.min(width, 900) - S.lg * 2 - 2 - S.sm * 2;
  const cell = floorW / COLS;

  if (!data.tables.length) {
    return (
      <ProPage>
        <PageHeader eyebrow="Sala" title="Tu sala en directo" description="Dibuja tus mesas una vez y verás en todo momento cuáles están libres." />
        <UnplacedTables defaultZone="Sala" onPlaced={setZone} />
        <Panel>
          <Empty
            icon={LayoutGrid}
            title="Dibuja tu sala"
            body="Añade tus mesas con su capacidad y zona. Tarda cinco minutos y así las reservas se asignan solas."
            action={<PButton label="Añadir mesa" icon={Plus} disabled={pending || !can("table.add")} onPress={() => setAdding(true)} />}
          />
        </Panel>
        <AddTableDrawer open={adding} onClose={() => setAdding(false)} defaultZone="Sala" />
      </ProPage>
    );
  }

  return (
    <ProPage>
      <PageHeader
        eyebrow="Sala"
        title="Tu sala en directo"
        description={`${plural(count("free"), "mesa libre", "mesas libres")}, ${plural(count("seated"), "sentada", "sentadas")} con ${seatedCovers} personas y ${plural(count("soon"), "reserva", "reservas")} en la próxima hora y media.`}
        actions={
          <>
            <PButton label="Añadir mesa" icon={Plus} variant="outline" disabled={pending || !can("table.add")} onPress={() => setAdding(true)} />
            <PButton
              label="Nueva reserva"
              icon={CalendarPlus}
              disabled={pending || !can("table.reserve")}
              onPress={() => setPreset({ date: today, turn: currentTurn(nowMin) })}
            />
          </>
        }
      />

      <UnplacedTables defaultZone={zone} onPlaced={setZone} />

      <Segmented value={zone} onChange={setZone} options={zones.map((z) => ({ value: z, label: z, count: count("free", z) }))} />
      <View accessibilityLabel="Leyenda" style={{ flexDirection: "row", flexWrap: "wrap", columnGap: S.md, rowGap: 4, marginBottom: S.md }}>
        {(Object.keys(STATE_LABEL) as TableState[]).map((s) => {
          const st = stateStyle(s);
          return (
            <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: st.dot, borderWidth: s === "free" ? 1 : 0, borderColor: C.muted }} />
              <PText v="tiny">{STATE_LABEL[s]}</PText>
            </View>
          );
        })}
      </View>

      <Panel flush>
        <View style={{ padding: S.sm, alignItems: "center" }}>
          <View
            accessibilityLabel={`Plano de ${zone}`}
            style={{ width: floorW, height: cell * ROWS, borderRadius: R.md, backgroundColor: C.input, overflow: "hidden" }}
          >
            <FloorDots cell={cell} />
            {zoneTables.map(({ table, live: l }) => (
              <TableTile key={table.id} table={table} live={l} stay={stay} cell={cell} onOpen={() => setTableId(table.id)} />
            ))}
          </View>
        </View>
      </Panel>

      <Tip title="En plena sala">
        {demo
          ? `Toca una mesa al entrar el cliente y márcala sentada. Cuando se vaya, Se fue: queda ${CLEANING_MIN} minutos por limpiar y luego vuelve a libre para la lista de espera.`
          : "Marca la llegada del cliente, registra su salida y confirma cuándo queda recogida la mesa."}
      </Tip>

      {!demo ? (
        <RealWaitlistPanel onAdd={() => setPreset({ date: today, waitlist: true })} />
      ) : (
        <Panel title="Lista de espera" description={waitlist.length ? "Te sugerimos la mesa libre más ajustada." : "Nadie esperando ahora."} flush>
          {waitlist.length ? (
            waitlist.map((w, i) => {
              const fit = firstFreeFor(w.partySize);
              return (
                <ListRow key={w.id} last={i === waitlist.length - 1}>
                  <Tap onPress={() => setBookingId(w.id)} accessibilityRole="button" accessibilityLabel={`${w.clientName}, ${w.partySize} personas`} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                    <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {w.clientName}
                      <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${w.partySize}p`}</Text>
                    </Text>
                    <PText v="tiny">{`Desde las ${time(w.start)}`}</PText>
                  </Tap>
                  {fit ? (
                    <PButton label={`Sentar en ${tableName(data, fit.id)}`} small onPress={() => void actions.seat(w, fit.id)} style={{ minHeight: 44 }} />
                  ) : (
                    <PButton label="Avisar" icon={BellRing} small variant="secondary" onPress={() => actions.notify(w)} style={{ minHeight: 44 }} />
                  )}
                </ListRow>
              );
            })
          ) : (
            <View style={{ padding: S.lg }}>
              <PButton label="Apuntar en espera" variant="outline" full onPress={() => setPreset({ date: today, waitlist: true })} />
            </View>
          )}
        </Panel>
      )}

      <Panel title="Llevan más tiempo" description="Las primeras candidatas a quedar libres." flush>
        {longest.length ? (
          longest.map(({ table, live: l }, i) => (
            <ListRow key={table.id} last={i === longest.length - 1}>
              <Tap onPress={() => setTableId(table.id)} accessibilityRole="button" accessibilityLabel={`${tableName(data, table.id)}, ${l.minutes} minutos sentados`} style={{ flex: 1, minHeight: 44, justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {tableName(data, table.id)}
                  <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${l.current?.clientName ?? ""}`}</Text>
                </Text>
                <Text
                  style={{ fontSize: 12, fontFamily: l.minutes > stay ? FONT.semibold : undefined, color: l.minutes > stay ? C.errorText : C.muted }}
                  maxFontSizeMultiplier={1.3}
                >
                  {`${l.minutes} min sentados${l.minutes > stay ? ", ya pasan de lo normal" : ""}`}
                </Text>
              </Tap>
              {l.current ? (
                <PButton label="Se fue" small variant="outline" disabled={pending || !can("table.leave")} onPress={() => void actions.leave(l.current!)} style={{ minHeight: 44 }} />
              ) : null}
            </ListRow>
          ))
        ) : (
          <View style={{ padding: S.lg }}>
            <PText v="small">No hay mesas sentadas ahora mismo.</PText>
          </View>
        )}
      </Panel>

      <TableDrawer
        tableId={tableId}
        onClose={() => setTableId(null)}
        onWalkIn={(id) => {
          setTableId(null);
          setPreset({ date: today, tableId: id, walkIn: true });
        }}
        onOpenBooking={(id) => {
          setTableId(null);
          setBookingId(id);
        }}
      />
      {bookingId ? <ReservationDrawer bookingId={bookingId} onClose={() => setBookingId(null)} /> : null}
      <NewReservationDrawer preset={preset} onClose={() => setPreset(null)} />
      <AddTableDrawer open={adding} onClose={() => setAdding(false)} defaultZone={zone} onAdded={(z) => setZone(z)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */
/* Plano                                                               */
/* ------------------------------------------------------------------ */

/** Puntos de la rejilla, como el fondo punteado de la web. */
function FloorDots({ cell }: { cell: number }) {
  const dots: React.ReactNode[] = [];
  for (let y = 1; y < ROWS; y++)
    for (let x = 1; x < COLS; x++)
      dots.push(<View key={`${x}-${y}`} style={{ position: "absolute", left: x * cell - 1, top: y * cell - 1, width: 2, height: 2, borderRadius: 1, backgroundColor: C.border }} />);
  return (
    <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
      {dots}
    </View>
  );
}

function TableTile({ table, live, stay, cell, onOpen }: { table: ProTable; live: TableLive; stay: number; cell: number; onOpen: () => void }) {
  const { data } = usePro();
  const st = stateStyle(live.state);
  const detail =
    live.state === "seated"
      ? `${live.minutes} min`
      : live.state === "soon" && live.next
        ? time(live.next.start)
        : live.state === "dirty"
          ? "Limpiar"
          : `${table.seats}p`;
  const party = live.state === "seated" && live.current ? `${live.current.partySize}/${table.seats}` : null;
  const long = live.state === "seated" && live.minutes > stay;
  const flat = table.h === 1;
  const pad = cell < 34 ? 2 : 4;
  const w = table.w * cell;
  const h = table.h * cell;
  // Letra según el tamaño de la celda: en un móvil estrecho la mesa mide unos 50 px.
  const nameSize = Math.max(10, Math.min(15, cell * 0.42));
  const detailSize = Math.max(9, Math.min(12.5, cell * 0.34));
  return (
    <Tap
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${tableName(data, table.id)}, ${table.seats} personas, ${STATE_LABEL[live.state]}${live.state === "soon" && live.next ? ` a las ${time(live.next.start)}` : ""}`}
      style={{ position: "absolute", left: table.x * cell, top: table.y * cell, width: w, height: h, padding: pad }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: flat ? "row" : "column",
          gap: flat ? 6 : 0,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          borderWidth: 2,
          borderStyle: st.dashed ? "dashed" : "solid",
          borderColor: long ? C.errorText : st.border,
          backgroundColor: st.bg,
          borderRadius: table.shape === "round" ? 999 : table.shape === "bar" ? 6 : R.md,
          ...SHADOW.card,
        }}
      >
        <Text style={{ fontFamily: FONT.display, fontSize: nameSize, color: st.fg, paddingHorizontal: 1 }} numberOfLines={1} maxFontSizeMultiplier={1}>
          {table.name}
        </Text>
        <Text style={{ fontFamily: FONT.semibold, fontSize: detailSize, color: long ? C.errorText : st.fg, opacity: long ? 1 : 0.8 }} numberOfLines={1} maxFontSizeMultiplier={1}>
          {detail}
        </Text>
        {party && !flat && h - pad * 2 > nameSize + detailSize * 2 + 12 ? (
          <Text style={{ fontSize: detailSize, color: st.fg, opacity: 0.7 }} numberOfLines={1} maxFontSizeMultiplier={1}>{`${party} pax`}</Text>
        ) : null}
      </View>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de una mesa                                                 */
/* ------------------------------------------------------------------ */

function TableDrawer({ tableId, onClose, onOpenBooking, onWalkIn }: {
  tableId: string | null;
  onClose: () => void;
  onOpenBooking: (id: string) => void;
  onWalkIn: (id: string) => void;
}) {
  const { data, now, update, demo, pending, can } = usePro();
  const actions = useTableActions();
  const table = data.tables.find((t) => t.id === tableId) ?? null;
  const [party, setParty] = React.useState(2);

  React.useEffect(() => {
    if (table) setParty(Math.min(2, table.seats));
    // Solo al cambiar de mesa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  if (!table) return null;

  const today = localDate(now);
  const nowMin = localMinutes(now);
  const live = tableLive(data, table, now);
  const later = tableBookingsOn(data, today).filter(
    (b) => b.resourceId === table.id && (b.status === "confirmed" || b.status === "requested") && b.id !== live.next?.id && localMinutes(b.start) >= nowMin - 20,
  );
  const waiting = waitlistOn(data, today).filter((w) => w.partySize <= table.seats);
  const canSeat = live.state === "free" || live.state === "soon";
  const hasBookingsToday = tableBookingsOn(data, today).some((b) => b.resourceId === table.id);
  const close = (fn: () => Promise<boolean>) => async () => {
    if (!(await fn())) return;
    onClose();
  };

  const remove = async () => {
    if (pending || !can("table.remove")) return;
    if (!(await update("table.remove", (d) => ({ ...d, tables: d.tables.filter((t) => t.id !== table.id) })))) return;
    toast("Mesa quitada del plano", { kind: "success", body: tableName(data, table.id) ?? undefined });
    onClose();
  };
  const confirmRemove = () =>
    Alert.alert("Quitar esta mesa del plano", tableName(data, table.id) ?? undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => void remove() },
    ]);

  const footer =
    live.state === "seated" && live.current ? (
      <>
        <PButton label="Ver reserva" variant="outline" onPress={() => onOpenBooking(live.current!.id)} />
        <PButton label="Se fue" disabled={pending || !can("table.leave")} onPress={close(() => actions.leave(live.current!))} />
      </>
    ) : live.state === "dirty" && live.current ? (
      <PButton label="Mesa lista" disabled={pending || !can("table.clean")} onPress={close(() => actions.clean(live.current!))} />
    ) : canSeat ? (
      <PButton
        label={demo ? `Sentar ${plural(party, "persona", "personas")} sin reserva` : "Sentar sin reserva"}
        disabled={pending || !can("table.walkin")}
        onPress={demo ? close(() => actions.walkIn(table.id, party)) : () => onWalkIn(table.id)}
      />
    ) : undefined;

  return (
    <Sheet open onClose={onClose} title={`${tableName(data, table.id)} · ${table.seats} personas`} description={`${table.zone} · ${STATE_LABEL[live.state]}`} footer={footer}>
      {live.state === "seated" && live.current ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.accentSoft, padding: S.lg, gap: 2 }}>
          <PText v="label" color={C.blueDeep}>Ahora</PText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, flexWrap: "wrap" }}>
            <PText v="h2" color={C.blueDeep}>{live.current.clientName}</PText>
            {live.current.student ? <StudentMark university={data.clients.find((c) => c.id === live.current?.clientId)?.student?.university} /> : null}
          </View>
          <PText v="small" color={C.blueDeep}>
            {`${live.occupiedPeople ?? live.current.partySize} de ${table.seats} · sentados desde las ${time(live.current.tableOperation?.seatedAt ?? live.current.start)} (${live.minutes} min)`}
          </PText>
          <NoteLine note={live.current.note} />
        </View>
      ) : null}

      {live.state === "dirty" ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, padding: S.lg, gap: 2 }}>
          <PText v="h3">{`Se ha ido ${live.current?.clientName ?? ""}`}</PText>
          <PText v="small">{`Márcala lista cuando esté recogida. Se libera sola en ${live.minutes} min.`}</PText>
        </View>
      ) : null}

      {demo && canSeat ? (
        <Field
          label="Sentar sin reserva"
          hint={
            live.state === "soon" && live.next
              ? `Ojo: tiene reserva a las ${time(live.next.start)}. Siéntalos solo si os da tiempo.`
              : "Para quien llega sin reservar."
          }
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: table.seats }, (_, i) => i + 1).map((n) => (
              <PickButton
                key={n}
                title={String(n)}
                accessibilityLabel={plural(n, "persona", "personas")}
                selected={party === n}
                onPress={() => setParty(n)}
                style={{ width: 46, paddingHorizontal: 0, alignItems: "center" }}
              />
            ))}
          </View>
        </Field>
      ) : null}

      {live.next ? (
        <View style={{ gap: S.sm }}>
          <PText v="label">Siguiente reserva</PText>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
            <Tap onPress={() => onOpenBooking(live.next!.id)} accessibilityRole="button" accessibilityLabel={`${time(live.next.start)}, ${live.next.clientName}`} style={{ flex: 1, gap: 2 }}>
              <PText v="h3">{`${time(live.next.start)} · ${live.next.clientName}`}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: S.sm }}>
                <PText v="tiny">{plural(live.next.partySize, "persona", "personas")}</PText>
                <SourceTag source={live.next.source} />
              </View>
              <NoteLine note={live.next.note} />
            </Tap>
            {live.state !== "seated" && live.next.status === "confirmed" ? (
              <PButton label="Sentar ya" small variant="outline" disabled={pending || !can("table.seat")} onPress={close(() => actions.seat(live.next!))} style={{ minHeight: 44 }} />
            ) : null}
          </View>
        </View>
      ) : (
        <PText v="small">Sin más reservas hoy en esta mesa.</PText>
      )}

      {later.length ? (
        <View style={{ gap: 4 }}>
          <PText v="label">Más tarde</PText>
          {later.map((b) => (
            <Tap
              key={b.id}
              onPress={() => onOpenBooking(b.id)}
              accessibilityRole="button"
              accessibilityLabel={`${time(b.start)}, ${b.clientName}, ${b.partySize} personas`}
              style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 44, paddingHorizontal: 4, borderRadius: R.sm }}
            >
              <Text style={{ width: 48, fontFamily: FONT.semibold, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>{time(b.start)}</Text>
              <PText v="body" numberOfLines={1} style={{ flex: 1 }}>{b.clientName}</PText>
              <PText v="tiny">{`${b.partySize}p`}</PText>
            </Tap>
          ))}
        </View>
      ) : null}

      {canSeat && waiting.length ? (
        <View style={{ gap: S.sm }}>
          <PText v="label">De la lista de espera</PText>
          {waiting.map((w) => (
            <View key={w.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.semibold, fontSize: 14.5, color: C.text }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {w.clientName}
                  <Text style={{ fontFamily: FONT.medium, color: C.muted }}>{` · ${w.partySize}p`}</Text>
                </Text>
                <PText v="tiny">{`Esperando desde las ${time(w.start)}`}</PText>
              </View>
              <PButton label="Sentar aquí" small onPress={close(() => actions.seat(w, table.id))} style={{ minHeight: 44 }} />
            </View>
          ))}
        </View>
      ) : null}

      {!hasBookingsToday ? (
        <Tap
          onPress={confirmRemove}
          disabled={pending || !can("table.remove")}
          accessibilityRole="button"
          accessibilityLabel="Quitar esta mesa del plano"
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", opacity: pending || !can("table.remove") ? 0.5 : 1 }}
        >
          <Trash2 size={16} color={C.muted} strokeWidth={1.9} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>Quitar esta mesa del plano</Text>
        </Tap>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Añadir mesa                                                         */
/* ------------------------------------------------------------------ */

function AddTableDrawer({ open, onClose, defaultZone, onAdded }: { open: boolean; onClose: () => void; defaultZone: string; onAdded?: (zone: string) => void }) {
  const { data, update, pending, can } = usePro();
  const zones = zonesOf(data);
  const [name, setName] = React.useState("");
  const [seats, setSeats] = React.useState<"2" | "4" | "6" | "8" | "12">("4");
  const [zone, setZone] = React.useState(defaultZone);
  const [newZone, setNewZone] = React.useState("");
  const [shape, setShape] = React.useState<ProTable["shape"]>("square");

  React.useEffect(() => {
    if (!open) return;
    const n = data.tables.filter((t) => /^\d+$/.test(t.name)).map((t) => Number(t.name));
    setName(String((n.length ? Math.max(...n) : 0) + 1));
    setSeats("4");
    setZone(defaultZone);
    setNewZone("");
    setShape("square");
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targetZone = newZone.trim() || zone;

  const save = async () => {
    if (pending || !can("table.add")) return;
    const s = Number(seats);
    const w = shape === "bar" ? 5 : s <= 4 ? 2 : s <= 6 ? 3 : 4;
    const h = shape === "bar" ? 1 : s <= 8 ? 2 : 3;
    const spot = findSpot(data.tables.filter((t) => t.zone === targetZone), w, h);
    if (!spot) {
      toast("No cabe en esta zona", { kind: "error", body: "Quita alguna mesa o créala en otra zona." });
      return;
    }
    const table: ProTable = { id: localId("t"), name: name.trim() || "Nueva", seats: s, zone: targetZone, x: spot.x, y: spot.y, w, h, shape };
    if (!(await update("table.add", (d) => ({ ...d, tables: [...d.tables, table] })))) return;
    toast("Mesa añadida", { kind: "success", body: `${tableName({ ...data, tables: [...data.tables, table] }, table.id)} en ${targetZone}.` });
    onAdded?.(targetZone);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Añadir mesa"
      description="Se coloca en el primer hueco libre del plano de su zona."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Añadir" onPress={() => void save()} disabled={pending || !can("table.add") || !name.trim()} />
        </>
      }
    >
      <Field label="Nombre o número">
        <Input value={name} onChangeText={setName} label="Nombre o número" />
      </Field>
      <Field label="Personas">
        <ChoiceGrid value={seats} onChange={setSeats} options={(["2", "4", "6", "8", "12"] as const).map((v) => ({ value: v, label: v }))} />
      </Field>
      <Field label="Forma">
        <ChoiceGrid
          value={shape}
          onChange={setShape}
          options={[
            { value: "square", label: "Cuadrada" },
            { value: "round", label: "Redonda" },
            { value: "bar", label: "Barra", hint: "Para quien llega sin reservar" },
          ]}
        />
      </Field>
      <Field label="Zona">
        <ChoiceGrid value={zone} onChange={setZone} options={(zones.length ? zones : ["Sala"]).map((z) => ({ value: z, label: z }))} />
        <Input value={newZone} onChangeText={setNewZone} placeholder="O escribe una zona nueva" label="Nueva zona" style={{ marginTop: S.sm }} />
      </Field>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
        <Sparkles size={14} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
        <PText v="tiny" style={{ flex: 1 }}>Las reservas de Franky usan estas mesas para asignar la más ajustada a cada grupo.</PText>
      </View>
    </Sheet>
  );
}

function findSpot(tables: ProTable[], w: number, h: number): { x: number; y: number } | null {
  for (let y = 0; y + h <= ROWS; y++) {
    for (let x = 0; x + w <= COLS; x++) {
      const clash = tables.some((t) => x < t.x + t.w + 1 && x + w + 1 > t.x && y < t.y + t.h + 1 && y + h + 1 > t.y);
      if (!clash) return { x, y };
    }
  }
  return null;
}
