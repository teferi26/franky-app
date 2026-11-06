import React from "react";
import { Text, View } from "react-native";
import { AlertTriangle, BadgeCheck, CalendarClock, Check, Clock3, Copy, History, Home, MapPin, MessageSquareReply, ShieldCheck, X } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, FONT, R, S } from "@/theme";
import type { ProData } from "../../../../../shared/pro/types";
import { dayLabel, money, relative } from "../../../../../shared/pro/format";
import {
  PRIVACY_MIN_GROUP,
  caseDaysLeft,
  caseState,
  openCase,
  ownerHistory,
  sealExpiryFor,
  sealState,
  uniExtrasOf,
  zoneObservatory,
  type CaseState,
  type SealState,
} from "../../../../../shared/pro/university";
import { COPY_REASON_LABEL, copyMatches, looksCopied } from "../../../../../shared/pro/university-listings";
import type { UniHousing } from "../../../../../shared/pro/university-types";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Detail, Empty, Field, Input, Kpi, KpiRow, Meter, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Tip } from "../../kit";
import { Card, CardList, EmptyBox, HiddenGroup, Notice, useUniAction } from "./ui";

type Tab = "pending" | "verified" | "complaints" | "renewal" | "rejected";

/** Motivo que se propone cuando el anuncio se parece al de otro propietario. */
const COPY_REASON = "Anuncio copiado de otro propietario";

const REASONS = [
  COPY_REASON,
  "No acredita la identidad del propietario",
  "Las fotos no coinciden con el piso",
  "Sin cédula de habitabilidad",
  "Cláusulas abusivas en el contrato",
  "Pide pagos en efectivo o fuera de contrato",
];

const STEPS = ["Identidad del propietario", "Referencia catastral y cédula", "Fotos que coinciden con el piso", "Contrato tipo sin cláusulas abusivas", "Precio y gastos claros"];

const CASE_PILL: Record<CaseState, { label: (days: number) => string; tone: "warning" | "danger" | "info" | "success" }> = {
  open: { label: (d) => (d <= 1 ? "Responde hoy" : `Plazo: ${d} días`), tone: "warning" },
  overdue: { label: () => "Plazo vencido", tone: "danger" },
  answered: { label: () => "Ha respondido", tone: "info" },
  resolved: { label: () => "Caso cerrado", tone: "success" },
};

const SEAL_PILL: Partial<Record<SealState, { label: string; tone: "warning" | "danger" }>> = {
  renewal: { label: "Sello por renovar", tone: "warning" },
  expired: { label: "Sello caducado", tone: "danger" },
};

function bumpVerified(d: ProData, delta: number): ProData["uniMetrics"] {
  return d.uniMetrics.map((m) => (m.key === "housing" ? { ...m, value: Math.max(0, m.value + delta) } : m));
}

/** Tiene algo abierto con inquilinos: quejas sin caso cerrado. */
function hasOpenComplaint(h: UniHousing) {
  return h.status === "verified" && h.complaints > 0 && h.case?.status !== "resolved";
}

export default function UniversityAlojamiento() {
  const { data, now } = usePro();
  const [tab, setTab] = React.useState<Tab>("pending");
  const [open, setOpen] = React.useState<string | null>(null);

  const all = data.uniHousing as UniHousing[];
  const pending = all.filter((h) => h.status === "pending").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const verified = all.filter((h) => h.status === "verified");
  // Primero los que tienen el plazo vencido, después los que aún no tienen caso.
  const caseRank = (h: UniHousing) => (h.case ? { overdue: 0, open: 2, answered: 3, resolved: 4 }[caseState(h.case, now)] : 1);
  const complaints = verified.filter(hasOpenComplaint).sort((a, b) => caseRank(a) - caseRank(b));
  const renewal = verified.filter((h) => ["renewal", "expired"].includes(sealState(h, now)));
  const rejected = all.filter((h) => h.status === "rejected");
  const overdue = verified.filter((h) => h.case && caseState(h.case, now) === "overdue");
  const copies = pending.filter((h) => looksCopied(all, h));
  const totalVerified = data.uniMetrics.find((m) => m.key === "housing")?.value ?? verified.length;
  const list = { pending, verified, complaints, renewal, rejected }[tab];

  return (
    <ProPage>
      <PageHeader
        eyebrow="Alojamiento"
        title="Alojamiento verificado"
        description={`A quien llega al campus solo le aparecen pisos verificados. Tienes ${pending.length} en cola${copies.length ? ` (${copies.length === 1 ? "1 parece copiado" : `${copies.length} parecen copiados`})` : ""}${complaints.length ? ` y ${complaints.length} con quejas abiertas` : ""}${overdue.length ? `, ${overdue.length} con el plazo vencido` : ""}.`}
        actions={pending.length ? <PButton label="Revisar el siguiente" icon={ShieldCheck} onPress={() => setOpen(pending[0].id)} /> : null}
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "pending", label: "Por verificar", count: pending.length },
            { value: "verified", label: "Verificados", count: verified.length },
            { value: "complaints", label: "Con quejas", count: complaints.length },
            { value: "renewal", label: "Renovar", count: renewal.length },
            { value: "rejected", label: "Rechazados", count: rejected.length },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Clock3} label="En cola" value={pending.length} hint={pending[0]?.submittedAt ? `El más antiguo, ${relative(pending[0].submittedAt, now.getTime())}` : "Nada pendiente"} emphasis={pending.length > 0} onPress={() => setTab("pending")} />
        <Kpi icon={BadgeCheck} label="Verificados en el campus" value={totalVerified.toLocaleString("es-ES")} hint="Visibles para quien llega" />
        <Kpi icon={AlertTriangle} label="Quejas abiertas" value={complaints.length} hint={overdue.length ? `${overdue.length} con el plazo vencido` : "Ninguna fuera de plazo"} onPress={() => setTab("complaints")} />
        <Kpi icon={CalendarClock} label="Sellos por renovar" value={renewal.length} hint="Caducan el 31 de agosto" onPress={() => setTab("renewal")} />
      </KpiRow>

      {list.length ? (
        <CardList>
          {list.map((h) => (
            <HousingCard key={h.id} h={h} copied={h.status === "pending" && looksCopied(all, h)} onOpen={() => setOpen(h.id)} />
          ))}
        </CardList>
      ) : (
        <EmptyBox>
          <Empty
            icon={tab === "renewal" ? CalendarClock : Home}
            title={{ pending: "No hay pisos en cola", verified: "Aún no hay pisos verificados", complaints: "Ninguna queja abierta", renewal: "Ningún sello por renovar", rejected: "Nada rechazado" }[tab]}
            body={
              {
                pending: "Cuando un propietario o una inmobiliaria pida el sello, aparecerá aquí para que lo revises.",
                verified: "Cuando verifiques el primero, lo verán todos los que buscan piso cerca del campus.",
                complaints: "Si un inquilino se queja de un piso verificado, abres un caso con plazo para el propietario desde aquí.",
                renewal: "Los sellos valen un curso y caducan el 31 de agosto. En julio verás aquí los que hay que renovar.",
                rejected: "Los pisos rechazados quedan aquí con su motivo por si el propietario lo corrige.",
              }[tab]
            }
          />
        </EmptyBox>
      )}

      <PriceObservatory />

      <Panel title="Cómo se verifica" description="Lo que revisa tu equipo antes de dar el sello.">
        <View style={{ gap: S.md }}>
          {STEPS.map((c, i) => (
            <View key={c} style={{ flexDirection: "row", alignItems: "flex-start", gap: S.sm }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 11, color: C.text }} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
              </View>
              <PText v="body" color={C.muted} style={{ flex: 1 }}>{c}</PText>
            </View>
          ))}
        </View>
      </Panel>
      <Tip title="Por qué importa">
        La bolsa de siempre publica cualquier anuncio. Aquí, quien llega de fuera o de Erasmus solo ve pisos que tu universidad ha revisado, y si hay quejas te enteras antes que nadie.
      </Tip>

      <HousingSheet id={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </ProPage>
  );
}

function HousingCard({ h, copied, onOpen }: { h: UniHousing; copied: boolean; onOpen: () => void }) {
  const { now } = usePro();
  const ok = h.checks?.filter((c) => c.ok).length ?? 0;
  const total = h.checks?.length ?? 0;
  const seal = SEAL_PILL[sealState(h, now)];
  const cs = h.case ? caseState(h.case, now) : null;
  return (
    <Card onPress={onOpen} accessibilityLabel={h.title}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: S.md }}>
        <Home size={20} color={C.muted} strokeWidth={1.75} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.sm }}>
            <PText v="h2" style={{ flex: 1 }}>{h.title}</PText>
            <Text style={{ fontFamily: FONT.heading, fontSize: 16, color: C.text }} maxFontSizeMultiplier={1.3}>
              {money(h.priceCents, { round: true })}
              <Text style={{ fontFamily: FONT.medium, fontSize: 12, color: C.muted }}> /mes</Text>
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MapPin size={12} color={C.muted} />
            <PText v="tiny" style={{ flex: 1 }}>{`${h.zone}${h.minutesToCampus ? `, a ${h.minutesToCampus} min del campus` : ""} · ${h.owner}`}</PText>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
            {copied ? <Pill tone="danger" icon={Copy} label="Posible copia" /> : null}
            {h.status === "pending" ? <Pill tone={ok === total ? "success" : "warning"} label={`${ok} de ${total} comprobaciones`} /> : null}
            {h.status === "verified" && !seal ? <Pill tone="success" icon={BadgeCheck} label="Verificado" /> : null}
            {seal ? <Pill tone={seal.tone} label={seal.label} /> : null}
            {h.status === "rejected" ? <Pill tone="danger" label="Rechazado" /> : null}
            {h.complaints ? <Pill tone="danger" label={`${h.complaints} quejas`} /> : null}
            {h.case && cs ? <Pill tone={CASE_PILL[cs].tone} label={CASE_PILL[cs].label(caseDaysLeft(h.case, now))} /> : null}
            {h.submittedAt && h.status === "pending" ? <PText v="tiny">{`Enviado ${relative(h.submittedAt, now.getTime())}`}</PText> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function PriceObservatory() {
  const { data } = usePro();
  const zones = zoneObservatory(uniExtrasOf(data).market, "room");
  const top = Math.max(1, ...zones.filter((z) => !z.hidden).map((z) => z.medianCents));
  return (
    <Panel title="Precio de una habitación por zona" description={`Mediana de habitaciones verificadas. Zonas con menos de ${PRIVACY_MIN_GROUP} no se muestran.`}>
      {zones.length ? (
        <View style={{ gap: S.md }}>
          {zones.map((z) => (
            <View key={z.zone} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: S.md }}>
                <PText v="small" color={C.text} numberOfLines={1} style={{ flex: 1 }}>{z.hidden ? z.zone : `${z.zone} · ${z.medianMinutes} min`}</PText>
                {z.hidden ? <HiddenGroup /> : <PText v="h3">{money(z.medianCents, { round: true })}</PText>}
              </View>
              {z.hidden ? null : <Meter value={z.medianCents} max={top} />}
            </View>
          ))}
        </View>
      ) : (
        <PText v="small">Cuando haya habitaciones verificadas en varias zonas verás aquí su precio mediano.</PText>
      )}
    </Panel>
  );
}

type Mode = null | "reject" | "case" | "reply";

function HousingSheet({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, now, pending: busy } = usePro();
  const run = useUniAction();
  const [mode, setMode] = React.useState<Mode>(null);
  const [reason, setReason] = React.useState(REASONS[1]);
  const [note, setNote] = React.useState("");
  const [days, setDays] = React.useState<"5" | "10" | "15">("5");
  const all = data.uniHousing as UniHousing[];
  const h = all.find((x) => x.id === id);
  const matches = h ? copyMatches(all, h) : [];
  const copied = matches.some((m) => !m.weak);

  React.useEffect(() => {
    setMode(null);
    // Si parece copiado, el motivo ya viene elegido; si no, el de identidad.
    setReason(copied ? COPY_REASON : REASONS[1]);
    setNote("");
    setDays("5");
  }, [id, copied]);

  if (!h) return null;

  const patch = async (p: Partial<UniHousing>, delta: number, title: string, detail: string, close = true) => {
    const ok = await run(
      "housing.review",
      (d) => ({ ...d, uniHousing: d.uniHousing.map((x) => (x.id === h.id ? { ...x, ...p } : x)), uniMetrics: delta ? bumpVerified(d, delta) : d.uniMetrics }),
      title,
      detail,
    );
    if (ok && close) onClose();
    if (ok && !close) setMode(null);
  };

  const today = now.toISOString();
  const seal = sealState(h, now);
  const cs = h.case ? caseState(h.case, now) : null;
  const history = ownerHistory(all, h);
  const allOk = h.checks?.every((c) => c.ok) ?? false;

  const verify = () =>
    void patch(
      { status: "verified", verified: true, verifiedAt: today, verifiedUntil: sealExpiryFor(today), renewalRequestedAt: undefined, reason: undefined },
      h.status === "verified" ? 0 : 1,
      h.status === "verified" ? "Sello renovado" : "Piso verificado",
      `El sello vale hasta el ${dayLabel(`${sealExpiryFor(today)}T12:00:00Z`, { weekday: false })}.`,
    );
  const reject = () =>
    void patch(
      { status: "rejected", verified: false, reason: note.trim() ? `${reason}. ${note.trim()}` : reason },
      h.status === "verified" ? -1 : 0,
      h.status === "verified" ? "Sello retirado" : "Piso rechazado",
      "El propietario recibe el motivo y puede corregirlo y volver a pedir la revisión.",
    );
  const startCase = () =>
    void patch(
      { case: openCase(note.trim() || h.complaintNote || "Tenemos quejas de inquilinos sobre este piso.", Number(days), now, localId("c")) },
      0,
      "Caso abierto",
      `${h.owner} tiene ${days} días para responder. Si no lo hace, te lo recordamos.`,
      false,
    );
  const saveReply = () => {
    if (!h.case) return;
    void patch({ case: { ...h.case, status: "answered", reply: note.trim(), repliedAt: today } }, 0, "Respuesta guardada", "Revísala y cierra el caso cuando esté resuelto.", false);
  };
  const closeCase = () => {
    if (!h.case) return;
    void patch({ case: { ...h.case, status: "resolved", closedAt: today }, complaints: 0, complaintNote: undefined }, 0, "Caso cerrado", "Las quejas quedan en el historial del propietario.");
  };
  const askRenewal = () => void patch({ renewalRequestedAt: today }, 0, "Renovación pedida", `${h.owner} recibe el aviso para confirmar que todo sigue igual.`, false);

  const back = <PButton label="Volver" variant="ghost" onPress={() => setMode(null)} />;
  const retire = <PButton label="Retirar sello" variant="outline" onPress={() => setMode("reject")} />;
  const footer = (() => {
    if (mode === "reject") {
      return (
        <>
          {back}
          <PButton label={h.status === "verified" ? "Retirar el sello" : "Rechazar con este motivo"} variant="danger" disabled={busy} onPress={reject} />
        </>
      );
    }
    if (mode === "case") {
      return (
        <>
          {back}
          <PButton label={`Abrir caso con ${days} días`} disabled={busy} onPress={startCase} />
        </>
      );
    }
    if (mode === "reply") {
      return (
        <>
          {back}
          <PButton label="Guardar respuesta" disabled={busy || note.trim().length < 5} onPress={saveReply} />
        </>
      );
    }
    if (h.status === "pending") {
      return (
        <>
          <PButton label="Rechazar" icon={X} variant="outline" onPress={() => setMode("reject")} />
          <PButton label="Verificar" icon={ShieldCheck} disabled={busy} onPress={verify} />
        </>
      );
    }
    if (h.status === "rejected") {
      return <PButton label="Volver a revisar" variant="outline" disabled={busy} onPress={() => void patch({ status: "pending", reason: undefined }, 0, "Vuelve a la cola", "Lo revisaréis de nuevo.")} />;
    }
    if (cs === "overdue") {
      return (
        <>
          <PButton label="Ha respondido" icon={MessageSquareReply} variant="outline" onPress={() => setMode("reply")} />
          <PButton label="Retirar sello" variant="danger" onPress={() => setMode("reject")} />
        </>
      );
    }
    if (cs === "open") {
      return (
        <>
          {retire}
          <PButton label="Ha respondido" icon={MessageSquareReply} onPress={() => setMode("reply")} />
        </>
      );
    }
    if (cs === "answered") {
      return (
        <>
          {retire}
          <PButton label="Cerrar caso" icon={Check} disabled={busy} onPress={closeCase} />
        </>
      );
    }
    if (hasOpenComplaint(h)) {
      return (
        <>
          {retire}
          <PButton label="Abrir caso con plazo" onPress={() => setMode("case")} />
        </>
      );
    }
    if (seal === "renewal" || seal === "expired") {
      return (
        <>
          {h.renewalRequestedAt ? null : <PButton label="Pedir renovación" variant="outline" disabled={busy} onPress={askRenewal} />}
          <PButton label="Renovar sello" icon={ShieldCheck} disabled={busy} onPress={verify} />
        </>
      );
    }
    return retire;
  })();

  return (
    <Sheet open={Boolean(id)} onClose={onClose} title={h.title} description={`${h.zone} · ${h.owner}`} footer={footer}>
      {cs === "overdue" && h.case ? (
        <Notice title={`El plazo venció ${relative(h.case.dueAt, now.getTime())} sin respuesta`}>
          Lo normal es retirar el sello hasta que el propietario lo aclare. Si ya ha respondido por otra vía, apúntalo.
        </Notice>
      ) : null}

      {matches.length ? (
        <Notice
          tone={copied ? "danger" : "warning"}
          title={copied ? "Se parece al anuncio de otro propietario" : "Coincide en precio y zona con otro anuncio"}
        >
          <PText v="small" color={copied ? C.errorText : C.warning}>
            {copied
              ? "Es el truco de las estafas de septiembre: copian un piso real y cobran la fianza sin tenerlo. Pide al propietario que demuestre que es suyo antes de dar el sello."
              : "Puede ser casualidad. Mira si las fotos son las mismas antes de dar el sello."}
          </PText>
          {matches.slice(0, 3).map((m) => (
            <Tap
              key={m.listing.id}
              onPress={() => onOpen(m.listing.id)}
              accessibilityRole="button"
              accessibilityLabel={`Ver ${m.listing.title}`}
              style={{ marginTop: S.sm, borderRadius: R.md, backgroundColor: C.surface, padding: S.md, gap: 4 }}
            >
              <PText v="h3" numberOfLines={1}>{m.listing.title}</PText>
              <PText v="tiny" numberOfLines={1}>
                {`${m.listing.owner} · ${money(m.listing.priceCents, { round: true })} · ${m.listing.status === "verified" ? "Verificado" : m.listing.status === "rejected" ? "Rechazado" : "En cola"}${m.similarity ? ` · ${m.similarity} %` : ""}`}
              </PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {m.reasons.map((r) => (
                  <Pill key={r} tone={r === "price_zone" ? "warning" : "danger"} label={COPY_REASON_LABEL[r]} />
                ))}
              </View>
            </Tap>
          ))}
        </Notice>
      ) : null}

      {h.description ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 2 }}>
          <PText v="tiny">Anuncio</PText>
          <PText v="small" color={C.text}>{h.description}</PText>
        </View>
      ) : null}

      <View>
        <Detail label="Precio" value={`${money(h.priceCents, { round: true })} al mes`} />
        {h.rooms ? <Detail label="Habitaciones" value={h.rooms} /> : null}
        {h.minutesToCampus ? <Detail label="Al campus" value={`${h.minutesToCampus} min`} /> : null}
        <Detail label="Propietario" value={h.owner} last={!h.verifiedUntil && !h.renewalRequestedAt} />
        {h.verifiedUntil ? (
          <Detail label={seal === "expired" ? "Sello caducado el" : "Sello válido hasta"} value={dayLabel(`${h.verifiedUntil}T12:00:00Z`, { weekday: false })} last={!h.renewalRequestedAt} />
        ) : null}
        {h.renewalRequestedAt ? <Detail label="Renovación pedida" value={relative(h.renewalRequestedAt, now.getTime())} last /> : null}
      </View>

      {h.case ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
            <PText v="h3">Caso de quejas</PText>
            {cs ? <Pill tone={CASE_PILL[cs].tone} label={CASE_PILL[cs].label(caseDaysLeft(h.case, now))} /> : null}
          </View>
          <PText v="tiny">{`Abierto ${relative(h.case.openedAt, now.getTime())}, plazo hasta el ${dayLabel(h.case.dueAt, { weekday: false })}`}</PText>
          <PText v="small" color={C.text}>{h.case.message}</PText>
          {h.case.reply ? (
            <>
              <PText v="tiny">{`Respuesta de ${h.owner}, ${relative(h.case.repliedAt ?? h.case.openedAt, now.getTime())}`}</PText>
              <PText v="small" color={C.text}>{h.case.reply}</PText>
            </>
          ) : null}
          {h.case.closedAt ? <PText v="tiny">{`Cerrado ${relative(h.case.closedAt, now.getTime())}`}</PText> : null}
        </View>
      ) : null}

      {h.checks?.length && h.status !== "verified" ? (
        <View style={{ gap: S.sm }}>
          <PText v="h3">Comprobaciones</PText>
          {h.checks.map((c) => (
            <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.ok ? C.success : `${C.error}1F` }}>
                {c.ok ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : <X size={12} color={C.errorText} strokeWidth={3} />}
              </View>
              <Text style={{ flex: 1, fontSize: 14, color: C.text, fontFamily: c.ok ? undefined : FONT.semibold }} maxFontSizeMultiplier={1.4}>{c.label}</Text>
            </View>
          ))}
          {h.status === "pending" && !allOk ? (
            <PText v="small" color={C.warning}>Hay comprobaciones sin superar. Lo normal es rechazarlo con el motivo para que el propietario lo corrija.</PText>
          ) : null}
        </View>
      ) : null}

      {h.complaintNote && !h.case ? <Notice title={`${h.complaints} quejas de inquilinos`}>{h.complaintNote}</Notice> : null}

      {h.reason ? (
        <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 2 }}>
          <PText v="h3">Motivo del rechazo</PText>
          <PText v="small">{h.reason}</PText>
        </View>
      ) : null}

      <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.md, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <History size={15} color={C.muted} strokeWidth={1.9} />
          <PText v="h3">{`Historial de ${h.owner}`}</PText>
        </View>
        <PText v="small">
          {history.others.length
            ? `${history.others.length} pisos más: ${history.verified} verificados, ${history.rejected} rechazados, ${history.complaints} quejas${history.cases ? ` y ${history.cases} casos` : ""}.`
            : "Es su primer piso en tu campus."}
        </PText>
      </View>

      {mode === "reject" ? (
        <View style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
          <Field label="Motivo">
            <ChoiceGrid value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
          </Field>
          <Field label="Nota para el propietario (opcional)">
            <Input value={note} onChangeText={setNote} multiline placeholder="Qué tiene que cambiar para conseguir el sello." label="Nota para el propietario" />
          </Field>
        </View>
      ) : null}
      {mode === "case" ? (
        <View style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md }}>
          <Field label="Mensaje para el propietario">
            <Input value={note} onChangeText={setNote} multiline placeholder={h.complaintNote ?? "Qué nos cuentan los inquilinos y qué necesitamos que aclare."} label="Mensaje para el propietario" />
          </Field>
          <Field label="Plazo para responder">
            <ChoiceGrid<"5" | "10" | "15"> value={days} onChange={setDays} options={[{ value: "5", label: "5 días" }, { value: "10", label: "10 días" }, { value: "15", label: "15 días" }]} />
          </Field>
        </View>
      ) : null}
      {mode === "reply" ? (
        <Field label="Qué ha respondido">
          <Input value={note} onChangeText={setNote} multiline placeholder="Resumen de su respuesta y lo que se ha comprometido a hacer." label="Qué ha respondido" />
        </Field>
      ) : null}
    </Sheet>
  );
}
