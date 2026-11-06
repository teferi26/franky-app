import React from "react";
import { Linking, Modal, ScrollView, Share, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  Ban,
  Banknote,
  Camera,
  CheckCircle2,
  CreditCard,
  Download,
  Keyboard,
  Maximize2,
  Minimize2,
  Minus,
  NotebookPen,
  Plus,
  ScanLine,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import { Tap } from "@/components/ui";
import { FadeIn } from "@/components/motion";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProData, ProEvent, ProGuest } from "../../../../../shared/pro/types";
import type { ProBan, ProPayMethod } from "../../../../../shared/pro/night-types";
import { localMinutes, minutesToLabel, money, pct, shortDay, time } from "../../../../../shared/pro/format";
import { entryCurve, entryRate, eventPhase, focusEvent, guestsOf, listClosed, shortUni, upcomingEvents } from "../../../../../shared/pro/night";
import { afterCutoffPrice, banFor, capacityState, doorTotals, nightOpsOf, occupancyLog, peakInside, withNightOps } from "../../../../../shared/pro/night-ops";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { LiveDot, Meter, PButton, PageHeader, TONE_HEX, Tip } from "../../kit";
import { guestLabel, promoterName } from "./night-ui";
import { IncidentSheet } from "./ops-ui";

type ScanResult =
  | { kind: "ok"; guest: ProGuest; at: number }
  | { kind: "used"; guest: ProGuest; at: number }
  | { kind: "other"; guest: ProGuest; event: ProEvent; at: number }
  | { kind: "age"; guest: ProGuest; at: number }
  | { kind: "list_closed"; guest: ProGuest; at: number }
  | { kind: "banned"; guest: ProGuest; ban: ProBan; at: number }
  | { kind: "full"; guest: ProGuest; at: number }
  | { kind: "invalid"; at: number };

/** Fondo del modo puerta: el bloque oscuro de Franky, pensado para la noche. */
const DOOR_BG = "#121019";
const DIM = "rgba(255,255,255,0.6)";
const FAINT = "rgba(255,255,255,0.1)";
const LINE = "rgba(255,255,255,0.15)";

export default function NightPuerta() {
  const { data, now } = usePro();
  const [full, setFull] = React.useState(false);
  const focus = focusEvent(data, now);
  const events = upcomingEvents(data, now);
  const [eventId, setEventId] = React.useState<string | null>(null);
  const ev = (eventId ? data.events.find((e) => e.id === eventId) : null) ?? focus;

  const door = ev ? (
    <DoorMode event={ev} events={events} onPickEvent={setEventId} fullscreen={full} onToggleFull={() => setFull((v) => !v)} />
  ) : (
    <View style={{ alignItems: "center", paddingHorizontal: S.xl, paddingVertical: 56, gap: S.sm }}>
      <ScanLine size={32} color={DIM} strokeWidth={1.6} />
      <DoorText size={18} font={FONT.heading} style={{ textAlign: "center", marginTop: S.sm }}>
        No hay ninguna noche abierta
      </DoorText>
      <DoorText size={14} color={DIM} style={{ textAlign: "center" }}>
        Crea un evento en Eventos y la puerta se prepara sola: entradas, lista y aforo.
      </DoorText>
    </View>
  );

  return (
    <ProPage>
      <PageHeader
        eyebrow="Modo puerta"
        title="Puerta"
        description={
          ev
            ? `${ev.name}: ${ev.checkedIn} dentro de ${ev.capacity}. Cada portero escanea desde su móvil y el aforo se actualiza en todos.`
            : "Escanea entradas, busca a los de lista y controla el aforo en directo."
        }
        actions={ev ? <PButton label="Pantalla completa" icon={Maximize2} onPress={() => setFull(true)} /> : null}
      />
      <View style={{ borderRadius: 28, backgroundColor: DOOR_BG, overflow: "hidden", marginBottom: S.lg }}>{full ? null : door}</View>
      <Tip title="Menos cola en la puerta">
        Pon un portero escaneando entradas y otro con el buscador para la lista. Verde entra, rojo no, ámbar pide el DNI. Si la entrada es de otro día o ya se usó, Franky lo dice al momento.
      </Tip>

      <FullDoor open={full && Boolean(ev)} onClose={() => setFull(false)}>
        {door}
      </FullDoor>
    </ProPage>
  );
}

/** Pantalla completa: el móvil del portero solo enseña la puerta. */
function FullDoor({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View accessibilityViewIsModal accessibilityLabel="Modo puerta" style={{ flex: 1, backgroundColor: DOOR_BG }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + S.lg }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

function DoorMode({
  event,
  events,
  onPickEvent,
  fullscreen,
  onToggleFull,
}: {
  event: ProEvent;
  events: ProEvent[];
  onPickEvent: (id: string) => void;
  fullscreen: boolean;
  onToggleFull: () => void;
}) {
  const { data, update, demo } = usePro();
  const [tick, setTick] = React.useState(() => Date.now());
  const [result, setResult] = React.useState<ScanResult | null>(null);
  const [q, setQ] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const nowDate = new Date(tick);
  const phase = eventPhase(event, nowDate);
  const guests = guestsOf(data, event.id);
  const fill = pct(event.checkedIn, event.capacity);
  const rate = entryRate(data, event, nowDate);
  const curve = entryCurve(data, event, nowDate, 32);
  const last = curve.reduce((acc, v, i) => (v > 0 ? i : acc), -1);
  const visibleCurve = curve.slice(Math.max(0, last - 11), last + 1);
  const closed = listClosed(event, nowDate);
  const doorTier = event.tiers.find((t) => t.until === null && t.sold < t.quantity);
  const ops = nightOpsOf(data);
  const cap = capacityState(event);
  const full = cap.level === "full";
  // Quien viene en lista y llega pasada la hora paga esto (su precio propio o la taquilla).
  const latePrice = closed ? afterCutoffPrice(event) : null;
  const door = doorTotals(ops, event.id);
  const recent = guests
    .filter((g) => g.checkedInAt)
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? ""))
    .slice(0, 8);
  const matches = q.trim().length >= 2 ? guests.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  const checkIn = async (guest: ProGuest) => {
    const at = new Date().toISOString();
    const ok = await update("door.checkin", (d) => ({
      ...d,
      // Si no tenía la edad verificada, la puerta ha visto su documento: solo se apunta la hora.
      guests: d.guests.map((g) => (g.id === guest.id ? { ...g, checkedInAt: at, age18: true, ageCheckedAt: g.age18 ? g.ageCheckedAt : at } : g)),
      events: d.events.map((e) => (e.id === guest.eventId ? { ...e, checkedIn: e.checkedIn + 1 } : e)),
      promoters: guest.promoterId ? d.promoters.map((p) => (p.id === guest.promoterId ? { ...p, checkedIn: p.checkedIn + 1 } : p)) : d.promoters,
    }));
    setTick(Date.now());
    return ok;
  };

  const sellDoor = async (method: ProPayMethod, name?: string, replacing?: ProGuest) => {
    if (!doorTier) return false;
    if (full) {
      toast("Aforo completo", { kind: "error", body: "Espera a que salga alguien para vender más taquilla." });
      return false;
    }
    const at = new Date().toISOString();
    const guest: ProGuest = {
      id: localId("g"),
      name: name ?? "Taquilla",
      eventId: event.id,
      kind: "ticket",
      tierName: doorTier.name,
      promoterId: replacing?.promoterId,
      checkedInAt: at,
      age18: true,
      university: replacing?.university,
    };
    const ok = await update("door.sell", (d) => ({
      ...withNightOps(d, (o) => ({
        ...o,
        doorSales: [...o.doorSales, { id: localId("ds"), eventId: event.id, at, cents: doorTier.priceCents, method, tierName: doorTier.name, guestName: name }],
      })),
      guests: [...d.guests.filter((g) => g.id !== replacing?.id), guest],
      events: d.events.map((e) =>
        e.id === event.id ? { ...e, checkedIn: e.checkedIn + 1, tiers: e.tiers.map((t) => (t.id === doorTier.id ? { ...t, sold: t.sold + 1 } : t)) } : e,
      ),
    }));
    setTick(Date.now());
    if (ok) toast(`Taquilla cobrada: ${money(doorTier.priceCents)}`, { kind: "success", body: `${method === "cash" ? "En efectivo" : "Con tarjeta"}${name ? `. ${name} entra` : ""}.` });
    return ok;
  };

  /** Lista pasada la hora de corte: paga en puerta, entra y cuenta para la caja. */
  const admitLate = async (guest: ProGuest, method: ProPayMethod) => {
    if (latePrice === null) return false;
    if (full) {
      toast("Aforo completo", { kind: "error", body: "Espera a que salga alguien." });
      return false;
    }
    const at = new Date().toISOString();
    const ok = await update("door.late", (d) => ({
      ...withNightOps(d, (o) => ({
        ...o,
        doorSales: [
          ...o.doorSales,
          { id: localId("ds"), eventId: event.id, at, cents: latePrice, method, tierName: "Lista pasada la hora", guestName: guest.name, afterCutoff: true },
        ],
      })),
      guests: d.guests.map((g) => (g.id === guest.id ? { ...g, checkedInAt: at, age18: true } : g)),
      events: d.events.map((e) => (e.id === event.id ? { ...e, checkedIn: e.checkedIn + 1 } : e)),
      promoters: guest.promoterId ? d.promoters.map((p) => (p.id === guest.promoterId ? { ...p, checkedIn: p.checkedIn + 1 } : p)) : d.promoters,
    }));
    setTick(Date.now());
    if (ok) toast(`${guest.name} paga ${money(latePrice)} y entra`, { kind: "success", body: method === "cash" ? "En efectivo" : "Con tarjeta" });
    return ok;
  };

  const count = (delta: 1 | -1) => {
    if (delta > 0 && full) {
      toast("Aforo completo", { kind: "error", body: "Solo entra alguien cuando sale otra persona." });
      return;
    }
    const at = new Date().toISOString();
    void update("door.count", (d) => ({
      // Cada pulsación queda en el registro de aforo cada 15 minutos.
      ...withNightOps(d, (o) => ({ ...o, doorMoves: [...o.doorMoves, { id: localId("dm"), eventId: event.id, at, delta }] })),
      events: d.events.map((e) => {
        if (e.id !== event.id) return e;
        const walk = e.walkIns ?? 0;
        return { ...e, checkedIn: Math.max(0, e.checkedIn + delta), walkIns: Math.max(0, walk + delta) };
      }),
    }));
  };

  const feedback = (next: ScanResult) => {
    setResult(next);
    const type =
      next.kind === "ok"
        ? Haptics.NotificationFeedbackType.Success
        : next.kind === "age" || next.kind === "list_closed" || next.kind === "full"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error;
    void Haptics.notificationAsync(type).catch(() => {
      // sin vibración
    });
  };

  /** Decide qué pasa con una entrada leída (cámara o código escrito). */
  const admit = async (guest: ProGuest | undefined) => {
    const at = Date.now();
    if (!guest) return feedback({ kind: "invalid", at });
    if (guest.eventId !== event.id) {
      const other = data.events.find((e) => e.id === guest.eventId);
      return feedback(other ? { kind: "other", guest, event: other, at } : { kind: "invalid", at });
    }
    if (guest.checkedInAt) return feedback({ kind: "used", guest, at });
    // El veto va primero: aunque tenga entrada o venga con otro RRPP, no entra.
    const ban = banFor(ops, guest.name, new Date());
    if (ban) return feedback({ kind: "banned", guest, ban, at });
    if (!guest.age18) return feedback({ kind: "age", guest, at });
    if (guest.kind === "list" && closed) return feedback({ kind: "list_closed", guest, at });
    if (full) return feedback({ kind: "full", guest, at });
    if (!(await checkIn(guest))) return;
    feedback({ kind: "ok", guest, at });
  };

  /** El QR de la entrada lleva el identificador del asistente, solo o al final de un enlace. */
  const readCode = (raw: string) => {
    const text = raw.trim().slice(0, 256);
    const tail = text.split(/[/?#=&:]/).filter(Boolean).pop() ?? "";
    const wanted = [text, tail].map((v) => v.toLowerCase());
    return data.guests.find((g) => wanted.includes(g.id.toLowerCase()));
  };

  /** Demo: sin entradas reales, se simula una lectura como en la web. */
  const simulate = () => {
    const at = Date.now();
    const pending = guests.filter((g) => !g.checkedInAt && g.kind !== "reserved");
    const used = guests.filter((g) => g.checkedInAt);
    const others = data.guests.filter((g) => g.eventId !== event.id);
    const banned = pending.filter((g) => banFor(ops, g.name, new Date()));
    const roll = Math.random();
    if (roll < 0.1 && used.length) return void admit(pick(used));
    if (roll < 0.17 && others.length) return void admit(pick(others));
    if (roll < 0.21 || !pending.length) return feedback({ kind: "invalid", at });
    if (roll < 0.27 && banned.length) return void admit(pick(banned));
    void admit(pick(pending));
  };

  const resolve = async (fn: () => Promise<boolean>, message: string) => {
    if (!(await fn())) return;
    setResult(null);
    toast(message, { kind: "success" });
  };

  const resultCard = result ? (
    <ResultCard
      key={result.at}
      result={result}
      data={data}
      onClose={() => setResult(null)}
      onAdmit={(g) => {
        if (full) {
          toast("Aforo completo", { kind: "error", body: "Espera a que salga alguien." });
          return;
        }
        void resolve(() => checkIn(g), `${g.name} entra`);
      }}
      onPayLate={latePrice !== null ? (g, method) => void resolve(() => admitLate(g, method), `${g.name} entra`) : undefined}
      latePrice={latePrice ?? undefined}
    />
  ) : null;

  /** El registro de aforo por franjas, para enseñarlo si hay una inspección. */
  const shareOccupancy = () => {
    const rows = occupancyLog(data, event, nowDate);
    const peak = peakInside(rows);
    const lines = rows.map((r) => `${minutesToLabel(localMinutes(r.from))}: entran ${r.entries}, salen ${r.exits}, dentro ${r.inside}`);
    const text = [`Registro de aforo de ${event.name} (${shortDay(event.doorsOpen)}). Aforo ${event.capacity}, pico ${peak.inside}.`, ...lines].join("\n");
    void Share.share({ title: "Registro de aforo", message: text }).catch(() => {
      toast("No se ha podido compartir", { kind: "error" });
    });
  };

  const listCount = guests.filter((g) => g.kind === "list").length;
  const listInside = guests.filter((g) => g.kind === "list" && g.checkedInAt).length;

  return (
    <View style={{ padding: S.lg, gap: S.lg }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            {phase === "live" ? <LiveDot /> : null}
            <DoorText size={11.5} font={FONT.semibold} color={DIM} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>
              {`${phase === "live" ? "Puertas abiertas" : phase === "today" ? `Abres a las ${time(event.doorsOpen)}` : shortDay(event.doorsOpen)} · ${time(nowDate.toISOString())}`}
            </DoorText>
          </View>
          <DoorText size={22} font={FONT.display} numberOfLines={1} style={{ letterSpacing: -0.4 }}>
            {event.name}
          </DoorText>
        </View>
        <DoorIconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onPress={onToggleFull} />
      </View>

      {cap.level !== "ok" ? (
        <View accessibilityRole="alert" style={{ flexDirection: "row", gap: S.sm, borderRadius: R.lg, padding: S.md, backgroundColor: full ? TONE_HEX.rose : TONE_HEX.amber }}>
          <AlertTriangle size={19} color={full ? "#FFFFFF" : DOOR_BG} strokeWidth={2.2} />
          <DoorText size={14} font={FONT.semibold} color={full ? "#FFFFFF" : DOOR_BG} style={{ flex: 1 }}>
            {full
              ? `Aforo completo (${event.capacity}). Solo entra alguien cuando sale otra persona.`
              : `Aforo al ${cap.pct} %: quedan ${cap.left} plazas. Avisa a la barra y controla la entrada.`}
          </DoorText>
        </View>
      ) : null}

      {events.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }} style={{ flexGrow: 0 }} accessibilityRole="tablist" accessibilityLabel="Evento">
          {events.map((e) => {
            const on = e.id === event.id;
            return (
              <Tap
                key={e.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  onPickEvent(e.id);
                  setResult(null);
                }}
                style={{ minHeight: 44, paddingHorizontal: S.lg, borderRadius: R.full, borderWidth: 1, borderColor: on ? "#FFFFFF" : LINE, backgroundColor: on ? "#FFFFFF" : "transparent", justifyContent: "center" }}
              >
                <DoorText size={14} font={FONT.semibold} color={on ? DOOR_BG : "rgba(255,255,255,0.7)"}>
                  {`${e.name.split(" ")[0]} · ${shortDay(e.doorsOpen)}`}
                </DoorText>
              </Tap>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Escáner primero: es lo que más se toca en la puerta */}
      {guests.length || event.tiers.length ? (
        <Tap
          onPress={() => setScanning(true)}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Escanear entrada"
          style={{ height: 76, borderRadius: 24, backgroundColor: C.blue, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: S.md }}
        >
          <ScanLine size={24} color={C.onAccent} strokeWidth={2} />
          <Text style={{ fontFamily: FONT.heading, fontSize: 19, color: C.onAccent }} maxFontSizeMultiplier={1.2}>
            Escanear
          </Text>
        </Tap>
      ) : (
        <DoorCard>
          <DoorText size={17} font={FONT.heading}>
            Entrada libre esta noche
          </DoorText>
          <DoorText size={14} color={DIM}>
            No hay entradas que escanear. Cuenta el aforo con Entra y Sale: lo ve todo el equipo.
          </DoorText>
        </DoorCard>
      )}

      <View accessibilityLiveRegion="assertive">{resultCard}</View>

      {/* Aforo */}
      <DoorCard>
        <DoorText size={14} color={DIM}>
          Dentro ahora
        </DoorText>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: S.md }}>
          <DoorText size={72} font={FONT.display} style={{ lineHeight: 76, letterSpacing: -2.5 }}>
            {String(event.checkedIn)}
          </DoorText>
          <DoorText size={24} font={FONT.semibold} color="rgba(255,255,255,0.5)">{`/ ${event.capacity}`}</DoorText>
        </View>
        <View accessibilityLabel="Aforo" style={{ marginTop: S.sm }}>
          <Meter value={event.checkedIn} max={event.capacity} tone={fill >= 95 ? "danger" : fill >= 80 ? "warning" : "success"} />
        </View>
        <DoorText size={14} color="rgba(255,255,255,0.7)">
          {fill >= 100 ? "Aforo completo: solo entra quien sale." : `${fill} % · quedan ${Math.max(0, event.capacity - event.checkedIn)} plazas`}
        </DoorText>

        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm }}>
          <DoorFigure value={rate.toLocaleString("es-ES")} label="entradas por minuto" />
          <DoorFigure
            value={event.listCutoff ? (closed ? "Cerrada" : time(event.listCutoff)) : "Sin lista"}
            label={event.listCutoff ? (closed ? "la lista ya no entra gratis" : "corte de lista") : "entrada libre"}
          />
        </View>

        {visibleCurve.length > 1 ? (
          <View style={{ marginTop: S.sm }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 56, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
              {visibleCurve.map((v, i) => {
                const max = Math.max(1, ...visibleCurve);
                return (
                  <View
                    key={i}
                    style={{ flex: 1, borderRadius: 3, height: `${Math.max(6, (v / max) * 100)}%`, backgroundColor: i === visibleCurve.length - 1 ? TONE_HEX.emerald : "rgba(255,255,255,0.2)" }}
                  />
                );
              })}
            </View>
            <DoorText size={11} color="rgba(255,255,255,0.5)" style={{ marginTop: 4 }}>
              Entradas cada 15 minutos
            </DoorText>
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm }}>
          <DoorButton icon={Minus} label="Sale" accessibilityLabel="Sale una persona" onPress={() => count(-1)} style={{ flex: 1 }} />
          <DoorButton icon={Plus} label="Entra" accessibilityLabel="Entra una persona sin entrada" onPress={() => count(1)} style={{ flex: 1 }} />
        </View>
        {doorTier ? (
          <View style={{ gap: S.sm, marginTop: S.sm }}>
            <DoorText size={14} color={DIM}>{`Vender ${doorTier.name.toLowerCase()} · ${money(doorTier.priceCents)}`}</DoorText>
            <View style={{ flexDirection: "row", gap: S.md }}>
              <DoorButton icon={Banknote} label="Efectivo" onPress={() => void sellDoor("cash")} style={{ flex: 1 }} />
              <DoorButton icon={CreditCard} label="Tarjeta" onPress={() => void sellDoor("card")} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
        {door.count ? (
          <DoorText size={12} color={DIM}>
            {`Taquilla esta noche: ${money(door.cashCents)} en efectivo y ${money(door.cardCents)} con tarjeta. Se suma solo al cierre de caja.`}
          </DoorText>
        ) : null}
        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.sm, paddingTop: S.md, borderTopWidth: 1, borderTopColor: FAINT }}>
          <DoorButton icon={NotebookPen} label="Incidencia" compact onPress={() => setReporting(true)} style={{ flex: 1 }} />
          <DoorButton icon={Download} label="Registro de aforo" compact onPress={shareOccupancy} style={{ flex: 1 }} />
        </View>
      </DoorCard>

      {/* Lista por nombre */}
      <DoorCard>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 50, borderRadius: R.lg, borderWidth: 1, borderColor: LINE, backgroundColor: FAINT, paddingHorizontal: S.md }}>
          <Search size={19} color="rgba(255,255,255,0.5)" strokeWidth={1.9} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar en lista por nombre"
            placeholderTextColor="rgba(255,255,255,0.5)"
            accessibilityLabel="Buscar en la lista por nombre"
            returnKeyType="search"
            autoCorrect={false}
            maxFontSizeMultiplier={1.4}
            style={{ flex: 1, color: "#FFFFFF", fontSize: 16, paddingVertical: 12 }}
          />
          {q ? (
            <Tap onPress={() => setQ("")} accessibilityRole="button" accessibilityLabel="Borrar búsqueda" style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <X size={17} color="rgba(255,255,255,0.7)" />
            </Tap>
          ) : null}
        </View>
        {q.trim().length >= 2 ? (
          matches.length ? (
            <View>
              {matches.map((g, i) => {
                const listBlocked = g.kind === "list" && closed && !g.checkedInAt;
                const ban = g.checkedInAt ? null : banFor(ops, g.name, nowDate);
                const rp = promoterName(data, g.promoterId);
                const sub = `${guestLabel(g)}${rp ? ` · de ${rp.split(" ")[0]}` : ""}${g.university ? ` · ${shortUni(g.university)}` : ""}${!g.age18 && !g.checkedInAt ? " · pedir DNI" : ""}`;
                return (
                  <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: FAINT }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <DoorText size={15} font={FONT.semibold} numberOfLines={1}>
                        {g.name}
                      </DoorText>
                      <DoorText size={12} color={DIM} numberOfLines={1}>
                        {sub}
                      </DoorText>
                      {ban ? (
                        <DoorText size={12} font={FONT.semibold} color={TONE_HEX.rose} numberOfLines={2}>
                          {ban.reason}
                        </DoorText>
                      ) : null}
                    </View>
                    {g.checkedInAt ? (
                      <View style={{ borderRadius: R.full, backgroundColor: FAINT, paddingHorizontal: S.md, paddingVertical: 6 }}>
                        <DoorText size={12} font={FONT.semibold} color="rgba(255,255,255,0.7)">{`Dentro ${time(g.checkedInAt)}`}</DoorText>
                      </View>
                    ) : ban ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: R.full, backgroundColor: TONE_HEX.rose, paddingHorizontal: S.md, paddingVertical: 6 }}>
                        <Ban size={13} color="#FFFFFF" strokeWidth={2.2} />
                        <DoorText size={12} font={FONT.heading}>
                          Vetado
                        </DoorText>
                      </View>
                    ) : listBlocked ? (
                      latePrice !== null ? (
                        <View style={{ flexDirection: "row", gap: S.sm }}>
                          <DoorButton icon={Banknote} label={money(latePrice)} compact accessibilityLabel={`${g.name} paga ${money(latePrice)} en efectivo`} onPress={() => void admitLate(g, "cash")} />
                          <DoorIconButton icon={CreditCard} label={`${g.name} paga ${money(latePrice)} con tarjeta`} onPress={() => void admitLate(g, "card")} />
                        </View>
                      ) : (
                        <DoorText size={12} color={DIM}>
                          Lista cerrada
                        </DoorText>
                      )
                    ) : (
                      <Tap
                        haptic
                        disabled={full}
                        onPress={async () => {
                          if (!(await checkIn(g))) return;
                          toast(`${g.name} entra`, { kind: "success", body: g.age18 ? guestLabel(g) : "Documento visto, apuntada la hora." });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={g.age18 ? `${g.name} entra` : `DNI visto, ${g.name} entra`}
                        style={{ minHeight: 44, paddingHorizontal: S.lg, borderRadius: R.md, backgroundColor: C.blue, justifyContent: "center", opacity: full ? 0.45 : 1 }}
                      >
                        <Text style={{ fontFamily: FONT.semibold, fontSize: 15, color: C.onAccent }} maxFontSizeMultiplier={1.3}>
                          {g.age18 ? "Entra" : "DNI visto, entra"}
                        </Text>
                      </Tap>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <DoorText size={14} color={DIM}>
              No hay nadie con ese nombre en esta noche.
            </DoorText>
          )
        ) : (
          <DoorText size={12} color="rgba(255,255,255,0.5)">{`${listCount} en lista · ${listInside} ya dentro`}</DoorText>
        )}
      </DoorCard>

      {/* Últimas entradas */}
      <DoorCard>
        <DoorText size={14} font={FONT.semibold}>
          Últimas entradas
        </DoorText>
        {recent.length ? (
          <View>
            {recent.map((g, i) => (
              <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: FAINT }}>
                <DoorText size={12} font={FONT.semibold} color="rgba(255,255,255,0.5)" style={{ width: 44 }}>
                  {time(g.checkedInAt as string)}
                </DoorText>
                <DoorText size={14} numberOfLines={1} style={{ flex: 1 }}>
                  {g.name}
                </DoorText>
                <DoorText size={12} color={DIM} numberOfLines={1} style={{ maxWidth: 150 }}>
                  {`${g.ageCheckedAt ? `DNI visto ${time(g.ageCheckedAt)} · ` : ""}${guestLabel(g)}`}
                </DoorText>
              </View>
            ))}
          </View>
        ) : (
          <DoorText size={14} color={DIM}>
            Todavía no ha entrado nadie. Pulsa Escanear cuando llegue el primero.
          </DoorText>
        )}
      </DoorCard>

      <ScannerSheet
        open={scanning}
        onClose={() => setScanning(false)}
        onCode={(raw) => void admit(readCode(raw))}
        onSimulate={demo ? simulate : undefined}
        result={resultCard}
      />
      <IncidentSheet open={reporting} onClose={() => setReporting(false)} event={event} />
    </View>
  );
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/* ------------------------------------------------------------------ */
/* Escáner: cámara y código escrito                                     */
/* ------------------------------------------------------------------ */

function ScannerSheet({
  open,
  onClose,
  onCode,
  onSimulate,
  result,
}: {
  open: boolean;
  onClose: () => void;
  onCode: (raw: string) => void;
  onSimulate?: () => void;
  result: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  // Un QR queda delante de la cámara varios fotogramas: se lee una vez y se espera.
  const lastRead = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busy = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    setManual("");
    setTyping(false);
    lastRead.current = { code: "", at: 0 };
  }, [open]);

  const onScanned = (scan: BarcodeScanningResult) => {
    const code = scan.data ?? "";
    const t = Date.now();
    if (busy.current) return;
    if (code === lastRead.current.code && t - lastRead.current.at < 4000) return;
    busy.current = true;
    lastRead.current = { code, at: t };
    onCode(code);
    setTimeout(() => {
      busy.current = false;
    }, 1500);
  };

  const submitManual = () => {
    if (!manual.trim()) return;
    onCode(manual);
    setManual("");
  };

  const askCamera = async () => {
    if (permission && !permission.canAskAgain) {
      void Linking.openSettings();
      return;
    }
    await requestPermission();
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: DOOR_BG }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + S.md, paddingBottom: insets.bottom + S.lg, paddingHorizontal: S.lg, gap: S.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <View style={{ flex: 1 }}>
              <DoorText size={20} font={FONT.display}>
                Escanear entradas
              </DoorText>
              <DoorText size={13} color={DIM}>
                Apunta al QR de la entrada en la app de Franky.
              </DoorText>
            </View>
            <DoorIconButton icon={X} label="Cerrar escáner" onPress={onClose} />
          </View>

          <View style={{ height: 300, borderRadius: 24, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: LINE }}>
            {permission?.granted ? (
              open ? (
                <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScanned} />
              ) : null
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: S.xl, gap: S.md }}>
                <Camera size={30} color={DIM} strokeWidth={1.6} />
                <DoorText size={14} color="rgba(255,255,255,0.75)" style={{ textAlign: "center" }}>
                  {permission && !permission.canAskAgain
                    ? "La cámara está bloqueada para Franky. Actívala en los ajustes del móvil o escribe el código."
                    : "Franky necesita la cámara para leer las entradas en la puerta."}
                </DoorText>
                <DoorButton label={permission && !permission.canAskAgain ? "Abrir ajustes" : "Permitir la cámara"} compact onPress={() => void askCamera()} />
              </View>
            )}
          </View>

          {result}

          {typing ? (
            <DoorCard>
              <DoorText size={14} font={FONT.semibold}>
                Código de la entrada
              </DoorText>
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <TextInput
                  value={manual}
                  onChangeText={setManual}
                  placeholder="Escribe el código"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  accessibilityLabel="Código de la entrada"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={submitManual}
                  maxFontSizeMultiplier={1.4}
                  style={{ flex: 1, minHeight: 48, borderRadius: R.md, borderWidth: 1, borderColor: LINE, backgroundColor: FAINT, paddingHorizontal: S.md, color: "#FFFFFF", fontSize: 16 }}
                />
                <DoorButton label="Validar" compact onPress={submitManual} />
              </View>
            </DoorCard>
          ) : (
            <DoorButton icon={Keyboard} label="Escribir el código" onPress={() => setTyping(true)} />
          )}

          {onSimulate ? <DoorButton icon={ScanLine} label="Probar con una entrada de la lista" onPress={onSimulate} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Resultado de una lectura                                            */
/* ------------------------------------------------------------------ */

function ResultCard({
  result,
  data,
  onClose,
  onAdmit,
  onPayLate,
  latePrice,
}: {
  result: ScanResult;
  data: ProData;
  onClose: () => void;
  onAdmit: (g: ProGuest) => void;
  onPayLate?: (g: ProGuest, method: ProPayMethod) => void;
  latePrice?: number;
}) {
  if (result.kind === "banned") {
    return (
      <ResultShell bg={TONE_HEX.rose} fg="#FFFFFF" icon={Ban} label="Acceso denegado">
        <ResultTitle color="#FFFFFF">{result.guest.name}</ResultTitle>
        <DoorText size={16} font={FONT.semibold}>
          {result.ban.reason}
        </DoorText>
        <DoorText size={14} color="rgba(255,255,255,0.85)">
          {`Vetado desde el ${shortDay(result.ban.since)} por ${result.ban.by.split(" ")[0]}${result.ban.until ? `, hasta el ${shortDay(result.ban.until)}` : ", sin fecha de fin"}.`}
        </DoorText>
      </ResultShell>
    );
  }
  if (result.kind === "full") {
    return (
      <ResultShell bg={TONE_HEX.amber} fg={DOOR_BG} icon={AlertTriangle} label="Aforo completo">
        <ResultTitle color={DOOR_BG}>{result.guest.name}</ResultTitle>
        <DoorText size={16} font={FONT.semibold} color={DOOR_BG}>
          Su entrada es válida. Que espere a que salga alguien y vuelve a escanear.
        </DoorText>
      </ResultShell>
    );
  }
  if (result.kind === "ok") {
    const rp = promoterName(data, result.guest.promoterId);
    return (
      <ResultShell bg={TONE_HEX.emerald} fg={DOOR_BG} icon={CheckCircle2} label="Entra">
        <ResultTitle color={DOOR_BG}>{result.guest.name}</ResultTitle>
        <DoorText size={16} font={FONT.semibold} color={DOOR_BG}>
          {`${guestLabel(result.guest)}${rp ? ` · RRPP ${rp.split(" ")[0]}` : ""}${result.guest.university ? ` · ${shortUni(result.guest.university)}` : ""}`}
        </DoorText>
      </ResultShell>
    );
  }
  if (result.kind === "age" || result.kind === "list_closed") {
    const age = result.kind === "age";
    const guest = result.guest;
    return (
      <ResultShell bg={TONE_HEX.amber} fg={DOOR_BG} icon={AlertTriangle} label={age ? "+18: comprueba el DNI" : "Lista cerrada"}>
        <ResultTitle color={DOOR_BG}>{guest.name}</ResultTitle>
        <DoorText size={16} font={FONT.semibold} color={DOOR_BG}>
          {age
            ? `${guestLabel(guest)}. Mira su DNI: no hace falta foto ni número, Franky solo apunta la hora.`
            : `Llega después de la hora de corte${latePrice !== undefined ? `: paga ${money(latePrice)}` : ""}.`}
        </DoorText>
        <View style={{ flexDirection: "row", gap: S.md, marginTop: S.md }}>
          <Tap
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="No entra"
            style={{ flex: 1, minHeight: 50, borderRadius: R.md, borderWidth: 1, borderColor: "rgba(0,0,0,0.2)", backgroundColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" }}
          >
            <DoorText size={16} font={FONT.semibold} color={DOOR_BG}>
              No entra
            </DoorText>
          </Tap>
          {age ? (
            <Tap
              onPress={() => onAdmit(guest)}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Tiene 18, entra"
              style={{ flex: 1, minHeight: 50, borderRadius: R.md, backgroundColor: DOOR_BG, alignItems: "center", justifyContent: "center" }}
            >
              <DoorText size={16} font={FONT.semibold}>
                Tiene 18, entra
              </DoorText>
            </Tap>
          ) : onPayLate ? (
            (["cash", "card"] as const).map((method) => (
              <Tap
                key={method}
                onPress={() => onPayLate(guest, method)}
                haptic
                accessibilityRole="button"
                accessibilityLabel={method === "cash" ? "Cobrar en efectivo y entra" : "Cobrar con tarjeta y entra"}
                style={{ flex: 1, minHeight: 50, borderRadius: R.md, backgroundColor: DOOR_BG, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
              >
                {method === "cash" ? <Banknote size={17} color="#FFFFFF" strokeWidth={2} /> : <CreditCard size={17} color="#FFFFFF" strokeWidth={2} />}
                <DoorText size={15} font={FONT.semibold}>
                  {method === "cash" ? "Efectivo" : "Tarjeta"}
                </DoorText>
              </Tap>
            ))
          ) : null}
        </View>
      </ResultShell>
    );
  }
  const title = result.kind === "used" ? "Ya usada" : result.kind === "other" ? "Es de otro evento" : "QR no válido";
  const detail =
    result.kind === "used"
      ? `${result.guest.name} entró a las ${time(result.guest.checkedInAt as string)}. No dejes pasar a otra persona con esta entrada.`
      : result.kind === "other"
        ? `${result.guest.name} tiene entrada para ${result.event.name}, ${shortDay(result.event.doorsOpen)}.`
        : "Este código no es una entrada de Franky. Pide que abra la entrada en la app.";
  return (
    <ResultShell bg={TONE_HEX.rose} fg="#FFFFFF" icon={XCircle} label="No entra">
      <ResultTitle color="#FFFFFF">{title}</ResultTitle>
      <DoorText size={16}>{detail}</DoorText>
    </ResultShell>
  );
}

function ResultShell({ bg, fg, icon: Icon, label, children }: { bg: string; fg: string; icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <FadeIn distance={8} duration={260}>
      <View accessibilityRole="alert" style={{ borderRadius: 24, backgroundColor: bg, padding: S.lg, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          <Icon size={20} color={fg} strokeWidth={2.2} />
          <DoorText size={13} font={FONT.heading} color={fg} style={{ letterSpacing: 1.2, textTransform: "uppercase" }}>
            {label}
          </DoorText>
        </View>
        {children}
      </View>
    </FadeIn>
  );
}

function ResultTitle({ children, color }: { children: string; color: string }) {
  return (
    <DoorText size={30} font={FONT.display} color={color} style={{ lineHeight: 34, letterSpacing: -0.6, marginTop: S.xs }}>
      {children}
    </DoorText>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas del modo oscuro de la puerta                                 */
/* ------------------------------------------------------------------ */

function DoorText({
  children,
  size = 15,
  font,
  color = "#FFFFFF",
  numberOfLines,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  font?: string;
  color?: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[{ fontSize: size, color, fontFamily: font }, style]} numberOfLines={numberOfLines} maxFontSizeMultiplier={1.3}>
      {children}
    </Text>
  );
}

function DoorCard({ children }: { children: React.ReactNode }) {
  return <View style={{ borderRadius: 24, borderWidth: 1, borderColor: FAINT, padding: S.lg, gap: S.sm }}>{children}</View>;
}

function DoorFigure({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, borderRadius: R.lg, backgroundColor: "rgba(255,255,255,0.05)", padding: S.md, gap: 2 }}>
      <DoorText size={22} font={FONT.heading} numberOfLines={1}>
        {value}
      </DoorText>
      <DoorText size={12} color={DIM}>
        {label}
      </DoorText>
    </View>
  );
}

/** Botón claro sobre fondo oscuro (la variante "glass" de la web). */
function DoorButton({
  label,
  onPress,
  icon: Icon,
  accessibilityLabel,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  accessibilityLabel?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      onPress={onPress}
      haptic
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          minHeight: compact ? 48 : 56,
          paddingHorizontal: S.lg,
          borderRadius: R.lg,
          borderWidth: 1,
          borderColor: LINE,
          backgroundColor: FAINT,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: S.sm,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={20} color="#FFFFFF" strokeWidth={2} /> : null}
      <DoorText size={compact ? 14 : 16} font={FONT.semibold} numberOfLines={1}>
        {label}
      </DoorText>
    </Tap>
  );
}

function DoorIconButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: LINE, backgroundColor: FAINT, alignItems: "center", justifyContent: "center" }}
    >
      <Icon size={20} color="#FFFFFF" strokeWidth={2} />
    </Tap>
  );
}
