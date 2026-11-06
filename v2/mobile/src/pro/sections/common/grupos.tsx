import React from "react";
import { Text, View } from "react-native";
import { CalendarDays, Users } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S } from "@/theme";
import type { ProGroupRequest } from "../../../../../shared/pro/types";
import { capitalize, dayLabel, money, relative, time } from "../../../../../shared/pro/format";
import { usePro } from "../../store";
import { ProPage } from "../../shell";
import { Detail, Empty, Field, Input, Kpi, KpiRow, ListRow, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Tip } from "../../kit";

const STATUS: Record<ProGroupRequest["status"], { label: string; tone: "violet" | "warning" | "success" | "neutral" }> = {
  new: { label: "Nueva", tone: "violet" },
  quoted: { label: "Presupuesto preparado", tone: "warning" },
  accepted: { label: "Aceptada", tone: "success" },
  declined: { label: "Descartada", tone: "neutral" },
};

type Filter = "open" | "accepted" | "all";

export default function GruposSection() {
  const { data } = usePro();
  const newOnes = data.groupRequests.filter((g) => g.status === "new").length;
  const people = data.groupRequests.filter((g) => g.status === "accepted").reduce((a, g) => a + g.people, 0);
  const pipeline = data.groupRequests
    .filter((g) => g.status === "quoted" || g.status === "accepted")
    .reduce((a, g) => a + (g.quoteCents ?? g.budgetPerPersonCents) * g.people, 0);

  return (
    <ProPage>
      <PageHeader
        eyebrow="Grupos"
        title="Clases, asociaciones y celebraciones"
        description={
          newOnes
            ? `${newOnes} ${newOnes === 1 ? "grupo espera" : "grupos esperan"} tu presupuesto. Contestar el mismo día multiplica las reservas.`
            : "Delegados y asociaciones te piden presupuesto aquí para cenas, previas y celebraciones."
        }
      />
      <KpiRow>
        <Kpi label="Peticiones nuevas" value={newOnes} emphasis={newOnes > 0} />
        <Kpi label="Personas confirmadas" value={people} />
        <Kpi label="En juego" value={money(pipeline, { round: true })} hint="presupuestos preparados y aceptados" />
        <Kpi label="Peticiones este curso" value={data.groupRequests.length} hint="de clases, clubes y asociaciones" />
      </KpiRow>
      <GroupRequests />
      <Tip title="Temporada alta">
        Noviembre y diciembre (cenas de Navidad de clase) y de abril a junio (graduaciones) concentran casi todos los grupos universitarios. Ten dos o tres menús cerrados preparados antes.
      </Tip>
    </ProPage>
  );
}

/** Lista de peticiones de grupo con su hoja de presupuesto. Se usa también en Estudiantes. */
export function GroupRequests({ compact = false }: { compact?: boolean }) {
  const { data, now } = usePro();
  const [filter, setFilter] = React.useState<Filter>("open");
  const [open, setOpen] = React.useState<string | null>(null);
  const list = data.groupRequests
    .filter((g) => (filter === "open" ? g.status === "new" || g.status === "quoted" : filter === "accepted" ? g.status === "accepted" : true))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <Panel title={compact ? "Peticiones de grupo" : undefined} flush>
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md }}>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Abiertas" },
              { value: "accepted", label: "Aceptadas" },
              { value: "all", label: "Todas" },
            ]}
          />
        </View>
        {list.length ? (
          list.map((g, i) => (
            <ListRow
              key={g.id}
              onPress={() => setOpen(g.id)}
              accessibilityLabel={`${g.kind}, ${g.people} personas, ${g.organization}, ${STATUS[g.status].label}`}
              last={i === list.length - 1}
            >
              <View style={{ width: 44, height: 44, borderRadius: R.md, backgroundColor: C.input, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: FONT.heading, fontSize: 15, color: C.text }} maxFontSizeMultiplier={1.2}>{g.people}</Text>
                <Text style={{ fontSize: 9.5, color: C.muted }} maxFontSizeMultiplier={1.2}>pers.</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <PText v="h3" numberOfLines={1}>{g.kind}</PText>
                <PText v="tiny" numberOfLines={1}>{`${g.organization} · ${capitalize(dayLabel(g.date))}`}</PText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: 2 }}>
                  <Pill label={STATUS[g.status].label} tone={STATUS[g.status].tone} />
                  <PText v="tiny">{relative(g.createdAt, now.getTime())}</PText>
                </View>
              </View>
            </ListRow>
          ))
        ) : (
          <Empty icon={Users} title="No hay grupos aquí" body="Cuando una clase o asociación te pida presupuesto, aparecerá en esta lista." />
        )}
      </Panel>
      <GroupSheet id={open} onClose={() => setOpen(null)} />
    </>
  );
}

function GroupSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, update, pending, can } = usePro();
  const g = data.groupRequests.find((x) => x.id === id) ?? null;
  const [price, setPrice] = React.useState("");
  const [includes, setIncludes] = React.useState("");
  const [deposit, setDeposit] = React.useState("20");

  React.useEffect(() => {
    if (!g) return;
    setPrice(String(((g.quoteCents ?? g.budgetPerPersonCents) / 100).toFixed(0)));
    setIncludes(data.space.vertical === "restaurant" || data.space.vertical === "bar" ? "Entrante para compartir, principal a elegir, postre y bebida" : "");
    setDeposit("20");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const perPerson = Math.round(Number(price.replace(",", ".")) * 100) || 0;
  const editable = g ? g.status === "new" || g.status === "quoted" : false;

  const setStatus = async (status: ProGroupRequest["status"], quoteCents?: number) => {
    if (!g) return;
    if (
      !(await update(`group.${status}`, (d) => ({
        ...d,
        groupRequests: d.groupRequests.map((x) => (x.id === g.id ? { ...x, status, quoteCents: quoteCents ?? x.quoteCents } : x)),
      })))
    )
      return;
    if (status === "declined") {
      toast("Solicitud descartada", { kind: "info" });
    } else {
      toast("Presupuesto guardado", { kind: "success", body: `${money(perPerson)} por persona, ${money(perPerson * g.people, { round: true })} en total.` });
    }
    onClose();
  };

  return (
    <Sheet
      open={Boolean(g)}
      onClose={onClose}
      title={g?.kind ?? ""}
      description={g ? `${g.organization} · ${g.people} personas` : undefined}
      footer={
        g && editable ? (
          <>
            <PButton label="No podemos" variant="ghost" disabled={pending || !can("group.declined")} onPress={() => void setStatus("declined")} />
            <PButton
              label={g.status === "quoted" ? "Actualizar presupuesto" : "Guardar presupuesto"}
              disabled={pending || !can("group.quoted") || !perPerson}
              onPress={() => void setStatus("quoted", perPerson)}
            />
          </>
        ) : undefined
      }
    >
      {g ? (
        <>
          <View style={{ borderRadius: R.lg, backgroundColor: C.input, padding: S.lg, gap: 6 }}>
            <PText v="h3">{g.organizer}</PText>
            <PText v="body" color={C.muted}>{`“${g.message}”`}</PText>
          </View>
          <View style={{ borderRadius: R.lg, borderWidth: 1, borderColor: C.border, paddingHorizontal: S.lg }}>
            <Detail
              label="Cuándo"
              value={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
                  <CalendarDays size={14} color={C.muted} />
                  <PText v="h3" style={{ flexShrink: 1, textAlign: "right" }}>{`${capitalize(dayLabel(g.date))}, ${time(g.date)}`}</PText>
                </View>
              }
            />
            <Detail label="Personas" value={g.people} />
            <Detail label="Presupuesto que indican" value={`${money(g.budgetPerPersonCents)} por persona`} />
            <Detail label="Estado" value={<Pill label={STATUS[g.status].label} tone={STATUS[g.status].tone} />} last />
          </View>
          {editable ? (
            <>
              <Field label="Precio por persona (€)" hint={perPerson ? `Total: ${money(perPerson * g.people, { round: true })}` : undefined}>
                <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" label="Precio por persona en euros" />
              </Field>
              <Field label="Qué incluye">
                <Input value={includes} onChangeText={setIncludes} multiline placeholder="Describe lo que incluye el precio" label="Qué incluye" />
              </Field>
              <Field label="Señal para confirmar (%)" hint="La paga el organizador al aceptar. Protege tu día si el grupo no aparece.">
                <Input value={deposit} onChangeText={setDeposit} keyboardType="number-pad" label="Señal para confirmar en porcentaje" />
              </Field>
            </>
          ) : g.status === "accepted" ? (
            <PText v="small">{`Grupo confirmado por ${money((g.quoteCents ?? 0) * g.people, { round: true })}. Ya está en tu agenda.`}</PText>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
