import React from "react";
import { Share, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Download, MessageCircle, Share2, Target } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProPromoter } from "../../../../../shared/pro/types";
import { addDays, localDate, money, shortDay, time } from "../../../../../shared/pro/format";
import { eventPhase, focusEvent, shortUni, upcomingEvents } from "../../../../../shared/pro/night";
import { nightTitle, promoterCapState, promoterCutoffAt, promoterMonthRows, promoterReceipt } from "../../../../../shared/pro/night-ops";
import {
  TARGET_CHOICES,
  TARGET_STATUS_LABEL,
  promoterNudge,
  promoterPanel,
  promoterTargets,
  type TargetStatus,
} from "../../../../../shared/pro/night-promoters";
import { usePro } from "../../store";
import { ChoiceGrid, Empty, Field, ListRow, Meter, PAvatar, PButton, PText, Panel, Pill, Sheet } from "../../kit";
import { openWhatsApp, shareCsv } from "./ops-ui";
import { BoxRow, Boxed, Eyebrow, Stat, StatGrid } from "./night-ui";

/**
 * Lo que la web tiene en RRPP y faltaba en la app: cupo, objetivo y hora de
 * corte por RRPP, objetivos de la noche, recibo por WhatsApp, CSV del mes y
 * el panel que ve cada RRPP. Versión nativa de rrpp.tsx y rrpp-panel.tsx.
 */

const STATUS_TONE: Record<TargetStatus, "neutral" | "success" | "warning" | "danger" | "violet"> = {
  none: "neutral",
  ahead: "violet",
  on_track: "success",
  behind: "warning",
  done: "success",
  missed: "danger",
};

/* ------------------------------------------------------------------ */
/* Objetivos de la próxima noche                                       */
/* ------------------------------------------------------------------ */

export function TargetsPanel({ onOpen }: { onOpen: (promoterId: string) => void }) {
  const { data, now } = usePro();
  const ev = focusEvent(data, now);
  if (!ev) return null;
  const rows = promoterTargets(data, ev, now);
  const behind = rows.filter((r) => r.state.status === "behind");
  const phase = eventPhase(ev, now);
  return (
    <Panel
      title={`Objetivos para ${ev.name}`}
      description={
        rows.length
          ? behind.length
            ? `${behind.length} ${behind.length === 1 ? "va flojo" : "van flojos"} para ${phase === "live" ? "esta noche" : shortDay(ev.doorsOpen)}.`
            : "Todos van a buen ritmo."
          : "Pon un objetivo por noche en la ficha de cada RRPP y verás aquí quién va flojo."
      }
      flush
    >
      {rows.length ? (
        rows.map(({ promoter: p, state }, i) => {
          const count = phase === "live" || phase === "past" ? state.scanned : state.signedUp;
          return (
            <ListRow key={p.id} onPress={() => onOpen(p.id)} accessibilityLabel={`${p.name}, ${count} de ${state.target}`} last={i === rows.length - 1}>
              <PAvatar name={p.name} size={32} toneKey={state.status === "behind" ? "amber" : "slate"} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm }}>
                  <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{p.name}</PText>
                  <PText v="small">{`${count} de ${state.target}`}</PText>
                </View>
                <Meter
                  value={count}
                  max={state.target ?? 1}
                  tone={state.status === "behind" || state.status === "missed" ? "warning" : state.status === "done" ? "success" : "violet"}
                />
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
                  <Pill label={TARGET_STATUS_LABEL[state.status]} tone={STATUS_TONE[state.status]} />
                  {state.status === "behind" ? (
                    <PButton
                      label="Animar"
                      icon={MessageCircle}
                      variant="ghost"
                      small
                      onPress={() => openWhatsApp(promoterNudge(p, ev, state, data.space.slug), p.phone)}
                      accessibilityLabel={`Escribir a ${p.name} por WhatsApp`}
                    />
                  ) : null}
                </View>
              </View>
            </ListRow>
          );
        })
      ) : (
        <Empty icon={Target} title="Sin objetivos todavía" body="Un objetivo por noche ayuda a ver a tiempo quién no va a llegar." />
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Cupo, objetivo y hora de corte                                      */
/* ------------------------------------------------------------------ */

const CAP_OPTIONS = ["none", "20", "40", "60", "100"];
const CUTOFF_OPTIONS = [
  { value: "event", label: "La del evento" },
  { value: "30", label: "00:30" },
  { value: "60", label: "01:00" },
  { value: "90", label: "01:30" },
  { value: "120", label: "02:00" },
];

/** Añade el valor guardado como opción si no está entre las de siempre (80, 50...). */
function withCurrent(options: { value: string; label: string }[], current: number | null) {
  if (current === null || options.some((o) => o.value === String(current))) return options;
  return [...options, { value: String(current), label: String(current) }];
}

export function PromoterCapBlock({ promoter }: { promoter: ProPromoter }) {
  const { data, now, update } = usePro();
  const next = upcomingEvents(data, now)[0];
  const state = next ? promoterCapState(data, promoter, next.id) : null;
  const cutoffAt = next ? promoterCutoffAt(promoter, next) : null;
  const max = promoter.cap?.maxPerNight ?? null;
  const target = promoter.cap?.targetPerNight ?? null;
  const cutoff = promoter.cap?.cutoffMinute;

  const save = async (patch: { maxPerNight?: number | null; cutoffMinute?: number | null; targetPerNight?: number | null }, message: string) => {
    const ok = await update("rrpp.cap", (d) => ({
      ...d,
      promoters: d.promoters.map((x) =>
        x.id === promoter.id ? { ...x, cap: { maxPerNight: x.cap?.maxPerNight ?? null, ...x.cap, ...patch } } : x,
      ),
    }));
    if (ok) toast(message, { kind: "success" });
  };

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md }}>
      <PText v="label">Cupo por noche</PText>
      {next && state ? (
        <View style={{ gap: S.sm }}>
          <PText v="small" color={C.text}>
            {`${next.name} · ${shortDay(next.doorsOpen)}: ${
              state.max === null
                ? `${state.signedUp} apuntados, sin límite.`
                : state.full
                  ? `cupo lleno, ${state.signedUp} de ${state.max}.`
                  : `${state.signedUp} de ${state.max} apuntados, le quedan ${state.left}.`
            }`}
          </PText>
          {state.max !== null ? <Meter value={state.signedUp} max={state.max} tone={state.full ? "warning" : "violet"} /> : null}
          {cutoffAt ? <PText v="tiny">{`Su lista entra gratis hasta las ${time(cutoffAt)}.`}</PText> : null}
        </View>
      ) : (
        <PText v="small">Cuando tengas una noche a la venta verás aquí cuántos lleva apuntados.</PText>
      )}
      <Field label="Máximo de apuntados por noche" hint="Así nadie infla la lista para cobrar más.">
        <ChoiceGrid
          value={max === null ? "none" : String(max)}
          onChange={(v) => void save({ maxPerNight: v === "none" ? null : Number(v) }, v === "none" ? "Sin cupo para este RRPP" : `Cupo de ${v} por noche`)}
          options={withCurrent(CAP_OPTIONS.map((o) => ({ value: o, label: o === "none" ? "Sin cupo" : o })), max)}
        />
      </Field>
      <Field label="Objetivo por noche" hint="Personas que esperas que traiga. Si va flojo, lo verás arriba con un mensaje para animarle.">
        <ChoiceGrid
          value={target === null ? "none" : String(target)}
          onChange={(v) =>
            void save({ targetPerNight: v === "none" ? null : Number(v) }, v === "none" ? "Sin objetivo para este RRPP" : `Objetivo de ${v} personas por noche`)
          }
          options={withCurrent(TARGET_CHOICES.map((o) => ({ value: o === null ? "none" : String(o), label: o === null ? "Sin objetivo" : String(o) })), target)}
        />
      </Field>
      <Field label="Su lista entra gratis hasta">
        <ChoiceGrid
          value={typeof cutoff === "number" ? String(cutoff) : "event"}
          onChange={(v) =>
            void save({ cutoffMinute: v === "event" ? null : Number(v) }, v === "event" ? "Usa la hora de corte del evento" : "Hora de corte propia guardada")
          }
          options={CUTOFF_OPTIONS}
        />
      </Field>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Recibo y CSV del mes                                                */
/* ------------------------------------------------------------------ */

/** Recibo de la liquidación por WhatsApp: al RRPP si tiene teléfono. */
export function sendReceipt(data: Parameters<typeof promoterReceipt>[0], p: ProPromoter, nights: Parameters<typeof promoterReceipt>[2]) {
  openWhatsApp(promoterReceipt(data, p, nights), p.phone);
}

/** CSV de este mes y del anterior para la gestoría, una fila por RRPP y noche. */
export function MonthCsvButtons() {
  const { data, now } = usePro();
  const thisMonth = localDate(now).slice(0, 7);
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);
  const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", timeZone: "UTC" });
  const exportMonth = (m: string) => {
    const rows = promoterMonthRows(data, m);
    if (rows.length <= 1) {
      toast(`Sin noches de RRPP en ${monthName(m)}`, { kind: "info", body: "Cuando entre alguien con su enlace aparecerá en el CSV." });
      return;
    }
    shareCsv(`RRPP de ${data.space.name}, ${monthName(m)}`, rows);
  };
  return (
    <View style={{ gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderTopColor: C.borderLight }}>
      <PText v="tiny">Para tu gestoría, una fila por RRPP y noche</PText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
        <PButton label={`CSV de ${monthName(thisMonth)}`} icon={Download} variant="outline" small onPress={() => exportMonth(thisMonth)} />
        <PButton label={monthName(lastMonth)} icon={Download} variant="ghost" small onPress={() => exportMonth(lastMonth)} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Panel del RRPP                                                      */
/* ------------------------------------------------------------------ */

/** Lo que ve un RRPP con su acceso: su enlace y su QR, su lista, lo ganado y lo que le falta. */
export function PromoterPanelSheet({ promoterId, onClose }: { promoterId: string | null; onClose: () => void }) {
  const { data, now } = usePro();
  const p = promoterId ? data.promoters.find((x) => x.id === promoterId) : undefined;
  if (!p) return null;
  const panel = promoterPanel(data, p, now);
  const ev = panel.event;
  const phase = ev ? eventPhase(ev, now) : null;
  const url = `https://${panel.link}`;
  const share = async () => {
    try {
      await Share.share({ message: `Entradas y lista para ${ev ? `${ev.name} (${shortDay(ev.doorsOpen)})` : data.space.name}: ${url}` });
    } catch {
      toast("Copia el enlace", { kind: "info", body: panel.link });
    }
  };

  return (
    <Sheet open onClose={onClose} title={`Así lo ve ${p.name.split(" ")[0]}`} description={`${shortUni(p.university) || "RRPP"} · solo su enlace, su lista y lo que gana`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
        {/* Negro sobre blanco para que lo lea cualquier móvil en la cola. */}
        <View style={{ borderRadius: R.md, backgroundColor: "#FFFFFF", padding: 6 }}>
          <QRCode value={url} size={96} color="#000000" backgroundColor="#FFFFFF" quietZone={2} />
        </View>
        <View style={{ flex: 1, gap: S.xs }}>
          <PText v="label">Tu enlace</PText>
          <PText v="small" color={C.text}>{panel.link}</PText>
          <PButton label="Compartir" icon={Share2} small onPress={() => void share()} style={{ alignSelf: "flex-start" }} />
        </View>
      </View>

      {ev && panel.cap ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.sm }}>
          <PText v="label">{phase === "live" ? "Esta noche" : `${nightTitle(ev.date)} · ${ev.name}`}</PText>
          <StatGrid>
            <Stat label="En tu lista" value={panel.cap.max !== null ? `${panel.cap.signedUp} de ${panel.cap.max}` : panel.cap.signedUp} />
            <Stat label="Han entrado" value={panel.target?.scanned ?? 0} />
          </StatGrid>
          {panel.cap.max !== null ? <Meter value={panel.cap.signedUp} max={panel.cap.max} tone={panel.cap.full ? "warning" : "violet"} /> : null}
          {panel.cap.full ? <PText v="small">Tu cupo de esta noche está lleno.</PText> : null}
          {panel.target?.target ? (
            <PText v="small">{`Tu objetivo es ${panel.target.target}. ${panel.target.missing ? `Te faltan ${panel.target.missing}.` : "Ya lo tienes."}`}</PText>
          ) : null}
          {panel.cutoffAt ? <PText v="small">{`Tu lista entra gratis hasta las ${time(panel.cutoffAt)}.`}</PText> : null}
          {panel.tierHint ? <PText v="small">{panel.tierHint}</PText> : null}
        </View>
      ) : (
        <PText v="small">Cuando haya una noche a la venta, verás aquí tu lista y cuánta gente ha entrado.</PText>
      )}

      <StatGrid>
        <Stat label="Ganado este mes" value={money(panel.monthCents)} hint={`${panel.monthScanned} personas en puerta`} />
        <Stat label="Te deben" value={money(panel.pendingCents)} hint={panel.lastPayout ? `Último pago ${shortDay(panel.lastPayout.at)}` : "Aún sin pagos"} />
      </StatGrid>

      <View>
        <Eyebrow>Tus últimas noches</Eyebrow>
        {panel.recent.length ? (
          <Boxed>
            {panel.recent.map((n, i) => (
              <BoxRow key={n.eventId} last={i === panel.recent.length - 1}>
                <View style={{ flex: 1, gap: 2 }}>
                  <PText v="h3" numberOfLines={1}>{n.name}</PText>
                  <PText v="tiny">{`${nightTitle(n.date)} · ${n.scanned} de ${n.sold + n.list} entraron`}</PText>
                </View>
                <PText v="h3">{money(n.commissionCents)}</PText>
              </BoxRow>
            ))}
          </Boxed>
        ) : (
          <PText v="small">Tus noches aparecerán aquí en cuanto entre alguien con tu enlace.</PText>
        )}
        <PText v="tiny" style={{ marginTop: S.sm }}>{`Cobras ${panel.rule.toLowerCase()}: solo cuenta quien entra por la puerta.`}</PText>
      </View>
    </Sheet>
  );
}
