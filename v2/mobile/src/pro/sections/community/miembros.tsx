import React from "react";
import { Share, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { BadgeCheck, BellRing, Check, IdCard, Link2, QrCode, Sparkles, Upload, UserPlus, Users } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, FONT, R, S, SHADOW } from "@/theme";
import type { ProCommunityMember } from "../../../../../shared/pro/types";
import { addDays, dayLabel, localDate, money, relative } from "../../../../../shared/pro/format";
import { UNIVERSITIES } from "../../../../../shared/pro/demo/common";
import { MEMBER_FEE_CENTS, mandateEnd, type CommunityMember } from "../../../../../shared/pro/demo/community";
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
  PAvatar,
  PButton,
  PText,
  PageHeader,
  Panel,
  Pill,
  SearchInput,
  Segmented,
  Sheet,
  Tip,
} from "../../kit";

type Filter = "todos" | "pendiente" | "junta" | "nuevos" | "franky";

const ROLE_LABEL: Record<ProCommunityMember["role"], string> = { socio: "Socio", junta: "Junta", voluntario: "Voluntario" };
const FEE: Record<ProCommunityMember["fee"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  paid: { label: "Cuota pagada", tone: "success" },
  pending: { label: "Cuota pendiente", tone: "warning" },
  exempt: { label: "Exento", tone: "neutral" },
};
const PAGE = 40;

function courseLabel(now: Date) {
  const today = localDate(now);
  const y = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 7 ? y : y - 1;
  return `${String(start).slice(2)}/${String(start + 1).slice(2)}`;
}

export default function CommunityMiembros() {
  const { data, now, update } = usePro();
  const params = useLocalSearchParams<{ filtro?: string }>();
  const members = data.communityMembers as CommunityMember[];
  const today = localDate(now);
  const monthAgo = addDays(today, -30);

  const [filter, setFilter] = React.useState<Filter>(params.filtro === "pendiente" ? "pendiente" : "todos");
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (params.filtro === "pendiente") setFilter("pendiente");
  }, [params.filtro]);

  const isNew = (m: CommunityMember) => localDate(m.joinedAt) >= monthAgo;
  const counts = {
    todos: members.length,
    pendiente: members.filter((m) => m.fee === "pending").length,
    junta: members.filter((m) => m.role !== "socio").length,
    nuevos: members.filter(isNew).length,
    franky: members.filter((m) => m.viaFranky).length,
  };
  const newViaFranky = members.filter((m) => isNew(m) && m.viaFranky).length;

  const q = query.toLowerCase();
  const list = members
    .filter((m) => {
      if (filter === "pendiente" && m.fee !== "pending") return false;
      if (filter === "junta" && m.role === "socio") return false;
      if (filter === "nuevos" && !isNew(m)) return false;
      if (filter === "franky" && !m.viaFranky) return false;
      if (!query) return true;
      return m.name.toLowerCase().includes(q) || m.studies.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.role === "junta" && b.role !== "junta") return -1;
      if (b.role === "junta" && a.role !== "junta") return 1;
      return b.joinedAt.localeCompare(a.joinedAt);
    });

  const pick = (v: Filter) => {
    setFilter(v);
    setLimit(PAGE);
  };

  const remindAll = async () => {
    const ok = await update("members.remind", (d) => ({
      ...d,
      announcements: [
        {
          id: localId("an"),
          title: "Recordatorio: cuota del curso",
          body: `Te queda por pagar la cuota de ${money(MEMBER_FEE_CENTS)}. Se paga desde Franky en un momento.`,
          at: new Date().toISOString(),
          audience: "socios",
          reads: 0,
        },
        ...d.announcements,
      ],
    }));
    if (!ok) return;
    toast("Recordatorio enviado", { kind: "success", body: `${counts.pendiente} socios reciben el enlace de pago de ${money(MEMBER_FEE_CENTS)}.` });
  };

  return (
    <ProPage>
      <PageHeader
        eyebrow="Socios"
        title="Tus socios"
        description={`${members.length} socios, ${counts.pendiente} con la cuota pendiente. ${counts.nuevos} nuevos este mes, ${newViaFranky} de ellos llegados por Franky.`}
        actions={
          <>
            <PButton label="Importar" icon={Upload} variant="outline" onPress={() => setImporting(true)} />
            <PButton label="Nuevo socio" icon={UserPlus} onPress={() => setCreating(true)} />
          </>
        }
      />

      <KpiRow>
        <Kpi icon={Users} label="Socios" value={members.length} hint={`${counts.junta} en junta o voluntarios`} />
        <Kpi
          icon={BellRing}
          label="Cuotas pendientes"
          value={counts.pendiente}
          hint={`${money(counts.pendiente * MEMBER_FEE_CENTS, { round: true })} por cobrar`}
          emphasis={counts.pendiente > 0}
          onPress={() => pick("pendiente")}
        />
        <Kpi icon={Sparkles} label="Nuevos en 30 días" value={counts.nuevos} hint={`${newViaFranky} por Franky`} onPress={() => pick("nuevos")} />
        <Kpi icon={BadgeCheck} label="Verificados" value={members.filter((m) => m.verified !== false).length} hint="Con cuenta universitaria" />
      </KpiRow>

      <Segmented<Filter>
        value={filter}
        onChange={pick}
        options={[
          { value: "todos", label: "Todos", count: counts.todos },
          { value: "pendiente", label: "Cuota pendiente", count: counts.pendiente },
          { value: "junta", label: "Junta y voluntarios", count: counts.junta },
          { value: "nuevos", label: "Nuevos", count: counts.nuevos },
          { value: "franky", label: "Por Franky", count: counts.franky },
        ]}
      />
      <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o estudios" />

      {filter === "pendiente" && counts.pendiente ? (
        <View style={{ gap: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: `${C.warning}40`, backgroundColor: `${C.warning}14`, padding: S.md, marginBottom: S.md }}>
          <PText v="small" color={C.text}>
            {`${counts.pendiente} socios deben ${money(counts.pendiente * MEMBER_FEE_CENTS, { round: true })}. Les mandas el enlace de pago y se apunta solo cuando pagan.`}
          </PText>
          <PButton small label="Recordar a todos" icon={BellRing} onPress={() => void remindAll()} />
        </View>
      ) : null}

      <Panel flush>
        {list.length ? (
          list.slice(0, limit).map((m, i, shown) => (
            <ListRow key={m.id} onPress={() => setOpen(m.id)} accessibilityLabel={`${m.name}, ${FEE[m.fee].label}`} last={i === shown.length - 1 && list.length <= limit}>
              <PAvatar name={m.name} size={34} toneKey={m.role === "junta" ? "violet" : m.role === "voluntario" ? "emerald" : "slate"} />
              <View style={{ flex: 1, gap: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</PText>
                  {m.verified !== false ? <BadgeCheck size={14} color={C.blue} accessibilityLabel="Verificado" /> : null}
                </View>
                <PText v="tiny" numberOfLines={1}>
                  {`${m.studies} · ${m.university === UNIVERSITIES[0] ? "UA" : "UMH"}${isNew(m) ? ` · se unió ${relative(m.joinedAt, now.getTime())}` : ""}`}
                </PText>
                {m.role !== "socio" || (m.viaFranky && isNew(m)) ? (
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 3 }}>
                    {m.viaFranky && isNew(m) ? <Pill label="Por Franky" tone="violet" /> : null}
                    {m.role !== "socio" ? <Pill label={ROLE_LABEL[m.role]} tone="dark" /> : null}
                  </View>
                ) : null}
              </View>
              <View
                accessibilityLabel={FEE[m.fee].label}
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.fee === "pending" ? C.warning : m.fee === "paid" ? C.success : C.border }}
              />
              <View style={{ width: 44, alignItems: "flex-end" }}>
                <PText v="h3">{String(m.activities)}</PText>
                <PText v="tiny">activ.</PText>
              </View>
            </ListRow>
          ))
        ) : (
          <Empty
            icon={Users}
            title={members.length ? "Nadie coincide con el filtro" : "Aún no tienes socios"}
            body={members.length ? "Prueba con otro filtro o busca por nombre." : "Importa tu lista de socios o comparte el enlace de alta. Cada socio queda con su cuota y su rol."}
            action={members.length ? undefined : <PButton label="Importar socios" onPress={() => setImporting(true)} />}
          />
        )}
        {list.length > limit ? (
          <View style={{ alignItems: "center", paddingVertical: S.sm }}>
            <PButton label={`Ver ${Math.min(PAGE, list.length - limit)} más de ${list.length - limit}`} variant="ghost" small onPress={() => setLimit((l) => l + PAGE)} />
          </View>
        ) : null}
      </Panel>

      <Tip title="Tu lista ya no se pierde">
        Los socios, sus cuotas y su historial se quedan en la asociación aunque cambie la junta. Nada de Excel en el portátil del tesorero que se va en junio.
      </Tip>

      <MemberSheet memberId={open} onClose={() => setOpen(null)} />
      <NewMemberSheet open={creating} onClose={() => setCreating(false)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </ProPage>
  );
}

/* ------------------------------------------------------------------ */

function MemberCard({ member, now, spaceName }: { member: CommunityMember; now: Date; spaceName: string }) {
  const number = String(member.id.replace(/\D/g, "")).padStart(4, "0");
  return (
    <View style={{ borderRadius: R.lg, backgroundColor: "#121019", padding: S.lg, gap: S.xl, ...SHADOW.float }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontFamily: FONT.semibold, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }} maxFontSizeMultiplier={1.2}>
            Carné de socio
          </Text>
          <Text style={{ fontSize: 18, fontFamily: FONT.heading, color: "#FFFFFF", marginTop: 4 }} maxFontSizeMultiplier={1.3}>
            {spaceName}
          </Text>
        </View>
        <View style={{ borderRadius: R.full, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontFamily: FONT.semibold, color: "rgba(255,255,255,0.8)" }} maxFontSizeMultiplier={1.2}>
            {`Curso ${courseLabel(now)}`}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: S.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ flexShrink: 1, fontSize: 20, fontFamily: FONT.heading, color: "#FFFFFF" }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {member.name}
            </Text>
            {member.verified !== false ? <BadgeCheck size={16} color="#A78BFA" /> : null}
          </View>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {member.studies}
          </Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: S.sm }} maxFontSizeMultiplier={1.3}>
            {`N.º ${number} · ${ROLE_LABEL[member.role]} · válido hasta el ${dayLabel(`${mandateEnd(now)}T12:00:00Z`, { weekday: false })}`}
          </Text>
        </View>
        <View style={{ width: 64, height: 64, borderRadius: R.md, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
          <QrCode size={48} color="#0D0C14" strokeWidth={1.4} />
        </View>
      </View>
    </View>
  );
}

function MemberSheet({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { data, now, update } = usePro();
  const member = (data.communityMembers as CommunityMember[]).find((m) => m.id === memberId);
  if (!member) return null;
  const m = member;
  const first = m.name.split(" ")[0];

  const set = async (patch: Partial<CommunityMember>, title: string, detail?: string) => {
    const ok = await update("member.update", (d) => ({
      ...d,
      communityMembers: d.communityMembers.map((x) => (x.id === m.id ? { ...x, ...patch } : x)),
    }));
    if (ok) toast(title, { kind: "success", body: detail });
  };

  return (
    <Sheet
      open={Boolean(memberId)}
      onClose={onClose}
      title={m.name}
      description={`${m.studies}, ${m.university}`}
      footer={
        m.fee === "pending" ? (
          <>
            <PButton
              label="Recordar cuota"
              icon={BellRing}
              variant="outline"
              onPress={() => toast("Recordatorio enviado", { kind: "success", body: `${first} recibe el enlace de pago de ${money(MEMBER_FEE_CENTS)}.` })}
            />
            <PButton label="Marcar pagada" icon={Check} onPress={() => void set({ fee: "paid" }, "Cuota marcada como pagada", "Queda anotada en la caja de la asociación.")} />
          </>
        ) : (
          <PButton label="Enviar carné" icon={IdCard} variant="outline" onPress={() => toast("Carné enviado", { kind: "success", body: `${first} lo tiene en su Franky.` })} />
        )
      }
    >
      <MemberCard member={m} now={now} spaceName={data.space.name} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill label={FEE[m.fee].label} tone={FEE[m.fee].tone} />
        {m.verified !== false ? <Pill label="Estudiante verificado" tone="violet" icon={BadgeCheck} /> : <Pill label="Sin verificar" />}
        {m.viaFranky ? <Pill label="Llegó por Franky" tone="info" /> : null}
      </View>
      <View>
        <Detail label="Universidad" value={m.university} />
        <Detail label="Estudios" value={`${m.studies}${m.course ? `, ${m.course}.º` : ""}`} />
        <Detail label="Socio desde" value={dayLabel(m.joinedAt, { weekday: false })} />
        <Detail label="Actividades" value={m.activities} />
        <Detail label="Cuota del curso" value={m.fee === "exempt" ? "Exento" : money(MEMBER_FEE_CENTS)} last />
      </View>
      <Field label="Rol en la asociación">
        <ChoiceGrid
          value={m.role}
          onChange={(role) => void set({ role }, "Rol actualizado", `${first} ahora es ${ROLE_LABEL[role].toLowerCase()}.`)}
          options={[
            { value: "socio", label: "Socio" },
            { value: "voluntario", label: "Voluntario", hint: "Ayuda en puerta" },
            { value: "junta", label: "Junta" },
          ]}
        />
      </Field>
      {m.fee !== "exempt" ? (
        <PButton label="Eximir de la cuota este curso" variant="ghost" small onPress={() => void set({ fee: "exempt" }, "Socio exento de cuota")} />
      ) : (
        <PButton label="Quitar la exención" variant="ghost" small onPress={() => void set({ fee: "pending" }, "Vuelve a pagar cuota")} />
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function NewMemberSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { now, update } = usePro();
  const [name, setName] = React.useState("");
  const [studies, setStudies] = React.useState("");
  const [university, setUniversity] = React.useState(UNIVERSITIES[0]);
  const [role, setRole] = React.useState<ProCommunityMember["role"]>("socio");
  const [fee, setFee] = React.useState<ProCommunityMember["fee"]>("pending");

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setStudies("");
    setUniversity(UNIVERSITIES[0]);
    setRole("socio");
    setFee("pending");
  }, [open]);

  const save = async () => {
    const member: CommunityMember = {
      id: localId("m"),
      name: name.trim(),
      university,
      studies: studies.trim() || "Sin indicar",
      role,
      fee,
      joinedAt: now.toISOString(),
      activities: 0,
      verified: false,
      viaFranky: false,
      course: 1,
    };
    if (!(await update("member.create", (d) => ({ ...d, communityMembers: [member, ...d.communityMembers] })))) return;
    toast("Socio añadido", {
      kind: "success",
      body: fee === "pending" ? `${name.split(" ")[0]} recibe el enlace para pagar la cuota y verificar su cuenta.` : undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo socio"
      description="Le llega una invitación para verificar su cuenta universitaria."
      footer={<PButton label="Añadir socio" onPress={() => void save()} disabled={name.trim().split(" ").length < 2} />}
    >
      <Field label="Nombre y apellido">
        <Input value={name} onChangeText={setName} placeholder="Alba Pastor" label="Nombre y apellido" autoCapitalize="words" />
      </Field>
      <Field label="Estudios">
        <Input value={studies} onChangeText={setStudies} placeholder="Humanidades" label="Estudios" />
      </Field>
      <Field label="Universidad">
        <ChoiceGrid value={university} onChange={setUniversity} options={UNIVERSITIES.map((u) => ({ value: u, label: u }))} />
      </Field>
      <Field label="Rol">
        <ChoiceGrid
          value={role}
          onChange={setRole}
          options={[
            { value: "socio", label: "Socio" },
            { value: "voluntario", label: "Voluntario" },
            { value: "junta", label: "Junta" },
          ]}
        />
      </Field>
      <Field label="Cuota" hint={`Cuota del curso: ${money(MEMBER_FEE_CENTS)}.`}>
        <ChoiceGrid
          value={fee}
          onChange={setFee}
          options={[
            { value: "pending", label: "Pendiente", hint: "Le mandamos el enlace" },
            { value: "paid", label: "Ya pagada" },
            { value: "exempt", label: "Exento" },
          ]}
        />
      </Field>
    </Sheet>
  );
}

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, now, update } = usePro();
  const [text, setText] = React.useState("");

  React.useEffect(() => {
    if (open) setText("");
  }, [open]);

  const rows = text
    .split("\n")
    .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
    .filter((cols) => cols[0] && cols[0].split(" ").length >= 2);

  const run = async () => {
    const created: CommunityMember[] = rows.map((cols) => ({
      id: localId("m"),
      name: cols[0],
      studies: cols[1] || "Sin indicar",
      university: UNIVERSITIES[0],
      role: "socio",
      fee: /pag|s[ií]/i.test(cols[2] ?? "") ? "paid" : "pending",
      joinedAt: now.toISOString(),
      activities: 0,
      verified: false,
      viaFranky: false,
    }));
    if (!(await update("member.import", (d) => ({ ...d, communityMembers: [...created, ...d.communityMembers] })))) return;
    toast(`${created.length} socios importados`, { kind: "success", body: "Les llega la invitación para verificar su cuenta y, si deben la cuota, el enlace de pago." });
    onClose();
  };

  // Sin portapapeles en la app: el enlace se comparte con la hoja del sistema.
  const shareLink = () => {
    void Share.share({ message: `https://franky.es/n/${data.space.slug}/alta` }).catch(() => {});
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Importar socios"
      description="Pega tu Excel o tu Google Forms. Una persona por línea."
      footer={<PButton label={`Importar ${rows.length ? `${rows.length} ` : ""}socios`} onPress={() => void run()} disabled={!rows.length} />}
    >
      <Field label="Nombre, estudios, cuota" hint="Copia las columnas desde la hoja de cálculo. Si la tercera dice «pagada», se marca como pagada.">
        <Input
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={"Alba Pastor, Humanidades, pagada\nIker Sempere, Derecho, pendiente"}
          label="Nombre, estudios, cuota"
          style={{ minHeight: 160, fontSize: 13 }}
        />
      </Field>
      {rows.length ? (
        <View style={{ borderRadius: R.md, borderWidth: 1, borderColor: C.border }}>
          {rows.slice(0, 5).map((cols, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: S.sm, paddingHorizontal: S.md, paddingVertical: 8, borderBottomWidth: i === Math.min(rows.length, 5) - 1 && rows.length <= 5 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <PText v="body" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{cols[0]}</PText>
              <PText v="tiny">{cols[1] || "Sin estudios"}</PText>
            </View>
          ))}
          {rows.length > 5 ? <PText v="tiny" style={{ paddingHorizontal: S.md, paddingVertical: 8 }}>{`Y ${rows.length - 5} más`}</PText> : null}
        </View>
      ) : null}
      <View style={{ borderRadius: R.lg, borderWidth: 1, borderStyle: "dashed", borderColor: C.border, padding: S.lg, gap: S.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
          <Link2 size={16} color={C.blue} />
          <PText v="h3">O comparte el enlace de alta</PText>
        </View>
        <PText v="small">Cada persona se da de alta con su cuenta universitaria y paga la cuota en el momento.</PText>
        <PButton label="Compartir enlace de alta" variant="outline" small onPress={shareLink} style={{ marginTop: S.xs }} />
      </View>
    </Sheet>
  );
}
