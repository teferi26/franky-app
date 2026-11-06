import React from "react";
import { Linking, View } from "react-native";
import {
  ArrowRight,
  CalendarClock,
  Check,
  HeartHandshake,
  MessageCircle,
  Play,
  RefreshCw,
  Sprout,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { C, S } from "@/theme";
import { toast } from "@/lib/toast";
import type { ProMember, ToneKey } from "../../../../../shared/pro/types";
import type { ProChargeMethod } from "../../../../../shared/pro/classes-types";
import { addDays, dayLabel, localDate, money, plural, relative, time } from "../../../../../shared/pro/format";
import { PERIOD_LABEL, classCopy, memberPrice } from "../../../../../shared/pro/classes";
import {
  BUNDLE_DAYS,
  CHARGE_METHOD_LABEL,
  PAUSE_REASONS,
  atRiskMembers,
  bundlesExpiring,
  chargeMessage,
  chargeSummary,
  convertTrial,
  declineTrial,
  extrasOf,
  firstName,
  isLate,
  markChargeReminded,
  markContacted,
  markTouchDone,
  monthOf,
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
} from "../../../../../shared/pro/classes-care";
import { chargeEnrollment, enrollmentFee } from "../../../../../shared/pro/classes-study";
import { customerWhatsApp } from "../../../../../shared/pro/customer-contact";
import { localId, usePro } from "../../store";
import { useGoSection } from "../../shell";
import { ChoiceGrid, Empty, Field, ListRow, PAvatar, PButton, Panel, Pill, PText, Sheet, Toggle } from "../../kit";
import { LinkText } from "./ui";

/**
 * "Lo que toca hoy" en el móvil del coach: quién se puede ir, las pruebas por
 * cerrar, los toques de los primeros 90 días, las pausas que vuelven, los
 * bonos que se acaban y las cuotas sin cobrar. Mismos textos y la misma
 * lógica que la web (`web/.../classes/care.tsx`), pensado para un toque.
 */

const PAY_METHODS: ProChargeMethod[] = ["card", "bizum", "cash", "transfer"];
const DECLINE_REASONS = ["Precio", "Horario", "Le pilla lejos", "Lo decide más adelante", "No le ha gustado"];

/** Abre WhatsApp con el mensaje escrito y, si se abre, apunta la acción. */
export function openWhatsApp(link: string | undefined, onSent?: () => void) {
  if (!link) return;
  void Linking.openURL(link).then(() => onSent?.(), () => toast("No se pudo abrir WhatsApp", { kind: "error" }));
}

type Row = {
  key: string;
  name: string;
  tone: ToneKey;
  line: string;
  badge?: React.ReactNode;
  action: React.ReactNode;
};
type Group = { id: string; title: string; hint: string; icon: LucideIcon; rows: Row[] };

export function CareList() {
  const { data, now, update, vertical } = usePro();
  const go = useGoSection();
  const copy = classCopy(vertical.id);
  const [trial, setTrial] = React.useState<TrialFollowUp | null>(null);
  const sender = data.space.owner.firstName || data.space.name;
  const place = data.space.name;

  const risks = atRiskMembers(data, now).filter((r) => !wasContactedRecently(r, now));
  const touches = touchesDue(data, now);
  const returns = pausesReturning(data, now, 7);
  const trials = trialsToFollow(data, now);
  const bundles = bundlesExpiring(data, now);

  const contacted = (m: ProMember) => {
    void update("member.contacted", (d) => markContacted(d, m.id, now));
    toast("Apuntado", { kind: "success", body: `${firstName(m.name)} queda como contactado hoy.` });
  };
  const resume = (m: ProMember) => {
    void update("member.resume", (d) => resumeMember(d, m.id, now));
    toast("Vuelve a estar activo", { kind: "success", body: `La cuota de ${firstName(m.name)} se cobra desde hoy.` });
  };
  const renew = (m: ProMember) => {
    const plan = data.plans.find((p) => p.id === m.planId);
    if (!plan) return;
    const today = localDate(now);
    void update("member.renew", (d) => {
      const renewed = {
        ...d,
        members: d.members.map((x) =>
          x.id === m.id ? { ...x, status: "active" as const, sessionsLeft: plan.sessions ?? null } : x,
        ),
      };
      const charged = recordCharge(
        renewed,
        { id: localId("ch"), member: m, concept: `Renovación ${plan.name}`, amountCents: memberPrice(m, plan), method: "card" },
        now,
      );
      return patchCare(charged, m.id, { bundleExpiresOn: addDays(today, BUNDLE_DAYS) });
    });
    toast("Bono renovado", { kind: "success", body: `${firstName(m.name)} tiene ${plan.sessions} ${copy.sessionMany}.` });
  };

  const groups: Group[] = [];
  if (risks.length) {
    groups.push({
      id: "risk",
      title: "Se te pueden ir",
      hint: "La mitad de las bajas llega en los primeros meses. Un mensaje a tiempo suele bastar.",
      icon: HeartHandshake,
      rows: risks.slice(0, 5).map((r) => {
        const link = customerWhatsApp(r.member.phone, riskMessage(vertical.id, r.member, sender, place));
        return {
          key: `risk-${r.member.id}`,
          name: r.member.name,
          tone: r.level === "high" ? "rose" : "amber",
          line: r.reason,
          badge: r.level === "high" ? <Pill label="Urgente" tone="danger" /> : null,
          action: link ? (
            <PButton small variant="secondary" icon={MessageCircle} label="Escribirle" onPress={() => openWhatsApp(link, () => contacted(r.member))} />
          ) : (
            <PButton small variant="secondary" icon={Check} label="Hablado" onPress={() => contacted(r.member)} />
          ),
        };
      }),
    });
  }
  if (trials.length) {
    groups.push({
      id: "trials",
      title: vertical.id === "academy" ? "¿Se matriculan?" : "¿Se quedan?",
      hint: "Pruebas de los últimos días sin respuesta. Cerrarlas hoy es cuando más se convierten.",
      icon: UserCheck,
      rows: trials.map((t) => ({
        key: `trial-${t.bookingId}`,
        name: t.clientName,
        tone: "violet",
        line: `${t.sessionName} ${dayLabel(t.endedAt, { weekday: true }).split(",")[0]} a las ${time(t.endedAt)}${t.came ? "" : ", no vino"}`,
        action: (
          <PButton small label={vertical.id === "academy" ? "¿Se matricula?" : "¿Se queda?"} onPress={() => setTrial(t)} />
        ),
      })),
    });
  }
  if (touches.length) {
    groups.push({
      id: "touches",
      title: "Primeros 90 días",
      hint: "Cinco mensajes en sus tres primeros meses. Franky te dice cuándo toca cada uno.",
      icon: Sprout,
      rows: touches.slice(0, 5).map((t) => {
        const link = customerWhatsApp(t.member.phone, touchMessage(vertical.id, t.week, t.member, sender, place));
        const done = () => void update("member.touch", (d) => markTouchDone(d, t.member.id, t.week));
        return {
          key: `touch-${t.member.id}-${t.week}`,
          name: t.member.name,
          tone: "emerald",
          line: `${t.title}, semana ${t.week}`,
          action: link ? (
            <PButton small variant="secondary" icon={MessageCircle} label="Escribir" onPress={() => openWhatsApp(link, done)} />
          ) : (
            <PButton small variant="ghost" icon={Check} label="Hecho" onPress={done} />
          ),
        };
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
        return {
          key: `back-${p.member.id}`,
          name: p.member.name,
          tone: "sky",
          line: `${p.reason ? `${PAUSE_REASONS[p.reason]}, ` : ""}${due ? "vuelve hoy" : `vuelve el ${dayLabel(`${p.returnsOn}T12:00:00Z`, { weekday: false })}`}`,
          action: (
            <PButton small variant={due ? "dark" : "secondary"} icon={Play} label="Reactivar" onPress={() => resume(p.member)} />
          ),
        };
      }),
    });
  }
  if (bundles.length) {
    groups.push({
      id: "bundles",
      title: "Bonos que se acaban",
      hint: "Renovar antes de que se agote evita que lo deje.",
      icon: RefreshCw,
      rows: bundles.slice(0, 4).map((b) => ({
        key: `bundle-${b.member.id}`,
        name: b.member.name,
        tone: "amber",
        line:
          b.reason === "expired"
            ? "Bono caducado"
            : b.reason === "sessions"
              ? `Le ${b.sessionsLeft === 1 ? "queda 1 sesión" : `quedan ${b.sessionsLeft} sesiones`}`
              : `Caduca en ${b.daysLeft} ${b.daysLeft === 1 ? "día" : "días"}`,
        action: (
          <PButton small variant="secondary" label={`Renovar ${money(memberPrice(b.member, b.plan))}`} onPress={() => renew(b.member)} />
        ),
      })),
    });
  }

  const total = groups.reduce((a, g) => a + g.rows.length, 0);
  return (
    <>
      <Panel
        title="Lo que toca hoy"
        description={total ? `${plural(total, "persona", "personas")} a las que cuidar hoy. Cada una, un toque.` : undefined}
        action={<LinkText label={copy.Members} icon={ArrowRight} onPress={() => go("socios")} />}
        flush
      >
        {groups.length ? (
          groups.map((g) => (
            <View key={g.id} accessibilityLabel={g.title} style={{ borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
              <View style={{ flexDirection: "row", gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md }}>
                <g.icon size={16} color={C.blue} strokeWidth={1.8} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <PText v="h3">{`${g.title} · ${g.rows.length}`}</PText>
                  <PText v="tiny">{g.hint}</PText>
                </View>
              </View>
              {g.rows.map((r, i) => (
                <ListRow key={r.key} last={i === g.rows.length - 1}>
                  <PAvatar name={r.name} size={32} toneKey={r.tone} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{r.name}</PText>
                      {r.badge}
                    </View>
                    <PText v="tiny" numberOfLines={1}>{r.line}</PText>
                  </View>
                  {r.action}
                </ListRow>
              ))}
            </View>
          ))
        ) : (
          <Empty
            icon={HeartHandshake}
            title="Todo en orden"
            body={`Nadie en riesgo, ninguna prueba sin cerrar y ningún bono a punto de acabarse. Cuando un ${copy.member} deje de venir, aparecerá aquí.`}
          />
        )}
      </Panel>
      <TrialSheet trial={trial} onClose={() => setTrial(null)} />
    </>
  );
}

/** ¿Se queda? Alta desde una clase de prueba, con su matrícula si la hay. */
function TrialSheet({ trial, onClose }: { trial: TrialFollowUp | null; onClose: () => void }) {
  const { data, now, update, vertical } = usePro();
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

  if (!trial) return null;
  const plan = data.plans.find((p) => p.id === planId);
  const price = plan ? (student && plan.studentPriceCents ? plan.studentPriceCents : plan.priceCents) : 0;
  const enrollment = plan ? enrollmentFee(data, plan.id) : 0;
  const who = firstName(trial.clientName);

  const join = () => {
    if (!plan) return;
    const memberId = localId("m");
    void update("trial.convert", (d) => {
      const joined = convertTrial(d, trial, { memberId, chargeId: localId("ch"), planId: plan.id, student, method }, now);
      const member = joined.members.find((m) => m.id === memberId);
      return member ? chargeEnrollment(joined, member, plan.id, method, now, localId("ch")) : joined;
    });
    toast(vertical.id === "academy" ? "Matrícula hecha" : "Alta hecha", {
      kind: "success",
      body: `${who} ya es ${copy.member} con ${plan.name}. ${money(price + enrollment)} cobrados con recibo.`,
    });
    onClose();
  };
  const decline = () => {
    void update("trial.decline", (d) => declineTrial(d, trial, reason, now));
    toast("Anotado", { kind: "success", body: `${who} no sigue por ahora (${reason.toLowerCase()}).` });
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={vertical.id === "academy" ? `¿Se matricula ${who}?` : `¿Se queda ${who}?`}
      description={`${trial.sessionName}, ${dayLabel(trial.endedAt, { weekday: false })}.`}
      footer={
        declining ? (
          <>
            <PButton variant="ghost" label="Volver" onPress={() => setDeclining(false)} />
            <PButton label="Guardar" onPress={decline} />
          </>
        ) : (
          <>
            <PButton variant="ghost" label="No sigue" onPress={() => setDeclining(true)} />
            <PButton
              label={`${vertical.id === "academy" ? "Matricular" : "Dar de alta"} y cobrar ${money(price + enrollment)}`}
              disabled={!plan}
              onPress={join}
            />
          </>
        )
      }
    >
      {declining ? (
        <Field label="¿Por qué no sigue?" hint="Sirve para ver qué frena a la gente y ajustar precios u horarios.">
          <ChoiceGrid value={reason} onChange={setReason} options={DECLINE_REASONS.map((r) => ({ value: r, label: r }))} />
        </Field>
      ) : (
        <>
          <Field label="Plan">
            <ChoiceGrid
              value={planId}
              onChange={setPlanId}
              options={data.plans.map((p) => ({
                value: p.id,
                label: p.name,
                hint: `${money(student && p.studentPriceCents ? p.studentPriceCents : p.priceCents)} ${PERIOD_LABEL[p.period]}`,
              }))}
            />
          </Field>
          <Toggle label="Precio de estudiante" detail="Carné verificado en Franky" value={student} onChange={setStudent} />
          <Field label="Cómo paga">
            <ChoiceGrid value={method} onChange={setMethod} options={PAY_METHODS.map((m) => ({ value: m, label: CHARGE_METHOD_LABEL[m] }))} />
          </Field>
          <PText v="small">
            {trial.came ? `${who} vino a su prueba.` : `${who} reservó pero no vino: quizá prefiera otra hora.`} Al dar el alta
            sale su recibo y empieza su recorrido de bienvenida de 90 días.
          </PText>
        </>
      )}
    </Sheet>
  );
}

/**
 * Cuotas sin cobrar del mes: recibos devueltos y cuotas vencidas, con el
 * aviso amable ya escrito. Sale de los cobros del motor, como en la web.
 */
export function OwedCharges() {
  const { data, now, update, vertical } = usePro();
  const go = useGoSection();
  const copy = classCopy(vertical.id);
  const today = localDate(now);
  const summary = chargeSummary(data, monthOf(today), now);
  const owed = extrasOf(data)
    .charges.filter((c) => c.period === monthOf(today) && (c.status === "returned" || isLate(c, today)))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const owedCents = summary.returnedCents + summary.lateCents;
  const sender = data.space.owner.firstName || data.space.name;
  return (
    <Panel
      title="Cuotas sin cobrar"
      description={owed.length ? `${money(owedCents, { round: true })} entre recibos devueltos y cuotas vencidas. Un aviso amable suele bastar.` : undefined}
      action={<LinkText label={copy.Members} icon={ArrowRight} onPress={() => go("socios")} />}
      flush
    >
      {owed.length ? (
        owed.slice(0, 4).map((c, i, list) => {
          const member = data.members.find((m) => m.id === c.memberId);
          const link = customerWhatsApp(member?.phone, chargeMessage(c, sender, data.space.name, today, money(c.amountCents)));
          return (
            <ListRow key={c.id} last={i === list.length - 1}>
              <PAvatar name={c.memberName} size={32} toneKey="rose" />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{c.memberName}</PText>
                <PText v="tiny" numberOfLines={1}>
                  {`${money(c.amountCents)} · ${c.status === "returned" ? "recibo devuelto" : `vencía ${relative(`${c.dueOn}T09:00:00Z`, now.getTime())}`}${c.remindedAt ? " · avisado" : ""}`}
                </PText>
              </View>
              {link ? (
                <PButton
                  small
                  variant="secondary"
                  label="Avisar"
                  accessibilityLabel={`Avisar a ${c.memberName} por WhatsApp`}
                  onPress={() => openWhatsApp(link, () => void update("charge.remind", (d) => markChargeReminded(d, c.id, now)))}
                />
              ) : null}
            </ListRow>
          );
        })
      ) : (
        <Empty icon={Wallet} title="Todo cobrado" body={`Ningún ${copy.member} tiene la cuota vencida.`} />
      )}
    </Panel>
  );
}
