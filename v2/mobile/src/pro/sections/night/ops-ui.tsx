import React from "react";
import { Linking, Share, Text, View } from "react-native";
import { Cake, Check, Clock3, MessageCircle, Mic2, NotebookPen, SkipForward, Star, TrendingUp, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProData, ProEvent, ProStaff } from "../../../../../shared/pro/types";
import type { ProIncidentKind, ProNightOps } from "../../../../../shared/pro/night-types";
import { atLocal, addDays, localDate, localMinutes, minutesToLabel, shortDay, time } from "../../../../../shared/pro/format";
import { countdown, nightOf } from "../../../../../shared/pro/night";
import {
  INCIDENT_KINDS,
  birthdayInvite,
  karaokeNext,
  karaokeQueue,
  karaokeWait,
  nightForecast,
  nightOpsOf,
  offerWindows,
  releaseExpiredHolds,
  reviewAskMessage,
  reviewAskTargets,
  upcomingBirthdays,
  withNightOps,
} from "../../../../../shared/pro/night-ops";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { proCsvCell } from "../../../../../shared/pro/csv";
import { localId, usePro } from "../../store";
import { useGoSection } from "../../shell";
import { ChoiceGrid, Field, Input, ListRow, Meter, PAvatar, PButton, PText, Panel, Sheet, TimeStepper } from "../../kit";

/**
 * Piezas de la operación de la noche en la app: la versión nativa de
 * web/.../night/ops-ui.tsx. La lógica vive en shared/pro/night-ops.
 */

/* ------------------------------------------------------------------ */
/* Datos y utilidades                                                  */
/* ------------------------------------------------------------------ */

/** Operación de la noche y un atajo para cambiarla con `update`. */
export function useNightOps() {
  const { data, update } = usePro();
  const ops = nightOpsOf(data);
  const setOps = React.useCallback(
    (label: string, fn: (ops: ProNightOps) => ProNightOps) => update(label, (d) => withNightOps(d, fn)),
    [update],
  );
  return { ops, setOps };
}

/** "12,50" o "12.5" en céntimos; vacío o texto raro es 0. */
export function euros(value: string): number {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Céntimos a texto editable ("12,5"). */
export function eurosInput(cents: number): string {
  return String(cents / 100).replace(".", ",");
}

/** Abre WhatsApp con el texto: al número si lo hay, si no eliges el chat o el grupo. */
export function openWhatsApp(text: string, phone?: string) {
  const url = customerWhatsApp(phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
  void Linking.openURL(url).catch(() => {
    toast("No se ha podido abrir WhatsApp", { kind: "error" });
  });
}

/** Comparte un CSV (separador ;) como texto: se guarda o se manda a la gestoría desde el menú del móvil. */
export function shareCsv(title: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(proCsvCell).join(";")).join("\n");
  void Share.share({ title, message: csv }).catch(() => {
    toast("No se ha podido compartir", { kind: "error" });
  });
}

/** Personas que pueden firmar algo (cierre, recuento, incidencia): primero el dueño y el encargado. */
export function signers(staff: ProStaff[]): ProStaff[] {
  const rank = (s: ProStaff) => (s.role === "owner" ? 0 : s.role === "manager" ? 1 : 2);
  return [...staff].filter((s) => s.role !== "rrpp").sort((a, b) => rank(a) - rank(b));
}

/** Quién firma por defecto: el dueño (o la primera persona del equipo). */
export function defaultSigner(data: ProData): string {
  return signers(data.staff)[0]?.name ?? data.space.owner.name;
}

export function SignerChips({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const { data } = usePro();
  const people = signers(data.staff);
  if (!people.length) {
    return <Input value={value} onChangeText={onChange} placeholder="Tu nombre" label="Tu nombre" autoCapitalize="words" />;
  }
  return (
    <ChoiceGrid
      value={value}
      onChange={onChange}
      options={people.map((s) => ({ value: s.name, label: s.name.split(" ")[0], hint: s.title }))}
    />
  );
}

/** Libera los apartados sin señal que han caducado y avisa una vez. */
export function useReleaseExpiredHolds() {
  const { data, now, update } = usePro();
  const expired = releaseExpiredHolds(data, now).released;
  const key = expired.map((z) => z.id).join(",");
  React.useEffect(() => {
    if (!key) return;
    void update("zone.release_expired", (d) => releaseExpiredHolds(d, new Date()).data);
    const names = expired.map((z) => z.name).join(", ");
    toast(expired.length === 1 ? `${names} vuelve a estar libre` : `${names} vuelven a estar libres`, {
      kind: "info",
      body: "No llegó la señal a tiempo. Ya se pueden reservar.",
    });
    // Solo cuando cambian los apartados caducados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Texto con el color del tono de un descuadre. */
export function toneColor(t: "success" | "warning" | "danger"): string {
  return t === "success" ? C.success : t === "warning" ? C.warning : C.errorText;
}

/** Cifra grande de una pantalla (resultado, consumo, descuadre). */
export function BigFigure({ children, color }: { children: string; color?: string }) {
  return (
    <Text
      style={{ fontFamily: FONT.display, fontSize: 38, lineHeight: 42, letterSpacing: -1, color: color ?? C.text }}
      maxFontSizeMultiplier={1.2}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {children}
    </Text>
  );
}

/** Caja suave para notas y avisos dentro de una hoja. */
export function Note({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "success" }) {
  const bg = tone === "warning" ? `${C.warning}1F` : tone === "success" ? `${C.success}1A` : C.input;
  return (
    <View style={{ borderRadius: R.lg, backgroundColor: bg, padding: S.md }}>
      {typeof children === "string" ? <PText v="small" color={C.text}>{children}</PText> : children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Apuntar una incidencia                                              */
/* ------------------------------------------------------------------ */

const KIND_ORDER: ProIncidentKind[] = ["pelea", "expulsion", "sanitaria", "vecinos", "policia", "reclamacion", "objeto", "otro"];

export function IncidentSheet({ open, onClose, event }: { open: boolean; onClose: () => void; event?: ProEvent | null }) {
  const { data, now } = usePro();
  const { setOps } = useNightOps();
  const [kind, setKind] = React.useState<ProIncidentKind>("pelea");
  const [description, setDescription] = React.useState("");
  const [minute, setMinute] = React.useState(0);
  const [by, setBy] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setKind("pelea");
    setDescription("");
    // Hora actual redondeada al cuarto de hora anterior.
    setMinute(Math.floor(localMinutes(new Date()) / 15) * 15);
    setBy(defaultSigner(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const night = event?.date ?? nightOf(now);
  const valid = description.trim().length > 3 && Boolean(by.trim());

  const save = async () => {
    // De madrugada la hora pertenece al día siguiente de la noche.
    const iso = minute < 12 * 60 ? atLocal(addDays(night, 1), minute) : atLocal(night, minute);
    const ok = await setOps("incident.create", (ops) => ({
      ...ops,
      incidents: [
        ...ops.incidents,
        { id: localId("in"), night, eventId: event?.id, at: iso, kind, description: description.trim(), by: by.trim() },
      ],
    }));
    if (!ok) return;
    toast("Incidencia apuntada", { kind: "success", body: `${INCIDENT_KINDS[kind].label} a las ${minutesToLabel(minute)}, por ${by.split(" ")[0]}.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apuntar incidencia"
      description={event ? `${event.name}, noche del ${shortDay(atLocal(night, 12 * 60))}` : `Noche del ${shortDay(atLocal(night, 12 * 60))}`}
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label="Guardar en el libro" icon={NotebookPen} onPress={() => void save()} disabled={!valid} />
        </>
      }
    >
      <Field label="Qué ha pasado">
        <ChoiceGrid value={kind} onChange={setKind} options={KIND_ORDER.map((k) => ({ value: k, label: INCIDENT_KINDS[k].label }))} />
      </Field>
      <Field label="Detalle" hint="Quién, dónde y qué se hizo. Sin juicios: lo que viste.">
        <Input
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Dos chicos se empujan en la barra. Iván los separa y uno sale."
          label="Detalle de la incidencia"
        />
      </Field>
      <Field label="Hora">
        <TimeStepper value={minute} onChange={setMinute} label="hora de la incidencia" />
      </Field>
      <Field label="Lo apunta">
        <SignerChips value={by} onChange={setBy} />
      </Field>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Precio activo con reloj                                             */
/* ------------------------------------------------------------------ */

/** Precio especial activo ahora (o que empieza hoy), para que la barra no se equivoque. */
export function OfferClock() {
  const { data, now } = usePro();
  const { active, later } = offerWindows(data, now);
  if (!active.length && !later.length) return null;
  const w = active[0] ?? later[0];
  const live = Boolean(active.length);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ borderRadius: R.lg, borderWidth: 1, borderColor: live ? `${C.blue}4D` : C.border, backgroundColor: live ? C.accentSoft : C.surface, padding: S.md, gap: 4, marginBottom: S.lg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {live ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.blue }} /> : <Clock3 size={13} color={C.muted} strokeWidth={1.9} />}
        <PText v="label">{live ? "Precio activo ahora" : `Hoy a las ${time(w.startsAt)}`}</PText>
      </View>
      <PText v="h3">{w.offer.title}</PText>
      <PText v="small">{w.offer.detail}</PText>
      <PText v="small" color={live ? C.blueDeep : C.muted} style={{ fontFamily: FONT.semibold }}>
        {live
          ? `Hasta las ${time(w.endsAt)}, quedan ${countdown(now.getTime(), w.endsAt)}. Después vuelve el precio normal.`
          : `De ${time(w.startsAt)} a ${time(w.endsAt)}. La barra lo verá aquí al empezar.`}
      </PText>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Previsión de la noche                                               */
/* ------------------------------------------------------------------ */

export function ForecastPanel({ event }: { event: ProEvent }) {
  const { data, now } = usePro();
  const go = useGoSection();
  const f = nightForecast(data, event, now);
  if (!f) {
    return (
      <Panel title="Previsión de la noche">
        <PText v="small">Cuando cierres tu primera noche, Franky calculará cuánta gente esperar con lo que de verdad vino.</PText>
      </Panel>
    );
  }
  const short = f.plannedBar < f.bartenders;
  return (
    <Panel
      title="Previsión de la noche"
      description={`Con lo que vino en ${f.basis === 1 ? "la última noche" : `las últimas ${f.basis} noches`} de ${f.basisLabel}.`}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.sm }}>
        <TrendingUp size={16} color={C.blue} strokeWidth={1.9} />
        <Text style={{ fontFamily: FONT.display, fontSize: 30, color: C.text }} maxFontSizeMultiplier={1.2}>
          {String(f.expected)}
        </Text>
        <PText v="small">{`personas de ${event.capacity}`}</PText>
      </View>
      <View style={{ marginTop: S.sm }}>
        <Meter value={f.expected} max={event.capacity} />
      </View>
      <View style={{ marginTop: S.sm, gap: 2 }}>
        <PText v="tiny">{`Vienen el ${f.showTicketPct} % de quien compra y el ${f.showListPct} % de la lista.`}</PText>
        {f.walkIns || f.door ? <PText v="tiny">{`Suelen sumarse ${f.walkIns + f.door} en puerta sin entrada previa.`}</PText> : null}
        <PText v="tiny">{`La última, ${f.last.name}: ${f.last.inside} dentro.`}</PText>
      </View>
      <View style={{ marginTop: S.md }}>
        <Note tone={short ? "warning" : "neutral"}>
          {`${f.bartenders} ${f.bartenders === 1 ? "persona" : "personas"} en barra con tu regla de una cada ${nightOpsOf(data).settings.peoplePerBartender} clientes. ${
            short ? `En Turnos tienes ${f.plannedBar}.` : `En Turnos tienes ${f.plannedBar}: vas bien.`
          }`}
        </Note>
      </View>
      {short ? <PButton label="Completar turnos" variant="ghost" small onPress={() => go("cuadrante")} style={{ marginTop: S.sm }} /> : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cumpleaños de la semana                                             */
/* ------------------------------------------------------------------ */

export function BirthdaysPanel({ limit = 5 }: { limit?: number }) {
  const { data, now } = usePro();
  const list = upcomingBirthdays(data.clients, now, 7);
  if (!list.length) return null;
  const today = localDate(now);
  const shown = list.slice(0, limit);
  return (
    <Panel title="Cumplen años esta semana" description="Clientes que aceptan tus mensajes. Invítales a celebrarlo con un reservado." flush>
      {shown.map(({ client, date, inDays, turns }, i) => (
        <ListRow key={client.id} last={i === shown.length - 1 && list.length <= limit}>
          <PAvatar name={client.name} toneKey="violet" size={34} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Cake size={13} color={C.blue} strokeWidth={1.9} />
              <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{client.name}</PText>
            </View>
            <PText v="tiny" numberOfLines={1}>
              {`${date === today ? "Hoy" : inDays === 1 ? "Mañana" : `En ${inDays} días`}${turns ? `, cumple ${turns}` : ""}${
                client.visits ? ` · ${client.visits} ${client.visits === 1 ? "visita" : "visitas"}` : ""
              }`}
            </PText>
          </View>
          {client.phone ? (
            <PButton
              label="Invitar"
              icon={MessageCircle}
              variant="outline"
              small
              accessibilityLabel={`Invitar a ${client.name} por WhatsApp`}
              onPress={() => openWhatsApp(birthdayInvite(client, data.space, turns), client.phone)}
            />
          ) : null}
        </ListRow>
      ))}
      {list.length > limit ? (
        <View style={{ paddingHorizontal: S.lg, paddingVertical: S.sm }}>
          <PText v="tiny">{`Y ${list.length - limit} más esta semana.`}</PText>
        </View>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cola del karaoke                                                    */
/* ------------------------------------------------------------------ */

/** Cola del karaoke de la noche: quién canta, quién va después y pasar a la siguiente. */
export function KaraokePanel({ event }: { event: ProEvent }) {
  const { ops, setOps } = useNightOps();
  const [singer, setSinger] = React.useState("");
  const [song, setSong] = React.useState("");
  const { singing, waiting, done } = karaokeQueue(ops, event.id);

  const add = async () => {
    if (!singer.trim() || !song.trim()) return;
    const ok = await setOps("karaoke.add", (o) => ({
      ...o,
      karaoke: [
        ...(o.karaoke ?? []),
        { id: localId("kk"), eventId: event.id, singer: singer.trim(), song: song.trim(), at: new Date().toISOString(), status: "waiting" },
      ],
    }));
    if (!ok) return;
    toast(`${singer.trim()} a la cola`, { kind: "success", body: `Le toca en unos ${karaokeWait(waiting.length + (singing ? 1 : 0))} minutos.` });
    setSinger("");
    setSong("");
  };

  const next = async () => {
    const ok = await setOps("karaoke.next", (o) => karaokeNext(o, event.id));
    if (ok && waiting[0]) toast(`Ahora canta ${waiting[0].singer}`, { kind: "success", body: waiting[0].song });
  };

  const remove = (id: string) => void setOps("karaoke.remove", (o) => ({ ...o, karaoke: (o.karaoke ?? []).filter((s) => s.id !== id) }));

  return (
    <Panel title="Cola del karaoke" description={`${waiting.length} en cola${done ? ` y ${done} ya han cantado` : ""}. Por orden de llegada.`} flush>
      <View style={{ padding: S.lg, gap: 4, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Mic2 size={13} color={C.muted} strokeWidth={1.9} />
          <PText v="label">{singing ? "Cantando ahora" : "Nadie en el micro"}</PText>
        </View>
        {singing ? (
          <>
            <PText v="h2">{singing.singer}</PText>
            <PText v="small">{singing.song}</PText>
          </>
        ) : (
          <PText v="small">{waiting.length ? "Da paso al primero de la cola." : "Apunta a quien quiera cantar."}</PText>
        )}
        <PButton
          label={waiting.length ? `Siguiente: ${waiting[0].singer.split(" ")[0]}` : "Terminar la canción"}
          icon={SkipForward}
          small
          disabled={!singing && !waiting.length}
          onPress={() => void next()}
          style={{ marginTop: S.sm }}
        />
      </View>
      {waiting.slice(0, 8).map((s, i) => (
        <ListRow key={s.id}>
          <PText v="tiny" style={{ width: 18, textAlign: "center" }}>{String(i + 1)}</PText>
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{s.singer}</PText>
            <PText v="tiny" numberOfLines={1}>{`${s.song} · unos ${karaokeWait(i + (singing ? 1 : 0))} min`}</PText>
          </View>
          <Tap
            onPress={() => remove(s.id)}
            accessibilityRole="button"
            accessibilityLabel={`Quitar a ${s.singer} de la cola`}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} color={C.muted} strokeWidth={1.9} />
          </Tap>
        </ListRow>
      ))}
      <View style={{ padding: S.lg, gap: S.sm }}>
        <Input value={singer} onChangeText={setSinger} placeholder="Quién canta" label="Quién canta" autoCapitalize="words" />
        <Input value={song} onChangeText={setSong} placeholder="Canción" label="Canción" returnKeyType="done" onSubmitEditing={() => void add()} />
        <PButton label="Apuntar" variant="outline" full disabled={!singer.trim() || !song.trim()} onPress={() => void add()} />
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Opiniones al día siguiente                                          */
/* ------------------------------------------------------------------ */

/** Al día siguiente de una noche, los clientes que vinieron y aceptan mensajes. */
export function ReviewAskPanel({ limit = 5 }: { limit?: number }) {
  const { data, now } = usePro();
  const { setOps } = useNightOps();
  const { night, event, clients, asked } = reviewAskTargets(data, now);
  if (!night || (!clients.length && !asked)) return null;
  const shown = clients.slice(0, limit);
  const where = event ? `a ${event.name}` : "anoche";

  const ask = (client: { id: string; name: string; phone?: string }) => {
    openWhatsApp(reviewAskMessage(client, data.space, event), client.phone);
    // Se apunta para no pedírsela dos veces.
    void setOps("review.ask", (ops) => ({
      ...ops,
      reviewAsks: [...(ops.reviewAsks ?? []), { id: localId("ra"), clientId: client.id, night, eventId: event?.id, at: new Date().toISOString() }],
    }));
  };

  return (
    <Panel
      title="Pide su opinión"
      description={
        clients.length
          ? `${clients.length} ${clients.length === 1 ? "cliente vino" : "clientes vinieron"} ${where} y aceptan tus mensajes. Hoy es el mejor día para pedírsela.`
          : `Ya se la has pedido a los ${asked} que vinieron ${where}.`
      }
      flush
    >
      {shown.length ? (
        shown.map((c, i) => (
          <ListRow key={c.id} last={i === shown.length - 1}>
            <PAvatar name={c.name} toneKey="violet" size={34} />
            <View style={{ flex: 1, gap: 2 }}>
              <PText v="h3" numberOfLines={1}>{c.name}</PText>
              <PText v="tiny" numberOfLines={1}>{`${c.visits} ${c.visits === 1 ? "visita" : "visitas"}`}</PText>
            </View>
            <PButton
              label="Pedir"
              icon={Star}
              variant="outline"
              small
              accessibilityLabel={`Pedir opinión a ${c.name} por WhatsApp`}
              onPress={() => ask(c)}
            />
          </ListRow>
        ))
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md }}>
          <Check size={16} color={C.success} strokeWidth={1.9} />
          <PText v="small">Todas las peticiones enviadas.</PText>
        </View>
      )}
    </Panel>
  );
}
