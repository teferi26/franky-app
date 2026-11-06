import React from "react";
import { Share, View } from "react-native";
import { ArrowRightLeft, BadgeCheck, Check, Crown, Download, RefreshCcw, Send, Stamp } from "lucide-react-native";
import { Tap } from "@/components/ui";
import { C, R, S } from "@/theme";
import { capitalize, relative } from "../../../../../shared/pro/format";
import {
  CREDIT_MIN_ATTENDANCE,
  attendancePct,
  creditEligible,
  creditsCsv,
  decideCredits,
  ectsFor,
  pendingCreditGroups,
  uniExtrasOf,
  type CreditGroup,
} from "../../../../../shared/pro/university";
import {
  BOARD_ROLE_LABEL,
  BOARD_ROLES,
  RENEWAL_LABEL,
  boardProblem,
  confirmRenewal,
  courseLabel,
  courseOf,
  handoverBoard,
  inheritanceOf,
  presidentOf,
  renewalState,
  renewalSummary,
  requestRenewals,
  type RenewalState,
} from "../../../../../shared/pro/university-renewal";
import type { ProUniBoardMember, ProUniBoardRole, UniAssociation } from "../../../../../shared/pro/university-types";
import { usePro } from "../../store";
import { Empty, Field, Input, ListRow, Meter, PAvatar, PButton, PText, Panel, Pill, Tip } from "../../kit";
import { EmptyBox, useUniAction } from "./ui";

/* ------------------------------------------------------------------ */
/* Créditos con asistencia verificada                                  */
/* ------------------------------------------------------------------ */

export function CreditsView({ associationId, onClearFilter }: { associationId: string | null; onClearFilter: () => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const associations = data.uniAssociations as UniAssociation[];
  const groups = pendingCreditGroups(extras.credits, associations).filter((g) => !associationId || g.associationId === associationId);
  const eligibleIds = groups.flatMap((g) => g.requests.filter(creditEligible).map((r) => r.id));
  const validated = extras.credits.filter((r) => r.status === "validated");
  const filterName = associations.find((a) => a.id === associationId)?.name;

  const decide = (ids: string[], status: "validated" | "revision") =>
    void run(
      status === "validated" ? "credits.validate" : "credits.revision",
      (d) => decideCredits(d, ids, status, now),
      status === "validated" ? `${ids.length} solicitudes validadas` : `Revisión pedida para ${ids.length}`,
      status === "validated" ? "Ya puedes compartirlas con secretaría." : "La asociación recibe quién no llega a la asistencia mínima.",
    );

  // En el móvil no se descarga un fichero: se comparte el CSV (correo, Drive...).
  const shareCsv = () =>
    void Share.share({ title: "Créditos para secretaría", message: creditsCsv(extras.credits, associations, extras.hoursPerEcts) }).catch(() => undefined);

  return (
    <View>
      <Panel>
        <View style={{ gap: S.sm }}>
          <PText v="h2">{eligibleIds.length ? `${eligibleIds.length} solicitudes cumplen la asistencia` : "Nada que validar ahora"}</PText>
          <PText v="small">{`Regla del centro: ${extras.hoursPerEcts} horas son 1 ECTS y hace falta el ${CREDIT_MIN_ATTENDANCE} % de las sesiones con check-in.`}</PText>
          {filterName ? <PButton label={`Solo ${filterName}: ver todas`} variant="ghost" small onPress={onClearFilter} /> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.xs }}>
            <PButton label={`Validar ${eligibleIds.length}`} icon={Stamp} disabled={!eligibleIds.length} onPress={() => decide(eligibleIds, "validated")} />
            <PButton label={`Para secretaría (${validated.length})`} icon={Download} variant="outline" disabled={!validated.length} onPress={shareCsv} />
          </View>
        </View>
      </Panel>

      {groups.length ? (
        groups.map((g) => <CreditGroupCard key={g.key} group={g} hoursPerEcts={extras.hoursPerEcts} onDecide={decide} />)
      ) : (
        <EmptyBox>
          <Empty icon={Stamp} title="No hay créditos por validar" body="Cuando una asociación termine una actividad con check-in, sus solicitudes llegan aquí con las horas y la asistencia de cada persona." />
        </EmptyBox>
      )}

      <Tip title="Sin hojas de firmas">
        Las horas salen de los check-in con cuenta universitaria, no de una hoja que se firma al final. Los nombres solo aparecen aquí y en el archivo para secretaría.
      </Tip>
    </View>
  );
}

function CreditGroupCard({ group, hoursPerEcts, onDecide }: { group: CreditGroup; hoursPerEcts: number; onDecide: (ids: string[], status: "validated" | "revision") => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const eligible = group.requests.filter(creditEligible);
  const below = group.requests.filter((r) => !creditEligible(r));
  const shown = expanded ? group.requests : group.requests.slice(0, 4);
  return (
    <Panel title={group.activity} description={`${group.association} · ${group.hours} h, ${ectsFor(group.hours, hoursPerEcts).toLocaleString("es-ES")} ECTS por persona`} flush>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: S.lg, paddingVertical: S.md }}>
        <Pill tone="success" label={`${eligible.length} cumplen`} />
        {below.length ? <Pill tone="warning" label={`${below.length} por debajo del ${CREDIT_MIN_ATTENDANCE} %`} /> : null}
      </View>
      {shown.map((r, i) => {
        const ok = creditEligible(r);
        return (
          <ListRow key={r.id} last={i === shown.length - 1 && shown.length === group.requests.length}>
            <View style={{ flex: 1 }}>
              <PText v="h3" numberOfLines={1}>{r.student}</PText>
              <PText v="tiny" numberOfLines={1}>{`${r.faculty} · ${r.attended} de ${r.sessions} sesiones`}</PText>
            </View>
            <Pill tone={ok ? "success" : "warning"} label={`${attendancePct(r)} %`} />
          </ListRow>
        );
      })}
      {group.requests.length > 4 ? (
        <View style={{ padding: S.sm, alignItems: "center" }}>
          <PButton label={expanded ? "Ver menos" : `Ver las ${group.requests.length}`} variant="ghost" small onPress={() => setExpanded((v) => !v)} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: S.sm, borderTopWidth: 1, borderTopColor: C.borderLight, padding: S.md }}>
        {below.length ? <PButton label={`Pedir revisión de ${below.length}`} variant="outline" small onPress={() => onDecide(below.map((r) => r.id), "revision")} /> : null}
        <PButton label={`Validar ${eligible.length}`} icon={Check} small disabled={!eligible.length} onPress={() => onDecide(eligible.map((r) => r.id), "validated")} />
      </View>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Renovación del curso                                                */
/* ------------------------------------------------------------------ */

const STATE_TONE: Record<RenewalState, "success" | "info" | "warning" | "neutral"> = {
  done: "success",
  partial: "info",
  requested: "warning",
  pending: "neutral",
};

const STATE_ORDER: Record<RenewalState, number> = { pending: 0, requested: 1, partial: 2, done: 3 };

export function RenewalView({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const all = data.uniAssociations as UniAssociation[];
  const course = courseOf(now);
  const summary = renewalSummary(all, now);
  const rows = all
    .filter((a) => a.registered)
    .map((a) => ({ a, state: renewalState(a, course) }))
    .sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || x.a.name.localeCompare(y.a.name));

  if (!summary.total) {
    return (
      <EmptyBox>
        <Empty icon={RefreshCcw} title="Aún no hay asociaciones registradas" body="Cuando registres la primera, cada septiembre le pedirás aquí que confirme su junta y sus socios." />
      </EmptyBox>
    );
  }

  const requestAll = () =>
    void run(
      "association.renewal.request",
      (d) => ({ ...d, uniAssociations: requestRenewals(d.uniAssociations as UniAssociation[], now) }),
      summary.missing.length === 1 ? "Renovación pedida a 1 asociación" : `Renovación pedida a ${summary.missing.length} asociaciones`,
      "Les llega un aviso para confirmar junta y socios desde su espacio de Franky.",
    );

  return (
    <View>
      <Panel title={`Renovación del ${courseLabel(course)}`} description={`${summary.done} de ${summary.total} han confirmado junta y socios.`} flush>
        <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.md }}>
          <Meter value={summary.done} max={summary.total} tone={summary.done === summary.total ? "success" : "violet"} />
          {summary.notAsked.length ? <PButton label={`Pedir la renovación a ${summary.missing.length}`} icon={RefreshCcw} onPress={requestAll} /> : null}
        </View>
        {rows.map(({ a, state }, i) => {
          const president = presidentOf(a);
          return (
            <ListRow key={a.id} onPress={() => onOpen(a.id)} accessibilityLabel={a.name} last={i === rows.length - 1}>
              <PAvatar name={a.name} size={34} toneKey={state === "done" ? "violet" : "slate"} />
              <View style={{ flex: 1 }}>
                <PText v="h3" numberOfLines={1}>{a.name}</PText>
                <PText v="tiny" numberOfLines={2}>
                  {`${president ? `Presidencia: ${president}` : "Sin junta registrada"}${state === "requested" && a.renewal?.requestedAt ? ` · pedida ${relative(a.renewal.requestedAt, now.getTime())}` : ""}${state === "partial" ? ` · falta ${a.renewal?.boardConfirmed ? "confirmar socios" : "confirmar junta"}` : ""}`}
                </PText>
              </View>
              <Pill tone={STATE_TONE[state]} label={RENEWAL_LABEL[state]} />
            </ListRow>
          );
        })}
      </Panel>
      <Tip title="Si cambia la junta">Abre la asociación y registra el traspaso. La junta nueva hereda documentos, actividades y créditos: nada depende de quien se va.</Tip>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Junta, renovación y traspaso dentro de la ficha                     */
/* ------------------------------------------------------------------ */

const FORM_ROLES: ProUniBoardRole[] = ["presidencia", "secretaria", "tesoreria"];

export function GovernanceSection({ a }: { a: UniAssociation }) {
  const { data, now } = usePro();
  const run = useUniAction();
  const extras = uniExtrasOf(data);
  const course = courseOf(now);
  const state = renewalState(a, course);
  const [handing, setHanding] = React.useState(false);
  const [board, setBoard] = React.useState<Record<ProUniBoardRole, string>>({ presidencia: "", secretaria: "", tesoreria: "", vocal: "" });

  React.useEffect(() => {
    setHanding(false);
    setBoard({ presidencia: "", secretaria: "", tesoreria: "", vocal: "" });
  }, [a.id]);

  if (!a.registered) return null;

  const patch = (next: UniAssociation, title: string, detail?: string) =>
    run("association.update", (d) => ({ ...d, uniAssociations: d.uniAssociations.map((x) => (x.id === a.id ? next : x)) }), title, detail);

  const newBoard: ProUniBoardMember[] = FORM_ROLES.map((role) => ({ role, name: board[role] }));
  const problem = boardProblem(newBoard);
  const inherits = inheritanceOf(a, extras.assocActivities, extras.credits);
  const confirmedBoard = Boolean(a.renewal?.course === course && a.renewal.boardConfirmed);
  const confirmedMembers = Boolean(a.renewal?.course === course && a.renewal.membersConfirmed);
  const askedAt = a.renewal?.course === course ? a.renewal.requestedAt : undefined;

  const handover = async () => {
    if (problem) return;
    const ok = await patch(handoverBoard(a, newBoard, now), "Traspaso registrado", `${board.presidencia.trim()} ya gestiona ${a.name} con todo lo que había.`);
    if (ok) setHanding(false);
  };

  const check = (on: boolean, label: string, onPress: () => void) => (
    <Tap
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", gap: S.sm, borderRadius: R.md, borderWidth: 1, borderColor: on ? `${C.success}55` : C.border, backgroundColor: on ? `${C.success}14` : C.surface, paddingHorizontal: S.md }}
    >
      {on ? <Check size={16} color={C.success} /> : <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: C.border }} />}
      <PText v="small" color={on ? C.success : C.text} style={{ flexShrink: 1 }}>{label}</PText>
    </Tap>
  );

  return (
    <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.md, gap: S.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Crown size={15} color={C.muted} strokeWidth={1.9} />
          <PText v="h3">Junta y renovación</PText>
        </View>
        <Pill tone={STATE_TONE[state]} label={RENEWAL_LABEL[state]} />
      </View>

      {a.board?.length ? (
        [...a.board]
          .sort((x, y) => BOARD_ROLES.indexOf(x.role) - BOARD_ROLES.indexOf(y.role))
          .map((m) => (
            <View key={`${m.role}-${m.name}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: S.md }}>
              <PText v="small">{BOARD_ROLE_LABEL[m.role]}</PText>
              <PText v="small" color={C.text}>{m.name}</PText>
            </View>
          ))
      ) : (
        <PText v="small">Aún no ha registrado su junta.</PText>
      )}

      <View style={{ flexDirection: "row", gap: S.sm }}>
        {check(confirmedBoard, "Junta confirmada", () => void patch(confirmRenewal(a, now, { board: !confirmedBoard }), confirmedBoard ? "Junta sin confirmar" : "Junta confirmada"))}
        {check(confirmedMembers, `${a.members} socios confirmados`, () =>
          void patch(confirmRenewal(a, now, { members: !confirmedMembers }), confirmedMembers ? "Socios sin confirmar" : "Socios confirmados"),
        )}
      </View>

      {state !== "done" ? (
        <PButton
          label={askedAt ? `Volver a pedirla (pedida ${relative(askedAt, now.getTime())})` : "Pedir la renovación"}
          icon={Send}
          variant="ghost"
          full
          onPress={() => void patch(requestRenewals([a], now)[0], "Renovación pedida", `${a.name} recibe el aviso para confirmar junta y socios.`)}
        />
      ) : null}

      {handing ? (
        <View style={{ gap: S.md, borderTopWidth: 1, borderTopColor: C.borderLight, paddingTop: S.md }}>
          <PText v="small">
            {`La junta nueva hereda ${inherits.docs} documentos, ${inherits.activities} actividades, ${inherits.creditsValidated} créditos validados${inherits.creditsPending ? ` y ${inherits.creditsPending} por validar` : ""}.`}
          </PText>
          {FORM_ROLES.map((role) => (
            <Field key={role} label={`${BOARD_ROLE_LABEL[role]}${role === "tesoreria" ? " (opcional)" : ""}`}>
              <Input value={board[role]} onChangeText={(v) => setBoard((b) => ({ ...b, [role]: v }))} placeholder="Nombre y apellido" label={BOARD_ROLE_LABEL[role]} />
            </Field>
          ))}
          {problem && (board.presidencia || board.secretaria) ? <PText v="small" color={C.warning}>{problem}</PText> : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: S.sm }}>
            <PButton label="Volver" variant="ghost" onPress={() => setHanding(false)} />
            <PButton label="Registrar traspaso" icon={BadgeCheck} disabled={Boolean(problem)} onPress={() => void handover()} />
          </View>
        </View>
      ) : (
        <PButton label="Traspasar a una junta nueva" icon={ArrowRightLeft} variant="outline" full onPress={() => setHanding(true)} />
      )}

      {a.handovers?.length
        ? [...a.handovers].reverse().map((h) => (
            <PText key={h.at} v="tiny">{`${capitalize(courseLabel(h.course))}: de ${h.from} a ${h.to}, ${relative(h.at, now.getTime())}`}</PText>
          ))
        : null}
    </View>
  );
}
