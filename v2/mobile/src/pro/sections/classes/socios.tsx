import React from "react";
import { Alert, Linking, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { BadgeCheck, MessageCircle, Pause, Play, Plus, Sparkles, UserMinus, Users, Wallet, type LucideIcon } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProMember, ProMembershipPlan, ProPayment } from "../../../../../shared/pro/types";
import { addDays, atLocal, dayLabel, localDate, money, plural, relative } from "../../../../../shared/pro/format";
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
} from "../../../../../shared/pro/classes";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import {
  ChoiceGrid,
  Detail,
  Empty,
  Field,
  Input,
  Kpi,
  KpiRow,
  ListRow,
  Meter,
  PAvatar,
  PButton,
  PageHeader,
  Panel,
  Pill,
  PText,
  SearchInput,
  Segmented,
  Sheet,
  Tip,
  Toggle,
} from "../../kit";
import { capitalize, isFromFranky } from "./parts";
import { RealBundles } from "./real-bundles";
import { FilterChip, MoreButton } from "./ui";

type StatusFilter = "all" | ProMember["status"];

const PAGE = 40;

/**
 * Socios y cuotas. La usan las clases y también las pistas (salas de estudio
 * y coworking): con vertical.engine === "courts" cambian las palabras a días,
 * pases y bonos, igual que en la web.
 */
export default function SociosSection() {
  const { demo } = usePro();
  return demo ? <DemoSociosSection /> : <RealBundles />;
}

function DemoSociosSection() {
  const { data, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const study = vertical.engine === "courts";
  const label = vertical.nav.find((n) => n.id === "socios")?.label ?? copy.Members;
  const [tab, setTab] = React.useState<"members" | "plans">("members");
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [onlyStudents, setOnlyStudents] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE);

  React.useEffect(() => setLimit(PAGE), [filter, onlyStudents, query]);

  const today = localDate(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const active = data.members.filter((m) => m.status === "active" || m.status === "overdue");
  const overdue = data.members.filter((m) => m.status === "overdue");
  const leavers = data.members.filter((m) => m.status === "cancelled" && (m.changedAt ?? m.since) >= atLocal(monthStart, 0));
  const mrr = recurringCents(data);
  const students = active.filter((m) => m.student?.verified).length;

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
    .filter((m) => !q || m.name.toLowerCase().includes(q) || (m.studies ?? "").toLowerCase().includes(q))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, "es"));
  const shown = list.slice(0, limit);

  return (
    <ProPage>
      <PageHeader
        eyebrow={label}
        title={study ? "Socios, pases y bonos" : vertical.id === "academy" ? "Alumnos y cuotas" : "Socios y cuotas"}
        description={
          data.members.length
            ? `${active.length} ${copy.members} activos (${students} estudiantes verificados), ${money(mrr, { round: true })} al mes${overdue.length ? ` y ${plural(overdue.length, "cuota", "cuotas")} por cobrar` : ""}.`
            : `Da de alta a tus ${copy.members} y sus cuotas: Franky avisa antes de cada cobro y te dice quién se queda sin sesiones.`
        }
        actions={
          <>
            <PButton label="Nuevo plan" icon={Plus} variant="outline" onPress={() => setPlanOpen("new")} />
            <PButton label={`Nuevo ${copy.member}`} icon={Plus} onPress={() => setCreating(true)} />
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
          onPress={
            overdue.length
              ? () => {
                  setTab("members");
                  setFilter("overdue");
                }
              : undefined
          }
        />
        <Kpi
          icon={UserMinus}
          label="Bajas del mes"
          value={leavers.length}
          hint={leavers.length ? `${pct1(leavers.length, active.length + leavers.length)} % de la base` : "nadie se ha ido"}
        />
      </KpiRow>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "members", label: copy.Members, count: counts.all },
          { value: "plans", label: study ? "Pases y bonos" : "Planes y bonos", count: data.plans.length },
        ]}
      />

      {tab === "members" ? (
        <>
          <Segmented
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
          <View style={{ marginBottom: S.md }}>
            <FilterChip active={onlyStudents} onPress={() => setOnlyStudents((v) => !v)} label="Estudiantes" icon={BadgeCheck} />
          </View>
          <SearchInput value={query} onChange={setQuery} placeholder={study || vertical.id === "academy" ? "Nombre o carrera" : "Buscar por nombre"} />

          <Panel flush>
            {list.length ? (
              <>
                {shown.map((m, i) => (
                  <MemberRow key={m.id} member={m} last={i === shown.length - 1 && limit >= list.length} onOpen={() => setOpen(m.id)} />
                ))}
                <MoreButton shown={limit} total={list.length} onPress={() => setLimit((n) => n + PAGE)} />
              </>
            ) : (
              <Empty
                icon={Users}
                title={data.members.length ? "Nadie con este filtro" : `Todavía no tienes ${copy.members}`}
                body={
                  data.members.length
                    ? "Prueba con otro estado o borra la búsqueda."
                    : `Da de alta a tu primer ${copy.member}: nombre, plan y si es estudiante. Tarda un minuto.`
                }
                action={data.members.length ? undefined : <PButton label={`Nuevo ${copy.member}`} icon={Plus} onPress={() => setCreating(true)} />}
              />
            )}
          </Panel>

          <Tip title="Retención">
            {study
              ? "Quien compra el bono exámenes en enero vuelve en junio si le escribes una semana antes. Filtra por estudiantes y mándales el aviso desde su ficha."
              : `Un ${copy.member} con menos de 4 ${copy.sessionMany} en el último mes está pensando en irse. Escríbele antes del próximo cobro: suele bastar con preguntar cómo va.`}
          </Tip>
        </>
      ) : (
        <PlansGrid onOpen={setPlanOpen} />
      )}

      <MemberDrawer memberId={open} onClose={() => setOpen(null)} />
      <NewMemberDrawer open={creating} onClose={() => setCreating(false)} />
      <PlanDrawer planId={planOpen} onClose={() => setPlanOpen(null)} />
    </ProPage>
  );
}

function pct1(a: number, b: number) {
  return b ? Math.round((a / b) * 100) : 0;
}

function statusRank(s: ProMember["status"]) {
  return { overdue: 0, trial: 1, active: 2, paused: 3, cancelled: 4 }[s];
}

/* ------------------------------------------------------------------ */

function MemberRow({ member: m, last, onOpen }: { member: ProMember; last: boolean; onOpen: () => void }) {
  const { data, now, vertical } = usePro();
  const study = vertical.engine === "courts";
  const plan = data.plans.find((p) => p.id === m.planId);
  const status = MEMBER_STATUS[m.status];
  const lowSessions = m.sessionsLeft !== null && m.sessionsLeft <= 2 && m.status !== "cancelled";
  const sub = m.student ? `${shortUni(m.student.university)}${m.studies ? `, ${m.studies}` : ""}` : m.studies ?? `Desde ${relative(m.since, now.getTime())}`;

  return (
    <ListRow onPress={onOpen} last={last} accessibilityLabel={`${m.name}, ${plan?.name ?? "Sin plan"}, ${status.label}`}>
      <PAvatar name={m.name} size={36} toneKey={m.status === "overdue" ? "rose" : m.status === "trial" ? "violet" : "slate"} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</PText>
          {m.student?.verified ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Estudiante verificado" /> : null}
          {isFromFranky(m.source) ? <Sparkles size={12} color={C.blue} accessibilityLabel="Vino por Franky" /> : null}
        </View>
        <PText v="tiny" numberOfLines={1}>{`${sub} · ${plan?.name ?? "Sin plan"}`}</PText>
        {m.sessionsLeft !== null ? (
          <PText v="tiny" color={lowSessions ? C.warning : C.muted} style={lowSessions ? { fontFamily: FONT.semibold } : undefined}>
            {`${m.sessionsLeft} ${study ? "días" : "restantes"}`}
          </PText>
        ) : null}
      </View>
      <Pill label={status.label} tone={status.tone} />
    </ListRow>
  );
}

/* ------------------------------------------------------------------ */
/* Ficha de socio                                                      */
/* ------------------------------------------------------------------ */

function MemberDrawer({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const study = vertical.engine === "courts";
  const member = data.members.find((m) => m.id === memberId) ?? null;
  const [planId, setPlanId] = React.useState("");

  React.useEffect(() => {
    setPlanId(member?.planId ?? "");
    // Solo al abrir otra ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  if (!member) return null;

  const plan = data.plans.find((p) => p.id === member.planId);
  const price = memberPrice(member, plan);
  const status = MEMBER_STATUS[member.status];
  const payments = data.payments
    .filter((p) => p.clientName === member.name)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const visits = data.bookings
    .filter((b) => b.clientId === member.id && (b.status === "arrived" || b.status === "done"))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 4);
  const target = plan?.sessions && plan.period !== "pack" ? plan.sessions : study ? 20 : 12;
  const first = member.name.split(" ")[0];

  const patch = (label: string, changes: Partial<ProMember>, payment?: ProPayment) =>
    void update(label, (d) => ({
      ...d,
      members: d.members.map((m) => (m.id === member.id ? { ...m, ...changes } : m)),
      payments: payment ? [...d.payments, payment] : d.payments,
    }));

  const pay = (p: ProMembershipPlan | undefined, concept: string): ProPayment => ({
    id: localId("p"),
    at: new Date().toISOString(),
    clientName: member.name,
    concept,
    amountCents: memberPrice(member, p),
    tipCents: 0,
    method: "card",
  });

  const charge = () => {
    const base = member.nextChargeAt ?? now.toISOString();
    patch("member.charge", { status: "active", nextChargeAt: addMonths(base, 1) }, pay(plan, `Cuota ${plan?.name ?? ""}`));
    toast("Cobrada", { kind: "success", body: `${money(price)} de ${first}. Próximo cobro el ${dayLabel(addMonths(base, 1), { weekday: false })}.` });
  };

  const renew = () => {
    patch("member.renew", { status: "active", sessionsLeft: plan?.sessions ?? null, since: member.since }, pay(plan, `Renovación ${plan?.name ?? ""}`));
    toast("Bono renovado", { kind: "success", body: `${first} vuelve a tener ${plan?.sessions ?? 0} ${study ? "días" : copy.sessionMany}.` });
  };

  const activate = () => {
    patch(
      "member.activate",
      { status: "active", nextChargeAt: plan?.period === "pack" ? null : addMonths(now.toISOString(), 1), changedAt: undefined },
      member.status === "trial" ? pay(plan, `Alta ${plan?.name ?? ""}`) : undefined,
    );
    toast(member.status === "trial" ? "Alta hecha" : "Reactivado", { kind: "success", body: `${first} ya es ${copy.member} con ${plan?.name}.` });
  };

  const pause = () => {
    patch("member.pause", { status: "paused", nextChargeAt: null, changedAt: now.toISOString() });
    toast("Cuota pausada", { kind: "success", body: `No se cobra a ${first} hasta que la reactives.` });
  };

  const leave = () => {
    patch("member.cancel", { status: "cancelled", nextChargeAt: null, changedAt: now.toISOString() });
    toast("Baja registrada", { kind: "success", body: `${first} deja de pagar. Su historial se guarda por si vuelve.` });
    onClose();
  };

  const confirmLeave = () =>
    Alert.alert("Dar de baja", `${first} deja de pagar desde hoy. Su historial y su contacto se quedan por si vuelve.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, dar de baja", style: "destructive", onPress: leave },
    ]);

  const savePlan = () => {
    const next = data.plans.find((p) => p.id === planId);
    if (!next) return;
    patch("member.plan", {
      planId,
      sessionsLeft: next.sessions ?? null,
      nextChargeAt: next.period === "pack" ? null : member.nextChargeAt ?? addMonths(now.toISOString(), 1),
    });
    toast("Plan cambiado", { kind: "success", body: `${first} pasa a ${next.name}: ${money(memberPrice(member, next))} ${PERIOD_LABEL[next.period]}.` });
  };

  const whatsapp = member.phone
    ? `https://wa.me/34${member.phone.replace(/\s/g, "")}?text=${encodeURIComponent(
        member.status === "overdue"
          ? `Hola ${first}, soy ${data.space.owner.firstName} de ${data.space.name}. Nos ha llegado devuelta la cuota de este mes, ¿te paso un enlace para pagarla?`
          : `Hola ${first}, te escribimos de ${data.space.name}.`,
      )}`
    : null;

  const primary = (() => {
    if (member.status === "overdue") return <PButton label={`Cobrar ${money(price)}`} onPress={charge} />;
    if (member.status === "trial") return <PButton label="Dar de alta" onPress={activate} />;
    if (member.status === "paused" || member.status === "cancelled") return <PButton label="Reactivar" icon={Play} onPress={activate} />;
    if (plan?.period === "pack" && (member.sessionsLeft ?? 0) <= 2) return <PButton label="Renovar bono" onPress={renew} />;
    return null;
  })();

  const low = member.attendanceLast30 < target / 3;

  return (
    <Sheet
      open
      onClose={onClose}
      title={member.name}
      description={`${capitalize(copy.member)} desde ${dayLabel(member.since, { weekday: false })}`}
      footer={
        whatsapp || primary ? (
          <>
            {whatsapp ? <PButton label="WhatsApp" icon={MessageCircle} variant="outline" onPress={() => void Linking.openURL(whatsapp)} /> : null}
            {primary}
          </>
        ) : undefined
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
        <PAvatar name={member.name} size={52} toneKey={member.status === "overdue" ? "rose" : "violet"} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <Pill label={status.label} tone={status.tone} />
            {member.student ? (
              <Pill
                label={shortUni(member.student.university)}
                tone={member.student.verified ? "violet" : "neutral"}
                icon={member.student.verified ? BadgeCheck : undefined}
              />
            ) : null}
            {isFromFranky(member.source) ? <Pill label="Vino por Franky" tone="success" /> : null}
          </View>
          {member.studies ? <PText v="small">{member.studies}</PText> : null}
        </View>
      </View>

      {member.status === "overdue" ? (
        <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: `${C.error}40`, backgroundColor: `${C.error}14`, padding: S.md, gap: 2 }}>
          <PText v="h3" color={C.errorText}>Cuota pendiente</PText>
          <Text style={{ fontFamily: FONT.display, fontSize: 24, color: C.errorText }} maxFontSizeMultiplier={1.2}>{money(price)}</Text>
          <PText v="tiny" color={C.errorText}>
            {`Vencía ${member.nextChargeAt ? relative(member.nextChargeAt, now.getTime()) : "este mes"}. Mándale el enlace por WhatsApp o cóbrala aquí si paga en mano.`}
          </PText>
        </View>
      ) : null}

      <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.md }}>
        <Detail label="Plan" value={plan?.name ?? "Sin plan"} />
        <Detail
          label="Precio"
          value={
            <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
              <PText v="h3">{`${money(price)} ${plan ? PERIOD_LABEL[plan.period] : ""}`}</PText>
              {member.student?.verified && plan?.studentPriceCents && plan.studentPriceCents !== plan.priceCents ? <PText v="tiny">precio estudiante</PText> : null}
            </View>
          }
        />
        <Detail
          label="Próximo cobro"
          value={
            member.nextChargeAt && member.status !== "overdue"
              ? dayLabel(member.nextChargeAt, { weekday: false })
              : member.status === "overdue"
                ? "Vencido"
                : "Sin cobro programado"
          }
        />
        <Detail
          label={study ? "Días que le quedan" : `${capitalize(copy.sessionMany)} que le quedan`}
          value={member.sessionsLeft === null ? "Ilimitado" : member.sessionsLeft}
          last
        />
      </View>

      <View style={{ gap: S.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
          <PText v="h3" style={{ flex: 1 }}>{study ? "Días que ha venido en 30 días" : "Asistencia en 30 días"}</PText>
          <PText v="small">{`${member.attendanceLast30} de ${target}`}</PText>
        </View>
        <Meter value={member.attendanceLast30} max={target} tone={low ? "warning" : "success"} />
        {low && member.status === "active" ? <PText v="tiny" color={C.warning}>Viene poco: es buen momento para escribirle.</PText> : null}
      </View>

      {member.status !== "cancelled" ? (
        <Field label="Cambiar de plan">
          <ChoiceGrid
            value={planId}
            onChange={setPlanId}
            options={data.plans.map((p) => ({ value: p.id, label: p.name, hint: `${money(memberPrice(member, p))} ${PERIOD_LABEL[p.period]}` }))}
          />
          {planId !== member.planId ? <PButton label="Guardar cambio de plan" variant="secondary" onPress={savePlan} style={{ marginTop: 4 }} /> : null}
        </Field>
      ) : null}

      <View style={{ gap: S.sm }}>
        <PText v="label">Historial</PText>
        {visits.map((b) => {
          const s = data.sessions.find((x) => x.id === b.sessionId);
          const ct = s ? data.classTypes.find((c) => c.id === s.classTypeId) : undefined;
          const res = data.resources.find((r) => r.id === b.resourceId);
          return (
            <View key={b.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
              <PText v="body" numberOfLines={1} style={{ flex: 1 }}>{ct?.name ?? res?.name ?? "Visita"}</PText>
              <PText v="tiny">{relative(b.start, now.getTime())}</PText>
            </View>
          );
        })}
        {payments.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
            <PText v="body" numberOfLines={1} style={{ flex: 1 }}>{p.concept}</PText>
            <PText v="tiny">{`${money(p.amountCents)} · ${dayLabel(p.at, { weekday: false })}`}</PText>
          </View>
        ))}
        {!visits.length && !payments.length ? <PText v="small">Aún no hay movimientos.</PText> : null}
      </View>

      {member.status === "active" || member.status === "overdue" || member.status === "trial" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.md }}>
          {member.status !== "trial" ? <PButton label="Pausar cuota" icon={Pause} variant="ghost" small onPress={pause} /> : null}
          <DangerLink label="Dar de baja" icon={UserMinus} onPress={confirmLeave} />
        </View>
      ) : null}
    </Sheet>
  );
}

/** Botón fantasma en rojo ("Dar de baja", "Eliminar"). */
function DangerLink({ label, onPress, icon: Icon, style }: { label: string; onPress: () => void; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ minHeight: 44, paddingHorizontal: S.md, borderRadius: R.sm, flexDirection: "row", alignItems: "center", gap: 6 }, style]}
    >
      {Icon ? <Icon size={15} color={C.errorText} /> : null}
      <Text style={{ fontFamily: FONT.semibold, fontSize: 13, color: C.errorText }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

/* ------------------------------------------------------------------ */
/* Alta de socio                                                       */
/* ------------------------------------------------------------------ */

function NewMemberDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, update, now, vertical } = usePro();
  const copy = classCopy(vertical.id);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [student, setStudent] = React.useState(true);
  const [uni, setUni] = React.useState(UNIVERSITIES[0]);
  const [studies, setStudies] = React.useState("");
  const [start, setStart] = React.useState<"paid" | "trial">("paid");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setPlanId(data.plans.find((p) => p.period === "month")?.id ?? data.plans[0]?.id ?? "");
    setStudent(true);
    setUni(UNIVERSITIES[0]);
    setStudies("");
    setStart("paid");
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
    void update("member.create", (d) => ({
      ...d,
      members: [member, ...d.members],
      payments:
        start === "paid" && plan
          ? [...d.payments, { id: localId("p"), at: iso, clientName: member.name, concept: `Alta ${plan.name}`, amountCents: price, tipCents: 0, method: "card" }]
          : d.payments,
    }));
    toast(start === "trial" ? "Semana de prueba activada" : `${capitalize(copy.member)} dado de alta`, {
      kind: "success",
      body: start === "trial" ? `${member.name} tiene 7 días para probar. Te avisamos antes de que acabe.` : `${member.name} con ${plan?.name}, ${money(price)} cobrados.`,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Nuevo ${copy.member}`}
      description="Con su móvil le llegan los avisos de cobro y de sus reservas."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={start === "trial" ? "Empezar prueba" : `Dar de alta y cobrar ${money(price)}`} onPress={save} disabled={name.trim().length < 3 || !plan} />
        </>
      }
    >
      <Field label="Nombre y apellido">
        <Input value={name} onChangeText={setName} label="Nombre y apellido" placeholder="Lucía García" autoCapitalize="words" autoComplete="off" />
      </Field>
      <Field label="Móvil">
        <Input value={phone} onChangeText={setPhone} label="Móvil" placeholder="600 000 000" keyboardType="phone-pad" autoComplete="off" />
      </Field>
      <Field label="Plan">
        <ChoiceGrid
          value={planId}
          onChange={setPlanId}
          options={data.plans.map((p) => ({ value: p.id, label: p.name, hint: `${money(student && p.studentPriceCents ? p.studentPriceCents : p.priceCents)} ${PERIOD_LABEL[p.period]}` }))}
        />
      </Field>
      <Toggle label="Es estudiante" detail="Se verifica con su cuenta de Franky" value={student} onChange={setStudent} />
      {student ? (
        <>
          <Field label="Universidad">
            <ChoiceGrid value={uni} onChange={setUni} options={UNIVERSITIES.map((u) => ({ value: u, label: u }))} />
          </Field>
          <Field label="Carrera">
            <Input value={studies} onChangeText={setStudies} label="Carrera" placeholder="ADE" />
          </Field>
        </>
      ) : null}
      <Field label="Cómo empieza">
        <ChoiceGrid
          value={start}
          onChange={setStart}
          options={[
            { value: "paid", label: "Paga ya", hint: "Cobro de hoy" },
            { value: "trial", label: "Semana de prueba", hint: "Gratis 7 días" },
          ]}
        />
      </Field>
    </Sheet>
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
          action={<PButton label="Crear plan" icon={Plus} onPress={() => onOpen("new")} />}
        />
      </Panel>
    );
  }

  return (
    <View>
      <View style={{ gap: S.sm, marginBottom: S.lg }}>
        {data.plans.map((p) => {
          const count = planMembers(data, p.id);
          const monthly = data.members
            .filter((m) => m.planId === p.id && (m.status === "active" || m.status === "overdue"))
            .reduce((a, m) => a + (monthlyEquivalent(p, memberPrice(m, p)) || 0), 0);
          return (
            <Tap
              key={p.id}
              onPress={() => onOpen(p.id)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${money(p.priceCents)} ${PERIOD_LABEL[p.period]}`}
              style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: S.lg, gap: S.sm, ...SHADOW.card }}
            >
              <PText v="h3">{p.name}</PText>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ fontFamily: FONT.display, fontSize: 28, letterSpacing: -0.6, color: C.text }} maxFontSizeMultiplier={1.2}>{money(p.priceCents)}</Text>
                <PText v="small">{PERIOD_LABEL[p.period]}</PText>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {p.studentPriceCents && p.studentPriceCents !== p.priceCents ? (
                  <Pill label={`Estudiante ${money(p.studentPriceCents)}`} tone="violet" icon={BadgeCheck} />
                ) : p.studentPriceCents ? (
                  <Pill label="Solo estudiantes" tone="violet" />
                ) : null}
                <Pill label={p.sessions ? `${p.sessions} ${study ? "días" : copy.sessionMany}` : "Ilimitado"} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md, marginTop: S.sm }}>
                <PText v="tiny">{`${count} ${count === 1 ? copy.member : copy.members}`}</PText>
                {monthly ? <PText v="tiny">{`${money(monthly, { round: true })} al mes`}</PText> : null}
              </View>
              <Meter value={count} max={total} />
            </Tap>
          );
        })}
        <Tap
          onPress={() => onOpen("new")}
          accessibilityRole="button"
          accessibilityLabel="Crear plan o bono"
          style={{ minHeight: 96, borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, alignItems: "center", justifyContent: "center", gap: S.sm }}
        >
          <Plus size={20} color={C.muted} />
          <Text style={{ fontFamily: FONT.semibold, fontSize: 14, color: C.muted }} maxFontSizeMultiplier={1.3}>Crear plan o bono</Text>
        </Tap>
      </View>
      <Tip title="Precio estudiante">
        {study
          ? "El bono exámenes se enseña en Franky a las carreras que tienen exámenes esa semana. Créalo aquí y lánzalo desde Estudiantes en diciembre y en mayo."
          : "Un precio de estudiante solo en horas valle (de 10 a 14 h) llena las clases flojas sin rebajar la cuota de la tarde. Franky verifica el carné por ti."}
      </Tip>
    </View>
  );
}

function PlanDrawer({ planId, onClose }: { planId: string | null; onClose: () => void }) {
  const { data, update, vertical } = usePro();
  const study = vertical.engine === "courts";
  const plan = planId && planId !== "new" ? data.plans.find((p) => p.id === planId) : undefined;
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [studentPrice, setStudentPrice] = React.useState("");
  const [period, setPeriod] = React.useState<ProMembershipPlan["period"]>("month");
  const [sessions, setSessions] = React.useState("");

  React.useEffect(() => {
    if (!planId) return;
    setName(plan?.name ?? "");
    setPrice(plan ? String(plan.priceCents / 100) : "");
    setStudentPrice(plan?.studentPriceCents ? String(plan.studentPriceCents / 100) : "");
    setPeriod(plan?.period ?? "month");
    setSessions(plan?.sessions ? String(plan.sessions) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100) || 0;
  const valid = name.trim().length > 1 && cents(price) > 0;
  const count = plan ? planMembers(data, plan.id) : 0;

  const save = () => {
    const next: ProMembershipPlan = {
      id: plan?.id ?? localId("pl"),
      name: name.trim(),
      priceCents: cents(price),
      studentPriceCents: cents(studentPrice) || undefined,
      period,
      sessions: Number(sessions) > 0 ? Number(sessions) : null,
      members: plan?.members ?? 0,
    };
    void update(plan ? "plan.edit" : "plan.create", (d) => ({
      ...d,
      plans: plan ? d.plans.map((p) => (p.id === plan.id ? next : p)) : [...d.plans, next],
    }));
    toast(plan ? "Plan actualizado" : "Plan creado", {
      kind: "success",
      body: plan && count ? `El nuevo precio se aplica a ${count} personas en su próximo cobro.` : "Ya se puede contratar desde tu ficha de Franky.",
    });
    onClose();
  };

  const remove = () => {
    if (!plan) return;
    void update("plan.delete", (d) => ({ ...d, plans: d.plans.filter((p) => p.id !== plan.id) }));
    toast("Plan eliminado", { kind: "success" });
    onClose();
  };

  return (
    <Sheet
      open={Boolean(planId)}
      onClose={onClose}
      title={plan ? plan.name : "Nuevo plan o bono"}
      description={plan ? `${count} personas lo tienen ahora.` : "Cuota mensual, bono de sesiones o pase suelto."}
      footer={
        <>
          {plan && !count ? <DangerLink label="Eliminar" onPress={remove} style={{ marginRight: "auto" }} /> : null}
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton label={plan ? "Guardar" : "Crear plan"} onPress={save} disabled={!valid} />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} label="Nombre" placeholder={study ? "Bono exámenes" : "Ilimitado"} />
      </Field>
      <Field label="Tipo">
        <ChoiceGrid
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "Mensual" },
            { value: "quarter", label: "Trimestral" },
            { value: "year", label: "Anual" },
            { value: "pack", label: "Bono o pase" },
          ]}
        />
      </Field>
      <View style={{ flexDirection: "row", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Field label="Precio (€)">
            <Input value={price} onChangeText={setPrice} label="Precio en euros" placeholder="49" keyboardType="decimal-pad" />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Precio estudiante (€)" hint="Opcional. Solo con carné verificado.">
            <Input value={studentPrice} onChangeText={setStudentPrice} label="Precio estudiante en euros" placeholder="39" keyboardType="decimal-pad" />
          </Field>
        </View>
      </View>
      <Field label={study ? "Días incluidos" : "Sesiones incluidas"} hint="Déjalo vacío si es ilimitado.">
        <Input value={sessions} onChangeText={setSessions} label={study ? "Días incluidos" : "Sesiones incluidas"} placeholder="Ilimitado" keyboardType="number-pad" />
      </Field>
    </Sheet>
  );
}
