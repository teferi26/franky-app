"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  FileText,
  HeartHandshake,
  HeartPulse,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Sparkles,
  UserMinus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProMember, ProMembershipPlan, ProPayment } from "@/lib/pro/types";
import type { ProChargeMethod, ProLeaveReason, ProPauseReason } from "@/lib/pro/classes-types";
import { addDays, atLocal, dayLabel, localDate, money, plural, relative } from "@/lib/pro/format";
import {
  MEMBER_STATUS,
  PERIOD_LABEL,
  addMonths,
  classCopy,
  memberPrice,
  monthlyEquivalent,
  overdueCents,
  planMembers,
  recurringCents,
  shortUni,
} from "@/lib/pro/classes";
import {
  BUNDLE_DAYS,
  CHARGE_METHOD_LABEL,
  LEAVE_REASONS,
  PAUSE_REASONS,
  careOf,
  extrasOf,
  firstName,
  leaveMember,
  leaveSummary,
  markChargePaid,
  memberCharges,
  memberRisk,
  monthlyTarget,
  noShowCount,
  patchCare,
  pauseMember,
  pendingRecoveries,
  recordCharge,
  resumeMember,
  riskMessage,
  suggestedReturn,
  winbackCandidates,
  winbackMessage,
} from "@/lib/pro/classes-care";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import {
  NO_SHOW_LIMIT_DAYS,
  NO_SHOW_WARN,
  bookingLimited,
  limitBooking,
  limitMessage,
  noShowMessage,
  recoveriesPending,
} from "@/lib/pro/classes-growth";
import { chargeEnrollment, enrollmentFee, hasPaidEnrollment } from "@/lib/pro/classes-study";
import { UNIVERSITIES } from "@/lib/pro/demo/common";
import { cn } from "@/lib/utils";
import {
  Avatar,
  ChoiceChips,
  Detail,
  Drawer,
  Empty,
  FormField,
  Kpi,
  KpiRow,
  Meter,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Tip,
  inputClass,
  textareaClass,
} from "../../kit";
import { FilterChip, capitalize, isFromFranky } from "./parts";
import { RealBundles } from "./real-bundles";
import { ChargesView, ReceiptDrawer } from "./cobros";
import { CulturePacks } from "./packs";
import { PlanDrawer } from "./plan-drawer";
import { NextCourseView, RecoveriesView, ResultsView } from "./academy";
import { MemberRecords } from "./records";
import { MemberGrades, MemberLevel } from "./study";

type StatusFilter = "all" | ProMember["status"];
type View = "members" | "charges" | "plans" | "leavers" | "recoveries" | "course" | "results";

const PAY_METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer"];

export default function SociosSection() {
  const { demo, vertical } = usePro();
  if (!demo) return <RealBundles />;
  return vertical.id === "culture" ? <CulturePacks /> : <DemoSociosSection />;
}

function DemoSociosSection() {
  const { data, now, vertical } = usePro();
  const params = useSearchParams();
  const copy = classCopy(vertical.id);
  const study = vertical.engine === "courts";
  // Cobros y bajas son del motor de clases; las pistas usan esta pantalla solo para pases.
  const care = vertical.engine === "classes";
  const label = vertical.nav.find((n) => n.id === "socios")?.label ?? copy.Members;
  const [tab, setTab] = React.useState<View>(() => {
    // Enlaces directos desde Hoy (?vista=cobros, recuperaciones, curso, aprobados).
    const vista = params?.get("vista");
    if (care && vista === "cobros") return "charges";
    if (vertical.id === "academy" && vista === "recuperaciones") return "recoveries";
    if (vertical.id === "academy" && vista === "curso") return "course";
    if (vertical.id === "academy" && vista === "aprobados") return "results";
    return "members";
  });
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [onlyStudents, setOnlyStudents] = React.useState(false);
  const [onlyRisk, setOnlyRisk] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState<string | null>(null);

  const today = localDate(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const active = data.members.filter((m) => m.status === "active" || m.status === "overdue");
  const overdue = data.members.filter((m) => m.status === "overdue");
  const leavers = data.members.filter((m) => m.status === "cancelled" && (m.changedAt ?? m.since) >= atLocal(monthStart, 0));
  const mrr = recurringCents(data);
  const students = active.filter((m) => m.student?.verified).length;
  const risky = new Set(data.members.filter((m) => memberRisk(data, m, now)).map((m) => m.id));
  const avoided = leaveSummary(data, now).avoided;

  const counts: Record<StatusFilter, number> = {
    all: data.members.filter((m) => m.status !== "cancelled").length,
    active: data.members.filter((m) => m.status === "active").length,
    overdue: overdue.length,
    trial: data.members.filter((m) => m.status === "trial").length,
    paused: data.members.filter((m) => m.status === "paused").length,
    cancelled: data.members.filter((m) => m.status === "cancelled").length,
  };

  const q = query.trim().toLowerCase();
  const list = data.members
    .filter((m) => (filter === "all" ? m.status !== "cancelled" : m.status === filter))
    .filter((m) => !onlyStudents || m.student?.verified)
    .filter((m) => !onlyRisk || risky.has(m.id))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.studies ?? "").toLowerCase().includes(q))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, "es"));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={label}
        title={study ? "Socios, pases y bonos" : vertical.id === "academy" ? "Alumnos y cuotas" : "Socios y cuotas"}
        description={
          data.members.length
            ? `${active.length} ${copy.members} activos (${students} estudiantes verificados), ${money(mrr, { round: true })} al mes${overdue.length ? ` y ${plural(overdue.length, "cuota", "cuotas")} por cobrar` : ""}${care && risky.size ? `. ${plural(risky.size, "persona viene", "personas vienen")} menos de lo normal` : ""}.`
            : `Da de alta a tus ${copy.members} y sus cuotas: Franky avisa antes de cada cobro y te dice quién se queda sin sesiones.`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setPlanOpen("new")}>
              <Plus className="h-4 w-4" /> Nuevo plan
            </Button>
            <Button variant="dark" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Nuevo {copy.member}
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Users} label={`${copy.Members} activos`} value={active.length} hint={`${students} con carné de estudiante`} />
        <Kpi icon={Wallet} label="Recurrente al mes" value={money(mrr, { round: true })} hint="cuotas mensuales y trimestrales" />
        <Kpi
          label="Pendiente de cobro"
          value={money(overdueCents(data), { round: true })}
          hint={overdue.length ? `${plural(overdue.length, copy.member, copy.members)}, toca para verlos` : "todo cobrado"}
          emphasis={overdue.length > 0}
          onClick={overdue.length ? () => setTab(care ? "charges" : "members") : undefined}
        />
        <Kpi
          icon={UserMinus}
          label="Bajas del mes"
          value={leavers.length}
          hint={care && avoided ? `${plural(avoided, "baja evitada", "bajas evitadas")} con pausa` : leavers.length ? `${pct1(leavers.length, active.length + leavers.length)} % de la base` : "nadie se ha ido"}
          onClick={care ? () => setTab("leavers") : undefined}
        />
      </KpiRow>

      <Segmented
        label="Vista"
        value={tab}
        onChange={setTab}
        options={[
          { value: "members", label: copy.Members, count: counts.all },
          ...(care ? [{ value: "charges" as View, label: "Cobros" }] : []),
          { value: "plans", label: study ? "Pases y bonos" : "Planes y bonos", count: data.plans.length },
          ...(care ? [{ value: "leavers" as View, label: "Bajas", count: counts.cancelled }] : []),
          // Lo propio de una academia: recuperaciones, curso que viene y aprobados.
          ...(vertical.id === "academy"
            ? [
                { value: "recoveries" as View, label: "Recuperaciones", count: recoveriesPending(data, now).length },
                { value: "course" as View, label: "Curso que viene" },
                { value: "results" as View, label: "Aprobados" },
              ]
            : []),
        ]}
      />

      {tab === "members" ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              label="Estado"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Todos", count: counts.all },
                { value: "active", label: "Al día", count: counts.active },
                { value: "overdue", label: "Pago pendiente", count: counts.overdue },
                { value: "trial", label: "De prueba", count: counts.trial },
                { value: "paused", label: "Pausados", count: counts.paused },
                { value: "cancelled", label: "Bajas", count: counts.cancelled },
              ]}
            />
            <div className="flex items-center gap-2">
              {care && risky.size ? (
                <FilterChip active={onlyRisk} onClick={() => setOnlyRisk((v) => !v)}>
                  <HeartHandshake className="h-3.5 w-3.5" /> En riesgo
                </FilterChip>
              ) : null}
              <FilterChip active={onlyStudents} onClick={() => setOnlyStudents((v) => !v)}>
                <BadgeCheck className="h-3.5 w-3.5" /> Estudiantes
              </FilterChip>
              <SearchInput value={query} onChange={setQuery} placeholder={study || vertical.id === "academy" ? "Nombre o carrera" : "Buscar por nombre"} className="w-full lg:w-64" />
            </div>
          </div>

          <Panel flush>
            {list.length ? (
              <div>
                <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_96px_130px_120px] gap-4 border-b border-border-light px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-muted md:grid">
                  <span>{capitalize(copy.member)}</span>
                  <span>Plan</span>
                  <span>{study ? "Días" : "Sesiones"}</span>
                  <span>{study ? "Días en 30" : "Asistencia 30 d"}</span>
                  <span className="text-right">Estado</span>
                </div>
                <ul className="divide-y divide-border-light">
                  {list.map((m) => (
                    <MemberRow key={m.id} member={m} risky={care && risky.has(m.id)} onOpen={() => setOpen(m.id)} />
                  ))}
                </ul>
              </div>
            ) : (
              <Empty
                icon={Users}
                title={data.members.length ? "Nadie con este filtro" : `Todavía no tienes ${copy.members}`}
                body={
                  data.members.length
                    ? "Prueba con otro estado o borra la búsqueda."
                    : `Da de alta a tu primer ${copy.member}: nombre, plan y si es estudiante. Tarda un minuto.`
                }
                action={
                  data.members.length ? undefined : (
                    <Button variant="dark" onClick={() => setCreating(true)}>
                      <Plus className="h-4 w-4" /> Nuevo {copy.member}
                    </Button>
                  )
                }
              />
            )}
          </Panel>

          <Tip title="Retención">
            {study
              ? "Quien compra el bono exámenes en enero vuelve en junio si le escribes una semana antes. Filtra por estudiantes y mándales el aviso desde su ficha."
              : `Un ${copy.member} con menos de 4 ${copy.sessionMany} en el último mes está pensando en irse. Filtra por "En riesgo" y escríbele antes del próximo cobro: suele bastar con preguntar cómo va.`}
          </Tip>
        </>
      ) : null}

      {tab === "charges" ? <ChargesView /> : null}
      {tab === "plans" ? <PlansGrid onOpen={setPlanOpen} /> : null}
      {tab === "leavers" ? <LeaversView onOpen={setOpen} /> : null}
      {tab === "recoveries" ? <RecoveriesView /> : null}
      {tab === "course" ? <NextCourseView /> : null}
      {tab === "results" ? <ResultsView /> : null}

      <MemberDrawer memberId={open} onClose={() => setOpen(null)} />
      <NewMemberDrawer open={creating} onClose={() => setCreating(false)} />
      <PlanDrawer planId={planOpen} onClose={() => setPlanOpen(null)} />
    </div>
  );
}

function pct1(a: number, b: number) {
  return b ? Math.round((a / b) * 100) : 0;
}

function statusRank(s: ProMember["status"]) {
  return { overdue: 0, trial: 1, active: 2, paused: 3, cancelled: 4 }[s];
}

/* ------------------------------------------------------------------ */

function MemberRow({ member: m, risky, onOpen }: { member: ProMember; risky: boolean; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const study = vertical.engine === "courts";
  const plan = data.plans.find((p) => p.id === m.planId);
  const status = MEMBER_STATUS[m.status];
  const target = study ? 20 : monthlyTarget(plan);
  const lowSessions = m.sessionsLeft !== null && m.sessionsLeft <= 2 && m.status !== "cancelled";
  const care = careOf(data, m.id);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus-visible:bg-bg-secondary focus-visible:outline-none sm:px-5 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_96px_130px_120px]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={m.name} size="sm" tone={m.status === "overdue" ? "rose" : m.status === "trial" ? "violet" : "slate"} />
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-sm font-semibold">
              <span className="truncate">{m.name}</span>
              {m.student?.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
              {isFromFranky(m.source) ? <Sparkles className="h-3 w-3 shrink-0 text-violet" aria-label="Vino por Franky" /> : null}
              {care.health ? <HeartPulse className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Tiene un aviso de salud" /> : null}
            </span>
            <span className="block truncate text-xs text-text-muted">
              {m.status === "paused" && care.pausedUntil
                ? `Vuelve el ${dayLabel(`${care.pausedUntil}T12:00:00Z`, { weekday: false })}`
                : m.student
                  ? `${shortUni(m.student.university)}${m.studies ? `, ${m.studies}` : ""}`
                  : m.studies ?? `Desde ${relative(m.since, now.getTime())}`}
              <span className="md:hidden"> · {plan?.name}</span>
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block truncate text-sm">{plan?.name ?? "Sin plan"}</span>
          <span className="block text-xs text-text-muted tabular">{plan ? `${money(memberPrice(m, plan))} ${PERIOD_LABEL[plan.period]}` : ""}</span>
        </span>
        <span className={cn("hidden text-sm tabular md:block", lowSessions && "font-semibold text-amber-700 dark:text-amber-300")}>
          {m.sessionsLeft === null ? "Ilimitado" : `${m.sessionsLeft} ${study ? "días" : "restantes"}`}
        </span>
        <span className="hidden items-center gap-2 md:flex">
          <Meter value={m.attendanceLast30} max={target} className="w-16" tone={m.attendanceLast30 < target / 3 ? "warning" : "success"} />
          <span className="text-xs text-text-muted tabular">{m.attendanceLast30}</span>
        </span>
        <span className="flex justify-end gap-1">
          {risky ? <Pill tone="warning">En riesgo</Pill> : <Pill tone={status.tone}>{status.label}</Pill>}
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Bajas: motivos y recuperar exsocios                                 */
/* ------------------------------------------------------------------ */

function LeaversView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now, update, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const summary = leaveSummary(data, now);
  const { season, list } = winbackCandidates(data, now);
  const sender = data.space.owner.firstName || data.space.name;
  const max = Math.max(1, ...summary.reasons.map((r) => r.count));

  const contacted = (m: ProMember) => {
    void update("member.winback", (d) => patchCare(d, m.id, { winbackAt: now.toISOString() }));
    toast.success("Apuntado", `${firstName(m.name)} queda como contactado para volver.`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Panel title="Por qué se van" description="Últimos 90 días. Se pregunta al dar de baja.">
        {summary.total ? (
          <ul className="flex flex-col gap-3">
            {summary.reasons.map((r) => (
              <li key={r.reason}>
                <div className="flex items-center justify-between text-sm">
                  <span>{r.label}</span>
                  <span className="font-semibold tabular">{r.count}</span>
                </div>
                <Meter value={r.count} max={max} className="mt-1" tone="violet" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">Nadie se ha ido en los últimos 90 días.</p>
        )}
        <p className="mt-4 rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">
          {summary.avoided
            ? `${plural(summary.avoided, "persona eligió", "personas eligieron")} pausar con fecha de vuelta en vez de irse.`
            : "Al dar de baja, Franky ofrece pausar con fecha de vuelta. Verano y exámenes dejan de ser bajas."}
        </p>
      </Panel>

      <Panel
        title="Recuperar bajas"
        description={season ? "Empieza temporada: es el mejor momento para escribirles." : "En septiembre y enero es cuando más vuelven. Escríbeles entonces."}
        flush
      >
        {list.length ? (
          <ul className="divide-y divide-border-light">
            {list.map((w) => {
              const link = customerWhatsApp(w.member.phone, winbackMessage(w.member, sender, data.space.name, vertical.id));
              return (
                <li key={w.member.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <button type="button" onClick={() => onOpen(w.member.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar name={w.member.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{w.member.name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        Se fue el {dayLabel(`${w.leftOn}T12:00:00Z`, { weekday: false })}
                        {w.reason ? ` · ${w.reason.toLowerCase()}` : ""}
                        {w.contactedAt ? ` · escrito ${relative(w.contactedAt, now.getTime())}` : ""}
                      </span>
                    </span>
                  </button>
                  {link ? (
                    <Button size="sm" variant={season ? "secondary" : "ghost"} asChild>
                      <a href={link} target="_blank" rel="noreferrer" onClick={() => contacted(w.member)}>
                        <MessageCircle className="h-3.5 w-3.5" /> Invitar a volver
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={HeartHandshake} title="Nadie a quien recuperar" body={`Cuando un ${copy.member} se dé de baja, aparecerá aquí con su motivo.`} />
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de socio                                                      */
/* ------------------------------------------------------------------ */

type DrawerMode = "view" | "pause" | "leave";

function MemberDrawer({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const study = vertical.engine === "courts";
  const hasCare = vertical.engine === "classes";
  const member = data.members.find((m) => m.id === memberId) ?? null;
  const [planId, setPlanId] = React.useState("");
  const [mode, setMode] = React.useState<DrawerMode>("view");
  const [method, setMethod] = React.useState<ProChargeMethod>("card");
  const [pauseReason, setPauseReason] = React.useState<ProPauseReason>("exams");
  const [pauseUntil, setPauseUntil] = React.useState("");
  const [leaveReason, setLeaveReason] = React.useState<ProLeaveReason>("schedule");
  const [health, setHealth] = React.useState("");
  const [receipt, setReceipt] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPlanId(member?.planId ?? "");
    setMode("view");
    setMethod("card");
    setPauseReason(vertical.id === "academy" ? "exams" : "summer");
    setPauseUntil(suggestedReturn(vertical.id === "academy" ? "exams" : "summer", now));
    setLeaveReason("schedule");
    setHealth(member ? careOf(data, member.id).health ?? "" : "");
    // Solo al abrir otra ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  if (!member) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const plan = data.plans.find((p) => p.id === member.planId);
  const price = memberPrice(member, plan);
  const status = MEMBER_STATUS[member.status];
  const care = careOf(data, member.id);
  const charges = memberCharges(data, member.id);
  const owed = charges.find((c) => c.status !== "paid");
  const payments = data.payments.filter((p) => p.clientName === member.name).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const visits = data.bookings
    .filter((b) => b.clientId === member.id && (b.status === "arrived" || b.status === "done"))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 4);
  const target = study ? 20 : monthlyTarget(plan);
  const first = firstName(member.name);
  const risk = hasCare ? memberRisk(data, member, now) : null;
  const recoveries = vertical.id === "academy" ? pendingRecoveries(data, member.id, now) : [];
  const faults = noShowCount(data, member.id);
  const sender = data.space.owner.firstName || data.space.name;
  const today = localDate(now);
  // Matrícula pendiente: solo si el plan la tiene y nunca la ha pagado.
  const enrollment = hasPaidEnrollment(data, member.id) ? 0 : enrollmentFee(data, member.planId);

  const patch = (label: string, changes: Partial<ProMember>, payment?: ProPayment) =>
    update(label, (d) => ({
      ...d,
      members: d.members.map((m) => (m.id === member.id ? { ...m, ...changes } : m)),
      payments: payment ? [...d.payments, payment] : d.payments,
    }));

  const charge = () => {
    if (owed) {
      void update("member.charge", (d) => markChargePaid(d, owed.id, method, now));
      toast.success("Cobrada", `${money(owed.amountCents)} de ${first} por ${CHARGE_METHOD_LABEL[method].toLowerCase()}. Recibo ${nextNo()} listo.`);
      return;
    }
    const base = member.nextChargeAt ?? now.toISOString();
    void update("member.charge", (d) =>
      recordCharge(
        { ...d, members: d.members.map((m) => (m.id === member.id ? { ...m, status: "active" as const, nextChargeAt: addMonths(base, 1) } : m)) },
        { id: localId("ch"), member, concept: `Cuota ${plan?.name ?? ""}`, amountCents: price, method },
        now,
      ),
    );
    toast.success("Cobrada", `${money(price)} de ${first}. Próximo cobro el ${dayLabel(addMonths(base, 1), { weekday: false })}.`);
  };

  const nextNo = () => `R${today.slice(0, 4)}-${String(extrasOf(data).receiptSeq + 1).padStart(4, "0")}`;

  const renew = () => {
    void update("member.renew", (d) => {
      const renewed = { ...d, members: d.members.map((m) => (m.id === member.id ? { ...m, status: "active" as const, sessionsLeft: plan?.sessions ?? null } : m)) };
      const charged = recordCharge(renewed, { id: localId("ch"), member, concept: `Renovación ${plan?.name ?? ""}`, amountCents: price, method }, now);
      return patchCare(charged, member.id, { bundleExpiresOn: addDays(today, BUNDLE_DAYS) });
    });
    toast.success("Bono renovado", `${first} vuelve a tener ${plan?.sessions ?? 0} ${study ? "días" : copy.sessionMany}.`);
  };

  const activate = () => {
    if (member.status === "paused") {
      void update("member.resume", (d) => resumeMember(d, member.id, now));
      toast.success("Reactivado", `${first} vuelve con ${plan?.name}. Su cuota se cobra desde hoy.`);
      return;
    }
    if (member.status === "trial") {
      void update("member.activate", (d) => {
        const charged = recordCharge(
          { ...d, members: d.members.map((m) => (m.id === member.id ? { ...m, status: "active" as const, nextChargeAt: plan?.period === "pack" ? null : addMonths(now.toISOString(), 1) } : m)) },
          { id: localId("ch"), member, concept: `Alta ${plan?.name ?? ""}`, amountCents: price, method },
          now,
        );
        // La matrícula sale con el primer cobro, en su propio recibo.
        return chargeEnrollment(charged, member, member.planId, method, now, localId("ch"));
      });
      toast.success(
        "Alta hecha",
        enrollment
          ? `${first} ya es ${copy.member} con ${plan?.name}. Cuota y matrícula (${money(enrollment)}) con su recibo.`
          : `${first} ya es ${copy.member} con ${plan?.name}. Recibo listo.`,
      );
      return;
    }
    void patch("member.activate", { status: "active", nextChargeAt: plan?.period === "pack" ? null : addMonths(now.toISOString(), 1), changedAt: undefined });
    toast.success("Reactivado", `${first} ya es ${copy.member} con ${plan?.name}.`);
  };

  const pause = (insteadOfLeaving: boolean) => {
    void update("member.pause", (d) => pauseMember(d, member.id, pauseUntil, pauseReason, now, insteadOfLeaving));
    toast.success(
      insteadOfLeaving ? "Pausa en vez de baja" : "Cuota pausada",
      `No se cobra a ${first} hasta el ${dayLabel(`${pauseUntil}T12:00:00Z`, { weekday: false })}. Te avisamos la semana antes.`,
    );
    setMode("view");
  };

  const leave = () => {
    void update("member.cancel", (d) => leaveMember(d, member.id, leaveReason, now));
    toast.success("Baja registrada", `${first} deja de pagar. Su historial se guarda por si vuelve.`);
    onClose();
  };

  const saveHealth = () => {
    if ((care.health ?? "") === health.trim()) return;
    void update("member.health", (d) => patchCare(d, member.id, { health: health.trim() || undefined }));
    toast.success("Guardado", "Solo lo ve tu equipo, junto a su nombre en la lista de la clase.");
  };

  const savePlan = () => {
    const next = data.plans.find((p) => p.id === planId);
    if (!next) return;
    void patch("member.plan", {
      planId,
      sessionsLeft: next.sessions ?? null,
      nextChargeAt: next.period === "pack" ? null : member.nextChargeAt ?? addMonths(now.toISOString(), 1),
    });
    toast.success("Plan cambiado", `${first} pasa a ${next.name}: ${money(memberPrice(member, next))} ${PERIOD_LABEL[next.period]}.`);
  };

  const whatsapp = customerWhatsApp(
    member.phone,
    risk
      ? riskMessage(vertical.id, member, sender, data.space.name)
      : member.status === "overdue"
        ? `Hola ${first}, soy ${sender} de ${data.space.name}. Nos ha llegado devuelta la cuota de este mes, ¿te va bien pagarla por Bizum o en mano?`
        : `Hola ${first}, te escribo de ${data.space.name}.`,
  );

  const primary = (() => {
    if (member.status === "overdue" || (owed && owed.status === "returned")) return <Button variant="dark" onClick={charge}>Cobrar {money(owed?.amountCents ?? price)}</Button>;
    if (member.status === "trial") return <Button variant="dark" onClick={activate}>Dar de alta y cobrar {money(price + enrollment)}</Button>;
    if (member.status === "paused" || member.status === "cancelled") return <Button variant="dark" onClick={activate}><Play className="h-4 w-4" /> Reactivar</Button>;
    if (plan?.period === "pack" && (member.sessionsLeft ?? 0) <= 2) return <Button variant="dark" onClick={renew}>Renovar bono {money(price)}</Button>;
    return null;
  })();

  const footer =
    mode === "pause" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
        <Button variant="dark" onClick={() => pause(false)} disabled={!pauseUntil || pauseUntil <= today}>Pausar hasta el {pauseUntil ? Number(pauseUntil.slice(8)) : ""}/{pauseUntil ? Number(pauseUntil.slice(5, 7)) : ""}</Button>
      </>
    ) : mode === "leave" ? (
      <>
        <Button variant="ghost" onClick={() => setMode("view")}>Volver</Button>
        <Button variant="destructive" onClick={leave}>Dar de baja</Button>
      </>
    ) : (
      <>
        {whatsapp ? (
          <Button variant="outline" asChild>
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </Button>
        ) : null}
        {primary}
      </>
    );

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={member.name}
      description={`${capitalize(copy.member)} desde ${dayLabel(member.since, { weekday: false })}`}
      footer={footer}
    >
      {mode === "pause" ? (
        <PauseForm reason={pauseReason} setReason={setPauseReason} until={pauseUntil} setUntil={setPauseUntil} today={today} first={first} />
      ) : mode === "leave" ? (
        <div className="flex flex-col gap-5">
          <FormField label={`¿Por qué se va ${first}?`} hint="Te sale un resumen cada trimestre en Bajas.">
            <ChoiceChips value={leaveReason} onChange={setLeaveReason} options={(Object.keys(LEAVE_REASONS) as ProLeaveReason[]).map((r) => ({ value: r, label: LEAVE_REASONS[r] }))} />
          </FormField>
          {hasCare && leaveReason !== "moving" && leaveReason !== "results" ? (
            <div className="rounded-2xl border border-violet/25 bg-violet-50 p-4 dark:bg-violet-950/30">
              <p className="text-sm font-semibold text-violet-deep">¿Y si pausa en vez de irse?</p>
              <p className="mt-1 text-sm text-text-secondary">
                Su cuota se para y vuelve sola el {dayLabel(`${suggestedReturn(leaveReason === "exams" ? "exams" : leaveReason === "injury" ? "injury" : "summer", now)}T12:00:00Z`, { weekday: false })}. Sin papeleo para volver.
              </p>
              <Button
                variant="dark"
                size="sm"
                className="mt-3"
                onClick={() => {
                  const reason: ProPauseReason = leaveReason === "exams" ? "exams" : leaveReason === "injury" ? "injury" : "summer";
                  const until = suggestedReturn(reason, now);
                  void update("member.pause", (d) => pauseMember(d, member.id, until, reason, now, true));
                  toast.success("Pausa en vez de baja", `${first} vuelve el ${dayLabel(`${until}T12:00:00Z`, { weekday: false })}. Una baja menos.`);
                  setMode("view");
                }}
              >
                <Pause className="h-3.5 w-3.5" /> Pausar en su lugar
              </Button>
            </div>
          ) : null}
          <p className="text-sm text-text-muted">{first} deja de pagar desde hoy. Su historial y su contacto se quedan por si vuelve.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} size="lg" tone={member.status === "overdue" ? "rose" : "violet"} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={status.tone}>{status.label}</Pill>
                {member.student ? (
                  <Pill tone={member.student.verified ? "violet" : "neutral"}>
                    {member.student.verified ? <BadgeCheck className="h-3 w-3" /> : null}
                    {shortUni(member.student.university)}
                  </Pill>
                ) : null}
                {isFromFranky(member.source) ? <Pill tone="success">Vino por Franky</Pill> : null}
                {faults >= NO_SHOW_WARN ? <Pill tone="danger">{faults} faltas sin avisar</Pill> : null}
              </div>
              {member.studies ? <p className="mt-1 text-sm text-text-muted">{member.studies}</p> : null}
            </div>
          </div>

          {risk ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{risk.reason}</p>
              <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
                {care.contactedAt ? `Le escribiste ${relative(care.contactedAt, now.getTime())}.` : "Un mensaje tuyo ahora vale más que cualquier descuento."} El botón de WhatsApp ya lleva el mensaje escrito.
              </p>
            </div>
          ) : null}

          {member.status === "overdue" || owed?.status === "returned" ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
              <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{owed?.status === "returned" ? "Recibo devuelto por el banco" : "Cuota pendiente"}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold tabular text-rose-900 dark:text-rose-100">{money(owed?.amountCents ?? price)}</p>
              <p className="text-xs text-rose-800/80 dark:text-rose-200/80">
                Vencía {owed ? relative(`${owed.dueOn}T09:00:00Z`, now.getTime()) : member.nextChargeAt ? relative(member.nextChargeAt, now.getTime()) : "este mes"}. Si te paga en mano o por Bizum, márcalo aquí.
              </p>
              <ChoiceChips className="mt-3" value={method} onChange={setMethod} options={PAY_METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
            </div>
          ) : null}

          <div className="divide-y divide-border-light rounded-2xl border border-border px-4">
            <Detail label="Plan">{plan?.name ?? "Sin plan"}</Detail>
            <Detail label="Precio">
              {money(price)} {plan ? PERIOD_LABEL[plan.period] : ""}
              {member.student?.verified && plan?.studentPriceCents && plan.studentPriceCents !== plan.priceCents ? (
                <span className="block text-xs font-normal text-text-muted">precio estudiante</span>
              ) : null}
            </Detail>
            <Detail label="Próximo cobro">
              {member.status === "paused" && care.pausedUntil
                ? `Vuelve el ${dayLabel(`${care.pausedUntil}T12:00:00Z`, { weekday: false })}`
                : member.nextChargeAt && member.status !== "overdue"
                  ? dayLabel(member.nextChargeAt, { weekday: false })
                  : member.status === "overdue"
                    ? "Vencido"
                    : "Sin cobro programado"}
            </Detail>
            <Detail label={study ? "Días que le quedan" : `${capitalize(copy.sessionMany)} que le quedan`}>{member.sessionsLeft === null ? "Ilimitado" : member.sessionsLeft}</Detail>
            {care.bundleExpiresOn ? (
              <Detail label="El bono caduca">
                <span className={cn(care.bundleExpiresOn <= addDays(today, 7) && "text-amber-700 dark:text-amber-300")}>
                  {dayLabel(`${care.bundleExpiresOn}T12:00:00Z`, { weekday: false })}
                </span>
              </Detail>
            ) : null}
            {care.lastVisitAt ? <Detail label="Última vez que vino">{relative(care.lastVisitAt, now.getTime())}</Detail> : null}
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{study ? "Días que ha venido en 30 días" : "Asistencia en 30 días"}</span>
              <span className="tabular text-text-muted">
                {member.attendanceLast30} de {target}
              </span>
            </div>
            <Meter value={member.attendanceLast30} max={target} className="mt-2" tone={member.attendanceLast30 < target / 3 ? "warning" : "success"} />
          </div>

          {recoveries.length ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900 dark:text-sky-100">
                <CalendarClock className="h-4 w-4" strokeWidth={1.8} /> {plural(recoveries.length, "clase por recuperar", "clases por recuperar")}
              </p>
              <ul className="mt-1.5 text-xs text-sky-900/80 dark:text-sky-100/80">
                {recoveries.map((r) => (
                  <li key={r.id}>
                    Faltó el {dayLabel(`${r.missedOn}T12:00:00Z`, { weekday: false })}, puede recuperarla hasta el {dayLabel(`${r.expiresOn}T12:00:00Z`, { weekday: false })}.
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-sky-900/80 dark:text-sky-100/80">Apúntale en otro grupo con hueco y se descuenta sola.</p>
            </div>
          ) : null}

          {hasCare && faults >= NO_SHOW_WARN && member.status !== "cancelled" ? (
            <NoShowNotice memberId={member.id} name={member.name} phone={member.phone} count={faults} sender={sender} place={data.space.name} />
          ) : null}

          {vertical.id === "sports" && member.status !== "cancelled" ? <MemberRecords memberId={member.id} /> : null}

          {vertical.id === "academy" && member.status !== "cancelled" ? <MemberGrades memberId={member.id} /> : null}

          {vertical.id === "academy" && member.status !== "cancelled" ? <MemberLevel memberId={member.id} /> : null}

          {hasCare ? (
            <FormField label="Salud y avisos para el equipo" htmlFor="mb-health" hint="Solo lo ve tu equipo, junto a su nombre en la lista de clase.">
              <textarea
                id="mb-health"
                value={health}
                onChange={(e) => setHealth(e.target.value)}
                onBlur={saveHealth}
                className={textareaClass}
                placeholder={vertical.id === "academy" ? "Necesita más tiempo en los exámenes..." : "Lesión de hombro, sin kipping..."}
              />
            </FormField>
          ) : null}

          {vertical.id === "academy" && member.status !== "cancelled" ? (
            <FormField label="Plaza para el curso que viene">
              <ChoiceChips
                value={care.nextCourse ?? "pending"}
                onChange={(v) => void update("member.next_course", (d) => patchCare(d, member.id, { nextCourse: v }))}
                options={[
                  { value: "confirmed" as const, label: "Confirmada" },
                  { value: "pending" as const, label: "Sin confirmar" },
                  { value: "declined" as const, label: "No sigue" },
                ]}
              />
            </FormField>
          ) : null}

          {member.status !== "cancelled" ? (
            <FormField label="Cambiar de plan">
              <ChoiceChips
                value={planId}
                onChange={setPlanId}
                options={data.plans.map((p) => ({ value: p.id, label: p.name, hint: `${money(memberPrice(member, p))} ${PERIOD_LABEL[p.period]}` }))}
              />
              {planId !== member.planId ? (
                <Button variant="secondary" className="mt-1 self-start" onClick={savePlan}>
                  Guardar cambio de plan
                </Button>
              ) : null}
            </FormField>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Historial</p>
            <ul className="mt-2 flex flex-col gap-2">
              {visits.map((b) => {
                const s = data.sessions.find((x2) => x2.id === b.sessionId);
                const ct = s ? data.classTypes.find((c) => c.id === s.classTypeId) : undefined;
                const res = data.resources.find((r) => r.id === b.resourceId);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{ct?.name ?? res?.name ?? "Visita"}</span>
                    <span className="shrink-0 text-xs text-text-muted">{relative(b.start, now.getTime())}</span>
                  </li>
                );
              })}
              {charges.length
                ? charges.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {c.concept}
                        <span className="text-xs text-text-muted"> · {c.status === "paid" ? (c.method ? CHARGE_METHOD_LABEL[c.method] : "Cobrada") : c.status === "returned" ? "Devuelto" : "Pendiente"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-text-muted tabular">
                        {money(c.amountCents)} · {dayLabel(`${c.dueOn}T12:00:00Z`, { weekday: false })}
                        {c.status === "paid" ? (
                          <button type="button" onClick={() => setReceipt(c.id)} aria-label={`Ver recibo ${c.receiptNo ?? ""}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-violet hover:bg-bg-secondary">
                            <FileText className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))
                : payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{p.concept}</span>
                      <span className="shrink-0 text-xs text-text-muted tabular">
                        {money(p.amountCents)} · {dayLabel(p.at, { weekday: false })}
                      </span>
                    </li>
                  ))}
              {!visits.length && !payments.length && !charges.length ? <li className="text-sm text-text-muted">Aún no hay movimientos.</li> : null}
            </ul>
          </div>

          {member.status === "active" || member.status === "overdue" || member.status === "trial" ? (
            <div className="flex flex-wrap gap-2 border-t border-border-light pt-4">
              {member.status !== "trial" ? (
                <Button variant="ghost" size="sm" onClick={() => (hasCare ? setMode("pause") : void patch("member.pause", { status: "paused", nextChargeAt: null, changedAt: now.toISOString() }))}>
                  <Pause className="h-3.5 w-3.5" /> Pausar cuota
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => setMode("leave")}>
                <UserMinus className="h-3.5 w-3.5" /> Dar de baja
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <ReceiptDrawer chargeId={receipt} onClose={() => setReceipt(null)} />
    </Drawer>
  );
}

function PauseForm({
  reason,
  setReason,
  until,
  setUntil,
  today,
  first,
}: {
  reason: ProPauseReason;
  setReason: (r: ProPauseReason) => void;
  until: string;
  setUntil: (d: string) => void;
  today: string;
  first: string;
}) {
  const { now } = usePro();
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Motivo">
        <ChoiceChips
          value={reason}
          onChange={(r) => {
            setReason(r);
            setUntil(suggestedReturn(r, now));
          }}
          options={(Object.keys(PAUSE_REASONS) as ProPauseReason[]).map((r) => ({ value: r, label: PAUSE_REASONS[r] }))}
        />
      </FormField>
      <FormField label="Vuelve el" htmlFor="pause-until" hint="Su cuota vuelve sola ese día. Te avisamos la semana antes.">
        <input id="pause-until" type="date" min={addDays(today, 1)} value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
      </FormField>
      <p className="rounded-2xl bg-bg-secondary p-3 text-sm text-text-secondary">
        Mientras tanto no se le cobra a {first} y su plaza sigue siendo suya. Pausar con fecha retiene más que una baja: la vuelta ya está en el calendario.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Alta de socio                                                       */
/* ------------------------------------------------------------------ */

function NewMemberDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [student, setStudent] = React.useState(true);
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [studies, setStudies] = React.useState("");
  const [start, setStart] = React.useState<"paid" | "trial">("paid");
  const [method, setMethod] = React.useState<ProChargeMethod>("card");
  const [health, setHealth] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setPlanId(data.plans.find((p) => p.period === "month")?.id ?? data.plans[0]?.id ?? "");
    setStudent(true);
    setUni(UNIVERSITIES[0]);
    setStudies("");
    setStart("paid");
    setMethod("card");
    setHealth("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const plan = data.plans.find((p) => p.id === planId);
  const price = plan ? (student && plan.studentPriceCents ? plan.studentPriceCents : plan.priceCents) : 0;

  const save = () => {
    const id = localId("m");
    const iso = now.toISOString();
    const member: ProMember = {
      id,
      clientId: id,
      name: name.trim(),
      planId,
      status: start === "trial" ? "trial" : "active",
      nextChargeAt: start === "trial" ? atLocal(addDays(localDate(now), 7), 9 * 60) : plan?.period === "pack" ? null : addMonths(iso, 1),
      sessionsLeft: plan?.sessions ?? null,
      since: iso,
      attendanceLast30: 0,
      student: student ? { university: uni, verified: true } : undefined,
      studies: studies.trim() || undefined,
      phone: phone.trim() || undefined,
      source: "walkin",
    };
    void update("member.create", (d) => {
      let next: typeof d = { ...d, members: [member, ...d.members] };
      if (start === "paid" && plan) {
        next = recordCharge(next, { id: localId("ch"), member, concept: `Alta ${plan.name}`, amountCents: price, method }, now);
        next = chargeEnrollment(next, member, plan.id, method, now, localId("ch"));
      }
      const care = {
        ...(health.trim() ? { health: health.trim() } : {}),
        ...(plan?.period === "pack" ? { bundleExpiresOn: addDays(localDate(now), BUNDLE_DAYS) } : {}),
        lastVisitAt: iso,
      };
      return patchCare(next, id, care);
    });
    toast.success(
      start === "trial" ? "Semana de prueba activada" : `${capitalize(copy.member)} dado de alta`,
      start === "trial" ? `${member.name} tiene 7 días para probar. Te avisamos antes de que acabe.` : `${member.name} con ${plan?.name}, ${money(price)} cobrados con recibo. Empieza su recorrido de bienvenida.`,
    );
    onClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={`Nuevo ${copy.member}`}
      description="Con su móvil le llegan los avisos de cobro y de sus reservas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="dark" onClick={save} disabled={name.trim().length < 3 || !plan}>
            {start === "trial" ? "Empezar prueba" : `Dar de alta y cobrar ${money(price + (plan ? enrollmentFee(data, plan.id) : 0))}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="Nombre y apellido" htmlFor="nm-name">
          <input id="nm-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Lucía García" autoComplete="off" />
        </FormField>
        <FormField label="Móvil" htmlFor="nm-phone">
          <input id="nm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className={inputClass} placeholder="600 000 000" autoComplete="off" />
        </FormField>
        <FormField label="Plan">
          <ChoiceChips
            value={planId}
            onChange={setPlanId}
            options={data.plans.map((p) => ({ value: p.id, label: p.name, hint: `${money(student && p.studentPriceCents ? p.studentPriceCents : p.priceCents)} ${PERIOD_LABEL[p.period]}` }))}
          />
        </FormField>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" checked={student} onChange={(e) => setStudent(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
          Es estudiante (se verifica con su cuenta de Franky)
        </label>
        {student ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Universidad">
              <select value={uni} onChange={(e) => setUni(e.target.value)} className={inputClass} aria-label="Universidad">
                {UNIVERSITIES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Carrera" htmlFor="nm-studies">
              <input id="nm-studies" value={studies} onChange={(e) => setStudies(e.target.value)} className={inputClass} placeholder="ADE" />
            </FormField>
          </div>
        ) : null}
        <FormField label="Cómo empieza">
          <ChoiceChips
            value={start}
            onChange={setStart}
            options={[
              { value: "paid", label: "Paga ya", hint: "Cobro de hoy" },
              { value: "trial", label: "Semana de prueba", hint: "Gratis 7 días" },
            ]}
          />
        </FormField>
        {start === "paid" ? (
          <FormField label="Cómo paga">
            <ChoiceChips value={method} onChange={setMethod} options={[...PAY_METHODS, "sepa" as const].map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
          </FormField>
        ) : null}
        {vertical.engine === "classes" ? (
          <FormField label="Salud y avisos (opcional)" htmlFor="nm-health" hint="Solo lo ve tu equipo.">
            <input id="nm-health" value={health} onChange={(e) => setHealth(e.target.value)} className={inputClass} placeholder="Lesiones o algo que el equipo deba saber" />
          </FormField>
        ) : null}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ */
/* Planes y bonos                                                      */
/* ------------------------------------------------------------------ */

function PlansGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const study = vertical.engine === "courts";
  const total = Math.max(1, data.members.filter((m) => m.status !== "cancelled").length);

  if (!data.plans.length) {
    return (
      <Panel>
        <Empty
          icon={Wallet}
          title="Aún no tienes planes"
          body={study ? "Crea tu pase de día, el mensual y el bono exámenes." : "Crea tu cuota mensual, el bono de clases y la tarifa universitaria."}
          action={
            <Button variant="dark" onClick={() => onOpen("new")}>
              <Plus className="h-4 w-4" /> Crear plan
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.plans.map((p) => {
          const count = planMembers(data, p.id);
          const monthly = data.members
            .filter((m) => m.planId === p.id && (m.status === "active" || m.status === "overdue"))
            .reduce((a, m) => a + (monthlyEquivalent(p, memberPrice(m, p)) || 0), 0);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              className="group flex flex-col rounded-2xl border border-border bg-bg-primary p-4 text-left shadow-card transition-[border-color,transform] hover:-translate-y-px hover:border-text-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet"
            >
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="mt-2 flex items-baseline gap-1.5">
                <span className="font-heading text-3xl font-extrabold tracking-[-0.02em] tabular">{money(p.priceCents)}</span>
                <span className="text-sm text-text-muted">{PERIOD_LABEL[p.period]}</span>
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {p.studentPriceCents && p.studentPriceCents !== p.priceCents ? (
                  <Pill tone="violet">
                    <BadgeCheck className="h-3 w-3" /> Estudiante {money(p.studentPriceCents)}
                  </Pill>
                ) : p.studentPriceCents ? (
                  <Pill tone="violet">Solo estudiantes</Pill>
                ) : null}
                <Pill>{p.sessions ? `${p.sessions} ${study ? "días" : copy.sessionMany}` : "Ilimitado"}</Pill>
              </span>
              <span className="mt-4 flex items-center justify-between text-xs text-text-muted">
                <span className="tabular">
                  {count} {count === 1 ? copy.member : copy.members}
                </span>
                {monthly ? <span className="tabular">{money(monthly, { round: true })} al mes</span> : null}
              </span>
              <Meter value={count} max={total} className="mt-1.5" />
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onOpen("new")}
          className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-text-secondary transition-colors hover:border-violet/50 hover:text-violet"
        >
          <Plus className="h-5 w-5" /> Crear plan o bono
        </button>
      </div>
      <Tip title="Precio estudiante">
        {study
          ? "El bono exámenes se enseña en Franky a las carreras que tienen exámenes esa semana. Créalo aquí y lánzalo desde Estudiantes en diciembre y en mayo."
          : "Un precio de estudiante solo en horas valle (de 10 a 14 h) llena las clases flojas sin rebajar la cuota de la tarde. Franky verifica el carné por ti."}
      </Tip>
    </div>
  );
}

/**
 * Tercera falta sin avisar: un mensaje amable, sin multas. Si se repite, la
 * consecuencia suave es limitar unos días la reserva anticipada de las clases
 * llenas, para que la plaza le llegue a quien sí viene.
 */
function NoShowNotice({
  memberId,
  name,
  phone,
  count,
  sender,
  place,
}: {
  memberId: string;
  name: string;
  phone?: string;
  count: number;
  sender: string;
  place: string;
}) {
  const { data, now, update } = usePro();
  const toast = useToast();
  const today = localDate(now);
  const limited = bookingLimited(data, memberId, today);
  const until = careOf(data, memberId).bookingLimitedUntil;
  const link = customerWhatsApp(
    phone,
    limited && until ? limitMessage(name, sender, place, until) : noShowMessage(name, sender, place, count),
  );
  const limit = () => {
    const end = addDays(today, NO_SHOW_LIMIT_DAYS);
    void update("member.limit", (d) => limitBooking(d, memberId, end));
    toast.success(
      "Reserva limitada",
      `Hasta el ${dayLabel(`${end}T12:00:00Z`, { weekday: false })}, las clases llenas solo las reserva el mismo día.`,
    );
  };
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/40">
      <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{count} reservas sin venir ni cancelar</p>
      <p className="mt-1 text-xs text-rose-800/80 dark:text-rose-200/80">
        Cada plaza vacía es alguien de la lista de espera que se queda fuera. Un recordatorio amable suele bastar.
      </p>
      {limited && until ? (
        <p className="mt-2 text-xs font-semibold text-rose-800 dark:text-rose-200">
          Reserva limitada hasta el {dayLabel(`${until}T12:00:00Z`, { weekday: false })}: las clases llenas solo el
          mismo día.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {link ? (
          <Button size="sm" variant="secondary" asChild>
            <a href={link} target="_blank" rel="noreferrer">
              <MessageCircle className="h-3.5 w-3.5" /> Escribirle
            </a>
          </Button>
        ) : null}
        {limited ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void update("member.limit", (d) => limitBooking(d, memberId, undefined))}
          >
            Quitar el límite
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={limit}>
            Limitar {NO_SHOW_LIMIT_DAYS} días
          </Button>
        )}
      </div>
    </div>
  );
}
