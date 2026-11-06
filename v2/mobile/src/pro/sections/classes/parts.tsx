import React from "react";
import { Alert, Text, View } from "react-native";
import { ArrowRight, BadgeCheck, Check, Repeat, Sparkles, UserPlus, X, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProBooking, ProClassSession, ProClassType, ToneKey } from "../../../../../shared/pro/types";
import {
  addDays,
  atLocal,
  capitalize,
  dayLabel,
  durationLabel,
  localDate,
  localMinutes,
  minutesToLabel,
  money,
  time,
} from "../../../../../shared/pro/format";
import {
  classCopy,
  freeSpots,
  isRoomMode,
  isTrial,
  memberPrice,
  monthlyEquivalent,
  sessionRoster,
  sessionState,
  shortUni,
  withRoster,
} from "../../../../../shared/pro/classes";
import { localId, usePro } from "../../store";
import { useGoSection } from "../../shell";
import {
  ChoiceGrid,
  DarkBlock,
  DarkText,
  DayChips,
  Empty,
  Field,
  Input,
  Meter,
  PAvatar,
  PButton,
  Pill,
  PText,
  SearchInput,
  Segmented,
  Sheet,
  Stepper,
  TimeStepper,
  TONE_HEX,
  Toggle,
} from "../../kit";
import type { OfferPreset } from "../common/offer-composer";
import { RealNewSessionDrawer, RealSessionDrawer } from "./real-parts";
import { PickChip, ToneSwatches } from "./ui";

const FRANKY = new Set(["franky", "hueco", "card", "grupo"]);
const TONE_ORDER = Object.keys(TONE_HEX) as ToneKey[];

export function isFromFranky(source: ProBooking["source"] | undefined) {
  return Boolean(source && FRANKY.has(source));
}

/** Ocupación de una sesión en tono de semáforo: llena, casi llena, con sitio. */
export function fillTone(s: ProClassSession): "danger" | "warning" | "violet" | "success" {
  if (s.booked >= s.capacity) return "danger";
  if (s.booked / s.capacity >= 0.75) return "warning";
  return "violet";
}

export { capitalize, shortUni };

/* ------------------------------------------------------------------ */
/* Detalle de sesión: inscritos, lista de espera y pasar lista          */
/* ------------------------------------------------------------------ */

type Tab = "list" | "wait" | "add";

type SessionDrawerProps = {
  sessionId: string | null;
  onClose: () => void;
  onOffer?: (preset: OfferPreset) => void;
};

export function SessionDrawer(props: SessionDrawerProps) {
  const { demo } = usePro();
  return demo ? <DemoSessionDrawer {...props} /> : <RealSessionDrawer sessionId={props.sessionId} onClose={props.onClose} />;
}

function DemoSessionDrawer({ sessionId, onClose, onOffer }: SessionDrawerProps) {
  const { data, now, update, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const [tab, setTab] = React.useState<Tab>("list");
  const [query, setQuery] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [trial, setTrial] = React.useState(true);
  const [groupSize, setGroupSize] = React.useState(4);

  React.useEffect(() => {
    setTab("list");
    setQuery("");
    setNewName("");
    setTrial(true);
  }, [sessionId]);

  const session = data.sessions.find((s) => s.id === sessionId) ?? null;
  if (!session) return null;

  const ct = data.classTypes.find((c) => c.id === session.classTypeId);
  const coach = data.staff.find((s) => s.id === session.coachId);
  const state = sessionState(session, now);
  const { booked, waitlist } = sessionRoster(data, session, now);
  const today = localDate(now);
  const isToday = localDate(session.start) === today;
  const canCheck = isToday || localDate(session.start) < today;
  const spots = freeSpots(session);
  const arrived = booked.filter((b) => b.status === "arrived").reduce((a, b) => a + b.partySize, 0);
  const perGroup = isRoomMode(data, ct);

  const toggle = (b: ProBooking) => {
    const next: ProBooking["status"] = b.status === "arrived" ? (state === "past" ? "no_show" : "confirmed") : "arrived";
    void update("class.checkin", (d) => withRoster(d, session.id, now, (list) => list.map((x) => (x.id === b.id ? { ...x, status: next } : x))));
  };

  const allIn = () => {
    void update("class.checkin.all", (d) =>
      withRoster(d, session.id, now, (list) => list.map((x) => (x.status === "confirmed" || x.status === "no_show" ? { ...x, status: "arrived" } : x))),
    );
    toast("Lista pasada", { kind: "success", body: `${session.booked} ${perGroup ? "personas" : copy.members} marcados como presentes.` });
  };

  const remove = (b: ProBooking) => {
    const first = waitlist[0];
    void update("class.remove", (d) =>
      withRoster(d, session.id, now, (list) =>
        list
          .filter((x) => x.id !== b.id)
          .map((x) =>
            first && x.id === first.id
              ? { ...x, status: "confirmed", waitlisted: false, note: x.note === "Lista de espera" ? undefined : x.note }
              : x,
          ),
      ),
    );
    toast(`${b.clientName.split(" ")[0]} ya no viene`, {
      kind: "success",
      body: first ? `La plaza pasa a ${first.clientName}, primera en la lista de espera. Le avisamos.` : "Queda una plaza libre.",
    });
  };

  const promote = (b: ProBooking) => {
    void update("class.promote", (d) =>
      withRoster(d, session.id, now, (list) =>
        list.map((x) =>
          x.id === b.id ? { ...x, status: "confirmed", waitlisted: false, note: x.note === "Lista de espera" ? undefined : x.note } : x,
        ),
      ),
    );
    toast("Plaza ofrecida", { kind: "success", body: `${b.clientName} tiene 2 horas para confirmarla desde Franky.` });
  };

  const add = (person: { id?: string; name: string; student?: boolean; source?: ProBooking["source"] }) => {
    const size = perGroup ? groupSize : 1;
    const toWait = !perGroup && spots < 1;
    const booking: ProBooking = {
      id: localId("cb"),
      kind: "class",
      clientId: person.id,
      clientName: person.name,
      sessionId: session.id,
      staffId: session.coachId,
      start: session.start,
      end: session.end,
      partySize: size,
      status: toWait ? "requested" : "confirmed",
      priceCents: 0,
      paidCents: 0,
      source: person.source ?? "walkin",
      student: person.student,
      waitlisted: toWait,
      trial: !toWait && !person.id && trial && vertical.id !== "culture",
      note: !toWait && !person.id && trial && vertical.id === "culture" ? "Primera visita" : undefined,
    };
    void update("class.add", (d) => withRoster(d, session.id, now, (list) => [...list, booking]));
    toast(toWait ? "Apuntado en lista de espera" : "Apuntado", {
      kind: "success",
      body: toWait ? `${person.name} es el número ${waitlist.length + 1}.` : `${person.name} en ${ct?.name} a las ${time(session.start)}.`,
    });
    setNewName("");
    setQuery("");
    setTab(toWait ? "wait" : "list");
  };

  const cancelSession = () => {
    void update("class.cancel", (d) => ({
      ...d,
      sessions: d.sessions.filter((s) => s.id !== session.id),
      bookings: d.bookings.filter((b) => b.sessionId !== session.id),
    }));
    toast(`${capitalize(copy.sessionOne)} cancelada`, {
      kind: "success",
      body: `Avisamos a ${session.booked} ${perGroup ? "personas" : "inscritos"}${session.waitlist ? ` y ${session.waitlist} en espera` : ""}.`,
    });
    onClose();
  };

  const confirmCancel = () =>
    Alert.alert(
      `¿Cancelar esta ${copy.sessionOne}?`,
      `Mandamos un aviso a ${session.booked} ${perGroup ? "personas" : "inscritos"}${session.waitlist ? ` y a ${session.waitlist} en lista de espera` : ""}. A quien tenga bono se le devuelve la sesión.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sí, cancelar y avisar", style: "destructive", onPress: cancelSession },
      ],
    );

  const members = data.members.filter(
    (m) => m.status !== "cancelled" && !booked.some((b) => b.clientId === m.id) && !waitlist.some((b) => b.clientId === m.id),
  );
  const q = query.toLowerCase();
  const matches = query.trim()
    ? [
        ...members
          .filter((m) => m.name.toLowerCase().includes(q))
          .map((m) => ({ id: m.id, name: m.name, sub: data.plans.find((p) => p.id === m.planId)?.name ?? "", student: Boolean(m.student?.verified), source: m.source })),
        ...data.clients
          .filter((c) => c.name.toLowerCase().includes(q))
          .map((c) => ({ id: c.id, name: c.name, sub: c.tags[0] ?? "Cliente", student: Boolean(c.student?.verified), source: c.source })),
      ].slice(0, 6)
    : [];

  const footer = (
    <>
      {state !== "past" ? <PButton label={`Cancelar ${copy.sessionOne}`} variant="ghost" onPress={confirmCancel} /> : null}
      {state === "next" && spots > 0 && onOffer ? (
        <PButton
          label={`Ofrecer ${spots} ${spots === 1 ? "plaza" : "plazas"}`}
          variant="outline"
          icon={Zap}
          onPress={() => {
            onOffer({
              what: `${ct?.name ?? "Clase"} de las ${time(session.start)}`,
              date: localDate(session.start),
              from: localMinutes(session.start),
              to: localMinutes(session.end),
              priceCents: vertical.id === "academy" ? 1800 : vertical.id === "culture" ? 1400 : 1200,
              slots: perGroup ? 1 : spots,
            });
            onClose();
          }}
        />
      ) : null}
      {canCheck && booked.length ? (
        <PButton
          label={arrived >= session.booked ? "Todos presentes" : "Marcar a todos"}
          icon={Check}
          onPress={allIn}
          disabled={arrived >= session.booked}
        />
      ) : (
        <PButton label="Apuntar a alguien" icon={UserPlus} onPress={() => setTab("add")} />
      )}
    </>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={ct?.name ?? capitalize(copy.sessionOne)}
      description={`${capitalize(dayLabel(session.start))} · ${time(session.start)} a ${time(session.end)} · ${session.room}`}
      footer={footer}
    >
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
          {coach ? <PAvatar name={coach.name} toneKey={coach.tone} size={32} /> : null}
          <View style={{ flex: 1 }}>
            <PText v="h3" numberOfLines={1}>{coach?.name ?? "Sin asignar"}</PText>
            <PText v="tiny" numberOfLines={1}>
              {`${ct?.category ?? ""}${ct?.level ? ` · ${ct.level}` : ""} · ${durationLabel(ct?.durationMin ?? 60)}`}
            </PText>
          </View>
          {state === "live" ? <Pill label="En curso" tone="success" /> : state === "past" ? <Pill label="Terminada" /> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: S.md, marginTop: S.xs }}>
          <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.text }} maxFontSizeMultiplier={1.2}>
            {session.booked}
            <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.muted }}>{`/${session.capacity}`}</Text>
          </Text>
          <PText v="small" style={{ flexShrink: 1, textAlign: "right" }}>
            {`${canCheck ? `${arrived} ${state === "next" ? "confirmados" : "han llegado"}` : spots ? `${spots} libres` : "Completa"}${session.waitlist ? ` · ${session.waitlist} en espera` : ""}`}
          </PText>
        </View>
        <Meter value={session.booked} max={session.capacity} tone={fillTone(session) === "danger" ? "danger" : fillTone(session) === "warning" ? "warning" : "violet"} />
      </View>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "list", label: canCheck ? "Pasar lista" : "Inscritos", count: booked.length },
          ...(perGroup ? [] : [{ value: "wait" as Tab, label: "En espera", count: waitlist.length }]),
          { value: "add", label: "Apuntar" },
        ]}
      />

      {tab === "list" ? (
        booked.length ? (
          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            {booked.map((b, i) => {
              const here = b.status === "arrived";
              return (
                <View
                  key={b.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 56, borderBottomWidth: i === booked.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                >
                  <PAvatar name={b.clientName} size={32} toneKey={here ? "emerald" : "slate"} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText
                        v="h3"
                        numberOfLines={1}
                        color={b.status === "no_show" ? C.muted : C.text}
                        style={[{ flexShrink: 1 }, b.status === "no_show" ? { textDecorationLine: "line-through" } : null]}
                      >
                        {b.clientName}
                      </PText>
                      {b.student ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                      {perGroup ? <PText v="tiny">{`Grupo de ${b.partySize}`}</PText> : null}
                      {isTrial(b) ? <Pill label="Clase de prueba" tone="violet" /> : null}
                      {isFromFranky(b.source) ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                          <Sparkles size={11} color={C.blueDeep} />
                          <PText v="tiny" color={C.blueDeep}>Vino por Franky</PText>
                        </View>
                      ) : null}
                      {b.status === "no_show" ? <PText v="tiny">No vino</PText> : null}
                    </View>
                  </View>
                  {canCheck ? (
                    <Tap
                      onPress={() => toggle(b)}
                      haptic
                      accessibilityRole="button"
                      accessibilityState={{ selected: here }}
                      accessibilityLabel={here ? `Quitar asistencia de ${b.clientName}` : `Marcar a ${b.clientName} como presente`}
                      style={{
                        height: 44,
                        minWidth: 44,
                        paddingHorizontal: S.md,
                        borderRadius: R.md,
                        borderWidth: 1,
                        borderColor: here ? C.success : C.border,
                        backgroundColor: here ? C.success : "transparent",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 4,
                      }}
                    >
                      <Check size={16} color={here ? "#FFFFFF" : C.muted} strokeWidth={2.4} />
                      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: here ? "#FFFFFF" : C.muted }} maxFontSizeMultiplier={1.2}>
                        {here ? "Está" : "Llegó"}
                      </Text>
                    </Tap>
                  ) : null}
                  {state !== "past" ? (
                    <Tap
                      onPress={() => remove(b)}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar a ${b.clientName} de la ${copy.sessionOne}`}
                      style={{ width: 44, height: 44, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}
                    >
                      <X size={17} color={C.muted} />
                    </Tap>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Empty
            icon={UserPlus}
            title="Nadie apuntado todavía"
            body={`Apunta a alguien a mano o comparte la ${copy.sessionOne} con estudiantes cerca.`}
            action={<PButton label="Apuntar a alguien" variant="outline" onPress={() => setTab("add")} />}
          />
        )
      ) : null}

      {tab === "wait" ? (
        waitlist.length ? (
          <View style={{ gap: S.sm }}>
            <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
              {waitlist.map((b, i) => (
                <View
                  key={b.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 56, borderBottomWidth: i === waitlist.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                >
                  <Text style={{ width: 24, textAlign: "center", fontFamily: FONT.heading, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.2}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{b.clientName}</PText>
                      {b.student ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                    </View>
                    <PText v="tiny">{i === 0 ? "Primera en recibir la plaza" : `Esperando desde hace ${i + 1} h`}</PText>
                  </View>
                  <PButton label="Dar plaza" small variant={spots > 0 ? "secondary" : "ghost"} disabled={spots < 1} onPress={() => promote(b)} />
                </View>
              ))}
            </View>
            <PText v="tiny">
              {spots > 0
                ? `Hay ${spots} ${spots === 1 ? "plaza libre" : "plazas libres"}: dásela a quien quieras.`
                : "Cuando alguien cancela, la plaza se ofrece sola a la primera persona de la lista."}
            </PText>
          </View>
        ) : (
          <Empty icon={Repeat} title="Nadie en espera" body="Cuando la clase se llene, los siguientes entrarán aquí por orden." />
        )
      ) : null}

      {tab === "add" ? (
        <View style={{ gap: S.md }}>
          {!perGroup ? (
            <Field label={`Buscar ${copy.member} o interesado`}>
              <SearchInput value={query} onChange={setQuery} placeholder="Nombre" />
            </Field>
          ) : null}
          {matches.length ? (
            <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
              {matches.map((m, i) => (
                <Tap
                  key={m.id}
                  onPress={() => add(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Apuntar a ${m.name}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.sm, minHeight: 52, borderBottomWidth: i === matches.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
                >
                  <PAvatar name={m.name} size={32} />
                  <View style={{ flex: 1 }}>
                    <PText v="h3" numberOfLines={1}>{m.name}</PText>
                    <PText v="tiny" numberOfLines={1}>{m.sub}</PText>
                  </View>
                  <UserPlus size={17} color={C.blue} />
                </Tap>
              ))}
            </View>
          ) : null}
          <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: S.md }}>
            <PText v="h3">{perGroup ? "Nueva reserva de grupo" : "Alguien que aún no está en tu lista"}</PText>
            <Input
              value={newName}
              onChangeText={setNewName}
              placeholder={perGroup ? "Nombre de quien reserva" : "Nombre y apellido"}
              label="Nombre"
              autoCapitalize="words"
            />
            {perGroup ? (
              <Field label="Personas">
                <ChoiceGrid
                  value={String(groupSize)}
                  onChange={(v) => setGroupSize(Number(v))}
                  options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
                />
              </Field>
            ) : (
              <Toggle
                label={`Viene a ${vertical.id === "culture" ? "su primera visita" : "una clase de prueba"}`}
                value={trial}
                onChange={setTrial}
              />
            )}
            <PButton
              full
              icon={UserPlus}
              label={perGroup && session.booked > 0 ? "La sala ya está reservada" : !perGroup && spots < 1 ? "Apuntar en lista de espera" : "Apuntar"}
              disabled={!newName.trim() || (perGroup && session.booked > 0)}
              onPress={() => add({ name: newName.trim() })}
            />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Nueva sesión o nueva clase                                          */
/* ------------------------------------------------------------------ */

export type NewSessionPreset = { date: string; minute?: number; typeId?: string; createType?: boolean } | null;

export function NewSessionDrawer(props: { preset: NewSessionPreset; onClose: () => void }) {
  const { demo } = usePro();
  return demo ? <DemoNewSessionDrawer {...props} /> : <RealNewSessionDrawer {...props} />;
}

function DemoNewSessionDrawer({ preset, onClose }: { preset: NewSessionPreset; onClose: () => void }) {
  const { data, update, vertical, now } = usePro();
  const copy = classCopy(vertical.id);
  const coaches = data.staff.filter((s) => s.role !== "reception");
  const today = localDate(now);
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [typeId, setTypeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [duration, setDuration] = React.useState("60");
  const [tone, setTone] = React.useState<ToneKey>("sky");
  const [coachId, setCoachId] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [minute, setMinute] = React.useState(18 * 60);
  const [capacity, setCapacity] = React.useState(12);
  const [room, setRoom] = React.useState("");
  const [repeat, setRepeat] = React.useState<"1" | "4" | "8">("4");

  React.useEffect(() => {
    if (!preset) return;
    const first = data.classTypes.find((c) => c.id === preset.typeId) ?? data.classTypes[0];
    setMode(preset.createType || !data.classTypes.length ? "new" : "existing");
    setTypeId(first?.id ?? "");
    setName("");
    setCategory("");
    setLevel("");
    setDuration("60");
    setTone(TONE_ORDER.find((t) => !data.classTypes.some((c) => c.tone === t)) ?? "sky");
    setCoachId(first?.coachId ?? coaches[0]?.id ?? "");
    setDate(preset.date);
    setMinute(preset.minute ?? 18 * 60);
    setCapacity(first?.capacity ?? 12);
    setRoom(data.sessions.find((s) => s.classTypeId === first?.id)?.room ?? "");
    setRepeat("4");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const pickType = (id: string) => {
    const ct = data.classTypes.find((c) => c.id === id);
    setTypeId(id);
    if (ct) {
      setCoachId(ct.coachId);
      setCapacity(ct.capacity);
      setRoom(data.sessions.find((s) => s.classTypeId === id)?.room ?? room);
    }
  };

  const ct = data.classTypes.find((c) => c.id === typeId);
  const minutes = mode === "new" ? Number(duration) : ct?.durationMin ?? 60;
  const valid = (mode === "existing" ? Boolean(ct) : name.trim().length > 1) && capacity > 0 && Boolean(coachId);
  const weeks = Number(repeat);

  const save = () => {
    const newType: ProClassType | null =
      mode === "new"
        ? {
            id: localId("ct"),
            name: name.trim(),
            category: category.trim() || (vertical.id === "academy" ? "Todas las carreras" : "General"),
            durationMin: Number(duration),
            capacity,
            coachId,
            tone,
            level: level.trim() || undefined,
          }
        : null;
    const type = newType ?? ct!;
    const created: ProClassSession[] = Array.from({ length: weeks }, (_, w) => {
      const day = addDays(date, w * 7);
      return {
        id: localId("ss"),
        classTypeId: type.id,
        start: atLocal(day, minute),
        end: atLocal(day, minute + type.durationMin),
        capacity,
        booked: 0,
        waitlist: 0,
        checkedIn: 0,
        room: room.trim() || (vertical.id === "academy" ? "Aula 1" : "Sala principal"),
        coachId,
      };
    });
    void update("class.session.create", (d) => ({
      ...d,
      classTypes: newType ? [...d.classTypes, newType] : d.classTypes,
      sessions: [...d.sessions, ...created],
    }));
    toast(weeks > 1 ? `${weeks} ${copy.sessionMany} creadas` : `${capitalize(copy.sessionOne)} creada`, {
      kind: "success",
      body: `${type.name}, ${dayLabel(atLocal(date, minute))} a las ${minutesToLabel(minute)}${weeks > 1 ? " y las semanas siguientes" : ""}. Ya se puede reservar en Franky.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(preset)}
      onClose={onClose}
      title={mode === "new" ? copy.newType : copy.newSession}
      description={vertical.id === "academy" ? "Asignatura, carrera y horario. Tus alumnos la reservan desde Franky." : "Aparece en tu horario y en tu ficha de Franky al momento."}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={`Crear ${weeks > 1 ? `${weeks} ${copy.sessionMany}` : copy.sessionOne}`} onPress={save} disabled={!valid} />
        </>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "existing", label: `De ${copy.typeOne === "actividad" ? "una actividad" : `un ${copy.typeOne}`} que ya tienes` },
          { value: "new", label: capitalize(copy.newType) },
        ]}
      />

      {mode === "existing" ? (
        <Field label={capitalize(copy.typeOne)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
            {data.classTypes.map((c) => (
              <PickChip
                key={c.id}
                active={typeId === c.id}
                onPress={() => pickType(c.id)}
                label={c.name}
                detail={vertical.id === "academy" ? c.category : undefined}
                dot={c.tone}
              />
            ))}
          </View>
        </Field>
      ) : (
        <>
          <Field label={vertical.id === "academy" ? "Asignatura" : "Nombre"}>
            <Input
              value={name}
              onChangeText={setName}
              label={vertical.id === "academy" ? "Asignatura" : "Nombre"}
              placeholder={vertical.id === "academy" ? "Física I" : vertical.id === "culture" ? "Taller de encuadernación" : "Movilidad"}
            />
          </Field>
          <Field label={vertical.id === "academy" ? "Carrera" : "Categoría"}>
            <Input
              value={category}
              onChangeText={setCategory}
              label={vertical.id === "academy" ? "Carrera" : "Categoría"}
              placeholder={vertical.id === "academy" ? "Ingenierías (EPS)" : "Fuerza"}
            />
          </Field>
          <Field label={vertical.id === "academy" ? "Curso" : "Nivel"}>
            <Input
              value={level}
              onChangeText={setLevel}
              label={vertical.id === "academy" ? "Curso" : "Nivel"}
              placeholder={vertical.id === "academy" ? "1.º curso" : "Todos los niveles"}
            />
          </Field>
          <Field label="Duración">
            <ChoiceGrid value={duration} onChange={setDuration} options={["45", "60", "90", "120"].map((v) => ({ value: v, label: durationLabel(Number(v)) }))} />
          </Field>
          <Field label="Color en el horario">
            <ToneSwatches value={tone} onChange={setTone} options={TONE_ORDER} />
          </Field>
        </>
      )}

      <Field label={capitalize(copy.coach)}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {coaches.map((s) => (
            <PickChip key={s.id} active={coachId === s.id} onPress={() => setCoachId(s.id)} label={s.name.split(" ")[0]} person={{ name: s.name, tone: s.tone }} />
          ))}
        </View>
      </Field>

      <Field label="Día">
        <DayChips value={date} onChange={setDate} today={today} />
      </Field>
      <Field label="Hora" hint={`Termina a las ${minutesToLabel(minute + minutes)}`}>
        <TimeStepper value={minute} onChange={setMinute} label="hora de inicio" />
      </Field>
      <Field label={copy.groups ? "Plazas" : "Aforo"}>
        <Stepper value={capacity} onChange={setCapacity} min={1} max={60} label={copy.groups ? "plazas" : "aforo"} />
      </Field>
      <Field label={capitalize(copy.place)}>
        <Input value={room} onChangeText={setRoom} label={capitalize(copy.place)} placeholder={vertical.id === "academy" ? "Aula 1" : "Sala principal"} />
      </Field>

      <Field
        label="Repetir cada semana"
        hint={weeks > 1 ? `Se crean ${weeks} ${copy.sessionMany}, una cada ${dayLabel(atLocal(date, 600)).split(",")[0]}.` : "Solo este día."}
      >
        <ChoiceGrid
          value={repeat}
          onChange={setRepeat}
          options={[
            { value: "1", label: "No" },
            { value: "4", label: "4 semanas" },
            { value: "8", label: "8 semanas" },
          ]}
        />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Lo que Franky te ha traído (motor de clases)                        */
/* ------------------------------------------------------------------ */

export function ClassesFrankyCard() {
  const { data, now, vertical } = usePro();
  const go = useGoSection();
  const copy = classCopy(vertical.id);
  const since = addDays(localDate(now), -60);
  const fromFranky = data.members.filter((m) => m.status !== "cancelled" && isFromFranky(m.source));
  const recent = fromFranky.filter((m) => localDate(m.since) >= since).length;
  const monthly = fromFranky.reduce((acc, m) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    return plan ? acc + (monthlyEquivalent(plan, memberPrice(m, plan)) || memberPrice(m, plan)) : acc;
  }, 0);
  const trials = data.offers.filter((o) => o.kind === "first_visit").reduce((a, o) => a + o.claimed, 0);
  const last4 = data.history.slice(-4);
  const people = data.members.length ? fromFranky.length : last4.reduce((a, w) => a + w.franky, 0);
  const revenue = data.members.length
    ? monthly
    : last4.reduce((a, w) => a + (w.total ? Math.round((w.revenueCents * w.franky) / w.total) : 0), 0);
  const today = data.bookings.filter((b) => b.sessionId && localDate(b.start) === localDate(now) && isFromFranky(b.source)).length;
  const foot = `${trials ? `${trials} ${vertical.id === "culture" ? "grupos han venido por primera vez" : "clases de prueba pedidas este curso"}. ` : ""}${today ? `${today} de las reservas de hoy vienen de Franky.` : ""}`;

  return (
    <DarkBlock>
      <DarkText v="label" dim>Lo que te ha traído Franky</DarkText>
      <DarkText v="display">{people}</DarkText>
      <DarkText v="small" dim>
        {data.members.length ? `${copy.members} activos llegaron por Franky` : "personas en el último mes llegaron por Franky"}
      </DarkText>
      <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{money(revenue, { round: true })}</DarkText>
          <DarkText v="small" dim>{data.members.length ? "al mes en cuotas, sin comisión" : "facturado con ellos, sin comisión"}</DarkText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <DarkText v="h2">{data.members.length ? recent : trials}</DarkText>
          <DarkText v="small" dim>{data.members.length ? "altas en los últimos 60 días" : "primeras visitas este curso"}</DarkText>
        </View>
      </View>
      {foot ? <DarkText v="small" dim>{foot}</DarkText> : null}
      <Tap
        onPress={() => go("estudiantes")}
        accessibilityRole="link"
        accessibilityLabel="Ver resultados y ofertas"
        style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}
      >
        <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: "#FFFFFF" }} maxFontSizeMultiplier={1.3}>
          Ver resultados y ofertas
        </Text>
        <ArrowRight size={14} color="#FFFFFF" />
      </Tap>
    </DarkBlock>
  );
}
