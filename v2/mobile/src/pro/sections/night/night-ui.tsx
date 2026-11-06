import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { BadgeCheck, Heart, Plus, Trash2, Users, Zap } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProData, ProEvent, ProGuest, ToneKey } from "../../../../../shared/pro/types";
import { addDays, atLocal, dayLabel, localDate, minutesToLabel, money, pct, shortDay, time } from "../../../../../shared/pro/format";
import {
  FRANKY_TICKET_FEE,
  PHASE_LABEL,
  activeTier,
  crushStats,
  eventPhase,
  eventStats,
  guestsOf,
  nightOf,
  promoterTotals,
  shortUni,
  tierState,
  type EventPhase,
} from "../../../../../shared/pro/night";
import { localId, usePro } from "../../store";
import {
  DayChips,
  Empty,
  Field,
  Input,
  LiveDot,
  Meter,
  PAvatar,
  PButton,
  PText,
  Pill,
  SearchInput,
  Segmented,
  Sheet,
  Stepper,
  TONE_HEX,
  TimeStepper,
  Tip,
  Toggle,
} from "../../kit";
import { OfferComposer, type OfferPreset } from "../common/offer-composer";
import { RepeatWeekly } from "./repeat";

/**
 * Piezas compartidas del motor de noche: cartel, fases, tramos, detalle de
 * evento y alta de evento. Versión nativa de web/.../night/night-ui.tsx.
 */

/** Espera a que se cierre una hoja antes de abrir otra (iOS no apila dos modales). */
export function afterSheet(fn: () => void) {
  setTimeout(fn, 380);
}

/* ------------------------------------------------------------------ */
/* Cartel y estados                                                    */
/* ------------------------------------------------------------------ */

const POSTER_SIZE = {
  sm: { box: 48, radius: 12, day: 18, month: 9 },
  md: { box: 64, radius: 16, day: 24, month: 10.5 },
  lg: { box: 96, radius: 24, day: 36, month: 10.5 },
};

/** Cartel del evento: color propio, día y mes. Sin imágenes externas. */
export function Poster({ event, size = "md", style }: { event: ProEvent; size?: "sm" | "md" | "lg"; style?: StyleProp<ViewStyle> }) {
  const d = new Date(event.doorsOpen);
  const day = d.toLocaleDateString("es-ES", { day: "numeric", timeZone: "Europe/Madrid" });
  const month = d.toLocaleDateString("es-ES", { month: "short", timeZone: "Europe/Madrid" }).replace(".", "");
  const s = POSTER_SIZE[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: s.box,
          height: s.box,
          borderRadius: s.radius,
          backgroundColor: TONE_HEX[event.poster],
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: event.status === "draft" ? 0.6 : 1,
        },
        style,
      ]}
    >
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: s.box / 3, backgroundColor: "rgba(0,0,0,0.15)" }} />
      <Text style={{ fontFamily: FONT.display, fontSize: s.day, lineHeight: s.day * 1.05, color: "#FFFFFF" }} maxFontSizeMultiplier={1.1}>
        {day}
      </Text>
      <Text style={{ fontFamily: FONT.semibold, fontSize: s.month, letterSpacing: 1, textTransform: "uppercase", color: "#FFFFFF" }} maxFontSizeMultiplier={1.1}>
        {month}
      </Text>
    </View>
  );
}

export function PhasePill({ phase }: { phase: EventPhase }) {
  const t = phase === "live" ? "success" : phase === "today" ? "violet" : phase === "draft" ? "warning" : phase === "past" ? "neutral" : "info";
  if (phase !== "live") return <Pill label={PHASE_LABEL[phase]} tone={t} />;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <LiveDot size={7} />
      <Pill label={PHASE_LABEL[phase]} tone={t} />
    </View>
  );
}

export function eventWhen(ev: ProEvent): string {
  return `${shortDay(ev.doorsOpen)} · ${time(ev.doorsOpen)} a ${time(ev.closes)}`;
}

/** Tramos con su barra de venta. El tramo activo se marca: el precio sube solo al agotarse. */
export function TierList({ event, now, compact }: { event: ProEvent; now: Date; compact?: boolean }) {
  if (!event.tiers.length) {
    return <PText v="small">Entrada libre. El aforo se cuenta en puerta.</PText>;
  }
  return (
    <View style={{ gap: S.md }}>
      {event.tiers.map((t) => {
        const state = tierState(t, event, now);
        const door = t.until === null;
        const dim = state === "sold_out" || state === "closed";
        return (
          <View key={t.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.md }}>
              <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: S.sm }}>
                <PText v="h3" numberOfLines={1} color={dim ? C.muted : C.text} style={{ flexShrink: 1 }}>
                  {t.name}
                </PText>
                <Text style={{ fontFamily: FONT.heading, fontSize: 14, color: C.text }} maxFontSizeMultiplier={1.3}>
                  {money(t.priceCents)}
                </Text>
                {state === "active" ? <Pill label="A la venta" tone="violet" /> : null}
                {state === "sold_out" ? <Pill label="Agotada" /> : null}
                {state === "closed" && !compact ? <Pill label="Cerrada" /> : null}
              </View>
              <PText v="tiny">{`${t.sold}/${t.quantity}`}</PText>
            </View>
            <Meter value={t.sold} max={t.quantity} tone={state === "sold_out" ? "success" : "violet"} />
            {!compact ? (
              <PText v="tiny">
                {(door ? "Se vende en la puerta" : t.until ? `Hasta ${shortDay(t.until)}, ${time(t.until)} o hasta agotar` : "Hasta agotar") +
                  (t.includes ? ` · ${t.includes}` : "")}
              </PText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function priceNowLabel(event: ProEvent, now: Date): string | null {
  const tier = activeTier(event, now);
  if (!tier) return null;
  const idx = event.tiers.findIndex((t) => t.id === tier.id);
  const next = event.tiers[idx + 1];
  const left = tier.quantity - tier.sold;
  return next
    ? `Ahora ${money(tier.priceCents)}. Sube a ${money(next.priceCents)} ${left <= 40 ? `en ${left} entradas` : tier.until ? `el ${shortDay(tier.until)}` : "al agotarse"}.`
    : `Ahora ${money(tier.priceCents)} en ${tier.until === null ? "taquilla" : "venta online"}.`;
}

export function guestLabel(g: ProGuest): string {
  if (g.kind === "list") return "Lista";
  if (g.kind === "reserved") return g.tierName ? `Reservado ${g.tierName}` : "Reservado";
  return g.tierName ?? "Entrada";
}

export function promoterName(data: ProData, id?: string): string | null {
  if (!id) return null;
  return data.promoters.find((p) => p.id === id)?.name ?? null;
}

/** Etiqueta pequeña en mayúsculas para separar bloques dentro de una hoja. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <PText v="label" style={{ marginBottom: S.sm }}>
      {children}
    </PText>
  );
}

/** Cifra en caja con borde (detalle de evento, ficha de RRPP). */
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: 10 }}>
      <PText v="tiny" numberOfLines={1}>{label}</PText>
      <Text style={{ fontFamily: FONT.display, fontSize: 20, color: C.text, marginTop: 2 }} maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit>
        {String(value)}
      </Text>
      {hint ? <PText v="tiny" numberOfLines={1}>{hint}</PText> : null}
    </View>
  );
}

/** Rejilla de cifras en filas de `cols`. */
export function StatGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: number }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap: S.sm }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: S.sm }}>
          {row}
          {Array.from({ length: cols - row.length }, (_, k) => (
            <View key={`pad-${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Caja con borde que agrupa filas dentro de una hoja. */
export function Boxed({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>{children}</View>;
}

/** Fila densa dentro de una caja: sin el relleno lateral de los paneles. */
export function BoxRow({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: S.md,
        paddingHorizontal: S.md,
        paddingVertical: 10,
        minHeight: 48,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
      }}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle de un evento                                                */
/* ------------------------------------------------------------------ */

type GuestFilter = "all" | "ticket" | "list" | "reserved";

export function EventDrawer({ eventId, onClose }: { eventId: string | null; onClose: () => void }) {
  const { data } = usePro();
  const [filter, setFilter] = React.useState<GuestFilter>("all");
  const [q, setQ] = React.useState("");
  const [offer, setOffer] = React.useState<OfferPreset>(null);
  const ev = eventId ? data.events.find((e) => e.id === eventId) : undefined;

  React.useEffect(() => {
    setFilter("all");
    setQ("");
  }, [eventId]);

  return (
    <>
      {ev ? (
        <EventSheetBody
          ev={ev}
          filter={filter}
          setFilter={setFilter}
          q={q}
          setQ={setQ}
          onClose={onClose}
          onOffer={(preset) => {
            onClose();
            afterSheet(() => setOffer(preset));
          }}
        />
      ) : null}
      <OfferComposer preset={offer} onClose={() => setOffer(null)} />
    </>
  );
}

function EventSheetBody({
  ev,
  filter,
  setFilter,
  q,
  setQ,
  onClose,
  onOffer,
}: {
  ev: ProEvent;
  filter: GuestFilter;
  setFilter: (f: GuestFilter) => void;
  q: string;
  setQ: (q: string) => void;
  onClose: () => void;
  onOffer: (preset: OfferPreset) => void;
}) {
  const { data, now, update, vertical } = usePro();
  const phase = eventPhase(ev, now);
  const stats = eventStats(data, ev);
  const guests = guestsOf(data, ev.id);
  const shown = guests
    .filter((g) => filter === "all" || g.kind === filter)
    .filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? "") || a.name.localeCompare(b.name));
  const unis = guests
    .filter((g) => g.university)
    .reduce<Record<string, number>>((acc, g) => {
      const k = shortUni(g.university);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const uniTotal = Object.values(unis).reduce((a, b) => a + b, 0);
  const promoterRows = data.promoters
    .map((p) => ({ p, t: promoterTotals(data, p, ev.id) }))
    .filter((x) => x.t.sold + x.t.list > 0)
    .sort((a, b) => b.t.scanned - a.t.scanned);
  const crush = crushStats(ev, stats.sold);
  const organizer = ev.organizer;
  const priceNow = priceNowLabel(ev, now);

  const setEvent = (label: string, fn: (e: ProEvent) => ProEvent) =>
    update(label, (d) => ({ ...d, events: d.events.map((e) => (e.id === ev.id ? fn(e) : e)) }));

  const footer =
    phase === "draft" ? (
      <>
        <PButton
          label="Eliminar"
          icon={Trash2}
          variant="ghost"
          onPress={async () => {
            if (!(await update("event.delete", (d) => ({ ...d, events: d.events.filter((e) => e.id !== ev.id) })))) return;
            toast("Borrador eliminado", { kind: "success" });
            onClose();
          }}
        />
        <PButton
          label="Poner a la venta"
          onPress={async () => {
            if (!(await setEvent("event.publish", (e) => ({ ...e, status: "on_sale" })))) return;
            toast("Evento a la venta", { kind: "success", body: "Ya aparece en Ocio para los estudiantes de Alicante." });
          }}
        />
      </>
    ) : phase !== "past" ? (
      <PButton
        label="Lanzar a estudiantes"
        icon={Zap}
        onPress={() =>
          onOffer({
            what: `${ev.name}: entrada con copa`,
            date: ev.date,
            from: 23 * 60,
            to: 23 * 60 + 59,
            priceCents: activeTier(ev, now)?.priceCents ?? 1000,
            slots: 50,
          })
        }
      />
    ) : undefined;

  const extra = [`Aforo ${ev.capacity.toLocaleString("es-ES")} · +${ev.ageMin}`, organizer ? `Con ${organizer}` : "", ev.listCutoff ? `Lista hasta las ${time(ev.listCutoff)}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet open onClose={onClose} title={ev.name} description={eventWhen(ev)} footer={footer}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.lg }}>
        <Poster event={ev} size="lg" />
        <View style={{ flex: 1, gap: 6 }}>
          <PhasePill phase={phase} />
          {ev.lineup ? <PText v="small" color={C.text}>{ev.lineup}</PText> : null}
          <PText v="tiny">{extra}</PText>
        </View>
      </View>

      {phase === "past" ? (
        <View>
          <Eyebrow>Resultados</Eyebrow>
          <StatGrid>
            <Stat label="Vendidas" value={stats.sold} hint={`${stats.list} en lista`} />
            <Stat label="Pasaron por puerta" value={stats.inside} hint={`${pct(stats.inside, ev.capacity)} % del aforo`} />
            <Stat label="No vinieron" value={stats.noShows} hint="Con entrada o en lista" />
            <Stat label="Entradas" value={money(stats.revenueCents, { round: true })} hint="Íntegro para ti" />
            <Stat label="Estudiantes" value={`${pct(stats.students, Math.max(1, guests.filter((g) => g.kind === "ticket").length))} %`} hint="De las entradas" />
            <Stat label="Franky, 2,5 %" value={money(stats.frankyFeeCents, { round: true })} hint="Lo pagó el comprador" />
          </StatGrid>
          <View style={{ marginTop: S.md }}>
            <Tip title="Cuentas claras">
              {`Franky cobra un ${Math.round(FRANKY_TICKET_FEE * 1000) / 10} % por entrada y lo paga quien la compra, encima del precio. De los ${money(stats.revenueCents, { round: true })} de entradas no se descuenta nada: te llegan íntegros con tu cuota de ${vertical.price.monthly} € al mes.`}
            </Tip>
          </View>
        </View>
      ) : (
        <StatGrid cols={3}>
          <Stat label="Vendidas" value={stats.sold} hint={money(stats.revenueCents, { round: true })} />
          <Stat label="En lista" value={stats.list} hint={ev.listCutoff ? `Hasta ${time(ev.listCutoff)}` : "Sin corte"} />
          <Stat label="Dentro" value={stats.inside} hint={`de ${ev.capacity}`} />
        </StatGrid>
      )}

      <View>
        <Eyebrow>Tramos</Eyebrow>
        <TierList event={ev} now={now} />
        {priceNow ? (
          <PText v="small" color={C.blueDeep} style={{ marginTop: S.md, fontFamily: FONT.semibold }}>
            {priceNow}
          </PText>
        ) : null}
      </View>

      {phase !== "past" && phase !== "draft" ? <RepeatWeekly event={ev} /> : null}

      {phase !== "past" ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.xs }}>
          <Toggle
            label="Crush Live"
            detail={
              ev.crushLive
                ? `Pantallas de matches encendidas. ${crush.players} personas ya se han apuntado a jugar.`
                : "Enciende las pantallas de matches: la gente se apunta desde Franky al entrar."
            }
            value={ev.crushLive}
            onChange={async (v) => {
              if (!(await setEvent("event.crush", (e) => ({ ...e, crushLive: v })))) return;
              toast(v ? "Crush Live activado" : "Crush Live apagado", { kind: "success", body: v ? "Se enciende al abrir puertas." : undefined });
            }}
          />
        </View>
      ) : null}

      {uniTotal ? (
        <View>
          <Eyebrow>De dónde vienen</Eyebrow>
          <View style={{ gap: S.sm }}>
            {Object.entries(unis)
              .sort((a, b) => b[1] - a[1])
              .map(([u, n]) => (
                <View key={u} style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                  <PText v="h3" style={{ width: 48 }} numberOfLines={1}>
                    {u}
                  </PText>
                  <View style={{ flex: 1 }}>
                    <Meter value={n} max={uniTotal} />
                  </View>
                  <PText v="tiny" style={{ width: 76, textAlign: "right" }}>{`${n} · ${pct(n, uniTotal)} %`}</PText>
                </View>
              ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: S.sm }}>
            <BadgeCheck size={13} color={C.blue} />
            <PText v="tiny">Estudiantes verificados en Franky</PText>
          </View>
        </View>
      ) : null}

      {promoterRows.length ? (
        <View>
          <Eyebrow>RRPP de esta noche</Eyebrow>
          <Boxed>
            {promoterRows.map(({ p, t }, i) => (
              <BoxRow key={p.id} last={i === promoterRows.length - 1}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{p.name}</PText>
                  <PText v="tiny" numberOfLines={1}>{`${t.sold} vendidas · ${t.list} en lista · ${t.scanned} en puerta`}</PText>
                </View>
                <PText v="h3">{money(t.commissionCents)}</PText>
              </BoxRow>
            ))}
          </Boxed>
        </View>
      ) : null}

      <View>
        <Eyebrow>Asistentes</Eyebrow>
        <Segmented<GuestFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: guests.length },
            { value: "ticket", label: "Entradas", count: guests.filter((g) => g.kind === "ticket").length },
            { value: "list", label: "Lista", count: stats.list },
            { value: "reserved", label: "Reservados", count: stats.reserved },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre" />
        {shown.length ? (
          <Boxed>
            {shown.slice(0, 40).map((g, i) => {
              const rp = promoterName(data, g.promoterId);
              const sub = `${guestLabel(g)}${g.university ? ` · ${shortUni(g.university)}` : ""}${rp ? ` · de ${rp.split(" ")[0]}` : ""}`;
              return (
                <BoxRow key={g.id} last={i === Math.min(shown.length, 40) - 1 && shown.length <= 40}>
                  <PAvatar name={g.name} size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{g.name}</PText>
                      {g.university ? <BadgeCheck size={13} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
                    </View>
                    <PText v="tiny" numberOfLines={1}>{sub}</PText>
                  </View>
                  {g.checkedInAt ? (
                    <Pill label={time(g.checkedInAt)} tone="success" />
                  ) : phase === "past" ? (
                    <Pill label="No vino" tone="danger" />
                  ) : (
                    <Pill label="Pendiente" />
                  )}
                </BoxRow>
              );
            })}
            {shown.length > 40 ? (
              <View style={{ paddingHorizontal: S.md, paddingVertical: 10 }}>
                <PText v="tiny">{`Y ${shown.length - 40} más. Busca por nombre para encontrar a alguien.`}</PText>
              </View>
            ) : null}
          </Boxed>
        ) : (
          <Empty icon={Users} title="Nadie por aquí" body={q ? "No hay nadie con ese nombre." : "Cuando se venda la primera entrada aparecerá aquí."} />
        )}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Nuevo evento                                                        */
/* ------------------------------------------------------------------ */

type TierDraft = { key: string; name: string; price: string; quantity: string; door: boolean };

const TONE_ORDER = Object.keys(TONE_HEX) as ToneKey[];

function nextThursday(now: Date): string {
  const night = nightOf(now);
  const wd = (new Date(`${night}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(night, (3 - wd + 7) % 7 || 7);
}

export function NewEventDrawer({
  open,
  onClose,
  onCreated,
  initialDate,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string, draft: boolean) => void;
  /** Fecha elegida desde el calendario de la noche. */
  initialDate?: string;
}) {
  const { data, now, update } = usePro();
  const club = data.space.vertical === "nightclub";
  const today = localDate(now);
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState(nextThursday(now));
  const [doors, setDoors] = React.useState(club ? 23 * 60 + 30 : 22 * 60);
  const [closes, setCloses] = React.useState(club ? 6 * 60 : 2 * 60 + 30);
  const [capacity, setCapacity] = React.useState(String(data.events[0]?.capacity ?? (club ? 900 : 160)));
  const [ageMin, setAgeMin] = React.useState(18);
  const [hasCutoff, setHasCutoff] = React.useState(true);
  const [cutoff, setCutoff] = React.useState(club ? 90 : 30);
  const [crush, setCrush] = React.useState(true);
  const [poster, setPoster] = React.useState<ToneKey>("violet");
  const [tiers, setTiers] = React.useState<TierDraft[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setDate(initialDate ?? nextThursday(now));
    setPoster("violet");
    setCrush(true);
    setTiers(
      club
        ? [
            { key: "a", name: "Anticipada", price: "8", quantity: "250", door: false },
            { key: "b", name: "Segunda", price: "10", quantity: "300", door: false },
            { key: "c", name: "Taquilla", price: "12", quantity: "150", door: true },
          ]
        : [{ key: "a", name: "Entrada con copa", price: "6", quantity: "80", door: true }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Las horas anteriores a la apertura son de la madrugada siguiente.
  const at = (m: number) => (m > doors ? atLocal(date, m) : atLocal(addDays(date, 1), m));
  const valid = name.trim().length > 2 && date >= today && Number(capacity) > 0;

  const create = async (draft: boolean) => {
    const id = localId("ev");
    const ev: ProEvent = {
      id,
      name: name.trim(),
      date,
      doorsOpen: atLocal(date, doors),
      closes: at(closes),
      capacity: Number(capacity),
      checkedIn: 0,
      tiers: tiers
        .filter((t) => t.name.trim())
        .map((t, i) => ({
          id: `${id}-t${i + 1}`,
          name: t.name.trim(),
          priceCents: Math.round(Number(t.price.replace(",", ".")) * 100) || 0,
          quantity: Math.max(1, Number(t.quantity) || 1),
          sold: 0,
          until: t.door ? null : atLocal(date, doors),
        })),
      listCutoff: hasCutoff ? at(cutoff) : undefined,
      ageMin: Math.max(16, ageMin || 18),
      status: draft ? "draft" : "on_sale",
      crushLive: crush,
      poster,
      walkIns: 0,
    };
    if (!(await update("event.create", (d) => ({ ...d, events: [...d.events, ev] })))) return;
    toast(draft ? "Guardado como borrador" : "Evento a la venta", {
      kind: "success",
      body: draft ? undefined : `${dayLabel(ev.doorsOpen)}. Ya lo ven los estudiantes en Ocio.`,
    });
    onCreated?.(id, draft);
    onClose();
  };

  const setTier = (key: string, patch: Partial<TierDraft>) => setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const firstPrice = Math.round(Number((tiers[0]?.price ?? "0").replace(",", ".")) * 100) || 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo evento"
      description="Tramos que suben solos, lista con hora de corte y Crush Live."
      footer={
        <>
          <PButton label="Guardar borrador" variant="ghost" onPress={() => void create(true)} disabled={!name.trim()} />
          <PButton label="Poner a la venta" onPress={() => void create(false)} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} placeholder={club ? "Jueves Universitario" : "Miércoles de karaoke"} label="Nombre" />
      </Field>
      <Field label="Fecha">
        <DayChips value={date} onChange={setDate} today={today} days={initialDate ? 60 : 30} />
      </Field>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <Field label="Puertas">
          <TimeStepper value={doors} onChange={setDoors} label="hora de apertura" />
        </Field>
        <Field label="Cierre">
          <TimeStepper value={closes} onChange={setCloses} label="hora de cierre" />
        </Field>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.lg }}>
        <View style={{ width: 120 }}>
          <Field label="Aforo">
            <Input value={capacity} onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" label="Aforo" />
          </Field>
        </View>
        <Field label="Edad mínima">
          <Stepper value={ageMin} onChange={setAgeMin} min={16} max={30} label="edad mínima" format={(v) => `+${v}`} />
        </Field>
      </View>
      <Toggle label="Lista con hora de corte" value={hasCutoff} onChange={setHasCutoff} />
      {hasCutoff ? (
        <Field label="Corte de lista">
          <TimeStepper value={cutoff} onChange={setCutoff} label="hora de corte de lista" />
        </Field>
      ) : null}

      <Field label="Tramos de precio" hint="Cuando un tramo se agota o caduca, se abre el siguiente. La taquilla se vende en puerta.">
        <View style={{ gap: S.sm }}>
          {tiers.map((t) => (
            <View key={t.key} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <Input value={t.name} onChangeText={(v) => setTier(t.key, { name: v })} label="Nombre del tramo" style={{ flex: 1 }} />
              <Input value={t.price} onChangeText={(v) => setTier(t.key, { price: v })} keyboardType="decimal-pad" label="Precio en euros" style={{ width: 64, textAlign: "right", paddingHorizontal: S.sm }} />
              <Input value={t.quantity} onChangeText={(v) => setTier(t.key, { quantity: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" label="Cantidad" style={{ width: 70, textAlign: "right", paddingHorizontal: S.sm }} />
              <Tap
                onPress={() => setTiers((prev) => prev.filter((x) => x.key !== t.key))}
                accessibilityRole="button"
                accessibilityLabel={`Quitar tramo ${t.name}`}
                style={{ width: 44, height: 46, borderRadius: R.md, alignItems: "center", justifyContent: "center" }}
              >
                <Trash2 size={17} color={C.muted} strokeWidth={1.9} />
              </Tap>
            </View>
          ))}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
            <PText v="tiny">Nombre · € · Plazas</PText>
            <PButton
              label="Añadir tramo"
              icon={Plus}
              variant="ghost"
              small
              onPress={() => setTiers((prev) => [...prev, { key: localId("t"), name: `Tramo ${prev.length + 1}`, price: "10", quantity: "100", door: false }])}
            />
          </View>
        </View>
      </Field>

      <Field label="Color del cartel">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
          {TONE_ORDER.map((t) => {
            const on = poster === t;
            return (
              <Tap
                key={t}
                onPress={() => setPoster(t)}
                accessibilityRole="button"
                accessibilityLabel={`Color ${t}`}
                accessibilityState={{ selected: on }}
                style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 2, borderColor: on ? C.text : "transparent", padding: 2 }}
              >
                <View style={{ flex: 1, borderRadius: R.sm, backgroundColor: TONE_HEX[t] }} />
              </Tap>
            );
          })}
        </View>
      </Field>

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md, paddingVertical: S.xs }}>
        <Toggle label="Activar Crush Live" detail="Pantallas con los matches de la fiesta. Solo lo tiene tu sala." value={crush} onChange={setCrush} />
      </View>

      {name.trim() ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, backgroundColor: C.input, padding: S.md }}>
          <Poster
            event={{ id: "x", name, date, doorsOpen: atLocal(date, doors), closes: at(closes), capacity: 0, checkedIn: 0, tiers: [], ageMin: 18, status: "on_sale", crushLive: crush, poster }}
            size="sm"
          />
          <View style={{ flex: 1, gap: 2 }}>
            <PText v="h3" numberOfLines={1}>{name}</PText>
            <PText v="tiny">{`${dayLabel(atLocal(date, doors))} · ${minutesToLabel(doors)} · desde ${money(firstPrice)}`}</PText>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Fila de evento para listas (Hoy y Eventos). */
export function EventRow({ event, onPress, last }: { event: ProEvent; onPress: () => void; last?: boolean }) {
  const { data, now } = usePro();
  const stats = eventStats(data, event);
  const phase = eventPhase(event, now);
  const sellable = event.tiers.reduce((a, t) => a + t.quantity, 0);
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${eventWhen(event)}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: S.md,
        paddingHorizontal: S.lg,
        paddingVertical: S.md,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.borderLight,
      }}
    >
      <Poster event={event} size="sm" />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{event.name}</PText>
          {event.crushLive ? <Heart size={13} color={C.blue} accessibilityLabel="Crush Live" /> : null}
        </View>
        <PText v="tiny" numberOfLines={1}>{eventWhen(event)}</PText>
        {sellable ? (
          <View style={{ maxWidth: 220, marginTop: 4 }}>
            <Meter value={stats.sold} max={sellable} />
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>
          {phase === "past" ? stats.inside : stats.sold + stats.list}
        </Text>
        <PText v="tiny">{phase === "past" ? "entraron" : "con entrada o lista"}</PText>
      </View>
    </Tap>
  );
}
