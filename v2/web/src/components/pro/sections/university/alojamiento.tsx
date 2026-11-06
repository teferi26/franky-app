"use client";

import * as React from "react";
import { AlertTriangle, BadgeCheck, CalendarClock, Check, Clock3, Copy, History, Home, MapPin, MessageSquareReply, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localId, usePro } from "@/lib/pro/store";
import type { ProData } from "@/lib/pro/types";
import { dayLabel, money, relative } from "@/lib/pro/format";
import {
  caseDaysLeft,
  caseState,
  openCase,
  ownerHistory,
  sealExpiryFor,
  sealState,
  uniExtrasOf,
  type CaseState,
  type SealState,
} from "@/lib/pro/university";
import { COPY_REASON_LABEL, copyMatches, looksCopied } from "@/lib/pro/university-listings";
import type { UniHousing } from "@/lib/pro/university-types";
import { cn } from "@/lib/utils";
import { ChoiceChips, Detail, Drawer, Empty, FormField, Kpi, KpiRow, PageHeader, Panel, Pill, Segmented, Tip, textareaClass } from "../../kit";
import { DistancePriceMap, PriceObservatory } from "./housing-parts";
import { useUniAction } from "./ui";

type Tab = "pending" | "verified" | "complaints" | "renewal" | "rejected";
type View = "list" | "map";

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
  const [view, setView] = React.useState<View>("list");
  const [open, setOpen] = React.useState<string | null>(null);

  const extras = uniExtrasOf(data);
  const all = data.uniHousing as UniHousing[];
  const pending = all.filter((h) => h.status === "pending").sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const verified = all.filter((h) => h.status === "verified");
  // Primero los que tienen el plazo vencido, después los que aún no tienen caso.
  const caseRank = (h: UniHousing) => (h.case ? { overdue: 0, open: 2, answered: 3, resolved: 4 }[caseState(h.case, now)] : 1);
  const complaints = verified.filter(hasOpenComplaint).sort((a, b) => caseRank(a) - caseRank(b));
  const renewal = verified.filter((h) => ["renewal", "expired"].includes(sealState(h, now)));
  const rejected = all.filter((h) => h.status === "rejected");
  const overdue = verified.filter((h) => h.case && caseState(h.case, now) === "overdue");
  const totalVerified = data.uniMetrics.find((m) => m.key === "housing")?.value ?? verified.length;
  const list = { pending, verified, complaints, renewal, rejected }[tab];
  const copies = pending.filter((h) => looksCopied(all, h));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Alojamiento"
        title="Alojamiento verificado"
        description={`A quien llega al campus solo le aparecen pisos verificados. Tienes ${pending.length} en cola${copies.length ? ` (${copies.length === 1 ? "1 parece copiado" : `${copies.length} parecen copiados`})` : ""}${complaints.length ? ` y ${complaints.length} con quejas abiertas` : ""}${overdue.length ? `, ${overdue.length} con el plazo vencido` : ""}.`}
        actions={
          pending.length ? (
            <Button variant="dark" onClick={() => setOpen(pending[0].id)}>
              <ShieldCheck className="h-4 w-4" /> Revisar el siguiente
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Segmented<Tab>
            label="Estado de los pisos"
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
          {tab === "verified" ? (
            <Segmented<View>
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "Lista" },
                { value: "map", label: "Distancia y precio" },
              ]}
            />
          ) : null}
        </div>
      </PageHeader>

      <KpiRow>
        <Kpi icon={Clock3} label="En cola" value={pending.length} hint={pending[0]?.submittedAt ? `El más antiguo, ${relative(pending[0].submittedAt, now.getTime())}` : "Nada pendiente"} emphasis={pending.length > 0} onClick={() => setTab("pending")} />
        <Kpi icon={BadgeCheck} label="Verificados en el campus" value={totalVerified.toLocaleString("es-ES")} hint="Visibles para quien llega" />
        <Kpi icon={AlertTriangle} label="Quejas abiertas" value={complaints.length} hint={overdue.length ? `${overdue.length} con el plazo vencido` : "Ninguna fuera de plazo"} onClick={() => setTab("complaints")} />
        <Kpi icon={CalendarClock} label="Sellos por renovar" value={renewal.length} hint="Caducan el 31 de agosto" onClick={() => setTab("renewal")} />
      </KpiRow>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {tab === "verified" && view === "map" ? (
            <DistancePriceMap market={extras.market} listings={verified} onPick={setOpen} />
          ) : list.length ? (
            <ul className="flex flex-col gap-3">
              {list.map((h, i) => (
                <HousingCard key={h.id} h={h} index={i} onOpen={() => setOpen(h.id)} />
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-bg-primary shadow-card">
              <Empty
                icon={tab === "renewal" ? CalendarClock : Home}
                title={
                  {
                    pending: "No hay pisos en cola",
                    verified: "Aún no hay pisos verificados",
                    complaints: "Ninguna queja abierta",
                    renewal: "Ningún sello por renovar",
                    rejected: "Nada rechazado",
                  }[tab]
                }
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
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <PriceObservatory market={extras.market} />
          <Panel title="Cómo se verifica" description="Lo que revisa tu equipo antes de dar el sello.">
            <ol className="flex flex-col gap-3 text-sm">
              {["Identidad del propietario", "Referencia catastral y cédula", "Fotos que coinciden con el piso", "Contrato tipo sin cláusulas abusivas", "Precio y gastos claros"].map((c, i) => (
                <li key={c} className="flex items-start gap-2.5">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[0.68rem] font-bold tabular">{i + 1}</span>
                  <span className="text-text-secondary">{c}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <Tip title="Por qué importa">
            La bolsa de siempre publica cualquier anuncio. Aquí, quien llega de fuera o de Erasmus solo ve pisos que tu universidad ha revisado, y si hay quejas te enteras antes que nadie.
          </Tip>
        </div>
      </div>

      <HousingDrawer id={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </div>
  );
}

function HousingCard({ h, index, onOpen }: { h: UniHousing; index: number; onOpen: () => void }) {
  const { data, now } = usePro();
  const copied = h.status === "pending" && looksCopied(data.uniHousing as UniHousing[], h);
  const ok = h.checks?.filter((c) => c.ok).length ?? 0;
  const total = h.checks?.length ?? 0;
  const seal = SEAL_PILL[sealState(h, now)];
  const cs = h.case ? caseState(h.case, now) : null;
  return (
    <li className="animate-list-in" style={{ "--i": index } as React.CSSProperties}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3.5 rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,box-shadow] hover:border-text-primary/15 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet sm:p-5"
      >
        <Home className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 font-heading text-base font-bold leading-snug">{h.title}</h3>
            <span className="shrink-0 font-heading text-base font-bold tabular">
              {money(h.priceCents, { round: true })}
              <span className="text-xs font-medium text-text-muted"> /mes</span>
            </span>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-text-muted">
            <MapPin className="h-3 w-3" /> {h.zone}
            {h.minutesToCampus ? `, a ${h.minutesToCampus} min del campus` : ""} · {h.owner}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {copied ? (
              <Pill tone="danger">
                <Copy className="h-3 w-3" /> Posible copia
              </Pill>
            ) : null}
            {h.status === "pending" ? (
              <Pill tone={ok === total ? "success" : "warning"}>
                {ok} de {total} comprobaciones
              </Pill>
            ) : null}
            {h.status === "verified" && !seal ? (
              <Pill tone="success">
                <BadgeCheck className="h-3 w-3" /> Verificado
              </Pill>
            ) : null}
            {seal ? <Pill tone={seal.tone}>{seal.label}</Pill> : null}
            {h.status === "rejected" ? <Pill tone="danger">Rechazado</Pill> : null}
            {h.complaints ? <Pill tone="danger">{h.complaints} quejas</Pill> : null}
            {h.case && cs ? <Pill tone={CASE_PILL[cs].tone}>{CASE_PILL[cs].label(caseDaysLeft(h.case, now))}</Pill> : null}
            {h.submittedAt && h.status === "pending" ? <span className="text-xs text-text-muted">Enviado {relative(h.submittedAt, now.getTime())}</span> : null}
          </div>
        </div>
      </button>
    </li>
  );
}

type Mode = null | "reject" | "case" | "reply";

function HousingDrawer({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const { data, now } = usePro();
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

  if (!h) {
    return (
      <Drawer open={false} onOpenChange={(o) => !o && onClose()} title="Piso">
        <span />
      </Drawer>
    );
  }

  const patch = async (p: Partial<UniHousing>, delta: number, title: string, detail: string, close = true) => {
    const ok = await run(
      "housing.review",
      (d) => ({
        ...d,
        uniHousing: d.uniHousing.map((x) => (x.id === h.id ? { ...x, ...p } : x)),
        uniMetrics: delta ? bumpVerified(d, delta) : d.uniMetrics,
      }),
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
    patch(
      { status: "verified", verified: true, verifiedAt: today, verifiedUntil: sealExpiryFor(today), renewalRequestedAt: undefined, reason: undefined },
      h.status === "verified" ? 0 : 1,
      h.status === "verified" ? "Sello renovado" : "Piso verificado",
      `El sello vale hasta el ${dayLabel(`${sealExpiryFor(today)}T12:00:00Z`, { weekday: false })}.`,
    );
  const reject = () =>
    patch(
      { status: "rejected", verified: false, reason: note.trim() ? `${reason}. ${note.trim()}` : reason },
      h.status === "verified" ? -1 : 0,
      h.status === "verified" ? "Sello retirado" : "Piso rechazado",
      "El propietario recibe el motivo y puede corregirlo y volver a pedir la revisión.",
    );
  const startCase = () =>
    patch(
      { case: openCase(note.trim() || h.complaintNote || "Tenemos quejas de inquilinos sobre este piso.", Number(days), now, localId("c")) },
      0,
      "Caso abierto",
      `${h.owner} tiene ${days} días para responder. Si no lo hace, te lo recordamos.`,
      false,
    );
  const saveReply = () =>
    h.case &&
    patch({ case: { ...h.case, status: "answered", reply: note.trim(), repliedAt: today } }, 0, "Respuesta guardada", "Revísala y cierra el caso cuando esté resuelto.", false);
  const closeCase = () =>
    h.case &&
    patch({ case: { ...h.case, status: "resolved", closedAt: today }, complaints: 0, complaintNote: undefined }, 0, "Caso cerrado", "Las quejas quedan en el historial del propietario.");
  const askRenewal = () => patch({ renewalRequestedAt: today }, 0, "Renovación pedida", `${h.owner} recibe el aviso para confirmar que todo sigue igual.`, false);

  const footer = (() => {
    if (mode === "reject") {
      return (
        <>
          <Button variant="ghost" onClick={() => setMode(null)}>
            Volver
          </Button>
          <Button variant="destructive" onClick={reject}>
            {h.status === "verified" ? "Retirar el sello" : "Rechazar con este motivo"}
          </Button>
        </>
      );
    }
    if (mode === "case") {
      return (
        <>
          <Button variant="ghost" onClick={() => setMode(null)}>
            Volver
          </Button>
          <Button variant="dark" onClick={startCase}>
            Abrir caso con {days} días
          </Button>
        </>
      );
    }
    if (mode === "reply") {
      return (
        <>
          <Button variant="ghost" onClick={() => setMode(null)}>
            Volver
          </Button>
          <Button variant="dark" onClick={saveReply} disabled={note.trim().length < 5}>
            Guardar respuesta
          </Button>
        </>
      );
    }
    if (h.status === "pending") {
      return (
        <>
          <Button variant="outline" onClick={() => setMode("reject")}>
            <X className="h-4 w-4" /> Rechazar
          </Button>
          <Button variant="dark" onClick={verify}>
            <ShieldCheck className="h-4 w-4" /> Verificar
          </Button>
        </>
      );
    }
    if (h.status === "rejected") {
      return (
        <Button variant="outline" onClick={() => patch({ status: "pending", reason: undefined }, 0, "Vuelve a la cola", "Lo revisaréis de nuevo.")}>
          Volver a revisar
        </Button>
      );
    }
    // Verificado: lo que toca depende del caso y del sello.
    const retire = (
      <Button variant="outline" onClick={() => setMode("reject")}>
        Retirar sello
      </Button>
    );
    if (cs === "overdue") {
      return (
        <>
          <Button variant="outline" onClick={() => setMode("reply")}>
            <MessageSquareReply className="h-4 w-4" /> Ha respondido
          </Button>
          <Button variant="destructive" onClick={() => setMode("reject")}>
            Retirar sello
          </Button>
        </>
      );
    }
    if (cs === "open") {
      return (
        <>
          {retire}
          <Button variant="dark" onClick={() => setMode("reply")}>
            <MessageSquareReply className="h-4 w-4" /> Ha respondido
          </Button>
        </>
      );
    }
    if (cs === "answered") {
      return (
        <>
          {retire}
          <Button variant="dark" onClick={closeCase}>
            <Check className="h-4 w-4" /> Cerrar caso
          </Button>
        </>
      );
    }
    if (hasOpenComplaint(h)) {
      return (
        <>
          {retire}
          <Button variant="dark" onClick={() => setMode("case")}>
            Abrir caso con plazo
          </Button>
        </>
      );
    }
    if (seal === "renewal" || seal === "expired") {
      return (
        <>
          {h.renewalRequestedAt ? null : (
            <Button variant="outline" onClick={askRenewal}>
              Pedir renovación
            </Button>
          )}
          <Button variant="dark" onClick={verify}>
            <ShieldCheck className="h-4 w-4" /> Renovar sello
          </Button>
        </>
      );
    }
    return retire;
  })();

  return (
    <Drawer open={Boolean(id)} onOpenChange={(o) => !o && onClose()} wide title={h.title} description={`${h.zone} · ${h.owner}`} footer={footer}>
      <div className="flex flex-col gap-5">
        {cs === "overdue" && h.case ? (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold">El plazo venció {relative(h.case.dueAt, now.getTime())} sin respuesta</p>
            <p className="mt-0.5">Lo normal es retirar el sello hasta que el propietario lo aclare. Si ya ha respondido por otra vía, apúntalo.</p>
          </div>
        ) : null}

        {matches.length ? (
          <section
            className={cn(
              "rounded-2xl border px-4 py-3 text-sm",
              copied
                ? "border-rose-500/25 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
                : "border-amber-500/25 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
            )}
          >
            <p className="flex items-center gap-2 font-semibold">
              <Copy className="h-4 w-4 shrink-0" strokeWidth={1.9} />
              {copied ? "Se parece al anuncio de otro propietario" : "Coincide en precio y zona con otro anuncio"}
            </p>
            <p className="mt-0.5 opacity-90">
              {copied
                ? "Es el truco de las estafas de septiembre: copian un piso real y cobran la fianza sin tenerlo. Pide al propietario que demuestre que es suyo antes de dar el sello."
                : "Puede ser casualidad. Mira si las fotos son las mismas antes de dar el sello."}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {matches.slice(0, 3).map((m) => (
                <li key={m.listing.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(m.listing.id)}
                    className="flex min-h-11 w-full items-start gap-3 rounded-xl bg-bg-primary/80 px-3 py-2 text-left text-text-primary transition-colors hover:bg-bg-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{m.listing.title}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {m.listing.owner} · {money(m.listing.priceCents, { round: true })} · {m.listing.status === "verified" ? "Verificado" : m.listing.status === "rejected" ? "Rechazado" : "En cola"}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {m.reasons.map((r) => (
                          <Pill key={r} tone={r === "price_zone" ? "warning" : "danger"}>
                            {COPY_REASON_LABEL[r]}
                          </Pill>
                        ))}
                      </span>
                    </span>
                    {m.similarity ? <span className="shrink-0 text-xs font-semibold tabular">{m.similarity} %</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {h.description ? (
          <div className="rounded-2xl bg-bg-secondary/70 px-4 py-3 text-sm">
            <p className="text-xs font-semibold text-text-muted">Anuncio</p>
            <p className="mt-0.5 text-text-secondary">{h.description}</p>
          </div>
        ) : null}

        <div className="divide-y divide-border-light">
          <Detail label="Precio">{money(h.priceCents, { round: true })} al mes</Detail>
          {h.rooms ? <Detail label="Habitaciones">{h.rooms}</Detail> : null}
          {h.minutesToCampus ? <Detail label="Al campus">{h.minutesToCampus} min</Detail> : null}
          <Detail label="Propietario">{h.owner}</Detail>
          {h.verifiedUntil ? (
            <Detail label={seal === "expired" ? "Sello caducado el" : "Sello válido hasta"}>{dayLabel(`${h.verifiedUntil}T12:00:00Z`, { weekday: false })}</Detail>
          ) : null}
          {h.renewalRequestedAt ? <Detail label="Renovación pedida">{relative(h.renewalRequestedAt, now.getTime())}</Detail> : null}
        </div>

        {h.case ? (
          <section className="rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-heading text-sm font-bold">Caso de quejas</p>
              {cs ? <Pill tone={CASE_PILL[cs].tone}>{CASE_PILL[cs].label(caseDaysLeft(h.case, now))}</Pill> : null}
            </div>
            <ol className="mt-3 flex flex-col gap-3 border-l border-border pl-4 text-sm">
              <li>
                <p className="text-xs text-text-muted">Abierto {relative(h.case.openedAt, now.getTime())}, plazo hasta el {dayLabel(h.case.dueAt, { weekday: false })}</p>
                <p className="mt-0.5 text-text-secondary">{h.case.message}</p>
              </li>
              {h.case.reply ? (
                <li>
                  <p className="text-xs text-text-muted">Respuesta de {h.owner}, {relative(h.case.repliedAt ?? h.case.openedAt, now.getTime())}</p>
                  <p className="mt-0.5 text-text-secondary">{h.case.reply}</p>
                </li>
              ) : null}
              {h.case.closedAt ? <li className="text-xs text-text-muted">Cerrado {relative(h.case.closedAt, now.getTime())}</li> : null}
            </ol>
          </section>
        ) : null}

        {h.checks?.length && h.status !== "verified" ? (
          <section>
            <h3 className="font-heading text-sm font-bold">Comprobaciones</h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {h.checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      c.ok ? "bg-emerald-500 text-white" : "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
                    )}
                  >
                    {c.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className={cn(!c.ok && "font-semibold")}>{c.label}</span>
                </li>
              ))}
            </ul>
            {h.status === "pending" && !allOk ? (
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">Hay comprobaciones sin superar. Lo normal es rechazarlo con el motivo para que el propietario lo corrija.</p>
            ) : null}
          </section>
        ) : null}

        {h.complaintNote && !h.case ? (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            <p className="font-semibold">{h.complaints} quejas de inquilinos</p>
            <p className="mt-0.5">{h.complaintNote}</p>
          </div>
        ) : null}

        {h.reason ? (
          <div className="rounded-2xl bg-bg-secondary px-4 py-3 text-sm">
            <p className="font-semibold">Motivo del rechazo</p>
            <p className="mt-0.5 text-text-secondary">{h.reason}</p>
          </div>
        ) : null}

        <section className="rounded-2xl bg-bg-secondary/60 p-4">
          <p className="flex items-center gap-2 font-heading text-sm font-bold">
            <History className="h-4 w-4 text-text-muted" strokeWidth={1.9} /> Historial de {h.owner}
          </p>
          {history.others.length ? (
            <>
              <p className="mt-1 text-sm text-text-secondary">
                {history.others.length} pisos más: {history.verified} verificados, {history.rejected} rechazados, {history.complaints} quejas
                {history.cases ? ` y ${history.cases} casos` : ""}.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-text-muted">
                {history.others.slice(0, 4).map((o) => (
                  <li key={o.id} className="flex justify-between gap-3">
                    <span className="truncate">{o.title}</span>
                    <span className="shrink-0">{o.status === "verified" ? "Verificado" : o.status === "rejected" ? "Rechazado" : "En cola"}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-secondary">Es su primer piso en tu campus.</p>
          )}
        </section>

        {mode === "reject" ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-border p-4">
            <FormField label="Motivo">
              <ChoiceChips value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />
            </FormField>
            <FormField label="Nota para el propietario (opcional)" htmlFor="rej-note">
              <textarea id="rej-note" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Qué tiene que cambiar para conseguir el sello." />
            </FormField>
          </div>
        ) : null}
        {mode === "case" ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-border p-4">
            <FormField label="Mensaje para el propietario" htmlFor="case-msg">
              <textarea id="case-msg" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={h.complaintNote ?? "Qué nos cuentan los inquilinos y qué necesitamos que aclare."} />
            </FormField>
            <FormField label="Plazo para responder">
              <ChoiceChips
                value={days}
                onChange={setDays}
                options={[
                  { value: "5", label: "5 días" },
                  { value: "10", label: "10 días" },
                  { value: "15", label: "15 días" },
                ]}
              />
            </FormField>
          </div>
        ) : null}
        {mode === "reply" ? (
          <FormField label="Qué ha respondido" htmlFor="case-reply">
            <textarea id="case-reply" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resumen de su respuesta y lo que se ha comprometido a hacer." />
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}
