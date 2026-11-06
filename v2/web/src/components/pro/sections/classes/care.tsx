"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, Check, HeartHandshake, MessageCircle, Play, RefreshCw, Sprout, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { localId, usePro } from "@/lib/pro/store";
import type { ProMember } from "@/lib/pro/types";
import type { ProChargeMethod } from "@/lib/pro/classes-types";
import { addDays, dayLabel, localDate, money, plural, time } from "@/lib/pro/format";
import { PERIOD_LABEL, classCopy, memberPrice } from "@/lib/pro/classes";
import {
  BUNDLE_DAYS,
  CHARGE_METHOD_LABEL,
  PAUSE_REASONS,
  atRiskMembers,
  bundlesExpiring,
  convertTrial,
  declineTrial,
  firstName,
  markContacted,
  markTouchDone,
  patchCare,
  pausesReturning,
  recordCharge,
  resumeMember,
  riskMessage,
  touchMessage,
  touchesDue,
  trialsToFollow,
  wasContactedRecently,
  type TrialFollowUp,
} from "@/lib/pro/classes-care";
import { customerWhatsApp } from "@/lib/pro/customer-contact";
import { chargeEnrollment, enrollmentFee } from "@/lib/pro/classes-study";
import { cn } from "@/lib/utils";
import { Avatar, ChoiceChips, Drawer, Empty, FormField, Panel, Pill } from "../../kit";
import { sectionHref } from "../../shell";

/**
 * "Lo que toca hoy": la lista de cuidado de socios y alumnos. Junta en un
 * sitio a quien se puede ir, los toques de bienvenida, las pausas que vuelven,
 * las pruebas por cerrar y los bonos que se acaban. Cada fila, una acción.
 */

type Group = { id: string; title: string; hint: string; icon: typeof Sprout; rows: React.ReactNode[] };

const PAY_METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer"];

export function CareList() {
  const { data, now, update, vertical, spaceId } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const [trial, setTrial] = React.useState<TrialFollowUp | null>(null);
  const sender = data.space.owner.firstName || data.space.name;
  const place = data.space.name;

  const risks = atRiskMembers(data, now).filter((r) => !wasContactedRecently(r, now));
  const touches = touchesDue(data, now);
  const returns = pausesReturning(data, now, 7);
  const trials = trialsToFollow(data, now);
  const bundles = bundlesExpiring(data, now);

  const wa = (m: Pick<ProMember, "phone">, text: string) => customerWhatsApp(m.phone, text);

  const contacted = (m: ProMember) => {
    void update("member.contacted", (d) => markContacted(d, m.id, now));
    toast.success("Apuntado", `${firstName(m.name)} queda como contactado hoy. Vuelve a salir si sigue sin venir.`);
  };

  const touched = (m: ProMember, week: number) => {
    void update("member.touch", (d) => markTouchDone(d, m.id, week));
  };

  const resume = (m: ProMember) => {
    void update("member.resume", (d) => resumeMember(d, m.id, now));
    toast.success("Vuelve a estar activo", `La cuota de ${firstName(m.name)} se cobra desde hoy.`);
  };

  const renew = (m: ProMember) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    if (!plan) return;
    const today = localDate(now);
    void update("member.renew", (d) => {
      const renewed = {
        ...d,
        members: d.members.map((x) => (x.id === m.id ? { ...x, status: "active" as const, sessionsLeft: plan.sessions ?? null } : x)),
      };
      const charged = recordCharge(renewed, { id: localId("ch"), member: m, concept: `Renovación ${plan.name}`, amountCents: memberPrice(m, plan), method: "card" }, now);
      return patchCare(charged, m.id, { bundleExpiresOn: addDays(today, BUNDLE_DAYS) });
    });
    toast.success("Bono renovado", `${firstName(m.name)} tiene ${plan.sessions} ${copy.sessionMany} hasta el ${dayLabel(`${addDays(today, BUNDLE_DAYS)}T12:00:00Z`, { weekday: false })}.`);
  };

  const groups: Group[] = [];

  if (risks.length) {
    groups.push({
      id: "risk",
      title: "Se te pueden ir",
      hint: "La mitad de las bajas llega en los primeros meses. Un mensaje a tiempo suele bastar.",
      icon: HeartHandshake,
      rows: risks.slice(0, 5).map((r) => {
        const link = wa(r.member, riskMessage(vertical.id, r.member, sender, place));
        return (
          <CareRow
            key={`risk-${r.member.id}`}
            name={r.member.name}
            tone={r.level === "high" ? "rose" : "amber"}
            line={r.reason}
            badge={r.level === "high" ? <Pill tone="danger">Urgente</Pill> : null}
            action={
              link ? (
                <Button size="sm" variant="secondary" asChild>
                  <a href={link} target="_blank" rel="noreferrer" onClick={() => contacted(r.member)}>
                    <MessageCircle className="h-3.5 w-3.5" /> Escribirle
                  </a>
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => contacted(r.member)}>
                  <Check className="h-3.5 w-3.5" /> Hablado
                </Button>
              )
            }
          />
        );
      }),
    });
  }

  if (trials.length) {
    groups.push({
      id: "trials",
      title: vertical.id === "academy" ? "¿Se matriculan?" : "¿Se quedan?",
      hint: "Pruebas de los últimos días sin respuesta. Cerrarlas hoy es cuando más se convierten.",
      icon: UserCheck,
      rows: trials.map((t) => (
        <CareRow
          key={`trial-${t.bookingId}`}
          name={t.clientName}
          verified={t.student}
          tone="violet"
          line={`${t.sessionName} ${dayLabel(t.endedAt, { weekday: true }).split(",")[0]} a las ${time(t.endedAt)}${t.came ? "" : ", no vino"}`}
          action={
            <Button size="sm" variant="dark" onClick={() => setTrial(t)}>
              {vertical.id === "academy" ? "¿Se matricula?" : "¿Se queda?"}
            </Button>
          }
        />
      )),
    });
  }

  if (touches.length) {
    groups.push({
      id: "touches",
      title: "Primeros 90 días",
      hint: `Cinco mensajes en sus tres primeros meses. Franky te dice cuándo toca cada uno.`,
      icon: Sprout,
      rows: touches.slice(0, 5).map((t) => {
        const link = wa(t.member, touchMessage(vertical.id, t.week, t.member, sender, place));
        return (
          <CareRow
            key={`touch-${t.member.id}-${t.week}`}
            name={t.member.name}
            tone="emerald"
            line={`${t.title}, semana ${t.week}`}
            action={
              <span className="flex items-center gap-1.5">
                {link ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={link} target="_blank" rel="noreferrer" onClick={() => touched(t.member, t.week)}>
                      <MessageCircle className="h-3.5 w-3.5" /> Escribir
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => touched(t.member, t.week)} aria-label={`Marcar el toque de ${t.member.name} como hecho`}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </span>
            }
          />
        );
      }),
    });
  }

  if (returns.length) {
    groups.push({
      id: "returns",
      title: "Vuelven de su pausa",
      hint: "Su cuota vuelve sola el día de vuelta. Un mensaje de bienvenida y a entrenar.",
      icon: CalendarClock,
      rows: returns.map((p) => {
        const due = p.daysLeft <= 0;
        const link = wa(
          p.member,
          `Hola ${firstName(p.member.name)}, soy ${sender} de ${place}. ¡${due ? "Hoy" : "La semana que viene"} vuelves! ¿Te reservo sitio en tu clase de siempre?`,
        );
        return (
          <CareRow
            key={`back-${p.member.id}`}
            name={p.member.name}
            tone="sky"
            line={`${p.reason ? `${PAUSE_REASONS[p.reason]}, ` : ""}${due ? "vuelve hoy" : `vuelve el ${dayLabel(`${p.returnsOn}T12:00:00Z`, { weekday: false })}`}`}
            action={
              <span className="flex items-center gap-1.5">
                {link ? (
                  <Button size="sm" variant="ghost" asChild aria-label={`Escribir a ${p.member.name}`}>
                    <a href={link} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                ) : null}
                <Button size="sm" variant={due ? "dark" : "secondary"} onClick={() => resume(p.member)}>
                  <Play className="h-3.5 w-3.5" /> Reactivar
                </Button>
              </span>
            }
          />
        );
      }),
    });
  }

  if (bundles.length) {
    groups.push({
      id: "bundles",
      title: "Bonos que se acaban",
      hint: "Renovar antes de que se agote evita que lo deje.",
      icon: RefreshCw,
      rows: bundles.slice(0, 4).map((b) => (
        <CareRow
          key={`bundle-${b.member.id}`}
          name={b.member.name}
          tone="amber"
          line={
            b.reason === "expired"
              ? "Bono caducado"
              : b.reason === "sessions"
                ? `Le ${b.sessionsLeft === 1 ? "queda 1 sesión" : `quedan ${b.sessionsLeft} sesiones`}`
                : `Caduca en ${b.daysLeft} ${b.daysLeft === 1 ? "día" : "días"}`
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => renew(b.member)}>
              Renovar {money(memberPrice(b.member, b.plan))}
            </Button>
          }
        />
      )),
    });
  }

  const total = groups.reduce((a, g) => a + g.rows.length, 0);

  return (
    <>
      <Panel
        title="Lo que toca hoy"
        description={total ? `${plural(total, "persona", "personas")} a las que cuidar hoy. Cada una, un toque.` : undefined}
        action={
          <Link href={sectionHref(spaceId, "socios")} className="inline-flex items-center gap-1 text-sm font-semibold text-violet">
            {copy.Members} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
        flush
      >
        {groups.length ? (
          <div className="divide-y divide-border-light">
            {groups.map((g) => (
              <section key={g.id} aria-label={g.title}>
                <header className="flex items-start gap-2 px-4 pb-1 pt-3 sm:px-5">
                  <g.icon className="mt-0.5 h-4 w-4 shrink-0 text-violet" strokeWidth={1.8} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {g.title} <span className="font-normal text-text-muted tabular">{g.rows.length}</span>
                    </p>
                    <p className="text-xs text-text-muted">{g.hint}</p>
                  </div>
                </header>
                <ul>{g.rows}</ul>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            icon={HeartHandshake}
            title="Todo en orden"
            body={`Nadie en riesgo, ninguna prueba sin cerrar y ningún bono a punto de acabarse. Cuando un ${copy.member} deje de venir, aparecerá aquí.`}
          />
        )}
      </Panel>
      <TrialDrawer trial={trial} onClose={() => setTrial(null)} />
    </>
  );
}

function CareRow({
  name,
  line,
  action,
  tone,
  badge,
  verified,
}: {
  name: string;
  line: string;
  action: React.ReactNode;
  tone: "rose" | "amber" | "violet" | "emerald" | "sky";
  badge?: React.ReactNode;
  verified?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <Avatar name={name} size="sm" tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="truncate">{name}</span>
          {verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-label="Estudiante verificado" /> : null}
          {badge}
        </span>
        <span className="block truncate text-xs text-text-muted">{line}</span>
      </span>
      <span className="shrink-0">{action}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* ¿Se queda? Alta desde una clase de prueba                           */
/* ------------------------------------------------------------------ */

const DECLINE_REASONS = ["Precio", "Horario", "Le pilla lejos", "Lo decide más adelante", "No le ha gustado"];

export function TrialDrawer({ trial, onClose }: { trial: TrialFollowUp | null; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const toast = useToast();
  const copy = classCopy(vertical.id);
  const [planId, setPlanId] = React.useState("");
  const [student, setStudent] = React.useState(true);
  const [method, setMethod] = React.useState<ProChargeMethod>("card");
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState(DECLINE_REASONS[0]);

  React.useEffect(() => {
    if (!trial) return;
    // El plan más habitual para empezar: el mensual del estudiante si lo hay.
    const monthly = data.plans.filter((p) => p.period === "month");
    const pick = (trial.student ? monthly.find((p) => p.studentPriceCents) : undefined) ?? monthly[0] ?? data.plans[0];
    setPlanId(pick?.id ?? "");
    setStudent(trial.student);
    setMethod("card");
    setDeclining(false);
    setReason(DECLINE_REASONS[0]);
    // Solo al abrir otra prueba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial?.bookingId]);

  if (!trial) return <Drawer open={false} onOpenChange={onClose} title="">{null}</Drawer>;

  const plan = data.plans.find((p) => p.id === planId);
  const price = plan ? (student && plan.studentPriceCents ? plan.studentPriceCents : plan.priceCents) : 0;
  // Quien viene de una prueba nunca ha pagado matrícula: sale con el alta.
  const enrollment = plan ? enrollmentFee(data, plan.id) : 0;
  const coach = data.staff.find((s) => s.id === trial.coachId);
  const who = firstName(trial.clientName);

  const join = () => {
    if (!plan) return;
    const memberId = localId("m");
    void update("trial.convert", (d) => {
      const joined = convertTrial(d, trial, { memberId, chargeId: localId("ch"), planId: plan.id, student, method }, now);
      const member = joined.members.find((m) => m.id === memberId);
      return member ? chargeEnrollment(joined, member, plan.id, method, now, localId("ch")) : joined;
    });
    toast.success(vertical.id === "academy" ? "Matrícula hecha" : "Alta hecha", `${who} ya es ${copy.member} con ${plan.name}. ${money(price + enrollment)} cobrados con recibo.`);
    onClose();
  };

  const decline = () => {
    void update("trial.decline", (d) => declineTrial(d, trial, reason, now));
    toast.success("Anotado", `${who} no sigue por ahora (${reason.toLowerCase()}). Aparecerá en recuperar bajas cuando empiece temporada.`);
    onClose();
  };

  return (
    <Drawer
      open
      onOpenChange={(v) => !v && onClose()}
      title={vertical.id === "academy" ? `¿Se matricula ${who}?` : `¿Se queda ${who}?`}
      description={`${trial.sessionName} con ${coach?.name.split(" ")[0] ?? "tu equipo"}, ${dayLabel(trial.endedAt, { weekday: false })}.`}
      footer={
        declining ? (
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)}>Volver</Button>
            <Button variant="dark" onClick={decline}>Guardar</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setDeclining(true)}>No sigue</Button>
            <Button variant="dark" onClick={join} disabled={!plan}>
              {vertical.id === "academy" ? "Matricular" : "Dar de alta"} y cobrar {money(price + enrollment)}
            </Button>
          </>
        )
      }
    >
      {declining ? (
        <FormField label="¿Por qué no sigue?" hint="Sirve para ver qué frena a la gente y ajustar precios u horarios.">
          <ChoiceChips value={reason} onChange={setReason} options={DECLINE_REASONS.map((r) => ({ value: r, label: r }))} />
        </FormField>
      ) : (
        <div className="flex flex-col gap-5">
          <FormField label="Plan">
            <ChoiceChips
              value={planId}
              onChange={setPlanId}
              options={data.plans.map((p) => ({
                value: p.id,
                label: p.name,
                hint: `${money(student && p.studentPriceCents ? p.studentPriceCents : p.priceCents)} ${PERIOD_LABEL[p.period]}`,
              }))}
            />
          </FormField>
          <label className="flex min-h-10 items-center gap-2.5 text-sm">
            <input type="checkbox" checked={student} onChange={(e) => setStudent(e.target.checked)} className="h-4 w-4 accent-[var(--color-violet)]" />
            Precio de estudiante (carné verificado en Franky)
          </label>
          <FormField label="Cómo paga">
            <ChoiceChips value={method} onChange={setMethod} options={PAY_METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
          </FormField>
          <div className={cn("rounded-2xl bg-bg-secondary p-4 text-sm text-text-secondary")}>
            {trial.came ? `${who} vino a su prueba.` : `${who} reservó pero no vino: quizá prefiera otra hora.`} Al dar el alta sale su recibo y empieza su recorrido de bienvenida de 90 días.
          </div>
        </div>
      )}
    </Drawer>
  );
}
