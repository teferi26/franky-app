import React from "react";
import { View } from "react-native";
import { Check, Clock3, Download, LogIn, LogOut, Minus, UserPlus } from "lucide-react-native";
import { toast } from "@/lib/toast";
import { C, R, S } from "@/theme";
import type { ProEngine, ProRole, ProStaff } from "../../../../../shared/pro/types";
import { addDays, capitalize, dayLabel, durationLabel, localDate, money, time } from "../../../../../shared/pro/format";
import { localId, usePro } from "../../store";
import { ProPage } from "../../shell";
import { ChoiceGrid, Field, Input, Kpi, KpiRow, ListRow, LiveDot, PAvatar, PButton, PText, PageHeader, Panel, Pill, Segmented, Sheet, Tip } from "../../kit";
import { TONE_ORDER, shareCsv } from "./ui";

/** Cómo se llama cada rol en cada tipo de negocio y qué puede hacer. */
const ROLES: Record<ProEngine, { role: ProRole; label: string; hint: string }[]> = {
  agenda: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Todo menos facturación" },
    { role: "staff", label: "Profesional", hint: "Su agenda, sus clientes y cobrar" },
    { role: "reception", label: "Recepción", hint: "Agenda de todos y cobrar" },
  ],
  tables: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado de sala", hint: "Reservas, sala, carta y equipo" },
    { role: "staff", label: "Camarero", hint: "Sala, reservas del día y validar" },
    { role: "reception", label: "Barra", hint: "Validar Franky Card y sellos" },
  ],
  night: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Eventos, reservados y equipo" },
    { role: "reception", label: "Puerta", hint: "Solo escanear y ver aforo" },
    { role: "rrpp", label: "RRPP", hint: "Su enlace, su lista y sus ventas" },
  ],
  classes: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Coordinador", hint: "Horario, socios y cobros" },
    { role: "staff", label: "Monitor o profesor", hint: "Sus clases y pasar lista" },
    { role: "reception", label: "Recepción", hint: "Altas, cobros y check-in" },
  ],
  courts: [
    { role: "owner", label: "Dueño", hint: "Todo, incluida la facturación" },
    { role: "manager", label: "Encargado", hint: "Reservas, precios y equipo" },
    { role: "staff", label: "Monitor", hint: "Sus clases y partidos" },
    { role: "reception", label: "Recepción", hint: "Reservas y cobros" },
  ],
  housing: [
    { role: "owner", label: "Dirección", hint: "Todo, incluida la facturación" },
    { role: "agent", label: "Agente", hint: "Sus interesados, visitas y pisos" },
    { role: "manager", label: "Administración", hint: "Inquilinos, cobros y fianzas" },
  ],
  community: [
    { role: "board", label: "Junta", hint: "Todo lo de la asociación" },
    { role: "editor", label: "Voluntario", hint: "Actividades y check-in" },
  ],
  university: [
    { role: "owner", label: "Responsable", hint: "Todo el espacio institucional" },
    { role: "editor", label: "Comunicación", hint: "Publicaciones y bienvenida" },
    { role: "manager", label: "Moderación", hint: "Moderar el campus" },
  ],
};

const CAPABILITIES: { label: string; roles: ProRole[] }[] = [
  { label: "Ver la operación del día", roles: ["owner", "manager", "staff", "reception", "agent", "board", "editor"] },
  { label: "Crear y mover reservas o citas", roles: ["owner", "manager", "reception", "staff", "agent", "board"] },
  { label: "Cobrar y validar Franky Card", roles: ["owner", "manager", "reception", "staff"] },
  { label: "Ver ingresos e informes", roles: ["owner", "manager"] },
  { label: "Lanzar ofertas a estudiantes", roles: ["owner", "manager", "board"] },
  { label: "Gestionar el equipo", roles: ["owner", "manager", "board"] },
  { label: "Plan y facturación de Franky", roles: ["owner", "board"] },
];

type Tab = "personas" | "fichajes" | "permisos";

export default function EquipoSection() {
  const { data, vertical, update, now, pending, can, demo } = usePro();
  const [tab, setTab] = React.useState<Tab>("personas");
  const [inviting, setInviting] = React.useState(false);
  const roles = ROLES[vertical.engine];
  const today = localDate(now);
  const monthStart = today.slice(0, 8) + "01";

  const weekStart = addDays(today, -6);
  const minutesFor = (staffId: string) =>
    data.shifts
      .filter((s) => s.staffId === staffId && s.date >= weekStart)
      .reduce((a, s) => a + Math.max(0, (new Date(s.outAt ?? now.toISOString()).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes), 0);
  const commissionFor = (st: ProStaff) =>
    Math.round(data.payments.filter((p) => p.staffId === st.id && localDate(p.at) >= monthStart).reduce((a, p) => a + p.amountCents, 0) * (st.commissionPct / 100));
  const clockedIn = data.staff.filter((s) => s.clockedInAt).length;
  const totalCommissions = data.staff.reduce((a, s) => a + commissionFor(s), 0);
  const weekHours = data.staff.reduce((a, s) => a + minutesFor(s.id), 0);

  const clock = async (st: ProStaff) => {
    const at = new Date().toISOString();
    if (st.clockedInAt) {
      if (
        !(await update("staff.clockOut", (d) => ({
          ...d,
          staff: d.staff.map((s) => (s.id === st.id ? { ...s, clockedInAt: null } : s)),
          shifts: d.shifts.map((sh) => (sh.staffId === st.id && sh.outAt === null ? { ...sh, outAt: at } : sh)),
        })))
      )
        return;
      toast(`${st.name.split(" ")[0]} ha fichado la salida`, { kind: "success", body: time(at) });
    } else {
      if (
        !(await update("staff.clockIn", (d) => ({
          ...d,
          staff: d.staff.map((s) => (s.id === st.id ? { ...s, clockedInAt: at } : s)),
          shifts: [...d.shifts, { id: localId("sh"), staffId: st.id, date: today, inAt: at, outAt: null, breakMinutes: 0 }],
        })))
      )
        return;
      toast(`${st.name.split(" ")[0]} ha fichado la entrada`, { kind: "success", body: time(at) });
    }
  };

  const exportShifts = () => {
    const rows = [
      ["Fecha", "Persona", "Entrada", "Salida", "Descanso (min)", "Horas"],
      ...[...data.shifts]
        .sort((a, b) => a.inAt.localeCompare(b.inAt))
        .map((s) => {
          const st = data.staff.find((x) => x.id === s.staffId);
          const mins = s.outAt ? (new Date(s.outAt).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes : 0;
          return [s.date, st?.name ?? "", time(s.inAt), s.outAt ? time(s.outAt) : "", String(s.breakMinutes), (mins / 60).toFixed(2).replace(".", ",")];
        }),
    ];
    void shareCsv(rows, `registro-jornada-${data.space.slug}-${today}.csv`, {
      title: "Registro exportado",
      body: "Listo para tu gestoría o una inspección.",
    });
  };

  const roleLabel = (r: ProRole) => roles.find((x) => x.role === r)?.label ?? r;
  const showCommissions = (demo || can("finance.read")) && (vertical.engine === "agenda" || data.staff.some((s) => s.commissionPct > 0));
  const weekShifts = [...data.shifts].filter((s) => s.date >= weekStart).sort((a, b) => b.inAt.localeCompare(a.inAt));

  return (
    <ProPage>
      <PageHeader
        eyebrow="Equipo"
        title={`${data.staff.length} ${data.staff.length === 1 ? "persona" : "personas"} en ${data.space.name}`}
        description={`${clockedIn} ${clockedIn === 1 ? "ha fichado" : "han fichado"} hoy. Cada una entra con su propio acceso y ve solo lo suyo.`}
        actions={<PButton label="Invitar" icon={UserPlus} onPress={() => setInviting(true)} />}
      >
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "personas", label: "Personas" },
            { value: "fichajes", label: "Fichajes" },
            { value: "permisos", label: "Permisos" },
          ]}
        />
      </PageHeader>

      <KpiRow>
        <Kpi icon={Clock3} label="Fichados ahora" value={`${clockedIn}/${data.staff.length}`} />
        <Kpi label="Horas, 7 días" value={`${Math.round(weekHours / 60)} h`} hint="de todo el equipo" />
        <Kpi label={showCommissions ? "Comisiones del mes" : "Personas"} value={showCommissions ? money(totalCommissions, { round: true }) : data.staff.length} />
        <Kpi label="Accesos" value={data.staff.length} hint="sin compartir contraseñas" />
      </KpiRow>

      {tab === "personas" ? (
        <Panel flush>
          {data.staff.map((s, i) => (
            <View
              key={s.id}
              style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.md, borderBottomWidth: i === data.staff.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                <PAvatar name={s.name} toneKey={s.tone} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <PText v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</PText>
                    <Pill label={roleLabel(s.role)} />
                  </View>
                  {s.clockedInAt ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <LiveDot size={6} />
                      <PText v="tiny">{`Trabajando desde las ${time(s.clockedInAt)}`}</PText>
                    </View>
                  ) : (
                    <PText v="tiny" numberOfLines={1}>{s.title}</PText>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: S.lg }}>
                <View style={{ gap: 1 }}>
                  <PText v="h3">{durationLabel(Math.round(minutesFor(s.id)))}</PText>
                  <PText v="tiny">esta semana</PText>
                </View>
                {showCommissions && s.commissionPct ? (
                  <View style={{ gap: 1 }}>
                    <PText v="h3">{money(commissionFor(s), { round: true })}</PText>
                    <PText v="tiny">{`${s.commissionPct} % del mes`}</PText>
                  </View>
                ) : null}
                <View style={{ flex: 1 }} />
                <PButton
                  small
                  label={s.clockedInAt ? "Fichar salida" : "Fichar entrada"}
                  icon={s.clockedInAt ? LogOut : LogIn}
                  variant={s.clockedInAt ? "outline" : "secondary"}
                  disabled={pending || !can(s.clockedInAt ? "staff.clockOut" : "staff.clockIn")}
                  onPress={() => void clock(s)}
                />
              </View>
            </View>
          ))}
        </Panel>
      ) : null}

      {tab === "fichajes" ? (
        <>
          <Panel
            title="Registro de jornada"
            description="Entradas y salidas de los últimos 7 días."
            action={<PButton small label="Exportar" variant="outline" icon={Download} onPress={exportShifts} />}
            flush
          >
            {weekShifts.map((s, i) => {
              const st = data.staff.find((x) => x.id === s.staffId);
              const mins = Math.max(0, (new Date(s.outAt ?? now.toISOString()).getTime() - new Date(s.inAt).getTime()) / 60000 - s.breakMinutes);
              return (
                <ListRow key={s.id} last={i === weekShifts.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <PText v="h3" numberOfLines={1}>{st?.name ?? ""}</PText>
                    <PText v="tiny">{capitalize(dayLabel(`${s.date}T12:00:00Z`))}</PText>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <PText v="small" color={C.text}>{time(s.inAt)}</PText>
                      <PText v="small">a</PText>
                      {s.outAt ? <PText v="small" color={C.text}>{time(s.outAt)}</PText> : <Pill label="Trabajando" tone="success" />}
                    </View>
                    <PText v="h3">{durationLabel(Math.round(mins))}</PText>
                  </View>
                </ListRow>
              );
            })}
          </Panel>
          <Tip title="Registro de jornada">
            Es obligatorio llevarlo desde 2019. Cada persona ficha desde su móvil al entrar y al salir, y el registro se guarda cuatro años. Si te lo pide una inspección o tu gestoría, lo exportas en un clic.
          </Tip>
        </>
      ) : null}

      {tab === "permisos" ? (
        <Panel title="Qué puede hacer cada rol" description="Los permisos se aplican en el servidor: quien no tiene acceso no lo ve ni aunque lo busque." flush>
          {CAPABILITIES.map((c, i) => (
            <View
              key={c.label}
              style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.sm, borderBottomWidth: i === CAPABILITIES.length - 1 ? 0 : 1, borderBottomColor: C.borderLight }}
            >
              <PText v="h3">{c.label}</PText>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {roles.map((r) => {
                  const yes = c.roles.includes(r.role);
                  return (
                    <View
                      key={r.role}
                      accessible
                      accessibilityLabel={`${r.label}: ${yes ? "sí" : "no"}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.full, backgroundColor: yes ? `${C.success}1F` : C.input }}
                    >
                      {yes ? <Check size={12} color={C.success} strokeWidth={2.6} /> : <Minus size={12} color={C.muted} strokeWidth={2.2} />}
                      <PText v="tiny" color={yes ? C.text : C.muted}>{r.label}</PText>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </Panel>
      ) : null}

      <InviteSheet open={inviting} onClose={() => setInviting(false)} roles={roles} />
    </ProPage>
  );
}

function InviteSheet({ open, onClose, roles }: { open: boolean; onClose: () => void; roles: { role: ProRole; label: string; hint: string }[] }) {
  const { data, update, pending, can } = usePro();
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [role, setRole] = React.useState<ProRole>(roles[roles.length > 2 ? 2 : 1]?.role ?? "staff");

  React.useEffect(() => {
    if (open) {
      setName("");
      setContact("");
      setRole(roles[roles.length > 2 ? 2 : 1]?.role ?? "staff");
    }
  }, [open, roles]);

  const invite = async () => {
    const tone = TONE_ORDER[data.staff.length % TONE_ORDER.length];
    if (
      !(await update("staff.invite", (d) => ({
        ...d,
        staff: [
          ...d.staff,
          {
            id: localId("s"),
            name: name.trim(),
            role,
            tone,
            title: roles.find((r) => r.role === role)?.label ?? "Equipo",
            commissionPct: 0,
            clockedInAt: null,
            weekMinutes: 0,
            phone: contact.trim(),
          },
        ],
      })))
    )
      return;
    toast("Persona añadida", { kind: "success", body: `${name.trim()} ya aparece en el equipo.` });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Invitar al equipo"
      description="Guarda sus datos y el rol que tendrá en el equipo."
      footer={
        <>
          <PButton label="Cancelar" variant="ghost" onPress={onClose} />
          <PButton
            label="Añadir al equipo"
            disabled={pending || !can("staff.invite") || name.trim().length < 2 || contact.trim().length < 5}
            onPress={() => void invite()}
          />
        </>
      }
    >
      <Field label="Nombre">
        <Input value={name} onChangeText={setName} autoFocus autoCapitalize="words" label="Nombre" />
      </Field>
      <Field label="Móvil o correo">
        <Input value={contact} onChangeText={setContact} autoCapitalize="none" placeholder="600 000 000 o nombre@correo.com" label="Móvil o correo" />
      </Field>
      <Field label="Rol">
        <ChoiceGrid<ProRole> value={role} onChange={setRole} options={roles.map((r) => ({ value: r.role, label: r.label, hint: r.hint }))} />
      </Field>
    </Sheet>
  );
}
