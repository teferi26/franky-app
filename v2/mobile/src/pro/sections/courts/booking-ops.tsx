import React from "react";
import { Linking, Text, View } from "react-native";
import { AlertTriangle, Check, MessageCircle, Pencil, Plus, Repeat, UserPlus } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import { localId, usePro } from "../../store";
import type { ProBooking, ProPayment } from "../../../../../shared/pro/types";
import { atLocal, dayLabel, localDate, localMinutes, minutesToLabel, money, time } from "../../../../../shared/pro/format";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { courtsOps } from "../../../../../shared/pro/courts-base";
import {
  addExtra,
  addWaiter,
  extrasOf,
  isFlagged,
  noShowCount,
  payShare,
  playerShares,
  renameShare,
  seriesOf,
  setWaiterStatus,
  waitersFor,
} from "../../../../../shared/pro/courts-ops";
import { bookingMinutes, isFree, priceFor } from "../../../../../shared/pro/courts";
import { ChoiceGrid, Input, Meter, PAvatar, PButton, PText, Pill } from "../../kit";

/**
 * Piezas de la ficha de una reserva de pista (versión nativa de web
 * courts/booking-ops.tsx): quién ha pagado su parte, extras de mostrador,
 * turno fijo y ausencias, y lista de espera con el aviso ya escrito.
 */

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

export const METHOD_LABEL: Record<ProPayment["method"], string> = {
  card: "Tarjeta",
  cash: "Efectivo",
  bizum: "Bizum",
};

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/** Botón de WhatsApp con el mensaje escrito; no se pinta sin un móvil válido. */
export function WhatsAppButton({ phone, message, label = "WhatsApp", onSent }: {
  phone?: string;
  message: string;
  label?: string;
  onSent?: () => void;
}) {
  const href = customerWhatsApp(phone, message);
  if (!href) return null;
  return (
    <PButton
      label={label}
      icon={MessageCircle}
      variant="outline"
      small
      onPress={() => {
        onSent?.();
        void Linking.openURL(href);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Pago por jugador                                                    */
/* ------------------------------------------------------------------ */

export function SharesPanel({ booking }: { booking: ProBooking }) {
  const { data, update } = usePro();
  const shares = playerShares(data, booking);
  const [charging, setCharging] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState<ProPayment["method"]>("bizum");
  const [editing, setEditing] = React.useState<number | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");

  const paid = shares.filter((s) => s.dueCents === 0).length;
  const resource = data.resources.find((r) => r.id === booking.resourceId);
  const when = `${dayLabel(booking.start)} a las ${time(booking.start)}`;

  const charge = (index: number) => {
    const share = shares[index];
    void update("court.share.pay", (d) =>
      payShare(d, { bookingId: booking.id, index, method, at: new Date().toISOString(), paymentId: localId("p") }),
    );
    toast("Parte cobrada", {
      kind: "success",
      body: `${firstName(share.name)} ha pagado ${money(share.dueCents)} con ${METHOD_LABEL[method].toLowerCase()}.`,
    });
    setCharging(null);
  };

  const saveName = (index: number) => {
    if (name.trim().length < 2) return;
    void update("court.share.rename", (d) => renameShare(d, booking.id, index, { name: name.trim(), phone: phone.trim() || undefined }));
    setEditing(null);
  };

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
        <PText v="h3">{paid === shares.length ? "Han pagado los cuatro" : `${paid} de ${shares.length} han pagado`}</PText>
        <PText v="small" style={{ fontVariant: ["tabular-nums"] }}>{`${money(booking.paidCents ?? 0)} de ${money(booking.priceCents)}`}</PText>
      </View>
      <Meter value={paid} max={shares.length} tone={paid === shares.length ? "success" : "warning"} />
      {shares.map((s, i) => (
        <View key={i} style={{ gap: S.sm, paddingVertical: S.sm, borderTopWidth: i ? 1 : 0, borderTopColor: C.borderLight }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <PAvatar name={s.name} size={32} toneKey={s.dueCents ? "slate" : "emerald"} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{s.name}</PText>
              <PText v="tiny">
                {s.dueCents === 0
                  ? `${money(s.amountCents)} pagados${s.method ? ` con ${METHOD_LABEL[s.method].toLowerCase()}` : ""}`
                  : `Debe ${money(s.dueCents)}`}
              </PText>
            </View>
            {s.dueCents === 0 ? (
              <Check size={18} color={C.success} accessibilityLabel="Pagado" />
            ) : (
              <>
                <Tap
                  onPress={() => {
                    setEditing(editing === i ? null : i);
                    setName(s.name.startsWith("Jugador ") ? "" : s.name);
                    setPhone(s.phone ?? "");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar a ${s.name}`}
                  style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Pencil size={15} color={C.muted} />
                </Tap>
                <PButton label="Cobrar" small variant={charging === i ? "dark" : "outline"} onPress={() => setCharging(charging === i ? null : i)} />
              </>
            )}
          </View>
          {charging === i ? (
            <View style={{ gap: S.sm }}>
              <ChoiceGrid
                value={method}
                onChange={setMethod}
                options={(["bizum", "card", "cash"] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
              />
              <PButton label={`Cobrar ${money(s.dueCents)}`} small onPress={() => charge(i)} />
            </View>
          ) : null}
          {editing === i ? (
            <View style={{ gap: S.sm }}>
              <Input value={name} onChangeText={setName} placeholder="Nombre" label="Nombre del jugador" />
              <Input value={phone} onChangeText={setPhone} placeholder="Móvil" keyboardType="phone-pad" label="Móvil del jugador" />
              <PButton label="Guardar" small variant="outline" onPress={() => saveName(i)} />
            </View>
          ) : null}
          {s.dueCents > 0 && s.phone && charging !== i && editing !== i ? (
            <WhatsAppButton
              phone={s.phone}
              label={`Recordar a ${firstName(s.name)}`}
              message={`Hola ${firstName(s.name)}, te escribimos de ${data.space.name}. Te falta tu parte de la ${resource?.name.toLowerCase() ?? "pista"} del ${when}: ${money(s.dueCents)}. Puedes pagarla por Bizum o en el mostrador. Gracias.`}
            />
          ) : null}
        </View>
      ))}
      <PText v="tiny">{`Quedan por cobrar ${money(shares.reduce((a, s) => a + s.dueCents, 0))} de esta reserva.`}</PText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Extras de mostrador                                                 */
/* ------------------------------------------------------------------ */

export function ExtrasPanel({ booking }: { booking: ProBooking }) {
  const { data, update } = usePro();
  const shop = courtsOps(data).shop;
  const extras = extrasOf(data, booking.id);
  if (!shop.length) return null;
  return (
    <View style={{ gap: S.sm }}>
      <PText v="h3">Palas, bolas y bebidas</PText>
      {extras.length ? (
        <PText v="small">
          {`${extras.map((e) => `${e.qty} × ${e.name}`).join(", ")} · ${money(extras.reduce((a, e) => a + e.priceCents * e.qty, 0))}`}
        </PText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {shop.map((item) => {
          const out = item.stock !== null && item.stock <= 0;
          return (
            <Tap
              key={item.id}
              disabled={out}
              onPress={() => {
                void update("court.extra.add", (d) => addExtra(d, booking.id, item, 1));
                toast("Añadido", { kind: "success", body: `${item.name}, ${money(item.priceCents)}.` });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Añadir ${item.name}, ${money(item.priceCents)}`}
              style={{ minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: S.md, borderRadius: R.full, borderWidth: 1, borderColor: C.border, opacity: out ? 0.4 : 1 }}
            >
              <Plus size={14} color={C.text} />
              <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.text }} maxFontSizeMultiplier={1.3}>{item.name}</Text>
              <Text style={{ fontSize: 12.5, color: C.muted }} maxFontSizeMultiplier={1.3}>{money(item.priceCents)}</Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pastillas de la ficha                                               */
/* ------------------------------------------------------------------ */

export function BookingFlags({ booking }: { booking: ProBooking }) {
  const { data } = usePro();
  const series = seriesOf(data, booking.id);
  const absences = noShowCount(data, booking.clientId);
  return (
    <>
      {series ? <Pill tone="info" icon={Repeat} label={`Turno fijo, ${WEEKDAYS[series.weekday]}`} /> : null}
      {isFlagged(data, booking.clientId) ? (
        <Pill tone="danger" icon={AlertTriangle} label={`${absences} ausencias`} />
      ) : absences ? (
        <Pill tone="warning" label={`${absences} ${absences === 1 ? "ausencia" : "ausencias"}`} />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de espera                                                     */
/* ------------------------------------------------------------------ */

export function AddWaiterForm({ booking }: { booking: ProBooking }) {
  const { data, update } = usePro();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const slot = {
    resourceId: booking.resourceId,
    date: localDate(booking.start),
    from: localMinutes(booking.start),
    duration: bookingMinutes(booking),
  };
  const waiting = waitersFor(data, slot);

  const save = () => {
    if (name.trim().length < 2) return;
    void update("court.waitlist.add", (d) =>
      addWaiter(d, {
        id: localId("le"),
        ...slot,
        name: name.trim(),
        phone: phone.trim() || undefined,
        createdAt: new Date().toISOString(),
        status: "waiting",
      }),
    );
    toast("En lista de espera", {
      kind: "success",
      body: `Si esta franja se libera, ${firstName(name.trim())} será ${waiting.length ? `el número ${waiting.length + 1}` : "el primero"} en saberlo.`,
    });
    setName("");
    setPhone("");
    setOpen(false);
  };

  return (
    <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: S.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <View style={{ flex: 1 }}>
          <PText v="h3">Lista de espera</PText>
          <PText v="tiny">
            {waiting.length
              ? `${waiting.length} ${waiting.length === 1 ? "persona espera" : "personas esperan"}: ${waiting.map((w) => w.name).join(", ")}`
              : "Nadie espera esta franja"}
          </PText>
        </View>
        <PButton label="Apuntar" icon={UserPlus} small variant="ghost" onPress={() => setOpen(!open)} />
      </View>
      {open ? (
        <View style={{ gap: S.sm }}>
          <Input value={name} onChangeText={setName} placeholder="Nombre" label="Nombre de quien espera" />
          <Input value={phone} onChangeText={setPhone} placeholder="Móvil" keyboardType="phone-pad" label="Móvil de quien espera" />
          <PButton label="Apuntar" small onPress={save} disabled={name.trim().length < 2} />
        </View>
      ) : null}
    </View>
  );
}

/** Tras cancelar: quién esperaba esa franja, con el aviso escrito y reserva en un toque. */
export function FreedSlotPanel({ slot, onDone }: {
  slot: { resourceId?: string; date: string; from: number; duration: number };
  onDone: () => void;
}) {
  const { data, update } = usePro();
  const waiters = waitersFor(data, slot);
  const resource = data.resources.find((r) => r.id === slot.resourceId);
  const price = resource ? priceFor(resource, slot.date, slot.from, slot.duration) : null;
  const when = `${dayLabel(atLocal(slot.date, slot.from))} a las ${minutesToLabel(slot.from)}`;

  const book = (id: string) => {
    const w = waiters.find((x) => x.id === id);
    if (!w || !resource) return;
    if (!isFree(data, resource, slot.date, slot.from, slot.duration)) {
      toast("Ya no está libre", { kind: "info", body: "Alguien la ha reservado mientras tanto." });
      return;
    }
    void update("court.waitlist.book", (d) => {
      const booking: ProBooking = {
        id: localId("b"),
        kind: "court",
        clientId: w.clientId,
        clientName: w.name,
        resourceId: resource.id,
        start: atLocal(slot.date, slot.from),
        end: atLocal(slot.date, slot.from + slot.duration),
        partySize: resource.kind === "court" ? 4 : 1,
        status: "confirmed",
        priceCents: price ?? 0,
        paidCents: 0,
        source: "phone",
        note: "Desde la lista de espera",
      };
      return setWaiterStatus({ ...d, bookings: [...d.bookings, booking] }, w.id, "booked", new Date().toISOString());
    });
    toast("Reservada", { kind: "success", body: `${resource.name} para ${w.name}, ${when}.` });
    onDone();
  };

  if (!waiters.length) return null;
  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: `${C.blue}40`, backgroundColor: C.accentSoft, padding: S.md, gap: S.sm }}>
      <PText v="h3" color={C.blueDeep}>
        {waiters.length === 1 ? "1 persona esperaba esta franja" : `${waiters.length} personas esperaban esta franja`}
      </PText>
      <PText v="tiny" color={C.blueDeep}>Avisa al primero con la hora y el precio. Si la quiere, resérvasela aquí mismo.</PText>
      {waiters.map((w, i) => (
        <View key={w.id} style={{ borderRadius: R.md, backgroundColor: C.surface, padding: S.sm, gap: S.sm }}>
          <PText v="h3" numberOfLines={1}>{`${i + 1}. ${w.name}${w.status === "notified" ? " (avisado)" : ""}`}</PText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            <WhatsAppButton
              phone={w.phone}
              label="Avisar"
              onSent={() => void update("court.waitlist.notify", (d) => setWaiterStatus(d, w.id, "notified", new Date().toISOString()))}
              message={`Hola ${firstName(w.name)}, se ha liberado la ${resource?.name.toLowerCase() ?? "pista"} el ${when}${price ? ` (${money(price)})` : ""} en ${data.space.name}. ¿Te la reservamos?`}
            />
            <PButton label="Reservar" small onPress={() => book(w.id)} />
          </View>
        </View>
      ))}
    </View>
  );
}
