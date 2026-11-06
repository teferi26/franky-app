import React from "react";
import { Text, View } from "react-native";
import { AlertTriangle, Check, Combine, Heart, Star } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import { confirmationMessage, joinOptions, noShowHistory, reviewMessage, usualFor } from "../../../../../shared/pro/tables-ops";
import { allergensInNote, canAskReview, markContact, safeDishes } from "../../../../../shared/pro/tables-day";
import { ALLERGEN_BY_ID, hasAllergyNote, tableName } from "../../../../../shared/pro/tables";
import { localDate, localMinutes, plural } from "../../../../../shared/pro/format";
import { usePro } from "../../store";
import { PText } from "../../kit";
import { WhatsAppButton, useTablesOps } from "./ops";
import { statusTone } from "./ui";

/**
 * Lo que se sabe de una reserva antes de sentarla, versión nativa del
 * BookingExtras de la web: si ya falló otras veces, lo de siempre, qué puede
 * comer con su alergia, mesas para unir si el grupo no cabe y la reseña al
 * irse. Sin herramientas de hostelería (negocio real sin `tablesOps`) no pinta
 * nada.
 */
export function BookingExtras({ booking }: { booking: ProBooking }) {
  const { data, now, vertical, update, pending } = usePro();
  const { ops, save } = useTablesOps();
  if (!ops) return null;
  const today = localDate(now);
  const client = data.clients.find((c) => c.id === booking.clientId);
  const open = booking.status === "requested" || booking.status === "confirmed";
  const noShows = noShowHistory(data, { clientId: booking.clientId, name: booking.clientName, phone: client?.phone });
  const usual = usualFor(ops, booking.clientName);
  const avoid = hasAllergyNote(booking.note) ? allergensInNote(booking.note) : [];
  const safe = avoid.length ? safeDishes(data.menu, avoid) : [];

  // Unir mesas: solo si el grupo no cabe en la mesa que tiene.
  const date = localDate(booking.start);
  const from = localMinutes(booking.start);
  const duration = Math.round((Date.parse(booking.end) - Date.parse(booking.start)) / 60_000);
  const joined = booking.resourceIds && booking.resourceIds.length > 1 ? booking.resourceIds : null;
  const seatsNow = (joined ?? (booking.resourceId ? [booking.resourceId] : []))
    .map((id) => data.tables.find((t) => t.id === id)?.seats ?? 0)
    .reduce((a, b) => a + b, 0);
  const needsJoin = vertical.id !== "cafe" && open && date >= today && seatsNow < booking.partySize;
  const options = needsJoin ? joinOptions(data, date, from, duration, booking.partySize, booking.id) : [];

  const join = async (ids: string[]) => {
    const ok = await update("table.assign", (d) => ({
      ...d,
      bookings: d.bookings.map((b) => (b.id === booking.id ? { ...b, resourceId: ids[0], resourceIds: ids } : b)),
    }));
    if (ok)
      toast("Mesas unidas", {
        kind: "success",
        body: `${ids.map((id) => tableName(data, id)).join(" + ")} para ${booking.clientName.split(" ")[0]}.`,
      });
  };

  const reviewReady = canAskReview(data, ops, booking);
  const reviewAsked = ops.contacts.some((c) => c.bookingId === booking.id && c.reviewAskedAt);
  if (!(open && noShows) && !usual && !avoid.length && !needsJoin && !joined && !reviewReady && !reviewAsked) return null;
  const rose = statusTone("rose");
  const box = { borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg, paddingVertical: S.md, gap: 4 } as const;

  return (
    <View style={{ gap: S.sm }}>
      {open && noShows ? (
        <View style={{ borderRadius: R.lg, backgroundColor: rose.bg, paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={15} color={rose.fg} strokeWidth={1.9} />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: rose.fg }} maxFontSizeMultiplier={1.3}>
              {`No vino ${plural(noShows, "vez", "veces")}`}
            </Text>
          </View>
          <PText v="small" color={rose.fg}>
            {`Pídele que confirme el día antes${booking.partySize >= 6 ? " o una señal por Bizum" : ""}.`}
          </PText>
          <WhatsAppButton
            phone={client?.phone}
            message={confirmationMessage(booking, data.space.name, today)}
            label="Pedir confirmación"
            onOpen={() => void save("contact.remindedAt", (o) => markContact(o, booking.id, "remindedAt", new Date().toISOString()))}
          />
        </View>
      ) : null}

      {usual ? (
        <View style={[box, { flexDirection: "row", gap: S.sm }]}>
          <Heart size={15} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
          <PText v="body" style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.semibold }}>Lo de siempre: </Text>
            {usual}
          </PText>
        </View>
      ) : null}

      {avoid.length ? (
        <View style={box}>
          <PText v="h3">{`Puede tomar ${safe.length} de ${data.menu.filter((m) => m.available).length}`}</PText>
          <PText v="tiny">{`Sin ${avoid.map((a) => ALLERGEN_BY_ID[a].label.toLowerCase()).join(", ")}`}</PText>
          <PText v="body" color={C.muted}>
            {`${safe
              .slice(0, 8)
              .map((m) => m.name)
              .join(", ")}${safe.length > 8 ? ` y ${safe.length - 8} más` : ""}`}
          </PText>
        </View>
      ) : null}

      {joined ? (
        <View style={[box, { flexDirection: "row", alignItems: "center", gap: S.sm }]}>
          <Combine size={15} color={C.blue} strokeWidth={1.9} />
          <PText v="body" style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT.semibold }}>Mesas unidas: </Text>
            {`${joined.map((id) => tableName(data, id)).join(" + ")} (${seatsNow} p)`}
          </PText>
        </View>
      ) : null}

      {needsJoin ? (
        <View style={[box, { borderStyle: "dashed", gap: S.sm }]}>
          <PText v="h3">No caben en una mesa: une dos o tres</PText>
          {options.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {options.map((set) => (
                <Tap
                  key={set.map((t) => t.id).join("+")}
                  disabled={pending}
                  onPress={() => void join(set.map((t) => t.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Unir ${set.map((t) => tableName(data, t.id)).join(" y ")}`}
                  style={{ minHeight: 48, borderRadius: R.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 6, justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
                    {set.map((t) => tableName(data, t.id)).join(" + ")}
                  </Text>
                  <PText v="tiny">{`${set.reduce((a, t) => a + t.seats, 0)} p, ${set[0].zone}`}</PText>
                </Tap>
              ))}
            </View>
          ) : (
            <PText v="tiny">A esa hora no quedan mesas libres juntas en la misma zona.</PText>
          )}
        </View>
      ) : null}

      {reviewReady ? (
        <View style={[box, { gap: S.sm }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Star size={15} color={C.blue} strokeWidth={1.9} />
            <PText v="body" style={{ flex: 1 }}>
              Se acaba de ir contento: es el momento de pedirle la reseña.
            </PText>
          </View>
          <WhatsAppButton
            phone={client?.phone}
            message={reviewMessage(booking.clientName, data.space.name, ops.reviewLink ?? "")}
            label="Pedir reseña"
            onOpen={() => void save("contact.reviewAskedAt", (o) => markContact(o, booking.id, "reviewAskedAt", new Date().toISOString()))}
          />
        </View>
      ) : reviewAsked ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Check size={13} color={C.muted} />
          <PText v="tiny">Reseña pedida</PText>
        </View>
      ) : null}
    </View>
  );
}
