import React from "react";
import { Text, View } from "react-native";
import {
  AlertTriangle,
  ArrowRight,
  Cake,
  Calculator,
  CalendarRange,
  Check,
  GraduationCap,
  HeartHandshake,
  NotebookPen,
  TrendingDown,
  Trophy,
  Users,
  UtensilsCrossed,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking } from "../../../../../shared/pro/types";
import {
  birthdaysSoon,
  bookingsToConfirm,
  comebackMessage,
  confirmationMessage,
  dormantRegulars,
  noShowHistory,
  septemberRadar,
  upcomingEvents,
  valleySuggestion,
  waitlistReadyMessage,
} from "../../../../../shared/pro/tables-ops";
import {
  birthdayMessage,
  droppedTables,
  eventToday,
  groupsClosingSoon,
  groupsOn,
  lastClosingNote,
  marginAlerts,
  markContact,
  markDropped,
  rotaToday,
} from "../../../../../shared/pro/tables-day";
import { VENUE_EVENT_KIND_LABEL, examStudyHours, seasonMoments, type SeasonMoment } from "../../../../../shared/pro/tables-insights";
import { addDays, dayLabel, localDate, localMinutes, minutesToLabel, money, plural, shortDay, time, weekdayIndex } from "../../../../../shared/pro/format";
import { TURNS, stampsFor, tableName, turnOf } from "../../../../../shared/pro/tables";
import { usePro } from "../../store";
import { useGoSection } from "../../shell";
import { Bars, ListRow, LiveDot, Meter, PAvatar, PButton, PText, Panel, Pill, Segmented } from "../../kit";
import type { OfferPreset } from "../common/offer-composer";
import { StampDots, StudentMark } from "./table-kit";
import { WhatsAppButton, staffFirstName, useTablesOps } from "./ops";
import { Card, TextLink, statusTone } from "./ui";

/**
 * Tarjetas de Hoy de bar, restaurante y cafetería, versión nativa de
 * service-kit.tsx y day-cards.tsx de la web. Cada una se esconde sola si no
 * tiene nada útil que decir: Hoy no se llena de avisos vacíos.
 */

type OnOffer = (preset: OfferPreset) => void;

/* ------------------------------------------------------------------ */
/* Nota del cierre de ayer                                              */
/* ------------------------------------------------------------------ */

export function ClosingNoteBanner() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  if (!ops) return null;
  const note = lastClosingNote(ops, localDate(now));
  if (!note) return null;
  return (
    <Card style={{ flexDirection: "row", gap: S.md, paddingVertical: S.md }}>
      <NotebookPen size={16} color={C.blue} strokeWidth={1.9} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <PText v="h3">{`Nota del cierre del ${shortDay(`${note.date}T12:00:00Z`)}, ${staffFirstName(data, note.staffId)}`}</PText>
        <PText v="body" color={C.muted}>{note.note}</PText>
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Temporada universitaria                                              */
/* ------------------------------------------------------------------ */

/** Oferta preparada para cada momento del curso que abre el compositor. */
function seasonOffer(moment: SeasonMoment, vertical: string): OfferPreset {
  if (moment.id === "erasmus")
    return {
      title: "Bienvenida Erasmus",
      what: vertical === "cafe" ? "Primer café a precio de estudiante" : "Primera consumición con tapa de bienvenida",
      slots: 40,
    };
  if (vertical === "bar")
    return { title: "Desconexión de exámenes", what: "Caña y tapa de media tarde para estudiantes", from: 17 * 60, to: 20 * 60, slots: 30 };
  return { title: "Menú exprés de exámenes", what: "Menú del día para llevar con hora de recogida", from: 13 * 60, to: 15 * 60 + 30, slots: 30 };
}

/**
 * Lo que toca preparar según el calendario de la universidad: exámenes,
 * Erasmus, cenas de Navidad de clase y graduaciones.
 */
export function SeasonCard({ onOffer }: { onOffer: OnOffer }) {
  const { data, now, vertical } = usePro();
  const { ops, save } = useTablesOps();
  const go = useGoSection();
  const today = localDate(now);
  const moments = seasonMoments(vertical.id, today).slice(0, 2);
  if (!moments.length) return null;
  const hours = data.space.hours[weekdayIndex(today)];

  return (
    <Panel title="Calendario del curso" description="Lo que suele pasar estas semanas en las universidades de tu zona." flush>
      {moments.map((m, i) => {
        const study = ops?.study;
        const examCafe = vertical.id === "cafe" && (m.id === "exams_winter" || m.id === "exams_summer");
        const extended = study ? examStudyHours(study, hours?.close ?? null) : null;
        const canExtend = Boolean(study?.enabled && extended && extended.toMinute > study.toMinute);
        return (
          <View key={m.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === moments.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <CalendarRange size={15} color={C.blue} strokeWidth={1.9} />
              <PText v="h3" style={{ flex: 1 }}>
                {m.title}
              </PText>
              <Pill tone={m.phase === "now" ? "violet" : "neutral"} label={m.phase === "now" ? "Ahora" : `En ${plural(m.inDays, "día", "días")}`} />
            </View>
            <PText v="body" color={C.muted}>{m.body}</PText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {examCafe ? (
                <>
                  {canExtend && study && extended ? (
                    <PButton
                      label={`Abrir hasta las ${minutesToLabel(extended.toMinute)}`}
                      small
                      onPress={async () => {
                        const ok = await save("study.exams", (o) => (o.study ? { ...o, study: { ...o.study, ...extended } } : o));
                        if (ok) toast("Sitio para estudiar ampliado", { kind: "success", body: `De ${minutesToLabel(extended.fromMinute)} a ${minutesToLabel(extended.toMinute)}.` });
                      }}
                    />
                  ) : null}
                  <PButton label="Bono de estudio" variant="outline" small onPress={() => go("bonos")} />
                </>
              ) : m.action.section === "grupos" ? (
                <PButton label={m.action.label} small onPress={() => go("grupos")} />
              ) : (
                <PButton label={m.action.label} small onPress={() => onOffer(seasonOffer(m, vertical.id))} />
              )}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmar por WhatsApp                                               */
/* ------------------------------------------------------------------ */

export function ConfirmPanel() {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  const [all, setAll] = React.useState(false);
  if (!ops) return null;
  const today = localDate(now);
  const list = bookingsToConfirm(data, ops, now);
  if (!list.length) return null;
  const confirmed = list.filter((x) => x.state === "confirmed").length;
  const visible = all ? list : list.slice(0, 6);
  const mark = (id: string, field: "remindedAt" | "confirmedAt") =>
    save(`contact.${field}`, (o) => markContact(o, id, field, new Date().toISOString()));

  return (
    <Panel
      title="Confirma las reservas"
      description={`${confirmed} de ${list.length} confirmadas para hoy y mañana. Un mensaje el día antes evita la mayoría de plantones.`}
      flush
    >
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
        <Meter value={confirmed} max={list.length} tone="success" />
      </View>
      {visible.map(({ booking, state, phone }, i) => {
        const noShows = noShowHistory(data, { clientId: booking.clientId, name: booking.clientName, phone });
        return (
          <View
            key={booking.id}
            style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === visible.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
              <View style={{ width: 48 }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>
                  {time(booking.start)}
                </Text>
                <PText v="tiny">{localDate(booking.start) === today ? "hoy" : "mañana"}</PText>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <PText v="h3" numberOfLines={1}>
                  {booking.clientName}
                </PText>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <PText v="tiny">{plural(booking.partySize, "persona", "personas")}</PText>
                  {noShows ? <Pill tone="danger" label={`No vino ${plural(noShows, "vez", "veces")}`} /> : null}
                </View>
              </View>
              {state === "confirmed" ? <Pill tone="success" icon={Check} label="Confirmada" /> : null}
            </View>
            {state !== "confirmed" ? (
              <View style={{ flexDirection: "row", gap: S.sm, paddingLeft: 48 + S.md }}>
                <WhatsAppButton
                  phone={phone}
                  message={confirmationMessage(booking, data.space.name, today)}
                  label={state === "reminded" ? "Otra vez" : "Pedir"}
                  onOpen={() => {
                    if (state === "pending") void mark(booking.id, "remindedAt");
                  }}
                />
                <PButton
                  label="Confirmó"
                  small
                  variant={state === "reminded" ? "dark" : "secondary"}
                  onPress={async () => {
                    if (await mark(booking.id, "confirmedAt")) toast("Confirmada", { kind: "success", body: booking.clientName });
                  }}
                />
              </View>
            ) : null}
          </View>
        );
      })}
      {list.length > visible.length ? (
        <Tap
          onPress={() => setAll(true)}
          accessibilityRole="button"
          style={{ minHeight: 46, alignItems: "center", justifyContent: "center", borderTopWidth: 1, borderTopColor: C.borderLight }}
        >
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.blue }} maxFontSizeMultiplier={1.3}>
            {`Ver las ${list.length}`}
          </Text>
        </Tap>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Mesa que se cae                                                      */
/* ------------------------------------------------------------------ */

export function DroppedPanel({ onOffer }: { onOffer: OnOffer }) {
  const { data, now } = usePro();
  const { ops, save } = useTablesOps();
  if (!ops) return null;
  const list = droppedTables(data, ops, now);
  if (!list.length) return null;
  const done = (id: string, how: "waitlist" | "flash" | "skip") =>
    save("dropped.handle", (o) => markDropped(o, id, how, new Date().toISOString()));

  return (
    <Panel title="Mesas que se han caído" description="Aún quedan horas de servicio: se pueden llenar." flush>
      {list.map(({ booking, tables, seats, candidates }, i) => {
        const first = candidates.find((c) => c.phone) ?? candidates[0];
        const names = tables.length ? tables.map((t) => tableName(data, t.id)).join(" + ") : "Sin mesa";
        const turn = TURNS[turnOf(localMinutes(booking.start))].label.toLowerCase();
        return (
          <View key={booking.id} style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}>
            <View style={{ gap: 2 }}>
              <PText v="h3">{`${names} (${seats} p) libre hasta las ${time(booking.end)}`}</PText>
              <PText v="tiny">
                {`${booking.status === "no_show" ? "No vino" : "Canceló"} ${booking.clientName}${first ? `, ${plural(candidates.length, "grupo espera", "grupos esperan")} y cabe${candidates.length === 1 ? "" : "n"}` : ""}`}
              </PText>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {first ? (
                <WhatsAppButton
                  variant="dark"
                  phone={first.phone}
                  message={waitlistReadyMessage(first.booking.clientName, data.space.name)}
                  label={`Avisar a ${first.booking.clientName.split(" ")[0]}`}
                  onOpen={() => void done(booking.id, "waitlist")}
                />
              ) : null}
              <PButton
                label="Hueco relámpago"
                small
                variant={first ? "outline" : "dark"}
                onPress={() => {
                  onOffer({
                    title: "Mesa libre ahora",
                    what: `Mesa para ${seats} este ${turn}`,
                    from: Math.ceil(localMinutes(now) / 15) * 15,
                    to: localMinutes(booking.end),
                    slots: 1,
                  });
                  void done(booking.id, "flash");
                }}
              />
              <PButton
                label="Dejar"
                small
                variant="ghost"
                onPress={async () => {
                  if (await done(booking.id, "skip")) toast("Mesa descartada", { kind: "info", body: "Sigue libre en la sala." });
                }}
              />
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Grupos de hoy: recuento para cocina                                  */
/* ------------------------------------------------------------------ */

export function GroupsTodayPanel() {
  const { data, now } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops) return null;
  const today = localDate(now);
  const groups = groupsOn(data, ops, today);
  const closing = groupsClosingSoon(data, ops, today);
  if (!groups.length && !closing.length) return null;
  const amber = statusTone("amber");

  return (
    <Panel
      title="Grupos"
      description={groups.length ? "El recuento de platos y las alergias, para cocina antes de abrir." : "Tienen que cerrar el número de personas."}
      action={<TextLink label="Grupos" onPress={() => go("grupos")} />}
    >
      <View style={{ gap: S.md }}>
        {groups.map(({ request, deal, menu, tally }) => (
          <View key={request.id} style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {request.kind}
                </PText>
                <PText v="tiny">{`${request.organization}, ${time(request.date)}, ${plural(deal.finalPeople ?? request.people, "persona", "personas")}`}</PText>
              </View>
              {menu ? <Pill tone="violet" label={menu.name} /> : null}
            </View>
            {tally ? (
              <>
                {tally.courses
                  .filter((c) => c.counts.some((x) => x.n > 0))
                  .map((course) => (
                    <View key={course.label} style={{ gap: 2 }}>
                      <PText v="tiny" style={{ fontFamily: FONT.semibold }}>
                        {course.label}
                      </PText>
                      {course.counts
                        .filter((x) => x.n > 0)
                        .sort((a, b) => b.n - a.n)
                        .map((x) => (
                          <View key={x.dish} style={{ flexDirection: "row", gap: S.sm }}>
                            <Text style={{ width: 24, fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.2}>
                              {x.n}
                            </Text>
                            <PText v="body" numberOfLines={1} style={{ flex: 1 }}>
                              {x.dish}
                            </PText>
                          </View>
                        ))}
                    </View>
                  ))}
                {tally.allergies.length ? (
                  <View style={{ borderRadius: R.md, backgroundColor: amber.bg, padding: S.sm, gap: 2 }}>
                    {tally.allergies.map((a) => (
                      <View key={a.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <AlertTriangle size={12} color={amber.fg} strokeWidth={2} />
                        <Text style={{ flex: 1, fontSize: 12.5, color: amber.fg }} maxFontSizeMultiplier={1.3}>
                          <Text style={{ fontFamily: FONT.semibold }}>{`${a.name}: `}</Text>
                          {a.allergies}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {tally.missing ? <PText v="tiny">{`Faltan ${plural(tally.missing, "persona", "personas")} por elegir plato.`}</PText> : null}
              </>
            ) : (
              <PText v="tiny">Sin menú cerrado: pregunta al organizador qué van a tomar.</PText>
            )}
          </View>
        ))}
        {closing.map(({ deal, request, today: isToday }) => (
          <Tap
            key={deal.requestId}
            onPress={() => go("grupos")}
            accessibilityRole="link"
            accessibilityLabel={`${request.kind}: cierra número ${isToday ? "hoy" : "mañana"}`}
            style={{ flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 52, borderRadius: R.md, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, paddingHorizontal: S.md }}
          >
            <Users size={16} color={C.blue} strokeWidth={1.9} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>
                {request.kind}
              </PText>
              <PText v="tiny" numberOfLines={1}>
                {`Cierra número ${isToday ? "hoy" : "mañana"}, ${request.organizer}, ${dayLabel(request.date, { weekday: false })}`}
              </PText>
            </View>
            <Pill tone={isToday ? "warning" : "neutral"} label={`${deal.finalPeople ?? request.people} p`} />
          </Tap>
        ))}
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Quién trabaja hoy                                                    */
/* ------------------------------------------------------------------ */

export function TeamTodayPanel() {
  const { data, now, vertical } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops || !vertical.nav.some((n) => n.id === "cuadrante")) return null;
  const today = localDate(now);
  const nowMin = localMinutes(now);
  const list = rotaToday(ops, data.staff, today);
  if (!list.length) return null;
  const late = list.filter((x) => x.from <= nowMin && x.to > nowMin && !x.person.clockedInAt);
  const emerald = statusTone("emerald");
  return (
    <Panel
      title="Equipo de hoy"
      description={late.length ? `${plural(late.length, "persona no ha fichado", "personas no han fichado")} y ya le toca.` : "Según el cuadrante de la semana."}
      action={<TextLink label="Turnos" onPress={() => go("cuadrante")} />}
      flush
    >
      {list.map(({ person, from, to, label }, i) => {
        const on = from <= nowMin && to > nowMin;
        return (
          <ListRow key={`${person.id}-${from}`} last={i === list.length - 1}>
            <PAvatar name={person.name} toneKey={person.tone} size={32} />
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>
                {`${person.name.split(" ")[0]}${label ? `, ${label}` : ""}`}
              </PText>
              <PText v="tiny">{`${minutesToLabel(from)} a ${minutesToLabel(to % 1440)}`}</PText>
            </View>
            {person.clockedInAt ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <LiveDot />
                <Text style={{ fontFamily: FONT.semibold, fontSize: 12, color: emerald.fg }} maxFontSizeMultiplier={1.3}>
                  Fichado
                </Text>
              </View>
            ) : on ? (
              <Pill tone="warning" label="Sin fichar" />
            ) : (
              <PText v="tiny">{from > nowMin ? `Entra a las ${minutesToLabel(from)}` : "Ha salido"}</PText>
            )}
          </ListRow>
        );
      })}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Partido, previa o evento de hoy                                      */
/* ------------------------------------------------------------------ */

export function EventTodayPanel() {
  const { now, vertical } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops || !vertical.nav.some((n) => n.id === "eventos")) return null;
  const today = localDate(now);
  const current = eventToday(ops, today);
  const next = current ? null : upcomingEvents(ops, now).find((e) => localDate(e.start) <= addDays(today, 7));
  if (!current && !next) return null;
  const label = vertical.nav.find((n) => n.id === "eventos")?.label ?? "Eventos";
  if (!current && next) {
    return (
      <Tap onPress={() => go("eventos")} accessibilityRole="link" accessibilityLabel={`${next.title}, ${dayLabel(next.start)}`}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md }}>
          <Trophy size={16} color={C.blue} strokeWidth={1.9} />
          <View style={{ flex: 1 }}>
            <PText v="h3" numberOfLines={1}>
              {next.title}
            </PText>
            <PText v="tiny">{`${dayLabel(next.start)} a las ${time(next.start)}, ${next.bookings.reduce((a, b) => a + b.people, 0)} de ${next.capacity} apuntados`}</PText>
          </View>
          <ArrowRight size={14} color={C.muted} />
        </Card>
      </Tap>
    );
  }
  const { event, stats } = current!;
  return (
    <Panel title={`${VENUE_EVENT_KIND_LABEL[event.kind]} de hoy`} action={<TextLink label={label} onPress={() => go("eventos")} />}>
      <PText v="h3">{event.title}</PText>
      <PText v="tiny">{`${time(event.start)} a ${time(event.end)}${event.menu ? `, ${event.menu}` : ""}`}</PText>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.sm, marginTop: S.md }}>
        <Text style={{ fontFamily: FONT.display, fontSize: 30, letterSpacing: -0.8, color: C.text }} maxFontSizeMultiplier={1.2}>
          {stats.free}
        </Text>
        <PText v="small">{`plazas libres de ${event.capacity}`}</PText>
      </View>
      <View style={{ marginTop: S.sm }}>
        <Meter value={stats.people} max={event.capacity} tone={stats.free <= 5 ? "warning" : "violet"} />
      </View>
      {stats.depositsPending ? (
        <PText v="small" color={C.warning} style={{ marginTop: S.sm }}>
          {plural(stats.depositsPending, "señal pendiente", "señales pendientes")}
        </PText>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Agotados                                                             */
/* ------------------------------------------------------------------ */

export function SoldOutPanel() {
  const { data, update, pending, can } = usePro();
  const soldOut = data.menu.filter((m) => !m.available);
  if (!soldOut.length) return null;
  const rose = statusTone("rose");
  return (
    <Panel title="Agotado ahora" description="No sale en la carta ni en el QR. Tócalo cuando vuelva a haber.">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        {soldOut.map((m) => (
          <Tap
            key={m.id}
            disabled={pending || !can("menu.available")}
            onPress={async () => {
              const ok = await update("menu.available", (d) => ({
                ...d,
                menu: d.menu.map((x) => (x.id === m.id ? { ...x, available: true } : x)),
              }));
              if (ok) toast("Disponible otra vez", { kind: "success", body: m.name });
            }}
            accessibilityRole="button"
            accessibilityLabel={`${m.name}: volver a poner disponible`}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: R.md, borderWidth: 1, borderColor: rose.border, backgroundColor: rose.bg, paddingHorizontal: S.md }}
          >
            <UtensilsCrossed size={13} color={rose.fg} strokeWidth={1.9} />
            <Text style={{ fontFamily: FONT.semibold, fontSize: 13.5, color: rose.fg }} maxFontSizeMultiplier={1.3}>
              {m.name}
            </Text>
          </Tap>
        ))}
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Horas flojas                                                         */
/* ------------------------------------------------------------------ */

const VALLEY_WINDOW = {
  cafe: { from: 16 * 60, to: 19 * 60 },
  bar: { from: 17 * 60, to: 20 * 60 },
  restaurant: { from: 15 * 60, to: 17 * 60 },
} as const;

const VALLEY_OFFER = {
  cafe: { title: "Tarde de estudio", what: "Café y dulce a precio de estudiante", priceCents: 250 },
  bar: { title: "Caña y tapa de estudiante", what: "Caña y tapa después de clase", priceCents: 250 },
  restaurant: { title: "Menú estudiante de tarde", what: "Menú del día para comer tarde", priceCents: 1190 },
} as const;

export function ValleyCard({ onOffer }: { onOffer: OnOffer }) {
  const { data, now, vertical } = usePro();
  const kind = vertical.id === "cafe" || vertical.id === "bar" ? vertical.id : "restaurant";
  const valley = valleySuggestion(data.validations, now, VALLEY_WINDOW[kind]);
  if (!valley) return null;
  const offer = VALLEY_OFFER[kind];
  const range = `${minutesToLabel(valley.from)} a ${minutesToLabel(valley.to)}`;
  return (
    <Panel
      title="Tus horas flojas"
      description={`De ${range} entran de media ${valley.perHour.toLocaleString("es-ES")} clientes con Card por hora. A las ${valley.peakHour}:00, ${valley.peakPerHour.toLocaleString("es-ES")}.`}
    >
      <Bars values={valley.byHour.map((h) => h.value)} labels={valley.byHour.map((h) => (h.hour % 2 ? "" : String(h.hour)))} height={96} format={() => ""} />
      <PText v="body" color={C.muted} style={{ marginTop: S.md }}>
        Una oferta solo para estudiantes cercanos llena esas horas sin bajar el precio al resto.
      </PText>
      <PButton
        label={`Preparar oferta de ${range}`}
        icon={TrendingDown}
        full
        style={{ marginTop: S.md }}
        onPress={() => onOffer({ title: offer.title, what: offer.what, from: valley.from, to: valley.to, priceCents: offer.priceCents, slots: 20 })}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Habituales que no vienen y cumpleaños                                */
/* ------------------------------------------------------------------ */

type RegularsTab = "away" | "birthdays";

export function RegularsCard() {
  const { data, now, vertical } = usePro();
  const [tab, setTab] = React.useState<RegularsTab>("away");
  const today = localDate(now);
  const away = dormantRegulars(data, now, vertical.id === "cafe" ? 10 : 21, 8).slice(0, 5);
  const birthdays = birthdaysSoon(data.clients.filter((c) => c.phone && c.marketingConsent), today).slice(0, 5);
  if (!away.length && !birthdays.length) return null;
  const gift = vertical.id === "cafe" ? "un café" : vertical.id === "bar" ? "una caña" : "el postre";
  const active: RegularsTab = !away.length ? "birthdays" : !birthdays.length ? "away" : tab;
  const needed = data.loyalty?.stampsNeeded ?? 0;
  return (
    <Panel
      title="Habituales"
      description={
        active === "away"
          ? "Venían mucho y hace días que no aparecen. Un mensaje a tiempo los recupera."
          : "Cumplen años esta semana. Un detalle y vuelven con amigos."
      }
      flush
    >
      {away.length && birthdays.length ? (
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
          <Segmented<RegularsTab>
            value={active}
            onChange={setTab}
            options={[
              { value: "away", label: "Te echan de menos", count: away.length },
              { value: "birthdays", label: "Cumpleaños", count: birthdays.length },
            ]}
          />
        </View>
      ) : null}
      {active === "away"
        ? away.map(({ client, daysAway }, i) => {
            const stamps = needed ? stampsFor(data.validations, client.name, needed) : 0;
            return (
              <ListRow key={client.id} last={i === away.length - 1}>
                <PAvatar name={client.name} toneKey="violet" size={32} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {client.name}
                    </PText>
                    {client.student ? <StudentMark university={client.student.university} /> : null}
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <PText v="tiny">{`No viene hace ${plural(daysAway, "día", "días")}`}</PText>
                    {needed && stamps ? <StampDots value={stamps} max={needed} /> : null}
                  </View>
                </View>
                <WhatsAppButton phone={client.phone} message={comebackMessage(client.name, data.space.name)} label="Escribirle" />
              </ListRow>
            );
          })
        : birthdays.map(({ client, inDays }, i) => (
            <ListRow key={client.id} last={i === birthdays.length - 1}>
              <Cake size={16} color={C.blue} strokeWidth={1.9} />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>
                  {client.name}
                </PText>
                <PText v="tiny">{`${inDays === 0 ? "Hoy" : inDays === 1 ? "Mañana" : `En ${inDays} días`}, ${plural(client.visits, "visita", "visitas")}`}</PText>
              </View>
              <WhatsAppButton phone={client.phone} message={birthdayMessage(client.name, data.space.name, gift)} label="Invitar" />
            </ListRow>
          ))}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Radar de septiembre                                                  */
/* ------------------------------------------------------------------ */

export function SeptemberRadarCard({ onOffer }: { onOffer: OnOffer }) {
  const { data, now, vertical } = usePro();
  const radar = septemberRadar(data, now);
  if (!radar) return null;
  const welcome =
    vertical.id === "cafe"
      ? { what: "Primer café gratis al activar tu tarjeta de sellos", priceCents: 0 }
      : vertical.id === "bar"
        ? { what: "Caña y tapa de bienvenida a 2 €", priceCents: 200 }
        : { what: "Postre de la casa en tu primera comida", priceCents: 0 };
  const box = (label: string, value: number) => (
    <View key={label} style={{ flex: 1, borderRadius: R.md, backgroundColor: C.input, paddingVertical: S.sm, alignItems: "center" }}>
      <PText v="tiny">{label}</PText>
      <Text style={{ fontFamily: FONT.display, fontSize: 22, color: C.text }} maxFontSizeMultiplier={1.2}>
        {value}
      </Text>
    </View>
  );
  return (
    <Panel title="Radar de septiembre" description="En estas semanas cada estudiante nuevo elige su sitio para todo el curso.">
      {radar.newStudents === 0 ? (
        <PText v="body" color={C.muted}>
          Todavía no ha venido ningún estudiante nuevo. Una oferta de bienvenida te pone delante de los que acaban de llegar.
        </PText>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            {box("Nuevos", radar.newStudents)}
            {box("Ya repiten", radar.repeat)}
            {box("Con tarjeta", radar.cardMembers)}
          </View>
          <PText v="tiny" style={{ marginTop: S.sm }}>
            Estudiantes que han venido por primera vez en las últimas tres semanas.
          </PText>
        </>
      )}
      <PButton
        label="Oferta de bienvenida"
        icon={GraduationCap}
        variant="outline"
        full
        style={{ marginTop: S.md }}
        onPress={() => onOffer({ title: "Bienvenida al curso", what: welcome.what, priceCents: welcome.priceCents, slots: 60 })}
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Márgenes que avisan solos                                            */
/* ------------------------------------------------------------------ */

export function MarginAlertsCard() {
  const { data, vertical } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops || !vertical.nav.some((n) => n.id === "costes")) return null;
  const alerts = marginAlerts(ops, data.menu).slice(0, 3);
  if (!alerts.length) return null;
  return (
    <Panel
      title="Te está costando más"
      description={`Han subido proveedores y ${plural(alerts.length, "producto se sale", "productos se salen")} de tu objetivo del ${ops.targetFoodCostPct} %.`}
      action={<TextLink label="Márgenes" onPress={() => go("costes")} />}
      flush
    >
      {alerts.map((a, i) => (
        <ListRow key={a.item.id} last={i === alerts.length - 1}>
          <Calculator size={16} color={a.foodCostPct > ops.targetFoodCostPct + 5 ? C.error : C.warning} strokeWidth={1.9} />
          <View style={{ flex: 1 }}>
            <PText v="h3" numberOfLines={1}>
              {a.item.name}
            </PText>
            <PText v="tiny" numberOfLines={1}>
              {`${a.ingredient} +${a.risePct.toLocaleString("es-ES")} %, coste ${a.foodCostPct.toLocaleString("es-ES")} %`}
            </PText>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <PText v="tiny" style={{ textDecorationLine: "line-through" }}>
              {money(a.item.priceCents)}
            </PText>
            <PText v="h3">{money(a.suggestedPriceCents)}</PText>
          </View>
        </ListRow>
      ))}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Bonos por servir                                                     */
/* ------------------------------------------------------------------ */

export function BonosHint() {
  const { vertical } = usePro();
  const { ops } = useTablesOps();
  const go = useGoSection();
  if (!ops || !vertical.nav.some((n) => n.id === "bonos")) return null;
  const live = ops.bonos.filter((b) => b.usedAt.length < b.uses);
  if (!live.length) return null;
  const pending = live.reduce((a, b) => a + b.uses - b.usedAt.length, 0);
  return (
    <Tap onPress={() => go("bonos")} accessibilityRole="link" accessibilityLabel="Ir a bonos">
      <Card style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: S.md }}>
        <HeartHandshake size={16} color={C.blue} strokeWidth={1.9} />
        <PText v="body" style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT.semibold }}>{plural(live.length, "bono vivo", "bonos vivos")}</Text>
          {` con ${plural(pending, "uso", "usos")} ya cobrados por servir`}
        </PText>
        <Pill tone="violet" label="Bonos" />
      </Card>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* En la solicitud: esta persona ya dejó una mesa vacía antes           */
/* ------------------------------------------------------------------ */

export function NoShowLine({ booking }: { booking: ProBooking }) {
  const { data } = usePro();
  const n = noShowHistory(data, {
    clientId: booking.clientId,
    name: booking.clientName,
    phone: data.clients.find((c) => c.id === booking.clientId)?.phone,
  });
  if (!n) return null;
  return (
    <View style={{ marginTop: 2 }}>
      <Pill tone="danger" icon={AlertTriangle} label={`No vino ${plural(n, "vez", "veces")}`} />
    </View>
  );
}

