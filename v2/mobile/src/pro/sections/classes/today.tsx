import React from "react";
import { Linking, View } from "react-native";
import { ArrowRight, Check, MessageCircle, Package, Phone, Star } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { dayLabel, localDate, plural, time } from "../../../../../shared/pro/format";
import { extrasOf, withExtras } from "../../../../../shared/pro/classes-care";
import {
  patchRoomBooking,
  reminderMessage,
  reviewCandidates,
  reviewMessage,
  tomorrowGroups,
  typeExtra,
  type RoomGroup,
} from "../../../../../shared/pro/classes-ops";
import { leadMessage, leadStageLabel, leadsToCall, snoozeLead } from "../../../../../shared/pro/classes-growth";
import {
  continuityDue,
  continuityMessage,
  formatGrade,
  markContinuityOffered,
  needsReinforcement,
  reinforcementMessage,
} from "../../../../../shared/pro/classes-study";
import {
  SEAT_UNIT_LABEL,
  birthdayMessage,
  birthdaysComing,
  formatQuantity,
  markBirthdayGreeted,
  materialNeeds,
} from "../../../../../shared/pro/classes-leisure";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { C } from "@/theme";
import { usePro } from "../../store";
import { useGoSection } from "../../shell";
import { Empty, ListRow, PAvatar, PButton, Panel, Pill, PText } from "../../kit";
import { openWhatsApp } from "./care";
import { LinkText } from "./ui";

/**
 * Piezas de Hoy en el móvil que en la web están repartidas entre
 * `today-extras.tsx`, `room.tsx`, `study.tsx` y `leisure.tsx`: interesados
 * para hoy, recordatorios de mañana y reseñas (ocio), cumpleaños que vuelven,
 * material de los talleres, quién va flojo antes del examen y el grupo que
 * sigue (academias). Cada panel desaparece si no tiene nada que enseñar.
 */

function senderOf(data: { space: { name: string; owner: { firstName?: string } } }) {
  return data.space.owner.firstName || data.space.name;
}

export function LeadsTodayPanel() {
  const { data, now, vertical, update } = usePro();
  const go = useGoSection();
  const list = leadsToCall(data, now);
  if (!list.length) return null;
  return (
    <Panel
      title="Interesados para hoy"
      description={`${plural(list.length, "persona espera", "personas esperan")} que le escribas. El mensaje ya va escrito.`}
      action={<LinkText label="Todos" icon={ArrowRight} onPress={() => go("clientes")} />}
      flush
    >
      {list.slice(0, 4).map((lead, i, shown) => {
        const link = customerWhatsApp(lead.phone, leadMessage(lead, senderOf(data), data.space.name, vertical.id));
        const snooze = () => void update("lead.update", (d) => snoozeLead(d, lead.id, lead.stage === "new" ? 2 : 1, now));
        return (
          <ListRow key={lead.id} last={i === shown.length - 1}>
            <PAvatar name={lead.name} size={32} toneKey="violet" />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{lead.name}</PText>
              <PText v="tiny" numberOfLines={1}>
                {`${leadStageLabel(lead.stage, vertical.id)}${lead.interest ? ` · ${lead.interest}` : ""}`}
              </PText>
            </View>
            {link ? (
              <PButton small variant="secondary" icon={MessageCircle} label="Escribir" onPress={() => openWhatsApp(link, snooze)} />
            ) : lead.phone ? (
              <PButton
                small
                variant="ghost"
                icon={Phone}
                label="Llamar"
                onPress={() => void Linking.openURL(`tel:${lead.phone!.replace(/\s/g, "")}`)}
              />
            ) : null}
          </ListRow>
        );
      })}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Ocio: mañana, reseñas, cumpleaños y material                        */
/* ------------------------------------------------------------------ */

export function TomorrowRemindersPanel() {
  const { data, now, update } = usePro();
  const groups = tomorrowGroups(data, now);
  const policy = extrasOf(data).policy;
  const pending = groups.filter((g) => !g.info.remindedAt);
  const mark = (g: RoomGroup) =>
    void update("room.remind", (d) => patchRoomBooking(d, g.booking.id, { remindedAt: now.toISOString() }));
  return (
    <Panel
      title="Recordatorios de mañana"
      description={
        groups.length
          ? `${plural(groups.length, "grupo", "grupos")} mañana, ${pending.length ? `${pending.length} sin recordar` : "todos recordados"}. Es lo que más baja los no presentados.`
          : undefined
      }
      flush
    >
      {groups.length ? (
        groups.map((g, i) => {
          const link = customerWhatsApp(g.info.phone, reminderMessage(g, data.space.name, data.space.address, policy.courtesyMin));
          const done = Boolean(g.info.remindedAt);
          return (
            <ListRow key={g.booking.id} last={i === groups.length - 1}>
              <PText v="h3" style={{ width: 46 }}>{time(g.session.start)}</PText>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{g.booking.clientName}</PText>
                <PText v="tiny" numberOfLines={1}>
                  {`${g.typeName} · ${plural(g.info.players ?? g.booking.partySize, "jugador", "jugadores")}${g.info.language === "en" ? " · en inglés" : ""}`}
                </PText>
              </View>
              {done ? (
                <Pill label="Recordado" tone="success" icon={Check} />
              ) : link ? (
                <PButton small variant="secondary" icon={MessageCircle} label="Recordar" onPress={() => openWhatsApp(link, () => mark(g))} />
              ) : (
                <PButton
                  small
                  variant="ghost"
                  label="Hecho"
                  onPress={() => {
                    mark(g);
                    toast("Marcado como recordado", { kind: "success" });
                  }}
                />
              )}
            </ListRow>
          );
        })
      ) : (
        <Empty icon={MessageCircle} title="Mañana no hay grupos" body="Cuando alguien reserve para mañana, aquí tendrás su recordatorio listo para enviar." />
      )}
    </Panel>
  );
}

export function ReviewAskPanel() {
  const { data, now, update } = usePro();
  const x = extrasOf(data);
  const list = reviewCandidates(data, now);
  if (!list.length && !x.reviews.asked) return null;
  const ask = (g: RoomGroup) =>
    void update("room.review", (d) =>
      withExtras(patchRoomBooking(d, g.booking.id, { reviewAskedAt: now.toISOString() }), (e) => ({
        ...e,
        reviews: { ...e.reviews, asked: e.reviews.asked + 1 },
      })),
    );
  return (
    <Panel
      title="Acaban de salir"
      description={`Pide la reseña ahora, que salen contentos. Llevas ${x.reviews.asked} pedidas y ${x.reviews.received} conseguidas.`}
      flush
    >
      {list.length ? (
        list.map((g, i) => {
          const link = customerWhatsApp(g.info.phone, reviewMessage(g, data.space.name, x.policy.reviewUrl));
          return (
            <ListRow key={g.booking.id} last={i === list.length - 1}>
              <PAvatar name={g.booking.clientName} size={32} toneKey="emerald" />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{g.booking.clientName}</PText>
                <PText v="tiny" numberOfLines={1}>{`${g.typeName}, salieron a las ${time(g.session.end)}`}</PText>
              </View>
              {link ? (
                <PButton small variant="secondary" icon={Star} label="Pedir reseña" onPress={() => openWhatsApp(link, () => ask(g))} />
              ) : (
                <PButton small variant="ghost" label="Pedida en persona" onPress={() => ask(g)} />
              )}
            </ListRow>
          );
        })
      ) : (
        <Empty icon={Star} title="Nadie acaba de salir" body="Cuando termine una partida, el grupo aparecerá aquí para pedirle la reseña." />
      )}
    </Panel>
  );
}

export function BirthdaysPanel() {
  const { data, now, update } = usePro();
  const coming = birthdaysComing(data, now);
  if (!coming.length) return null;
  return (
    <Panel title="Cumpleaños que vuelven" description="Lo celebraron aquí el año pasado. Un mensaje ahora y repiten." flush>
      {coming.map((b, i) => {
        const link = customerWhatsApp(b.phone, birthdayMessage(b, senderOf(data), data.space.name));
        return (
          <ListRow key={b.bookingId} last={i === coming.length - 1}>
            <PAvatar name={b.honoree} size={32} toneKey="violet" />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{`Cumple de ${b.honoree}`}</PText>
              <PText v="tiny" numberOfLines={1}>
                {`${b.daysLeft === 0 ? "Hoy" : `En ${plural(b.daysLeft, "día", "días")}`} · reservó ${b.contactName}`}
              </PText>
            </View>
            {link ? (
              <PButton
                small
                variant="secondary"
                icon={MessageCircle}
                label="Felicitar"
                onPress={() => openWhatsApp(link, () => void update("room.greeted", (d) => markBirthdayGreeted(d, b.bookingId, now)))}
              />
            ) : null}
          </ListRow>
        );
      })}
    </Panel>
  );
}

export function MaterialPanel() {
  const { data, now } = usePro();
  const needs = materialNeeds(data, now).filter((n) => n.seats > 0);
  if (!needs.length) return null;
  const short = needs.reduce((a, n) => a + n.shortSeats, 0);
  return (
    <Panel
      title="Material de la semana"
      description={
        short
          ? `Te falta material para ${plural(short, "plaza", "plazas")} con las reservas de los próximos 7 días.`
          : "Tienes material para todas las reservas de los próximos 7 días."
      }
      flush
    >
      {needs.map((n, i) => (
        <ListRow key={n.classType.id} last={i === needs.length - 1}>
          <Package size={18} color={C.muted} strokeWidth={1.8} />
          <View style={{ flex: 1 }}>
            <PText v="h3" numberOfLines={1}>{n.classType.name}</PText>
            <PText v="tiny" numberOfLines={2}>
              {`${plural(n.seats, "plaza", "plazas")} gastan ${formatQuantity(n.need)} ${SEAT_UNIT_LABEL[n.material.unit]} de ${n.material.item}, tienes ${formatQuantity(n.material.stock)}`}
            </PText>
          </View>
          {n.shortSeats ? <Pill label={`Faltan para ${n.shortSeats}`} tone="danger" /> : <Pill label="Hay de sobra" tone="success" />}
        </ListRow>
      ))}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Academias: refuerzo antes del examen y grupo siguiente              */
/* ------------------------------------------------------------------ */

export function ReinforcementPanel() {
  const { data, now } = usePro();
  const today = localDate(now);
  const soon = data.classTypes
    .map((ct) => ({ ct, examOn: typeExtra(data, ct.id).examOn }))
    .filter((x) => Boolean(x.examOn && x.examOn >= today))
    .sort((a, b) => (a.examOn ?? "").localeCompare(b.examOn ?? ""))
    .map((x) => ({ ...x, weak: needsReinforcement(data, x.ct.id) }))
    .filter((x) => x.weak.length)[0];
  if (!soon || !soon.examOn) return null;
  const examOn = soon.examOn;
  return (
    <Panel
      title="Van flojos antes del examen"
      description={`${soon.ct.name}, examen el ${dayLabel(`${examOn}T12:00:00Z`, { weekday: false })}. Media reciente por debajo del cinco o bajando.`}
      flush
    >
      {soon.weak.slice(0, 4).map(({ member, trend }, i, shown) => {
        const link = customerWhatsApp(
          member.phone,
          reinforcementMessage(member, soon.ct.name, examOn, today, senderOf(data), data.space.name),
        );
        return (
          <ListRow key={member.id} last={i === shown.length - 1}>
            <PAvatar name={member.name} size={32} toneKey="rose" />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{member.name}</PText>
              <PText v="tiny" numberOfLines={1}>
                {`Última nota ${formatGrade(trend.last ?? 0)}, media ${formatGrade(trend.average ?? 0)}`}
              </PText>
            </View>
            {link ? <PButton small variant="secondary" label="Refuerzo" onPress={() => openWhatsApp(link)} /> : null}
          </ListRow>
        );
      })}
    </Panel>
  );
}

export function ContinuityPanel() {
  const { data, now, update } = usePro();
  const due = continuityDue(data, now);
  if (!due.length) return null;
  return (
    <Panel
      title="Siguiente asignatura"
      description="Sus grupos acaban ahora. Guárdales sitio en el siguiente antes de que busquen otra academia."
      flush
    >
      {due.flatMap((item) =>
        item.students.slice(0, 4).map((m, i, shown) => {
          const when = item.nextSession
            ? `el ${dayLabel(item.nextSession.start, { weekday: true }).split(",")[0].toLowerCase()} a las ${time(item.nextSession.start)}`
            : "";
          const link = customerWhatsApp(m.phone, continuityMessage(m, item, when, senderOf(data), data.space.name));
          return (
            <ListRow key={`${item.from.id}-${m.id}`} last={i === shown.length - 1}>
              <PAvatar name={m.name} size={32} toneKey="violet" />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{m.name}</PText>
                <PText v="tiny" numberOfLines={1}>{`${item.from.name} a ${item.to.name}`}</PText>
              </View>
              {link ? (
                <PButton
                  small
                  variant="secondary"
                  icon={MessageCircle}
                  label="Proponer"
                  onPress={() => openWhatsApp(link, () => void update("member.continuity", (d) => markContinuityOffered(d, [m.id], now)))}
                />
              ) : null}
            </ListRow>
          );
        }),
      )}
    </Panel>
  );
}
